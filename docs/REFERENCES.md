# Design References

Quillarium is independently designed and implemented under the MIT License. External projects are
used only to study abstract product and orchestration patterns. They are not runtime dependencies,
compatibility targets, or sources of copied code, comments, prompts, interface assets, or command
syntax.

## Implementation Status

The entries below register independently designed **target abstractions**, not a claim that every
mechanism is already implemented. The current development baseline has deterministic
tokenizer-aware `ContextPolicy` compilation, complete `PromptBlock`/`ContextTrace` artifacts,
bounded relationship activation, editable prompt-source cards, immutable compiler/shared-guidance
snapshots, versioned `WritingPreset` snapshots, and independently implemented candidate groups,
comparison, selection, and branches. Lifecycle events, scoped notes, rolling summaries, recipes,
and a plugin system remain roadmap work. Current behavior is described in
[DESIGN.md](DESIGN.md), and delivery status is tracked
in the root [ROADMAP.md](../ROADMAP.md).

## SillyTavern Research Baseline

- Source project: [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- Source license: GNU Affero General Public License v3.0 (`AGPL-3.0`)
- Fixed commit: [`8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8`](https://github.com/SillyTavern/SillyTavern/tree/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8)
- Research date: 2026-08-12
- Quillarium relationship: design-pattern reference only; no dependency and no parity objective

The entries below name the files inspected at that fixed commit and the independently implemented
Quillarium abstraction. Line numbers are intentionally omitted because the commit and path already
form a stable reference.

### Context activation and bounded expansion

- Reference files:
  [`public/scripts/world-info.js`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/world-info.js)
- Abstract mechanism studied: trigger-based selection, ordering, recursion controls, and a bounded
  context budget.
- Target Quillarium design: deterministic `ContextPolicy` selection by writing scope, explicit pins,
  keywords, document relationships, authority, and importance; cycle detection and hard recursion
  limits; model-aware token accounting; a complete `ContextTrace`.
- Material difference: probability, sticky activation, and cooldown never select authoritative
  fiction facts. Identical inputs must produce identical context.
- Source code copied: No.

### Prompt blocks and token accounting

- Reference files:
  [`public/scripts/PromptManager.js`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/PromptManager.js),
  [`public/scripts/openai.js`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/openai.js)
- Abstract mechanism studied: ordered prompt components with role information and explicit token
  budgeting.
- Target Quillarium design: typed `PromptBlock` values record source, purpose, authority, priority,
  token
  count, truncation rule, content hash, and selection reason. A pre-generation preview exposes the
  exact compiled order and budget.
- Material difference: blocks represent fiction-domain evidence and instructions, not a chat
  transcript. Accepted prose and hard Canon have domain-defined precedence.
- Source code copied: No.

### Candidate comparison and branching

- Reference files:
  [`public/scripts/swipe-picker.js`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/swipe-picker.js),
  [`public/scripts/bookmarks.js`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/bookmarks.js)
- Abstract mechanism studied: retaining alternatives, comparing them, selecting one, and creating a
  branch from a chosen alternative.
- Quillarium implementation: Runs record candidate group, parent Run, branch, checks, and selection
  time; alternatives remain auditable and can seed a new fiction branch. Selection recovery and
  acceptance rules are defined independently in
  [ADR-candidate-branches.md](adr/ADR-candidate-branches.md).
- Material difference: selecting a candidate is not scene acceptance, chapter publication, or a
  continuity update. Candidate lineage belongs to the run model, not a sequence of chat records.
- Source code copied: No.

### Versioned presets and connection configuration

- Reference files:
  [`public/scripts/preset-manager.js`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/preset-manager.js),
  [`public/scripts/extensions/connection-manager/index.js`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/extensions/connection-manager/index.js)
- Abstract mechanism studied: reusable model connection settings and prompt presets.
- Target Quillarium design: versioned `WritingPreset` values bind model configuration, prompt stack,
  `ContextPolicy`, and check policy; every run records a sanitized snapshot or reproducible hash.
- Material difference: credentials remain in machine-local configuration and are never serialized
  into a preset, workspace, project, or run.
- Source code copied: No.

### Lifecycle events

- Reference files:
  [`public/scripts/events.js`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/events.js)
- Abstract mechanism studied: named events around completed lifecycle transitions.
- Target Quillarium design: strongly typed domain events are published only after core service
  writes
  succeed, including `context.assembled`, `candidate.selected`, `scene.accepted`, and
  `finalization.applied`.
- Material difference: event names and payloads follow chapter and continuity semantics, and event
  subscribers do not receive implicit file, network, or AI authority.
- Source code copied: No.

### Scoped notes and rebuildable summaries

- Reference files:
  [`public/scripts/extensions/memory/index.js`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/extensions/memory/index.js),
  [`public/scripts/world-info.js`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/world-info.js)
- Abstract mechanism studied: injecting scoped authorial guidance and summarized prior context.
- Target Quillarium design: writing notes have an explicit fiction scope and optional expiry;
  rolling
  summaries are derived, rebuildable, and cite their source chapters.
- Material difference: a summary is never a substitute for accepted prose, and notes cannot override
  hard project facts.
- Source code copied: No.

### Declarative production recipes

- Reference files:
  [`public/scripts/extensions/quick-reply/index.js`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/extensions/quick-reply/index.js),
  [`public/scripts/extensions/quick-reply/src/QuickReply.js`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/extensions/quick-reply/src/QuickReply.js)
- Abstract mechanism studied: composing repeatable actions into a user-triggered workflow.
- Target Quillarium design: a future declarative chapter recipe can assemble context, generate
  several
  candidates, check, compare, accept, and finalize through typed product commands.
- Material difference: no general command language or arbitrary script execution is planned. Recipes
  can invoke only permission-checked Quillarium operations.
- Source code copied: No.

### Extension metadata and capability declarations

- Reference files:
  [`public/scripts/extensions.js`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/extensions.js)
- Abstract mechanism studied: extension discovery, manifests, version requirements, and dependency
  declarations.
- Target Quillarium design: if a plugin system is later justified, manifests will declare versions
  and
  capabilities, while isolated execution requires explicit file, network, and AI permissions.
- Material difference: plugins are deferred until the chapter lifecycle is stable; arbitrary
  JavaScript installation and implicit privileges are explicitly excluded.
- Source code copied: No.

## License Boundary

SillyTavern's AGPL-3.0 license is not compatible with treating copied or adapted implementation as
ordinary MIT-only Quillarium code. Contributors must therefore:

1. implement the documented abstractions independently;
2. avoid copying or paraphrasing source, comments, prompts, UI assets, and command definitions;
3. cite format specifications themselves when implementing Character Card or other interchange;
4. add a reference entry and design review before studying a new external mechanism; and
5. request a separate license review before any direct reuse or close adaptation.

Character Card and World Info conversion remains an optional adapter boundary. It does not make
SillyTavern a product dependency or establish a goal of feature compatibility.
