import { describe, expect, it } from 'vitest'
import {
  canonSchema,
  chapterProseSchema,
  characterRelationSchema,
  characterSchema,
  characterStateSchema,
  foreshadowingSchema,
  issueSchema,
  locationSchema,
  narrativeSchema,
  outlineSchema,
  patternSchema,
  referenceSchema,
  routeSchema,
  sceneSchema,
  strategySchema,
  timelineEventSchema,
  timelineNodeSchema,
  worldEntrySchema
} from '@quillarium/core'
import {
  documentTypeLabel,
  enumChoiceLabel,
  enumOptionsForField,
  fieldPresentation,
  KNOWN_FIELD_KEYS
} from './field-presentation.js'

const documents = [
  canonSchema.parse({ id: 'canon-1', type: 'canon', title: 'Canon' }),
  characterSchema.parse({ id: 'character-1', type: 'character', title: 'Character' }),
  characterRelationSchema.parse({
    id: 'relationship-1',
    type: 'character_relation',
    title: 'Relationship',
    from_character: 'character-1',
    to_character: 'character-2',
    relation_type: 'ally'
  }),
  foreshadowingSchema.parse({ id: 'foreshadowing-1', type: 'foreshadowing', title: 'Foreshadowing' }),
  worldEntrySchema.parse({ id: 'world-1', type: 'world_entry', title: 'World entry' }),
  referenceSchema.parse({ id: 'reference-1', type: 'reference', title: 'Reference' }),
  issueSchema.parse({ id: 'issue-1', type: 'issue', title: 'Issue' }),
  strategySchema.parse({ id: 'strategy-1', type: 'strategy', title: 'Strategy' }),
  patternSchema.parse({ id: 'pattern-1', type: 'pattern', title: 'Pattern' }),
  narrativeSchema.parse({ id: 'narrative-1', type: 'narrative', title: 'Narrative' }),
  characterStateSchema.parse({
    id: 'state-1',
    type: 'character_state',
    title: 'State',
    character: 'character-1',
    scope_type: 'outline',
    scope_id: 'chapter-1'
  }),
  timelineEventSchema.parse({ id: 'event-1', type: 'timeline_event', title: 'Event' }),
  timelineNodeSchema.parse({
    id: 'timeline-node-1',
    type: 'timeline_node',
    title: 'Timeline node',
    year: 20,
    month: 9
  }),
  locationSchema.parse({ id: 'location-1', type: 'location', title: 'Location' }),
  routeSchema.parse({ id: 'route-1', type: 'route', title: 'Route', from: 'A', to: 'B' }),
  outlineSchema.parse({ id: 'outline-1', type: 'outline', title: 'Outline', level: 'overview' }),
  sceneSchema.parse({
    id: 'scene-1',
    type: 'scene',
    title: 'Scene',
    chapter_id: 'chapter-1',
    section: 'chapter-1'
  }),
  chapterProseSchema.parse({
    id: 'prose-1',
    type: 'chapter_prose',
    title: 'Chapter prose',
    chapter_id: 'chapter-1'
  })
]

describe('localized field presentation catalog', () => {
  it('covers every editable field produced by the core document schemas', () => {
    const hidden = new Set(['id', 'type', 'schema_version', 'title'])
    const known = new Set(KNOWN_FIELD_KEYS)
    const missing = [
      ...new Set(documents.flatMap((document) => Object.keys(document).filter((key) => !hidden.has(key))))
    ].filter((key) => !known.has(key))

    expect(missing).toEqual([])
  })

  it('covers the structured keys shown inside relationship, trigger, usage, and diagram editors', () => {
    const nestedKeys = [
      'kind',
      'target_id',
      'note',
      'segment',
      'reveal_after',
      'scene',
      'usage',
      'keyword',
      'id',
      'label',
      'x',
      'y',
      'floor',
      'target_location',
      'from',
      'to'
    ]
    const known = new Set(KNOWN_FIELD_KEYS)
    expect(nestedKeys.filter((key) => !known.has(key))).toEqual([])
  })

  it('provides a localized title and explanation in both languages', () => {
    for (const key of KNOWN_FIELD_KEYS) {
      for (const language of ['zh', 'en'] as const) {
        const presentation = fieldPresentation(key, language)
        expect(presentation.known, key + ':' + language).toBe(true)
        expect(presentation.label.trim(), key + ':' + language).not.toBe('')
        expect(presentation.description.trim(), key + ':' + language).not.toBe('')
        expect(presentation.label, key + ':' + language).not.toContain('_')
      }
    }
  })

  it('localizes every public document type used by the card workbench', () => {
    const types = [
      'canon',
      'character',
      'character_relation',
      'foreshadowing',
      'world_entry',
      'reference',
      'issue',
      'strategy',
      'pattern',
      'narrative',
      'character_state',
      'timeline_node',
      'timeline_event',
      'location',
      'route',
      'outline',
      'scene',
      'chapter_prose'
    ]
    for (const type of types) {
      expect(documentTypeLabel(type, 'zh'), type).not.toMatch(/^[a-z_ ]+$/u)
      expect(documentTypeLabel(type, 'en'), type).not.toContain('_')
    }
    expect(documentTypeLabel('timeline_node', 'zh')).toBe('时间节点')
    expect(documentTypeLabel('reference', 'en')).toBe('Reference material')
  })

  it('explains unknown legacy fields without presenting snake_case as the title', () => {
    expect(fieldPresentation('unknown_nested', 'zh')).toEqual({
      label: '自定义属性',
      description: '从导入材料或旧文档保留的附加信息；原字段为“unknown nested”。',
      known: false
    })
    expect(fieldPresentation('unknown_nested', 'en')).toEqual({
      label: 'Unknown nested',
      description: 'Additional information preserved from an import or legacy document.',
      known: false
    })
  })

  it('uses document-specific level and status choices without changing stored values', () => {
    expect(enumOptionsForField('level', { documentType: 'outline' })).toEqual([
      'overview',
      'book',
      'volume',
      'part',
      'act',
      'chapter',
      'section'
    ])
    expect(enumOptionsForField('level', { documentType: 'foreshadowing' })).toEqual([
      'L1',
      'L2',
      'L3',
      'L4',
      'L5'
    ])
    expect(enumOptionsForField('status', { documentType: 'chapter_prose' })).toEqual([
      'draft',
      'final',
      'published'
    ])
    expect(enumChoiceLabel('level', 'volume', 'zh', { documentType: 'outline' })).toBe('卷')
    expect(enumChoiceLabel('level', 'volume', 'en', { documentType: 'outline' })).toBe('Volume')
    expect(enumChoiceLabel('status', 'published', 'zh')).toBe('已发布')
    expect(enumChoiceLabel('run_status', 'generated', 'zh')).toBe('已生成')
    expect(enumChoiceLabel('run_status', 'accepted', 'en')).toBe('Accepted')
    expect(enumOptionsForField('kind', { documentType: 'location' })).toEqual(['position', 'layout'])
    expect(enumOptionsForField('kind', { documentType: 'foreshadowing' })).toEqual([
      'timeline_reached',
      'outline_reached',
      'keyword',
      'card_enabled'
    ])
    expect(enumOptionsForField('category', { documentType: 'narrative' })).toEqual([
      'style',
      'structure',
      'pacing',
      'dialogue',
      'description',
      'genre_boundary',
      'other'
    ])
    expect(enumChoiceLabel('relation_kind', 'depends_on', 'zh')).toBe('依赖')
    expect(enumChoiceLabel('scale', 'interior', 'zh')).toBe('室内')
  })
})
