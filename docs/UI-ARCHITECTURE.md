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
- `canon/`, `characters/`, `timeline/`, `locations/`, `outlines/`, and `scenes/` remain Obsidian-readable.
- `runs/` stores AI context, prompt, raw/accepted output, checks, and immutable shared-guidance
  snapshots with source path, scope, SHA-256, and read time.

Planning records use schema-aware controls for known scalar fields and reversible JSON editors for
arrays, objects, and unknown frontmatter. Markdown bodies have Source and Preview modes backed by
the same unsaved value. Preview supports headings, lists, quotations, tables, links, and code fences;
raw HTML is skipped and unsafe URLs are rejected. Saves preserve frontmatter through
`@quillarium/core` and use atomic file replacement.

## Planning Record Creation

The planning modules for characters, world entries, timeline events, locations, foreshadowing,
strategy/style, patterns, issues, and references use one guided AI flow:

1. the renderer opens a multi-turn discussion dialog and supplies only the current project and module
   identifiers
2. the main process assembles project metadata context and asks the configured background AI profile
   for a strict, schema-validated proposal
3. the author can continue the discussion and edit the proposed title, document type, structured
   fields, and Markdown body without writing files
4. cancel leaves the project unchanged; explicit confirmation performs one atomic creation and then
   refreshes and selects the new record

This flow creates new planning records only. It cannot edit existing records, accept prose, mutate
Canon, or bypass the accepted-text lifecycle.

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
5. edit schema-aware metadata and switch Markdown bodies between safe Source and Preview modes
6. select, edit, and save scene prose
7. assemble context and run deterministic checks
8. create dry-run or AI generation records and preview run files
9. accept raw output into the scene
10. commit with workspace-aware or standalone Git scope
