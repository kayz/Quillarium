import { z } from 'zod'

export const agentOperationSchema = z.enum([
  'converse',
  'append_exploration',
  'propose_planning_record',
  'propose_issue',
  'generate_candidate',
  'propose_finalization',
  'propose_configuration_change'
])

export const agentResultTypeSchema = z.enum([
  'exploration',
  'candidate',
  'planning_proposal',
  'issue_proposal',
  'finalization_proposal'
])

export const agentTaskIdSchema = z.enum([
  'import-material',
  'planning-card',
  'scene-generation',
  'continuity-check',
  'finalization-review',
  'organize-setting',
  'character-rehearsal',
  'continuity-review'
])

export type AgentOperation = z.infer<typeof agentOperationSchema>
export type AgentResultType = z.infer<typeof agentResultTypeSchema>
export type AgentTaskId = z.infer<typeof agentTaskIdSchema>

export const agentTaskDefinitionV1Schema = z
  .object({
    schema_version: z.literal(1),
    id: agentTaskIdSchema,
    version: z.literal('1.0.0'),
    title: z.string().min(1),
    description: z.string().min(1),
    input_schema_id: z.string().min(1),
    output_schema_id: z.string().min(1),
    context_scopes: z.array(z.string().min(1)).min(1),
    capability_ceiling: z.array(agentOperationSchema).min(1),
    allowed_result_types: z.array(agentResultTypeSchema).min(1)
  })
  .strict()

export type AgentTaskDefinitionV1 = z.infer<typeof agentTaskDefinitionV1Schema>

const definitions = [
  {
    schema_version: 1,
    id: 'import-material',
    version: '1.0.0',
    title: '资料导入',
    description: '把作者提供的原始资料拆分为等待校对的项目记录提案。',
    input_schema_id: 'quillarium.agent.import-material.v1',
    output_schema_id: 'quillarium.agent.import-proposal.v1',
    context_scopes: ['provided-material', 'project-index'],
    capability_ceiling: ['propose_planning_record'],
    allowed_result_types: ['planning_proposal']
  },
  {
    schema_version: 1,
    id: 'planning-card',
    version: '1.0.0',
    title: '规划卡协作',
    description: '围绕一个规划卡对话并形成待作者确认的结构化提案。',
    input_schema_id: 'quillarium.agent.planning-message.v1',
    output_schema_id: 'quillarium.agent.planning-proposal.v1',
    context_scopes: ['current-target', 'explicit-relations', 'canon'],
    capability_ceiling: ['converse', 'propose_planning_record'],
    allowed_result_types: ['planning_proposal']
  },
  {
    schema_version: 1,
    id: 'scene-generation',
    version: '1.0.0',
    title: '节候选生成',
    description: '根据章、节和确定性上下文生成不具权威性的正文候选稿。',
    input_schema_id: 'quillarium.agent.scene-prompt.v1',
    output_schema_id: 'quillarium.agent.prose-candidate.v1',
    context_scopes: ['current-target', 'outline-ancestors', 'timeline', 'accepted-prose', 'canon'],
    capability_ceiling: ['generate_candidate'],
    allowed_result_types: ['candidate']
  },
  {
    schema_version: 1,
    id: 'continuity-check',
    version: '1.0.0',
    title: '内容检查',
    description: '对章或节执行确定性与语义检查，并形成非执行性问题结果。',
    input_schema_id: 'quillarium.agent.check-input.v1',
    output_schema_id: 'quillarium.agent.check-report.v1',
    context_scopes: ['current-target', 'timeline', 'character-state', 'location', 'canon'],
    capability_ceiling: ['propose_issue'],
    allowed_result_types: ['issue_proposal']
  },
  {
    schema_version: 1,
    id: 'finalization-review',
    version: '1.0.0',
    title: '定稿反查',
    description: '从已定稿章正文提出连续性变更，等待作者逐项确认后再由应用服务写入。',
    input_schema_id: 'quillarium.agent.finalization-input.v1',
    output_schema_id: 'quillarium.agent.finalization-proposal.v1',
    context_scopes: ['final-prose', 'timeline', 'character-state', 'canon'],
    capability_ceiling: ['propose_finalization'],
    allowed_result_types: ['finalization_proposal']
  },
  {
    schema_version: 1,
    id: 'organize-setting',
    version: '1.0.0',
    title: '设定整理',
    description: '把原始材料整理为可审阅的规划卡提案。',
    input_schema_id: 'quillarium.agent.author-message.v1',
    output_schema_id: 'quillarium.agent.turn-output.v1',
    context_scopes: ['project', 'current-target', 'explicit-relations'],
    capability_ceiling: [
      'converse',
      'append_exploration',
      'propose_planning_record',
      'propose_configuration_change'
    ],
    allowed_result_types: ['exploration', 'planning_proposal']
  },
  {
    schema_version: 1,
    id: 'character-rehearsal',
    version: '1.0.0',
    title: '人物试戏',
    description: '在明确时段、地点与 Canon 约束下探索人物反应，不写入事实层。',
    input_schema_id: 'quillarium.agent.character-rehearsal-workflow.v1',
    output_schema_id: 'quillarium.agent.turn-output.v1',
    context_scopes: ['current-target', 'timeline', 'character-state', 'location', 'canon'],
    capability_ceiling: [
      'converse',
      'append_exploration',
      'generate_candidate',
      'propose_planning_record',
      'propose_configuration_change'
    ],
    allowed_result_types: ['exploration', 'candidate', 'planning_proposal']
  },
  {
    schema_version: 1,
    id: 'continuity-review',
    version: '1.0.0',
    title: '连续性审阅',
    description: '检查章或节与设定、时间线及人物状态的冲突，只创建问题提案。',
    input_schema_id: 'quillarium.agent.continuity-range.v1',
    output_schema_id: 'quillarium.agent.turn-output.v1',
    context_scopes: ['current-target', 'outline-ancestors', 'timeline', 'accepted-prose', 'canon'],
    capability_ceiling: ['converse', 'append_exploration', 'propose_issue', 'propose_configuration_change'],
    allowed_result_types: ['exploration', 'issue_proposal']
  }
] as const

export const BUILTIN_AGENT_TASKS: readonly AgentTaskDefinitionV1[] = Object.freeze(
  definitions.map((definition) =>
    Object.freeze(agentTaskDefinitionV1Schema.parse(definition) as AgentTaskDefinitionV1)
  )
)

export function listAgentTaskDefinitions(): AgentTaskDefinitionV1[] {
  return BUILTIN_AGENT_TASKS.map((definition) => structuredClone(definition))
}

export function getAgentTaskDefinition(id: string): AgentTaskDefinitionV1 {
  const definition = BUILTIN_AGENT_TASKS.find((item) => item.id === id)
  if (!definition) throw new Error(`Unknown Agent task definition: ${id}`)
  return structuredClone(definition)
}
