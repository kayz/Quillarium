import { z } from 'zod'
import {
  agentOperationSchema,
  agentResultTypeSchema,
  agentTaskIdSchema,
  getAgentTaskDefinition
} from './agent-tasks.js'
import { loadContextBundle } from './context-bundles.js'
import { withProjectWriteLock } from './project-write-lock.js'
import { projectIdSchema } from './schema.js'
import {
  createVersionedYaml,
  deleteVersionedYaml,
  listVersionedYaml,
  loadVersionedYaml,
  updateVersionedYaml,
  type LoadedVersionedYaml
} from './versioned-yaml-store.js'
import { ensureDefaultWritingPreset, loadWritingPreset } from './writing-presets.js'
import {
  ensureBuiltinAssistantPrompts,
  creatorAssistantIdForTask,
  loadAssistantPromptVersion
} from './assistant-prompts.js'

export const creatorRoleV1Schema = z
  .object({
    schema_version: z.literal(1),
    id: projectIdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u),
    title: z.string().min(1),
    description: z.string(),
    task_id: agentTaskIdSchema,
    behavior_instructions: z.array(z.string().min(1)).min(1),
    context_bundle_id: projectIdSchema,
    assistant_prompt_id: projectIdSchema.optional(),
    writing_preset_id: projectIdSchema,
    enabled_operations: z.array(agentOperationSchema).min(1),
    output_disposition: agentResultTypeSchema
  })
  .strict()
  .superRefine((role, context) => {
    const task = getAgentTaskDefinition(role.task_id)
    if (!['organize-setting', 'character-rehearsal', 'continuity-review'].includes(role.task_id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['task_id'],
        message: 'User-configured creator roles can only use creator-assistant tasks'
      })
    }
    const ceiling = new Set(task.capability_ceiling)
    role.enabled_operations.forEach((operation, index) => {
      if (!ceiling.has(operation)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['enabled_operations', index],
          message: `Operation exceeds the ${role.task_id} task capability ceiling: ${operation}`
        })
      }
    })
    if (new Set(role.enabled_operations).size !== role.enabled_operations.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['enabled_operations'],
        message: 'Enabled operations cannot contain duplicates'
      })
    }
    if (!task.allowed_result_types.includes(role.output_disposition)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['output_disposition'],
        message: `Output type is not allowed by ${role.task_id}: ${role.output_disposition}`
      })
    }
    const requiredOperation =
      role.output_disposition === 'candidate'
        ? ('generate_candidate' as const)
        : role.output_disposition === 'planning_proposal'
          ? ('propose_planning_record' as const)
          : role.output_disposition === 'issue_proposal'
            ? ('propose_issue' as const)
            : undefined
    if (!role.enabled_operations.includes('append_exploration')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['enabled_operations'],
        message: 'Creator roles must allow append_exploration for their durable session record'
      })
    }
    if (requiredOperation && !role.enabled_operations.includes(requiredOperation)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['enabled_operations'],
        message: `Output type ${role.output_disposition} requires operation ${requiredOperation}`
      })
    }
  })

export type CreatorRoleV1 = z.infer<typeof creatorRoleV1Schema>
export type LoadedCreatorRole = LoadedVersionedYaml<CreatorRoleV1>

const DIRECTORY = 'creator-roles'

export async function listCreatorRoles(projectRoot: string): Promise<LoadedCreatorRole[]> {
  return listVersionedYaml(projectRoot, DIRECTORY, creatorRoleV1Schema)
}

export async function loadCreatorRole(projectRoot: string, id: string): Promise<LoadedCreatorRole> {
  return loadVersionedYaml(projectRoot, DIRECTORY, id, creatorRoleV1Schema)
}

export async function createCreatorRole(
  projectRoot: string,
  role: CreatorRoleV1
): Promise<LoadedCreatorRole> {
  return withProjectWriteLock(projectRoot, async () => {
    const parsed = creatorRoleV1Schema.parse(role) as CreatorRoleV1
    await validateCreatorRoleReferences(projectRoot, parsed)
    return createVersionedYaml(projectRoot, DIRECTORY, parsed, creatorRoleV1Schema)
  })
}

export async function updateCreatorRole(
  projectRoot: string,
  role: CreatorRoleV1,
  expectedSha256: string
): Promise<LoadedCreatorRole> {
  return withProjectWriteLock(projectRoot, async () => {
    const parsed = creatorRoleV1Schema.parse(role) as CreatorRoleV1
    await validateCreatorRoleReferences(projectRoot, parsed)
    return updateVersionedYaml(projectRoot, DIRECTORY, parsed, expectedSha256, creatorRoleV1Schema)
  })
}

export async function deleteCreatorRole(
  projectRoot: string,
  id: string,
  expectedSha256: string
): Promise<void> {
  await withProjectWriteLock(projectRoot, async () => {
    await deleteVersionedYaml(projectRoot, DIRECTORY, id, expectedSha256, creatorRoleV1Schema)
  })
}

export async function validateCreatorRoleReferences(projectRoot: string, role: CreatorRoleV1): Promise<void> {
  await Promise.all([
    loadContextBundle(projectRoot, role.context_bundle_id),
    loadWritingPreset(projectRoot, role.writing_preset_id),
    ...(role.assistant_prompt_id
      ? [
          loadAssistantPromptVersion(
            projectRoot,
            creatorAssistantIdForTask(role.task_id),
            role.assistant_prompt_id
          )
        ]
      : [])
  ])
}

export async function ensureBuiltinCreatorRoles(projectRoot: string): Promise<LoadedCreatorRole[]> {
  return withProjectWriteLock(projectRoot, async () => {
    await ensureDefaultWritingPreset(projectRoot)
    await ensureBuiltinAssistantPrompts(projectRoot)
    const { createContextBundle, listContextBundles } = await import('./context-bundles.js')
    const bundles = await listContextBundles(projectRoot)
    const bundleIds = new Set(bundles.map((item) => item.value.id))
    for (const bundle of builtinBundles()) {
      if (!bundleIds.has(bundle.id)) await createContextBundle(projectRoot, bundle)
    }

    const roles = await listCreatorRoles(projectRoot)
    const roleIds = new Set(roles.map((item) => item.value.id))
    for (const role of builtinRoles()) {
      if (!roleIds.has(role.id)) await createCreatorRole(projectRoot, role)
    }
    return listCreatorRoles(projectRoot)
  })
}

function builtinBundles() {
  return [
    {
      schema_version: 1 as const,
      id: 'setting-organizer',
      version: '1.0.0',
      title: '设定整理资料包',
      description: '当前材料、显式关系和项目约束。',
      sources: [],
      dynamic_selectors: [
        { kind: 'current_target' as const, mode: 'required' as const, usage: 'subject' as const },
        {
          kind: 'explicit_relations' as const,
          mode: 'preferred' as const,
          usage: 'evidence' as const,
          max_depth: 1
        }
      ],
      exclusions: []
    },
    {
      schema_version: 1 as const,
      id: 'character-rehearsal',
      version: '1.0.0',
      title: '人物试戏资料包',
      description: '人物、当前时段关系、地点和相关 Canon。',
      sources: [],
      dynamic_selectors: [
        { kind: 'current_target' as const, mode: 'required' as const, usage: 'subject' as const },
        {
          kind: 'explicit_relations' as const,
          mode: 'preferred' as const,
          usage: 'evidence' as const,
          max_depth: 1
        },
        {
          kind: 'active_timeline_context' as const,
          mode: 'preferred' as const,
          usage: 'constraint' as const
        }
      ],
      exclusions: []
    },
    {
      schema_version: 1 as const,
      id: 'continuity-review',
      version: '1.0.0',
      title: '连续性审阅资料包',
      description: '当前章或节、纲目祖先、时间线与相关已接受正文。',
      sources: [],
      dynamic_selectors: [
        { kind: 'current_target' as const, mode: 'required' as const, usage: 'subject' as const },
        {
          kind: 'outline_ancestors' as const,
          mode: 'preferred' as const,
          usage: 'constraint' as const
        },
        {
          kind: 'explicit_relations' as const,
          mode: 'preferred' as const,
          usage: 'evidence' as const,
          max_depth: 1
        },
        {
          kind: 'active_timeline_context' as const,
          mode: 'preferred' as const,
          usage: 'constraint' as const
        },
        {
          kind: 'accepted_prose_context' as const,
          mode: 'preferred' as const,
          usage: 'evidence' as const
        }
      ],
      exclusions: []
    }
  ]
}

function builtinRoles(): CreatorRoleV1[] {
  return [
    {
      schema_version: 1,
      id: 'setting-organizer',
      version: '1.0.0',
      title: '设定整理助手',
      description: '把原始资料转成可审阅的规划卡提案。',
      task_id: 'organize-setting',
      behavior_instructions: [
        'Preserve uncertainty and source distinctions.',
        'Return proposals only; never claim that a proposal is accepted project fact.'
      ],
      context_bundle_id: 'setting-organizer',
      assistant_prompt_id: 'setting-organizer-1-0-0',
      writing_preset_id: 'default',
      enabled_operations: [
        'converse',
        'append_exploration',
        'propose_planning_record',
        'propose_configuration_change'
      ],
      output_disposition: 'planning_proposal'
    },
    {
      schema_version: 1,
      id: 'character-rehearsal',
      version: '1.0.0',
      title: '人物试戏助手',
      description: '围绕人物在当前时空与关系中的反应进行探索。',
      task_id: 'character-rehearsal',
      behavior_instructions: [
        'Treat the rehearsal as exploration, not canon.',
        'Point out missing time, location, state, or relationship evidence.'
      ],
      context_bundle_id: 'character-rehearsal',
      assistant_prompt_id: 'character-rehearsal-1-0-0',
      writing_preset_id: 'default',
      enabled_operations: [
        'converse',
        'append_exploration',
        'generate_candidate',
        'propose_planning_record',
        'propose_configuration_change'
      ],
      output_disposition: 'planning_proposal'
    },
    {
      schema_version: 1,
      id: 'continuity-review',
      version: '1.0.0',
      title: '连续性审阅助手',
      description: '对当前章或节给出可追踪的冲突与问题提案。',
      task_id: 'continuity-review',
      behavior_instructions: [
        'Cite the supplied evidence for every conflict.',
        'Create issue proposals only; never rewrite accepted or finalized prose.'
      ],
      context_bundle_id: 'continuity-review',
      assistant_prompt_id: 'continuity-review-1-0-0',
      writing_preset_id: 'default',
      enabled_operations: ['converse', 'append_exploration', 'propose_issue', 'propose_configuration_change'],
      output_disposition: 'issue_proposal'
    }
  ].map((role) => creatorRoleV1Schema.parse(role) as CreatorRoleV1)
}
