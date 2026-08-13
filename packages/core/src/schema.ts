import { z } from 'zod'
import { normalizeLegacyOutlineCycleFields, normalizeLegacySceneFields } from './compatibility.js'

export const documentIdentitySchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  schema_version: z.number().int().positive().default(1),
  title: z.string().min(1),
  tags: z.array(z.string()).default([])
})

export const baseDocSchema = documentIdentitySchema.extend({
  status: z.string().min(1).default('draft')
})

export const cardRelationKindSchema = z.enum([
  'related',
  'supports',
  'contradicts',
  'depends_on',
  'located_in',
  'layout_of',
  'involves',
  'triggers',
  'resolves',
  'explains'
])

export const cardRelationSchema = z.object({
  kind: cardRelationKindSchema.default('related'),
  target_id: z.string().min(1),
  note: z.string().default('')
})

export const planningCardSchema = baseDocSchema.extend({
  enabled: z.boolean().default(true),
  source_refs: z.array(z.string().min(1)).default([]),
  relations: z.array(cardRelationSchema).default([])
})

export const projectIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Project id must be a lowercase path-safe slug')

export const projectConfigV1Schema = z.object({
  title: z.string().min(1),
  genre: z.string().default('general'),
  target_words: z.number().int().nonnegative().default(0),
  chapter_words: z.number().int().positive().default(3200),
  section_words: z.number().int().positive().default(1000),
  current_volume: z.number().int().positive().default(1),
  current_timeline_node: z.string().nullable().default(null),
  default_theme: z.enum(['paper', 'ink', 'mist', 'bamboo']).default('paper'),
  schema_version: z.literal(1).default(1)
})

export const projectConfigSchema = z.object({
  id: projectIdSchema,
  aliases: z.array(z.string().min(1)).default([]),
  title: z.string().min(1),
  genre: z.string().default('general'),
  target_words: z.number().int().nonnegative().default(0),
  chapter_words: z.number().int().positive().default(3200),
  section_words: z.number().int().positive().default(1000),
  current_volume: z.number().int().positive().default(1),
  current_timeline_node: z.string().nullable().default(null),
  writing_preset: projectIdSchema.nullable().default('default'),
  default_theme: z.enum(['paper', 'ink', 'mist', 'bamboo']).default('paper'),
  schema_version: z.literal(2).default(2)
})

export const workspaceProjectRefSchema = z
  .object({
    id: projectIdSchema,
    path: z.string().min(1)
  })
  .strict()

export const sharedGuidanceScopeSchema = z.enum([
  'overview',
  'book',
  'volume',
  'part',
  'act',
  'arc',
  'chapter',
  'scene',
  'finalization'
])

export const sharedGuidanceRefSchema = z
  .object({
    id: projectIdSchema,
    path: z.string().min(1),
    scopes: z.array(sharedGuidanceScopeSchema).min(1)
  })
  .strict()

export const workspaceManifestV1Schema = z
  .object({
    schema_version: z.literal(1),
    id: projectIdSchema,
    projects_dir: z.string().min(1),
    projects: z.array(workspaceProjectRefSchema).default([]),
    shared_guidance: z.array(sharedGuidanceRefSchema).default([])
  })
  .strict()

export const canonSchema = planningCardSchema.extend({
  type: z.literal('canon'),
  strength: z.enum(['hard', 'soft']).default('hard'),
  source: z.enum(['user', 'ai', 'imported', 'historical']).default('user')
})

export const characterSchema = planningCardSchema.extend({
  type: z.literal('character'),
  aliases: z.array(z.string()).default([]),
  role: z.string().default('supporting'),
  speech_style: z.string().default(''),
  desire: z.string().default(''),
  fear: z.string().default(''),
  bottom_line: z.string().default(''),
  motivation_anchors: z.array(z.string()).default([]),
  relationships: z.record(z.string()).default({}),
  arc: z
    .record(
      z.object({
        start: z.string().optional(),
        end: z.string().optional(),
        notes: z.string().optional()
      })
    )
    .default({}),
  ooc_guardrails: z.array(z.string()).default([]),
  active_flags: z.array(z.string()).default([]),
  disclosure: z
    .array(
      z.object({
        segment: z.string(),
        reveal_after: z.string().optional()
      })
    )
    .default([]),
  born_at: z.string().nullable().default(null),
  died_at: z.string().nullable().default(null),
  introduced_at: z.string().nullable().default(null),
  exited_at: z.string().nullable().default(null),
  scene_state: z
    .object({
      current_location: z.string().optional(),
      outfit_layers: z.array(z.string()).optional(),
      wounds: z.array(z.string()).optional(),
      carried_items: z.array(z.string()).optional(),
      known_facts: z.array(z.string()).optional(),
      emotional_state: z.string().optional()
    })
    .default({})
})

export const characterRelationSchema = planningCardSchema.extend({
  type: z.literal('character_relation'),
  from_character: z.string().min(1),
  to_character: z.string().min(1),
  relation_type: z.string().min(1),
  direction: z.enum(['directed', 'mutual']).default('directed'),
  starts_at: z.string().nullable().default(null),
  ends_at: z.string().nullable().default(null),
  visibility: z.enum(['public', 'private', 'secret']).default('private')
})

export const foreshadowingSchema = planningCardSchema.extend({
  type: z.literal('foreshadowing'),
  code: z.string().default(''),
  level: z.enum(['L1', 'L2', 'L3', 'L4', 'L5']).default('L4'),
  summary: z.string().default(''),
  planned_plant: z.string().default(''),
  planted_at: z.string().nullable().default(null),
  reinforced_at: z.array(z.string()).default([]),
  planned_resolve: z.string().default(''),
  expires_at: z.string().default(''),
  state: z.enum(['planned', 'planted', 'reinforced', 'resolved', 'abandoned']).default('planned'),
  related_characters: z.array(z.string()).default([]),
  related_arc: z.string().default(''),
  trigger_conditions: z
    .array(
      z.object({
        kind: z.enum(['timeline_reached', 'outline_reached', 'keyword', 'card_enabled']),
        target_id: z.string().default(''),
        keyword: z.string().default('')
      })
    )
    .default([]),
  reminder_window: z.string().default(''),
  reminded_at: z.array(z.string()).default([])
})

export const worldEntrySchema = planningCardSchema.extend({
  type: z.literal('world_entry'),
  code: z.string().default(''),
  triggers: z.array(z.string()).default([]),
  category_tags: z.array(z.string()).default([]),
  role: z.enum(['constraint', 'texture', 'both']).default('both'),
  valid_from: z.string().default(''),
  valid_until: z.string().default(''),
  entry_status: z.enum(['candidate', 'active', 'inactive']).default('candidate'),
  importance: z.enum(['high', 'medium', 'low']).default('medium'),
  historical_reference: z.string().default(''),
  story_setting: z.string().default(''),
  used_in: z
    .array(
      z.object({
        scene: z.string(),
        usage: z.string()
      })
    )
    .default([]),
  links: z.array(z.string()).default([]),
  source: z.string().default('')
})

export const referenceSchema = documentIdentitySchema.extend({
  type: z.literal('reference'),
  source_title: z.string().default(''),
  author: z.string().default(''),
  material_type: z.enum(['book', 'paper', 'article', 'webpage', 'video', 'other']).default('other'),
  location: z.string().default(''),
  reading_status: z.enum(['unread', 'reading', 'read']).default('unread'),
  topic_tags: z.array(z.string()).default([]),
  extracted_entries: z.array(z.string()).default([]),
  value_assessment: z.string().default('')
})

export const issueSchema = planningCardSchema.extend({
  type: z.literal('issue'),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  state: z.enum(['open', 'resolved', 'deferred']).default('open'),
  due: z.string().default(''),
  decision_needed: z.string().default(''),
  related_docs: z.array(z.string()).default([]),
  rule_id: z.string().default(''),
  evidence: z.string().default(''),
  check_fingerprint: z.string().default(''),
  checked_at: z.string().default('')
})

export const strategySchema = planningCardSchema.extend({
  type: z.literal('strategy'),
  category: z
    .enum(['narrative', 'style', 'pacing', 'reader_expectation', 'genre_boundary', 'other'])
    .default('narrative'),
  scope: z.string().default('project'),
  principles: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([])
})

export const patternSchema = planningCardSchema.extend({
  type: z.literal('pattern'),
  kind: z.enum(['story', 'writing', 'prompt']).default('story'),
  scope: z.enum(['book', 'volume', 'arc', 'chapter', 'section', 'agent', 'project']).default('project'),
  applies_to: z.array(z.string()).default([]),
  source: z.enum(['user', 'ai', 'accepted_prose', 'imported']).default('user')
})

export const narrativeSchema = planningCardSchema.extend({
  type: z.literal('narrative'),
  category: z
    .enum(['style', 'structure', 'pacing', 'dialogue', 'description', 'genre_boundary', 'other'])
    .default('style'),
  scope: z.enum(['book', 'volume', 'part', 'act', 'chapter', 'scene', 'project']).default('project'),
  applies_to: z.array(z.string()).default([]),
  principles: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  source: z.enum(['user', 'ai', 'accepted_prose', 'imported']).default('user'),
  sample: z.string().default('')
})

export const characterStateSchema = planningCardSchema.extend({
  type: z.literal('character_state'),
  character: z.string().min(1),
  scope_type: z.enum(['timeline_event', 'outline', 'scene']),
  scope_id: z.string().min(1),
  timeline_node: z.string().nullable().default(null),
  motivation: z.string().default(''),
  emotion: z.string().default(''),
  knowledge: z.array(z.string()).default([]),
  relationship_delta: z.record(z.string()).default({}),
  public_disclosure: z.array(z.string()).default([]),
  notes: z.string().default('')
})

export const timelinePrecisionSchema = z.enum(['month', 'day', 'hour', 'minute'])

export const timelineNodeSchema = planningCardSchema.extend({
  type: z.literal('timeline_node'),
  calendar: z.string().default('story'),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  month_end: z.number().int().min(1).max(12).nullable().default(null),
  day: z.number().int().min(1).max(31).nullable().default(null),
  hour: z.number().int().min(0).max(23).nullable().default(null),
  minute: z.number().int().min(0).max(59).nullable().default(null),
  precision: timelinePrecisionSchema.default('month'),
  display_time: z.string().default(''),
  fuzzy: z.boolean().default(false),
  previous: z.string().nullable().default(null),
  next: z.string().nullable().default(null)
})

export const timelineEventSchema = planningCardSchema.extend({
  type: z.literal('timeline_event'),
  timeline_node: z.string().nullable().default(null),
  date: z.string().default(''),
  previous: z.string().nullable().default(null),
  next: z.string().nullable().default(null),
  duration: z.string().default(''),
  location: z.string().nullable().default(null),
  characters: z.array(z.string()).default([]),
  flashback_reference: z.string().nullable().optional()
})

export const locationScaleSchema = z.enum(['global', 'region', 'city', 'district', 'estate', 'interior'])

export const locationSchema = planningCardSchema.extend({
  type: z.literal('location'),
  kind: z.enum(['position', 'layout']).default('position'),
  scale: locationScaleSchema.default('city'),
  parent_location: z.string().nullable().default(null),
  layout_of: z.string().nullable().default(null),
  relative_direction: z.string().default(''),
  floor: z.string().default(''),
  diagram_nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        x: z.number(),
        y: z.number(),
        floor: z.string().default(''),
        target_location: z.string().nullable().default(null)
      })
    )
    .default([]),
  diagram_edges: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        label: z.string().default('')
      })
    )
    .default([]),
  description: z.string().default('')
})

export const routeSchema = planningCardSchema.extend({
  type: z.literal('route'),
  from: z.string().min(1),
  to: z.string().min(1),
  distance_li: z.number().nullable().default(null),
  travel_time_days: z.number().nullable().default(null),
  route_type: z.string().default('road'),
  restriction: z.string().default('')
})

const currentOutlineSchema = baseDocSchema
  .extend({
    type: z.literal('outline'),
    level: z.enum(['overview', 'book', 'volume', 'part', 'act', 'chapter', 'section', 'arc']),
    parent: z.string().nullable().default(null),
    order: z.number().int().nonnegative().default(0),
    target_words: z.number().int().positive().optional(),
    chapter_hook: z.boolean().optional(),
    story_purpose: z.string().default(''),
    core_characters: z.array(z.string()).default([]),
    central_conflict: z.string().default(''),
    final_direction: z.string().default(''),
    worldline_axis: z.string().default(''),
    character_destiny_axis: z.string().default(''),
    key_stages: z.array(z.string()).default([]),
    causal_chain: z.array(z.string()).default([]),
    final_state: z.string().default(''),
    stage_goal: z.string().default(''),
    irreversible_change: z.string().default(''),
    reader_promise: z.string().default(''),
    reader_payoff: z.string().default(''),
    reader_benefit: z.string().default(''),
    core_appeal: z.array(z.string()).default([]),
    core_suspense: z.array(z.string()).default([]),
    genre_boundary: z.array(z.string()).default([]),
    volume_goal: z.string().default(''),
    event_chain: z.array(z.string()).default([]),
    character_growth: z.array(z.string()).default([]),
    story_cycles: z.array(z.enum(['desire', 'pressure', 'growth', 'reveal', 'relationship'])).default([]),
    conflict_ladder: z.array(z.string()).default([]),
    cast_lock: z.array(z.string()).default([]),
    fixed_reveals: z.array(z.string()).default([]),
    chapter_goal: z.string().default(''),
    chapter_conflict: z.string().default(''),
    chapter_change: z.string().default(''),
    ending_hook: z.string().default(''),
    invariants: z.array(z.string()).default([]),
    narrative_function: z.string().default(''),
    emotional_curve: z.string().default(''),
    povs: z.array(z.string()).default([]),
    start_state: z.string().default(''),
    end_state: z.string().default(''),
    context_pins: z.array(z.string()).default([]),
    context_exclusions: z.array(z.string()).default([]),
    related_timeline: z.array(z.string()).default([]),
    related_characters: z.array(z.string()).default([]),
    related_events: z.array(z.string()).default([]),
    related_foreshadowing: z.array(z.string()).default([]),
    world_entries_used: z.array(z.string()).default([]),
    foreshadowing_planted: z.array(z.string()).default([]),
    foreshadowing_resolved: z.array(z.string()).default([]),
    related_patterns: z.array(z.string()).default([])
  })
  .passthrough()

export const outlineSchema = z.preprocess(normalizeLegacyOutlineCycleFields, currentOutlineSchema)

export const sceneSchema = z.preprocess(
  normalizeLegacySceneFields,
  baseDocSchema
    .extend({
      type: z.literal('scene'),
      chapter_id: z.string().min(1),
      section: z.string().min(1),
      order: z.number().int().nonnegative().default(0),
      writing_focus: z.string().default(''),
      outline_content: z.string().default(''),
      accepted_at: z.string().nullable().default(null),
      purged_at: z.string().nullable().default(null),
      chapter_number: z.string().default(''),
      volume: z.string().default(''),
      act: z.string().default(''),
      // Draft scenes may be created before the author has selected every binding.
      // Generation and acceptance perform the stricter prerequisite checks.
      timeline_node: z.string().default(''),
      location: z.string().default(''),
      pov: z.string().default(''),
      characters: z.array(z.string()).default([]),
      world_time: z.string().default(''),
      chapter_break_hook: z.string().default(''),
      narrative_function: z.string().default(''),
      writing_environment: z.string().default(''),
      scene_goal: z.string().default(''),
      scene_conflict: z.string().default(''),
      scene_change: z.string().default(''),
      reader_benefit: z.string().default(''),
      ending_hook: z.string().default(''),
      foreshadowing_planted: z.array(z.string()).default([]),
      foreshadowing_resolved: z.array(z.string()).default([]),
      foreshadowing_reinforced: z.array(z.string()).default([]),
      world_entries_used: z.array(z.string()).default([]),
      impact: z.array(z.string()).default([]),
      target_words: z.number().int().positive().default(1000),
      chapter_hook: z.boolean().default(false),
      previous_scene: z.string().nullable().default(null),
      context_pins: z.array(z.string()).default([]),
      context_exclusions: z.array(z.string()).default([]),
      related_patterns: z.array(z.string()).default([])
    })
    .passthrough()
)

export const chapterProseSchema = baseDocSchema
  .extend({
    type: z.literal('chapter_prose'),
    status: z.enum(['draft', 'final', 'published']).default('draft'),
    chapter_id: z.string().min(1),
    scene_ids: z.array(z.string()).default([]),
    finalized_at: z.string().nullable().default(null),
    published_at: z.string().nullable().default(null)
  })
  .passthrough()
