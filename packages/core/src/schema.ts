import { z } from 'zod'

export const baseDocSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  schema_version: z.number().int().positive().default(1),
  title: z.string().min(1),
  status: z.string().min(1).default('draft'),
  tags: z.array(z.string()).default([])
})

export const projectConfigSchema = z.object({
  title: z.string().min(1),
  genre: z.string().default('general'),
  target_words: z.number().int().nonnegative().default(0),
  chapter_words: z.number().int().positive().default(3200),
  section_words: z.number().int().positive().default(1000),
  current_volume: z.number().int().positive().default(1),
  current_timeline_node: z.string().nullable().default(null),
  schema_version: z.number().int().positive().default(1)
})

export const canonSchema = baseDocSchema.extend({
  type: z.literal('canon'),
  strength: z.enum(['hard', 'soft']).default('hard'),
  source: z.enum(['user', 'ai', 'imported', 'historical']).default('user')
})

export const characterSchema = baseDocSchema.extend({
  type: z.literal('character'),
  aliases: z.array(z.string()).default([]),
  role: z.string().default('supporting'),
  speech_style: z.string().default(''),
  desire: z.string().default(''),
  fear: z.string().default(''),
  bottom_line: z.string().default(''),
  relationships: z.record(z.string()).default({}),
  arc: z.record(z.object({
    start: z.string().optional(),
    end: z.string().optional(),
    notes: z.string().optional()
  })).default({}),
  ooc_guardrails: z.array(z.string()).default([]),
  scene_state: z.object({
    current_location: z.string().optional(),
    outfit_layers: z.array(z.string()).optional(),
    wounds: z.array(z.string()).optional(),
    carried_items: z.array(z.string()).optional(),
    known_facts: z.array(z.string()).optional(),
    emotional_state: z.string().optional()
  }).default({})
})

export const timelineEventSchema = baseDocSchema.extend({
  type: z.literal('timeline_event'),
  date: z.string().default(''),
  previous: z.string().nullable().default(null),
  next: z.string().nullable().default(null),
  duration: z.string().default(''),
  location: z.string().nullable().default(null),
  characters: z.array(z.string()).default([]),
  flashback_reference: z.string().nullable().optional()
})

export const locationSchema = baseDocSchema.extend({
  type: z.literal('location'),
  parent_location: z.string().nullable().default(null),
  description: z.string().default('')
})

export const routeSchema = baseDocSchema.extend({
  type: z.literal('route'),
  from: z.string().min(1),
  to: z.string().min(1),
  distance_li: z.number().nullable().default(null),
  travel_time_days: z.number().nullable().default(null),
  route_type: z.string().default('road'),
  restriction: z.string().default('')
})

export const outlineSchema = baseDocSchema.extend({
  type: z.literal('outline'),
  level: z.enum(['book', 'volume', 'arc', 'chapter', 'section']),
  parent: z.string().nullable().default(null),
  order: z.number().int().nonnegative().default(0),
  target_words: z.number().int().positive().optional(),
  chapter_hook: z.boolean().optional()
})

export const sceneSchema = baseDocSchema.extend({
  type: z.literal('scene'),
  section: z.string().min(1),
  timeline_node: z.string().min(1),
  location: z.string().min(1),
  pov: z.string().min(1),
  characters: z.array(z.string()).default([]),
  target_words: z.number().int().positive().default(1000),
  chapter_hook: z.boolean().default(false),
  previous_scene: z.string().nullable().default(null)
})
