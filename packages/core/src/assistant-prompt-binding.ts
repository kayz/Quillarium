import { rm } from 'node:fs/promises'
import path from 'node:path'
import {
  assistantPromptVersionPath,
  assistantPromptVersionV1Schema,
  creatorAssistantIdForTask,
  listAssistantPromptVersionsUnbounded,
  loadAssistantPromptVersion,
  MAX_ASSISTANT_PROMPT_CONFIG_VERSIONS,
  prepareAssistantPromptVersion,
  pruneAssistantPromptVersions,
  writeAssistantPromptVersionUnlocked,
  type LoadedAssistantPromptVersion,
  type SaveAssistantPromptVersionInput
} from './assistant-prompts.js'
import { loadAgentSessionDetail } from './assistant-sessions.js'
import {
  creatorRoleV1Schema,
  listCreatorRoles,
  loadCreatorRole,
  validateCreatorRoleReferences,
  type LoadedCreatorRole
} from './creator-roles.js'
import { pathExists, readText, writeText } from './fs.js'
import { withProjectWriteLock } from './project-write-lock.js'
import { StaleProjectWriteError, updateVersionedYaml } from './versioned-yaml-store.js'

export interface SaveAndBindAssistantPromptVersionInput {
  role_id: string
  expected_role_sha256: string
  prompt: SaveAssistantPromptVersionInput
}

export interface SaveAndBindAssistantPromptVersionResult {
  prompt: LoadedAssistantPromptVersion
  role: LoadedCreatorRole
}

export interface AssistantPromptBindingTransactionDependencies {
  /** Test seam for proving zero-write rollback at every transaction phase. */
  afterStep?: (step: 'prompt-written' | 'role-bound' | 'versions-pruned') => void | Promise<void>
}

export type RecoverAssistantPromptBindingSelection =
  | { kind: 'existing'; prompt_id: string }
  | { kind: 'session_snapshot'; session_id: string; prompt_sha256: string }

export interface RecoverAssistantPromptBindingInput {
  role_id: string
  expected_role_sha256: string
  selection: RecoverAssistantPromptBindingSelection
}

export async function saveAndBindAssistantPromptVersion(
  projectRoot: string,
  input: SaveAndBindAssistantPromptVersionInput,
  now: () => Date = () => new Date(),
  dependencies: AssistantPromptBindingTransactionDependencies = {}
): Promise<SaveAndBindAssistantPromptVersionResult> {
  return withProjectWriteLock(projectRoot, async () => {
    const roleBefore = await loadCreatorRole(projectRoot, input.role_id)
    if (roleBefore.source_sha256 !== input.expected_role_sha256) {
      throw new StaleProjectWriteError(roleBefore.source_path)
    }
    const assistantId = creatorAssistantIdForTask(roleBefore.value.task_id)
    if (input.prompt.assistant_id !== assistantId) throw new Error('ASSISTANT_PROMPT_ROLE_MISMATCH')
    const promptValue = await prepareAssistantPromptVersion(projectRoot, input.prompt, now)
    const promptFile = assistantPromptVersionPath(projectRoot, assistantId, promptValue.id)
    if (await pathExists(promptFile)) {
      throw new Error(`ASSISTANT_PROMPT_VERSION_EXISTS: ${promptValue.id}`)
    }
    const roleFile = path.join(projectRoot, roleBefore.source_path)
    const roleRaw = await readText(roleFile)
    const prunedBackups = new Map<string, string>()
    let promptWritten = false
    let roleWriteAttempted = false
    try {
      await writeAssistantPromptVersionUnlocked(projectRoot, promptValue)
      promptWritten = true
      await dependencies.afterStep?.('prompt-written')

      const nextRole = creatorRoleV1Schema.parse({
        ...roleBefore.value,
        version: nextPatchVersion(roleBefore.value.version),
        assistant_prompt_id: promptValue.id
      })
      await validateCreatorRoleReferences(projectRoot, nextRole)
      roleWriteAttempted = true
      await updateVersionedYaml(
        projectRoot,
        'creator-roles',
        nextRole,
        input.expected_role_sha256,
        creatorRoleV1Schema
      )
      await dependencies.afterStep?.('role-bound')

      const roles = await listCreatorRoles(projectRoot)
      const pinnedIds = new Set(
        roles
          .filter((role) => creatorAssistantIdForTask(role.value.task_id) === assistantId)
          .map((role) => role.value.assistant_prompt_id)
          .filter((id): id is string => Boolean(id))
      )
      const versions = await listAssistantPromptVersionsUnbounded(projectRoot, assistantId)
      for (const candidate of promptPruneCandidates(versions, pinnedIds)) {
        prunedBackups.set(
          candidate.source_path,
          await readText(path.join(projectRoot, candidate.source_path))
        )
      }
      await pruneAssistantPromptVersions(projectRoot, assistantId, pinnedIds)
      await dependencies.afterStep?.('versions-pruned')

      const [prompt, role] = await Promise.all([
        loadAssistantPromptVersion(projectRoot, assistantId, promptValue.id),
        loadCreatorRole(projectRoot, input.role_id)
      ])
      if (role.value.assistant_prompt_id !== prompt.value.id) {
        throw new Error('ASSISTANT_PROMPT_BINDING_VERIFICATION_FAILED')
      }
      for (const pinnedId of pinnedIds) {
        await loadAssistantPromptVersion(projectRoot, assistantId, pinnedId)
      }
      const unpinnedCount = (await listAssistantPromptVersionsUnbounded(projectRoot, assistantId)).filter(
        (version) => !pinnedIds.has(version.value.id)
      ).length
      if (unpinnedCount > MAX_ASSISTANT_PROMPT_CONFIG_VERSIONS) {
        throw new Error('ASSISTANT_PROMPT_RETENTION_VERIFICATION_FAILED')
      }
      return { prompt, role }
    } catch (error) {
      const rollbackErrors: unknown[] = []
      for (const [sourcePath, raw] of prunedBackups) {
        await writeText(path.join(projectRoot, sourcePath), raw).catch((cause) => rollbackErrors.push(cause))
      }
      if (roleWriteAttempted) {
        await writeText(roleFile, roleRaw).catch((cause) => rollbackErrors.push(cause))
      }
      if (promptWritten) await rm(promptFile, { force: true }).catch((cause) => rollbackErrors.push(cause))
      if (rollbackErrors.length) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          'Assistant prompt binding rollback was incomplete.',
          { cause: error }
        )
      }
      throw error
    }
  })
}

export async function recoverAssistantPromptBinding(
  projectRoot: string,
  input: RecoverAssistantPromptBindingInput
): Promise<SaveAndBindAssistantPromptVersionResult> {
  return withProjectWriteLock(projectRoot, async () => {
    const roleBefore = await loadCreatorRole(projectRoot, input.role_id)
    if (roleBefore.source_sha256 !== input.expected_role_sha256) {
      throw new StaleProjectWriteError(roleBefore.source_path)
    }
    const assistantId = creatorAssistantIdForTask(roleBefore.value.task_id)
    const roleFile = path.join(projectRoot, roleBefore.source_path)
    const roleRaw = await readText(roleFile)
    let prompt: LoadedAssistantPromptVersion
    let createdPromptFile: string | null = null
    let roleWriteAttempted = false
    try {
      if (input.selection.kind === 'existing') {
        prompt = await loadAssistantPromptVersion(projectRoot, assistantId, input.selection.prompt_id)
      } else {
        const session = await loadAgentSessionDetail(projectRoot, input.selection.session_id)
        const snapshot = session.session.configuration.assistant_prompt
        if (
          session.session.configuration.creator_role.id !== roleBefore.value.id ||
          !snapshot ||
          snapshot.assistant_id !== assistantId ||
          snapshot.id !== roleBefore.value.assistant_prompt_id ||
          session.session.configuration.assistant_prompt_sha256 !== input.selection.prompt_sha256
        ) {
          throw new Error('ASSISTANT_PROMPT_RECOVERY_SNAPSHOT_MISMATCH')
        }
        const value = assistantPromptVersionV1Schema.parse(snapshot)
        const promptFile = assistantPromptVersionPath(projectRoot, assistantId, value.id)
        if (!(await pathExists(promptFile))) {
          await writeAssistantPromptVersionUnlocked(projectRoot, value)
          createdPromptFile = promptFile
        }
        prompt = await loadAssistantPromptVersion(projectRoot, assistantId, value.id)
        if (prompt.source_sha256 !== input.selection.prompt_sha256) {
          throw new Error('ASSISTANT_PROMPT_RECOVERY_HASH_MISMATCH')
        }
      }
      const nextRole = creatorRoleV1Schema.parse({
        ...roleBefore.value,
        version: nextPatchVersion(roleBefore.value.version),
        assistant_prompt_id: prompt.value.id
      })
      await validateCreatorRoleReferences(projectRoot, nextRole)
      roleWriteAttempted = true
      const role = await updateVersionedYaml(
        projectRoot,
        'creator-roles',
        nextRole,
        input.expected_role_sha256,
        creatorRoleV1Schema
      )
      return { prompt, role }
    } catch (error) {
      const rollbackErrors: unknown[] = []
      if (roleWriteAttempted) {
        await writeText(roleFile, roleRaw).catch((cause) => rollbackErrors.push(cause))
      }
      if (createdPromptFile) {
        await rm(createdPromptFile, { force: true }).catch((cause) => rollbackErrors.push(cause))
      }
      if (rollbackErrors.length) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          'Assistant prompt recovery rollback was incomplete.',
          { cause: error }
        )
      }
      throw error
    }
  })
}

function promptPruneCandidates(
  versions: LoadedAssistantPromptVersion[],
  pinnedIds: ReadonlySet<string>
): LoadedAssistantPromptVersion[] {
  const ordinaryToKeep = new Set(
    versions
      .filter((version) => !pinnedIds.has(version.value.id))
      .slice(0, MAX_ASSISTANT_PROMPT_CONFIG_VERSIONS)
      .map((version) => version.value.id)
  )
  return versions.filter(
    (version) => !pinnedIds.has(version.value.id) && !ordinaryToKeep.has(version.value.id)
  )
}

function nextPatchVersion(value: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(value)
  return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : '1.0.1'
}
