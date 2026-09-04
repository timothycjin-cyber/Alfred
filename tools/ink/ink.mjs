// Marker-stroke generator: tapered, bellied, slightly wobbly filled outlines.
// Real felt-tip strokes are not uniform-width lines, so nothing here uses `stroke`.
export function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function chaikin(pts, iters) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25]);
      q.push([a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

// pts: polyline. w0/w1: nib width at each end. belly: mid-stroke swell. seed: wobble phase.
export function stroke(pts, { w0 = 14, w1 = null, belly = .1, seed = 1, wob = 1.1 } = {}) {
  const W1 = w1 === null ? w0 : w1;
  const p = chaikin(pts, 2);
  const n = p.length;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const nx = -dy, ny = dx;
    // width: taper + belly + a little periodic wobble, the way pressure varies
    let w = (w0 + (W1 - w0) * t) * (1 + belly * Math.sin(Math.PI * t));
    w *= 1 + .11 * Math.sin(t * 15.3 + seed) + .06 * Math.sin(t * 31.7 + seed * 2.1);
    // and the centreline drifts a hair off true
    const off = wob * Math.sin(t * 9.1 + seed * 1.7);
    const cx = p[i][0] + nx * off, cy = p[i][1] + ny * off;
    L.push([cx + nx * w / 2, cy + ny * w / 2]);
    R.push([cx - nx * w / 2, cy - ny * w / 2]);
  }
  const f = (v) => v.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`);
  const tipA = p[n - 1], tipB = p[0];
  const d = [
    `M ${f(L)[0]}`, ...f(L).slice(1).map((s) => `L ${s}`),
    `Q ${tipA[0].toFixed(1)} ${tipA[1].toFixed(1)} ${f(R)[n - 1]}`,
    ...f(R).slice().reverse().slice(1).map((s) => `L ${s}`),
    `Q ${tipB[0].toFixed(1)} ${tipB[1].toFixed(1)} ${f(L)[0]}`, 'Z',
  ].join(' ');
  return d;
}

// A box drawn in one pass, overshooting past where it started — the corner
// overshoot is most of what makes a drawn rectangle read as drawn.
export function box(x1, y1, x2, y2, o = {}) {
  const j = o.j ?? 4, s = o.seed ?? 1, r = rnd(s * 977);
  const k = () => (r() - .5) * j;
  const my = y1 + (y2 - y1) * .42;
  return stroke([
    [x1 + k(), my + k()], [x1 + k(), y1 + 6 + k()], [x1 + 8 + k(), y1 + k()],
    [x2 - 8 + k(), y1 + k()], [x2 + k(), y1 + 8 + k()],
    [x2 + k(), y2 - 8 + k()], [x2 - 8 + k(), y2 + k()],
    [x1 + 8 + k(), y2 + k()], [x1 + k(), y2 - 8 + k()],
    [x1 + k(), my - (y2 - y1) * .16 + k()],
  ], o);
}

// An ellipse drawn past its own start, same reason.
export function ring(cx, cy, rx, ry, o = {}) {
  const a0 = o.a0 ?? -2.1, turns = o.turns ?? 1.08, steps = 40;
  const r = rnd((o.seed ?? 1) * 613);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (Math.PI * 2 * turns) * (i / steps);
    const w = 1 + (r() - .5) * .035;
    pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
  }
  return stroke(pts, o);
}

// Solid shape (coin, shadow, fill) — a jittered closed polygon, no stroke.
export function blob(cx, cy, rx, ry, seed = 1, steps = 26, amp = .05) {
  const r = rnd(seed * 331);
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (Math.PI * 2 * i) / steps;
    const w = 1 + (r() - .5) * amp * 2;
    pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
  }
  const p = chaikin([...pts, pts[0], pts[1]], 3);
  return 'M ' + p.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L ') + ' Z';
}

// The little radiating ticks that sit beside almost every icon in the set.
export function sparkle(cx, cy, len = 26, w = 8, seed = 1, count = 3, spread = 1) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i - (count - 1) / 2) * spread;
    const x0 = cx + Math.cos(a) * len * .34, y0 = cy + Math.sin(a) * len * .34;
    out.push(stroke([[x0, y0], [cx + Math.cos(a) * len, cy + Math.sin(a) * len]],
      { w0: w, w1: w * .35, belly: 0, seed: seed + i, wob: .5 }));
  }
  return out;
}
