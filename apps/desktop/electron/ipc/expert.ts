import {
  applyChapterEval,
  applyForeshadowManage,
  applyOutlineOrganize,
  applyRelationAnalyze,
  applyTimelineManage,
  applyWorldOrganize,
  type ChapterEvalProposalSet,
  type ForeshadowManageProposalSet,
  type OutlineOrganizeProposalSet,
  type RelationAnalyzeProposalSet,
  type TimelineManageProposalSet,
  type WorldOrganizeProposalSet
} from '@quillarium/core'
import { executeExpertTask } from '@quillarium/agent-runtime'
import { loadDesktopAIProfile } from './credentials.js'
import { typedHandle } from './contract.js'

export function registerExpertHandlers(): void {
  typedHandle('expert:evaluateChapter', async (_event, root, chapterId) =>
    evaluateChapterProse(root, chapterId)
  )
  typedHandle('expert:applyChapterEval', async (_event, root, proposals, decisions) =>
    applyChapterEval(root, proposals, decisions)
  )
  typedHandle('expert:organizeOutline', async (_event, root, outlineId) =>
    evaluateOutlineOrganize(root, outlineId)
  )
  typedHandle('expert:applyOutlineOrganize', async (_event, root, proposals, decisions) =>
    applyOutlineOrganize(root, proposals, decisions)
  )
  typedHandle('expert:organizeWorldbook', async (_event, root) => evaluateWorldOrganize(root))
  typedHandle('expert:applyWorldOrganize', async (_event, root, proposals, decisions) =>
    applyWorldOrganize(root, proposals, decisions)
  )
  typedHandle('expert:analyzeRelations', async (_event, root, characterId) =>
    evaluateRelationAnalyze(root, characterId)
  )
  typedHandle('expert:applyRelationAnalyze', async (_event, root, proposals, decisions) =>
    applyRelationAnalyze(root, proposals, decisions)
  )
  typedHandle('expert:manageForeshadowing', async (_event, root) => evaluateForeshadowManage(root))
  typedHandle('expert:applyForeshadowManage', async (_event, root, proposals, decisions) =>
    applyForeshadowManage(root, proposals, decisions)
  )
  typedHandle('expert:manageTimeline', async (_event, root, trackId) => evaluateTimelineManage(root, trackId))
  typedHandle('expert:applyTimelineManage', async (_event, root, proposals, decisions) =>
    applyTimelineManage(root, proposals, decisions)
  )
}

export async function evaluateChapterProse(root: string, chapterId: string): Promise<ChapterEvalProposalSet> {
  const outcome = await executeExpertTask(
    {
      projectRoot: root,
      task_id: 'continuity-check',
      input: { chapter_id: chapterId }
    },
    {
      loadAIProfile: (profile) => loadDesktopAIProfile(profile)
    }
  )

  if (outcome.status !== 'completed') {
    const detail = outcome.error.technical_detail?.trim()
    throw new Error(detail && /[\u4e00-\u9fff]/u.test(detail) ? detail : `章评估失败：${outcome.error.code}`)
  }

  return outcome.result as ChapterEvalProposalSet
}

export async function evaluateOutlineOrganize(
  root: string,
  outlineId: string
): Promise<OutlineOrganizeProposalSet> {
  const outcome = await executeExpertTask(
    {
      projectRoot: root,
      task_id: 'organize-outline',
      input: { outline_id: outlineId }
    },
    {
      loadAIProfile: (profile) => loadDesktopAIProfile(profile)
    }
  )

  if (outcome.status !== 'completed') {
    const detail = outcome.error.technical_detail?.trim()
    throw new Error(
      detail && /[\u4e00-\u9fff]/u.test(detail) ? detail : `大纲整理失败：${outcome.error.code}`
    )
  }

  return outcome.result as OutlineOrganizeProposalSet
}

export async function evaluateWorldOrganize(root: string): Promise<WorldOrganizeProposalSet> {
  const outcome = await executeExpertTask(
    {
      projectRoot: root,
      task_id: 'organize-worldbook',
      input: {}
    },
    {
      loadAIProfile: (profile) => loadDesktopAIProfile(profile)
    }
  )

  if (outcome.status !== 'completed') {
    const detail = outcome.error.technical_detail?.trim()
    throw new Error(
      detail && /[\u4e00-\u9fff]/u.test(detail) ? detail : `世界书整理失败：${outcome.error.code}`
    )
  }

  return outcome.result as WorldOrganizeProposalSet
}

export async function evaluateRelationAnalyze(
  root: string,
  characterId: string
): Promise<RelationAnalyzeProposalSet> {
  const outcome = await executeExpertTask(
    {
      projectRoot: root,
      task_id: 'analyze-relations',
      input: { character_id: characterId }
    },
    {
      loadAIProfile: (profile) => loadDesktopAIProfile(profile)
    }
  )

  if (outcome.status !== 'completed') {
    const detail = outcome.error.technical_detail?.trim()
    throw new Error(
      detail && /[\u4e00-\u9fff]/u.test(detail) ? detail : `分析关系失败：${outcome.error.code}`
    )
  }

  return outcome.result as RelationAnalyzeProposalSet
}

export async function evaluateForeshadowManage(root: string): Promise<ForeshadowManageProposalSet> {
  const outcome = await executeExpertTask(
    {
      projectRoot: root,
      task_id: 'manage-foreshadowing',
      input: {}
    },
    {
      loadAIProfile: (profile) => loadDesktopAIProfile(profile)
    }
  )

  if (outcome.status !== 'completed') {
    const detail = outcome.error.technical_detail?.trim()
    throw new Error(
      detail && /[\u4e00-\u9fff]/u.test(detail) ? detail : `管理伏笔失败：${outcome.error.code}`
    )
  }

  return outcome.result as ForeshadowManageProposalSet
}

export async function evaluateTimelineManage(
  root: string,
  trackId: string
): Promise<TimelineManageProposalSet> {
  const outcome = await executeExpertTask(
    {
      projectRoot: root,
      task_id: 'manage-timeline',
      input: { track_id: trackId }
    },
    {
      loadAIProfile: (profile) => loadDesktopAIProfile(profile)
    }
  )

  if (outcome.status !== 'completed') {
    const detail = outcome.error.technical_detail?.trim()
    throw new Error(
      detail && /[\u4e00-\u9fff]/u.test(detail) ? detail : `整理时间线失败：${outcome.error.code}`
    )
  }

  return outcome.result as TimelineManageProposalSet
}
