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

Completed locally on 2026-08-13 for the active `0.2.0-alpha.1` adjustment line.

- Treat planning records as typed cards with enablement, source-material references, and validated
  card-to-card relations; keep reference bodies outside generation context.
- Provide a linked time chain with concurrent events, a six-scale spatial explorer, and a draggable
  time-filtered character relationship graph.
- Activate world knowledge by keywords and explicit links, and evaluate foreshadowing reminder
  conditions for the current writing scope.
- Merge new style and pattern guidance into enabled narrative cards while retaining legacy readers.
- Split scene prompts into independently removable source cards for Canon, outline, time, place,
  people, world knowledge, foreshadowing, narrative rules, and accepted/final prose.
- Run project AI checks only on explicit author action; skip disabled cards and source material, and
  persist deduplicated findings as issue cards linked to repairable project records.
- Keep every structured field localized with an explanation and preserve a restrained, resizable
  editorial layout whose flexible space belongs to prose, diagrams, and relationship views.

### Completed foundation: seven-level story lifecycle

Completed locally on 2026-08-13 for the active `0.2.0-alpha.1` adjustment line.

- Separate story overview from the book outline; use volume → part → optional act → chapter → scene.
- Keep legacy `arc`/scene `section` readable without silent file rewrites.
- Store authoritative chapter prose independently with draft/final/published state enforcement.
- Generate and accept one ordered scene at a time; validate AI output as plain prose.
- Compose prompts from removable source cards and include current-chapter continuation plus finalized
  prose from the current part or act.
- Require double confirmation for publication, then preserve scene outlines while deleting prompt
  and AI run artifacts.
- Provide large serif editors, character counts, and resizable prompt/prose panes.

### Context compiler

Implement `ContextPolicy`, typed `PromptBlock` values, and `ContextTrace` using the deterministic
pipeline defined in
[ADR-context-activation.md](docs/adr/ADR-context-activation.md):

```text
writing scope -> candidates -> triggers/relationships -> ordering
              -> real token budget -> truncation -> trace
```

Provide a generation preview with source, purpose, authority, priority, token count, truncation, and
inclusion reason. Bound recursive expansion and make compilation reproducible.

### Multiple candidates and branches

- Generate several candidates in one group and compare them side by side.
- Record `candidate_group_id`, `parent_run_id`, `branch_id`, and `selected_at`.
- Preserve unselected candidates and allow a candidate to seed a new branch.
- Keep candidate selection distinct from scene acceptance, chapter finalization, and publication.

### Versioned writing presets

Create `WritingPreset` as a versioned combination of model configuration, prompt stack, context
policy, and check policy. Store a sanitized snapshot or reproducible hash in every run; credentials
remain machine-local.

## P1: Auditable Lifecycle and Memory

- Publish strongly typed events after committed core operations, including `context.assembled`,
  `candidate.selected`, `scene.accepted`, and `finalization.applied`.
- Add scoped writing notes with explicit expiry.
- Add rebuildable rolling summaries that cite source chapters and never replace accepted prose.
- Complete atomic finalization apply with validation, backup, verification, audit records, and
  recovery.
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
