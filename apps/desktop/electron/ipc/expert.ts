import {
  applyChapterEval,
  applyOutlineOrganize,
  applyWorldOrganize,
  type ChapterEvalProposalSet,
  type OutlineOrganizeProposalSet,
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
    throw new Error(detail && /[\u4e00-\u9fff]/u.test(detail) ? detail : `大纲整理失败：${outcome.error.code}`)
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
    throw new Error(detail && /[\u4e00-\u9fff]/u.test(detail) ? detail : `世界书整理失败：${outcome.error.code}`)
  }

  return outcome.result as WorldOrganizeProposalSet
}
