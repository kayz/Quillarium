# Example Novels

This directory contains small, synthetic fixtures used by development and tests. It is not the
default location for projects created by the desktop or workspace APIs.

`minimal/` intentionally preserves a schema-v1 project, legacy `section` outline, and legacy scene
aliases so compatibility readers and context assembly can be tested against an old project without
silently rewriting it. New projects use a direct project-vault under
`<workspace>/projects/<project-id>/`, ProjectConfig v2, and the current
overview/book/volume/part/optional-act/chapter/scene model.

Large copyrighted text should not be committed here. Use minimal synthetic examples.
