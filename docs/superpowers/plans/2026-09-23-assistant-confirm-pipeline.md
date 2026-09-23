# Assistant Confirm Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creator assistants keep multi-turn chat, but each turn with pending proposals opens one confirm overlay; `applyAssistantTurn` writes selected creates/updates/issues/configs in one locked transaction and rejects the rest.

**Architecture:** Conversation stays on existing assistant sessions. Core owns `applyAssistantTurn` (world-entry creates, full-body updates, specialize, issues, configuration plans, turn status). Desktop overlay and `quill assistant apply-turn` are the only author confirm paths. Do not route turns through `executeExpertTask`.

**Tech Stack:** TypeScript, pnpm workspace, Vitest, Zod, Electron IPC, Commander CLI, existing `createWorldEntry` / `createIssue` / `specializePlanningCard` / `applyConfigurationChangePlan` / `withProjectWriteLock`.

## Global Constraints

- Product spec: `docs/superpowers/specs/2026-09-23-assistant-confirm-pipeline-design.md` (approved).
- Parent: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`.
- Fence: `docs/superpowers/specs/2026-09-22-agent-expert-fence-design.md`.
- Do not migrate chat into `executeExpertTask`. Do not add relationship/foreshadowing experts. Do not change chapter eval, outline/world organize, scene generation, display, or CCv3.
- Creates always land as `world_entry` then optional `specializePlanningCard`. Model `document_type` is a specialize suggestion only.
- Updates replace the Markdown body of an enabled planning card. Type changes use existing specialize rules only.
- Unselected pending items become `rejected` on successful confirm. Cancel/close does not call apply.
- Exact errors: `提案尚未确认，不能写入。` (`UNCONFIRMED_EVAL`) / `本轮提案已过期，请重新打开确认。` / `找不到本轮提案：{id}` / `找不到要更新的设定卡。` / `不能更新已禁用的设定卡。` plus existing specialize messages.
- Style: no semicolons, single quotes, Prettier 110.
- Tests: `pnpm exec vitest run <file>`. Full gate `pnpm check`.
- IPC **178 → 179** with `assistant:applyTurn`.
- PowerShell: no bash `&&` / heredoc. Do not push unless asked.

## Later plans (out of scope here)

1. Relationship and foreshadowing expert tasks.
2. Migrating creator-assistant turns into agent-runtime / `executeExpertTask`.

## File map

- Modify: `packages/core/src/assistant-sessions.ts` — proposal schema `operation` / `card_id`
- Create: `packages/core/src/assistant-turn-apply.ts` + `assistant-turn-apply.test.ts`
- Modify: `packages/core/src/index.ts` — export
- Modify: `apps/desktop/electron/ipc/contract.ts`, `contract.test.ts`, `assistant.ts`, `preload.ts`, `preload.cjs`
- Modify: `apps/desktop/src/features/assistants/CreatorAssistantWorkspace.tsx` + `CreatorAssistantWorkspace.test.tsx`
- Create: `packages/cli/src/assistant.ts`
- Modify: `packages/cli/src/index.ts` + `index.test.ts`
- Modify: `docs/DESIGN.md`, `docs/CLI.md`

---

### Task 1: Accept create/update on assistant proposals without breaking old turns

**Files:**

- Modify: `packages/core/src/assistant-sessions.ts` (`assistantProposalV1Schema`)
- Modify: `packages/core/src/assistant-turn-apply.test.ts` (create this file for schema tests first)

**Interfaces:**

- Consumes: existing `assistantProposalV1Schema`
- Produces: parsed proposals with `operation: 'create' | 'update'` (default `create`) and optional `card_id`

- [ ] **Step 1: Write the failing schema tests**

Create `packages/core/src/assistant-turn-apply.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { assistantProposalV1Schema } from './assistant-sessions.js'
import { rm } from 'node:fs/promises'

describe('assistantProposalV1Schema', () => {
  it('treats legacy proposals without operation as create', () => {
    const parsed = assistantProposalV1Schema.parse({
      id: 'proposal-legacy',
      kind: 'planning_record',
      title: 'Tide',
      document_type: 'character',
      fields: {},
      content: 'A tide spirit.',
      rationale: 'From source notes.',
      status: 'pending'
    })
    expect(parsed.operation).toBe('create')
    expect(parsed.card_id).toBeUndefined()
  })

  it('rejects an update without card_id', () => {
    expect(() =>
      assistantProposalV1Schema.parse({
        id: 'proposal-bad-update',
        kind: 'planning_record',
        title: 'Tide',
        document_type: 'world_entry',
        operation: 'update',
        fields: {},
        content: 'Replacement.',
        rationale: 'Rewrite.',
        status: 'pending'
      })
    ).toThrow(/card_id/u)
  })

  it('rejects issue updates', () => {
    expect(() =>
      assistantProposalV1Schema.parse({
        id: 'proposal-issue-update',
        kind: 'issue',
        title: 'Gap',
        document_type: 'issue',
        operation: 'update',
        card_id: 'issue-old',
        fields: {},
        content: 'Body',
        rationale: 'Cannot patch issues this way.',
        status: 'pending'
      })
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts`

Expected: FAIL — `assistantProposalV1Schema` has no `operation`, or the update-without-`card_id` case still parses.

- [ ] **Step 3: Extend the schema**

In `assistantProposalV1Schema`, after `document_type` add:

```ts
operation: z.enum(['create', 'update']).default('create'),
card_id: z.string().min(1).optional(),
```

Keep `.strict()`, then `.superRefine((value, context) => { ... })`:

- `operation === 'update'` and missing `card_id` → issue on `['card_id']` with message `更新提案必须包含 card_id`
- `kind === 'issue'` and `operation === 'update'` → issue with message `问题提案不能更新已有卡片。`

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```
git add packages/core/src/assistant-sessions.ts packages/core/src/assistant-turn-apply.test.ts
git commit -m "test: accept create and update on assistant proposals"
```

If the schema landed in the same commit as the tests, a `feat:` message is fine: `feat: distinguish assistant create and update proposals`.

---

### Task 2: Refuse unconfirmed assistant-turn apply

**Files:**

- Create: `packages/core/src/assistant-turn-apply.ts`
- Modify: `packages/core/src/assistant-turn-apply.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: `UNCONFIRMED_EVAL` from `./chapter-eval.js`; session/turn loaders from `./assistant-sessions.js`
- Produces:

```ts
export const STALE_ASSISTANT_TURN = '本轮提案已过期，请重新打开确认。'
export const MISSING_ASSISTANT_PROPOSAL = (id: string) => `找不到本轮提案：${id}`
export const MISSING_UPDATE_CARD = '找不到要更新的设定卡。'
export const DISABLED_UPDATE_CARD = '不能更新已禁用的设定卡。'

export interface AssistantTurnDecisions {
  confirmed: boolean
  creates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
  updates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
  issues: string[]
  configs: string[]
}

export async function applyAssistantTurn(
  projectRoot: string,
  sessionId: string,
  turnId: string,
  decisions: AssistantTurnDecisions,
  expectedTurnSha256: string
): Promise<{
  created_ids: string[]
  updated_ids: string[]
  issue_ids: string[]
  config_ids: string[]
  rejected_ids: string[]
}>
```

- [ ] **Step 1: Add the unconfirmed fixture test**

In `assistant-turn-apply.test.ts` add the plant helper used by later tasks (copy the start/record pattern from `packages/core/src/creator-assistants.test.ts`: `createProjectAt`, `ensureBuiltinCreatorRoles`, `startAgentSession`, `resolveContextBundleDefinition`, `createWritingPresetSnapshot`, `createAgentPromptEnvelope`, `createAgentExecutionSnapshot`, `recordAssistantTurn`).

Helper signature:

```ts
async function plantSettingTurn(
  proposals: Array<Record<string, unknown>>,
  configurationProposals: Array<Record<string, unknown>> = []
): Promise<{
  root: string
  sessionId: string
  turnId: string
  sha: string
}>
```

It starts `setting-organizer` targeted at `{ document_type: 'project', document_id: 'assistant-fixture' }`, records one turn whose `output.proposals` / `configuration_proposals` are the arguments, and returns the first turn id plus `turn_source_sha256`.

Add:

```ts
import { applyAssistantTurn } from './assistant-turn-apply.js'
import { UNCONFIRMED_EVAL } from './chapter-eval.js'
import { listDocs, loadAgentSessionDetail } from './index.js'

it('does not write when the author has not confirmed', async () => {
  const planted = await plantSettingTurn([
    {
      kind: 'planning_record',
      title: 'Harbor Law',
      document_type: 'world_entry',
      rationale: 'Need a law card.',
      content: 'Ships pay the harbor tax.'
    }
  ])
  await expect(
    applyAssistantTurn(
      planted.root,
      planted.sessionId,
      planted.turnId,
      { confirmed: false, creates: [], updates: [], issues: [], configs: [] },
      planted.sha
    )
  ).rejects.toThrow(UNCONFIRMED_EVAL)
  expect(await listDocs(planted.root, 'world_entry')).toHaveLength(0)
  const detail = await loadAgentSessionDetail(planted.root, planted.sessionId)
  expect(detail.turns[0]?.proposals[0]?.status).toBe('pending')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts`

Expected: FAIL because `./assistant-turn-apply.js` cannot be resolved.

- [ ] **Step 3: Implement the unconfirmed gate**

`packages/core/src/assistant-turn-apply.ts`:

```ts
import { UNCONFIRMED_EVAL } from './chapter-eval.js'

export async function applyAssistantTurn(
  projectRoot: string,
  sessionId: string,
  turnId: string,
  decisions: AssistantTurnDecisions,
  expectedTurnSha256: string
) {
  if (!decisions.confirmed) throw new Error(UNCONFIRMED_EVAL)
  void projectRoot
  void sessionId
  void turnId
  void expectedTurnSha256
  return { created_ids: [], updated_ids: [], issue_ids: [], config_ids: [], rejected_ids: [] }
}
```

Export from `packages/core/src/index.ts`: `export * from './assistant-turn-apply.js'`

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts`

Expected: PASS (unconfirmed throws; later write tests still absent)

- [ ] **Step 5: Commit**

```
git add packages/core/src/assistant-turn-apply.ts packages/core/src/assistant-turn-apply.test.ts packages/core/src/index.ts
git commit -m "feat: refuse unconfirmed assistant-turn writes"
```

---

### Task 3: Create world-book cards and specialize on confirm

**Files:**

- Modify: `packages/core/src/assistant-turn-apply.ts`
- Modify: `packages/core/src/assistant-turn-apply.test.ts`

**Interfaces:**

- Consumes: `createWorldEntry`, `readMarkdown`, `specializePlanningCard`, `loadAgentSessionDetail`, `withProjectWriteLock`, `isSpecializationKind`
- Produces: confirmed creates write `world_entry` then optional specialize; selected proposal `applied` with `applied_document_id`; unselected pending planning proposals `rejected`

- [ ] **Step 1: Write failing create tests**

```ts
it('creates a world entry then specializes when the author confirms a typed create', async () => {
  const planted = await plantSettingTurn([
    {
      id: 'proposal-tide',
      kind: 'planning_record',
      title: 'Tide',
      document_type: 'character',
      rationale: 'Personify the tide.',
      content: 'A tide spirit.'
    }
  ])
  const result = await applyAssistantTurn(
    planted.root,
    planted.sessionId,
    planted.turnId,
    {
      confirmed: true,
      creates: [{ proposal_id: 'proposal-tide', type: 'character' }],
      updates: [],
      issues: [],
      configs: []
    },
    planted.sha
  )
  expect(await listDocs(planted.root, 'world_entry')).toHaveLength(0)
  const characters = await listDocs(planted.root, 'character')
  expect(characters.map((item) => item.data.title)).toContain('Tide')
  expect(result.created_ids).toEqual([characters.find((item) => item.data.title === 'Tide')?.data.id])
  const detail = await loadAgentSessionDetail(planted.root, planted.sessionId)
  expect(detail.turns[0]?.proposals[0]?.status).toBe('applied')
})

it('rejects the unselected create in the same confirm', async () => {
  const planted = await plantSettingTurn([
    {
      id: 'proposal-keep',
      kind: 'planning_record',
      title: 'Keep',
      document_type: 'world_entry',
      rationale: 'Keep this.',
      content: 'Keep body.'
    },
    {
      id: 'proposal-drop',
      kind: 'planning_record',
      title: 'Drop',
      document_type: 'world_entry',
      rationale: 'Drop this.',
      content: 'Drop body.'
    }
  ])
  await applyAssistantTurn(
    planted.root,
    planted.sessionId,
    planted.turnId,
    {
      confirmed: true,
      creates: [{ proposal_id: 'proposal-keep' }],
      updates: [],
      issues: [],
      configs: []
    },
    planted.sha
  )
  const worlds = await listDocs(planted.root, 'world_entry')
  expect(worlds.map((item) => item.data.title)).toEqual(['Keep'])
  const detail = await loadAgentSessionDetail(planted.root, planted.sessionId)
  const statuses = Object.fromEntries(detail.turns[0]!.proposals.map((item) => [item.id, item.status]))
  expect(statuses).toEqual({ 'proposal-keep': 'applied', 'proposal-drop': 'rejected' })
})
```

If `recordAssistantTurn` overwrites client ids, assert via titles and `proposals[0].id` returned from the planted turn instead of hard-coding ids. Prefer passing `id` and keeping it: `recordAssistantTurn` already honors `proposal.id`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts`

Expected: FAIL — apply returns empty ids / proposals stay pending.

- [ ] **Step 3: Implement creates + turn status write**

Inside `withProjectWriteLock`:

1. Load session + verified turn. If `turn_source_sha256 !== expectedTurnSha256`, throw `STALE_ASSISTANT_TURN`.
2. Build a lookup of pending proposals by id.
3. For each `decisions.creates` item, require pending `kind === 'planning_record'` and `operation !== 'update'`. Missing → `MISSING_ASSISTANT_PROPOSAL(id)`.
4. `createWorldEntry(projectRoot, title, {}, content)`. Track created paths for rollback (`rm`).
5. If `decision.type` (else proposal `document_type`) is a specialization kind other than `world_entry`, call `specializePlanningCard` and replace the tracked path with the specialized path.
6. After all writes succeed, rewrite `turn.json`: selected creates `applied` + `applied_document_id`; every other pending planning/issue/config proposal `rejected`.
7. On catch: delete created paths (reverse), do not write turn.json (or restore the before-image of turn.json if already written — write turn.json last so rollback only needs file deletes).

Need a way to write turn.json. Import the same `writeText` + `prettyJson` pattern used by `updateAssistantProposalStatus`, or add an internal helper in `assistant-sessions.ts` such as `writeAgentTurn(projectRoot, sessionId, turn)` if exporting is cleaner than duplicating path math. Prefer exporting a small `replaceAgentTurn(projectRoot, sessionId, turn: AgentTurnV1)` from `assistant-sessions.ts` rather than copying `ensureTurnDirectory`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```
git add packages/core/src/assistant-turn-apply.ts packages/core/src/assistant-turn-apply.test.ts packages/core/src/assistant-sessions.ts
git commit -m "feat: apply confirmed assistant creates through world-book specialize"
```

---

### Task 4: Replace enabled cards and refuse disabled/missing targets

**Files:**

- Modify: `packages/core/src/assistant-turn-apply.ts`
- Modify: `packages/core/src/assistant-turn-apply.test.ts`

**Interfaces:**

- Consumes: `listDocs`, `readText`, `writeMarkdown`, `DISABLED_UPDATE_CARD`, `MISSING_UPDATE_CARD`
- Produces: body replacement for enabled cards; optional specialize when `decision.type` differs from current type; before-image rollback

- [ ] **Step 1: Write failing update tests**

```ts
it('replaces an enabled character body without changing type', async () => {
  const rootSetup = await plantSettingTurn([]) // or plant after createCharacter
})
```

Better: in the test body, `createCharacter(root, 'Lin', { id: 'char-lin' }, 'Old voice.')` then plant an update proposal `{ operation: 'update', card_id: 'char-lin', document_type: 'character', content: 'New voice.', title: 'Lin', ... }`.

```ts
it('replaces an enabled character body without changing type', async () => {
  const planted = await plantSettingTurn([])
  await createCharacter(planted.root, 'Lin', { id: 'char-lin' }, 'Old voice.')
  const withUpdate = await plantSettingTurnOn(planted, [
    {
      id: 'proposal-lin',
      kind: 'planning_record',
      title: 'Lin',
      document_type: 'character',
      operation: 'update',
      card_id: 'char-lin',
      rationale: 'Rewrite voice.',
      content: 'New voice.'
    }
  ])
  await applyAssistantTurn(
    withUpdate.root,
    withUpdate.sessionId,
    withUpdate.turnId,
    {
      confirmed: true,
      creates: [],
      updates: [{ proposal_id: 'proposal-lin' }],
      issues: [],
      configs: []
    },
    withUpdate.sha
  )
  const card = (await listDocs(withUpdate.root, 'character')).find((item) => item.data.id === 'char-lin')
  expect(card?.content).toContain('New voice.')
  expect(card?.content).not.toContain('Old voice.')
  expect(card?.data.type).toBe('character')
})

it('refuses to update a disabled world entry', async () => {
  const planted = await plantSettingTurn([])
  await createWorldEntry(planted.root, 'Silent', { id: 'world-silent', enabled: false }, 'Old.')
  const withUpdate = await plantSettingTurnOn(planted, [
    {
      id: 'proposal-silent',
      kind: 'planning_record',
      title: 'Silent',
      document_type: 'world_entry',
      operation: 'update',
      card_id: 'world-silent',
      rationale: 'Should fail.',
      content: 'New.'
    }
  ])
  await expect(
    applyAssistantTurn(
      withUpdate.root,
      withUpdate.sessionId,
      withUpdate.turnId,
      {
        confirmed: true,
        creates: [],
        updates: [{ proposal_id: 'proposal-silent' }],
        issues: [],
        configs: []
      },
      withUpdate.sha
    )
  ).rejects.toThrow(DISABLED_UPDATE_CARD)
  const card = (await listDocs(withUpdate.root, 'world_entry')).find(
    (item) => item.data.id === 'world-silent'
  )
  expect(card?.content).toContain('Old.')
})
```

Add `it('refuses a missing update target', ...)` expecting `MISSING_UPDATE_CARD`.

If one session cannot record two turns easily, `plantSettingTurnOn` starts a **new** session on the same `root` after the card exists. That is enough.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts`

Expected: FAIL — updates are ignored or throw a generic error.

- [ ] **Step 3: Implement updates**

For each `decisions.updates` item:

1. Proposal must be pending `planning_record` with `operation === 'update'` and `card_id`.
2. `listDocs` find by id. Missing → `MISSING_UPDATE_CARD`.
3. If `data.enabled === false` → `DISABLED_UPDATE_CARD`.
4. Reject `outline` / `scene` / `chapter_prose` / `canon` / `issue` types with `MISSING_UPDATE_CARD` (same fail-closed; do not invent a fifth error).
5. Snapshot `readText(path)` into restorations. `writeMarkdown(path, { ...data, title: proposal.title }, proposal.content)`.
6. If `decision.type` is set and differs from `data.type`, `specializePlanningCard`. If the new path differs, track it as created for rollback.
7. Rollback on failure: restore `writeText(path, before)` in reverse, then delete created specialize paths.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```
git add packages/core/src/assistant-turn-apply.ts packages/core/src/assistant-turn-apply.test.ts
git commit -m "feat: replace enabled setting cards from assistant-turn confirm"
```

---

### Task 5: Issues, configs, stale hash, and whole-transaction rollback

**Files:**

- Modify: `packages/core/src/assistant-turn-apply.ts`
- Modify: `packages/core/src/assistant-turn-apply.test.ts`

**Interfaces:**

- Consumes: `createIssue`, `applyConfigurationChangePlan`, `loadCreatorRole` / `loadContextBundle`, `updateCreatorRole` / `updateContextBundle`
- Produces: issues and configs in the same lock; failed specialize rolls back earlier creates; stale sha throws `STALE_ASSISTANT_TURN`

- [ ] **Step 1: Write failing tests**

```ts
it('rolls back the first create when a later specialize is missing fields', async () => {
  const planted = await plantSettingTurn([
    {
      id: 'proposal-ok',
      kind: 'planning_record',
      title: 'Harbor',
      document_type: 'world_entry',
      rationale: 'First.',
      content: 'Harbor body.'
    },
    {
      id: 'proposal-rel',
      kind: 'planning_record',
      title: 'Pact',
      document_type: 'character_relation',
      rationale: 'Needs both ends.',
      content: 'A pact.'
    }
  ])
  await expect(
    applyAssistantTurn(
      planted.root,
      planted.sessionId,
      planted.turnId,
      {
        confirmed: true,
        creates: [
          { proposal_id: 'proposal-ok' },
          { proposal_id: 'proposal-rel', type: 'character_relation' }
        ],
        updates: [],
        issues: [],
        configs: []
      },
      planted.sha
    )
  ).rejects.toThrow(/特化缺少必填字段/u)
  expect(await listDocs(planted.root, 'world_entry')).toHaveLength(0)
  const detail = await loadAgentSessionDetail(planted.root, planted.sessionId)
  expect(detail.turns[0]?.proposals.every((item) => item.status === 'pending')).toBe(true)
})

it('writes an issue only after confirm', async () => {
  const planted = await plantContinuityTurn([
    {
      id: 'proposal-issue',
      kind: 'issue',
      title: 'Timeline gap',
      document_type: 'issue',
      rationale: 'Missing day.',
      content: 'The next morning never happens.'
    }
  ])
  expect(await listDocs(planted.root, 'issue')).toHaveLength(0)
  await applyAssistantTurn(
    planted.root,
    planted.sessionId,
    planted.turnId,
    {
      confirmed: true,
      creates: [],
      updates: [],
      issues: ['proposal-issue'],
      configs: []
    },
    planted.sha
  )
  expect(await listDocs(planted.root, 'issue')).toHaveLength(1)
})

it('applies a configuration proposal in the same confirm and restores it on later failure', async () => {
  // Plant setting-organizer turn with one config proposal (see creator-assistants.test.ts
  // configuration_proposals example) PLUS a second create that will fail specialize.
  // After reject: role description unchanged AND no world files AND statuses pending.
})

it('rejects a stale turn hash without writing', async () => {
  const planted = await plantSettingTurn([
    {
      kind: 'planning_record',
      title: 'Stale',
      document_type: 'world_entry',
      rationale: 'Hash check.',
      content: 'Body.'
    }
  ])
  await expect(
    applyAssistantTurn(
      planted.root,
      planted.sessionId,
      planted.turnId,
      {
        confirmed: true,
        creates: [{ proposal_id: planted.proposalIds[0]! }],
        updates: [],
        issues: [],
        configs: []
      },
      '0'.repeat(64)
    )
  ).rejects.toThrow(STALE_ASSISTANT_TURN)
})
```

`plantContinuityTurn` starts `continuity-review` with a legal workflow target (create a chapter outline + use it as `document_ids` / session target). Follow `assistant-workflows.ts` / existing continuity tests for the minimum workflow input. If continuity workflow is too heavy for this fixture, start `setting-organizer` and still record an `issue` proposal — but `validateTurnOutputPermissions` will reject issue proposals on a planning_proposal role. So continuity (or a role with `issue_proposal`) is required.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts`

Expected: FAIL on rollback leftover files and/or issue not created.

- [ ] **Step 3: Implement issues, configs, stale check, rollback**

- Stale: compare sha before writes.
- Issues: `createIssue(projectRoot, title, { related_docs: target.document_id === session project sentinel ? [] : [target.document_id] }, content)`. Track path.
- Configs: load before snapshot; `applyConfigurationChangePlan(plan, true)`; on rollback restore with `updateCreatorRole` / `updateContextBundle` using the live sha after apply (copy `rollbackAppliedConfiguration` from `assistant-sessions.ts` — export it from `assistant-config-proposals.ts` as `restoreConfigurationChange` rather than duplicating privately).
- Write `turn.json` last.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts packages/core/src/creator-assistants.test.ts`

Expected: PASS. Existing per-item `applyAssistantConfigurationProposal` tests must still pass.

- [ ] **Step 5: Commit**

```
git add packages/core/src/assistant-turn-apply.ts packages/core/src/assistant-turn-apply.test.ts packages/core/src/assistant-config-proposals.ts packages/core/src/assistant-sessions.ts
git commit -m "feat: apply assistant issues and configs in one rollback-safe turn"
```

---

### Task 6: Desktop overlay and IPC 179

**Files:**

- Modify: `apps/desktop/electron/ipc/contract.ts`
- Modify: `apps/desktop/electron/ipc/contract.test.ts` (178 → 179)
- Modify: `apps/desktop/electron/ipc/assistant.ts`
- Modify: `apps/desktop/electron/preload.ts`
- Modify: `apps/desktop/electron/preload.cjs`
- Modify: `apps/desktop/src/features/assistants/CreatorAssistantWorkspace.tsx`
- Modify: `apps/desktop/src/features/assistants/CreatorAssistantWorkspace.test.tsx`

**Interfaces:**

- Consumes: `applyAssistantTurn`, `shouldOpenAssistantTurnOverlay`
- Produces: `assistant:applyTurn` channel; overlay UI; no per-item apply buttons in the workspace

- [ ] **Step 1: Write failing UI / contract tests**

In `contract.test.ts` change `178` to `179` in the description and the four `expectUniqueCount` calls.

In `CreatorAssistantWorkspace.test.tsx` add:

```ts
import { shouldOpenAssistantTurnOverlay } from './CreatorAssistantWorkspace.js'

it('opens the confirm overlay when a turn has pending proposals', () => {
  expect(
    shouldOpenAssistantTurnOverlay({
      proposals: [{ status: 'pending' }],
      configuration_proposals: [],
      candidate: null
    })
  ).toBe(true)
})

it('does not open the overlay for a rehearsal candidate with no pending proposals', () => {
  expect(
    shouldOpenAssistantTurnOverlay({
      proposals: [],
      configuration_proposals: [],
      candidate: { title: 'Take', content: 'A spoken line.' }
    })
  ).toBe(false)
})
```

Static markup test (render a tiny fixture if the workspace needs too much state): export `shouldOpenAssistantTurnOverlay` from the same file as the overlay. Also assert the source of `CreatorAssistantWorkspace.tsx` no longer contains `bridge.applyAssistantProposal` or `bridge.applyAssistantConfigurationProposal`, and does contain `applyAssistantTurn` and `确认本轮`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run apps/desktop/electron/ipc/contract.test.ts apps/desktop/src/features/assistants/CreatorAssistantWorkspace.test.tsx`

Expected: FAIL — still 178 channels; helper missing; source still calls per-item apply.

- [ ] **Step 3: Implement overlay + IPC**

Contract:

```ts
'assistant:applyTurn': {
  request: [
    root: string,
    sessionId: string,
    turnId: string,
    decisions: {
      confirmed: boolean
      creates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
      updates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
      issues: string[]
      configs: string[]
    },
    expectedTurnSha256: string
  ]
  response: {
    session: LoadedAgentSessionDetail
    created_ids: string[]
    updated_ids: string[]
    issue_ids: string[]
    config_ids: string[]
    rejected_ids: string[]
  }
}
```

`QUILLARIUM_API_CHANNELS.applyAssistantTurn = 'assistant:applyTurn'` placed next to `applyAssistantProposal`.

IPC handler: call `applyAssistantTurn` then `loadAgentSessionDetail`.

Preload TS + CJS: `applyAssistantTurn: (...) => invoke('assistant:applyTurn', ...)`.

Workspace:

- After `sendAssistantTurn` returns, if `shouldOpenAssistantTurnOverlay(latestTurn)` set overlay state to that turn.
- Overlay class `chapter-eval-panel`. Two sections. Checkboxes default on. Specialize `<select>` for planning creates (preselect proposal `document_type` when it is a legal specialize target). Footer 确认 / 关闭.
- Confirm calls `bridge.applyAssistantTurn` with `confirmed: true` and selected ids. Close only clears overlay state.
- When overlay is closed and the latest pending turn still has pending items, show button `确认本轮` / `Confirm this turn`.
- Remove per-item apply/reject buttons for proposals and configuration proposals (status text can remain).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/desktop/electron/ipc/contract.test.ts apps/desktop/src/features/assistants/CreatorAssistantWorkspace.test.tsx`

Expected: PASS (179 unique channels aligned)

- [ ] **Step 5: Commit**

```
git add apps/desktop/electron/ipc/contract.ts apps/desktop/electron/ipc/contract.test.ts apps/desktop/electron/ipc/assistant.ts apps/desktop/electron/preload.ts apps/desktop/electron/preload.cjs apps/desktop/src/features/assistants/CreatorAssistantWorkspace.tsx apps/desktop/src/features/assistants/CreatorAssistantWorkspace.test.tsx
git commit -m "feat: confirm each assistant turn through one overlay"
```

---

### Task 7: CLI apply-turn for an existing session turn

**Files:**

- Create: `packages/cli/src/assistant.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/index.test.ts`

**Interfaces:**

- Consumes: `applyAssistantTurn`, `readFile` for decisions JSON
- Produces: `quill assistant apply-turn --project --session --turn --decisions`

- [ ] **Step 1: Write failing CLI tests**

In `packages/cli/src/index.test.ts`:

```ts
it('exposes assistant apply-turn and refuses without a confirmed decisions file', async () => {
  const assistant = buildProgram().commands.find((command) => command.name() === 'assistant')
  expect(assistant?.commands.map((command) => command.name())).toEqual(['apply-turn'])
  const help = assistant?.commands.find((command) => command.name() === 'apply-turn')?.helpInformation()
  expect(help).toContain('--session')
  expect(help).toContain('--turn')
  expect(help).toContain('--decisions')
})

it('refuses assistant apply-turn when decisions are not confirmed', async () => {
  const { root } = await initProject()
  const decisions = path.join(root, 'decisions.json')
  await writeFile(
    decisions,
    JSON.stringify({ confirmed: false, creates: [], updates: [], issues: [], configs: [] })
  )
  await expect(
    run(
      'assistant',
      'apply-turn',
      '--session',
      'assistant-missing',
      '--turn',
      'turn-missing',
      '--decisions',
      decisions,
      '--project',
      root
    )
  ).rejects.toThrow('提案尚未确认，不能写入。')
})
```

Add a success test that plants a setting-organizer turn with core APIs (same plant helper pattern; inline is OK in this file) then writes `confirmed: true` with that create id and expects stdout `assistant-turn: creates=1 updates=0 issues=0 configs=0 rejected=0` plus a world file on disk.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/index.test.ts`

Expected: FAIL — no `assistant` command.

- [ ] **Step 3: Implement CLI**

`packages/cli/src/assistant.ts`:

```ts
export function registerAssistantCommands(
  program: Command,
  projectOption: (command: Command) => Command
): void {
  const assistant = program.command('assistant').description('Confirm existing creator-assistant turns')
  projectOption(
    assistant
      .command('apply-turn')
      .requiredOption('--session <id>', 'Assistant session id')
      .requiredOption('--turn <id>', 'Turn id')
      .requiredOption('--decisions <file>', 'JSON decisions for applyAssistantTurn')
      .description('Apply a stored assistant turn after author decisions; does not chat')
  ).action(async (options) => {
    const raw = JSON.parse(await readFile(path.resolve(options.decisions), 'utf8')) as {
      confirmed?: boolean
      creates?: unknown
      updates?: unknown
      issues?: unknown
      configs?: unknown
    }
    if (raw.confirmed !== true) throw new Error(UNCONFIRMED_EVAL)
    const result = await applyAssistantTurn(
      path.resolve(options.project),
      options.session,
      options.turn,
      {
        confirmed: true,
        creates: (raw.creates ?? []) as AssistantTurnDecisions['creates'],
        updates: (raw.updates ?? []) as AssistantTurnDecisions['updates'],
        issues: (raw.issues ?? []) as string[],
        configs: (raw.configs ?? []) as string[]
      },
      await currentTurnSha(path.resolve(options.project), options.session, options.turn)
    )
    console.log(
      `assistant-turn: creates=${result.created_ids.length} updates=${result.updated_ids.length} issues=${result.issue_ids.length} configs=${result.config_ids.length} rejected=${result.rejected_ids.length}`
    )
  })
}
```

`currentTurnSha`: `loadAgentSessionDetail` → `turn_source_sha256[turnId]`. Missing turn can throw after `applyAssistantTurn` would anyway; load first so the hash is the live one.

Call `registerAssistantCommands(program, projectOption)` next to `registerExpertCommands` in `packages/cli/src/index.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/cli/src/index.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```
git add packages/cli/src/assistant.ts packages/cli/src/index.ts packages/cli/src/index.test.ts
git commit -m "feat: apply stored assistant turns from the CLI"
```

---

### Task 8: Document the confirm pipeline

**Files:**

- Modify: `docs/DESIGN.md` (the paragraph that currently says the conversational setting organizer is unchanged)
- Modify: `docs/CLI.md` (new subsection + command map row)

**Interfaces:**

- Consumes: shipped behavior from Tasks 1–7
- Produces: docs that match the spec

- [ ] **Step 1: Write a docs assertion if one exists; otherwise edit docs directly**

There is no DESIGN wrap-count test. Edit `docs/DESIGN.md` Implementation Status: replace “The conversational setting organizer (`organize-setting`) is unchanged.” with: creator-assistant turns still chat through existing sessions; pending planning, issue, and configuration proposals open one confirm overlay per turn; confirm runs `applyAssistantTurn` (world-entry creates, enabled-card body replace, optional specialize, issues, configs, unselected rejected); CLI `quill assistant apply-turn` applies a stored turn from a decisions file and never chats.

In `docs/CLI.md` after the organize-worldbook examples add:

```bash
pnpm cli assistant apply-turn --session <session-id> --turn <turn-id> --decisions ./decisions.json --project "./writing-workspace/projects/my-novel"
```

State that `confirmed` must be true or the command throws `提案尚未确认，不能写入。`

Command map: add `| \`assistant\` | \`apply-turn\`: confirm a stored turn from a decisions file |`

- [ ] **Step 2: Run format check on the two docs**

Run: `pnpm exec prettier --check docs/DESIGN.md docs/CLI.md`

Expected: PASS after `pnpm exec prettier --write` if needed.

- [ ] **Step 3: Commit**

```
git add docs/DESIGN.md docs/CLI.md
git commit -m "docs: describe assistant-turn confirm overlay and CLI apply"
```

---

### Task 9: Full gate

**Files:** none unless the gate reports a failure in this slice

- [ ] **Step 1: Run `pnpm check`**

Expected: build, tests, lint (warnings OK if pre-existing `display-layer.ts` `_dropped`), format:check all pass.

- [ ] **Step 2: Fix only slice failures (tsc, tests, format)**

Do not “fix” the leftover `.worktrees/feat/world-book-specialization` tree. Do not start relationship experts.

- [ ] **Step 3: Commit only if Step 2 produced fixes**

```
git add <fixed files>
git commit -m "fix: format assistant confirm pipeline files"
```
