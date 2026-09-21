# Scene Module Chapter Commit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scene/AI-writing path a chapter-mounted module whose output is chapter prose written only after every scene in that chapter is confirmed.

**Architecture:** Keep `story_structure.scene_enabled` as the project-level module switch (already hides the scene tree and AI writing UI). Change `acceptSceneIntoChapter` so a confirmed scene stays on the scene file until the whole chapter is ready, then write all confirmed scene prose into `chapter_prose` in one step. Do not add a second flag. Do not migrate generation into `agent-runtime` in this plan.

**Tech Stack:** TypeScript, pnpm workspace, Vitest, existing `@quillarium/core` Markdown lifecycle, Electron IPC and Commander CLI as thin callers.

## Global Constraints

- Product spec: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md` (approved).
- Delivery unit is the chapter (outline + chapter prose). Scenes exist only inside the optional AI-writing module.
- Target scene size remains `section_words` default **1000**.
- Scene outline (`outline_content` / scene Markdown before confirm) is the generation prompt for that chunk.
- Unconfirmed work must not write chapter prose.
- When `scene_enabled` is false: do not show scenes in the writing UI; leave existing scene files on disk.
- Do not invent a parallel `DocType` or a second `scene_enabled` field.
- Do not change Agent runtime migration in this plan.
- Do not change display-layer / HTML card / CCv3 behavior in this plan.
- Match existing code style: no semicolons, single quotes, 110-character Prettier width.
- Tests run with `pnpm exec vitest run <file>`.

## Later plans (out of scope here)

The approved spec has three more subsystems. Implement them as separate plans after this one ships:

1. World-book-first specialization and type-specific management.
2. Display layer as a project-level optional module on cards.
3. Agent expert-mode fence (eval/organize only; generation stays in this scene module).

## File map

- Modify: `packages/core/src/chapter-lifecycle.ts` — confirm vs chapter commit
- Modify: `packages/core/src/chapter-lifecycle.test.ts` — new contract
- Modify: `packages/core/src/outline-rules.ts` — writer-facing default constant for new projects
- Modify: `apps/desktop/electron/ipc/local-workspace.ts` — new desktop projects start with scenes off
- Modify: `packages/cli/src/index.ts` — new workspace projects start with scenes off
- Modify: `packages/cli/src/runs.ts` — accept command copy
- Modify: `apps/desktop/src/features/writing/ChapterProseWorkspace.tsx` — author-facing copy
- Modify: `apps/desktop/src/features/writing/AIWritingWorkspace.tsx` — author-facing copy
- Modify: `apps/desktop/src/features/metadata/field-presentation.ts` — `accepted_at` / `scene_ids` help text
- Modify: `apps/desktop/src/features/workspace/Workspace.tsx` — delete-scene dialog copy
- Modify: `docs/DESIGN.md` — chapter lifecycle paragraph only
- Test: existing `packages/cli/src/index.test.ts` and desktop writing tests if copy assertions break

---

### Task 1: Failing tests for deferred chapter commit

**Files:**

- Modify: `packages/core/src/chapter-lifecycle.test.ts`
- Test: `packages/core/src/chapter-lifecycle.test.ts`

**Interfaces:**

- Consumes: existing `acceptSceneIntoChapter`, `createScene`, `loadChapterLifecycle`, `finalizeChapter`
- Produces: the contract later tasks must satisfy — first confirmed scene does not write chapter prose when another scene is still open; last confirmation writes every confirmed scene in order

- [ ] **Step 1: Rewrite the two-scene assertion in the existing lifecycle test**

In `packages/core/src/chapter-lifecycle.test.ts`, inside `it('accepts scenes in order and locks AI after finalization'...)`, replace the block that currently expects chapter prose after the first accept:

```ts
await expect(acceptSceneIntoChapter(root, 'scene-two', '后文。')).rejects.toThrow('先接受前一节')
await acceptSceneIntoChapter(root, 'scene-one', '开篇正文。')
const afterFirst = await loadChapterLifecycle(root, 'chapter')
expect(afterFirst.prose.content.trim()).toBe('')
expect(afterFirst.prose.data.scene_ids).toEqual([])
expect(afterFirst.scenes[0].data.accepted_at).toBeTruthy()
expect(afterFirst.scenes[0].content).toContain('开篇正文。')
await expect(finalizeChapter(root, 'chapter')).rejects.toThrow('unaccepted')
await acceptSceneIntoChapter(root, 'scene-two', '后文。')
const afterAll = await loadChapterLifecycle(root, 'chapter')
expect(afterAll.prose.content.trim()).toBe('开篇正文。后文。')
expect(afterAll.prose.data.scene_ids).toEqual(['scene-one', 'scene-two'])
```

Keep the rest of that test (finalize, AI lock) unchanged.

- [ ] **Step 2: Add a handwritten-conflict test after the two-scene test**

```ts
it('refuses to commit confirmed scenes over handwritten chapter prose', async () => {
  const root = await fixture()
  const lifecycle = await loadChapterLifecycle(root, 'chapter')
  await writeMarkdown(
    lifecycle.prose.path,
    lifecycle.prose.data as unknown as Record<string, unknown>,
    '作者手写的章正文。'
  )
  await createScene(root, '第一节', {
    id: 'scene-one',
    chapter_id: 'chapter',
    section: 'chapter',
    order: 0,
    timeline_node: 'timeline-opening',
    location: 'location-room',
    pov: 'character-protagonist'
  })
  await expect(acceptSceneIntoChapter(root, 'scene-one', '生成的正文。')).rejects.toThrow('手写')
  const after = await loadChapterLifecycle(root, 'chapter')
  expect(after.prose.content).toContain('作者手写的章正文。')
  expect(after.prose.data.scene_ids).toEqual([])
})
```

Import `writeMarkdown` from `./index.js` if it is not already imported (it is).

- [ ] **Step 3: Add a legacy partial-commit compatibility test**

```ts
it('still appends when chapter prose already lists an accepted scene id', async () => {
  const root = await fixture()
  await createScene(root, '第一节', {
    id: 'scene-one',
    chapter_id: 'chapter',
    section: 'chapter',
    order: 0,
    timeline_node: 'timeline-opening',
    location: 'location-room',
    pov: 'character-protagonist'
  })
  await createScene(root, '第二节', {
    id: 'scene-two',
    chapter_id: 'chapter',
    section: 'chapter',
    order: 1,
    timeline_node: 'timeline-opening',
    location: 'location-room',
    pov: 'character-protagonist'
  })
  const started = await loadChapterLifecycle(root, 'chapter')
  await writeMarkdown(
    started.prose.path,
    { ...started.prose.data, scene_ids: ['scene-one'] } as unknown as Record<string, unknown>,
    '开篇正文。'
  )
  const first = (await listDocs<SceneDoc>(root, 'scene')).find((item) => item.data.id === 'scene-one')
  if (!first) throw new Error('missing scene-one')
  await writeMarkdown(
    first.path,
    { ...first.data, accepted_at: '2026-01-01T00:00:00.000Z', status: 'final' } as unknown as Record<
      string,
      unknown
    >,
    '开篇正文。'
  )
  await acceptSceneIntoChapter(root, 'scene-two', '后文。')
  const after = await loadChapterLifecycle(root, 'chapter')
  expect(after.prose.content.trim()).toBe('开篇正文。后文。')
  expect(after.prose.data.scene_ids).toEqual(['scene-one', 'scene-two'])
})
```

- [ ] **Step 4: Run the lifecycle tests to verify they fail**

Run: `pnpm exec vitest run packages/core/src/chapter-lifecycle.test.ts`

Expected: FAIL on the two-scene test because the first accept still appends `开篇正文。` into chapter prose.

- [ ] **Step 5: Commit the failing tests**

```bash
git add packages/core/src/chapter-lifecycle.test.ts
git commit -m "test: expect chapter prose to wait until every scene is confirmed"
```

---

### Task 2: Implement confirm-then-commit in core

**Files:**

- Modify: `packages/core/src/chapter-lifecycle.ts:275-312`

**Interfaces:**

- Consumes: `loadChapterLifecycle`, `assertPlainProse`, `writeMarkdown`, `sceneChapterId`
- Produces: `acceptSceneIntoChapter(projectRoot, sceneId, candidate?)` still the public API; chapter `scene_ids` filled only when the chapter is fully confirmed (or when already in the legacy partial-commit state)

- [ ] **Step 1: Replace `acceptSceneIntoChapter` with this implementation**

Keep the function name and signature. Replace the body after the “already accepted” / order checks:

```ts
export async function acceptSceneIntoChapter(
  projectRoot: string,
  sceneId: string,
  candidate?: string
): Promise<ChapterLifecycleSnapshot> {
  const scene = (await listDocs<SceneDoc>(projectRoot, 'scene')).find((item) => item.data.id === sceneId)
  if (!scene) throw new Error(`Scene not found: ${sceneId}`)
  const lifecycle = await loadChapterLifecycle(projectRoot, sceneChapterId(scene.data))
  if (lifecycle.prose.data.status !== 'draft') throw new Error('Only a draft chapter can accept a scene.')
  if (scene.data.accepted_at) throw new Error('This scene is already present in the chapter prose.')
  const earlier = lifecycle.scenes.find(
    (item) => item.data.order < scene.data.order && !item.data.accepted_at
  )
  if (earlier) throw new Error(`请先接受前一节「${earlier.data.title}」，章正文必须按节顺序写入。`)
  const prose = assertPlainProse(candidate ?? scene.content)
  const nextScene: SceneDoc = {
    ...scene.data,
    status: 'final',
    outline_content: scene.data.outline_content || scene.content,
    accepted_at: new Date().toISOString()
  }
  await writeMarkdown(scene.path, nextScene as unknown as Record<string, unknown>, prose)
  try {
    return await writeChapterProseForAcceptedScene(projectRoot, lifecycle.chapter.data.id, {
      ...scene,
      data: nextScene,
      content: prose
    })
  } catch (error) {
    await writeMarkdown(scene.path, scene.data as unknown as Record<string, unknown>, scene.content)
    throw error
  }
}

async function writeChapterProseForAcceptedScene(
  projectRoot: string,
  chapterId: string,
  justAccepted: { path: string; data: SceneDoc; content: string }
): Promise<ChapterLifecycleSnapshot> {
  const lifecycle = await loadChapterLifecycle(projectRoot, chapterId)
  const scenes = lifecycle.scenes.map((item) => (item.data.id === justAccepted.data.id ? justAccepted : item))
  const legacyPartial = lifecycle.prose.data.scene_ids.length > 0
  if (legacyPartial) {
    const nextProse: ChapterProseDoc = {
      ...lifecycle.prose.data,
      scene_ids: [...lifecycle.prose.data.scene_ids, justAccepted.data.id]
    }
    await writeMarkdown(
      lifecycle.prose.path,
      nextProse as unknown as Record<string, unknown>,
      `${lifecycle.prose.content.trimEnd()}${justAccepted.content}`
    )
    return loadChapterLifecycle(projectRoot, chapterId)
  }
  const unaccepted = scenes.filter((item) => !item.data.accepted_at)
  if (unaccepted.length) return loadChapterLifecycle(projectRoot, chapterId)
  if (lifecycle.prose.content.trim()) {
    throw new Error('章正文已有手写内容，不能用节模块覆盖。请先清空章正文，或关闭节模块后继续手写。')
  }
  const joined = scenes.map((item) => assertPlainProse(item.content)).join('')
  const nextProse: ChapterProseDoc = {
    ...lifecycle.prose.data,
    scene_ids: scenes.map((item) => item.data.id)
  }
  await writeMarkdown(lifecycle.prose.path, nextProse as unknown as Record<string, unknown>, joined)
  return loadChapterLifecycle(projectRoot, chapterId)
}
```

Place `writeChapterProseForAcceptedScene` in the same file, not exported.

- [ ] **Step 2: Run the lifecycle tests**

Run: `pnpm exec vitest run packages/core/src/chapter-lifecycle.test.ts`

Expected: PASS, including handwritten conflict and legacy partial append.

- [ ] **Step 3: Run related core tests that call `acceptSceneIntoChapter`**

Run: `pnpm exec vitest run packages/core/src/chapter-lifecycle.test.ts packages/cli/src/index.test.ts apps/desktop/electron/ipc/scene.test.ts`

Expected: PASS. If a CLI/IPC test asserted chapter prose after accepting the first of two scenes, update that assertion the same way as Task 1.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/chapter-lifecycle.ts packages/core/src/chapter-lifecycle.test.ts
git commit -m "fix: write chapter prose only after every scene in the chapter is confirmed"
```

---

### Task 3: Writer-first default for new workspace projects

**Files:**

- Modify: `packages/core/src/outline-rules.ts`
- Modify: `apps/desktop/electron/ipc/local-workspace.ts`
- Modify: `packages/cli/src/index.ts` (the `workspace create-project` action around line 131, and `init` if it also calls `createProjectAt` without `story_structure`)
- Test: add `packages/core/src/outline-rules.test.ts` only if no existing file covers exports; otherwise extend `packages/core/src/factions-and-structure.test.ts`

**Interfaces:**

- Consumes: `StoryStructureConfigV1`, `createProjectAt`
- Produces: `WRITER_DEFAULT_STORY_STRUCTURE` with `scene_enabled: false`; schema default stays `true` so old YAML and test fixtures do not flip

- [ ] **Step 1: Add the writer default next to `DEFAULT_STORY_STRUCTURE`**

In `packages/core/src/outline-rules.ts`:

```ts
export const WRITER_DEFAULT_STORY_STRUCTURE: StoryStructureConfigV1 = Object.freeze({
  part_enabled: true,
  act_enabled: true,
  scene_enabled: false
})
```

`DEFAULT_STORY_STRUCTURE` stays `{ part_enabled: true, act_enabled: true, scene_enabled: true }` for schema / tests / missing YAML keys.

- [ ] **Step 2: Export it from core**

`packages/core/src/index.ts` already has `export * from './outline-rules.js'`. No extra export line.

- [ ] **Step 3: Write a focused test in `packages/core/src/factions-and-structure.test.ts`**

```ts
it('keeps schema tests on the compatibility default and exposes a writer default with scenes off', () => {
  expect(DEFAULT_STORY_STRUCTURE.scene_enabled).toBe(true)
  expect(WRITER_DEFAULT_STORY_STRUCTURE.scene_enabled).toBe(false)
})
```

Add the named imports.

- [ ] **Step 4: Run that test (it should pass immediately)**

Run: `pnpm exec vitest run packages/core/src/factions-and-structure.test.ts`

Expected: PASS

- [ ] **Step 5: Pass the writer default from desktop and CLI project creation**

`apps/desktop/electron/ipc/local-workspace.ts`:

```ts
import { WRITER_DEFAULT_STORY_STRUCTURE, createProjectAt, ... } from '@quillarium/core'

  const paths = await createProjectAt(root, {
    id,
    title: input.title,
    genre: input.genre,
    target_words: input.targetWords,
    chapter_words: input.chapterWords,
    section_words: input.sectionWords,
    default_theme: input.defaultTheme,
    story_structure: WRITER_DEFAULT_STORY_STRUCTURE
  })
```

In `packages/cli/src/index.ts`, both `createProjectAt(...)` calls that create a user project (workspace `create-project` near line 131 and `init` near line 326) must pass `story_structure: WRITER_DEFAULT_STORY_STRUCTURE`. Do not change test helpers that call `createProjectAt` directly.

- [ ] **Step 6: Add one CLI or desktop test that new workspace projects have scenes off**

If `packages/cli/src/index.test.ts` already creates a workspace project through the CLI, assert:

```ts
expect(loaded.story_structure.scene_enabled).toBe(false)
```

If the existing CLI init test loads `project.yaml` / `loadProject`, add the assertion there instead of a new file.

If `apps/desktop/electron/ipc/project.test.ts` covers `createLocalWorkspaceProject`, add:

```ts
expect(summary.story_structure.scene_enabled).toBe(false)
```

- [ ] **Step 7: Run the affected tests**

Run: `pnpm exec vitest run packages/core/src/factions-and-structure.test.ts packages/cli/src/index.test.ts apps/desktop/electron/ipc/project.test.ts`

Expected: PASS. Tests that use `createProjectAt` without `story_structure` must still have `scene_enabled: true`.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/outline-rules.ts packages/core/src/factions-and-structure.test.ts apps/desktop/electron/ipc/local-workspace.ts packages/cli/src/index.ts packages/cli/src/index.test.ts apps/desktop/electron/ipc/project.test.ts
git commit -m "feat: start new workspace projects with the scene module off"
```

---

### Task 4: Author-facing copy

**Files:**

- Modify: `packages/cli/src/runs.ts:73`
- Modify: `apps/desktop/src/features/writing/ChapterProseWorkspace.tsx:306-310`
- Modify: `apps/desktop/src/features/writing/AIWritingWorkspace.tsx` (the note around 586 and the “已写入章正文” label around 628)
- Modify: `apps/desktop/src/features/metadata/field-presentation.ts:939-941` and `:1024`
- Modify: `apps/desktop/src/features/workspace/Workspace.tsx:643`
- Test: `apps/desktop/src/features/writing/AIWritingWorkspace.test.tsx` (string assertions)
- Test: `apps/desktop/src/features/writing/ChapterProseWorkspace.test.tsx` if it contains the old sentence

**Interfaces:**

- Consumes: unchanged IPC (`scene:acceptManual` still calls `acceptSceneIntoChapter`)
- Produces: copy that matches confirm-then-commit

- [ ] **Step 1: Update CLI description**

```ts
.description('Confirm this run as scene prose; write chapter prose only when every scene in the chapter is confirmed')
```

- [ ] **Step 2: Update desktop strings**

`ChapterProseWorkspace.tsx`:

```ts
{
  zh
    ? '可以完全手写正文。节模块会在本章所有节都确认后，才把各节正文一次性写入这里，不加入标题或分隔符。'
    : 'Write directly. The scene module writes into this prose only after every scene in the chapter is confirmed, with no headings or separators.'
}
```

`AIWritingWorkspace.tsx` replace the “accept then append” sentence with:

```ts
{
  zh
    ? '每节约一千字，可多次生成、选择和手改；确认后先留在本节。本章全部节确认后，才写入章正文。'
    : 'Each scene is a ~1000-word generation chunk. Confirm leaves prose on the scene; chapter prose updates after every scene is confirmed.'
}
```

Change `已写入章正文` to `已确认` / `Confirmed` for a scene that has `accepted_at` but whose id is not yet in `prose.scene_ids` if that UI can see both. If the workspace only has the scene doc, keep `已确认`.

`field-presentation.ts` `accepted_at` help:

```ts
'作者确认本节成果的时间。章正文要等本章全部节确认后才写入。'
```

English: `'When the author confirmed this scene. Chapter prose is written after every scene in the chapter is confirmed.'`

`Workspace.tsx` delete dialog: keep “already written chapter prose is preserved” only when `scene_ids` already contains that scene. If that data is not in the dialog closure, use:

```ts
;`删除节「${title}」？节文件和运行记录会删除。若章正文尚未纳入本节，章正文不变；若已经写入，已写入的文字会留在章正文里供手改。`
```

- [ ] **Step 3: Fix UI tests that `toContain` the old Chinese copy**

Search `AIWritingWorkspace.test.tsx` and `ChapterProseWorkspace.test.tsx` for `写入章正文` / `accept it into chapter`. Update expected strings to the new copy.

- [ ] **Step 4: Run desktop writing tests**

Run: `pnpm exec vitest run apps/desktop/src/features/writing/AIWritingWorkspace.test.tsx apps/desktop/src/features/writing/ChapterProseWorkspace.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/runs.ts apps/desktop/src/features/writing/ChapterProseWorkspace.tsx apps/desktop/src/features/writing/AIWritingWorkspace.tsx apps/desktop/src/features/metadata/field-presentation.ts apps/desktop/src/features/workspace/Workspace.tsx apps/desktop/src/features/writing/AIWritingWorkspace.test.tsx apps/desktop/src/features/writing/ChapterProseWorkspace.test.tsx
git commit -m "docs: describe scene confirmation as a chapter-module output"
```

---

### Task 5: Align DESIGN.md with this slice only

**Files:**

- Modify: `docs/DESIGN.md` (the chapter lifecycle / draft prose bullets around lines 179–199)
- Modify: `docs/CLI.md` (the accept sentence around line 206)
- Modify: `docs/AGENT-DESIGN.md` (the “accepted plain prose is appended” sentence around line 81)

Do not rewrite README feature catalogs. Do not touch display-layer or Agent runtime sections.

- [ ] **Step 1: Replace the “accepting a scene writes immediately” sentences**

In `docs/DESIGN.md`, change the lifecycle so it matches:

```text
prepare scenes -> generate candidates -> confirm each scene
        -> when every scene is confirmed, write chapter prose
        -> check chapter -> finalize -> apply continuity
```

And the draft bullet:

- `draft`: the author may edit chapter prose by hand. The scene module does not touch that file until every scene in the chapter is confirmed; it then writes the confirmed scene prose in order with no headings. If chapter prose already has handwritten text and `scene_ids` is empty, confirmation fails closed.

In `docs/CLI.md` replace “appends it to the independent chapter prose in order” with “confirms the scene; chapter prose is written when every scene in that chapter is confirmed”.

In `docs/AGENT-DESIGN.md` replace “appended into the independent chapter prose” with the same confirm-then-commit rule.

- [ ] **Step 2: Commit**

```bash
git add docs/DESIGN.md docs/CLI.md docs/AGENT-DESIGN.md
git commit -m "docs: record chapter prose commit after all scenes are confirmed"
```

---

### Task 6: Full gate for this slice

- [ ] **Step 1: Run the slice tests**

Run:

```bash
pnpm exec vitest run packages/core/src/chapter-lifecycle.test.ts packages/core/src/factions-and-structure.test.ts packages/cli/src/index.test.ts apps/desktop/electron/ipc/scene.test.ts apps/desktop/src/features/writing/AIWritingWorkspace.test.tsx apps/desktop/src/features/writing/ChapterProseWorkspace.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run build + full test if the slice tests passed**

Run: `pnpm check`

Expected: `tsc -b` and full Vitest PASS.

If `pnpm check` fails on an unrelated file, stop and report; do not expand this plan into display-layer or Agent work.
