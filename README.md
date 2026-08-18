<h1 align="center">
  <img src="assets/brand/quillarium-wordmark.png" alt="Quillarium" width="560" />
</h1>

<p align="center">
  <img src="assets/brand/quillarium-q.png" alt="Quillarium Q app icon" width="88" />
</p>

Quillarium (羽笔馆) is a local-first, Obsidian-backed writing system for long-form fiction. It
stores a novel as Markdown and YAML, keeps planning facts traceable, records AI runs, checks
continuity, and exports accepted prose.

Quillarium is the sole product runtime. Obsidian is its durable manual-editing surface. A writing
workspace may register multiple projects and shared guidance, while each project directory is both
an independent Obsidian vault and a Quillarium project root.

This document describes the `0.2.2` code line as of 2026-08-18. “Works now” means the
behavior is present in the repository and covered by local tests. Strongly typed lifecycle events
remain in the [roadmap](ROADMAP.md); atomic continuity apply is implemented as a reviewed,
recoverable operation.

## What Works Now

- A file-backed project model for Canon, characters and time-scoped relationships, linked timelines,
  spatial locations and layouts, world entries, foreshadowing, references, issues, narrative cards, seven-level story
  structure, independent chapter prose, scenes, imports, reviews, and generation runs.
- A working source-run CLI for creating and editing those records, importing Markdown, assembling
  context, generating drafts, running deterministic or opt-in semantic checks, accepting runs, and
  exporting manuscripts.
- An Electron desktop app whose welcome screen turns any chosen local folder into a writing library
  and opens or creates direct project-vaults without requiring Git or a GitHub account. GitHub can be
  connected later as an optional upload target. Planning records can be created through a multi-turn background-AI
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
- Versioned project writing presets bind a connection-profile role, model overrides, prompt stack,
  block order, deterministic context policy, and check policy. Desktop and CLI select the same preset,
  and every generation run stores its sanitized immutable snapshot and SHA-256 identity.
- Three built-in creator assistants organize source material, rehearse a character, and review
  continuity through bounded task-specific stages. Versioned ContextBundles select what project
  knowledge is visible, isolated assistant-prompt versions define how each assistant works, and
  WritingPresets define model/common prompt structure. Each session freezes exact configuration and
  records messages, permissions, sources, token use, traces, raw/repair output, and proposals.
  Assistant conversation is not Canon and every project/configuration write remains author-approved.
- One generation action can create two to eight independently retained candidates in a shared run
  group. Desktop and CLI compare candidate prose and checks, explicitly select one without writing
  prose, and create a new branch from any retained candidate. Only the separate accept action writes
  scene and chapter prose.
- A finalized chapter can open an AI-assisted continuity review without granting the model write
  authority. Every executable change requires an explicit author decision. Desktop and CLI use the
  same service to validate all targets and hashes, retain complete backups, apply the set, reread and
  verify every file, and record a recovery audit. Any failure restores the whole set.
- Markdown and plain-text manuscript export from finalized/published chapter prose, accepted outputs,
  or final scenes, with explicit gap reporting and optional volume filtering.
- A seven-level workflow: overview and book outline at the top, then volume, part, optional act,
  chapter, and scene. Scenes generate plain-text candidates; accepted scenes append to chapter prose.
  Chapter prose progresses from draft to final to immutable published state.
- A searchable, keyboard-accessible, virtualized planning-card selector stores stable IDs across
  relations and time-aware foreshadowing controls. Planning AI conversations retain multiple
  independently editable proposals and keep an existing source card anchored first through restore.
- A dedicated issue workspace supports batch ignore/resolve/reopen. Stable suppression fingerprints
  prevent ignored findings from recurring without incorrectly suppressing later resolved occurrences.
- A book-generation header, exact PromptEnvelope/provider-request snapshots, and a read-only
  block/text/message viewer make the actual model-visible prompt inspectable and safely copyable.
- Independent public CCv3 interchange can create a new empty-story project from a JSON/PNG character
  card and export selected novel settings into one cover-backed CCv3 PNG. It never transfers prose,
  story plans, prompts, presets, API configuration, credentials, or runtime state.

AI is optional for project management, import, context assembly, deterministic checks, and export.
Generation and `check --semantic` require an OpenAI-compatible endpoint or configured provider.

The context compiler is deterministic, explainable, and model-budgeted. It follows the outline
chain, explicit pins and exclusions, typed relations, timeline links, keyword activation, and
enabled-card state; performs cycle-safe bounded relationship expansion; then emits typed
`PromptBlock` values and a complete `ContextTrace`. DeepSeek V4 and supported OpenAI model families
use packaged exact tokenizers. Unknown tokenizer/model combinations fail closed instead of silently
using a character estimate. Run metadata records candidate group, parent, branch, index, and
selection time; every candidate keeps its own prompt, output, check report, and comparison score.

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

Then choose any local folder as the writing library, open or create a project-vault, build its outline and
supporting modules, select a chapter, prepare a scene, and edit or generate prose. The AI page shows
removable prompt-source cards beside the exact editable prompt, plus a large resizable chapter-prose
editor with word-count feedback. Legacy layouts remain compatible in
the runtime and migration services, but they are not an active welcome-screen choice. Migration is
always an explicit dry-run, backup, apply, verify, and report operation and never moves or deletes
the source. The context/check inspector and recorded runs make inputs and outputs reviewable.
The full-width **Creator Assistants** workspace shows sessions and assistants on the left,
conversation and exploration/proposals in the center, and sources, reasons, authority, token use,
permissions, and output destination on the right. Character cards, chapters/scenes, and material
import can open the relevant assistant directly.
On a finalized chapter, **Final review & apply** presents every proposed continuity impact and
question for an author decision, then enables atomic apply only when no decision is open. **Recovery
check** restores an interrupted transaction from retained before images.
Theme, density, language, GitHub credentials, each AI profile, and the project writing preset have
explicit settings actions. A legacy project without a preset must explicitly create/select one
before generation.

Settings can manually check the public Quillarium GitHub Releases feed. The check is aware of
stable and prerelease channels, needs no GitHub account or token, and opens the official release
page when a newer version exists. It runs only when requested; unsigned builds do not silently
download or install updates.

Selecting an ordinary folder creates only `quillarium-workspace.yaml` and `projects/` while preserving
unrelated files. It does not initialize Git, contact GitHub, or write credentials into the library.
After a GitHub Token is explicitly saved, a standalone local project can be connected and uploaded
from Settings.

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
2. Inspect or select the project's versioned writing preset.
3. Add Canon, characters, locations, timeline events, an outline, and scenes.
4. Assemble context or run `generate --dry-run` to inspect the recorded prompt without a network
   call.
5. Generate several candidates, run deterministic checks, and optionally add `--semantic` for
   AI-assisted OOC, state-drift, and Canon-conflict findings.
6. Compare candidates, explicitly select one, then separately accept it and export accepted prose.

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
      prompts/             presets/          runs/             imports/
      context-bundles/     creator-roles/    explorations/
      reviews/             # reviews plus apply audits, backups, and staged copies
      style/               exports/
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
The typed Agent task, ContextBundle, creator-assistant, session, and permission decision is recorded
in
[docs/adr/ADR-agent-runtime-and-context-bundles.md](docs/adr/ADR-agent-runtime-and-context-bundles.md).

[docs/MVP-WORKLIST.md](docs/MVP-WORKLIST.md) is an explicitly historical checklist for the original
CLI/vault MVP. It is retained for provenance and is not a current usage guide.

## Current Boundaries

- Desktop installers are unsigned. Windows SmartScreen or macOS Gatekeeper may therefore display a
  warning. CI verifies all three installer
  architectures, while fresh-machine installation, restart, migration, credential, and accessibility
  checks remain explicit human release-acceptance work.
- The desktop update control checks and compares published GitHub Releases, then opens the official
  download page. Automatic download and installation remain disabled until signed update artifacts
  and fresh-machine upgrade testing are part of the release gate.
- Manuscript export supports Markdown and plain text, not PDF, EPUB, or word-processor formats.
- The retained general SillyTavern adapter does not support CHARX archives or materialize embedded
  CCv3 assets. The dedicated book-card flow supports public CCv3 JSON/PNG setting transfer only;
  external cards without Quillarium type extensions may require author classification during review.
  Neither flow is live synchronization or a compatibility roadmap commitment.
- The PNG reader extracts `ccv3` or `chara` text metadata; it is not a general PNG asset or CRC
  validation library.

## License

[MIT](LICENSE)
