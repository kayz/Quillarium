import { listDocs, type CanonDoc, type WorldEntryDoc } from '@quillarium/core'
import type { SillyTavernWorldInfo, SillyTavernWorldInfoEntry } from './types.js'

export async function exportWorldInfo(projectRoot: string): Promise<SillyTavernWorldInfo> {
  const [canon, worldEntries] = await Promise.all([
    listDocs<CanonDoc>(projectRoot, 'canon'),
    listDocs<WorldEntryDoc>(projectRoot, 'world_entry')
  ])
  const sources = [
    ...canon.map((doc) => ({
      id: doc.data.id,
      title: doc.data.title,
      tags: doc.data.tags,
      triggers: [] as string[],
      content: doc.content,
      disabled: doc.data.status === 'deprecated' || doc.data.status === 'archived'
    })),
    ...worldEntries.map((doc) => ({
      id: doc.data.id,
      title: doc.data.title,
      tags: doc.data.tags,
      triggers: doc.data.triggers,
      content: doc.content,
      disabled:
        doc.data.entry_status === 'inactive' ||
        doc.data.status === 'deprecated' ||
        doc.data.status === 'archived'
    }))
  ].sort((a, b) => a.id.localeCompare(b.id))

  const entries: Record<string, SillyTavernWorldInfoEntry> = {}
  sources.forEach((source, index) => {
    entries[String(index)] = {
      uid: index,
      key: unique([...source.triggers, ...source.tags, source.title]),
      keysecondary: [],
      comment: source.title,
      content: source.content,
      constant: false,
      selective: false,
      order: 100 + index,
      position: 0,
      disable: source.disabled
    }
  })
  return { entries }
}

export async function exportWorldInfoJson(projectRoot: string): Promise<string> {
  return JSON.stringify(await exportWorldInfo(projectRoot), null, 2)
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}
