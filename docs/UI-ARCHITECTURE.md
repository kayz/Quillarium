# Desktop UI Architecture

Quillarium Desktop is an Electron + Vite + React application in `apps/desktop`.

The renderer stays focused on interaction and presentation. File system access, Git operations, and AI calls run through Electron IPC in the main process. This keeps API keys and local paths out of the browser-like renderer and matches the privacy-first model.

## First Launch

The app requires an Obsidian vault before opening a project. Novel projects are created under:

```text
<Obsidian Vault>/novels/<Novel Title>
```

The selected vault and user theme are stored in the global Quillarium config at `~/.quillarium/config.json`.

## Data Model

The desktop app reads and writes the same Markdown + YAML frontmatter files as the CLI:

- `project.yaml` stores project defaults, including `default_theme`.
- `canon/`, `characters/`, `timeline/`, `locations/`, `outlines/`, and `scenes/` remain Obsidian-readable.
- `runs/` stores every AI context, prompt, raw output, accepted output, and check report.

The editor saves only the Markdown body for a scene and preserves frontmatter through `@quillarium/core`.

## Privacy and Git

Novel projects are private by default:

- No remote is configured during project creation.
- The desktop app can initialize a local Git repository.
- Commit support is local-first.
- GitHub remote setup is intentionally left as a later explicit flow, and must not default to public publishing.

## Theme System

Themes are CSS-variable based. The current first-party themes are:

- `paper`
- `ink`
- `mist`
- `bamboo`

User preference is stored globally, while each project can declare `default_theme` in `project.yaml`.

## Current UI Slice

The implemented desktop MVP supports:

1. choose an Obsidian vault
2. create or open a novel project
3. select a scene
4. edit and save scene prose
5. assemble context
6. run deterministic checks
7. create dry-run or AI generation records
8. preview run files
9. accept raw output into the scene
10. initialize and commit to local Git
