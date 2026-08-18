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

## Spherse Research Baseline

- Source project: [Spherse](https://github.com/mengrru/spherse)
- Source license: MIT License (`MIT`)
- Fixed commit: [`10f5d6a8b357d6e2fc5615e9a8feb62474383b8e`](https://github.com/mengrru/spherse/tree/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e)
- Research date: 2026-08-16
- Product demonstration: [Bilibili — 我做了个Agent应用，可以让你的OC世界观变成活的生态系统](https://www.bilibili.com/video/BV11Tuz6VEay/)
- Detailed review: [Spherse product and architecture review](SPHERSE-PRODUCT-REVIEW.md)
- Principal reference files:
  [README](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/README.md),
  [architecture](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/docs/official/architecture.md),
  [data conventions](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/docs/official/data-conventions.md),
  [agent management](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/tools/manage-agent.ts),
  [context loading](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/context/read-context-files.ts),
  [session assembly](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/session/live-session.ts),
  [file watcher](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/server/src/lib/fs-watcher.ts), and
  [session control bus](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/session/control-bus.ts).
- Abstract mechanisms studied: persistent agent-specific context, AI-proposed agent configuration
  with approval, project-path access control, external file synchronization, run-time interaction,
  typed infrastructure boundaries, and the product loop from source material to reusable role and
  interactive surface.
- Independent Quillarium implementation: product-owned Agent task contracts, stable-ID
  `ContextBundleV1`, project `CreatorRoleV1`, author-approved configuration diffs, recoverable
  sessions, exploration documents, and immutable execution/PromptEnvelope snapshots. Product rules
  are defined in
  [ADR-agent-runtime-and-context-bundles.md](adr/ADR-agent-runtime-and-context-bundles.md), not in
  this reference register.
- Implementation status: creator-assistant closed loop and scene-generation product snapshots are
  implemented; external-file watcher, pausable approval control bus, post-write events, and recipes
  are deferred. Import, planning, check, and finalization retain their business services and adopt
  the common execution snapshot progressively.
- Material difference: Quillarium remains a fiction-domain system. It resolves stable document
  identities through its authority-aware, token-bounded compiler; required evidence fails closed;
  conversation is not project truth; no assistant bypasses proposal, acceptance, finalization, or
  publication boundaries. It has no Spherse dependency, compatibility target, or parity objective.
- Source code, prompts, UI assets, or command definitions copied: No.

## DeepSeek Harness Research and Module-Intake Baseline

- Source project: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- Source license: MIT License (`MIT`), with a separately maintained third-party notices and
  distribution closure
- Fixed commit: [`47f943859bef60e4160492346772ded9b24f765a`](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a)
- Evaluated version: `0.1.0-rc.5`
- Research date: 2026-08-17
- Principal reference files:
  [architecture](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md),
  [agent loop](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/README.md),
  [session store](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/session/README.md),
  [one-shot approval](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/interaction/user-approval/README.md),
  [LLM seam](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm/README.md),
  [DeepSeek adapter](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm-deepseek/README.md), and
  [SDK protocol](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/sdk/protocol/README.md).
- Abstract mechanisms adopted: code-owned registration, model-visible write-ahead reconstruction,
  append-only typed execution events, provider-neutral stable failures, bounded original-error
  retention, and one-shot fail-closed human approval.
- Quillarium implementation: the application-specific `@quillarium/agent-runtime` specified by
  [ADR-unified-ai-agent-runtime.md](adr/ADR-unified-ai-agent-runtime.md). Its event journal indexes
  immutable Run artifacts; its tasks produce candidates, proposals, exploration, and reports; author
  decisions and domain apply services remain separate.
- Whole-module assessment: `dsh-base`, `dsh-headless`, `dsh-agent-loop`, `dsh-session`,
  `dsh-user-approval`, and the DSH LLM packages are not accepted because their published boundaries
  require Cordis and multiple DSH application/session services. The SDK client/protocol remains a
  deferred subprocess-bridge candidate after version negotiation, cancellation, and compatibility
  guarantees exist.
- Material difference: DSH is a general chat/tool Agent platform whose presets may name privileged
  plugins. Quillarium has no model-defined plugins, shell/tool platform, chat-as-truth model, or DSH
  persistence/wire compatibility target.
- Runtime package added: Yes: an independently implemented Quillarium package, with no Cordis or
  DeepSeek Harness runtime dependency, currently serving only the project planning-integrity check.
- Source code, comments, prompts, UI assets, or command definitions copied: No.

## License Boundary

SillyTavern's AGPL-3.0 license is not compatible with treating copied or adapted implementation as
ordinary MIT-only Quillarium code. Contributors must therefore:

1. implement the documented abstractions independently;
2. avoid copying or paraphrasing source, comments, prompts, UI assets, and command definitions;
3. cite format specifications themselves when implementing Character Card or other interchange;
4. add a reference entry and design review before studying a new external mechanism; and
5. request a separate license review before any direct reuse or close adaptation.

Spherse is MIT-licensed, so the AGPL compatibility concern above does not apply to it. The research
decision nevertheless remains independent implementation of documented abstractions: this review
does not authorize copying its source, prompts, interface assets, or command definitions. Any future
proposal for direct reuse must identify the exact material, preserve required attribution, and pass
an explicit dependency and license review first.

DeepSeek Harness is also MIT-licensed, but its complete repository and distribution closure contain
separately licensed third-party packages. Whole-module reuse is preferred over copying fragments only
after the exact package, transitive/runtime closure, notices, API stability, security capabilities,
and removal path pass an accepted ADR. The current unified-runtime decision imports no DSH package
and copies no DSH implementation.

Character Card and World Info conversion remains an optional adapter boundary. It does not make
SillyTavern a product dependency or establish a goal of feature compatibility.
