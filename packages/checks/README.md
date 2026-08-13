# @quillarium/checks

`@quillarium/checks` validates Quillarium scenes and outlines. Deterministic checks inspect local
project relationships and constraints; semantic checks build bounded prompts for optional model
judgment.

## Primary APIs

- `checkTarget(projectRoot, { type, id })`, `checkOutline`, and `checkScene` return a `CheckReport`.
- `checkPlanningCards(projectRoot)` validates enabled planning-card relations, timeline coordinates,
  character and relationship time order, spatial hierarchy, world triggers, foreshadowing triggers,
  and narrative-card completeness. It excludes disabled and issue cards.
- `formatCheckReport` renders a report as Markdown.
- `runSemanticChecks(projectRoot, sceneId, aiInvoke)` runs the `ooc`, `state-drift`, and
  `canon-conflict` semantic checks through a caller-supplied async function.
- `loadSemanticPromptTemplate`, `SEMANTIC_CHECK_TIMEOUT_MS`, `CheckIssue`, `CheckReport`, and the
  semantic callback/types are public. Formatted reports expose `semantic_status` as `not_requested`,
  `completed`, `partial`, or `unavailable` instead of presenting unevaluated checks as pending.

## Minimal Example

```ts
import { checkScene, formatCheckReport, runSemanticChecks } from '@quillarium/checks'

const projectRoot = './writing-workspace/projects/my-novel'
const report = await checkScene(projectRoot, 'scene-opening')

const semanticIssues = await runSemanticChecks(projectRoot, 'scene-opening', async (_prompt) =>
  JSON.stringify({ issues: [] })
)

report.issues.push(...semanticIssues)
console.log(formatCheckReport(report))
```

The injected callback must return JSON shaped as `{ "issues": [...] }`. Semantic timeouts,
callback failures, and invalid structured output become informational issues so callers retain the
deterministic result.

## Boundaries and Tests

The package has no provider dependency and initiates no network request itself. A production
`aiInvoke` may call a network service, but a stub like the example keeps the entire check offline.
Run the package tests with:

```bash
pnpm exec vitest run packages/checks/src
```

Semantic output is advisory model judgment, not a replacement for deterministic validation or
author review. The timeout bounds how long this package waits; it cannot cancel arbitrary work
inside a caller-supplied callback.

The desktop's manual project-wide planning check combines `checkPlanningCards` with an optional
background-AI pass and persists deduplicated findings as issue cards. Persistence and provider calls
belong to the desktop IPC layer, not this package.
