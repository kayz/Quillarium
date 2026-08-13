# ADR: Atomic Finalization Apply

Status: accepted and implemented (2026-08-13)

## Context

A finalized chapter can imply changes to Canon, people and time-scoped state, timeline events,
locations, world entries, resources, foreshadowing, narrative guidance, and tracked issues. These
files are authoritative project truth. Applying a model's prose suggestion directly, or updating
only part of a cross-file change set, can leave the project inconsistent and make the next context
assembly unreliable.

Filesystem APIs do not provide one primitive that atomically replaces an arbitrary set of files.
The product therefore needs an explicit author-authorization boundary plus a recoverable transaction
protocol.

## Decision

Finalization uses this fixed sequence:

```text
review -> author decisions -> validate -> backup/stage -> journal
       -> apply -> reread/verify -> applied audit
```

The review model stores a human-readable `change` for discussion and a separate structured change
set: target family, stable target ID, `create`/`update`, field-level frontmatter merge, and optional
complete Markdown body. Quillarium captures the existing target's SHA-256 after the model response;
it never accepts a model-supplied lock hash. Every proposed impact starts `open`, even if model JSON
claims otherwise. Only an author action can confirm or reject it.

The review also captures the chapter-outline and authoritative chapter-prose hashes. The reviewed
final text must match that prose, and both source hashes must remain unchanged through application
and verification. A later author edit therefore invalidates the review instead of allowing stale
continuity conclusions to land.

Before writing, the core service prepares the whole set and rejects unsupported families, unsafe
IDs, traversal or symlink paths, duplicate targets, stale before hashes, identity changes, invalid
schemas, and missing typed references. Natural-language `change` text is not parsed as a patch.

The service saves every before image and every staged after image before publishing the exclusive
transaction journal at `reviews/apply/<review-id>/report.json`. Targets are replaced atomically one
file at a time. The review session is written last. The service then rereads and validates every
document and hash. Only successful verification changes the audit and review to `applied`.

On any write or verification failure, the service restores every before image in reverse order,
removes targets that were newly created, restores the review session, verifies the rollback, and
archives the failed report. A nonterminal journal left by process interruption is handled by the
same recovery path. Backups remain available for audit and manual recovery.

Desktop and CLI invoke this core service through typed operations. Neither surface can supply an
arbitrary filesystem path.

## Consequences

- Confirming an impact is not the same as applying it.
- A review created by an older version without structured operations remains readable but is not
  executable.
- A concurrent author edit after review causes a conflict before application; it is never silently
  overwritten.
- Successful reports cite the source chapter/scenes, affected project-relative paths, before/after
  hashes, and retained recovery artifacts.
- The protocol provides all-or-restored behavior, not simultaneous multi-file visibility to another
  process during the short apply window.
- Accepted or published prose is not implicitly rewritten and plugins cannot bypass the service.

## Rejected Alternatives

- Parse natural-language suggestions or regular expressions into edits: too ambiguous and unsafe.
- Let the model mark low-risk changes confirmed: it bypasses author authority.
- Write each file immediately after its confirmation: permits partial continuity state.
- Rely only on Git rollback: projects may be standalone, dirty, or not committed; application safety
  must not depend on repository state.
- Delete backups immediately after success: removes the evidence and recovery chain required for
  auditable long-form writing.
