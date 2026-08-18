# Quillarium CLI

The CLI manages Quillarium workspaces and direct project-vault roots as Markdown and YAML. The
examples below run the TypeScript entry point from the repository root with `pnpm cli`; the built
binary name is `quill`.

## Quick Start

Install and verify the workspace first:

```bash
pnpm install
pnpm build
pnpm cli --help
```

Start with a workspace that contains `quillarium-workspace.yaml` and a `projects/` directory, then
register it and create a novel:

```bash
pnpm cli config set-workspace ./writing-workspace
pnpm cli init "My Novel" --id my-novel --genre historical-political
```

The project root for this example is itself an Obsidian vault and contains both `.obsidian/` and
`project.yaml`:

```text
./writing-workspace/projects/my-novel
```

The historical `<vault>/novels/<title>` layout remains readable. Explicit `init --vault <path>` is a
legacy compatibility path only; new projects default to the configured workspace.

All commands that operate on a novel require `-p, --project <path>`.

For automation, portable sessions, or isolated tests, set `QUILL_CONFIG_DIR` before running CLI or
desktop commands. Quillarium will read and write `config.json` there instead of the user-level
`~/.quillarium` directory, so test commands cannot alter the normal workspace or legacy-vault
configuration.

## Main Writing Flow

### 1. Add structured material

```bash
pnpm cli canon add "Succession Rule" --project "./writing-workspace/projects/my-novel" --content "Only the elder line may inherit."
pnpm cli character add "Lin Yue" --project "./writing-workspace/projects/my-novel" --role protagonist --ooc "Never breaks an explicit oath"
pnpm cli location add "Old Palace" --project "./writing-workspace/projects/my-novel"
pnpm cli timeline append "Opening Night" --project "./writing-workspace/projects/my-novel" --location loc-old-palace --characters char-lin-yue
pnpm cli outline add overview "Story Purpose" --project "./writing-workspace/projects/my-novel"
pnpm cli outline add book "Book Outline" --project "./writing-workspace/projects/my-novel"
pnpm cli outline add volume "Volume One" --parent <book-id> --project "./writing-workspace/projects/my-novel"
pnpm cli outline add part "Opening Part" --parent <volume-id> --project "./writing-workspace/projects/my-novel"
pnpm cli outline add chapter "Opening Chapter" --parent <part-id> --project "./writing-workspace/projects/my-novel" --chapter-hook
```

Create commands print the created file path. Use the corresponding `list` command to confirm the
generated IDs before referring to them from another document.

Other first-class records include world entries, foreshadowing, references, issues, patterns,
routes, and overview/book/volume/part/act/chapter outlines:

```bash
pnpm cli world add "Granulated Powder" --project "./writing-workspace/projects/my-novel" --trigger powder fire-lance --role constraint --valid-from 1449 --content "The powder ignites only when kept dry."
pnpm cli foreshadowing add "FB-L4-001" --project "./writing-workspace/projects/my-novel" --summary "The old fleet still exists" --expires-at chapter-020
pnpm cli issue add "Decide first-act POV order" --project "./writing-workspace/projects/my-novel" --priority high --due chapter-003
pnpm cli strategy add "Courtroom Pressure" --project "./writing-workspace/projects/my-novel" --category pacing --principle "Every exchange changes leverage" --avoid "Unopposed exposition"
```

The desktop and current import/AI proposal flow create unified `narrative` cards for new style,
structure, pacing, and genre guidance. The source-run CLI does not yet have a `narrative` command; its
`strategy` and `pattern` groups are retained compatibility surfaces and continue to create those
legacy document families.

### 2. Create a scene

The current hierarchy is `book → volume → part → optional act → chapter → scene`. The source-run
CLI retains the option name `--section` for pre-0.2 compatibility, but the value must be the owning
**chapter outline ID**; the created document writes both current `chapter_id` and the readable legacy
alias. Likewise, `--timeline` currently receives the linked timeline-event ID created by
`timeline append`. The desktop exposes the newer explicit timeline-coordinate workflow.

```bash
pnpm cli scene create "Opening Scene" \
  --project "./writing-workspace/projects/my-novel" \
  --section <chapter-id> \
  --timeline evt-opening-night \
  --location loc-old-palace \
  --pov char-lin-yue \
  --characters char-lin-yue \
  --chapter-hook
```

### 3. Select a writing preset, inspect context, and generate

New projects contain and select `presets/default.yaml`. Inspect or select a versioned project preset:

```bash
pnpm cli preset list --project "./writing-workspace/projects/my-novel"
pnpm cli preset show default --project "./writing-workspace/projects/my-novel"
pnpm cli preset select default --project "./writing-workspace/projects/my-novel"
```

Legacy projects without a preset fail generation explicitly. Create/select the default with
`preset init`; no project is silently rewritten during load:

```bash
pnpm cli preset init --project "./writing-workspace/projects/my-novel"
```

`preset create` creates a safe v2 YAML preset, while `preset migrate <id>` performs a dry plan and
`--apply` backs up, writes, and verifies a v1→v2 migration. Preset YAML contains no endpoint or
credential. It binds a connection profile role, portable model overrides, prompt instructions and
block order, ContextPolicy, and check policy.

Print the assembled scene context:

```bash
pnpm cli context scene-opening-scene --preset default --project "./writing-workspace/projects/my-novel"
```

Use `--trace` to print one JSON object containing the rendered Markdown, exact `PromptBlock` values,
and complete `ContextTrace` for the currently configured model. This is read-only and does not call
the provider:

```bash
pnpm cli context scene-opening-scene --trace --project "./writing-workspace/projects/my-novel"
```

Use `--run` to create a run directory and save `context.md`, `prompt-blocks.json`,
`context-trace.json`, and `writing-preset.json`. A generation dry run creates the run and immutable
compiler/preset snapshots plus `prompt.md` without calling a model:

```bash
pnpm cli generate scene-opening-scene --project "./writing-workspace/projects/my-novel" --dry-run
```

After configuring AI credentials, omit `--dry-run` to call the provider and record
`output-raw.md`:

```bash
pnpm cli generate scene-opening-scene --project "./writing-workspace/projects/my-novel"
```

Use `--candidates 3` to create two to eight independent Runs in one request. Every candidate keeps
its own immutable context/preset snapshot, prompt, and output. Add `--parent-run <run-id>` to seed a
new branch group from any retained candidate; if no count is supplied, a branch creates three
candidates:

```bash
pnpm cli generate scene-opening-scene --candidates 3 --project "./writing-workspace/projects/my-novel"
pnpm cli generate scene-opening-scene --parent-run run-example --project "./writing-workspace/projects/my-novel"
```

### 4. Check and accept

The default scene check is deterministic and does not call a model:

```bash
pnpm cli check scene-opening-scene --project "./writing-workspace/projects/my-novel"
```

Outline targets use the same report format:

```bash
pnpm cli check outline-volume-one --type outline --project "./writing-workspace/projects/my-novel"
```

It checks document references, timeline and previous-scene links, locations and routes,
foreshadowing references, world-entry validity, due open issues, and scene constraints. To also run
AI-assisted OOC, character-state drift, and Canon-conflict checks, add `--semantic`:

```bash
pnpm cli check scene-opening-scene --semantic --project "./writing-workspace/projects/my-novel"
```

Semantic findings are additive: deterministic checks still run first. Missing AI configuration,
provider errors, 30-second semantic timeouts, or malformed structured model output are reported as
informational issues instead of discarding the deterministic report. Use `--run <run-id>` to check
that Run's `output-raw.md` rather than the scene file and write `check-report.md` plus
`evaluation.json`. The evaluation uses a documented fixed penalty for deterministic comparison and
includes a semantic score only when semantic checking completed or partially completed. Reports expose `semantic_status` as
`not_requested`, `completed`, `partial`, or `unavailable`; the default command remains successful on
semantic degradation so deterministic results are still usable.

Inspect and accept generated output:

```bash
pnpm cli run list --project "./writing-workspace/projects/my-novel"
pnpm cli run show run-example --file output-raw.md --project "./writing-workspace/projects/my-novel"
pnpm cli run set-output run-example --file ./candidate-prose.md --project "./writing-workspace/projects/my-novel"
pnpm cli check scene-opening-scene --run run-example --project "./writing-workspace/projects/my-novel"
pnpm cli run select run-example --project "./writing-workspace/projects/my-novel"
pnpm cli run accept run-example --project "./writing-workspace/projects/my-novel"
```

`run set-output` loads a non-empty UTF-8 file into `output-raw.md` and marks the run generated. This
supports reviewing prose produced outside the configured provider while retaining the run's original
provider, model, and creation metadata.

`run select` updates only candidate-group metadata and prints that no prose was written. Selection is
recoverable, keeps all unselected candidates, and may be changed until one group member is accepted.

`run accept` copies a non-empty `output-raw.md` to `output-accepted.md`, marks the run accepted, and
accepts the target scene into its chapter and appends it to the independent chapter prose in order.
Grouped candidates must be selected first. Empty or Markdown-formatted output is rejected. Pass `--scene <scene-id>` only when the scene
recorded in run metadata must be overridden.

#### Auditable project planning check

The unified Agent Runtime owns the project-wide planning-integrity review. The check always keeps
its deterministic findings; `--no-semantic` performs no provider call. A semantic execution writes
an auditable parent Run and token-budgeted child batches, but it only returns issue proposals:

```bash
pnpm cli agent check-planning --language zh --project "./writing-workspace/projects/my-novel"
pnpm cli agent check-planning --no-semantic --project "./writing-workspace/projects/my-novel"
pnpm cli agent check-planning --retry-of <execution-id> --language zh --project "./writing-workspace/projects/my-novel"
```

Retry creates a new execution and reruns only failed batches. Creating or updating issue cards is a
separate, explicit two-command handoff. The first command persists a hash-bound author decision and
does not modify project facts; the second consumes that decision through the locked, atomic apply
service:

```bash
pnpm cli agent decide-planning <execution-id> --select <proposal-id-1>,<proposal-id-2> --project "./writing-workspace/projects/my-novel"
pnpm cli agent apply-planning <execution-id> --decision <decision-id> --project "./writing-workspace/projects/my-novel"
```

Rejected, expired, reused, stale, or unauditable decisions fail closed. The CLI only adapts command
arguments and loads the machine-local AI profile; prompt construction, structured-response parsing,
audit persistence, and issue application remain inside the shared runtime and domain service.

The CLI exposes the same finalization review and atomic continuity service as Desktop. First create
and inspect a review, then confirm or reject each impact and resolve or defer every question:

```bash
pnpm cli finalize review-plan --chapter <chapter-id> --draft-file ./draft.txt --final-file ./final.txt --scenes scene-one,scene-two --ai-response '<strict-json>' --project "./writing-workspace/projects/my-novel"
pnpm cli finalize show <review-id> --project "./writing-workspace/projects/my-novel"
pnpm cli finalize confirm <review-id> <impact-id> "Author confirmed" --project "./writing-workspace/projects/my-novel"
pnpm cli finalize confirm <review-id> <impact-id> "Not supported" --reject --project "./writing-workspace/projects/my-novel"
pnpm cli finalize answer <review-id> <question-id> "Author decision" --project "./writing-workspace/projects/my-novel"
```

Only a `ready-to-apply` review can be applied. Each confirmed impact needs an explicit supported
target, stable ID, `create` or `update` operation, and structured frontmatter and/or a complete
Markdown body. Model output cannot confirm itself, and old prose-only impacts fail closed rather
than being guessed into file edits.

```bash
pnpm cli finalize apply <review-id> --project "./writing-workspace/projects/my-novel"
pnpm cli finalize recover --project "./writing-workspace/projects/my-novel"
```

`apply` validates the complete set and before hashes, retains backups and staged after-images,
applies all managed files, rereads them, and prints the durable audit report. A failure rolls every
file and the review session back. `recover` restores any interrupted nonterminal transaction. The
CLI still does not expose the Desktop chapter `draft → final → published` actions or its
two-confirmation publication UI.

### 5. Export accepted prose

```bash
pnpm cli export --format md --project "./writing-workspace/projects/my-novel"
pnpm cli export --format txt --volume outline-volume-one --project "./writing-workspace/projects/my-novel"
```

`--format` accepts only `md` or `txt`; `--volume` accepts a volume-outline ID. The exporter writes a
Markdown and a plain-text artifact under `exports/`, while the selected format controls which path
the CLI reports. Only accepted run output, an accepted-output signal, or a final scene contributes
prose. Skipped scenes are counted and listed as gaps in the export instead of being silently treated
as manuscript text.

## AI Configuration and Credential Security

The CLI loads `.env` and the process environment through these variables:

```text
QUILL_AI_PROVIDER=openai-compatible
QUILL_AI_BASE_URL=https://api.openai.com/v1
QUILL_AI_API_KEY=...
QUILL_AI_MODEL=gpt-4o-mini
QUILL_AI_TEMPERATURE=0.7
QUILL_AI_MAX_TOKENS=2000
QUILL_AI_CONTEXT_WINDOW_TOKENS=128000
```

For DeepSeek V4 Flash, the provider-aware defaults select the current endpoint and model, so the
minimal configuration is:

```text
QUILL_AI_PROVIDER=deepseek
QUILL_AI_API_KEY=...
```

This resolves to `https://api.deepseek.com` and `deepseek-v4-flash`. DeepSeek requests use
non-thinking mode by default so prose and structured semantic output are returned in
`message.content`; callers of the AI package can explicitly opt into thinking mode when needed. The
current official DeepSeek V4 defaults are a 1M-token context window and 384K maximum output. Override
either environment value when a compatible gateway exposes different limits. Provider responses
ending with `finish_reason=length` fail explicitly with `AI_OUTPUT_TRUNCATED`.

The CLI reads connection values from the environment only; it does not read or decrypt saved desktop
AI profiles. The selected WritingPreset is resolved through the same portable resolver used by
Desktop, but its profile role maps to this one CLI environment connection. A key is required for
non-local endpoints. A `localhost` OpenAI-compatible endpoint can run without one. Keep `.env` and
other secret-bearing files out of source control.

The desktop app has separate `prose`, `background`, and `check` profiles. For desktop AI calls,
`QUILL_AI_API_KEY` takes precedence over a saved profile key. Desktop GitHub operations prefer
`QUILL_GITHUB_TOKEN`, then `GITHUB_TOKEN`, then a saved token.

When Electron secure storage is available, desktop credentials are stored as `apiKeyEncrypted` and
`github.tokenEncrypted`; legacy plaintext values are migrated when configuration is loaded. The
renderer receives only availability/status fields and a non-secret token mask, never plaintext or
ciphertext. Empty or masked saves preserve existing credentials; clearing requires the explicit
`clearApiKey: true` or `clearToken: true` IPC input.

If secure storage is unavailable, or plaintext migration cannot be completed, the desktop keeps a
legacy plaintext compatibility fallback and displays a warning. Treat `config.json` as secret in
that mode: do not share it, copy it into a project, or commit it. Encrypted credentials are bound to
the operating-system user context and are not portable CLI credentials.

## Import Markdown

Import a Markdown file or directory:

```bash
pnpm cli import markdown ./notes/blueprint.md --project "./writing-workspace/projects/my-novel"
```

The importer maps English frontmatter and structured Chinese fields when possible, including:

- `类型: 人物` to character
- `类型: 伏笔` to foreshadowing
- `类型: 词条` to world entry
- `类型: 参考资料` to reference
- `类型: 设定集` to Canon
- `类型: 总览 | 总纲 | 卷纲 | 篇纲 | 幕纲 | 章纲 | 节纲` to outline

Markdown without frontmatter is classified from its path, first heading, and early content. Use
`--strategy auto|single|sections`, or force a default type for unstructured notes:

```bash
pnpm cli import markdown ./blueprint.md --strategy sections --project "./writing-workspace/projects/my-novel"
pnpm cli import markdown ./research.md --type reference --project "./writing-workspace/projects/my-novel"
```

The `import ai-plan`, `answer`, `land`, and `show` commands manage reviewable import sessions. The
`ai-plan` command prints a prompt unless a structured `--ai-response <json>` is supplied; it does not
silently call a provider. Landed cards retain `quillarium_origin` metadata with source paths and
SHA-256 values. The desktop uses that provenance to locate changed/missing source files and can ask
the background AI to re-extract exactly one imported card without re-importing neighboring cards.

## SillyTavern Interchange

Import a CCv2/CCv3 JSON card or a PNG Character Card:

```bash
pnpm cli st import-card ./cards/hero.png --project "./writing-workspace/projects/my-novel"
```

The import creates a Quillarium character and preserves the original card JSON under
`sillytavern/`. For PNG input, `ccv3` metadata is preferred over legacy `chara` metadata when both
are present.

Export one character as CCv2 JSON:

```bash
pnpm cli st export-card char-lin-yue --project "./writing-workspace/projects/my-novel"
```

The stable output path is `sillytavern/<character-id>-card-v2.json`.

Export Canon and world entries as SillyTavern World Info JSON:

```bash
pnpm cli st export-lorebook --project "./writing-workspace/projects/my-novel"
```

The output path is `sillytavern/quillarium-world-info.json`. Archived/deprecated Canon and inactive,
archived, or deprecated world entries are retained as disabled World Info entries. Current
interchange does not support CHARX, CCv3 export, or materializing embedded CCv3 assets.

## Command Map

This map mirrors the current Commander tree. Use `--help` on any group or leaf command for arguments
and options.

| Command          | Subcommands or purpose                                                               |
| ---------------- | ------------------------------------------------------------------------------------ |
| `workspace`      | `list`, `create-project`                                                             |
| `config`         | Workspace configuration plus explicit legacy-vault compatibility                     |
| `init`           | Create/register `projects/<id>`; `--vault` is legacy-only                            |
| `preset`         | `init`, `list`, `show`, `select`, `create`, `migrate`                                |
| `canon`          | `add`, `import`, `list`, `search`                                                    |
| `character`      | `add`, `list`                                                                        |
| `foreshadowing`  | `add`, `list`                                                                        |
| `world`          | `add`, `list`                                                                        |
| `reference`      | `add`, `list`                                                                        |
| `issue`          | `add`, `list`                                                                        |
| `strategy`       | `add`, `list`                                                                        |
| `pattern`        | `add`, `list`                                                                        |
| `timeline`       | `append`, `list`, `check`                                                            |
| `location`       | `add`, `list`                                                                        |
| `route`          | `add`                                                                                |
| `outline`        | `add`, `list`; new levels are `overview`, `book`, `volume`, `part`, `act`, `chapter` |
| `scene`          | `create`, `list`; `--section` is the compatibility spelling for owning chapter ID    |
| `index`          | Rebuild the project index                                                            |
| `export`         | Export accepted manuscript prose; format `md` or `txt`, optional `--volume`          |
| `prompt`         | `init`, `show`                                                                       |
| `import`         | `markdown`, `ai-plan`, `answer`, `land`, `show`                                      |
| `context`        | Assemble scene context; optional `--run`                                             |
| `generate`       | Generate a scene; optional `--dry-run`                                               |
| `check`          | Scene/outline checks via `--type`; scenes allow `--semantic`; optional `--run`       |
| `agent`          | Auditable `check-planning`, `decide-planning`, and `apply-planning` lifecycle        |
| `st`             | `import-card`, `export-card`, `export-lorebook`                                      |
| `finalize`       | `review-plan`, `show`, `confirm`, `answer`, `apply`, `recover`                       |
| `chapter-plan`   | Build ordered scene-writing prompts for a chapter                                    |
| `run`            | `list`, `show`, `set-output`, `accept`                                               |
| `help [command]` | Display help for a command                                                           |

For example:

```bash
pnpm cli st --help
pnpm cli st import-card --help
pnpm cli check --help
pnpm cli export --help
```

The Commander help text is the executable contract. Where a retained flag name says `section`, the
current document model and desktop labels still use `scene`/“节” under a chapter.
