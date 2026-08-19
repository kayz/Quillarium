import path from 'node:path'
import { rm } from 'node:fs/promises'
import { dialog, shell } from 'electron'
import {
  appendTimelineEvent,
  assertCardReferencesExist,
  assertPlainProse,
  assertDocumentHumanEditable,
  assertDocumentDeletable,
  assertDocumentExternalOpenAllowed,
  assertOutlinePlacement,
  createCanon,
  createCharacter,
  createCharacterRelation,
  createCharacterState,
  createChapterProse,
  createForeshadowing,
  createFaction,
  createFactionMembership,
  createFactionRelation,
  createIssue,
  createLocation,
  createNarrative,
  createOutline,
  createPattern,
  createReference,
  createRoute,
  createScene,
  createStrategy,
  createTimelineEventAtNode,
  createTimelineNode,
  createTimelineNodeFromEvent,
  createWorldEntry,
  deleteStoryNode,
  getObsidianDir,
  getWorkspaceDir,
  hasDocumentIdentity,
  inferUniqueLegacyOutlineParent,
  listDocs,
  listRuns,
  listWorkspaceProjects,
  loadProject,
  parseKnownDocument,
  parseStoryTime,
  readMarkdown,
  resolveDocumentOrigin,
  storyStructureConfigV1Schema,
  updateProjectConfig,
  writeMarkdown,
  type CanonDoc,
  type CharacterDoc,
  type CharacterRelationDoc,
  type CharacterStateDoc,
  type DocumentIdentity,
  type ForeshadowingDoc,
  type FactionDoc,
  type FactionMembershipDoc,
  type FactionRelationDoc,
  type IssueDoc,
  type LocationDoc,
  type NarrativeDoc,
  type OutlineDoc,
  type OutlineLevelInput,
  type PatternDoc,
  type ReferenceDoc,
  type RouteDoc,
  type SceneDoc,
  type StrategyDoc,
  type TimelineEventDoc,
  type TimelineNodeDoc,
  type WorldEntryDoc
} from '@quillarium/core'
import { typedHandle, type DesktopDocEntry } from './contract.js'
import { createLocalWorkspaceProject } from './local-workspace.js'

export function registerProjectHandlers(): void {
  typedHandle('project:list', async () => {
    const workspaceRoot = await getWorkspaceDir()
    if (workspaceRoot) {
      return (await listWorkspaceProjects(workspaceRoot)).map(({ root, config }) => ({
        root,
        ...config
      }))
    }
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
    const workspaceRoot = await getWorkspaceDir()
    if (!workspaceRoot) throw new Error('请先注册写作工作区；旧 vault 仅用于兼容打开和无损迁移。')
    return createLocalWorkspaceProject(workspaceRoot, input)
  })
  typedHandle('project:choose', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const root = result.filePaths[0]
    return { root, ...(await loadProject(root)) }
  })

  typedHandle('project:load', async (_event, root) => {
    const project = await loadProject(root)
    const docs = (await listDocs<DocumentIdentity>(root)).filter((entry) => hasDocumentIdentity(entry.data))
    const runs = await listRuns(root)
    return {
      project,
      docs: docs.map((entry): DesktopDocEntry => ({
        path: entry.path,
        data: { ...entry.data },
        content: entry.content
      })),
      runs
    }
  })

  typedHandle('project:updateStoryStructure', async (_event, root, structure) => {
    const normalized = storyStructureConfigV1Schema.parse({
      ...structure,
      act_enabled: structure.part_enabled ? structure.act_enabled : false
    })
    return updateProjectConfig(root, { story_structure: normalized })
  })

  typedHandle('doc:read', async (_event, filePath) => readDesktopDocument(filePath))
  typedHandle('doc:saveBody', async (_event, filePath, data, body) =>
    saveDesktopDocument(filePath, data, body)
  )
  typedHandle('doc:delete', async (_event, filePath) => {
    const projectRoot = await projectRootForFile(filePath)
    const parsed = await readMarkdown<Record<string, unknown>>(filePath)
    if (parsed.data['type'] === 'outline' || parsed.data['type'] === 'scene') {
      await deleteStoryNode(projectRoot, {
        type: parsed.data['type'],
        id: requiredString(parsed.data['id'], 'id')
      })
      return true
    }
    await assertDocumentDeletable(projectRoot, parsed.data)
    await rm(filePath, { force: true })
    return true
  })
  typedHandle('doc:openExternal', async (_event, filePath) => {
    const projectRoot = await projectRootForFile(filePath)
    const parsed = await readMarkdown<Record<string, unknown>>(filePath)
    await assertDocumentExternalOpenAllowed(projectRoot, parsed.data)
    const error = await shell.openPath(filePath)
    if (error) throw new Error(error)
    return true
  })
  typedHandle('doc:create', async (_event, root, kind, input) => {
    return createProjectDocument(root, kind, input)
  })
  typedHandle('doc:origin', async (_event, root, filePath) => resolveDocumentOrigin(root, filePath))
}

export async function readDesktopDocument(filePath: string) {
  const document = await readMarkdown<Record<string, unknown>>(filePath)
  return {
    ...document,
    data: parseKnownDocument(document.data, filePath)
  }
}

export async function saveDesktopDocument(
  filePath: string,
  data: Record<string, unknown>,
  body: string
): Promise<boolean> {
  const projectRoot = await projectRootForFile(filePath)
  const stored = await readDesktopDocument(filePath)
  const identitySafeData =
    stored.data['type'] === 'outline' && data['type'] === 'outline'
      ? {
          ...data,
          id: stored.data['id'],
          type: stored.data['type'],
          level: stored.data['level']
        }
      : data
  const normalizedData = parseKnownDocument(identitySafeData, filePath)
  await assertDocumentHumanEditable(projectRoot, normalizedData)
  await assertCardReferencesExist(
    normalizedData as unknown as DocumentIdentity,
    await listDocs<DocumentIdentity>(projectRoot),
    projectRoot
  )
  let nextData = normalizedData
  if (normalizedData['type'] === 'outline') {
    const level = outlineLevel(normalizedData['level'])
    const currentId = typeof normalizedData['id'] === 'string' ? normalizedData['id'] : undefined
    const suppliedParent =
      typeof normalizedData['parent'] === 'string' && normalizedData['parent']
        ? normalizedData['parent']
        : null
    const outlines = (await listDocs<OutlineDoc>(projectRoot, 'outline')).map((entry) => entry.data)
    const parent = inferUniqueLegacyOutlineParent(outlines, level, suppliedParent, currentId)
    nextData = parent && !suppliedParent ? { ...normalizedData, parent } : normalizedData
    await assertOutlinePlacement(projectRoot, level, parent, currentId)
  }
  if (normalizedData['type'] === 'chapter_prose' && body.trim()) assertPlainProse(body)
  if (normalizedData['type'] === 'scene' && !normalizedData['accepted_at']) {
    nextData = { ...normalizedData, outline_content: body }
  }
  const parsed = parseKnownDocument(nextData, filePath)
  await writeMarkdown(filePath, parsed, body)
  return true
}

export async function createProjectDocument(
  root: string,
  kind: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (kind) {
    case 'canon': {
      const canon = input as Partial<CanonDoc>
      return createCanon(root, requiredString(input.title, 'title'), optionalString(input.content), {
        ...canon,
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
    case 'character_relation': {
      const relation = input as Partial<CharacterRelationDoc>
      return createCharacterRelation(
        root,
        requiredString(input.title, 'title'),
        {
          ...relation,
          from_character: requiredString(input.from_character, 'from_character'),
          to_character: requiredString(input.to_character, 'to_character'),
          relation_type: requiredString(input.relation_type, 'relation_type')
        },
        optionalString(input.content)
      )
    }
    case 'faction':
      return createFaction(
        root,
        requiredString(input.title, 'title'),
        input as Partial<FactionDoc>,
        optionalString(input.content)
      )
    case 'faction_relation': {
      const relation = input as Partial<FactionRelationDoc>
      return createFactionRelation(
        root,
        requiredString(input.title, 'title'),
        {
          ...relation,
          from_faction: requiredString(input.from_faction, 'from_faction'),
          to_faction: requiredString(input.to_faction, 'to_faction'),
          relation_type: requiredString(input.relation_type, 'relation_type')
        },
        optionalString(input.content)
      )
    }
    case 'faction_membership': {
      const membership = input as Partial<FactionMembershipDoc>
      return createFactionMembership(
        root,
        requiredString(input.title, 'title'),
        {
          ...membership,
          faction_id: requiredString(input.faction_id, 'faction_id'),
          character_id: requiredString(input.character_id, 'character_id')
        },
        optionalString(input.content)
      )
    }
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
    case 'narrative':
      return createNarrative(
        root,
        requiredString(input.title, 'title'),
        input as Partial<NarrativeDoc>,
        optionalString(input.content)
      )
    case 'timeline_node': {
      const node = input as Partial<TimelineNodeDoc>
      const storyTime = optionalString(input.story_time).trim()
      const sourceEventId = optionalString(input.source_event_id).trim()
      if (sourceEventId) {
        return createTimelineNodeFromEvent(
          root,
          sourceEventId,
          requiredString(input.title, 'title'),
          storyTime || undefined
        )
      }
      const parsedTime = storyTime
        ? parseStoryTime(storyTime)
        : {
            year: requiredNumber(input.year, 'year'),
            month: requiredNumber(input.month, 'month')
          }
      return createTimelineNode(
        root,
        requiredString(input.title, 'title'),
        {
          ...node,
          ...parsedTime
        },
        optionalString(input.content)
      )
    }
    case 'timeline_event':
      if (typeof input.timeline_node === 'string' && input.timeline_node) {
        return createTimelineEventAtNode(
          root,
          input.timeline_node,
          requiredString(input.title, 'title'),
          input as Partial<TimelineEventDoc>,
          optionalString(input.content)
        )
      }
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
    case 'outline': {
      await assertOutlinePlacement(
        root,
        outlineLevel(input.level),
        typeof input.parent === 'string' ? input.parent : null
      )
      const outlineFile = await createOutline(
        root,
        outlineLevel(input.level),
        requiredString(input.title, 'title'),
        input as Partial<OutlineDoc>,
        optionalString(input.content)
      )
      if (outlineLevel(input.level) === 'chapter') {
        const outline = await readMarkdown<Record<string, unknown>>(outlineFile)
        const chapterId = requiredString(outline.data['id'], 'id')
        const chapterTitle = requiredString(outline.data['title'], 'title')
        await createChapterProse(root, chapterId, `${chapterTitle} 正文`)
      }
      return outlineFile
    }
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
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Document ${field} must be a string.`)
  return value
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Document ${field} must be a number.`)
  }
  return value
}

function outlineLevel(value: unknown): OutlineLevelInput {
  if (
    value === 'overview' ||
    value === 'book' ||
    value === 'volume' ||
    value === 'part' ||
    value === 'act' ||
    value === 'arc' ||
    value === 'chapter' ||
    value === 'section'
  ) {
    return value
  }
  throw new Error('Document level must be a supported outline level.')
}

async function projectRootForFile(filePath: string): Promise<string> {
  const absolute = path.resolve(filePath)
  let current = path.dirname(absolute)
  while (true) {
    try {
      await loadProject(current)
      const relative = path.relative(current, absolute)
      if (
        !relative ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        throw new Error(`Document is outside project root: ${filePath}`)
      }
      return current
    } catch {
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  throw new Error(`Could not locate project.yaml for document: ${filePath}`)
}
