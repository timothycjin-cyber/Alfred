import { stroke, box, ring, blob, sparkle, rnd } from './ink.mjs';
import fs from 'fs';

// Same nib as the canvas, emitted twice: once with CSS-variable inks for
// index.html, once with literal inks for the PNG render.
// NIB is the bar outline's width, and everything else in the mark is derived
// from it so the whole drawing thins together — a thinner bar beside an
// unchanged baseline reads as two different pens.
// ⚠️ The sienna fill's inset is derived, not a constant. box() centres its
// stroke on the rectangle, so the outline's INNER edge sits NIB/2 inside the
// path; a fixed inset that cleared a 13-unit nib leaves a bare sliver of
// background between fill and outline once the nib is thinner.
function art({ ink, accent, anim, ground = true, nib = 10.5 }) {
  const P = (d, f, cls) => `<path d="${d}" fill="${f}"${cls ? ` class="${cls}"` : ''}/>`;
  const pad = nib / 2 + 0.5;
  const bar = (cls, x1, y1, x2, y2, seed, fill) => {
    const inner = (fill ? P(slab(x1 + pad, y1 + pad + 1, x2 - pad, y2 - pad), fill) : '')
      + P(box(x1, y1, x2, y2, { w0: nib, seed }), ink);
    return anim ? `<g class="${cls}">${inner}</g>` : inner;
  };
  const slab = (x1, y1, x2, y2) => `M ${x1} ${y1} L ${x2} ${y1 - 1} L ${x2 + 1} ${y2} L ${x1 - 1} ${y2 + 1} Z`;
  return [
    // The ground shadow is ink-coloured, so on a dark ground it inverts into a
    // pale puddle. The icon always sits on paper and keeps it; the loader,
    // which has to work in both themes, is grounded by the baseline alone.
    ground ? P(blob(252, 416, 104, 9, 5), ink) : '',
    P(stroke([[98, 392], [252, 396], [414, 390]], { w0: nib * 1.42, w1: nib * 0.95, seed: 2 }), ink),
    // FOUR bars, as the CSS loader this replaced always had. 56 wide on a
    // 24 gap, ascending, sienna on the last — the same arrangement, redrawn.
    // ⚠️ Resting heights are 110/150/190/230, not 88/142/184/230. A DRAWN bar
    // cannot squash as far as a filled one: at 34% the 88-tall bar's top and
    // bottom strokes (15 units each) met in the middle and it read as a blob.
    // Taller shortest bar + a 0.5 floor keeps an interior at every frame.
    bar('lb', 110, 278, 166, 388, 3),
    bar('lb lb2', 190, 238, 246, 388, 7),
    bar('lb lb3', 270, 198, 326, 388, 11, null),
    bar('lb lb4', 350, 158, 406, 388, 17, accent),
    ...sparkle(398, 112, 26, nib * 0.62, 4, 2, 1.05).map((d) => P(d, ink, anim ? 'lt' : '')),
    P(blob(92, 252, nib * 0.57, nib * 0.57, 9), ink),
    P(blob(112, 206, nib * 0.42, nib * 0.42, 13), ink),
  ].join('');
}


/* The app icon: a piggy bank taking a coin. A different subject from the
   loader's bars on purpose — the tile has to say "money" to someone who has
   never opened the app, which three bars do not (CLAUDE.md §3.15).
   d = 1 strips the detail that turns to mush below ~48px and fattens what is
   left, so the silhouette survives instead of going grey. */
/* ⚠️ The coin takes its OWN ink, and that ink does not flip with the theme.
   Everywhere else in the drawing the ink sits on the page, so it has to invert
   to warm-white on dark. The coin's `$` and outline sit on the COIN — a
   saturated fill the drawing carries with it — so their ground never changes,
   and inverting them would put warm-white on gold at about 1.8:1. The rest of
   the pig would look right and the one element that says "money" would go
   blank. Same rule as the tokens that read on two grounds, applied backwards:
   an element whose ground travels with it needs ONE value, not two. */
function pig({ ink, coin, coinInk, d = 2, ground = true, wash = true,
  washStops = ['#FBE9E3', '#F6D4C8', '#F0C0B1'] }) {
  const P = (dd, f) => `<path d="${dd}" fill="${f}"/>`;
  const w = d > 1 ? 1 : 1.45;          // one nib size for the whole small variant
  const lw = d > 1 ? 1 : 1.15;         // legs are a shape; they do not take the nib scale
  const R = rnd(919);
  const j = (a) => (R() - .5) * a;

  // Inverted-triangle legs. A tapered STROKE would work but keeps a rounded
  // cap, which reads as a stick with a fat top; a real wedge ends in a point
  // and reads as a leg. Slightly bowed sides so it stays drawn, not vector.
  const leg = (x, y0, y1, wTop, wBot) => {
    const my = (y0 + y1) / 2;
    return `M ${x - wTop / 2 + j(4)} ${y0 + j(3)}`
      + ` L ${x + wTop / 2 + j(4)} ${y0 + j(3)}`
      + ` Q ${x + wBot / 2 + wTop / 5 + j(2)} ${my} ${x + wBot / 2 + j(2)} ${y1 + j(2)}`
      + ` L ${x - wBot / 2 + j(2)} ${y1 + j(2)}`
      + ` Q ${x - wBot / 2 - wTop / 5 + j(2)} ${my} ${x - wTop / 2 + j(4)} ${y0 + j(3)} Z`;
  };

  // A spring, not a flat spiral: a prolate cycloid, which is what a coil looks
  // like from the side. ⚠️ The loops only close when the advance per turn is
  // less than the loop's own width — PITCH * 2π < 2 * RAD. At PITCH 4 / RAD 12
  // that is 25 < 24... so PITCH is 3.4: 21 < 24, and the curve crosses itself
  // twice. Raise the pitch and it silently relaxes into a wave.
  const spring = () => {
    const PITCH = 3.4, RAD = 12, TURNS = 2, x0 = 144, y0 = 296;
    const pts = [[152, 298]];
    const steps = 54;
    for (let i = 0; i <= steps; i++) {
      const a = (Math.PI * 2 * TURNS * i) / steps;
      pts.push([x0 - (PITCH * a - RAD * Math.sin(a)), y0 - RAD * Math.cos(a) * 0.92]);
    }
    return stroke(pts, { w0: 12, w1: 4.5, belly: 0, seed: 51, wob: .35 });
  };

  // The $ on the coin, drawn with the same nib: the S in one stroke, the bar
  // through it in another. Ink, not paper — ink on sienna clears ~4.3:1 where
  // a knockout in the paper colour clears ~3.9:1, and it keeps the drawing to
  // two colours.
  const dollar = () => [
    stroke([[271, 117], [252, 114], [248, 125], [262, 130], [268, 140], [252, 148], [243, 143]],
      { w0: 7, w1: 5.5, belly: .06, seed: 83, wob: .4 }),
    stroke([[259, 108], [258, 155]], { w0: 5.5, w1: 5, belly: 0, seed: 87, wob: .3 }),
  ];

  // ⚠️ The body arc STOPS either side of the snout instead of running behind
  // it. Drawn as a full ring, the body's right edge cuts a chord straight
  // across the snout. The gap (±0.36 rad) is where the ellipse meets the snout
  // circle, so the two ends land ON it and read as a join rather than a hole.
  // Re-derive this if either shape moves.
  const GAP = 0.36;

  // Pink undertone. ONE gradient in userSpaceOnUse across both shapes, so the
  // body and the snout share a single ramp and their overlap has no seam —
  // two objectBoundingBox gradients would each restart and show the join. It
  // is a tint of the sienna, not a new hue: a true pink would be the icon's
  // third colour. Inset 4 units so it never peeks past the ink outline.
  // ⚠️ The stops are a PARAMETER, not literals, because the wash has to read
  // on two grounds. The icon is a PNG on paper and takes the pinks directly.
  // In-app the ink is warm-WHITE on dark, and warm-white on pale pink has
  // almost no contrast — the outline stops doing its job and the pig reads as
  // a blob. The masthead therefore passes CSS custom properties that flip to a
  // warm DARK ramp under prefers-color-scheme: dark (§3.15).
  const washDefs = `<defs><linearGradient id="pigWash" gradientUnits="userSpaceOnUse" x1="250" y1="196" x2="278" y2="372">
      <stop offset="0" stop-color="${washStops[0]}"/><stop offset="0.55" stop-color="${washStops[1]}"/><stop offset="1" stop-color="${washStops[2]}"/>
    </linearGradient></defs>`;

  const out = [
    // Both the ground shadow and the pink wash are ICON-only. The shadow is
    // ink-coloured and inverts into a pale puddle on the dark theme; the wash
    // is a fixed tint that would be the only non-two-colour mark in the app's
    // chrome. In-app the pig is drawn without either (CLAUDE.md §3.15).
    wash ? washDefs : '',
    ground ? P(blob(254, 412, 112, 10, 5), ink) : '',
    // ⚠️ Inset 6 and jitter 0.02, not the blob default 0.05 — at 5% the fill's
    // own wobble can push past the ink outline's inner edge and show a pink
    // fringe outside the drawing.
    wash ? P(blob(250, 284, 110, 78, 33, 26, .02), 'url(#pigWash)') : '',
    wash ? P(blob(370, 288, 26, 22, 43, 26, .02), 'url(#pigWash)') : '',
    // ⚠️ The wedges start at the body's OUTLINE (y ~358 at these x), not
    // inside it. The body has no ink fill, so a leg whose top sits in the
    // belly shows through as a black skirt rather than as two legs. And the
    // width is a shape, not a stroke — it takes its own small-size bump
    // (1.15), not the nib's 1.45, which turned them into a single black mass
    // at 40px.
    P(leg(198, 350, 406, 32 * lw, 10 * lw), ink),
    P(leg(306, 350, 406, 32 * lw, 10 * lw), ink),
    P(ring(250, 284, 116, 84, { w0: 16 * w, w1: 14 * w, seed: 31, a0: GAP, turns: 1 - GAP / Math.PI }), ink),
    P(stroke([[272, 210], [288, 164], [330, 194], [298, 216]], { w0: 14 * w, w1: 11 * w, seed: 35 }), ink),
    P(ring(370, 288, 31, 27, { w0: 13 * w, w1: 11 * w, seed: 41, a0: -1.2 }), ink),
    P(stroke([[228, 206], [288, 200]], { w0: 15 * w, w1: 13 * w, seed: 45, wob: .5 }), ink),
  ];
  if (d > 1) {
    out.push(P(spring(), ink));
    out.push(P(blob(312, 244, 9, 10, 55), ink));
    out.push(P(blob(362, 284, 6, 7, 59), ink), P(blob(380, 286, 6, 7, 61), ink));
  }
  // The coin is the only saturated colour, and the only reason the tile reads
  // as money rather than as an animal. It never simplifies away.
  out.push(P(blob(258, 132, 31, 31, 67), coin));
  out.push(P(ring(258, 132, 31, 31, { w0: 10 * w, w1: 8 * w, seed: 71 }), coinInk));
  if (d > 1) out.push(...dollar().map((x) => P(x, coinInk)));
  // The ticks sit BESIDE the coin, on the page — so they keep the page's ink
  // and flip with the theme like everything else.
  if (d > 1) out.push(...sparkle(340, 128, 26, 8, 77, 2, 1.1).map((x) => P(x, ink)));
  return out.join('');
}

const VB = '79 83 341 328';   // measured from getBBox() + 6 units of air   // tight to the art, so it scales without dead margin
// ⚠️ The viewBox does NOT change with the rendered size — the art keeps its
// coordinates and the svg box scales it. That is also why the bounce's
// translate stays in user units and needs no adjustment here.
fs.writeFileSync('loader-markup.txt',
  `<svg class="loader-mark" viewBox="${VB}" width="110" height="106" aria-hidden="true">`
  + art({ ink: 'var(--loader-ink)', accent: 'var(--sienna)', anim: true, ground: false }) + '</svg>');

/* ONE framing, and it is circle-safe.
   ⚠️ Measure the furthest INK PIXEL from the art's centre, never the bbox
   corner. The pig is a rounded silhouette and reaches nowhere near its own
   corners: the bbox corner is 226.7 units out, the furthest drawn pixel only
   192.1. Sizing against the corner shrank the maskable file for nothing AND
   said nothing about the file that actually got clipped.
   A launcher applies its mask to whatever icon it picks — including a
   `purpose: "any"` one. So there is no full-bleed framing to be had here: the
   art is scaled once, to sit inside the mask, and BOTH purposes are declared
   on the one file.
   0.97 puts the furthest pixel at ~186 — inside the spec's 205-unit safe
   radius (a circle of 80% diameter) with margin for launchers that crop
   harder than the guarantee. Re-derive it by rasterising the art and reading
   pixels, not from getBBox(). */
const FRAME = 0.97;
const ART_CENTRE = { x: 248.5, y: 259 };
const page = (size, detail) => `<!doctype html><meta charset="utf-8">
<body style="margin:0"><svg width="${size}" height="${size}" viewBox="0 0 512 512" style="display:block;background:#FFFCF8">
<g transform="translate(256 256) scale(${FRAME}) translate(${-ART_CENTRE.x} ${-ART_CENTRE.y})">
${pig({ ink: '#12100E', coin: '#E3A21C', coinInk: '#12100E', d: detail })}
</g>
</svg></body>`;

for (const s of [192, 512]) fs.writeFileSync(`icon-${s}.html`, page(s, 2));
// The browser tab renders at 16-32px. Downscaling the 192 there mushes the
// tail, eye and nostrils into grey; the stripped variant (d=1) keeps the
// silhouette and the coin, which is all that survives at that size anyway.
fs.writeFileSync('icon-64.html', page(64, 1));
console.log('emitted');

/* The capture sheet's parse-busy mark: the receipt from the same exploration,
   printing itself. No paper fill and no ground shadow — both are ink- or
   white-coloured and invert badly on the dark theme, and the sheet behind it
   is already a surface (CLAUDE.md §3.15). */
function receipt({ ink, accent }) {
  const P = (d, f, cls) => `<path d="${d}" fill="${f}"${cls ? ` class="${cls}"` : ''}/>`;
  const slab = (x1, y1, x2, y2) => `M ${x1} ${y1} L ${x2} ${y1 - 1} L ${x2 + 1} ${y2} L ${x1 - 1} ${y2 + 1} Z`;
  const L = 150, R = 362, T = 92, B = 356, teeth = 8;
  const zig = [];
  for (let i = 0; i <= teeth; i++) zig.push([R - ((R - L) * i) / teeth, i % 2 ? B + 22 : B]);
  const outline = [[L + 2, 150], [L, T + 12], [L + 12, T], [R - 12, T + 3], [R, T + 14], [R, B - 2],
    ...zig.slice(1), [L, B - 30], [L + 2, 200]];
  const rules = [[[184, 156], [326, 152]], [[184, 200], [296, 197]], [[184, 244], [318, 241]]];
  return [
    P(stroke(outline, { w0: 15, w1: 13, seed: 111 }), ink),
    ...rules.map((pts, i) =>
      `<g class="cr-rule cr-r${i}">${P(stroke(pts, { w0: 10, w1: 8, seed: 101 + i * 2, wob: .5 }), ink)}</g>`),
    `<g class="cr-total">${P(slab(182, 286, 330, 320), accent)}${P(box(182, 286, 330, 320, { w0: 10, seed: 109 }), ink)}</g>`,
  ].join('');
}
fs.writeFileSync('capture-receipt-markup.txt',
  '<svg class="capture-receipt" viewBox="138 80 240 300" width="94" height="118" aria-hidden="true">'
  + receipt({ ink: 'var(--loader-ink)', accent: 'var(--sienna)' }) + '</svg>');
console.log('capture receipt emitted');

/* The Today masthead's brand mark — the ICON's drawing, at full detail: tail,
   eye, nostrils and the $ on the coin, over the pink wash.
   ⚠️ The ONE thing it does not take from the tile is the ground shadow. That
   shadow is drawn in the ink colour, and on the dark theme the ink is
   warm-WHITE — so it renders as a pale smear under the feet rather than a
   shadow. A shadow cannot be darker than a near-black surface; there is no
   value that works, which is why this is a drop and not a re-tint.
   viewBox is therefore tight to the art WITHOUT the shadow. */
fs.writeFileSync('masthead-brand-markup.txt',
  '<svg class="masthead-pig" viewBox="86 90 326 326" width="44" height="44" aria-hidden="true" focusable="false">'
  + pig({ ink: 'var(--loader-ink)', coin: 'var(--coin)', coinInk: 'var(--coin-ink)',
          d: 2, ground: false, wash: true,
          washStops: ['var(--pig-wash-1)', 'var(--pig-wash-2)', 'var(--pig-wash-3)'] })
  + '</svg>');
console.log('masthead brand emitted');

/* ── The empty-state marks ───────────────────────────────────────────────────
   Seven subjects for the app's blank moments — the places that used to be one
   line of grey text. They are a different job from the three marks above: the
   loader, the receipt and the pig all say "something is happening" or "this is
   Alfred", and these say "there is nothing here". So they are STILL, with no
   animation at all. Nothing to stagger, no keyframes to keep symmetric.

   Same nib rules as everything else (CLAUDE.md §3.15): filled tapered paths,
   never a stroke; exactly one sienna path per mark, and it is always the part
   that carries the meaning (the arrow, the seal, the sand) rather than a
   decorative tint. No ground shadow — these sit in both themes, and the
   shadow is ink-coloured, so it inverts into a pale puddle on dark. No pink
   wash either: that is the icon's and the masthead pig's alone. */
function emptyMarks() {
  const INK = 'var(--loader-ink)', ACC = 'var(--sienna)';
  const P = (d, f) => `<path d="${d}" fill="${f}"/>`;

  // A triangle with bowed sides. blob() only makes rounded lumps and stroke()
  // only makes lines, so an arrowhead — the one shape both of those miss —
  // gets its own primitive here rather than a fourth case inside ink.mjs.
  const tri = (a, b, c, seed = 1) => {
    const R = rnd(seed * 733), j = (m) => (R() - .5) * m;
    const mid = (p, q) => [(p[0] + q[0]) / 2 + j(7), (p[1] + q[1]) / 2 + j(7)];
    const m1 = mid(a, b), m2 = mid(b, c), m3 = mid(c, a);
    const f = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    return `M ${f(a)} Q ${f(m1)} ${f(b)} Q ${f(m2)} ${f(c)} Q ${f(m3)} ${f(a)} Z`;
  };

  const marks = {};

  /* Failed load. A cloud that could not deliver — and the mark that finally
     retires the ⚠️ emoji, which was the last one left in the DOM. An emoji is
     coloured by the OS font, so it was the one glyph in the app the theme
     could not reach (CLAUDE.md §3.2). */
  marks.cloud = {
    vb: '110 172 290 248',
    body: [
      P(stroke([[168, 300], [136, 294], [124, 270], [142, 248], [168, 244],
        [172, 214], [200, 192], [236, 194], [256, 212],
        [278, 186], [318, 186], [344, 210], [346, 242],
        [372, 250], [384, 272], [372, 294], [344, 302],
        [280, 305], [212, 304], [172, 301], [152, 298]], { w0: 15, w1: 13, seed: 201 }), INK),
      // One path, not a shaft plus a head: two sienna paths would read as two
      // accents, and the accent here is the arrow as a single thing.
      P('M 244 312 Q 256 310 269 312 L 268 358 Q 284 356 300 355 '
        + 'Q 278 382 257 406 Q 235 381 214 356 Q 229 357 245 358 Z', ACC),
    ].join(''),
  };

  /* First run, no personal link. A sealed letter addressed to one person —
     which is what a ?user= link is. The seal is the sienna. */
  marks.envelope = {
    vb: '126 184 262 182',
    body: [
      P(box(140, 196, 372, 344, { w0: 15, seed: 211 }), INK),
      P(stroke([[140, 198], [190, 232], [256, 278], [322, 232], [372, 198]],
        { w0: 14, w1: 12, seed: 215, wob: .6 }), INK),
      P(blob(256, 278, 19, 19, 223), ACC),
    ].join(''),
  };

  /* No expenses logged this month (Trends donut). An empty shopping bag.
     ⚠️ This was a wallet for two drafts and the wallet did not survive: a
     rectangle with a band and a clasp dot is the ENVELOPE's silhouette with
     the flap flattened, and at 60px the two were the same drawing. The arch
     handle is a shape nothing else in the set has. A bag is also the better
     noun — a wallet is about holding money, a bag is about having spent it,
     and this mark stands in for "nothing spent". */
  marks.bag = {
    vb: '150 172 214 230',
    body: [
      P(stroke([[210, 250], [212, 206], [244, 188], [288, 192], [302, 222], [304, 250]],
        { w0: 12, w1: 11, seed: 237, wob: .5 }), ACC),
      P(box(166, 248, 346, 384, { w0: 15, seed: 231 }), INK),
      P(stroke([[168, 284], [346, 280]], { w0: 11, w1: 9, seed: 235, wob: .5 }), INK),
    ].join(''),
  };

  /* Nothing logged — the day sheet, and the first-run ledger. An open box with
     its flaps up and nothing in it. Shared by two states on purpose: both mean
     "no entries", one for a day and one for the whole ledger, and inventing a
     second subject for the same sentence is how a small cast turns into a
     clip-art set. */
  /* ⚠️ The tub is box(), NOT a four-point stroke(). stroke() runs its points
     through chaikin twice, which rounds every corner away — the first draft's
     tub smoothed into a U and the whole mark read as a cereal bowl. box()
     exists precisely because a drawn rectangle needs corners that survive. */
  marks.box = {
    vb: '134 194 244 194',
    body: [
      P('M 226 300 L 292 297 L 295 338 L 229 341 Z', ACC),
      P(box(180, 262, 332, 374, { w0: 14, seed: 241 }), INK),
      P(stroke([[184, 262], [148, 208]], { w0: 13, w1: 8, belly: 0, seed: 247, wob: .5 }), INK),
      P(stroke([[328, 262], [364, 208]], { w0: 13, w1: 8, belly: 0, seed: 249, wob: .5 }), INK),
    ].join(''),
  };

  /* Not enough spending days to draw the distribution curve. An hourglass —
     the card is not empty because there is no data, it is empty because not
     enough time has passed yet, and those are different sentences. The sand is
     one path: the falling stream and the heap it lands in are the same sand,
     so splitting them would be two accents for one idea. */
  marks.hourglass = {
    vb: '138 134 238 264',
    body: [
      P('M 250 258 Q 256 256 262 258 L 266 306 Q 292 336 314 362 '
        + 'Q 256 368 198 362 Q 220 336 246 306 Z', ACC),
      P(stroke([[152, 152], [360, 148]], { w0: 17, w1: 15, seed: 251 }), INK),
      P(stroke([[152, 380], [360, 376]], { w0: 17, w1: 15, seed: 253 }), INK),
      P(stroke([[178, 154], [248, 262], [178, 378]], { w0: 13, w1: 12, seed: 255, wob: .6 }), INK),
      P(stroke([[334, 154], [264, 262], [334, 378]], { w0: 13, w1: 12, seed: 257, wob: .6 }), INK),
    ].join(''),
  };

  /* The bottom of the Logs ledger — "Nothing logged before March." Closed
     boxes, stacked and put away: the months that exist but hold nothing, not
     an invitation to load more (the .logs-tail button above it is that). */
  marks.stack = {
    vb: '126 142 262 242',
    body: [
      P('M 214 176 L 300 173 L 303 207 L 217 210 Z', ACC),
      P(box(140, 296, 372, 368, { w0: 14, seed: 261 }), INK),
      P(box(154, 226, 358, 296, { w0: 14, seed: 265 }), INK),
      P(box(168, 156, 344, 226, { w0: 14, seed: 269 }), INK),
    ].join(''),
  };

  /* The Logs view early in a month (§3.6). NOT an empty state — the ledger has
     content, it is just short, so this mark says nothing and is the only one
     with no sentence under it. An open book, mostly blank: ruled lines on the
     left page and none on the right, which is what a young month IS.
     ⚠️ Page edges use stroke(), and here the chaikin smoothing is WANTED — a
     book's pages are curved, so the rounding that ruined the open box is the
     correct behaviour for this subject. */
  /* ⚠️ BOTH the top and bottom edges sag toward the spine, and that one rule
     is what makes it a book rather than a folded card. The first draft had the
     top edge highest at the centre and lowest at the outer corners, which is a
     card being creased; an open book's pages rise away from the gutter at both
     ends. The ribbon also has to clear the bottom edge by a visible margin —
     drawn inside the page it just reads as a second spine. */
  marks.ledger = {
    vb: '134 182 244 214',
    body: [
      P(stroke([[272, 244], [281, 318], [274, 384]], { w0: 12, w1: 8, belly: .05, seed: 281, wob: .4 }), ACC),
      P(stroke([[256, 224], [200, 200], [152, 198], [148, 312], [202, 330], [256, 352]],
        { w0: 13, w1: 12, seed: 283 }), INK),
      P(stroke([[256, 224], [312, 200], [360, 198], [364, 312], [310, 330], [256, 352]],
        { w0: 13, w1: 12, seed: 285 }), INK),
      P(stroke([[256, 226], [253, 290], [256, 350]], { w0: 11, w1: 10, seed: 287, wob: .4 }), INK),
      // Three ruled lines, LEFT page only — the right page is still blank,
      // which is the whole point of the subject.
      P(stroke([[176, 244], [234, 242]], { w0: 7, w1: 6, belly: 0, seed: 289, wob: .4 }), INK),
      P(stroke([[172, 272], [236, 270]], { w0: 7, w1: 6, belly: 0, seed: 291, wob: .4 }), INK),
      P(stroke([[176, 300], [224, 298]], { w0: 7, w1: 6, belly: 0, seed: 293, wob: .4 }), INK),
    ].join(''),
  };

  /* Nothing recurring yet. Two arcs chasing each other — the only mark here
     that describes an action rather than an absence, because a recurring
     series is a thing that repeats and the empty state has to say what the
     user would be creating. */
  const CX = 256, CY = 262, RAD = 92;
  const head = (a, seed) => {
    const px = CX + Math.cos(a) * RAD, py = CY + Math.sin(a) * RAD;
    const tx = -Math.sin(a), ty = Math.cos(a);      // tangent, direction of travel
    const nx = -ty, ny = tx;
    // ⚠️ Sized against the mark's RENDERED size, not its user units. At tip 30
    // / base 21 these were geometrically correct and invisible at 60px, which
    // left two arcs that could have been a broken ring. A head has to out-weigh
    // the 15-unit arc it caps or it reads as the end of the line.
    return tri([px + tx * 44, py + ty * 44],
      [px + nx * 30 - tx * 8, py + ny * 30 - ty * 8],
      [px - nx * 30 - tx * 8, py - ny * 30 - ty * 8], seed);
  };
  const A0 = 0.45, TURNS = 0.38, SWEEP = Math.PI * 2 * TURNS;
  marks.cycle = {
    vb: '132 138 248 248',
    body: [
      P(ring(CX, CY, RAD, RAD, { w0: 15, w1: 12, seed: 271, a0: A0, turns: TURNS }), INK),
      P(ring(CX, CY, RAD, RAD, { w0: 15, w1: 12, seed: 275, a0: A0 + Math.PI, turns: TURNS }), INK),
      P(head(A0 + SWEEP, 277), INK),
      P(head(A0 + Math.PI + SWEEP, 279), ACC),
    ].join(''),
  };

  return marks;
}

/* Normalised on the LARGER viewBox dimension, so a wide mark (the envelope)
   and a tall one (the hourglass) take up the same amount of room instead of
   the wide one dominating. CSS can still override; these are the defaults. */
const MARK_BOX = { cloud: 76, envelope: 76, bag: 60, box: 60, hourglass: 60, stack: 60, cycle: 60, ledger: 96 };
const emitted = emptyMarks();
const lines = Object.entries(emitted).map(([name, m]) => {
  const [, , vw, vh] = m.vb.split(' ').map(Number);
  const target = MARK_BOX[name];
  const s = target / Math.max(vw, vh);
  const w = Math.round(vw * s), h = Math.round(vh * s);
  return `  ${name}: '<svg class="ink-mark" viewBox="${m.vb}" width="${w}" height="${h}" `
    + `aria-hidden="true" focusable="false">${m.body}</svg>',`;
});
fs.writeFileSync('empty-marks.txt', 'const INK_MARKS = {\n' + lines.join('\n') + '\n};\n');
console.log('empty-state marks emitted');
