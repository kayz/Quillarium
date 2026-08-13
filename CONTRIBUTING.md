# Contributing

Quillarium is an early-stage open source project. Contributions should keep the
core principle intact: user novel data belongs to the user and should remain
plain files in an Obsidian-compatible folder.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm test:coverage
pnpm lint
pnpm format:check
pnpm desktop:build
pnpm audit --prod --audit-level=high
pnpm cli --help
pnpm desktop:dev
```

## Guidelines

- Keep durable project data in Markdown/YAML files.
- Treat generated indexes and build outputs as disposable.
- Do not make user writing public by default.
- Prefer deterministic checks before AI-assisted checks.
- Keep UI calm and writing-focused.

## Pull Requests

- Explain the workflow affected by the change.
- Include tests for core data behavior.
- Run build, test, lint, format check, and the desktop build before submitting changes that affect
  shared types or the Electron application. `pnpm check` remains the short build-and-test gate.
- Follow [docs/RELEASING.md](docs/RELEASING.md) for version delivery. Never move, reuse, or rerun a
  failed version tag.
