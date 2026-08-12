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

function boundedListFixture(label: string): string[] {
  return [
    `${label}_FIRST`,
    `${label}_SECOND`,
    `${label}_LONG_${'x'.repeat(2_500)}`,
    ...Array.from({ length: 19 }, (_, index) => `${label}_TAIL_${index}`)
  ]
}

function expectBoundedList(values: string[], label: string): void {
  expect(values).toHaveLength(20)
  expect(values.slice(0, 2)).toEqual([`${label}_FIRST`, `${label}_SECOND`])
  expect(values[2]).toHaveLength(2_001)
  expect(values[2].startsWith(`${label}_LONG_`)).toBe(true)
  expect(values[2].endsWith('…')).toBe(true)
  expect(values).not.toContain(`${label}_TAIL_18`)
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

  it('filters explicit non-issues while preserving true and legacy findings', async () => {
    const root = await project()
    await seedScene(root)
    const aiInvoke = vi.fn<SemanticAIInvoke>(async (prompt) => {
      const kind = kindFromPrompt(prompt)
      return JSON.stringify({
        issues: [
          {
            is_issue: false,
            severity: 'info',
            message: `explained ${kind}`,
            evidence: 'consistent on page'
          },
          { is_issue: true, severity: 'error', message: `true ${kind}` },
          { severity: 'warning', message: `legacy ${kind}` }
        ]
      })
    })

    const issues = await runSemanticChecks(root, 'scene-main', aiInvoke)

    expect(issues).toEqual([
      { severity: 'error', code: 'semantic-ooc', message: 'true ooc' },
      { severity: 'warning', code: 'semantic-ooc', message: 'legacy ooc' },
      { severity: 'error', code: 'semantic-state-drift', message: 'true state-drift' },
      { severity: 'warning', code: 'semantic-state-drift', message: 'legacy state-drift' },
      { severity: 'error', code: 'semantic-canon-conflict', message: 'true canon-conflict' },
      { severity: 'warning', code: 'semantic-canon-conflict', message: 'legacy canon-conflict' }
    ])
    expect(issues.every((issue) => !('is_issue' in issue))).toBe(true)
    expect(issues.every((issue) => !issue.message.startsWith('explained'))).toBe(true)
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

  it('includes imported motivation anchors and bounded Markdown profiles for sparse characters', async () => {
    const root = await project()
    await Promise.all([
      writeTestDoc(
        root,
        'character',
        'character-main',
        {
          role: '',
          speech_style: '',
          desire: '',
          fear: '',
          bottom_line: '',
          motivation_anchors: ['IMPORTED_MOTIVATION_SENTINEL'],
          ooc_guardrails: []
        },
        'IMPORTED_PROFILE_SENTINEL'
      ),
      writeTestDoc(root, 'canon', 'canon-main', {}, 'CANON_SENTINEL'),
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
        'Scene body.'
      )
    ])
    const prompts: string[] = []

    await runSemanticChecks(root, 'scene-main', async (prompt) => {
      prompts.push(prompt)
      return JSON.stringify({ issues: [] })
    })

    const oocInput = inputFromPrompt(prompts.find((prompt) => kindFromPrompt(prompt) === 'ooc')!) as {
      characters: Array<{
        desire: string
        fear: string
        ooc_guardrails: string[]
        motivation_anchors: string[]
        profile: string
      }>
    }
    const stateInput = inputFromPrompt(
      prompts.find((prompt) => kindFromPrompt(prompt) === 'state-drift')!
    ) as { characters: Array<{ recent_state: { id: string } | null }> }
    const canonInput = inputFromPrompt(prompts.find((prompt) => kindFromPrompt(prompt) === 'canon-conflict')!)

    expect(oocInput.characters[0]).toMatchObject({
      desire: '',
      fear: '',
      ooc_guardrails: [],
      motivation_anchors: ['IMPORTED_MOTIVATION_SENTINEL']
    })
    expect(oocInput.characters[0].profile.trim()).toBe('IMPORTED_PROFILE_SENTINEL')
    expect(stateInput.characters[0]).not.toHaveProperty('motivation_anchors')
    expect(stateInput.characters[0]).not.toHaveProperty('profile')
    expect(JSON.stringify(stateInput)).not.toContain('IMPORTED_PROFILE_SENTINEL')
    expect(JSON.stringify(stateInput)).not.toContain('IMPORTED_MOTIVATION_SENTINEL')
    expect(canonInput).not.toHaveProperty('characters')
    expect(JSON.stringify(canonInput)).not.toContain('IMPORTED_PROFILE_SENTINEL')
    expect(JSON.stringify(canonInput)).not.toContain('IMPORTED_MOTIVATION_SENTINEL')
  })

  it('preserves first and second bounded list values across character, state, and Canon payloads', async () => {
    const root = await project()
    await Promise.all([
      writeTestDoc(root, 'character', 'character-main', {
        ooc_guardrails: boundedListFixture('GUARDRAIL'),
        scene_state: {
          outfit_layers: boundedListFixture('OUTFIT'),
          wounds: boundedListFixture('WOUND'),
          carried_items: boundedListFixture('ITEM'),
          known_facts: boundedListFixture('SCENE_FACT')
        }
      }),
      writeTestDoc(root, 'character_state', 'state-main', {
        character: 'character-main',
        scope_type: 'scene',
        scope_id: 'scene-main',
        knowledge: boundedListFixture('KNOWLEDGE'),
        public_disclosure: boundedListFixture('DISCLOSURE')
      }),
      writeTestDoc(root, 'canon', 'canon-main', { tags: boundedListFixture('CANON_TAG') }),
      writeTestDoc(root, 'scene', 'scene-main', {
        section: 'section-main',
        timeline_node: 'event-main',
        location: 'location-main',
        pov: 'character-main',
        characters: ['character-main']
      })
    ])
    const prompts: string[] = []

    await runSemanticChecks(root, 'scene-main', async (prompt) => {
      prompts.push(prompt)
      return JSON.stringify({ issues: [] })
    })

    type ListCharacter = {
      ooc_guardrails: string[]
      scene_state: {
        outfit_layers: string[]
        wounds: string[]
        carried_items: string[]
        known_facts: string[]
      }
      recent_state: null | {
        knowledge: string[]
        public_disclosure: string[]
      }
    }
    const oocInput = inputFromPrompt(prompts.find((prompt) => kindFromPrompt(prompt) === 'ooc')!) as {
      characters: ListCharacter[]
    }
    const stateInput = inputFromPrompt(
      prompts.find((prompt) => kindFromPrompt(prompt) === 'state-drift')!
    ) as { characters: ListCharacter[] }
    const canonInput = inputFromPrompt(
      prompts.find((prompt) => kindFromPrompt(prompt) === 'canon-conflict')!
    ) as { canon: Array<{ tags: string[] }> }

    const oocCharacter = oocInput.characters[0]
    expectBoundedList(oocCharacter.ooc_guardrails, 'GUARDRAIL')
    expectBoundedList(oocCharacter.scene_state.outfit_layers, 'OUTFIT')
    expectBoundedList(oocCharacter.scene_state.wounds, 'WOUND')
    expectBoundedList(oocCharacter.scene_state.carried_items, 'ITEM')
    expectBoundedList(oocCharacter.scene_state.known_facts, 'SCENE_FACT')
    expectBoundedList(oocCharacter.recent_state!.knowledge, 'KNOWLEDGE')
    expectBoundedList(oocCharacter.recent_state!.public_disclosure, 'DISCLOSURE')

    const stateCharacter = stateInput.characters[0]
    expectBoundedList(stateCharacter.recent_state!.knowledge, 'KNOWLEDGE')
    expectBoundedList(stateCharacter.recent_state!.public_disclosure, 'DISCLOSURE')
    expect(stateCharacter).not.toHaveProperty('profile')
    expect(stateCharacter).not.toHaveProperty('motivation_anchors')
    expectBoundedList(canonInput.canon[0].tags, 'CANON_TAG')
  })

  it('bounds characters, selects one recent state each, truncates text, and caps Canon at 20', async () => {
    const root = await project()
    const characterIds = Array.from({ length: 14 }, (_, index) => `character-${index}`)
    const longProfile = `PROFILE_SENTINEL ${'p'.repeat(2_500)}`
    const longAnchor = `ANCHOR_SENTINEL ${'a'.repeat(2_500)}`
    const motivationAnchors = [
      longAnchor,
      ...Array.from({ length: 21 }, (_, index) => `motivation-anchor-${index}`)
    ]
    await Promise.all(
      characterIds.map((id, index) =>
        writeTestDoc(
          root,
          'character',
          id,
          {
            role: 'supporting',
            ...(index === 0 ? { motivation_anchors: motivationAnchors } : {})
          },
          index === 0 ? longProfile : 'Supporting profile.'
        )
      )
    )
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
      characters: Array<{
        id: string
        motivation_anchors: string[]
        profile: string
        recent_state: { id: string } | null
      }>
    }
    const stateInput = inputFromPrompt(
      prompts.find((prompt) => kindFromPrompt(prompt) === 'state-drift')!
    ) as { characters: Array<{ recent_state: { id: string } | null }> }
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
    expect(oocInput.characters[0].profile).toHaveLength(2_001)
    expect(oocInput.characters[0].profile.endsWith('…')).toBe(true)
    expect(oocInput.characters[0].motivation_anchors).toHaveLength(20)
    expect(oocInput.characters[0].motivation_anchors[0]).toHaveLength(2_001)
    expect(oocInput.characters[0].motivation_anchors[0].endsWith('…')).toBe(true)
    expect(oocInput.characters[0].motivation_anchors).not.toContain('motivation-anchor-20')
    expect(stateInput.characters[0].recent_state?.id).toBe('state-recent')
    expect(stateInput.characters[0]).not.toHaveProperty('profile')
    expect(stateInput.characters[0]).not.toHaveProperty('motivation_anchors')
    expect(JSON.stringify(stateInput)).not.toContain('PROFILE_SENTINEL')
    expect(JSON.stringify(stateInput)).not.toContain('ANCHOR_SENTINEL')
    expect(canonInput.canon).toHaveLength(20)
    expect(canonInput.canon.map((item) => item.id)).not.toContain('canon-deprecated')
    expect(canonInput.canon.every((item) => item.content.length <= 2_001)).toBe(true)
    expect(canonInput).not.toHaveProperty('characters')
    expect(JSON.stringify(canonInput)).not.toContain('PROFILE_SENTINEL')
    expect(JSON.stringify(canonInput)).not.toContain('ANCHOR_SENTINEL')
  })

  it('keeps resource and fallback prompts aligned on live-quality guardrails', async () => {
    const cases = [
      {
        kind: 'ooc' as const,
        phrases: [
          'is transient and is not a hard personality guardrail',
          'stable characterization',
          'Scope is only behavior, dialogue, motivation, or decision',
          'Chronology, wounds, possessions, and Canon contradictions',
          'belong to other checks',
          'unless they themselves demonstrate',
          'trust established on page',
          'narrated causal transitions',
          'motivation_anchors'
        ]
      },
      {
        kind: 'state-drift' as const,
        phrases: [
          'transient earlier snapshot',
          'character state only, not world chronology or Canon',
          'affirmative before-and-after evidence',
          'Absence or non-mention',
          'not a relationship delta',
          'Internal deliberation',
          'new information',
          'narrated causal transitions',
          'emotion or motivation changes',
          'not drift'
        ]
      },
      {
        kind: 'canon-conflict' as const,
        phrases: [
          'objective scene or world assertions',
          "character's beliefs, memories",
          'predictions',
          'not scene or world assertions',
          'direct contradictions',
          'bounded Canon',
          'external historical knowledge'
        ]
      }
    ]

    for (const { kind, phrases } of cases) {
      const source = await loadSemanticPromptTemplate(kind)
      const fallback = await loadSemanticPromptTemplate(
        kind,
        new URL(`./prompts/does-not-exist-${kind}.md`, import.meta.url)
      )

      for (const prompt of [source, fallback]) {
        expect(prompt).toContain('Return JSON only')
        expect(prompt).toContain('at most 5 independent issues')
        expect(prompt).toContain('one short sentence')
        expect(prompt).toContain('Omit explained, consistent, or reassuring candidates')
        expect(prompt).toContain('Never mark reassurance, consistency, or an explained change')
        expect(prompt).toContain('is_issue')
        expect(prompt).toContain('false')
        expect(prompt).toContain('"is_issue":true')
        for (const phrase of phrases) expect(prompt).toContain(phrase)
      }
    }
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
