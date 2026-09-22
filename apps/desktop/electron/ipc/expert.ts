import {
  applyChapterEval,
  type ChapterEvalProposalSet
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
}

export async function evaluateChapterProse(
  root: string,
  chapterId: string
): Promise<ChapterEvalProposalSet> {
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
