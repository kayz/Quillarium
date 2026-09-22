# Display Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Card images live in `assets/display/<card-id>/` with a gallery manifest; authors upload on desktop/CLI and generate only when they click, after preview confirm.

**Architecture:** Core owns manifest + files and never writes `PlanningCardDoc.image`. `renderSettingCardHtml` fills `{{image}}` with the selected picture and `{{images}}` with renderer-built CSS-only radio carousel HTML. `@quillarium/ai` exposes `generateDisplayImageCandidate` behind OpenAI Images, openai-compatible, and Gemini adapters. Desktop uses a separate encrypted image profile. CLI only uploads.

**Tech Stack:** TypeScript, pnpm workspace, Vitest, Zod, existing Electron IPC, Commander CLI, existing setting-card sanitizer.

## Global Constraints

- Product spec: `docs/superpowers/specs/2026-09-22-display-images-design.md` (approved).
- Parent spec: `docs/superpowers/specs/2026-09-22-display-layer-design.md`.
- Write `assets/display/<card-id>/` only. Do not write `PlanningCardDoc.image`. Do not write `assets/settings/`.
- Gallery: `manifest.json` `schema_version: 1` with `selected_id` and `images[]` (`id`, `file`, `mime_type`, `alt`, `source: 'upload' | 'generated'`, `created_at`).
- Card types: `world_entry, canon, character, character_relation, location, timeline_event, faction, faction_relation, faction_membership, foreshadowing, narrative`.
- `{{image}}` = selected; `{{images}}` = renderer-generated CSS-only carousel (radio + label + figure). No script, no event handlers. Author templates may omit `{{images}}`.
- Generate only on explicit author action. Open/save/specialize/enable display layer must not call image APIs.
- Prompt is editable; default is title + excerpt. Candidate is in-memory until confirm.
- Image credentials: `displayImageProfile` beside `aiProfiles`, not in `project.yaml`. Providers: `openai` | `openai-compatible` | `gemini`.
- CLI: `quill display add-image --project --card-id --file` only. No gen subcommand.
- CCv3 and project cover unchanged.
- Style: no semicolons, single quotes, Prettier 110.
- Tests: `pnpm exec vitest run <file>`. Full gate `pnpm check`.
- IPC channel count is currently **166**; this slice adds **6** (`displayImage:*`) → **172**.

## Later plans (out of scope here)

1. Agent expert-mode fence.
2. Claude / DeepSeek / Ollama image endpoints.
3. CCv3 image interchange.

## File map

- Create: `packages/core/src/display-images.ts` — store
- Create: `packages/core/src/display-images.test.ts`
- Modify: `packages/core/src/project.ts` — `assets/display` in `PROJECT_DIRS`
- Modify: `packages/core/src/index.ts` — export
- Modify: `packages/core/src/setting-card-styles.ts` — `{{images}}` token + carousel HTML + builtin CSS
- Modify: `packages/core/src/setting-card-styles.test.ts`
- Modify: `packages/core/src/config.ts` — `displayImageProfile`
- Create: `packages/ai/src/display-image-generate.ts` — adapters + injectable `fetch`
- Create: `packages/ai/src/display-image-generate.test.ts`
- Modify: `packages/ai/src/index.ts` — export
- Modify: `packages/cli/src/index.ts` — `display add-image`
- Modify: `packages/cli/src/index.test.ts`
- Modify: `apps/desktop/electron/ipc/contract.ts` / `preload.ts` / `preload.cjs` / `contract.test.ts` — 166 → 172
- Create: `apps/desktop/electron/ipc/display-images.ts`
- Modify: `apps/desktop/electron/ipc/index.ts` — register
- Modify: `apps/desktop/electron/ipc/project.ts` — delete card also `removeDisplayImagesForCard`
- Modify: `apps/desktop/electron/ipc/credentials.ts` — load/save image profile
- Modify: `apps/desktop/src/features/planning/SettingCardMedia.tsx` — upload, gallery, gen preview
- Modify: `docs/DESIGN.md`, `docs/CLI.md`

Do not retarget old `settingImage:choose` to write card `image`. Leave unmigrated loaders for leftover sessions.

---

### Task 1: Failing core tests for the display image store

**Files:**

- Create: `packages/core/src/display-images.test.ts`
- Test: `packages/core/src/display-images.test.ts`

**Interfaces:**

- Consumes: `createProjectAt`, `createWorldEntry`, `loadProject`, `pathExists`, `readText`
- Produces: contract for Task 2 — `addDisplayImage`, `listDisplayImages`, `selectDisplayImage`, `removeDisplayImage` from `./display-images.js`

- [ ] **Step 1: Write the test file**

Tiny PNG (89 50 4E 47…):

```ts
import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createWorldEntry } from './documents.js'
import { pathExists, readText } from './fs.js'
import { createProjectAt, loadProject } from './project.js'
import { WRITER_DEFAULT_DISPLAY_LAYER } from './display-layer.js'
import {
  addDisplayImage,
  listDisplayImages,
  removeDisplayImage,
  selectDisplayImage
} from './display-images.js'

const PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
)

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(id: string) {
  const root = path.join(os.tmpdir(), `quillarium-display-images-${id}-${Date.now()}`)
  roots.push(root)
  await createProjectAt(root, { id, title: id, display_layer: WRITER_DEFAULT_DISPLAY_LAYER })
  await createWorldEntry(root, '林舟', { id: 'world-lin' }, '水手。')
  return root
}

describe('display image store', () => {
  it('writes files and manifest without touching card image', async () => {
    const root = await fixture('upload')
    const first = await addDisplayImage(root, 'world-lin', PNG, {
      mime_type: 'image/png',
      alt: '林舟',
      source: 'upload'
    })
    expect(first.selected_id).toBeTruthy()
    expect(first.images).toHaveLength(1)
    expect(await pathExists(path.join(root, 'assets', 'display', 'world-lin', first.images[0]!.file))).toBe(true)
    const card = await readText(path.join(root, 'world', 'world-lin.md'))
    expect(card).not.toMatch(/^image:/m)
    expect(JSON.parse(await readText(path.join(root, 'assets', 'display', 'world-lin', 'manifest.json')))).toMatchObject(
      { schema_version: 1, selected_id: first.selected_id }
    )
  })

  it('keeps a gallery and lets the author change the selected image', async () => {
    const root = await fixture('gallery')
    const first = await addDisplayImage(root, 'world-lin', PNG, { mime_type: 'image/png', alt: 'a', source: 'upload' })
    const second = await addDisplayImage(root, 'world-lin', PNG, {
      mime_type: 'image/png',
      alt: 'b',
      source: 'generated'
    })
    expect(second.images).toHaveLength(2)
    expect(second.selected_id).toBe(second.images[1]!.id)
    const selected = await selectDisplayImage(root, 'world-lin', first.images[0]!.id)
    expect(selected.selected_id).toBe(first.images[0]!.id)
    const removed = await removeDisplayImage(root, 'world-lin', second.images[1]!.id)
    expect(removed.images).toHaveLength(1)
    expect(removed.selected_id).toBe(first.images[0]!.id)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm exec vitest run packages/core/src/display-images.test.ts`

Expected: FAIL — `Cannot find module './display-images.js'`

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/display-images.test.ts
git commit -m "test: expect display images to live beside the card id"
```

---

### Task 2: Implement the display image store

**Files:**

- Create: `packages/core/src/display-images.ts`
- Modify: `packages/core/src/project.ts` — add `'assets/display'` to `PROJECT_DIRS` (after `'assets/settings'`)
- Modify: `packages/core/src/index.ts` — `export * from './display-images.js'`
- Test: `packages/core/src/display-images.test.ts`

**Interfaces:**

```ts
export type DisplayImageMime = 'image/png' | 'image/jpeg' | 'image/webp'
export type DisplayImageSource = 'upload' | 'generated'

export interface DisplayImageEntry {
  id: string
  file: string
  mime_type: DisplayImageMime
  alt: string
  source: DisplayImageSource
  created_at: string
}

export interface DisplayImageManifest {
  schema_version: 1
  selected_id: string | null
  images: DisplayImageEntry[]
}

export async function listDisplayImages(projectRoot: string, cardId: string): Promise<DisplayImageManifest>
export async function addDisplayImage(
  projectRoot: string,
  cardId: string,
  bytes: Uint8Array,
  meta: { mime_type: DisplayImageMime; alt?: string; source: DisplayImageSource }
): Promise<DisplayImageManifest>
export async function removeDisplayImage(projectRoot: string, cardId: string, imageId: string): Promise<DisplayImageManifest>
export async function selectDisplayImage(projectRoot: string, cardId: string, imageId: string): Promise<DisplayImageManifest>
export async function removeDisplayImagesForCard(projectRoot: string, cardId: string): Promise<void>
export function displayImageDir(projectRoot: string, cardId: string): string
```

Allowlist the same enum as `settingCardDocumentTypeSchema`. Reject other `cardId` only at CLI/desktop; core trusts the caller’s id (ids are stable). Validate png/jpeg/webp magic bytes.

- [ ] **Step 1: Implement `display-images.ts`**

```ts
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, pathExists, readText, writeBinary, writeText } from './fs.js'
import { withProjectWriteLock } from './project-write-lock.js'

const MANIFEST = 'manifest.json'

const emptyManifest = (): DisplayImageManifest => ({ schema_version: 1, selected_id: null, images: [] })

export function displayImageDir(projectRoot: string, cardId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(cardId)) throw new Error('DISPLAY_IMAGE_CARD_ID_UNSAFE')
  return path.join(projectRoot, 'assets', 'display', cardId)
}

function extensionFor(mime: DisplayImageMime): 'png' | 'jpg' | 'webp' {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  return 'png'
}

function assertMagic(bytes: Uint8Array, mime: DisplayImageMime): void {
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const webp = bytes.length >= 12 && bytes[0] === 0x52 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  if (mime === 'image/png' && png) return
  if (mime === 'image/jpeg' && jpeg) return
  if (mime === 'image/webp' && webp) return
  throw new Error('该文件不是可用的 png/jpeg/webp 配图。')
}

async function readManifest(dir: string): Promise<DisplayImageManifest> {
  const file = path.join(dir, MANIFEST)
  if (!(await pathExists(file))) return emptyManifest()
  return JSON.parse(await readText(file)) as DisplayImageManifest
}

async function writeManifest(dir: string, manifest: DisplayImageManifest): Promise<void> {
  await writeText(path.join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
}

export async function listDisplayImages(projectRoot: string, cardId: string): Promise<DisplayImageManifest> {
  return readManifest(displayImageDir(projectRoot, cardId))
}

export async function addDisplayImage(
  projectRoot: string,
  cardId: string,
  bytes: Uint8Array,
  meta: { mime_type: DisplayImageMime; alt?: string; source: DisplayImageSource }
): Promise<DisplayImageManifest> {
  assertMagic(bytes, meta.mime_type)
  return withProjectWriteLock(projectRoot, async () => {
    const dir = displayImageDir(projectRoot, cardId)
    await ensureDir(dir)
    const id = randomUUID()
    const file = `${id}.${extensionFor(meta.mime_type)}`
    await writeBinary(path.join(dir, file), bytes)
    const current = await readManifest(dir)
    const entry = {
      id,
      file,
      mime_type: meta.mime_type,
      alt: meta.alt ?? '',
      source: meta.source,
      created_at: new Date().toISOString()
    }
    const next: DisplayImageManifest = {
      schema_version: 1,
      selected_id: id,
      images: [...current.images, entry]
    }
    await writeManifest(dir, next)
    return next
  })
}

export async function removeDisplayImage(
  projectRoot: string,
  cardId: string,
  imageId: string
): Promise<DisplayImageManifest> {
  return withProjectWriteLock(projectRoot, async () => {
    const dir = displayImageDir(projectRoot, cardId)
    const current = await readManifest(dir)
    const entry = current.images.find((image) => image.id === imageId)
    if (!entry) throw new Error('找不到这张配图。')
    await rm(path.join(dir, entry.file), { force: true })
    const images = current.images.filter((image) => image.id !== imageId)
    const selected_id =
      current.selected_id === imageId ? (images[images.length - 1]?.id ?? null) : current.selected_id
    const next: DisplayImageManifest = { schema_version: 1, selected_id, images }
    await writeManifest(dir, next)
    return next
  })
}

export async function selectDisplayImage(
  projectRoot: string,
  cardId: string,
  imageId: string
): Promise<DisplayImageManifest> {
  return withProjectWriteLock(projectRoot, async () => {
    const dir = displayImageDir(projectRoot, cardId)
    const current = await readManifest(dir)
    if (!current.images.some((image) => image.id === imageId)) throw new Error('找不到这张配图。')
    const next = { ...current, selected_id: imageId }
    await writeManifest(dir, next)
    return next
  })
}

export async function removeDisplayImagesForCard(projectRoot: string, cardId: string): Promise<void> {
  return withProjectWriteLock(projectRoot, async () => {
    await rm(displayImageDir(projectRoot, cardId), { recursive: true, force: true })
  })
}
```

Add a third test in the same file: `removeDisplayImagesForCard` deletes the directory.

- [ ] **Step 2: Run** `pnpm exec vitest run packages/core/src/display-images.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit** `feat: store card display images under assets/display`

---

### Task 3: `{{images}}` CSS-only carousel in the renderer

**Files:**

- Modify: `packages/core/src/setting-card-styles.ts`
- Modify: `packages/core/src/setting-card-styles.test.ts`

**Interfaces:**

- Extends `SettingCardRenderData`:

```ts
image_data_urls?: Array<{ data_url: string; alt: string; id: string }>
```

- `STATIC_TEMPLATE_TOKENS` adds `'{{images}}'`. `{{images}}` is **not** required.
- `renderSettingCardHtml` replaces `{{images}}` with `renderDisplayImageGallery(data)` (never author-supplied radio markup).

- [ ] **Step 1: Failing test** in `setting-card-styles.test.ts`

```ts
it('expands {{images}} into a scriptless radio carousel and keeps {{image}} as the selection', () => {
  const html = renderSettingCardHtml(
    {
      schema_version: 1,
      template_html: '<article>{{image}}<div class="gallery">{{images}}</div><h1>{{title}}</h1>{{content}}</article>',
      css: 'article { color: #111; } .display-gallery { display: grid; }'
    },
    { width: 720, height: 1080 },
    {
      id: 'world-lin',
      type: 'world_entry',
      title: '林舟',
      content: '水手。',
      fields: {},
      image_data_url: 'data:image/png;base64,AAAA',
      image_data_urls: [
        { id: 'one', alt: 'a', data_url: 'data:image/png;base64,AAAA' },
        { id: 'two', alt: 'b', data_url: 'data:image/png;base64,BBBB' }
      ]
    }
  )
  expect(html).toContain('data:image/png;base64,AAAA')
  expect(html).toContain('display-gallery')
  expect(html).toContain('type="radio"')
  expect(html).not.toContain('<script')
  expect(html).not.toContain('onclick')
})
```

Also: saving a template that contains `{{images}}` succeeds; `<script>` still throws `SETTING_CARD_SCRIPT_UNSAFE`.

- [ ] **Step 2: Implement**

Add to `STATIC_TEMPLATE_TOKENS`: `'{{images}}'`.

```ts
function renderDisplayImageGallery(data: SettingCardRenderData): string {
  const images = data.image_data_urls ?? []
  if (images.length === 0) return ''
  const name = `display-gallery-${escapeHtml(data.id)}`
  const items = images
    .map((image, index) => {
      const checked = index === 0 ? ' checked' : ''
      return `<input class="display-gallery-input" type="radio" name="${name}" id="${name}-${escapeHtml(image.id)}"${checked} /><label class="display-gallery-dot" for="${name}-${escapeHtml(image.id)}"></label><figure class="display-gallery-slide"><img class="setting-card-image" src="${image.data_url}" alt="${escapeHtml(image.alt || data.title)}" /></figure>`
    })
    .join('')
  return `<div class="display-gallery">${items}</div>`
}
```

Put `{{images}}: renderDisplayImageGallery(data)` in `replacements`.

Append to every builtin CSS string (or shared CSS concatenated at render):

```css
.display-gallery { display: grid; }
.display-gallery-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.display-gallery-slide { display: none; grid-area: 1 / 1; }
.display-gallery-input:checked + .display-gallery-dot + .display-gallery-slide { display: block; }
```

`:checked` sibling selector requires the order `input, label, figure` as above.

sanitize-html does **not** need to allow `input` in author templates; gallery HTML is injected after sanitize.

- [ ] **Step 3: Run** `pnpm exec vitest run packages/core/src/setting-card-styles.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit** `feat: render a CSS-only display image carousel`

---

### Task 4: Image generation adapters and separate profile

**Files:**

- Modify: `packages/core/src/config.ts` — optional `displayImageProfile`
- Create: `packages/ai/src/display-image-generate.ts`
- Create: `packages/ai/src/display-image-generate.test.ts`
- Modify: `packages/ai/src/index.ts` — export

**Interfaces:**

```ts
export type DisplayImageProvider = 'openai' | 'openai-compatible' | 'gemini'

export interface DisplayImageProfile {
  provider: DisplayImageProvider
  baseUrl?: string
  apiKey: string
  model: string
}

export async function generateDisplayImageCandidate(
  input: {
    prompt: string
    profile: DisplayImageProfile
    signal?: AbortSignal
  },
  deps?: { fetch?: typeof fetch }
): Promise<{ bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' | 'image/webp' }>
```

On missing key / empty prompt / unsupported provider (if someone passes `claude`): throw `当前生图凭证不支持生图。` and do not call `fetch`.

OpenAI / compatible:

- URL: `${baseUrl.replace(/\/$/, '')}/images/generations`
- Default baseUrl: `https://api.openai.com/v1`
- Body: `{ model, prompt, n: 1, size: '1024x1024', response_format: 'b64_json' }`
- Header: `Authorization: Bearer ${apiKey}`
- Read `data[0].b64_json`. Mime `image/png`.

Gemini:

- URL: `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent`
- Default baseUrl: `https://generativelanguage.googleapis.com/v1beta`
- Query or header API key as `x-goog-api-key`
- Body: `{ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }`
- Read first `inlineData` / `inline_data` part. These request/response fields may be adjusted later **inside this file only**.

- [ ] **Step 1: Failing tests**

```ts
it('does not fetch when the profile is missing an api key', async () => {
  const fetchFn = vi.fn()
  await expect(
    generateDisplayImageCandidate(
      { prompt: '水手', profile: { provider: 'openai', apiKey: '', model: 'gpt-image-1' } },
      { fetch: fetchFn }
    )
  ).rejects.toThrow('当前生图凭证不支持生图。')
  expect(fetchFn).not.toHaveBeenCalled()
})

it('decodes OpenAI b64_json without writing files', async () => {
  const pngB64 = Buffer.from('png').toString('base64')
  const fetchFn = vi.fn(async () =>
    new Response(JSON.stringify({ data: [{ b64_json: pngB64 }] }), { status: 200 })
  )
  const result = await generateDisplayImageCandidate(
    { prompt: '水手', profile: { provider: 'openai', apiKey: 'sk-test', model: 'gpt-image-1' } },
    { fetch: fetchFn as unknown as typeof fetch }
  )
  expect(result.mime).toBe('image/png')
  expect(Buffer.from(result.bytes).toString()).toBe('png')
  expect(String(fetchFn.mock.calls[0]![0])).toContain('/images/generations')
})
```

Add one Gemini fixture that reads `inlineData`.

- [ ] **Step 2: Implement adapters + `displayImageProfile` on `QuillariumConfig`** (same encrypt helpers as `AIProfileConfig`). Do not put it on `ProjectConfig`.

- [ ] **Step 3: Run** `pnpm exec vitest run packages/ai/src/display-image-generate.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit** `feat: adapt OpenAI and Gemini display-image generation`

---

### Task 5: CLI `display add-image`

**Files:**

- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/index.test.ts`
- Modify: `docs/CLI.md`

**Interfaces:**

```text
quill display add-image --project <path> --card-id <id> --file <path>
```

- Missing `--file`: `请提供 --file。` non-zero, disk unchanged.
- `loadProject(root).display_layer?.enabled !== true`: `展示层已关闭，不能添加配图。`
- Card id not found in `listDocs`: `找不到这张设定卡。`
- Card type not in the display-card allowlist: `该卡片类型不能配图。`
- Success: `addDisplayImage(..., source: 'upload')` and log `display-image: <id> selected=<id>`

Read file bytes with `readFile`. Detect mime from extension + magic via core.

- [ ] **Step 1: Failing CLI test** next to the reset-display case: create world entry, write a png temp file, refuse without `--file`, then add and assert `assets/display/<id>/manifest.json` exists and card yaml has no `image`.

- [ ] **Step 2: Implement** a `display` command group (not under `project`).

- [ ] **Step 3: Run** `pnpm exec vitest run packages/cli/src/index.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit** `feat: add display images from the CLI`

---

### Task 6: Desktop IPC, credentials, and card UI

**Files:**

- Modify: `apps/desktop/electron/ipc/contract.ts` — add 6 channels; count **166 → 172**
- Modify: `apps/desktop/electron/ipc/contract.test.ts`
- Modify: `apps/desktop/electron/preload.ts`, `preload.cjs`
- Create: `apps/desktop/electron/ipc/display-images.ts`
- Modify: `apps/desktop/electron/ipc/index.ts`
- Modify: `apps/desktop/electron/ipc/project.ts` — after deleting a non-outline/scene doc, if `data.id` is a string, `await removeDisplayImagesForCard(projectRoot, id)`
- Modify: `apps/desktop/electron/ipc/credentials.ts` — get/set `displayImageProfile` with the same encrypt/mask as AI profiles
- Modify: `apps/desktop/src/features/planning/SettingCardMedia.tsx` — upload / gallery / gen preview
- Modify: `apps/desktop/src/features/settings/TopChrome.tsx` or existing credentials panel — fields for image provider/baseUrl/model/key
- Test: `apps/desktop/electron/ipc/contract.test.ts`

**Channels:**

```ts
'displayImage:list': { request: [root: string, cardId: string]; response: DisplayImageManifest }
'displayImage:choose': { request: [root: string, cardId: string, altText: string]; response: DisplayImageManifest | null }
'displayImage:remove': { request: [root: string, cardId: string, imageId: string]; response: DisplayImageManifest }
'displayImage:select': { request: [root: string, cardId: string, imageId: string]; response: DisplayImageManifest }
'displayImage:generate': { request: [root: string, cardId: string, prompt: string]; response: { candidate_id: string; data_url: string } }
'displayImage:confirmGenerate': { request: [root: string, cardId: string, candidate_id: string]; response: DisplayImageManifest }
```

`generate` keeps `{ bytes, mime }` in a process-local `Map` keyed by `candidate_id`. `confirmGenerate` calls `addDisplayImage(..., source: 'generated')` and deletes the map entry. Cancel = never call confirm. Map entries expire after 30 minutes or on generate of a new candidate for that card.

`choose` uses `dialog.showOpenDialog` (png/jpg/jpeg/webp) then `addDisplayImage(..., source: 'upload')`.

Before write: `loadProject(root).display_layer?.enabled === true` and `migrated === true`; else throw `展示层已关闭，不能添加配图。`

Default gen prompt helper (renderer): `${title}\n${content.slice(0, 400)}`.

UI only when existing `showDisplayCardChrome` is true. Pass selected image data URL into `SettingCardDesigner` (`imageDataUrl`) and `image_data_urls` into `renderSettingCardStyle`.

Do not call generate from `load()`, specialize, or the display-layer toggle.

- [ ] **Step 1: Add channels (test 166 → 172 RED then GREEN)**

- [ ] **Step 2: Handlers + in-memory candidates + credentials fields**

- [ ] **Step 3: SettingCardMediaPanel** — buttons 上传图片 / 生成配图 / 确认保存 / 取消; thumbnail strip; hide when chrome off.

- [ ] **Step 4: Run** `pnpm exec vitest run apps/desktop/electron/ipc/contract.test.ts apps/desktop/src/features/planning/SettingCardMedia.test.tsx`

Expected: PASS at 172. Update existing SettingCardMedia tests: upload button appears when chrome is on; still no write to card `image`.

- [ ] **Step 5: Commit** `feat: let authors upload and confirm generated display images`

---

### Task 7: DESIGN.md

**Files:**

- Modify: `docs/DESIGN.md` after the display_layer paragraph
- Modify: `docs/CLI.md` if Task 5 did not already (command map row)

- [ ] **Step 1:** 4–6 lines: images live in `assets/display/<card-id>/` with manifest; not on the card; upload + click-to-generate; OpenAI/compatible/Gemini via a separate profile; CSS-only `{{images}}` carousel; CCv3 unchanged.

- [ ] **Step 2: Commit** `docs: describe display image gallery and generation`

---

### Task 8: Full gate

- [ ] **Step 1:**

```bash
pnpm exec vitest run packages/core/src/display-images.test.ts packages/core/src/setting-card-styles.test.ts packages/ai/src/display-image-generate.test.ts packages/cli/src/index.test.ts apps/desktop/electron/ipc/contract.test.ts
```

Expected: PASS

- [ ] **Step 2:** `pnpm check`

Expected: tsc, Vitest, lint, format:check PASS.

If an unrelated file fails, stop. Do not start Agent fence.

---
