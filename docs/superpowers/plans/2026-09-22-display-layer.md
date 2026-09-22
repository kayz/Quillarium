# Display Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project-level optional card chrome: confirm-wipe old setting images, then render new HTML card faces from builtins/author templates (Agent candidates save only after confirm).

**Architecture:** `ProjectConfig.display_layer` `{ enabled, migrated }` is the only switch. Core `needsDisplayMigration` / `resetDisplayLayer` own detection and destructive cleanup. New card faces reuse existing `normalizeSettingCardTemplate` / `renderSettingCardHtml` but persist under `styles/display-cards/` and call Agent task `display-card-design`. CCv3 and project cover stay untouched.

**Tech Stack:** TypeScript, pnpm workspace, Vitest, Zod, existing Electron IPC, Commander CLI, existing setting-card sanitizer.

## Global Constraints

- Product spec: `docs/superpowers/specs/2026-09-22-display-layer-design.md` (approved).
- Parent spec: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`.
- Do not put the switch in `story_structure`.
- New writer projects: `enabled: false`, `migrated: true`.
- Empty `assets/settings/` does not count as old display. Non-empty files or a non-null card `image` does.
- Wipe order: write `enabled: true, migrated: true` first, then strip `image`, then delete `assets/settings/` files. If leftovers remain after `migrated: true`, retry wipe without asking.
- Do not write `migrated: true` on cancel or without CLI `--confirm`.
- Do not require new writing frontmatter. Do not upload or generate images this slice. `{{image}}` stays an empty slot.
- Do not read `styles/setting-cards/` for the new renderer. Do not delete that folder.
- Do not change CCv3 import/export or project cover.
- Do not start Agent expert-mode fence.
- Style: no semicolons, single quotes, Prettier 110.
- Tests: `pnpm exec vitest run <file>`.

## Later plans (out of scope here)

1. Display image upload / image-generation AI into `assets/display/`.
2. Agent expert-mode fence.

## File map

- Create: `packages/core/src/display-layer.ts` — config helpers, migration detection, reset
- Create: `packages/core/src/display-layer.test.ts`
- Modify: `packages/core/src/types.ts` — `DisplayLayerConfigV1` on `ProjectConfig`
- Modify: `packages/core/src/schema.ts` — optional `display_layer` object
- Modify: `packages/core/src/project.ts` — `ProjectConfigInput.display_layer`
- Modify: `packages/core/src/index.ts` — export display-layer
- Modify: `packages/core/src/setting-card-styles.ts` — `styles/display-cards` list/save; expand document types
- Modify: `packages/cli/src/index.ts` — `project reset-display --confirm`
- Modify: `packages/cli/src/index.test.ts`
- Modify: `packages/agent-runtime/src/tasks/setting-card-design.ts` and `executor.ts` — register `display-card-design` same handler
- Modify: `apps/desktop/electron/ipc/contract.ts` / `preload.ts` / `preload.cjs` / `contract.test.ts` — 163 → 166
- Modify: `apps/desktop/electron/ipc/project.ts` or new `display.ts` — handlers
- Modify: `apps/desktop/electron/ipc/setting-cards.ts` — design task id `display-card-design`; list from display-cards dir
- Modify: `apps/desktop/src/features/workspace/Workspace.tsx` — confirm dialog on load
- Modify: `apps/desktop/src/features/settings/TopChrome.tsx` — enabled toggle
- Modify: `apps/desktop/src/features/planning/SettingCardMedia.tsx` — chrome only when migrated && enabled; old thumbnail only when !migrated
- Modify: `docs/DESIGN.md` — display_layer paragraph
- Modify: `docs/CLI.md` — reset-display

Do not invent a second scene-style flag. Do not delete `styles/setting-cards/`.

---

### Task 1: Failing core tests for display_layer

**Files:**

- Create: `packages/core/src/display-layer.test.ts`
- Test: `packages/core/src/display-layer.test.ts`

**Interfaces:**

- Consumes: `createProjectAt`, `createWorldEntry`, `writeMarkdown`, `writeText`, `listDocs`, `pathExists`, `loadProject`
- Produces: contract Task 2 must satisfy — `WRITER_DEFAULT_DISPLAY_LAYER`, `needsDisplayMigration`, `resetDisplayLayer` from `./display-layer.js`

- [ ] **Step 1: Write the test file**

```ts
import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createWorldEntry, listDocs } from './documents.js'
import { pathExists, writeMarkdown, writeText } from './fs.js'
import {
  WRITER_DEFAULT_DISPLAY_LAYER,
  needsDisplayMigration,
  resetDisplayLayer
} from './display-layer.js'
import { createProjectAt, loadProject } from './project.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const sampleImage = {
  schema_version: 1 as const,
  original_path: 'assets/settings/world_entry/world-lin/original.png',
  thumbnail_path: 'assets/settings/world_entry/world-lin/thumb.png',
  mime_type: 'image/png' as const,
  sha256: 'a'.repeat(64),
  width: 8,
  height: 8,
  palette: ['#111111'],
  focus_x: 0.5,
  focus_y: 0.5,
  alt_text: '林舟'
}

async function fixture(id: string) {
  const root = path.join(os.tmpdir(), `quillarium-display-${id}-${Date.now()}`)
  roots.push(root)
  await createProjectAt(root, { id, title: id, display_layer: WRITER_DEFAULT_DISPLAY_LAYER })
  return root
}

describe('display layer reset', () => {
  it('does not treat a new writer project as needing migration', async () => {
    const root = await fixture('new-writer')
    expect(WRITER_DEFAULT_DISPLAY_LAYER).toEqual({ enabled: false, migrated: true })
    expect((await loadProject(root)).display_layer).toEqual({ enabled: false, migrated: true })
    expect(await needsDisplayMigration(root)).toBe(false)
  })

  it('detects leftover setting files when display_layer is absent', async () => {
    const root = path.join(os.tmpdir(), `quillarium-display-legacy-${Date.now()}`)
    roots.push(root)
    await createProjectAt(root, { id: 'legacy-art', title: '旧图' })
    const asset = path.join(root, 'assets', 'settings', 'world_entry', 'x.png')
    await mkdir(path.dirname(asset), { recursive: true })
    await writeText(asset, 'png')
    expect(await needsDisplayMigration(root)).toBe(true)
  })

  it('strips image and deletes setting assets after confirm', async () => {
    const root = await fixture('wipe-me')
    const file = await createWorldEntry(root, '林舟', { id: 'world-lin' }, '水手。')
    const current = await (await import('./fs.js')).readMarkdown<Record<string, unknown>>(file)
    await writeMarkdown(file, { ...current.data, image: sampleImage }, current.content)
    const asset = path.join(root, sampleImage.original_path)
    await mkdir(path.dirname(asset), { recursive: true })
    await writeText(asset, 'png')
    await resetDisplayLayer(root)
    expect(await needsDisplayMigration(root)).toBe(false)
    expect((await loadProject(root)).display_layer).toEqual({ enabled: true, migrated: true })
    expect((await listDocs(root, 'world_entry'))[0]?.data).not.toHaveProperty('image')
    expect(await pathExists(asset)).toBe(false)
  })

  it('still reports leftovers after migrated is true so reset can retry', async () => {
    const root = await fixture('retry')
    const asset = path.join(root, 'assets', 'settings', 'orphan.png')
    await mkdir(path.dirname(asset), { recursive: true })
    await writeText(asset, 'png')
    const { updateProjectConfig } = await import('./project.js')
    await updateProjectConfig(root, { display_layer: { enabled: true, migrated: true } })
    expect(await needsDisplayMigration(root)).toBe(true)
  })
})
```

Use `readMarkdown` from `./fs.js` at top instead of dynamic import if the compiler complains.

- [ ] **Step 2: Run it**

Run: `pnpm exec vitest run packages/core/src/display-layer.test.ts`

Expected: FAIL — `Cannot find module './display-layer.js'`

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/display-layer.test.ts
git commit -m "test: expect display layer migration to wipe setting images"
```

---

### Task 2: Implement needsDisplayMigration and resetDisplayLayer

**Files:**

- Create: `packages/core/src/display-layer.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/schema.ts`
- Modify: `packages/core/src/project.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/display-layer.test.ts`

**Interfaces:**

- Consumes: `listDocs`, `readMarkdown`, `writeMarkdown`, `pathExists`, `updateProjectConfig`, `loadProject`, `withProjectWriteLock`
- Produces:

```ts
export const WRITER_DEFAULT_DISPLAY_LAYER = Object.freeze({ enabled: false, migrated: true })
export function resolveDisplayLayer(config: ProjectConfig): { enabled: boolean; migrated: boolean }
export async function needsDisplayMigration(projectRoot: string): Promise<boolean>
export async function shouldPromptDisplayReset(projectRoot: string): Promise<boolean>
export async function resetDisplayLayer(projectRoot: string): Promise<ProjectConfig>
export async function setDisplayLayerEnabled(projectRoot: string, enabled: boolean): Promise<ProjectConfig>
```

- [ ] **Step 1: Types + schema**

In `types.ts` next to `StoryStructureConfigV1`:

```ts
export interface DisplayLayerConfigV1 {
  enabled: boolean
  migrated: boolean
}
```

Add `display_layer: DisplayLayerConfigV1` to `ProjectConfig` and optional `display_layer?: DisplayLayerConfigV1` on `ProjectConfigInput`.

In `schema.ts` both `projectConfigV1Schema` (omit — v1 has no field) and `projectConfigSchema`:

```ts
display_layer: z
  .object({
    enabled: z.boolean(),
    migrated: z.boolean()
  })
  .strict()
  .optional()
```

Do not default it in Zod (missing must stay missing so detection can run). `createProjectAt` writer calls pass `WRITER_DEFAULT_DISPLAY_LAYER` explicitly. After parse, `loadProject` may keep it optional on the raw object; `resolveDisplayLayer` treats missing as `{ enabled: false, migrated: true }` **only when** `needsDisplayMigration` is false. Easier: `needsDisplayMigration` ignores config first: if any leftover assets/images, return true unless we are mid-retry (`display_layer?.migrated === true` still returns true when leftovers exist so reset retries). If no leftovers and config missing, treat as `{ enabled: false, migrated: true }` in `resolveDisplayLayer`.

- [ ] **Step 2: Implement `display-layer.ts`**

```ts
import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { listDocs } from './documents.js'
import { pathExists, readMarkdown, writeMarkdown } from './fs.js'
import { loadProject, updateProjectConfig } from './project.js'
import { withProjectWriteLock } from './project-write-lock.js'
import type { DisplayLayerConfigV1, ProjectConfig } from './types.js'

export const WRITER_DEFAULT_DISPLAY_LAYER: DisplayLayerConfigV1 = Object.freeze({
  enabled: false,
  migrated: true
})

export function resolveDisplayLayer(config: ProjectConfig): DisplayLayerConfigV1 {
  return config.display_layer ?? { enabled: false, migrated: true }
}

async function leftoverSettingFiles(projectRoot: string): Promise<string[]> {
  const dir = path.join(projectRoot, 'assets', 'settings')
  if (!(await pathExists(dir))) return []
  const out: string[] = []
  async function walk(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else out.push(full)
    }
  }
  await walk(dir)
  return out
}

function imageIsSet(value: unknown): boolean {
  return value != null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
}

export async function needsDisplayMigration(projectRoot: string): Promise<boolean> {
  const leftovers = await leftoverSettingFiles(projectRoot)
  const cards = await listDocs(projectRoot)
  const imaged = cards.some((doc) => imageIsSet((doc.data as Record<string, unknown>).image))
  return leftovers.length > 0 || imaged
}

export async function shouldPromptDisplayReset(projectRoot: string): Promise<boolean> {
  if (!(await needsDisplayMigration(projectRoot))) return false
  return resolveDisplayLayer(await loadProject(projectRoot)).migrated !== true
}

export async function resetDisplayLayer(projectRoot: string): Promise<ProjectConfig> {
  return withProjectWriteLock(projectRoot, async () => {
    await updateProjectConfig(projectRoot, {
      display_layer: { enabled: true, migrated: true }
    })
    const docs = await listDocs(projectRoot)
    for (const doc of docs) {
      const data = doc.data as Record<string, unknown>
      if (!Object.hasOwn(data, 'image')) continue
      const { image: _dropped, ...rest } = data
      await writeMarkdown(doc.path, rest, doc.content)
    }
    const leftovers = await leftoverSettingFiles(projectRoot)
    for (const file of leftovers) await rm(file, { force: true })
    return loadProject(projectRoot)
  })
}

export async function setDisplayLayerEnabled(projectRoot: string, enabled: boolean): Promise<ProjectConfig> {
  const current = resolveDisplayLayer(await loadProject(projectRoot))
  return updateProjectConfig(projectRoot, {
    display_layer: { ...current, enabled }
  })
}
```

`updateProjectConfig` is already locked; nested lock is re-entrant.

If `ProjectConfig.display_layer` is required in the type, `loadProject` parse with optional schema means TypeScript optional. Keep `display_layer?: DisplayLayerConfigV1` on `ProjectConfig` so old YAML type-checks.

Export from `index.ts`: `export * from './display-layer.js'`

Pass `display_layer: WRITER_DEFAULT_DISPLAY_LAYER` from desktop `local-workspace.ts` and CLI `createProjectAt` / `init` next to `WRITER_DEFAULT_STORY_STRUCTURE`.

- [ ] **Step 3: Run core tests**

Run: `pnpm exec vitest run packages/core/src/display-layer.test.ts packages/core/src/factions-and-structure.test.ts`

Expected: PASS. If `projectConfigSchema.parse` drops unknown then `display_layer` must be in the schema (it is). If existing create-project tests fail because config gained a field, only writer create paths should pass the default.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/display-layer.ts packages/core/src/display-layer.test.ts packages/core/src/types.ts packages/core/src/schema.ts packages/core/src/project.ts packages/core/src/index.ts apps/desktop/electron/ipc/local-workspace.ts packages/cli/src/index.ts
git commit -m "feat: add project display_layer and setting-image reset"
```

---

### Task 3: CLI `project reset-display`

**Files:**

- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/index.test.ts`
- Modify: `docs/CLI.md`

**Interfaces:**

- Consumes: `needsDisplayMigration`, `resetDisplayLayer`
- Produces: `quill project reset-display --confirm --project <path>`

- [ ] **Step 1: Failing test** in `packages/cli/src/index.test.ts`

Seed a world entry with an asset file (same as Task 1). `run('project', 'reset-display', '--project', root)` must reject (missing `--confirm`) and leave the file. Then `run(..., '--confirm')` deletes it.

Error text: `未确认清盘。加上 --confirm 才会删除设定图。`

- [ ] **Step 2: Implement** next to `set-structure`:

```ts
projectOption(
  projectCmd
    .command('reset-display')
    .option('--confirm', 'Delete setting images and strip card image fields')
    .description('Wipe legacy setting-card display files after author confirm')
).action(async (opts) => {
  const root = path.resolve(opts.project)
  if (!opts.confirm) throw new Error('未确认清盘。加上 --confirm 才会删除设定图。')
  await resetDisplayLayer(root)
  console.log('display_layer: enabled=true migrated=true')
})
```

- [ ] **Step 3: Document** in `docs/CLI.md` near `project set-structure`.

- [ ] **Step 4: Run** `pnpm exec vitest run packages/cli/src/index.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/index.test.ts docs/CLI.md
git commit -m "feat: confirm display reset from the CLI"
```

---

### Task 4: Desktop inspect / reset / enabled IPC and dialog

**Files:**

- Modify: `apps/desktop/electron/ipc/contract.ts` (add 3 channels; count **163 → 166**)
- Modify: `apps/desktop/electron/ipc/contract.test.ts`
- Modify: `apps/desktop/electron/preload.ts`, `preload.cjs`
- Create: `apps/desktop/electron/ipc/display.ts` — `registerDisplayHandlers`
- Modify: the file that currently calls `registerPlanningHandlers` (likely `apps/desktop/electron/main.ts` or `ipc/index`) to also `registerDisplayHandlers()`
- Modify: `apps/desktop/src/features/workspace/Workspace.tsx`
- Modify: `apps/desktop/src/features/settings/TopChrome.tsx`
- Test: `apps/desktop/electron/ipc/contract.test.ts`

**Interfaces:**

- Consumes: `needsDisplayMigration`, `resetDisplayLayer`, `setDisplayLayerEnabled`, `resolveDisplayLayer`
- Produces:

```ts
'display:needsMigration': { request: [root: string]; response: boolean }
'display:reset': { request: [root: string]; response: ProjectConfig }
'display:setEnabled': { request: [root: string, enabled: boolean]; response: ProjectConfig }
```

QUILLARIUM_API_CHANNELS:

```ts
needsDisplayMigration: 'display:needsMigration'
resetDisplayLayer: 'display:reset'
setDisplayLayerEnabled: 'display:setEnabled'
```

- [ ] **Step 1: Add channels + handlers** mirroring `planning:specialize`. `display.ts`:

```ts
typedHandle('display:needsMigration', async (_event, root) => needsDisplayMigration(root))
typedHandle('display:reset', async (_event, root) => resetDisplayLayer(root))
typedHandle('display:setEnabled', async (_event, root, enabled) => setDisplayLayerEnabled(root, enabled))
```

- [ ] **Step 2: Workspace load**

After a successful `bridge.loadProject(root)` in `Workspace.tsx`:

1. If `await bridge.needsDisplayMigration(root)` and the loaded `display_layer?.migrated === true`, call `resetDisplayLayer` with no prompt (resume incomplete wipe).
2. Else if `await bridge.shouldPromptDisplayReset(root)` (or: needs migration and `migrated !== true`), `window.confirm` with:

中文：`将删除本项目 assets/settings 下的设定图，并从卡片去掉配图字段。此操作不能恢复。继续？`

English: `This deletes setting images under assets/settings and removes image fields from cards. It cannot be undone. Continue?`

OK → `await bridge.resetDisplayLayer(root)` then reload. Cancel → keep session, do not call reset.

- [ ] **Step 3: TopChrome toggle** next to scene_enabled, only meaningful when `resolveDisplayLayer` migrated (always true after new projects). Labels: `展示层` / `Display layer`. Calls `bridge.setDisplayLayerEnabled(root, checked)` then reload.

- [ ] **Step 4: Run** `pnpm exec vitest run apps/desktop/electron/ipc/contract.test.ts`

Expected: PASS at 166.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/ipc/contract.ts apps/desktop/electron/ipc/contract.test.ts apps/desktop/electron/preload.ts apps/desktop/electron/preload.cjs apps/desktop/electron/ipc/display.ts apps/desktop/src/features/workspace/Workspace.tsx apps/desktop/src/features/settings/TopChrome.tsx
git commit -m "feat: prompt to reset legacy display assets on project open"
```

If handlers are registered from a barrel file, add that file to `git add`.

---

### Task 5: Gate old thumbnails and old designer

**Files:**

- Modify: `apps/desktop/src/features/planning/SettingCardMedia.tsx`
- Modify: `apps/desktop/src/features/modules/ModuleView.tsx`
- Modify: `apps/desktop/src/features/outline/OutlineHome.tsx`
- Modify: `apps/desktop/src/features/outline/VolumeHome.tsx`
- Modify: `apps/desktop/src/features/planning/PlanningViews.tsx`
- Test: `apps/desktop/src/features/planning/SettingThumbnail.test.tsx` (keep faction fallback). Add a small test on a helper rather than mounting Workspace.

**Interfaces:**

- Consumes: `display_layer` from loaded project (pass `displayMigrated` / `displayEnabled` booleans from WorkspaceView)
- Produces: old `SettingThumbnail` from `getSettingImageBatch` only when `!displayMigrated`. `SettingCardMediaPanel` (HTML designer) only when `displayMigrated && displayEnabled`. Hide `chooseSettingImage` / upload controls this slice even when chrome is on (`{{image}}` stays empty).

- [ ] **Step 1: Helper** `apps/desktop/src/features/planning/display-chrome.ts`

```ts
export function showLegacySettingThumbnails(display: { enabled: boolean; migrated: boolean }) {
  return !display.migrated
}

export function showDisplayCardChrome(display: { enabled: boolean; migrated: boolean }) {
  return display.migrated && display.enabled
}
```

Test those two functions in `display-chrome.test.ts`.

- [ ] **Step 2: Thread `displayLayer` from WorkspaceView into ModuleView / OutlineHome / VolumeHome / PlanningViews.** When `showLegacySettingThumbnails` is false, do not call `getSettingImageBatch`. When `showDisplayCardChrome` is false, do not render `SettingCardMediaPanel`.

- [ ] **Step 3: Run**

`pnpm exec vitest run apps/desktop/src/features/planning/display-chrome.test.ts apps/desktop/src/features/planning/SettingThumbnail.test.tsx apps/desktop/src/features/modules/ModuleView.test.tsx`

Expected: PASS. Add displayLayer default `{ enabled: false, migrated: true }` to existing ModuleView tests.

- [ ] **Step 4: Commit** `feat: hide setting-card chrome unless display layer is on`

---

### Task 6: New card-face persistence and Agent task id

**Files:**

- Modify: `packages/core/src/setting-card-styles.ts` — add `DISPLAY_CARD_STYLE_ROOT = 'styles/display-cards'`; `listWorkspaceDisplayCardStyles` / `saveWorkspaceDisplayCardStyle` copy the existing list/save but use that root. Expand `settingCardDocumentTypeSchema` enum to the spec allowlist.
- Modify: `packages/core/src/setting-card-styles.test.ts` — one test that save+list round-trips under `styles/display-cards/` and does not create `styles/setting-cards/`.
- Modify: `packages/core/src/agent-tasks.ts` — add task id `display-card-design` (may clone the setting-card-design catalog row with new id).
- Modify: `packages/agent-runtime/src/executor.ts` — register the existing setting-card handler under id `display-card-design` as well.
- Modify: `apps/desktop/electron/ipc/setting-cards.ts` — `listSettingCardStyles` → display-cards list; `designSettingCard` `task_id: 'display-card-design'`.

**Interfaces:**

- Consumes: `normalizeSettingCardTemplate`, existing builtins
- Produces: workspace files under `styles/display-cards/`; Agent id `display-card-design`

Do **not** rewrite HTML sanitizer. Do **not** delete `listWorkspaceSettingCardStyles` (old tests / leftover files). Product list/save/design paths use the display-cards functions only.

Expand enum to:

```ts
export const settingCardDocumentTypeSchema = z.enum([
  'world_entry',
  'canon',
  'character',
  'character_relation',
  'location',
  'timeline_event',
  'faction',
  'faction_relation',
  'faction_membership',
  'foreshadowing',
  'narrative'
])
```

Update builtin `supported_types` arrays to include the new members or keep builtins on the original four and allow save on any enum member — prefer builtins listing all spec types so a canon card can pick a builtin.

Add a sanitizer test: `normalizeSettingCardTemplate` with `<script>` still throws (existing test). Add one save of a template containing `<script>` via `saveWorkspaceDisplayCardStyle` expects throw.

- [ ] **Step 1–4:** TDD the display-cards list/save test, implement, run `pnpm exec vitest run packages/core/src/setting-card-styles.test.ts packages/agent-runtime/src/tasks/setting-card-design.test.ts`, commit `feat: store display card styles beside the workspace`

If executor registration is a map keyed by task id, add:

```ts
handlers.set('display-card-design', settingCardDesignHandler)
```

using the existing handler export. If the file inlines a switch, add a `case 'display-card-design':` that falls through to the setting-card case.

---

### Task 7: DESIGN.md

**Files:**

- Modify: `docs/DESIGN.md` in `## 0.3.0 Setting Cards` after the world-book specialization paragraph

**Interfaces:** none

- [ ] **Step 1:** Add 4–6 wrapping lines: `display_layer` is a project module; new writer projects default off; opening a project with leftover setting images asks once then deletes `assets/settings/` and `image`; new HTML faces live in workspace `styles/display-cards` and Agent `display-card-design`; CCv3 unchanged.

- [ ] **Step 2: Commit** `docs: describe optional display layer reset`

---

### Task 8: Full gate

- [ ] **Step 1:**

```bash
pnpm exec vitest run packages/core/src/display-layer.test.ts packages/cli/src/index.test.ts apps/desktop/electron/ipc/contract.test.ts packages/core/src/setting-card-styles.test.ts
```

Expected: PASS

- [ ] **Step 2:** `pnpm check`

Expected: tsc, Vitest, lint, format:check PASS.

If an unrelated file fails, stop. Do not start image-upload or Agent fence.

---
