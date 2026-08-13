import {
  assembleContext,
  assembleContextPacket,
  assertChapterAllowsAI,
  assertPlainProse,
  acceptSceneIntoChapter,
  answerFinalizeQuestion,
  applyFinalizeReviewSession,
  buildEditableScenePromptPlan,
  buildChapterWritingPlan,
  buildFinalizeReviewPrompt,
  confirmFinalizeImpact,
  completeFinalizeReviewSession,
  createFinalizeReviewSession,
  createRun,
  createScene,
  finalizeChapter,
  listDocs,
  loadFinalizeReviewSession,
  loadChapterLifecycle,
  publishChapter,
  readMarkdown,
  recoverFinalizationApplications,
  renderContextPacket,
  timelineIdsForOutline,
  writeMarkdown,
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
  generateCandidateGroup,
  buildSectionPrompt,
  contextCompileOptions,
  generateIntoRun,
  generateText,
  isAIConfigured,
  resolveGenerationPreset,
  type AIConfig,
  type ResolvedGenerationPreset
} from '@quillarium/ai'
import { loadDesktopAIProfile } from './credentials.js'
import { typedHandle, type DesktopContextPacket, type DesktopDocEntry, type TargetInput } from './contract.js'

export function registerSceneHandlers(): void {
  typedHandle('scene:context', async (_event, root, sceneId) => {
    const resolved = await resolveDesktopGenerationPreset(root)
    return assembleContext(root, sceneId, {
      ...contextCompileOptions(resolved.config, resolved.snapshot)
    })
  })
  typedHandle('target:context', async (_event, root, target) => createDesktopContextPreview(root, target))
  typedHandle('target:writingPrompt', async (_event, root, outlineId) => {
    const resolved = await resolveDesktopGenerationPreset(root)
    const packet = await assembleContextPacket(
      root,
      { type: 'outline', id: outlineId },
      contextCompileOptions(resolved.config, resolved.snapshot)
    )
    return buildSectionPrompt(renderContextPacket(packet), resolved.snapshot)
  })
  typedHandle('target:check', async (_event, root, target) => {
    const report = await checkTarget(root, contextTarget(target))
    return { report, markdown: formatCheckReport(report) }
  })
  typedHandle('scene:check', async (_event, root, sceneId) => {
    const report = await checkScene(root, sceneId)
    return { report, markdown: formatCheckReport(report) }
  })
  typedHandle('scene:semanticCheck', async (_event, root, sceneId, content) =>
    createSemanticCheckReport(root, sceneId, semanticCheckDependencies, content)
  )
  typedHandle('scene:checkIntoRun', async (_event, root, sceneId, content) => {
    const report = await createSemanticCheckReport(root, sceneId, semanticCheckDependencies, content)
    const markdown = formatCheckReport(report)
    const run = await createRun(root, sceneId, { provider: 'none', model: 'none', status: 'checked' })
    await writeRunFile(root, run, 'check-report.md', markdown)
    return { run, report, markdown }
  })
  typedHandle('scene:generateDryRun', async (_event, root, sceneId) => {
    const scene = await requireScene(root, sceneId)
    await assertChapterAllowsAI(root, scene.data.chapter_id)
    const resolved = await resolveDesktopGenerationPreset(root)
    const config = resolved.config
    const packet = await assembleContextPacket(
      root,
      { type: 'scene', id: sceneId },
      contextCompileOptions(config, resolved.snapshot)
    )
    const context = renderContextPacket(packet)
    return createGenerationRun(root, sceneId, context, config, {}, packet.shared_guidance, undefined, {
      prompt_blocks: packet.prompt_blocks,
      context_trace: packet.context_trace,
      writing_preset: resolved.snapshot
    })
  })
  typedHandle('scene:generate', async (_event, root, sceneId) => {
    const scene = await requireScene(root, sceneId)
    await assertChapterAllowsAI(root, scene.data.chapter_id)
    const resolved = await resolveDesktopGenerationPreset(root)
    const config = resolved.config
    const packet = await assembleContextPacket(
      root,
      { type: 'scene', id: sceneId },
      contextCompileOptions(config, resolved.snapshot)
    )
    const context = renderContextPacket(packet)
    const run = await createGenerationRun(
      root,
      sceneId,
      context,
      config,
      {},
      packet.shared_guidance,
      undefined,
      {
        prompt_blocks: packet.prompt_blocks,
        context_trace: packet.context_trace,
        writing_preset: resolved.snapshot
      }
    )
    const output = await generateIntoRun(
      root,
      run,
      context,
      config,
      {},
      undefined,
      assertPlainProse,
      resolved.snapshot
    )
    return { run, output }
  })
  typedHandle('outline:generate', async (_event, root, outlineId, prompt, sceneId) => {
    await assertChapterAllowsAI(root, outlineId)
    const scene = await ensureSceneForOutline(root, outlineId, sceneId)
    const resolved = await resolveDesktopGenerationPreset(root)
    const config = resolved.config
    const packet = await assembleContextPacket(
      root,
      { type: 'outline', id: outlineId },
      contextCompileOptions(config, resolved.snapshot)
    )
    const context = renderContextPacket(packet)
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
      packet.shared_guidance,
      prompt,
      {
        prompt_blocks: packet.prompt_blocks,
        context_trace: packet.context_trace,
        writing_preset: resolved.snapshot
      }
    )
    const output = await generateIntoRun(
      root,
      run,
      context,
      config,
      {},
      prompt,
      assertPlainProse,
      resolved.snapshot
    )
    return { run, output, scene: scene as DesktopDocEntry<SceneDoc> }
  })
  typedHandle(
    'outline:generateCandidates',
    async (_event, root, outlineId, prompt, sceneId, count, parentRunId) => {
      await assertChapterAllowsAI(root, outlineId)
      const scene = await ensureSceneForOutline(root, outlineId, sceneId)
      const resolved = await resolveDesktopGenerationPreset(root)
      const packet = await assembleContextPacket(
        root,
        { type: 'outline', id: outlineId },
        contextCompileOptions(resolved.config, resolved.snapshot)
      )
      const context = renderContextPacket(packet)
      const group = await generateCandidateGroup(
        {
          projectRoot: root,
          sceneId: scene.data.id,
          context,
          config: resolved.config,
          count,
          parentRunId,
          metadata: {
            target_type: 'outline',
            target_id: outlineId,
            source_outline: outlineId
          },
          sharedGuidance: packet.shared_guidance,
          promptOverride: prompt,
          compilation: {
            prompt_blocks: packet.prompt_blocks,
            context_trace: packet.context_trace,
            writing_preset: resolved.snapshot
          }
        },
        {},
        assertPlainProse
      )
      return { ...group, scene: scene as DesktopDocEntry<SceneDoc> }
    }
  )
  typedHandle(
    'scene:prepare',
    async (_event, root, chapterId) =>
      (await prepareSceneForOutline(root, chapterId)) as DesktopDocEntry<SceneDoc>
  )
  typedHandle('scene:acceptManual', async (_event, root, sceneId, content) =>
    acceptSceneIntoChapter(root, sceneId, content)
  )
  typedHandle('scene:promptPlan', async (_event, root, sceneId) => {
    const resolved = await resolveDesktopGenerationPreset(root)
    return buildEditableScenePromptPlan(
      root,
      { sceneId },
      contextCompileOptions(resolved.config, resolved.snapshot)
    )
  })
  typedHandle('chapter:lifecycle', async (_event, root, chapterId) => loadChapterLifecycle(root, chapterId))
  typedHandle('chapter:finalize', async (_event, root, chapterId) => finalizeChapter(root, chapterId))
  typedHandle('chapter:publish', async (_event, root, chapterId, confirmation) =>
    publishChapter(root, chapterId, confirmation)
  )
  typedHandle('chapter:writingPlan', async (_event, root, chapterId, selectedByScene) => {
    const resolved = await resolveDesktopGenerationPreset(root)
    return buildChapterWritingPlan(
      root,
      chapterId,
      selectedByScene ?? {},
      contextCompileOptions(resolved.config, resolved.snapshot)
    )
  })
  typedHandle('finalize:reviewPlan', async (_event, root, input) => {
    const session = await createFinalizeReviewSession(root, input)
    const config = await loadDesktopAIProfile('check')
    if (input?.callAI === false || input?.aiResponse) return session
    const response = await generateText(
      buildFinalizeReviewPrompt(session),
      config,
      'You are Quillarium Finalize Review Agent. Return strict JSON only.'
    )
    return completeFinalizeReviewSession(root, session.id, response)
  })
  typedHandle('finalize:session', async (_event, root, sessionId) =>
    loadFinalizeReviewSession(root, sessionId)
  )
  typedHandle('finalize:confirmImpact', async (_event, root, sessionId, impactId, answer, state) =>
    confirmFinalizeImpact(root, sessionId, impactId, answer, state === 'rejected' ? 'rejected' : 'confirmed')
  )
  typedHandle('finalize:answerQuestion', async (_event, root, sessionId, questionId, answer, state) =>
    answerFinalizeQuestion(
      root,
      sessionId,
      questionId,
      answer,
      state === 'deferred' ? 'deferred' : 'resolved'
    )
  )
  typedHandle('finalize:apply', async (_event, root, sessionId) =>
    applyFinalizeReviewSession(root, sessionId)
  )
  typedHandle('finalize:recover', async (_event, root) => recoverFinalizationApplications(root))
}

export interface DesktopContextPreviewDependencies {
  loadAIProfile: (profile: 'prose' | 'background' | 'check') => Promise<AIConfig>
}

const desktopContextPreviewDependencies: DesktopContextPreviewDependencies = {
  loadAIProfile: loadDesktopAIProfile
}

async function resolveDesktopGenerationPreset(
  root: string,
  dependencies: DesktopContextPreviewDependencies = desktopContextPreviewDependencies
): Promise<ResolvedGenerationPreset> {
  return resolveGenerationPreset(root, dependencies.loadAIProfile)
}

export async function createDesktopContextPreview(
  root: string,
  target: TargetInput,
  dependencies: DesktopContextPreviewDependencies = desktopContextPreviewDependencies
): Promise<{ packet: DesktopContextPacket; markdown: string }> {
  const resolved = await resolveDesktopGenerationPreset(root, dependencies)
  const packet = await assembleContextPacket(
    root,
    contextTarget(target),
    contextCompileOptions(resolved.config, resolved.snapshot)
  )
  return {
    packet: packet as unknown as DesktopContextPacket,
    markdown: renderContextPacket(packet)
  }
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
  dependencies: SemanticCheckDependencies = semanticCheckDependencies,
  contentOverride?: string
): Promise<CheckReport> {
  const deterministic = await dependencies.checkScene(root, sceneId, contentOverride)
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
  const invoke = (prompt: string) =>
    dependencies.generateText(prompt, config, undefined, { timeoutMs: SEMANTIC_CHECK_TIMEOUT_MS })
  const semanticIssues =
    contentOverride === undefined
      ? await dependencies.runSemanticChecks(root, sceneId, invoke)
      : await dependencies.runSemanticChecks(root, sceneId, invoke, contentOverride)
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

export async function ensureSceneForOutline(root: string, outlineId: string, preferredSceneId?: string) {
  const outline = (await listDocs<OutlineDoc>(root, 'outline')).find((doc) => doc.data.id === outlineId)
  if (!outline) throw new Error(`Outline not found: ${outlineId}`)
  if (outline.data.level !== 'chapter')
    throw new Error('AI writing can only create a scene under a chapter outline.')
  await assertChapterAllowsAI(root, outlineId)
  const chapterScenes = (await listDocs<SceneDoc>(root, 'scene'))
    .filter((scene) => (scene.data.chapter_id || scene.data.section) === outlineId)
    .sort((a, b) => a.data.order - b.data.order)
  const existing =
    chapterScenes.find((scene) => scene.data.id === preferredSceneId && !scene.data.accepted_at) ??
    chapterScenes.find((scene) => !scene.data.accepted_at)
  const bindings = await inferSceneBindings(root, outline, existing)
  const { timeline, location, pov, relatedCharacters } = bindings
  if (!timeline || !location || !pov) {
    const missing = [!timeline && 'timeline', !location && 'location', !pov && 'POV character'].filter(
      Boolean
    )
    throw new Error(`Cannot create a chapter scene; missing ${missing.join(', ')}.`)
  }
  if (existing) {
    if (!isGeneratedPlaceholder(existing)) return existing
    const data = {
      ...existing.data,
      timeline_node: timeline ?? '',
      location: location ?? '',
      pov: pov ?? '',
      characters: [...new Set([pov, ...relatedCharacters].filter(Boolean) as string[])]
    }
    if (
      data.timeline_node !== existing.data.timeline_node ||
      data.location !== existing.data.location ||
      data.pov !== existing.data.pov ||
      data.characters.join('\n') !== existing.data.characters.join('\n')
    ) {
      await writeMarkdown(existing.path, data as unknown as Record<string, unknown>, existing.content)
    }
    return { ...existing, data }
  }
  const file = await createScene(
    root,
    `${outline.data.title} · 第${chapterScenes.length + 1}节`,
    {
      chapter_id: outline.data.id,
      section: outline.data.id,
      order: nextSceneOrder(chapterScenes),
      writing_focus: outline.data.chapter_goal || outline.data.chapter_change || '',
      timeline_node: timeline ?? '',
      location: location ?? '',
      pov: pov ?? '',
      characters: [...new Set([pov, ...relatedCharacters].filter(Boolean) as string[])],
      target_words: Number(outline.data.target_words ?? 1000),
      chapter_hook: Boolean(outline.data.chapter_hook),
      previous_scene: chapterScenes.at(-1)?.data.id ?? null,
      tags: [`chapter-${String(outline.data.order + 1).padStart(3, '0')}`]
    },
    ''
  )
  const parsed = await readMarkdown<Record<string, unknown>>(file)
  return { path: file, data: parsed.data as unknown as SceneDoc, content: parsed.content }
}

export async function prepareSceneForOutline(root: string, outlineId: string) {
  const outline = (await listDocs<OutlineDoc>(root, 'outline')).find((doc) => doc.data.id === outlineId)
  if (!outline) throw new Error(`Outline not found: ${outlineId}`)
  if (outline.data.level !== 'chapter') {
    throw new Error('AI writing can only create a scene under a chapter outline.')
  }
  await assertChapterAllowsAI(root, outlineId)
  const chapterScenes = (await listDocs<SceneDoc>(root, 'scene'))
    .filter((scene) => (scene.data.chapter_id || scene.data.section) === outlineId)
    .sort((a, b) => a.data.order - b.data.order)
  const { timeline, location, pov, relatedCharacters } = await inferSceneBindings(root, outline)
  const order = nextSceneOrder(chapterScenes)
  const file = await createScene(
    root,
    `${outline.data.title} · 第${order + 1}节`,
    {
      chapter_id: outline.data.id,
      section: outline.data.id,
      order,
      writing_focus: outline.data.chapter_goal || outline.data.chapter_change || '',
      timeline_node: timeline ?? '',
      location: location ?? '',
      pov: pov ?? '',
      characters: [...new Set([pov, ...relatedCharacters].filter(Boolean) as string[])],
      target_words: Number(outline.data.target_words ?? 1000),
      chapter_hook: Boolean(outline.data.chapter_hook),
      previous_scene: chapterScenes.at(-1)?.data.id ?? null,
      tags: [`chapter-${String(outline.data.order + 1).padStart(3, '0')}`]
    },
    ''
  )
  const parsed = await readMarkdown<Record<string, unknown>>(file)
  return { path: file, data: parsed.data as unknown as SceneDoc, content: parsed.content }
}

async function inferSceneBindings(
  root: string,
  outline: { data: OutlineDoc },
  existing?: { data: SceneDoc }
): Promise<{
  timeline?: string
  location?: string
  pov?: string
  relatedCharacters: string[]
}> {
  const [timelineEvents, characters, locations, packet] = await Promise.all([
    listDocs<TimelineEventDoc>(root, 'timeline_event'),
    listDocs<CharacterDoc>(root, 'character'),
    listDocs<LocationDoc>(root, 'location'),
    assembleContextPacket(root, { type: 'outline', id: outline.data.id })
  ])
  const timeline = timelineIdsForOutline(outline.data, timelineEvents)[0] ?? existing?.data.timeline_node
  const timelineEvent = timelineEvents.find((event) => event.data.id === timeline)
  const location =
    (timelineEvent?.data.location && resolveDocId(timelineEvent.data.location, locations)) ??
    packet.locations[0]?.data.id ??
    locations[0]?.data.id ??
    existing?.data.location
  const pov =
    resolveFirstDocId(outline.data.related_characters, characters) ??
    resolveFirstDocId(outline.data.povs, characters) ??
    resolveFirstDocId(timelineEvent?.data.characters, characters) ??
    packet.characters[0]?.data.id ??
    characters[0]?.data.id ??
    existing?.data.pov
  const relatedCharacters = (outline.data.related_characters ?? [])
    .map((value) => resolveDocId(value, characters))
    .filter((value): value is string => Boolean(value))
  return { timeline, location, pov, relatedCharacters }
}

function nextSceneOrder(scenes: Array<{ data: SceneDoc }>): number {
  return scenes.reduce((maximum, scene) => Math.max(maximum, scene.data.order), -1) + 1
}

function isGeneratedPlaceholder(scene: { data: SceneDoc; content: string }): boolean {
  const content = scene.content.trim()
  return scene.data.status === 'draft' && !scene.data.accepted_at && (!content || content === '## Draft')
}

async function requireScene(root: string, sceneId: string) {
  const scene = (await listDocs<SceneDoc>(root, 'scene')).find((item) => item.data.id === sceneId)
  if (!scene) throw new Error(`Scene not found: ${sceneId}`)
  return scene
}

function resolveFirstDocId<T extends { id: string; title: string }>(
  values: string[] | undefined,
  docs: Array<{ data: T }>
): string | undefined {
  for (const value of values ?? []) {
    const id = resolveDocId(value, docs)
    if (id) return id
  }
  return undefined
}

function resolveDocId<T extends { id: string; title: string }>(
  value: string,
  docs: Array<{ data: T }>
): string | undefined {
  return docs.find((doc) => doc.data.id === value || doc.data.title === value)?.data.id
}
