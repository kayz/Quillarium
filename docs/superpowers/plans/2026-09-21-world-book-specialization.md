# World-Book Specialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authors can specialize a world-book card in place (same stable `id`, new `type`, file moved) without AI, and CLI plus AI card-conversion share that one core write path.

**Architecture:** Add `specializePlanningCard` in `@quillarium/core`. It is the only function allowed to change a planning card's `type` and move its file. Desktop form, CLI, and existing `card-conversion` apply all call it. Typed create shortcuts stay. Display layer and Agent fence stay out.

**Tech Stack:** TypeScript, pnpm workspace, Vitest, existing Markdown documents, Electron IPC, Commander CLI.

## Global Constraints

- Product spec: `docs/superpowers/specs/2026-09-21-world-book-specialization-design.md` (approved).
- Parent spec: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`.
- Same `id`. Change `type`. Move via `fileForDoc`, then delete the old file.
- Allowlist matches current AI conversion kinds: `world_entry`, `canon`, `character`, `character_relation`, `location`, `timeline_event`, `faction`, `faction_relation`, `faction_membership`, `foreshadowing`, `narrative`.
- World → any other allowlisted type. Non-world allowlisted type → only `world_entry`. Same type is not specialization.
- Required fields must be present before any write. Unset placeholder `__quillarium_unset_reference__` is forbidden.
- Drop keys the target schema does not own; append non-empty leftovers under `## 特化前摘录`.
- Fail closed on inbound `wrong-relation-target-type` against this card.
- Do not change display-layer / HTML card / CCv3.
- Do not change Agent expert-mode / generation runtime.
- Do not remove typed create shortcuts (`character add`, location module create, etc.).
- Do not migrate existing typed cards back to world-book.
- Style: no semicolons, single quotes, Prettier 110.
- Tests: `pnpm exec vitest run <file>`.

## Later plans (out of scope here)

1. Display layer as a project-level optional module on cards.
2. Agent expert-mode fence.

## File map

- Create: `packages/core/src/planning-specialize.ts` — allowlist, required fields, write path
- Create: `packages/core/src/planning-specialize.test.ts` — core contract
- Modify: `packages/core/src/index.ts` — `export * from './planning-specialize.js'`
- Modify: `packages/cli/src/index.ts` — `card specialize`
- Modify: `packages/cli/src/index.test.ts` — CLI round trip
- Modify: `docs/CLI.md` — specialize command
- Modify: `docs/DESIGN.md` — one paragraph under planning cards
- Modify: `apps/desktop/electron/ipc/contract.ts` — `planning:specialize` channel (count 162 → 163)
- Modify: `apps/desktop/electron/preload.ts` and `apps/desktop/electron/preload.cjs`
- Modify: `apps/desktop/electron/ipc/contract.test.ts` — expected channel count 163
- Modify: `apps/desktop/electron/ipc/planning.ts` — handler + type-change apply calls core
- Modify: `apps/desktop/electron/ipc/planning.test.ts` — conversion still passes; assert it uses core semantics
- Create: `apps/desktop/src/features/planning/SpecializeCardDialog.tsx`
- Create: `apps/desktop/src/features/planning/SpecializeCardDialog.test.tsx`
- Modify: `apps/desktop/src/features/modules/ModuleView.tsx` — author specialize control
- Modify: `apps/desktop/src/features/workspace/WorkspaceView.tsx` — wire specialize + reload

Do not add a second `scene_enabled`-style flag. Do not invent a new `DocType`.

---

### Task 1: Failing core tests for in-place specialize

**Files:**

- Create: `packages/core/src/planning-specialize.test.ts`
- Test: `packages/core/src/planning-specialize.test.ts`

**Interfaces:**

- Consumes: `createProjectAt`, `createWorldEntry`, `createCharacter`, `createCharacterRelation`, `listDocs`, `pathExists`
- Produces: the contract Task 2 must satisfy — `specializePlanningCard` from `./planning-specialize.js`

- [ ] **Step 1: Write the test file**

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCharacter, createCharacterRelation, createWorldEntry, listDocs } from './documents.js'
import { pathExists } from './fs.js'
import { specializePlanningCard } from './planning-specialize.js'
import { createProjectAt } from './project.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-specialize-'))
  roots.push(root)
  await createProjectAt(root, { id: 'spec-novel', title: '特化夹具' })
  return root
}

describe('specializePlanningCard', () => {
  it('moves a world entry to a character file and keeps the id', async () => {
    const root = await fixture()
    const source = await createWorldEntry(
      root,
      '林舟',
      { id: 'world-lin', triggers: ['林舟', '舟师'], story_setting: '北港水手' },
      '北港的舟师。'
    )
    const result = await specializePlanningCard(root, 'world-lin', 'character', {})
    expect(result.data.id).toBe('world-lin')
    expect(result.data.type).toBe('character')
    expect(result.path.replaceAll('\\', '/')).toContain('/characters/')
    expect(await pathExists(source)).toBe(false)
    expect(await listDocs(root, 'world_entry')).toEqual([])
    const characters = await listDocs(root, 'character')
    expect(characters).toHaveLength(1)
    expect(characters[0]!.data.id).toBe('world-lin')
    expect(characters[0]!.content).toContain('北港的舟师。')
    expect(characters[0]!.content).toContain('## 特化前摘录')
    expect(characters[0]!.content).toContain('triggers:')
    expect(JSON.stringify(characters[0]!.data)).not.toContain('story_setting')
  })

  it('refuses a relation specialize when endpoints are missing and does not write', async () => {
    const root = await fixture()
    const source = await createWorldEntry(root, '旧盟', { id: 'world-pact' }, '两人未点名。')
    await expect(specializePlanningCard(root, 'world-pact', 'character_relation', {})).rejects.toThrow(
      '特化缺少必填字段'
    )
    expect(await pathExists(source)).toBe(true)
    const [still] = await listDocs(root, 'world_entry')
    expect(still?.data.type).toBe('world_entry')
  })

  it('refuses when converting a referenced character would break typed relations', async () => {
    const root = await fixture()
    await createCharacter(root, '林澜', { id: 'character-lin' })
    await createCharacter(root, '顾衡', { id: 'character-gu' })
    await createCharacterRelation(root, '同僚', {
      id: 'rel-lin-gu',
      from_character: 'character-lin',
      to_character: 'character-gu',
      relation_type: 'colleague'
    })
    await expect(specializePlanningCard(root, 'character-lin', 'world_entry', {})).rejects.toThrow(
      '现有类型化引用失效'
    )
    const [character] = await listDocs(root, 'character')
    expect(character?.data.id).toBe('character-lin')
    expect(character?.data.type).toBe('character')
  })

  it('converts a character back to a world entry', async () => {
    const root = await fixture()
    const source = await createCharacter(root, '顾衡', { id: 'character-gu', desire: '守住北港' })
    const result = await specializePlanningCard(root, 'character-gu', 'world_entry', {})
    expect(result.data.type).toBe('world_entry')
    expect(result.path.replaceAll('\\', '/')).toContain('/world/')
    expect(await pathExists(source)).toBe(false)
    expect(await listDocs(root, 'character')).toEqual([])
    const [world] = await listDocs(root, 'world_entry')
    expect(world?.data.id).toBe('character-gu')
    expect(JSON.stringify(world?.data)).not.toContain('守住北港')
    expect(world?.content).toContain('desire:')
  })

  it('rejects a stale expected hash', async () => {
    const root = await fixture()
    const source = await createWorldEntry(root, '潮信', { id: 'world-tide' })
    await expect(
      specializePlanningCard(root, 'world-tide', 'location', {}, { expectedSha256: '0'.repeat(64) })
    ).rejects.toThrow('其它写入')
    expect(await pathExists(source)).toBe(true)
    expect((await listDocs(root, 'world_entry'))[0]?.data.type).toBe('world_entry')
  })

  it('rejects specializing a card to its current type', async () => {
    const root = await fixture()
    await createWorldEntry(root, '潮信', { id: 'world-tide' })
    await expect(specializePlanningCard(root, 'world-tide', 'world_entry', {})).rejects.toThrow(
      '目标类型与当前相同'
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run packages/core/src/planning-specialize.test.ts`

Expected: FAIL because `./planning-specialize.js` cannot be resolved / `specializePlanningCard` is not exported.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/planning-specialize.test.ts
git commit -m "test: expect in-place world-book specialization to keep ids"
```

---

### Task 2: Implement `specializePlanningCard`

**Files:**

- Create: `packages/core/src/planning-specialize.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/planning-specialize.test.ts`

**Interfaces:**

- Consumes: `listDocs`, `fileForDoc`, `writeMarkdown`, `readMarkdown`, `readText`, `pathExists`, schemas from `./schema.js`, `assertCardReferencesExist`, `validatePlanningCardGraph`, `withProjectWriteLock`, `sha256Text`
- Produces:

```ts
export const SPECIALIZATION_KINDS = [
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
] as const

export type SpecializationKind = (typeof SPECIALIZATION_KINDS)[number]

export function isSpecializationKind(type: string): type is SpecializationKind

export function specializationTargets(sourceType: string): SpecializationKind[]

export function requiredSpecializationFields(targetType: string): string[]

export async function specializePlanningCard(
  projectRoot: string,
  cardId: string,
  targetType: string,
  fields: Record<string, unknown>,
  options?: { content?: string; expectedSha256?: string }
): Promise<{ path: string; data: import('./types.js').DocumentIdentity; content: string }>
```

- [ ] **Step 1: Implement `packages/core/src/planning-specialize.ts`**

Use strict schemas (`characterSchema`, `worldEntrySchema`, …) — **not** `DOC_SCHEMAS` passthrough.

Logic:

1. `withProjectWriteLock`.
2. `listDocs(projectRoot)` and find `cardId`. Else throw `找不到设定卡：${cardId}`.
3. If `options?.expectedSha256`, compare `sha256Text(await readText(source.path))`; mismatch throw `设定卡已被其它写入更改。`.
4. If `source.data.type === targetType` throw `目标类型与当前相同，请直接保存。`.
5. `specializationTargets(source.data.type)` must include `targetType`, else throw `当前类型不能特化为 ${targetType}。`.
6. `requiredSpecializationFields(targetType)`: every key must be a non-empty string in `fields` and must not equal `__quillarium_unset_reference__`. Else throw `特化缺少必填字段：${missing.join('、')}`.
7. Build merged record: keep `id`, set `type`/`schema_version: 1`, title from `fields.title` or source title, copy `status` `tags` `enabled` `source_refs` `relations` `image` from source then overlay `fields`.
8. `schema.parse(merged)` for `targetType`.
9. If `targetType === 'character_relation'` and from === to, throw `人物关系必须连接两个不同的人物。`. Same for faction relation with `势力关系必须连接两个不同的势力。`.
10. `assertCardReferencesExist(parsed, documents)`.
11. Graph: documents with this id replaced by `{ path: nextPath, data: parsed, content }`. If `validatePlanningCardGraph` returns `wrong-relation-target-type` where `resolved_target_id === cardId`, throw the spec's inbound error listing `card_id.relation_field`.
12. `nextPath = fileForDoc(projectRoot, targetType, id, title)`. If `nextPath !== source.path` and `pathExists(nextPath)`, throw `特化目标文件已存在：${path.basename(nextPath)}`.
13. Body = `options.content ?? source.content` plus appendix of dropped non-empty source keys not present on parsed (`id`/`type`/`schema_version` skipped). Appendix header exactly `## 特化前摘录`.
14. `writeMarkdown(nextPath, parsed, body)`. Verify read-back id/type. If paths differ, `rm(source.path)`. On error: restore `source.path` from original bytes (`writeText`) and `rm(nextPath)` if it exists and differs from source.

`requiredSpecializationFields`:

- `character_relation` → `['from_character', 'to_character', 'relation_type']`
- `faction_relation` → `['from_faction', 'to_faction', 'relation_type']`
- `faction_membership` → `['faction_id', 'character_id']`
- else `[]`

`specializationTargets`: world_entry → all SPECIALIZATION_KINDS except `world_entry`; other allowlisted → `['world_entry']`; else `[]`.

Add `export * from './planning-specialize.js'` to `packages/core/src/index.ts` next to the other exports.

- [ ] **Step 2: Run the core tests**

Run: `pnpm exec vitest run packages/core/src/planning-specialize.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/planning-specialize.ts packages/core/src/planning-specialize.test.ts packages/core/src/index.ts
git commit -m "feat: specialize planning cards in place from core"
```

---

### Task 3: CLI `card specialize`

**Files:**

- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/index.test.ts`
- Modify: `docs/CLI.md`

**Interfaces:**

- Consumes: `specializePlanningCard`, `requiredSpecializationFields`
- Produces: Commander command `card specialize`

- [ ] **Step 1: Add a failing CLI test** in `packages/cli/src/index.test.ts` (reuse `initProject` / `run`):

After an existing world-entry create test if one exists; otherwise add a focused `describe('card specialize')`. `world add` has no `--id`, so seed with core:

```ts
  it('specializes a world entry into a character through the CLI', async () => {
    const { root } = await initProject()
    await createWorldEntry(root, 'Lin Zhou', { id: 'world-lin' }, 'A northern sailor.')
    await expect(run('card', 'specialize', 'world-lin', '--to', 'character_relation', '--project', root)).rejects.toThrow(
      '特化缺少必填字段'
    )
    expect((await listDocs(root, 'world_entry'))[0]?.data.type).toBe('world_entry')
    await run('card', 'specialize', 'world-lin', '--to', 'character', '--project', root)
    expect(await listDocs(root, 'world_entry')).toHaveLength(0)
    expect((await listDocs(root, 'character'))[0]?.data.id).toBe('world-lin')
  })
```

- [ ] **Step 2: Run it**

Run: `pnpm exec vitest run packages/cli/src/index.test.ts`

Expected: FAIL — unknown command `card`.

- [ ] **Step 3: Implement the command** in `packages/cli/src/index.ts`

Import `specializePlanningCard` and `requiredSpecializationFields`. Add:

```ts
  const card = program.command('card').description('Specialize or inspect setting cards')
  projectOption(
    card
      .command('specialize')
      .argument('<id>', 'Stable card id')
      .requiredOption('--to <type>', 'Target document type')
      .option('--from-character <id>', 'character_relation.from_character')
      .option('--to-character <id>', 'character_relation.to_character')
      .option('--relation-type <text>', 'Relation type')
      .option('--from-faction <id>', 'faction_relation.from_faction')
      .option('--to-faction <id>', 'faction_relation.to_faction')
      .option('--faction <id>', 'faction_membership.faction_id')
      .option('--character <id>', 'faction_membership.character_id')
      .description('Change this card type in place; keep the stable id')
  ).action(async (id, opts) => {
    const fields: Record<string, unknown> = {}
    if (opts.fromCharacter) fields.from_character = opts.fromCharacter
    if (opts.toCharacter) fields.to_character = opts.toCharacter
    if (opts.relationType) fields.relation_type = opts.relationType
    if (opts.fromFaction) fields.from_faction = opts.fromFaction
    if (opts.toFaction) fields.to_faction = opts.toFaction
    if (opts.faction) fields.faction_id = opts.faction
    if (opts.character) fields.character_id = opts.character
    const missing = requiredSpecializationFields(opts.to).filter((key) => !fields[key])
    if (missing.length) {
      throw new Error(`特化缺少必填字段：${missing.join('、')}`)
    }
    const result = await specializePlanningCard(path.resolve(opts.project), id, opts.to, fields)
    console.log(result.path)
  })
```

Keep `character add` / `world add` unchanged.

- [ ] **Step 4: Document** in `docs/CLI.md` after the world/character create examples:

```markdown
New setting cards can start as world entries and later specialize in place (same id):

```bash
pnpm cli world add "Lin Zhou" --project "./writing-workspace/projects/my-novel"
pnpm cli card specialize <world-id> --to character --project "./writing-workspace/projects/my-novel"
```

`character add` and other typed create commands remain available as shortcuts.
```

- [ ] **Step 5: Run CLI tests**

Run: `pnpm exec vitest run packages/cli/src/index.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/index.test.ts docs/CLI.md
git commit -m "feat: specialize setting cards from the CLI"
```

---

### Task 4: Desktop author specialize control

**Files:**

- Modify: `apps/desktop/electron/ipc/contract.ts` (add channel; bump contract test from 162 to 163)
- Modify: `apps/desktop/electron/preload.ts`, `apps/desktop/electron/preload.cjs`
- Modify: `apps/desktop/electron/ipc/contract.test.ts`
- Modify: `apps/desktop/electron/ipc/planning.ts` — `typedHandle('planning:specialize', ...)`
- Create: `apps/desktop/src/features/planning/SpecializeCardDialog.tsx`
- Create: `apps/desktop/src/features/planning/SpecializeCardDialog.test.tsx`
- Modify: `apps/desktop/src/features/modules/ModuleView.tsx`
- Modify: `apps/desktop/src/features/workspace/WorkspaceView.tsx`

**Interfaces:**

- Consumes: `specializePlanningCard`, `specializationTargets`, `requiredSpecializationFields`
- Produces: `bridge.specializePlanningCard(root, cardId, targetType, fields, expectedSha256?)`

- [ ] **Step 1: Add IPC channel**

In `IpcContract`:

```ts
  'planning:specialize': {
    request: [
      root: string,
      cardId: string,
      targetType: string,
      fields: Record<string, unknown>,
      expectedSha256?: string
    ]
    response: { path: string; data: DocumentIdentity; content: string }
  }
```

In `QUILLARIUM_API_CHANNELS`: `specializePlanningCard: 'planning:specialize'`

preload.ts:

```ts
  specializePlanningCard: (root, cardId, targetType, fields, expectedSha256) =>
    invoke('planning:specialize', root, cardId, targetType, fields, expectedSha256),
```

Mirror in `preload.cjs` with `ipcRenderer.invoke('planning:specialize', ...)`.

In `planning.ts` `registerPlanningHandlers`:

```ts
  typedHandle('planning:specialize', async (_event, root, cardId, targetType, fields, expectedSha256) =>
    specializePlanningCard(root, cardId, targetType, fields, { expectedSha256 })
  )
```

Change `contract.test.ts` expected count **162 → 163**.

- [ ] **Step 2: Run contract test**

Run: `pnpm exec vitest run apps/desktop/electron/ipc/contract.test.ts`

Expected: PASS after all three files list the new channel.

- [ ] **Step 3: Dialog + ModuleView**

`SpecializeCardDialog.tsx`: given `language`, `sourceType`, `onCancel`, `onConfirm(targetType, fields)`. Select from `specializationTargets(sourceType)`. For each `requiredSpecializationFields(target)` show a text input. Confirm disabled while required values are empty. Labels: 特化为 / Specialize; 转回世界书 if the only target is `world_entry`.

`SpecializeCardDialog.test.tsx`: `renderToStaticMarkup` — world_entry dialog includes a character option; confirm button disabled until relation fields filled when target is `character_relation`.

`ModuleView.tsx`: next to the existing AI convert shortcut, add a button `特化` / `Specialize` that opens the dialog (not the AI session). On confirm call `onSpecializeCard(doc, targetType, fields)` provided by WorkspaceView:

```ts
  const specializePlanningCard = async (
    card: DocEntry,
    targetType: string,
    fields: Record<string, unknown>
  ) => {
    await bridge.specializePlanningCard(root, card.data.id, targetType, fields)
    await load()
  }
```

Do not remove `onAIConvertCard`. Do not add the dialog to OutlineHome/VolumeHome this slice.

- [ ] **Step 4: Run dialog + contract tests**

Run: `pnpm exec vitest run apps/desktop/src/features/planning/SpecializeCardDialog.test.tsx apps/desktop/electron/ipc/contract.test.ts apps/desktop/src/features/modules/ModuleView.test.tsx`

Expected: PASS. If ModuleView.test needs the new optional callback, add a noop default.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/ipc/contract.ts apps/desktop/electron/ipc/contract.test.ts apps/desktop/electron/preload.ts apps/desktop/electron/preload.cjs apps/desktop/electron/ipc/planning.ts apps/desktop/src/features/planning/SpecializeCardDialog.tsx apps/desktop/src/features/planning/SpecializeCardDialog.test.tsx apps/desktop/src/features/modules/ModuleView.tsx apps/desktop/src/features/workspace/WorkspaceView.tsx
git commit -m "feat: let authors specialize setting cards without AI"
```

---

### Task 5: AI card-conversion apply uses core

**Files:**

- Modify: `apps/desktop/electron/ipc/planning.ts`
- Test: `apps/desktop/electron/ipc/planning.test.ts`

**Interfaces:**

- Consumes: `specializePlanningCard`
- Produces: type-changing confirmed updates no longer hand-write/move files in IPC

- [ ] **Step 1: In `applyPlanningProposalTransaction`, for `update.changing_type`**

Replace the `writeMarkdown(update.target, …)` + later `removeFile(update.source)` for that update with:

```ts
      if (update.changing_type) {
        const specialized = await specializePlanningCard(
          root,
          String(update.current_data['id']),
          resolvedDraft.kind,
          { ...resolvedDraft.fields, title: resolvedDraft.title },
          {
            content: resolvedDraft.content,
            expectedSha256: update.proposal.target?.expected_sha256
          }
        )
        writtenTargets.push(specialized.path)
        appliedDrafts.set(update.proposal.id, resolvedDraft)
        results.push({
          proposal_id: update.proposal.id,
          operation: 'update',
          path: specialized.path,
          document: { data: specialized.data as unknown as Record<string, unknown>, content: specialized.content },
          source_sha256: sha256Text(await readText(specialized.path))
        })
        continue
      }
```

Keep create proposals and same-type updates on the existing path. Keep session rollback: if specialize throws, it already restored the source file; do not double-delete. Skip `removeFile(update.source)` for updates already handled by specialize (filter `changing_type` removals that specialize already deleted).

Do not change `planningConversionKinds` allowlist.

- [ ] **Step 2: Run planning conversion tests**

Run: `pnpm exec vitest run apps/desktop/electron/ipc/planning.test.ts`

Expected: PASS, including Canon ↔ World atomic conversion and inbound type-conflict cases.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/ipc/planning.ts
git commit -m "fix: run AI card conversion through core specialization"
```

---

### Task 6: DESIGN.md note

**Files:**

- Modify: `docs/DESIGN.md` in the planning-card / reversible visibility area (near setting cards, around the existing world_entry discussion)

**Interfaces:** none

- [ ] **Step 1: Add 4–6 wrapping lines (~100 cols)** stating: new setting facts can start as `world_entry`; authors may specialize in place (stable id, file moves); typed creates remain; AI `card-conversion` uses the same core write; display-layer unchanged.

- [ ] **Step 2: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs: describe in-place world-book specialization"
```

---

### Task 7: Full gate

- [ ] **Step 1: Slice tests**

Run:

```bash
pnpm exec vitest run packages/core/src/planning-specialize.test.ts packages/cli/src/index.test.ts apps/desktop/electron/ipc/contract.test.ts apps/desktop/electron/ipc/planning.test.ts apps/desktop/src/features/planning/SpecializeCardDialog.test.tsx
```

Expected: PASS

- [ ] **Step 2: `pnpm check`**

Expected: `tsc -b`, Vitest, lint, and `format:check` PASS.

If an unrelated file fails, stop and report. Do not start display-layer or Agent work.

---
