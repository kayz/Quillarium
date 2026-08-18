import { z } from 'zod'
import { projectIdSchema } from './schema.js'

/** Non-authoritative, human-browsable conclusions linked to one creator-assistant session. */
export const explorationDocV1Schema = z
  .object({
    schema_version: z.literal(1),
    id: projectIdSchema,
    type: z.literal('exploration'),
    title: z.string().min(1),
    tags: z.array(z.string()),
    session_id: projectIdSchema,
    authority: z.literal('advisory'),
    context_inclusion: z.literal('explicit-only')
  })
  .strict()

export type ExplorationDocV1 = z.infer<typeof explorationDocV1Schema>
