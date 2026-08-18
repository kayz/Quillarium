import path from 'node:path'
import { listDocs } from './documents.js'
import { ensureDir, pathExists, readText, writeText } from './fs.js'
import { slugify } from './ids.js'
import { loadProject } from './project.js'
import { listRuns } from './runs.js'
import { compareStoryOrder } from './story-order.js'
import type { ChapterProseDoc, OutlineDoc, RunMetadata, SceneDoc } from './types.js'

export interface ManuscriptExportOptions {
  volumeId?: string
}

export type ManuscriptExportSource = 'chapter_prose' | 'accepted_run' | 'accepted_output' | 'final_scene'
export type ManuscriptExportGapReason = 'not_accepted' | 'missing_content' | 'missing_outline'

export interface ManuscriptExportScene {
  scene_id: string
  scene_title: string
  outline_id: string
  source: ManuscriptExportSource
  run_id: string | null
}

export interface ManuscriptExportGap {
  scene_id: string
  scene_title: string
  outline_id: string
  outline_title: string | null
  reason: ManuscriptExportGapReason
}

export interface ManuscriptExportResult {
  markdown_path: string
  text_path: string
  volume_id: string | null
  exported_scenes: ManuscriptExportScene[]
  gaps: ManuscriptExportGap[]
}

type StoredOutline = { path: string; data: OutlineDoc; content: string }
type StoredScene = { path: string; data: SceneDoc; content: string }

type ExportEntry =
  | { kind: 'heading'; level: OutlineDoc['level']; title: string; outline_id: string | null }
  | { kind: 'scene'; scene: StoredScene; outline: StoredOutline }

interface AcceptedContent {
  content: string
  source: ManuscriptExportSource
  runId: string | null
}

/**
 * Writes a Markdown manuscript and a plain-text copy under the project's exports directory.
 * Only explicit accepted artifacts (or final scenes) contribute prose.
 */
export async function exportManuscript(
  projectRoot: string,
  options: ManuscriptExportOptions = {}
): Promise<ManuscriptExportResult> {
  const root = path.resolve(projectRoot)
  const [project, outlines, chapterProse, scenes, runs] = await Promise.all([
    loadProject(root),
    listDocs<OutlineDoc>(root, 'outline'),
    listDocs<ChapterProseDoc>(root, 'chapter_prose'),
    listDocs<SceneDoc>(root, 'scene'),
    listRuns(root)
  ])
  const volume = options.volumeId
    ? outlines.find((item) => item.data.id === options.volumeId && item.data.level === 'volume')
    : undefined
  if (options.volumeId && !volume) throw new Error(`Volume outline not found: ${options.volumeId}`)

  const { entries, visitedSceneIds } = collectEntries(outlines, scenes, project.title, volume)
  const accepted = await collectAcceptedContent(root, runs)
  const outlineById = new Map(outlines.map((outline) => [outline.data.id, outline]))
  const markdownParts: string[] = []
  const textParts: string[] = []
  const exportedScenes: ManuscriptExportScene[] = []
  const gaps: ManuscriptExportGap[] = []
  const proseByChapter = new Map(
    chapterProse
      .filter((item) => item.data.status === 'final' || item.data.status === 'published')
      .map((item) => [item.data.chapter_id, item])
  )
  const proseExportedChapters = new Set<string>()

  for (const entry of entries) {
    if (entry.kind === 'heading') {
      const depth = headingDepth(entry.level)
      if (depth) {
        markdownParts.push(`${'#'.repeat(depth)} ${entry.title}`)
        textParts.push(markdownToPlainText(entry.title))
      }
      if (entry.level === 'chapter') {
        const chapter = entry.outline_id
          ? outlines.find((item) => item.data.id === entry.outline_id && item.data.level === 'chapter')
          : undefined
        const prose = chapter ? proseByChapter.get(chapter.data.id) : undefined
        if (chapter && prose?.content.trim()) {
          markdownParts.push(prose.content.trim())
          textParts.push(markdownToPlainText(prose.content))
          proseExportedChapters.add(chapter.data.id)
          exportedScenes.push({
            scene_id: prose.data.id,
            scene_title: prose.data.title,
            outline_id: chapter.data.id,
            source: 'chapter_prose',
            run_id: null
          })
        }
      }
      continue
    }

    if (proseExportedChapters.has(entry.outline.data.id)) continue

    const resolved = resolveSceneContent(entry.scene, accepted)
    if (!resolved.content) {
      gaps.push({
        scene_id: entry.scene.data.id,
        scene_title: entry.scene.data.title,
        outline_id: entry.outline.data.id,
        outline_title: entry.outline.data.title,
        reason: resolved.acceptedSignal ? 'missing_content' : 'not_accepted'
      })
      continue
    }

    const sceneDepth = entry.outline.data.level === 'section' ? 5 : 4
    markdownParts.push(`${'#'.repeat(sceneDepth)} ${entry.scene.data.title}`, resolved.content)
    textParts.push(markdownToPlainText(entry.scene.data.title), markdownToPlainText(resolved.content))
    exportedScenes.push({
      scene_id: entry.scene.data.id,
      scene_title: entry.scene.data.title,
      outline_id: entry.outline.data.id,
      source: resolved.source,
      run_id: resolved.runId
    })
  }

  for (const scene of sortScenes(scenes.filter((item) => !visitedSceneIds.has(item.data.id)))) {
    if (volume && !sceneExplicitlyReferencesVolume(scene, volume.data.id)) continue
    gaps.push({
      scene_id: scene.data.id,
      scene_title: scene.data.title,
      outline_id: scene.data.section,
      outline_title: outlineById.get(scene.data.section)?.data.title ?? null,
      reason: 'missing_outline'
    })
  }

  markdownParts.push(renderMarkdownGaps(gaps))
  textParts.push(renderTextGaps(gaps))
  const exportDir = path.resolve(root, 'exports')
  assertContainedPath(root, exportDir)
  await ensureDir(exportDir)
  const stem = safeFileStem(volume ? `${project.title}-${volume.data.title}` : project.title)
  const markdownPath = path.resolve(exportDir, `${stem}.md`)
  const textPath = path.resolve(exportDir, `${stem}.txt`)
  assertContainedPath(exportDir, markdownPath)
  assertContainedPath(exportDir, textPath)
  await Promise.all([
    writeText(markdownPath, `${joinBlocks(markdownParts)}\n`),
    writeText(textPath, `${joinBlocks(textParts)}\n`)
  ])

  return {
    markdown_path: markdownPath,
    text_path: textPath,
    volume_id: volume?.data.id ?? null,
    exported_scenes: exportedScenes,
    gaps
  }
}

function collectEntries(
  outlines: StoredOutline[],
  scenes: StoredScene[],
  projectTitle: string,
  volume?: StoredOutline
): { entries: ExportEntry[]; visitedSceneIds: Set<string> } {
  const outlineById = new Map(outlines.map((outline) => [outline.data.id, outline]))
  const children = new Map<string | null, StoredOutline[]>()
  for (const outline of outlines) {
    const parent = outline.data.parent ?? null
    children.set(parent, [...(children.get(parent) ?? []), outline])
  }
  for (const items of children.values()) items.sort(compareOutlines)

  const scenesByOutline = new Map<string, StoredScene[]>()
  for (const scene of scenes) {
    const chapterId = scene.data.chapter_id || scene.data.section
    scenesByOutline.set(chapterId, [...(scenesByOutline.get(chapterId) ?? []), scene])
  }
  for (const items of scenesByOutline.values()) {
    const ordered = sortScenes(items)
    items.splice(0, items.length, ...ordered)
  }

  const entries: ExportEntry[] = []
  const visitedOutlines = new Set<string>()
  const visitedSceneIds = new Set<string>()
  const visit = (outline: StoredOutline) => {
    if (visitedOutlines.has(outline.data.id)) return
    visitedOutlines.add(outline.data.id)
    entries.push({
      kind: 'heading',
      level: outline.data.level,
      title: outline.data.title,
      outline_id: outline.data.id
    })
    for (const scene of scenesByOutline.get(outline.data.id) ?? []) {
      visitedSceneIds.add(scene.data.id)
      entries.push({ kind: 'scene', scene, outline })
    }
    for (const child of children.get(outline.data.id) ?? []) visit(child)
  }

  if (volume) {
    const book = findAncestor(volume, outlineById, 'book')
    if (book)
      entries.push({ kind: 'heading', level: 'book', title: book.data.title, outline_id: book.data.id })
    else entries.push({ kind: 'heading', level: 'book', title: projectTitle, outline_id: null })
    visit(volume)
  } else {
    const roots = outlines
      .filter((outline) => !outline.data.parent || !outlineById.has(outline.data.parent))
      .sort(compareOutlines)
    if (!outlines.some((outline) => outline.data.level === 'book')) {
      entries.push({ kind: 'heading', level: 'book', title: projectTitle, outline_id: null })
    }
    for (const root of roots) visit(root)
    // Broken or cyclic parent links must not make otherwise valid outline-bound scenes disappear.
    for (const outline of [...outlines].sort(compareOutlines)) visit(outline)
  }
  return { entries, visitedSceneIds }
}

async function collectAcceptedContent(
  projectRoot: string,
  runs: RunMetadata[]
): Promise<{
  acceptedRuns: Map<string, AcceptedContent>
  acceptedOutputs: Map<string, AcceptedContent>
  acceptedSignals: Set<string>
}> {
  const acceptedRuns = new Map<string, AcceptedContent>()
  const acceptedOutputs = new Map<string, AcceptedContent>()
  const acceptedSignals = new Set<string>()
  for (const run of runs) {
    if (run.status === 'accepted') acceptedSignals.add(run.scene_id)
    const content = await readAcceptedRunOutput(projectRoot, run)
    if (!content) continue
    const value: AcceptedContent = {
      content,
      source: run.status === 'accepted' ? 'accepted_run' : 'accepted_output',
      runId: run.id
    }
    if (run.status === 'accepted') {
      if (!acceptedRuns.has(run.scene_id)) acceptedRuns.set(run.scene_id, value)
    } else if (run.status === 'generated' && !acceptedOutputs.has(run.scene_id)) {
      acceptedOutputs.set(run.scene_id, value)
    }
  }
  return { acceptedRuns, acceptedOutputs, acceptedSignals }
}

async function readAcceptedRunOutput(projectRoot: string, run: RunMetadata): Promise<string> {
  const runsRoot = path.resolve(projectRoot, 'runs')
  const runDir = path.resolve(projectRoot, run.run_dir)
  if (!isContainedPath(runsRoot, runDir) || runDir === runsRoot) return ''
  const acceptedFile = path.join(runDir, 'output-accepted.md')
  if (!(await pathExists(acceptedFile))) return ''
  return normalizeContent(await readText(acceptedFile))
}

function resolveSceneContent(
  scene: StoredScene,
  accepted: Awaited<ReturnType<typeof collectAcceptedContent>>
): AcceptedContent & { acceptedSignal: boolean } {
  const run = accepted.acceptedRuns.get(scene.data.id) ?? accepted.acceptedOutputs.get(scene.data.id)
  if (run) return { ...run, acceptedSignal: true }
  if (scene.data.status === 'final') {
    return {
      content: normalizeContent(scene.content),
      source: 'final_scene',
      runId: null,
      acceptedSignal: true
    }
  }
  return {
    content: '',
    source: 'final_scene',
    runId: null,
    acceptedSignal: accepted.acceptedSignals.has(scene.data.id)
  }
}

function findAncestor(
  outline: StoredOutline,
  outlineById: Map<string, StoredOutline>,
  level: OutlineDoc['level']
): StoredOutline | undefined {
  let parent = outline.data.parent
  const seen = new Set<string>()
  while (parent && !seen.has(parent)) {
    seen.add(parent)
    const candidate = outlineById.get(parent)
    if (!candidate) return undefined
    if (candidate.data.level === level) return candidate
    parent = candidate.data.parent
  }
  return undefined
}

function compareOutlines(a: StoredOutline, b: StoredOutline): number {
  return compareStoryOrder(
    { order: a.data.order, id: a.data.id, path: a.path },
    { order: b.data.order, id: b.data.id, path: b.path }
  )
}

function sortScenes(scenes: StoredScene[]): StoredScene[] {
  return [...scenes].sort(compareScenes)
}

function compareScenes(a: StoredScene, b: StoredScene): number {
  return compareStoryOrder(
    { order: a.data.order, id: a.data.id, path: a.path },
    { order: b.data.order, id: b.data.id, path: b.path }
  )
}

function headingDepth(level: OutlineDoc['level']): number | null {
  if (level === 'overview') return null
  if (level === 'book') return 1
  if (level === 'volume') return 2
  if (level === 'part' || level === 'arc') return 3
  if (level === 'act') return 4
  if (level === 'chapter') return 5
  if (level === 'section') return 6
  return null
}

function sceneExplicitlyReferencesVolume(scene: StoredScene, volumeId: string): boolean {
  return (
    scene.data.volume === volumeId ||
    scene.data.tags.includes(volumeId) ||
    scene.data.tags.includes(`volume:${volumeId}`)
  )
}

function renderMarkdownGaps(gaps: ManuscriptExportGap[]): string {
  const lines = ['## 导出缺口', '', `count: ${gaps.length}`]
  if (!gaps.length) return lines.join('\n')
  lines.push(
    '',
    '| scene_id | scene_title | outline_id | outline_title | reason |',
    '| --- | --- | --- | --- | --- |'
  )
  for (const gap of gaps) {
    lines.push(
      `| ${markdownCell(gap.scene_id)} | ${markdownCell(gap.scene_title)} | ${markdownCell(gap.outline_id)} | ${markdownCell(gap.outline_title ?? '')} | ${gap.reason} |`
    )
  }
  return lines.join('\n')
}

function renderTextGaps(gaps: ManuscriptExportGap[]): string {
  const blocks = [`导出缺口\n\ncount: ${gaps.length}`]
  for (const gap of gaps) {
    blocks.push(
      [
        `scene_id: ${markdownToPlainText(gap.scene_id)}`,
        `scene_title: ${markdownToPlainText(gap.scene_title)}`,
        `outline_id: ${markdownToPlainText(gap.outline_id)}`,
        `outline_title: ${markdownToPlainText(gap.outline_title ?? '')}`,
        `reason: ${gap.reason}`
      ].join('\n')
    )
  }
  return joinBlocks(blocks)
}

function markdownToPlainText(markdown: string): string {
  const withoutFrontmatter = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, '')
  const lines = withoutFrontmatter.replace(/\r\n?/g, '\n').split('\n')
  const plain = lines
    .map((line) =>
      line
        .replace(/^\s*```.*$/, '')
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, '')
        .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/, '')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/(?:\*\*|__|~~)(.+?)(?:\*\*|__|~~)/g, '$1')
        .replace(/(?:\*|_)(.+?)(?:\*|_)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\\([\\`*{}[\]()#+.!_>-])/g, '$1')
        .trimEnd()
    )
    .join('\n')
  return normalizeContent(plain)
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n?/g, '\n').trim()
}

function joinBlocks(blocks: string[]): string {
  return blocks.map(normalizeContent).filter(Boolean).join('\n\n')
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function safeFileStem(title: string): string {
  let stem = [...slugify(title)]
    .filter((character) => character.charCodeAt(0) >= 0x20)
    .join('')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')
  if (!stem) stem = 'manuscript'
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`
  return stem
}

function assertContainedPath(parent: string, candidate: string): void {
  if (!isContainedPath(parent, candidate)) throw new Error(`Unsafe export path: ${candidate}`)
}

function isContainedPath(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
