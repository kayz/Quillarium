# Quillarium Agent Design Decisions

Quillarium is a writing agent for long-form serialized fiction. Writer is not a
separate runtime project or an external source to migrate from; Writer is the
methodology and product-design source for Quillarium.

After Quillarium implements this methodology, actual writing happens inside
Quillarium-managed Obsidian vault projects. A novel such as `景泰蓝` is a project
under the vault. The older Writer workspace may remain as design background, but
it is not a live data source and should not create a second editable version of
the same novel.

## Product Relationship

- Writer is the design source for Quillarium's serialized-fiction workflow.
- Quillarium is the product that implements that workflow.
- Obsidian vault projects are the live writing environment.
- A novel project is the only editable truth for that novel.
- Existing notes, AI discussions, and old Markdown can be imported as one-time
  inputs, but only the Quillarium project remains active after import.

The first validation novel is `景泰蓝`, which is the working title for
`天地为枰`.

## Single Truth

Quillarium uses Markdown plus YAML frontmatter as the durable project data.
Obsidian can read and edit the same files.

The single-truth rule:

- The Quillarium project Markdown file is the active source.
- Imported source material is one-time input, not a parallel working copy.
- If imported material is retained for traceability, it is archived and excluded
  from normal context assembly.
- Low-confidence AI import decisions create issues for the writer to confirm.
- Confirmed decisions become ordinary Quillarium Markdown documents.

This avoids a split between "original notes" and "structured notes" after the
writer starts editing.

## Canon Rule

Keep canon states simple:

- `confirmed` means currently effective.
- `deprecated` means no longer effective.
- uncertain material should become an issue instead of a weak canon layer.

AI-created canon from accepted prose is written as `confirmed`. This does not
make it immutable. The writer can edit or deprecate any canon document at any
time. Quillarium should follow the current Markdown state on the next context
assembly or check.

Accepted prose is the strongest source of truth. Planning documents should bend
around accepted prose. If accepted prose contradicts planning, Quillarium should
surface the conflict and let the writer decide how to revise the project.

## Native Workflow Levels

Quillarium works at four native levels.

### Book / Master Outline

Purpose: establish the operating system of the novel.

Core work:

- reader promise
- genre boundary
- core appeal and suspense
- canon
- worldbook entries
- characters
- timeline seeds
- foreshadowing ledger
- story and writing patterns

The agent helps import and classify materials, extract stable facts, identify
uncertain decisions, and build the first project structure.

### Volume Outline

Purpose: define why this volume exists.

Core work:

- volume goal
- reader payoff
- event chain
- character growth
- foreshadowing plan
- act / arc arrangement
- emotional curve

The agent checks whether the volume advances the novel rather than only adding
events or lore.

### Arc / Segment Outline

Purpose: make a concrete block of plot work.

Core work:

- event order
- conflict escalation
- main cast
- fixed reveals
- foreshadowing plants and resolves
- relationship movement

The cast and major events are expected to be relatively stable at this level.

### Chapter / Section Writing

Purpose: produce and finalize prose.

Core work:

- writing environment
- POV, time, location, and participant state
- conflict check
- prompt assembly
- section generation
- manual revision
- accepted prose
- post-acceptance extraction

The prose unit is `section`. A chapter may contain multiple sections, but a
section should not be split further by Quillarium in the first implementation.

## Agent Responsibilities

Quillarium should expose agent work through the desktop app first. CLI commands
exist primarily as internal tools for the agent and for debugging.

Agent roles:

- Import Agent: classify existing notes and add frontmatter.
- Book Agent: organize canon, world, timeline, characters, foreshadowing, and patterns.
- Volume Agent: build and check volume goals, event chains, growth, and payoff.
- Arc Agent: arrange events, cast, conflict movement, and foreshadowing.
- Chapter Agent: assemble the writing context and generate section prose.
- Finalization Agent: extract canon, timeline events, character states,
  foreshadowing updates, and issues from accepted prose.
- Pattern Agent: extract reusable story and writing patterns.

All default prompts should be Chinese. English compatibility can remain possible,
but the product default is Chinese.

## AI Decision Rules

AI can classify, propose, extract, check, and draft. It should not hide decisions
from the writer.

Rules:

- If the agent is confident, create or update the relevant Markdown document.
- If the agent is uncertain, create an issue.
- If a contradiction affects the story truth, create an issue or check report.
- If accepted prose produces new canon, create confirmed canon.
- If accepted prose changes a character, create or update character state.
- If accepted prose plants, reinforces, or resolves foreshadowing, update the
  foreshadowing ledger.

The writer can always edit the resulting Markdown directly.

## Patterns

Use one project directory:

```text
patterns/
```

Do not use separate directories for each pattern family. Keep the structure
flat and distinguish pattern types with frontmatter.

Pattern kinds:

- `story`: structure patterns such as volume rhythm, reveal order, hook shape,
  payoff setup, and foreshadowing cadence.
- `writing`: prose and scene-execution patterns such as historical-political
  dialogue pressure, exposition control, emotional beat shape, and chapter-end
  pressure.
- `prompt`: reusable agent prompt patterns. The schema should allow this kind,
  but the first UI can focus on `story` and `writing`.

Recommended frontmatter:

```yaml
type: pattern
kind: story
scope: volume
status: active
title: Example Pattern
applies_to:
  - historical
  - political
source: user
```

Pattern sources may include `user`, `ai`, `accepted_prose`, or `imported`.

## Writer Templates As Native Product Inputs

Writer templates are not migration targets. They define Quillarium's native
forms and agent prompts.

Mapping:

- Series bible becomes the book-level setup workflow.
- Volume arc becomes the volume outline workflow.
- Chapter card becomes the chapter / section writing workflow.
- Continuity ledger becomes distributed Quillarium modules: timeline,
  character states, resources, foreshadowing, canon, and issues.

If a template field cannot be mapped cleanly, Quillarium should generate an
issue rather than inventing extra status layers.

## Desktop First

The desktop app is the primary product surface.

Required workspaces:

- book / master outline workspace
- volume workspace
- arc workspace
- chapter / section writing workspace
- finalization and canon-backfill workspace
- issue review workspace
- pattern workspace

The CLI should expose the same primitives for automation, tests, and agent
execution, but the writer should not need to operate the CLI during normal use.

## First Validation Project

`景泰蓝` is the first Quillarium validation novel. It is the current working
title for `天地为枰`.

Validation goals:

- create a Quillarium-managed novel project
- express the book-level method natively
- create volume, arc, chapter, and section outlines
- generate section prose from assembled context
- allow manual revision in the same writing environment
- accept prose and automatically backfill canon, events, character states,
  foreshadowing updates, and issues
- keep all active data in the Quillarium project Markdown files
