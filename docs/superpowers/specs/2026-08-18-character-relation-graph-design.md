# 时态人物关系图（两圈中心图）

Date: 2026-08-18  
Status: implemented  
Scope: desktop planning workbench `CharacterRelationView` only

## Problem

The current graph is time-aware and the card model is correct. The drawing is not.

1. People are HTML buttons placed with container percentages. Edges live in an SVG with a fixed `viewBox="0 0 1000 560"`. When the workbench pane changes aspect ratio, lines miss nodes.
2. Every character visible at the current timeline node is placed on one ring. Large casts become unreadable. The author wants an ego graph around the selected person.
3. Person chips are large ovals (`clamp(92px, 18%, 148px)` ellipses) and only show name plus role, wasting space.

This spec does not change `character_relation` fields, time-filter rules, the right-hand character/relation editors, or the location explorer’s `graphPositions` helper.

## Decisions already approved

| Topic            | Choice                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Default view     | Always ego-centric. No “whole cast” mode.                                                                  |
| Depth            | Two hops: center, layer 1 (direct), layer 2 (via layer 1).                                                 |
| Pointer          | Single-click opens the inspector card. Double-click recenters the graph.                                   |
| Node text        | Name + role/identity. Relation type only on the edge.                                                      |
| Same-layer edges | Draw layer-1 ↔ layer-1. Do not draw layer-2 ↔ layer-2.                                                     |
| Layer 2          | Smaller, faded nodes and edges so those ties read as farther / less foreground.                            |
| Layout           | Concentric two rings, one coordinate space.                                                                |
| Time             | Existing slider still chooses the story-time node. Time only changes membership, not the layout algorithm. |

## Time filter (unchanged)

Reuse `characterRelationSnapshot` membership:

- A character is present if they have `introduced_at`, it is not after the current node, and they are not already exited, unborn, or dead at that node.
- A relation is active if `starts_at` is set and not after the current node, `ends_at` is empty or strictly after the current node (the end node is exclusive: at the end node the old phase is gone), both endpoints exist, and both endpoints are present.

The off-graph register under the canvas stays. It still lists people and relations excluded by those reasons. It is not cropped to the two rings.

## Ego graph

Inputs: planning docs, ordered timeline nodes, current time node id, ego character id.

Output:

- `ego`: the character card, plus `present: boolean`
- `layer1`: present characters that share at least one active relation with the ego
- `layer2`: present characters who are not ego, not layer 1, and share at least one active relation with some layer-1 character
- `edges`: active relations whose two ends are one of: ego–L1, L1–L1, L1–L2

A person with a direct active tie to the ego is always layer 1, never layer 2.

If the ego is not present at this time: still emit the ego node with `present: false`, emit no edges, emit empty rings, and keep the chosen ego id. Do not auto-switch to another person.

If two active relations exist between the same pair (data error or overlapping phases), draw both. Offset the second chord slightly along the perpendicular so labels do not sit on one another.

### Layer-2 parent

Each layer-2 node hangs off one layer-1 parent for placement.

Parent = the layer-1 neighbor whose connecting relation has the earliest `starts_at` on the timeline. Tie-break: neighbor character id, then relation id. Same input always yields the same parent.

## Layout

One SVG fills the graph pane. `viewBox` and element size both equal the pane’s current CSS pixel width and height. Nodes and edges use that same user space. `ResizeObserver` recomputes layout when the pane size changes. Do not mix HTML `%` people with a stretched fixed viewBox.

```
center = (width / 2, height / 2)
innerR = 0.28 * min(width, height)
outerR = 0.42 * min(width, height)
```

Pad so chips stay inside the pane (clamp centers to a 24px inset). If `min(width, height)` is below 280px, still draw, but shrink chip font rather than overlapping the slider.

- Ego at `center`, slightly larger chip, full opacity. If `present` is false, use the faded style plus the label `此时未在场` / `Not present at this time`.
- Layer 1: even angles on `innerR`, starting at −90° (top), clockwise, stable order by character id.
- Layer 2: on `outerR`, in a wedge around the parent’s angle. Siblings of the same parent are spaced inside that wedge. If several parents’ wedges would collide, keep parent order and compress spacing; do not jump a child to the opposite side of the ring.

Edges attach to chip borders, not chip centers. Relation type sits at the segment midpoint, nudged perpendicular to the chord. Directed relations keep the existing arrow; mutual relations stay undirected.

Layer 2 visual (theme tokens, not hardcoded fashion colors):

- Node fill/stroke/text at about 55% opacity against `--text-main` / `--border`
- Edge stroke thinner than layer 1, about 40% opacity
- Edge label smaller and muted (`--text-muted`)

Layer 1 and ego stay at full contrast. Layer-1–layer-2 edges use the layer-2 stroke so the outer ring reads as receding.

## Interaction

Two identities:

- **Ego** (`egoId`): who the rings surround. Local to this view, persisted only for the session.
- **Inspector selection** (`selectedTarget`): what the right pane edits. Already owned by `OutlineHome`.

| Action                | Result                                                            |
| --------------------- | ----------------------------------------------------------------- |
| Click a person        | `onSelect({ type: 'character', id })`. Ego unchanged.             |
| Double-click a person | Set ego to that id and `onSelect` that character. Rings relayout. |
| Click an edge         | `onSelect({ type: 'character_relation', id })`. Ego unchanged.    |
| Double-click an edge  | Same as click. Edges never change ego.                            |
| Drag the time slider  | Recompute membership for the same ego.                            |

Keyboard on a focused person node: Enter / Space = select (same as click). Shift+Enter = recenter (same as double-click). Focused edge: Enter / Space = select.

Ego is local graph state. Changing `selectedTarget` from the left card list or the inspector does **not** move ego. Only first mount, double-click, and Shift+Enter do.

On first mount:

1. If `selectedTarget` is a character, that id becomes ego.
2. Else reuse this view’s last ego id if that character still exists.
3. Else the first present character at the current time node (stable sort by id).
4. Else the first character card in the project, shown as not present.

Empty workbench with no timeline nodes: keep the existing “create a time coordinate first” callout. Do not draw empty rings.

Below the graph, keep the current list of **drawn** relation chips (the ones actually on the SVG) as an accessible index. Do not list L2–L2 or inactive relations there; those belong in the off-graph register when they fail the time filter.

## UI copy

Keep the workbench title `时态人物关系` / `Time-aware character relationships`. Replace the subtitle that says the graph “focuses on one point in time” with: the graph is centered on the current person, two rings out, at the selected time.

## Testing

Model tests (pure functions, no DOM):

- Two-hop membership for a fixture with ego, two L1, one L2, and an L2–L2 relation that must not appear
- L1–L1 edge included
- At an exclusive `ends_at` node, the old relation is gone and the replacement is present
- Ego not present → ego in the graph, zero edges
- Layer-2 parent is deterministic under shuffled input order

Layout tests:

- Ego at the pane midpoint
- Mean radius of L1 < mean radius of L2
- After a size change, every node and its incident edge endpoints still share one coordinate space (no residual `1000×560` mapping)

Render tests (`renderToStaticMarkup`):

- Person labels contain name and role, not relation type
- Edge text contains relation type
- Layer-2 nodes/edges carry the faded class
- Markup does not place people with `--graph-x` / `--graph-y` next to a `viewBox="0 0 1000 560"` graph

Existing `characterRelationSnapshot` tests stay green.

## Non-goals

- Force-directed or three-column layouts
- Whole-cast mode or a hop-count control
- Editing relations by dragging nodes
- Changing `starts_at` / `ends_at` semantics
- Touch long-press as a double-click substitute (desktop pointer + keyboard only for v1)
- Restyling `CharacterRelationshipPanel` or the create-relation dialog
