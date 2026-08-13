# ADR: Deterministic Context Activation and Prompt Compilation

- Status: Accepted
- Date: 2026-08-12
- Decision owners: Quillarium maintainers
- Related research: [Design References](../REFERENCES.md)

Implementation status as of 2026-08-13: partial. The runtime has deterministic document selection,
typed prompt-source cards for chapter writing, pins/exclusions, keyword and relationship activation,
authority warnings, a document-level packet trace, and immutable shared-guidance snapshots. It still
uses fixed per-category document caps. The `ContextPolicy`, tokenizer-aware budget, complete
candidate trace, recursive traversal limits, versioned preset, and persisted `context-trace.json`
described below remain the accepted target rather than current API guarantees.

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

The policy declares:

- eligible fiction scopes and document types;
- explicit pins and reserved mandatory blocks;
- deterministic keyword, frontmatter-link, outline-parent, timeline, character, location, and
  foreshadowing relationships;
- authority tiers and stable tie-breaking order;
- per-kind and total token budgets;
- maximum relationship depth, maximum expanded candidates, and cycle handling; and
- block-specific truncation or exclusion behavior.

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

Budgeting uses the tokenizer associated with the selected provider/model, including prompt framing
overhead and reserved output tokens. A counter with a different tokenizer identity cannot silently
claim exactness. If exact counting is unavailable, compilation must fail closed for generation or use
a named conservative fallback that is visibly marked in the trace and requires policy approval.

Mandatory high-authority blocks reserve budget first. Optional blocks are admitted in stable order.
Truncation is document-type-specific, records the original and retained token counts, and never cuts
an atomic hard-Canon fact into a misleading fragment. When mandatory material alone exceeds budget,
compilation returns an actionable error rather than dropping facts invisibly.

### `ContextTrace`

The trace records:

- compiler, policy, preset, tokenizer, workspace, and project snapshot identifiers;
- total, reserved-output, framing, available-input, selected, and unused tokens;
- every candidate and its trigger or relationship chain;
- authority, priority, and stable tie-break values;
- selected, truncated, excluded, conflict, or error outcome with reason; and
- the final ordered `PromptBlock` IDs and hashes.

A run stores the trace and rendered context. Shared guidance is read once per generation and saved as
both full text and metadata containing ID, relative path, scope, SHA-256, and read time. Later guidance
edits do not alter an existing run.

### Determinism

Probability, sticky activation, cooldown, wall-clock order, and unordered filesystem iteration are
not context-selection inputs. Stable IDs break equal-priority ties. Given the same content snapshot,
scope, policy, preset, and tokenizer, compilation produces the same blocks, hashes, and trace.

## Rejected Alternatives

- **Chat history as the primary fiction model:** rejected because chapters, scenes, Canon, continuity,
  acceptance, and finalization have stronger domain semantics than conversational turns.
- **Random or stateful activation for authoritative records:** rejected because identical inputs could
  omit different facts and make runs irreproducible.
- **Fixed document counts or character limits as the final design:** rejected because they do not
  represent provider context capacity and hide truncation tradeoffs. Fixed caps remain a transitional
  safeguard until the accepted compiler is complete.
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
