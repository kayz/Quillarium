# Timeline Manage Expert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one author-click expert task `manage-timeline` that proposes timeline_event creates/updates plus point placements and same-node display order on the current track, then writes only after `applyTimelineManage`.

**Architecture:** Core owns track loading, the event pool (on-track + fully unattached + this-round creates), Chinese pre-checks, and one locked apply that calls `createWorldEntry` → `specializePlanningCard` then existing `placeTimelineEvent` / `reorderTimelineEvents`. Runtime handler returns structured JSON through `executeExpertTask`. Desktop adds two IPC channels (183 → 185) and a confirm overlay on `TimelineChainView`. CLI evaluates only.

**Tech Stack:** TypeScript, pnpm workspace, Vitest, Zod, Electron IPC, Commander CLI, existing `executeExpertTask` / `createWorldEntry` / `specializePlanningCard` / `withProjectWriteLock` / `listTimelineCatalog` / `placeTimelineEvent` / `reorderTimelineEvents` / `createTimelineNode` / `createTimelineEventAtNode`.

## Global Constraints

- Product spec: `docs/superpowers/specs/2026-09-25-timeline-manage-expert-design.md` (approved).
- Fence: `docs/superpowers/specs/2026-09-22-agent-expert-fence-design.md`.
- Parent: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`.
- Expert task must not include `generate_candidate`. Do not route scene generation through the facade.
- Do not use `applyAssistantTurn`. Do not migrate conversational assistants.
- Creates: `createWorldEntry` then `specializePlanningCard(..., 'timeline_event')`.
- Updates: enabled `timeline_event` only; replace Markdown body; merge `date` / `duration` / `location` / `characters` / `flashback_reference`; never change `id` / `type`; never merge `placements` / `timeline_node` / `previous` / `next`; parse with `timelineEventSchema`.
- Scope: current `track_id` (virtual `main` counts). No new `timeline_node`, no node reorder, no interval `end_node_id`, no other-track add/move.
- Placement pool: already on this track, or fully unattached (`placements` empty and no `timeline_node`), or created earlier in the same apply.
- Same confirm may create then place (`create_proposal_id`).
- Exact errors: `没有选中时间轨道，不能整理时间线。` / `找不到时间轨道，不能整理时间线。` / `整理时间线的轨道与当前选中不一致。` / `找不到要更新的事件卡。` / `不能更新已禁用的设定卡。` (`DISABLED_UPDATE_CARD`) / `节点不在当前轨道上。` / `事件不在当前轨道整理范围内。` / `找不到时间线提案：${id}` / `提案尚未确认，不能写入。` (`UNCONFIRMED_EVAL`).
- Author click only. Do not run on save, node/event drag, track switch, or section switch.
- CLI evaluate-only. No `--apply`. Required `--track-id`.
- Style: no semicolons, single quotes, Prettier 110.
- Tests: `pnpm exec vitest run <file>`. Full gate `pnpm check`.
- IPC **183 → 185**: `expert:manageTimeline`, `expert:applyTimelineManage`.
- PowerShell: no bash `&&` / heredoc. Do not push unless asked.

## Later plans (out of scope here)

1. Migrating creator-assistant turns into `executeExpertTask`.
2. Creating `timeline_node` coordinates or interval placements from an expert.

## File map

- Modify: `packages/core/src/agent-tasks.ts` + `agent-tasks.test.ts`
- Create: `packages/core/src/timeline-manage.ts` + `timeline-manage.test.ts`
- Modify: `packages/core/src/index.ts` — export
- Create: `packages/agent-runtime/src/tasks/manage-timeline.ts`
- Modify: `packages/agent-runtime/src/executor.ts` — register handler
- Modify: `packages/agent-runtime/src/expert-facade.ts` + `expert-facade.test.ts`
- Modify: `apps/desktop/electron/ipc/contract.ts`, `contract.test.ts` (183 → 185), `preload.ts`, `preload.cjs`, `expert.ts`
- Modify: `apps/desktop/src/features/planning/PlanningViews.tsx` + `PlanningViews.test.tsx` — 整理时间线 button + overlay
- Modify: `apps/desktop/src/features/outline/OutlineHome.tsx` + `VolumeHome.tsx` — pass `saveBusy={busy}`
- Modify: `packages/cli/src/expert.ts` + `index.test.ts`
- Modify: `docs/DESIGN.md`, `docs/CLI.md`

Do not add an expert project flag. Do not add `--apply`. Do not change chain layout or drag handlers.

---

### Task 1: Register manage-timeline

**Files:**

- Modify: `packages/core/src/agent-tasks.test.ts`
- Modify: `packages/core/src/agent-tasks.ts` (`agentTaskIdSchema` + `definitions`)

**Interfaces:**

- Consumes: `listAgentTaskDefinitions`, `getAgentTaskDefinition`
- Produces: `manage-timeline` is `lane: 'expert'`, no `generate_candidate`, `allowed_result_types` includes `planning_proposal`, title `整理时间线`

- [ ] **Step 1: Write the failing assertions**

In `packages/core/src/agent-tasks.test.ts` add to the `toMatchObject` lanes object:

```ts
'manage-timeline': 'expert',
```

After the foreshadowing assertion add:

```ts
expect(getAgentTaskDefinition('manage-timeline')).toMatchObject({
  lane: 'expert',
  title: '整理时间线',
  capability_ceiling: expect.not.arrayContaining(['generate_candidate']),
  allowed_result_types: expect.arrayContaining(['planning_proposal'])
})
```

- [ ] **Step 2: Run**

`pnpm exec vitest run packages/core/src/agent-tasks.test.ts`

Expected: FAIL — unknown id.

- [ ] **Step 3: Add id and definition**

In `agentTaskIdSchema` add `'manage-timeline'` after `'manage-foreshadowing'`.

Append after the manage-foreshadowing definition object:

```ts
{
  schema_version: 1,
  id: 'manage-timeline',
  version: '1.0.0',
  title: '整理时间线',
  description: '针对当前选中轨道提案新建或整段替换时间事件，并挂到本轨已有节点、调整同节点顺序，确认后才写入。',
  input_schema_id: 'quillarium.agent.manage-timeline-input.v1',
  output_schema_id: 'quillarium.agent.manage-timeline-proposal.v1',
  context_scopes: ['current-target', 'timeline'],
  capability_ceiling: ['propose_planning_record'],
  allowed_result_types: ['planning_proposal'],
  lane: 'expert'
},
```

- [ ] **Step 4: Run**

`pnpm exec vitest run packages/core/src/agent-tasks.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add packages/core/src/agent-tasks.ts packages/core/src/agent-tasks.test.ts
git commit -m "feat: register timeline manage expert task"
```

---

### Task 2: applyTimelineManage with rollback

**Files:**

- Create: `packages/core/src/timeline-manage.test.ts`
- Create: `packages/core/src/timeline-manage.ts`
- Modify: `packages/core/src/index.ts` — `export * from './timeline-manage.js'`

**Interfaces:**

- Consumes: `createWorldEntry`, `specializePlanningCard`, `listDocs`, `listTimelineCatalog`, `placeTimelineEvent`, `reorderTimelineEvents`, `eventStartNode`, `nodeBelongsToTrack`, `UNCONFIRMED_EVAL`, `DISABLED_UPDATE_CARD`, `withProjectWriteLock`, `timelineEventSchema`, `sha256Text`, `createProjectAt`, `createTimelineNode`, `createTimelineEventAtNode`
- Produces:

```ts
export const NO_TRACK_SELECTION = '没有选中时间轨道，不能整理时间线。'
export const MISSING_TRACK = '找不到时间轨道，不能整理时间线。'
export const TRACK_MISMATCH = '整理时间线的轨道与当前选中不一致。'
export const MISSING_TIMELINE_EVENT_CARD = '找不到要更新的事件卡。'
export const NODE_NOT_ON_TRACK = '节点不在当前轨道上。'
export const EVENT_OUT_OF_SCOPE = '事件不在当前轨道整理范围内。'
export const MISSING_TIMELINE_PROPOSAL = (id: string) => `找不到时间线提案：${id}`

export async function loadTrackForTimelineManage(
  projectRoot: string,
  trackId: string
): Promise<{ id: string; title: string } | null>

export async function applyTimelineManage(
  projectRoot: string,
  proposals: TimelineManageProposalSet,
  decisions: {
    confirmed: boolean
    creates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
    updates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
    placements: string[]
    orders: string[]
  }
): Promise<{
  created_ids: string[]
  updated_ids: string[]
  placed_event_ids: string[]
  ordered_node_ids: string[]
}>
```

`TimelineManageProposalSet` matches the spec JSON (`eval_id`, `track_id`, `creates`, `updates`, `placements`, `orders`). A placement has `proposal_id`, `node_id`, and exactly one of `event_id` or `create_proposal_id`.

- [ ] **Step 1: Write failing tests**

Create `packages/core/src/timeline-manage.test.ts` with temp projects (`createProjectAt`), `createTimelineNode(root, 'Dawn', { id: 'node-dawn', year: 1, month: 1 })`, `createTimelineEventAtNode` for on-track events, and `createWorldEntry` + `specializePlanningCard(..., 'timeline_event', {})` for unattached events.

Cases (all `confirmed: true` except the first):

1. `confirmed: false` → `UNCONFIRMED_EVAL`; no new world/event files.
2. `track_id: '   '` → `NO_TRACK_SELECTION`.
3. `track_id: 'missing-track'` → `MISSING_TRACK`.
4. Create `{ title: 'Harbor arrival', content: 'Ships dock.' }` → specialized `timeline_event` exists; `world_entry` list empty of that card.
5. Create then placement `{ create_proposal_id: 'p-create', node_id: 'node-dawn' }` → `eventStartNode(event, 'main') === 'node-dawn'` and placement has no `end_node_id`.
6. Update enabled event body + `{ date: 'Year 2' }` → body replaced, `date` changed, `type` still `timeline_event`, existing placements unchanged when fields include `{ placements: [] }`.
7. Update `enabled: false` event → `DISABLED_UPDATE_CARD`; body unchanged.
8. Placement `event_id` whose only placement is `{ timeline_id: 'side', start_node_id: 'node-dawn', end_node_id: null, order: 0, narrative_order: 0, occurrence: 1 }` and `timeline_node: null` → `EVENT_OUT_OF_SCOPE`; no writes.
9. Placement `node_id: 'missing-node'` → `NODE_NOT_ON_TRACK`.
10. Project with no timeline nodes + create + placement to `node-dawn` → `NODE_NOT_ON_TRACK`; create rolled back (no event, no leftover world_entry).
11. Create+place then `orders` for `node-dawn` that omit the new id → throw (same-id helper from `reorderTimelineEvents` is fine) and rollback create+place.
12. Two placements, second illegal → first placement and any create rolled back.

Use `DEFAULT_TIMELINE_TRACK_ID` (`main`) as `track_id`. Import constants from `./index.js`.

- [ ] **Step 2: Run**

`pnpm exec vitest run packages/core/src/timeline-manage.test.ts`

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `packages/core/src/timeline-manage.ts`. Copy the lock/rollback skeleton from `packages/core/src/foreshadow-manage.ts` (`createdPaths`, `restorations`, restore-then-delete).

```ts
export async function loadTrackForTimelineManage(projectRoot: string, trackId: string) {
  if (!trackId.trim()) return null
  const catalog = await listTimelineCatalog(projectRoot)
  const found = catalog.tracks.find((item) => item.value.id === trackId)
  if (!found) return null
  return { id: found.value.id, title: found.value.title }
}
```

Apply order inside `withProjectWriteLock`:

1. If `!decisions.confirmed` throw `UNCONFIRMED_EVAL` before the lock.
2. `loadTrackForTimelineManage(projectRoot, proposals.track_id)` — empty → `NO_TRACK_SELECTION`; missing → `MISSING_TRACK`.
3. Creates: `createWorldEntry` then `specializePlanningCard(id, 'timeline_event', decision.fields ?? {})`; swap created path; map `proposal_id → new id`.
4. Updates: find enabled `timeline_event`; else `MISSING_TIMELINE_EVENT_CARD` / `DISABLED_UPDATE_CARD`; copy only `date|duration|location|characters|flashback_reference`; overlay non-empty proposal title; `timelineEventSchema.parse`; `writeMarkdown` body replace; snapshot before-image.
5. Placements: resolve event id from `event_id` or `create_proposal_id` (must be in the create map); pre-check node with `listDocs` + `nodeBelongsToTrack` → `NODE_NOT_ON_TRACK`; pre-check pool (`eventStartNode === track` or fully unattached or create-map id) → `EVENT_OUT_OF_SCOPE`; snapshot before-image; `placeTimelineEvent` with `end_node_id` omitted, `expected_hash` from `sha256Text(await readText(path))`, `mode: 'add'` if unattached or this-round create else `'move'` (already on this track).
6. Orders: node on track or `NODE_NOT_ON_TRACK`; `reorderTimelineEvents` `{ track_id, node_id, ordered_event_ids, expected_hashes, order_kind: 'display' }`. Snapshot before-images first.
7. Catch: rollback; rethrow the original error (Chinese pre-checks, not English `timeline-model` strings).

Export from `packages/core/src/index.ts`.

- [ ] **Step 4: Run**

`pnpm exec vitest run packages/core/src/timeline-manage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add packages/core/src/timeline-manage.ts packages/core/src/timeline-manage.test.ts packages/core/src/index.ts
git commit -m "feat: apply confirmed timeline-manage cards, placements, and order"
```

---

### Task 3: Facade pre-gates and runtime handler

**Files:**

- Modify: `packages/agent-runtime/src/expert-facade.test.ts`
- Modify: `packages/agent-runtime/src/expert-facade.ts`
- Create: `packages/agent-runtime/src/tasks/manage-timeline.ts`
- Modify: `packages/agent-runtime/src/executor.ts`

**Interfaces:**

- Consumes: `loadTrackForTimelineManage`, `NO_TRACK_SELECTION`, `MISSING_TRACK`, `executeExpertTask`, `listDocs`, `eventStartNode`, `nodeBelongsToTrack`, `isEnabledPlanningCard`
- Produces: facade throws those two errors before the provider; handler stamps `track_id` from input; `executeExpertTask({ task_id: 'manage-timeline', input: { track_id } })` returns `TimelineManageProposalSet`

- [ ] **Step 1: Facade tests**

Add a describe in `expert-facade.test.ts`:

```ts
it('refuses manage-timeline without a track id', async () => {
  const root = await fixture()
  const invokeProvider = vi.fn()
  await expect(
    executeExpertTask(
      { projectRoot: root, task_id: 'manage-timeline', input: { track_id: '   ' } },
      deps(invokeProvider)
    )
  ).rejects.toThrow(NO_TRACK_SELECTION)
  expect(invokeProvider).toHaveBeenCalledTimes(0)
})

it('refuses manage-timeline when the track is missing', async () => {
  const root = await fixture()
  const invokeProvider = vi.fn()
  await expect(
    executeExpertTask(
      { projectRoot: root, task_id: 'manage-timeline', input: { track_id: 'missing-track' } },
      deps(invokeProvider)
    )
  ).rejects.toThrow(MISSING_TRACK)
  expect(invokeProvider).toHaveBeenCalledTimes(0)
})

it('returns timeline proposals without writing event files and stamps track_id', async () => {
  const root = await fixture()
  const before = await listDocs(root, 'timeline_event')
  const invokeProvider = vi.fn(async () =>
    JSON.stringify({
      track_id: 'forged',
      creates: [],
      updates: [],
      placements: [],
      orders: []
    })
  )
  const outcome = await executeExpertTask(
    { projectRoot: root, task_id: 'manage-timeline', input: { track_id: 'main' } },
    { ...deps(invokeProvider), executionId: () => 'timeline-eval-1' }
  )
  if (outcome.status === 'failed') throw new Error(outcome.error.technical_detail)
  const result = outcome.result as TimelineManageProposalSet
  expect(result.eval_id).toBe('timeline-eval-1')
  expect(result.track_id).toBe('main')
  expect(await listDocs(root, 'timeline_event')).toHaveLength(before.length)
})
```

Import `NO_TRACK_SELECTION`, `MISSING_TRACK`, `TimelineManageProposalSet` from `@quillarium/core`.

- [ ] **Step 2: Run**

`pnpm exec vitest run packages/agent-runtime/src/expert-facade.test.ts`

Expected: FAIL — unregistered task / no pre-gate.

- [ ] **Step 3: Implement facade, handler, registration**

In `expert-facade.ts` after the analyze-relations gate:

```ts
if (request.task_id === 'manage-timeline') {
  const trackId = String(request.input.track_id ?? '')
  if (!trackId.trim()) throw new Error(NO_TRACK_SELECTION)
  const track = await loadTrackForTimelineManage(request.projectRoot, trackId)
  if (!track) throw new Error(MISSING_TRACK)
}
```

Extend the target ternary with:

```ts
: request.task_id === 'manage-timeline'
  ? { type: 'project', id: String(request.input.track_id ?? '') }
```

Create `packages/agent-runtime/src/tasks/manage-timeline.ts` by copying `manage-foreshadowing.ts` shape:

- Input schema `{ track_id: z.string().min(1) }.strict()`
- Model output: creates/updates/placements/orders max 64; placement has `node_id` plus optional `event_id` / `create_proposal_id` (aggregate requires exactly one); orders have `node_id` + `event_ids`
- Prepare: current track from `loadTrackForTimelineManage`; nodes on this track (`nodeBelongsToTrack`) with id/title/order; enabled events on this track (id/title/content/start node); fully unattached enabled events; omit other-track event bodies and chapter prose
- Aggregate: stamp `track_id` from preparation/input; ids `tl-create-N` / `tl-update-N` / `tl-place-N` / `tl-order-N` (0-based); `eval_id` from execution id
- `capability_ceiling: ['read_project', 'compile_context', 'invoke_model']` — no `produce_candidate`

Register in `executor.ts` next to `MANAGE_FORESHADOWING_DEFINITION` / `createManageForeshadowingHandler`.

- [ ] **Step 4: Run**

`pnpm exec vitest run packages/agent-runtime/src/expert-facade.test.ts packages/core/src/timeline-manage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add packages/agent-runtime/src/expert-facade.ts packages/agent-runtime/src/expert-facade.test.ts packages/agent-runtime/src/tasks/manage-timeline.ts packages/agent-runtime/src/executor.ts
git commit -m "feat: run timeline manage through the expert facade"
```

---

### Task 4: Desktop IPC 183→185 and confirm overlay

**Files:**

- Modify: `apps/desktop/electron/ipc/contract.ts`
- Modify: `apps/desktop/electron/ipc/contract.test.ts` — `183` → `185` in the four `expectUniqueCount` calls and the test title
- Modify: `apps/desktop/electron/preload.ts` + `preload.cjs`
- Modify: `apps/desktop/electron/ipc/expert.ts`
- Modify: `apps/desktop/src/features/planning/PlanningViews.tsx` + `PlanningViews.test.tsx`
- Modify: `apps/desktop/src/features/outline/OutlineHome.tsx` + `VolumeHome.tsx`

**Interfaces:**

- Consumes: `executeExpertTask` task `manage-timeline`; `applyTimelineManage`; `TimelineManageProposalSet`
- Produces: `window.quillarium.manageTimeline(root, trackId)` and `applyTimelineManage(root, proposals, decisions)`

- [ ] **Step 1: Contract + preload + expert.ts**

Add to `IpcContract`:

```ts
'expert:manageTimeline': {
  request: [root: string, trackId: string]
  response: TimelineManageProposalSet
}
'expert:applyTimelineManage': {
  request: [
    root: string,
    proposals: TimelineManageProposalSet,
    decisions: {
      confirmed: boolean
      creates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
      updates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
      placements: string[]
      orders: string[]
    }
  ]
  response: {
    created_ids: string[]
    updated_ids: string[]
    placed_event_ids: string[]
    ordered_node_ids: string[]
  }
}
```

Map in `QUILLARIUM_API_CHANNELS`:

```ts
manageTimeline: 'expert:manageTimeline',
applyTimelineManage: 'expert:applyTimelineManage'
```

Wire `preload.ts` / `preload.cjs` invoke the same way as `manageForeshadowing`.

In `expert.ts` copy `evaluateForeshadowManage`: `evaluateTimelineManage(root, trackId)` calls `executeExpertTask` with `{ track_id: trackId }`; apply handler calls `applyTimelineManage`.

Bump `contract.test.ts` 183 → 185.

- [ ] **Step 2: Overlay on TimelineChainView**

`TimelineChainView` already has internal `busy` for drag/mutations. Add optional `saveBusy?: boolean` (do not rename internal `busy`).

In the header toolbar next to 规则检查, when `projectRoot` is set, add:

```tsx
<button
  type="button"
  onClick={() => void manageTimeline()}
  disabled={!projectRoot || busy || saveBusy || organizeBusy}
  title={zh ? '整理时间线' : 'Organize timeline'}
>
  <Sparkles size={14} /> {zh ? '整理时间线' : 'Organize timeline'}
</button>
```

`manageTimeline` calls `window.quillarium.manageTimeline(projectRoot, effectiveTrackId)` with local `organizeBusy` / error / proposals state. Track tab clicks must only `setSelectedTrackId` — they must not evaluate.

Overlay: copy `.chapter-eval-panel` from the foreshadowing overlay in `OutlineHome.tsx` (creates, updates, placements, orders as checkbox rows). Close does not apply.

On confirm: if `effectiveTrackId !== analyzeProposals.track_id` set error to `TRACK_MISMATCH` and return without calling apply. Else `applyTimelineManage` with `confirmed: true` and selected proposal ids; then `onReloadProject` + reload catalog.

Pass `saveBusy={busy}` from `OutlineHome.tsx` (~852) and `VolumeHome.tsx` (~430).

- [ ] **Step 3: Tests**

In `PlanningViews.test.tsx` add:

```ts
it('shows organize timeline on the chain workbench', () => {
  const html = renderToStaticMarkup(
    <TimelineChainView
      items={[]}
      selectedTarget={null}
      onSelect={() => undefined}
      language="zh"
      projectRoot="C:/tmp/project"
    />
  )
  expect(html).toContain('整理时间线')
})

it('disables organize timeline while a card save is in flight', () => {
  const html = renderToStaticMarkup(
    <TimelineChainView
      items={[]}
      selectedTarget={null}
      onSelect={() => undefined}
      language="zh"
      projectRoot="C:/tmp/project"
      saveBusy
    />
  )
  expect(html).toMatch(/disabled[^>]*>[\s\S]*整理时间线|整理时间线[\s\S]*disabled/)
})
```

- [ ] **Step 4: Run**

`pnpm exec vitest run apps/desktop/electron/ipc/contract.test.ts apps/desktop/src/features/planning/PlanningViews.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add apps/desktop/electron/ipc/contract.ts apps/desktop/electron/ipc/contract.test.ts apps/desktop/electron/ipc/expert.ts apps/desktop/electron/preload.ts apps/desktop/electron/preload.cjs apps/desktop/src/features/planning/PlanningViews.tsx apps/desktop/src/features/planning/PlanningViews.test.tsx apps/desktop/src/features/outline/OutlineHome.tsx apps/desktop/src/features/outline/VolumeHome.tsx
git commit -m "feat: confirm timeline manage from the chain view"
```

---

### Task 5: CLI evaluate-only

**Files:**

- Modify: `packages/cli/src/expert.ts`
- Modify: `packages/cli/src/index.test.ts`

**Interfaces:**

- Consumes: `executeExpertTask` / `TimelineManageProposalSet`
- Produces: `quill expert manage-timeline --track-id` prints `timeline-manage: creates=<n> updates=<n> placements=<n> orders=<n>`

- [ ] **Step 1: Tests**

In the expert command inventory array add `'manage-timeline'` after `'manage-foreshadowing'`. Assert help contains `--track-id` and does not contain `--apply`.

Add:

```ts
it('refuses expert manage-timeline when the track is missing', async () => {
  const { root } = await initProject()
  await expect(
    run('expert', 'manage-timeline', '--track-id', 'missing-track', '--project', root)
  ).rejects.toThrow('找不到时间轨道，不能整理时间线。')
})

it('prints timeline-manage counts without writing event files', async () => {
  const { root } = await initProject()
  const before = await listDocs(root, 'timeline_event')
  const spy = vi.spyOn(agentRuntime, 'executeExpertTask').mockResolvedValue({
    status: 'completed',
    execution_id: 'timeline-manage-cli-1',
    task_id: 'manage-timeline',
    result: {
      eval_id: 'timeline-manage-cli-1',
      track_id: 'main',
      creates: [{ proposal_id: 'c1', title: '到港', content: '船靠岸。', fields: {} }],
      updates: [{ proposal_id: 'u1', card_id: 'ev-1', content: '更新', fields: {} }],
      placements: [{ proposal_id: 'p1', node_id: 'node-1', event_id: 'ev-1' }],
      orders: [{ proposal_id: 'o1', node_id: 'node-1', event_ids: ['ev-1'] }]
    },
    run_path: 'runs/timeline-manage-cli-1'
  })
  output = []
  await run('expert', 'manage-timeline', '--track-id', 'main', '--project', root)
  expect(output.at(-1)).toBe('timeline-manage: creates=1 updates=1 placements=1 orders=1')
  expect(await listDocs(root, 'timeline_event')).toHaveLength(before.length)
  expect(spy.mock.calls.at(-1)?.[0]).toMatchObject({
    task_id: 'manage-timeline',
    input: { track_id: 'main' }
  })
})
```

- [ ] **Step 2: Run**

`pnpm exec vitest run packages/cli/src/index.test.ts`

Expected: FAIL — command missing. If `AGENT_TASK_NOT_REGISTERED`, rebuild `@quillarium/agent-runtime` then re-run.

- [ ] **Step 3: Implement**

In `packages/cli/src/expert.ts` copy the analyze-relations command:

```ts
projectOption(
  expert
    .command('manage-timeline')
    .requiredOption('--track-id <id>', 'Timeline track id to organize')
    .description('Propose timeline event creates, updates, placements, and order without writing')
).action(async (options) => {
  const outcome = await agentRuntime.executeExpertTask({
    projectRoot: path.resolve(options.project),
    task_id: 'manage-timeline',
    input: { track_id: options.trackId }
  })
  if (outcome.status !== 'completed') {
    throwFailedExpert(outcome, '整理时间线失败：')
  }
  const result = outcome.result as TimelineManageProposalSet
  console.log(
    `timeline-manage: creates=${result.creates.length} updates=${result.updates.length} placements=${result.placements.length} orders=${result.orders.length}`
  )
})
```

Import `TimelineManageProposalSet`.

- [ ] **Step 4: Run**

`pnpm exec vitest run packages/cli/src/index.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add packages/cli/src/expert.ts packages/cli/src/index.test.ts
git commit -m "feat: evaluate timeline manage from the CLI"
```

---

### Task 6: Docs and full gate

**Files:**

- Modify: `docs/DESIGN.md` (expert paragraph after the foreshadowing sentence)
- Modify: `docs/CLI.md` (expert subsection + command table `expert` row ~506)
- Format/lint as needed

- [ ] **Step 1: DESIGN.md**

After the manage-foreshadowing sentence, add that `manage-timeline` is author-click from the timeline chain for the current track (event creates/updates, point placements on existing nodes, same-node display order, confirm `applyTimelineManage`). CLI `quill expert manage-timeline` is evaluate-only. Do not claim node creation or interval placements.

- [ ] **Step 2: CLI.md**

Add a subsection after relation/foreshadowing:

```bash
pnpm cli expert manage-timeline --track-id <track-id> --project "./writing-workspace/projects/my-novel"
```

Missing track: `找不到时间轨道，不能整理时间线。` Empty selection is a desktop-only message. Update the expert row in the command table to include `manage-timeline`.

- [ ] **Step 3: Full gate**

`pnpm check`

Expected: build ok, all tests pass, lint 0 errors, format clean. If format:check fails, `pnpm exec prettier --write` on the listed files and commit that separately.

- [ ] **Step 4: Commit**

```
git commit -m "docs: describe timeline manage expert task"
```

If format needed: `git commit -m "fix: format timeline manage expert files"`
