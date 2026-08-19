import { randomUUID } from 'node:crypto'
import { lstat, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sanitizeHtml from 'sanitize-html'
import { z } from 'zod'
import { ensureDir, pathExists } from './fs.js'
import { slugify } from './ids.js'
import { loadWorkspace, resolveWorkspacePath } from './workspace.js'

export const settingCardDocumentTypeSchema = z.enum([
  'world_entry',
  'character',
  'location',
  'character_relation'
])

export type SettingCardDocumentType = z.infer<typeof settingCardDocumentTypeSchema>

export const settingCardSizeV1Schema = z
  .object({
    width: z.number().int().min(320).max(2400),
    height: z.number().int().min(320).max(2400)
  })
  .strict()

export type SettingCardSizeV1 = z.infer<typeof settingCardSizeV1Schema>

export const settingCardTemplateV1Schema = z
  .object({
    schema_version: z.literal(1),
    template_html: z.string().min(1).max(80_000),
    css: z.string().min(1).max(80_000),
    notes: z.string().max(4_000).default('')
  })
  .strict()

export type SettingCardTemplateV1 = z.infer<typeof settingCardTemplateV1Schema>

export const settingCardStyleV1Schema = settingCardTemplateV1Schema
  .extend({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    name: z.string().trim().min(1).max(120),
    supported_types: z.array(settingCardDocumentTypeSchema).min(1),
    default_size: settingCardSizeV1Schema,
    created_at: z.string().datetime(),
    source_execution_id: z.string().min(1).max(160).nullable().default(null)
  })
  .strict()

export type SettingCardStyleV1 = z.infer<typeof settingCardStyleV1Schema>

export interface LoadedSettingCardStyle {
  value: SettingCardStyleV1
  relative_path: string
  sha256: string
}

export interface SaveWorkspaceSettingCardStyleInput {
  name: string
  template: SettingCardTemplateV1
  supported_types: SettingCardDocumentType[]
  default_size: SettingCardSizeV1
  source_execution_id?: string | null
}

export interface SettingCardRenderData {
  id: string
  type: string
  title: string
  content: string
  fields: Record<string, unknown>
  image_data_url?: string | null
  language?: 'zh' | 'en'
}

export const BUILTIN_SETTING_CARD_STYLES = [
  { id: 'ink-archive', zh: '墨色档案', en: 'Ink archive' },
  { id: 'modern-dossier', zh: '现代资料卡', en: 'Modern dossier' },
  { id: 'editorial', zh: '杂志编辑页', en: 'Editorial' },
  { id: 'minimal', zh: '极简信息卡', en: 'Minimal' },
  { id: 'heraldic', zh: '纹章叙事', en: 'Heraldic' }
] as const

export type BuiltinSettingCardStyleId = (typeof BUILTIN_SETTING_CARD_STYLES)[number]['id']

const REQUIRED_TEMPLATE_TOKENS = ['{{title}}', '{{content}}', '{{image}}'] as const
const STATIC_TEMPLATE_TOKENS = new Set([
  ...REQUIRED_TEMPLATE_TOKENS,
  '{{type}}',
  '{{stable_id}}',
  '{{fields}}'
])
const TEMPLATE_TOKEN_PATTERN = /\{\{[^{}]*\}\}/gu
const FIELD_TEMPLATE_TOKEN_PATTERN = /^\{\{fields\.([a-zA-Z][a-zA-Z0-9_-]{0,63})\}\}$/u
const STYLE_ROOT = 'styles/setting-cards'
const styleWriteLocks = new Map<string, Promise<void>>()

export function normalizeSettingCardTemplate(value: unknown): SettingCardTemplateV1 {
  const parsed = settingCardTemplateV1Schema.parse(value)
  assertSafeTemplateCss(parsed.css)
  const templateHtml = sanitizeHtml(parsed.template_html, {
    allowedTags: [
      'article',
      'section',
      'div',
      'header',
      'footer',
      'figure',
      'figcaption',
      'h1',
      'h2',
      'h3',
      'h4',
      'p',
      'span',
      'small',
      'strong',
      'em',
      'blockquote',
      'code',
      'br',
      'dl',
      'dt',
      'dd',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr'
    ],
    allowedAttributes: { '*': ['class', 'aria-label'] },
    allowedSchemes: [],
    disallowedTagsMode: 'discard',
    parseStyleAttributes: false
  }).trim()
  for (const token of REQUIRED_TEMPLATE_TOKENS) {
    if (!templateHtml.includes(token)) throw new Error(`SETTING_CARD_TEMPLATE_TOKEN_REQUIRED: ${token}`)
  }
  const unknownTokens = [...new Set(templateHtml.match(TEMPLATE_TOKEN_PATTERN) ?? [])].filter(
    (token) => !STATIC_TEMPLATE_TOKENS.has(token) && !FIELD_TEMPLATE_TOKEN_PATTERN.test(token)
  )
  if (unknownTokens.length) {
    throw new Error(
      `SETTING_CARD_TEMPLATE_TOKEN_UNKNOWN: ${unknownTokens
        .slice(0, 8)
        .map((token) => token.slice(0, 128))
        .join(', ')}`
    )
  }
  return settingCardTemplateV1Schema.parse({ ...parsed, template_html: templateHtml })
}

export async function listWorkspaceSettingCardStyles(
  workspaceRoot: string,
  documentType?: SettingCardDocumentType
): Promise<LoadedSettingCardStyle[]> {
  const workspace = await loadWorkspace(workspaceRoot)
  const root = resolveWorkspacePath(workspace.root, STYLE_ROOT, 'setting card style root')
  if (!(await pathExists(root))) return []
  await assertNoWorkspaceSymlink(workspace.root, root)
  const styleDirectories = await readdir(root, { withFileTypes: true })
  const loaded: LoadedSettingCardStyle[] = []
  for (const directory of styleDirectories) {
    if (!directory.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(directory.name)) continue
    const directoryPath = path.join(root, directory.name)
    await assertNoWorkspaceSymlink(workspace.root, directoryPath)
    const versions = (await readdir(directoryPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^\d+\.\d+\.\d+\.json$/u.test(entry.name))
      .sort((left, right) => compareVersions(right.name.slice(0, -5), left.name.slice(0, -5)))
    for (const versionFile of versions) {
      const absolutePath = path.join(directoryPath, versionFile.name)
      const raw = await readFile(absolutePath, 'utf8')
      const value = settingCardStyleV1Schema.parse(JSON.parse(raw))
      if (documentType && !value.supported_types.includes(documentType)) continue
      loaded.push({
        value,
        relative_path: normalizePath(path.relative(workspace.root, absolutePath)),
        sha256: await sha256Utf8(raw)
      })
    }
  }
  return loaded.sort(
    (left, right) =>
      left.value.name.localeCompare(right.value.name, 'zh-Hans-CN') ||
      compareVersions(right.value.version, left.value.version)
  )
}

export async function saveWorkspaceSettingCardStyle(
  workspaceRoot: string,
  input: SaveWorkspaceSettingCardStyleInput,
  now = new Date()
): Promise<LoadedSettingCardStyle> {
  const name = input.name.trim()
  if (!name) throw new Error('SETTING_CARD_STYLE_NAME_REQUIRED')
  const template = normalizeSettingCardTemplate(input.template)
  const supportedTypes = [
    ...new Set(input.supported_types.map((type) => settingCardDocumentTypeSchema.parse(type)))
  ]
  if (!supportedTypes.length) throw new Error('SETTING_CARD_STYLE_DOCUMENT_TYPE_REQUIRED')
  const defaultSize = settingCardSizeV1Schema.parse(input.default_size)
  const id = styleIdentifier(name)
  return withStyleWriteLock(path.resolve(workspaceRoot), async () => {
    const workspace = await loadWorkspace(workspaceRoot)
    const root = resolveWorkspacePath(workspace.root, STYLE_ROOT, 'setting card style root')
    await assertNoWorkspaceSymlink(workspace.root, root)
    const directory = path.join(root, id)
    await ensureDir(directory)
    await assertNoWorkspaceSymlink(workspace.root, directory)
    const existing = (await listWorkspaceSettingCardStyles(workspace.root)).filter(
      (style) => style.value.id === id
    )
    const version = nextPatchVersion(existing.map((style) => style.value.version))
    const value = settingCardStyleV1Schema.parse({
      ...template,
      id,
      version,
      name,
      supported_types: supportedTypes,
      default_size: defaultSize,
      created_at: now.toISOString(),
      source_execution_id: input.source_execution_id ?? null
    })
    const file = path.join(directory, `${version}.json`)
    const raw = `${JSON.stringify(value, null, 2)}\n`
    await atomicCreate(file, raw)
    const verifiedRaw = await readFile(file, 'utf8')
    const verified = settingCardStyleV1Schema.parse(JSON.parse(verifiedRaw))
    return {
      value: verified,
      relative_path: normalizePath(path.relative(workspace.root, file)),
      sha256: await sha256Utf8(verifiedRaw)
    }
  })
}

export function renderSettingCardHtml(
  templateInput: SettingCardTemplateV1,
  sizeInput: SettingCardSizeV1,
  data: SettingCardRenderData
): string {
  const template = normalizeSettingCardTemplate(templateInput)
  const size = settingCardSizeV1Schema.parse(sizeInput)
  const language = data.language ?? 'zh'
  const image = validImageDataUrl(data.image_data_url)
    ? `<img class="setting-card-image" src="${data.image_data_url}" alt="${escapeHtml(data.title)}" />`
    : `<div class="setting-card-image-fallback" aria-label="No image">${escapeHtml(initials(data.title))}</div>`
  const replacements: Readonly<Record<string, string>> = {
    '{{title}}': escapeHtml(data.title),
    '{{content}}': renderMarkdown(data.content),
    '{{image}}': image,
    '{{type}}': escapeHtml(documentTypeLabel(data.type, language)),
    '{{stable_id}}': escapeHtml(data.id),
    '{{fields}}': renderFields(data.fields, data.type, language)
  }
  const body = template.template_html.replace(TEMPLATE_TOKEN_PATTERN, (token) => {
    const fieldMatch = FIELD_TEMPLATE_TOKEN_PATTERN.exec(token)
    if (fieldMatch) {
      const field = fieldMatch[1]!
      const value = Object.prototype.hasOwnProperty.call(data.fields, field) ? data.fields[field] : undefined
      return emptyFieldValue(value) ? '—' : renderFieldValue(value, language)
    }
    return replacements[token] ?? token
  })
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\" />",
    `<style>html,body{margin:0;padding:0;min-height:${size.height}px;background:transparent}body{width:${size.width}px;overflow:auto}${template.css}</style>`,
    '</head>',
    `<body>${body}</body>`,
    '</html>'
  ].join('')
}

export function defaultSettingCardTemplate(direction: string): SettingCardTemplateV1 {
  const selected = BUILTIN_SETTING_CARD_STYLES.some((style) => style.id === direction)
    ? (direction as BuiltinSettingCardStyleId)
    : 'ink-archive'
  const variant = builtinTemplateVariant(selected)
  return normalizeSettingCardTemplate({
    schema_version: 1,
    template_html: variant.template,
    css: `${sharedSettingCardCss()}${variant.css}`,
    notes: `Code-owned ${selected} setting-card style; rendered locally without an Agent call.`
  })
}

function builtinTemplateVariant(direction: BuiltinSettingCardStyleId): {
  template: string
  css: string
} {
  switch (direction) {
    case 'modern-dossier':
      return {
        template:
          '<article class="setting-card modern-card"><section class="hero"><figure class="visual">{{image}}</figure><header><small>{{type}} · {{stable_id}}</small><h1>{{title}}</h1><span class="rule"></span></header></section><section class="content-grid"><section class="body">{{content}}</section><section class="facts"><h2>PROFILE</h2>{{fields}}</section></section></article>',
        css: '.setting-card{--accent:#295b73;--ink:#17242c;--paper:#f7f8f7;padding:6.5%;background:linear-gradient(135deg,#f7f8f7,#eef2f2);color:var(--ink);font-family:Inter,"Noto Sans SC",sans-serif}.hero{display:grid;grid-template-columns:minmax(190px,36%) 1fr;gap:5%;align-items:end}.visual{aspect-ratio:4/5;border-radius:2px;box-shadow:14px 14px 0 #dbe4e6}header small{color:var(--accent);font-weight:700;letter-spacing:.13em}header h1{margin:.4rem 0;font:700 3.2rem/1.05 Georgia,"Noto Serif SC",serif}.rule{display:block;width:72px;height:5px;margin-top:1.2rem;background:var(--accent)}.content-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(220px,.8fr);gap:7%;margin-top:3.6rem}.facts{padding-left:1.4rem;border-left:1px solid #cbd7da}.facts>h2{font-size:.78rem;letter-spacing:.2em;color:var(--accent)}'
      }
    case 'editorial':
      return {
        template:
          '<article class="setting-card editorial-card"><header><small>{{type}} / {{stable_id}}</small><h1>{{title}}</h1></header><figure class="visual">{{image}}</figure><section class="editorial-columns"><section class="body">{{content}}</section><section class="facts">{{fields}}</section></section></article>',
        css: '.setting-card{--accent:#c04a34;--ink:#1d1b19;--paper:#f8f3eb;padding:5.5%;background:var(--paper);color:var(--ink);font-family:Georgia,"Noto Serif SC",serif;border-top:18px solid var(--accent)}header{display:grid;grid-template-columns:1fr auto;align-items:end;border-bottom:2px solid var(--ink);padding-bottom:1rem}header small{grid-column:2;grid-row:1;color:var(--accent);font-family:Inter,"Noto Sans SC",sans-serif;letter-spacing:.12em}header h1{grid-column:1;grid-row:1;margin:0;font-size:4rem;line-height:1}.visual{margin:1.5rem 0;aspect-ratio:21/9}.editorial-columns{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(220px,1fr);gap:5%;align-items:start}.body>p:first-of-type:first-letter{float:left;margin:.05em .12em 0 0;color:var(--accent);font-size:4.4em;line-height:.72}.facts{border-top:5px solid var(--ink);padding-top:1rem}'
      }
    case 'minimal':
      return {
        template:
          '<article class="setting-card minimal-card"><header><small>{{type}} · {{stable_id}}</small><h1>{{title}}</h1></header><figure class="visual">{{image}}</figure><section class="body">{{content}}</section><section class="facts">{{fields}}</section></article>',
        css: '.setting-card{--accent:#111;--ink:#161616;--paper:#fff;padding:8%;background:#fff;color:var(--ink);font-family:Inter,"Noto Sans SC",sans-serif}header{max-width:82%;margin-bottom:2.8rem}header small{color:#777;letter-spacing:.16em;text-transform:uppercase}header h1{margin:.55rem 0 0;font-size:3.4rem;font-weight:560;line-height:1.1}.visual{aspect-ratio:16/9;filter:grayscale(1);border-radius:1px}.body{max-width:78%;margin:3rem 0}.facts{padding-top:2rem;border-top:1px solid #bbb}.field-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.field-item{display:block}.field-item dt{margin-bottom:.35rem;color:#777;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase}'
      }
    case 'heraldic':
      return {
        template:
          '<article class="setting-card heraldic-card"><header><small>{{type}}</small><h1>{{title}}</h1><span>{{stable_id}}</span></header><figure class="visual">{{image}}</figure><section class="facts">{{fields}}</section><section class="body">{{content}}</section></article>',
        css: '.setting-card{--accent:#8b5c22;--ink:#2c2015;--paper:#efe2c4;padding:7%;background:linear-gradient(135deg,#f8efd9,#e7d4ae);color:var(--ink);font-family:Georgia,"Noto Serif SC",serif;border:18px double var(--accent);outline:3px solid #d0ae72;outline-offset:-30px}header{text-align:center;margin:0 auto 1.8rem}header small{display:block;color:var(--accent);font-weight:700;letter-spacing:.22em}header h1{margin:.45rem 0 .2rem;font-size:3.5rem}header span{font-size:.78rem;color:#806b54}.visual{width:min(68%,520px);margin:0 auto 2.4rem;aspect-ratio:1;border-radius:50%;border:8px double var(--accent);box-shadow:0 0 0 10px #f5ead1}.setting-card-image{border-radius:50%}.setting-card-image-fallback{border-radius:50%}.facts{max-width:92%;margin:0 auto 2.5rem;padding:1.4rem;border-top:1px solid var(--accent);border-bottom:1px solid var(--accent)}.body{max-width:88%;margin:0 auto}'
      }
    case 'ink-archive':
    default:
      return {
        template:
          '<article class="setting-card ink-card"><header><small>{{type}} · {{stable_id}}</small><h1>{{title}}</h1></header><figure class="visual">{{image}}</figure><section class="facts">{{fields}}</section><section class="body">{{content}}</section></article>',
        css: '.setting-card{--accent:#694b32;--ink:#241c16;--paper:#f0e5cf;padding:6.5%;background:linear-gradient(90deg,rgba(104,75,50,.06) 1px,transparent 1px),linear-gradient(#f3ead7,#eadabd);background-size:28px 28px,auto;color:var(--ink);font-family:Georgia,"Noto Serif SC",serif;border:14px solid #5f4634;box-shadow:inset 0 0 0 4px #c9a979}header{padding:0 0 1.25rem;border-bottom:3px double var(--accent)}header small{color:var(--accent);font-weight:700;letter-spacing:.14em}header h1{margin:.4rem 0 0;font-size:3.25rem}.visual{margin:1.6rem 0;aspect-ratio:16/9;border:1px solid var(--accent);padding:8px;background:#ddc9a5}.facts{margin-bottom:2rem;padding:1.2rem 0;border-bottom:1px solid #a98862}.body h2,.body h3{font-weight:600}'
      }
  }
}

function sharedSettingCardCss(): string {
  return '*{box-sizing:border-box}.setting-card{min-height:100vh;overflow:hidden}.visual{margin:0;overflow:hidden;background:#d8d1c5}.setting-card-image{display:block;width:100%;height:100%;object-fit:cover}.setting-card-image-fallback{width:100%;height:100%;min-height:180px;display:grid;place-items:center;background:var(--accent);color:#fff;font-size:4.6rem;font-weight:700}.body{font-size:1rem;line-height:1.75;overflow-wrap:anywhere}.body h1,.body h2,.body h3,.body h4{margin:1.35em 0 .55em;line-height:1.25}.body h2{font-size:1.35rem}.body h3{font-size:1.15rem}.body p{margin:.65em 0}.body ul,.body ol{margin:.7em 0;padding-left:1.5em}.body li+li{margin-top:.3em}.body blockquote{margin:1em 0;padding:.2em 1em;border-left:3px solid var(--accent);color:color-mix(in srgb,var(--ink) 72%,transparent)}.body code{padding:.1em .35em;border-radius:3px;background:rgba(0,0,0,.07);font-family:ui-monospace,monospace;font-size:.88em}.body table{width:100%;margin:1em 0;border-collapse:collapse;font-size:.9em}.body th,.body td{padding:.55em .65em;border:1px solid color-mix(in srgb,var(--accent) 42%,transparent);text-align:left;vertical-align:top}.body th{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)}.facts{font-family:Inter,"Noto Sans SC",sans-serif}.field-grid{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.9rem 1.4rem}.field-item{min-width:0}.field-item>dt{margin:0 0 .25rem;color:var(--accent);font-size:.76rem;font-weight:750;letter-spacing:.07em}.field-item>dd{margin:0;line-height:1.5;overflow-wrap:anywhere}.field-list{display:flex;flex-wrap:wrap;gap:.35rem;margin:0;padding:0;list-style:none}.field-list li{padding:.18rem .5rem;border:1px solid color-mix(in srgb,var(--accent) 34%,transparent);border-radius:999px;background:color-mix(in srgb,var(--accent) 7%,transparent)}.field-map{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.25rem .6rem;margin:0}.field-map dt{color:color-mix(in srgb,var(--ink) 62%,transparent);font-size:.82em}.field-map dd{margin:0}'
}

function assertSafeTemplateCss(css: string): void {
  if (
    /(?:@import|@font-face|url\s*\(|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding|<\/style)/iu.test(
      css
    )
  ) {
    throw new Error('SETTING_CARD_CSS_UNSAFE')
  }
}

function renderFields(fields: Record<string, unknown>, type: string, language: 'zh' | 'en'): string {
  const ignored = new Set([
    'id',
    'type',
    'schema_version',
    'title',
    'enabled',
    'source_refs',
    'image',
    'created_at',
    'updated_at'
  ])
  const priority = fieldPriority(type)
  const rows = Object.entries(fields)
    .filter(([key, value]) => !ignored.has(key) && !emptyFieldValue(value))
    .sort(([left], [right]) => {
      const leftIndex = priority.indexOf(left)
      const rightIndex = priority.indexOf(right)
      if (leftIndex >= 0 || rightIndex >= 0) {
        return (
          (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
          (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
        )
      }
      return left.localeCompare(right, language === 'zh' ? 'zh-Hans-CN' : 'en')
    })
    .slice(0, 18)
    .map(
      ([key, value]) =>
        `<div class="field-item"><dt>${escapeHtml(fieldLabel(key, language))}</dt><dd>${renderFieldValue(value, language)}</dd></div>`
    )
    .join('')
  return rows ? `<dl class="field-grid">${rows}</dl>` : '<p>—</p>'
}

function renderMarkdown(value: string): string {
  const lines = value.replace(/\r\n?/gu, '\n').split('\n').slice(0, 600)
  const blocks: string[] = []
  let index = 0
  while (index < lines.length && blocks.length < 96) {
    const line = lines[index] ?? ''
    if (!line.trim()) {
      index += 1
      continue
    }
    const heading = /^(#{1,4})\s+(.+)$/u.exec(line)
    if (heading) {
      const level = Math.min(4, Math.max(2, heading[1]!.length))
      blocks.push(`<h${level}>${inlineMarkdown(heading[2]!)}</h${level}>`)
      index += 1
      continue
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line)) {
      blocks.push('<hr />')
      index += 1
      continue
    }
    if (index + 1 < lines.length && line.includes('|') && tableSeparator(lines[index + 1] ?? '')) {
      const headers = tableCells(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && (lines[index] ?? '').includes('|') && (lines[index] ?? '').trim()) {
        rows.push(tableCells(lines[index] ?? ''))
        index += 1
      }
      blocks.push(
        `<table><thead><tr>${headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${rows
          .map(
            (row) =>
              `<tr>${headers.map((_, cellIndex) => `<td>${inlineMarkdown(row[cellIndex] ?? '')}</td>`).join('')}</tr>`
          )
          .join('')}</tbody></table>`
      )
      continue
    }
    const list = /^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/u.exec(line)
    if (list) {
      const ordered = Boolean(list[2])
      const items: string[] = []
      while (index < lines.length) {
        const item = /^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/u.exec(lines[index] ?? '')
        if (!item || Boolean(item[2]) !== ordered) break
        items.push(`<li>${inlineMarkdown(item[3]!)}</li>`)
        index += 1
      }
      blocks.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }
    if (/^\s*>/u.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^\s*>/u.test(lines[index] ?? '')) {
        quote.push((lines[index] ?? '').replace(/^\s*>\s?/u, ''))
        index += 1
      }
      blocks.push(`<blockquote>${quote.map(inlineMarkdown).join('<br />')}</blockquote>`)
      continue
    }
    const paragraph: string[] = [line.trim()]
    index += 1
    while (index < lines.length && (lines[index] ?? '').trim() && !startsMarkdownBlock(lines, index)) {
      paragraph.push((lines[index] ?? '').trim())
      index += 1
    }
    blocks.push(`<p>${paragraph.map(inlineMarkdown).join('<br />')}</p>`)
  }
  return blocks.length ? blocks.join('') : '<p>—</p>'
}

function startsMarkdownBlock(lines: string[], index: number): boolean {
  const line = lines[index] ?? ''
  return (
    /^(?:#{1,4}\s+|\s*(?:[-+*]|\d+\.)\s+|\s*>|\s*(?:-{3,}|\*{3,}|_{3,})\s*$)/u.test(line) ||
    (line.includes('|') && index + 1 < lines.length && tableSeparator(lines[index + 1] ?? ''))
  )
}

function tableSeparator(value: string): boolean {
  const cells = tableCells(value)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell.replace(/\s/gu, '')))
}

function tableCells(value: string): string[] {
  return value
    .trim()
    .replace(/^\||\|$/gu, '')
    .split('|')
    .map((cell) => cell.trim())
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/gu, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>')
    .replace(/__([^_]+)__/gu, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/gu, '$1<em>$2</em>')
}

function renderFieldValue(value: unknown, language: 'zh' | 'en', depth = 0): string {
  if (Array.isArray(value)) {
    const items = value.filter((item) => !emptyFieldValue(item)).slice(0, 12)
    return items.length
      ? `<ul class="field-list">${items.map((item) => `<li>${renderFieldValue(item, language, depth + 1)}</li>`).join('')}</ul>`
      : '—'
  }
  if (value && typeof value === 'object') {
    if (depth >= 2) return escapeHtml(humanizeObject(value as Record<string, unknown>))
    const rows = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => !emptyFieldValue(child))
      .slice(0, 10)
      .map(
        ([key, child]) =>
          `<dt>${escapeHtml(fieldLabel(key, language))}</dt><dd>${renderFieldValue(child, language, depth + 1)}</dd>`
      )
      .join('')
    return rows ? `<dl class="field-map">${rows}</dl>` : '—'
  }
  if (typeof value === 'boolean')
    return value ? (language === 'zh' ? '是' : 'Yes') : language === 'zh' ? '否' : 'No'
  return escapeHtml(String(value))
}

function humanizeObject(value: Record<string, unknown>): string {
  return Object.entries(value)
    .filter(([, child]) => !emptyFieldValue(child))
    .slice(0, 8)
    .map(([key, child]) => `${key.replace(/_/gu, ' ')}: ${String(child)}`)
    .join(' · ')
}

function emptyFieldValue(value: unknown): boolean {
  if (value === '' || value === null || value === undefined) return true
  if (Array.isArray(value)) return value.every(emptyFieldValue)
  if (value && typeof value === 'object') return Object.values(value).every(emptyFieldValue)
  return false
}

function fieldPriority(type: string): string[] {
  const shared = ['status', 'aliases', 'tags']
  switch (type) {
    case 'character':
      return [...shared, 'role', 'factions', 'motivation_anchors', 'arc', 'ooc_guardrails']
    case 'location':
      return [...shared, 'location_type', 'region', 'environment', 'atmosphere', 'rules']
    case 'character_relation':
      return [...shared, 'from', 'to', 'relation_type', 'starts_at', 'ends_at', 'dynamic']
    case 'world_entry':
      return [...shared, 'category', 'trigger_words', 'setting_effect', 'valid_from', 'valid_to']
    default:
      return shared
  }
}

function fieldLabel(key: string, language: 'zh' | 'en'): string {
  const labels: Record<string, readonly [string, string]> = {
    status: ['状态', 'Status'],
    aliases: ['别名', 'Aliases'],
    tags: ['标签', 'Tags'],
    role: ['人物定位', 'Role'],
    factions: ['所属势力', 'Factions'],
    motivation_anchors: ['动机锚点', 'Motivation anchors'],
    arc: ['人物弧光', 'Character arc'],
    ooc_guardrails: ['行为边界', 'Behavior guardrails'],
    location_type: ['地点类型', 'Location type'],
    region: ['区域', 'Region'],
    environment: ['环境', 'Environment'],
    atmosphere: ['氛围', 'Atmosphere'],
    rules: ['规则', 'Rules'],
    from: ['起点', 'From'],
    to: ['终点', 'To'],
    relation_type: ['关系类型', 'Relation type'],
    starts_at: ['开始时间', 'Starts at'],
    ends_at: ['结束时间', 'Ends at'],
    dynamic: ['关系动态', 'Dynamic'],
    category: ['分类', 'Category'],
    trigger_words: ['触发词', 'Trigger words'],
    setting_effect: ['设定作用', 'Setting effect'],
    valid_from: ['生效起点', 'Valid from'],
    valid_to: ['失效终点', 'Valid to']
  }
  const label = labels[key]
  if (label) return language === 'zh' ? label[0] : label[1]
  const humanized = key.replace(/_/gu, ' ').trim()
  return humanized
    ? humanized[0]!.toLocaleUpperCase(language === 'zh' ? 'zh-CN' : 'en-US') + humanized.slice(1)
    : key
}

function documentTypeLabel(type: string, language: 'zh' | 'en'): string {
  const labels: Record<string, readonly [string, string]> = {
    world_entry: ['世界书', 'World entry'],
    character: ['人物', 'Character'],
    location: ['地点', 'Location'],
    character_relation: ['人物关系', 'Character relation']
  }
  const label = labels[type]
  return label ? (language === 'zh' ? label[0] : label[1]) : type
}

function validImageDataUrl(value: string | null | undefined): value is string {
  return Boolean(value && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/iu.test(value))
}

function initials(title: string): string {
  const characters = [...title.trim()].filter((value) => !/\s/u.test(value))
  return characters.slice(0, 2).join('').toLocaleUpperCase() || 'Q'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function styleIdentifier(name: string): string {
  const slug = slugify(name)
    .replace(/_/gu, '-')
    .replace(/^-+|-+$/gu, '')
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) return slug.slice(0, 80).replace(/-+$/u, '')
  return `style-${simpleNameHash(name)}`
}

function simpleNameHash(value: string): string {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function nextPatchVersion(versions: string[]): string {
  const latest = versions.sort(compareVersions).at(-1)
  if (!latest) return '1.0.0'
  const [major, minor, patch] = latest.split('.').map(Number)
  return `${major}.${minor}.${patch + 1}`
}

function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  return (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0) || (a[2] ?? 0) - (b[2] ?? 0)
}

async function sha256Utf8(value: string): Promise<string> {
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

async function assertNoWorkspaceSymlink(workspaceRoot: string, target: string): Promise<void> {
  const absoluteRoot = path.resolve(workspaceRoot)
  const relative = path.relative(absoluteRoot, path.resolve(target))
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('SETTING_CARD_STYLE_PATH_UNSAFE')
  }
  let current = absoluteRoot
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if (!(await pathExists(current))) continue
    if ((await lstat(current)).isSymbolicLink()) throw new Error('SETTING_CARD_STYLE_SYMLINK_FORBIDDEN')
  }
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

async function withStyleWriteLock<T>(workspaceRoot: string, operation: () => Promise<T>): Promise<T> {
  const key = process.platform === 'win32' ? workspaceRoot.toLocaleLowerCase('en-US') : workspaceRoot
  const previous = styleWriteLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => gate)
  styleWriteLocks.set(key, queued)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (styleWriteLocks.get(key) === queued) styleWriteLocks.delete(key)
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/gu, '/')
}
