# Quillarium Design

Quillarium is the sole product and runtime for a local-first, chapter-centered long-form fiction
workflow. It owns the domain model, context compilation, AI orchestration, checks, acceptance,
finalization, and Obsidian-backed files. Methodology documents and external applications may inform
its design, but they are neither runtime dependencies nor parallel sources of project truth.

## Implementation Status

As of 2026-08-13, the work-neutral workspace foundation and the first planning-card workbench are
implemented. The workbench includes typed relations and material provenance, a linked timeline,
spatial and time-aware character views, keyword-triggered world knowledge, foreshadowing reminders,
manual AI checks that persist issue cards, and card-by-card prompt composition. The next phase in the
root [ROADMAP](../ROADMAP.md) completes real token budgeting, multiple candidates, branches, and
versioned presets.

The implemented context layer currently returns one deterministic `ContextPacket` with selected
documents, warnings, shared guidance, included/excluded IDs, and a document-level trace. Selection
uses explicit links, pins and exclusions, outline ancestry, enabled state, keyword matching, and
fixed per-category limits. It does not yet implement tokenizer-aware budgets, general recursive
activation, candidate lineage, a versioned `WritingPreset`, or a persisted `context-trace.json`.

The desktop planning baseline also uses a deliberately small surface: the unselected-project screen
has one active library-management entry, while display, GitHub, and the three AI profiles live in
settings with independent persistence. Creating a planning record is a staged operation:

```text
open module -> discuss with background AI -> inspect/edit proposal -> confirm -> atomic Markdown write
```

Discussion and cancellation have no project-file side effects. The AI may select among character,
character-relation, world, timeline-node, timeline-event, location, foreshadowing, narrative, issue,
and reference schemas. An explicit “edit with AI” action can seed the same reviewed conversation from
one existing planning card and updates only that card; Canon, outlines, scenes, and accepted prose
remain outside this flow.

Planning documents expose separate Markdown source and read-only preview modes over one unsaved
buffer. CommonMark plus GFM tables are supported; raw HTML and unsafe URLs are not rendered.
Known structured fields use typed controls where practical, while nested and unknown frontmatter is
shown as recursive direct controls and saved through the same YAML serializer. Authors do not edit
serialization syntax outside the Markdown body. Array fields use chips or repeatable rows, nested
objects use named subfields, and dense groups are collapsible without dropping unknown values.

Tag-bearing fields form one exact-match project index. This includes ordinary tags, world-entry
triggers and category tags, topic tags, and schema-defined categorical fields such as narrative
category and scope. The UI renders them as flat chips. Clicking one opens a right-side drawer containing all
matching documents, visibly separated by document type. Markdown prose is not scanned as implicit
tags, so results remain deterministic and explainable.

The desktop layout treats working space as author-controlled session state. Visible, accessible
separators resize the planning navigation/collection/detail columns, the writing navigation and
overview/detail columns, the metadata/Markdown detail rows, the main writing/lower-run rows, and the
chapter brief/run columns. The same separators support arrow-key adjustment. Pane sizes are local UI
state only and do not pollute Markdown, project configuration, or shared workspace manifests.

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
      chapters/
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
2. enabled narrative cards, legacy project guidance, outlines, continuity ledgers, and explicit pins;
3. workspace shared guidance;
4. archived imports and optional research references.

Lower layers may add constraints or advice but cannot mutate a higher layer. Contradictions produce
warnings with source paths. Imports retained for provenance are excluded from daily context unless a
project document explicitly links or pins them.

## Chapter-Centered Workflow

The writing hierarchy has seven conceptual levels. Overview and book outline are parallel top-level
documents; the remaining levels form the delivery tree:

```text
overview (总览: one-sentence purpose, core people, central conflict, final direction)
book (总纲: worldline and character-destiny axes, causal stages, final state)
  volume
    part
      act (optional)
        chapter
          scene
      chapter (may belong directly to the part)
```

Each chapter has a chapter outline, an independent chapter-prose document, and ordered scenes. A
chapter has exactly one parent (`part` or `act`); an act belongs to one part. The chapter is the
minimum serial-delivery unit, while the scene is the minimum AI-generation unit. The lifecycle is:

```text
prepare -> generate candidates -> accept scenes -> check chapter
        -> finalize -> apply continuity -> feedback and retrospective
```

Selecting a candidate does not accept prose. Accepting a scene does not finalize a chapter.
The current implementation can create and answer a reviewable finalization-impact session, and it
separately enforces chapter finalization/publication. The atomic continuity-apply operation that
writes confirmed Canon, timeline, character-state, foreshadowing, or issue updates with before/after
hashes and recovery information is still P1 work.

Chapter prose has three states:

- `draft`: the author may edit freely and accepted scene prose is appended in scene order;
- `final`: AI generation and all scene edits are rejected, while the author may make small direct
  changes to the chapter prose;
- `published`: the prose is immutable. Publication requires two author confirmations, deletes that
  chapter's scene prompts and AI run outputs, clears scene working prose, and preserves scene
  outlines plus the published chapter prose.

The chapter prose and its ordered scenes are sibling children in the story tree. A chapter may have
no scenes at all: the author can write its prose directly. Accepting a scene writes its plain-text
result into the chapter prose in scene order without headings or separator characters. Before
publication, a volume, part, act, chapter, or scene may be deleted; deleting an outline recursively
removes its unpublished descendants, chapter-prose files, and related runs. Any published chapter in
the affected subtree blocks deletion.

The `chapters/` directory stores the authoritative chapter prose independently from `scenes/`.
Pre-0.2 `arc` and scene `section` fields remain read-compatible: `arc` is normalized to `part` in
memory, and scene `section` is mapped to `chapter_id`. Loading never rewrites a legacy file; new
writes use the current hierarchy.

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

The authoritative relationship model is a set of independent `character_relation` phase cards, not
the legacy `CharacterDoc.relationships` map. Each phase connects two character IDs and uses a
half-open timeline interval `[starts_at, ends_at)`: it becomes active at `starts_at` and is no longer
active when `ends_at` is reached. A pair may therefore move from one named relationship to another
without overwriting history. The legacy map remains readable as import-compatible notes and is never
silently migrated or treated as graph state.

### Timeline, Locations, Characters, Resources, and Causality

Timeline nodes form one deterministic forward chain and are precise to at least a month. A node may
carry several concurrent events; fuzzy seasons are represented as month ranges rather than unordered
labels. Location cards distinguish positioning from layouts across global, regional, city, district,
estate, and interior scales. The desktop uses a scale strip, breadcrumbs, coordinate diagrams, and a
compass fallback. Character and relationship cards bind birth, death, introduction, exit, relationship
start, and relationship end to timeline nodes; the relationship graph filters itself at the selected
time. Active relationships are drawn as labeled edges; directed phases use an arrow and mutual phases
use an undirected line. Resource records model genre-specific budgets, while causality connects
prerequisites, actions, and consequences.

### Outlines and Scenes

`OutlineDoc` stores overview, book, volume, part, optional act, and chapter plans. `SceneDoc` supplies
the seventh level and keeps its durable outline in `outline_content`. Chapter plans hold promise,
conflict, payoff, hook, foreshadowing, and continuity obligations. Scenes bind writing focus, order,
POV, time, location, participants, intended state changes, and the chapter obligation they serve.

Before scene generation, the author sees a two-column prompt composer. The left column contains
individually removable source cards for Canon, parent outlines, time, place, people, activated world
knowledge, due foreshadowing, enabled narrative rules, shared guidance, and continuity warnings (with
chapter and scene plans present by default). The right column contains the exact editable prompt saved
with the run. Finalized or published prose from the current part or act, plus accepted prose from the
current chapter, can be included as style and continuation sources.
Generation output is validated as plain prose and rejects Markdown syntax.

### Foreshadowing, World, References, and Issues

Foreshadowing is a ledger of planned plants, actual plants, reinforcement, resolution, expiry, and
state. Its timeline, outline, keyword, and enabled-card conditions are evaluated deterministically for
the current writing scope and produce author reminders without silently mutating the ledger. World
entries are atomic lore records selected by exact textual triggers, explicit pins, and typed links.
References preserve research without becoming Canon or entering prompts; their editor derives a live
reverse index from every card's `source_refs`. Issues keep findings out of ephemeral AI exchanges and
link to the cards that can be inspected, manually repaired, or discussed with AI.

### Narrative Cards

New style, pacing, dialogue, description, literary structure, and genre-boundary guidance is stored
in one `narrative` card family. A narrative card affects prompts and AI checks only when enabled.
Legacy `strategy` and `pattern` files remain readable as compatibility inputs and appear in the same
Narrative collection, but new UI and AI/import proposals create `narrative` cards only.

### Runs and Candidates

Every generation or dry run creates a run directory. Its metadata moves through `created`,
`generated`, `checked`, and `accepted`; the run is therefore an auditable lifecycle record, not an
immutable directory. Acceptance is explicit and writes non-empty plain prose into the owning scene
and chapter. Shared-guidance snapshots, once created for a run, are immutable.

Current run artifacts are:

```text
metadata.yaml
context.md
prompt.md
output-raw.md
output-accepted.md
check-report.md
```

`shared-guidance.md` and `shared-guidance.json` are added when workspace guidance is present and
snapshotted. Candidate groups, parent runs, branches, selection timestamps, persisted context traces,
and preset snapshots are target fields described in the roadmap; they are not part of the current
`RunMetadata` contract.

### Prompts and Writing Presets

The chapter-writing service currently exposes typed `PromptSourceBlock` values for instruction,
outline, scene outline, guidance, Canon, time, place, characters, world knowledge, foreshadowing,
narrative rules, warnings, finalized prose, and continuation. The desktop lets the author remove
optional source cards and edit the resulting prompt; the exact adjusted text is saved as
`prompt.md`.

A versioned `WritingPreset` that binds model settings, prompt stack, context policy, and check policy
is planned. Current desktop AI profiles are machine-local connection/configuration profiles and must
not be confused with that future project-level preset.

## Explainable Context Compiler

Current context assembly is deterministic at document-selection level:

```text
writing target -> outline ancestry and explicit links -> enabled cards
               -> keyword/relationship selection -> fixed category caps
               -> warnings + document-level trace -> rendered context
```

It records why high-authority blocks such as Canon, outlines, and shared guidance were included or
excluded, and it snapshots the shared guidance actually used by a generation run. Its caps count
documents, not model tokens; it does not yet provide a complete trace entry for every candidate.

The target compiler pipeline is:

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
and the final budget calculation. Recursive expansion will be cycle-safe and bounded. These three
contracts describe the next P0 compiler, not the full shape of the current packet.

Probability, sticky state, and cooldown do not decide which authoritative facts enter context. Given
the same project snapshot, policy, model tokenizer, and writing scope, compilation produces the same
ordered blocks and trace. See
[ADR-context-activation.md](adr/ADR-context-activation.md).

## Events, Notes, and Summaries

Planned committed core operations will publish strongly typed lifecycle events such as
`context.assembled`, `candidate.selected`, `scene.accepted`, and `finalization.applied`. The current
core does not expose an event bus. Future events will describe completed domain changes; they will
not authorize arbitrary file writes.

Scoped expiring writing notes and source-citing rolling summaries are also planned. When introduced,
neither notes nor summaries may replace accepted prose.

## Consistency Checks

Deterministic checks cover planning-card graph integrity, timeline continuity, spatial hierarchy,
time-scoped character relationships, foreshadowing reminder configuration, world-entry triggers,
narrative-card completeness, document references, open issues, routes, chapter obligations, and
plain-prose constraints. The project-level AI check is manual-only, omits references, issue cards,
and disabled cards, and persists stable fingerprinted issue cards. Scene semantic checks add OOC,
character-state drift, and Canon-conflict judgment. Semantic failures are clearly labeled and never
erase deterministic findings.

## Integration Boundary

Obsidian is the durable manual-editing surface. Git provides versioning at either workspace or
standalone-project scope. Project-scoped Git actions compute their pathspec on the trusted side and
cannot include another project or unrelated pre-staged files.

SillyTavern is neither a dependency nor a compatibility roadmap. Existing Character Card and World
Info conversion may remain as optional format adapters while isolated from the core model. Design
research may borrow abstract interaction or orchestration patterns through independent
implementation; it does not copy code, prompts, comments, UI resources, or chat-centric semantics.
The pinned research record and AGPL boundary are in [REFERENCES.md](REFERENCES.md).
