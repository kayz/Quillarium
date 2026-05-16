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

- [ ] Add pnpm workspace.
- [ ] Add TypeScript project references.
- [ ] Add packages:
  - [ ] `packages/core`
  - [ ] `packages/cli`
  - [ ] `packages/checks`
  - [ ] `packages/ai`
- [ ] Add Vitest.
- [ ] Add lint/format baseline.
- [ ] Add CI build workflow.

## Milestone 2: Novel Project Skeleton

- [ ] Implement `quill init <title> --vault <path>`.
- [ ] Generate standard folder layout:
  - [ ] `canon/`
  - [ ] `characters/`
  - [ ] `timeline/`
  - [ ] `locations/`
  - [ ] `resources/`
  - [ ] `causality/`
  - [ ] `outlines/`
  - [ ] `scenes/`
  - [ ] `prompts/`
  - [ ] `runs/`
  - [ ] `exports/`
  - [ ] `sillytavern/`
- [ ] Generate `project.yaml`.
- [ ] Generate starter README inside the novel folder.
- [ ] Add tests for folder creation.

## Milestone 3: Markdown and YAML Data Layer

- [ ] Define shared document schema:
  - [ ] `id`
  - [ ] `type`
  - [ ] `schema_version`
  - [ ] `title`
  - [ ] `status`
  - [ ] `tags`
- [ ] Implement Markdown frontmatter parser/writer.
- [ ] Implement safe slug and file naming helpers.
- [ ] Implement project loader.
- [ ] Implement project index builder as JSON cache.
- [ ] Add schema validation with Zod.

## Milestone 4: Canon MVP

- [ ] Define canon item schema.
- [ ] Implement `quill canon add`.
- [ ] Implement `quill canon list`.
- [ ] Implement `quill canon import <file>`.
- [ ] Support canon fields:
  - [ ] `status: draft | confirmed | deprecated`
  - [ ] `strength: hard | soft`
  - [ ] `source: user | ai | imported | historical`
- [ ] Add simple text search over canon.

## Milestone 5: Character MVP

- [ ] Define character schema.
- [ ] Implement `quill character add`.
- [ ] Implement `quill character list`.
- [ ] Implement arc fields by volume and story arc.
- [ ] Implement OOC guardrails.
- [ ] Implement scene state fields:
  - [ ] current location
  - [ ] outfit layers
  - [ ] wounds
  - [ ] carried items
  - [ ] known facts
  - [ ] emotional state

## Milestone 6: Timeline MVP

- [ ] Define event schema.
- [ ] Implement `quill timeline append`.
- [ ] Enforce forward-only chain references.
- [ ] Validate `previous` and `next` links.
- [ ] Support `flashback_reference` without changing main chain.
- [ ] Add `quill timeline check`.

## Milestone 7: Location MVP

- [ ] Define location schema.
- [ ] Define route edge schema.
- [ ] Implement `quill location add`.
- [ ] Implement `quill route add`.
- [ ] Implement location graph index.
- [ ] Add basic reachability check.

## Milestone 8: Outline and Scene MVP

- [ ] Define outline schemas:
  - [ ] book
  - [ ] volume
  - [ ] story arc
  - [ ] chapter
  - [ ] section
- [ ] Implement `quill outline add`.
- [ ] Implement `quill scene create`.
- [ ] Bind scenes to:
  - [ ] section outline
  - [ ] timeline node
  - [ ] location
  - [ ] POV character
  - [ ] participating characters
- [ ] Store prose by section under `scenes/`.

## Milestone 9: Context Assembly

- [ ] Implement `quill context <scene-id>`.
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
- [ ] Save assembled context to a run folder.

## Milestone 10: Run Records

- [ ] Implement run directory creation.
- [ ] Save:
  - [ ] `metadata.yaml`
  - [ ] `context.md`
  - [ ] `prompt.md`
  - [ ] `output-raw.md`
  - [ ] `output-accepted.md`
  - [ ] `check-report.md`
- [ ] Implement `quill run list`.
- [ ] Implement `quill run show`.
- [ ] Implement `quill run accept`.

## Milestone 11: Basic Checks

- [ ] Implement `quill check <scene-id>`.
- [ ] Add deterministic checks:
  - [ ] referenced canon ids exist
  - [ ] timeline node exists
  - [ ] location exists
  - [ ] characters exist
  - [ ] route exists from previous location when needed
- [ ] Add report format.
- [ ] Add placeholder AI-assisted checks:
  - [ ] canon conflict
  - [ ] OOC
  - [ ] style guardrails
  - [ ] chapter hook

## Milestone 12: AI Generation MVP

- [ ] Add OpenAI-compatible provider config.
- [ ] Add local `.env` support.
- [ ] Implement `quill generate <scene-id>`.
- [ ] Use assembled context and default section-writing prompt.
- [ ] Save raw output to run folder.
- [ ] Allow manual acceptance into scene file.

## Milestone 13: Example Project

- [ ] Add a minimal synthetic example novel.
- [ ] Include:
  - [ ] project config
  - [ ] canon files
  - [ ] two characters
  - [ ] two timeline nodes
  - [ ] two locations and one route
  - [ ] one chapter and one section
- [ ] Add test fixture using this example.

## Milestone 14: Documentation

- [ ] Add CLI usage docs.
- [ ] Add Obsidian project layout docs.
- [ ] Add writing workflow docs.
- [ ] Add schema reference.
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
