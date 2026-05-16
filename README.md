# Quillarium

Quillarium is an Obsidian-backed writing system for long-form fiction with heavy AI assistance.

It is designed for novels where continuity matters: canon, character arcs, timelines, locations,
resources, outlines, prompts, generated drafts, and consistency reports should all stay traceable.

Chinese name: 羽笔馆

## Why

Most AI writing tools can generate prose, but long novels fail in quieter places:

- canon drifts after dozens of chapters
- characters become out of character
- time and travel stop making sense
- clothing, wounds, items, and knowledge states mutate between scenes
- generated drafts cannot be traced back to the prompt and context that produced them

Quillarium treats a novel as a structured project, not just a chat transcript.

## Core Ideas

- **Obsidian as storage**: every novel is a folder of Markdown and YAML files.
- **Canon first**: confirmed facts and rules are explicit constraints.
- **Time as a chain**: the main timeline only moves forward; flashbacks reference earlier nodes.
- **Space as a graph**: locations are nodes, routes are edges with distance, access, and travel cost.
- **Characters as evolving states**: each important character has arcs and scene-level state.
- **Every AI run is recorded**: context, prompt, model config, raw output, accepted output, and checks.
- **SillyTavern compatibility where useful**: import/export character cards, lorebooks, and prompt ideas.

## Planned Project Layout

```text
Obsidian Vault/
  novels/
    My Novel/
      project.yaml
      canon/
      characters/
      timeline/
      locations/
      factions/
      resources/
      story-patterns/
      outlines/
      scenes/
      prompts/
      runs/
      exports/
      sillytavern/
```

## Status

Quillarium is at the design/bootstrap stage. The first milestone is a local desktop app that can:

1. create a novel folder in an Obsidian vault
2. import early notes and extract canon, characters, timeline, locations, and outline seeds
3. generate one section from a section outline
4. record the AI run
5. run basic consistency checks

## License

MIT
