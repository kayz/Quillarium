# Task 5 Report: Issues, configs, stale hash, and whole-transaction rollback

## Status

DONE

## Summary

`applyAssistantTurn` now applies selected issues and configuration proposals in the same project lock, after creates/updates and before rewriting `turn.json`. Issues use `createIssue` with `related_docs` empty when the session target is `project`, otherwise `[target.document_id]`. Configs snapshot the live role/bundle, call `applyConfigurationChangePlan(plan, true)`, and mark `applied` with `applied_at`. Rollback restores configs via exported `restoreConfigurationChange` (moved out of `assistant-sessions.ts`), then body before-images, then created files. Stale sha still throws `STALE_ASSISTANT_TURN` (`本轮提案已过期，请重新打开确认。`) before writes. Unselected pending proposals/configs are rejected; selected issues/configs are no longer left pending.

A follow-up covering test proves `restoreConfigurationChange` on the apply path: two configs in one confirm, first applies, second fails on stale hash, first role description restored and both stay pending.

## TDD Evidence

### RED — failing issue write and config apply before implementation

Command:

```powershell
pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts
```

Output (exit code 1):

```
 ❯ packages/core/src/assistant-turn-apply.test.ts (14 tests | 2 failed) 3392ms
     × writes an issue only after confirm 293ms
     × applies a configuration proposal in the same confirm and restores it on later failure 298ms

 FAIL  ... > writes an issue only after confirm
AssertionError: expected [] to have a length of 1 but got +0

 FAIL  ... > applies a configuration proposal in the same confirm and restores it on later failure
AssertionError: expected '把原始资料转成可审阅的规划卡提案。' to be 'A clearer author-reviewed organizer description.'
```

Expected: selected issues not created; selected configs not applied. Multi-create rollback and stale-hash tests already passed (Task 3 leftover-file rollback + Task 2 sha check). Prior 12 tests stayed green.

### GREEN — after issue/config apply + shared restore helper

Command:

```powershell
pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts packages/core/src/creator-assistants.test.ts
```

Output (exit code 0):

```
 Test Files  2 passed (2)
      Tests  26 passed (26)
```

Existing per-item `applyAssistantConfigurationProposal` tests still pass.

### RED — covering test: later config failure without restore

Temporarily disabled `restoreConfigurationChange` in `applyAssistantTurn` rollback (creates/updates still restored). New test planted two setting-organizer `configuration_proposals`; first apply succeeds, second throws `StaleProjectWriteError` (same-target live hash after first write).

Command:

```powershell
pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts -t "restores an earlier applied config"
```

Output (exit code 1):

```
 ❯ packages/core/src/assistant-turn-apply.test.ts (15 tests | 1 failed | 14 skipped) 340ms
     × restores an earlier applied config when a later config apply fails 338ms

 FAIL  ... > restores an earlier applied config when a later config apply fails
AssertionError: expected 'A clearer author-reviewed organizer d…' to be '把原始资料转成可审阅的规划卡提案。'
```

Role description stayed at the first applied value — proves the prior “config + failing specialize” case never exercised restore.

### GREEN — covering test with restore re-enabled

Command:

```powershell
pnpm exec vitest run packages/core/src/assistant-turn-apply.test.ts
```

Output (exit code 0):

```
 Test Files  1 passed (1)
      Tests  15 passed (15)
   Duration  4.75s
```

## Changes

### `packages/core/src/assistant-config-proposals.ts`

- Exported `restoreConfigurationChange` (copy of private `rollbackAppliedConfiguration`): reload live sha after apply, restore `before.value` through `updateCreatorRole` / `updateContextBundle`.

### `packages/core/src/assistant-sessions.ts`

- `applyAssistantConfigurationProposal` now calls `restoreConfigurationChange`.
- Deleted private `rollbackAppliedConfiguration`.

### `packages/core/src/assistant-turn-apply.ts`

- Order inside the lock: stale check → creates → updates → issues → configs → `replaceAgentTurn`.
- Issues: pending `kind === 'issue'` or `MISSING_ASSISTANT_PROPOSAL`; track created path; `applied_document_id`.
- Configs: pending `configuration_proposals` or `MISSING_ASSISTANT_PROPOSAL`; snapshot then `applyConfigurationChangePlan(..., true)`; track restore records.
- Rollback: restore configs (reverse), restore body before-images, delete created paths (issues + world files).
- Return `issue_ids` / `config_ids`; drop the Task 4 keep-pending carve-out.

### `packages/core/src/assistant-turn-apply.test.ts`

- Shared `recordPlantedTurn`; plant helpers now return `proposalIds` / `configIds`.
- `plantContinuityTurn`: book/volume/part/chapter outlines + `continuity-review` workflow input.
- Tests: later-specialize rolls back earlier create; issue written only after confirm; config apply success + failed specialize leaves role/files/pending; stale hash.
- Covering test: two config proposals in one confirm; first role description applies then second fails on stale hash; `restoreConfigurationChange` restores original description; both configs stay pending. Apply order unchanged.

## Commit

- `ae169a5` feat: apply assistant issues and configs in one rollback-safe turn
- `a94721f` test: cover config restore when a later config apply fails

## Self-review

- Spec order creates → updates → issues → configs, `turn.json` last.
- Did not route through `applyAssistantConfigurationProposal` (that writes `turn.json` on its own).
- Continuity fixture required because `setting-organizer` cannot record `issue` proposals.
- Later-config failure covers restore without changing apply order (creates still run before configs).

## Concerns

- No `context_bundle` confirm fixture; only `creator_role` description change.
- Issue success test does not assert `related_docs` or `applied_document_id`.
