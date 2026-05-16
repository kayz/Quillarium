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
- [x] Obsidian vault selection is mandatory on first launch.

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

## Milestone UI-3: Welcome and Vault Setup

- [x] Show Quillarium logo/name.
- [x] Explain that novel data lives in the user's Obsidian vault.
- [x] Detect configured Obsidian directory.
- [x] Let user choose Obsidian directory.
- [x] Save Obsidian directory to global config.
- [x] Show current configured directory.
- [x] Add project list from `<Obsidian Vault>/novels`.
- [x] Add create novel button.

## Milestone UI-4: Project Creation Flow

- [x] Create novel form:
  - [x] title
  - [x] genre
  - [x] target words
  - [x] chapter words
  - [x] section words
  - [x] default theme
- [x] Create project under `<Obsidian Vault>/novels/<title>`.
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
  - [x] novel hierarchy tree
  - [x] section/scene selection
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
- [x] Bottom run panel:
  - [x] AI run history
  - [x] prompt
  - [x] raw output
  - [x] accepted output
  - [x] check report
- [x] Resizable panels.
- [x] Collapsible side panels.

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

- [x] Show book/volume/arc/chapter/section hierarchy.
- [x] Create outline nodes.
- [x] Edit outline body.
- [x] Add card view for story beats.
- [x] Add chapter hook marker.
- [x] Create scene from selected section.

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

## First UI Slice

The first useful UI slice should be:

1. choose Obsidian vault
2. create/open novel project
3. select a scene
4. edit prose
5. assemble context
6. run check
7. create dry-run / generation run
8. inspect run history

Everything else can layer onto that.
