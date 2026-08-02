import path from 'node:path'
import { dialog } from 'electron'
import {
  answerImportIssue,
  buildImportPrompt,
  createImportSessionPlan,
  ensureDefaultPrompts,
  importMarkdownPath,
  landImportSession,
  listMarkdownFiles,
  loadImportSession,
  readPrompt,
  writeText
} from '@quillarium/core'
import { generateText } from '@quillarium/ai'
import { loadDesktopAIProfile } from './credentials.js'
import { typedHandle } from './contract.js'

export function registerImportHandlers(): void {
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

  typedHandle('import:aiPlan', async (_event, root, input) => {
    const session = await createImportSessionPlan(root, input)
    const config = await loadDesktopAIProfile('background')
    if (input?.callAI === false || input?.aiResponse) return session
    const response = await generateText(
      buildImportPrompt(session),
      config,
      'You are Quillarium Background Import Agent. Return strict JSON only.'
    )
    return createImportSessionPlan(root, { ...input, aiResponse: response })
  })
  typedHandle('import:session', async (_event, root, sessionId) => loadImportSession(root, sessionId))
  typedHandle('import:answerIssue', async (_event, root, sessionId, issueId, answer) =>
    answerImportIssue(root, sessionId, issueId, answer)
  )
  typedHandle('import:landSession', async (_event, root, sessionId) => landImportSession(root, sessionId))
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
