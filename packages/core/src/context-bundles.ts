import { z } from 'zod'
import { projectIdSchema } from './schema.js'
import type { DocType } from './types.js'
import {
  createVersionedYaml,
  deleteVersionedYaml,
  listVersionedYaml,
  loadVersionedYaml,
  updateVersionedYaml,
  type LoadedVersionedYaml
} from './versioned-yaml-store.js'
import { withProjectWriteLock } from './project-write-lock.js'

export const bundleDocumentTypes = [
  'canon',
  'character',
  'character_relation',
  'timeline_node',
  'timeline_event',
  'location',
  'route',
  'foreshadowing',
  'world_entry',
  'reference',
  'issue',
  'strategy',
  'pattern',
  'narrative',
  'character_state',
  'resource',
  'causality',
  'outline',
  'chapter_prose',
  'scene',
  'prompt',
  'exploration'
] as const

export type BundleDocumentType = DocType | 'exploration'
export type ContextSourceMode = 'required' | 'preferred'
export type ContextSourceUsage = 'subject' | 'constraint' | 'evidence' | 'style'

export const bundleDocumentTypeSchema = z.enum(bundleDocumentTypes)
export const contextSourceModeSchema = z.enum(['required', 'preferred'])
export const contextSourceUsageSchema = z.enum(['subject', 'constraint', 'evidence', 'style'])

export const contextBundleSourceV1Schema = z
  .object({
    document_type: bundleDocumentTypeSchema,
    document_id: z.string().min(1),
    mode: contextSourceModeSchema,
    usage: contextSourceUsageSchema
  })
  .strict()
  .superRefine((source, context) => {
    if (source.document_type === 'exploration' && source.mode !== 'preferred') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mode'],
        message: 'Exploration documents can only be preferred advisory sources'
      })
    }
  })

export const contextBundleSelectorV1Schema = z
  .object({
    kind: z.enum([
      'current_target',
      'outline_ancestors',
      'explicit_relations',
      'active_timeline_context',
      'accepted_prose_context'
    ]),
    mode: contextSourceModeSchema,
    usage: contextSourceUsageSchema,
    max_depth: z.number().int().min(0).max(1).optional()
  })
  .strict()
  .superRefine((selector, context) => {
    if (selector.kind === 'explicit_relations' && selector.max_depth === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max_depth'],
        message: 'Explicit relation selectors require max_depth=1'
      })
    }
    if (selector.kind !== 'explicit_relations' && selector.max_depth !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max_depth'],
        message: 'max_depth is only valid for explicit relation selectors'
      })
    }
  })

export const contextBundleExclusionV1Schema = z
  .object({
    document_type: bundleDocumentTypeSchema,
    document_id: z.string().min(1)
  })
  .strict()

export const contextBundleV1Schema = z
  .object({
    schema_version: z.literal(1),
    id: projectIdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u),
    title: z.string().min(1),
    description: z.string(),
    sources: z.array(contextBundleSourceV1Schema),
    dynamic_selectors: z.array(contextBundleSelectorV1Schema),
    exclusions: z.array(contextBundleExclusionV1Schema)
  })
  .strict()
  .superRefine((bundle, context) => {
    addDuplicateIssues(
      bundle.sources,
      (source) => `${source.document_type}:${source.document_id}`,
      context,
      'sources'
    )
    addDuplicateIssues(bundle.dynamic_selectors, (selector) => selector.kind, context, 'dynamic_selectors')
    addDuplicateIssues(
      bundle.exclusions,
      (source) => `${source.document_type}:${source.document_id}`,
      context,
      'exclusions'
    )
    const exclusions = new Set(
      bundle.exclusions.map((source) => `${source.document_type}:${source.document_id}`)
    )
    bundle.sources.forEach((source, index) => {
      if (exclusions.has(`${source.document_type}:${source.document_id}`)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sources', index],
          message: 'A fixed source cannot also be excluded'
        })
      }
    })
  })

export type ContextBundleSourceV1 = z.infer<typeof contextBundleSourceV1Schema>
export type ContextBundleSelectorV1 = z.infer<typeof contextBundleSelectorV1Schema>
export type ContextBundleExclusionV1 = z.infer<typeof contextBundleExclusionV1Schema>
export type ContextBundleV1 = z.infer<typeof contextBundleV1Schema>
export type LoadedContextBundle = LoadedVersionedYaml<ContextBundleV1>

const DIRECTORY = 'context-bundles'

export async function listContextBundles(projectRoot: string): Promise<LoadedContextBundle[]> {
  return listVersionedYaml(projectRoot, DIRECTORY, contextBundleV1Schema)
}

export async function loadContextBundle(projectRoot: string, id: string): Promise<LoadedContextBundle> {
  return loadVersionedYaml(projectRoot, DIRECTORY, id, contextBundleV1Schema)
}

export async function createContextBundle(
  projectRoot: string,
  bundle: ContextBundleV1
): Promise<LoadedContextBundle> {
  return withProjectWriteLock(projectRoot, () =>
    createVersionedYaml(projectRoot, DIRECTORY, bundle, contextBundleV1Schema)
  )
}

export async function updateContextBundle(
  projectRoot: string,
  bundle: ContextBundleV1,
  expectedSha256: string
): Promise<LoadedContextBundle> {
  return withProjectWriteLock(projectRoot, () =>
    updateVersionedYaml(projectRoot, DIRECTORY, bundle, expectedSha256, contextBundleV1Schema)
  )
}

export async function deleteContextBundle(
  projectRoot: string,
  id: string,
  expectedSha256: string,
  referencedByRoleIds: string[] = []
): Promise<void> {
  await withProjectWriteLock(projectRoot, async () => {
    const { listCreatorRoles } = await import('./creator-roles.js')
    const liveReferences = (await listCreatorRoles(projectRoot))
      .filter((role) => role.value.context_bundle_id === id)
      .map((role) => role.value.id)
    const references = [...new Set([...referencedByRoleIds, ...liveReferences])]
    if (references.length > 0) {
      throw new Error(`CONTEXT_BUNDLE_IN_USE: ${id} is used by creator roles: ${references.join(', ')}`)
    }
    await deleteVersionedYaml(projectRoot, DIRECTORY, id, expectedSha256, contextBundleV1Schema)
  })
}

function addDuplicateIssues<T>(
  values: T[],
  keyOf: (value: T) => string,
  context: z.RefinementCtx,
  field: string
): void {
  const seen = new Map<string, number>()
  values.forEach((value, index) => {
    const key = keyOf(value)
    const previous = seen.get(key)
    if (previous !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, index],
        message: `Duplicate entry also appears at ${field}.${previous}: ${key}`
      })
    } else {
      seen.set(key, index)
    }
  })
}
