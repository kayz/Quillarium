import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ensureBuiltinAssistantPrompts,
  assistantPromptVersionPath,
  listAssistantPromptVersions,
  listAssistantPromptVersionsUnbounded,
  loadAssistantPromptVersion,
  saveAssistantPromptVersion
} from './assistant-prompts.js'
import {
  recoverAssistantPromptBinding,
  saveAndBindAssistantPromptVersion
} from './assistant-prompt-binding.js'
import { ensureBuiltinCreatorRoles, loadCreatorRole } from './creator-roles.js'
import { loadAgentSessionDetail, startAgentSession } from './assistant-sessions.js'
import { createProjectAt } from './project.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('assistant prompt version isolation and retention', () => {
  it('shows only the latest five versions for one assistant and retains exact old session snapshots', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-assistant-prompts-'))
    roots.push(base)
    const root = (
      await createProjectAt(path.join(base, 'project'), {
        id: 'assistant-prompts',
        title: 'Assistant prompts'
      })
    ).root
    await ensureBuiltinAssistantPrompts(root)
    await ensureBuiltinCreatorRoles(root)
    const session = await startAgentSession(root, 'character-rehearsal', {
      document_type: 'project',
      document_id: 'assistant-prompts'
    })
    expect(session.session.configuration.assistant_prompt?.version).toBe('1.0.0')

    for (let index = 0; index < 6; index += 1) {
      const current = await listAssistantPromptVersions(root, 'character-rehearsal')
      await saveAssistantPromptVersion(root, {
        assistant_id: 'character-rehearsal',
        base_version: current[0]?.value.version,
        instructions: `Character rehearsal workflow revision ${index + 1}.`
      })
    }
    const rehearsal = await listAssistantPromptVersions(root, 'character-rehearsal')
    expect(rehearsal).toHaveLength(5)
    expect(rehearsal.map((item) => item.value.version)).toEqual(['1.0.6', '1.0.5', '1.0.4', '1.0.3', '1.0.2'])
    expect(rehearsal.every((item) => item.value.assistant_id === 'character-rehearsal')).toBe(true)
    expect(await listAssistantPromptVersions(root, 'continuity-review')).toHaveLength(1)
    expect(await listAssistantPromptVersions(root, 'setting-organizer')).toHaveLength(1)

    const restored = await loadAgentSessionDetail(root, session.session.id)
    expect(restored.session.configuration.assistant_prompt).toMatchObject({
      assistant_id: 'character-rehearsal',
      version: '1.0.0',
      instructions: expect.stringContaining('product workflow')
    })
  })

  it('atomically saves, binds, prunes only unpinned versions, and rolls back stale/faulted writes', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-assistant-prompt-binding-'))
    roots.push(base)
    const root = (
      await createProjectAt(path.join(base, 'project'), {
        id: 'assistant-prompt-binding',
        title: 'Assistant prompt binding'
      })
    ).root
    await ensureBuiltinCreatorRoles(root)
    const historicalSession = await startAgentSession(root, 'character-rehearsal', {
      document_type: 'project',
      document_id: 'assistant-prompt-binding'
    })

    for (let index = 0; index < 6; index += 1) {
      const role = await loadCreatorRole(root, 'character-rehearsal')
      const current = await loadAssistantPromptVersion(
        root,
        'character-rehearsal',
        role.value.assistant_prompt_id!
      )
      const saved = await saveAndBindAssistantPromptVersion(
        root,
        {
          role_id: role.value.id,
          expected_role_sha256: role.source_sha256,
          prompt: {
            assistant_id: 'character-rehearsal',
            base_version: current.value.version,
            instructions: `Bound rehearsal prompt ${index + 1}.`
          }
        },
        () => new Date(`2026-08-${String(18 + index).padStart(2, '0')}T00:00:00Z`)
      )
      expect(saved.role.value.assistant_prompt_id).toBe(saved.prompt.value.id)
    }

    const role = await loadCreatorRole(root, 'character-rehearsal')
    await expect(
      loadAssistantPromptVersion(root, 'character-rehearsal', role.value.assistant_prompt_id!)
    ).resolves.toBeDefined()
    const versions = await listAssistantPromptVersionsUnbounded(root, 'character-rehearsal')
    const pinned = new Set([role.value.assistant_prompt_id!])
    expect(versions.filter((version) => !pinned.has(version.value.id))).toHaveLength(5)
    expect(
      (await loadAgentSessionDetail(root, historicalSession.session.id)).session.configuration
        .assistant_prompt
    ).toMatchObject({ version: '1.0.0' })

    const roleRawBefore = await readFile(path.join(root, role.source_path), 'utf8')
    const idsBefore = versions.map((version) => version.value.id).sort()
    await expect(
      saveAndBindAssistantPromptVersion(root, {
        role_id: role.value.id,
        expected_role_sha256: '0'.repeat(64),
        prompt: {
          assistant_id: 'character-rehearsal',
          base_version: '1.0.6',
          instructions: 'Must never be written.'
        }
      })
    ).rejects.toMatchObject({ code: 'STALE_PROJECT_WRITE' })
    expect(await readFile(path.join(root, role.source_path), 'utf8')).toBe(roleRawBefore)
    expect(
      (await listAssistantPromptVersionsUnbounded(root, 'character-rehearsal'))
        .map((version) => version.value.id)
        .sort()
    ).toEqual(idsBefore)

    await expect(
      saveAndBindAssistantPromptVersion(
        root,
        {
          role_id: role.value.id,
          expected_role_sha256: role.source_sha256,
          prompt: {
            assistant_id: 'character-rehearsal',
            base_version: '1.0.6',
            instructions: 'Rollback this prompt.'
          }
        },
        () => new Date('2026-08-30T00:00:00Z'),
        {
          afterStep(step) {
            if (step === 'role-bound') throw new Error('INJECTED_BINDING_FAILURE')
          }
        }
      )
    ).rejects.toThrow('INJECTED_BINDING_FAILURE')
    expect(await readFile(path.join(root, role.source_path), 'utf8')).toBe(roleRawBefore)
    expect(
      (await listAssistantPromptVersionsUnbounded(root, 'character-rehearsal'))
        .map((version) => version.value.id)
        .sort()
    ).toEqual(idsBefore)

    await expect(
      saveAndBindAssistantPromptVersion(
        root,
        {
          role_id: role.value.id,
          expected_role_sha256: role.source_sha256,
          prompt: {
            assistant_id: 'character-rehearsal',
            base_version: '1.0.6',
            instructions: 'Rollback this prompt after retention pruning.'
          }
        },
        () => new Date('2026-08-31T00:00:00Z'),
        {
          afterStep(step) {
            if (step === 'versions-pruned') throw new Error('INJECTED_PRUNE_FAILURE')
          }
        }
      )
    ).rejects.toThrow('INJECTED_PRUNE_FAILURE')
    expect(await readFile(path.join(root, role.source_path), 'utf8')).toBe(roleRawBefore)
    expect(
      (await listAssistantPromptVersionsUnbounded(root, 'character-rehearsal'))
        .map((version) => version.value.id)
        .sort()
    ).toEqual(idsBefore)
  })

  it('explicitly restores a dangling binding from an exact historical session snapshot', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-assistant-prompt-recovery-'))
    roots.push(base)
    const root = (
      await createProjectAt(path.join(base, 'project'), {
        id: 'assistant-prompt-recovery',
        title: 'Assistant prompt recovery'
      })
    ).root
    await ensureBuiltinCreatorRoles(root)
    const session = await startAgentSession(root, 'character-rehearsal', {
      document_type: 'project',
      document_id: 'assistant-prompt-recovery'
    })
    const snapshot = session.session.configuration.assistant_prompt!
    const snapshotSha256 = session.session.configuration.assistant_prompt_sha256!
    await rm(assistantPromptVersionPath(root, 'character-rehearsal', snapshot.id), { force: true })
    const role = await loadCreatorRole(root, 'character-rehearsal')

    const recovered = await recoverAssistantPromptBinding(root, {
      role_id: role.value.id,
      expected_role_sha256: role.source_sha256,
      selection: {
        kind: 'session_snapshot',
        session_id: session.session.id,
        prompt_sha256: snapshotSha256
      }
    })
    expect(recovered.prompt.value).toEqual(snapshot)
    expect(recovered.prompt.source_sha256).toBe(snapshotSha256)
    expect(recovered.role.value.assistant_prompt_id).toBe(snapshot.id)
    expect(
      (await loadAgentSessionDetail(root, session.session.id)).session.configuration.assistant_prompt_sha256
    ).toBe(snapshotSha256)
  })
})
