import { registerCanonHandlers } from './canon.js'
import { registerConfigHandlers } from './config.js'
import { registerExportHandlers } from './export.js'
import { registerGitHandlers } from './git.js'
import { registerImportHandlers } from './import.js'
import { registerProjectHandlers } from './project.js'
import { registerPlanningHandlers } from './planning.js'
import { registerRunHandlers } from './run.js'
import { registerSceneHandlers } from './scene.js'
import { registerSillyTavernHandlers } from './sillytavern.js'

export function registerAllHandlers(): void {
  registerConfigHandlers()
  registerProjectHandlers()
  registerPlanningHandlers()
  registerImportHandlers()
  registerCanonHandlers()
  registerSceneHandlers()
  registerExportHandlers()
  registerSillyTavernHandlers()
  registerRunHandlers()
  registerGitHandlers()
}
