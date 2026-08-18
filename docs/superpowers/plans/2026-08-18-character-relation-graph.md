# Two-Ring Character Relation Graph Implementation Plan

> **For agentic workers:** Execute inline in this session. User asked to finish the code without further confirmation. Do not commit unless asked. TDD each task.

**Goal:** Replace the hard-drawn whole-cast relationship graph with a resize-safe two-ring ego graph at the selected story time.

**Architecture:** Keep `characterRelationSnapshot` for time membership and the off-graph register. Add `buildCharacterRelationEgoGraph` and `layoutCharacterRelationEgoGraph` in a new module. `CharacterRelationView` draws one SVG whose viewBox equals the pane pixel size.

**Tech Stack:** React, SVG, existing Vitest `renderToStaticMarkup` tests, CSS variables already used by the four themes.

## Global Constraints

- Do not change `starts_at` / `ends_at` semantics (end node is exclusive).
- Do not restyle `CharacterRelationshipPanel` or the create-relation dialog.
- Leave location explorer `graphPositions` in `PlanningViews.tsx`.
- Theme tokens only: `--text-main`, `--text-muted`, `--border`, `--accent`, `--bg-editor`.
- No git commit unless the author asks.

## Files

- Create: `apps/desktop/src/features/planning/character-relation-graph.ts`
- Create: `apps/desktop/src/features/planning/character-relation-graph.test.ts`
- Modify: `apps/desktop/src/features/planning/PlanningViews.tsx` (`CharacterRelationView` only)
- Modify: `apps/desktop/src/features/planning/PlanningViews.test.tsx`
- Modify: `apps/desktop/src/styles.css` (`.relationship-graph*` chips)

---

### Task 1: Ego membership

**Produces:** `buildCharacterRelationEgoGraph`, `resolveEgoCharacterId`

- [ ] Write failing tests in `character-relation-graph.test.ts` for two-hop membership, L1–L1 included, L2–L2 excluded, exclusive end node, absent ego, deterministic parent, ego resolver.
- [ ] Run `pnpm exec vitest run apps/desktop/src/features/planning/character-relation-graph.test.ts` — fail on missing exports.
- [ ] Implement functions. Pass `timeIndex` so the module does not import `PlanningViews.tsx`.
- [ ] Re-run tests — pass.

### Task 2: Pixel layout

**Produces:** `layoutCharacterRelationEgoGraph`

- [ ] Add failing tests: ego at midpoint, L1 radius < L2 radius, L2 near parent angle, size change keeps one coordinate space, duplicate chords offset.
- [ ] Implement concentric layout with chip-border edge endpoints.
- [ ] Re-run tests — pass.

### Task 3: View + CSS

- [ ] Extend `PlanningViews.test.tsx`: no `--graph-x`, no `viewBox="0 0 1000 560"`, node text is name+role, edge text is relation type, layer-2 has faded class, subtitle mentions two rings.
- [ ] Confirm old view fails those assertions.
- [ ] Rewrite `CharacterRelationView` graph to SVG + ResizeObserver default 640×400; click/Shift+Enter select; dblclick/Shift+Enter recenter.
- [ ] CSS for compact chips and layer-2 fade.
- [ ] Run `pnpm exec vitest run apps/desktop/src/features/planning` — all pass.
