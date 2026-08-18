# Quillarium Agent Design Decisions

Quillarium is the product and runtime for planning, drafting, checking, accepting, and finalizing
long-form serialized fiction. It is work-neutral: no particular novel, character, setting, or
validation project belongs in product defaults, public terminology, or core test semantics.

The durable data is Markdown plus YAML frontmatter. Each novel project is both an Obsidian vault and
a Quillarium project root, so Quillarium and Obsidian operate on the same files instead of maintaining
parallel editable copies.

## Single Source of Truth

- Accepted prose and confirmed hard Canon are the highest-authority project facts.
- Project strategy, outlines, state ledgers, and other planning documents guide future writing but
  do not override accepted prose.
- Workspace-level shared guidance supplies methods and templates. It can shape a prompt but cannot
  silently change project facts.
- Imported source material is immutable evidence, not an active second copy of the project. Material
  promoted from an import becomes an ordinary project document through a reviewable operation.
- Uncertain imports, contradictions, and low-confidence extraction results become issues or warnings
  for the author to resolve.

The authority order used by context assembly and checks is:

```text
accepted prose / confirmed hard Canon
  > project strategy, outlines, and state
  > workspace shared guidance
  > archived imports and optional references
```

Lower-authority material never overwrites higher-authority material. A conflict is surfaced with its
sources and remains unresolved until the author makes an explicit project edit.

## Native Workflow Levels

Quillarium uses seven conceptual planning and delivery levels. `overview` and `book` are parallel
top-level documents; `scene` is stored as a scene record with a durable scene outline rather than as
another outline node.

### Overview

The overview states the work's purpose in one sentence: core people, central conflict, and final
direction. It is not a book outline and does not own volume children.

### Book Outline

The book outline defines the worldline and character-destiny axes, causal stages, and final state. It
owns the volume tree and may reference Canon, worldbuilding, characters, timeline seeds,
foreshadowing, and narrative guidance without duplicating them.

### Volume

The volume level defines why a volume exists: its destination, reader payoff, event chain, character
growth, foreshadowing plan, part arrangement, and emotional curve.

### Part

The part turns a portion of the volume into a major, normally irreversible story movement around one
medium-term goal.

### Act (Optional)

An optional act subdivides a part into a complete dramatic unit: event order, conflict escalation,
cast, fixed reveals, relationship movement, and foreshadowing plants or resolutions. A part may also
own chapters directly.

### Chapter

The chapter is the minimum delivery and publication unit. A chapter plan records its promise,
conflict, payoff, hook, continuity obligations, and the ordered scenes needed to fulfill them. A
chapter is not complete merely because all of its scenes have drafts.

### Scene

A scene is the minimum prose-generation unit. It binds POV, time, location, participants, writing
focus, constraints, and intended state changes. A chapter may contain zero scenes and be written
entirely by hand, or contain several ordered scenes. A scene's accepted plain prose is appended into
the independent chapter prose; its outline remains durable after publication purges prompts and AI
artifacts.

## Chapter Lifecycle

The product workflow is chapter-centered:

```text
prepare chapter
  -> generate scene candidates
  -> select and accept scenes
  -> check the complete chapter
  -> finalize chapter
  -> apply continuity updates
  -> record publication feedback and retrospective
```

The runtime creates two to eight independent Runs in a candidate group, retains every alternative,
and can create a new branch group from any candidate. Selecting one candidate is a recoverable
metadata-only transaction; it does not publish the chapter, mutate Canon, update continuity, or
write prose. The separate accept action creates authoritative prose for the selected scene. The
current finalization review records structured proposed impacts and author decisions. The shared
core apply service validates, backs up, applies, verifies, and audits the complete confirmed set;
any failure restores every affected file and leaves the review unapplied.

## Agent Tasks, Creator Assistants, and Fictional Characters

“Agent” is a runtime term, not a story role and not a license for autonomous file access. The product
keeps three concepts separate:

- `AgentTaskDefinitionV1` is a product-owned, read-only execution contract. It fixes the input and
  output schemas, context scopes, capability ceiling, and allowed result types. Projects and model
  output cannot edit it.
- `CreatorRoleV1` is a project-owned configuration shown in the Chinese UI as **创作助手**. It binds
  one product task, one `ContextBundleV1`, one `WritingPreset`, behavior instructions, a subset of the
  task's operations, and an allowed output destination.
- A fictional character remains project story data. Starting “人物试戏” from a character card does
  not grant that character a runtime identity, permissions, or authority over its own Canon/state.

The task registry describes existing import, planning-card, scene-generation, continuity-check, and
finalization-review work, plus three creator-assistant tasks. Existing product screens may adopt the
common execution snapshot incrementally; task identity does not turn those workflows into chat.

As of 2026-08-17, `@quillarium/agent-runtime` is the executable boundary for the project-wide
planning-integrity check. Its Desktop and CLI entries are thin adapters over the same handler,
write-ahead audit, typed error, retry, decision, and apply lifecycle. Creator-assistant turns, scene
generation, import, card re-extraction, planning and Canon collaboration, scene semantic checks, and
finalization review still retain their separate orchestration paths. They migrate individually;
existing Runs remain readable and are never silently rewritten. The complete inventory and
migration boundary are defined in
[ADR-unified-ai-agent-runtime.md](adr/ADR-unified-ai-agent-runtime.md).

The unified runtime adds executable handlers to the code-owned registry; serialized project files
contain neither functions nor permission decisions. Desktop and CLI call one `executeAgentTask()`
entry. A handler may prepare context, invoke the configured provider, validate output, and write Run
artifacts, but it cannot apply its own result.

Every provider request obeys a model-visible write-ahead invariant. The trusted process first writes
the exact secret-free PromptEnvelope, PromptBlocks, ContextTrace, execution plan, and their hashes,
then durably appends `request.prepared` to the execution journal, and only then starts network I/O. A
failed audit write performs no provider call. The bounded original response or provider error is
archived before parsing or proposal creation. `runs/agents/<execution-id>/events.jsonl` records the
append-only execution lifecycle with strict sequence numbers; it is an audit index and never novel
truth.

Runtime failures carry a stable code, phase, task and execution identity, retry safety, localized
message key, and sanitized original provider detail. The selected UI language controls the summary,
while technical provider text remains available without replacing the workspace. Project AI check
is the first legacy flow migrated through this boundary. Streaming output and provider-acknowledged
real-time cancellation remain deferred until their partial-artifact and cancellation semantics have
a separate accepted design.

The first built-in creator assistants are:

- Setting organizer: turns author-supplied material into exploration notes and reviewable planning
  proposals.
- Character rehearsal: explores a character under the selected time, relationship, location, and
  Canon constraints. Its output remains exploration or candidate material.
- Continuity reviewer: compares a chapter or scene with Canon, timeline, location, and character
  state and creates issue proposals only.

The inputs are deliberately three separate layers: `ContextBundleV1` selects what project knowledge
is available; the assistant prompt versions how that assistant performs its workflow; and
`WritingPreset` selects the model and common prompt structure. Model text and project configuration
cannot modify the product-owned permission ceiling. Assistant prompt versions are namespaced by the
three assistant IDs, project configuration retains the newest five ordinary versions per assistant,
and every historical session keeps its exact prompt text, version, and hash even after pruning.

Character rehearsal is a seven-stage task: select character, time event, and place/scene; preview the
resolved state and Canon; generate trial prose; diagnose missing, contradictory, or implausible
behavior; then record exploration and a character-setting proposal. Trial prose is candidate material,
never manuscript prose. Continuity review accepts either one scene or a validated same-chapter
contiguous ordered range, includes adjacent accepted prose and resolved time/person/place/Canon state,
and emits evidence-backed issue proposals without changing prose. These selections are typed stable-ID
workflow inputs, frozen into the session/execution snapshot and independently checked by the trusted
process before they can contribute required or preferred context sources.

The story-production responsibilities remain domain operations: overview and book planning organize
the purpose and worldline; volume, part, optional act, and chapter planning define delivery
obligations; scene generation creates candidates; checks create findings; finalization creates typed
continuity proposals; retrospective work informs future planning. None of these operations accepts,
finalizes, publishes, or changes Canon merely because a model requested it.

Default prompts are Chinese, while schemas and import adapters may support other languages.

## Context Bundles and Assistant Sessions

`ContextBundleV1` is the durable selection intent for “what this work needs to know.” It stores
stable `document_type + document_id` references instead of file paths. Fixed sources are
`required` or `preferred` and declare a `subject`, `constraint`, `evidence`, or `style` purpose.
Version 1 dynamic selectors are deliberately bounded to the current target, outline ancestors,
one-hop explicit relations, current timeline context, and related accepted prose.

A required source that is missing, duplicated, unreadable, excluded, or outside the project blocks
execution. A preferred source produces an audited warning. Exploration documents are excluded by
default and can only be explicitly pinned as preferred advisory material. Every source is resolved
again in the trusted process before each turn; renderer-supplied content and paths are not trusted.

An assistant session freezes its task, role, ContextBundle, WritingPreset, and their hashes. Each
turn reads the current project documents and produces a fresh context trace and execution snapshot.
Changing an assistant or bundle therefore changes only a new session or branch. Conversation and
failed-turn artifacts remain under `runs/assistants/<session-id>/`; the append-only browsing record
lives in `explorations/<id>.md` and never replaces project facts.

Planning-card collaboration sessions persist an ordered multi-proposal collection, selected item,
confirmation states, and revisions. A discussion opened from an existing card pins that stable target
as the first anchor and records its source path and expected SHA-256. Regeneration and recovery cannot
reorder it. Apply is a separate author action: every update hash is checked before any write, then the
project-scoped lock, atomic replacement, verification, and whole-transaction rollback protect mixed
create/update sets.

The active planning module is a trusted read/output boundary, not a prompt hint. The main process
filters the catalog and proposal collection to that module's allowed document kinds, rejects an AI
proposal outside the allowlist, and repeats the check before any confirmed proposal is applied.
Timeline collaboration is therefore limited to timeline nodes and events; it cannot create location,
world-book, or foreshadowing proposals.

Planning integrity review has a separate code-owned scope carried in the task input and Run result.
Project review and every page-scoped review exclude `world_entry` content because world books hold
mixed knowledge and references rather than accepted story truth. A timeline review additionally
selects only timeline nodes and events. Retries recover the frozen scope from the prior Run snapshot.

Issue-card discussions anchor the current issue first and may additionally read same-kind issue cards,
explicitly related cards, and locally resolved stable references. They can only propose changes. The
issue state machine is code-owned: `ignored` writes a stable checker/code/target/evidence suppression
fingerprint, `resolved` closes only one occurrence and remains eligible for later redetection, and
`open` remains actionable. Provider aliases such as `received` and `closed` are repaired only through
a bounded mapping; other invalid values remain localized structured errors.

## Permission and Write Rules

Every agent operation has an explicit scope and produces reviewable artifacts.

- Read scope is limited to the active workspace, project, and declared shared-guidance files.
- Context assembly is read-only and records why every prompt block was included, truncated, or
  excluded.
- A creator assistant can enable only operations below its product task's capability ceiling. It
  cannot grant itself a new operation or output type.
- Assistant output is limited to exploration, candidate prose, planning proposals, issue proposals,
  and typed finalization proposals where the product task explicitly permits them.
- Generation writes only run artifacts and candidates.
- Accepting prose requires an explicit author action and writes only the selected target plus its run
  metadata.
- Finalization is a proposal until the author confirms it.
- Model output cannot mark its own impact confirmed. Natural-language suggestions are never
  interpreted as executable patches.
- Applying a runtime result requires a trusted, explicit `AuthorApplyDecisionV1` tied to the
  execution, selected result IDs, target IDs, and expected hashes. Missing, rejected, stale, reused,
  malformed, or unauditable decisions deny the write.
- AI suggestions that change a creator assistant or ContextBundle are schema-validated diffs. New
  operations, removed required sources, and output-type changes are highlighted and require explicit
  author approval; application also requires the previously read configuration hash.
- Continuity apply validates the entire change set and reviewed target hashes, retains complete
  before images, verifies every after hash, and records source chapter/scenes plus recovery paths.
  A partial apply is a failure and is rolled back before the review may become `applied`.
- Credentials, local indexes, UI state, and regenerable exports are never written into a project or
  workspace manifest.
- The optional book-generation header applies only to prose-generation tasks and is inserted before
  the immutable task boundary, WritingPreset instructions, compiled project blocks, and current scene
  goal. Each Run snapshots its full text, relative path, SHA-256, tokenizer, actual token count,
  compiler PromptEnvelope, and sanitized provider-visible request. Check, import, organization,
  rehearsal, continuity, and timeline tasks never receive it.

The desktop application is the primary product surface. CLI commands expose the same primitives for
automation, migration, testing, and diagnosis, but normal writing must not depend on shell access.

## Canon and Continuity Rules

Canon states stay intentionally small:

- `confirmed`: currently effective project fact.
- `deprecated`: retained for history but no longer effective.
- uncertainty: represented by an issue, never by an implicit weak truth layer.

Accepted prose may justify a proposed Canon or continuity update, but the proposal records its source
chapter and requires the finalization/apply boundary. The author can later edit or deprecate any
record. The next context assembly follows the current files and reports contradictions rather than
guessing which fact should win.

## Narrative Guidance and Legacy Patterns

New style, pacing, structure, dialogue, description, and genre-boundary guidance uses enabled
`narrative` cards. These cards participate in prompt assembly and planning checks only when enabled.

Pre-0.2 reusable patterns remain readable in `patterns/` and use frontmatter to distinguish their
purpose:

- `story`: structure, reveal order, hook shape, payoff setup, and foreshadowing cadence.
- `writing`: prose execution, dialogue pressure, exposition control, emotional beats, and chapter-end
  pressure.
- `prompt`: reusable prompt behavior; supported by the schema even if not exposed in the first UI.

Pattern sources may be `user`, `ai`, `accepted_prose`, or `imported`. Legacy patterns and current
narrative cards influence drafting; neither outranks project facts.

## Auditability and Reproduction

Each current AI run records target, product task, effective operations, provider/model, selected
writing-preset ID/version/hash, status, rendered context, exact prompt, raw and accepted output, and
check report. It also stores immutable `agent-execution.json`, `prompt-envelope.json`,
`writing-preset.json`, `prompt-blocks.json`, and `context-trace.json` snapshots where the flow uses
those inputs. The snapshots contain stable source identities, content hashes, exact tokenizer
identity, token allocation, truncation ranges, inclusion/exclusion reasons, compiled prompt, exact
sent prompt, and their hashes. Workspace guidance used by a run is snapshotted with its relative
path, scope, SHA-256, and read time. Preset, assistant, and ContextBundle updates affect only new runs
or sessions. Candidate group, parent Run, branch, ordering, and selection lineage remain fully
auditable.

Structured model calls prefer provider-native JSON Schema and otherwise request a JSON object. The
runtime always validates locally and allows at most one bounded repair attempt. Raw output, parsing
or validation errors, and repair output are retained. Stable error codes cross the process boundary;
the selected UI language supplies the human-readable message.

DeepSeek Harness is a design and module-intake reference, not a current runtime dependency. Its
append-only reconstruction rule, stable provider errors, and fail-closed one-shot approval behavior
inform the Quillarium contracts. Current DSH packages require Cordis and DSH session/tool services or
expose pre-release wire/storage formats, so none is embedded in this iteration and no isolated source
fragment is copied. A future whole-module dependency or process bridge requires its own accepted ADR,
exact version pin, restricted process boundary, license/notices review, and removal plan.

External projects can inform design research, but Quillarium independently implements its product
semantics. Design references and license boundaries are recorded in [REFERENCES.md](REFERENCES.md);
the deterministic context decision is recorded in
[ADR-context-activation.md](adr/ADR-context-activation.md).
Candidate selection and branch semantics are recorded in
[ADR-candidate-branches.md](adr/ADR-candidate-branches.md).
Typed Agent tasks, ContextBundles, creator assistants, sessions, snapshots, and their non-goals are
recorded in
[ADR-agent-runtime-and-context-bundles.md](adr/ADR-agent-runtime-and-context-bundles.md).
The single executable module that will connect every product AI call is specified in
[ADR-unified-ai-agent-runtime.md](adr/ADR-unified-ai-agent-runtime.md).
