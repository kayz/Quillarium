# Agent Expert Fence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify Agent tasks into expert / generation / display lanes; expert entry cannot generate prose; `continuity-check` becomes author-clicked chapter-prose eval that yields unconfirmed issue and setting proposals.

**Architecture:** Core owns `lane` on `AgentTaskDefinitionV1`, chapter-prose gating, and confirm-to-write apply. `@quillarium/agent-runtime` adds `executeExpertTask` (lane check then `executeAgentTask`) and a `continuity-check` handler. Scene generation keeps its own IPC. Desktop adds two `expert:*` channels (172 → 174). CLI evaluates only.

**Tech Stack:** TypeScript, pnpm workspace, Vitest, Zod, existing Electron IPC, Commander CLI, existing `executeAgentTask` / `specializePlanningCard` / `createIssue` / `createWorldEntry`.

## Global Constraints

- Product spec: `docs/superpowers/specs/2026-09-22-agent-expert-fence-design.md` (approved).
- Parent spec: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`.
- Expert tasks must not include `generate_candidate`. Generation and display tasks must not enter `executeExpertTask`.
- Evaluate only existing chapter prose. Empty / missing prose: `没有章正文，不能评估。` No model call.
- Author click only. Open/save/commit chapter / toggle scene module must not evaluate.
- Facade writes no project fact files. Apply happens only after author confirm.
- Setting proposals default `world_entry`. Typed specialize uses `specializePlanningCard` required fields. Failure rolls back the new card.
- Exact errors: `专家门面只接受专家任务。` / `专家模式不能生成正文。` / `没有章正文，不能评估。` / `提案尚未确认，不能写入。`
- `planning-integrity-review` stays a separate expert button. Do not merge with chapter eval.
- Do not change scene generation, CCv3, covers, display images, or `finalization-review` apply semantics.
- Style: no semicolons, single quotes, Prettier 110.
- Tests: `pnpm exec vitest run <file>`. Full gate `pnpm check`.
- IPC channel count is currently **172**; this slice adds **2** (`expert:evaluateChapter`, `expert:applyChapterEval`) → **174**.

## Later plans (out of scope here)

1. Outline / world-book organize expert.
2. Relationship and foreshadowing expert tasks.
3. Migrating remaining legacy AI flows into runtime.

## File map

- Modify: `packages/core/src/agent-tasks.ts` — `lane`; strip `character-rehearsal` `generate_candidate`
- Create: `packages/core/src/agent-tasks.test.ts`
- Create: `packages/core/src/chapter-eval.ts` — load prose, apply proposals
- Create: `packages/core/src/chapter-eval.test.ts`
- Modify: `packages/core/src/index.ts` — export
- Create: `packages/agent-runtime/src/expert-facade.ts`
- Create: `packages/agent-runtime/src/expert-facade.test.ts`
- Create: `packages/agent-runtime/src/tasks/continuity-check.ts`
- Modify: `packages/agent-runtime/src/executor.ts` — register continuity-check
- Modify: `packages/agent-runtime/src/index.ts` — export facade
- Modify: `apps/desktop/electron/ipc/contract.ts` / `preload.ts` / `preload.cjs` / `contract.test.ts` — 172 → 174
- Create: `apps/desktop/electron/ipc/expert.ts`
- Modify: `apps/desktop/electron/ipc/index.ts`
- Modify: `apps/desktop/src/features/writing/ChapterProseWorkspace.tsx` + test
- Modify: `packages/cli/src/index.ts` + `index.test.ts` — `expert evaluate-chapter`
- Modify: `docs/DESIGN.md`, `docs/CLI.md`

Do not route `scene-generation` through the facade. Do not add an expert project flag.

---

### Task 1: Failing tests for task lanes

**Files:**

- Create: `packages/core/src/agent-tasks.test.ts`
- Test: `packages/core/src/agent-tasks.test.ts`

**Interfaces:**

- Consumes: `listAgentTaskDefinitions`, `getAgentTaskDefinition` from `./agent-tasks.js`
- Produces: contract for Task 2 — every definition has `lane`; `character-rehearsal` has no `generate_candidate`

- [ ] **Step 1: Write the test file**

```ts
import { describe, expect, it } from 'vitest'
import { getAgentTaskDefinition, listAgentTaskDefinitions } from './agent-tasks.js'

describe('agent task lanes', () => {
  it('labels every builtin task and keeps expert tasks from generating prose', () => {
    const lanes: Record<string, string> = Object.fromEntries(
      listAgentTaskDefinitions().map((task) => [task.id, task.lane])
    )
    expect(lanes).toMatchObject({
      'import-material': 'expert',
      'planning-card': 'expert',
      'organize-setting': 'expert',
      'continuity-review': 'expert',
      'continuity-check': 'expert',
      'finalization-review': 'expert',
      'character-rehearsal': 'expert',
      'scene-generation': 'generation',
      'setting-card-design': 'display',
      'display-card-design': 'display'
    })
    for (const task of listAgentTaskDefinitions()) {
      if (task.lane === 'expert') expect(task.capability_ceiling).not.toContain('generate_candidate')
    }
    expect(getAgentTaskDefinition('character-rehearsal').allowed_result_types).not.toContain('candidate')
    expect(getAgentTaskDefinition('continuity-check')).toMatchObject({
      capability_ceiling: expect.arrayContaining(['propose_issue', 'propose_planning_record']),
      allowed_result_types: expect.arrayContaining(['issue_proposal', 'planning_proposal'])
    })
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm exec vitest run packages/core/src/agent-tasks.test.ts`

Expected: FAIL — `lane` missing on definitions.

- [ ] **Step 3: Commit**

`test: expect agent tasks to declare expert generation and display lanes`

---

### Task 2: Add lanes and strip rehearsal generation

**Files:**

- Modify: `packages/core/src/agent-tasks.ts`
- Test: `packages/core/src/agent-tasks.test.ts`

**Interfaces:**

- Consumes: Task 1 tests
- Produces: `AgentTaskDefinitionV1.lane: 'expert' | 'generation' | 'display'`

- [ ] **Step 1: Schema + definitions**

Add to `agentTaskDefinitionV1Schema`:

```ts
lane: z.enum(['expert', 'generation', 'display'])
```

Set `lane` on every object in `definitions` per Task 1 table.

On `character-rehearsal` remove `'generate_candidate'` from `capability_ceiling` and `'candidate'` from `allowed_result_types`.

On `continuity-check` set:

```ts
capability_ceiling: ['propose_issue', 'propose_planning_record'],
allowed_result_types: ['issue_proposal', 'planning_proposal']
```

If `packages/core/src/creator-assistants.test.ts` or `assistant-workflows.test.ts` assert rehearsal `generate_candidate`, change those assertions to match the expert ceiling. Do not keep a second generation path on rehearsal.

- [ ] **Step 2: Run**

`pnpm exec vitest run packages/core/src/agent-tasks.test.ts`

Expected: PASS.

If creator-assistant tests fail, run those files and only update assertions about rehearsal `generate_candidate` / `candidate`.

- [ ] **Step 3: Commit**

`feat: classify agent tasks into expert generation and display lanes`

---

### Task 3: Chapter prose gate + apply API (failing tests then impl)

**Files:**

- Create: `packages/core/src/chapter-eval.ts`
- Create: `packages/core/src/chapter-eval.test.ts`
- Modify: `packages/core/src/index.ts` — `export * from './chapter-eval.js'`
- Test: `packages/core/src/chapter-eval.test.ts`

**Interfaces:**

- Consumes: `createProjectAt`, `createOutline`, `createChapterProse`, `createIssue`, `createWorldEntry`, `specializePlanningCard`, `listDocs`, `writeMarkdown`
- Produces:

```ts
export const NO_CHAPTER_PROSE = '没有章正文，不能评估。'
export const UNCONFIRMED_EVAL = '提案尚未确认，不能写入。'

export async function loadChapterProseForEval(
  projectRoot: string,
  chapterId: string
): Promise<{ path: string; data: { id: string; chapter_id: string }; content: string } | null>

export interface ChapterEvalIssueProposal {
  proposal_id: string
  title: string
  body: string
}

export interface ChapterEvalSettingProposal {
  proposal_id: string
  title: string
  content: string
  type: 'world_entry'
  fields: Record<string, unknown>
}

export interface ChapterEvalProposalSet {
  eval_id: string
  chapter_id: string
  issues: ChapterEvalIssueProposal[]
  settings: ChapterEvalSettingProposal[]
}

export async function applyChapterEval(
  projectRoot: string,
  proposals: ChapterEvalProposalSet,
  decisions: {
    confirmed: boolean
    issues: string[]
    settings: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
  }
): Promise<{ issue_ids: string[]; setting_ids: string[] }>
```

- [ ] **Step 1: Failing tests**

Use `createOutline` for book/volume/chapter like `chapter-lifecycle.test.ts`. After `createChapterProse`, `writeMarkdown` a non-empty body for the happy path.

Cases:

1. Empty or missing chapter prose → `loadChapterProseForEval` is `null`.
2. `applyChapterEval` with `confirmed: false` throws `提案尚未确认，不能写入。` and `listDocs` has no new issue / world_entry.
3. Confirm one issue + one setting (`world_entry`) → files exist; card YAML `type: world_entry`.
4. Confirm setting with `type: 'character'` and required fields empty → throws the existing specialize missing-fields error (`特化缺少必填字段：`); no leftover world file.
5. Confirm setting with `type: 'character'` and required fields filled (use whatever `requiredSpecializationFields('character')` returns — currently none, so empty fields object is enough) → file ends in characters dir with `type: character`.

- [ ] **Step 2: Implement `chapter-eval.ts`**

`loadChapterProseForEval`: `listDocs(projectRoot, 'chapter_prose')`, match `data.chapter_id`, require `content.trim()`.

`applyChapterEval`: if `!decisions.confirmed` throw `UNCONFIRMED_EVAL`. `withProjectWriteLock`. Create confirmed issues via `createIssue` with `related_docs: [proposals.chapter_id]`. For each confirmed setting: `createWorldEntry` then if `type` is set and not `world_entry`, `specializePlanningCard(root, newId, type, fields)`; on specialize throw, `rm` the new file (and any moved path if specialize already moved — prefer: specialize inside the same lock; if it throws before `rm` of source, delete the created world file). Collect ids.

Do not call any model.

- [ ] **Step 3: Run**

`pnpm exec vitest run packages/core/src/chapter-eval.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

`feat: apply confirmed chapter-eval proposals without writing on cancel`

---

### Task 4: Expert facade (failing tests then impl)

**Files:**

- Create: `packages/agent-runtime/src/expert-facade.ts`
- Create: `packages/agent-runtime/src/expert-facade.test.ts`
- Modify: `packages/agent-runtime/src/index.ts`
- Test: `packages/agent-runtime/src/expert-facade.test.ts`

**Interfaces:**

- Consumes: `getAgentTaskDefinition`, `loadChapterProseForEval`, `executeAgentTask`
- Produces:

```ts
export const EXPERT_LANE_ONLY = '专家门面只接受专家任务。'
export const EXPERT_NO_PROSE_GEN = '专家模式不能生成正文。'

export async function executeExpertTask(
  request: {
    projectRoot: string
    task_id: string
    input: Record<string, unknown>
  },
  dependencies?: AgentRuntimeDependencies
): Promise<AgentExecutionOutcome>
```

- [ ] **Step 1: Failing tests** (temp project via `createProjectAt`)

1. `task_id: 'scene-generation'` throws `Error` whose message is `专家门面只接受专家任务。` — do not call `invokeProvider` (pass a `vi.fn` provider, expect 0 calls).
2. `task_id: 'display-card-design'` same error, 0 provider calls.
3. `task_id: 'continuity-check'` with a chapter that has no prose file throws `没有章正文，不能评估。`, 0 provider calls.
4. After writing empty prose file content, same throw.

Export thrown errors as `Error` with those exact messages (not runtime typed failure) so CLI/desktop `formatDesktopError` shows Chinese. If `executeAgentTask` uses typed failures internally after the gate passes, that is fine.

- [ ] **Step 2: Implement gate in `expert-facade.ts`**

```ts
import { getAgentTaskDefinition, loadChapterProseForEval } from '@quillarium/core'

export async function executeExpertTask(request, dependencies) {
  if (request.task_id === 'planning-integrity-review') {
    return executeAgentTask({ ...request, task_id: 'planning-integrity-review' }, dependencies)
  }
  let definition
  try {
    definition = getAgentTaskDefinition(request.task_id)
  } catch {
    throw new Error(EXPERT_LANE_ONLY)
  }
  if (definition.lane !== 'expert') throw new Error(EXPERT_LANE_ONLY)
  if (definition.capability_ceiling.includes('generate_candidate')) throw new Error(EXPERT_NO_PROSE_GEN)
  if (request.task_id === 'continuity-check') {
    const chapterId = String(request.input.chapter_id ?? '')
    const prose = await loadChapterProseForEval(request.projectRoot, chapterId)
    if (!prose) throw new Error('没有章正文，不能评估。')
  }
  return executeAgentTask(
    {
      schema_version: 1,
      task_id: request.task_id,
      projectRoot: request.projectRoot,
      target:
        request.task_id === 'continuity-check'
          ? { type: 'chapter_prose', id: String(request.input.chapter_id ?? '') }
          : null,
      input: request.input,
      language: 'zh',
      requested_by: 'author'
    },
    dependencies
  )
}
```

Match `AgentRuntimeExecutionRequest` exactly (`schema_version`, `target`, `language`, `requested_by`, `projectRoot`). For continuity-check tests in this task, after the prose gate `executeAgentTask` may return `AGENT_TASK_NOT_REGISTERED`; **this task's tests must not require a successful model run**. Only assert the four fail-closed cases.

If `getAgentTaskDefinition('planning-integrity-review')` throws, keep the explicit `task_id === 'planning-integrity-review'` branch so the existing planning-check IPC can later call the facade without being in the V1 enum. This task does not have to test that branch beyond not throwing on lane lookup.

- [ ] **Step 3: Run**

`pnpm exec vitest run packages/agent-runtime/src/expert-facade.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

`feat: reject generation and empty chapters at the expert facade`

---

### Task 5: continuity-check handler (eval does not write)

**Files:**

- Create: `packages/agent-runtime/src/tasks/continuity-check.ts`
- Modify: `packages/agent-runtime/src/executor.ts` — register definition + handler
- Modify: `packages/agent-runtime/src/expert-facade.test.ts` — add success case
- Test: `packages/agent-runtime/src/expert-facade.test.ts`

**Interfaces:**

- Consumes: Task 4 facade, `executeAgentTask` handler contract (`prepare` / `decode` / `aggregate`)
- Produces: eval result with `issues` and `settings` arrays; **zero** new issue/world files until apply

Follow `PLANNING_INTEGRITY_REVIEW_DEFINITION` shape (V2). Suggested:

```ts
export const CONTINUITY_CHECK_DEFINITION: AgentTaskDefinitionV2 = {
  schema_version: 2,
  id: 'continuity-check',
  title: 'Chapter prose expert evaluation',
  input_schema_id: 'continuity-check-input-v1',
  output_schema_id: 'continuity-check-output-v1',
  target_types: ['chapter_prose'],
  context_scopes: ['current-target', 'timeline', 'character-state', 'location', 'canon'],
  capability_ceiling: ['read_project', 'compile_context', 'invoke_model', 'propose_issue'],
  allowed_result_types: ['proposal'],
  result_disposition: 'proposal',
  execution_mode: 'single',
  connection_profile: 'check',
  output_mode: 'structured',
  timeout_ms: 90_000,
  approval_policy: 'author-required'
}
```

Input: `{ chapter_id: z.string().min(1) }`.

Model JSON:

```ts
{
  issues: Array<{ title: string; body: string }>
  settings: Array<{ title: string; content: string }>
}
```

`aggregate` maps to `ChapterEvalProposalSet` (`eval_id` = execution id, every `type: 'world_entry'`, `fields: {}`, generated `proposal_id`s).

`prepare` must load chapter prose via `loadChapterProseForEval` and put title+body into prompt blocks. If null, throw `没有章正文，不能评估。` (facade already checks; keep it in prepare too).

Register in `executor.ts` `AgentTaskRegistry` arrays beside planning-integrity and setting-card handlers.

- [ ] **Step 1: Extend facade test**

Fixture: book/volume/chapter + `createChapterProse` + non-empty content.

Fake `invokeProvider` returning one issue titled `时间线冲突` and one setting titled `北港`.

Call `executeExpertTask({ task_id: 'continuity-check', input: { chapter_id } }, { invokeProvider, loadAIProfile })`.

Assert:

- outcome is success (match how `executor.test.ts` reads results)
- `listDocs(root, 'issue')` still empty
- `listDocs(root, 'world_entry')` still empty
- result contains those titles

Copy `loadAIProfile` mock from `executor.test.ts` (check profile with api key). If execute needs `target: { type, id }`, set `type: 'chapter_prose'` and the prose document id.

- [ ] **Step 2: Implement handler + registry**

Do not write issues inside `aggregate`.

- [ ] **Step 3: Run**

`pnpm exec vitest run packages/agent-runtime/src/expert-facade.test.ts packages/agent-runtime/src/executor.test.ts`

Expected: PASS (existing executor tests still pass with the extra registered task).

- [ ] **Step 4: Commit**

`feat: evaluate chapter prose through continuity-check without writing`

---

### Task 6: Desktop IPC and 评估章 button

**Files:**

- Modify: `apps/desktop/electron/ipc/contract.ts` — add 2 channels; count **172 → 174**
- Modify: `apps/desktop/electron/ipc/contract.test.ts`
- Modify: `apps/desktop/electron/preload.ts`, `preload.cjs`
- Create: `apps/desktop/electron/ipc/expert.ts`
- Modify: `apps/desktop/electron/ipc/index.ts`
- Modify: `apps/desktop/src/features/writing/ChapterProseWorkspace.tsx`
- Modify: `apps/desktop/src/features/writing/ChapterProseWorkspace.test.tsx`
- Wire evaluate/apply from `WorkspaceView.tsx` only if the button needs a bridge callback; keep existing `onExtractSettings` / finalization UI unchanged

**Channels:**

```ts
'expert:evaluateChapter': { request: [root: string, chapterId: string]; response: ChapterEvalProposalSet }
'expert:applyChapterEval': {
  request: [root: string, proposals: ChapterEvalProposalSet, decisions: {
    confirmed: boolean
    issues: string[]
    settings: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
  }]
  response: { issue_ids: string[]; setting_ids: string[] }
}
```

Evaluate handler: `executeExpertTask` then map the aggregate result. Apply handler: `applyChapterEval`.

UI: when `doc.content.trim()` is non-empty, show button `评估章` (en: `Evaluate chapter`). When empty, do not show it. Clicking must not run on save/finalize/publish/extract.

Do not call evaluate from `load()`, extract, finalize, or publish.

- [ ] **Step 1: RED channel count 174**

`pnpm exec vitest run apps/desktop/electron/ipc/contract.test.ts`

Expected: FAIL still 172.

- [ ] **Step 2: Handlers + UI**

Static markup test: with non-empty `doc.content` expect `评估章`; with `content: ''` expect it absent.

- [ ] **Step 3: Run**

`pnpm exec vitest run apps/desktop/electron/ipc/contract.test.ts apps/desktop/src/features/writing/ChapterProseWorkspace.test.tsx`

Expected: PASS at 174.

- [ ] **Step 4: Commit**

`feat: let authors evaluate chapter prose from the expert facade`

---

### Task 7: CLI `expert evaluate-chapter`

**Files:**

- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/index.test.ts`
- Modify: `docs/CLI.md` — usage + command map row

**Command:**

```text
quill expert evaluate-chapter --project <path> --chapter-id <id>
```

No apply flag this slice. Prints a one-line summary `chapter-eval: issues=<n> settings=<n>` on success. Missing prose: throw `没有章正文，不能评估。`. Do not add a generate subcommand.

If the CLI test file mocks `@quillarium/core`, extend the mock with `loadChapterProseForEval` / whatever the CLI imports, or call through `executeExpertTask` and mock `@quillarium/agent-runtime` the same way other agent CLI tests do. Prefer a real temp project if neighboring tests already do.

- [ ] **Step 1: Failing CLI test** next to an existing project CLI case: chapter without prose refuses; with prose (provider mocked) does not create issue files.

- [ ] **Step 2: Implement command group `expert`.**

- [ ] **Step 3: Run**

`pnpm exec vitest run packages/cli/src/index.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

`feat: evaluate chapter prose from the CLI without applying`

---

### Task 8: DESIGN.md

**Files:**

- Modify: `docs/DESIGN.md` after the Agent runtime paragraph (~line 26–41)
- Modify: `docs/CLI.md` if Task 7 missed the command-map row

- [ ] **Step 1:** 4–6 lines: expert lane vs scene generation; facade rejects prose generation; chapter eval is click-to-run on existing chapter prose; proposals need confirm; planning-integrity check stays a separate control.

- [ ] **Step 2: Commit**

`docs: describe the expert-mode facade and chapter evaluation`

---

### Task 9: Full gate

- [ ] **Step 1:**

```
pnpm exec vitest run packages/core/src/agent-tasks.test.ts packages/core/src/chapter-eval.test.ts packages/agent-runtime/src/expert-facade.test.ts packages/cli/src/index.test.ts apps/desktop/electron/ipc/contract.test.ts apps/desktop/src/features/writing/ChapterProseWorkspace.test.tsx
```

Expected: PASS

- [ ] **Step 2:** `pnpm check`

Expected: tsc, Vitest, lint, format:check PASS.

If an unrelated file fails, stop. Do not start outline-organize experts.

---
