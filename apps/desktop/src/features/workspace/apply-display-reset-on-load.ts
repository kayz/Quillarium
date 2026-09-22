import type { LanguageName } from '../../app/types.js'

export interface DisplayResetLoaded {
  project: { display_layer?: { migrated?: boolean } }
}

export interface DisplayResetSession<TLoaded extends DisplayResetLoaded> {
  loaded: TLoaded | undefined
  promptedRoot: string | null
}

export async function applyDisplayResetOnLoad<TLoaded extends DisplayResetLoaded>(
  session: DisplayResetSession<TLoaded>,
  options: {
    root: string
    language: LanguageName
    needsMigration: boolean
    confirm: (message: string) => boolean
    resetDisplayLayer: (root: string) => Promise<unknown>
    loadProject: (root: string) => Promise<TLoaded>
  }
): Promise<void> {
  const loaded = session.loaded
  if (!loaded) return

  const migrated = loaded.project.display_layer?.migrated
  if (options.needsMigration && migrated === true) {
    session.loaded = undefined
    await options.resetDisplayLayer(options.root)
    session.loaded = await options.loadProject(options.root)
    return
  }

  if (options.needsMigration && migrated !== true && session.promptedRoot !== options.root) {
    const confirmed = options.confirm(
      options.language === 'zh'
        ? '将删除本项目 assets/settings 下的设定图，并从卡片去掉配图字段。此操作不能恢复。继续？'
        : 'This deletes setting images under assets/settings and removes image fields from cards. It cannot be undone. Continue?'
    )
    if (!confirmed) {
      session.promptedRoot = options.root
      return
    }
    session.loaded = undefined
    await options.resetDisplayLayer(options.root)
    session.loaded = await options.loadProject(options.root)
  }
}
