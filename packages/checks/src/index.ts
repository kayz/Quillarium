import {
  docExists,
  listDocs,
  requireDoc,
  type CanonDoc,
  type CharacterDoc,
  type CharacterStateDoc,
  type ForeshadowingDoc,
  type IssueDoc,
  type LocationDoc,
  type OutlineDoc,
  type RouteDoc,
  type SceneDoc,
  type StrategyDoc,
  type TimelineEventDoc,
  type WorldEntryDoc
} from '@quillarium/core'

export interface CheckIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  evidence?: string
  related_ids?: string[]
}

export interface CheckReport {
  scene_id: string
  target_type?: 'scene' | 'outline'
  target_id?: string
  generated_at: string
  semantic_status?: 'not_requested' | 'completed' | 'partial' | 'unavailable'
  issues: CheckIssue[]
}

export async function checkTarget(
  projectRoot: string,
  target: { type: 'scene' | 'outline'; id: string }
): Promise<CheckReport> {
  if (target.type === 'scene') return checkScene(projectRoot, target.id)
  return checkOutline(projectRoot, target.id)
}

export async function checkOutline(projectRoot: string, outlineId: string): Promise<CheckReport> {
  const issues: CheckIssue[] = []
  const outline = await requireDoc<OutlineDoc>(projectRoot, outlineId)
  const outlines = await listDocs<OutlineDoc>(projectRoot, 'outline')
  const scenes = await listDocs<SceneDoc>(projectRoot, 'scene')
  const locations = await listDocs<LocationDoc>(projectRoot, 'location')
  const timeline = await listDocs<TimelineEventDoc>(projectRoot, 'timeline_event')
  const states = await listDocs<CharacterStateDoc>(projectRoot, 'character_state')
  const canon = await listDocs<CanonDoc>(projectRoot, 'canon')
  const strategies = await listDocs<StrategyDoc>(projectRoot, 'strategy')
  const foreshadowing = await listDocs<ForeshadowingDoc>(projectRoot, 'foreshadowing')

  if (!canon.some((doc) => doc.data.status !== 'deprecated')) {
    issues.push({ severity: 'warning', code: 'missing-canon', message: 'No active Canon constraints found.' })
  }
  if (!locations.length) {
    issues.push({ severity: 'warning', code: 'missing-locations', message: 'No location documents found.' })
  }
  if (!strategies.length) {
    issues.push({ severity: 'info', code: 'missing-strategy', message: 'No strategy documents found.' })
  }
  if (canon.some((doc) => /叙事策略|文风|节奏|爽点/.test(`${doc.data.title}\n${doc.content}`))) {
    issues.push({
      severity: 'info',
      code: 'strategy-in-canon',
      message: 'Narrative/style strategy appears to be stored in Canon; consider moving it to strategy.'
    })
  }
  if (timeline.length > 1 && timeline.some((event) => !event.data.previous && !event.data.next)) {
    issues.push({
      severity: 'warning',
      code: 'timeline-chain-gaps',
      message: 'Some timeline events are not linked into the main previous/next chain.'
    })
  }

  if (outline.data.level === 'book') {
    if (!outline.data.reader_promise) {
      issues.push({
        severity: 'info',
        code: 'book-missing-reader-promise',
        message: 'Book outline has no reader promise.'
      })
    }
    if (!outlines.some((doc) => doc.data.level === 'volume')) {
      issues.push({ severity: 'info', code: 'missing-volume-outline', message: 'No volume outlines found.' })
    }
  }
  if (outline.data.level === 'volume') {
    if (!outline.data.volume_goal) {
      issues.push({
        severity: 'warning',
        code: 'volume-missing-goal',
        message: 'Volume outline has no volume_goal.'
      })
    }
    if (!(outline.data.event_chain ?? []).length) {
      issues.push({
        severity: 'warning',
        code: 'volume-missing-event-chain',
        message: 'Volume outline has no event_chain.'
      })
    }
    if ((outline.data.story_cycles ?? []).length < 3) {
      issues.push({
        severity: 'info',
        code: 'volume-thin-story-cycles',
        message: 'Volume should advance at least three story cycles.'
      })
    }
    if (!(outline.data.related_timeline ?? []).length) {
      issues.push({
        severity: 'warning',
        code: 'volume-missing-timeline',
        message: 'Volume outline has no related timeline events.'
      })
    }
    if (!(outline.data.related_characters ?? []).length) {
      issues.push({
        severity: 'warning',
        code: 'volume-missing-characters',
        message: 'Volume outline has no focused character list.'
      })
    }
  }
  if (outline.data.level === 'arc') {
    if (!(outline.data.conflict_ladder ?? []).length) {
      issues.push({
        severity: 'warning',
        code: 'arc-missing-conflict-ladder',
        message: 'Arc outline has no conflict_ladder.'
      })
    }
    if (!(outline.data.cast_lock ?? []).length && !(outline.data.related_characters ?? []).length) {
      issues.push({
        severity: 'warning',
        code: 'arc-missing-cast-lock',
        message: 'Arc outline has no fixed cast.'
      })
    }
    if (!(outline.data.related_events ?? []).length && !(outline.data.related_timeline ?? []).length) {
      issues.push({
        severity: 'warning',
        code: 'arc-missing-events',
        message: 'Arc outline has no event sequence.'
      })
    }
    if (!(outline.data.related_characters ?? []).length) {
      issues.push({
        severity: 'warning',
        code: 'arc-missing-cast',
        message: 'Arc outline should lock its main cast.'
      })
    }
    if (
      !(outline.data.related_foreshadowing ?? []).length &&
      !(outline.data.foreshadowing_planted ?? []).length
    ) {
      issues.push({
        severity: 'info',
        code: 'arc-missing-foreshadowing',
        message: 'Arc outline has no foreshadowing plan.'
      })
    }
  }
  if (outline.data.level === 'chapter') {
    if (!outline.data.chapter_goal) {
      issues.push({
        severity: 'warning',
        code: 'chapter-missing-goal',
        message: 'Chapter outline has no chapter_goal.'
      })
    }
    if (!outline.data.chapter_conflict) {
      issues.push({
        severity: 'warning',
        code: 'chapter-missing-conflict',
        message: 'Chapter outline has no chapter_conflict.'
      })
    }
    if (!outline.data.chapter_change) {
      issues.push({
        severity: 'info',
        code: 'chapter-missing-change',
        message: 'Chapter outline has no chapter_change.'
      })
    }
    if (!outline.data.ending_hook && !outline.data.chapter_hook) {
      issues.push({
        severity: 'info',
        code: 'chapter-missing-hook',
        message: 'Chapter outline has no ending_hook or chapter_hook.'
      })
    }
    const chapterScenes = scenes.filter((scene) => scene.data.section === outline.data.id)
    if (!chapterScenes.length) {
      issues.push({
        severity: 'warning',
        code: 'chapter-missing-scene',
        message: 'Chapter outline has no bound scene draft.'
      })
    }
    if (!outline.content.trim()) {
      issues.push({
        severity: 'warning',
        code: 'chapter-outline-empty',
        message: 'Chapter outline body is empty.'
      })
    }
    if (
      !(outline.data.related_timeline ?? []).length &&
      !chapterScenes.some((scene) => scene.data.timeline_node)
    ) {
      issues.push({
        severity: 'warning',
        code: 'chapter-missing-timeline',
        message: 'Chapter has no timeline binding.'
      })
    }
  }

  const relatedCharacters = new Set(outline.data.related_characters ?? [])
  const hasState = states.some(
    (state) => state.data.scope_id === outline.data.id || relatedCharacters.has(state.data.character)
  )
  if (
    (outline.data.level === 'volume' || outline.data.level === 'arc' || outline.data.level === 'chapter') &&
    !hasState
  ) {
    issues.push({
      severity: 'info',
      code: 'missing-character-state',
      message: 'No character state snapshot is attached to this scope.'
    })
  }
  for (const id of [
    ...(outline.data.related_foreshadowing ?? []),
    ...(outline.data.foreshadowing_planted ?? []),
    ...(outline.data.foreshadowing_resolved ?? [])
  ]) {
    if (!foreshadowing.some((doc) => doc.data.id === id)) {
      issues.push({
        severity: 'warning',
        code: 'missing-foreshadowing',
        message: `Foreshadowing entry not found: ${id}`
      })
    }
  }

  return {
    scene_id: outlineId,
    target_type: 'outline',
    target_id: outlineId,
    generated_at: new Date().toISOString(),
    issues
  }
}

export async function checkScene(projectRoot: string, sceneId: string): Promise<CheckReport> {
  const issues: CheckIssue[] = []
  const scene = await requireDoc<SceneDoc>(projectRoot, sceneId)

  await requireOrIssue(
    projectRoot,
    scene.data.section,
    'error',
    'missing-section',
    `Section outline not found: ${scene.data.section}`,
    issues
  )
  await requireOrIssue(
    projectRoot,
    scene.data.timeline_node,
    'error',
    'missing-timeline-node',
    `Timeline node not found: ${scene.data.timeline_node}`,
    issues
  )
  await requireOrIssue(
    projectRoot,
    scene.data.location,
    'error',
    'missing-location',
    `Location not found: ${scene.data.location}`,
    issues
  )
  await requireOrIssue(
    projectRoot,
    scene.data.pov,
    'error',
    'missing-pov',
    `POV character not found: ${scene.data.pov}`,
    issues
  )

  for (const charId of scene.data.characters) {
    await requireOrIssue(
      projectRoot,
      charId,
      'warning',
      'missing-character',
      `Scene character not found: ${charId}`,
      issues
    )
  }

  await checkTimelineLinks(projectRoot, scene.data.timeline_node, issues)
  await checkRouteFromPreviousScene(projectRoot, scene.data, issues)
  await checkCharacterLocation(projectRoot, scene.data, issues)
  await checkForeshadowing(projectRoot, scene.data, issues)
  await checkWorldEntries(projectRoot, scene.data, issues)
  await checkOpenIssues(projectRoot, scene.data, issues)

  if (scene.data.chapter_hook && scene.content.trim().length > 0) {
    const tail = scene.content.trim().slice(-300)
    if (!/[？?!！。]$/.test(tail)) {
      issues.push({
        severity: 'info',
        code: 'chapter-hook-style',
        message: 'Chapter hook requested, but the section ending does not look like a strong sentence ending.'
      })
    }
  }

  return {
    scene_id: sceneId,
    target_type: 'scene',
    target_id: sceneId,
    generated_at: new Date().toISOString(),
    issues
  }
}

async function checkForeshadowing(projectRoot: string, scene: SceneDoc, issues: CheckIssue[]) {
  const planted = scene.foreshadowing_planted ?? []
  const reinforced = scene.foreshadowing_reinforced ?? []
  const resolved = scene.foreshadowing_resolved ?? []
  for (const id of [...planted, ...reinforced, ...resolved]) {
    await requireOrIssue(
      projectRoot,
      id,
      'warning',
      'missing-foreshadowing',
      `Foreshadowing entry not found: ${id}`,
      issues
    )
  }
  for (const id of resolved) {
    const item = await requireDoc<ForeshadowingDoc>(projectRoot, id).catch(() => null)
    if (!item) continue
    if (!item.data.planted_at && item.data.state === 'planned') {
      issues.push({
        severity: 'warning',
        code: 'foreshadowing-resolved-before-planted',
        message: `Scene resolves ${id}, but the ledger still says it has not been planted.`
      })
    }
    if (item.data.state === 'resolved') {
      issues.push({
        severity: 'info',
        code: 'foreshadowing-possibly-resolved-twice',
        message: `Scene resolves ${id}, which is already marked resolved in the ledger.`
      })
    }
  }
}

async function checkWorldEntries(projectRoot: string, scene: SceneDoc, issues: CheckIssue[]) {
  for (const id of scene.world_entries_used ?? []) {
    const entry = await requireDoc<WorldEntryDoc>(projectRoot, id).catch(() => null)
    if (!entry) {
      issues.push({
        severity: 'warning',
        code: 'missing-world-entry',
        message: `World entry not found: ${id}`
      })
      continue
    }
    const sceneYear = firstYear(scene.world_time)
    const validFrom = firstYear(entry.data.valid_from)
    const validUntil = firstYear(entry.data.valid_until)
    if (sceneYear !== null && validFrom !== null && sceneYear < validFrom) {
      issues.push({
        severity: 'warning',
        code: 'world-entry-before-valid-from',
        message: `${entry.data.title} is used in ${scene.world_time}, before valid_from=${entry.data.valid_from}.`
      })
    }
    if (sceneYear !== null && validUntil !== null && sceneYear > validUntil) {
      issues.push({
        severity: 'warning',
        code: 'world-entry-after-valid-until',
        message: `${entry.data.title} is used in ${scene.world_time}, after valid_until=${entry.data.valid_until}.`
      })
    }
  }
}

async function checkOpenIssues(projectRoot: string, scene: SceneDoc, issues: CheckIssue[]) {
  const sceneChapter = chapterNumber(scene.chapter_number)
  if (sceneChapter === null) return
  const openIssues = (await listDocs<IssueDoc>(projectRoot, 'issue')).filter(
    (issue) => issue.data.state === 'open'
  )
  for (const issue of openIssues) {
    const due = chapterNumber(issue.data.due)
    if (due !== null && sceneChapter >= due) {
      issues.push({
        severity: issue.data.priority === 'high' ? 'error' : 'warning',
        code: 'open-issue-due',
        message: `Open issue "${issue.data.title}" is due at ${issue.data.due}.`
      })
    }
  }
}

async function requireOrIssue(
  projectRoot: string,
  id: string,
  severity: CheckIssue['severity'],
  code: string,
  message: string,
  issues: CheckIssue[]
) {
  if (!(await docExists(projectRoot, id))) issues.push({ severity, code, message })
}

async function checkTimelineLinks(projectRoot: string, eventId: string, issues: CheckIssue[]) {
  const event = await requireDoc<TimelineEventDoc>(projectRoot, eventId).catch(() => null)
  if (!event) return
  if (event.data.previous && !(await docExists(projectRoot, event.data.previous))) {
    issues.push({
      severity: 'error',
      code: 'timeline-previous-missing',
      message: `Timeline previous link is missing: ${event.data.previous}`
    })
  }
  if (event.data.next && !(await docExists(projectRoot, event.data.next))) {
    issues.push({
      severity: 'error',
      code: 'timeline-next-missing',
      message: `Timeline next link is missing: ${event.data.next}`
    })
  }
  if (event.data.flashback_reference && event.data.previous === event.data.flashback_reference) {
    issues.push({
      severity: 'warning',
      code: 'flashback-mutates-main-chain',
      message: 'Flashback reference matches previous main-chain node; verify this is intentional.'
    })
  }
}

async function checkRouteFromPreviousScene(projectRoot: string, scene: SceneDoc, issues: CheckIssue[]) {
  if (!scene.previous_scene) return
  const previous = await requireDoc<SceneDoc>(projectRoot, scene.previous_scene).catch(() => null)
  if (!previous || previous.data.location === scene.location) return
  const routes = await listDocs<RouteDoc>(projectRoot, 'route')
  const hasRoute = routes.some(
    (route) =>
      (route.data.from === previous.data.location && route.data.to === scene.location) ||
      (route.data.to === previous.data.location && route.data.from === scene.location)
  )
  if (!hasRoute) {
    issues.push({
      severity: 'warning',
      code: 'route-not-found',
      message: `No route found between previous scene location ${previous.data.location} and current location ${scene.location}.`
    })
  }
}

async function checkCharacterLocation(projectRoot: string, scene: SceneDoc, issues: CheckIssue[]) {
  const charIds = [scene.pov, ...scene.characters]
  for (const id of new Set(charIds)) {
    const char = await requireDoc<CharacterDoc>(projectRoot, id).catch(() => null)
    if (!char) continue
    const current = char.data.scene_state.current_location
    if (current && current !== scene.location) {
      const sceneLocation = await requireDoc<LocationDoc>(projectRoot, scene.location).catch(() => null)
      issues.push({
        severity: 'info',
        code: 'character-location-differs',
        message: `${char.data.title} has current_location=${current}, while scene location is ${sceneLocation?.data.title ?? scene.location}.`
      })
    }
  }
}

export function formatCheckReport(report: CheckReport): string {
  const semanticStatus = report.semantic_status ?? 'not_requested'
  const lines = [
    `# Check Report: ${report.scene_id}`,
    '',
    `generated_at: ${report.generated_at}`,
    `semantic_status: ${semanticStatus}`,
    '',
    `issues: ${report.issues.length}`,
    ''
  ]
  if (!report.issues.length) {
    lines.push('No deterministic issues found.')
  } else {
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`)
      if (issue.evidence) lines.push(`  - evidence: ${issue.evidence}`)
      if (issue.related_ids?.length) lines.push(`  - related_ids: ${issue.related_ids.join(', ')}`)
    }
  }
  lines.push(
    '',
    '## AI-Assisted Checks',
    '',
    `status: ${semanticStatus}`,
    'checks: OOC, state drift, Canon conflict'
  )
  return lines.join('\n')
}

function firstYear(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null
  const match = value.match(/\d{3,4}/)
  return match ? Number(match[0]) : null
}

function chapterNumber(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null
  const arabic = value.match(/\d+/)
  if (arabic) return Number(arabic[0])
  return null
}

export * from './semantic/index.js'
