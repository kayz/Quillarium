# Quillarium Design

Quillarium is the sole product and runtime for a local-first, chapter-centered long-form fiction
workflow. It owns the domain model, context compilation, AI orchestration, checks, acceptance,
finalization, and Obsidian-backed files. Methodology documents and external applications may inform
its design, but they are neither runtime dependencies nor parallel sources of project truth.

## Implementation Status

As of 2026-08-12, the work-neutral workspace foundation described below is implemented: contained
workspace manifests, direct project-vault roots, ProjectConfig v2 identity and aliases, explicit
legacy migration, shared-guidance snapshots, and server-scoped workspace Git operations. The active
next phase is the explainable chapter-production work in the root [ROADMAP](../ROADMAP.md), including
real token budgeting, typed prompt blocks, multiple candidates, branches, and versioned presets.

The desktop planning baseline also uses a deliberately small surface: the unselected-project screen
has one active library-management entry, while display, GitHub, and the three AI profiles live in
settings with independent persistence. Creating a planning record is a staged operation:

```text
open module -> discuss with background AI -> inspect/edit proposal -> confirm -> atomic Markdown write
```

Discussion and cancellation have no project-file side effects. The AI may select among character,
world, timeline, location, foreshadowing, strategy, pattern, issue, and reference schemas, but it
cannot use this flow to edit existing documents, Canon, outlines, scenes, or accepted prose.

Planning documents expose separate Markdown source and read-only preview modes over one unsaved
buffer. CommonMark plus GFM tables are supported; raw HTML and unsafe URLs are not rendered.
Known structured fields use typed controls where practical, while nested and unknown frontmatter is
shown as reversible JSON and saved through the same YAML serializer.

## Product and Storage Shape

A writing workspace groups projects and optional shared guidance. The workspace itself is not an
Obsidian vault. Each project directory is both an independent Obsidian vault and a Quillarium project
root:

```text
writing-workspace/
  quillarium-workspace.yaml
  methodology/
  templates/
  projects/
    sample-project/
      .obsidian/
      project.yaml
      canon/
      outlines/
      scenes/
      runs/
      ...
```

The workspace manifest contains only relative, contained paths and non-secret metadata. Absolute
paths, path traversal, and links that resolve outside the workspace are rejected. Machine-local
workspace locations, recent-project state, and credentials remain in the user configuration outside
the workspace.

The legacy `<vault>/novels/<title>` layout remains readable and writable for compatibility. New
projects use a direct project-vault root, and migration is explicit, backed up, verified, and
reported; loading a legacy project never silently rewrites it.

## Authority Model

Project files are the durable truth. Context assembly and checks use a fixed authority order:

1. accepted prose and confirmed hard Canon;
2. project strategies, outlines, continuity ledgers, and explicit pins;
3. workspace shared guidance;
4. archived imports and optional research references.

Lower layers may add constraints or advice but cannot mutate a higher layer. Contradictions produce
warnings with source paths. Imports retained for provenance are excluded from daily context unless a
project document explicitly links or pins them.

## Chapter-Centered Workflow

The planning hierarchy is:

```text
book
  volume
    arc / segment
      chapter
        scene
          prose candidates
```

The chapter is the minimum delivery unit; the scene is the minimum generation unit. The lifecycle is:

```text
prepare -> generate candidates -> accept scenes -> check chapter
        -> finalize -> apply continuity -> feedback and retrospective
```

Selecting a candidate does not accept prose. Accepting a scene does not finalize a chapter.
Finalization first produces a reviewable change set; applying it is atomic and records the affected
files, source chapter, before/after hashes, and recovery information.

## Core Modules

### Workspace and Project

`quillarium-workspace.yaml` registers stable project IDs and shared-guidance references. Each
`project.yaml` records a path-safe stable ID, display title, aliases, writing defaults, and project
schema version. A title change does not change identity.

### Canon

Canon contains confirmed or deprecated facts and constraints. Each item records strength, status,
source, tags, and provenance. Accepted prose is stronger than plans; conflicts are reported for the
author to resolve.

### Characters and State

Character profiles record identity, voice, relationships, arcs, motivation anchors, disclosure
guards, and OOC constraints. Time-scoped state records knowledge, injury, clothing, inventory,
relationships, and other continuity facts without overwriting the base profile.

### Timeline, Locations, Resources, and Causality

The timeline is a forward event chain. Locations form a graph whose edges record distance, route,
travel time, access, cost, and risk. Resource records model genre-specific budgets such as money,
supplies, influence, energy, or time. Causality records connect prerequisites, actions, and
consequences so checks can explain infeasible transitions.

### Outlines and Scenes

Book, volume, arc, chapter, and scene outlines store level-appropriate constraints. Chapter plans
hold promise, conflict, payoff, hook, foreshadowing, and continuity obligations. Scenes bind POV,
time, location, participants, intended state changes, and the chapter obligation they serve.

### Foreshadowing, World, References, and Issues

Foreshadowing is a ledger of planned plants, actual plants, reinforcement, resolution, expiry, and
state. World entries are atomic lore records with triggers, validity windows, links, and provenance.
References preserve research without becoming Canon. Issues keep unresolved decisions out of
ephemeral AI exchanges.

### Runs and Candidates

Every generation creates an immutable run record. Runs may belong to a candidate group and record
parent run, branch, selection time, and a versioned writing-preset snapshot. Candidate comparison can
include deterministic findings and optional semantic scores, but only an explicit author action
selects or accepts a draft.

Typical run artifacts include:

```text
metadata.yaml
context.md
context-trace.json
prompt.md
preset-snapshot.yaml
shared-guidance.md
shared-guidance.json
output-raw.md
output-accepted.md
check-report.md
```

### Prompts and Writing Presets

Prompts are ordered, typed blocks rather than one opaque string. A versioned `WritingPreset` binds
model settings, prompt stack, context policy, and check policy. Each run stores the exact snapshot or
content hash needed to reproduce its inputs.

## Explainable Context Compiler

Context assembly follows a deterministic compiler pipeline:

```text
writing scope
  -> candidate documents
  -> trigger and relationship expansion
  -> authority and priority ordering
  -> model-aware token budgeting
  -> deterministic truncation
  -> ContextTrace
```

`ContextPolicy` defines scope, explicit pins, eligible relationships, recursion limits, token budget,
and truncation rules. `PromptBlock` records a block's type, role, source, authority, priority, token
count, truncation strategy, and inclusion reason. `ContextTrace` explains every candidate's outcome
and the final budget calculation. Recursive expansion is cycle-safe and bounded.

Probability, sticky state, and cooldown do not decide which authoritative facts enter context. Given
the same project snapshot, policy, model tokenizer, and writing scope, compilation produces the same
ordered blocks and trace. See
[ADR-context-activation.md](adr/ADR-context-activation.md).

## Events, Notes, and Summaries

Committed core operations publish strongly typed lifecycle events such as `context.assembled`,
`candidate.selected`, `scene.accepted`, and `finalization.applied`. Events describe completed domain
changes; they do not authorize arbitrary file writes.

Scoped writing notes may influence a book, volume, arc, chapter, or scene and may have explicit
expiry. Rolling summaries are rebuildable derived artifacts with source-chapter references. Neither
notes nor summaries replace accepted prose.

## Consistency Checks

Deterministic checks cover Canon conflict, timeline continuity, location reachability, character
state and OOC guards, foreshadowing, world-entry validity, open issues, resources, causality, genre
constraints, and chapter obligations. Semantic checks are additive and clearly labeled; their
failure never erases deterministic findings.

## Integration Boundary

Obsidian is the durable manual-editing surface. Git provides versioning at either workspace or
standalone-project scope. Project-scoped Git actions compute their pathspec on the trusted side and
cannot include another project or unrelated pre-staged files.

SillyTavern is neither a dependency nor a compatibility roadmap. Existing Character Card and World
Info conversion may remain as optional format adapters while isolated from the core model. Design
research may borrow abstract interaction or orchestration patterns through independent
implementation; it does not copy code, prompts, comments, UI resources, or chat-centric semantics.
The pinned research record and AGPL boundary are in [REFERENCES.md](REFERENCES.md).
