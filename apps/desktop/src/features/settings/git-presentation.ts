import type { GitState, LanguageName } from '../../app/types.js'
import { t } from '../../app/i18n.js'

export function gitActionFor(
  language: LanguageName,
  git?: GitState | null
): { label: string; title: string } {
  if (!git) {
    return {
      label: t(language, 'localOnly'),
      title: t(language, 'localOnlyHint')
    }
  }
  if (!git.initialized) {
    return {
      label: t(language, 'localOnly'),
      title: t(language, 'localOnlyHint')
    }
  }
  if (!git.remote) {
    return {
      label:
        git.repositoryScope === 'workspace'
          ? language === 'zh'
            ? '工作区 Git'
            : 'Workspace Git'
          : t(language, 'localGit'),
      title:
        git.repositoryScope === 'workspace'
          ? language === 'zh'
            ? '当前作品由本地写作库的 Git 管理；可在工作区根目录配置 GitHub remote。'
            : 'This project is managed by local workspace Git; configure a GitHub remote at the workspace root if needed.'
          : t(language, 'localGitHint')
    }
  }
  if (git.dirty) {
    return {
      label: t(language, 'githubChangesPending'),
      title: t(language, 'syncGithubChangesHint')
    }
  }
  return {
    label: t(language, 'githubSynced'),
    title: t(language, 'githubSyncedHint')
  }
}
