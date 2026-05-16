# MVP Worklist: Obsidian-Based Writing Flow

This MVP focuses on a usable Obsidian-backed writing workflow before building a full desktop UI.

## Goal

Create a CLI-first system that can initialize a novel project, manage core writing files,
assemble context for one section, save generation runs, and produce consistency check reports.

## Non-Goals

- No full desktop UI yet.
- No VSCode extension yet.
- No SillyTavern import/export yet.
- No advanced graph visualization yet.
- No automatic long-document ingestion beyond simple import helpers.

## Milestone 1: Repository and Workspace Setup

- [x] Add pnpm workspace.
- [x] Add TypeScript project references.
- [ ] Add packages:
  - [x] `packages/core`
  - [x] `packages/cli`
  - [x] `packages/checks`
  - [x] `packages/ai`
- [x] Add Vitest.
- [ ] Add lint/format baseline.
- [ ] Add CI build workflow.

## Milestone 2: Novel Project Skeleton

- [x] Implement `quill init <title> --vault <path>`.
- [x] Generate standard folder layout:
  - [x] `canon/`
  - [x] `characters/`
  - [x] `timeline/`
  - [x] `locations/`
  - [x] `resources/`
  - [x] `causality/`
  - [x] `outlines/`
  - [x] `scenes/`
  - [x] `prompts/`
  - [x] `runs/`
  - [x] `exports/`
  - [x] `sillytavern/`
- [x] Generate `project.yaml`.
- [x] Generate starter README inside the novel folder.
- [x] Add tests for folder creation.

## Milestone 3: Markdown and YAML Data Layer

- [x] Define shared document schema:
  - [x] `id`
  - [x] `type`
  - [x] `schema_version`
  - [x] `title`
  - [x] `status`
  - [x] `tags`
- [x] Implement Markdown frontmatter parser/writer.
- [x] Implement safe slug and file naming helpers.
- [x] Implement project loader.
- [x] Implement project index builder as JSON cache.
- [x] Add schema validation with Zod.

## Milestone 4: Canon MVP

- [x] Define canon item schema.
- [x] Implement `quill canon add`.
- [x] Implement `quill canon list`.
- [x] Implement `quill canon import <file>`.
- [ ] Support canon fields:
  - [ ] `status: draft | confirmed | deprecated`
  - [ ] `strength: hard | soft`
  - [ ] `source: user | ai | imported | historical`
- [ ] Add simple text search over canon.

## Milestone 5: Character MVP

- [x] Define character schema.
- [x] Implement `quill character add`.
- [x] Implement `quill character list`.
- [x] Implement arc fields by volume and story arc.
- [x] Implement OOC guardrails.
- [x] Implement scene state fields:
  - [x] current location
  - [x] outfit layers
  - [x] wounds
  - [x] carried items
  - [x] known facts
  - [x] emotional state

## Milestone 6: Timeline MVP

- [x] Define event schema.
- [x] Implement `quill timeline append`.
- [x] Enforce forward-only chain references.
- [x] Validate `previous` and `next` links.
- [x] Support `flashback_reference` without changing main chain.
- [x] Add `quill timeline check`.

## Milestone 7: Location MVP

- [x] Define location schema.
- [x] Define route edge schema.
- [x] Implement `quill location add`.
- [x] Implement `quill route add`.
- [x] Implement location graph index.
- [x] Add basic reachability check.

## Milestone 8: Outline and Scene MVP

- [x] Define outline schemas:
  - [x] book
  - [x] volume
  - [x] story arc
  - [x] chapter
  - [x] section
- [x] Implement `quill outline add`.
- [x] Implement `quill scene create`.
- [x] Bind scenes to:
  - [x] section outline
  - [x] timeline node
  - [x] location
  - [x] POV character
  - [x] participating characters
- [x] Store prose by section under `scenes/`.

## Milestone 9: Context Assembly

- [x] Implement `quill context <scene-id>`.
- [ ] Assemble context in this order:
  - [ ] project premise and style
  - [ ] active canon
  - [ ] relevant outlines
  - [ ] current timeline node
  - [ ] current location
  - [ ] relevant character state
  - [ ] previous section ending
  - [ ] no-go rules
  - [ ] generation target
- [x] Save assembled context to a run folder.

## Milestone 10: Run Records

- [x] Implement run directory creation.
- [ ] Save:
  - [ ] `metadata.yaml`
  - [ ] `context.md`
  - [ ] `prompt.md`
  - [ ] `output-raw.md`
  - [ ] `output-accepted.md`
  - [ ] `check-report.md`
- [x] Implement `quill run list`.
- [x] Implement `quill run show`.
- [x] Implement `quill run accept`.

## Milestone 11: Basic Checks

- [x] Implement `quill check <scene-id>`.
- [x] Add deterministic checks:
  - [x] referenced canon ids exist
  - [x] timeline node exists
  - [x] location exists
  - [x] characters exist
  - [x] route exists from previous location when needed
- [x] Add report format.
- [x] Add placeholder AI-assisted checks:
  - [x] canon conflict
  - [x] OOC
  - [x] style guardrails
  - [x] chapter hook

## Milestone 12: AI Generation MVP

- [x] Add OpenAI-compatible provider config.
- [x] Add local `.env` support.
- [x] Implement `quill generate <scene-id>`.
- [x] Use assembled context and default section-writing prompt.
- [x] Save raw output to run folder.
- [x] Allow manual acceptance into scene file.

## Milestone 13: Example Project

- [x] Add a minimal synthetic example novel.
- [ ] Include:
  - [ ] project config
  - [ ] canon files
  - [ ] two characters
  - [ ] two timeline nodes
  - [ ] two locations and one route
  - [ ] one chapter and one section
- [ ] Add test fixture using this example.

## Milestone 14: Documentation

- [x] Add CLI usage docs.
- [x] Add Obsidian project layout docs.
- [x] Add writing workflow docs.
- [x] Add schema reference.
- [ ] Add contribution guide.

## First Usable Flow

```bash
quill init "My Novel" --vault ./local-vaults
quill canon import ./notes.md --project ./local-vaults/novels/My-Novel
quill character add "Main Character" --project ./local-vaults/novels/My-Novel
quill timeline append "Opening Night" --project ./local-vaults/novels/My-Novel
quill location add "Old Palace" --project ./local-vaults/novels/My-Novel
quill outline add section "Opening scene" --project ./local-vaults/novels/My-Novel
quill scene create --section section-001 --timeline evt-001 --location loc-001 --pov char-001
quill context scene-001
quill generate scene-001
quill check scene-001
quill run accept latest
```
