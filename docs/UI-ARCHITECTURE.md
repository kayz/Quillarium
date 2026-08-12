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

The app can also register a legacy Obsidian root for compatibility listing and explicit migration.
Migration selects one legacy project, runs dry-run → backup → apply → verify → report, never follows
symlinks or copies nested `.git`, and does not move, delete, or silently rewrite the source.

The workspace's local absolute path, recent project, legacy vault path, theme, and credentials stay in
the global Quillarium config at `~/.quillarium/config.json`; they are never written to the workspace.

## Data Model

The desktop app reads and writes the same Markdown + YAML frontmatter files as the CLI:

- `project.yaml` v2 stores the stable path-safe `id`, display `title`, legacy `aliases`, and project
  defaults including `default_theme`.
- `canon/`, `characters/`, `timeline/`, `locations/`, `outlines/`, and `scenes/` remain Obsidian-readable.
- `runs/` stores AI context, prompt, raw/accepted output, checks, and immutable shared-guidance
  snapshots with source path, scope, SHA-256, and read time.

The editor saves only the Markdown body for a scene and preserves frontmatter through `@quillarium/core`.

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

The implemented desktop MVP supports:

1. register a writing workspace and optionally a legacy vault
2. create/open a direct project-vault or migrate one legacy project
3. select a scene
4. edit and save scene prose
5. assemble context
6. run deterministic checks
7. create dry-run or AI generation records
8. preview run files
9. accept raw output into the scene
10. commit with workspace-aware or standalone Git scope
