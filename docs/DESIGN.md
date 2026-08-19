# Quillarium Design

<p align="right">
  <img src="../assets/brand/quillarium-q.png" alt="" width="72" />
</p>

Quillarium is the sole product and runtime for a local-first, chapter-centered long-form fiction
workflow. It owns the domain model, context compilation, AI orchestration, checks, acceptance,
finalization, and Obsidian-backed files. Methodology documents and external applications may inform
its design, but they are neither runtime dependencies nor parallel sources of project truth.

## Implementation Status

As of 2026-08-16, the work-neutral workspace foundation and the first planning-card workbench are
implemented. The workbench includes typed relations and material provenance, a linked timeline,
spatial and time-aware character views, keyword-triggered world knowledge, foreshadowing reminders,
manual AI checks that persist issue cards, card-by-card prompt composition, an explainable
model-budgeted Context compiler, versioned writing presets with immutable run snapshots, and
multi-candidate comparison, selection, and branching. Atomic finalization apply is also implemented
with explicit author decisions, complete before images, target-hash conflict detection, rollback,
verification, and a durable audit. The root [ROADMAP](../ROADMAP.md) tracks later lifecycle work.

The typed Agent contract and creator-assistant foundation is also implemented. Product-owned
`AgentTaskDefinitionV1` contracts cap operations and result types; project-owned `ContextBundleV1`
and `CreatorRoleV1` objects bind stable source identities, one writing preset, and a strictly smaller
permission set. The desktop provides setting organizer, character rehearsal, and continuity review
assistants with recoverable sessions, source/permission/destination preview, append-only exploration
records, and author-approved planning, issue, and configuration proposals. Each turn recompiles the
current project while preserving the session's frozen configuration. Structured output is validated
locally and allows one bounded repair attempt; failures and exact execution snapshots remain
recoverable. The P0 `@quillarium/agent-runtime` is now the executable boundary for the project-wide
planning-integrity check, the first migrated legacy AI flow. It provides the code-owned handler
registry, model-visible write-ahead audit, typed failure, failed-batch retry, and explicit author
decision/apply handoff. Scene generation still emits the earlier common product Agent snapshot;
import, card re-extraction, planning and Canon collaboration, scene semantic checks, finalization,
and creator-assistant turns retain separate orchestration and old Run compatibility until each is
explicitly migrated. See
[ADR-unified-ai-agent-runtime.md](adr/ADR-unified-ai-agent-runtime.md).

The implemented context layer returns one deterministic `ContextPacket` with selected documents,
warnings, shared guidance, typed `PromptBlock` values, and a complete `ContextTrace`. Selection uses
explicit links, pins and exclusions, outline ancestry, enabled state, keyword matching, and
cycle-safe bounded relationship expansion. Exact model tokenizers allocate a real input budget after
framing and output reservations. The selected `WritingPreset` supplies the portable model overrides,
prompt stack, block order, context policy, and check policy; candidate lineage is stored per Run.

The desktop planning baseline also uses a deliberately small surface: the unselected-project screen
has one active local-library entry, while display, optional GitHub, and the three AI profiles live in
settings with independent persistence. Any ordinary local folder can be registered: Quillarium
creates a minimal manifest and `projects/` directory without requiring Git, a GitHub account, or
network access, and preserves unrelated files. Creating a planning record is a staged operation:

```text
open module -> discuss with background AI -> inspect/edit proposal -> confirm -> atomic Markdown write
```

Discussion and cancellation have no project-file side effects. A planning conversation owns an
ordered proposal set rather than one replaceable proposal. Each item has a stable temporary ID,
source, create/update operation, state, body, and revision history. When discussion starts from an
existing card, that real card is the immutable first-position anchor; it is never copied into a new
card or displaced by regeneration or session restore. Confirmation is reversible review state, so
the author can resume editing before apply. The UI exposes the complete set in a bounded multi-card
grid with an exact count, per-card selection, explicit dependency warnings, and reversible “confirm
all”; an unconfirmed new dependency is never silently included. Apply preflights every update hash,
orders confirmed creates by their session-local dependencies, resolves stable temporary proposal IDs
to the newly written project IDs, then uses the project write lock, atomic replacement, verification,
and whole-set rollback. A conflict, missing confirmation, or dependency cycle therefore produces zero
project-document writes. The trusted process limits both context and proposal schemas to the active
module: timeline conversations, for example, can read and propose only timeline nodes and events,
while character conversations can propose only characters and relationships. A model output outside
that allowlist is rejected before session merge and is checked again before apply. An explicit “edit
with AI” action can seed the same reviewed conversation from one existing planning card; Canon,
outlines, scenes, and accepted prose remain outside this flow.

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
      assets/cover/
      assistant-prompts/
      canon/
      imports/archive/
      outlines/
      prompts/book-generation-header.md
      chapters/
      scenes/
      runs/
      ...
```

The workspace manifest contains only relative, contained paths and non-secret metadata. Absolute
paths, path traversal, and links that resolve outside the workspace are rejected. Machine-local
workspace locations, recent-project state, and credentials remain in the user configuration outside
the workspace. A newly registered local folder does not receive Git metadata; GitHub is an explicit
later upload/sync choice in Settings.

The legacy `<vault>/novels/<title>` layout remains readable and writable for compatibility. New
projects use a direct project-vault root, and migration is explicit, backed up, verified, and
reported; loading a legacy project never silently rewrites it.

## Update Delivery Boundary

Quillarium uses the public GitHub Releases API as its release-metadata source; a dedicated update
server is not required. The desktop currently performs only an explicit, user-triggered check in
the main process. It compares semantic versions deterministically, lets prerelease builds discover
later prerelease or stable releases, keeps stable builds on the stable channel, and returns
localizable network, rate-limit, response, and empty-feed states. The renderer can only open the
fixed official release page and cannot choose an arbitrary update host.

Automatic download and installation are intentionally deferred. Enabling them requires signed
Windows and macOS artifacts, updater metadata published with every immutable release, and verified
installed-app upgrade and rollback behavior. Project GitHub credentials are never used for product
update checks.

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
Finalization review and continuity apply are separate from chapter state transitions and
publication. The model proposes typed changes but cannot confirm them. After all impacts and
questions receive author decisions, one core service validates the complete set, locks the reviewed
before hashes, backs up every affected file, applies and rereads every result, and marks the review
`applied` only after verification. Canon, character/state, timeline, location, world, resource,
foreshadowing, narrative, and issue records are supported. Natural-language `change` text is never
interpreted as an executable patch.

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

Timeline data uses versioned `TimeSystem`, `TimelineTrack`, coordinate, and placement objects. A
project can combine Gregorian, fictional, relative, and cyclic systems with author-defined units and
mixed precision. Display text is separate from sortable components; when no declared conversion is
available, the author supplies an explicit order and the application never guesses. World chronology
and narrative appearance can use separate tracks, while one event fact may have an instantaneous or
interval placement on several tracks. Node order, same-node event order, and track display order are
persisted independently from the time coordinate. Legacy `previous`/`next` chains remain readable and
are upgraded only through an explicit dry-run, backup, apply, verify, and report migration. Existing
`story_time` values use the same preview-and-confirm path.

Local document references are resolved by one deterministic Core service in this order: stable ID,
unique display code, vault-relative path, filename, Obsidian target, unique title, then unique alias.
Ambiguous references are never guessed. Markdown links, wikilinks (including aliases, headings, and
blocks), and structured frontmatter links feed a rebuildable forward/backlink index under the ignored
project cache. New references use canonical Obsidian paths while ContextTrace retains both the raw
reference and resolved stable identity. Legacy code, path, and title references remain read-compatible
until the author approves a hash-checked migration.

Location cards distinguish positioning from layouts across global, regional, city, district, estate,
and interior scales. The desktop uses a scale strip, breadcrumbs, coordinate diagrams, and a compass
fallback. Character and relationship cards bind birth, death, introduction, exit, relationship start,
and relationship end to timeline nodes; the relationship graph filters itself at the selected time.
Active relationships are drawn as labeled edges; directed phases use an arrow and mutual phases use an
undirected line. Resource records model genre-specific budgets, while causality connects prerequisites,
actions, and consequences.

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
References preserve research without becoming Canon or entering ordinary prompts; their editor
derives a live reverse index from every card's `source_refs`. Desktop reference creation is a
deterministic UTF-8 text/Markdown upload: files become project-local `references/*.md` records in one
rollback-safe batch, with only the original filename retained and no AI call. A later explicit
“AI discussion to create cards” session may read one saved reference as immutable, hash-checked source
material and return multiple reviewable setting-card proposals. The source itself is never a proposal,
and Core-owned normalization adds its stable ID to each derived card's `source_refs` before apply.
Issues keep findings out of ephemeral AI exchanges and link to the cards that can be inspected,
manually repaired, or discussed with AI.

All planning-card reference fields use one searchable `PlanningCardSelector`. It filters titles,
stable IDs, aliases, tags, and document types, renders type and stable identity beside the display
name, supports keyboard selection/clear/close, and virtualizes a bounded result viewport. Only the
stable card ID is persisted. Planned foreshadowing plant and resolution positions primarily store a
stable timeline/node/event reference plus a display snapshot; an outline chapter/scene may refine
that time position. Legacy free text remains visible with an explicit migration action and is never
silently discarded.

Planning collection pages apply search to the complete section before slicing a bounded renderer
window. Paging is transient UI state and never changes document order, identity, or storage. The
issue selection set remains independent of the visible page, so select-all, invert, ignore, resolve,
and reopen retain their complete-filter-result semantics while React DOM and layout work stay bounded.

Issues use three product states: `open`, `ignored`, and `resolved`. Ignoring adds a stable suppression
fingerprint derived from checker, issue code, target stable ID, and normalized key evidence. Later
project scans suppress that fingerprint. Resolving closes only the current occurrence and never
enters the suppression ledger, so a later detection can create a new occurrence. The dedicated issue
workspace supports selection, select-all, invert, and batch ignore/resolve/reopen. Issue discussions
anchor the current issue first and may read same-kind issues, explicit related cards, and locally
resolved stable references, but can only return reviewable proposals. Received model states are
mapped through the code-owned enum; invalid values yield a local structured error instead of failing
the whole page.

### Narrative Cards

New style, pacing, dialogue, description, literary structure, and genre-boundary guidance is stored
in one `narrative` card family. A narrative card affects prompts and AI checks only when enabled.
Legacy `strategy` and `pattern` files remain readable as compatibility inputs and appear in the same
Narrative collection, but new UI and AI/import proposals create `narrative` cards only.

### Agent Tasks, Context Bundles, and Creator Assistants

Product task definitions are application-owned contracts, not project files. Each fixes its schema
identifiers, context scope, capability ceiling, and allowed result types. A project creator role can
only select a creator-assistant task and enable a subset of that task's operations. In the Chinese
UI it is called a “创作助手” to distinguish it from both the runtime contract and a fictional
character.

`context-bundles/<id>.yaml` stores fixed `document_type + document_id` sources, bounded dynamic
selectors, exclusions, required/preferred semantics, and subject/constraint/evidence/style purpose.
The trusted process resolves stable IDs on every turn. Required failures block execution; preferred
failures become audit warnings. `creator-roles/<id>.yaml` binds one bundle and one WritingPreset.
Both stores reject path traversal and links escaping the project, update atomically under a
project-scoped write lock, and require the previously read hash.

Planning integrity checks also use a code-owned page scope. The project scope covers deterministic
story documents; page entry points narrow it further (timeline means only timeline nodes and events,
locations means only locations and routes, and so on). `world_entry` is excluded from every integrity
check, including project-wide checks: world-book records are heterogeneous knowledge/reference
material and are never promoted to deterministic novel logic merely by appearing in the project.

Assistant sessions live under `runs/assistants/<session-id>/`. A session freezes the task, assistant,
bundle, preset, effective operations, and their hashes; each turn retains exact messages,
PromptEnvelope, PromptBlocks, ContextTrace, token accounting, raw/repair output, and structured
proposals. Human-browsable conclusions are appended to `explorations/<id>.md`. Exploration is
advisory and excluded from ordinary context until the author explicitly pins it as a preferred
source. See
[ADR-agent-runtime-and-context-bundles.md](adr/ADR-agent-runtime-and-context-bundles.md).

The three built-in assistants keep `ContextBundle` (what the assistant knows), assistant prompt
(how it works), and `WritingPreset` (model and common prompt structure) as separate versioned inputs.
Assistant-prompt histories are isolated by assistant and the project configuration retains only the
five newest ordinary versions; immutable session and Run snapshots keep older exact text readable.
Character rehearsal follows a seven-stage character/time/location/preview/candidate/analysis/proposal
workflow and cannot write its trial prose into the manuscript or Canon. Continuity review accepts one
scene or a legal ordered contiguous range, compiles surrounding accepted prose and relevant state,
and returns evidence-backed issue proposals without editing prose. The selected stable IDs and legal
range are stored as typed `workflow_input` in both the session and execution snapshot, revalidated in
the trusted process, and resolved as code-required workflow sources rather than user-editable bundle
permissions.

The delivered P0 runtime is the executable model boundary for the migrated project check. Its
code-owned registry pairs each immutable task definition with a typed handler; the project-check
Desktop and CLI adapters do not construct prompts, parse model output, or apply model suggestions.
Before network I/O, the runtime persists the
exact secret-free PromptEnvelope and appends a flushed `request.prepared` event. It archives the
bounded original response or provider error before validation and returns candidates, proposals,
exploration, or reports only. An explicit hash-bound author decision and a separate domain service
remain mandatory for application. Project AI check is the first migrated flow; streaming and
provider-acknowledged real-time cancellation are not part of this first iteration. See
[ADR-unified-ai-agent-runtime.md](adr/ADR-unified-ai-agent-runtime.md).

DSH is not embedded as the runtime. Its current packages are coupled to Cordis and DSH session/tool
services or expose pre-release storage/wire contracts. Quillarium adopts the audited execution-log,
stable-error, and fail-closed-approval abstractions independently. Whole-package reuse remains the
preference over copying fragments, but any future DSH dependency or isolated subprocess bridge must
first pass the module-intake gate in the unified runtime ADR.

### Runs and Candidates

Every generation or dry run creates a run directory. Its metadata moves through `created`,
`generated`, `checked`, and `accepted`; the run is therefore an auditable lifecycle record, not an
immutable directory. Acceptance is explicit and writes non-empty plain prose into the owning scene
and chapter. Shared-guidance snapshots, once created for a run, are immutable.

The artifact superset across current scene Runs and unified Agent executions is below; a
flow writes only the files relevant to its lifecycle:

```text
metadata.yaml
request.json
plan.json
context.md
prompt.md
events.jsonl
output-raw.md
output-accepted.md
output.json
check-report.md
evaluation.json
prompt-blocks.json
context-trace.json
writing-preset.json
book-generation-header.json
context-bundle.json
prompt-envelope.json
provider-request.json
agent-execution.json
provider-error.json
parse-error.json
error.json
approvals/<decision-id>.json
applications/<application-id>.json
```

`prompt-blocks.json` and `context-trace.json` are immutable portable snapshots of the exact compiler
result used by generation. `shared-guidance.md` and `shared-guidance.json` snapshot the guidance read
for the run. `writing-preset.json` is the sanitized immutable preset snapshot; preset ID, semantic
version, and snapshot SHA-256 are also recorded in `metadata.yaml`.

`prompt-envelope.json` distinguishes the compiler-produced prompt from the exact provider messages.
When an author changes the prompt, both texts and their hashes remain available.
`provider-request.json` stores the final provider-visible request after adapter transformation with
credentials, endpoints, and local absolute paths removed. `book-generation-header.json` stores the
exact header text, project-relative source path, SHA-256, tokenizer, and actual token count used by
that Run. Changes affect only later Runs.
`agent-execution.json` records the product task, effective permissions, target, preset, PromptBlocks,
ContextTrace, token usage, PromptEnvelope, and its integrity hash. Older runs without these artifacts
remain readable.

New unified Agent executions use `runs/agents/<execution-id>/` and append strictly sequenced lifecycle
records to `events.jsonl`. The journal points to immutable artifacts by hash and is never used as
Canon, accepted prose, or planning truth. `provider-error.json` exists only on failures and retains
bounded, credential-scrubbed original status, request identity, finish reason, body or exception
detail. Existing scene Runs remain readable without either file.

One generation action can create two to eight Runs with a shared `candidate_group_id` and distinct
`candidate_index`. Base groups use the `main` branch; a branch group records its source candidate in
`parent_run_id` and receives a new `branch_id`. Every candidate keeps independent raw prose, checks,
and evaluation. `evaluation.json` contains a transparent fixed-penalty deterministic score and only
contains a semantic score when semantic checks completed or partially completed.

Selection uses a recoverable project-level journal to update exactly one `selected_at` marker in the
group. It does not change Run status or any prose. Reselection is allowed until a group member is
accepted; accepting a grouped candidate requires it to be selected first. See
[ADR-candidate-branches.md](adr/ADR-candidate-branches.md).

### Finalization Reviews and Continuity Apply

Review sessions live in `reviews/<review-id>.json`. A structured impact records its `create` or
`update` operation, stable target ID, field-level frontmatter merge, optional complete Markdown body,
evidence, confidence, decision state, and the target SHA-256 captured by Quillarium when the review
is completed. The hash is never trusted from model output. The review also locks the chapter-outline
and authoritative final-prose hashes, so an author edit after review requires a new review.

Apply first prepares every target in memory and validates type, identity, path containment,
references, duplicate targets, and all before hashes. It then writes backup and staged files beneath
`reviews/apply/<review-id>/<application-id>/`, publishes an exclusive `report.json` transaction
journal, atomically replaces managed targets, writes the review session last, and rereads all files.
Only a fully verified transaction becomes `applied`. A write or verification error restores all
before images and archives a rolled-back audit; startup or explicit recovery handles any nonterminal
journal left by interruption. See [ADR-finalization-apply.md](adr/ADR-finalization-apply.md).

### Prompts and Writing Presets

The chapter-writing service currently exposes typed `PromptSourceBlock` values for instruction,
outline, scene outline, guidance, Canon, time, place, characters, world knowledge, foreshadowing,
narrative rules, warnings, finalized prose, and continuation. The desktop lets the author remove
optional source cards and edit the resulting prompt; the exact adjusted text is saved as
`prompt.md`.

Those source cards are a temporary ContextBundle overlay rather than renderer-concatenated text.
The trusted process resolves every stable source identity again, compiles the blocks and trace, and
returns the editable result. The overlay can be saved as a versioned ContextBundle for reuse.

A versioned project `WritingPreset` binds a connection-profile role, optional provider/model/output
overrides, system/user prompt instructions, complete `PromptBlock` order, context policy, and check
policy. Desktop settings and `quill preset` select the same project value, and all generation paths
use one resolver. Desktop AI profiles and CLI environment variables supply endpoints and credentials;
those machine-local connection values are never serialized into a preset or run snapshot.

The optional book-generation header lives at `prompts/book-generation-header.md`; an empty file is
equivalent to no header. Scene creation, regeneration, continuation, rewrite, and polish compile it
before the immutable product task/permission boundary, WritingPreset instructions, project
PromptBlocks, and current scene objective. Checks, imports, setting organization, rehearsal,
continuity review, and timeline analysis do not receive it. Unknown external macros remain literal
and are surfaced as warnings. The read-only full-prompt viewer renders ordered blocks, the continuous
model-visible text, and final message JSON before generation, from saved Run artifacts afterward,
and from the historical snapshot in Run detail. Copy operations exclude UI notes and sanitize secrets,
endpoints, and machine paths; legacy Runs fall back only to their saved prompt and preset.

Preset v1 files are normalized in memory without rewriting them. Explicit migration performs
plan → backup → apply → verify. A missing or unsupported selected preset stops generation with an
actionable error rather than reverting to hidden defaults. See
[ADR-writing-presets.md](adr/ADR-writing-presets.md).

## Explainable Context Compiler

Current context assembly is a deterministic compiler:

```text
writing scope -> enumerate candidates -> triggers and bounded relationships
              -> authority and stable priority ordering
              -> exact model token budget -> deterministic truncation
              -> PromptBlocks + ContextTrace -> rendered context
```

Compiler inputs combine the writing scope, explicit pins/exclusions, eligible relationships, and a
`ContextPolicy` containing recursion, candidate, per-block, and selected-input token limits. The
machine-local model profile supplies the separate total context window and requested output cap. `PromptBlock`
records a block's type, role, source, authority, priority, token count, truncation strategy, and
inclusion reason. `ContextTrace` explains every candidate's outcome and the final budget calculation.
Recursive expansion is cycle-safe and bounded by both depth and candidate count. Accepted prose and
hard Canon cannot silently lose to project or workspace advice; if mandatory facts cannot fit,
compilation returns an actionable error.

DeepSeek V4, OpenAI `o200k`, and OpenAI `cl100k` model families use packaged exact vocabularies.
Machine-local connection profiles separately store editable context-window and output limits. Known
model limits are prefilled from a versioned vendor capability catalog with source URL and verification
date; they are defaults rather than project facts. For DeepSeek V4 Flash/Pro, the 2026-08-16 catalog
uses the official 1M context window and 384K maximum output, and new profiles default to
`deepseek-v4-flash` rather than the discontinued `deepseek-chat` alias. Import requests retain the
complete pasted source, reserve output within the configured context window, and surface provider
`finish_reason=length` as `AI_OUTPUT_TRUNCATED` instead of accepting partial JSON.
The compiler limits selected project material to the ContextPolicy input budget, then verifies that
this input plus framing and the configured output reservation fit the model context window. A large
vendor output ceiling therefore does not erase the ordinary context-selection budget.
Unsupported model/tokenizer combinations fail closed for generation rather than claiming an
estimate is exact. Desktop context inspection and CLI `context --trace` expose the same compiled
blocks and trace. Every generation run snapshots them as `prompt-blocks.json` and
`context-trace.json`.

Probability, sticky state, and cooldown do not decide which authoritative facts enter context. Given
the same project snapshot, preset, model tokenizer, and writing scope, compilation produces the same
ordered blocks and trace. See
[ADR-context-activation.md](adr/ADR-context-activation.md).

## 0.2.3 Transaction and Compatibility Boundaries

CCv3 book import is a two-phase operation. Preflight parses every candidate, rejects duplicate card
IDs and conflicts against all stable IDs already present in the project, and records the configuration
before-image plus every intended path. Applying to an existing project uses one project write lock;
any failure restores overwritten bytes and removes only files created by that transaction. Welcome-
screen import first builds and validates a transaction-marked temporary project under the workspace
`projects_dir`, atomically renames it on the same filesystem, and only then registers the workspace
manifest. A registration failure removes only that marked new directory and leaves no manifest or
project residue. The author title override is part of the import plan, not a later rewrite.

Issue suppression uses `IssueIdentityV2`: checker ID, issue code, sorted stable target IDs, and sorted
evidence anchors. A field anchor contains the real field path and a SHA-256 of its current value; a
body anchor contains a verified source range and a SHA-256 of the exact source text. Localized titles,
display language, and AI explanatory prose do not affect identity. AI evidence references must resolve
to a prompt-visible source field or exact body fragment before an issue proposal is accepted. V1
ledgers and issue fields remain readable without write-on-read migration. An author ignore, resolve,
or reopen action lazily upgrades reconstructable entries; unreconstructable legacy AI entries remain
intact until the author explicitly ignores matching evidence again. Only `ignored` enters suppression;
`resolved` remains eligible for later detection.

Assistant prompt creation and role binding form one write-locked transaction guarded by the role's
expected SHA-256. Failure restores the role, removes the new version, and restores any retention
victims. Each assistant retains its newest five unpinned ordinary versions; any older version still
referenced by a role is pinned outside that quota. A dangling binding is reported as
`prompt_binding_issues`, blocks new sessions for that role, and can be repaired only by explicit
rebind or by choosing an exact same-ID historical session snapshot. Initialization never guesses
between different snapshots and never changes historical session or Run content.

The document-reference index is derived cache data. Project load and document save do not synchronously
rebuild it. A reference request reads the document set once, hashes that set, returns a matching cache,
or rebuilds and atomically replaces the cache from the same read. Resolver maps for stable ID, code,
path, filename, title, and aliases keep resolution linear in documents plus references while retaining
all ambiguity candidates. External edits are detected by the set hash; invalidation hints improve
latency but are not required for correctness. On the same 2,000-document benchmark used during the
0.2.3 review, the median fell from the 881.7 ms baseline to 94.47 ms (about 9.33 times faster).

Character rehearsal resolves one trusted story-time point. An exact state scoped to the selected
event wins; otherwise the nearest state on or before the selected node is used, and future states are
excluded. Relationships are constraints only for `starts_at <= node < ends_at`; missing-time
relationships remain low-authority evidence with a visible warning. A unique placement or the main
timeline resolves automatically. Conflicting non-main placements require the author to select
`timeline_id`, which is stored in the workflow input and previewed with the chosen node, state source,
active relationships, and ambiguity warnings. Legacy workflow input without `timeline_id` remains
readable.

Sensitive-data handling is one shared, browser-safe core boundary. It recognizes credential-bearing
headers and assignments, common provider-token forms, endpoints, Windows/UNC/file URLs, and local
POSIX paths. New AI work scans source blocks and actual messages before Run/PromptEnvelope persistence
and again before provider invocation; a hit fails closed as `SENSITIVE_PROMPT_CONTENT` with only the
source identity, never the matched secret. It does not silently rewrite and send. Old Runs are not
mutated, but viewing/copying them is recursively sanitized. Provider-request archives and CCv3 export
use the same sanitizer, and final serialized CCv3 content is scanned before PNG bytes are written.

## 0.3.0 Setting Cards, Story-Tree Visibility, and Factions

### Project-local setting images

`world_entry`, `character`, `location`, `character_relation`, and `faction` documents may carry one
nullable `SettingImageAssetV1`. The original PNG/JPEG/WebP and generated PNG thumbnail are stored at
`assets/settings/<document-type>/<stable-id-key>/`; safe legacy ASCII IDs remain readable in the
directory name, while Unicode or filename-unsafe IDs use a deterministic SHA-256-derived key.
Frontmatter contains only project-relative paths,
MIME type, SHA-256, dimensions, focus, alternative text, and a small code-derived color palette. The
main process resolves every path inside the project, rejects symlink traversal, rechecks the document
before-image under the project write lock, and restores the exact Markdown plus any newly created
asset files on failure. Replacing or removing a current image does not destroy older asset bytes, so
manual recovery remains possible. Batch thumbnail loading reads the project document set once rather
than rescanning it per visible card.

The renderer prefers thumbnails in setting lists, detail panes, module cards, and the character-
relationship workbench. A faction without an emblem uses a deterministic circle plus one or two title
characters. Existing documents without `image` parse as `null` in memory; opening or listing them does
not write that default back to disk. No image bytes or asset paths enter CCv3 world-book fields.

### HTML setting-card Agent and workspace styles

`setting-card-design` is a code-owned, candidate-only Agent task for world entries, characters,
locations, and character relationships. Its source block removes `image` metadata and exposes only
width, height, aspect ratio, orientation, palette, and alt text. The model never receives image pixels,
hashes, or local paths. It returns exactly one schema-validated `{ template_html, css, notes }` object
using the required `{{image}}`, `{{title}}`, and `{{content}}` placeholders. `{{fields}}` renders the
bounded core-attribute block, while a safe single-key placeholder such as `{{fields.role}}` lets a
design feature one escaped core value without exposing arbitrary object traversal. Sanitization rejects scripts,
event handlers, remote URLs, CSS imports, expressions, and unknown placeholders; validation names the
exact rejected placeholder so the runtime's bounded repair has actionable evidence. Preview uses an
iframe with an empty sandbox capability set; exported HTML carries a deny-by-default CSP and embeds
only the selected thumbnail as a data URL.

The UI has one style selector. Code-owned built-ins and saved workspace styles rerender immediately and
never invoke a model; only `Random style` exposes Roll and calls the Agent without a base-style input.
The renderer supplies a zero-based candidate index. Trusted code rotates twelve primary composition
archetypes by that index and derives typography, image treatment, information density, palette, and
graphic language from the execution ID. The resulting brief is exact and reproducible in the Run
PromptEnvelope, while successive Rolls cannot reuse the same primary composition until the rotation
wraps. Successful Rolls append to an in-memory candidate history so authors can move backward and
forward without losing earlier results. The save controls appear only for the selected random
candidate, and an approved candidate is named and inserted into that same style selector as a
versioned style under the writing workspace at
`styles/setting-cards/<style-id>/<version>.json`. Styles therefore cross novel boundaries while project
facts and images do not. Applying a saved style rerenders the current card data; it does not copy the
source card or mutate Canon. Agent executions retain their exact PromptEnvelope and result snapshots,
while HTML export opens the operating system Save As dialog and writes only the explicitly selected
destination; canceling writes nothing. Required template placeholders and active-content rules
participate in the structured-output schema so one bounded repair can correct an invalid model
response. Card rendering formats prioritized core fields as semantic definition/list structures and
renders a bounded safe Markdown subset for long-form text.

### Reversible story-tree visibility

`ProjectConfig.story_structure` stores `part_enabled`, `act_enabled`, and `scene_enabled`. Missing
configuration in an old project defaults to all three enabled without a read-time migration. Acts
cannot be enabled when parts are disabled. When part or act is off, the renderer walks through the
disabled ancestors and presents chapters beneath the nearest enabled parent; every existing outline
keeps its original `parent` and file. The Settings inspector lists disabled part/act/scene files and
can open them in the external editor. Creation validates the effective hierarchy: chapters attach to
volumes when parts are off, or to parts when acts are off. Disabling scenes blocks new scene creation
in core and hides scene management plus the scene-bound generation surface, but it does not delete
legacy scenes or Runs.

### Faction network

Faction data uses three independent planning documents under `factions/`, `factions/relations/`, and
`factions/memberships/`: `faction`, `faction_relation`, and `faction_membership`. Relationship endpoints,
memberships, headquarters, and timeline bounds are stable IDs. Faction-to-faction relations require
different valid endpoints. Character memberships require an existing faction and character. Optional
intervals follow `starts_at <= selected node < ends_at`; untimed memberships remain visible as
lower-confidence, visually marked badges. Multiple active memberships are ordered with the primary
membership first and all emblems remain attached to the person in the relationship graph.

CCv3 book export includes confirmed faction, faction-relation, and membership setting data through the
same allowlisted world-book extension fields, while excluding project image paths. Import recreates
them as disabled candidate/draft documents for review. Projects and CCv3 archives made before 0.3.0
remain readable, and none of the new defaults trigger silent rewrites.

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

Obsidian and the local project files are the durable manual-editing surface. Git is optional and,
when enabled later, provides versioning at either workspace or standalone-project scope. GitHub is
an optional remote rather than an identity or creation prerequisite. Project-scoped Git actions
compute their pathspec on the trusted side and cannot include another project or unrelated pre-staged files.

SillyTavern is neither a dependency nor a compatibility roadmap. Quillarium independently implements
the public Character Card V3 interchange format for two one-way setting transfers only. The welcome
screen can create a new, empty-story project from CCv3 JSON/PNG; it archives the original bytes and
SHA-256, uses PNG art as the cover, maps description/scenario to the synopsis, and presents embedded
world-book material as disabled candidate/draft cards for review. Project settings can export one
`<book title>.png` using the 2:3 cover and an embedded CCv3 card/world book. The allowlist excludes
story trees, future plans, outlines, prose, issues, prompts, Runs, presets, API/model configuration,
credentials, endpoints, and machine paths; CCv3 system prompts remain empty or neutral. Private
stable IDs, types, order, and hashes live only under `extensions.quillarium`. There is no live sync,
work transfer, preset transfer, or runtime-state transfer. Existing Character Card and World Info
adapters remain isolated from the core model. Design research may borrow abstract interaction or
orchestration patterns through independent implementation; it does not copy code, prompts, comments,
UI resources, or chat-centric semantics.
The pinned research record and AGPL boundary are in [REFERENCES.md](REFERENCES.md).
