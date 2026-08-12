import {
  assembleContext,
  assembleContextPacket,
  buildChapterWritingPlan,
  buildFinalizeReviewPrompt,
  confirmFinalizeImpact,
  createFinalizeReviewSession,
  createRun,
  createScene,
  listDocs,
  loadFinalizeReviewSession,
  readMarkdown,
  renderContextPacket,
  writeRunFile,
  type CharacterDoc,
  type LocationDoc,
  type OutlineDoc,
  type SceneDoc,
  type TimelineEventDoc
} from '@quillarium/core'
import {
  SEMANTIC_CHECK_TIMEOUT_MS,
  checkScene,
  checkTarget,
  formatCheckReport,
  runSemanticChecks,
  semanticStatusFromIssues,
  type CheckReport
} from '@quillarium/checks'
import {
  createGenerationRun,
  generateIntoRun,
  generateText,
  isAIConfigured,
  type AIConfig
} from '@quillarium/ai'
import { loadDesktopAIProfile } from './credentials.js'
import { typedHandle, type DesktopContextPacket, type DesktopDocEntry, type TargetInput } from './contract.js'

export function registerSceneHandlers(): void {
  typedHandle('scene:context', async (_event, root, sceneId) => assembleContext(root, sceneId))
  typedHandle('target:context', async (_event, root, target) => {
    const packet = await assembleContextPacket(root, contextTarget(target))
    return {
      packet: packet as unknown as DesktopContextPacket,
      markdown: renderContextPacket(packet)
    }
  })
  typedHandle('target:check', async (_event, root, target) => {
    const report = await checkTarget(root, contextTarget(target))
    return { report, markdown: formatCheckReport(report) }
  })
  typedHandle('scene:check', async (_event, root, sceneId) => {
    const report = await checkScene(root, sceneId)
    return { report, markdown: formatCheckReport(report) }
  })
  typedHandle('scene:semanticCheck', async (_event, root, sceneId) =>
    createSemanticCheckReport(root, sceneId)
  )
  typedHandle('scene:checkIntoRun', async (_event, root, sceneId) => {
    const report = await checkScene(root, sceneId)
    const markdown = formatCheckReport(report)
    const run = await createRun(root, sceneId, { provider: 'none', model: 'none', status: 'checked' })
    await writeRunFile(root, run, 'check-report.md', markdown)
    return { run, report, markdown }
  })
  typedHandle('scene:generateDryRun', async (_event, root, sceneId) => {
    const packet = await assembleContextPacket(root, { type: 'scene', id: sceneId })
    const context = renderContextPacket(packet)
    const config = await loadDesktopAIProfile('prose')
    return createGenerationRun(root, sceneId, context, config, {}, packet.shared_guidance)
  })
  typedHandle('scene:generate', async (_event, root, sceneId) => {
    const packet = await assembleContextPacket(root, { type: 'scene', id: sceneId })
    const context = renderContextPacket(packet)
    const config = await loadDesktopAIProfile('prose')
    const run = await createGenerationRun(root, sceneId, context, config, {}, packet.shared_guidance)
    const output = await generateIntoRun(root, run, context, config)
    return { run, output }
  })
  typedHandle('outline:generate', async (_event, root, outlineId) => {
    const scene = await ensureSceneForOutline(root, outlineId)
    const packet = await assembleContextPacket(root, { type: 'outline', id: outlineId })
    const context = renderContextPacket(packet)
    const config = await loadDesktopAIProfile('prose')
    const run = await createGenerationRun(
      root,
      scene.data.id,
      context,
      config,
      {
        target_type: 'outline',
        target_id: outlineId,
        source_outline: outlineId
      },
      packet.shared_guidance
    )
    const output = await generateIntoRun(root, run, context, config)
    return { run, output, scene: scene as DesktopDocEntry<SceneDoc> }
  })
  typedHandle('chapter:writingPlan', async (_event, root, chapterId, selectedByScene) =>
    buildChapterWritingPlan(root, chapterId, selectedByScene ?? {})
  )
  typedHandle('finalize:reviewPlan', async (_event, root, input) => {
    const session = await createFinalizeReviewSession(root, input)
    const config = await loadDesktopAIProfile('check')
    if (input?.callAI === false || input?.aiResponse) return session
    const response = await generateText(
      buildFinalizeReviewPrompt(session),
      config,
      'You are Quillarium Finalize Review Agent. Return strict JSON only.'
    )
    return createFinalizeReviewSession(root, { ...input, aiResponse: response })
  })
  typedHandle('finalize:session', async (_event, root, sessionId) =>
    loadFinalizeReviewSession(root, sessionId)
  )
  typedHandle('finalize:confirmImpact', async (_event, root, sessionId, impactId, answer, state) =>
    confirmFinalizeImpact(root, sessionId, impactId, answer, state === 'rejected' ? 'rejected' : 'confirmed')
  )
}

export interface SemanticCheckDependencies {
  checkScene: typeof checkScene
  loadAIProfile: typeof loadDesktopAIProfile
  isAIConfigured: typeof isAIConfigured
  runSemanticChecks: typeof runSemanticChecks
  generateText: typeof generateText
}

const semanticCheckDependencies: SemanticCheckDependencies = {
  checkScene,
  loadAIProfile: loadDesktopAIProfile,
  isAIConfigured,
  runSemanticChecks,
  generateText
}

export async function createSemanticCheckReport(
  root: string,
  sceneId: string,
  dependencies: SemanticCheckDependencies = semanticCheckDependencies
): Promise<CheckReport> {
  const deterministic = await dependencies.checkScene(root, sceneId)
  let config: AIConfig
  try {
    config = await dependencies.loadAIProfile('check')
  } catch {
    return appendSemanticUnavailable(
      deterministic,
      'Semantic checks were not run because the desktop check AI configuration could not be loaded.'
    )
  }
  if (!dependencies.isAIConfigured(config)) {
    return appendSemanticUnavailable(
      deterministic,
      'Semantic checks were not run because the desktop check AI profile is not configured.'
    )
  }
  const semanticIssues = await dependencies.runSemanticChecks(root, sceneId, (prompt) =>
    dependencies.generateText(prompt, config, undefined, { timeoutMs: SEMANTIC_CHECK_TIMEOUT_MS })
  )
  return {
    ...deterministic,
    semantic_status: semanticStatusFromIssues(semanticIssues),
    issues: [...deterministic.issues, ...semanticIssues]
  }
}

function appendSemanticUnavailable(report: CheckReport, message: string): CheckReport {
  return {
    ...report,
    semantic_status: 'unavailable',
    issues: [
      ...report.issues,
      {
        severity: 'info',
        code: 'semantic-check-unavailable',
        message
      }
    ]
  }
}

function contextTarget(target: TargetInput): { type: 'outline' | 'scene'; id: string } {
  if (target.type !== 'outline' && target.type !== 'scene') {
    throw new Error(`Unsupported context target type: ${target.type}`)
  }
  return { type: target.type, id: target.id }
}

async function ensureSceneForOutline(root: string, outlineId: string) {
  const existing = (await listDocs<SceneDoc>(root, 'scene')).find((scene) => scene.data.section === outlineId)
  if (existing) return existing
  const outline = (await listDocs<OutlineDoc>(root, 'outline')).find((doc) => doc.data.id === outlineId)
  if (!outline) throw new Error(`Outline not found: ${outlineId}`)
  const timeline =
    outline.data.related_timeline?.[0] ??
    (await listDocs<TimelineEventDoc>(root, 'timeline_event')).find(Boolean)?.data.id
  const location =
    (await listDocs<LocationDoc>(root, 'location')).find(Boolean)?.data.id ??
    (await listDocs<TimelineEventDoc>(root, 'timeline_event')).find((event) => event.data.location)?.data
      .location
  const pov =
    outline.data.related_characters?.[0] ??
    outline.data.povs?.[0] ??
    (await listDocs<CharacterDoc>(root, 'character')).find(Boolean)?.data.id
  if (!timeline || !location || !pov) {
    throw new Error(
      'Cannot create a chapter scene before timeline, location, and POV character are available.'
    )
  }
  const file = await createScene(
    root,
    `${outline.data.title} 正文`,
    {
      section: outline.data.id,
      timeline_node: timeline,
      location,
      pov,
      characters: [...new Set([pov, ...(outline.data.related_characters ?? [])])],
      target_words: Number(outline.data.target_words ?? 1000),
      chapter_hook: Boolean(outline.data.chapter_hook),
      tags: ['volume-01', `chapter-${String(outline.data.order + 1).padStart(3, '0')}`]
    },
    '## Draft\n'
  )
  const parsed = await readMarkdown<Record<string, unknown>>(file)
  return { path: file, data: parsed.data as unknown as SceneDoc, content: parsed.content }
}
