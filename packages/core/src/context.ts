import path from 'node:path'
import { findDoc, listDocs, requireDoc } from './documents.js'
import { loadProject } from './project.js'
import { loadSharedGuidance } from './workspace.js'
import { timelineIdsForOutline } from './chapter-relations.js'
import { evaluateForeshadowingReminders } from './foreshadowing.js'
import { isEnabledPlanningCard } from './planning-cards.js'
import { sortTimelineEvents, validateTimelineChain } from './timeline.js'
import {
  compileContextBlocks,
  renderPromptBlocks,
  resolveContextPolicy,
  type ContextCompileOptions,
  type PromptBlockCandidate
} from './context-compiler.js'
import type {
  BaseDoc,
  CanonDoc,
  ChapterProseDoc,
  CharacterDoc,
  CharacterStateDoc,
  ContextTrace,
  ForeshadowingDoc,
  IssueDoc,
  LocationDoc,
  NarrativeDoc,
  OutlineDoc,
  PatternDoc,
  ProjectConfig,
  PromptBlock,
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
  prompt_blocks: PromptBlock[]
  context_trace: ContextTrace
  warnings: string[]
  included_ids: string[]
  excluded_ids: string[]
}

type DocWithContent<T extends BaseDoc> = { path: string; data: T; content: string }

interface ContextActivation {
  reason: string
  trigger_chain: string[]
  depth: number
}

type PlanningContextDocument = DocWithContent<
  | CanonDoc
  | StrategyDoc
  | PatternDoc
  | NarrativeDoc
  | TimelineNodeDoc
  | TimelineEventDoc
  | CharacterDoc
  | CharacterStateDoc
  | LocationDoc
  | WorldEntryDoc
  | ForeshadowingDoc
  | IssueDoc
>

function section(title: string, body: string): string {
  return body.trim() ? `## ${title}\n\n${body.trim()}\n` : ''
}

export async function assembleContext(
  projectRoot: string,
  sceneId: string,
  options: ContextCompileOptions = {}
): Promise<string> {
  return renderContextPacket(
    await assembleContextPacket(projectRoot, { type: 'scene', id: sceneId }, options)
  )
}

export async function assembleContextPacket(
  projectRoot: string,
  target: ContextTarget,
  options: ContextCompileOptions = {}
): Promise<ContextPacket> {
  const policy = resolveContextPolicy(options.policy)
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
    scene: await listDocs<SceneDoc>(projectRoot, 'scene'),
    chapter_prose: await listDocs<ChapterProseDoc>(projectRoot, 'chapter_prose')
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

  const acceptedProse = selectAcceptedProse(all.chapter_prose, all.outline, targetOutline?.data ?? null)
  const activation = new Map<string, ContextActivation>()
  activateDocuments(
    activation,
    all.canon.filter((item) => item.data.status !== 'deprecated'),
    'active project Canon',
    target.id
  )
  activateDocuments(
    activation,
    all.strategy.filter((item) => item.data.status !== 'deprecated'),
    'active project strategy',
    target.id
  )
  activateDocuments(
    activation,
    patterns,
    'pattern matched the writing scope',
    target.id,
    pins,
    explicitPatterns
  )
  activateDocuments(
    activation,
    narratives,
    'narrative card matched the writing scope',
    target.id,
    pins,
    explicitPatterns
  )
  activateDocuments(
    activation,
    timelineNodes,
    'timeline node is linked to the writing scope',
    target.id,
    pins
  )
  activateDocuments(
    activation,
    timeline,
    'timeline event matched the writing scope',
    target.id,
    pins,
    explicitTimelineEvents
  )
  activateDocuments(
    activation,
    characters,
    'character matched the writing scope',
    target.id,
    pins,
    explicitCharacters
  )
  activateDocuments(activation, characterStates, 'character state matched the writing scope', target.id, pins)
  activateDocuments(
    activation,
    locations,
    'location matched the writing scope',
    target.id,
    pins,
    explicitLocations
  )
  activateDocuments(
    activation,
    worldEntries,
    'world entry matched the writing scope',
    target.id,
    pins,
    explicitWorld
  )
  activateDocuments(
    activation,
    foreshadowing,
    'foreshadowing matched the writing scope',
    target.id,
    pins,
    explicitForeshadowing
  )
  activateDocuments(activation, openIssues, 'open issue matched the writing scope', target.id, pins)
  activateDocuments(activation, acceptedProse, 'accepted prose in the current story branch', target.id)
  for (const id of pins) {
    activation.set(id, {
      reason: 'explicit context pin',
      trigger_chain: [`target:${target.id}`, `pin:${id}`],
      depth: 0
    })
  }
  const relationExpansion = expandContextRelations(
    planningDocuments(all),
    activation,
    exclusions,
    policy.max_recursion_depth,
    policy.max_candidates,
    [
      ...outlineChain.map((item) => ({ id: item.data.id, content: item.content })),
      ...(scene ? [{ id: scene.data.id, content: scene.content }] : []),
      ...acceptedProse.map((item) => ({ id: item.data.id, content: item.content }))
    ]
  )
  const uniqueWarnings = [...new Set(warnings)]
  const candidates = buildPromptBlockCandidates({
    projectRoot,
    project,
    target,
    level,
    targetTitle: scene?.data.title ?? targetOutline?.data.title ?? target.id,
    outlineChain,
    outlineDocs: all.outline,
    scene,
    canon: all.canon.filter((item) => item.data.status !== 'deprecated'),
    strategies: all.strategy.filter((item) => item.data.status !== 'deprecated'),
    patterns: all.pattern,
    narratives: all.narrative,
    timelineNodes: all.timeline_node,
    timeline: all.timeline,
    characters: all.character,
    characterStates: all.character_state,
    locations: all.location,
    worldEntries: all.world_entry,
    foreshadowing: all.foreshadowing,
    issues: all.issue.filter((item) => item.data.state === 'open'),
    acceptedProse,
    sharedGuidance,
    warnings: uniqueWarnings,
    activation: relationExpansion.activation,
    exclusions,
    pins,
    cappedRelationshipIds: relationExpansion.capped_ids
  })
  const compiled = await compileContextBlocks(target, candidates, {
    ...options,
    policy,
    reached_recursion_depth: relationExpansion.reached_depth
  })
  const includedSources = new Set(
    compiled.trace.entries
      .filter((entry) => entry.outcome !== 'excluded')
      .map((entry) => `${entry.source_type}:${entry.source_id}`)
  )
  const includedDoc = <T extends BaseDoc>(doc: DocWithContent<T>): boolean =>
    includedSources.has(`${doc.data.type}:${doc.data.id}`)
  const includedGuidance = sharedGuidance.filter((item) => includedSources.has(`shared_guidance:${item.id}`))
  const includedIds = compiled.trace.entries
    .filter((entry) => entry.outcome !== 'excluded' && !entry.source_id.startsWith('$'))
    .map((entry) => entry.source_id)
  const excludedIds = compiled.trace.entries
    .filter((entry) => entry.outcome === 'excluded' && !entry.source_id.startsWith('$'))
    .map((entry) => entry.source_id)

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
    canon: all.canon.filter((item) => item.data.status !== 'deprecated' && includedDoc(item)),
    strategies: all.strategy.filter((item) => item.data.status !== 'deprecated' && includedDoc(item)),
    patterns: all.pattern.filter(includedDoc),
    narratives: all.narrative.filter(includedDoc),
    timeline_nodes: all.timeline_node.filter(includedDoc),
    timeline: sortTimelineEvents(
      all.timeline.filter(includedDoc).map((item) => item.data),
      all.timeline_node.map((item) => item.data)
    ).map((event) => all.timeline.find((item) => item.data.id === event.id)!),
    characters: all.character.filter(includedDoc),
    character_states: all.character_state.filter(includedDoc),
    locations: all.location.filter(includedDoc),
    world_entries: all.world_entry.filter(includedDoc),
    foreshadowing: all.foreshadowing.filter(includedDoc),
    issues: all.issue.filter((item) => item.data.state === 'open' && includedDoc(item)),
    shared_guidance: includedGuidance,
    prompt_blocks: compiled.blocks,
    context_trace: compiled.trace,
    warnings: uniqueWarnings,
    included_ids: [...new Set(includedIds)],
    excluded_ids: [...new Set([...exclusions, ...excludedIds])]
  }
}

export function renderContextPacket(packet: ContextPacket): string {
  if (packet.prompt_blocks?.length) return renderPromptBlocks(packet.prompt_blocks)
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
  _legacyLimit: number,
  predicate: (doc: DocWithContent<T>) => boolean
): Array<{ data: T; content: string }> {
  const selected = docs.filter(
    (doc) =>
      !exclusions.has(doc.data.id) &&
      (includeAll || pins.has(doc.data.id) || explicitIds.has(doc.data.id) || predicate(doc))
  )
  const pinned = selected.filter((doc) => pins.has(doc.data.id) || explicitIds.has(doc.data.id))
  const inferred = selected.filter((doc) => !pins.has(doc.data.id) && !explicitIds.has(doc.data.id))
  // Token budgeting and the global candidate cap now decide the final set. The old
  // per-document-type count is retained only in the call shape for migration clarity.
  return [...dedupeDocs(pinned), ...dedupeDocs(inferred)]
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

function activateDocuments<T extends BaseDoc>(
  activation: Map<string, ContextActivation>,
  documents: Array<{ data: T }>,
  defaultReason: string,
  targetId: string,
  pins: Set<string> = new Set(),
  explicit: Set<string> = new Set()
): void {
  for (const document of documents) {
    const id = document.data.id
    const pinned = pins.has(id)
    const explicitlyLinked = explicit.has(id)
    const reason = pinned
      ? 'explicit context pin'
      : explicitlyLinked
        ? 'explicit relation from the writing scope'
        : defaultReason
    const next: ContextActivation = {
      reason,
      trigger_chain: [
        `target:${targetId}`,
        pinned ? `pin:${id}` : explicitlyLinked ? `relation:${id}` : `scope:${id}`
      ],
      depth: 0
    }
    const current = activation.get(id)
    if (!current || pinned || (!current.reason.startsWith('explicit') && explicitlyLinked)) {
      activation.set(id, next)
    }
  }
}

function planningDocuments(input: {
  canon: Array<DocWithContent<CanonDoc>>
  strategy: Array<DocWithContent<StrategyDoc>>
  pattern: Array<DocWithContent<PatternDoc>>
  narrative: Array<DocWithContent<NarrativeDoc>>
  timeline_node: Array<DocWithContent<TimelineNodeDoc>>
  timeline: Array<DocWithContent<TimelineEventDoc>>
  character: Array<DocWithContent<CharacterDoc>>
  character_state: Array<DocWithContent<CharacterStateDoc>>
  location: Array<DocWithContent<LocationDoc>>
  world_entry: Array<DocWithContent<WorldEntryDoc>>
  foreshadowing: Array<DocWithContent<ForeshadowingDoc>>
  issue: Array<DocWithContent<IssueDoc>>
}): PlanningContextDocument[] {
  return [
    ...input.canon,
    ...input.strategy,
    ...input.pattern,
    ...input.narrative,
    ...input.timeline_node,
    ...input.timeline,
    ...input.character,
    ...input.character_state,
    ...input.location,
    ...input.world_entry,
    ...input.foreshadowing,
    ...input.issue
  ]
}

function expandContextRelations(
  documents: PlanningContextDocument[],
  initial: Map<string, ContextActivation>,
  exclusions: Set<string>,
  maxDepth: number,
  maxCandidates: number,
  seedTexts: Array<{ id: string; content: string }>
): { activation: Map<string, ContextActivation>; reached_depth: number; capped_ids: Set<string> } {
  const activation = new Map(initial)
  const byId = new Map(documents.map((document) => [document.data.id, document]))
  const knownIds = [...byId.keys()].sort((left, right) => left.localeCompare(right, 'en'))
  const cappedIds = new Set<string>()
  let reachedDepth = 0

  const activate = (targetId: string, sourceId: string, relation: string, depth: number): void => {
    if (!byId.has(targetId) || exclusions.has(targetId) || activation.has(targetId)) return
    if (activation.size >= maxCandidates) {
      cappedIds.add(targetId)
      return
    }
    activation.set(targetId, {
      reason: `recursive ${relation} activation from ${sourceId}`,
      trigger_chain: [
        ...(activation.get(sourceId)?.trigger_chain ?? [`source:${sourceId}`]),
        `${relation}:${targetId}`
      ],
      depth
    })
    reachedDepth = Math.max(reachedDepth, depth)
  }

  if (maxDepth > 0) {
    for (const seed of [...seedTexts].sort((left, right) => left.id.localeCompare(right.id, 'en'))) {
      for (const targetId of extractLinkedDocumentIds(seed.content, knownIds, documents)) {
        activate(targetId, seed.id, 'document-link', 1)
      }
    }
  }

  const expandedAt = new Map<string, number>()
  while (true) {
    const source = [...activation.entries()]
      .filter(([id, info]) => byId.has(id) && info.depth < maxDepth && !expandedAt.has(id))
      .sort(([left], [right]) => left.localeCompare(right, 'en'))[0]
    if (!source) break
    const [sourceId, info] = source
    expandedAt.set(sourceId, info.depth)
    const document = byId.get(sourceId)!
    const linked = [
      ...document.data.relations.map((relation) => ({
        id: relation.target_id,
        relation: `relation-${relation.kind}`
      })),
      ...document.data.source_refs.flatMap((reference) => {
        const id = resolveReferenceId(reference, knownIds, documents)
        return id ? [{ id, relation: 'source-reference' }] : []
      }),
      ...extractLinkedDocumentIds(document.content, knownIds, documents).map((id) => ({
        id,
        relation: 'document-link'
      }))
    ].sort(
      (left, right) =>
        left.id.localeCompare(right.id, 'en') || left.relation.localeCompare(right.relation, 'en')
    )
    for (const target of linked) activate(target.id, sourceId, target.relation, info.depth + 1)
  }
  return { activation, reached_depth: reachedDepth, capped_ids: cappedIds }
}

function extractLinkedDocumentIds(
  content: string,
  knownIds: string[],
  documents: PlanningContextDocument[]
): string[] {
  const references = [
    ...content.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/gu),
    ...content.matchAll(/\[[^\]]*\]\(([^)#]+)(?:#[^)]*)?\)/gu)
  ].map((match) => match[1]?.trim() ?? '')
  const ids = references.flatMap((reference) => {
    const id = resolveReferenceId(reference, knownIds, documents)
    return id ? [id] : []
  })
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right, 'en'))
}

function resolveReferenceId(
  reference: string,
  knownIds: string[],
  documents: PlanningContextDocument[]
): string | undefined {
  const normalized = reference.replace(/\\/gu, '/').replace(/\.md$/iu, '').trim()
  if (knownIds.includes(normalized)) return normalized
  const basename = path.posix.basename(normalized)
  const byPath = documents.find((document) => {
    const candidate = document.path.replace(/\\/gu, '/').replace(/\.md$/iu, '')
    return candidate.endsWith(`/${normalized}`) || path.posix.basename(candidate) === basename
  })
  return byPath?.data.id
}

function selectAcceptedProse(
  prose: Array<DocWithContent<ChapterProseDoc>>,
  outlines: Array<DocWithContent<OutlineDoc>>,
  target: OutlineDoc | null
): Array<DocWithContent<ChapterProseDoc>> {
  if (!target) return []
  const byId = new Map(outlines.map((item) => [item.data.id, item.data]))
  const chapter = target.level === 'chapter' ? target : findAncestorLevel(target, byId, 'chapter')
  if (!chapter) return []
  const branch = findAncestorBranch(chapter, byId)
  const branchChapterIds = new Set(
    outlines
      .filter((item) => item.data.level === 'chapter')
      .filter((item) => !branch || isDescendantOf(item.data, branch.id, byId))
      .map((item) => item.data.id)
  )
  const current = prose.filter(
    (item) => item.data.chapter_id === chapter.id && item.content.trim() && item.data.status !== 'published'
  )
  const finalized = prose
    .filter(
      (item) =>
        item.content.trim() &&
        branchChapterIds.has(item.data.chapter_id) &&
        item.data.chapter_id !== chapter.id &&
        (item.data.status === 'final' || item.data.status === 'published')
    )
    .sort(
      (left, right) =>
        (left.data.finalized_at ?? left.data.published_at ?? '').localeCompare(
          right.data.finalized_at ?? right.data.published_at ?? ''
        ) || left.data.id.localeCompare(right.data.id, 'en')
    )
    .slice(-3)
  return [...finalized, ...current].filter(
    (item, index, items) => items.findIndex((candidate) => candidate.data.id === item.data.id) === index
  )
}

function findAncestorLevel(
  start: OutlineDoc,
  byId: Map<string, OutlineDoc>,
  level: OutlineDoc['level']
): OutlineDoc | null {
  let current: OutlineDoc | undefined = start
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    if (current.level === level) return current
    seen.add(current.id)
    current = current.parent ? byId.get(current.parent) : undefined
  }
  return null
}

function findAncestorBranch(start: OutlineDoc, byId: Map<string, OutlineDoc>): OutlineDoc | null {
  let current: OutlineDoc | undefined = start
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    if (current.level === 'part' || current.level === 'act' || current.level === 'arc') return current
    seen.add(current.id)
    current = current.parent ? byId.get(current.parent) : undefined
  }
  return null
}

function isDescendantOf(start: OutlineDoc, ancestorId: string, byId: Map<string, OutlineDoc>): boolean {
  let parent = start.parent
  const seen = new Set<string>()
  while (parent && !seen.has(parent)) {
    if (parent === ancestorId) return true
    seen.add(parent)
    parent = byId.get(parent)?.parent ?? null
  }
  return false
}

function buildPromptBlockCandidates(input: {
  projectRoot: string
  project: ProjectConfig
  target: ContextTarget
  level: OutlineDoc['level'] | 'scene'
  targetTitle: string
  outlineChain: Array<{ data: OutlineDoc; content: string }>
  outlineDocs: Array<DocWithContent<OutlineDoc>>
  scene: DocWithContent<SceneDoc> | null
  canon: Array<DocWithContent<CanonDoc>>
  strategies: Array<DocWithContent<StrategyDoc>>
  patterns: Array<DocWithContent<PatternDoc>>
  narratives: Array<DocWithContent<NarrativeDoc>>
  timelineNodes: Array<DocWithContent<TimelineNodeDoc>>
  timeline: Array<DocWithContent<TimelineEventDoc>>
  characters: Array<DocWithContent<CharacterDoc>>
  characterStates: Array<DocWithContent<CharacterStateDoc>>
  locations: Array<DocWithContent<LocationDoc>>
  worldEntries: Array<DocWithContent<WorldEntryDoc>>
  foreshadowing: Array<DocWithContent<ForeshadowingDoc>>
  issues: Array<DocWithContent<IssueDoc>>
  acceptedProse: Array<DocWithContent<ChapterProseDoc>>
  sharedGuidance: SharedGuidanceContent[]
  warnings: string[]
  activation: Map<string, ContextActivation>
  exclusions: Set<string>
  pins: Set<string>
  cappedRelationshipIds?: Set<string>
}): PromptBlockCandidate[] {
  const scope = input.target.type === 'scene' ? 'scene' : input.level
  const candidates: PromptBlockCandidate[] = [
    {
      id: 'packet:$header',
      kind: 'packet_header',
      title: input.targetTitle,
      content: `# Quillarium Context Packet: ${input.targetTitle}`,
      source: { type: 'compiler', id: '$packet' },
      scope,
      purpose: 'identify the compiled packet',
      authority: 'system',
      authority_rank: 1000,
      priority: 1000,
      order: 0,
      selected: true,
      required: true,
      selection_reason: 'required packet framing',
      truncation: 'none'
    },
    {
      id: 'packet:$target',
      kind: 'target',
      title: 'Target',
      content: section(
        'Target',
        `type: ${input.target.type}\nlevel: ${outlineLevelLabel(input.level)}\nid: ${input.target.id}`
      ),
      source: { type: 'compiler', id: '$target' },
      scope,
      purpose: 'bind the writing scope',
      authority: 'system',
      authority_rank: 1000,
      priority: 990,
      order: 10,
      selected: true,
      required: true,
      selection_reason: 'required writing target',
      truncation: 'none'
    },
    {
      id: 'packet:$project',
      kind: 'project',
      title: 'Project',
      content: section(
        'Project',
        `title: ${input.project.title}\ngenre: ${input.project.genre}\ntarget_words: ${input.project.target_words}\nchapter_words: ${input.project.chapter_words}`
      ),
      source: { type: 'compiler', id: '$project' },
      scope: 'book',
      purpose: 'supply project-level generation constraints',
      authority: 'project',
      authority_rank: 400,
      priority: 400,
      order: 20,
      selected: true,
      required: true,
      selection_reason: 'required project metadata',
      truncation: 'none'
    }
  ]

  for (const item of input.acceptedProse) {
    candidates.push(
      documentCandidate(input, item, {
        kind: 'accepted_prose',
        authority: 'accepted_prose',
        authority_rank: 500,
        priority: 500,
        order: 100,
        purpose: 'preserve accepted continuity and prose style',
        body: `### Accepted Prose: ${item.data.title}\n\n${item.content.trim()}`,
        required: true,
        truncation: 'tail'
      })
    )
  }
  for (const item of input.canon) {
    const hard = item.data.strength === 'hard'
    candidates.push(
      documentCandidate(input, item, {
        kind: 'canon',
        authority: hard ? 'hard_canon' : 'project',
        authority_rank: hard ? 500 : 400,
        priority: hard ? 500 : 400,
        order: 200,
        purpose: hard ? 'enforce authoritative Canon' : 'supply active soft Canon',
        body: `### Canon: ${item.data.title}\n\nstrength: ${item.data.strength}\nsource: ${item.data.source}\n\n${item.content.trim()}`,
        ...(hard ? { required: true, truncation: 'none' as const } : {})
      })
    )
  }
  for (const item of input.outlineChain) {
    const source = input.outlineDocs.find((document) => document.data.id === item.data.id)
    candidates.push({
      id: `document:outline:${item.data.id}`,
      kind: 'outline',
      title: item.data.title,
      content: `### ${outlineLevelLabel(item.data.level)}: ${item.data.title}\n\n${item.content.trim()}`,
      source: {
        type: 'outline',
        id: item.data.id,
        ...(source ? { path: relativeSourcePath(input.projectRoot, source.path) } : {})
      },
      scope: item.data.level,
      purpose: 'supply the target outline chain',
      authority: 'project',
      authority_rank: 400,
      priority: 450,
      order: 300 + item.data.order,
      selected: true,
      required: true,
      selection_reason: 'required target outline chain',
      trigger_chain: [`target:${input.target.id}`, `ancestor:${item.data.id}`],
      truncation: 'head'
    })
  }
  if (input.scene) {
    candidates.push({
      id: `document:scene:${input.scene.data.id}`,
      kind: 'outline',
      title: input.scene.data.title,
      content: `### Current Scene: ${input.scene.data.title}\n\n${input.scene.content.trim() || '(empty draft)'}`,
      source: {
        type: 'scene',
        id: input.scene.data.id,
        path: relativeSourcePath(input.projectRoot, input.scene.path)
      },
      scope: 'scene',
      purpose: 'supply the current scene plan and draft',
      authority: 'project',
      authority_rank: 400,
      priority: 460,
      order: 390,
      selected: true,
      required: true,
      selection_reason: 'required current scene target',
      trigger_chain: [`target:${input.target.id}`],
      truncation: 'head'
    })
  }
  for (const item of input.strategies) {
    candidates.push(
      documentCandidate(input, item, {
        kind: 'project_guidance',
        authority: 'project',
        authority_rank: 350,
        priority: 350,
        order: 400,
        purpose: 'apply project narrative strategy',
        body: `### Project Strategy: ${item.data.title}\n\ncategory: ${item.data.category}\nscope: ${item.data.scope}\n\n${item.content.trim()}`
      })
    )
  }
  for (const item of input.patterns) {
    candidates.push(
      documentCandidate(input, item, {
        kind: 'project_guidance',
        authority: 'project',
        authority_rank: 350,
        priority: 340,
        order: 410,
        purpose: 'apply a matching narrative pattern',
        body: `### Narrative Pattern: ${item.data.title}\n\nkind: ${item.data.kind}\nscope: ${item.data.scope}\napplies_to: ${item.data.applies_to.join(', ')}\n\n${item.content.trim()}`
      })
    )
  }
  for (const item of input.narratives) {
    candidates.push(
      documentCandidate(input, item, {
        kind: 'project_guidance',
        authority: 'project',
        authority_rank: 350,
        priority: 345,
        order: 420,
        purpose: 'apply an enabled narrative card',
        body: `### Narrative Card: ${item.data.title}\n\ncategory: ${item.data.category}\nscope: ${item.data.scope}\nprinciples: ${item.data.principles.join(' | ')}\navoid: ${item.data.avoid.join(' | ')}\n\n${item.content.trim()}`
      })
    )
  }
  for (const item of input.timelineNodes) {
    candidates.push(
      documentCandidate(input, item, {
        kind: 'timeline',
        authority: 'project',
        authority_rank: 300,
        priority: 330,
        order: 500,
        purpose: 'anchor story time',
        body: `### Timeline Node: ${item.data.display_time || item.data.title}\n\nid: ${item.data.id}\nprecision: ${item.data.precision}\n\n${item.content.trim()}`
      })
    )
  }
  for (const item of input.timeline) {
    candidates.push(
      documentCandidate(input, item, {
        kind: 'timeline',
        authority: 'project',
        authority_rank: 300,
        priority: 325,
        order: 510,
        purpose: 'supply related timeline events',
        body: `### ${item.data.title}\n\nduration: ${item.data.duration}\nlocation: ${item.data.location}\ncharacters: ${item.data.characters.join(', ')}\n\n${item.content.trim()}`
      })
    )
  }
  for (const item of input.characters) {
    candidates.push(
      documentCandidate(input, item, {
        kind: 'character',
        authority: 'project',
        authority_rank: 300,
        priority: 320,
        order: 600,
        purpose: 'preserve character identity and motivation',
        body: `### Character: ${item.data.title}\n\nrole: ${item.data.role}\ndesire: ${item.data.desire}\nfear: ${item.data.fear}\nbottom_line: ${item.data.bottom_line}\n\n${item.content.trim()}`
      })
    )
  }
  for (const item of input.characterStates) {
    candidates.push(
      documentCandidate(input, item, {
        kind: 'character',
        authority: 'project',
        authority_rank: 300,
        priority: 335,
        order: 610,
        purpose: 'preserve scoped character state',
        body: `### Character State: ${item.data.title}\n\ncharacter: ${item.data.character}\nscope: ${item.data.scope_type}:${item.data.scope_id}\nemotion: ${item.data.emotion}\nmotivation: ${item.data.motivation}\nknowledge: ${item.data.knowledge.join(', ')}\n\n${item.content.trim()}`
      })
    )
  }
  for (const item of input.locations) {
    candidates.push(
      documentCandidate(input, item, {
        kind: 'location',
        authority: 'project',
        authority_rank: 300,
        priority: 310,
        order: 700,
        purpose: 'anchor the scene location',
        body: `### Location: ${item.data.title}\n\nparent: ${item.data.parent_location}\ndescription: ${item.data.description}\n\n${item.content.trim()}`
      })
    )
  }
  for (const item of input.worldEntries) {
    const importance = item.data.importance === 'high' ? 30 : item.data.importance === 'medium' ? 15 : 0
    candidates.push(
      documentCandidate(input, item, {
        kind: 'world',
        authority: 'project',
        authority_rank: 300,
        priority: 300 + importance,
        order: 800,
        purpose: 'supply activated world knowledge',
        body: `### World Entry: ${item.data.title}\n\nrole: ${item.data.role}\nimportance: ${item.data.importance}\nvalid_from: ${item.data.valid_from}\nvalid_until: ${item.data.valid_until}\nstory_setting: ${item.data.story_setting}\n\n${item.content.trim()}`
      })
    )
  }
  for (const item of input.foreshadowing) {
    candidates.push(
      documentCandidate(input, item, {
        kind: 'foreshadowing',
        authority: 'project',
        authority_rank: 300,
        priority: 315,
        order: 900,
        purpose: 'preserve foreshadowing commitments',
        body: `### Foreshadowing: ${item.data.title}\n\nlevel: ${item.data.level}\nstate: ${item.data.state}\nsummary: ${item.data.summary}\nplant: ${item.data.planned_plant}\nresolve: ${item.data.planned_resolve}\n\n${item.content.trim()}`
      })
    )
  }
  for (const item of input.issues) {
    candidates.push(
      documentCandidate(input, item, {
        kind: 'issue',
        authority: 'project',
        authority_rank: 250,
        priority: item.data.priority === 'high' ? 290 : item.data.priority === 'medium' ? 270 : 250,
        order: 1000,
        purpose: 'surface an unresolved project decision',
        body: `### Open Issue: ${item.data.title}\n\npriority: ${item.data.priority}\ndue: ${item.data.due}\ndecision_needed: ${item.data.decision_needed}\n\n${item.content.trim()}`
      })
    )
  }
  for (const item of input.sharedGuidance) {
    candidates.push({
      id: `guidance:${item.id}`,
      kind: 'shared_guidance',
      title: item.id,
      content: `### Shared Guidance: ${item.id}\n\npath: ${item.path}\nscope: ${item.scope}\nsha256: ${item.sha256}\n\n${item.content.trim()}`,
      source: { type: 'shared_guidance', id: item.id, path: item.path },
      scope: item.scope,
      purpose: 'supply advisory workspace methodology',
      authority: 'advisory',
      authority_rank: 100,
      priority: 100,
      order: 1100,
      selected: true,
      selection_reason: `workspace guidance selected for ${item.scope} scope`,
      trigger_chain: [`scope:${item.scope}`, `guidance:${item.id}`],
      truncation: 'head'
    })
  }
  if (input.warnings.length) {
    candidates.push({
      id: 'packet:$warnings',
      kind: 'warning',
      title: 'Warnings',
      content: section('Warnings', input.warnings.map((warning) => `- ${warning}`).join('\n')),
      source: { type: 'compiler', id: '$warnings' },
      scope,
      purpose: 'surface context conflicts and missing prerequisites',
      authority: 'project',
      authority_rank: 250,
      priority: 250,
      order: 1200,
      selected: true,
      selection_reason: 'deterministic context validation warning',
      truncation: 'head'
    })
  }
  candidates.push({
    id: 'packet:$generation-target',
    kind: 'generation_target',
    title: 'Generation Target',
    content: section(
      'Generation Target',
      input.level === 'chapter'
        ? 'Write the current chapter draft only. Respect the hand-written chapter outline and do not invent hard canon.'
        : 'Use this packet for planning, consistency checks, and outline refinement.'
    ),
    source: { type: 'compiler', id: '$generation-target' },
    scope,
    purpose: 'constrain the requested generation operation',
    authority: 'system',
    authority_rank: 1000,
    priority: 980,
    order: 1300,
    selected: true,
    required: true,
    selection_reason: 'required generation boundary',
    truncation: 'none'
  })
  return candidates
}

function documentCandidate<T extends BaseDoc>(
  input: {
    projectRoot: string
    level: OutlineDoc['level'] | 'scene'
    target: ContextTarget
    activation: Map<string, ContextActivation>
    exclusions: Set<string>
    pins: Set<string>
    cappedRelationshipIds?: Set<string>
  },
  item: DocWithContent<T>,
  config: Pick<
    PromptBlockCandidate,
    'kind' | 'authority' | 'authority_rank' | 'priority' | 'order' | 'purpose'
  > & {
    body: string
    required?: boolean
    truncation?: PromptBlockCandidate['truncation']
  }
): PromptBlockCandidate {
  const activation = input.activation.get(item.data.id)
  const excluded = input.exclusions.has(item.data.id)
  const capped = input.cappedRelationshipIds?.has(item.data.id) ?? false
  return {
    id: `document:${item.data.type}:${item.data.id}`,
    kind: config.kind,
    title: item.data.title,
    content: config.body,
    source: {
      type: item.data.type,
      id: item.data.id,
      path: relativeSourcePath(input.projectRoot, item.path)
    },
    scope: input.target.type === 'scene' ? 'scene' : input.level,
    purpose: config.purpose,
    authority: config.authority,
    authority_rank: config.authority_rank,
    priority: config.priority + (input.pins.has(item.data.id) ? 50 : 0),
    order: config.order,
    selected: Boolean(activation) && !excluded && !capped,
    required: config.required,
    selection_reason: activation?.reason ?? 'not activated by scope, keyword, pin, or relationship',
    ...(excluded
      ? { exclusion_reason: 'explicit project context exclusion' }
      : capped
        ? { exclusion_reason: 'relationship expansion candidate limit reached' }
        : {}),
    trigger_chain: activation?.trigger_chain ?? [],
    truncation: config.truncation ?? 'head'
  }
}

function relativeSourcePath(projectRoot: string, sourcePath: string): string {
  const relative = path.relative(projectRoot, sourcePath)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Context source is outside the project root: ${sourcePath}`)
  }
  return relative.replace(/\\/gu, '/')
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
