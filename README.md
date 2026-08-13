# Quillarium

Quillarium (羽笔馆) is a local-first, Obsidian-backed writing system for long-form fiction. It
stores a novel as Markdown and YAML, keeps planning facts traceable, records AI runs, checks
continuity, and exports accepted prose.

Quillarium is the sole product runtime. Obsidian is its durable manual-editing surface. A writing
workspace may register multiple projects and shared guidance, while each project directory is both
an independent Obsidian vault and a Quillarium project root.

This document describes the `0.2.0-alpha.1` code line as of 2026-08-13. “Works now” means the
behavior is present in the repository and covered by local tests; planned context budgeting,
multi-candidate branching, writing presets, lifecycle events, and atomic continuity apply are kept
in the [roadmap](ROADMAP.md), not presented as completed features.

## What Works Now

- A file-backed project model for Canon, characters and time-scoped relationships, linked timelines,
  spatial locations and layouts, world entries, foreshadowing, references, issues, narrative cards, seven-level story
  structure, independent chapter prose, scenes, imports, reviews, and generation runs.
- A working source-run CLI for creating and editing those records, importing Markdown, assembling
  context, generating drafts, running deterministic or opt-in semantic checks, accepting runs, and
  exporting manuscripts.
- An Electron desktop app whose welcome screen registers a Git-backed writing library and opens or
  creates direct project-vaults. Planning records can be created through a multi-turn background-AI
  conversation, reviewed as structured fields plus Markdown, and written only after confirmation.
- Safe source/preview switching for Markdown-backed planning documents, including GFM tables,
  nested lists, quotes, links, and fenced code. Raw HTML is not executed. Frontmatter is edited
  through direct controls: tags, trigger words, categories and similar index fields are chips;
  lists and nested records use add/remove rows; and only the Markdown body exposes syntax.
- Clickable project tags open a right-side cross-type index, while collapsible metadata groups and
  draggable column/row separators keep dense records and long Markdown bodies usable.
- A visual planning workbench for a deterministic timeline chain, draggable time-filtered character
  relationships, six-scale location exploration, reference reverse indexes, and issue-card repair.
- Manual project AI checks exclude source material and disabled cards, then persist stable findings as
  issue cards. World keywords and foreshadowing conditions activate explainable prompt sources.
- Markdown and plain-text manuscript export from finalized/published chapter prose, accepted outputs,
  or final scenes, with explicit gap reporting and optional volume filtering.
- A seven-level workflow: overview and book outline at the top, then volume, part, optional act,
  chapter, and scene. Scenes generate plain-text candidates; accepted scenes append to chapter prose.
  Chapter prose progresses from draft to final to immutable published state.
- An optional retained SillyTavern interchange package for CCv2/CCv3 JSON or PNG import, CCv2 JSON
  export, and Canon/world-entry export as World Info JSON. This package is not a supported
  compatibility target or roadmap commitment.

AI is optional for project management, import, context assembly, deterministic checks, and export.
Generation and `check --semantic` require an OpenAI-compatible endpoint or configured provider.

The context compiler is deterministic, explainable, and model-budgeted. It follows the outline
chain, explicit pins and exclusions, typed relations, timeline links, keyword activation, and
enabled-card state; performs cycle-safe bounded relationship expansion; then emits typed
`PromptBlock` values and a complete `ContextTrace`. DeepSeek V4 and supported OpenAI model families
use packaged exact tokenizers. Unknown tokenizer/model combinations fail closed instead of silently
using a character estimate. Candidate groups/branches and versioned `WritingPreset` snapshots remain
the next P0 work.

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

Then register a GitHub writing library, open or create a project-vault, build its outline and
supporting modules, select a chapter, prepare a scene, and edit or generate prose. The AI page shows
removable prompt-source cards beside the exact editable prompt, plus a large resizable chapter-prose
editor with word-count feedback. Legacy layouts remain compatible in
the runtime and migration services, but they are not an active welcome-screen choice. Migration is
always an explicit dry-run, backup, apply, verify, and report operation and never moves or deletes
the source. The context/check inspector and recorded runs make inputs and outputs reviewable.
Theme, density, language, GitHub credentials, and each AI profile have independent save actions in
desktop settings.

Planning details are presented as record cards rather than serialized frontmatter. Click a tag chip
to pull in every exactly matching project record from the right; each result shows its document
type. Drag the visible dividers to resize navigation, collection, detail, writing, and lower-run
areas. Dividers are keyboard-focusable and respond to arrow keys. These sizes are session UI state
and never enter project files.

Use `pnpm desktop:build` to verify the desktop source build. The existing `electron-builder`
configuration retains Windows and macOS packaging commands:

```bash
pnpm --filter @quillarium/desktop package:win
pnpm --filter @quillarium/desktop package:mac
```

Artifacts are written under `apps/desktop/release/`. A `v<desktop-version>` tag triggers the release
workflow only when that immutable tag matches every package version and points to the latest
`master`. The workflow reruns the complete quality gate, builds Windows x64 NSIS plus macOS x64 and
arm64 DMGs on native runners, verifies the complete installer set, and only then creates one GitHub
Release. Alpha versions are marked as pre-releases automatically. A failed tag is not moved, reused,
or rerun; release work continues with a new forward-only version. See
[docs/RELEASING.md](docs/RELEASING.md).

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

The desktop is the primary surface for the current seven-level hierarchy and explicit timeline
coordinates. The source-run CLI retains two pre-0.2 option names for compatibility:
`scene create --section` receives the owning chapter ID, and `--timeline` receives the linked
timeline event ID. These names do not change the current `chapter_id`-based scene model.

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
      narrative/           strategy/         patterns/         resources/
      causality/           outlines/         chapters/         scenes/
      prompts/             runs/             imports/
      reviews/             style/            exports/
      sillytavern/         .quillarium/
```

`strategy/` and `patterns/` are retained for legacy compatibility. New style, structure, pacing, and
genre guidance is created in `narrative/`.

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

[docs/MVP-WORKLIST.md](docs/MVP-WORKLIST.md) is an explicitly historical checklist for the original
CLI/vault MVP. It is retained for provenance and is not a current usage guide.

## Current Boundaries

- Desktop installers are unsigned and currently use Electron's default application icon. Windows
  SmartScreen or macOS Gatekeeper may therefore display a warning. CI verifies all three installer
  architectures, while fresh-machine installation, restart, migration, credential, and accessibility
  checks remain explicit human release-acceptance work.
- Manuscript export supports Markdown and plain text, not PDF, EPUB, or word-processor formats.
- The optional retained SillyTavern import does not support CHARX archives. CCv3 cards can be imported,
  but embedded CCv3 assets are not materialized; the original card JSON is retained as a raw sidecar.
  Character export is CCv2 JSON only, and this interchange is not a supported compatibility surface.
- The PNG reader extracts `ccv3` or `chara` text metadata; it is not a general PNG asset or CRC
  validation library.

## License

[MIT](LICENSE)
