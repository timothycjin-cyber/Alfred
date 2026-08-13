---
name: alfred-verification
description: How to verify a change to Project Alfred's index.html with the local Playwright render loop, plus the harness and probe lessons learned the hard way — negative controls, canvas pixel reads, clock pinning, synthetic-input traps, and the probes that shipped false passes. Read this before writing or extending a verification suite, adding assertions, or trusting a green run.
---

# Project Alfred — the verification loop

## The loop

Local `python3 -m http.server` + Playwright (mock the GViz response, serve Chart.js
locally — the CDN is proxy-blocked): screenshot at 390px & 900px, light **and** dark,
reduced-motion spot check; hand-compute expected figures and assert them; measure
`documentElement.scrollWidth` over repeated toggles whenever anything moves along X.
Every shipped phase was verified this way (23–72 checks each) before merging.

## Harness and probe lessons

These were each paid for by a false pass or a control that fired nothing. **A probe that has
never been seen to fail is not evidence of anything** — run every new assertion as a negative
control against a deliberately broken build before trusting it.

- **Some fixes are only falsifiable on the device.** The render loop can prove a repaint is
  wired and that the class does what it claims, and it cannot reproduce an Android surface
  restore at all. Say which of the two a green suite bought, and keep the device check in the
  verification list — a probe that *cannot* fail is worth exactly as much as a control that
  fires nothing.

- **`let` at the top level of a classic script is a global lexical binding, not a property of
  `window`.** `window.someLet` is `undefined` forever, so any probe reading module state that
  way silently asserts nothing. Evaluate the bare identifier instead.

- **Re-`observe()` without `disconnect()` multiplies every future record.** A watcher helper
  called once per phase left N observers attached, so a two-step sequence read as
  `[true,true,false,false]` against correct code. Any "reset the recorder" helper has to tear
  down the previous one first.

- **Measure targets with the sheet open.** A closed overlay is `scale(0.08)`, so every
  control inside it measures ~8% of its real size. The same trap in reverse: a "wait until
  the transform stops changing" helper returns immediately at the *initial* resting state,
  because two reads of the closed value look settled. Wait for the final state, not for
  stillness.

- **Pass the mutated source to EVERY page the suite opens.** Eleven of twelve negative
  controls silently did nothing because only one section threaded the mutation through —
  the suite reported a clean 168/168 while testing the unmutated file for almost every
  defect. The controls were the only reason this surfaced, which is the whole argument for
  running them: **a control that fires nothing is a finding about the harness, not a pass.**
  And two controls that then fired nothing pointed at genuinely missing probes (a chip
  asserted for contrast but never for being *neutral*; an icon that only renders inside an
  open sheet the scan never opened).

- **Compare canvas buffers, not element screenshots, to prove a chart is unchanged.** An
  element screenshot composites whatever HTML overlays sit on top — here the donut's centre
  total, whose font-weight legitimately changed — so the ring "differed" when only the text
  above it had. `getImageData` is the chart's own paint, and a stronger claim besides.

- **A control that fires nothing is a finding about the probe, not a pass.** The reset that
  keeps the masthead from returning condensed only matters on a round trip through the tab
  where the masthead is *hidden* — the hidden state is what makes the scroll handler bail.
  The suite only ever tested a hop between two visible mastheads, so the control found
  nothing and the real case was untested. The control is the only reason anyone looked.

- **Collect assertions as they run, not at the end of the section.** A trailing
  `push(ck)` means a section that throws discards every check it already ran correctly, so
  a negative control reports "CRASHED" and hides the fact that its actual probes fired.
  Two controls looked far narrower than they were until the results registered eagerly.

- **Advance width is not proof a font loaded.** "August" at 31px measures 93.6px in
  Newsreader and 93.0px in Roboto Flex — near enough that a width probe passes with the
  serif never arriving. Compare the pixels the element paints against the same element
  forced into the other face. (Same family as the `wght`-axis trap: the DOM agrees with the
  CSS, and only the rendering disagrees.)

- **Synthetic mouse input hides every pointerup-vs-click race.** Chromium's `mouse.up()`
  dispatches `pointerup`, `mouseup` and `click` in a single task, so a `setTimeout(…, 0)`
  scheduled in `pointerup` always beats the click in a harness and never does on a finger. A
  control that reintroduces that bug fires nothing until the probe drives the three events as
  separate evaluations with a real macrotask boundary between them. **If a defect is about
  task ordering, the probe has to create the tasks.**

- **A probe that swipes at a control the code has correctly disabled is testing nothing.** The
  pill only accepts pointer events past `--p: 0.4`, and a sparse month makes a document too
  short to scroll that far — so "scroll to 200, then swipe" silently swiped at the page. The
  fix in the harness is to assert the precondition (the pill is lifted), not to raise the number
  and hope. Same shape as measuring a control inside a closed sheet.

- **A click sets the browser's sequential-navigation start point, and `blur()` does not reset
  it.** Any "what does Tab reach first?" probe run after an earlier probe clicked something is
  measuring the tab order from that click, not from the top of the document. Use a fresh page,
  and drive view changes by calling the function rather than clicking the tab.

- **Scrolling to where you already are fires no event.** A probe that scrolls to the bottom when
  the page is already at the bottom asserts against whatever the last handler left behind. Move
  away first, then back.

- **Assert that a chart *painted*, not just that it's configured.** The donut's config,
  arc radii and colours can all be correct while the canvas is blank. Reading pixels back
  (`getImageData`) is the only check that catches it — and sample a segment's *mid-angle*,
  since 12 o'clock is a seam once `spacing` is on.

- **`Math.max` is not a "biggest" assertion.** `x === Math.max(...xs)` passes when every
  value is equal — exactly the shape a dead animation produces. Comparisons meant to prove
  a ranking must be strict (`xs.every((v, i) => i === k || v < xs[k])`), or the probe
  certifies the bug it was written to catch.

- **Playwright scrolls an element into view before clicking it.** Any assertion of the form
  "the page scrolled after I clicked X" is measuring the harness, not the app. Assert where
  the target *landed* instead.

- **A scroll target at the end of the document can't reach the top of the viewport.** The
  page bottoms out first, so "scrolled under the sticky header" is only a fair claim for an
  element with content below it. A probe that ignores the clamp reports a bug in correct
  code — check alignment on a middle element and "in view, scroll maxed" on the last one.

- **A stale overlay still reads correctly.** Asserting a sheet's title after a tap proves
  nothing if the sheet is closed — the text from the last open sits there. Assert the
  overlay is *open* first, then what it says. Same family as `Math.max` not being a
  "biggest" assertion.

- **`mouse.click` takes viewport coordinates and does not scroll.** Geometry read from a
  chart is in page space; on a phone viewport the ring is below the fold and the click
  lands on whatever is at those coordinates instead. `scrollIntoViewIfNeeded()` first, and
  assert the computed point is on screen — otherwise the probe silently tests something
  else. (`page.click(selector)` auto-scrolls, which is why only the hand-computed hits
  broke.)

- **A fixture in sorted order can't test a sort.** The "highest first" check passed against
  data that was already ordered in the sheet. Fixtures for an ordering claim have to be
  shuffled deliberately, or the assertion is about the input.

- **An optimistic row the app didn't write is supposed to disappear.** Simulating "another
  device wrote a row" with `allRows.push()` gets it dropped by the next reconcile —
  correctly, since it's in no pending-write set. Drive the real path: add the row to the
  GViz mock and let `reconcileFromServer()` fold it in.

- **Run a new pixel probe as a negative control before trusting it.** The single-category
  ring-continuity check walked the ring's *mid-band* and passed against the very defect it
  was written for: rounded caps bite a notch out of the **inner** edge while still touching
  at mid-radius. One radius is not a ring — sample inner, mid and outer. A probe that has
  never been seen to fail is not evidence of anything.

- **Pinning a clock in the render loop freezes Chart.js too.** Its animator reads
  `Date.now()`, so a constant stub leaves every arc at circumference 0 — a blank chart that
  config-level assertions pass happily. Pin the *date* with an offset that still advances.
