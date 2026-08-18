import { registerCanonHandlers } from './canon.js'
import { registerConfigHandlers } from './config.js'
import { registerExportHandlers } from './export.js'
import { registerGitHandlers } from './git.js'
import { registerImportHandlers } from './import.js'
import { registerProjectHandlers } from './project.js'
import { registerPlanningHandlers } from './planning.js'
import { registerPresetHandlers } from './preset.js'
import { registerRunHandlers } from './run.js'
import { registerSceneHandlers } from './scene.js'
import { registerSillyTavernHandlers } from './sillytavern.js'
import { registerUpdateHandlers } from './updates.js'
import { registerAssistantHandlers } from './assistant.js'
import { registerAIStreamHandlers } from './ai-stream.js'
import { registerStoryOrderHandlers } from './story-order.js'
import { registerReferenceHandlers } from './references.js'
import { registerTimelineHandlers } from './timeline.js'
import { registerCoverHandlers } from './cover.js'

export function registerAllHandlers(): void {
  registerAIStreamHandlers()
  registerConfigHandlers()
  registerProjectHandlers()
  registerCoverHandlers()
  registerStoryOrderHandlers()
  registerReferenceHandlers()
  registerTimelineHandlers()
  registerPlanningHandlers()
  registerPresetHandlers()
  registerImportHandlers()
  registerCanonHandlers()
  registerSceneHandlers()
  registerExportHandlers()
  registerSillyTavernHandlers()
  registerRunHandlers()
  registerGitHandlers()
  registerUpdateHandlers()
  registerAssistantHandlers()
}
