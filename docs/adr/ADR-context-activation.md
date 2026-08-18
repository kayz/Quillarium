# ADR: Deterministic Context Activation and Prompt Compilation

- Status: Accepted
- Date: 2026-08-12
- Decision owners: Quillarium maintainers
- Related research: [Design References](../REFERENCES.md)

Implementation status as of 2026-08-13: the Context compiler decision is implemented. The runtime
enumerates candidates without per-category count slicing, performs deterministic pin, keyword, link,
and typed-relation activation, bounds recursive traversal by depth and candidate count, and compiles
typed `PromptBlock` values under an exact model token budget. It emits a complete `ContextTrace` and
stores immutable `prompt-blocks.json`, `context-trace.json`, and shared-guidance snapshots in runs.
The versioned `WritingPreset` is now implemented as an additional deterministic input and immutable
run snapshot; its contract is recorded in [ADR-writing-presets.md](ADR-writing-presets.md).

## Context

The initial context assembler selects a small fixed number of documents. That is simple but cannot
explain why a fact was selected, safely expand related documents, enforce the model's actual token
limit, or reproduce truncation decisions. Long-form fiction also has an authority problem that
generic conversational retrieval does not: accepted prose and hard Canon must not lose to an
occasionally activated hint.

Quillarium needs richer activation and prompt composition without adopting chat records as its core
data model or making authoritative context nondeterministic.

## Decision

Quillarium will implement an independent, deterministic compiler built around `ContextPolicy`,
`PromptBlock`, and `ContextTrace`.

### Compiler pipeline

Every compilation executes the same ordered stages:

```text
writing scope
  -> enumerate candidate documents
  -> expand deterministic triggers and relationships
  -> sort by authority and declared priority
  -> allocate the real model token budget
  -> apply deterministic truncation
  -> emit ordered PromptBlocks and ContextTrace
```

The input snapshot includes the active workspace and project revision, target hierarchy levels
(overview, book, volume, part, optional act, chapter, and scene), explicit pins, selected
`WritingPreset`, tokenizer identity, and `ContextPolicy` version.

### `ContextPolicy`

The first policy schema declares the total input/output budget boundary, maximum per-block tokens,
minimum useful truncation size, maximum candidates, and maximum recursive depth. Candidate assembly
supplies eligible fiction scopes and document types, explicit pins/exclusions, reserved mandatory
blocks, deterministic relationship rules, authority tiers, stable tie-breaking order, and
block-specific truncation behavior. A later schema may add optional per-kind quotas without changing
the non-configurable authority order.

Expansion tracks visited document IDs, rejects cycles, and stops at both the configured depth and
candidate-count limits. A relationship discovered through generated text does not recursively expand
unless the policy explicitly enables that relationship kind.

### Authority

The non-configurable top-level authority order is:

```text
accepted prose and confirmed hard Canon
  > project strategy, outlines, and continuity state
  > workspace shared guidance
  > archived imports and optional research references
```

A policy may order documents within a tier but cannot promote a lower tier above a higher one.
Conflicting shared guidance produces a warning and remains visible in the trace; it never changes a
project fact.

### `PromptBlock`

Each compiled block records at least:

- stable block ID and content hash;
- block type and model role;
- source document ID and workspace-relative or project-relative path;
- fiction scope and intended use;
- authority tier and priority;
- tokenizer and token count;
- truncation strategy and resulting range; and
- inclusion reason and relationship chain.

The prompt is assembled exclusively from the ordered blocks. The UI can therefore preview the exact
prompt composition before generation.

### Real token budget

Budgeting uses the tokenizer associated with the selected provider/model. `ContextPolicy.token_budget`
caps selected project input, while the machine-local model profile separately supplies the total
context window and requested output cap. The compiler accounts for prompt framing and reserved output
against that model window, then uses the smaller of the remaining model input capacity and the policy
input cap. Packaged exact vocabularies currently cover DeepSeek V4 and the OpenAI `o200k`/`cl100k`
model families. A counter with a different tokenizer identity cannot silently claim exactness. If
exact counting is unavailable, compilation fails closed for generation.

Mandatory high-authority blocks reserve budget first. Optional blocks are admitted in stable order.
Truncation is document-type-specific, records the original and retained token counts, and never cuts
an atomic hard-Canon fact into a misleading fragment. When mandatory material alone exceeds budget,
compilation returns an actionable error rather than dropping facts invisibly.

### `ContextTrace`

The trace records:

- compiler, policy, target, and exact tokenizer identifiers;
- total, reserved-output, framing, available-input, selected, and unused tokens;
- every candidate and its trigger or relationship chain;
- authority, priority, and stable tie-break values;
- selected, truncated, or excluded outcome with reason; conflicts remain explicit warning blocks,
  while mandatory-budget and unsupported-tokenizer failures are actionable compiler errors; and
- the final ordered `PromptBlock` IDs and hashes.

A run stores the trace and rendered context. Shared guidance is read once per generation and saved as
both full text and metadata containing ID, relative path, scope, SHA-256, and read time. Later guidance
edits do not alter an existing run.

### Determinism

Probability, sticky activation, cooldown, wall-clock order, and unordered filesystem iteration are
not context-selection inputs. Stable IDs break equal-priority ties. Given the same content snapshot,
scope, WritingPreset, and tokenizer, compilation produces the same blocks, hashes, and trace.

## Rejected Alternatives

- **Chat history as the primary fiction model:** rejected because chapters, scenes, Canon, continuity,
  acceptance, and finalization have stronger domain semantics than conversational turns.
- **Random or stateful activation for authoritative records:** rejected because identical inputs could
  omit different facts and make runs irreproducible.
- **Fixed document counts or character limits as the final design:** rejected because they do not
  represent provider context capacity and hide truncation tradeoffs. The implementation enumerates
  all activated document types before applying the policy's global candidate and token limits.
- **Unbounded recursive retrieval:** rejected because it can explode context, loop through links, and
  obscure the source of a selected claim.
- **Shared guidance overwriting project files:** rejected because reusable methods are advisory and
  must never become project truth without an explicit author operation.

## Consequences

- Context compilation becomes inspectable, testable, and reproducible.
- Token counting and prompt framing become provider/model integration responsibilities.
- All document enumeration and relationship traversal require stable ordering.
- The desktop app needs a pre-generation context preview and budget explanation.
- Tests must cover scope selection, authority conflicts, recursion limits, cycles, exact budgeting,
  deterministic truncation, snapshot hashes, and unchanged replay after template edits.
- Optional SillyTavern format adapters remain isolated; this decision introduces no SillyTavern
  dependency or chat-compatibility objective.
