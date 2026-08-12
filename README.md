# Quillarium

Quillarium (羽笔馆) is a local-first, Obsidian-backed writing system for long-form fiction. It
stores a novel as Markdown and YAML, keeps planning facts traceable, records AI runs, checks
continuity, and exports accepted prose.

Quillarium is the sole product runtime. Obsidian is its durable manual-editing surface. A writing
workspace may register multiple projects and shared guidance, while each project directory is both
an independent Obsidian vault and a Quillarium project root.

## What Works Now

- A file-backed project model for Canon, characters and states, timelines, locations and routes,
  world entries, foreshadowing, references, issues, strategies, patterns, hierarchical outlines,
  scenes, imports, reviews, and generation runs.
- A working source-run CLI for creating and editing those records, importing Markdown, assembling
  context, generating drafts, running deterministic or opt-in semantic checks, accepting runs, and
  exporting manuscripts.
- An Electron desktop app for registering a writing workspace, creating or opening direct
  project-vaults, safely migrating legacy projects, planning, writing, generating/checking scenes,
  reviewing runs, and accepting prose.
- Markdown and plain-text manuscript export from accepted outputs or final scenes, with explicit gap
  reporting and optional volume filtering.
- An optional retained SillyTavern interchange package for CCv2/CCv3 JSON or PNG import, CCv2 JSON
  export, and Canon/world-entry export as World Info JSON. This package is not a supported
  compatibility target or roadmap commitment.

AI is optional for project management, import, context assembly, deterministic checks, and export.
Generation and `check --semantic` require an OpenAI-compatible endpoint or configured provider.

## Quick Start

Prerequisites are Node.js and pnpm. From the repository root:

```bash
pnpm install
pnpm build
pnpm test
```

Given a directory containing `quillarium-workspace.yaml` and `projects/`, register it and create a
direct project-vault:

```bash
pnpm cli config set-workspace ./writing-workspace
pnpm cli init "My Novel" --id my-novel --genre fantasy
pnpm cli --help
```

The project is created and registered at `./writing-workspace/projects/my-novel`; that directory is
also the Obsidian vault. Explicit `init --vault <path>` remains only for legacy compatibility.
Continue with the
[CLI guide](docs/CLI.md) for the end-to-end writing, checking, acceptance, and export flow. The guide
also documents the optional retained SillyTavern commands.

## Desktop Flow

Start the Electron app from source:

```bash
pnpm desktop:dev
```

Then register a writing workspace, open or create a project-vault, build its outline and supporting
modules, select a scene, and edit or generate prose. A configured legacy vault can still be opened or
migrated through the explicit dry-run, backup, apply, verify, and report flow; migration never moves
or deletes the source. The context/check inspector and recorded runs make inputs and outputs
reviewable. AI profiles and credential status are managed from desktop settings.

Use `pnpm desktop:build` to verify the desktop source build. The existing `electron-builder`
configuration retains Windows and macOS packaging commands:

```bash
pnpm --filter @quillarium/desktop package:win
pnpm --filter @quillarium/desktop package:mac
```

Artifacts are written under `apps/desktop/release/`. A `v<desktop-version>` tag triggers the release
workflow, builds Windows NSIS and macOS DMG artifacts on native runners, and uploads them to the
matching GitHub Release. Windows NSIS is the current locally validated packaging target. Native macOS
DMG validation, a real tag/GitHub Release, and fresh-machine installation, credential migration, and
first-launch validation are deferred; the existing commands and workflow remain configured but are
not current acceptance gates.

## CLI Flow

A typical CLI workflow is:

1. Configure a writing workspace and initialize a direct project-vault.
2. Add Canon, characters, locations, timeline events, an outline, and scenes.
3. Assemble context or run `generate --dry-run` to inspect the recorded prompt without a network
   call.
4. Generate a draft, run deterministic checks, and optionally add `--semantic` for AI-assisted OOC,
   state-drift, and Canon-conflict findings.
5. Inspect and accept a run, then export accepted prose as Markdown or plain text.

All CLI examples and the current command map are in [docs/CLI.md](docs/CLI.md). The runtime command
help remains authoritative:

```bash
pnpm cli --help
pnpm cli <command> --help
```

## Project Layout

```text
Writing Workspace/
  quillarium-workspace.yaml
  methodology/            templates/
  projects/
    my-novel/              # Quillarium project root and Obsidian vault
      .obsidian/
      project.yaml
      canon/               characters/       character-states/
      timeline/            locations/        world/
      foreshadowing/       references/       issues/
      strategy/            patterns/         resources/
      causality/           outlines/         scenes/
      prompts/             runs/             imports/
      reviews/             style/            exports/
      sillytavern/         .quillarium/
```

Workspace manifests contain only relative, contained paths and non-secret metadata. Machine-local
paths and credentials stay in the user configuration outside the workspace.

## Packages

- [@quillarium/core](packages/core/README.md) — project storage, documents, context, imports, runs,
  review, and manuscript export.
- [@quillarium/checks](packages/checks/README.md) — deterministic and injectable semantic checks.
- [@quillarium/ai](packages/ai/README.md) — AI configuration, requests, prompts, and recorded generation
  runs.
- [@quillarium/cli](packages/cli/README.md) — Commander-based CLI assembly.
- [@quillarium/sillytavern](packages/sillytavern/README.md) — Character Card and World Info conversion.

The product and agent workflow rationale is documented in
[docs/AGENT-DESIGN.md](docs/AGENT-DESIGN.md). The target architecture and delivery priorities are in
[docs/DESIGN.md](docs/DESIGN.md) and [ROADMAP.md](ROADMAP.md). External design research, independent
implementation rules, and license boundaries are recorded in
[docs/REFERENCES.md](docs/REFERENCES.md).

## Current Boundaries

- Desktop installers are unsigned and currently use Electron's default application icon. Windows
  NSIS packaging has been exercised locally and is the current packaging validation target, so
  Windows SmartScreen may display a warning. macOS DMG/tag-release and fresh-machine validation are
  deferred rather than current release blockers.
- Manuscript export supports Markdown and plain text, not PDF, EPUB, or word-processor formats.
- The optional retained SillyTavern import does not support CHARX archives. CCv3 cards can be imported,
  but embedded CCv3 assets are not materialized; the original card JSON is retained as a raw sidecar.
  Character export is CCv2 JSON only, and this interchange is not a supported compatibility surface.
- The PNG reader extracts `ccv3` or `chara` text metadata; it is not a general PNG asset or CRC
  validation library.

## License

[MIT](LICENSE)
