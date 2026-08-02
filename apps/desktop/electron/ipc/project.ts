import path from 'node:path'
import { rm } from 'node:fs/promises'
import { dialog, shell } from 'electron'
import {
  appendTimelineEvent,
  createCanon,
  createCharacter,
  createCharacterState,
  createForeshadowing,
  createIssue,
  createLocation,
  createOutline,
  createPattern,
  createProject,
  createReference,
  createRoute,
  createScene,
  createStrategy,
  createWorldEntry,
  getObsidianDir,
  listDocs,
  listRuns,
  loadProject,
  readMarkdown,
  writeMarkdown,
  type BaseDoc,
  type CanonDoc,
  type CharacterDoc,
  type CharacterStateDoc,
  type ForeshadowingDoc,
  type IssueDoc,
  type LocationDoc,
  type OutlineDoc,
  type PatternDoc,
  type ReferenceDoc,
  type RouteDoc,
  type SceneDoc,
  type StrategyDoc,
  type TimelineEventDoc,
  type WorldEntryDoc
} from '@quillarium/core'
import { typedHandle, type DesktopDocEntry } from './contract.js'

export function registerProjectHandlers(): void {
  typedHandle('project:list', async () => {
    const vault = await getObsidianDir()
    if (!vault) return []
    const { readdir } = await import('node:fs/promises')
    const novelsRoot = path.join(vault, 'novels')
    try {
      const entries = await readdir(novelsRoot, { withFileTypes: true })
      const projects = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const root = path.join(novelsRoot, entry.name)
        try {
          const project = await loadProject(root)
          projects.push({ root, ...project })
        } catch {
          // ignore non-project directories
        }
      }
      return projects
    } catch {
      return []
    }
  })

  typedHandle('project:create', async (_event, input) => {
    const vault = await getObsidianDir()
    if (!vault) throw new Error('Obsidian vault is not configured')
    const paths = await createProject({ vault, ...input })
    return { root: paths.root, ...(await loadProject(paths.root)) }
  })
  typedHandle('project:choose', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const root = result.filePaths[0]
    return { root, ...(await loadProject(root)) }
  })

  typedHandle('project:load', async (_event, root) => {
    const project = await loadProject(root)
    const docs = await listDocs<BaseDoc>(root)
    const runs = await listRuns(root)
    return { project, docs: docs as DesktopDocEntry[], runs }
  })

  typedHandle('doc:read', async (_event, filePath) => readMarkdown(filePath))
  typedHandle('doc:saveBody', async (_event, filePath, data, body) => {
    await writeMarkdown(filePath, data, body)
    return true
  })
  typedHandle('doc:delete', async (_event, filePath) => {
    await rm(filePath, { force: true })
    return true
  })
  typedHandle('doc:openExternal', async (_event, filePath) => {
    const error = await shell.openPath(filePath)
    if (error) throw new Error(error)
    return true
  })
  typedHandle('doc:create', async (_event, root, kind, input) => {
    switch (kind) {
      case 'canon': {
        const canon = input as Partial<CanonDoc>
        return createCanon(root, requiredString(input.title, 'title'), optionalString(input.content), {
          strength: canon.strength ?? 'hard',
          source: canon.source ?? 'user',
          status: canon.status ?? 'confirmed'
        })
      }
      case 'character':
        return createCharacter(
          root,
          requiredString(input.title, 'title'),
          input as Partial<CharacterDoc>,
          optionalString(input.content)
        )
      case 'character_state':
        return createCharacterState(
          root,
          requiredString(input.title, 'title'),
          input as Partial<CharacterStateDoc>,
          optionalString(input.content)
        )
      case 'foreshadowing':
        return createForeshadowing(
          root,
          requiredString(input.title, 'title'),
          input as Partial<ForeshadowingDoc>,
          optionalString(input.content)
        )
      case 'world_entry':
        return createWorldEntry(
          root,
          requiredString(input.title, 'title'),
          input as Partial<WorldEntryDoc>,
          optionalString(input.content)
        )
      case 'reference':
        return createReference(
          root,
          requiredString(input.title, 'title'),
          input as Partial<ReferenceDoc>,
          optionalString(input.content)
        )
      case 'issue':
        return createIssue(
          root,
          requiredString(input.title, 'title'),
          input as Partial<IssueDoc>,
          optionalString(input.content)
        )
      case 'strategy':
        return createStrategy(
          root,
          requiredString(input.title, 'title'),
          input as Partial<StrategyDoc>,
          optionalString(input.content)
        )
      case 'pattern':
        return createPattern(
          root,
          requiredString(input.title, 'title'),
          input as Partial<PatternDoc>,
          optionalString(input.content)
        )
      case 'timeline_event':
        return appendTimelineEvent(
          root,
          requiredString(input.title, 'title'),
          input as Partial<TimelineEventDoc>,
          optionalString(input.content)
        )
      case 'location':
        return createLocation(
          root,
          requiredString(input.title, 'title'),
          input as Partial<LocationDoc>,
          optionalString(input.content)
        )
      case 'route':
        return createRoute(
          root,
          requiredString(input.from, 'from'),
          requiredString(input.to, 'to'),
          input as Partial<RouteDoc>
        )
      case 'outline':
        return createOutline(
          root,
          outlineLevel(input.level),
          requiredString(input.title, 'title'),
          input as Partial<OutlineDoc>,
          optionalString(input.content)
        )
      case 'scene':
        return createScene(
          root,
          requiredString(input.title, 'title'),
          input as Partial<SceneDoc>,
          optionalString(input.content)
        )
      default:
        throw new Error(`Unsupported document kind: ${kind}`)
    }
  })
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Document ${field} must be a string.`)
  return value
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function outlineLevel(value: unknown): OutlineDoc['level'] {
  if (
    value === 'book' ||
    value === 'volume' ||
    value === 'act' ||
    value === 'arc' ||
    value === 'chapter' ||
    value === 'section'
  ) {
    return value
  }
  throw new Error('Document level must be a supported outline level.')
}
