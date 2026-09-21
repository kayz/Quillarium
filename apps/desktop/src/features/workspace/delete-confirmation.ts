const BRANCH_LEVELS = ['volume', 'part', 'arc', 'act', 'chapter', 'section']

export interface DeleteTargetSummary {
  type: string
  level: string
  id: string
  title: string
  acceptedScene: boolean
  chapterSceneIds: unknown
}

export function isStoryBranch(target: Pick<DeleteTargetSummary, 'type' | 'level'>): boolean {
  return target.type === 'outline' && BRANCH_LEVELS.includes(target.level)
}

export function sceneIsInChapterProse(target: DeleteTargetSummary): boolean {
  return (
    target.acceptedScene &&
    Array.isArray(target.chapterSceneIds) &&
    target.chapterSceneIds.includes(target.id)
  )
}

export function deleteConfirmationMessage(target: DeleteTargetSummary): string {
  if (isStoryBranch(target)) {
    return `删除「${target.title}」及其全部下级内容？只要其中没有已发布正文，卷、篇、幕、章、节及相关运行记录都会一并删除。`
  }
  if (target.acceptedScene) {
    return sceneIsInChapterProse(target)
      ? `删除节「${target.title}」？它的节文件和运行记录会删除；已经写入章正文的文字会保留，供你在章正文中手工调整。`
      : `删除节「${target.title}」？节文件和运行记录会删除。若章正文尚未纳入本节，章正文不变；若已经写入，已写入的文字会留在章正文里供手改。`
  }
  return `删除「${target.title}」？此操作会删除对应文件和相关运行记录。`
}
