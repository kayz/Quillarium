import { exportManuscript, type ManuscriptExportOptions, type ManuscriptExportResult } from '@quillarium/core'
import { typedHandle } from './contract.js'

export type ManuscriptExporter = (
  root: string,
  options?: ManuscriptExportOptions
) => Promise<ManuscriptExportResult>

export function registerExportHandlers(): void {
  typedHandle('export:manuscript', async (_event, root, options) =>
    exportDesktopManuscript(root, options, exportManuscript)
  )
}

export async function exportDesktopManuscript(
  root: string,
  options: ManuscriptExportOptions = {},
  exporter: ManuscriptExporter = exportManuscript
): Promise<ManuscriptExportResult> {
  return exporter(root, options)
}
