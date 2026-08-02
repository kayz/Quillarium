# Quillarium

Quillarium (羽笔馆) is a local-first, Obsidian-backed writing system for long-form fiction. It
stores a novel as Markdown and YAML, keeps planning facts traceable, records AI runs, checks
continuity, and exports accepted prose.

## What Works Now

- A file-backed project model for Canon, characters and states, timelines, locations and routes,
  world entries, foreshadowing, references, issues, strategies, patterns, hierarchical outlines,
  scenes, imports, reviews, and generation runs.
- A working source-run CLI for creating and editing those records, importing Markdown, assembling
  context, generating drafts, running deterministic or opt-in semantic checks, accepting runs, and
  exporting manuscripts.
- An Electron desktop app for choosing an Obsidian vault, creating or opening projects, planning,
  writing, importing Markdown text, generating/checking scenes, reviewing runs, and accepting prose.
- Markdown and plain-text manuscript export from accepted outputs or final scenes, with explicit gap
  reporting and optional volume filtering.
- SillyTavern Character Card import from CCv2/CCv3 JSON or PNG, CCv2 JSON export, and Canon/world-entry
  export as World Info JSON.

AI is optional for project management, import, context assembly, deterministic checks, and export.
Generation and `check --semantic` require an OpenAI-compatible endpoint or configured provider.

## Quick Start

Prerequisites are Node.js and pnpm. From the repository root:

```bash
pnpm install
pnpm build
pnpm test
```

Create a local vault and project:

```bash
pnpm cli config set-vault ./local-vaults
pnpm cli init "My Novel" --genre fantasy
pnpm cli --help
```

The project is created at `./local-vaults/novels/My Novel`. Continue with the
[CLI guide](docs/CLI.md) for the end-to-end writing, checking, acceptance, export, and SillyTavern
flows.

## Desktop Flow

Start the Electron app from source:

```bash
pnpm desktop:dev
```

Then choose an Obsidian vault, create or open a novel, build its outline and supporting modules,
select a scene, and edit or generate prose. The context/check inspector and recorded runs make the
inputs and outputs reviewable; accepting a run writes its raw output to `output-accepted.md` and the
scene document. AI profiles and credential status are managed from desktop settings.

Use `pnpm desktop:build` to verify the desktop source build. Windows and macOS packaging is configured
through `electron-builder`:

```bash
pnpm --filter @quillarium/desktop package:win
pnpm --filter @quillarium/desktop package:mac
```

Artifacts are written under `apps/desktop/release/`. A `v<desktop-version>` tag triggers the release
workflow, builds Windows NSIS and macOS DMG artifacts on native runners, and uploads them to the
matching GitHub Release.

## CLI Flow

A typical CLI workflow is:

1. Configure a vault and initialize a project.
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
Obsidian Vault/
  novels/
    My Novel/
      project.yaml
      canon/              characters/       character-states/
      timeline/           locations/        world/
      foreshadowing/      references/       issues/
      strategy/           patterns/         resources/
      causality/          outlines/         scenes/
      prompts/            runs/             imports/
      reviews/            style/            exports/
      sillytavern/        .quillarium/
```

## Packages

- [@quillarium/core](packages/core/README.md) — project storage, documents, context, imports, runs,
  review, and manuscript export.
- [@quillarium/checks](packages/checks/README.md) — deterministic and injectable semantic checks.
- [@quillarium/ai](packages/ai/README.md) — AI configuration, requests, prompts, and recorded generation
  runs.
- [@quillarium/cli](packages/cli/README.md) — Commander-based CLI assembly.
- [@quillarium/sillytavern](packages/sillytavern/README.md) — Character Card and World Info conversion.

The product and agent workflow rationale is documented in
[docs/AGENT-DESIGN.md](docs/AGENT-DESIGN.md).

## Current Boundaries

- Desktop installers are unsigned and currently use Electron's default application icon. Windows
  NSIS packaging has been exercised locally; the macOS DMG target still requires its first native
  tag-build verification. Windows SmartScreen and macOS Gatekeeper may therefore display warnings.
- Manuscript export supports Markdown and plain text, not PDF, EPUB, or word-processor formats.
- SillyTavern import does not support CHARX archives. CCv3 cards can be imported, but embedded CCv3
  assets are not materialized; the original card JSON is retained as a raw sidecar. Character export
  is CCv2 JSON only.
- The PNG reader extracts `ccv3` or `chara` text metadata; it is not a general PNG asset or CRC
  validation library.

## License

[MIT](LICENSE)
