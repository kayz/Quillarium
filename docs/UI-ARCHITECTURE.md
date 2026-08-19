# Desktop UI Architecture

<p align="center">
  <img src="../assets/brand/quillarium-wordmark.png" alt="Quillarium" width="360" />
</p>

Quillarium Desktop is an Electron + Vite + React application in `apps/desktop`.

## Brand surfaces

The visible product name uses the transparent horizontal wordmark directly in the top chrome and
welcome surface, without a bookplate, border, or background fill. The close-cropped square Q emblem
uses an opaque warm-ivory tile for small-size contrast and supplies the Electron window icon and the
Windows/macOS package icons. UI assets are pre-sized rather than rendering the original artwork at
runtime, while the native window title, image alternatives, and button labels preserve the
accessible text name `Quillarium`.

On Windows, Electron hides the default caption and overlays the native minimize, maximize/restore,
and close controls on the 46 px product chrome. The renderer uses the Window Controls Overlay safe
area variables so actions never sit beneath those controls. Empty chrome is draggable; buttons,
forms, links, and modal surfaces are explicitly non-draggable. The transparent wordmark uses only a
restrained pixel-level glow on the dark chrome, never a background plate.

The settings dialog obtains its displayed application version from Electron's packaged metadata
through the typed `app:version` IPC channel. It does not duplicate a hard-coded renderer version.
The same dialog offers a user-triggered update check. The main process queries the fixed public
Quillarium GitHub Releases endpoint, applies stable/prerelease SemVer rules, and returns a typed,
localizable result through `app:checkForUpdates`. The renderer cannot supply a repository or URL;
`app:openReleases` opens only the fixed official releases page. There is no startup polling,
account requirement, token use, telemetry, background download, or silent install.

The renderer stays focused on interaction and presentation. File system access, Git operations, and AI calls run through Electron IPC in the main process. This keeps API keys and local paths out of the browser-like renderer and matches the privacy-first model.

## First Launch

The primary selector accepts any local folder. If it is not already a writing workspace, the main
process safely creates `quillarium-workspace.yaml` and `projects/` without initializing Git, contacting
GitHub, or replacing unrelated files. New projects are created under the manifest's `projects_dir`;
each project directory is directly both an Obsidian vault and a Quillarium project root:

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

- `project.yaml` v2 stores the stable path-safe `id`, display `title`, synopsis, legacy `aliases`,
  project defaults, selected `writing_preset` ID, and contained relative cover paths/focal point.
  Original, thumbnail, and 2:3 PNG export images live under `assets/cover/`; absolute paths, traversal,
  and external symlinks are rejected.
- `canon/`, `characters/`, `timeline/`, `locations/`, `outlines/`, `chapters/`, and `scenes/` remain
  Obsidian-readable.
- `presets/` stores portable versioned WritingPreset YAML. It contains no endpoint, credential, or
  executable script.
- `context-bundles/` and `creator-roles/` store versioned stable-ID selections and creator-assistant
  configuration. They contain no credentials, absolute paths, arbitrary scripts, or provider keys.
- `assistant-prompts/<assistant-id>/` stores isolated behavior-prompt versions. Only the five newest
  ordinary configuration versions remain; historical session/Run snapshots are immutable.
- `prompts/book-generation-header.md` stores the optional long book-generation header. The project
  manifest never embeds that text.
- `imports/archive/` stores exact original CCv3 imports and their recorded SHA-256 provenance.
- `explorations/` stores append-only browsable assistant conclusions; full conversation and failure
  artifacts stay under `runs/assistants/`.
- `runs/` stores AI context, prompt, raw/accepted output, checks, immutable WritingPreset,
  `PromptBlock`, `ContextTrace`, PromptEnvelope, and Agent execution snapshots, and shared-guidance
  snapshots with source path, scope, SHA-256, and read time.
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
The run workspace selects a candidate count, displays one group side by side, shows each candidate's
rules/semantic evaluation and full report, and exposes separate check, select, branch, and accept
actions. Selection is visibly distinct from acceptance and never writes prose.

## Planning Record Creation

The planning modules for characters and relationships, world entries, timeline nodes and events,
locations, foreshadowing, narrative guidance, and issues use one guided AI flow:

1. the renderer opens a multi-turn discussion dialog and supplies only the current project and module
   identifiers
2. the main process filters metadata to the active module's code-owned allowlist and asks the
   configured background AI profile for a strict, schema-validated ordered proposal set; timeline
   dialogs expose only timeline nodes/events, for example
3. the right bounded proposal grid shows the exact card and confirmation counts while preserving every
   stable temporary ID, source, create/update operation, state, body, and revision; the author can
   switch, edit, confirm one, confirm dependencies or explicitly confirm/retract the complete set
   without writing files
4. cancel leaves the project unchanged; applying the confirmed subset rejects unconfirmed in-session
   dependencies, preflights every expected hash, topologically orders linked creates, resolves their
   temporary IDs to final stable project IDs, takes the project write lock, atomically writes, verifies,
   and rolls back the complete set on failure

The same dialog may be explicitly seeded from one existing planning card. The true file and stable ID
remain the first anchored item through regeneration and restore; subsequent create proposals follow
it in order. The anchor is only updated after explicit confirmation and an unchanged source hash. It
cannot accept prose, mutate Canon or outlines, or bypass the accepted-text lifecycle. Imported cards
keep their source/re-import workflow as a separate action.

References deliberately use a different two-stage workflow. “Upload reference document” accepts one
or more UTF-8 `.md`, `.markdown`, or `.txt` files and deterministically creates project-local
`references/*.md` cards without reading AI configuration or calling a model. A batch records only the
source filename (never its external absolute path) and rolls back every card if any source fails.
After a saved reference is selected, “AI discussion to create cards” opens the proposal dialog with
that reference as a hash-checked read-only source rather than an editable anchor. AI may propose
multiple new setting cards from the source; the trusted process adds the reference stable ID to every
proposal's `source_refs`, rejects reference-update or out-of-scope proposals, and rechecks the source
hash before an explicitly confirmed atomic apply.

Page-specific AI-check entries carry an explicit scope through IPC. The timeline semantic check
compiles only timeline nodes and events; the global AI check uses the broader project scope but still
excludes every world-book entry. World books remain available to world-book editing and generation
context, but never become deterministic planning-check evidence.

Bulk source ingestion is a different reviewed workflow: the author pastes text or chooses
`.md`, `.markdown`, or `.txt` files; background AI proposes typed cards; the author edits the
candidate list and resolves questions; confirmation lands only the approved candidates. A landed
file-derived card can later show its source status and re-import exactly that card. Missing or changed
sources are reported instead of silently replacing content.

## Creator Assistant Workspace

The writing navigation includes a full-width “创作助手” workspace. It uses an editorial three-pane
layout rather than a generic chat shell:

- the left pane selects one of the three built-in assistants and a recoverable session or branch;
- the center pane contains the conversation, exploration result, and reviewable planning, issue, or
  configuration proposals; and
- the right pane answers what the assistant knows, why each source was selected, whether it is
  required/preferred, its authority and token cost, the effective permissions, and the output
  destination.

Character cards can open character rehearsal with the character as the current target. Chapters and
scenes can open continuity review, while material import can discuss pasted source with the setting
organizer before creating any card. These shortcuts select a product-owned task; they do not give a
fictional character or imported document Agent permissions.

The desktop initializes the three application templates only when the feature is first used. A
session freezes its assistant, ContextBundle, and WritingPreset versions, so editing the binding is
clearly described as affecting a new session. AI-proposed configuration changes appear as a diff;
permission, output-type, and required-source changes use the high-risk treatment and require an
explicit approval action. Errors use stable codes translated according to the selected UI language.

Beside the ContextBundle control, the UI exposes a separate assistant-prompt viewer/editor. Saving
normally increments the patch version and also supports a custom name/version. Each assistant selector
shows only its own latest five versions. Character rehearsal is rendered as seven explicit stages:
character, time event, place/scene, state preview, trial prose, diagnosis, then exploration plus a
character-setting proposal. Continuity review validates one scene or a same-chapter ordered contiguous
range before assembling surrounding accepted prose, timeline, people, places, and Canon. Both remain
proposal-only and cannot expand their code-owned permission ceiling through edited prompt text.

## Writing Presets

Desktop settings list the current project's presets and explicitly select one for future runs. The
main process combines the selected portable preset with the referenced machine-local AI profile;
the renderer never receives the profile credential. A project created by current Quillarium starts
with `default`; a legacy project without any preset displays a “create default preset” action and
generation otherwise fails clearly.

All Desktop generation, dry-run, context-preview, prompt-plan, and outline-generation paths use the
same resolver as the CLI. Every run records preset ID/version/hash and immutable
`writing-preset.json`. Editing a preset only changes later runs; old runs remain explainable from
their snapshots.

## Planning Card Workbench

- Reference material has no lifecycle status and never enters prompts by itself. Its detail pane shows
  a live reverse index of cards whose `source_refs` cite it.
- Timeline tabs represent independently ordered narrative/world tracks backed by versioned time
  systems. Nodes support mixed precision and cyclic occurrences; events can be instantaneous or span
  a visible interval and the same event may be placed on several tracks. Track, node, and same-node
  event drag handles change only persisted display/narrative order, never the coordinate. Cross-track
  drops open an explicit add-versus-move placement panel. The toolbar can scan legacy “Story time”
  values, preview parsed groups and ambiguities, and write only after the author confirms an explicit
  migration.
- Planning-card links use the shared Core resolver. Detail panes show resolved forward links and
  derived backlinks, distinguish ambiguous from missing targets, and open the target card by stable
  identity. Canonical new links include the vault-relative filename so they also resolve in Obsidian;
  legacy code/title links remain read-only compatible until an author-approved migration.
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
- Every relation-style chooser uses the bounded virtualized `PlanningCardSelector`, filtering title,
  stable ID, alias, tag, and type while saving only the stable ID. It supports arrow keys, Enter, Esc,
  and clear. Foreshadowing plant/resolve controls primarily select a timeline, node, or event and may
  then refine it with a chapter/scene; preserved legacy free text requires explicit migration.
- Large planning collections filter the complete section first and then render a bounded page: list
  mode shows at most 48 records, tile mode 24, and the dedicated issue table 50. The current page is
  renderer-session state only. Issue selection and select-all/invert continue to span the complete
  filtered result set, while related-card labels use one render-time stable-ID index instead of a
  document scan per row. This bounds React DOM and layout work without changing stored order or IDs.
- Disabled cards are visibly muted and excluded from context and the manually triggered AI check.
- The dedicated issue list exposes type, source, related objects, priority, detection time, selection,
  select-all/invert, and batch ignore/resolve/reopen. Ignore writes a stable suppression ledger;
  resolve closes only the occurrence. Issue AI keeps the current issue first, reads same-kind and
  stable related context, and only proposes edits. Invalid model status strings are bounded to the
  product enum or shown as a local structured error.
- Source cards, field explanations, compact action bars, serif content typography, and bounded buttons
  preserve a calm editorial hierarchy while leaving flexible space to the actual editor or diagram.

Desktop service errors pass through a bilingual presentation layer before reaching the renderer.
Notices follow the selected interface language, can be dismissed immediately, and expire
automatically after five seconds for status messages or eight seconds for errors. Unknown errors are
still shown rather than swallowed.

## Privacy and Git

Writing projects are private by default:

- A local folder and local files are sufficient to register a writing library and create novels;
  neither a GitHub account nor a Git repository is required.
- No remote is configured during project creation.
- Projects inside a workspace repository use its root remote and cannot create nested repositories.
- Project status, staging, and commits use a main-process-computed literal pathspec; one project's
  commit cannot include another project, shared root files, or unrelated pre-staged changes.
- A standalone project may still initialize and use its own local repository.
- Remote creation or binding is explicit and never defaults to public publishing.
- The desktop status reports `Local only` or `Local Git` before a remote exists. Saving a GitHub Token
  later enables the separate `Connect and upload to GitHub` action in Settings.

## Theme System

Themes are CSS-variable based. The current first-party themes are:

- `paper`
- `ink`
- `mist`
- `bamboo`

User preference is stored globally, while each project can declare `default_theme` in `project.yaml`.

## Current UI Slice

The implemented desktop baseline supports:

1. register any local folder as a writing workspace and create/open a direct project-vault without GitHub
2. keep legacy vault compatibility and migration outside the primary welcome path
3. configure display, check for official releases, configure optional GitHub access, each AI profile,
   the project WritingPreset, book-generation header, cover, and CCv3 setting export with explicit actions
4. browse planning modules and create new planning records through a review-before-write AI dialog
5. edit schema-aware metadata without serialization syntax, inspect cross-type tag matches, and
   switch Markdown bodies between safe Source and Preview modes
6. paste or choose source files, review AI-proposed cards, land approved cards, and inspect or
   re-import one card through retained provenance
7. create timeline coordinates, attach concurrent events, browse time-filtered people, and create
   labeled time-scoped relationship phases
8. select, edit, and save a plain-text scene working draft
9. assemble context and run deterministic checks or an explicit project planning check
10. assemble and author-edit a chapter prompt, preview the compiled full prompt, create AI generation
    records, and inspect saved PromptEnvelope/provider-visible snapshots in three read-only views
11. accept raw output into a scene and write it into chapter prose in order without headings or
    separator characters
12. open chapter prose as a dedicated large plain-text editor with word progress and lifecycle actions
13. on final prose, review AI-proposed continuity impacts/questions, explicitly decide each item,
    then back up, atomically apply, verify, and inspect the audit
14. delete an unpublished volume/part/act/chapter/scene, recursively cleaning its descendants and runs
15. create a new empty-story project from a CCv3 JSON/PNG card on the welcome screen, review imported
    candidate settings, upload/crop a 2:3 cover, and export selected settings as one CCv3 PNG

The AI-writing page uses a resizable two-column prompt composer: source cards on the left and the
exact editable prompt on the right. Chapter prose has its own full-width page rather than sharing
vertical space with AI tools. It can be written entirely by hand without creating scenes. Chapter and
scene prose use a newsprint-inspired serif type stack, larger type, comfortable line spacing, and
visible non-whitespace character counts. The stylesheet is an independent implementation; no theme
CSS or font binaries are copied.

The chapter-prose page exposes `draft`, `final`, and `published`. Finalization locks AI and scene
edits. In `final`, a right-side review panel can request a structured back-check, show every impact
and question, and require an explicit author decision before enabling continuity apply. The panel
uses the same core service as CLI and offers an interrupted-transaction recovery check. Publication
uses a confirm dialog plus exact chapter-title confirmation, then locks prose and purges scene
prompts/AI artifacts while retaining scene outlines. Before publication, story-node delete actions
are available; a published descendant blocks the entire deletion. Git actions remain workspace-aware
or standalone scoped, and visible pane separators can be dragged (or focused and adjusted with
arrow keys) to allocate space.
