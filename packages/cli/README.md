# @quillarium/cli

`@quillarium/cli` assembles the `quill` command tree and connects terminal commands to the core,
checks, AI, and SillyTavern packages. It is the source-run command surface used by `pnpm cli`.

## Primary API

The package has one programmatic export:

```ts
import { buildProgram } from '@quillarium/cli'

const projectRoot = './local-vaults/novels/My Novel'
const program = buildProgram()
await program.parseAsync(['node', 'quill', 'canon', 'list', '--project', projectRoot])
```

`buildProgram()` returns a Commander `Command`. The user-facing groups cover configuration,
projects, structured documents, outlines and scenes, imports, prompts, context, generation, checks,
runs, finalization, manuscript export, and SillyTavern interchange. See the
[CLI guide](../../docs/CLI.md) or run:

```bash
pnpm cli --help
pnpm cli <command> --help
```

## Boundaries and Tests

This package is orchestration, argument parsing, and terminal output; domain APIs live in sibling
packages. Commands modify the project selected by the required `--project` option. `generate` and
`check --semantic` can call an AI endpoint. Deterministic checks, `generate --dry-run`, imports,
exports, indexing, and SillyTavern conversions do not require a network.

CLI tests use temporary vaults and stub `globalThis.fetch` where needed:

```bash
pnpm exec vitest run packages/cli/src
```

When embedding the program, capture or redirect stdout as needed and supply explicit argument arrays
to avoid accidentally acting on the host process's `process.argv`.
