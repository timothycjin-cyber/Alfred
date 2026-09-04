import { stroke, box, ring, blob, sparkle, rnd } from './ink.mjs';
import fs from 'fs';

// Same nib as the canvas, emitted twice: once with CSS-variable inks for
// index.html, once with literal inks for the PNG render.
function art({ ink, accent, anim, ground = true }) {
  const P = (d, f, cls) => `<path d="${d}" fill="${f}"${cls ? ` class="${cls}"` : ''}/>`;
  const bar = (cls, x1, y1, x2, y2, seed, fill) => {
    const inner = (fill ? P(slab(x1 + 7, y1 + 8, x2 - 7, y2 - 6), fill) : '') + P(box(x1, y1, x2, y2, { w0: 15, seed }), ink);
    return anim ? `<g class="${cls}">${inner}</g>` : inner;
  };
  const slab = (x1, y1, x2, y2) => `M ${x1} ${y1} L ${x2} ${y1 - 1} L ${x2 + 1} ${y2} L ${x1 - 1} ${y2 + 1} Z`;
  return [
    // The ground shadow is ink-coloured, so on a dark ground it inverts into a
    // pale puddle. The icon always sits on paper and keeps it; the loader,
    // which has to work in both themes, is grounded by the baseline alone.
    ground ? P(blob(252, 416, 104, 9, 5), ink) : '',
    P(stroke([[104, 392], [252, 396], [408, 390]], { w0: 18, w1: 12, seed: 2 }), ink),
    bar('lb', 132, 290, 196, 388, 3),
    bar('lb lb2', 224, 228, 288, 388, 7),
    bar('lb lb3', 316, 162, 380, 388, 11, accent),
    ...sparkle(404, 138, 30, 9, 4, 3, .95).map((d) => P(d, ink, anim ? 'lt' : '')),
    P(blob(100, 244, 7, 7, 9), ink),
    P(blob(120, 196, 5, 5, 13), ink),
  ].join('');
}


/* The app icon: a piggy bank taking a coin. A different subject from the
   loader's bars on purpose — the tile has to say "money" to someone who has
   never opened the app, which three bars do not (CLAUDE.md §3.15).
   d = 1 strips the detail that turns to mush below ~48px and fattens what is
   left, so the silhouette survives instead of going grey. */
function pig({ ink, accent, d = 2 }) {
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
  const wash = `<defs><linearGradient id="pigWash" gradientUnits="userSpaceOnUse" x1="250" y1="196" x2="278" y2="372">
      <stop offset="0" stop-color="#FBE9E3"/><stop offset="0.55" stop-color="#F6D4C8"/><stop offset="1" stop-color="#F0C0B1"/>
    </linearGradient></defs>`;

  const out = [
    wash,
    P(blob(254, 412, 112, 10, 5), ink),
    // ⚠️ Inset 6 and jitter 0.02, not the blob default 0.05 — at 5% the fill's
    // own wobble can push past the ink outline's inner edge and show a pink
    // fringe outside the drawing.
    P(blob(250, 284, 110, 78, 33, 26, .02), 'url(#pigWash)'),
    P(blob(370, 288, 26, 22, 43, 26, .02), 'url(#pigWash)'),
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
  out.push(P(blob(258, 132, 31, 31, 67), accent));
  out.push(P(ring(258, 132, 31, 31, { w0: 10 * w, w1: 8 * w, seed: 71 }), ink));
  if (d > 1) out.push(...dollar().map((x) => P(x, ink)));
  if (d > 1) out.push(...sparkle(340, 128, 26, 8, 77, 2, 1.1).map((x) => P(x, ink)));
  return out.join('');
}

const VB = '84 116 344 296';   // tight to the art, so it scales without dead margin
fs.writeFileSync('loader-markup.txt',
  `<svg class="loader-mark" viewBox="${VB}" width="132" height="114" aria-hidden="true">`
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
${pig({ ink: '#12100E', accent: '#C2542D', d: detail })}
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
