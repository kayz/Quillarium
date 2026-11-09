<h1 align="center">
  <img src="assets/brand/quillarium-wordmark.png" alt="Quillarium" width="560" />
</h1>

<p align="center">
  <img src="assets/brand/quillarium-q.png" alt="Quillarium Q app icon" width="88" />
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  Latest stable release: <a href="https://github.com/kayz/Quillarium/releases/tag/v0.3.1">v0.3.1</a>
  · <a href="https://github.com/kayz/Quillarium/releases/latest">Download Installers (Windows / macOS)</a>
  · <a href="docs/README.md">Documentation map</a>
</p>

**Quillarium (羽笔馆)** is a local-first, Obsidian-backed writing and worldbuilding system for long-form fiction, screenplays, and short-play storyboards. It stores every setting card, outline, script, and chapter as plain Markdown and YAML, keeps planning facts traceable, coordinates proposal-based AI experts with zero silent writes, and provides visual spatial/temporal canvases alongside a deterministic context compiler.

Quillarium is the sole product runtime. Obsidian is its durable manual-editing surface. A writing workspace may register multiple projects and shared guidance, while each project directory is both an independent Obsidian vault and a Quillarium project root.

This document describes the released `0.3.1` stable code line as of 2026-11-09. “Works now” means the behavior is present in the tagged repository and covered by local and release-gate tests.

---

## ✨ Key Highlights (Why Quillarium)

1. **Local-First × Native Obsidian Plain-Text Foundation (Zero Database Lock-In)**
   - Every piece of Canon, character profile, faction, timeline event, location, outline, chapter prose, and short-play script is stored as standard **Markdown + YAML frontmatter**.
   - No proprietary databases or opaque binary formats: any local folder can become a writing library, and every project root is natively an Obsidian vault that you can open and edit directly without requiring Git or a cloud account.

2. **Proposal-Driven AI Collaboration with Zero Silent Writes (`Proposal → Author Approval`)**
   - **Never overwrites behind your back**: Any AI-suggested change to project files or configurations—whether setting extraction, card retyping, outline organization, timeline ordering, continuity repair, or assistant chat—produces a **structured proposal with provenance links and SHA-256 hash verification**.
   - **Atomic transactions & full rollback**: Nothing touches disk until you explicitly check and confirm it. Confirmed changes run under a project write lock with complete before-image backups, reread verification, and automatic rollback or interrupted-transaction recovery on any conflict.

3. **Adaptive Workbench for Different Creators (Long-Form Novelists / Short-Play Screenwriters / Worldbuilders)**
   - **Seven-level elastic story hierarchy**: Overview and Book Outline at the top, followed by Volume, optional Part, optional Act, Chapter, and optional Scene (~1,000-character AI generation blocks). Hide unused levels at any time without deleting files.
   - **Dedicated Short-Play & Storyboard Studio (`short-play/`)**: Real-time screenplay format linting (scene headers, dialogue, `△` action cues, duration estimation), automatic visual asset pack aggregation for cast and locations, per-scene shot breakdown tables, and one-click production exports to **CSV, Markdown, and JSON**.
   - **World entry first, then specialize**: Capture raw lore quickly as World entries, then specialize the same stable ID in place into characters, locations, timeline events, factions, foreshadowing, or narrative cards—or extract new setting cards directly from handwritten chapter prose.

4. **Deep Visual Spatial & Temporal Planning Canvases**
   - **8-Level Google-Maps-Style Continuous Zoom & Indoor Floor-Plan Editor**: Seamlessly zoom from World Map (L1) → Province (L2) → City (L3) → County (L4) → Town (L5) → District (L6) → Compound/Courtyard (L7) → **Indoor Multi-Floor Architectural Blueprint (L8, with double-line walls, typed rooms, doors, windows, stairs, and secret doors)**. Includes an unmounted location pool and a dedicated full-screen Map Editor modal.
   - **Multi-Track Timelines & Auto-Layout**: Custom calendars, parallel timeline tracks, story-time parsing, and causal-inversion detection.
   - **Time-Scoped Character Graph & First-Class Faction Networks**: Relationships and faction memberships carry start/end story-time bounds; scrub story time to filter active characters, relationships, and faction emblems dynamically.

5. **Explainable, Deterministic Context Compiler & Multi-Candidate Run Branching**
   - No black-box prompt stuffing: the context compiler traverses the outline chain, explicit pins/exclusions, timeline links, keyword triggers, and bounded relationship graphs to emit a deterministic `PromptEnvelope` and `ContextTrace` under exact tokenizer budgets.
   - Generate **2 to 8 independent candidates** per run group, compare prose and check reports side by side, branch from any retained candidate, and write to chapter/scene prose only on explicit acceptance.

6. **Dedicated Agent Hub & Bounded Creator Assistants**
   - Three built-in creator assistants (Setting Organizer, Character Rehearsal, Continuity Review) plus a unified **Agent Hub (`AG-1`)** for one-click expert tasks (`continuity-check`, `organize-outline`, `organize-worldbook`, `analyze-relations`, `manage-foreshadowing`, `manage-timeline`).
   - Every session freezes its exact `ContextBundle`, assistant prompt version, and `WritingPreset`, logging permissions, token usage, and full traces.

7. **Four Customizable East-Asian Aesthetic UI Skins & Display Gallery**
   - Four complete, live-editable interface skins—**Paper (宣纸), Ink (松烟), Mist (云雾), and Bamboo (竹青)**—controlling palette, UI/prose typography, type scale, panel spacing, navigation placement, and button treatments via bounded CSS tokens.
   - Multi-image card galleries (`assets/display/<card-id>/`) and script-free HTML card faces operate as an optional display layer cleanly separated from setting facts.

---

## 📦 Download Installers & Update Guide

### 1. Download Desktop Installers

Grab the latest native installer directly from [**GitHub Releases**](https://github.com/kayz/Quillarium/releases/latest):

| OS                        | Architecture        | Installer Filename (`v0.3.1`)      | Notes                                                                |
| :------------------------ | :------------------ | :--------------------------------- | :------------------------------------------------------------------- |
| **Windows**               | x64                 | `Quillarium-0.3.1-windows-x64.exe` | NSIS installer; double-click to install and create desktop shortcuts |
| **macOS (Apple Silicon)** | arm64 (M1/M2/M3/M4) | `Quillarium-0.3.1-macos-arm64.dmg` | Mount the DMG and drag Quillarium to `Applications`                  |
| **macOS (Intel)**         | x64                 | `Quillarium-0.3.1-macos-x64.dmg`   | Mount the DMG and drag Quillarium to `Applications`                  |

> **Note**: Desktop installers are currently unsigned. On Windows SmartScreen, click **More info → Run anyway** on first launch; on macOS Gatekeeper, Control-click the app in Finder and choose **Open**.

### 2. In-App Update Check & Upgrade

- **One-click update check**: Open Quillarium Desktop → go to **Settings** → click **Check for updates** in the version & update section.
- **Channel-aware**: The updater queries the public GitHub Releases feed (no GitHub account or token required) and respects both stable and prerelease channels.
- **Safe in-place upgrade**: When a newer release is available, Quillarium opens the official GitHub Release download page. Installing the new package over your existing installation **preserves all local writing workspaces, Obsidian project vaults, and user settings**.

---

## What Works Now (`v0.3.1`)

- A file-backed project model for Canon, characters and time-scoped relationships, linked timelines, 8-level spatial locations and indoor floor-plan layouts, world entries, foreshadowing, references, issues, narrative cards, seven-level story structure, independent chapter prose, scenes, short-play scripts and storyboards (`short-play/`), imports, reviews, and generation runs.
- A working source-run CLI for creating and editing those records, importing Markdown, assembling context, generating drafts, running deterministic or opt-in semantic checks, accepting runs, and exporting manuscripts.
- An Electron desktop app whose welcome screen turns any chosen local folder into a writing library and opens or creates direct project-vaults without requiring Git or a GitHub account. GitHub can be connected later as an optional upload target. Planning records can be created through a multi-turn background-AI conversation, reviewed as structured fields plus Markdown, and written only after confirmation.
- Safe source/preview switching for Markdown-backed planning documents, including GFM tables, nested lists, quotes, links, and fenced code. Raw HTML is not executed. Frontmatter is edited through direct controls: tags, trigger words, categories and similar index fields are chips; lists and nested records use add/remove rows; and only the Markdown body exposes syntax.
- Clickable project tags open a right-side cross-type index, while collapsible metadata groups and draggable column/row separators keep dense records and long Markdown bodies usable.
- A visual planning workbench for a deterministic timeline chain, draggable time-filtered character relationships, 8-level zoom-driven location exploration (with a full-screen map editor and indoor architectural floor-plan drawing), reference reverse indexes, and issue-card repair.
- Manual project AI checks exclude source material and disabled cards, then persist stable findings as issue cards. World keywords and foreshadowing conditions activate explainable prompt sources.
- Versioned project writing presets bind a connection-profile role, model overrides, prompt stack, block order, deterministic context policy, and check policy. Desktop and CLI select the same preset, and every generation run stores its sanitized immutable snapshot and SHA-256 identity.
- Three built-in creator assistants organize source material, rehearse a character, and review continuity through bounded task-specific stages, while the dedicated **Agent Hub** centralizes expert tasks and session history. Versioned `ContextBundle`s select what project knowledge is visible, isolated assistant-prompt versions define how each assistant works, and `WritingPreset`s define model/common prompt structure. Each session freezes exact configuration and records messages, permissions, sources, token use, traces, raw/repair output, and proposals. Assistant conversation is not Canon and every project/configuration write remains author-approved.
- One generation action can create two to eight independently retained candidates in a shared run group. Desktop and CLI compare candidate prose and checks, explicitly select one without writing prose, and create a new branch from any retained candidate. Only the separate accept action writes scene and chapter prose.
- A finalized chapter can open an AI-assisted continuity review without granting the model write authority. Every executable change requires an explicit author decision. Desktop and CLI use the same service to validate all targets and hashes, retain complete backups, apply the set, reread and verify every file, and record a recovery audit. Any failure restores the whole set.
- Markdown and plain-text manuscript export from finalized/published chapter prose, accepted outputs, or final scenes, with explicit gap reporting and optional volume filtering; the short-play workbench additionally exports screenplay Markdown, storyboard CSV/Markdown tables, and JSON production asset packs.
- A seven-level structure: overview and book outline at the top, then volume, optional part, optional act, chapter, and scene. The chapter (chapter outline plus chapter prose) is the delivery unit. Scenes are an optional project-level AI-writing module that splits one chapter into roughly 1,000-character generation blocks; chapter prose is written only after every scene in the chapter is confirmed. Chapter prose progresses from draft to final to immutable published state.
- Project settings can hide part, act, or scene levels without deleting their Markdown. Chapters are presented under the nearest enabled parent, disabled files remain available through an inspector, and disabling scenes also removes the scene-bound AI writing entry. Older projects default to all levels enabled in memory and are not rewritten merely by opening them. New projects start with the scene module off.
- Card imagery and HTML card faces belong to an optional project-level display layer that is kept separate from setting facts; turning it off hides only the shell. Images are uploaded locally or, on an explicit author request, generated through OpenAI Images, an OpenAI-compatible images endpoint, or Gemini. They live as a multi-image gallery under `assets/display/<card-id>/` and are never written back into card frontmatter. Card faces render from built-in or saved templates without a model call; the bounded `display-card-design` Agent only proposes candidates, and templates containing script are refused.
- Factions are first-class organization cards with separate faction-relationship and character-membership documents. All links use stable IDs and optional start-inclusive/end-exclusive timeline bounds. Faction emblems appear beside people in the time-filtered character graph; a deterministic circle-and-initials mark is used when no emblem exists, and multiple active memberships remain visible.
- A searchable, keyboard-accessible, virtualized planning-card selector stores stable IDs across relations and time-aware foreshadowing controls. Planning AI conversations retain multiple independently editable proposals in a bounded visible grid and keep an existing source card anchored first through restore. Explicit bulk confirmation and dependency-aware atomic apply resolve session-local proposal references to the created cards' stable project IDs without silent writes.
- Reference creation is a deterministic, rollback-safe UTF-8 Markdown/text upload with no AI call and no retained external absolute path. A selected saved reference can later start an explicit multi-card AI discussion as a hash-checked read-only source; derived cards automatically retain its stable ID in `source_refs`, while the reference itself is never edited by that session.
- A dedicated issue workspace supports batch ignore/resolve/reopen. Stable suppression fingerprints prevent ignored findings from recurring without incorrectly suppressing later resolved occurrences.
- A book-generation header, exact `PromptEnvelope`/provider-request snapshots, and a read-only block/text/message viewer make the actual model-visible prompt inspectable and safely copyable.
- Independent public CCv3 interchange can create a new empty-story project from a JSON/PNG character card and export selected novel settings into one cover-backed CCv3 PNG. It never transfers prose, story plans, prompts, presets, API configuration, credentials, or runtime state.
- **Reviewed setting-card retyping & prose setting extraction**: Canon converts only to or from a World entry, while a World entry serves as the hub for converting to or from characters, relationships, locations, timeline events, factions, foreshadowing, and narrative cards. The chapter-prose editor can also extract setting proposals from handwritten prose with code-owned `derived_from` links without ever mutating the prose.
- **Drag-and-drop file ingestion & blank draft cards**: Drop local text or Markdown files into an open project to archive them as deterministic references or open them in the reviewed AI setting import flow. Every directly maintained setting section also offers a blank-card action.
- **Four complete, editable interface skins**: `paper`, `ink`, `mist`, and `bamboo` control palette, interface/prose typography, scale, panel spacing, navigation/detail placement, toolbar alignment, and button treatments through bounded CSS tokens with live preview and per-skin reset. See the [UI skin contract](docs/UI-SKINS.md).
- **Chapter-centered expert mode & single-overlay turn confirmation**:
  - **World entry first, then specialize**: Setting facts start as world entries and specialize in place into concrete types or back.
  - **Expert mode**: Writing-path AI organizes, analyzes, evaluates, and proposes settings (`continuity-check`, `organize-outline`, `organize-worldbook`, `analyze-relations`, `manage-foreshadowing`, `manage-timeline`) without writing prose.
  - **One confirmation per assistant turn**: Card, issue, and assistant-configuration proposals are confirmed together under a single lock with full rollback.
  - **Generation stays in the scene module**: Prose generation exists only inside the optional scene module.

Opening a 0.3.0 project that still has files under `assets/settings/` or `image` fields on cards asks whether to reset the old display assets. Confirming permanently deletes `assets/settings/` and removes those `image` fields, then turns the display layer on; cancelling leaves the disk untouched for the session. Back up such projects before upgrading.

AI is optional for project management, import, context assembly, deterministic checks, and export. Generation and `check --semantic` require an OpenAI-compatible endpoint or configured provider.

The context compiler is deterministic, explainable, and model-budgeted. It follows the outline chain, explicit pins and exclusions, typed relations, timeline links, keyword activation, and enabled-card state; performs cycle-safe bounded relationship expansion; then emits typed `PromptBlock` values and a complete `ContextTrace`. DeepSeek V4 and supported OpenAI model families use packaged exact tokenizers. Unknown tokenizer/model combinations fail closed instead of silently using a character estimate. Run metadata records candidate group, parent, branch, index, and selection time; every candidate keeps its own prompt, output, check report, and comparison score.

## Quick Start (Build from Source)

Prerequisites are Node.js (22+ recommended) and pnpm. From the repository root:

```bash
pnpm install
pnpm build
pnpm test
```

Given a directory containing `quillarium-workspace.yaml` and `projects/`, register it and create a direct project-vault:

```bash
pnpm cli config set-workspace ./writing-workspace
pnpm cli init "My Novel" --id my-novel --genre fantasy
pnpm cli --help
```

The project is created and registered at `./writing-workspace/projects/my-novel`; that directory is also the Obsidian vault. Explicit `init --vault <path>` remains only for legacy compatibility. Continue with the [CLI guide](docs/CLI.md) for the end-to-end writing, checking, acceptance, and export flow. The guide also documents the optional retained SillyTavern commands.

## Desktop Flow & Packaging

Start the Electron app from source:

```bash
pnpm desktop:dev
```

Then choose any local folder as the writing library, open or create a project-vault, build its outline and supporting modules, select a chapter, prepare a scene, and edit or generate prose. The AI page shows removable prompt-source cards beside the exact editable prompt, plus a large resizable chapter-prose editor with word-count feedback. Legacy layouts remain compatible in the runtime and migration services, but they are not an active welcome-screen choice. Migration is always an explicit dry-run, backup, apply, verify, and report operation and never moves or deletes the source. The context/check inspector and recorded runs make inputs and outputs reviewable.

The full-width **Creator Assistants** and **Agent Hub** workspaces show sessions and assistants on the left, conversation and exploration/proposals in the center, and sources, reasons, authority, token use, permissions, and output destination on the right. Character cards, chapters/scenes, and material import can open the relevant assistant directly.

On a finalized chapter, **Final review & apply** presents every proposed continuity impact and question for an author decision, then enables atomic apply only when no decision is open. **Recovery check** restores an interrupted transaction from retained before images.

Theme, density, language, GitHub credentials, each AI profile, and the project writing preset have explicit settings actions. A legacy project without a preset must explicitly create/select one before generation.

Settings can manually check the public Quillarium GitHub Releases feed. The check is aware of stable and prerelease channels, needs no GitHub account or token, and opens the official release page when a newer version exists. It runs only when requested; unsigned builds do not silently download or install updates.

Selecting an ordinary folder creates only `quillarium-workspace.yaml` and `projects/` while preserving unrelated files. It does not initialize Git, contact GitHub, or write credentials into the library. After a GitHub Token is explicitly saved, a standalone local project can be connected and uploaded from Settings.

Planning details are presented as record cards rather than serialized frontmatter. Click a tag chip to pull in every exactly matching project record from the right; each result shows its document type. Drag the visible dividers to resize navigation, collection, detail, writing, and lower-run areas. Dividers are keyboard-focusable and respond to arrow keys. These sizes are session UI state and never enter project files.

Use `pnpm desktop:build` to verify the desktop source build. The existing `electron-builder` configuration retains Windows and macOS packaging commands:

```bash
pnpm --filter @quillarium/desktop package:win
pnpm --filter @quillarium/desktop package:mac
```

Artifacts are written under `apps/desktop/release/`. A `v<desktop-version>` tag triggers the release workflow only when that immutable tag matches every package version and points to the latest `master`. The workflow reruns the complete quality gate, builds Windows x64 NSIS plus macOS x64 and arm64 DMGs on native runners, verifies the complete installer set, and only then creates one GitHub Release. Alpha versions are marked as pre-releases automatically. A failed tag is not moved, reused, or rerun; release work continues with a new forward-only version. See the [release guide](docs/RELEASING.md).

## CLI Flow

A typical CLI workflow is:

1. Configure a writing workspace and initialize a direct project-vault.
2. Inspect or select the project's versioned writing preset.
3. Add Canon, characters, locations, timeline events, an outline, and scenes.
4. Assemble context or run `generate --dry-run` to inspect the recorded prompt without a network call.
5. Generate several candidates, run deterministic checks, and optionally add `--semantic` for AI-assisted OOC, state-drift, and Canon-conflict findings.
6. Compare candidates, explicitly select one, then separately accept it and export accepted prose.

All CLI examples and the current command map are in [docs/CLI.md](docs/CLI.md). The runtime command help remains authoritative:

```bash
pnpm cli --help
pnpm cli <command> --help
```

The desktop is the primary surface for the current seven-level hierarchy and explicit timeline coordinates. The source-run CLI retains two pre-0.2 option names for compatibility: `scene create --section` receives the owning chapter ID, and `--timeline` receives the linked timeline event ID. These names do not change the current `chapter_id`-based scene model.

## Project Layout

```text
Writing Workspace/
  quillarium-workspace.yaml
  methodology/            templates/          styles/setting-cards/
  projects/
    my-novel/              # Quillarium project root and Obsidian vault
      .obsidian/
      project.yaml
      assets/cover/         assets/display/
      canon/               characters/       character-states/
      factions/            factions/relations/  factions/memberships/
      timeline/            locations/        world/
      foreshadowing/       references/       issues/
      narrative/           strategy/         patterns/         resources/
      causality/           outlines/         chapters/         scenes/
      short-play/          # short-play scripts, storyboards, and visual asset settings
      prompts/             assistant-prompts/  presets/        runs/        imports/
      context-bundles/     creator-roles/    explorations/
      reviews/             # reviews plus apply audits, backups, and staged copies
      style/               exports/
      sillytavern/         .quillarium/
```

`strategy/` and `patterns/` are retained for legacy compatibility. New style, structure, pacing, and genre guidance is created in `narrative/`.

Workspace manifests contain only relative, contained paths and non-secret metadata. Machine-local paths and credentials stay in the user configuration outside the workspace.

## Packages

- [@quillarium/core](packages/core/README.md) — project storage, documents, context, imports, runs, review, short-play storyboards, multi-layer map canvas, and manuscript export.
- [@quillarium/checks](packages/checks/README.md) — deterministic and injectable semantic checks.
- [@quillarium/ai](packages/ai/README.md) — AI configuration, requests, prompts, and recorded generation runs.
- [@quillarium/cli](packages/cli/README.md) — Commander-based CLI assembly.
- [@quillarium/sillytavern](packages/sillytavern/README.md) — Character Card and World Info conversion.

Start with the [documentation map](docs/README.md) for audience-specific reading paths and the Simplified Chinese documentation entry. The product and agent workflow rationale is documented in [docs/AGENT-DESIGN.md](docs/AGENT-DESIGN.md). The target architecture and delivery priorities are in [docs/DESIGN.md](docs/DESIGN.md) and [ROADMAP.md](ROADMAP.md). External design research, independent implementation rules, and license boundaries are recorded in [docs/REFERENCES.md](docs/REFERENCES.md). The typed Agent task, `ContextBundle`, creator-assistant, session, and permission decision is recorded in [docs/adr/ADR-agent-runtime-and-context-bundles.md](docs/adr/ADR-agent-runtime-and-context-bundles.md).

[docs/MVP-WORKLIST.md](docs/MVP-WORKLIST.md) is an explicitly historical checklist for the original CLI/vault MVP. It is retained for provenance and is not a current usage guide.

## Current Boundaries

- Desktop installers are unsigned. Windows SmartScreen or macOS Gatekeeper may therefore display a warning. CI verifies all three installer architectures, while fresh-machine installation, restart, migration, credential, and accessibility checks remain explicit human release-acceptance work.
- The desktop update control checks and compares published GitHub Releases, then opens the official download page. Automatic download and installation remain disabled until signed update artifacts and fresh-machine upgrade testing are part of the release gate.
- Manuscript export supports Markdown and plain text (plus CSV and JSON production asset packs for short-play storyboards), not PDF, EPUB, or word-processor formats.
- The retained general SillyTavern adapter does not support CHARX archives or materialize embedded CCv3 assets. The dedicated book-card flow supports public CCv3 JSON/PNG setting transfer only; external cards without Quillarium type extensions may require author classification during review. Neither flow is live synchronization or a compatibility roadmap commitment.
- The PNG reader extracts `ccv3` or `chara` text metadata; it is not a general PNG asset or CRC validation library.
- Issue V1 ledgers, old issue cards, assistant sessions, Runs, `PromptEnvelope`s, and CCv3 adapter data remain read-compatible and are not rewritten merely by opening them. A V1 suppression entry is upgraded only after an author issue-state action; an unresolved assistant-prompt binding requires an explicit snapshot recovery or rebind.
- The reference index is derived cache data. Project loading and ordinary saves do not wait for it; reference views validate a current document-set hash and rebuild it atomically when needed.

## License

[MIT](LICENSE)
