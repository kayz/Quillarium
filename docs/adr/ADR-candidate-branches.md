# ADR: Run-Centered Candidate Groups and Explicit Branches

- Status: accepted and implemented
- Date: 2026-08-13
- Scope: generation Runs, candidate comparison, selection, branching, and acceptance

## Context

A chapter scene often needs several alternative drafts. Treating alternatives as chat messages would
make conversation order the fiction data model and blur the boundary between reviewing a draft and
accepting authoritative prose. Quillarium instead keeps the chapter/scene lifecycle as its product
axis and treats every candidate as a complete auditable Run.

SillyTavern's alternative-response and branch interactions were studied only as abstract interaction
patterns at the fixed revision registered in [REFERENCES.md](../REFERENCES.md). Quillarium's code,
metadata, commands, and interface are independent implementations. Source code copied: No.

## Decision

One generation action may create two to eight Runs. All Runs from that action share a
`candidate_group_id`; `candidate_index` gives stable display order. Base candidates use
`branch_id: main`. A new branch receives its own group and branch identifiers and records the source
candidate in `parent_run_id`. Every candidate keeps independent context, prompt, preset, raw output,
check report, and evaluation artifacts.

The lifecycle boundaries are deliberately separate:

```text
generate group -> check candidates -> compare -> select -> explicit accept -> chapter lifecycle
                                      \-> branch -> new candidate group
```

- Selection sets `selected_at` on exactly one Run in the group.
- Selection does not change Run status and does not write scene prose, chapter prose, Canon, timeline,
  character state, foreshadowing, or continuity records.
- Accepting a grouped candidate requires prior selection. Acceptance remains the only operation in
  this flow that writes the candidate into scene and chapter prose.
- Once one group member is accepted, candidate reselection is locked.
- Unselected Runs are retained and remain valid branch parents.

## Recoverable selection

Filesystem APIs cannot atomically replace several metadata files in one primitive. Selection
therefore writes a project-local transaction journal before changing group members. The operation is
idempotent: listing Runs detects a pending journal, reapplies the intended single selection, verifies
that exactly one matching Run is selected, and removes the journal. Concurrent selection attempts
fail closed while a journal exists.

This journal contains no prose or credentials. A crash can leave old and new markers temporarily
mixed on disk, but the next Run read completes the recorded intent before returning data to callers.

## Candidate checks and scores

Deterministic and optional semantic checks consume the candidate's `output-raw.md`, not the current
scene file. `check-report.md` remains the detailed evidence. `evaluation.json` is only a comparison
aid: deterministic and semantic scores begin at 100 and subtract 30 per error, 10 per warning, and 2
per informational finding, with a floor of zero. A semantic score is omitted unless semantic checking
completed or partially completed. Scores never select, accept, rank automatically, or override facts.

## Failure and recovery behavior

All candidate Run directories are created before provider calls begin. If a later provider call
fails, completed candidates and the still-created Run records remain inspectable and retryable; a
desktop refresh or the next CLI command discovers them. Branch generation requires a retained,
non-empty parent output. Run IDs include a random suffix so candidates created in the same second do
not collide.

## Rejected alternatives

- Chat messages or swipe indexes as the primary fiction model: rejected because chapter scenes and
  accepted prose are the authority boundary.
- Selection that automatically accepts or publishes: rejected because review and authority must be
  separate author actions.
- Deleting unselected candidates: rejected because it loses auditability and branch sources.
- Random or probabilistic automatic selection: rejected because identical author actions must have
  deterministic, explainable effects.
- Reusing one Run directory for several outputs: rejected because snapshots, checks, edits, and
  lineage would no longer be independently reproducible.
