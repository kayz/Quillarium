import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { dialog, type OpenDialogOptions, type OpenDialogReturnValue } from 'electron'
import {
  applyDocumentReferenceMigration,
  createReference,
  formatObsidianDocumentLink,
  listDocs,
  planDocumentReferenceMigration,
  loadLocalDocumentLinkIndex,
  readMarkdown,
  readText,
  rebuildLocalDocumentLinkIndex,
  withProjectWriteLock
} from '@quillarium/core'
import type { DocumentIdentity } from '@quillarium/core'
import { typedHandle, type ReferenceUploadResult } from './contract.js'

const MAX_REFERENCE_UPLOAD_BYTES = 10 * 1024 * 1024
const REFERENCE_UPLOAD_EXTENSIONS = new Set(['.md', '.markdown', '.txt'])

export interface ReferenceUploadDialog {
  showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>
}

export interface ReferenceUploadDependencies {
  beforeCreate?: (sourcePath: string, index: number) => void | Promise<void>
}

export function registerReferenceHandlers(): void {
  typedHandle('references:index', async (_event, root) => loadLocalDocumentLinkIndex(root))
  typedHandle('references:upload', async (_event, root) => {
    const sourcePaths = await chooseReferenceUploadFiles()
    return uploadReferenceFiles(root, sourcePaths)
  })
  typedHandle('references:format', async (_event, root, documentId, displayText) => {
    const document = (await listDocs<DocumentIdentity>(root)).find(
      (candidate) => candidate.data.id === documentId
    )
    if (!document) throw new Error(`Document not found: ${documentId}`)
    return formatObsidianDocumentLink(document, root, displayText ?? document.data.title)
  })
  typedHandle('references:migrationPlan', async (_event, root) => planDocumentReferenceMigration(root))
  typedHandle('references:migrationApply', async (_event, root, plan) => {
    const report = await applyDocumentReferenceMigration(root, plan)
    await rebuildLocalDocumentLinkIndex(root)
    return report
  })
}

export async function chooseReferenceUploadFiles(
  uploadDialog: ReferenceUploadDialog = dialog
): Promise<string[]> {
  const result = await uploadDialog.showOpenDialog({
    title: '上传参考文档',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '文本与 Markdown', extensions: ['md', 'markdown', 'txt'] }]
  })
  return result.canceled ? [] : result.filePaths
}

export async function uploadReferenceFiles(
  root: string,
  sourcePaths: string[],
  dependencies: ReferenceUploadDependencies = {}
): Promise<ReferenceUploadResult> {
  const uniqueSources = deduplicateSourcePaths(sourcePaths)
  if (!uniqueSources.length) return { items: [] }

  const prepared = await Promise.all(
    uniqueSources.map(async (sourcePath) => {
      const extension = path.extname(sourcePath).toLocaleLowerCase('en-US')
      if (!REFERENCE_UPLOAD_EXTENSIONS.has(extension)) {
        throw new Error(`不支持的参考文档格式：${path.basename(sourcePath)}`)
      }
      const sourceStat = await stat(sourcePath)
      if (!sourceStat.isFile()) throw new Error(`参考文档不是普通文件：${path.basename(sourcePath)}`)
      if (sourceStat.size > MAX_REFERENCE_UPLOAD_BYTES) {
        throw new Error(`参考文档超过 10 MiB 限制：${path.basename(sourcePath)}`)
      }
      const content = await readText(sourcePath)
      if (content.includes('\0')) throw new Error(`参考文档不是 UTF-8 文本：${path.basename(sourcePath)}`)
      const sourceName = path.basename(sourcePath)
      return {
        sourcePath,
        sourceName,
        title: referenceTitle(content, sourceName),
        content
      }
    })
  )

  return withProjectWriteLock(root, async () => {
    const created: string[] = []
    const items: ReferenceUploadResult['items'] = []
    try {
      for (const [index, source] of prepared.entries()) {
        await dependencies.beforeCreate?.(source.sourcePath, index)
        const file = await createReference(
          root,
          source.title,
          {
            source_title: source.title,
            material_type: 'other',
            location: source.sourceName,
            reading_status: 'unread'
          },
          source.content
        )
        created.push(file)
        items.push({
          path: file,
          source_name: source.sourceName,
          document: await readMarkdown<Record<string, unknown>>(file)
        })
      }
      return { items }
    } catch (error) {
      const rollbackErrors: unknown[] = []
      for (const file of created.reverse()) {
        await rm(file, { force: true }).catch((cause) => rollbackErrors.push(cause))
      }
      if (rollbackErrors.length) {
        throw new AggregateError([error, ...rollbackErrors], '参考文档上传失败，且本批次回滚不完整。', {
          cause: error
        })
      }
      throw error
    }
  })
}

function deduplicateSourcePaths(sourcePaths: string[]): string[] {
  const unique = new Map<string, string>()
  for (const sourcePath of sourcePaths) {
    const resolved = path.resolve(sourcePath)
    const key = process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved
    if (!unique.has(key)) unique.set(key, resolved)
  }
  return [...unique.values()]
}

function referenceTitle(content: string, sourceName: string): string {
  const heading = content.match(/^\s*#\s+(.+?)\s*#*\s*$/mu)?.[1]?.trim()
  if (heading) return heading
  return path.basename(sourceName, path.extname(sourceName)).trim() || '未命名参考'
}
