import { findDoc, listDocs, requireDoc } from './documents.js'
import { loadProject } from './project.js'
import { loadSharedGuidance } from './workspace.js'
import { timelineIdsForOutline } from './chapter-relations.js'
import { evaluateForeshadowingReminders } from './foreshadowing.js'
import { isEnabledPlanningCard } from './planning-cards.js'
import { sortTimelineEvents, validateTimelineChain } from './timeline.js'
import type {
  BaseDoc,
  CanonDoc,
  CharacterDoc,
  CharacterStateDoc,
  ContextTraceEntry,
  ForeshadowingDoc,
  IssueDoc,
  LocationDoc,
  NarrativeDoc,
  OutlineDoc,
  PatternDoc,
  ProjectConfig,
  SceneDoc,
  SharedGuidanceContent,
  SharedGuidanceScope,
  StrategyDoc,
  TimelineEventDoc,
  TimelineNodeDoc,
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
  narratives: Array<{ data: NarrativeDoc; content: string }>
  timeline_nodes: Array<{ data: TimelineNodeDoc; content: string }>
  timeline: Array<{ data: TimelineEventDoc; content: string }>
  characters: Array<{ data: CharacterDoc; content: string }>
  character_states: Array<{ data: CharacterStateDoc; content: string }>
  locations: Array<{ data: LocationDoc; content: string }>
  world_entries: Array<{ data: WorldEntryDoc; content: string }>
  foreshadowing: Array<{ data: ForeshadowingDoc; content: string }>
  issues: Array<{ data: IssueDoc; content: string }>
  shared_guidance: SharedGuidanceContent[]
  context_trace: ContextTraceEntry[]
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
    canon: (await listDocs<CanonDoc>(projectRoot, 'canon')).filter((item) =>
      isEnabledPlanningCard(item.data)
    ),
    strategy: (await listDocs<StrategyDoc>(projectRoot, 'strategy')).filter((item) =>
      isEnabledPlanningCard(item.data)
    ),
    pattern: (await listDocs<PatternDoc>(projectRoot, 'pattern')).filter((item) =>
      isEnabledPlanningCard(item.data)
    ),
    narrative: (await listDocs<NarrativeDoc>(projectRoot, 'narrative')).filter((item) =>
      isEnabledPlanningCard(item.data)
    ),
    timeline_node: (await listDocs<TimelineNodeDoc>(projectRoot, 'timeline_node')).filter((item) =>
      isEnabledPlanningCard(item.data)
    ),
    timeline: (await listDocs<TimelineEventDoc>(projectRoot, 'timeline_event')).filter((item) =>
      isEnabledPlanningCard(item.data)
    ),
    character: (await listDocs<CharacterDoc>(projectRoot, 'character')).filter((item) =>
      isEnabledPlanningCard(item.data)
    ),
    character_state: (await listDocs<CharacterStateDoc>(projectRoot, 'character_state')).filter((item) =>
      isEnabledPlanningCard(item.data)
    ),
    location: (await listDocs<LocationDoc>(projectRoot, 'location')).filter((item) =>
      isEnabledPlanningCard(item.data)
    ),
    world_entry: (await listDocs<WorldEntryDoc>(projectRoot, 'world_entry')).filter((item) =>
      isEnabledPlanningCard(item.data)
    ),
    foreshadowing: (await listDocs<ForeshadowingDoc>(projectRoot, 'foreshadowing')).filter((item) =>
      isEnabledPlanningCard(item.data)
    ),
    issue: (await listDocs<IssueDoc>(projectRoot, 'issue')).filter((item) =>
      isEnabledPlanningCard(item.data)
    ),
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
  const sharedGuidance = await loadSharedGuidance(
    projectRoot,
    target.type === 'scene' ? 'scene' : guidanceScopeForLevel(level)
  )
  const chainIds = outlineChain.map((item) => item.data.id)
  const pins = new Set<string>(outlineChain.flatMap((item) => item.data.context_pins ?? []))
  const exclusions = new Set<string>(outlineChain.flatMap((item) => item.data.context_exclusions ?? []))
  if (scene) {
    for (const id of scene.data.context_pins ?? []) pins.add(id)
    for (const id of scene.data.context_exclusions ?? []) exclusions.add(id)
  }

  const explicitTimeline = new Set(outlineChain.flatMap((item) => item.data.related_timeline ?? []))
  if (targetOutline) {
    for (const id of timelineIdsForOutline(targetOutline.data, all.timeline)) explicitTimeline.add(id)
  }
  const explicitCharacters = new Set(outlineChain.flatMap((item) => item.data.related_characters ?? []))
  for (const event of all.timeline.filter((item) => explicitTimeline.has(item.data.id))) {
    for (const value of event.data.characters) {
      const character = all.character.find((item) => item.data.id === value || item.data.title === value)
      if (character) explicitCharacters.add(character.data.id)
    }
  }
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
    ...outlineChain.flatMap((item) => [item.data.title, item.content]),
    scene?.data.title,
    scene?.content
  ]
    .filter(Boolean)
    .join('\n')
  const focusTokens = tokensFrom(focusText)
  const enabledCardIds = Object.values(all)
    .flat()
    .filter((item) => 'enabled' in item.data && item.data.enabled !== false)
    .map((item) => item.data.id)
  const activeForeshadowingReminders = evaluateForeshadowingReminders(
    all.foreshadowing.map((item) => item.data),
    {
      outline_ids: chainIds,
      timeline_ids: explicitTimeline,
      enabled_card_ids: enabledCardIds,
      text: focusText
    }
  )
  for (const reminder of activeForeshadowingReminders) explicitForeshadowing.add(reminder.card_id)
  const broad = level === 'book'
  const mid = level === 'volume' || level === 'act'
  const narrow = target.type === 'scene' || level === 'chapter' || level === 'section'

  const explicitTimelineEvents = new Set(
    all.timeline
      .filter(
        (event) =>
          explicitTimeline.has(event.data.id) ||
          Boolean(event.data.timeline_node && explicitTimeline.has(event.data.timeline_node))
      )
      .map((event) => event.data.id)
  )
  const chosenTimeline = chooseDocs(
    all.timeline,
    explicitTimelineEvents,
    exclusions,
    pins,
    broad,
    mid ? 30 : 12,
    (doc) => (!narrow || explicitTimeline.size === 0) && matchesFocus(doc, focusTokens, chainIds)
  )
  const timeline = sortTimelineEvents(
    chosenTimeline.map((item) => item.data),
    all.timeline_node.map((item) => item.data)
  ).map((event) => chosenTimeline.find((item) => item.data.id === event.id)!)
  const selectedTimelineNodeIds = new Set([
    ...Array.from(explicitTimeline).filter((id) => all.timeline_node.some((node) => node.data.id === id)),
    ...timeline.flatMap((event) => (event.data.timeline_node ? [event.data.timeline_node] : []))
  ])
  const timelineNodes = all.timeline_node.filter((node) => selectedTimelineNodeIds.has(node.data.id))
  const characters = chooseDocs(
    all.character,
    explicitCharacters,
    exclusions,
    pins,
    broad,
    mid ? 18 : 10,
    (doc) =>
      ((!narrow || explicitCharacters.size === 0) && matchesFocus(doc, focusTokens, chainIds)) ||
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
    (doc) => matchesWorldEntry(doc, focusTokens, timeline, characters, focusText)
  )
  const patterns = chooseDocs(all.pattern, explicitPatterns, exclusions, pins, broad, mid ? 16 : 8, (doc) =>
    matchesFocus(doc, focusTokens, chainIds)
  )
  const narratives = chooseDocs(
    all.narrative,
    explicitPatterns,
    exclusions,
    pins,
    broad,
    mid ? 16 : 8,
    (doc) => matchesFocus(doc, focusTokens, chainIds)
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
  const explicitLocations = new Set<string>()
  for (const event of timeline) {
    if (!event.data.location) continue
    const location = all.location.find(
      (item) => item.data.id === event.data.location || item.data.title === event.data.location
    )
    if (location) explicitLocations.add(location.data.id)
  }
  if (scene?.data.location) explicitLocations.add(scene.data.location)
  const locations = chooseDocs(
    all.location,
    explicitLocations,
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
  const warnings = buildPacketWarnings({
    level,
    outlines: all.outline,
    scenes: all.scene,
    locations: all.location,
    timelineNodes: all.timeline_node,
    timeline: all.timeline,
    foreshadowing: all.foreshadowing,
    characterStates: all.character_state,
    canon: all.canon,
    strategy: all.strategy,
    narratives: all.narrative,
    outlineChain,
    scene
  })
  warnings.push(
    ...detectSharedGuidanceConflicts(sharedGuidance, all.canon, all.strategy, outlineChain, scene)
  )
  warnings.push(
    ...activeForeshadowingReminders.map((reminder) =>
      reminder.reminder_window
        ? `伏笔提醒：${reminder.title}（建议处理窗口：${reminder.reminder_window}）。`
        : `伏笔提醒：${reminder.title} 的触发条件已满足。`
    )
  )

  const included = [
    ...all.canon.filter((item) => item.data.status !== 'deprecated').map((item) => item.data.id),
    ...all.strategy.filter((item) => item.data.status !== 'deprecated').map((item) => item.data.id),
    ...narratives.map((item) => item.data.id),
    ...patterns.map((item) => item.data.id),
    ...timelineNodes.map((item) => item.data.id),
    ...timeline.map((item) => item.data.id),
    ...characters.map((item) => item.data.id),
    ...characterStates.map((item) => item.data.id),
    ...locations.map((item) => item.data.id),
    ...worldEntries.map((item) => item.data.id),
    ...foreshadowing.map((item) => item.data.id),
    ...openIssues.map((item) => item.data.id)
  ].filter((id) => !exclusions.has(id))

  const contextTrace = buildContextTrace({
    scene,
    canon: all.canon.filter((item) => item.data.status !== 'deprecated' && !exclusions.has(item.data.id)),
    strategies: all.strategy.filter(
      (item) => item.data.status !== 'deprecated' && !exclusions.has(item.data.id)
    ),
    narratives: narratives.filter((item) => !exclusions.has(item.data.id)),
    outlineChain,
    sharedGuidance,
    exclusions
  })

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
    narratives,
    timeline_nodes: timelineNodes,
    timeline,
    characters,
    character_states: characterStates,
    locations,
    world_entries: worldEntries,
    foreshadowing,
    issues: openIssues,
    shared_guidance: sharedGuidance,
    context_trace: contextTrace,
    warnings: [...new Set(warnings)],
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
      'Shared Guidance (advisory; accepted prose, Canon, and project guidance take priority)',
      packet.shared_guidance
        .map(
          (item) =>
            `### ${item.id}\n\npath: ${item.path}\nscope: ${item.scope}\nsha256: ${item.sha256}\n\n${item.content.trim()}`
        )
        .join('\n\n')
    ),
    section(
      'Canon',
      renderDocs(packet.canon, (doc) => `strength: ${doc.data.strength}\nsource: ${doc.data.source}`)
    ),
    section(
      'Legacy Strategy',
      renderDocs(packet.strategies, (doc) => `category: ${doc.data.category}\nscope: ${doc.data.scope}`)
    ),
    section(
      'Legacy Patterns',
      renderDocs(
        packet.patterns,
        (doc) =>
          `kind: ${doc.data.kind}\nscope: ${doc.data.scope}\napplies_to: ${doc.data.applies_to.join(', ')}\nsource: ${doc.data.source}`
      )
    ),
    section(
      'Narrative Cards',
      renderDocs(
        packet.narratives,
        (doc) =>
          `category: ${doc.data.category}\nscope: ${doc.data.scope}\napplies_to: ${doc.data.applies_to.join(', ')}\nsource: ${doc.data.source}\nprinciples: ${doc.data.principles.join(' | ')}\navoid: ${doc.data.avoid.join(' | ')}`
      )
    ),
    section('Outline Chain', [outlineText, sceneText].filter(Boolean).join('\n\n')),
    section('Timeline', renderTimeline(packet.timeline_nodes, packet.timeline)),
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
    overview: '总览',
    book: '总纲',
    volume: '卷',
    part: '篇',
    act: '幕',
    arc: '篇（旧）',
    chapter: '章',
    section: '节',
    scene: '节正文'
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

function renderTimeline(
  nodes: Array<{ data: TimelineNodeDoc; content: string }>,
  events: Array<{ data: TimelineEventDoc; content: string }>
): string {
  const renderedNodeIds = new Set(nodes.map((node) => node.data.id))
  const grouped = nodes
    .map((node) => {
      const concurrent = events.filter((event) => event.data.timeline_node === node.data.id)
      return [
        `### ${node.data.display_time || node.data.title}`,
        `timeline_node: ${node.data.id}`,
        `precision: ${node.data.precision}`,
        node.data.fuzzy ? `month_range: ${node.data.month}-${node.data.month_end ?? node.data.month}` : '',
        ...concurrent.map(
          (event) =>
            `#### ${event.data.title}\n\nduration: ${event.data.duration}\nlocation: ${event.data.location}\ncharacters: ${event.data.characters.join(', ')}\n\n${event.content.trim()}`
        )
      ]
        .filter(Boolean)
        .join('\n\n')
    })
    .join('\n\n')
  const legacy = events.filter(
    (event) => !event.data.timeline_node || !renderedNodeIds.has(event.data.timeline_node)
  )
  const legacyText = renderDocs(
    legacy,
    (event) =>
      `legacy_date: ${event.data.date}\nduration: ${event.data.duration}\nlocation: ${event.data.location}`
  )
  return [grouped, legacyText].filter(Boolean).join('\n\n')
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
  characters: Array<{ data: CharacterDoc; content: string }>,
  rawFocus: string
): boolean {
  const focus = [
    rawFocus,
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
  timelineNodes: Array<DocWithContent<TimelineNodeDoc>>
  timeline: Array<DocWithContent<TimelineEventDoc>>
  foreshadowing: Array<DocWithContent<ForeshadowingDoc>>
  characterStates: Array<DocWithContent<CharacterStateDoc>>
  canon: Array<DocWithContent<CanonDoc>>
  strategy: Array<DocWithContent<StrategyDoc>>
  narratives: Array<DocWithContent<NarrativeDoc>>
  outlineChain: Array<{ data: OutlineDoc; content: string }>
  scene: { data: SceneDoc; content: string } | null
}): string[] {
  const warnings: string[] = []
  const chainIds = input.outlineChain.map((item) => item.data.id)
  const target = input.outlineChain.at(-1)
  if (!input.locations.length)
    warnings.push('缺地点：当前项目没有 location 文档，生成前需要从世界书或时间线补齐地点。')
  if (!input.outlines.some((doc) => doc.data.level === 'chapter'))
    warnings.push('缺章：当前项目还没有 chapter outline。')
  if (!input.scenes.length) warnings.push('缺场景/正文段落：当前项目还没有 scene 文档。')
  if (!input.characterStates.length) warnings.push('人物状态不足：还没有 character_state 快照。')
  if (!input.strategy.length && !input.narratives.length)
    warnings.push('缺叙事卡片：建议将文风、节奏、结构等规则整理为启用的叙事卡片。')
  if (input.canon.some((doc) => /叙事策略|文风|节奏|爽点/.test(`${doc.data.title}\n${doc.content}`))) {
    warnings.push('叙事规则仍混在 Canon 中：建议迁移为叙事卡片。')
  }
  if (input.timelineNodes.length) {
    warnings.push(
      ...validateTimelineChain(input.timelineNodes.map((document) => document.data)).map(
        (issue) => issue.message
      )
    )
  } else if (
    input.timeline.some((doc) => !doc.data.previous && !doc.data.next) &&
    input.timeline.length > 1
  ) {
    warnings.push('时间线主链可能未完整连接：存在既无 previous 也无 next 的事件。')
  }
  if (target && target.data.level !== 'book') {
    const hasTimeline =
      input.timeline.some((doc) => chainIds.includes(String(doc.data.id))) ||
      (target.data.related_timeline ?? []).length > 0 ||
      timelineIdsForOutline(target.data, input.timeline).length > 0
    if (!hasTimeline && target.data.level !== 'arc' && target.data.level !== 'part')
      warnings.push(`${outlineLevelLabel(target.data.level)}缺少时间线绑定。`)
    const inferredTimelineIds = new Set(timelineIdsForOutline(target.data, input.timeline))
    const hasTimelineCharacters = input.timeline.some(
      (event) => inferredTimelineIds.has(event.data.id) && event.data.characters.length > 0
    )
    if (!(target.data.related_characters ?? []).length && !hasTimelineCharacters) {
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

function guidanceScopeForLevel(level: OutlineDoc['level'] | 'scene'): SharedGuidanceScope {
  if (level === 'arc') return 'part'
  if (level === 'section') return 'scene'
  return level
}

function buildContextTrace(input: {
  scene: { data: SceneDoc; content: string } | null
  canon: Array<DocWithContent<CanonDoc>>
  strategies: Array<DocWithContent<StrategyDoc>>
  narratives: Array<{ data: NarrativeDoc; content: string }>
  outlineChain: Array<{ data: OutlineDoc; content: string }>
  sharedGuidance: SharedGuidanceContent[]
  exclusions: Set<string>
}): ContextTraceEntry[] {
  return [
    ...(input.scene?.data.status === 'final'
      ? [
          {
            source_type: 'accepted_prose' as const,
            source_id: input.scene.data.id,
            priority: 400,
            selected: true,
            reason: 'accepted prose is authoritative'
          }
        ]
      : []),
    ...input.canon.map((item) => ({
      source_type: 'canon' as const,
      source_id: item.data.id,
      priority: item.data.strength === 'hard' ? 400 : 300,
      selected: true,
      reason: item.data.strength === 'hard' ? 'hard canon is authoritative' : 'active soft canon'
    })),
    ...input.strategies.map((item) => ({
      source_type: 'project_guidance' as const,
      source_id: item.data.id,
      priority: 300,
      selected: true,
      reason: 'active project strategy'
    })),
    ...input.narratives.map((item) => ({
      source_type: 'project_guidance' as const,
      source_id: item.data.id,
      priority: 300,
      selected: true,
      reason: 'enabled narrative card'
    })),
    ...input.outlineChain.map((item) => ({
      source_type: 'project_guidance' as const,
      source_id: item.data.id,
      priority: 300,
      selected: true,
      reason: 'target outline chain'
    })),
    ...input.sharedGuidance.map((item) => ({
      source_type: 'shared_guidance' as const,
      source_id: item.id,
      priority: 100,
      selected: true,
      reason: `workspace guidance selected for ${item.scope} scope`
    })),
    ...[...input.exclusions].map((id) => ({
      source_type: 'project_guidance' as const,
      source_id: id,
      priority: 300,
      selected: false,
      reason: 'explicit project context exclusion'
    }))
  ]
}

function detectSharedGuidanceConflicts(
  guidance: SharedGuidanceContent[],
  canon: Array<DocWithContent<CanonDoc>>,
  strategies: Array<DocWithContent<StrategyDoc>>,
  outlineChain: Array<{ data: OutlineDoc; content: string }>,
  scene: { data: SceneDoc; content: string } | null
): string[] {
  const projectLines = [
    ...canon
      .filter((item) => item.data.status !== 'deprecated')
      .flatMap((item) => [item.data.title, item.content]),
    ...strategies
      .filter((item) => item.data.status !== 'deprecated')
      .flatMap((item) => [item.data.title, ...item.data.principles, ...item.data.avoid, item.content]),
    ...outlineChain.flatMap((item) => [item.data.title, item.content]),
    ...(scene?.data.status === 'final' ? [scene.content] : [])
  ].flatMap(toMeaningfulLines)

  const warnings: string[] = []
  for (const item of guidance) {
    const guidanceLines = toMeaningfulLines(item.content)
    if (hasPolarityConflict(projectLines, guidanceLines)) {
      warnings.push(`共享指导 ${item.id} 与项目事实或策略存在冲突；已保留项目内容，未自动覆盖。`)
    }
  }
  return warnings
}

function toMeaningfulLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*#>]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length >= 4)
}

function hasPolarityConflict(projectLines: string[], guidanceLines: string[]): boolean {
  for (const projectLine of projectLines) {
    const project = normalizeDirective(projectLine)
    if (!project.core) continue
    for (const guidanceLine of guidanceLines) {
      const guidance = normalizeDirective(guidanceLine)
      if (!guidance.core || project.negative === guidance.negative) continue
      if (
        project.core === guidance.core ||
        (Math.min(project.core.length, guidance.core.length) >= 6 &&
          (project.core.includes(guidance.core) || guidance.core.includes(project.core)))
      ) {
        return true
      }
    }
  }
  return false
}

function normalizeDirective(value: string): { core: string; negative: boolean } {
  const negativePattern =
    /\b(?:not|never|avoid|forbid|mustn't|must not|do not|don't)\b|禁止|不得|不要|不可|避免/u
  const negative = negativePattern.test(value.toLocaleLowerCase())
  const core = value
    .toLocaleLowerCase()
    .replace(negativePattern, '')
    .replace(/\b(?:must|should|always|please)\b|必须|应当|应该|始终|务必/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
  return { core, negative }
}
