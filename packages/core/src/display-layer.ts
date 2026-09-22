import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { listDocs } from './documents.js'
import { pathExists, writeMarkdown } from './fs.js'
import { loadProject, updateProjectConfig } from './project.js'
import { withProjectWriteLock } from './project-write-lock.js'
import type { DisplayLayerConfigV1, ProjectConfig } from './types.js'

export const WRITER_DEFAULT_DISPLAY_LAYER: DisplayLayerConfigV1 = Object.freeze({
  enabled: false,
  migrated: true
})

export function resolveDisplayLayer(config: ProjectConfig): DisplayLayerConfigV1 {
  return config.display_layer ?? { enabled: false, migrated: true }
}

async function leftoverSettingFiles(projectRoot: string): Promise<string[]> {
  const dir = path.join(projectRoot, 'assets', 'settings')
  if (!(await pathExists(dir))) return []
  const out: string[] = []
  async function walk(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else out.push(full)
    }
  }
  await walk(dir)
  return out
}

function imageIsSet(value: unknown): boolean {
  return value != null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
}

export async function needsDisplayMigration(projectRoot: string): Promise<boolean> {
  const leftovers = await leftoverSettingFiles(projectRoot)
  const cards = await listDocs(projectRoot)
  const imaged = cards.some((doc) => imageIsSet((doc.data as Record<string, unknown>).image))
  return leftovers.length > 0 || imaged
}

export async function shouldPromptDisplayReset(projectRoot: string): Promise<boolean> {
  if (!(await needsDisplayMigration(projectRoot))) return false
  return (await loadProject(projectRoot)).display_layer?.migrated !== true
}

export async function resetDisplayLayer(projectRoot: string): Promise<ProjectConfig> {
  return withProjectWriteLock(projectRoot, async () => {
    await updateProjectConfig(projectRoot, {
      display_layer: { enabled: true, migrated: true }
    })
    const docs = await listDocs(projectRoot)
    for (const doc of docs) {
      const data = doc.data as Record<string, unknown>
      if (!Object.hasOwn(data, 'image')) continue
      const { image: _dropped, ...rest } = data
      await writeMarkdown(doc.path, rest, doc.content)
    }
    const leftovers = await leftoverSettingFiles(projectRoot)
    for (const file of leftovers) await rm(file, { force: true })
    return loadProject(projectRoot)
  })
}

export async function setDisplayLayerEnabled(projectRoot: string, enabled: boolean): Promise<ProjectConfig> {
  const raw = (await loadProject(projectRoot)).display_layer
  if (raw) {
    return updateProjectConfig(projectRoot, {
      display_layer: { ...raw, enabled }
    })
  }
  const migrated = !(await needsDisplayMigration(projectRoot))
  return updateProjectConfig(projectRoot, {
    display_layer: { enabled, migrated }
  })
}
