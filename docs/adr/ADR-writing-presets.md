# ADR: Portable Versioned Writing Presets and Immutable Run Snapshots

- Status: Accepted and implemented
- Date: 2026-08-13
- Decision owners: Quillarium maintainers
- Related decisions: [Deterministic Context Activation](ADR-context-activation.md)
- Related research: [Design References](../REFERENCES.md)

## Context

Machine-local AI profiles are necessary for endpoints and credentials, but they do not fully explain
why a run used a particular model, prompt stack, context budget, or check strategy. Putting those
portable decisions only in global configuration would make projects difficult to version, share, and
reproduce. Copying a whole connection profile into the project or run would leak secrets and local
paths.

## Decision

Each project may select one versioned, pure-data `WritingPreset` from `presets/<id>.yaml`. Schema v2
contains:

- stable preset ID, semantic version, title, and description;
- a machine-local connection-profile role plus optional provider/model/temperature/output-token and
  exact-tokenizer overrides;
- system prompt, ordered user instructions, and one complete ordering of all supported PromptBlock
  kinds;
- deterministic ContextPolicy; and
- deterministic/semantic check policy.

Presets cannot contain executable code, endpoints, credentials, or filesystem paths. Desktop and CLI
invoke the same resolver. Desktop supplies its encrypted machine-local profile; CLI supplies its
environment connection. A provider override changes the default provider endpoint in memory but the
endpoint is never written into the preset or snapshot.

Every generation or dry run records `preset_id`, `preset_version`, and `preset_sha256` in
`metadata.yaml`, and atomically creates immutable `writing-preset.json`. The snapshot includes the
resolved portable model values, exact prompt stack/policy, project-relative source path, source-file
SHA-256, and a canonical content SHA-256. Loading verifies its schema, relative path, sensitive-field
absence, and hash. Generation also verifies that the run metadata, AI configuration, ContextTrace,
and snapshot identities agree.

Updating a preset affects only future runs. Old runs use their stored snapshot. Schema-v1 files are
normalized in memory without a write; explicit migration performs plan → backup → apply → verify.
Missing selections, missing files, unsupported schemas, and identity mismatches fail with explicit
errors rather than silently selecting defaults. Current project creation writes and selects a
default preset; legacy projects receive an explicit Desktop/CLI initialization action.

## Rejected Alternatives

- Store credentials or endpoints in presets: rejected because projects and runs are versioned data.
- Resolve only by preset ID at replay time: rejected because later edits would change old runs.
- Silently create or select a preset during generation: rejected because loading old projects must not
  rewrite them and fallback would hide the actual input.
- Allow arbitrary scripts or command hooks: rejected because a preset is declarative configuration,
  not an extension system.
- Duplicate resolvers for Desktop and CLI: rejected because equal portable inputs must have identical
  semantics even though credential sources differ.

## Consequences

- Project generation behavior is portable and reviewable without exposing connection secrets.
- Preset changes are ordinary Git-visible project changes, while run replay remains stable.
- Legacy projects must initialize a preset once before creating a new generation run.
- Candidate grouping and branching can later reference the same immutable preset identity without
  changing this contract.

This is an independent Quillarium implementation. No external source code, comments, prompts, or UI
assets were copied.
