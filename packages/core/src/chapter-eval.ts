import { rm } from 'node:fs/promises'
import { createIssue, createWorldEntry, listDocs } from './documents.js'
import { pathExists, readMarkdown } from './fs.js'
import { specializePlanningCard } from './planning-specialize.js'
import { withProjectWriteLock } from './project-write-lock.js'
import type { ChapterProseDoc } from './types.js'

export const NO_CHAPTER_PROSE = '没有章正文，不能评估。'
export const UNCONFIRMED_EVAL = '提案尚未确认，不能写入。'

export async function loadChapterProseForEval(
  projectRoot: string,
  chapterId: string
): Promise<{ path: string; data: { id: string; chapter_id: string }; content: string } | null> {
  const prose = (await listDocs<ChapterProseDoc>(projectRoot, 'chapter_prose')).find(
    (item) => item.data.chapter_id === chapterId
  )
  if (!prose || !prose.content.trim()) return null
  return {
    path: prose.path,
    data: { id: prose.data.id, chapter_id: prose.data.chapter_id },
    content: prose.content
  }
}

export interface ChapterEvalIssueProposal {
  proposal_id: string
  title: string
  body: string
}

export interface ChapterEvalSettingProposal {
  proposal_id: string
  title: string
  content: string
  type: 'world_entry'
  fields: Record<string, unknown>
}

export interface ChapterEvalProposalSet {
  eval_id: string
  chapter_id: string
  issues: ChapterEvalIssueProposal[]
  settings: ChapterEvalSettingProposal[]
}

export async function applyChapterEval(
  projectRoot: string,
  proposals: ChapterEvalProposalSet,
  decisions: {
    confirmed: boolean
    issues: string[]
    settings: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
  }
): Promise<{ issue_ids: string[]; setting_ids: string[] }> {
  if (!decisions.confirmed) throw new Error(UNCONFIRMED_EVAL)

  return withProjectWriteLock(projectRoot, async () => {
    const issueIds: string[] = []
    const settingIds: string[] = []

    for (const proposalId of decisions.issues) {
      const proposal = proposals.issues.find((item) => item.proposal_id === proposalId)
      if (!proposal) throw new Error(`找不到问题提案：${proposalId}`)
      const file = await createIssue(
        projectRoot,
        proposal.title,
        { related_docs: [proposals.chapter_id] },
        proposal.body
      )
      const written = await readMarkdown<{ id: string }>(file)
      issueIds.push(written.data.id)
    }

    for (const decision of decisions.settings) {
      const proposal = proposals.settings.find((item) => item.proposal_id === decision.proposal_id)
      if (!proposal) throw new Error(`找不到设定提案：${decision.proposal_id}`)

      const targetType = decision.type ?? proposal.type
      const fields = decision.fields ?? proposal.fields
      const file = await createWorldEntry(projectRoot, proposal.title, {}, proposal.content)
      const created = await readMarkdown<{ id: string }>(file)
      let settingId = created.data.id

      if (targetType && targetType !== 'world_entry') {
        try {
          const specialized = await specializePlanningCard(projectRoot, settingId, targetType, fields)
          settingId = specialized.data.id
        } catch (error) {
          if (await pathExists(file)) await rm(file, { force: true })
          throw error
        }
      }

      settingIds.push(settingId)
    }

    return { issue_ids: issueIds, setting_ids: settingIds }
  })
}
