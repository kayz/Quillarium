import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, dialog, type SaveDialogOptions, type SaveDialogReturnValue } from 'electron'
import {
  executeAgentTask,
  type AgentRuntimeDependencies,
  type SettingCardDesignResultV1
} from '@quillarium/agent-runtime'
import {
  assertSensitiveSourcesSafe,
  defaultSettingCardTemplate,
  ensureDir,
  findWorkspaceForProject,
  getWorkspaceDir,
  listDocs,
  listWorkspaceSettingCardStyles,
  loadWorkspace,
  normalizeSettingCardTemplate,
  renderSettingCardHtml,
  saveWorkspaceSettingCardStyle,
  settingCardDocumentTypeSchema,
  settingCardSizeV1Schema,
  type DocumentIdentity,
  type LoadedSettingCardStyle,
  type SettingCardDocumentType,
  type SettingCardSizeV1,
  type SettingCardTemplateV1
} from '@quillarium/core'
import { loadSettingImage } from './setting-assets.js'
import {
  typedHandle,
  type SettingCardDesignResponse,
  type SettingCardExportResult,
  type SettingCardPreviewData,
  type SettingCardRenderResponse,
  type SettingCardRenderSource
} from './contract.js'
import { loadDesktopAIProfile } from './credentials.js'

export type SettingCardDesignDependencies = Omit<AgentRuntimeDependencies, 'loadAIProfile'> & {
  loadAIProfile?: AgentRuntimeDependencies['loadAIProfile']
}

export interface SettingCardExportDialog {
  showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogReturnValue>
}

export interface SettingCardExportDependencies {
  dialog?: SettingCardExportDialog
  defaultDirectory?: string
}

export function registerSettingCardHandlers(): void {
  typedHandle('settingCard:styles', async (_event, root, documentType) =>
    listSettingCardStyles(root, documentType)
  )
  typedHandle('settingCard:design', async (_event, root, input) => designSettingCard(root, input))
  typedHandle('settingCard:renderStyle', async (_event, root, input) => renderSettingCard(root, input))
  typedHandle('settingCard:saveStyle', async (_event, root, input) => saveSettingCardStyle(root, input))
  typedHandle('settingCard:export', async (event, root, input) =>
    exportSettingCard(root, input, {
      dialog: {
        showSaveDialog: (options) => {
          const owner = BrowserWindow.fromWebContents(event.sender)
          return owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options)
        }
      }
    })
  )
}

export async function listSettingCardStyles(
  projectRoot: string,
  documentType: SettingCardDocumentType
): Promise<LoadedSettingCardStyle[]> {
  const workspaceRoot = await workspaceRootForProject(projectRoot)
  return listWorkspaceSettingCardStyles(workspaceRoot, settingCardDocumentTypeSchema.parse(documentType))
}

export async function designSettingCard(
  projectRoot: string,
  input: {
    document_id: string
    document_type: SettingCardDocumentType
    style_direction: string
    variation_index?: number
    size: SettingCardSizeV1
    base_style?: { id: string; version: string } | null
    language: 'zh' | 'en'
    preview?: SettingCardPreviewData
  },
  dependencies: SettingCardDesignDependencies = {}
): Promise<SettingCardDesignResponse> {
  const documentType = settingCardDocumentTypeSchema.parse(input.document_type)
  const size = settingCardSizeV1Schema.parse(input.size)
  const baseStyle = input.base_style ? await loadStyle(projectRoot, input.base_style) : null
  const outcome = await executeAgentTask<SettingCardDesignResultV1>(
    {
      schema_version: 1,
      task_id: 'setting-card-design',
      target: { type: documentType, id: input.document_id },
      input: {
        document_id: input.document_id,
        document_type: documentType,
        style_direction: input.style_direction,
        variation_index: input.variation_index ?? 0,
        size,
        base_style: baseStyle ? templateFromStyle(baseStyle) : null
      },
      language: input.language,
      requested_by: 'author',
      projectRoot: path.resolve(projectRoot)
    },
    {
      ...dependencies,
      loadAIProfile: dependencies.loadAIProfile ?? ((profile) => loadDesktopAIProfile(profile))
    }
  )
  if (outcome.status === 'failed') {
    throw new Error(`${outcome.error.code}: ${outcome.error.technical_detail}`)
  }
  const html = input.preview
    ? renderPreviewData(outcome.result.template, size, input.document_id, input.preview, input.language)
    : await renderDocument(projectRoot, input.document_id, outcome.result.template, size, input.language)
  return {
    candidate: outcome.result,
    html,
    run_relative_path: portableRunPath(outcome.run_path)
  }
}

export async function renderSettingCard(
  projectRoot: string,
  input: {
    document_id: string
    source: SettingCardRenderSource
    size: SettingCardSizeV1
    language: 'zh' | 'en'
    preview: SettingCardPreviewData
  }
): Promise<SettingCardRenderResponse> {
  const size = settingCardSizeV1Schema.parse(input.size)
  let style: LoadedSettingCardStyle | null = null
  let template: SettingCardTemplateV1
  switch (input.source.kind) {
    case 'workspace':
      style = await loadStyle(projectRoot, input.source)
      template = templateFromStyle(style)
      break
    case 'candidate':
      template = normalizeSettingCardTemplate(input.source.template)
      break
    case 'builtin':
      template = settingCardTemplateForDirection(input.source.id)
      break
  }
  return {
    html: renderPreviewData(template, size, input.document_id, input.preview, input.language),
    template,
    style
  }
}

function renderPreviewData(
  template: SettingCardTemplateV1,
  size: SettingCardSizeV1,
  documentId: string,
  preview: SettingCardPreviewData,
  language: 'zh' | 'en'
): string {
  if (preview.id !== documentId) throw new Error('SETTING_CARD_PREVIEW_ID_MISMATCH')
  const type = settingCardDocumentTypeSchema.parse(preview.type)
  if (!preview.title.trim()) throw new Error('SETTING_CARD_PREVIEW_TITLE_REQUIRED')
  if (!preview.fields || typeof preview.fields !== 'object' || Array.isArray(preview.fields)) {
    throw new Error('SETTING_CARD_PREVIEW_FIELDS_INVALID')
  }
  return renderSettingCardHtml(template, size, {
    id: preview.id,
    type,
    title: preview.title,
    content: preview.content,
    fields: preview.fields,
    image_data_url: preview.image_data_url ?? null,
    language
  })
}

export async function saveSettingCardStyle(
  projectRoot: string,
  input: { name: string; candidate: SettingCardDesignResultV1 }
): Promise<LoadedSettingCardStyle> {
  const workspaceRoot = await workspaceRootForProject(projectRoot)
  return saveWorkspaceSettingCardStyle(workspaceRoot, {
    name: input.name,
    template: normalizeSettingCardTemplate(input.candidate.template),
    supported_types: ['world_entry', 'character', 'location', 'character_relation'],
    default_size: input.candidate.size,
    source_execution_id: input.candidate.execution_id
  })
}

export async function exportSettingCard(
  projectRoot: string,
  input: {
    document_id: string
    template: SettingCardTemplateV1
    size: SettingCardSizeV1
    language: 'zh' | 'en'
  },
  dependencies: SettingCardExportDependencies = {}
): Promise<SettingCardExportResult> {
  const absoluteRoot = path.resolve(projectRoot)
  const template = normalizeSettingCardTemplate(input.template)
  const size = settingCardSizeV1Schema.parse(input.size)
  const document = await settingDocument(absoluteRoot, input.document_id)
  const html = await renderDocument(absoluteRoot, input.document_id, template, size, input.language)
  assertSensitiveSourcesSafe([{ source: `setting-card-export:${input.document_id}`, text: html }])
  const selection = await (dependencies.dialog ?? dialog).showSaveDialog({
    title: input.language === 'zh' ? '设定卡 HTML 另存为' : 'Save setting card HTML',
    defaultPath: path.join(
      dependencies.defaultDirectory ?? app.getPath('documents'),
      `${safeExportFileBase(document.data.title)}.html`
    ),
    buttonLabel: input.language === 'zh' ? '保存' : 'Save',
    filters: [{ name: 'HTML', extensions: ['html'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation']
  })
  if (selection.canceled || !selection.filePath) {
    return { canceled: true, file_name: null, bytes: 0 }
  }
  const file = ensureHtmlExtension(path.resolve(selection.filePath))
  await ensureDir(path.dirname(file))
  await atomicCreate(file, `${html}\n`)
  return {
    canceled: false,
    file_name: path.basename(file),
    bytes: Buffer.byteLength(html, 'utf8') + 1
  }
}

async function renderDocument(
  projectRoot: string,
  documentId: string,
  template: SettingCardTemplateV1,
  size: SettingCardSizeV1,
  language: 'zh' | 'en' = 'zh'
): Promise<string> {
  const document = await settingDocument(projectRoot, documentId)
  const preview = await loadSettingImage(projectRoot, documentId)
  return renderSettingCardHtml(template, size, {
    id: document.data.id,
    type: document.data.type,
    title: document.data.title,
    content: document.content,
    fields: document.data as DocumentIdentity & Record<string, unknown>,
    image_data_url: preview?.previewDataUrl ?? null,
    language
  })
}

async function settingDocument(projectRoot: string, documentId: string) {
  const document = (await listDocs<DocumentIdentity>(projectRoot)).find(
    (item) => item.data.id === documentId && settingCardDocumentTypeSchema.safeParse(item.data.type).success
  )
  if (!document) throw new Error(`SETTING_CARD_DOCUMENT_NOT_FOUND: ${documentId}`)
  return document
}

async function loadStyle(
  projectRoot: string,
  reference: { id: string; version: string }
): Promise<LoadedSettingCardStyle> {
  const styles = await listWorkspaceSettingCardStyles(await workspaceRootForProject(projectRoot))
  const style = styles.find(
    (candidate) => candidate.value.id === reference.id && candidate.value.version === reference.version
  )
  if (!style) throw new Error(`SETTING_CARD_STYLE_NOT_FOUND: ${reference.id}@${reference.version}`)
  return style
}

async function workspaceRootForProject(projectRoot: string): Promise<string> {
  const discovered = await findWorkspaceForProject(path.resolve(projectRoot)).catch(() => null)
  if (discovered) return discovered.root
  const configured = await getWorkspaceDir()
  if (!configured) throw new Error('SETTING_CARD_WORKSPACE_REQUIRED')
  return (await loadWorkspace(configured)).root
}

function templateFromStyle(style: LoadedSettingCardStyle): SettingCardTemplateV1 {
  return {
    schema_version: 1,
    template_html: style.value.template_html,
    css: style.value.css,
    notes: style.value.notes
  }
}

export function settingCardTemplateForDirection(direction: string): SettingCardTemplateV1 {
  return defaultSettingCardTemplate(direction)
}

async function atomicCreate(file: string, content: string): Promise<void> {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
  try {
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

function safeExportFileBase(value: string): string {
  const withoutControlCharacters = [...value.normalize('NFC')]
    .map((character) => (character.codePointAt(0)! < 32 ? '-' : character))
    .join('')
  const safe = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/gu, '-')
    .replace(/[. ]+$/gu, '')
    .trim()
    .slice(0, 120)
  if (!safe) return 'setting-card'
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(safe) ? `_${safe}` : safe
}

function ensureHtmlExtension(value: string): string {
  return /\.html?$/iu.test(value) ? value : `${value}.html`
}

function normalizePath(value: string): string {
  return value.replace(/\\/gu, '/')
}

function portableRunPath(value: string): string {
  const normalized = normalizePath(value)
  if (
    !normalized ||
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error('SETTING_CARD_RUN_PATH_INVALID')
  }
  return normalized
}
