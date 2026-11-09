import path from 'node:path'
import { dialog } from 'electron'
import {
  applyShortPlayAssetProposals,
  buildShortPlayExportPackage,
  deleteShortPlayAsset,
  exportShortPlayPromptsToFile,
  listSceneStoryboards,
  listShortPlayAssets,
  loadProject,
  loadSceneStoryboard,
  loadShortPlaySettings,
  proposeSceneStoryboard,
  proposeShortPlayAssetsFromWorldbook,
  reconcileShortPlayAssetBySeedId,
  reorderSceneStoryboardShots,
  saveSceneStoryboard,
  saveShortPlayAsset,
  saveShortPlaySettings,
  slugify
} from '@quillarium/core'
import { typedHandle } from './contract.js'

export function registerShortPlayHandlers(): void {
  typedHandle('shortPlay:loadSettings', async (_event, root) => loadShortPlaySettings(root))

  typedHandle('shortPlay:saveSettings', async (_event, root, input) => saveShortPlaySettings(root, input))

  typedHandle('shortPlay:listAssets', async (_event, root) => listShortPlayAssets(root))

  typedHandle('shortPlay:saveAsset', async (_event, root, input) => saveShortPlayAsset(root, input))

  typedHandle('shortPlay:deleteAsset', async (_event, root, assetId) => {
    await deleteShortPlayAsset(root, assetId)
    return true
  })

  typedHandle('shortPlay:proposeAssets', async (_event, root) => proposeShortPlayAssetsFromWorldbook(root))

  typedHandle('shortPlay:applyAssetProposals', async (_event, root, proposals) =>
    applyShortPlayAssetProposals(root, proposals)
  )

  typedHandle('shortPlay:reconcileAssetBySeed', async (_event, root, seedId, externalResultRef) =>
    reconcileShortPlayAssetBySeedId(root, seedId, externalResultRef)
  )

  typedHandle('shortPlay:loadStoryboard', async (_event, root, sceneId) => loadSceneStoryboard(root, sceneId))

  typedHandle('shortPlay:listStoryboards', async (_event, root) => listSceneStoryboards(root))

  typedHandle('shortPlay:saveStoryboard', async (_event, root, input) => saveSceneStoryboard(root, input))

  typedHandle('shortPlay:reorderStoryboardShots', async (_event, root, sceneId, orderedShotIds) =>
    reorderSceneStoryboardShots(root, sceneId, orderedShotIds)
  )

  typedHandle('shortPlay:proposeStoryboard', async (_event, root, sceneId, options) =>
    proposeSceneStoryboard(root, sceneId, options)
  )

  typedHandle('shortPlay:previewExport', async (_event, root) => buildShortPlayExportPackage(root))

  typedHandle('shortPlay:exportToFile', async (_event, root, format = 'markdown', destinationPath) => {
    const project = await loadProject(root)
    let targetPath = destinationPath?.trim()
    if (!targetPath) {
      const ext = format === 'json' ? 'json' : 'md'
      const defaultName = `${slugify(project.title) || 'short-play'}-prompts.${ext}`
      const picked = await dialog.showSaveDialog({
        title: format === 'json' ? '导出短剧提示词 JSON' : '导出短剧提示词 Markdown',
        defaultPath: path.join(root, 'exports', defaultName),
        filters:
          format === 'json'
            ? [{ name: 'JSON', extensions: ['json'] }]
            : [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (picked.canceled || !picked.filePath) {
        return null
      }
      targetPath = picked.filePath
    }
    return exportShortPlayPromptsToFile(root, targetPath, format)
  })
}
