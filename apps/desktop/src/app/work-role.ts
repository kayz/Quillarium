export type WorkRole = 'traditional_writer' | 'ai_writer' | 'ai_screenwriter' | 'oc_person' | 'ai_native'

/** OC roles land on the world book. Everyone else, including works with no role, lands on writing. */
export function workspaceModeForRole(role: WorkRole | undefined): 'planning' | 'writing' {
  return role === 'oc_person' || role === 'ai_native' ? 'planning' : 'writing'
}
