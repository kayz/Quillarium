import { UNCONFIRMED_EVAL } from './chapter-eval.js'

export const STALE_ASSISTANT_TURN = '本轮提案已过期，请重新打开确认。'
export const MISSING_ASSISTANT_PROPOSAL = (id: string) => `找不到本轮提案：${id}`
export const MISSING_UPDATE_CARD = '找不到要更新的设定卡。'
export const DISABLED_UPDATE_CARD = '不能更新已禁用的设定卡。'

export interface AssistantTurnDecisions {
  confirmed: boolean
  creates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
  updates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
  issues: string[]
  configs: string[]
}

export async function applyAssistantTurn(
  projectRoot: string,
  sessionId: string,
  turnId: string,
  decisions: AssistantTurnDecisions,
  expectedTurnSha256: string
): Promise<{
  created_ids: string[]
  updated_ids: string[]
  issue_ids: string[]
  config_ids: string[]
  rejected_ids: string[]
}> {
  if (!decisions.confirmed) throw new Error(UNCONFIRMED_EVAL)
  void projectRoot
  void sessionId
  void turnId
  void expectedTurnSha256
  return { created_ids: [], updated_ids: [], issue_ids: [], config_ids: [], rejected_ids: [] }
}
