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
import { applyAssistantTurn } from './assistant-turn-apply.js'
import { UNCONFIRMED_EVAL } from './chapter-eval.js'
import { ensureBuiltinCreatorRoles } from './creator-roles.js'
import { listDocs } from './documents.js'
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

async function plantSettingTurn(
  proposals: Array<Record<string, unknown>>,
  configurationProposals: Array<Record<string, unknown>> = []
): Promise<{
  root: string
  sessionId: string
  turnId: string
  sha: string
}> {
  const root = await project()
  await ensureBuiltinCreatorRoles(root)
  const started = await startAgentSession(root, 'setting-organizer', {
    document_type: 'project',
    document_id: 'assistant-fixture'
  })
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
    currentInput: 'Plant setting proposals for apply tests.'
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
      exploration: { summary: 'Planted setting turn.', open_questions: [] },
      proposals,
      configuration_proposals: configurationProposals
    },
    raw_response: '{}'
  })
  const turnId = recorded.turns[0]!.id
  return {
    root,
    sessionId: started.session.id,
    turnId,
    sha: recorded.turn_source_sha256[turnId]!
  }
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
})
