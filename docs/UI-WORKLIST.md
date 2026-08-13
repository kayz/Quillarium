# UI Worklist: Quillarium Desktop Writing Studio

This worklist turns the CLI-first Obsidian workflow into a calm desktop writing interface.

The UI direction is:

> Scrivener structure + Ulysses writing calm + Campfire worldbuilding modules + Final Draft beat workflow.

It should not feel like a VSCode or Obsidian clone.

## Product Principles

- The writer should see the novel, not the filesystem.
- Prose writing mode should be quiet and low-friction.
- Planning mode should expose structure, cards, and hierarchy.
- Context mode should make canon, characters, time, location, and checks visible.
- AI runs must be traceable but should not overwhelm the editor.
- User novel projects are private by default, even though Quillarium itself is open source.

## Confirmation Points

These need product/design confirmation before or during implementation:

- [x] Desktop shell: Electron first.
- [x] Editor engine: textarea Markdown body first; preserve YAML frontmatter.
- [x] First UI target: desktop app only.
- [x] Theme defaults: Paper by default, with Ink / Mist / Bamboo available.
- [x] Git workflow defaults: local Git only by default, optional remote later.
- [x] AI calls from desktop main process.
- [x] Writing-workspace registration is the primary first-launch gate; a legacy vault is optional.

## Milestone UI-1: App Shell

- [x] Add `apps/desktop`.
- [x] Add Vite + React + TypeScript.
- [x] Add desktop shell runtime.
- [x] Reuse existing packages:
  - [x] `@quillarium/core`
  - [x] `@quillarium/checks`
  - [x] `@quillarium/ai`
- [x] Add app routes:
  - [x] Welcome / vault setup
  - [x] Project list
  - [x] Project workspace
  - [x] Settings
- [x] Add app-level error boundary.
- [x] Add loading and empty states.

## Milestone UI-2: Theme System and Design Tokens

- [x] Implement CSS variable theme system.
- [x] Add theme config model.
- [x] Add user-level theme preference.
- [x] Add project-level override in `project.yaml`.
- [x] Create first theme: `paper`.
- [x] Create dark theme: `ink`.
- [x] Create light neutral theme: `mist`.
- [x] Create green literary theme: `bamboo`.
- [x] Add density tokens:
  - [x] compact
  - [x] comfortable
- [x] Add font tokens:
  - [x] UI font
  - [x] editor font
  - [x] mono font

## Milestone UI-3: Welcome, Workspace, and Legacy Compatibility

- [x] Show Quillarium logo/name.
- [x] Explain that each project directory is its own Obsidian vault.
- [x] Validate and register `quillarium-workspace.yaml`.
- [x] Save the machine-local workspace path only in global config.
- [x] Show projects registered in the workspace manifest.
- [x] Retain optional legacy-vault listing and explicit lossless migration.
- [x] Add create novel button.

## Milestone UI-4: Project Creation Flow

- [x] Create novel form:
  - [x] title
  - [x] genre
  - [x] target words
  - [x] chapter words
  - [x] section words
  - [x] default theme
- [x] Create and register `projects/<project-id>/` as a direct project-vault.
- [x] Open newly created project workspace.
- [x] Validate duplicate names.
- [x] Allow opening an existing project folder.

## Milestone UI-5: Workspace Layout

- [x] Top bar:
  - [x] app name
  - [x] project selector
  - [x] current path: volume / chapter / section
  - [x] AI status
  - [x] Git/sync status
  - [x] theme switcher
- [x] Left structure panel:
  - [x] unified book → volume → arc → chapter → AI-writing workflow tree
  - [x] each outline level plans its direct child level
  - [x] quick module nav: Canon, Characters, Timeline, Locations, Runs
- [x] Center work area:
  - [x] editor tab
  - [x] outline tab
  - [x] card/beat tab
- [x] Right inspector:
  - [x] Context & Checks cards
  - [x] canon constraints
  - [x] character state
  - [x] timeline node
  - [x] location
  - [x] consistency check results
- [x] Chapter AI-writing workspace:
  - [x] assemble a first prompt from current context
  - [x] let the author adjust the actual generation prompt
  - [x] snapshot the adjusted prompt into the run
  - [x] AI run history, raw/accepted output, checks, and comparison
- [x] Resizable panels.
- [x] Pointer- and keyboard-resizable planning navigation/collection/detail columns.
- [x] Pointer- and keyboard-resizable metadata/Markdown detail rows.
- [x] Pointer- and keyboard-resizable writing navigation and overview/detail.
- [x] Collapsible side panels.
- [x] Collapsible metadata groups with direct nested-field editors.
- [x] Tag, trigger, category, topic, kind, and scope chip presentation.
- [x] Exact-match cross-type tag drawer from the right.

## Milestone UI-6: Editor MVP

- [x] Load scene Markdown.
- [x] Edit prose body without damaging frontmatter.
- [x] Save scene file.
- [x] Show section title.
- [x] Show target word count progress.
- [x] Show current status badge.
- [x] Add commands:
  - [x] Generate
  - [x] Rewrite
  - [x] Check
  - [x] Accept
- [x] Show unsaved changes state.
- [x] Keyboard shortcuts:
  - [x] save
  - [x] generate
  - [x] check

## Milestone UI-7: Context and Checks Inspector

- [x] Show assembled context summary for selected scene.
- [x] Show active canon card.
- [x] Show POV character state card.
- [x] Show timeline node card.
- [x] Show location card.
- [x] Run deterministic checks.
- [x] Display issues grouped by severity.
- [x] Link issue rows back to source documents.
- [x] Save check report into a run.

## Milestone UI-8: AI Run History

- [x] List run directories for selected scene.
- [x] Show run metadata.
- [x] Preview prompt.
- [x] Preview raw output.
- [x] Preview accepted output.
- [x] Preview check report.
- [x] Accept raw output into scene.
- [x] Compare raw vs accepted.
- [x] Mark run status: created / generated / checked / accepted.

## Milestone UI-9: Canon Module

- [x] List canon items.
- [x] Filter by status.
- [x] Filter by strength.
- [x] Search canon text.
- [x] Create canon item.
- [x] Edit canon item.
- [x] Mark deprecated.
- [x] Show hard/soft badge.
- [x] Show source badge.

## Milestone UI-10: Character Module

- [x] List characters.
- [x] Create/edit character.
- [x] Edit speech style, desire, fear, bottom line.
- [x] Edit OOC guardrails.
- [x] Edit scene state.
- [x] Edit volume arc matrix.
- [x] Show character state in inspector.

## Milestone UI-11: Timeline Module

- [x] List timeline chain.
- [x] Append event.
- [x] Show previous/next links.
- [x] Validate forward-only chain.
- [x] Show flashback reference separately.
- [x] Link events to scenes.

## Milestone UI-12: Location Module

- [x] List locations.
- [x] Create/edit location.
- [x] Create/edit route.
- [x] Show location graph table.
- [x] Check basic reachability.
- [x] Link locations to scenes.

## Milestone UI-13: Outline and Beat Board

- [x] Show overview/book/volume/part/optional-act/chapter/scene hierarchy.
- [x] Create outline nodes.
- [x] Edit outline body.
- [x] Add card view for story beats.
- [x] Add chapter hook marker.
- [x] Create ordered scene from selected chapter.
- [x] Allow a chapter to belong directly to a part or to one optional act.
- [x] Compose prompts from removable source cards beside the exact editable prompt.
- [x] Append accepted scene prose to an independent chapter-prose document in order.
- [x] Enforce draft/final/published chapter locks in core and desktop write paths.
- [x] Require two confirmations before publication and purge scene run artifacts afterward.
- [x] Provide large serif chapter/scene editors with character counts and resizable panes.

## Milestone UI-14: Git and Privacy

- [x] Detect local Git repository in novel project.
- [x] Initialize local Git repository.
- [x] Show dirty/clean status.
- [x] Commit accepted scene/run changes.
- [x] Support optional remote config.
- [x] Default remote mode: none.
- [x] Add private GitHub remote flow later.
- [x] Never default to public publishing.

## Milestone UI-15: Documentation and UX Review

- [x] Add UI architecture docs.
- [x] Add screenshots or mockups.
- [x] Add theme customization docs.
- [x] Add first-launch walkthrough.
- [x] Add privacy and Git docs.
- [x] Run a manual writing-session smoke test.

## Milestone UI-16: Planning Card Workbench

- [x] Give every planning card enablement, material provenance, and validated typed relations.
- [x] Keep reference material status-free and show its live derived-card reverse index.
- [x] Render timeline nodes as one ordered chain with concurrent events.
- [x] Add a draggable time-filtered character relationship graph.
- [x] Add a six-scale positioning/layout location explorer with coordinate and compass views.
- [x] Activate world entries from current-scope keywords and explicit links.
- [x] Evaluate foreshadowing conditions as non-mutating author reminders.
- [x] Merge new style, structure, and pattern guidance into enabled narrative cards.
- [x] Split generated prompts into removable typed source cards.
- [x] Persist manual project AI-check findings as deduplicated issue cards.
- [x] Let issue cards open or AI-edit their related records in place.
- [x] Localize every structured field with a title and explanation.
- [x] Keep controls compact and reserve elastic space for prose, maps, timelines, and graphs.

## First UI Slice

The first useful UI slice should be:

1. register writing workspace (optionally register/migrate a legacy vault)
2. create/open a direct project-vault
3. select a scene
4. edit prose
5. assemble context
6. run check
7. create dry-run / generation run
8. inspect run history

Everything else can layer onto that.
