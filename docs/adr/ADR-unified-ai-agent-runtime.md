# ADR: Unified AI Agent Runtime Module

- Status: Accepted; P0 first vertical slice implemented
- Date: 2026-08-17
- Extends: [ADR-agent-runtime-and-context-bundles.md](ADR-agent-runtime-and-context-bundles.md)

## Context

Implementation note (2026-08-17): `@quillarium/agent-runtime`, its code-owned registry,
write-ahead audit journal, typed failures, author decision/apply handoff, and the project-wide
planning-integrity check handler are implemented. The project AI check is the only legacy AI flow
migrated in this slice; the remaining inventory keeps its existing orchestration until a later
explicit migration.

Quillarium already has shared provider transport, structured-output validation, deterministic context
compilation, product task metadata, creator-assistant sessions, and scene-generation Run snapshots.
It does **not** yet have one execution module through which every model call passes.

`AgentTaskDefinitionV1` currently describes task identity, schema IDs, context scopes, capability
ceilings, and allowed result types. It is a useful permission contract, but it has no executable
handler, prompt builder, output schema object, profile policy, timeout policy, artifact writer, or
failure lifecycle. Desktop IPC handlers and the CLI therefore still assemble and execute several AI
workflows independently.

The 2026-08-17 project-wide **AI check** failure makes the cost visible. The current path is:

```text
renderer
  -> planning:check
  -> deterministic planning rules
  -> buildPlanningCheckPrompts()
  -> generateText()
  -> custom JSON parse and Zod validation
  -> persistPlanningIssues()
```

The operation creates no execution ID before the network call and retains neither the exact prompt,
raw response, parse error, nor failed batch. An unknown English exception is reduced by the renderer
to a generic localized message. Consequently, after the failure shown by the author, the repository
can identify the possible failure phases but cannot recover which phase actually failed. This ADR is
the prerequisite for repairing that flow; it deliberately does not patch the isolated handler first.

## Current AI Inventory

Deterministic context assembly, ordinary rule checks, file import, accepting prose, finalization
apply, and publication are not Agents. They remain normal domain services even when an Agent consumes
their result or proposes a later action.

| Product flow                       | Current model entry                                          | Current context/output/audit behavior                                                                                  | Target task                   |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Material batch import              | Desktop `import:aiPlan` calls `generateText`                 | Custom token preflight and JSON request; import session exists, but no common execution snapshot                       | `material-import`             |
| Imported-card re-extraction        | Desktop `import:reimportCard` calls `generateText`           | Reuses source archive and custom JSON parsing; no independent failed Run                                               | `material-card-reextract`     |
| Planning-card collaboration        | Desktop `planning:discuss` calls `generateText`              | Bespoke conversation session and proposal parser                                                                       | `planning-card-collaboration` |
| Canon collaboration and summary    | Desktop `canon:discuss` calls `generateCanonText`            | Character-count clipping, free text/Markdown, and no task Run                                                          | `canon-collaboration`         |
| Project planning integrity review  | Desktop `planning:check` calls `generateText`                | Fixed card batches, custom JSON parser, no failure artifact, and immediate issue-card writes                           | `planning-integrity-review`   |
| Scene/section candidate generation | Desktop and CLI use generation Run helpers                   | ContextPacket, PromptBlocks, ContextTrace, preset and product snapshot are already present                             | `scene-draft-generation`      |
| Scene semantic review              | Desktop and CLI pass `generateText` into `runSemanticChecks` | Deterministic and semantic findings are combined, but semantic calls have no common execution snapshot                 | `scene-continuity-review`     |
| Chapter finalization review        | Desktop `finalize:reviewPlan` calls `generateText`           | Has a review session and safe apply service, but the model call uses a custom parser and no common execution lifecycle | `chapter-finalization-review` |
| Setting organizer                  | Creator-assistant turn uses `generateStructured`             | Frozen role/bundle/preset, PromptEnvelope, ContextTrace, raw/repair artifacts, and proposals                           | `creator-setting-organizer`   |
| Character rehearsal                | Creator-assistant turn uses `generateStructured`             | Same creator-assistant runtime; output remains exploration or candidate material                                       | `creator-character-rehearsal` |
| Continuity reviewer                | Creator-assistant turn uses `generateStructured`             | Same creator-assistant runtime; output remains issue proposals                                                         | `creator-continuity-review`   |

Desktop and CLI are adapters to the same tasks, not separate task identities. A dry run, context
preview, candidate selection, proposal approval, or retry is an operation on a task execution rather
than another Agent.

The existing v1 IDs remain readable during migration. The runtime registry maps them to the more
specific target IDs where the old ID combined several behaviors, for example `continuity-check`.

## Decision

### One module, not one giant file

Add a workspace package named `@quillarium/agent-runtime`. It is the application layer for every AI
execution. It must not contain Electron, React, credential storage, GitHub, or product-window code.

```text
Desktop IPC / CLI adapters
          |
          v
@quillarium/agent-runtime
  registry -> preflight -> context -> artifacts -> provider -> validate -> result
       |           |           |          |             |          |
       +-----------+-----------+----------+-------------+----------+
                              ports
                  /             |              \
      @quillarium/core   @quillarium/ai   @quillarium/checks
      data and context   provider transport   deterministic rules
```

- `@quillarium/core` continues to own pure schemas, project reads, ContextPolicy, ContextBundle,
  PromptBlock/ContextTrace, Run metadata, proposal data, and authoritative domain operations.
- `@quillarium/ai` is reduced to provider configuration, capability metadata, transport, retries,
  timeouts, truncation detection, and structured-response validation. It does not decide which
  project documents to read or where a result is applied.
- `@quillarium/checks` remains deterministic and provider-independent. A runtime task may combine its
  report with semantic proposals without turning deterministic checks into model calls.
- `@quillarium/agent-runtime` owns task handlers, execution planning, prompt envelopes, provider
  invocation, artifact lifecycle, structured result decoding, batching, retry identity, and stable
  errors.
- Desktop and CLI provide machine-local profile loading and presentation only. They do not build
  prompts, parse model output, or perform model-directed writes.

A proposed package layout is:

```text
packages/agent-runtime/src/
  contracts.ts
  errors.ts
  events.ts
  registry.ts
  executor.ts
  preflight.ts
  artifacts.ts
  approvals.ts
  batching.ts
  tasks/
    material-import.ts
    material-card-reextract.ts
    planning-card-collaboration.ts
    canon-collaboration.ts
    planning-integrity-review.ts
    scene-draft-generation.ts
    scene-continuity-review.ts
    chapter-finalization-review.ts
    creator-assistant-turn.ts
```

### DSH whole-module intake decision

DeepSeek Harness (DSH) `0.1.0-rc.5`, fixed at commit
`47f943859bef60e4160492346772ded9b24f765a`, was evaluated as a possible implementation source.
Quillarium prefers an audited whole-package dependency over copying isolated implementation
fragments, but a package is accepted only when all of these conditions hold:

- it has a versioned public API, compatible license, and distributable dependency closure;
- it does not require Cordis or another application kernel inside the Electron main process;
- it does not introduce shell, arbitrary file, Web, subagent, dynamic-code, or model-defined
  permission surfaces;
- its durable and wire formats have a compatibility policy suitable for published novel projects;
- it maps to one Quillarium port without replacing ContextBundle, ContextTrace, Run, proposal, or
  domain-apply semantics; and
- it can be pinned, tested, upgraded, and removed without migrating project truth.

No current DSH package passes that gate for this delivery:

| DSH package or bundle                                          | Decision                               | Reason                                                                                                                                                                                                              |
| -------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@deepseek-ai/dsh-base` / `dsh-headless`                       | Reject                                 | Base is a Cordis composition containing tools, persistence, policy and subagent providers; headless still layers on base. It is a second product kernel, not a library port.                                        |
| `@deepseek-ai/dsh-agent-loop`                                  | Reject                                 | Its durable conversation/tool loop is the product model and requires the DSH Agent, Session, LLM, prompt and tool services. Quillarium tasks are bounded candidate/proposal/report executions.                      |
| `@deepseek-ai/dsh-session` and `dsh-session-persistence-jsonl` | Reject for project Runs                | The session format is pre-release v0 without migration guarantees; the persistence backend adds native/runtime dependencies and treats chat/tool events as its reconstruction vocabulary.                           |
| `@deepseek-ai/dsh-user-approval`                               | Reference only                         | Its one-shot fail-closed behavior is desirable, but the package requires an open DSH turn, Cordis, DSH Session, Agent, prompt and scope services. Quillarium needs an author decision bound to a domain apply plan. |
| `@deepseek-ai/dsh-llm` and `dsh-llm-deepseek`                  | Re-evaluate only if decoupled upstream | Their streaming/error vocabulary is useful, but the published packages depend on Cordis and multiple DSH services and would duplicate `@quillarium/ai`.                                                             |
| `@deepseek-ai/dsh-sdk-client` / `dsh-sdk-protocol`             | Deferred optional bridge               | Process isolation is preferable to in-process embedding, but the current protocol has no version negotiation, prompt-level cancellation, or stable compatibility promise and still exposes DSH session vocabulary.  |

Therefore this iteration adds **no DSH runtime dependency and copies no DSH source fragment**. It
independently implements the documented invariants below using Quillarium's existing schemas and
storage. A future optional DSH subprocess bridge requires a separate ADR, an exact dependency pin,
protocol negotiation, cancellation, a restricted temporary working directory, no project path or
credentials by default, and a complete license/notices review. A future streaming implementation may
use a maintained framing dependency such as `eventsource-parser` directly; that is an upstream
library choice, not copied DSH code.

### Definition, handler, execution, and application are separate

The code-owned registry pairs immutable metadata with an executable handler. Serialized project data
never contains functions or permission decisions.

```ts
interface AgentTaskHandler<Input, Output> {
  definition: AgentTaskDefinitionV2
  inputSchema: ZodType<Input>
  outputSchema: ZodType<Output> | null
  prepare(input: Input, context: AgentPrepareContext): Promise<AgentExecutionPlanV1>
  decode(response: AgentProviderResponse, plan: AgentExecutionPlanV1): Promise<Output>
}

interface AgentExecutionRequestV1 {
  schema_version: 1
  task_id: string
  target: { type: string; id: string } | null
  input: unknown
  language: 'zh' | 'en'
  requested_by: 'author' | 'recipe'
  retry_of?: string
}
```

`AgentTaskDefinitionV2` adds execution mode, connection-profile role, output mode, timeout and token
policy IDs, approval policy, and result disposition. Those values are code-owned capability limits,
not user-granted permissions. A `CreatorRole` may still select a smaller allowed subset.

`executeAgentTask()` is the only public model-execution entry. It returns an immutable result or a
typed failure. It may write Run/audit artifacts, but it may not mutate Canon, planning cards, issue
cards, accepted/final/published prose, timeline, character state, or finalization targets.

Domain application is a second call:

```text
execute -> candidate/proposal/report -> author review -> domain apply service
```

The apply service validates the execution result, author selection, target hashes, and current
domain state. Natural-language output is never interpreted as a patch.

### Execution lifecycle

Every task follows the same bounded sequence:

1. Resolve the immutable task definition and handler.
2. Validate request, target, author/recipe authority, task operations, and expected project hashes.
3. Run any declared deterministic preflight and resolve the selected WritingPreset/profile.
4. Compile project knowledge through ContextPolicy/ContextBundle into PromptBlocks and ContextTrace.
5. Verify actual input tokens, framing, configured output reservation, provider limits, and task
   limits before a network request.
6. Create an execution ID and write sanitized request/plan snapshots **before** invoking a provider.
7. Send the exact PromptEnvelope through `@quillarium/ai`.
8. Store the raw response, then validate locally. Structured tasks permit one bounded repair.
9. Store parsed output or a typed failure, including phase and provider detail.
10. Return a candidate, proposal, exploration result, or check report to the caller.
11. If the author approves a result, invoke a separate domain apply service with old-hash checks and
    an audit record.

Batch tasks create one parent execution and deterministic child execution IDs. A failed child can be
retried without repeating successful batches. Aggregation records exactly which children contributed
to the final proposal set.

### Write-ahead model request and append-only execution events

`runs/agents/<execution-id>/events.jsonl` is an append-only execution journal. It is an audit index,
not a replacement for immutable request, prompt, response, and result artifacts and never a source of
novel truth. Every line is a validated `AgentExecutionEventV1` with a schema version, execution and
task IDs, strictly increasing sequence, recorded time, event type, artifact hash references, and
small typed event data. Existing lines are never rewritten; a retry creates a new execution linked by
`retry_of`.

The initial event vocabulary is:

```text
execution.created
execution.planned
context.compiled
request.prepared
request.dispatched
response.received
response.repair-received
output.validated
approval.requested
approval.decided
application.started
application.completed | application.failed
execution.completed | execution.failed | execution.cancelled
```

Anything visible to the model follows a strict write-ahead rule:

1. Build the exact provider messages and tool/schema declarations from the trusted execution plan.
2. Remove credentials, authorization headers, machine paths, and other non-model transport secrets.
3. Atomically write `prompt-envelope.json` and any referenced prompt/context artifacts.
4. Append and durably flush `request.prepared` with their hashes.
5. Only then invoke the provider and append `request.dispatched`.

If steps 3 or 4 fail, execution returns `AGENT_AUDIT_WRITE_FAILED` and performs no network request.
On provider completion, the bounded original response or provider error is persisted before parsing,
repair, proposal creation, or UI success. If response archival fails, no candidate, proposal, report,
or apply token is returned. Renderer state and console output do not satisfy this invariant.

### Artifacts and reproducibility

New one-shot executions use `runs/agents/<execution-id>/`. Creator-assistant turns retain their
session-oriented path and embed the same execution files in each turn. Existing scene Runs stay
readable and are adapted without relocation.

```text
request.json
plan.json
events.jsonl
agent-execution.json
writing-preset.json
prompt-envelope.json
prompt-blocks.json
context-trace.json
output-raw.txt
output-repair.txt        # only when attempted
output.json              # structured result, when successful
error.json               # typed failure, when unsuccessful
provider-error.json      # bounded, secret-scrubbed original transport/provider detail
metadata.json
```

Artifacts include content hashes and model capability inputs but never an API key, authorization
header, machine credential path, or decrypted secret. Large source documents are referenced by
stable identity and hash in the execution snapshot; the exact selected prompt blocks and sent
messages remain available for reproduction.

### Stable errors and UI boundary

`AgentRuntimeErrorV1` contains:

- `code`, `phase`, `task_id`, and `execution_id`;
- whether retry is safe and, for a batch, the failed child ID;
- localized message key;
- provider HTTP status, finish reason, and a sanitized technical detail;
- validation paths for structured output; and
- links to retained raw/repair artifacts.

The UI translates the stable message key, while a collapsible technical section preserves the
sanitized provider detail in its original language. Provider truncation and configured token values
remain visible even in a Chinese interface. A task failure stays inside the task panel with actions
for retry, inspect Run, copy details, or cancel. It must not replace the entire workspace. Full-page
fatal UI is reserved for application boot or irrecoverable project-load failure.

The first stable code families cover registry/input failures, audit storage, context/token planning,
AI configuration/authentication/quota/rate limit/timeout/transport/context overflow/truncation,
malformed or empty responses, structured-output parsing/repair, cancellation, batch aggregation, and
author application. `error.json` stores the stable code and sanitized structured detail;
`provider-error.json` retains the bounded original status, provider request ID, finish reason, body or
exception text, and cause chain after credential and header scrubbing. Localization never replaces
that technical evidence.

### Fail-closed author confirmation and domain apply

An execution result is not authority to mutate project truth. A domain application requires an
`AuthorApplyDecisionV1` created by an explicit trusted UI or CLI action. It identifies the execution,
selected result IDs, target document IDs, expected hashes, decision time, and author action. Missing,
rejected, malformed, stale, already-consumed, or unlogged decisions deny application.

The apply service, not the Agent handler, re-validates the task's result disposition, acquires the
project write lock, verifies expected hashes, records `application.started`, performs the existing
atomic domain operation, verifies its after state, and records completion. If the decision or audit
store is unavailable, application fails closed. A partial write is rolled back and remains
`application.failed`; model output can never manufacture or approve `AuthorApplyDecisionV1`.

### Permission and result matrix

| Task family                  | Execution may produce                                                                    | Separate author action may apply                         | Execution must never do                       |
| ---------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| Import and re-extraction     | Planning-card proposals with provenance                                                  | Land selected reviewed cards                             | Write unreviewed cards                        |
| Planning/Canon collaboration | Conversation and typed proposal                                                          | Save the author's confirmed card/content                 | Treat chat as Canon                           |
| Planning integrity review    | Rule report and issue proposals                                                          | Create/update selected issue cards                       | Write issues before review                    |
| Scene generation             | One or more plain-text candidates                                                        | Accept a selected candidate into chapter prose           | Accept, finalize, or publish                  |
| Scene continuity review      | Deterministic findings and semantic issue proposals                                      | Record selected issues                                   | Rewrite the checked prose                     |
| Finalization review          | Typed continuity proposals and questions                                                 | Apply the fully resolved set through atomic finalization | Confirm its own impacts                       |
| Creator assistants           | Exploration, candidate, planning/issue/configuration proposals within their role ceiling | Apply an explicitly approved proposal                    | Expand permissions or modify authority layers |

## First Migration: Project AI Check

The broken project-wide AI check is the first consumer after the runtime skeleton exists.

1. Keep `checkPlanningCards()` as a deterministic service that can always run without AI.
2. Register `planning-integrity-review` with a real input/output schema and the `check` profile.
3. Replace fixed 48-card/1,600-character batching with deterministic token-budget batches created
   from ContextPolicy candidates. Every inclusion, exclusion, and truncation is traceable.
4. Create the parent execution before calling the provider; store every batch prompt and raw output.
5. Use the common structured-output path, native JSON Schema where available, local Zod validation,
   and one repair attempt.
6. Aggregate rule findings and successful semantic batches. A failed batch remains visible and
   retryable; it does not erase deterministic results or pretend the review completed.
7. Show a review panel containing proposed issues, evidence, related document IDs, failed batches,
   and source traces. Only an explicit confirmation creates or updates issue cards.
8. Return a stable task-local error containing the execution ID instead of the generic full-page
   failure.

The isolated current handler should not receive a second bespoke parser or another renderer error
special case before this migration, because either change would preserve the missing audit boundary.

## One-Iteration Delivery Boundary

The first implementation iteration contains exactly this vertical slice:

1. code-owned registry and handler validation;
2. the single executor with write-ahead model request artifacts;
3. append-only execution events and typed failures with retained original provider detail;
4. fail-closed author decision and domain-apply handoff;
5. migration of project AI check, including deterministic findings, token-budget child executions,
   partial batch results, local failure UI, retry, and reviewed issue proposals; and
6. Desktop/CLI compatibility adapters plus focused unit, integration, and failure-injection tests.

Streaming token display and real-time cancellation are deliberately outside this iteration. The
executor and provider port carry execution identity and may accept future cancellation signals, but
v1 does not expose partial model output as a candidate and does not claim that closing a panel stops
provider work. A later ADR must define stream events, partial-artifact durability, cancellation
acknowledgement, retry safety, UI ownership, and provider fallback before those features ship.

## Migration Sequence

1. Add runtime contracts, typed errors, registry/handler pairing, artifact store, fake provider, and
   a no-domain-write executor test.
2. Migrate project planning integrity review and replace its full-page failure with a task-local Run
   result.
3. Migrate material import, card re-extraction, planning collaboration, and Canon collaboration.
4. Migrate scene semantic review and finalization review while preserving their existing domain
   approval/apply services.
5. Adapt the already-auditable scene generation and creator-assistant turn flows to the same public
   executor without moving old Runs.
6. Route CLI through the same registry and remove direct provider calls from application adapters.
7. Add a repository gate that permits `generateText`, `generateMessages`, and `generateStructured`
   only inside `@quillarium/ai` and `@quillarium/agent-runtime`.

Legacy IPC methods remain as thin compatibility adapters during migration. Existing projects require
no data migration, and old Runs remain read-only compatible.

## Acceptance Criteria

- Every user-visible AI action resolves to exactly one registered task handler.
- Registry startup rejects duplicate IDs, absent handlers, mismatched schemas, excessive operations,
  and an apply disposition outside the task ceiling.
- Every network request has an execution ID and sanitized plan snapshot before it starts.
- Failure-injection tests prove that a prompt/audit write failure performs zero provider calls and
  that `request.prepared` is durably recorded before the provider observes the request.
- Execution event sequences are append-only, contiguous, schema-validated, and refer only to
  existing artifacts with matching hashes.
- Success, timeout, provider failure, cancellation, truncation, invalid JSON, schema mismatch, repair
  success/failure, and partial batch failure all leave complete inspectable artifacts.
- Identical task input through Desktop and CLI yields the same prompt plan, output validation, and
  error code.
- Model execution cannot write domain truth; apply tests prove explicit approval and old-hash checks.
- Missing, stale, rejected, reused, or unauditable author decisions produce no domain write; rollback
  and failed-application events remain inspectable.
- Prompt injection in project documents cannot change system instructions, task permissions, result
  type, or output destination.
- Project AI check preserves deterministic results when semantic AI is unavailable and can retry only
  failed batches.
- UI tests prove that task failures remain local, expose execution ID/technical detail, and never
  blank the workspace.
- Static checks fail if an application IPC or CLI module calls provider transport directly.
- The dependency gate contains no Cordis or DSH runtime package in this iteration; future direct DSH
  reuse requires the whole-module intake criteria and a separate accepted ADR.

## Consequences

- “Agent” becomes a real executable product contract rather than a label applied to unrelated IPC
  handlers.
- Creator-assistant chat remains one interaction mode; it does not become the core model for import,
  checking, generation, or finalization.
- The package introduces deliberate application-layer structure and some migration adapters, but it
  removes duplicated prompt, validation, error, and audit behavior.
- Repairing the current AI-check incident takes longer than a one-line error mapping, but future
  failures become diagnosable and retryable without risking project writes.

## Rejected

- Expanding `packages/ai/src/index.ts` into a combined provider, project, UI, and domain service.
- Treating every deterministic check or file operation as an Agent.
- A chat/message record as the primary novel data model.
- Letting task handlers apply their own model output to authoritative files.
- Arbitrary script/tool execution, a general Agent marketplace, or model-defined permissions.
- Embedding `dsh-base`, Cordis, DSH session persistence, or a DSH chat/tool loop inside the desktop
  main process.
- Copying isolated DSH source fragments when no reviewed whole-module dependency satisfies the
  runtime boundary.
- Silent fallback from invalid structured output to guessed fields or partial domain writes.
