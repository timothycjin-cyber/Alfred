import { stroke, box, ring, blob, sparkle } from './ink.mjs';
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
  const out = [
    P(blob(254, 412, 112, 10, 5), ink),
    P(stroke([[184, 358], [182, 402]], { w0: 17 * w, w1: 15 * w, seed: 21, wob: .6 }), ink),
    P(stroke([[308, 360], [310, 402]], { w0: 17 * w, w1: 15 * w, seed: 25, wob: .6 }), ink),
    P(ring(250, 284, 116, 84, { w0: 16 * w, w1: 14 * w, seed: 31, a0: -2.4 }), ink),
    P(stroke([[272, 210], [288, 164], [330, 194], [298, 216]], { w0: 14 * w, w1: 11 * w, seed: 35 }), ink),
    P(ring(370, 288, 31, 27, { w0: 13 * w, w1: 11 * w, seed: 41, a0: -1.2 }), ink),
    P(stroke([[228, 206], [288, 200]], { w0: 15 * w, w1: 13 * w, seed: 45, wob: .5 }), ink),
  ];
  if (d > 1) {
    out.push(P(stroke([[142, 316], [120, 310], [116, 332], [138, 338], [142, 324]], { w0: 12, w1: 8, seed: 51 }), ink));
    out.push(P(blob(312, 244, 9, 10, 55), ink));
    out.push(P(blob(362, 284, 6, 7, 59), ink), P(blob(380, 286, 6, 7, 61), ink));
  }
  // The coin is the only colour, and the only reason the tile reads as money
  // rather than as an animal. It never simplifies away.
  out.push(P(blob(258, 132, 31, 31, 67), accent));
  out.push(P(ring(258, 132, 31, 31, { w0: 10 * w, w1: 8 * w, seed: 71 }), ink));
  if (d > 1) out.push(...sparkle(340, 128, 26, 8, 77, 2, 1.1).map((x) => P(x, ink)));
  return out.join('');
}

const VB = '84 116 344 296';   // tight to the art, so it scales without dead margin
fs.writeFileSync('loader-markup.txt',
  `<svg class="loader-mark" viewBox="${VB}" width="132" height="114" aria-hidden="true">`
  + art({ ink: 'var(--loader-ink)', accent: 'var(--sienna)', anim: true, ground: false }) + '</svg>');

/* Two framings of the same drawing.
   ⚠️ The scales are NOT interchangeable and neither is a round number.
   The pig's bbox is 298 x 321 about (259, 261) in a 512 box, so its furthest
   point sits ~225 units from centre.
   - `any` is full-bleed: 1.22 puts the art at ~71% x 77% of the tile. Left at
     1.0 the pig floats in a large empty square and turns into a dot on a
     home screen.
   - `maskable` is cropped to a centred circle of 80% diameter — a 205-unit
     safe radius. 0.86 lands the furthest point at ~193. (The bar mark needed
     0.76; the pig is a rounder silhouette and can sit larger. Copying the old
     number here would have shrunk it for no reason.) */
const FRAME = { any: 1.22, maskable: 0.86 };
const page = (size, maskable, detail) => {
  const k = maskable ? FRAME.maskable : FRAME.any;
  return `<!doctype html><meta charset="utf-8">
<body style="margin:0"><svg width="${size}" height="${size}" viewBox="0 0 512 512" style="display:block;background:#FFFCF8">
<g transform="translate(256 256) scale(${k}) translate(-259 -261)">
${pig({ ink: '#12100E', accent: '#C2542D', d: detail })}
</g>
</svg></body>`;
};

for (const s of [192, 512]) {
  fs.writeFileSync(`icon-${s}.html`, page(s, false, 2));
  fs.writeFileSync(`icon-maskable-${s}.html`, page(s, true, 2));
}
// The browser tab renders at 16-32px. Downscaling the 192 there mushes the
// tail, eye and nostrils into grey; the stripped variant (d=1) keeps the
// silhouette and the coin, which is all that survives at that size anyway.
fs.writeFileSync('icon-64.html', page(64, false, 1));
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
