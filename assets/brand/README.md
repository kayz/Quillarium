# Quillarium Brand Assets

<p align="center">
  <img src="quillarium-q.png" alt="Quillarium Q app icon" width="112" />
  &nbsp;&nbsp;&nbsp;
  <img src="quillarium-wordmark.png" alt="Quillarium" width="480" />
</p>

The repository keeps two optimized PNG assets for documentation and UI use:

- `quillarium-q.png`: square 512 × 512 app emblem on an opaque warm-ivory tile, used for native
  window and package icons. The mark is deliberately close-cropped, including part of the long
  flourish, so the Q remains recognizable at taskbar size.
- `quillarium-wordmark.png`: 900 × 240 horizontal wordmark, used for visible product titles and
  documentation headers. Its background stays transparent.

The desktop package derives platform-specific ICO and ICNS files from the Q emblem under
`apps/desktop/assets/brand/`. The app places the wordmark directly in the interface without a
bookplate, border, or background fill; dark surfaces use a display-only contrast filter. Native and
accessibility titles remain text, even where the visible title is artwork.

These files are optimized display derivatives of the project-provided transparent source artwork.
Keep the source proportions intact. The wordmark must use `object-fit: contain`; only the app-icon
composition may crop the far end of the Q flourish for small-size legibility.
