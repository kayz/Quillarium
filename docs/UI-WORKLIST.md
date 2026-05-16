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

- [ ] Desktop shell: Electron first, or Tauri first?
- [ ] Editor engine: plain textarea, Markdown editor, or rich text editor?
- [ ] First UI target: desktop app only, or also local browser app?
- [ ] Theme defaults: which theme should be the default? Paper / Ink / Mist / Bamboo.
- [ ] Git workflow defaults: local Git only by default, with optional private GitHub remote?
- [ ] AI calls from desktop main process or renderer process?
- [ ] Whether Obsidian vault selection should be mandatory on first launch.

## Milestone UI-1: App Shell

- [ ] Add `apps/desktop`.
- [ ] Add Vite + React + TypeScript.
- [ ] Add desktop shell runtime.
- [ ] Reuse existing packages:
  - [ ] `@quillarium/core`
  - [ ] `@quillarium/checks`
  - [ ] `@quillarium/ai`
- [ ] Add app routes:
  - [ ] Welcome / vault setup
  - [ ] Project list
  - [ ] Project workspace
  - [ ] Settings
- [ ] Add app-level error boundary.
- [ ] Add loading and empty states.

## Milestone UI-2: Theme System and Design Tokens

- [ ] Implement CSS variable theme system.
- [ ] Add theme config model.
- [ ] Add user-level theme preference.
- [ ] Add project-level override in `project.yaml`.
- [ ] Create first theme: `paper`.
- [ ] Create dark theme: `ink`.
- [ ] Create light neutral theme: `mist`.
- [ ] Create green literary theme: `bamboo`.
- [ ] Add density tokens:
  - [ ] compact
  - [ ] comfortable
- [ ] Add font tokens:
  - [ ] UI font
  - [ ] editor font
  - [ ] mono font

## Milestone UI-3: Welcome and Vault Setup

- [ ] Show Quillarium logo/name.
- [ ] Explain that novel data lives in the user's Obsidian vault.
- [ ] Detect configured Obsidian directory.
- [ ] Let user choose Obsidian directory.
- [ ] Save Obsidian directory to global config.
- [ ] Show current configured directory.
- [ ] Add project list from `<Obsidian Vault>/novels`.
- [ ] Add create novel button.

## Milestone UI-4: Project Creation Flow

- [ ] Create novel form:
  - [ ] title
  - [ ] genre
  - [ ] target words
  - [ ] chapter words
  - [ ] section words
  - [ ] default theme
- [ ] Create project under `<Obsidian Vault>/novels/<title>`.
- [ ] Open newly created project workspace.
- [ ] Validate duplicate names.
- [ ] Allow opening an existing project folder.

## Milestone UI-5: Workspace Layout

- [ ] Top bar:
  - [ ] app name
  - [ ] project selector
  - [ ] current path: volume / chapter / section
  - [ ] AI status
  - [ ] Git/sync status
  - [ ] theme switcher
- [ ] Left structure panel:
  - [ ] novel hierarchy tree
  - [ ] section/scene selection
  - [ ] quick module nav: Canon, Characters, Timeline, Locations, Runs
- [ ] Center work area:
  - [ ] editor tab
  - [ ] outline tab
  - [ ] card/beat tab
- [ ] Right inspector:
  - [ ] Context & Checks cards
  - [ ] canon constraints
  - [ ] character state
  - [ ] timeline node
  - [ ] location
  - [ ] consistency check results
- [ ] Bottom run panel:
  - [ ] AI run history
  - [ ] prompt
  - [ ] raw output
  - [ ] accepted output
  - [ ] check report
- [ ] Resizable panels.
- [ ] Collapsible side panels.

## Milestone UI-6: Editor MVP

- [ ] Load scene Markdown.
- [ ] Edit prose body without damaging frontmatter.
- [ ] Save scene file.
- [ ] Show section title.
- [ ] Show target word count progress.
- [ ] Show current status badge.
- [ ] Add commands:
  - [ ] Generate
  - [ ] Rewrite
  - [ ] Check
  - [ ] Accept
- [ ] Show unsaved changes state.
- [ ] Keyboard shortcuts:
  - [ ] save
  - [ ] generate
  - [ ] check

## Milestone UI-7: Context and Checks Inspector

- [ ] Show assembled context summary for selected scene.
- [ ] Show active canon card.
- [ ] Show POV character state card.
- [ ] Show timeline node card.
- [ ] Show location card.
- [ ] Run deterministic checks.
- [ ] Display issues grouped by severity.
- [ ] Link issue rows back to source documents.
- [ ] Save check report into selected/latest run.

## Milestone UI-8: AI Run History

- [ ] List run directories for selected scene.
- [ ] Show run metadata.
- [ ] Preview prompt.
- [ ] Preview raw output.
- [ ] Preview accepted output.
- [ ] Preview check report.
- [ ] Accept raw output into scene.
- [ ] Compare raw vs accepted.
- [ ] Mark run status: created / generated / checked / accepted.

## Milestone UI-9: Canon Module

- [ ] List canon items.
- [ ] Filter by status.
- [ ] Filter by strength.
- [ ] Search canon text.
- [ ] Create canon item.
- [ ] Edit canon item.
- [ ] Mark deprecated.
- [ ] Show hard/soft badge.
- [ ] Show source badge.

## Milestone UI-10: Character Module

- [ ] List characters.
- [ ] Create/edit character.
- [ ] Edit speech style, desire, fear, bottom line.
- [ ] Edit OOC guardrails.
- [ ] Edit scene state.
- [ ] Edit volume arc matrix.
- [ ] Show character state in inspector.

## Milestone UI-11: Timeline Module

- [ ] List timeline chain.
- [ ] Append event.
- [ ] Show previous/next links.
- [ ] Validate forward-only chain.
- [ ] Show flashback reference separately.
- [ ] Link events to scenes.

## Milestone UI-12: Location Module

- [ ] List locations.
- [ ] Create/edit location.
- [ ] Create/edit route.
- [ ] Show location graph table.
- [ ] Check basic reachability.
- [ ] Link locations to scenes.

## Milestone UI-13: Outline and Beat Board

- [ ] Show book/volume/arc/chapter/section hierarchy.
- [ ] Create outline nodes.
- [ ] Edit outline body.
- [ ] Add card view for story beats.
- [ ] Add chapter hook marker.
- [ ] Create scene from selected section.

## Milestone UI-14: Git and Privacy

- [ ] Detect local Git repository in novel project.
- [ ] Initialize local Git repository.
- [ ] Show dirty/clean status.
- [ ] Commit accepted scene/run changes.
- [ ] Support optional remote config.
- [ ] Default remote mode: none.
- [ ] Add private GitHub remote flow later.
- [ ] Never default to public publishing.

## Milestone UI-15: Documentation and UX Review

- [ ] Add UI architecture docs.
- [ ] Add screenshots or mockups.
- [ ] Add theme customization docs.
- [ ] Add first-launch walkthrough.
- [ ] Add privacy and Git docs.
- [ ] Run a manual writing-session smoke test.

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
