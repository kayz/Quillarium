# Quillarium Product Roadmap

This roadmap covers the Quillarium product and runtime only. Individual novels, private writing
archives, and project-specific validation logs live outside the product repository.

## Completed Gate: Work-Neutral Workspace Foundation

Completed on 2026-08-12. The current tree now enforces the work-neutral workspace boundary rather
than treating it only as a design target.

- Keep product code, defaults, tests, documentation, and examples free of real-work names, IDs,
  characters, and plot details.
- Use a workspace manifest to register direct project-vault roots and reusable shared guidance.
- Keep the legacy `<vault>/novels/<title>` layout compatible through an explicit, backed-up,
  verified migration path.
- Use stable project IDs independently of display titles and aliases.
- Scope Git status, staging, commits, remotes, and sync to the trusted workspace/project boundary.
- Snapshot shared guidance and its hashes in every new run without allowing it to override project
  truth.

The gate passed migration-integrity, direct project-vault, workspace-discovery, shared-guidance
snapshot, scoped-Git, secret-scan, build, desktop-build, test, coverage, lint, format, and dependency
audit checks. Legacy cycle fields remain only in the internal compatibility parser and migration
tests.

## Completed Gate: Desktop Planning Baseline

Completed on 2026-08-12 on the `0.2.0-alpha.1` adjustment line.

- Reduce the welcome surface to GitHub writing-library registration and direct project selection;
  keep legacy layout support in compatibility services rather than the primary onboarding UI.
- Move theme, density, and language into settings, with independent save actions for display,
  GitHub, prose AI, background AI, and check AI configuration.
- Replace blank planning-record creation with a background-AI conversation, schema-validated
  editable proposal, and explicit atomic confirmation for ten planning document families.
- Provide safe Markdown source/preview switching and reversible editing for nested or unknown
  frontmatter without executing raw HTML.
- Keep Canon, outline, scene, and accepted prose outside the AI planning flow; existing planning cards
  require a separate explicit in-place edit action.

## Current Focus: P0 Explainable Chapter Production

### Completed foundation: planning-card workbench

Implemented in the 2026-08-13 `0.2.0-alpha.1` code baseline.

- Treat planning records as typed cards with enablement, source-material references, and validated
  card-to-card relations; keep reference bodies outside generation context.
- Provide a linked time chain with concurrent events, a six-scale spatial explorer, and a draggable
  time-filtered character relationship graph. Relationship phase cards carry start/end timeline
  nodes; only the active phase is drawn, with its name on the edge and an arrow for directed links.
- Activate world knowledge by keywords and explicit links, and evaluate foreshadowing reminder
  conditions for the current writing scope.
- Merge new style and pattern guidance into enabled narrative cards while retaining legacy readers.
- Split scene prompts into independently removable source cards for Canon, outline, time, place,
  people, world knowledge, foreshadowing, narrative rules, and accepted/final prose.
- Run project AI checks only on explicit author action; skip disabled cards and source material, and
  persist deduplicated findings as issue cards linked to repairable project records.
- Keep every structured field localized with an explanation and preserve a restrained, resizable
  editorial layout whose flexible space belongs to prose, diagrams, and relationship views.
- Preserve document origin for AI conversations and file/AI imports, restore a prior conversation
  when possible, and allow a file-derived card to locate and re-read its source for one-card
  re-import without replacing unrelated cards.

### Completed foundation: seven-level story lifecycle

Implemented in the 2026-08-13 `0.2.0-alpha.1` code baseline.

- Separate story overview from the book outline; use volume → part → optional act → chapter → scene.
- Keep legacy `arc`/scene `section` readable without silent file rewrites.
- Store authoritative chapter prose independently with draft/final/published state enforcement.
- Generate and accept one ordered scene at a time; validate AI output as plain prose.
- Compose prompts from removable source cards and include current-chapter continuation plus finalized
  prose from the current part or act.
- Require double confirmation for publication, then preserve scene outlines while deleting prompt
  and AI run artifacts.
- Provide large serif editors, character counts, and resizable prompt/prose panes.

### Context compiler — implemented

The current compiler implements `ContextPolicy`, typed `PromptBlock` values, and a complete
`ContextTrace` using the deterministic pipeline defined in
[ADR-context-activation.md](docs/adr/ADR-context-activation.md):

```text
writing scope -> candidates -> triggers/relationships -> ordering
              -> real token budget -> truncation -> trace
```

It enumerates all candidates before applying a global candidate cap, expands links and typed
relations with cycle-safe depth bounds, reserves framing/output tokens, and applies stable authority,
priority, and ID ordering. Mandatory accepted prose and atomic hard Canon reserve budget ahead of
project guidance; shared guidance remains advisory and conflicts only produce warnings. DeepSeek V4
and supported OpenAI model families use packaged exact tokenizers, while unknown combinations fail
closed. Desktop and `quill context --trace` preview source, purpose, authority, priority, exact token
count, truncation, and selection/exclusion reasons. Generation runs persist immutable
`prompt-blocks.json` and `context-trace.json` snapshots.

### Multiple candidates and branches — implemented

Desktop and CLI can create two to eight independent Runs in one candidate group. Run metadata now
records `candidate_group_id`, `candidate_index`, `parent_run_id`, `branch_id`, and `selected_at`.
Unselected candidates remain on disk; any retained candidate can seed a new branch group. Candidate
checks write the prose-specific report plus a transparent deterministic score and an optional
semantic score.

Selection is a recoverable group transaction that leaves exactly one selected Run and writes no
scene, chapter, Canon, or continuity file. Candidate acceptance is a separate explicit operation;
group candidates must be selected first. Accepted groups cannot be reselected. The next P0 boundary
is the complete release acceptance gate, not additional chat or message semantics.

### Atomic finalization apply — implemented

Finalization is now a fail-closed structured workflow shared by Desktop and CLI:

```text
review -> author decisions -> validate complete set and target hashes
       -> retain backups and staged after-images -> apply -> reread/verify -> audit
```

Model output cannot mark an impact confirmed. Existing reviews that contain only prose suggestions
remain reviewable but cannot be executed as patches. Confirmed impacts must specify a supported
target family, stable target ID, `create`/`update` operation, and explicit frontmatter and/or complete
Markdown body. Apply paths are computed inside the core service and contained within the managed
project directory; symlink traversal, stale hashes, duplicate targets, missing references, and
identity changes fail before writes. A mid-write or verification failure restores every target and
the review session. Reports retain source chapter/scenes, before/after SHA-256 values, backups, and
recovery paths. See [ADR-finalization-apply.md](docs/adr/ADR-finalization-apply.md).

### Versioned writing presets — implemented

Project-owned `WritingPreset` v2 files now combine a connection-profile role, portable model
overrides, prompt instructions and complete block order, `ContextPolicy`, and check policy. Desktop
and CLI call the same resolver; only their credential sources differ. Selection is stored in
`project.yaml`, while endpoints, credentials, and other machine-local connection values remain
outside the project.

Every generation or dry run records preset ID/version/hash in `metadata.yaml` and writes immutable
`writing-preset.json`. The snapshot contains the exact resolved portable generation inputs and
source-file hash but rejects credential-shaped fields, absolute paths, and hash tampering. Updating
a preset affects only future runs. Schema-v1 presets load read-only in memory and migrate only via
plan → backup → apply → verify. Missing or incompatible presets fail explicitly; legacy projects can
create and select the default preset through Desktop or `quill preset init`.

## P1: Auditable Lifecycle and Memory

- Publish strongly typed events after committed core operations, including `context.assembled`,
  `candidate.selected`, `scene.accepted`, and `finalization.applied`.
- Add scoped writing notes with explicit expiry.
- Add rebuildable rolling summaries that cite source chapters and never replace accepted prose.
- Connect publication feedback to chapter-level retrospectives and future planning.

## P2: Declarative Chapter Recipes

After the chapter lifecycle is stable, add permission-checked recipes such as:

```text
assemble context -> generate three candidates -> check -> compare
                 -> accept scenes -> check chapter -> finalize
```

Recipes invoke typed Quillarium operations. They are not a general command language and cannot run
arbitrary scripts.

## Deferred: Plugin Platform

A plugin system is not on the near-term critical path. If introduced, it must use a manifest,
version requirements, dependency/capability declarations, isolation, and explicit file/network/AI
permissions. Arbitrary JavaScript installation is out of scope.

## Integration Boundary

Obsidian is the durable manual-editing surface. SillyTavern is only a design-pattern reference and an
optional format-adapter boundary: it is not a dependency, product model, or compatibility roadmap.
Research provenance and the AGPL-3.0 boundary are recorded in
[docs/REFERENCES.md](docs/REFERENCES.md).
