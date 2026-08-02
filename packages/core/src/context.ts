import { findDoc, listDocs, requireDoc } from './documents.js'
import { loadProject } from './project.js'
import type {
  BaseDoc,
  CanonDoc,
  CharacterDoc,
  CharacterStateDoc,
  ForeshadowingDoc,
  IssueDoc,
  LocationDoc,
  OutlineDoc,
  PatternDoc,
  ProjectConfig,
  ReferenceDoc,
  SceneDoc,
  StrategyDoc,
  TimelineEventDoc,
  WorldEntryDoc
} from './types.js'

export interface ContextTarget {
  type: 'outline' | 'scene'
  id: string
}

export interface ContextPacket {
  project: ProjectConfig
  target: {
    type: 'outline' | 'scene'
    id: string
    title: string
    level: OutlineDoc['level'] | 'scene'
  }
  outline_chain: Array<{ data: OutlineDoc; content: string }>
  scene: { data: SceneDoc; content: string } | null
  canon: Array<{ data: CanonDoc; content: string }>
  strategies: Array<{ data: StrategyDoc; content: string }>
  patterns: Array<{ data: PatternDoc; content: string }>
  timeline: Array<{ data: TimelineEventDoc; content: string }>
  characters: Array<{ data: CharacterDoc; content: string }>
  character_states: Array<{ data: CharacterStateDoc; content: string }>
  locations: Array<{ data: LocationDoc; content: string }>
  world_entries: Array<{ data: WorldEntryDoc; content: string }>
  foreshadowing: Array<{ data: ForeshadowingDoc; content: string }>
  issues: Array<{ data: IssueDoc; content: string }>
  references: Array<{ data: ReferenceDoc; content: string }>
  warnings: string[]
  included_ids: string[]
  excluded_ids: string[]
}

type DocWithContent<T extends BaseDoc> = { path: string; data: T; content: string }

function section(title: string, body: string): string {
  return body.trim() ? `## ${title}\n\n${body.trim()}\n` : ''
}

export async function assembleContext(projectRoot: string, sceneId: string): Promise<string> {
  return renderContextPacket(await assembleContextPacket(projectRoot, { type: 'scene', id: sceneId }))
}

export async function assembleContextPacket(
  projectRoot: string,
  target: ContextTarget
): Promise<ContextPacket> {
  const project = await loadProject(projectRoot)
  const all = {
    canon: await listDocs<CanonDoc>(projectRoot, 'canon'),
    strategy: await listDocs<StrategyDoc>(projectRoot, 'strategy'),
    pattern: await listDocs<PatternDoc>(projectRoot, 'pattern'),
    timeline: await listDocs<TimelineEventDoc>(projectRoot, 'timeline_event'),
    character: await listDocs<CharacterDoc>(projectRoot, 'character'),
    character_state: await listDocs<CharacterStateDoc>(projectRoot, 'character_state'),
    location: await listDocs<LocationDoc>(projectRoot, 'location'),
    world_entry: await listDocs<WorldEntryDoc>(projectRoot, 'world_entry'),
    foreshadowing: await listDocs<ForeshadowingDoc>(projectRoot, 'foreshadowing'),
    issue: await listDocs<IssueDoc>(projectRoot, 'issue'),
    reference: await listDocs<ReferenceDoc>(projectRoot, 'reference'),
    outline: await listDocs<OutlineDoc>(projectRoot, 'outline'),
    scene: await listDocs<SceneDoc>(projectRoot, 'scene')
  }
  const scene = target.type === 'scene' ? await requireDoc<SceneDoc>(projectRoot, target.id) : null
  const targetOutline =
    target.type === 'outline'
      ? await requireDoc<OutlineDoc>(projectRoot, target.id)
      : scene
        ? await findDoc<OutlineDoc>(projectRoot, scene.data.section)
        : null
  if (!targetOutline && target.type === 'outline') throw new Error(`Outline not found: ${target.id}`)

  const outlineChain = targetOutline ? collectOutlineChain(all.outline, targetOutline.data.id) : []
  const level = targetOutline?.data.level ?? 'scene'
  const chainIds = outlineChain.map((item) => item.data.id)
  const pins = new Set<string>(outlineChain.flatMap((item) => item.data.context_pins ?? []))
  const exclusions = new Set<string>(outlineChain.flatMap((item) => item.data.context_exclusions ?? []))
  if (scene) {
    for (const id of scene.data.context_pins ?? []) pins.add(id)
    for (const id of scene.data.context_exclusions ?? []) exclusions.add(id)
  }

  const explicitTimeline = new Set(outlineChain.flatMap((item) => item.data.related_timeline ?? []))
  const explicitCharacters = new Set(outlineChain.flatMap((item) => item.data.related_characters ?? []))
  const explicitForeshadowing = new Set([
    ...outlineChain.flatMap((item) => item.data.related_foreshadowing ?? []),
    ...outlineChain.flatMap((item) => item.data.foreshadowing_planted ?? []),
    ...outlineChain.flatMap((item) => item.data.foreshadowing_resolved ?? [])
  ])
  const explicitWorld = new Set(outlineChain.flatMap((item) => item.data.world_entries_used ?? []))
  const explicitPatterns = new Set(outlineChain.flatMap((item) => item.data.related_patterns ?? []))

  if (scene) {
    explicitTimeline.add(scene.data.timeline_node)
    explicitCharacters.add(scene.data.pov)
    for (const id of scene.data.characters ?? []) explicitCharacters.add(id)
    for (const id of scene.data.foreshadowing_planted ?? []) explicitForeshadowing.add(id)
    for (const id of scene.data.foreshadowing_reinforced ?? []) explicitForeshadowing.add(id)
    for (const id of scene.data.foreshadowing_resolved ?? []) explicitForeshadowing.add(id)
    for (const id of scene.data.world_entries_used ?? []) explicitWorld.add(id)
    for (const id of scene.data.related_patterns ?? []) explicitPatterns.add(id)
  }

  const focusText = [
    project.title,
    ...outlineChain.map((item) => item.data.title),
    scene?.data.title,
    scene?.content
  ]
    .filter(Boolean)
    .join('\n')
  const focusTokens = tokensFrom(focusText)
  const broad = level === 'book'
  const mid = level === 'volume' || level === 'act'

  const timeline = chooseDocs(all.timeline, explicitTimeline, exclusions, pins, broad, mid ? 30 : 12, (doc) =>
    matchesFocus(doc, focusTokens, chainIds)
  )
  const characters = chooseDocs(
    all.character,
    explicitCharacters,
    exclusions,
    pins,
    broad,
    mid ? 18 : 10,
    (doc) =>
      matchesFocus(doc, focusTokens, chainIds) ||
      timeline.some((event) => event.data.characters.includes(doc.data.id))
  )
  const characterIds = new Set(characters.map((doc) => doc.data.id))
  const characterStates = chooseDocs(
    all.character_state,
    new Set(
      [...chainIds, ...Array.from(explicitTimeline)].flatMap((id) =>
        stateIdsForScope(all.character_state, id)
      )
    ),
    exclusions,
    pins,
    broad,
    16,
    (doc) =>
      characterIds.has(doc.data.character) &&
      (chainIds.includes(doc.data.scope_id) ||
        timeline.some((event) => event.data.id === doc.data.timeline_node))
  )
  const worldEntries = chooseDocs(
    all.world_entry,
    explicitWorld,
    exclusions,
    pins,
    broad,
    mid ? 30 : 14,
    (doc) => matchesWorldEntry(doc, focusTokens, timeline, characters)
  )
  const patterns = chooseDocs(all.pattern, explicitPatterns, exclusions, pins, broad, mid ? 16 : 8, (doc) =>
    matchesFocus(doc, focusTokens, chainIds)
  )
  const foreshadowing = chooseDocs(
    all.foreshadowing,
    explicitForeshadowing,
    exclusions,
    pins,
    broad,
    mid ? 20 : 12,
    (doc) =>
      matchesFocus(doc, focusTokens, chainIds) ||
      doc.data.related_characters.some((id) => characterIds.has(id)) ||
      chainIds.includes(doc.data.related_arc)
  )
  const locations = chooseDocs(
    all.location,
    new Set(timeline.map((event) => event.data.location).filter(Boolean) as string[]),
    exclusions,
    pins,
    broad,
    mid ? 12 : 6,
    (doc) => matchesFocus(doc, focusTokens, chainIds)
  )
  const openIssues = chooseDocs(
    all.issue.filter((issue) => issue.data.state === 'open'),
    new Set(),
    exclusions,
    pins,
    broad,
    10,
    (doc) =>
      doc.data.related_docs.some((id) => chainIds.includes(id) || pins.has(id)) ||
      matchesFocus(doc, focusTokens, chainIds)
  )
  const references = chooseDocs(all.reference, new Set(), exclusions, pins, broad, 8, (doc) =>
    matchesFocus(doc, focusTokens, chainIds)
  )

  const warnings = buildPacketWarnings({
    level,
    outlines: all.outline,
    scenes: all.scene,
    locations: all.location,
    timeline: all.timeline,
    foreshadowing: all.foreshadowing,
    characterStates: all.character_state,
    canon: all.canon,
    strategy: all.strategy,
    outlineChain,
    scene
  })

  const included = [
    ...all.canon.filter((item) => item.data.status !== 'deprecated').map((item) => item.data.id),
    ...all.strategy.filter((item) => item.data.status !== 'deprecated').map((item) => item.data.id),
    ...patterns.map((item) => item.data.id),
    ...timeline.map((item) => item.data.id),
    ...characters.map((item) => item.data.id),
    ...characterStates.map((item) => item.data.id),
    ...locations.map((item) => item.data.id),
    ...worldEntries.map((item) => item.data.id),
    ...foreshadowing.map((item) => item.data.id),
    ...openIssues.map((item) => item.data.id),
    ...references.map((item) => item.data.id)
  ].filter((id) => !exclusions.has(id))

  return {
    project,
    target: {
      type: target.type,
      id: target.id,
      title: scene?.data.title ?? targetOutline?.data.title ?? target.id,
      level
    },
    outline_chain: outlineChain,
    scene: scene ? { data: scene.data, content: scene.content } : null,
    canon: all.canon.filter((item) => item.data.status !== 'deprecated' && !exclusions.has(item.data.id)),
    strategies: all.strategy.filter(
      (item) => item.data.status !== 'deprecated' && !exclusions.has(item.data.id)
    ),
    patterns,
    timeline,
    characters,
    character_states: characterStates,
    locations,
    world_entries: worldEntries,
    foreshadowing,
    issues: openIssues,
    references,
    warnings,
    included_ids: [...new Set(included)],
    excluded_ids: [...exclusions]
  }
}

export function renderContextPacket(packet: ContextPacket): string {
  const outlineText = packet.outline_chain
    .map((item) => `### ${outlineLevelLabel(item.data.level)}: ${item.data.title}\n\n${item.content.trim()}`)
    .join('\n\n')
  const sceneText = packet.scene
    ? `### ${packet.scene.data.title}\n\n${packet.scene.content.trim() || '(empty draft)'}`
    : ''
  return [
    `# Quillarium Context Packet: ${packet.target.title}`,
    section(
      'Target',
      `type: ${packet.target.type}\nlevel: ${outlineLevelLabel(packet.target.level)}\nid: ${packet.target.id}`
    ),
    section(
      'Project',
      `title: ${packet.project.title}\ngenre: ${packet.project.genre}\ntarget_words: ${packet.project.target_words}\nchapter_words: ${packet.project.chapter_words}`
    ),
    section(
      'Canon',
      renderDocs(packet.canon, (doc) => `strength: ${doc.data.strength}\nsource: ${doc.data.source}`)
    ),
    section(
      'Strategy',
      renderDocs(packet.strategies, (doc) => `category: ${doc.data.category}\nscope: ${doc.data.scope}`)
    ),
    section(
      'Patterns',
      renderDocs(
        packet.patterns,
        (doc) =>
          `kind: ${doc.data.kind}\nscope: ${doc.data.scope}\napplies_to: ${doc.data.applies_to.join(', ')}\nsource: ${doc.data.source}`
      )
    ),
    section('Outline Chain', [outlineText, sceneText].filter(Boolean).join('\n\n')),
    section(
      'Timeline',
      renderDocs(
        packet.timeline,
        (doc) => `date: ${doc.data.date}\nduration: ${doc.data.duration}\nlocation: ${doc.data.location}`
      )
    ),
    section(
      'Characters',
      renderDocs(
        packet.characters,
        (doc) =>
          `role: ${doc.data.role}\ndesire: ${doc.data.desire}\nfear: ${doc.data.fear}\nbottom_line: ${doc.data.bottom_line}`
      )
    ),
    section(
      'Character States',
      renderDocs(
        packet.character_states,
        (doc) =>
          `character: ${doc.data.character}\nscope: ${doc.data.scope_type}:${doc.data.scope_id}\nemotion: ${doc.data.emotion}\nmotivation: ${doc.data.motivation}\nknowledge: ${doc.data.knowledge.join(', ')}`
      )
    ),
    section(
      'Locations',
      renderDocs(
        packet.locations,
        (doc) => `parent: ${doc.data.parent_location}\ndescription: ${doc.data.description}`
      )
    ),
    section(
      'World Entries',
      renderDocs(
        packet.world_entries,
        (doc) =>
          `role: ${doc.data.role}\nimportance: ${doc.data.importance}\nvalid_from: ${doc.data.valid_from}\nvalid_until: ${doc.data.valid_until}\nstory_setting: ${doc.data.story_setting}`
      )
    ),
    section(
      'Foreshadowing',
      renderDocs(
        packet.foreshadowing,
        (doc) =>
          `level: ${doc.data.level}\nstate: ${doc.data.state}\nsummary: ${doc.data.summary}\nplant: ${doc.data.planned_plant}\nresolve: ${doc.data.planned_resolve}`
      )
    ),
    section(
      'Open Issues',
      renderDocs(
        packet.issues,
        (doc) =>
          `priority: ${doc.data.priority}\ndue: ${doc.data.due}\ndecision_needed: ${doc.data.decision_needed}`
      )
    ),
    section('Warnings', packet.warnings.map((warning) => `- ${warning}`).join('\n')),
    section(
      'Generation Target',
      packet.target.level === 'chapter'
        ? 'Write the current chapter draft only. Respect the hand-written chapter outline and do not invent hard canon.'
        : 'Use this packet for planning, consistency checks, and outline refinement.'
    )
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function outlineLevelLabel(level: OutlineDoc['level'] | 'scene'): string {
  const labels: Record<OutlineDoc['level'] | 'scene', string> = {
    book: '总纲',
    volume: '卷纲',
    act: '幕纲',
    arc: '段纲',
    chapter: '章纲',
    section: '场景',
    scene: '正文段落'
  }
  return labels[level]
}

function renderDocs<T extends BaseDoc>(
  docs: Array<{ data: T; content: string }>,
  meta: (doc: { data: T; content: string }) => string
): string {
  return docs
    .map((doc) => `### ${doc.data.title}\n\n${meta(doc)}\n\n${doc.content.trim()}`.trim())
    .join('\n\n')
}

function collectOutlineChain(
  outlines: Array<DocWithContent<OutlineDoc>>,
  outlineId: string
): Array<{ data: OutlineDoc; content: string }> {
  const byId = new Map(outlines.map((doc) => [doc.data.id, doc]))
  const out: Array<{ data: OutlineDoc; content: string }> = []
  let current = byId.get(outlineId) ?? null
  const seen = new Set<string>()
  while (current && !seen.has(current.data.id)) {
    seen.add(current.data.id)
    out.unshift({ data: current.data, content: current.content })
    current = current.data.parent ? (byId.get(current.data.parent) ?? null) : null
  }
  return out
}

function chooseDocs<T extends BaseDoc>(
  docs: Array<DocWithContent<T>>,
  explicitIds: Set<string>,
  exclusions: Set<string>,
  pins: Set<string>,
  includeAll: boolean,
  limit: number,
  predicate: (doc: DocWithContent<T>) => boolean
): Array<{ data: T; content: string }> {
  const selected = docs.filter(
    (doc) =>
      !exclusions.has(doc.data.id) &&
      (includeAll || pins.has(doc.data.id) || explicitIds.has(doc.data.id) || predicate(doc))
  )
  const pinned = selected.filter((doc) => pins.has(doc.data.id) || explicitIds.has(doc.data.id))
  const inferred = selected.filter((doc) => !pins.has(doc.data.id) && !explicitIds.has(doc.data.id))
  return [...dedupeDocs(pinned), ...dedupeDocs(inferred).slice(0, includeAll ? docs.length : limit)]
}

function dedupeDocs<T extends BaseDoc>(docs: Array<DocWithContent<T>>): Array<{ data: T; content: string }> {
  const seen = new Set<string>()
  const out: Array<{ data: T; content: string }> = []
  for (const doc of docs) {
    if (seen.has(doc.data.id)) continue
    seen.add(doc.data.id)
    out.push({ data: doc.data, content: doc.content })
  }
  return out
}

function tokensFrom(text: string): string[] {
  return [
    ...new Set(
      text
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  ].slice(0, 80)
}

function matchesFocus<T extends BaseDoc>(
  doc: DocWithContent<T>,
  tokens: string[],
  chainIds: string[]
): boolean {
  const haystack = [doc.data.id, doc.data.title, ...(doc.data.tags ?? []), doc.content]
    .join('\n')
    .toLocaleLowerCase()
  return (
    chainIds.some((id) => haystack.includes(id.toLocaleLowerCase())) ||
    tokens.some((token) => haystack.includes(token))
  )
}

function matchesWorldEntry(
  doc: DocWithContent<WorldEntryDoc>,
  tokens: string[],
  timeline: Array<{ data: TimelineEventDoc; content: string }>,
  characters: Array<{ data: CharacterDoc; content: string }>
): boolean {
  const focus = [
    ...tokens,
    ...timeline.flatMap((event) => [event.data.title, event.content]),
    ...characters.map((char) => char.data.title)
  ]
    .join('\n')
    .toLocaleLowerCase()
  return [...doc.data.triggers, ...doc.data.category_tags, doc.data.title, doc.data.code].some(
    (item) => item && focus.includes(item.toLocaleLowerCase())
  )
}

function stateIdsForScope(states: Array<DocWithContent<CharacterStateDoc>>, scopeId: string): string[] {
  return states.filter((state) => state.data.scope_id === scopeId).map((state) => state.data.id)
}

function buildPacketWarnings(input: {
  level: OutlineDoc['level'] | 'scene'
  outlines: Array<DocWithContent<OutlineDoc>>
  scenes: Array<DocWithContent<SceneDoc>>
  locations: Array<DocWithContent<LocationDoc>>
  timeline: Array<DocWithContent<TimelineEventDoc>>
  foreshadowing: Array<DocWithContent<ForeshadowingDoc>>
  characterStates: Array<DocWithContent<CharacterStateDoc>>
  canon: Array<DocWithContent<CanonDoc>>
  strategy: Array<DocWithContent<StrategyDoc>>
  outlineChain: Array<{ data: OutlineDoc; content: string }>
  scene: { data: SceneDoc; content: string } | null
}): string[] {
  const warnings: string[] = []
  const chainIds = input.outlineChain.map((item) => item.data.id)
  const target = input.outlineChain.at(-1)
  if (!input.locations.length)
    warnings.push('缺地点：当前项目没有 location 文档，生成前需要从世界书或时间线补齐地点。')
  if (!input.outlines.some((doc) => doc.data.level === 'chapter'))
    warnings.push('缺章纲：当前项目还没有 chapter outline。')
  if (!input.scenes.length) warnings.push('缺场景/正文段落：当前项目还没有 scene 文档。')
  if (!input.characterStates.length) warnings.push('人物状态不足：还没有 character_state 快照。')
  if (!input.strategy.length) warnings.push('缺叙事策略：建议将文风、节奏、爽点等从 Canon 中拆为 strategy。')
  if (input.canon.some((doc) => /叙事策略|文风|节奏|爽点/.test(`${doc.data.title}\n${doc.content}`))) {
    warnings.push('叙事策略仍混在 Canon 中：建议迁移为 strategy 文档。')
  }
  if (input.timeline.some((doc) => !doc.data.previous && !doc.data.next) && input.timeline.length > 1) {
    warnings.push('时间线主链可能未完整连接：存在既无 previous 也无 next 的事件。')
  }
  if (target && target.data.level !== 'book') {
    const hasTimeline =
      input.timeline.some((doc) => chainIds.includes(String(doc.data.id))) ||
      (target.data.related_timeline ?? []).length > 0
    if (!hasTimeline && target.data.level !== 'arc')
      warnings.push(`${outlineLevelLabel(target.data.level)}缺少时间线绑定。`)
    if (!(target.data.related_characters ?? []).length) {
      warnings.push(`${outlineLevelLabel(target.data.level)}缺少相关人物绑定。`)
    }
  }
  for (const item of input.foreshadowing) {
    if (!item.data.planned_plant && !item.data.planted_at)
      warnings.push(`伏笔 ${item.data.title} 缺少埋设位置。`)
    if (!item.data.planned_resolve && item.data.state !== 'resolved')
      warnings.push(`伏笔 ${item.data.title} 缺少回收计划。`)
  }
  if (input.scene) {
    if (!input.scene.data.location) warnings.push('当前场景缺地点。')
    if (!input.scene.data.timeline_node) warnings.push('当前场景缺时间线节点。')
    if (!input.scene.data.pov) warnings.push('当前场景缺 POV。')
  }
  return [...new Set(warnings)]
}
