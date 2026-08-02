import { afterAll, afterEach, describe, expect, it } from 'vitest'
import type { CheckReport } from './index.js'
import { checkOutline, checkScene, checkTarget, formatCheckReport } from './index.js'
import { createTestProject, removeTestProject, writeTestDoc } from './fixtures/test-project.js'

const ALL_ISSUE_CODES = [
  'arc-missing-cast',
  'arc-missing-cast-lock',
  'arc-missing-conflict-ladder',
  'arc-missing-events',
  'arc-missing-foreshadowing',
  'book-missing-reader-promise',
  'chapter-hook-style',
  'chapter-missing-change',
  'chapter-missing-conflict',
  'chapter-missing-goal',
  'chapter-missing-hook',
  'chapter-missing-scene',
  'chapter-missing-timeline',
  'chapter-outline-empty',
  'character-location-differs',
  'flashback-mutates-main-chain',
  'foreshadowing-possibly-resolved-twice',
  'foreshadowing-resolved-before-planted',
  'missing-canon',
  'missing-character',
  'missing-character-state',
  'missing-foreshadowing',
  'missing-location',
  'missing-locations',
  'missing-pov',
  'missing-section',
  'missing-strategy',
  'missing-timeline-node',
  'missing-volume-outline',
  'missing-world-entry',
  'open-issue-due',
  'route-not-found',
  'strategy-in-canon',
  'timeline-chain-gaps',
  'timeline-next-missing',
  'timeline-previous-missing',
  'volume-missing-characters',
  'volume-missing-event-chain',
  'volume-missing-goal',
  'volume-missing-timeline',
  'volume-thin-writer-cycles',
  'world-entry-after-valid-until',
  'world-entry-before-valid-from'
] as const

const assertedIssueCodes = new Set<string>()
const projectRoots: string[] = []

async function project(): Promise<string> {
  const root = await createTestProject()
  projectRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(projectRoots.splice(0).map(removeTestProject))
})

afterAll(() => {
  expect([...assertedIssueCodes].sort()).toEqual([...ALL_ISSUE_CODES].sort())
})

function codes(report: CheckReport): string[] {
  return report.issues.map((issue) => issue.code)
}

function expectCodes(report: CheckReport, ...expected: string[]): void {
  const actual = codes(report)
  for (const code of expected) {
    expect(actual, `expected issue code ${code}`).toContain(code)
    assertedIssueCodes.add(code)
  }
}

function expectNoCodes(report: CheckReport, ...unexpected: string[]): void {
  const actual = codes(report)
  for (const code of unexpected) expect(actual, `unexpected issue code ${code}`).not.toContain(code)
}

async function outline(
  root: string,
  id: string,
  level: 'book' | 'volume' | 'act' | 'arc' | 'chapter' | 'section',
  fields: Record<string, unknown> = {},
  content = 'Outline body.'
): Promise<void> {
  await writeTestDoc(root, 'outline', id, { level, ...fields }, content)
}

async function scene(
  root: string,
  id: string,
  fields: Record<string, unknown> = {},
  content = 'Scene body.'
): Promise<void> {
  await writeTestDoc(
    root,
    'scene',
    id,
    {
      section: 'section-main',
      timeline_node: 'event-main',
      location: 'location-main',
      pov: 'character-main',
      ...fields
    },
    content
  )
}

async function addSceneDependencies(root: string, characterLocation = 'location-main'): Promise<void> {
  await Promise.all([
    outline(root, 'section-main', 'section'),
    writeTestDoc(root, 'timeline_event', 'event-main'),
    writeTestDoc(root, 'location', 'location-main'),
    writeTestDoc(root, 'character', 'character-main', {
      scene_state: { current_location: characterLocation }
    })
  ])
}

async function addOutlineGlobals(root: string): Promise<void> {
  await Promise.all([
    writeTestDoc(root, 'canon', 'canon-main'),
    writeTestDoc(root, 'location', 'location-main'),
    writeTestDoc(root, 'strategy', 'strategy-main')
  ])
}

describe('outline checks', () => {
  it('reports global, book, and missing ledger requirements', async () => {
    const root = await project()
    await outline(root, 'book-empty', 'book', { related_foreshadowing: ['fb-missing'] }, '')

    const report = await checkOutline(root, 'book-empty')

    expectCodes(
      report,
      'missing-canon',
      'missing-locations',
      'missing-strategy',
      'book-missing-reader-promise',
      'missing-volume-outline',
      'missing-foreshadowing'
    )
  })

  it('detects strategy content stored in Canon and isolated timeline nodes', async () => {
    const root = await project()
    await Promise.all([
      writeTestDoc(root, 'canon', 'canon-style', { title: '文风原则' }),
      writeTestDoc(root, 'location', 'location-main'),
      writeTestDoc(root, 'strategy', 'strategy-main'),
      writeTestDoc(root, 'timeline_event', 'event-one'),
      writeTestDoc(root, 'timeline_event', 'event-two'),
      outline(root, 'book-main', 'book', { reader_promise: 'A promise.' }),
      outline(root, 'volume-main', 'volume')
    ])

    const report = await checkOutline(root, 'book-main')

    expectCodes(report, 'strategy-in-canon', 'timeline-chain-gaps')
    expectNoCodes(
      report,
      'missing-canon',
      'missing-locations',
      'missing-strategy',
      'book-missing-reader-promise',
      'missing-volume-outline'
    )
  })

  it('accepts a complete book and linked timeline', async () => {
    const root = await project()
    await Promise.all([
      addOutlineGlobals(root),
      writeTestDoc(root, 'timeline_event', 'event-one', { next: 'event-two' }),
      writeTestDoc(root, 'timeline_event', 'event-two', { previous: 'event-one' }),
      outline(root, 'book-main', 'book', { reader_promise: 'A promise.' }),
      outline(root, 'volume-main', 'volume')
    ])

    const report = await checkOutline(root, 'book-main')

    expectNoCodes(
      report,
      'missing-canon',
      'missing-locations',
      'missing-strategy',
      'timeline-chain-gaps',
      'book-missing-reader-promise',
      'missing-volume-outline'
    )
  })

  it('reports every incomplete volume rule', async () => {
    const root = await project()
    await outline(root, 'volume-empty', 'volume')

    const report = await checkOutline(root, 'volume-empty')

    expectCodes(
      report,
      'volume-missing-goal',
      'volume-missing-event-chain',
      'volume-thin-writer-cycles',
      'volume-missing-timeline',
      'volume-missing-characters',
      'missing-character-state'
    )
  })

  it('accepts a complete volume with a state snapshot', async () => {
    const root = await project()
    await Promise.all([
      addOutlineGlobals(root),
      outline(root, 'volume-main', 'volume', {
        volume_goal: 'Reach the capital.',
        event_chain: ['arrival'],
        writer_cycles: ['desire', 'pressure', 'growth'],
        related_timeline: ['event-main'],
        related_characters: ['character-main']
      }),
      writeTestDoc(root, 'character_state', 'state-volume', {
        character: 'character-main',
        scope_type: 'outline',
        scope_id: 'volume-main'
      })
    ])

    const report = await checkOutline(root, 'volume-main')

    expectNoCodes(
      report,
      'volume-missing-goal',
      'volume-missing-event-chain',
      'volume-thin-writer-cycles',
      'volume-missing-timeline',
      'volume-missing-characters',
      'missing-character-state'
    )
  })

  it('reports every incomplete arc rule', async () => {
    const root = await project()
    await outline(root, 'arc-empty', 'arc')

    const report = await checkOutline(root, 'arc-empty')

    expectCodes(
      report,
      'arc-missing-conflict-ladder',
      'arc-missing-cast-lock',
      'arc-missing-events',
      'arc-missing-cast',
      'arc-missing-foreshadowing',
      'missing-character-state'
    )
  })

  it('accepts a complete arc with existing foreshadowing and state', async () => {
    const root = await project()
    await Promise.all([
      addOutlineGlobals(root),
      writeTestDoc(root, 'foreshadowing', 'fb-arc'),
      outline(root, 'arc-main', 'arc', {
        conflict_ladder: ['pressure'],
        cast_lock: ['character-main'],
        related_events: ['event-main'],
        related_characters: ['character-main'],
        related_foreshadowing: ['fb-arc']
      }),
      writeTestDoc(root, 'character_state', 'state-arc', {
        character: 'character-main',
        scope_type: 'outline',
        scope_id: 'arc-main'
      })
    ])

    const report = await checkOutline(root, 'arc-main')

    expectNoCodes(
      report,
      'arc-missing-conflict-ladder',
      'arc-missing-cast-lock',
      'arc-missing-events',
      'arc-missing-cast',
      'arc-missing-foreshadowing',
      'missing-character-state',
      'missing-foreshadowing'
    )
  })

  it('reports every incomplete chapter rule', async () => {
    const root = await project()
    await outline(root, 'chapter-empty', 'chapter', {}, '')

    const report = await checkOutline(root, 'chapter-empty')

    expectCodes(
      report,
      'chapter-missing-goal',
      'chapter-missing-conflict',
      'chapter-missing-change',
      'chapter-missing-hook',
      'chapter-missing-scene',
      'chapter-outline-empty',
      'chapter-missing-timeline',
      'missing-character-state'
    )
  })

  it('accepts a complete chapter with a bound scene and state', async () => {
    const root = await project()
    await Promise.all([
      addOutlineGlobals(root),
      outline(root, 'chapter-main', 'chapter', {
        chapter_goal: 'Enter the council.',
        chapter_conflict: 'The gate is barred.',
        chapter_change: 'The council admits the hero.',
        ending_hook: 'A sealed letter arrives.'
      }),
      scene(root, 'scene-chapter', { section: 'chapter-main' }),
      writeTestDoc(root, 'character_state', 'state-chapter', {
        character: 'character-main',
        scope_type: 'outline',
        scope_id: 'chapter-main'
      })
    ])

    const report = await checkOutline(root, 'chapter-main')

    expectNoCodes(
      report,
      'chapter-missing-goal',
      'chapter-missing-conflict',
      'chapter-missing-change',
      'chapter-missing-hook',
      'chapter-missing-scene',
      'chapter-outline-empty',
      'chapter-missing-timeline',
      'missing-character-state'
    )
  })
})

describe('scene reference and timeline checks', () => {
  it('reports every missing direct reference', async () => {
    const root = await project()
    await scene(root, 'scene-missing', {
      section: 'section-missing',
      timeline_node: 'event-missing',
      location: 'location-missing',
      pov: 'character-missing',
      characters: ['character-also-missing'],
      foreshadowing_planted: ['fb-missing'],
      world_entries_used: ['world-missing']
    })

    const report = await checkScene(root, 'scene-missing')

    expectCodes(
      report,
      'missing-section',
      'missing-timeline-node',
      'missing-location',
      'missing-pov',
      'missing-character',
      'missing-foreshadowing',
      'missing-world-entry'
    )
  })

  it('accepts existing direct references and a co-located character', async () => {
    const root = await project()
    await addSceneDependencies(root)
    await scene(root, 'scene-valid', { characters: ['character-main', 'character-main'] })

    const report = await checkScene(root, 'scene-valid')

    expectNoCodes(
      report,
      'missing-section',
      'missing-timeline-node',
      'missing-location',
      'missing-pov',
      'missing-character',
      'character-location-differs'
    )
  })

  it('reports broken previous/next links and a flashback on the main chain', async () => {
    const root = await project()
    await Promise.all([
      outline(root, 'section-main', 'section'),
      writeTestDoc(root, 'location', 'location-main'),
      writeTestDoc(root, 'character', 'character-main'),
      writeTestDoc(root, 'timeline_event', 'event-main', {
        previous: 'event-missing-previous',
        next: 'event-missing-next',
        flashback_reference: 'event-missing-previous'
      })
    ])
    await scene(root, 'scene-timeline')

    const report = await checkScene(root, 'scene-timeline')

    expectCodes(report, 'timeline-previous-missing', 'timeline-next-missing', 'flashback-mutates-main-chain')
  })

  it('accepts valid previous/next links and a separate flashback reference', async () => {
    const root = await project()
    await Promise.all([
      outline(root, 'section-main', 'section'),
      writeTestDoc(root, 'location', 'location-main'),
      writeTestDoc(root, 'character', 'character-main'),
      writeTestDoc(root, 'timeline_event', 'event-previous', { next: 'event-main' }),
      writeTestDoc(root, 'timeline_event', 'event-main', {
        previous: 'event-previous',
        next: 'event-next',
        flashback_reference: 'event-flashback'
      }),
      writeTestDoc(root, 'timeline_event', 'event-next', { previous: 'event-main' })
    ])
    await scene(root, 'scene-timeline-valid')

    const report = await checkScene(root, 'scene-timeline-valid')

    expectNoCodes(
      report,
      'timeline-previous-missing',
      'timeline-next-missing',
      'flashback-mutates-main-chain'
    )
  })
})

describe('scene route checks', () => {
  it.each([
    ['forward', 'location-previous', 'location-main', false],
    ['reverse', 'location-main', 'location-previous', false],
    ['missing', null, null, true]
  ] as const)('handles a %s route', async (_label, from, to, shouldReport) => {
    const root = await project()
    await addSceneDependencies(root)
    await writeTestDoc(root, 'location', 'location-previous')
    await scene(root, 'scene-previous', { location: 'location-previous' })
    await scene(root, 'scene-current', { previous_scene: 'scene-previous' })
    if (from && to) await writeTestDoc(root, 'route', `route-${_label}`, { from, to })

    const report = await checkScene(root, 'scene-current')

    if (shouldReport) expectCodes(report, 'route-not-found')
    else expectNoCodes(report, 'route-not-found')
  })

  it('skips route lookup without a usable previous scene', async () => {
    const root = await project()
    await addSceneDependencies(root)
    await scene(root, 'scene-no-previous')
    await scene(root, 'scene-missing-previous', { previous_scene: 'scene-does-not-exist' })
    await scene(root, 'scene-same-place-previous')
    await scene(root, 'scene-same-place', { previous_scene: 'scene-same-place-previous' })

    for (const id of ['scene-no-previous', 'scene-missing-previous', 'scene-same-place']) {
      expectNoCodes(await checkScene(root, id), 'route-not-found')
    }
  })
})

describe('scene semantic ledger checks', () => {
  it('reports a character whose tracked location differs', async () => {
    const root = await project()
    await addSceneDependencies(root, 'location-previous')
    await writeTestDoc(root, 'location', 'location-previous')
    await scene(root, 'scene-location', { characters: ['character-main'] })

    const report = await checkScene(root, 'scene-location')

    expectCodes(report, 'character-location-differs')
    expect(report.issues.find((issue) => issue.code === 'character-location-differs')?.message).toContain(
      'location-main'
    )
  })

  it('reports resolving unplanted and already resolved foreshadowing', async () => {
    const root = await project()
    await addSceneDependencies(root)
    await Promise.all([
      writeTestDoc(root, 'foreshadowing', 'fb-planned', { state: 'planned' }),
      writeTestDoc(root, 'foreshadowing', 'fb-resolved', { state: 'resolved' })
    ])
    await scene(root, 'scene-foreshadowing', {
      foreshadowing_resolved: ['fb-planned', 'fb-resolved']
    })

    const report = await checkScene(root, 'scene-foreshadowing')

    expectCodes(report, 'foreshadowing-resolved-before-planted', 'foreshadowing-possibly-resolved-twice')
  })

  it('accepts resolving previously planted foreshadowing', async () => {
    const root = await project()
    await addSceneDependencies(root)
    await writeTestDoc(root, 'foreshadowing', 'fb-planted', {
      state: 'planted',
      planted_at: 'scene-earlier'
    })
    await scene(root, 'scene-foreshadowing-valid', {
      foreshadowing_resolved: ['fb-planted']
    })

    const report = await checkScene(root, 'scene-foreshadowing-valid')

    expectNoCodes(
      report,
      'missing-foreshadowing',
      'foreshadowing-resolved-before-planted',
      'foreshadowing-possibly-resolved-twice'
    )
  })

  it('reports world entries used before, after, or without a ledger record', async () => {
    const root = await project()
    await addSceneDependencies(root)
    await Promise.all([
      writeTestDoc(root, 'world_entry', 'world-too-early', { valid_from: '1450' }),
      writeTestDoc(root, 'world_entry', 'world-too-late', { valid_until: '1448' })
    ])
    await scene(root, 'scene-world', {
      world_time: 'Autumn 1449',
      world_entries_used: ['world-too-early', 'world-too-late', 'world-missing']
    })

    const report = await checkScene(root, 'scene-world')

    expectCodes(
      report,
      'world-entry-before-valid-from',
      'world-entry-after-valid-until',
      'missing-world-entry'
    )
  })

  it('accepts world entries inside or without a numeric validity window', async () => {
    const root = await project()
    await addSceneDependencies(root)
    await Promise.all([
      writeTestDoc(root, 'world_entry', 'world-valid', {
        valid_from: '1400',
        valid_until: '1500'
      }),
      writeTestDoc(root, 'world_entry', 'world-undated')
    ])
    await scene(root, 'scene-world-valid', {
      world_time: 'Autumn 1449',
      world_entries_used: ['world-valid', 'world-undated']
    })

    const report = await checkScene(root, 'scene-world-valid')

    expectNoCodes(
      report,
      'missing-world-entry',
      'world-entry-before-valid-from',
      'world-entry-after-valid-until'
    )
  })

  it('reports due open issues with priority severity and ignores future or closed issues', async () => {
    const root = await project()
    await addSceneDependencies(root)
    await Promise.all([
      writeTestDoc(root, 'issue', 'issue-high', { priority: 'high', state: 'open', due: 'Chapter 10' }),
      writeTestDoc(root, 'issue', 'issue-medium', { priority: 'medium', state: 'open', due: 'Chapter 9' }),
      writeTestDoc(root, 'issue', 'issue-future', { state: 'open', due: 'Chapter 11' }),
      writeTestDoc(root, 'issue', 'issue-closed', { state: 'resolved', due: 'Chapter 1' }),
      writeTestDoc(root, 'issue', 'issue-undated', { state: 'open', due: 'eventually' })
    ])
    await scene(root, 'scene-issues', { chapter_number: 'Chapter 10' })

    const report = await checkScene(root, 'scene-issues')
    const dueIssues = report.issues.filter((issue) => issue.code === 'open-issue-due')

    expectCodes(report, 'open-issue-due')
    expect(dueIssues).toEqual([
      expect.objectContaining({ severity: 'error', message: expect.stringContaining('issue-high') }),
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('issue-medium') })
    ])
  })

  it('skips due checks when the scene has no numeric chapter', async () => {
    const root = await project()
    await addSceneDependencies(root)
    await writeTestDoc(root, 'issue', 'issue-due', { state: 'open', due: 'Chapter 1' })
    await scene(root, 'scene-no-chapter')

    expectNoCodes(await checkScene(root, 'scene-no-chapter'), 'open-issue-due')
  })
})

describe('chapter hook style', () => {
  it.each([
    ['weak enabled hook', true, 'The door opened', true],
    ['strong enabled hook', true, '门忽然开了。', false],
    ['disabled hook', false, 'The door opened', false]
  ] as const)('%s', async (_label, chapterHook, content, shouldReport) => {
    const root = await project()
    await addSceneDependencies(root)
    await scene(root, 'scene-hook', { chapter_hook: chapterHook }, content)

    const report = await checkScene(root, 'scene-hook')

    if (shouldReport) expectCodes(report, 'chapter-hook-style')
    else expectNoCodes(report, 'chapter-hook-style')
  })
})

describe('public entry points and formatting', () => {
  it('dispatches scene and outline targets', async () => {
    const root = await project()
    await addSceneDependencies(root)
    await scene(root, 'scene-target')

    const sceneReport = await checkTarget(root, { type: 'scene', id: 'scene-target' })
    const outlineReport = await checkTarget(root, { type: 'outline', id: 'section-main' })

    expect(sceneReport).toMatchObject({
      scene_id: 'scene-target',
      target_type: 'scene',
      target_id: 'scene-target'
    })
    expect(outlineReport).toMatchObject({
      scene_id: 'section-main',
      target_type: 'outline',
      target_id: 'section-main'
    })
  })

  it('formats empty and populated reports', () => {
    const empty = formatCheckReport({
      scene_id: 'scene-empty',
      generated_at: '2026-08-02T00:00:00.000Z',
      issues: []
    })
    const populated = formatCheckReport({
      scene_id: 'scene-issue',
      generated_at: '2026-08-02T00:00:00.000Z',
      issues: [
        {
          severity: 'warning',
          code: 'sample-code',
          message: 'Sample message.',
          evidence: 'Quoted scene evidence.',
          related_ids: ['canon-main', 'character-main']
        }
      ]
    })

    expect(empty).toContain('# Check Report: scene-empty')
    expect(empty).toContain('issues: 0')
    expect(empty).toContain('No deterministic issues found.')
    expect(empty).toContain('## AI-Assisted Checks')
    expect(empty).toContain('semantic_status: not_requested')
    expect(empty).toContain('status: not_requested')
    expect(empty).not.toContain('pending')
    expect(populated).toContain('# Check Report: scene-issue')
    expect(populated).toContain('issues: 1')
    expect(populated).toContain('- [warning] sample-code: Sample message.')
    expect(populated).toContain('  - evidence: Quoted scene evidence.')
    expect(populated).toContain('  - related_ids: canon-main, character-main')
    expect(populated).not.toContain('No deterministic issues found.')
  })
})
