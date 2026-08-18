import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createCharacter,
  createCharacterState,
  createLocation,
  createProjectAt,
  createTimelineEventAtNode,
  createTimelineNode,
  ensureBuiltinCreatorRoles,
  loadAgentSessionDetail
} from '@quillarium/core'
import { StructuredOutputError } from '@quillarium/ai'
import {
  previewAssistantTurn,
  sendAssistantTurn,
  startAssistantWorkflowSession,
  type AssistantHandlerDependencies
} from './assistant.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  vi.clearAllMocks()
})

async function fixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-assistant-ipc-'))
  roots.push(base)
  const project = await createProjectAt(path.join(base, 'project'), {
    id: 'assistant-ipc-fixture',
    title: 'Assistant IPC Fixture'
  })
  await createCharacter(project.root, 'Character A', { id: 'character-a' })
  await createLocation(project.root, 'Rehearsal Room', { id: 'location-a' })
  await createTimelineNode(project.root, 'Opening time', { id: 'time-a', year: 1, month: 1 })
  await createTimelineEventAtNode(project.root, 'time-a', 'Opening event', {
    id: 'event-a',
    location: 'location-a',
    characters: ['character-a']
  })
  await createCharacterState(project.root, 'Character A at opening', {
    id: 'state-a',
    character: 'character-a',
    scope_type: 'timeline_event',
    scope_id: 'event-a',
    timeline_node: 'time-a'
  })
  await ensureBuiltinCreatorRoles(project.root)
  const session = await startAssistantWorkflowSession(
    project.root,
    'character-rehearsal',
    { document_type: 'character', document_id: 'character-a' },
    undefined,
    {
      schema_version: 1,
      task_id: 'character-rehearsal',
      character_id: 'character-a',
      timeline_event_id: 'event-a',
      location_id: 'location-a',
      workflow_step: 'propose'
    }
  )
  return { root: project.root, session }
}

function dependencies(generate: (...args: unknown[]) => Promise<unknown>): AssistantHandlerDependencies {
  return {
    loadAIProfile: vi.fn().mockResolvedValue({
      provider: 'openai',
      baseUrl: 'https://example.test/v1',
      apiKey: 'test-only-key',
      model: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 512
    }),
    generateStructured: vi.fn(generate)
  } as unknown as AssistantHandlerDependencies
}

describe('creator assistant IPC execution', () => {
  it('records the exact typed execution boundary without persisting credentials', async () => {
    const { root, session } = await fixture()
    const generate = vi.fn().mockResolvedValue({
      value: {
        reply: 'The character asks for evidence.',
        candidate: null,
        exploration: {
          summary: 'The character remains cautious.',
          open_questions: ['What evidence is visible?']
        },
        proposals: [],
        configuration_proposals: []
      },
      raw_response: '{"reply":"The character asks for evidence."}',
      repaired: false,
      response_format: 'json_schema'
    })
    const result = await sendAssistantTurn(
      root,
      session.session.id,
      session.source_sha256,
      'How does the character respond?',
      undefined,
      dependencies(generate)
    )

    expect(result.turns).toEqual([
      expect.objectContaining({
        author_input: 'How does the character respond?',
        assistant_reply: 'The character asks for evidence.'
      })
    ])
    const turnId = result.turns[0]!.id
    const snapshotRaw = await readFile(
      path.join(root, 'runs', 'assistants', session.session.id, 'turns', turnId, 'execution-snapshot.json'),
      'utf8'
    )
    const snapshot = JSON.parse(snapshotRaw) as {
      creator_role_sha256: string
      context_bundle_sha256: string
      prompt_envelope: { messages: Array<{ role: string; content: string }> }
      workflow_input: { task_id: string; timeline_event_id: string; location_id: string }
      snapshot_sha256: string
    }
    expect(snapshot.creator_role_sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(snapshot.context_bundle_sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(snapshot.workflow_input).toMatchObject({
      task_id: 'character-rehearsal',
      timeline_event_id: 'event-a',
      location_id: 'location-a'
    })
    expect(snapshot.prompt_envelope.messages.at(-1)?.content).toContain('How does the character respond?')
    expect(snapshot.snapshot_sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(snapshotRaw).not.toContain('test-only-key')
    expect(generate).toHaveBeenCalledOnce()
  })

  it('previews context without invoking the provider', async () => {
    const { root, session } = await fixture()
    const generate = vi.fn().mockRejectedValue(new Error('provider must not run during preview'))
    const preview = await previewAssistantTurn(root, session.session.id, 'Preview only.', undefined, {
      loadAIProfile: vi.fn().mockResolvedValue({
        provider: 'deepseek',
        baseUrl: 'https://example.test/v1',
        apiKey: 'test-only-key',
        model: 'deepseek-v4-flash',
        temperature: 0,
        maxTokens: 512
      }),
      generateStructured: generate
    })
    expect(preview.knows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source_type: 'system', display_title: 'Assistant authority boundary' }),
        expect.objectContaining({ source_type: 'project', display_title: 'Project identity' }),
        expect.objectContaining({ source_type: 'timeline_event', source_id: 'event-a', required: true }),
        expect.objectContaining({ source_type: 'location', source_id: 'location-a', required: true }),
        expect.objectContaining({ source_type: 'character_state', source_id: 'state-a' })
      ])
    )
    expect(generate).not.toHaveBeenCalled()
  })

  it('keeps raw and repair responses in a recoverable failed turn', async () => {
    const { root, session } = await fixture()
    const failure = new StructuredOutputError('STRUCTURED_OUTPUT_REPAIR_FAILED', 'invalid after repair', {
      rawResponse: '{"reply":',
      repairResponse: 'still invalid',
      validationIssues: ['candidate: Required']
    })
    await expect(
      sendAssistantTurn(
        root,
        session.session.id,
        session.source_sha256,
        'Review this.',
        undefined,
        dependencies(async () => {
          throw failure
        })
      )
    ).rejects.toBe(failure)

    const detail = await loadAgentSessionDetail(root, session.session.id)
    expect(detail.failures).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'STRUCTURED_OUTPUT_REPAIR_FAILED',
          validation_issues: ['candidate: Required']
        })
      })
    ])
    const failedTurnId = detail.failures[0]!.id
    const turnDirectory = path.join(root, 'runs', 'assistants', session.session.id, 'turns', failedTurnId)
    await expect(readFile(path.join(turnDirectory, 'raw-response.txt'), 'utf8')).resolves.toBe('{"reply":')
    await expect(readFile(path.join(turnDirectory, 'repair-response.txt'), 'utf8')).resolves.toBe(
      'still invalid'
    )
  })
})
