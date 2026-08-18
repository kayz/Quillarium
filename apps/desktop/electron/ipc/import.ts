import path from 'node:path'
import { dialog, type OpenDialogOptions, type OpenDialogReturnValue } from 'electron'
import {
  answerImportIssue,
  abandonImportSession,
  applyImportAIResponse,
  buildSingleCardReimportPrompt,
  buildImportPrompt,
  createContextTokenCounter,
  createImportSessionPlan,
  ensureDefaultPrompts,
  importMarkdownPath,
  landImportSession,
  listMarkdownFiles,
  loadImportSession,
  loadLatestUnfinishedImportSession,
  readImportSessionSources,
  readMarkdown,
  resolveDocumentOrigin,
  reimportAIImportCard,
  reimportMarkdownCard,
  updateImportSessionCandidates,
  readPrompt,
  writeText,
  type ImportSession
} from '@quillarium/core'
import { generateText, type AIConfig, type AIRequestOptions } from '@quillarium/ai'
import { loadDesktopAIProfile } from './credentials.js'
import { typedHandle } from './contract.js'
import { withDesktopAIStream } from './ai-stream.js'

const AI_IMPORT_SYSTEM_PROMPT = 'You are Quillarium Background Import Agent. Return strict JSON only.'
const AI_IMPORT_CONTEXT_SAFETY_TOKENS = 1_024
const AI_IMPORT_TIMEOUT_MS = 30 * 60 * 1_000

export interface AIImportRequestPlan {
  prompt: string
  inputTokens: number | null
  maxOutputTokens: number
}

export async function planAIImportRequest(
  session: ImportSession,
  config: AIConfig
): Promise<AIImportRequestPlan> {
  const prompt = buildImportPrompt(session)
  if (!config.contextWindowTokens) {
    return { prompt, inputTokens: null, maxOutputTokens: config.maxTokens }
  }

  let inputTokens: number
  try {
    const counter = await createContextTokenCounter({ provider: config.provider, model: config.model })
    inputTokens = counter.count(`${AI_IMPORT_SYSTEM_PROMPT}\n${prompt}`)
  } catch {
    // Custom OpenAI-compatible models may not have an exact local tokenizer. The configured limits
    // still remain effective, while the provider performs the final context-window validation.
    return { prompt, inputTokens: null, maxOutputTokens: config.maxTokens }
  }

  const availableOutputTokens =
    Math.floor(config.contextWindowTokens) - inputTokens - AI_IMPORT_CONTEXT_SAFETY_TOKENS
  if (availableOutputTokens <= 0) {
    throw new Error(
      `AI_CONTEXT_WINDOW_EXCEEDED: input_tokens=${inputTokens}, context_window=${config.contextWindowTokens}.`
    )
  }
  return {
    prompt,
    inputTokens,
    maxOutputTokens: Math.max(1, Math.min(Math.floor(config.maxTokens), availableOutputTokens))
  }
}

export async function generateAIImportResponse(
  session: ImportSession,
  config: AIConfig,
  generate: typeof generateText = generateText,
  options: Pick<AIRequestOptions, 'signal' | 'onStreamEvent'> = {}
): Promise<string> {
  const plan = await planAIImportRequest(session, config)
  return generate(
    plan.prompt,
    {
      ...config,
      maxTokens: plan.maxOutputTokens
    },
    AI_IMPORT_SYSTEM_PROMPT,
    { responseFormat: 'json_object', timeoutMs: AI_IMPORT_TIMEOUT_MS, ...options }
  )
}

export function registerImportHandlers(): void {
  typedHandle('import:chooseSources', async () => chooseImportSourceFiles())
  typedHandle('import:chooseMarkdown', async (_event, root) => {
    const result = await dialog.showOpenDialog({
      title: '选择要导入的 Markdown',
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    })
    if (result.canceled) return []
    const imported = []
    for (const filePath of result.filePaths) {
      imported.push(...(await importMarkdownPath(root, filePath)))
    }
    return imported
  })

  typedHandle('import:markdownText', async (_event, root, markdown, title) => {
    const name = (title || markdown.match(/^#\s+(.+)$/m)?.[1] || '粘贴导入').trim()
    const file = path.join(root, '.quillarium', 'imports', `${Date.now()}-${slugImportName(name)}.md`)
    await writeText(file, markdown)
    return importMarkdownPath(root, file)
  })

  typedHandle('import:syncMarkdown', async (_event, root) => {
    const targets = (await listMarkdownFiles(root)).filter((file) => isUnmanagedMarkdown(root, file))
    const imported = []
    for (const target of targets) {
      imported.push(...(await importMarkdownPath(root, target)))
    }
    return imported
  })

  typedHandle('prompt:init', async (_event, root) => ensureDefaultPrompts(root))
  typedHandle('prompt:read', async (_event, root, name) => readPrompt(root, name))

  typedHandle('import:aiPlan', async (event, root, input) => {
    const session = input.resumeSessionId
      ? await loadImportSession(root, input.resumeSessionId)
      : await createImportSessionPlan(root, input)
    const config = await loadDesktopAIProfile('background')
    if (input?.aiResponse && input.resumeSessionId) {
      return applyImportAIResponse(root, session.id, input.aiResponse)
    }
    if (input?.callAI === false || input?.aiResponse) return session
    return withDesktopAIStream(event, 'import-split', input.clientRequestId, async (stream) => {
      const response = await generateAIImportResponse(session, config, generateText, {
        signal: stream.signal,
        onStreamEvent: stream.onStreamEvent
      })
      return applyImportAIResponse(root, session.id, response)
    })
  })
  typedHandle('import:session', async (_event, root, sessionId) => loadImportSession(root, sessionId))
  typedHandle('import:latestUnfinishedSession', async (_event, root) =>
    loadLatestUnfinishedImportSession(root)
  )
  typedHandle('import:updateCandidates', async (_event, root, sessionId, candidates) =>
    updateImportSessionCandidates(root, sessionId, candidates)
  )
  typedHandle('import:answerIssue', async (_event, root, sessionId, issueId, answer, mode) =>
    answerImportIssue(root, sessionId, issueId, answer, 'resolved', mode)
  )
  typedHandle('import:abandonSession', async (_event, root, sessionId) =>
    abandonImportSession(root, sessionId)
  )
  typedHandle('import:landSession', async (_event, root, sessionId) => landImportSession(root, sessionId))
  typedHandle('import:reimportCard', async (_event, root, filePath) => {
    const document = await readMarkdown<Record<string, unknown>>(filePath)
    const origin = (await resolveDocumentOrigin(root, filePath))?.origin
    if (!origin) throw new Error('This card has no recorded import source.')
    if (origin.kind === 'document-import') {
      return reimportMarkdownCard(root, filePath, origin)
    }
    if (origin.kind !== 'ai-import') {
      throw new Error('This card was not created by a document import.')
    }
    const session = await loadImportSession(root, origin.session_id)
    const sourceText = await readImportSessionSources(session)
    const config = await loadDesktopAIProfile('background')
    const response = await generateText(
      buildSingleCardReimportPrompt(session, origin.candidate_index, document, sourceText),
      config,
      'You are Quillarium Background Import Agent. Re-extract exactly one requested card and return strict JSON only.',
      { responseFormat: 'json_object' }
    )
    return reimportAIImportCard(root, filePath, origin, response)
  })
}

export interface ImportSourceDialog {
  showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>
}

export async function chooseImportSourceFiles(importDialog: ImportSourceDialog = dialog): Promise<string[]> {
  const result = await importDialog.showOpenDialog({
    title: '选择要拆分的文本或 Markdown 文件',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '文本与 Markdown', extensions: ['md', 'markdown', 'txt'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  return result.canceled ? [] : result.filePaths
}

function slugImportName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'markdown'
  )
}

function isUnmanagedMarkdown(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  if (!relative || relative.startsWith('..')) return false
  const first = relative.split(path.sep)[0]
  const managed = new Set([
    '.quillarium',
    'canon',
    'characters',
    'timeline',
    'locations',
    'foreshadowing',
    'world',
    'references',
    'issues',
    'strategy',
    'patterns',
    'character-states',
    'resources',
    'causality',
    'outlines',
    'scenes',
    'prompts',
    'runs'
  ])
  if (managed.has(first)) return false
  return path.basename(file).toLowerCase() !== 'project.md'
}
