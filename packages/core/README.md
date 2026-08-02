# @quillarium/core

`@quillarium/core` is Quillarium's local storage and workflow domain layer. It creates and loads
novel projects, reads and writes Markdown/YAML documents, assembles bounded writing context, records
imports and runs, manages finalization review sessions, and exports accepted manuscript prose.

## Primary APIs

- Project and configuration: `createProject`, `loadProject`, `projectPaths`, `PROJECT_DIRS`,
  `loadConfig`, `saveConfig`, and the vault helpers.
- Documents and index: `createCanon`, `createCharacter`, `createCharacterState`,
  `appendTimelineEvent`, `createLocation`, `createRoute`, `createOutline`, `createScene`, the other
  `create*` helpers, `listDocs`, `findDoc`, `requireDoc`, and `buildIndex`.
- Context and planning: `assembleContext`, `assembleContextPacket`, `renderContextPacket`,
  `buildSceneWritingPrompt`, and `buildChapterWritingPlan`.
- Import and review: `importMarkdownPath`, import-session APIs, and finalization-review APIs.
- Runs and export: `createRun`, `readRunFile`, `writeRunFile`, `listRuns`,
  `requireNonEmptyRunOutput`, and `exportManuscript`.
- Public schemas, document types, Markdown/YAML helpers, IDs, and filesystem helpers are re-exported
  from the package entry point.

## Minimal Example

```ts
import { buildIndex, createCanon, createProject } from '@quillarium/core'

const project = await createProject({
  vault: './local-vaults',
  title: 'My Novel',
  genre: 'fantasy'
})

await createCanon(project.root, 'Magic cost', 'Every spell consumes a remembered name.')
const index = await buildIndex(project.root)
console.log(index.entries.length)
```

`exportManuscript(projectRoot, { volumeId })` writes both Markdown and plain-text artifacts. It uses
accepted run output, accepted-output signals, or final scenes and reports skipped scenes as gaps.

## Boundaries and Tests

Core is file-backed and contains no AI-provider or other network client. Calls can create or modify
project files, and the global configuration helpers modify the user's Quillarium config, so tests
should set `QUILL_CONFIG_DIR` to a temporary directory and use temporary vaults. Run its tests without
network access with:

```bash
pnpm exec vitest run packages/core/src
```

The package does not provide a UI, CLI argument parser, semantic model judgment, desktop credential
encryption, or SillyTavern format conversion; those belong to sibling packages.
