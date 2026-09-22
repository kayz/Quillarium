# Organize Outline and World-book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two author-click expert tasks — `organize-outline` creates empty child outline nodes in the selected subtree; `organize-worldbook` proposes new or replacement `world_entry` cards — both unconfirmed until apply.

**Architecture:** Core owns subtree loaders and fail-closed apply. Runtime handlers return structured proposal JSON through `executeExpertTask`. Desktop adds four IPC channels (174 → 178). CLI evaluates only. The conversational `organize-setting` assistant stays unchanged.

**Tech Stack:** TypeScript, pnpm workspace, Vitest, Zod, existing Electron IPC, Commander CLI, existing `executeExpertTask` / `createOutline` / `createWorldEntry` / `specializePlanningCard` / `withProjectWriteLock`.

## Global Constraints

- Product spec: `docs/superpowers/specs/2026-09-22-organize-outline-worldbook-design.md` (approved).
- Fence spec: `docs/superpowers/specs/2026-09-22-agent-expert-fence-design.md`.
- Parent spec: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`.
- Expert tasks must not include `generate_candidate`. Do not route scene generation through the facade.
- Outline organize: create child nodes only; empty `content`; no rewrite/delete/reorder; stop at chapter; never create `section`/`scene`.
- World organize: enabled `world_entry` only; creates plus full-body updates; specialize on confirm; whole-transaction rollback including before-images.
- Exact errors: `没有选中大纲节点，不能整理。` / `当前选中的是章，不能再创建下级。` / `整理大纲不能创建节。` / `大纲节点不在整理选区内。` / `只能整理已启用的世界书。` / `提案尚未确认，不能写入。` (reuse `UNCONFIRMED_EVAL`).
- Author click only. Do not run on save, section switch, tree navigation, or scene-module toggle.
- Do not migrate `organize-setting`. Do not change chapter eval, finalization, display, or CCv3.
- Style: no semicolons, single quotes, Prettier 110.
- Tests: `pnpm exec vitest run <file>`. Full gate `pnpm check`.
- IPC **174 → 178** with `expert:organizeOutline`, `expert:applyOutlineOrganize`, `expert:organizeWorldbook`, `expert:applyWorldOrganize`.
- PowerShell: no bash `&&` / heredoc. Do not push unless asked.

## Later plans (out of scope here)

1. Relationship and foreshadowing expert tasks.
2. Routing the conversational setting-organizer assistant through the same confirm pipeline.
3. Migrating remaining legacy AI flows into runtime.

## File map

- Modify: `packages/core/src/agent-tasks.ts` — add two ids + V1 definitions
- Modify: `packages/core/src/agent-tasks.test.ts`
- Create: `packages/core/src/outline-organize.ts` + `outline-organize.test.ts`
- Create: `packages/core/src/world-organize.ts` + `world-organize.test.ts`
- Modify: `packages/core/src/index.ts` — export
- Create: `packages/agent-runtime/src/tasks/organize-outline.ts`
- Create: `packages/agent-runtime/src/tasks/organize-worldbook.ts`
- Modify: `packages/agent-runtime/src/executor.ts` — register both handlers
- Modify: `packages/agent-runtime/src/expert-facade.ts` + `expert-facade.test.ts` — pre-gates
- Modify: `packages/agent-runtime/src/index.ts` if new exports are needed
- Modify: `apps/desktop/electron/ipc/contract.ts` / `contract.test.ts` / `preload.ts` / `preload.cjs`
- Modify: `apps/desktop/electron/ipc/expert.ts` or create `organize.ts` registered from `ipc/index.ts`
- Modify: `apps/desktop/src/features/workspace/WorkspaceView.tsx` (or the story-tree chrome that already has `selectedOutline`) — `整理大纲`
- Modify: `apps/desktop/src/features/outline/OutlineHome.tsx` + `OutlineHome.test.tsx` — `整理世界书`
- Modify: `packages/cli/src/expert.ts` + `index.test.ts` + `docs/CLI.md`
- Modify: `docs/DESIGN.md`

Do not add an expert project flag. Do not add `--apply` CLI flags.

---

### Task 1: Failing tests for the two new expert tasks

**Files:**

- Modify: `packages/core/src/agent-tasks.test.ts`

**Interfaces:**

- Consumes: `listAgentTaskDefinitions`, `getAgentTaskDefinition`
- Produces: contract for Task 2 — `organize-outline` and `organize-worldbook` are expert, no `generate_candidate`, allowed `planning_proposal`

- [ ] **Step 1: Extend the lane test**

In the existing `toMatchObject` lanes object add:

```ts
'organize-outline': 'expert',
'organize-worldbook': 'expert',
```

Keep `organize-setting`: `'expert'`. After the rehearsal assertions, add:

```ts
expect(getAgentTaskDefinition('organize-outline')).toMatchObject({
  lane: 'expert',
  capability_ceiling: expect.not.arrayContaining(['generate_candidate']),
  allowed_result_types: expect.arrayContaining(['planning_proposal'])
})
expect(getAgentTaskDefinition('organize-worldbook')).toMatchObject({
  lane: 'expert',
  capability_ceiling: expect.not.arrayContaining(['generate_candidate']),
  allowed_result_types: expect.arrayContaining(['planning_proposal'])
})
```

- [ ] **Step 2: Run**

`pnpm exec vitest run packages/core/src/agent-tasks.test.ts`

Expected: FAIL — unknown ids or missing lanes.

- [ ] **Step 3: Commit**

`test: expect outline and world-book organize expert tasks`

---

### Task 2: Register the two V1 task definitions

**Files:**

- Modify: `packages/core/src/agent-tasks.ts` — `agentTaskIdSchema` enum + `BUILTIN_AGENT_TASKS`

**Interfaces:**

- Consumes: Task 1 expectations
- Produces: `getAgentTaskDefinition('organize-outline' | 'organize-worldbook')` with `lane: 'expert'`

Add both ids to `agentTaskIdSchema`. Insert two V1 definitions with `capability_ceiling: ['propose_planning_record']` (V1 ops are only `agentOperationSchema`; do not add `generate_candidate`). `allowed_result_types: ['planning_proposal']`. `context_scopes`: outline `['current-target']`; world-book `['project']`. V2 handler ceilings (Task 5) are `['read_project', 'compile_context', 'invoke_model']` with `allowed_result_types: ['proposal']`.

Do not change `organize-setting`.

- [ ] **Step 1: Implement definitions**

- [ ] **Step 2: Run**

`pnpm exec vitest run packages/core/src/agent-tasks.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

`feat: register outline and world-book organize as expert tasks`

---

### Task 3: Outline subtree gate + create-only apply

**Files:**

- Create: `packages/core/src/outline-organize.ts`
- Create: `packages/core/src/outline-organize.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

```ts
export const NO_OUTLINE_SELECTION = '没有选中大纲节点，不能整理。'
export const CHAPTER_IS_LEAF = '当前选中的是章，不能再创建下级。'
export const NO_SCENE_NODES = '整理大纲不能创建节。'
export const OUTLINE_OUTSIDE_SELECTION = '大纲节点不在整理选区内。'

export async function loadOutlineSubtreeForOrganize(
  projectRoot: string,
  outlineId: string
): Promise<{
  root: { id: string; level: string; title: string }
  member_ids: string[]
  members: Array<{ path: string; data: { id: string; level: string; parent: string | null; title: string }; content: string }>
} | null>

export interface OutlineOrganizeProposalSet {
  eval_id: string
  outline_id: string
  creates: Array<{
    proposal_id: string
    title: string
    level: 'volume' | 'part' | 'act' | 'chapter'
    parent_id: string
  }>
}

export async function applyOutlineOrganize(
  projectRoot: string,
  proposals: OutlineOrganizeProposalSet,
  decisions: { confirmed: boolean; creates: string[] }
): Promise<{ outline_ids: string[] }>
```

`loadOutlineSubtreeForOrganize`: `listDocs` outline; find `outlineId`; if missing return null. Walk children via `parent` (exclude `level === 'section'`). `member_ids` includes the root.

`applyOutlineOrganize`: if `!confirmed` throw `UNCONFIRMED_EVAL` from `chapter-eval.ts`. For each selected create: reject `section`/`scene` with `NO_SCENE_NODES`; reject parent not in `member_ids` computed from `proposals.outline_id` via loader (re-load live tree) with `OUTLINE_OUTSIDE_SELECTION`; then `createOutline(..., '')`. Track created paths; on throw delete them. Use `withProjectWriteLock`.

Fixture: same outline chain as `chapter-eval.test.ts` (`overview/book/volume/part/chapter`).

Tests:

1. Missing id → loader null.
2. Chapter root loads but apply/eval callers will treat as leaf (loader still returns the chapter; do not throw here — facade throws `CHAPTER_IS_LEAF`).
3. Unconfirmed apply throws `UNCONFIRMED_EVAL`, no new files.
4. Confirmed create under volume → new part or chapter (whatever is legal for the fixture structure) with empty content.
5. `level` that normalizes to section / pass `section` in a cast test if the TS union forbids it: add a runtime check on `String(level)` for `section` and `scene`.
6. parent_id of a node outside the subtree → `OUTLINE_OUTSIDE_SELECTION`, no files.

- [ ] **Step 1: RED tests**

`pnpm exec vitest run packages/core/src/outline-organize.test.ts`

Expected: FAIL cannot find module.

- [ ] **Step 2: Implement + GREEN**

- [ ] **Step 3: Commit**

`feat: apply confirmed outline-organize creates without writing on cancel`

---

### Task 4: World-book create/update apply with rollback

**Files:**

- Create: `packages/core/src/world-organize.ts`
- Create: `packages/core/src/world-organize.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

```ts
export const WORLD_ENTRY_ONLY = '只能整理已启用的世界书。'

export interface WorldOrganizeProposalSet {
  eval_id: string
  creates: Array<{ proposal_id: string; title: string; content: string }>
  updates: Array<{ proposal_id: string; card_id: string; content: string }>
}

export async function applyWorldOrganize(
  projectRoot: string,
  proposals: WorldOrganizeProposalSet,
  decisions: {
    confirmed: boolean
    creates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
    updates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
  }
): Promise<{ created_ids: string[]; updated_ids: string[] }>
```

Reuse `UNCONFIRMED_EVAL`. Creates: copy the chapter-eval setting loop (`createWorldEntry` then optional `specializePlanningCard`). Updates: load card; if not enabled `world_entry` throw `WORLD_ENTRY_ONLY`; save `originalRaw`; `writeMarkdown` with same data + new content; optional specialize. Track created paths **and** `{ path, before }` restorations. On throw: restore befores, then `rm` created paths (including specialized dests). Mirror `chapter-eval.ts` path tracking for specialize success (`rm` source, keep dest on the created list if it is new — for in-place specialize of an existing card the dest may replace the same id at a new path; restore must delete dest and write back originalRaw to the original path).

Tests:

1. Unconfirmed → throw, disk unchanged.
2. Create one world_entry.
3. Update one enabled world_entry body to the exact proposal string.
4. Update a `character` or `enabled: false` world_entry → `WORLD_ENTRY_ONLY`.
5. Confirmed create + `character_relation` empty fields → `特化缺少必填字段：`; no leftover issue-equivalent: no new world file; existing card body unchanged.

- [ ] **Step 1: RED then GREEN**

`pnpm exec vitest run packages/core/src/world-organize.test.ts`

- [ ] **Step 2: Commit**

`feat: apply confirmed world-book organize creates and replacements`

---

### Task 5: Runtime handlers + facade pre-gates

**Files:**

- Create: `packages/agent-runtime/src/tasks/organize-outline.ts`
- Create: `packages/agent-runtime/src/tasks/organize-worldbook.ts`
- Modify: `packages/agent-runtime/src/executor.ts`
- Modify: `packages/agent-runtime/src/expert-facade.ts`
- Modify: `packages/agent-runtime/src/expert-facade.test.ts`

**Interfaces:**

Handlers follow `continuity-check.ts`: V2 definition, zod input/output, `prepare` injects JSON of subtree / enabled world entries as a required prompt block, `aggregate` maps model output to `OutlineOrganizeProposalSet` / `WorldOrganizeProposalSet` with `eval_id` (uuid) and default empty arrays. `result_disposition: 'proposal'`. No project writes.

Facade additions after the continuity-check gate:

```ts
if (request.task_id === 'organize-outline') {
  const outlineId = String(request.input.outline_id ?? '')
  const subtree = await loadOutlineSubtreeForOrganize(request.projectRoot, outlineId)
  if (!subtree) throw new Error(NO_OUTLINE_SELECTION)
  if (subtree.root.level === 'chapter') throw new Error(CHAPTER_IS_LEAF)
}
```

Target for executeAgentTask: `{ type: 'outline', id: outlineId }` for outline; `{ type: 'project', id: 'project' }` for worldbook.

Register both handlers in `runtimeRegistry` like continuity-check.

Tests in `expert-facade.test.ts`:

1. `organize-outline` without a node: throws `没有选中大纲节点，不能整理。`, `invokeProvider` 0 times.
2. `organize-outline` on chapter id: throws `当前选中的是章，不能再创建下级。`, 0 provider calls.
3. `organize-worldbook` with a mocked provider returning `{ creates: [], updates: [] }`: status completed, `listDocs` world_entry count unchanged.
4. `organize-outline` with mocked provider on a volume: completed, no new outline files.

Rebuild `@quillarium/core` dist if the worktree's runtime tests import stale types (`pnpm --filter @quillarium/core build` then re-run). Do not commit `dist/`.

- [ ] **Step 1: RED** — `organize-outline` is `AGENT_TASK_NOT_REGISTERED` or missing export.

- [ ] **Step 2: GREEN**

`pnpm exec vitest run packages/agent-runtime/src/expert-facade.test.ts`

- [ ] **Step 3: Commit**

`feat: evaluate outline and world-book organize without writing`

---

### Task 6: Desktop IPC 174 → 178 and the two buttons

**Files:**

- Modify: `apps/desktop/electron/ipc/contract.ts`, `contract.test.ts`, `preload.ts`, `preload.cjs`, `index.ts`
- Modify or create: `apps/desktop/electron/ipc/expert.ts` (add four `typedHandle`s) — keep in `expert.ts` unless it is already large; then `organize.ts`
- Modify: `apps/desktop/src/features/workspace/WorkspaceView.tsx` (story-tree chrome with `selectedOutline`)
- Modify: `apps/desktop/src/features/outline/OutlineHome.tsx` + `OutlineHome.test.tsx`
- Overlay CSS: reuse `.chapter-eval-panel` classes or clone as `.organize-eval-panel` with the same absolute overlay + footer confirm + always-visible close from the expert-fence fix. Do not clip 确认写入.

**Channels:**

```ts
'expert:organizeOutline': { request: [root: string, outlineId: string]; response: OutlineOrganizeProposalSet }
'expert:applyOutlineOrganize': {
  request: [root: string, proposals: OutlineOrganizeProposalSet, decisions: { confirmed: boolean; creates: string[] }]
  response: { outline_ids: string[] }
}
'expert:organizeWorldbook': { request: [root: string]; response: WorldOrganizeProposalSet }
'expert:applyWorldOrganize': {
  request: [
    root: string,
    proposals: WorldOrganizeProposalSet,
    decisions: {
      confirmed: boolean
      creates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
      updates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
    }
  ]
  response: { created_ids: string[]; updated_ids: string[] }
}
```

Evaluate handlers: `executeExpertTask` then `outcome.result` (same failed-outcome mapping as `evaluateChapterProse`). Apply handlers: core apply functions.

UI:

- `整理大纲` / `Organize outline` only when `selectedOutline` exists and `selectedOutline.data.level !== 'chapter'`.
- `整理世界书` / `Organize world book` when `activeSection === 'world'` in OutlineHome (list may be empty).
- Confirm overlays: outline = checkboxes of `title (level)`; world = checkboxes + type select / required fields like chapter-eval settings, for both creates and updates.
- Close always dismisses without apply.

Static tests: OutlineHome world section contains `整理世界书`; a non-world section does not. If WorkspaceView markup tests are too heavy, add a tiny helper `shouldShowOrganizeOutline(level: string | undefined): boolean` in the same file as the button and unit-test it (true for `volume`/`part`/`act`/`book`/`overview`, false for `chapter` and `undefined`).

- [ ] **Step 1: RED channel count 178**

`pnpm exec vitest run apps/desktop/electron/ipc/contract.test.ts`

Expected: FAIL still 174.

- [ ] **Step 2: Handlers + UI GREEN**

`pnpm exec vitest run apps/desktop/electron/ipc/contract.test.ts apps/desktop/src/features/outline/OutlineHome.test.tsx`

- [ ] **Step 3: Commit**

`feat: let authors organize outline children and world-book cards from the expert facade`

---

### Task 7: CLI evaluate-only commands

**Files:**

- Modify: `packages/cli/src/expert.ts`
- Modify: `packages/cli/src/index.test.ts`
- Modify: `docs/CLI.md` — usage + command-map row

**Commands:**

```text
quill expert organize-outline --project <path> --outline-id <id>
quill expert organize-worldbook --project <path>
```

No apply / generate subcommands. Success prints exactly:

```text
outline-organize: creates=<n>
world-organize: creates=<n> updates=<n>
```

Missing outline: throw `没有选中大纲节点，不能整理。`. Chapter id: throw `当前选中的是章，不能再创建下级。`.

Tests: real temp project for the two refuse cases; spy `executeExpertTask` for the success one-liners and assert no new outline/world files. Do not break `evaluate-chapter` or `agent check-planning`.

- [ ] **Step 1: RED unknown command**

- [ ] **Step 2: GREEN**

`pnpm exec vitest run packages/cli/src/index.test.ts`

- [ ] **Step 3: Commit**

`feat: organize outline and world-book from the CLI without applying`

---

### Task 8: DESIGN.md

**Files:**

- Modify: `docs/DESIGN.md` after the expert-mode paragraph (~lines 43–52)
- Modify: `docs/CLI.md` only if Task 7 missed the command-map row

Insert 4–8 wrapped lines: two click-to-run expert tasks; outline creates empty child nodes in the selection and never writes synopses or scenes; world-book creates/replaces enabled `world_entry` with confirm-time specialize; conversational setting organizer unchanged; CLI evaluate-only.

- [ ] **Step 1: Edit**

- [ ] **Step 2: Commit**

`docs: describe outline and world-book organize expert tasks`

---

### Task 9: Full gate

- [ ] **Step 1:**

```
pnpm exec vitest run packages/core/src/agent-tasks.test.ts packages/core/src/outline-organize.test.ts packages/core/src/world-organize.test.ts packages/agent-runtime/src/expert-facade.test.ts packages/cli/src/index.test.ts apps/desktop/electron/ipc/contract.test.ts apps/desktop/src/features/outline/OutlineHome.test.tsx
```

Expected: PASS

- [ ] **Step 2:** `pnpm check`

Expected: tsc, Vitest, lint, format:check PASS.

If an unrelated file fails, stop. Do not start relationship/foreshadowing experts.

---
