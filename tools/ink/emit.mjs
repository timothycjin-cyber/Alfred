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

const VB = '84 116 344 296';   // tight to the art, so it scales without dead margin
fs.writeFileSync('loader-markup.txt',
  `<svg class="loader-mark" viewBox="${VB}" width="132" height="114" aria-hidden="true">`
  + art({ ink: 'var(--loader-ink)', accent: 'var(--sienna)', anim: true, ground: false }) + '</svg>');

const page = (size, maskable) => `<!doctype html><meta charset="utf-8">
<body style="margin:0"><svg width="${size}" height="${size}" viewBox="0 0 512 512" style="display:block;background:#FFFCF8">
${maskable ? '<g transform="translate(256 256) scale(0.76) translate(-256 -256)">' : ''}
${art({ ink: '#12100E', accent: '#C2542D', anim: false })}
${maskable ? '</g>' : ''}
</svg></body>`;
for (const s of [192, 512]) {
  fs.writeFileSync(`icon-${s}.html`, page(s, false));
  fs.writeFileSync(`icon-maskable-${s}.html`, page(s, true));
}
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
