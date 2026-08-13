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

The current runtime records one raw and one accepted output per run. Future candidate selection will
only choose a draft for the next step; it will not publish the chapter, mutate Canon, or update
continuity. Acceptance creates authoritative prose for the selected scene. The current finalization
review records proposed impacts and author confirmations; the separate atomic continuity-apply
operation remains planned.

## Agent Responsibilities

Agents may classify, propose, draft, compare, extract, and check. They must not conceal decisions or
silently mutate authoritative files.

- Import Agent: classify source files, preserve provenance, and propose structured project records.
- Overview Agent: keep the one-sentence purpose distinct from the book's worldline plan.
- Book Agent: organize the worldline, character destinies, Canon, world, timeline, and foreshadowing.
- Volume Agent: develop volume goals, event chains, growth, pacing, and payoff.
- Part Agent: pursue one medium-term goal and define its irreversible change.
- Act Agent: when an act exists, arrange its complete conflict movement, reveal, and result.
- Chapter Agent: prepare chapter obligations and coordinate scene production.
- Scene Agent: assemble explainable context and generate one or more prose candidates.
- Check Agent: run deterministic checks first and add clearly identified semantic findings.
- Finalization Agent: propose Canon, timeline, character-state, resource, foreshadowing, and issue
  updates from accepted chapter prose.
- Retrospective Agent: connect publication feedback to future planning without rewriting accepted
  prose.

Default prompts are Chinese, while schemas and import adapters may support other languages.

## Permission and Write Rules

Every agent operation has an explicit scope and produces reviewable artifacts.

- Read scope is limited to the active workspace, project, and declared shared-guidance files.
- Context assembly is read-only and records why every prompt block was included, truncated, or
  excluded.
- Generation writes only run artifacts and candidates.
- Accepting prose requires an explicit author action and writes only the selected target plus its run
  metadata.
- Finalization is a proposal until the author confirms it.
- A future continuity-apply operation must validate the entire change set, write it atomically, and
  record before/after evidence. A partial apply is a failure and must be recoverable.
- Credentials, local indexes, UI state, and regenerable exports are never written into a project or
  workspace manifest.

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

Each current AI run records target, provider/model, status, rendered context, exact prompt, raw and
accepted output, and check report. Workspace guidance used by a run is snapshotted with its relative
path, scope, SHA-256, and read time; those snapshots are immutable. Versioned writing presets, full
prompt-block/token traces, and candidate lineage are P0 targets rather than current run fields.

External projects can inform design research, but Quillarium independently implements its product
semantics. Design references and license boundaries are recorded in [REFERENCES.md](REFERENCES.md);
the deterministic context decision is recorded in
[ADR-context-activation.md](adr/ADR-context-activation.md).
