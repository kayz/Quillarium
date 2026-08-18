import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { assembleContextPacket, renderContextPacket } from './context.js'
import { listDocs, requireDoc } from './documents.js'
import { assertChapterAllowsAI, sceneChapterId } from './chapter-lifecycle.js'
import { readPrompt } from './prompts.js'
import { compileContextBlocks, type ContextCompileOptions } from './context-compiler.js'
import { compareStoryOrder } from './story-order.js'
import {
  bundleDocumentTypes,
  contextBundleV1Schema,
  createContextBundle,
  type ContextBundleV1,
  type ContextSourceMode,
  type ContextSourceUsage,
  type LoadedContextBundle
} from './context-bundles.js'
import type {
  ContextTrace,
  OutlineDoc,
  PromptBlock,
  PromptBlockAuthority,
  PromptBlockKind,
  SceneDoc,
  SharedGuidanceContent
} from './types.js'

export interface ScenePromptInput {
  sceneId: string
  selectedElements?: {
    timeline?: string[]
    locations?: string[]
    characters?: string[]
    foreshadowing?: string[]
    worldEntries?: string[]
    patterns?: string[]
  }
  previousOutput?: string
}

export interface ScenePromptPlan {
  scene_id: string
  chapter_id: string
  title: string
  prompt: string
}

export interface PromptSourceBlock {
  id: string
  kind:
    | 'instruction'
    | 'outline'
    | 'scene-outline'
    | 'guidance'
    | 'canon'
    | 'timeline'
    | 'location'
    | 'character'
    | 'world'
    | 'foreshadowing'
    | 'narrative'
    | 'context'
    | 'finalized-prose'
    | 'continuation'
  title: string
  content: string
  required: boolean
  source_id?: string
  source_type?: string
  token_count?: number
  selection_reason?: string
  authority?: string
  truncated?: boolean
}

export interface PromptSourceSelection {
  id: string
  source_type?: string
  source_id?: string
  mode: ContextSourceMode
  usage: ContextSourceUsage
}

export interface EditableScenePromptPlan extends ScenePromptPlan {
  sources: PromptSourceBlock[]
  source_selections: PromptSourceSelection[]
  prompt_blocks: PromptBlock[]
  context_trace: ContextTrace
  shared_guidance: SharedGuidanceContent[]
}

export interface ChapterPromptPlan {
  chapter_id: string
  scene_prompts: ScenePromptPlan[]
  style_reference?: {
    scene_id: string
    title: string
    excerpt: string
  }
}

export async function buildSceneWritingPrompt(
  projectRoot: string,
  input: ScenePromptInput,
  contextOptions: ContextCompileOptions = {}
): Promise<ScenePromptPlan> {
  const scene = await requireDoc<SceneDoc>(projectRoot, input.sceneId)
  const chapterId = sceneChapterId(scene.data)
  await assertChapterAllowsAI(projectRoot, chapterId)
  const chapter = await requireDoc<OutlineDoc>(projectRoot, chapterId)
  const packet = await assembleContextPacket(
    projectRoot,
    { type: 'scene', id: scene.data.id },
    contextOptions
  )
  const systemPrompt = await readPrompt(projectRoot, 'prose-scene-draft')
  const style = await latestFinalSceneStyle(projectRoot, scene.data.id)
  const selected = input.selectedElements ?? {}
  const prompt = [
    systemPrompt,
    '',
    '# 本章规划',
    `title: ${chapter.data.title}`,
    chapter.content,
    '',
    '# 当前节规划',
    `title: ${scene.data.title}`,
    `goal: ${scene.data.scene_goal}`,
    `conflict: ${scene.data.scene_conflict}`,
    `change: ${scene.data.scene_change}`,
    `environment: ${scene.data.writing_environment}`,
    `writing_focus: ${scene.data.writing_focus}`,
    '',
    '# 用户选择要素',
    renderSelectedElements(selected),
    '',
    '# 上下文包',
    renderContextPacket(packet),
    style
      ? ['# 文风参考：最后一个定稿 scene', `title: ${style.title}`, style.excerpt].join('\n')
      : '# 文风参考\n暂无定稿 scene，请以作者的本章规划和项目策略为准。',
    input.previousOutput ? ['# 前一 scene 输出', input.previousOutput].join('\n') : '',
    '',
    '# 输出要求',
    '只输出当前节的纯文字正文，不得使用 Markdown 标题、列表、引用、链接、代码块或强调语法。'
  ]
    .filter(Boolean)
    .join('\n\n')
  return {
    scene_id: scene.data.id,
    chapter_id: chapter.data.id,
    title: scene.data.title,
    prompt
  }
}

export async function buildEditableScenePromptPlan(
  projectRoot: string,
  input: ScenePromptInput,
  contextOptions: ContextCompileOptions = {},
  requestedSources?: PromptSourceSelection[]
): Promise<EditableScenePromptPlan> {
  const scene = await requireDoc<SceneDoc>(projectRoot, input.sceneId)
  const chapterId = sceneChapterId(scene.data)
  await assertChapterAllowsAI(projectRoot, chapterId)
  const chapter = await requireDoc<OutlineDoc>(projectRoot, chapterId)
  const packet = await assembleContextPacket(
    projectRoot,
    { type: 'scene', id: scene.data.id },
    contextOptions
  )
  const availableSources: PromptSourceBlock[] = [
    {
      id: 'instruction',
      kind: 'instruction',
      title: '正文输出规则',
      content: await readPrompt(projectRoot, 'prose-scene-draft'),
      source_id: 'prose-scene-draft',
      source_type: 'prompt_asset',
      required: true
    },
    {
      id: `outline:${chapter.data.id}`,
      kind: 'outline',
      title: `章 · ${chapter.data.title}`,
      content: renderStructuredOutline(chapter.data, chapter.content),
      source_id: chapter.data.id,
      source_type: 'outline',
      required: true
    },
    {
      id: `scene:${scene.data.id}`,
      kind: 'scene-outline',
      title: `节 · ${scene.data.title}`,
      content: renderSceneOutline(scene.data),
      source_id: scene.data.id,
      source_type: 'scene',
      required: true
    },
    ...contextPromptSourceBlocks(packet)
  ]
  if (input.previousOutput?.trim()) {
    availableSources.push({
      id: 'continuation',
      kind: 'continuation',
      title: '本章前文',
      content: input.previousOutput.trim(),
      source_id: chapter.data.id,
      source_type: 'chapter_continuation',
      required: false
    })
  }
  const sources = requestedSources
    ? await resolveRequestedPromptSources(projectRoot, availableSources, requestedSources)
    : availableSources
  const compiled = await compilePromptSourceBlocks(scene.data.id, sources, contextOptions)
  return {
    scene_id: scene.data.id,
    chapter_id: chapterId,
    title: scene.data.title,
    sources: compiled.sources,
    source_selections: compiled.sources.map(promptSourceSelection),
    prompt_blocks: compiled.prompt_blocks,
    context_trace: compiled.context_trace,
    shared_guidance: packet.shared_guidance,
    prompt: compiled.prompt
  }
}

export async function savePromptSourcesAsContextBundle(
  projectRoot: string,
  title: string,
  selections: PromptSourceSelection[]
): Promise<LoadedContextBundle> {
  const stableTypes = new Set<string>(bundleDocumentTypes)
  const sources = selections
    .filter(
      (selection) =>
        selection.source_type !== undefined &&
        selection.source_id !== undefined &&
        stableTypes.has(selection.source_type)
    )
    .map((selection) => ({
      document_type: selection.source_type!,
      document_id: selection.source_id!,
      mode: selection.source_type === 'exploration' ? ('preferred' as const) : selection.mode,
      usage: selection.usage
    }))
  const unique = new Map(sources.map((source) => [`${source.document_type}:${source.document_id}`, source]))
  const now = new Date()
  const id = `prompt-bundle-${now
    .toISOString()
    .replace(/[^0-9]/gu, '')
    .slice(0, 14)}-${randomUUID().replace(/-/gu, '').slice(0, 8)}`
  const bundle = contextBundleV1Schema.parse({
    schema_version: 1,
    id,
    version: '1.0.0',
    title: title.trim() || 'Prompt source bundle',
    description: 'Saved from an author-reviewed scene prompt source overlay.',
    sources: [...unique.values()],
    dynamic_selectors: [],
    exclusions: []
  }) as ContextBundleV1
  return createContextBundle(projectRoot, bundle)
}

export function contextPromptSourceBlocks(
  packet: Awaited<ReturnType<typeof assembleContextPacket>>
): PromptSourceBlock[] {
  if (packet.prompt_blocks?.length) {
    const skipped = new Set(['packet_header', 'target', 'project', 'generation_target'])
    return packet.prompt_blocks
      .filter((block) => !skipped.has(block.kind))
      .filter(
        (block) =>
          block.source.id !== packet.target.id &&
          (packet.scene === null || block.source.id !== packet.scene.data.id)
      )
      .map((block) => ({
        id: block.id,
        kind: promptSourceKindForBlock(block.kind),
        title: block.title,
        content: block.content,
        required:
          block.authority === 'accepted_prose' ||
          block.authority === 'hard_canon' ||
          block.kind === 'outline',
        source_id: block.source.id,
        source_type: block.source.type,
        token_count: block.token_count,
        selection_reason: block.selection_reason,
        authority: block.authority,
        truncated: block.truncated
      }))
  }
  const blocks: PromptSourceBlock[] = []
  const addDocument = (
    kind: PromptSourceBlock['kind'],
    sourceType: string,
    item: { data: { id: string; title: string }; content: string },
    required = false
  ) => {
    blocks.push({
      id: `document:${sourceType}:${item.data.id}`,
      kind,
      title: item.data.title,
      content: item.content.trim() || `title: ${item.data.title}`,
      required,
      source_id: item.data.id,
      source_type: sourceType
    })
  }

  for (const item of packet.outline_chain.slice(0, -1)) addDocument('outline', 'outline', item, true)
  for (const item of packet.canon) addDocument('canon', 'canon', item, item.data.strength === 'hard')
  for (const item of packet.strategies) addDocument('narrative', 'strategy', item)
  for (const item of packet.patterns) addDocument('narrative', 'pattern', item)
  for (const item of packet.narratives) addDocument('narrative', 'narrative', item)
  for (const item of packet.timeline_nodes) addDocument('timeline', 'timeline_node', item)
  for (const item of packet.timeline) addDocument('timeline', 'timeline_event', item)
  for (const item of packet.characters) addDocument('character', 'character', item)
  for (const item of packet.character_states) addDocument('character', 'character_state', item)
  for (const item of packet.locations) addDocument('location', 'location', item)
  for (const item of packet.world_entries) addDocument('world', 'world_entry', item)
  for (const item of packet.foreshadowing) addDocument('foreshadowing', 'foreshadowing', item)
  for (const item of packet.issues) addDocument('context', 'issue', item)
  for (const guidance of packet.shared_guidance) {
    blocks.push({
      id: `guidance:${guidance.id}`,
      kind: 'guidance',
      title: guidance.id,
      content: guidance.content,
      required: false,
      source_id: guidance.id,
      source_type: 'shared_guidance'
    })
  }
  if (packet.warnings.length) {
    blocks.push({
      id: 'context:warnings',
      kind: 'context',
      title: '上下文提醒',
      content: packet.warnings.map((warning) => `- ${warning}`).join('\n'),
      required: false,
      source_type: 'context_warning'
    })
  }
  return blocks
}

async function resolveRequestedPromptSources(
  projectRoot: string,
  available: PromptSourceBlock[],
  requested: PromptSourceSelection[]
): Promise<PromptSourceBlock[]> {
  const availableById = new Map(available.map((source) => [source.id, source]))
  const selected: PromptSourceBlock[] = []
  const seen = new Set<string>()
  for (const request of requested) {
    if (!request.id.trim()) throw new Error('PROMPT_OVERLAY_SOURCE_ID_REQUIRED')
    if (seen.has(request.id)) throw new Error(`PROMPT_OVERLAY_SOURCE_DUPLICATE: ${request.id}`)
    seen.add(request.id)
    const builtin = availableById.get(request.id)
    if (builtin) {
      selected.push({ ...builtin, required: request.mode === 'required' })
      continue
    }
    if (!request.source_type || !request.source_id) {
      throw new Error(`PROMPT_OVERLAY_SOURCE_UNKNOWN: ${request.id}`)
    }
    if (!bundleDocumentTypes.includes(request.source_type as (typeof bundleDocumentTypes)[number])) {
      throw new Error(`PROMPT_OVERLAY_SOURCE_TYPE_FORBIDDEN: ${request.source_type}`)
    }
    if (request.source_type === 'exploration') {
      throw new Error('PROMPT_OVERLAY_EXPLORATION_REQUIRES_CONTEXT_BUNDLE')
    }
    const matches = (await listDocs(projectRoot)).filter(
      (document) => document.data.type === request.source_type && document.data.id === request.source_id
    )
    if (matches.length !== 1) {
      throw new Error(
        matches.length > 1
          ? `PROMPT_OVERLAY_SOURCE_DUPLICATE: ${request.source_type}:${request.source_id}`
          : `PROMPT_OVERLAY_SOURCE_MISSING: ${request.source_type}:${request.source_id}`
      )
    }
    const document = matches[0]!
    selected.push({
      id: request.id,
      kind: promptSourceKindForDocumentType(request.source_type),
      title: document.data.title,
      content: renderOverlayDocument(document.data as unknown as Record<string, unknown>, document.content),
      required: request.mode === 'required',
      source_type: request.source_type,
      source_id: request.source_id
    })
  }
  return selected
}

async function compilePromptSourceBlocks(
  sceneId: string,
  sources: PromptSourceBlock[],
  contextOptions: ContextCompileOptions
): Promise<{
  sources: PromptSourceBlock[]
  prompt_blocks: PromptBlock[]
  context_trace: ContextTrace
  prompt: string
}> {
  const candidates = sources.map((source, order) => {
    const authority = promptSourceAuthority(source)
    return {
      id: `prompt-overlay:${source.id}`,
      kind: promptBlockKindForSource(source.kind),
      role: source.kind === 'instruction' ? ('system' as const) : ('user' as const),
      title: source.title,
      content: `【${source.title}】\n${source.content.trim()}`,
      source: {
        type: source.source_type ?? 'prompt_overlay',
        id: source.source_id ?? source.id
      },
      scope: 'scene',
      purpose: promptSourceUsage(source.kind),
      authority: authority.name,
      authority_rank: authority.rank,
      priority: source.required ? 800 : 500,
      order,
      selected: true,
      required: source.required,
      selection_reason: 'selected by the author in the temporary ContextBundle overlay',
      trigger_chain: ['prompt-overlay', source.id],
      truncation:
        source.kind === 'finalized-prose' || source.kind === 'continuation'
          ? ('tail' as const)
          : source.kind === 'instruction'
            ? ('none' as const)
            : ('head' as const)
    }
  })
  candidates.push({
    id: 'prompt-overlay:plain-prose-output',
    kind: 'generation_target',
    role: 'system',
    title: '纯文字输出规则',
    content: '【输出要求】\n只输出当前节的纯文字正文，不得输出标题、解释或任何 Markdown 语法。',
    source: { type: 'system', id: 'plain-prose-output' },
    scope: 'scene',
    purpose: 'constraint',
    authority: 'system',
    authority_rank: 1000,
    priority: 1000,
    order: sources.length,
    selected: true,
    required: true,
    selection_reason: 'required product output boundary',
    trigger_chain: ['product-boundary', 'plain-prose-output'],
    truncation: 'none'
  })
  const compiled = await compileContextBlocks({ type: 'scene', id: sceneId }, candidates, contextOptions)
  const includedByCandidateId = new Map(compiled.blocks.map((block) => [block.id, block]))
  return {
    sources: sources
      .filter((source) => includedByCandidateId.has(`prompt-overlay:${source.id}`))
      .map((source) => {
        const block = includedByCandidateId.get(`prompt-overlay:${source.id}`)!
        return {
          ...source,
          token_count: block.token_count,
          selection_reason: block.selection_reason,
          authority: block.authority,
          truncated: block.truncated
        }
      }),
    prompt_blocks: compiled.blocks,
    context_trace: compiled.trace,
    prompt: compiled.markdown
  }
}

function promptSourceSelection(source: PromptSourceBlock): PromptSourceSelection {
  return {
    id: source.id,
    ...(source.source_type ? { source_type: source.source_type } : {}),
    ...(source.source_id ? { source_id: source.source_id } : {}),
    mode: source.required ? 'required' : 'preferred',
    usage: promptSourceUsage(source.kind)
  }
}

function promptSourceUsage(kind: PromptSourceBlock['kind']): ContextSourceUsage {
  if (['instruction', 'guidance', 'narrative'].includes(kind)) return 'style'
  if (['canon', 'outline', 'scene-outline', 'timeline', 'location'].includes(kind)) {
    return 'constraint'
  }
  if (['finalized-prose', 'continuation'].includes(kind)) return 'evidence'
  return 'subject'
}

function promptSourceAuthority(source: PromptSourceBlock): {
  name: PromptBlockAuthority
  rank: number
} {
  if (source.kind === 'instruction') return { name: 'system', rank: 1000 }
  if (source.kind === 'finalized-prose') return { name: 'accepted_prose', rank: 500 }
  if (source.kind === 'canon' && source.authority === 'hard_canon') {
    return { name: 'hard_canon', rank: 400 }
  }
  if (['guidance', 'narrative', 'context'].includes(source.kind)) {
    return { name: 'advisory', rank: 100 }
  }
  return { name: 'project', rank: 300 }
}

function promptBlockKindForSource(kind: PromptSourceBlock['kind']): PromptBlockKind {
  const mapping: Record<PromptSourceBlock['kind'], PromptBlockKind> = {
    instruction: 'packet_header',
    outline: 'outline',
    'scene-outline': 'generation_target',
    guidance: 'shared_guidance',
    canon: 'canon',
    timeline: 'timeline',
    location: 'location',
    character: 'character',
    world: 'world',
    foreshadowing: 'foreshadowing',
    narrative: 'project_guidance',
    context: 'warning',
    'finalized-prose': 'accepted_prose',
    continuation: 'accepted_prose'
  }
  return mapping[kind]
}

function promptSourceKindForDocumentType(type: string): PromptSourceBlock['kind'] {
  const mapping: Record<string, PromptSourceBlock['kind']> = {
    canon: 'canon',
    outline: 'outline',
    scene: 'scene-outline',
    chapter_prose: 'finalized-prose',
    timeline_node: 'timeline',
    timeline_event: 'timeline',
    location: 'location',
    route: 'location',
    character: 'character',
    character_relation: 'character',
    character_state: 'character',
    world_entry: 'world',
    foreshadowing: 'foreshadowing',
    strategy: 'narrative',
    pattern: 'narrative',
    narrative: 'narrative',
    issue: 'context',
    reference: 'context',
    resource: 'context',
    causality: 'context',
    prompt: 'guidance'
  }
  return mapping[type] ?? 'context'
}

function renderOverlayDocument(data: Record<string, unknown>, content: string): string {
  const metadata = Object.entries(data)
    .filter(([key]) => !['title', 'tags', 'schema_version'].includes(key))
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join('\n')
  return `${metadata}\n\n${content}`.trim()
}

function promptSourceKindForBlock(kind: import('./types.js').PromptBlockKind): PromptSourceBlock['kind'] {
  switch (kind) {
    case 'accepted_prose':
      return 'finalized-prose'
    case 'canon':
      return 'canon'
    case 'outline':
      return 'outline'
    case 'project_guidance':
      return 'narrative'
    case 'timeline':
      return 'timeline'
    case 'character':
      return 'character'
    case 'location':
      return 'location'
    case 'world':
      return 'world'
    case 'foreshadowing':
      return 'foreshadowing'
    case 'shared_guidance':
      return 'guidance'
    case 'issue':
    case 'warning':
    case 'packet_header':
    case 'target':
    case 'project':
    case 'generation_target':
      return 'context'
  }
}

export async function buildChapterWritingPlan(
  projectRoot: string,
  chapterId: string,
  selectedByScene: Record<string, ScenePromptInput['selectedElements']> = {},
  contextOptions: ContextCompileOptions = {}
): Promise<ChapterPromptPlan> {
  const scenes = (await listDocs<SceneDoc>(projectRoot, 'scene'))
    .filter((scene) => sceneChapterId(scene.data) === chapterId)
    .sort((a, b) =>
      compareStoryOrder(
        { order: a.data.order, id: a.data.id, path: a.path },
        { order: b.data.order, id: b.data.id, path: b.path }
      )
    )
  const scene_prompts: ScenePromptPlan[] = []
  let previousOutput = ''
  for (const scene of scenes) {
    const plan = await buildSceneWritingPrompt(
      projectRoot,
      {
        sceneId: scene.data.id,
        selectedElements: selectedByScene[scene.data.id],
        previousOutput
      },
      contextOptions
    )
    scene_prompts.push(plan)
    previousOutput = `【${scene.data.title}】写作完成后，将此处替换为该 scene 的输出。`
  }
  const style = await latestFinalSceneStyle(projectRoot)
  return {
    chapter_id: chapterId,
    scene_prompts,
    style_reference: style
  }
}

function renderStructuredOutline(data: OutlineDoc, content: string): string {
  return [
    `标题：${data.title}`,
    `目标：${data.chapter_goal}`,
    `冲突：${data.chapter_conflict}`,
    `变化：${data.chapter_change}`,
    `章末钩子：${data.ending_hook}`,
    content.trim()
  ]
    .filter(Boolean)
    .join('\n')
}

function renderSceneOutline(data: SceneDoc): string {
  return [
    `标题：${data.title}`,
    `写作重点：${data.writing_focus}`,
    `目标：${data.scene_goal}`,
    `冲突：${data.scene_conflict}`,
    `变化：${data.scene_change}`,
    `地点：${data.location}`,
    `视角人物：${data.pov}`,
    `时间线：${data.timeline_node}`,
    data.outline_content.trim()
  ].join('\n')
}

export async function latestFinalSceneStyle(
  projectRoot: string,
  excludeSceneId?: string
): Promise<{ scene_id: string; title: string; excerpt: string } | undefined> {
  const scenes = (await listDocs<SceneDoc>(projectRoot, 'scene'))
    .filter((scene) => scene.data.status === 'final' && scene.data.id !== excludeSceneId)
    .sort((a, b) => path.basename(b.path).localeCompare(path.basename(a.path)))
  const acceptedSceneIds = new Set(
    scenes.filter((scene) => scene.data.accepted_at).map((scene) => scene.data.id)
  )
  const prose = (await listDocs<import('./types.js').ChapterProseDoc>(projectRoot, 'chapter_prose'))
    .filter((item) => item.data.status === 'final' || item.data.status === 'published')
    .filter((item) => item.data.scene_ids.some((id) => acceptedSceneIds.has(id)))
    .sort((a, b) => (b.data.finalized_at ?? '').localeCompare(a.data.finalized_at ?? ''))[0]
  if (!prose) {
    const legacyScene = scenes.find((scene) => scene.content.trim())
    if (!legacyScene) return undefined
    return {
      scene_id: legacyScene.data.id,
      title: legacyScene.data.title,
      excerpt: legacyScene.content.slice(-2400)
    }
  }
  const sceneId = prose.data.scene_ids.find((id) => acceptedSceneIds.has(id)) ?? prose.data.scene_ids[0]
  return {
    scene_id: sceneId,
    title: prose.data.title,
    excerpt: prose.content.slice(-2400)
  }
}

function renderSelectedElements(selected: NonNullable<ScenePromptInput['selectedElements']>): string {
  return [
    ['timeline', selected.timeline],
    ['locations', selected.locations],
    ['characters', selected.characters],
    ['foreshadowing', selected.foreshadowing],
    ['world_entries', selected.worldEntries],
    ['patterns', selected.patterns]
  ]
    .map(([key, value]) => `${key}: ${Array.isArray(value) && value.length ? value.join(', ') : '未指定'}`)
    .join('\n')
}
