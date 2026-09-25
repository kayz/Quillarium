# Relation and Foreshadowing Experts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two author-click expert tasks — `analyze-relations` proposes new or replacement relation/membership cards for the current character; `manage-foreshadowing` proposes new or replacement foreshadowing cards plus plant/resolve array patches on already-linked outline/scene docs — both unconfirmed until apply.

**Architecture:** Core owns character loaders, involvement checks, and fail-closed apply. Runtime handlers return structured proposal JSON through `executeExpertTask`. Desktop adds four IPC channels (179 → 183). CLI evaluates only. Assistant turns, chapter eval, and outline/world organize stay unchanged.

**Tech Stack:** TypeScript, pnpm workspace, Vitest, Zod, Electron IPC, Commander CLI, existing `executeExpertTask` / `createWorldEntry` / `specializePlanningCard` / `withProjectWriteLock` / `createCharacter` / `createCharacterRelation` / `createFaction` / `createFactionMembership` / `createFactionRelation` / `createForeshadowing` / `createOutline`.

## Global Constraints

- Product spec: `docs/superpowers/specs/2026-09-25-relation-foreshadow-experts-design.md` (approved).
- Fence: `docs/superpowers/specs/2026-09-22-agent-expert-fence-design.md`.
- Organize: `docs/superpowers/specs/2026-09-22-organize-outline-worldbook-design.md`.
- Parent: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`.
- Expert tasks must not include `generate_candidate`. Do not route scene generation through the facade.
- Do not use `applyAssistantTurn`. Do not migrate conversational assistants.
- Creates: `createWorldEntry` then `specializePlanningCard`. Updates: enabled typed cards only; replace Markdown body; merge allowed fields; never change `id` or `type`.
- Relation scope: current character. Types: `character_relation` | `faction_relation` | `faction_membership`.
- Foreshadowing bindings: only `foreshadowing_planted` / `foreshadowing_resolved`; document must already list the id in `related_foreshadowing` / planted / resolved; never bind a create from this same round.
- Exact errors: `没有选中人物，不能分析关系。` / `找不到人物，不能分析关系。` / `分析关系的人物与当前选中不一致。` / `找不到要更新的关系卡。` / `找不到要更新的伏笔卡。` / `不能更新已禁用的设定卡。` (`DISABLED_UPDATE_CARD` from `assistant-turn-apply.ts`) / `伏笔尚未被该节点引用，不能改埋设或回收。` / `找不到关系提案：{id}` / `找不到伏笔提案：{id}` / `提案尚未确认，不能写入。` (`UNCONFIRMED_EVAL`).
- Author click only. Do not run on save, graph drag, time-slider, section switch, or scene-module toggle.
- CLI evaluate-only. No `--apply`.
- Style: no semicolons, single quotes, Prettier 110.
- Tests: `pnpm exec vitest run <file>`. Full gate `pnpm check`.
- IPC **179 → 183**: `expert:analyzeRelations`, `expert:applyRelationAnalyze`, `expert:manageForeshadowing`, `expert:applyForeshadowManage`.
- PowerShell: no bash `&&` / heredoc. Do not push unless asked.

## Later plans (out of scope here)

1. Migrating creator-assistant turns into `executeExpertTask`.
2. Timeline or other type-management expert tasks.

## File map

- Modify: `packages/core/src/agent-tasks.ts` + `agent-tasks.test.ts`
- Create: `packages/core/src/relation-analyze.ts` + `relation-analyze.test.ts`
- Create: `packages/core/src/foreshadow-manage.ts` + `foreshadow-manage.test.ts`
- Modify: `packages/core/src/index.ts` — export both modules
- Create: `packages/agent-runtime/src/tasks/analyze-relations.ts`
- Create: `packages/agent-runtime/src/tasks/manage-foreshadowing.ts`
- Modify: `packages/agent-runtime/src/executor.ts` — register handlers
- Modify: `packages/agent-runtime/src/expert-facade.ts` + `expert-facade.test.ts`
- Modify: `apps/desktop/electron/ipc/contract.ts`, `contract.test.ts` (179 → 183), `preload.ts`, `preload.cjs`, `expert.ts`
- Modify: `apps/desktop/src/features/planning/PlanningViews.tsx` — 分析关系 button + overlay
- Modify: `apps/desktop/src/features/outline/OutlineHome.tsx` + `OutlineHome.test.tsx` — 管理伏笔
- Modify: `packages/cli/src/expert.ts` + `index.test.ts`
- Modify: `docs/DESIGN.md`, `docs/CLI.md`

Do not add an expert project flag. Do not add `--apply` CLI flags. Do not change graph layout.

---

### Task 1: Register the two expert task ids

**Files:**

- Modify: `packages/core/src/agent-tasks.test.ts`
- Modify: `packages/core/src/agent-tasks.ts` (`agentTaskIdSchema` + `definitions`)

**Interfaces:**

- Consumes: `listAgentTaskDefinitions`, `getAgentTaskDefinition`
- Produces: `analyze-relations` and `manage-foreshadowing` are `lane: 'expert'`, no `generate_candidate`, `allowed_result_types` includes `planning_proposal`

- [ ] **Step 1: Extend the lane test**

In `packages/core/src/agent-tasks.test.ts` add to the `toMatchObject` lanes object:

```ts
'analyze-relations': 'expert',
'manage-foreshadowing': 'expert',
```

After the world-book assertions add:

```ts
expect(getAgentTaskDefinition('analyze-relations')).toMatchObject({
  lane: 'expert',
  title: '分析关系',
  capability_ceiling: expect.not.arrayContaining(['generate_candidate']),
  allowed_result_types: expect.arrayContaining(['planning_proposal'])
})
expect(getAgentTaskDefinition('manage-foreshadowing')).toMatchObject({
  lane: 'expert',
  title: '管理伏笔',
  capability_ceiling: expect.not.arrayContaining(['generate_candidate']),
  allowed_result_types: expect.arrayContaining(['planning_proposal'])
})
```

- [ ] **Step 2: Run**

`pnpm exec vitest run packages/core/src/agent-tasks.test.ts`

Expected: FAIL — unknown ids.

- [ ] **Step 3: Add ids and definitions**

In `agentTaskIdSchema` add `'analyze-relations'` and `'manage-foreshadowing'` after `'organize-worldbook'`.

Append two definition objects (same shape as organize-worldbook):

```ts
{
  schema_version: 1,
  id: 'analyze-relations',
  version: '1.0.0',
  title: '分析关系',
  description: '针对当前选中人物提案新建或整段替换人物关系、势力关系与从属，确认后才写入。',
  input_schema_id: 'quillarium.agent.analyze-relations-input.v1',
  output_schema_id: 'quillarium.agent.analyze-relations-proposal.v1',
  context_scopes: ['current-target', 'explicit-relations'],
  capability_ceiling: ['propose_planning_record'],
  allowed_result_types: ['planning_proposal'],
  lane: 'expert'
},
{
  schema_version: 1,
  id: 'manage-foreshadowing',
  version: '1.0.0',
  title: '管理伏笔',
  description: '为已启用伏笔提案新建或整段替换，并可改已引用节点上的埋设与回收字段，确认后才写入。',
  input_schema_id: 'quillarium.agent.manage-foreshadowing-input.v1',
  output_schema_id: 'quillarium.agent.manage-foreshadowing-proposal.v1',
  context_scopes: ['project'],
  capability_ceiling: ['propose_planning_record'],
  allowed_result_types: ['planning_proposal'],
  lane: 'expert'
}
```

- [ ] **Step 4: Re-run**

`pnpm exec vitest run packages/core/src/agent-tasks.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```
git add packages/core/src/agent-tasks.ts packages/core/src/agent-tasks.test.ts
git commit -m "feat: register relation and foreshadowing expert tasks"
```

---

### Task 2: applyRelationAnalyze with rollback

**Files:**

- Create: `packages/core/src/relation-analyze.ts`
- Create: `packages/core/src/relation-analyze.test.ts`
- Modify: `packages/core/src/index.ts` — `export * from './relation-analyze.js'`

**Interfaces:**

- Consumes: `UNCONFIRMED_EVAL`, `DISABLED_UPDATE_CARD`, `createWorldEntry`, `specializePlanningCard`, `listDocs`, `writeMarkdown`, `writeText`, `readText`, `readMarkdown`, `withProjectWriteLock`, `isEnabledPlanningCard`
- Produces:

```ts
export const NO_CHARACTER_SELECTION = '没有选中人物，不能分析关系。'
export const MISSING_CHARACTER = '找不到人物，不能分析关系。'
export const CHARACTER_MISMATCH = '分析关系的人物与当前选中不一致。'
export const MISSING_RELATION_CARD = '找不到要更新的关系卡。'
export const MISSING_RELATION_PROPOSAL = (id: string) => `找不到关系提案：${id}`
export const RELATION_TYPES = ['character_relation', 'faction_relation', 'faction_membership'] as const
export type RelationExpertType = (typeof RELATION_TYPES)[number]

export async function loadCharacterForRelationAnalyze(
  projectRoot: string,
  characterId: string
): Promise<{ id: string; title: string } | null>

export interface RelationAnalyzeProposalSet {
  eval_id: string
  character_id: string
  creates: Array<{
    proposal_id: string
    title: string
    content: string
    type: RelationExpertType
    fields: Record<string, unknown>
  }>
  updates: Array<{
    proposal_id: string
    card_id: string
    content: string
    fields: Record<string, unknown>
  }>
}

export async function applyRelationAnalyze(
  projectRoot: string,
  proposals: RelationAnalyzeProposalSet,
  decisions: {
    confirmed: boolean
    creates: Array<{ proposal_id: string; type?: RelationExpertType; fields?: Record<string, unknown> }>
    updates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
  }
): Promise<{ created_ids: string[]; updated_ids: string[] }>
```

`loadCharacterForRelationAnalyze`: empty `characterId` → later callers throw `NO_CHARACTER_SELECTION`; missing character document → return `null` (facade throws `MISSING_CHARACTER`).

- [ ] **Step 1: Write failing tests** in `relation-analyze.test.ts`

Use `mkdtemp` + `createProjectAt` + `createCharacter` + `createFaction` + `createCharacterRelation` + `createFactionMembership` + `createFactionRelation`. Do not mock writes.

Cover spec tests 2–7 (unconfirmed, specialize create, missing to_character, update body+relation_type, disabled, faction_relation without membership, same-turn membership then faction_relation). Also: empty creates/updates with `confirmed: false` throws `UNCONFIRMED_EVAL`; mismatch `proposals.character_id` vs a planted character throws `CHARACTER_MISMATCH`.

Example (write the rest in the same file with the same fixture style):

```ts
it('creates a character_relation through world-entry specialize', async () => {
  const root = await project()
  await createCharacter(root, 'Lin', { id: 'char-lin' })
  await createCharacter(root, 'Mei', { id: 'char-mei' })
  const result = await applyRelationAnalyze(
    root,
    {
      eval_id: 'eval-1',
      character_id: 'char-lin',
      creates: [
        {
          proposal_id: 'p-rel',
          title: 'Lin and Mei',
          content: 'They share a harbor oath.',
          type: 'character_relation',
          fields: {
            from_character: 'char-lin',
            to_character: 'char-mei',
            relation_type: 'ally'
          }
        }
      ],
      updates: []
    },
    { confirmed: true, creates: [{ proposal_id: 'p-rel', type: 'character_relation' }], updates: [] }
  )
  expect(result.created_ids).toHaveLength(1)
  expect(await listDocs(root, 'world_entry')).toHaveLength(0)
  const rel = (await listDocs(root, 'character_relation')).find(
    (item) => item.data.id === result.created_ids[0]
  )
  expect(rel?.data.from_character).toBe('char-lin')
  expect(rel?.content).toContain('harbor oath')
})
```

For missing `to_character`, pass `creates: [{ proposal_id, type: 'character_relation', fields: { from_character: 'char-lin' } }]` (confirm-time fields override). Expect `/特化缺少必填字段/u` and zero relation files.

For same-turn membership then faction_relation: first create `faction_membership` for `char-lin` + `faction-a`, second create `faction_relation` between `faction-a` and `faction-b`. Confirm creates in that order. Both files exist after apply.

- [ ] **Step 2: Run**

`pnpm exec vitest run packages/core/src/relation-analyze.test.ts`

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `relation-analyze.ts`**

Copy the lock/rollback skeleton from `world-organize.ts`. Additional rules:

1. If `!decisions.confirmed` throw `UNCONFIRMED_EVAL`.
2. `loadCharacterForRelationAnalyze`; if `!characterId.trim()` throw `NO_CHARACTER_SELECTION`; if null throw `MISSING_CHARACTER`; if `proposals.character_id !== character.id` throw `CHARACTER_MISMATCH`.
3. Creates in array order: look up proposal by `proposal_id` else `MISSING_RELATION_PROPOSAL`. `targetType = decision.type ?? proposal.type`. Must be in `RELATION_TYPES` else `MISSING_RELATION_PROPOSAL`. Merge `fields = { ...proposal.fields, ...decision.fields }`. Call `assertRelationInvolvesCharacter(projectRoot, character.id, targetType, fields, extraMemberships)` where `extraMemberships` is `{ character_id, faction_id }[]` from **already successful creates in this apply**. Then `createWorldEntry` + `specializePlanningCard`. Track created paths like world-organize.
4. `assertRelationInvolvesCharacter`:
   - `character_relation`: `from_character` or `to_character` equals current id; both ids exist as `character` docs; not equal (if equal, let specialize/domain throw — still fail closed).
   - `faction_membership`: `character_id` equals current; `faction_id` exists as `faction`.
   - `faction_relation`: both factions exist; at least one is in enabled on-disk memberships for this character **or** `extraMemberships`.
   - Fail with `MISSING_RELATION_CARD` when involvement fails (disk unchanged via rollback).
5. Updates: find card by id; if missing or type not in `RELATION_TYPES` throw `MISSING_RELATION_CARD`; if `enabled === false` throw `DISABLED_UPDATE_CARD`. Replace body; merge `fields` except `id`/`type`; if `proposal.title.trim()` set `title`. Re-run involvement on the merged frontmatter (membership extras still include this-apply creates). Write markdown. Before-image rollback.
6. Return `{ created_ids, updated_ids }`. Catch → rollback → rethrow.

Keep `loadCharacterForRelationAnalyze` exported for the facade.

- [ ] **Step 4: Re-run**

`pnpm exec vitest run packages/core/src/relation-analyze.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```
git add packages/core/src/relation-analyze.ts packages/core/src/relation-analyze.test.ts packages/core/src/index.ts
git commit -m "feat: apply confirmed relation-analyze creates and updates"
```

---

### Task 3: applyForeshadowManage with binding rollback

**Files:**

- Create: `packages/core/src/foreshadow-manage.ts`
- Create: `packages/core/src/foreshadow-manage.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: `UNCONFIRMED_EVAL`, `DISABLED_UPDATE_CARD`, `createWorldEntry`, `specializePlanningCard`, `listDocs`, `writeMarkdown`, `writeText`, `readText`
- Produces:

```ts
export const MISSING_FORESHADOW_CARD = '找不到要更新的伏笔卡。'
export const FORESHADOW_UNREFERENCED = '伏笔尚未被该节点引用，不能改埋设或回收。'
export const MISSING_FORESHADOW_PROPOSAL = (id: string) => `找不到伏笔提案：${id}`

export interface ForeshadowManageProposalSet {
  eval_id: string
  creates: Array<{
    proposal_id: string
    title: string
    content: string
    fields: Record<string, unknown>
  }>
  updates: Array<{
    proposal_id: string
    card_id: string
    content: string
    fields: Record<string, unknown>
  }>
  bindings: Array<{
    proposal_id: string
    foreshadowing_id: string
    document_id: string
    plant?: 'add' | 'remove'
    resolve?: 'add' | 'remove'
  }>
}

export async function applyForeshadowManage(
  projectRoot: string,
  proposals: ForeshadowManageProposalSet,
  decisions: {
    confirmed: boolean
    creates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
    updates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
    bindings: string[]
  }
): Promise<{ created_ids: string[]; updated_ids: string[]; binding_document_ids: string[] }>
```

- [ ] **Step 1: Failing tests** covering spec 8–11

Fixture: `createForeshadowing` + `createOutline(..., 'chapter', ...)` with `related_foreshadowing: ['fs-1']`.

1. Create specialize to foreshadowing, body present, `world/` empty.
2. Same round binding to that new id → `FORESHADOW_UNREFERENCED`, no files.
3. Binding `plant: 'add'` on chapter that already lists `fs-1` in `related_foreshadowing` → planted contains `fs-1`; outline content unchanged; related array unchanged.
4. Binding on a chapter that does not list the id → `FORESHADOW_UNREFERENCED`; a selected card update in the same decisions must also roll back.
5. Two bindings, second illegal: first planted change restored.
6. Disabled foreshadowing update → `DISABLED_UPDATE_CARD`.
7. Unconfirmed → `UNCONFIRMED_EVAL`.
8. `add` when already planted is success (idempotent). `remove` when absent is success.
9. Binding proposal missing `plant` and `resolve` should throw `MISSING_FORESHADOW_PROPOSAL` or `FORESHADOW_UNREFERENCED` at apply if such a row is selected; prefer reject at apply with `MISSING_FORESHADOW_PROPOSAL` if the row is malformed.

- [ ] **Step 2: Run tests — FAIL missing module**

- [ ] **Step 3: Implement**

Order: creates (`createWorldEntry` + specialize `foreshadowing` with merged fields) → updates (enabled `foreshadowing` only; body replace; merge fields except id/type; optional title) → bindings.

For each selected binding id:

- Find proposal else `MISSING_FORESHADOW_PROPOSAL`.
- If `foreshadowing_id` is in this apply's `created_ids` (or was a create proposal id's resulting id — use the created set) throw `FORESHADOW_UNREFERENCED`.
- Card must exist as enabled foreshadowing (on disk before this apply, or an update target). Creates from this apply are forbidden even after they exist on disk in this transaction — check against the create proposal `applied` ids set.
- Find outline or scene by `document_id`. If not outline/scene throw `FORESHADOW_UNREFERENCED`.
- `referencesForeshadowing(data, id)` true iff any of the three arrays includes the id. Else `FORESHADOW_UNREFERENCED`.
- Snapshot raw file, patch `foreshadowing_planted` / `foreshadowing_resolved` with add/remove (Set semantics, stable array). Write markdown keeping other frontmatter and body.

Rollback: restore texts reverse, then delete created files.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```
git commit -m "feat: apply confirmed foreshadowing cards and plant-resolve bindings"
```

---

### Task 4: Facade pre-gates and runtime handlers

**Files:**

- Modify: `packages/agent-runtime/src/expert-facade.ts` + `expert-facade.test.ts`
- Create: `packages/agent-runtime/src/tasks/analyze-relations.ts`
- Create: `packages/agent-runtime/src/tasks/manage-foreshadowing.ts`
- Modify: `packages/agent-runtime/src/executor.ts` — import and register both handlers like organize-worldbook

**Interfaces:**

- Consumes: `loadCharacterForRelationAnalyze`, `NO_CHARACTER_SELECTION`, `MISSING_CHARACTER`, `listDocs`, `isEnabledPlanningCard`
- Produces: `executeExpertTask({ task_id: 'analyze-relations', input: { character_id } })` and `manage-foreshadowing` with `input: {}` return proposal sets without writing files

- [ ] **Step 1: Facade tests**

Empty `character_id`: throw `NO_CHARACTER_SELECTION`, `invokeProvider` not called.

Unknown id: throw `MISSING_CHARACTER`, no provider.

Valid character: provider called; no new relation files.

Copy `deps()` / `fixture()` from `expert-facade.test.ts`. Add `createCharacter`.

- [ ] **Step 2: FAIL then implement facade**

After the organize-outline gate:

```ts
if (request.task_id === 'analyze-relations') {
  const characterId = String(request.input.character_id ?? '')
  if (!characterId.trim()) throw new Error(NO_CHARACTER_SELECTION)
  const character = await loadCharacterForRelationAnalyze(request.projectRoot, characterId)
  if (!character) throw new Error(MISSING_CHARACTER)
}
```

Extend `target` mapping:

- `analyze-relations` → `{ type: 'character', id: characterId }`
- `manage-foreshadowing` → `{ type: 'project', id: 'project' }`

- [ ] **Step 3: Handlers**

Copy `packages/agent-runtime/src/tasks/organize-worldbook.ts`.

**analyze-relations** input schema: `{ character_id: z.string().min(1) }`. Model output: creates/updates max 64, matching proposal fields (`type` enum of the three relation types, `fields` as `z.record(z.unknown()).default({})`). Prepare context JSON: character card; enabled relations/memberships involving them; enabled faction_relations among those faction ids; peer titles. `valid_document_ids` = those card ids. Aggregate assigns `eval_id`, copies `character_id` from input, assigns `proposal_id` per row (`rel-create-0` style like world-organize).

**manage-foreshadowing** input `{}`. Model output adds `bindings` max 64 with optional plant/resolve enums. Prepare: enabled foreshadowing cards + outline/scene docs that already reference them (id, title, level, three arrays). Aggregate same id assignment (`fs-create-0`, `fs-update-0`, `fs-bind-0`).

Register in `executor.ts` `runtimeRegistry` exactly as organize-worldbook.

- [ ] **Step 4: Run**

`pnpm exec vitest run packages/agent-runtime/src/expert-facade.test.ts packages/core/src/relation-analyze.test.ts packages/core/src/foreshadow-manage.test.ts`

Expected: PASS. Provider mock for happy path may live only in facade tests.

- [ ] **Step 5: Commit**

```
git commit -m "feat: run relation and foreshadowing experts through the facade"
```

---

### Task 5: Desktop IPC 179→183 and confirm overlays

**Files:**

- Modify: `apps/desktop/electron/ipc/contract.ts` (IpcContract entries + `QUILLARIUM_API_CHANNELS` + type imports)
- Modify: `apps/desktop/electron/ipc/contract.test.ts` — `179` → `183` in the four `expectUniqueCount` calls and the test title
- Modify: `apps/desktop/electron/preload.ts` + `preload.cjs`
- Modify: `apps/desktop/electron/ipc/expert.ts` — evaluate/apply wrappers copying `evaluateWorldOrganize`
- Modify: `apps/desktop/src/features/planning/PlanningViews.tsx` — button + overlay
- Modify: `apps/desktop/src/features/outline/OutlineHome.tsx` + `OutlineHome.test.tsx`
- Optional: `VolumeHome.tsx` only if CharacterRelationView needs a new required prop; prefer optional `onAnalyzeRelations` defaulting to internal `window.quillarium` calls so VolumeHome needs no change

**Interfaces:**

- IPC request/response must match apply function signatures from Tasks 2–3
- Overlay class: `chapter-eval-panel` (same as world organize / chapter eval)

- [ ] **Step 1: Contract + preload + expert.ts**

Add channels:

```
analyzeRelations: 'expert:analyzeRelations'
applyRelationAnalyze: 'expert:applyRelationAnalyze'
manageForeshadowing: 'expert:manageForeshadowing'
applyForeshadowManage: 'expert:applyForeshadowManage'
```

Bump contract test 179 → 183.

- [ ] **Step 2: CharacterRelationView**

Next to 新增关系, if `egoId` is set, show **分析关系** / `Analyze relations`. Hidden when `!egoId`. On click: call `window.quillarium.analyzeRelations(projectRoot, egoId)` then open overlay. Overlay lists creates/updates with checkboxes; creates show type select limited to the three relation types plus required field inputs (`requiredSpecializationFields`). Confirm calls `applyRelationAnalyze` with `confirmed: true` and selected rows. Close does not apply. Do not call evaluate on slider change or recenter.

Reuse the world-organize overlay markup from `OutlineHome.tsx` (`.chapter-eval-panel`). Keep it inside CharacterRelationView so OutlineHome and VolumeHome both get the button.

Need `projectRoot` — already optional on the view; disable the button when missing.

- [ ] **Step 3: OutlineHome 管理伏笔**

When `activeSection === 'foreshadowing'`, show **管理伏笔** / `Manage foreshadowing` beside New (same pattern as `activeSection === 'world'` organize). Overlay two sections: card creates/updates; bindings (document id + plant/resolve). Confirm `applyForeshadowManage`. Extend `renderOutlineHome` union in the test to `'foreshadowing'` and assert the button appears there, not on `'world'` / `'issues'`. Unselected character graph: add a PlanningViews test or OutlineHome static markup test that CharacterRelationView without ego/character docs does not contain `分析关系`.

- [ ] **Step 4: Run**

```
pnpm exec vitest run apps/desktop/electron/ipc/contract.test.ts apps/desktop/src/features/outline/OutlineHome.test.tsx
```

Add a focused PlanningViews test file only if OutlineHome cannot see the relation button. If you add `PlanningViews.test.tsx`, keep it static markup like OutlineHome tests.

Expected: PASS

- [ ] **Step 5: Commit**

```
git commit -m "feat: confirm relation and foreshadowing experts from the desktop"
```

---

### Task 6: CLI evaluate-only commands

**Files:**

- Modify: `packages/cli/src/expert.ts`
- Modify: `packages/cli/src/index.test.ts` (the expert describe block around organize-worldbook)

**Interfaces:**

- Consumes: `executeExpertTask`, `RelationAnalyzeProposalSet`, `ForeshadowManageProposalSet`
- Produces: print lines exactly:

```text
relation-analyze: creates=<n> updates=<n>
foreshadow-manage: creates=<n> updates=<n> bindings=<n>
```

- [ ] **Step 1: Tests**

Extend the expert command-name list with `analyze-relations` and `manage-foreshadowing`. Help must include `--character-id` for analyze-relations. Missing character: `run('expert', 'analyze-relations', '--character-id', 'missing', '--project', root)` throws `找不到人物，不能分析关系。`. Empty character-id should not be possible if requiredOption; still test missing id. Mock provider like organize-worldbook tests and assert print + `listDocs` relation/foreshadowing counts unchanged.

- [ ] **Step 2: Implement** in `expert.ts` copying organize-worldbook / organize-outline. `analyze-relations` `.requiredOption('--character-id <id>', ...)`. `manage-foreshadowing` no extra option. No apply subcommand.

- [ ] **Step 3: Run**

`pnpm exec vitest run packages/cli/src/index.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```
git commit -m "feat: evaluate relation and foreshadowing experts from the CLI"
```

---

### Task 7: Docs and full gate

**Files:**

- Modify: `docs/DESIGN.md` (the expert paragraph ~lines 52–64)
- Modify: `docs/CLI.md` (expert section + command table ~line 493)
- Format/lint as needed

- [ ] **Step 1: DESIGN.md**

After the organize-worldbook sentences, add that `analyze-relations` is author-click from the time-aware character graph for the current person (creates/updates of the three relation types, confirm `applyRelationAnalyze`) and `manage-foreshadowing` is author-click from the foreshadowing ledger (card creates/updates plus plant/resolve bindings on already-linked outline/scene docs, confirm `applyForeshadowManage`). CLI `quill expert analyze-relations` and `quill expert manage-foreshadowing` are evaluate-only.

- [ ] **Step 2: CLI.md**

Add a subsection after outline/world-book organize:

```bash
pnpm cli expert analyze-relations --character-id <character-id> --project "./writing-workspace/projects/my-novel"
pnpm cli expert manage-foreshadowing --project "./writing-workspace/projects/my-novel"
```

Missing character: `找不到人物，不能分析关系。` Empty selection is a desktop-only message. Update the expert row in the command table.

- [ ] **Step 3: Full gate**

`pnpm check`

Expected: build ok, all tests pass, lint 0 errors, format clean. If format:check fails, `pnpm exec prettier --write` on the listed files and commit that separately.

- [ ] **Step 4: Commit docs (and format fix if any)**

```
git commit -m "docs: describe relation and foreshadowing expert tasks"
```

If format needed: `git commit -m "fix: format relation and foreshadowing expert files"`
