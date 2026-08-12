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

const temporaryVaults: string[] = []
let projectSequence = 0

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

describe('context selection', () => {
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
    await createOutline(root, 'chapter', 'Chapter', {
      id: 'chapter-main',
      parent: 'book-main',
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

    expect(packet.outline_chain.map((item) => item.data.id)).toEqual(['book-main', 'chapter-main'])
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
    expect(packet.references.map((item) => item.data.id)).toContain('reference-pinned')
    expect(packet.excluded_ids).toEqual(
      expect.arrayContaining(['character-excluded', 'strategy-excluded', 'world-excluded'])
    )
    expect(packet.included_ids).not.toEqual(
      expect.arrayContaining(['character-excluded', 'strategy-excluded', 'world-excluded'])
    )
  })

  it('infers relevant documents from focus tokens, timeline cast, and character links', async () => {
    const root = await project()
    await createOutline(root, 'section', 'Meteor Arrival', { id: 'section-meteor' })
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
        section: 'section-meteor',
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
    expect(packet.references.map((item) => item.data.id)).toContain('reference-meteor')
  })

  it('caps inferred scene-level patterns while retaining pins and explicit ids', async () => {
    const root = await project()
    await createOutline(root, 'section', 'Meteor Section', {
      id: 'section-main',
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
        section: 'section-main',
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

    expect(patternIds).toHaveLength(10)
    expect(inferred).toHaveLength(8)
    expect(patternIds).toEqual(expect.arrayContaining(['pattern-pinned', 'pattern-explicit']))
    expect(patternIds).not.toContain('pattern-excluded')
    expect(new Set(patternIds).size).toBe(patternIds.length)
    expect(packet.included_ids.filter((id) => id.startsWith('pattern-'))).toHaveLength(10)
  })
})

describe('context rendering and warnings', () => {
  it('renders an outline target, terminates cyclic parent chains, and reports missing context', async () => {
    const root = await project()
    await createOutline(root, 'volume', 'Cyclic Volume', {
      id: 'volume-cycle',
      parent: 'chapter-cycle'
    })
    await createOutline(
      root,
      'chapter',
      'Cyclic Chapter',
      {
        id: 'chapter-cycle',
        parent: 'volume-cycle'
      },
      'Hand-written chapter outline.'
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
        '缺叙事策略：建议将文风、节奏、爽点等从 Canon 中拆为 strategy。',
        '章纲缺少时间线绑定。',
        '章纲缺少相关人物绑定。'
      ])
    )
    expect(rendered).toContain('# Quillarium Context Packet: Cyclic Chapter')
    expect(rendered).toContain('### 卷纲: Cyclic Volume')
    expect(rendered).toContain('### 章纲: Cyclic Chapter')
    expect(rendered).toContain('Write the current chapter draft only.')
    expect(rendered).not.toContain('(empty draft)')
  })
})
