import { z } from 'zod'
import {
  contextBundleV1Schema,
  loadContextBundle,
  updateContextBundle,
  type ContextBundleV1
} from './context-bundles.js'
import {
  creatorRoleV1Schema,
  loadCreatorRole,
  updateCreatorRole,
  type CreatorRoleV1
} from './creator-roles.js'
import { canonicalJson, sha256Text } from './versioned-yaml-store.js'

export const configurationDiffEntryV1Schema = z
  .object({
    path: z.string().min(1),
    before: z.unknown(),
    after: z.unknown(),
    risk: z.enum(['normal', 'approval-required']),
    reason: z.string().min(1)
  })
  .strict()

export const configurationChangePlanV1Schema = z
  .object({
    schema_version: z.literal(1),
    target_kind: z.enum(['creator_role', 'context_bundle']),
    target_id: z.string().min(1),
    expected_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    proposed: z.union([creatorRoleV1Schema, contextBundleV1Schema]),
    diff: z.array(configurationDiffEntryV1Schema).min(1),
    requires_author_approval: z.literal(true),
    plan_sha256: z.string().regex(/^[a-f0-9]{64}$/u)
  })
  .strict()

export type ConfigurationChangePlanV1 = z.infer<typeof configurationChangePlanV1Schema>

export async function planCreatorRoleChange(
  projectRoot: string,
  proposed: CreatorRoleV1
): Promise<ConfigurationChangePlanV1> {
  const parsed = creatorRoleV1Schema.parse(proposed) as CreatorRoleV1
  const current = await loadCreatorRole(projectRoot, parsed.id)
  return buildPlan('creator_role', current.value, parsed, current.source_sha256)
}

export async function planContextBundleChange(
  projectRoot: string,
  proposed: ContextBundleV1
): Promise<ConfigurationChangePlanV1> {
  const parsed = contextBundleV1Schema.parse(proposed) as ContextBundleV1
  const current = await loadContextBundle(projectRoot, parsed.id)
  return buildPlan('context_bundle', current.value, parsed, current.source_sha256)
}

export async function applyConfigurationChangePlan(
  projectRoot: string,
  plan: ConfigurationChangePlanV1,
  authorApproved: boolean
): Promise<CreatorRoleV1 | ContextBundleV1> {
  const parsed = assertConfigurationChangePlan(plan)
  if (!authorApproved) throw new Error('AUTHOR_APPROVAL_REQUIRED')
  if (parsed.target_kind === 'creator_role') {
    const role = creatorRoleV1Schema.parse(parsed.proposed) as CreatorRoleV1
    return (await updateCreatorRole(projectRoot, role, parsed.expected_sha256)).value
  }
  const bundle = contextBundleV1Schema.parse(parsed.proposed) as ContextBundleV1
  return (await updateContextBundle(projectRoot, bundle, parsed.expected_sha256)).value
}

export function assertConfigurationChangePlan(value: unknown): ConfigurationChangePlanV1 {
  const plan = configurationChangePlanV1Schema.parse(value) as ConfigurationChangePlanV1
  const { plan_sha256: claimed, ...withoutHash } = plan
  if (sha256Text(canonicalJson(withoutHash)) !== claimed) {
    throw new Error('AGENT_CONFIGURATION_PLAN_HASH_MISMATCH')
  }
  return plan
}

function buildPlan(
  targetKind: 'creator_role' | 'context_bundle',
  before: CreatorRoleV1 | ContextBundleV1,
  after: CreatorRoleV1 | ContextBundleV1,
  expectedSha256: string
): ConfigurationChangePlanV1 {
  const diff = objectDiff(before, after).map((entry) => ({
    ...entry,
    risk: isHighRisk(targetKind, entry.path, entry.before, entry.after)
      ? ('approval-required' as const)
      : ('normal' as const),
    reason: riskReason(targetKind, entry.path, entry.before, entry.after)
  }))
  if (diff.length === 0) throw new Error('AGENT_CONFIGURATION_PROPOSAL_NO_CHANGES')
  const withoutHash = {
    schema_version: 1 as const,
    target_kind: targetKind,
    target_id: after.id,
    expected_sha256: expectedSha256,
    proposed: after,
    diff,
    requires_author_approval: true as const
  }
  return configurationChangePlanV1Schema.parse({
    ...withoutHash,
    plan_sha256: sha256Text(canonicalJson(withoutHash))
  }) as ConfigurationChangePlanV1
}

function objectDiff(
  before: unknown,
  after: unknown,
  currentPath = ''
): Array<{ path: string; before: unknown; after: unknown }> {
  if (canonicalJson(before) === canonicalJson(after)) return []
  if (
    !before ||
    !after ||
    typeof before !== 'object' ||
    typeof after !== 'object' ||
    Array.isArray(before) ||
    Array.isArray(after)
  ) {
    return [{ path: currentPath || '/', before, after }]
  }
  const keys = new Set([
    ...Object.keys(before as Record<string, unknown>),
    ...Object.keys(after as Record<string, unknown>)
  ])
  return [...keys]
    .sort((left, right) => left.localeCompare(right, 'en'))
    .flatMap((key) =>
      objectDiff(
        (before as Record<string, unknown>)[key],
        (after as Record<string, unknown>)[key],
        `${currentPath}/${key}`
      )
    )
}

function isHighRisk(
  targetKind: 'creator_role' | 'context_bundle',
  changePath: string,
  before: unknown,
  after: unknown
): boolean {
  if (targetKind === 'creator_role') {
    if (changePath.startsWith('/enabled_operations') || changePath === '/output_disposition') return true
  }
  if (targetKind === 'context_bundle') {
    if (changePath.startsWith('/sources')) {
      return removesRequiredEntries(before, after, (value) => {
        const source = value as { document_type?: unknown; document_id?: unknown }
        return `${String(source.document_type)}:${String(source.document_id)}`
      })
    }
    if (changePath.startsWith('/dynamic_selectors')) {
      return removesRequiredEntries(before, after, (value) => String((value as { kind?: unknown }).kind))
    }
  }
  return false
}

function removesRequiredEntries(before: unknown, after: unknown, keyOf: (value: unknown) => string): boolean {
  const requiredKeys = (value: unknown) =>
    new Set(
      (Array.isArray(value) ? value : [])
        .filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === 'object' && entry['mode'] === 'required'
        )
        .map(keyOf)
    )
  const beforeRequired = requiredKeys(before)
  const afterRequired = requiredKeys(after)
  return [...beforeRequired].some((key) => !afterRequired.has(key))
}

function riskReason(
  targetKind: 'creator_role' | 'context_bundle',
  changePath: string,
  before: unknown,
  after: unknown
): string {
  if (isHighRisk(targetKind, changePath, before, after)) {
    if (targetKind === 'creator_role') return 'Changes an effective permission or output destination'
    return 'Removes or weakens a required context source'
  }
  return 'Changes author-configurable assistant behavior or context selection'
}
