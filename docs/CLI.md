# Quillarium CLI

The CLI is the first working surface for Quillarium. It manages an Obsidian-backed
novel project made of Markdown files with YAML frontmatter.

## Create A Project

First configure your Obsidian vault directory:

```bash
pnpm cli config set-vault ./local-vaults
```

Then create a novel by name:

```bash
pnpm cli init "My Novel" --genre historical-political
```

If no vault is configured, `quill init` attempts to open a system folder picker.
On systems where that is unavailable, run `quill config set-vault <path>` first.

This creates:

```text
<Obsidian Vault>/novels/My Novel/
  project.yaml
  canon/
  characters/
  timeline/
  locations/
  resources/
  causality/
  outlines/
  scenes/
  prompts/
  runs/
  exports/
  sillytavern/
```

## Add Core Data

```bash
pnpm cli canon add "Core Rule" --project "./local-vaults/novels/My Novel" --content "Do not break canon."
pnpm cli character add "Main Character" --project "./local-vaults/novels/My Novel" --role protagonist
pnpm cli location add "Old Palace" --project "./local-vaults/novels/My Novel"
pnpm cli timeline append "Opening Night" --project "./local-vaults/novels/My Novel" --location loc-old-palace
pnpm cli outline add section "Opening Section" --project "./local-vaults/novels/My Novel" --chapter-hook
```

## Create A Scene

```bash
pnpm cli scene create "Opening Scene" \
  --project "./local-vaults/novels/My Novel" \
  --section section-opening-section \
  --timeline evt-opening-night \
  --location loc-old-palace \
  --pov char-main-character \
  --characters char-main-character \
  --chapter-hook
```

## Assemble Context

```bash
pnpm cli context scene-opening-scene --project "./local-vaults/novels/My Novel"
```

## Generate

Set an OpenAI-compatible provider:

```text
QUILL_AI_BASE_URL=https://api.openai.com/v1
QUILL_AI_API_KEY=...
QUILL_AI_MODEL=gpt-4o-mini
```

Then run:

```bash
pnpm cli generate scene-opening-scene --project "./local-vaults/novels/My Novel"
```

Use `--dry-run` to create `context.md` and `prompt.md` without calling a model.

## Check

```bash
pnpm cli check scene-opening-scene --project "./local-vaults/novels/My Novel"
```

The first checker is deterministic: missing references, timeline links, location
references, route existence, and simple scene constraints.
