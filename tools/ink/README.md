# The nib

Generates the marker mark in `index.html`'s loader and the PNGs in `icons/` (CLAUDE.md §3.15).

`ink.mjs` is the nib model: `stroke()` emits a FILLED outline whose width tapers, swells in the
middle and wobbles slightly along its length — which is what a felt-tip does and what a
constant-width `stroke` attribute cannot. `box()` and `ring()` carry the pen past where it
started, because that overlap is most of what reads as hand-drawn. `blob()` and `sparkle()` are
the ground shadow and the little radiating ticks.

`emit.mjs` draws the mark from those primitives and writes:

- `loader-markup.txt` — the `<svg class="loader-mark">` block pasted into `index.html`, inks as
  CSS custom properties, animation hooks (`.lb`, `.lb2`, `.lb3`, `.lt`) in place.
- `capture-receipt-markup.txt` and `masthead-brand-markup.txt` — the same, for the capture
  sheet's parse-busy receipt (§3.8) and the Today masthead's pig (§3.4).
- `empty-marks.txt` — the `INK_MARKS` object pasted into `index.html`: seven still marks for the
  app's empty states (§3.15). `MARK_BOX` normalises each one on the LARGER viewBox dimension, so
  a wide mark and a tall one take the same room on screen.
- `icon-{192,512}.html` and `icon-64.html` — pages screenshotted at exact size to produce
  `icons/*.png`. One `FRAME` serves both purposes; see §3.11 for why there is no separate
  maskable file.

```sh
node tools/ink/emit.mjs          # writes the four pages + the loader markup
```

Then screenshot each `icon-*.html` at its natural size into `icons/` (any headless browser;
`test/browser`'s Chromium is already on hand), and paste `loader-markup.txt` over the existing
`<svg class="loader-mark">` in `index.html`.

⚠️ **The committed path data is an artefact of this model.** Editing a `d` attribute by hand
leaves the two out of step and there is nothing to catch it — change the drawing here and
re-emit. Nothing else in the app imports this; it is a design tool, not app code.
