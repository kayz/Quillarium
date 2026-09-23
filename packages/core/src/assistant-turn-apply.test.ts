import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveContextBundleDefinition } from './assistant-context.js'
import {
  assistantProposalV1Schema,
  createAgentExecutionSnapshot,
  createAgentPromptEnvelope,
  loadAgentSessionDetail,
  recordAssistantTurn,
  startAgentSession
} from './assistant-sessions.js'
import {
  applyAssistantTurn,
  DISABLED_UPDATE_CARD,
  MISSING_UPDATE_CARD,
  STALE_ASSISTANT_TURN
} from './assistant-turn-apply.js'
import { UNCONFIRMED_EVAL } from './chapter-eval.js'
import { ensureBuiltinCreatorRoles, listCreatorRoles } from './creator-roles.js'
import { createCharacter, createOutline, createWorldEntry, listDocs } from './documents.js'
import { createProjectAt } from './project.js'
import type { ContextTokenCounter } from './tokenization.js'
import { createWritingPresetSnapshot, loadWritingPreset } from './writing-presets.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-assistant-turn-apply-'))
  roots.push(base)
  return (
    await createProjectAt(path.join(base, 'project'), {
      id: 'assistant-fixture',
      title: 'Assistant Fixture'
    })
  ).root
}

const counter: ContextTokenCounter = {
  descriptor: {
    id: 'assistant-turn-apply-test',
    provider: 'test',
    model: 'test',
    exact: true,
    source_revision: 'fixture',
    source_sha256: 'fixture-source',
    vocabulary_sha256: 'fixture-vocabulary'
  },
  count: (text) => [...text].length,
  truncate: (text, maximum, strategy) => {
    const characters = [...text]
    const retained = strategy === 'tail' ? characters.slice(-maximum) : characters.slice(0, maximum)
    return {
      text: retained.join(''),
      token_count: retained.length,
      original_token_count: characters.length,
      truncated: retained.length < characters.length
    }
  }
}

async function recordPlantedTurn(
  root: string,
  started: Awaited<ReturnType<typeof startAgentSession>>,
  proposals: Array<Record<string, unknown>>,
  configurationProposals: Array<Record<string, unknown>>,
  currentInput: string
): Promise<{
  root: string
  sessionId: string
  turnId: string
  sha: string
  proposalIds: string[]
  configIds: string[]
}> {
  const resolved = await resolveContextBundleDefinition(
    root,
    started.session.configuration.context_bundle,
    started.session.configuration.context_bundle_sha256,
    started.session.target,
    started.session.configuration.writing_preset,
    { token_counter: counter }
  )
  const preset = createWritingPresetSnapshot(await loadWritingPreset(root, 'default'), {
    profile: 'background',
    provider: 'openai',
    model: 'fixture-model',
    temperature: 0,
    max_output_tokens: 512,
    tokenizer_id: 'o200k'
  })
  const envelope = createAgentPromptEnvelope({
    systemMessage: 'Test boundary',
    contextMarkdown: resolved.context.markdown,
    conversation: [],
    currentInput
  })
  const snapshot = createAgentExecutionSnapshot({
    session: started.session,
    resolvedContext: resolved,
    writingPreset: preset,
    promptEnvelope: envelope
  })
  const recorded = await recordAssistantTurn(root, started.session.id, {
    expected_session_sha256: started.source_sha256,
    execution_snapshot: snapshot,
    output: {
      reply: 'Planted.',
      exploration: { summary: 'Planted assistant turn.', open_questions: [] },
      proposals,
      configuration_proposals: configurationProposals
    },
    raw_response: '{}'
  })
  const turn = recorded.turns[0]!
  return {
    root,
    sessionId: started.session.id,
    turnId: turn.id,
    sha: recorded.turn_source_sha256[turn.id]!,
    proposalIds: turn.proposals.map((item) => item.id),
    configIds: turn.configuration_proposals.map((item) => item.id)
  }
}

async function plantSettingTurnOn(
  planted: { root: string },
  proposals: Array<Record<string, unknown>>,
  configurationProposals: Array<Record<string, unknown>> = []
): Promise<{
  root: string
  sessionId: string
  turnId: string
  sha: string
  proposalIds: string[]
  configIds: string[]
}> {
  const root = planted.root
  await ensureBuiltinCreatorRoles(root)
  const started = await startAgentSession(root, 'setting-organizer', {
    document_type: 'project',
    document_id: 'assistant-fixture'
  })
  return recordPlantedTurn(
    root,
    started,
    proposals,
    configurationProposals,
    'Plant setting proposals for apply tests.'
  )
}

async function plantSettingTurn(
  proposals: Array<Record<string, unknown>>,
  configurationProposals: Array<Record<string, unknown>> = []
): Promise<{
  root: string
  sessionId: string
  turnId: string
  sha: string
  proposalIds: string[]
  configIds: string[]
}> {
  const root = await project()
  return plantSettingTurnOn({ root }, proposals, configurationProposals)
}

async function plantContinuityTurn(proposals: Array<Record<string, unknown>>): Promise<{
  root: string
  sessionId: string
  turnId: string
  sha: string
  proposalIds: string[]
  configIds: string[]
}> {
  const root = await project()
  await ensureBuiltinCreatorRoles(root)
  await createOutline(root, 'book', 'Book', { id: 'book' })
  await createOutline(root, 'volume', 'Volume', { id: 'volume', parent: 'book' })
  await createOutline(root, 'part', 'Part', { id: 'part', parent: 'volume' })
  const chapterId = 'chapter'
  await createOutline(root, 'chapter', 'Chapter', { id: chapterId, parent: 'part' })
  const started = await startAgentSession(
    root,
    'continuity-review',
    { document_type: 'outline', document_id: chapterId },
    'Continuity fixture',
    {
      schema_version: 1,
      task_id: 'continuity-review',
      document_ids: [chapterId],
      chapter_id: chapterId
    }
  )
  return recordPlantedTurn(root, started, proposals, [], 'Plant continuity issues for apply tests.')
}

describe('assistantProposalV1Schema', () => {
  it('treats legacy proposals without operation as create', () => {
    const parsed = assistantProposalV1Schema.parse({
      id: 'proposal-legacy',
      kind: 'planning_record',
      title: 'Tide',
      document_type: 'character',
      fields: {},
      content: 'A tide spirit.',
      rationale: 'From source notes.',
      status: 'pending'
    })
    expect(parsed.operation).toBe('create')
    expect(parsed.card_id).toBeUndefined()
  })

  it('rejects an update without card_id', () => {
    expect(() =>
      assistantProposalV1Schema.parse({
        id: 'proposal-bad-update',
        kind: 'planning_record',
        title: 'Tide',
        document_type: 'world_entry',
        operation: 'update',
        fields: {},
        content: 'Replacement.',
        rationale: 'Rewrite.',
        status: 'pending'
      })
    ).toThrow(/card_id/u)
  })

  it('rejects issue updates', () => {
    expect(() =>
      assistantProposalV1Schema.parse({
        id: 'proposal-issue-update',
        kind: 'issue',
        title: 'Gap',
        document_type: 'issue',
        operation: 'update',
        card_id: 'issue-old',
        fields: {},
        content: 'Body',
        rationale: 'Cannot patch issues this way.',
        status: 'pending'
      })
    ).toThrow()
  })
})

describe('applyAssistantTurn', () => {
  it('does not write when the author has not confirmed', async () => {
    const planted = await plantSettingTurn([
      {
        kind: 'planning_record',
        title: 'Harbor Law',
        document_type: 'world_entry',
        rationale: 'Need a law card.',
        content: 'Ships pay the harbor tax.'
      }
    ])
    await expect(
      applyAssistantTurn(
        planted.root,
        planted.sessionId,
        planted.turnId,
        { confirmed: false, creates: [], updates: [], issues: [], configs: [] },
        planted.sha
      )
    ).rejects.toThrow(UNCONFIRMED_EVAL)
    expect(await listDocs(planted.root, 'world_entry')).toHaveLength(0)
    const detail = await loadAgentSessionDetail(planted.root, planted.sessionId)
    expect(detail.turns[0]?.proposals[0]?.status).toBe('pending')
  })

  it('creates a world entry then specializes when the author confirms a typed create', async () => {
    const planted = await plantSettingTurn([
      {
        id: 'proposal-tide',
        kind: 'planning_record',
        title: 'Tide',
        document_type: 'character',
        rationale: 'Personify the tide.',
        content: 'A tide spirit.'
      }
    ])
    const result = await applyAssistantTurn(
      planted.root,
      planted.sessionId,
      planted.turnId,
      {
        confirmed: true,
        creates: [{ proposal_id: 'proposal-tide', type: 'character' }],
        updates: [],
        issues: [],
        configs: []
      },
      planted.sha
    )
    expect(await listDocs(planted.root, 'world_entry')).toHaveLength(0)
    const characters = await listDocs(planted.root, 'character')
    expect(characters.map((item) => item.data.title)).toContain('Tide')
    expect(result.created_ids).toEqual([characters.find((item) => item.data.title === 'Tide')?.data.id])
    const detail = await loadAgentSessionDetail(planted.root, planted.sessionId)
    expect(detail.turns[0]?.proposals[0]?.status).toBe('applied')
    expect(detail.turns[0]?.proposals[0]?.applied_document_id).toBe(result.created_ids[0])
  })

  it('rejects the unselected create in the same confirm', async () => {
    const planted = await plantSettingTurn([
      {
        id: 'proposal-keep',
        kind: 'planning_record',
        title: 'Keep',
        document_type: 'world_entry',
        rationale: 'Keep this.',
        content: 'Keep body.'
      },
      {
        id: 'proposal-drop',
        kind: 'planning_record',
        title: 'Drop',
        document_type: 'world_entry',
        rationale: 'Drop this.',
        content: 'Drop body.'
      }
    ])
    await applyAssistantTurn(
      planted.root,
      planted.sessionId,
      planted.turnId,
      {
        confirmed: true,
        creates: [{ proposal_id: 'proposal-keep' }],
        updates: [],
        issues: [],
        configs: []
      },
      planted.sha
    )
    const worlds = await listDocs(planted.root, 'world_entry')
    expect(worlds.map((item) => item.data.title)).toEqual(['Keep'])
    const detail = await loadAgentSessionDetail(planted.root, planted.sessionId)
    const statuses = Object.fromEntries(detail.turns[0]!.proposals.map((item) => [item.id, item.status]))
    expect(statuses).toEqual({ 'proposal-keep': 'applied', 'proposal-drop': 'rejected' })
  })

  it('rolls back created files when specialize fails and leaves the turn pending', async () => {
    const planted = await plantSettingTurn([
      {
        id: 'proposal-tide',
        kind: 'planning_record',
        title: 'Tide',
        document_type: 'character',
        rationale: 'Personify the tide.',
        content: 'A tide spirit.'
      }
    ])
    await expect(
      applyAssistantTurn(
        planted.root,
        planted.sessionId,
        planted.turnId,
        {
          confirmed: true,
          creates: [{ proposal_id: 'proposal-tide', type: 'character_relation', fields: {} }],
          updates: [],
          issues: [],
          configs: []
        },
        planted.sha
      )
    ).rejects.toThrow('特化缺少必填字段：')
    expect(await listDocs(planted.root, 'world_entry')).toHaveLength(0)
    expect(await listDocs(planted.root, 'character_relation')).toEqual([])
    const detail = await loadAgentSessionDetail(planted.root, planted.sessionId)
    expect(detail.turns[0]?.proposals[0]?.status).toBe('pending')
  })

  it('replaces an enabled character body without changing type', async () => {
    const planted = await plantSettingTurn([])
    await createCharacter(planted.root, 'Lin', { id: 'char-lin' }, 'Old voice.')
    const withUpdate = await plantSettingTurnOn(planted, [
      {
        id: 'proposal-lin',
        kind: 'planning_record',
        title: 'Lin',
        document_type: 'character',
        operation: 'update',
        card_id: 'char-lin',
        rationale: 'Rewrite voice.',
        content: 'New voice.'
      }
    ])
    await applyAssistantTurn(
      withUpdate.root,
      withUpdate.sessionId,
      withUpdate.turnId,
      {
        confirmed: true,
        creates: [],
        updates: [{ proposal_id: 'proposal-lin' }],
        issues: [],
        configs: []
      },
      withUpdate.sha
    )
    const card = (await listDocs(withUpdate.root, 'character')).find((item) => item.data.id === 'char-lin')
    expect(card?.content).toContain('New voice.')
    expect(card?.content).not.toContain('Old voice.')
    expect(card?.data.type).toBe('character')
  })

  it('refuses to update a disabled world entry', async () => {
    const planted = await plantSettingTurn([])
    await createWorldEntry(planted.root, 'Silent', { id: 'world-silent', enabled: false }, 'Old.')
    const withUpdate = await plantSettingTurnOn(planted, [
      {
        id: 'proposal-silent',
        kind: 'planning_record',
        title: 'Silent',
        document_type: 'world_entry',
        operation: 'update',
        card_id: 'world-silent',
        rationale: 'Should fail.',
        content: 'New.'
      }
    ])
    await expect(
      applyAssistantTurn(
        withUpdate.root,
        withUpdate.sessionId,
        withUpdate.turnId,
        {
          confirmed: true,
          creates: [],
          updates: [{ proposal_id: 'proposal-silent' }],
          issues: [],
          configs: []
        },
        withUpdate.sha
      )
    ).rejects.toThrow(DISABLED_UPDATE_CARD)
    const card = (await listDocs(withUpdate.root, 'world_entry')).find(
      (item) => item.data.id === 'world-silent'
    )
    expect(card?.content).toContain('Old.')
  })

  it('refuses a missing update target', async () => {
    const planted = await plantSettingTurn([])
    const withUpdate = await plantSettingTurnOn(planted, [
      {
        id: 'proposal-missing',
        kind: 'planning_record',
        title: 'Ghost',
        document_type: 'character',
        operation: 'update',
        card_id: 'char-does-not-exist',
        rationale: 'Missing card.',
        content: 'New.'
      }
    ])
    await expect(
      applyAssistantTurn(
        withUpdate.root,
        withUpdate.sessionId,
        withUpdate.turnId,
        {
          confirmed: true,
          creates: [],
          updates: [{ proposal_id: 'proposal-missing' }],
          issues: [],
          configs: []
        },
        withUpdate.sha
      )
    ).rejects.toThrow(MISSING_UPDATE_CARD)
  })

  it('rolls back the first create when a later specialize is missing fields', async () => {
    const planted = await plantSettingTurn([
      {
        id: 'proposal-ok',
        kind: 'planning_record',
        title: 'Harbor',
        document_type: 'world_entry',
        rationale: 'First.',
        content: 'Harbor body.'
      },
      {
        id: 'proposal-rel',
        kind: 'planning_record',
        title: 'Pact',
        document_type: 'character_relation',
        rationale: 'Needs both ends.',
        content: 'A pact.'
      }
    ])
    await expect(
      applyAssistantTurn(
        planted.root,
        planted.sessionId,
        planted.turnId,
        {
          confirmed: true,
          creates: [
            { proposal_id: 'proposal-ok' },
            { proposal_id: 'proposal-rel', type: 'character_relation' }
          ],
          updates: [],
          issues: [],
          configs: []
        },
        planted.sha
      )
    ).rejects.toThrow(/特化缺少必填字段/u)
    expect(await listDocs(planted.root, 'world_entry')).toHaveLength(0)
    const detail = await loadAgentSessionDetail(planted.root, planted.sessionId)
    expect(detail.turns[0]?.proposals.every((item) => item.status === 'pending')).toBe(true)
  })

  it('writes an issue only after confirm', async () => {
    const planted = await plantContinuityTurn([
      {
        id: 'proposal-issue',
        kind: 'issue',
        title: 'Timeline gap',
        document_type: 'issue',
        rationale: 'Missing day.',
        content: 'The next morning never happens.'
      }
    ])
    expect(await listDocs(planted.root, 'issue')).toHaveLength(0)
    await applyAssistantTurn(
      planted.root,
      planted.sessionId,
      planted.turnId,
      {
        confirmed: true,
        creates: [],
        updates: [],
        issues: ['proposal-issue'],
        configs: []
      },
      planted.sha
    )
    expect(await listDocs(planted.root, 'issue')).toHaveLength(1)
  })

  it('applies a configuration proposal in the same confirm and restores it on later failure', async () => {
    const successRoot = await project()
    await ensureBuiltinCreatorRoles(successRoot)
    const successRole = (await listCreatorRoles(successRoot)).find(
      (role) => role.value.id === 'setting-organizer'
    )!
    const proposedRole = {
      ...successRole.value,
      version: '1.0.1',
      description: 'A clearer author-reviewed organizer description.'
    }
    const successPlanted = await plantSettingTurnOn(
      { root: successRoot },
      [],
      [
        {
          target_kind: 'creator_role',
          target_id: 'setting-organizer',
          proposed: proposedRole,
          rationale: 'Clarifies the author-facing purpose without adding authority.'
        }
      ]
    )
    await applyAssistantTurn(
      successPlanted.root,
      successPlanted.sessionId,
      successPlanted.turnId,
      {
        confirmed: true,
        creates: [],
        updates: [],
        issues: [],
        configs: [successPlanted.configIds[0]!]
      },
      successPlanted.sha
    )
    const appliedRole = (await listCreatorRoles(successPlanted.root)).find(
      (role) => role.value.id === 'setting-organizer'
    )!
    expect(appliedRole.value.description).toBe(proposedRole.description)
    const appliedDetail = await loadAgentSessionDetail(successPlanted.root, successPlanted.sessionId)
    expect(appliedDetail.turns[0]?.configuration_proposals[0]?.status).toBe('applied')

    const failRoot = await project()
    await ensureBuiltinCreatorRoles(failRoot)
    const failRole = (await listCreatorRoles(failRoot)).find((role) => role.value.id === 'setting-organizer')!
    const failProposed = {
      ...failRole.value,
      version: '1.0.1',
      description: 'A clearer author-reviewed organizer description.'
    }
    const failPlanted = await plantSettingTurnOn(
      { root: failRoot },
      [
        {
          id: 'proposal-rel',
          kind: 'planning_record',
          title: 'Pact',
          document_type: 'character_relation',
          rationale: 'Needs both ends.',
          content: 'A pact.'
        }
      ],
      [
        {
          target_kind: 'creator_role',
          target_id: 'setting-organizer',
          proposed: failProposed,
          rationale: 'Clarifies the author-facing purpose without adding authority.'
        }
      ]
    )
    await expect(
      applyAssistantTurn(
        failPlanted.root,
        failPlanted.sessionId,
        failPlanted.turnId,
        {
          confirmed: true,
          creates: [{ proposal_id: 'proposal-rel', type: 'character_relation' }],
          updates: [],
          issues: [],
          configs: [failPlanted.configIds[0]!]
        },
        failPlanted.sha
      )
    ).rejects.toThrow(/特化缺少必填字段/u)
    const restoredRole = (await listCreatorRoles(failPlanted.root)).find(
      (role) => role.value.id === 'setting-organizer'
    )!
    expect(restoredRole.value.description).toBe(failRole.value.description)
    expect(await listDocs(failPlanted.root, 'world_entry')).toHaveLength(0)
    const failDetail = await loadAgentSessionDetail(failPlanted.root, failPlanted.sessionId)
    expect(failDetail.turns[0]?.proposals.every((item) => item.status === 'pending')).toBe(true)
    expect(failDetail.turns[0]?.configuration_proposals.every((item) => item.status === 'pending')).toBe(true)
  })

  it('rejects a stale turn hash without writing', async () => {
    const planted = await plantSettingTurn([
      {
        kind: 'planning_record',
        title: 'Stale',
        document_type: 'world_entry',
        rationale: 'Hash check.',
        content: 'Body.'
      }
    ])
    await expect(
      applyAssistantTurn(
        planted.root,
        planted.sessionId,
        planted.turnId,
        {
          confirmed: true,
          creates: [{ proposal_id: planted.proposalIds[0]! }],
          updates: [],
          issues: [],
          configs: []
        },
        '0'.repeat(64)
      )
    ).rejects.toThrow(STALE_ASSISTANT_TURN)
  })
})
