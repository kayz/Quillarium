import { loadProject, updateProjectConfig } from './project.js'
import type {
  DisplayLayerConfigV1,
  ProjectConfig,
  StoryStructureConfigV1,
  WorkCapabilities,
  WorkRole
} from './types.js'

export const WORK_ROLE_PRESETS: Record<WorkRole, WorkCapabilities> = {
  traditional_writer: {
    role: 'traditional_writer',
    scene_prose: false,
    display: false,
    image_generation: false,
    short_drama_export: false
  },
  ai_writer: {
    role: 'ai_writer',
    scene_prose: true,
    display: false,
    image_generation: false,
    short_drama_export: false
  },
  ai_screenwriter: {
    role: 'ai_screenwriter',
    scene_prose: true,
    display: false,
    image_generation: false,
    short_drama_export: true
  },
  oc_person: {
    role: 'oc_person',
    scene_prose: false,
    display: true,
    image_generation: false,
    short_drama_export: false
  },
  ai_native: {
    role: 'ai_native',
    scene_prose: true,
    display: true,
    image_generation: true,
    short_drama_export: true
  }
}

export interface NewWorkDefaults {
  capabilities: WorkCapabilities
  story_structure: StoryStructureConfigV1
  display_layer: DisplayLayerConfigV1
}

/** New works hide 篇 and 幕. The four switches come from the role. */
export function projectDefaultsForRole(role: WorkRole): NewWorkDefaults {
  const capabilities = WORK_ROLE_PRESETS[role]
  return {
    capabilities,
    story_structure: {
      part_enabled: false,
      act_enabled: false,
      scene_enabled: capabilities.scene_prose
    },
    display_layer: { enabled: capabilities.display, migrated: true }
  }
}

export function roleOpensWorldBook(role: WorkRole | undefined): boolean {
  return role === 'oc_person' || role === 'ai_native'
}

/** Changes one of the four switches. Files stay on disk; callers only hide the entry. */
export async function updateWorkCapabilitySwitches(
  projectRoot: string,
  patch: Partial<
    Pick<WorkCapabilities, 'scene_prose' | 'display' | 'image_generation' | 'short_drama_export'>
  >
): Promise<ProjectConfig> {
  const project = await loadProject(projectRoot)
  if (!project.capabilities) {
    throw new Error('这部作品没有问卷记录，不能改这四项。')
  }
  const capabilities: WorkCapabilities = { ...project.capabilities, ...patch }
  return updateProjectConfig(projectRoot, {
    capabilities,
    story_structure: { ...project.story_structure, scene_enabled: capabilities.scene_prose },
    display_layer: {
      enabled: capabilities.display,
      migrated: project.display_layer?.migrated ?? true
    }
  })
}
