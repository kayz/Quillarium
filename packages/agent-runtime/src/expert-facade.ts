import {
  CHAPTER_IS_LEAF,
  getAgentTaskDefinition,
  loadChapterProseForEval,
  loadCharacterForRelationAnalyze,
  loadOutlineSubtreeForOrganize,
  MISSING_CHARACTER,
  NO_CHARACTER_SELECTION,
  NO_OUTLINE_SELECTION
} from '@quillarium/core'
import type {
  AgentExecutionOutcome,
  AgentRuntimeDependencies,
  AgentRuntimeExecutionRequest
} from './contracts.js'
import type { AgentRuntimeErrorV1 } from './errors.js'
import { executeAgentTask } from './executor.js'

export const EXPERT_LANE_ONLY = '专家门面只接受专家任务。'
export const EXPERT_NO_PROSE_GEN = '专家模式不能生成正文。'

export async function executeExpertTask(
  request: {
    projectRoot: string
    task_id: string
    input: Record<string, unknown>
  },
  dependencies?: AgentRuntimeDependencies
): Promise<AgentExecutionOutcome<unknown, AgentRuntimeErrorV1>> {
  if (request.task_id === 'planning-integrity-review') {
    return executeAgentTask(
      {
        schema_version: 1,
        task_id: 'planning-integrity-review',
        projectRoot: request.projectRoot,
        target: { type: 'project', id: 'project' },
        input: request.input,
        language: 'zh',
        requested_by: 'author'
      } satisfies AgentRuntimeExecutionRequest,
      dependencies
    )
  }

  let definition
  try {
    definition = getAgentTaskDefinition(request.task_id)
  } catch {
    throw new Error(EXPERT_LANE_ONLY)
  }
  if (definition.lane !== 'expert') throw new Error(EXPERT_LANE_ONLY)
  if (definition.capability_ceiling.includes('generate_candidate')) {
    throw new Error(EXPERT_NO_PROSE_GEN)
  }
  if (request.task_id === 'continuity-check') {
    const chapterId = String(request.input.chapter_id ?? '')
    const prose = await loadChapterProseForEval(request.projectRoot, chapterId)
    if (!prose) throw new Error('没有章正文，不能评估。')
  }
  if (request.task_id === 'organize-outline') {
    const outlineId = String(request.input.outline_id ?? '')
    const subtree = await loadOutlineSubtreeForOrganize(request.projectRoot, outlineId)
    if (!subtree) throw new Error(NO_OUTLINE_SELECTION)
    if (subtree.root.level === 'chapter') throw new Error(CHAPTER_IS_LEAF)
  }
  if (request.task_id === 'analyze-relations') {
    const characterId = String(request.input.character_id ?? '')
    if (!characterId.trim()) throw new Error(NO_CHARACTER_SELECTION)
    const character = await loadCharacterForRelationAnalyze(request.projectRoot, characterId)
    if (!character) throw new Error(MISSING_CHARACTER)
  }

  const target =
    request.task_id === 'continuity-check'
      ? { type: 'chapter_prose', id: String(request.input.chapter_id ?? '') }
      : request.task_id === 'organize-outline'
        ? { type: 'outline', id: String(request.input.outline_id ?? '') }
        : request.task_id === 'organize-worldbook'
          ? { type: 'project', id: 'project' }
          : request.task_id === 'analyze-relations'
            ? { type: 'character', id: String(request.input.character_id ?? '') }
            : request.task_id === 'manage-foreshadowing'
              ? { type: 'project', id: 'project' }
              : null

  return executeAgentTask(
    {
      schema_version: 1,
      task_id: request.task_id,
      projectRoot: request.projectRoot,
      target,
      input: request.input,
      language: 'zh',
      requested_by: 'author'
    } satisfies AgentRuntimeExecutionRequest,
    dependencies
  )
}
