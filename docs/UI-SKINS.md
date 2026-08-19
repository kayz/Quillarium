# UI Skin Contract

<p>
  <strong>English</strong> · <a href="UI-SKINS.zh-CN.md">简体中文</a>
</p>

This document defines the `0.3.1` interface-skin boundary. A skin changes presentation only. It
cannot grant capabilities, alter project data, load code, contact a network, or change an AI prompt.

## Compatible identity and storage

The four IDs remain `paper`, `ink`, `mist`, and `bamboo`. They are accepted everywhere an older
global `theme` or project `default_theme` value is read. Project files continue to store only that
compatible ID; user changes to a skin live in machine-local `~/.quillarium/config.json` under
`uiSkins.customizations`.

An old config without `uiSkins` resolves to product defaults in memory. Read, project open, and skin
preview never write a migration. The first explicit save writes one normalized V1 definition for the
selected slot. Reset removes only that slot; customizations in the other three slots remain intact.

## Structured schema

`UISkinDefinitionV1` contains:

- a bounded display name and one of the four stable IDs;
- fourteen six-digit hexadecimal palette values for application, surfaces, text, state colors, and
  top chrome;
- enumerated interface/prose font roles plus a type scale clamped to 90–115%;
- enumerated navigation and detail sides, toolbar alignment, and spacing rhythm; and
- enumerated button shape, treatment, and size.

It intentionally does not contain free-form CSS, HTML, JavaScript, URLs, remote fonts, image paths,
or arbitrary selectors. Main-process normalization owns the final boundary even if a renderer sends
malformed data.

## CSS application

The renderer maps the normalized definition to a compact CSS-token set such as `--bg-panel`,
`--interface-font`, `--skin-panel-radius`, `--skin-button-height`, and
`--skin-toolbar-justify`. Enumerated layout choices become `data-skin-navigation`,
`data-skin-detail`, and `data-skin-button-treatment`; CSS changes grid direction and visual style
without reordering project documents or changing React state ownership.
Resizable split handles invert their physical and keyboard delta when a pane is presented on the
right, so dragging the boundary remains spatially correct after a layout swap.

The four product defaults deliberately differ beyond color:

| Slot     | Visual character        | Layout signature               | Button language |
| -------- | ----------------------- | ------------------------------ | --------------- |
| `paper`  | Warm manuscript desk    | Left navigation, right detail  | Soft solid      |
| `ink`    | Compact night workspace | Left navigation, right detail  | Square tonal    |
| `mist`   | Airy studio blueprint   | Right navigation, right detail | Pill outline    |
| `bamboo` | Editorial green ledger  | Left navigation, left detail   | Soft tonal      |

Language is saved with appearance through the same typed IPC operation but remains global. Selecting
a skin never unexpectedly changes the author's language.

## Configurable component layer

New settings surfaces use four shared primitives:

- `ActionButton` owns semantic tone and skin-driven button geometry;
- `ActionBar` owns action grouping and skin/default alignment;
- `SurfacePanel` owns surface, border, radius, and inset; and
- `FormGrid` owns responsive field columns and gaps.

Existing feature groups retain compatible CSS selectors while they are migrated incrementally, so a
skin affects current actions and panels without a risky all-at-once renderer rewrite. At widths below
860 px, form grids and the editor/preview split collapse to one column; focus-visible treatment and
reduced-motion behavior remain product-owned rather than skin-editable.

## Save and preview semantics

Editing previews the draft on the current document root. Closing Settings without saving reapplies
the persisted skin and density. Save sends skin, density, and language once through
`config:saveAppearance`; legacy three-call display saves are no longer used by the UI. The response is
resolved again and becomes the application state, so the visible result is exactly the bounded data
accepted by the main process.
