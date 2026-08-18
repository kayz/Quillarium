import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assembleContextPacket, renderContextPacket } from './context.js'
import {
  appendTimelineEvent,
  createCanon,
  createCharacter,
  createCharacterState,
  createChapterProse,
  createForeshadowing,
  createIssue,
  createLocation,
  createOutline,
  createPattern,
  createReference,
  createScene,
  createStrategy,
  createWorldEntry
} from './documents.js'
import { createProjectAt } from './project.js'
import type { ContextTokenCounter } from './tokenization.js'

const temporaryVaults: string[] = []
let projectSequence = 0

const characterCounter: ContextTokenCounter = {
  descriptor: {
    id: 'test-character-counter',
    provider: 'test',
    model: 'character-count',
    exact: true,
    source_revision: 'fixture',
    source_sha256: 'fixture-source',
    vocabulary_sha256: 'fixture-vocabulary'
  },
  count: (text) => [...text].length,
  truncate: (text, maximum, strategy) => {
    const characters = [...text]
    const kept = strategy === 'head' ? characters.slice(0, maximum) : characters.slice(-maximum)
    return {
      text: kept.join(''),
      token_count: kept.length,
      original_token_count: characters.length,
      truncated: kept.length < characters.length
    }
  }
}

afterEach(async () => {
  await Promise.all(temporaryVaults.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-context-'))
  temporaryVaults.push(base)
  const id = `context-fixture-${++projectSequence}`
  return (
    await createProjectAt(path.join(base, 'projects', id), { id, title: 'Context Fixture', genre: 'test' })
  ).root
}

async function createChapterHierarchy(
  root: string,
  chapterId: string,
  title: string,
  partial: Parameters<typeof createOutline>[3] = {}
): Promise<void> {
  const bookId = `${chapterId}-book`
  const volumeId = `${chapterId}-volume`
  const partId = `${chapterId}-part`
  await createOutline(root, 'book', 'Book', { id: bookId })
  await createOutline(root, 'volume', 'Volume', { id: volumeId, parent: bookId })
  await createOutline(root, 'part', 'Part', { id: partId, parent: volumeId })
  await createOutline(root, 'chapter', title, { ...partial, id: chapterId, parent: partId })
}

describe('context selection', () => {
  it('selects accepted prose in persisted story order instead of timestamps or titles', async () => {
    const root = await project()
    await createOutline(root, 'book', 'Book', { id: 'ordered-book' })
    await createOutline(root, 'volume', 'Volume', { id: 'ordered-volume', parent: 'ordered-book' })
    await createOutline(root, 'part', 'Part', { id: 'ordered-part', parent: 'ordered-volume' })
    for (const [id, order] of [
      ['chapter-third', 2],
      ['chapter-first', 0],
      ['chapter-second', 1],
      ['chapter-current', 3]
    ] as const) {
      await createOutline(root, 'chapter', id, { id, parent: 'ordered-part', order })
    }
    await createChapterProse(
      root,
      'chapter-third',
      'Third prose',
      { id: 'prose-third', status: 'final', finalized_at: '2020-01-01T00:00:00.000Z' },
      'THIRD'
    )
    await createChapterProse(
      root,
      'chapter-first',
      'First prose',
      { id: 'prose-first', status: 'final', finalized_at: '2030-01-01T00:00:00.000Z' },
      'FIRST'
    )
    await createChapterProse(
      root,
      'chapter-second',
      'Second prose',
      { id: 'prose-second', status: 'final', finalized_at: '2010-01-01T00:00:00.000Z' },
      'SECOND'
    )

    const packet = await assembleContextPacket(root, {
      type: 'outline',
      id: 'chapter-current'
    })
    expect(
      packet.prompt_blocks.filter((block) => block.kind === 'accepted_prose').map((block) => block.source.id)
    ).toEqual(['prose-first', 'prose-second', 'prose-third'])
  })

  it('combines inherited pins and explicit relations while exclusions always win', async () => {
    const root = await project()
    await createCanon(root, 'Active Canon', 'Active constraint.', { id: 'canon-active' })
    await createCanon(root, 'Deprecated Canon', 'Old constraint.', {
      id: 'canon-deprecated',
      status: 'deprecated'
    })
    await createStrategy(root, 'Kept Strategy', { id: 'strategy-kept' }, 'Keep this strategy.')
    await createStrategy(root, 'Excluded Strategy', { id: 'strategy-excluded' }, 'Exclude this strategy.')
    await createPattern(root, 'Pinned Pattern', { id: 'pattern-pinned' }, 'Pinned style guidance.')
    await createPattern(root, 'Ignored Pattern', { id: 'pattern-ignored' }, 'Unrelated style guidance.')
    await createLocation(root, 'Selected Location', { id: 'location-selected' })
    await createCharacter(root, 'Included Character', { id: 'character-included' })
    await createCharacter(root, 'Excluded Character', { id: 'character-excluded' })
    await appendTimelineEvent(root, 'Selected Event', {
      id: 'event-selected',
      location: 'location-selected',
      characters: ['character-included', 'character-excluded']
    })
    await createWorldEntry(root, 'Pinned World', { id: 'world-pinned' }, 'Pinned lore.')
    await createWorldEntry(root, 'Explicit World', { id: 'world-explicit' }, 'Explicit lore.')
    await createWorldEntry(root, 'Excluded World', { id: 'world-excluded' }, 'Excluded lore.')
    await createForeshadowing(root, 'Selected Foreshadowing', {
      id: 'foreshadowing-selected',
      related_characters: ['character-included']
    })
    await createReference(root, 'Pinned Reference', { id: 'reference-pinned' }, 'Pinned source.')
    await createIssue(root, 'Related Issue', {
      id: 'issue-related',
      related_docs: ['chapter-main']
    })
    await createOutline(root, 'book', 'Book', {
      id: 'book-main',
      context_pins: ['world-pinned'],
      context_exclusions: ['character-excluded']
    })
    await createOutline(root, 'volume', 'Volume', {
      id: 'volume-main',
      parent: 'book-main'
    })
    await createOutline(root, 'part', 'Part', {
      id: 'part-main',
      parent: 'volume-main'
    })
    await createOutline(root, 'chapter', 'Chapter', {
      id: 'chapter-main',
      parent: 'part-main',
      related_timeline: ['event-selected'],
      related_characters: ['character-included', 'character-excluded'],
      related_foreshadowing: ['foreshadowing-selected']
    })
    await createCharacterState(root, 'Included State', {
      id: 'state-included',
      character: 'character-included',
      scope_type: 'outline',
      scope_id: 'chapter-main'
    })
    await createScene(root, 'Target Scene', {
      id: 'scene-target',
      section: 'chapter-main',
      timeline_node: 'event-selected',
      location: 'location-selected',
      pov: 'character-included',
      characters: ['character-excluded'],
      context_pins: ['pattern-pinned', 'reference-pinned'],
      context_exclusions: ['strategy-excluded', 'world-excluded'],
      world_entries_used: ['world-explicit', 'world-excluded'],
      foreshadowing_planted: ['foreshadowing-selected']
    })

    const packet = await assembleContextPacket(root, { type: 'scene', id: 'scene-target' })

    expect(packet.outline_chain.map((item) => item.data.id)).toEqual([
      'book-main',
      'volume-main',
      'part-main',
      'chapter-main'
    ])
    expect(packet.canon.map((item) => item.data.id)).toEqual(['canon-active'])
    expect(packet.strategies.map((item) => item.data.id)).toEqual(['strategy-kept'])
    expect(packet.patterns.map((item) => item.data.id)).toContain('pattern-pinned')
    expect(packet.patterns.map((item) => item.data.id)).not.toContain('pattern-ignored')
    expect(packet.timeline.map((item) => item.data.id)).toContain('event-selected')
    expect(packet.characters.map((item) => item.data.id)).toContain('character-included')
    expect(packet.characters.map((item) => item.data.id)).not.toContain('character-excluded')
    expect(packet.character_states.map((item) => item.data.id)).toContain('state-included')
    expect(packet.locations.map((item) => item.data.id)).toContain('location-selected')
    expect(packet.world_entries.map((item) => item.data.id)).toEqual(
      expect.arrayContaining(['world-pinned', 'world-explicit'])
    )
    expect(packet.world_entries.map((item) => item.data.id)).not.toContain('world-excluded')
    expect(packet.foreshadowing.map((item) => item.data.id)).toContain('foreshadowing-selected')
    expect(packet.issues.map((item) => item.data.id)).toContain('issue-related')
    expect(packet.included_ids).not.toContain('reference-pinned')
    expect(packet.excluded_ids).toEqual(
      expect.arrayContaining(['character-excluded', 'strategy-excluded', 'world-excluded'])
    )
    expect(packet.included_ids).not.toEqual(
      expect.arrayContaining(['character-excluded', 'strategy-excluded', 'world-excluded'])
    )
  })

  it('infers relevant documents from focus tokens, timeline cast, and character links', async () => {
    const root = await project()
    await createChapterHierarchy(root, 'chapter-meteor', 'Meteor Arrival')
    await createLocation(root, 'Observatory', { id: 'location-main' })
    await createCharacter(root, 'Observer', { id: 'character-main' })
    await createCharacter(root, 'Hidden Witness', { id: 'character-witness' })
    await appendTimelineEvent(root, 'Meteor Event', {
      id: 'event-main',
      location: 'location-main',
      characters: ['character-witness']
    })
    await createPattern(root, 'Meteor Rhythm', { id: 'pattern-meteor' }, 'Meteor pacing pattern.')
    await createWorldEntry(
      root,
      'Sky Omen',
      { id: 'world-meteor', triggers: ['meteor'] },
      'An omen in the sky.'
    )
    await createForeshadowing(root, 'Witness Secret', {
      id: 'foreshadowing-witness',
      related_characters: ['character-witness']
    })
    await createIssue(root, 'Meteor Question', { id: 'issue-meteor' }, 'Who saw the meteor?')
    await createReference(root, 'Meteor Chronicle', { id: 'reference-meteor' }, 'Meteor records.')
    await createScene(
      root,
      'Meteor Scene',
      {
        id: 'scene-meteor',
        section: 'chapter-meteor',
        timeline_node: 'event-main',
        location: 'location-main',
        pov: 'character-main'
      },
      'A meteor crosses the night sky.'
    )

    const packet = await assembleContextPacket(root, { type: 'scene', id: 'scene-meteor' })

    expect(packet.characters.map((item) => item.data.id)).toEqual(
      expect.arrayContaining(['character-main', 'character-witness'])
    )
    expect(packet.patterns.map((item) => item.data.id)).toContain('pattern-meteor')
    expect(packet.world_entries.map((item) => item.data.id)).toContain('world-meteor')
    expect(packet.foreshadowing.map((item) => item.data.id)).toContain('foreshadowing-witness')
    expect(packet.issues.map((item) => item.data.id)).toContain('issue-meteor')
    expect(packet.included_ids).not.toContain('reference-meteor')
  })

  it('activates world knowledge and author reminders from the current prose keywords', async () => {
    const root = await project()
    await createChapterHierarchy(root, 'chapter-seal', 'The sealed dispatch')
    await createLocation(root, 'Archive', { id: 'location-archive' })
    await createCharacter(root, 'Clerk', { id: 'character-clerk' })
    await appendTimelineEvent(root, 'Autumn archive shift', {
      id: 'event-autumn',
      location: 'location-archive',
      characters: ['character-clerk']
    })
    await createWorldEntry(
      root,
      'Black ribbon protocol',
      { id: 'world-black-ribbon', triggers: ['black ribbon'], enabled: true },
      'A black ribbon marks a dispatch that may not be opened in public.'
    )
    await createForeshadowing(root, 'Broken wax', {
      id: 'foreshadow-broken-wax',
      trigger_conditions: [{ kind: 'keyword', target_id: '', keyword: 'black ribbon' }],
      reminder_window: 'before the archive closes'
    })
    await createScene(
      root,
      'The dispatch arrives',
      {
        id: 'scene-seal',
        section: 'chapter-seal',
        timeline_node: 'event-autumn',
        location: 'location-archive',
        pov: 'character-clerk'
      },
      'The clerk notices a black ribbon tied around the dispatch.'
    )

    const packet = await assembleContextPacket(root, { type: 'scene', id: 'scene-seal' })

    expect(packet.world_entries.map((item) => item.data.id)).toContain('world-black-ribbon')
    expect(packet.foreshadowing.map((item) => item.data.id)).toContain('foreshadow-broken-wax')
    expect(packet.warnings).toContain('伏笔提醒：Broken wax（建议处理窗口：before the archive closes）。')
  })

  it('uses the global token policy instead of a fixed per-type cap while retaining pins and exclusions', async () => {
    const root = await project()
    await createChapterHierarchy(root, 'chapter-main', 'Meteor Chapter', {
      context_pins: ['pattern-pinned'],
      context_exclusions: ['pattern-excluded']
    })
    await createLocation(root, 'Location', { id: 'location-main' })
    await createCharacter(root, 'Character', { id: 'character-main' })
    await appendTimelineEvent(root, 'Event', { id: 'event-main', location: 'location-main' })
    await Promise.all([
      createPattern(root, 'Pinned', { id: 'pattern-pinned' }, 'No focus match.'),
      createPattern(root, 'Explicit', { id: 'pattern-explicit' }, 'No focus match.'),
      createPattern(root, 'Excluded', { id: 'pattern-excluded' }, 'Meteor but excluded.'),
      ...Array.from({ length: 20 }, (_, index) =>
        createPattern(
          root,
          `Inferred ${index}`,
          { id: `pattern-inferred-${String(index).padStart(2, '0')}` },
          `Meteor guidance ${index}. ${'x'.repeat(500)}`
        )
      )
    ])
    await createScene(
      root,
      'Meteor Target',
      {
        id: 'scene-main',
        section: 'chapter-main',
        timeline_node: 'event-main',
        location: 'location-main',
        pov: 'character-main',
        related_patterns: ['pattern-pinned', 'pattern-explicit', 'pattern-excluded']
      },
      'Meteor focus text.'
    )

    const packet = await assembleContextPacket(root, { type: 'scene', id: 'scene-main' })
    const patternIds = packet.patterns.map((item) => item.data.id)
    const inferred = patternIds.filter((id) => id.startsWith('pattern-inferred-'))

    expect(patternIds).toHaveLength(22)
    expect(inferred).toHaveLength(20)
    expect(patternIds).toEqual(expect.arrayContaining(['pattern-pinned', 'pattern-explicit']))
    expect(patternIds).not.toContain('pattern-excluded')
    expect(new Set(patternIds).size).toBe(patternIds.length)
    expect(packet.included_ids.filter((id) => id.startsWith('pattern-'))).toHaveLength(22)
    expect(packet.context_trace.budget.used_tokens).toBeLessThanOrEqual(
      packet.context_trace.policy.token_budget
    )
    expect(packet.context_trace.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source_id: 'pattern-pinned', outcome: 'included' }),
        expect.objectContaining({
          source_id: 'pattern-excluded',
          outcome: 'excluded',
          reason: 'explicit project context exclusion'
        })
      ])
    )
  })

  it('expands document links and typed relations with a cycle-safe depth limit', async () => {
    const root = await project()
    await createOutline(root, 'book', 'Book', { id: 'book-links' })
    await createOutline(root, 'volume', 'Volume', { id: 'volume-links', parent: 'book-links' })
    await createOutline(root, 'part', 'Part', { id: 'part-links', parent: 'volume-links' })
    await createOutline(root, 'chapter', 'Chapter', {
      id: 'chapter-links',
      parent: 'part-links',
      world_entries_used: ['world-a']
    })
    await createWorldEntry(root, 'World A', { id: 'world-a' }, 'See [[world-b]].')
    await createWorldEntry(root, 'World B', {
      id: 'world-b',
      relations: [{ kind: 'related', target_id: 'world-c', note: 'second hop' }]
    })
    await createWorldEntry(root, 'World C', {
      id: 'world-c',
      relations: [{ kind: 'related', target_id: 'world-a', note: 'cycle' }]
    })

    const oneHop = await assembleContextPacket(
      root,
      { type: 'outline', id: 'chapter-links' },
      { policy: { max_recursion_depth: 1 } }
    )
    expect(oneHop.world_entries.map((item) => item.data.id)).toEqual(['world-a', 'world-b'])
    expect(oneHop.context_trace.candidates.reached_recursion_depth).toBe(1)
    expect(oneHop.context_trace.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_id: 'world-b',
          outcome: 'included',
          trigger_chain: expect.arrayContaining(['document-link:world-b'])
        }),
        expect.objectContaining({ source_id: 'world-c', outcome: 'excluded' })
      ])
    )

    const twoHops = await assembleContextPacket(
      root,
      { type: 'outline', id: 'chapter-links' },
      { policy: { max_recursion_depth: 2 } }
    )
    expect(twoHops.world_entries.map((item) => item.data.id)).toEqual(['world-a', 'world-b', 'world-c'])
    expect(twoHops.context_trace.candidates.reached_recursion_depth).toBe(2)
    expect(new Set(twoHops.context_trace.final_block_ids).size).toBe(
      twoHops.context_trace.final_block_ids.length
    )
  })

  it('resolves code and title wikilinks to stable IDs and records the resolution in ContextTrace', async () => {
    const root = await project()
    await createChapterHierarchy(root, 'chapter-resolved-links', 'Resolved links', {
      world_entries_used: ['world-source']
    })
    await createWorldEntry(
      root,
      'Source',
      {
        id: 'world-source',
        links: ['LORE-0077']
      },
      'Also see [[Unique title target|the target]].'
    )
    await createWorldEntry(root, 'Code target', {
      id: 'lore-0077',
      code: 'LORE-0077'
    })
    await createWorldEntry(root, 'Unique title target', { id: 'world-title-target' })

    const packet = await assembleContextPacket(
      root,
      { type: 'outline', id: 'chapter-resolved-links' },
      { policy: { max_recursion_depth: 1 } }
    )

    expect(packet.world_entries.map((item) => item.data.id)).toEqual([
      'lore-0077',
      'world-source',
      'world-title-target'
    ])
    expect(packet.context_trace.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_id: 'lore-0077',
          reference_resolutions: [
            expect.objectContaining({
              raw_reference: 'LORE-0077',
              resolved_target_id: 'lore-0077',
              matched_by: 'code',
              origin: 'structured_link'
            })
          ]
        }),
        expect.objectContaining({
          source_id: 'world-title-target',
          reference_resolutions: [
            expect.objectContaining({
              raw_reference: '[[Unique title target|the target]]',
              resolved_target_id: 'world-title-target',
              matched_by: 'title',
              origin: 'wikilink'
            })
          ]
        })
      ])
    )
  })

  it('does not activate an ambiguous title wikilink', async () => {
    const root = await project()
    await createChapterHierarchy(root, 'chapter-ambiguous-link', 'Ambiguous link', {
      world_entries_used: ['world-ambiguous-source']
    })
    await createWorldEntry(root, 'Source', { id: 'world-ambiguous-source' }, 'See [[Duplicate title]].')
    await createWorldEntry(root, 'Duplicate title', { id: 'world-duplicate-a' })
    await createWorldEntry(root, 'Duplicate title', { id: 'world-duplicate-b' })

    const packet = await assembleContextPacket(
      root,
      { type: 'outline', id: 'chapter-ambiguous-link' },
      { policy: { max_recursion_depth: 1 } }
    )

    expect(packet.world_entries.map((item) => item.data.id)).toEqual(['world-ambiguous-source'])
  })

  it('fails explicitly instead of dropping an atomic hard Canon block for lower authority material', async () => {
    const root = await project()
    await createChapterHierarchy(root, 'chapter-authority', 'Authority Chapter')
    await createCanon(root, 'Atomic Canon', 'x'.repeat(1_000), { id: 'canon-atomic', strength: 'hard' })

    await expect(
      assembleContextPacket(
        root,
        { type: 'outline', id: 'chapter-authority' },
        {
          token_counter: characterCounter,
          policy: {
            token_budget: 500,
            max_block_tokens: 2_000,
            min_truncated_block_tokens: 10
          }
        }
      )
    ).rejects.toMatchObject({ block_id: 'document:canon:canon-atomic', token_budget: 500 })
  })
})

describe('context rendering and warnings', () => {
  it('uses a timeline event whose Markdown chapter range covers the target chapter', async () => {
    const root = await project()
    await createCharacter(root, 'Opening POV', { id: 'character-opening' })
    await createCharacter(root, 'Later POV', { id: 'character-later' })
    await createLocation(root, 'Opening Room', { id: 'location-opening' })
    await appendTimelineEvent(
      root,
      'Opening Event',
      {
        id: 'event-opening',
        characters: ['Opening POV'],
        location: 'Opening Room',
        previous: null
      },
      '## Event\n关联章节: 1-3\n备注: 开篇'
    )
    await appendTimelineEvent(
      root,
      '第一章之后的事件',
      { id: 'event-later', characters: ['Later POV'], previous: null },
      '## Event\n关联章节: 4-6'
    )
    await createChapterHierarchy(root, 'chapter-opening', '第一章 初临', {
      order: 0,
      related_timeline: []
    })

    const packet = await assembleContextPacket(root, { type: 'outline', id: 'chapter-opening' })
    const rendered = renderContextPacket(packet)

    expect(packet.timeline.map((item) => item.data.id)).toEqual(['event-opening'])
    expect(packet.characters.map((item) => item.data.id)).toEqual(['character-opening'])
    expect(packet.locations.map((item) => item.data.id)).toEqual(['location-opening'])
    expect(packet.warnings).not.toContain('章缺少时间线绑定。')
    expect(rendered).toContain('### Opening Event')
    expect(rendered).toContain('关联章节: 1-3')
  })

  it('renders an outline target, terminates cyclic parent chains, and reports missing context', async () => {
    const root = await project()
    await createOutline(
      root,
      'volume',
      'Cyclic Volume',
      {
        id: 'volume-cycle',
        parent: 'chapter-cycle'
      },
      '',
      { placement: 'legacy-import' }
    )
    await createOutline(
      root,
      'chapter',
      'Cyclic Chapter',
      {
        id: 'chapter-cycle',
        parent: 'volume-cycle'
      },
      'Hand-written chapter outline.',
      { placement: 'legacy-import' }
    )

    const packet = await assembleContextPacket(root, { type: 'outline', id: 'chapter-cycle' })
    const rendered = renderContextPacket(packet)

    expect(packet.scene).toBeNull()
    expect(packet.outline_chain.map((item) => item.data.id)).toEqual(['volume-cycle', 'chapter-cycle'])
    expect(packet.warnings).toEqual(
      expect.arrayContaining([
        '缺地点：当前项目没有 location 文档，生成前需要从世界书或时间线补齐地点。',
        '缺场景/正文段落：当前项目还没有 scene 文档。',
        '人物状态不足：还没有 character_state 快照。',
        '缺叙事卡片：建议将文风、节奏、结构等规则整理为启用的叙事卡片。',
        '章缺少时间线绑定。',
        '章缺少相关人物绑定。'
      ])
    )
    expect(rendered).toContain('# Quillarium Context Packet: Cyclic Chapter')
    expect(rendered).toContain('### 卷: Cyclic Volume')
    expect(rendered).toContain('### 章: Cyclic Chapter')
    expect(rendered).toContain('Write the current chapter draft only.')
    expect(rendered).not.toContain('(empty draft)')
  })
})
