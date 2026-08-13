# Desktop UI Architecture

Quillarium Desktop is an Electron + Vite + React application in `apps/desktop`.

The renderer stays focused on interaction and presentation. File system access, Git operations, and AI calls run through Electron IPC in the main process. This keeps API keys and local paths out of the browser-like renderer and matches the privacy-first model.

## First Launch

The primary selector registers a writing workspace containing `quillarium-workspace.yaml`. New
projects are created under the manifest's `projects_dir`; each project directory is directly both an
Obsidian vault and a Quillarium project root:

```text
<Writing Workspace>/projects/<project-id>/.obsidian/
<Writing Workspace>/projects/<project-id>/project.yaml
```

Legacy Obsidian roots remain available through compatibility services and the explicit migration
workflow, but are not exposed as a competing first-launch entry. Migration selects one legacy
project, runs dry-run → backup → apply → verify → report, never follows symlinks or copies nested
`.git`, and does not move, delete, or silently rewrite the source.

The workspace's local absolute path, recent project, legacy vault path, theme, and credentials stay in
the global Quillarium config at `~/.quillarium/config.json`; they are never written to the workspace.

## Data Model

The desktop app reads and writes the same Markdown + YAML frontmatter files as the CLI:

- `project.yaml` v2 stores the stable path-safe `id`, display `title`, legacy `aliases`, and project
  defaults including `default_theme`.
- `canon/`, `characters/`, `timeline/`, `locations/`, `outlines/`, `chapters/`, and `scenes/` remain
  Obsidian-readable.
- `runs/` stores AI context, prompt, raw/accepted output, checks, immutable `PromptBlock` and
  `ContextTrace` snapshots, and shared-guidance snapshots with source path, scope, SHA-256, and read
  time.
- Imported or AI-created cards may carry `quillarium_origin`. File-backed origins record source
  paths and SHA-256 values; AI-import origins also retain the import-session and candidate index.
  Origin metadata is hidden from ordinary field editing and drives explicit source/re-import actions.

Planning records use schema-aware direct controls for scalar fields, arrays, nested objects, and
unknown frontmatter. The renderer never asks an author to type JSON or YAML: tag-like arrays are
chips, ordinary arrays are repeatable rows, and records are nested named controls. Markdown bodies
have Source and Preview modes backed by the same unsaved value. Preview supports headings, lists,
quotations, tables, links, and code fences; raw HTML is skipped and unsafe URLs are rejected. Saves
preserve frontmatter through `@quillarium/core` and use atomic file replacement.

Tag indexing is intentionally frontmatter-only and exact-match. `tags`, trigger/category/topic
fields, and selected categorical fields are normalized for comparison without changing their stored
value. A clicked chip opens a right-to-left drawer whose result cards carry document-type markers;
choosing a result selects the original Markdown document. The index does not infer tags from prose.

The planning and writing shells expose reusable accessible split handles. Pointer movement resizes
adjacent panes with minimum/maximum bounds; a focused handle accepts arrow keys. Current coverage
includes planning navigation/collection/detail, writing navigation and overview/detail, and each
planning detail's metadata/Markdown rows. Sizes live in renderer session state and are never
persisted into a workspace or project.

The writing structure is one workflow tree: parallel `overview` and `book` roots, then
`book → volume → part → optional act → chapter`. A chapter may belong directly to a part or to its
optional act, but never to both. Its chapter prose, zero or more ordered scenes, and “new scene / AI
writing” action are sibling children. User-facing tree labels are `总览 / 总纲 / 卷 / 篇 / 幕 / 章 /
节`; the delivery nodes never append `纲`. Selecting an outline level opens that outline and plans
only its direct child level. AI writing is a scene-level full-width workspace, not a permanently docked
lower panel. It follows three explicit stages: assemble the current context into a prompt, let the
author revise that prompt, then generate and inspect candidates/runs. The exact adjusted prompt is
snapshotted to `run/prompt.md`; assembling or editing it never mutates Canon or the source outline.

## Planning Record Creation

The planning modules for characters and relationships, world entries, timeline nodes and events,
locations, foreshadowing, narrative guidance, issues, and references use one guided AI flow:

1. the renderer opens a multi-turn discussion dialog and supplies only the current project and module
   identifiers
2. the main process assembles project metadata context and asks the configured background AI profile
   for a strict, schema-validated proposal
3. the author can continue the discussion and edit the proposed title, document type, structured
   fields, and Markdown body without writing files
4. cancel leaves the project unchanged; explicit confirmation performs one atomic creation and then
   refreshes and selects the new record

The same dialog may be explicitly seeded from one existing planning card. It restores the originating
conversation when available, otherwise creates a reviewed editing session for that card. Confirmation
updates only the seeded card. It cannot accept prose, mutate Canon or outlines, or bypass the
accepted-text lifecycle. Imported cards keep their source/re-import workflow as a separate action.

Bulk source ingestion is a different reviewed workflow: the author pastes text or chooses
`.md`, `.markdown`, or `.txt` files; background AI proposes typed cards; the author edits the
candidate list and resolves questions; confirmation lands only the approved candidates. A landed
file-derived card can later show its source status and re-import exactly that card. Missing or changed
sources are reported instead of silently replacing content.

## Planning Card Workbench

- Reference material has no lifecycle status and never enters prompts by itself. Its detail pane shows
  a live reverse index of cards whose `source_refs` cite it.
- Timeline nodes form the fixed horizontal chain; concurrent events stack on one node. The Timeline
  toolbar and empty state expose a direct “Time coordinate” action. An unattached event with a legacy
  `date`/“Story time” can create or reuse its coordinate in one step and is attached without retyping
  the time; events without a coordinate remain visible with migration guidance.
- The character graph has a draggable time control and hides people or relationships before their
  introduction/start and after their exit/end. Relationship phases are half-open (`start` included,
  `end` excluded), so one pair can change from “friends” to “rivals” at a single timeline node without
  displaying both phases. Active phases are labeled directly on their connecting lines; directed
  phases also show an arrow.
- Character details list every time-scoped relationship phase involving that person and provide a
  direct creation action. The old profile-level relationship map is shown only as preserved legacy
  notes, with an explicit conversion action; it is not an authoritative source for the graph.
- The location explorer supports six spatial scales, parent breadcrumbs, peer/child drilling, layout
  explanations, coordinate sketches, and a compass fallback.
- Relation, trigger, and source fields choose existing records. Broken IDs are displayed as repairable
  warnings instead of requiring authors to type identifiers.
- Disabled cards are visibly muted and excluded from context and the manually triggered AI check.
- Issue cards list their related records and offer direct inspection or an AI-assisted in-place repair.
- Source cards, field explanations, compact action bars, serif content typography, and bounded buttons
  preserve a calm editorial hierarchy while leaving flexible space to the actual editor or diagram.

Desktop service errors pass through a bilingual presentation layer before reaching the renderer.
Notices follow the selected interface language, can be dismissed immediately, and expire
automatically after five seconds for status messages or eight seconds for errors. Unknown errors are
still shown rather than swallowed.

## Privacy and Git

Writing projects are private by default:

- No remote is configured during project creation.
- Projects inside a workspace repository use its root remote and cannot create nested repositories.
- Project status, staging, and commits use a main-process-computed literal pathspec; one project's
  commit cannot include another project, shared root files, or unrelated pre-staged changes.
- A standalone project may still initialize and use its own local repository.
- Remote creation or binding is explicit and never defaults to public publishing.

## Theme System

Themes are CSS-variable based. The current first-party themes are:

- `paper`
- `ink`
- `mist`
- `bamboo`

User preference is stored globally, while each project can declare `default_theme` in `project.yaml`.

## Current UI Slice

The implemented desktop baseline supports:

1. register a GitHub-backed writing workspace and create/open a direct project-vault
2. keep legacy vault compatibility and migration outside the primary welcome path
3. configure display, GitHub, and each AI profile with independent save actions
4. browse planning modules and create new planning records through a review-before-write AI dialog
5. edit schema-aware metadata without serialization syntax, inspect cross-type tag matches, and
   switch Markdown bodies between safe Source and Preview modes
6. paste or choose source files, review AI-proposed cards, land approved cards, and inspect or
   re-import one card through retained provenance
7. create timeline coordinates, attach concurrent events, browse time-filtered people, and create
   labeled time-scoped relationship phases
8. select, edit, and save a plain-text scene working draft
9. assemble context and run deterministic checks or an explicit project planning check
10. assemble and author-edit a chapter prompt, create AI generation records, and preview run files
11. accept raw output into a scene and write it into chapter prose in order without headings or
    separator characters
12. open chapter prose as a dedicated large plain-text editor with word progress and lifecycle actions
13. delete an unpublished volume/part/act/chapter/scene, recursively cleaning its descendants and runs

The AI-writing page uses a resizable two-column prompt composer: source cards on the left and the
exact editable prompt on the right. Chapter prose has its own full-width page rather than sharing
vertical space with AI tools. It can be written entirely by hand without creating scenes. Chapter and
scene prose use a newsprint-inspired serif type stack, larger type, comfortable line spacing, and
visible non-whitespace character counts. The stylesheet is an independent implementation; no theme
CSS or font binaries are copied.

The chapter-prose page exposes `draft`, `final`, and `published`. Finalization locks AI and scene
edits. Publication uses a confirm dialog plus exact chapter-title confirmation, then locks prose and
purges scene prompts/AI artifacts while retaining scene outlines. Before publication, story-node
delete actions are available; a published descendant blocks the entire deletion. Git actions remain
workspace-aware or standalone scoped, and visible pane separators can be dragged (or focused and
adjusted with arrow keys) to allocate space.
