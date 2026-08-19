# Quillarium Documentation

<p>
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

This map describes the documentation shipped with the released
[`v0.3.0`](https://github.com/kayz/Quillarium/releases/tag/v0.3.0) code line. The root
[README](../README.md) is the product overview; runtime schemas, command help, and tests remain the
authoritative source when a historical document differs from current behavior. The working tree is
the local `0.3.1` candidate and its UI-skin contract is documented separately below.

## Start Here

| Goal                                                               | Document                              |
| ------------------------------------------------------------------ | ------------------------------------- |
| Understand the product and run it from source                      | [Project README](../README.md)        |
| Read the full Simplified Chinese product guide                     | [中文版 README](../README.zh-CN.md)   |
| Use the command-line workflow                                      | [CLI guide](CLI.md)                   |
| Understand storage, authority, compatibility, and the 0.3.0 design | [System design](DESIGN.md)            |
| Understand the desktop information architecture                    | [UI architecture](UI-ARCHITECTURE.md) |
| Customize or audit the 0.3.1 interface skins                       | [UI skin contract](UI-SKINS.md)       |
| Understand Agents, ContextBundles, permissions, and snapshots      | [Agent design](AGENT-DESIGN.md)       |
| Build or audit an immutable release                                | [Release process](RELEASING.md)       |
| Follow delivered gates and future priorities                       | [Product roadmap](../ROADMAP.md)      |
| Review external design sources and license boundaries              | [References](REFERENCES.md)           |

## v0.3.0 Feature Map

The release adds project-local setting imagery, reusable HTML setting-card styles, reversible story
tree visibility, typed faction networks, and deterministic reference upload followed by optional
read-only AI discussion. The same release also includes the reliability work prepared after v0.2.2:
transactional CCv3 import, evidence-anchored issue fingerprints, atomic assistant-prompt binding,
on-demand reference indexing, story-time-aware rehearsal context, and a shared sensitive-data
boundary.

- Storage contracts and compatibility: [DESIGN — 0.3.0 Setting Cards, Story-Tree Visibility, and
  Factions](DESIGN.md#030-setting-cards-story-tree-visibility-and-factions)
- Desktop interaction and trust boundaries: [UI architecture](UI-ARCHITECTURE.md)
- Text-only setting-card Agent and proposal permissions: [Agent design](AGENT-DESIGN.md)
- Product status and supported workflows: [Project README](../README.md#what-works-now)
- Delivered gate and later work: [Product roadmap](../ROADMAP.md#completed-release-gate-v030-settings-and-reliability)

## 0.3.1 Local Candidate

The candidate adds reviewed card retyping, prose-to-setting extraction, explicit file-drop routing,
manual blank setting cards, and four editable CSS-token interface skins. See the
[UI skin contract](UI-SKINS.md), [current README](../README.md#031-local-candidate), and
[roadmap candidate gate](../ROADMAP.md#031-local-candidate-card-retyping-prose-extraction-and-ui-skins).

## Architecture Decisions

The `adr/` directory records decisions that should remain stable even when implementation details
move:

- [Unified Agent runtime](adr/ADR-unified-ai-agent-runtime.md)
- [Agent runtime and ContextBundles](adr/ADR-agent-runtime-and-context-bundles.md)
- [Context activation](adr/ADR-context-activation.md)
- [Writing presets](adr/ADR-writing-presets.md)
- [Candidate branches](adr/ADR-candidate-branches.md)
- [Finalization apply](adr/ADR-finalization-apply.md)

## Historical and Maintainer Documents

- [MVP worklist](MVP-WORKLIST.md) is retained for provenance and is not a current usage guide.
- [UI worklist](UI-WORKLIST.md) and files under `superpowers/` are implementation records, not product
  promises.
- [P0 Agent runtime prompt](implementation/AGENT-RUNTIME-P0-PROMPT.md) is a completed implementation
  brief.
- Package-level READMEs describe internal package boundaries and public exports.

The Simplified Chinese edition currently covers the complete product README, this documentation map,
and the release guide. Detailed architecture specifications and ADRs remain English-first so that
there is one normative technical text; the [Chinese documentation map](README.zh-CN.md) summarizes
their purpose and points to the authoritative files.
