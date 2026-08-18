import { shell } from 'electron'
import { getProductVersion } from '../product-version.js'
import { typedHandle } from './contract.js'
import { checkForUpdates, QUILLARIUM_RELEASES_PAGE } from './update-service.js'

export function registerUpdateHandlers(): void {
  typedHandle('app:checkForUpdates', async () => checkForUpdates(getProductVersion()))
  typedHandle('app:openReleases', async () => {
    await shell.openExternal(QUILLARIUM_RELEASES_PAGE)
    return true
  })
}
