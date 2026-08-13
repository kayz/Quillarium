# @quillarium/core

`@quillarium/core` is Quillarium's local storage and workflow domain layer. It creates and loads
novel projects, reads and writes Markdown/YAML documents, assembles bounded writing context, records
imports and runs, manages finalization review sessions, and exports accepted manuscript prose.

## Primary APIs

- Workspace, project, and configuration: `loadWorkspace`, `listWorkspaceProjects`,
  `registerWorkspaceProject`, `createProjectAt`, `loadProject`, `projectPaths`, `PROJECT_DIRS`,
  `loadConfig`, and `saveConfig`. `createProject` is the explicit legacy-layout adapter.
- Compatibility and migration: v1 project reads, `planProjectMigration`, `migrateProjectLayout`,
  `migrateOutlineCycleFields`, and fingerprinted verification reports.
- Documents and index: `createCanon`, `createCharacter`, `createCharacterState`,
  `createCharacterRelation`, `createTimelineNode`, `createTimelineEventAtNode`,
  `appendTimelineEvent`, `createLocation`, `createRoute`, `createOutline`, `createScene`,
  `createChapterProse`, the other `create*` helpers, `listDocs`, `findDoc`, `requireDoc`, and
  `buildIndex`.
- Context and planning: `assembleContext`, `assembleContextPacket`, `renderContextPacket`,
  `buildSceneWritingPrompt`, `buildEditableScenePromptPlan`, typed prompt-source blocks, and
  `buildChapterWritingPlan`.
- Writing presets: `defaultWritingPreset`, `createWritingPreset`, `loadWritingPreset`,
  `listWritingPresets`, `selectWritingPreset`, explicit v1→v2 migration, sanitized snapshot hashing,
  and immutable run snapshot persistence.
- Chapter lifecycle: `loadChapterLifecycle`, `acceptSceneIntoChapter`, `finalizeChapter`,
  `publishChapter`, `deleteStoryNode`, and the human/AI edit guards.
- Import, provenance, and review: `importMarkdownPath`, import-session APIs, origin resolution and
  one-card re-import helpers, and finalization-review APIs.
- Runs and export: `createRun`, shared-guidance/compiler/writing-preset snapshots, `readRunFile`,
  `writeRunFile`, `listRuns`, `requireNonEmptyRunOutput`, and `exportManuscript`.
- Public schemas, document types, Markdown/YAML helpers, IDs, and filesystem helpers are re-exported
  from the package entry point.

## Minimal Example

```ts
import { buildIndex, createCanon, createProjectAt } from '@quillarium/core'

const project = await createProjectAt('./writing-workspace/projects/my-novel', {
  id: 'my-novel',
  title: 'My Novel',
  genre: 'fantasy'
})

await createCanon(project.root, 'Magic cost', 'Every spell consumes a remembered name.')
const index = await buildIndex(project.root)
console.log(index.entries.length)
```

`exportManuscript(projectRoot, { volumeId })` writes both Markdown and plain-text artifacts. It
prefers finalized/published chapter prose, can use accepted outputs or final scenes for compatible
projects, and reports skipped scenes as gaps.

The current `ContextPacket` performs deterministic document selection with explicit links,
pins/exclusions, enabled state, keyword activation, warnings, bounded relation expansion, and an
exact tokenizer budget. It emits typed `PromptBlock` values and a complete `ContextTrace`. A selected
versioned WritingPreset supplies its policy and block order; snapshots reject credentials, absolute
paths, and content/hash mismatches.

## Boundaries and Tests

Core is file-backed and contains no AI-provider or other network client. Calls can create or modify
project files, and the global configuration helpers modify the user's Quillarium config, so tests
should set `QUILL_CONFIG_DIR` to a temporary directory and use temporary workspace/project roots. Run
its tests without network access with:

```bash
pnpm exec vitest run packages/core/src
```

The package does not provide a UI, CLI argument parser, semantic model judgment, desktop credential
encryption, or SillyTavern format conversion; those belong to sibling packages.
