import {
  docExists,
  listDocs,
  requireDoc,
  type CharacterDoc,
  type LocationDoc,
  type RouteDoc,
  type SceneDoc,
  type TimelineEventDoc
} from '@quillarium/core'

export interface CheckIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
}

export interface CheckReport {
  scene_id: string
  generated_at: string
  issues: CheckIssue[]
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
    generated_at: new Date().toISOString(),
    issues
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
  const lines = [
    `# Check Report: ${report.scene_id}`,
    '',
    `generated_at: ${report.generated_at}`,
    '',
    `issues: ${report.issues.length}`,
    ''
  ]
  if (!report.issues.length) {
    lines.push('No deterministic issues found.')
  } else {
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`)
    }
  }
  lines.push(
    '',
    '## AI-Assisted Checks',
    '',
    '- canon conflict: pending',
    '- OOC: pending',
    '- style guardrails: pending',
    '- chapter hook: pending'
  )
  return lines.join('\n')
}
