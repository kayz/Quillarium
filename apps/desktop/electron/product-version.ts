import { app } from 'electron'

export function getProductVersion(): string {
  if (!app.isPackaged) {
    const developmentVersion = process.env['QUILLARIUM_APP_VERSION']?.trim()
    if (developmentVersion) return developmentVersion
  }
  return app.getVersion()
}
