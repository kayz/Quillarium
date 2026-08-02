import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestProject, removeTestProject, writeTestDoc } from '../fixtures/test-project.js'
import {
  loadSemanticPromptTemplate,
  runSemanticChecks,
  SEMANTIC_CHECK_TIMEOUT_MS,
  type SemanticAIInvoke
} from './index.js'

const projectRoots: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  await Promise.all(projectRoots.splice(0).map(removeTestProject))
})

async function project(): Promise<string> {
  const root = await createTestProject()
  projectRoots.push(root)
  return root
}

async function seedScene(root: string): Promise<void> {
  await Promise.all([
    writeTestDoc(root, 'character', 'character-main', {
      role: 'protagonist',
      desire: 'Protect the harbor',
      ooc_guardrails: ['Never abandons civilians'],
      scene_state: { current_location: 'location-main' }
    }),
    writeTestDoc(root, 'character_state', 'state-old', {
      character: 'character-main',
      scope_type: 'outline',
      scope_id: 'old-outline',
      emotion: 'calm',
      notes: 'OLDER_STATE_SENTINEL'
    }),
    writeTestDoc(root, 'character_state', 'state-recent', {
      character: 'character-main',
      scope_type: 'scene',
      scope_id: 'scene-main',
      timeline_node: 'event-main',
      emotion: 'afraid',
      notes: 'RECENT_STATE_SENTINEL'
    }),
    writeTestDoc(root, 'canon', 'canon-main', {}, 'The harbor gate cannot open at night.'),
    writeTestDoc(
      root,
      'scene',
      'scene-main',
      {
        section: 'section-main',
        timeline_node: 'event-main',
        location: 'location-main',
        pov: 'character-main',
        characters: ['character-main']
      },
      'The frightened hero opens the harbor gate and walks away from the civilians.'
    )
  ])
}

function response(
  message: string,
  severity: 'error' | 'warning' | 'info' = 'warning',
  relatedIds = ['related-id']
): string {
  return JSON.stringify({
    issues: [{ severity, message, evidence: 'scene evidence', related_ids: relatedIds }]
  })
}

function kindFromPrompt(prompt: string): string {
  return prompt.match(/CHECK_KIND: ([^\n]+)/)?.[1] ?? ''
}

function inputFromPrompt(prompt: string): Record<string, unknown> {
  const marker = 'INPUT_JSON:\n'
  return JSON.parse(prompt.slice(prompt.indexOf(marker) + marker.length)) as Record<string, unknown>
}

describe('semantic checks', () => {
  it('merges normal OOC, state drift, and Canon conflict findings with stable codes', async () => {
    const root = await project()
    await seedScene(root)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const aiInvoke = vi.fn<SemanticAIInvoke>(async (prompt) => {
      switch (kindFromPrompt(prompt)) {
        case 'ooc':
          return response('The hero abandons civilians.', 'error')
        case 'state-drift':
          return response('Fear changed without explanation.', 'warning')
        case 'canon-conflict':
          return response('The gate opens despite Canon.', 'info', ['canon-main'])
        default:
          throw new Error('unexpected prompt')
      }
    })

    const issues = await runSemanticChecks(root, 'scene-main', aiInvoke)

    expect(issues).toEqual([
      {
        severity: 'error',
        code: 'semantic-ooc',
        message: 'The hero abandons civilians.',
        evidence: 'scene evidence',
        related_ids: ['related-id']
      },
      {
        severity: 'warning',
        code: 'semantic-state-drift',
        message: 'Fear changed without explanation.',
        evidence: 'scene evidence',
        related_ids: ['related-id']
      },
      {
        severity: 'info',
        code: 'semantic-canon-conflict',
        message: 'The gate opens despite Canon.',
        evidence: 'scene evidence',
        related_ids: ['canon-main']
      }
    ])
    expect(aiInvoke).toHaveBeenCalledTimes(3)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts common JSON fenced responses', async () => {
    const root = await project()
    await seedScene(root)
    const issues = await runSemanticChecks(
      root,
      'scene-main',
      async (prompt) => `Result follows:\n\`\`\`json\n${response(`fenced ${kindFromPrompt(prompt)}`)}\n\`\`\``
    )

    expect(issues.map((issue) => issue.code)).toEqual([
      'semantic-ooc',
      'semantic-state-drift',
      'semantic-canon-conflict'
    ])
    expect(issues.every((issue) => issue.message.startsWith('fenced'))).toBe(true)
  })

  it('downgrades malformed JSON and invalid structured output without throwing', async () => {
    const root = await project()
    await seedScene(root)
    const aiInvoke = vi.fn<SemanticAIInvoke>(async (prompt) =>
      kindFromPrompt(prompt) === 'ooc' ? 'not JSON' : JSON.stringify({ issues: [{ message: 42 }] })
    )

    const issues = await runSemanticChecks(root, 'scene-main', aiInvoke)

    expect(issues).toEqual(expect.any(Array))

    expect(issues).toHaveLength(3)
    expect(issues.every((issue) => issue.severity === 'info')).toBe(true)
    expect(issues.every((issue) => issue.code === 'semantic-check-unparseable')).toBe(true)
  })

  it('isolates invocation failures so successful checks still return', async () => {
    const root = await project()
    await seedScene(root)
    const aiInvoke = vi.fn<SemanticAIInvoke>(async (prompt) => {
      if (kindFromPrompt(prompt) === 'state-drift') throw new Error('provider unavailable')
      return response(`successful ${kindFromPrompt(prompt)}`)
    })

    const issues = await runSemanticChecks(root, 'scene-main', aiInvoke)

    expect(issues).toEqual(expect.any(Array))

    expect(issues.map((issue) => issue.code)).toEqual([
      'semantic-ooc',
      'semantic-check-unavailable',
      'semantic-canon-conflict'
    ])
    expect(issues[1]).toMatchObject({ severity: 'info' })
    expect(issues[1].message).toContain('provider unavailable')
  })

  it('times out stalled independent invocations and resolves with info issues', async () => {
    const root = await project()
    await seedScene(root)
    vi.useFakeTimers()
    let releaseStarted!: () => void
    const started = new Promise<void>((resolve) => {
      releaseStarted = resolve
    })
    const aiInvoke = vi.fn<SemanticAIInvoke>(() => {
      if (aiInvoke.mock.calls.length === 3) releaseStarted()
      return new Promise<string>(() => undefined)
    })

    const pending = runSemanticChecks(root, 'scene-main', aiInvoke)
    await started
    await vi.advanceTimersByTimeAsync(SEMANTIC_CHECK_TIMEOUT_MS)
    const issues = await pending

    expect(issues).toHaveLength(3)
    expect(issues.every((issue) => issue.severity === 'info')).toBe(true)
    expect(issues.every((issue) => issue.code === 'semantic-check-unavailable')).toBe(true)
    expect(issues.every((issue) => issue.message.includes('timed out'))).toBe(true)
  })

  it('bounds characters, selects one recent state each, truncates text, and caps Canon at 20', async () => {
    const root = await project()
    const characterIds = Array.from({ length: 14 }, (_, index) => `character-${index}`)
    await Promise.all(characterIds.map((id) => writeTestDoc(root, 'character', id, { role: 'supporting' })))
    await Promise.all([
      writeTestDoc(root, 'character_state', 'state-old', {
        character: 'character-0',
        scope_type: 'outline',
        scope_id: 'section-main',
        notes: 'OLDER_STATE_SENTINEL'
      }),
      writeTestDoc(root, 'character_state', 'state-recent', {
        character: 'character-0',
        scope_type: 'scene',
        scope_id: 'scene-main',
        notes: 'RECENT_STATE_SENTINEL'
      }),
      ...Array.from({ length: 25 }, (_, index) =>
        writeTestDoc(
          root,
          'canon',
          `canon-${String(index).padStart(2, '0')}`,
          {},
          `Harbor Canon ${index} ${'x'.repeat(2_500)}`
        )
      ),
      writeTestDoc(root, 'canon', 'canon-deprecated', { status: 'deprecated' }, 'Harbor deprecated.'),
      writeTestDoc(
        root,
        'scene',
        'scene-main',
        {
          section: 'section-main',
          timeline_node: 'event-main',
          location: 'location-main',
          pov: 'character-0',
          characters: characterIds.slice(1)
        },
        `Harbor ${'s'.repeat(13_000)}`
      )
    ])
    const prompts: string[] = []
    const aiInvoke = vi.fn<SemanticAIInvoke>(async (prompt) => {
      prompts.push(prompt)
      return JSON.stringify({ issues: [] })
    })

    await runSemanticChecks(root, 'scene-main', aiInvoke)
    const oocInput = inputFromPrompt(prompts.find((prompt) => kindFromPrompt(prompt) === 'ooc')!) as {
      scene: { content: string }
      characters: Array<{ id: string; recent_state: { id: string } | null }>
    }
    const canonInput = inputFromPrompt(
      prompts.find((prompt) => kindFromPrompt(prompt) === 'canon-conflict')!
    ) as {
      canon: Array<{ id: string; content: string }>
    }

    expect(oocInput.characters).toHaveLength(12)
    expect(oocInput.characters.map((item) => item.id)).not.toContain('character-12')
    expect(oocInput.characters.map((item) => item.id)).not.toContain('character-13')
    expect(oocInput.characters[0].recent_state?.id).toBe('state-recent')
    expect(JSON.stringify(oocInput)).toContain('RECENT_STATE_SENTINEL')
    expect(JSON.stringify(oocInput)).not.toContain('OLDER_STATE_SENTINEL')
    expect(oocInput.scene.content).toHaveLength(12_001)
    expect(oocInput.scene.content.endsWith('…')).toBe(true)
    expect(canonInput.canon).toHaveLength(20)
    expect(canonInput.canon.map((item) => item.id)).not.toContain('canon-deprecated')
    expect(canonInput.canon.every((item) => item.content.length <= 2_001)).toBe(true)
  })

  it('uses Markdown prompt resources and a tested embedded fallback', async () => {
    const source = await loadSemanticPromptTemplate('ooc')
    const fallback = await loadSemanticPromptTemplate(
      'ooc',
      new URL('./prompts/does-not-exist.md', import.meta.url)
    )

    expect(source).toContain('Quillarium OOC consistency checker')
    expect(source).toContain('Return JSON only')
    expect(fallback).toContain('Quillarium OOC consistency checker')
    expect(fallback).toContain('Return JSON only')
  })

  it('downgrades missing scene input preparation failures instead of throwing', async () => {
    const root = await project()
    const aiInvoke = vi.fn<SemanticAIInvoke>()

    const issues = await runSemanticChecks(root, 'missing-scene', aiInvoke)

    expect(issues).toEqual(expect.any(Array))

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ severity: 'info', code: 'semantic-check-unavailable' })
    expect(issues[0].message).toContain('Document not found: missing-scene')
    expect(aiInvoke).not.toHaveBeenCalled()
  })
})
