# ADR: Typed Agent Runtime and Creator Assistants

- Status: accepted and implemented for the creator-assistant delivery gate
- Date: 2026-08-16
- Scope: core schemas, context resolution, AI execution, run audit, desktop creator-assistant UI

## Context

Quillarium already compiles novel knowledge through `ContextPolicy`, typed `PromptBlock` values,
exact token budgets, and `ContextTrace`. Its import, planning, scene, check, and finalization features
nevertheless entered AI execution through separate application flows. It also lacked a durable way
to say which sources a reusable assistant should know, what that assistant may do, and where its
non-authoritative results belong.

Research into Spherse confirmed the product value of binding a persistent role to behavior,
project material, and permissions. Quillarium adopts that abstract pattern independently, while
retaining a fiction-domain model and its existing authority, acceptance, finalization, and
publication boundaries. It does not adopt Spherse's file format, source code, prompts, interface,
chat-centered truth model, or general-purpose Agent platform.

## Decision

### Three different meanings of “role”

Quillarium keeps these concepts separate:

1. `AgentTaskDefinitionV1` is a product-owned, read-only task contract. It fixes the input/output
   schema identifiers, context scopes, capability ceiling, and allowed result types. Neither a
   project nor model output can edit it.
2. `CreatorRoleV1` is a project-owned configuration presented to the author as a **创作助手**. It
   binds one task, one `ContextBundleV1`, one `WritingPreset`, behavior instructions, a subset of the
   task's operations, and one allowed output disposition.
3. A fictional character remains story data. Selecting a character may start a character-rehearsal
   assistant, but the character never gains runtime permissions and a rehearsal never becomes that
   character's authoritative state.

The first creator-assistant tasks are `organize-setting`, `character-rehearsal`, and
`continuity-review`. Product task definitions also describe the existing import, planning-card,
scene-generation, continuity-check, and finalization-review flows so those flows can adopt the same
execution snapshot progressively without changing their existing screens.

### Persistent objects and paths

All new objects are versioned pure data. Stable document references use `document_type` and
`document_id`; configuration never stores a project file path.

```text
context-bundles/<bundle-id>.yaml
creator-roles/<role-id>.yaml
explorations/<exploration-id>.md
runs/assistants/<session-id>/session.json
runs/assistants/<session-id>/turns/<turn-id>/
```

`ContextBundleV1` answers “what should this work know?” A fixed source is `required` or `preferred`
and has one purpose: `subject`, `constraint`, `evidence`, or `style`. Version 1 supports only these
bounded selectors:

- current target;
- outline ancestors;
- explicit relations, with a maximum depth of one;
- active timeline context; and
- relevant accepted prose.

Regular expressions, probability, sticky/cooldown state, arbitrary paths, and unbounded recursion
are not selection mechanisms. Duplicate, excluded, unreadable, out-of-project, or missing required
sources block execution. A missing preferred source produces an audited warning. Exploration
documents can only be preferred advisory sources and are excluded unless the author explicitly
adds them.

`CreatorRoleV1.enabled_operations` must be a subset of the selected product task's capability
ceiling, and its output disposition must be allowed by that task. It cannot grant itself file,
network, Canon, acceptance, finalization, or publication authority.

### Authority and permissions

The authority order remains:

```text
accepted prose / confirmed hard Canon
  > project outlines, strategy, state, and enabled guidance
  > workspace shared guidance
  > preferred exploration and optional evidence
```

| Task or assistant   | May produce                             | May not do                                                            |
| ------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| Setting organizer   | exploration and planning-card proposals | write a planning card before author approval; write Canon             |
| Character rehearsal | exploration and prose candidates        | change character state, relationship phases, Canon, or accepted prose |
| Continuity reviewer | exploration and issue proposals         | rewrite the checked chapter/scene or apply continuity changes         |
| Scene generation    | candidate prose                         | accept, finalize, or publish prose                                    |
| Finalization review | typed finalization proposals            | confirm or apply its own impacts                                      |

Model text is never interpreted as a patch. Planning and issue proposals are applied only by
product services after an explicit author action. Configuration suggestions are stored as a
schema-validated diff. Adding operations, removing a required source, or changing output type is
marked high risk and still requires author approval. Effective operations are checked again when
recording each turn.

### Context compiler and PromptEnvelope

The context compiler continues to own project knowledge selection, authority, ordering, exact token
budget, truncation, and `ContextTrace`. `AgentPromptEnvelopeV1` owns the ordered system/context/
conversation/current-input messages and the exact final text sent to a provider. This separation
keeps `WritingPreset` block order intact and avoids turning chat messages into project facts.

The chapter prompt-source UI is a temporary ContextBundle overlay. Add/remove operations send stable
source identities to the trusted process, which resolves them again and recompiles the context. The
overlay can be saved as a normal ContextBundle. If the author edits the compiled prompt, the run
records both the compiled text and exact sent text plus their hashes.

### Sessions, snapshots, and structured output

Starting a session freezes the assistant, bundle, preset, task definition, and their versions/hashes.
Configuration edits affect a new session or explicit fork, not the existing session. Each turn
re-resolves current project documents, recompiles context, and saves an `AgentExecutionSnapshotV1`
containing effective permissions, resolved sources, prompt blocks, trace, token accounting,
PromptEnvelope, exact messages, and hashes. Existing product flows use the compatible
`ProductAgentExecutionSnapshotV1` as they are connected.

Full conversation and failure artifacts stay under the assistant run. `ExplorationDocV1` is the
human-browsable, append-only record of goals, conclusions, open questions, and proposal links; AI
does not overwrite author-authored exploration content.

Structured AI calls request native JSON Schema where the provider supports it and otherwise request
a JSON object. Provider output is parsed and validated locally with Zod. One bounded repair attempt
is allowed. Raw output, parse/validation errors, and repair output are retained. Stable error codes
cross the IPC boundary; the desktop translates them according to the selected language.

### Write safety and compatibility

Configuration, sessions, turns, exploration documents, and proposals use project-contained paths,
reject path traversal and escaping symbolic links, and write atomically under a project-scoped,
re-entrant lock. Updates require the caller's previously read SHA-256; an external or concurrent
change fails with `STALE_PROJECT_WRITE` rather than overwriting it.

Projects without ContextBundles or creator roles retain their previous behavior. Built-in templates
remain application-owned and are copied into the project only on first use. Existing Run readers
remain compatible; no load operation silently migrates or rewrites an old Run.

## Consequences

- The user can answer, before execution, what the assistant knows, why a source was selected, what
  operations are effective, and where results will go.
- Assistant conversation becomes recoverable without becoming a second source of story truth.
- Scene generation is the first existing flow to emit the common product execution snapshot; import,
  planning, check, and finalization can adopt it incrementally.
- Configuration has more explicit versioning and approval friction, which is intentional at an
  authority boundary.

## Deferred

- external-file watcher and conflict notifications;
- a pausable run-time approval/question control bus;
- typed post-commit domain events;
- cross-project live ContextBundles;
- domain recipes that compose approved operations; and
- any plugin, arbitrary script, generic trigger, MCP marketplace, mobile bridge, or generated HTML
  workbench.

## Rejected

- chat history as Canon or accepted prose;
- direct model writes to Canon, accepted/final/published prose, or continuity ledgers;
- arbitrary project-relative or absolute context paths;
- unbounded full-file injection or non-deterministic authoritative selection;
- Spherse compatibility or source/prompt/UI copying; and
- a general-purpose Agent platform as Quillarium's product model.

The external research provenance and license record is in
[REFERENCES.md](../REFERENCES.md); the evidence review and adoption matrix is in
[SPHERSE-PRODUCT-REVIEW.md](../SPHERSE-PRODUCT-REVIEW.md).
