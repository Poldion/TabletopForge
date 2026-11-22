// Kartenbauer: Zufall, Rauschen und Geometrie – ohne DOM, damit es sich ohne Browser testen lässt.

/** Pixel je Feld im Kartenbauer: alle Maße der Szene beziehen sich darauf. */
export const CELL = 70;

/** Leere Szene: Größe in Feldern, Umgebung, Startwert für alles Zufällige (Wiese, Streuung). */
export function newScene(cols = 30, rows = 20, biome = 'meadow') {
  return { v: 1, cols, rows, biome, seed: Math.floor(Math.random() * 1e9), water: [], paths: [], roads: [], dirt: [], high: [], cave: [], rooms: [], walls: [], openings: [], objects: [], fills: [], labels: [] };
}

export function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Zufallsquelle mit festem Startwert: gleiche Szene ergibt immer dasselbe Bild. */
export function rng(seed) {
  const R = mulberry(seed);
  return {
    R,
    rnd: (a, b) => a + R() * (b - a),
    pick: (arr) => arr[Math.floor(R() * arr.length)],
    int: (n) => Math.floor(R() * n),
  };
}

/** Zeichenketten (IDs) in einen Startwert für die Zufallsquelle umrechnen. */
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function valueNoise(seed) {
  const r = mulberry(seed);
  const g = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const x0 = xi & 255;
    const x1 = (xi + 1) & 255;
    const y0 = (yi & 255) << 8;
    const y1 = ((yi + 1) & 255) << 8;
    const a = g[y0 + x0];
    const b = g[y0 + x1];
    const c = g[y1 + x0];
    return a + (b - a) * u + (c - a) * v + (a - b - c + g[y1 + x1]) * u * v;
  };
}

/**
 * Kachelbares Rauschfeld (size × size, Werte 0…255): wiederholt sich nahtlos, deshalb ohne Nähte auf beliebig
 * große Karten anwendbar. cells = Gitterzellen der gröbsten Oktave je Kachel.
 */
export function tileField(seed, size, cells, oct) {
  const r = mulberry(seed);
  const acc = new Float32Array(size * size);
  let amp = 0.5;
  let total = 0;
  for (let o = 0, n = cells; o < oct; o++, n *= 2, amp *= 0.5) {
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = r();
    const k = n / size;
    for (let y = 0, p = 0; y < size; y++) {
      const fy0 = y * k;
      const yi = Math.floor(fy0);
      const fy = fy0 - yi;
      const v = fy * fy * (3 - 2 * fy);
      const r0 = (yi % n) * n;
      const r1 = ((yi + 1) % n) * n;
      for (let x = 0; x < size; x++, p++) {
        const fx0 = x * k;
        const xi = Math.floor(fx0);
        const fx = fx0 - xi;
        const u = fx * fx * (3 - 2 * fx);
        const x0 = xi % n;
        const x1 = (xi + 1) % n;
        const a = g[r0 + x0];
        const b = g[r0 + x1];
        const c = g[r1 + x0];
        acc[p] += amp * (a + (b - a) * u + (c - a) * v + (a - b - c + g[r1 + x1]) * u * v);
      }
    }
    total += amp;
  }
  const out = new Uint8Array(size * size);
  for (let p = 0; p < out.length; p++) {
    const v = (acc[p] / total - 0.5) * 1.7 + 0.5;
    out[p] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
  }
  return out;
}

/** Mehrfacher Kastenfilter (nähert eine Gauß-Unschärfe an) auf einem Feld gw × gh. */
export function boxBlur(F, gw, gh, r, passes = 2) {
  const tmp = new Float32Array(F.length);
  const n = 2 * r + 1;
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < gh; y++) {
      const row = y * gw;
      let s = 0;
      for (let x = -r; x <= r; x++) s += F[row + Math.min(gw - 1, Math.max(0, x))];
      for (let x = 0; x < gw; x++) {
        tmp[row + x] = s / n;
        s += F[row + Math.min(gw - 1, x + r + 1)] - F[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < gw; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(gh - 1, Math.max(0, y)) * gw + x];
      for (let y = 0; y < gh; y++) {
        F[y * gw + x] = s / n;
        s += tmp[Math.min(gh - 1, y + r + 1) * gw + x] - tmp[Math.max(0, y - r) * gw + x];
      }
    }
  }
  return F;
}

/**
 * Abstand jeder „inneren“ Zelle (inside[p] ≠ 0) zur nächsten äußeren, in Zellen (Chamfer 3-4). Der Rand des Felds
 * zählt nicht als außen.
 */
export function chamfer(inside, gw, gh) {
  const D = new Float32Array(gw * gh);
  const BIG = 1e6;
  for (let p = 0; p < D.length; p++) D[p] = inside[p] ? BIG : 0;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const p = y * gw + x;
      let d = D[p];
      if (!d) continue;
      if (x > 0) d = Math.min(d, D[p - 1] + 1);
      if (y > 0) {
        d = Math.min(d, D[p - gw] + 1);
        if (x > 0) d = Math.min(d, D[p - gw - 1] + 1.4142);
        if (x < gw - 1) d = Math.min(d, D[p - gw + 1] + 1.4142);
      }
      D[p] = d;
    }
  }
  for (let y = gh - 1; y >= 0; y--) {
    for (let x = gw - 1; x >= 0; x--) {
      const p = y * gw + x;
      let d = D[p];
      if (!d) continue;
      if (x < gw - 1) d = Math.min(d, D[p + 1] + 1);
      if (y < gh - 1) {
        d = Math.min(d, D[p + gw] + 1);
        if (x < gw - 1) d = Math.min(d, D[p + gw + 1] + 1.4142);
        if (x > 0) d = Math.min(d, D[p + gw - 1] + 1.4142);
      }
      D[p] = d;
    }
  }
  return D;
}

/**
 * Höhenlinien eines Felds bei thr als geschlossene Linienzüge (Gitterkoordinaten, linear interpoliert).
 * Der äußerste Ring des Felds muss unter thr liegen, sonst bleiben Linien offen.
 */
export function marchingSquares(F, gw, gh, thr = 0.5) {
  const n = gw * gh * 2;
  const a0 = new Int32Array(n).fill(-1);
  const a1 = new Int32Array(n).fill(-1);
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const link = (a, b) => {
    if (a0[a] < 0) a0[a] = b;
    else a1[a] = b;
    if (a0[b] < 0) a0[b] = a;
    else a1[b] = a;
  };
  const H = (i, j) => {
    const id = 2 * (j * gw + i);
    const v0 = F[j * gw + i];
    const v1 = F[j * gw + i + 1];
    px[id] = i + (thr - v0) / (v1 - v0);
    py[id] = j;
    return id;
  };
  const V = (i, j) => {
    const id = 2 * (j * gw + i) + 1;
    const v0 = F[j * gw + i];
    const v1 = F[(j + 1) * gw + i];
    px[id] = i;
    py[id] = j + (thr - v0) / (v1 - v0);
    return id;
  };
  for (let j = 0; j < gh - 1; j++) {
    for (let i = 0; i < gw - 1; i++) {
      const tl = F[j * gw + i] >= thr;
      const tr = F[j * gw + i + 1] >= thr;
      const br = F[(j + 1) * gw + i + 1] >= thr;
      const bl = F[(j + 1) * gw + i] >= thr;
      const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const T = () => H(i, j);
      const B = () => H(i, j + 1);
      const L = () => V(i, j);
      const Rr = () => V(i + 1, j);
      const mid = () => (F[j * gw + i] + F[j * gw + i + 1] + F[(j + 1) * gw + i + 1] + F[(j + 1) * gw + i]) / 4 >= thr;
      switch (c) {
        case 1: case 14: link(L(), B()); break;
        case 2: case 13: link(B(), Rr()); break;
        case 3: case 12: link(L(), Rr()); break;
        case 4: case 11: link(T(), Rr()); break;
        case 6: case 9: link(T(), B()); break;
        case 7: case 8: link(T(), L()); break;
        case 5:
          if (mid()) (link(T(), L()), link(B(), Rr()));
          else (link(T(), Rr()), link(L(), B()));
          break;
        case 10:
          if (mid()) (link(T(), Rr()), link(L(), B()));
          else (link(T(), L()), link(B(), Rr()));
          break;
      }
    }
  }
  const seen = new Uint8Array(n);
  const loops = [];
  for (let s = 0; s < n; s++) {
    if (a0[s] < 0 || seen[s]) continue;
    const loop = [];
    let prev = -1;
    let cur = s;
    for (let guard = 0; guard < n; guard++) {
      seen[cur] = 1;
      loop.push([px[cur], py[cur]]);
      const next = a0[cur] !== prev ? a0[cur] : a1[cur];
      prev = cur;
      cur = next;
      if (cur < 0 || cur === s) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Ecken abrunden (Chaikin). */
export function chaikin(pts, closed = true, iter = 2) {
  let p = pts;
  for (let k = 0; k < iter; k++) {
    const q = [];
    const n = p.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = p[i];
      const b = p[(i + 1) % n];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) (q.unshift(p[0]), q.push(p[n - 1]));
    p = q;
  }
  return p;
}

/** Linienzug in gleichmäßigen Abständen neu abtasten. */
export function resample(pts, step, closed = false) {
  const src = closed ? [...pts, pts[0]] : pts;
  const out = [];
  let carry = 0;
  for (let i = 0; i < src.length - 1; i++) {
    const [x0, y0] = src[i];
    const [x1, y1] = src[i + 1];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 1e-9) continue;
    let t = carry;
    for (; t < L; t += step) out.push([x0 + ((x1 - x0) * t) / L, y0 + ((y1 - y0) * t) / L]);
    carry = t - L;
  }
  if (!closed && src.length) out.push(src[src.length - 1]);
  return out;
}

/** Einheitsnormalen je Punkt (aus den Nachbarn gemittelt); zeigen bei Umlauf im Uhrzeigersinn (Bildschirm) nach außen. */
export function normals(pts, closed = true) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    return [dy / L, -dx / L];
  });
}

/** Vorzeichenbehaftete Fläche (Bildschirmkoordinaten: positiv = im Uhrzeigersinn). */
export function polyArea(pts) {
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Kurve durch Stützpunkte (Catmull-Rom) als dichte Punktfolge. */
export function spline(pts, seg = 12, closed = false) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const out = [];
  const P = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  for (let i = 0, m = closed ? n : n - 1; i < m; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    for (let k = 0; k < seg; k++) {
      const t = k / seg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

/** Freihand-Linie ausdünnen: Punkte, die näher als minDist am Vorgänger liegen, entfallen. */
export function thin(pts, minDist) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) >= minDist) out.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  }
  const last = pts[pts.length - 1];
  if (out.length && last && out[out.length - 1] !== last && Math.hypot(last[0] - out[out.length - 1][0], last[1] - out[out.length - 1][1]) > 1) out.push([Math.round(last[0] * 10) / 10, Math.round(last[1] * 10) / 10]);
  return out;
}

// --- Gebäude ----------------------------------------------------------------------------------------------------------

const inRect = (r, x, y, m = 0) => x > r.x + m && x < r.x + r.w - m && y > r.y + m && y < r.y + r.h - m;
const inCircle = (c, x, y, m = 0) => Math.hypot(x - c.cx, y - c.cy) < c.r - m;
export const inRoom = (r, x, y, m = 0) => (r.k === 'circle' ? inCircle(r, x, y, m) : inRect(r, x, y, m));
/** Oberster Raum an einer Stelle (später gezeichnete liegen oben) oder null. */
export function roomAt(rooms, x, y) {
  for (let i = rooms.length - 1; i >= 0; i--) if (inRoom(rooms[i], x, y)) return rooms[i];
  return null;
}

/** Zieht von [0, len] die Abschnitte cuts = [[a, b], …] ab und liefert die verbleibenden Stücke. */
export function cutSpans(len, cuts, min = 2) {
  let keep = [[0, len]];
  for (const [a, b] of cuts) {
    const next = [];
    for (const [s, e] of keep) {
      if (b <= s || a >= e) next.push([s, e]);
      else {
        if (a - s > min) next.push([s, a]);
        if (e - b > min) next.push([b, e]);
      }
    }
    keep = next;
  }
  return keep.filter(([s, e]) => e - s > min);
}

/**
 * Außenwände eines Gebäudes aus seinen Räumen: Rechtecke und Kreise verschmelzen, die Wand läuft nur um den äußeren
 * Umriss. Offene Räume (Veranda, Steg) bekommen keine Wand.
 * Liefert gerade Stücke, Bögen und die Stellen für Eckpfosten.
 */
export function buildingOutline(rooms) {
  const rects = rooms.filter((r) => r.k !== 'circle' && !r.open);
  const circles = rooms.filter((r) => r.k === 'circle' && !r.open);
  const segs = [];
  if (rects.length) {
    const uniq = (a) => [...new Set(a)].sort((p, q) => p - q);
    const xs = uniq(rects.flatMap((r) => [r.x, r.x + r.w]));
    const ys = uniq(rects.flatMap((r) => [r.y, r.y + r.h]));
    const nx = xs.length - 1;
    const ny = ys.length - 1;
    const occ = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const cx = (xs[i] + xs[i + 1]) / 2;
        const cy = (ys[j] + ys[j + 1]) / 2;
        if (rects.some((r) => inRect(r, cx, cy))) occ[j * nx + i] = 1;
      }
    }
    const at = (i, j) => (i >= 0 && j >= 0 && i < nx && j < ny ? occ[j * nx + i] : 0);
    for (let j = 0; j <= ny; j++) {
      let start = null;
      let side = 0;
      for (let i = 0; i <= nx; i++) {
        const s = i < nx ? at(i, j) - at(i, j - 1) : 0; // +1: innen liegt unterhalb der Linie
        if (s !== side) {
          if (side) segs.push({ x1: xs[start], y1: ys[j], x2: xs[i], y2: ys[j] });
          start = i;
          side = s;
        }
      }
    }
    for (let i = 0; i <= nx; i++) {
      let start = null;
      let side = 0;
      for (let j = 0; j <= ny; j++) {
        const s = j < ny ? at(i, j) - at(i - 1, j) : 0;
        if (s !== side) {
          if (side) segs.push({ x1: xs[i], y1: ys[start], x2: xs[i], y2: ys[j] });
          start = j;
          side = s;
        }
      }
    }
  }
  // Gerade Stücke, die in einem Rundraum verschwinden, kürzen
  const clipped = [];
  for (const s of segs) {
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const ux = (s.x2 - s.x1) / L;
    const uy = (s.y2 - s.y1) / L;
    const cuts = [];
    for (const c of circles) {
      const fx = s.x1 - c.cx;
      const fy = s.y1 - c.cy;
      const b = fx * ux + fy * uy;
      const disc = b * b - (fx * fx + fy * fy - c.r * c.r);
      if (disc > 0) cuts.push([-b - Math.sqrt(disc), -b + Math.sqrt(disc)]);
    }
    for (const [a, b] of cutSpans(L, cuts)) clipped.push({ x1: s.x1 + ux * a, y1: s.y1 + uy * a, x2: s.x1 + ux * b, y2: s.y1 + uy * b });
  }
  // Bögen: der Teil jedes Kreises, der in keinem anderen Raum liegt
  const arcs = [];
  for (const c of circles) {
    const n = Math.max(48, Math.ceil((6.2832 * c.r) / 3));
    const free = new Uint8Array(n);
    let any = false;
    let all = true;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832;
      const x = c.cx + Math.cos(a) * c.r;
      const y = c.cy + Math.sin(a) * c.r;
      free[i] = rects.some((r) => inRect(r, x, y, 0.5)) || circles.some((o) => o !== c && inCircle(o, x, y, 0.5)) ? 0 : 1;
      any = any || !!free[i];
      all = all && !!free[i];
    }
    if (all) arcs.push({ cx: c.cx, cy: c.cy, r: c.r, a0: 0, a1: 6.2832, full: true });
    else if (any) {
      let i0 = 0;
      while (free[i0]) i0++; // an einer verdeckten Stelle beginnen, damit kein Bogen über den Anfang hinausläuft
      for (let k = 0; k < n; ) {
        const i = (i0 + k) % n;
        if (!free[i]) {
          k++;
          continue;
        }
        let len = 0;
        while (len < n && free[(i + len) % n]) len++;
        arcs.push({ cx: c.cx, cy: c.cy, r: c.r, a0: ((i0 + k) / n) * 6.2832, a1: ((i0 + k + len - 1) / n) * 6.2832 });
        k += len;
      }
    }
  }
  const posts = [];
  const addPost = (x, y) => {
    if (!posts.some((p) => Math.hypot(p[0] - x, p[1] - y) < 3)) posts.push([x, y]);
  };
  for (const s of clipped) (addPost(s.x1, s.y1), addPost(s.x2, s.y2));
  for (const a of arcs) {
    if (a.full) continue;
    addPost(a.cx + Math.cos(a.a0) * a.r, a.cy + Math.sin(a.a0) * a.r);
    addPost(a.cx + Math.cos(a.a1) * a.r, a.cy + Math.sin(a.a1) * a.r);
  }
  return { segs: clipped, arcs, posts };
}

/**
 * Nächste Stelle auf einer Wand (Außenwand gerade/rund oder Innenwand) zu einem Punkt.
 * Liefert { x, y, a (Richtung der Wand), d (Abstand) } oder null.
 */
export function nearestWall(outline, inner, x, y) {
  let best = null;
  const take = (px, py, a) => {
    const d = Math.hypot(px - x, py - y);
    if (!best || d < best.d) best = { x: px, y: py, a, d };
  };
  for (const s of [...outline.segs, ...inner]) {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / L2));
    take(s.x1 + dx * t, s.y1 + dy * t, Math.atan2(dy, dx));
  }
  for (const c of outline.arcs) {
    let a = Math.atan2(y - c.cy, x - c.cx);
    if (!c.full) {
      while (a < c.a0) a += 6.2832;
      if (a > c.a1) a = a - c.a1 < c.a0 + 6.2832 - a ? c.a1 : c.a0;
    }
    take(c.cx + Math.cos(a) * c.r, c.cy + Math.sin(a) * c.r, a + 1.5708);
  }
  return best;
}

/**
 * Abschnitte eines geraden Wandstücks, die stehen bleiben: Türen öffnen die Wand; mit windows = true zählen auch
 * Fenster als Öffnung (für das Licht).
 */
export function wallPieces(s, openings, windows = false) {
  const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  if (L < 1) return [];
  const ux = (s.x2 - s.x1) / L;
  const uy = (s.y2 - s.y1) / L;
  const cuts = [];
  for (const o of openings) {
    if (o.k !== 'door' && o.k !== 'gate' && !windows) continue;
    const t = (o.x - s.x1) * ux + (o.y - s.y1) * uy;
    const d = Math.abs((o.x - s.x1) * -uy + (o.y - s.y1) * ux);
    if (d < 8 && t > -o.w / 2 && t < L + o.w / 2) cuts.push([t - o.w / 2, t + o.w / 2]);
  }
  return cutSpans(L, cuts).map(([a, b]) => ({ x1: s.x1 + ux * a, y1: s.y1 + uy * a, x2: s.x1 + ux * b, y2: s.y1 + uy * b }));
}

/** Wie wallPieces, für einen Bogen: liefert Teilbögen ohne die Öffnungen. */
export function arcPieces(c, openings, windows = false) {
  const cuts = [];
  for (const o of openings) {
    if ((o.k !== 'door' && o.k !== 'gate' && !windows) || Math.abs(Math.hypot(o.x - c.cx, o.y - c.cy) - c.r) > 8) continue;
    let a = Math.atan2(o.y - c.cy, o.x - c.cx);
    while (a < c.a0) a += 6.2832;
    const half = o.w / 2 / c.r;
    cuts.push([(a - c.a0 - half) * c.r, (a - c.a0 + half) * c.r]);
    if (c.full) cuts.push([(a - c.a0 - half - 6.2832) * c.r, (a - c.a0 + half - 6.2832) * c.r]);
  }
  return cutSpans((c.a1 - c.a0) * c.r, cuts).map(([a, b]) => ({ cx: c.cx, cy: c.cy, r: c.r, a0: c.a0 + a / c.r, a1: c.a0 + b / c.r }));
}

/** Liegt der Punkt auf dem Rand eines Raums? */
const onRoomEdge = (r, x, y, tol = 3) =>
  r.k === 'circle' ? Math.abs(Math.hypot(x - r.cx, y - r.cy) - r.r) < tol : inRect(r, x, y, -tol) && !inRect(r, x, y, tol);
/** Gehört die Wandstelle zu einem verfallenen Raum (Ruine)? */
export const isRuinWall = (rooms, x, y) => rooms.some((r) => r.ruin && onRoomEdge(r, x, y));
/** Gehört die Wandstelle zu einem Raum mit Holzwänden (Blockhaus, Scheune)? */
export const isTimberWall = (rooms, x, y) => rooms.some((r) => r.timber && !r.open && onRoomEdge(r, x, y));

/**
 * Verfallene Mauer: von einem Wandstück bleiben nur Teile stehen, dazwischen klaffen Lücken. Der Zufall hängt fest
 * an der Lage des Stücks – Zeichnung und Lichtberechnung kommen so auf dieselben Lücken.
 */
export function ruinPieces(s) {
  const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  if (L < 1) return [];
  const { R, rnd } = rng(hashStr(`r${Math.round(s.x1)}|${Math.round(s.y1)}|${Math.round(s.x2)}|${Math.round(s.y2)}`));
  const ux = (s.x2 - s.x1) / L;
  const uy = (s.y2 - s.y1) / L;
  const out = [];
  for (let t = R() < 0.5 ? 0 : rnd(14, 40); t < L; ) {
    const e = Math.min(L, t + rnd(44, 150));
    if (e - t > 12) out.push({ x1: s.x1 + ux * t, y1: s.y1 + uy * t, x2: s.x1 + ux * e, y2: s.y1 + uy * e });
    t = e + rnd(24, 70);
  }
  return out;
}
/** Wie ruinPieces, für einen Bogen. */
export function ruinArcPieces(c) {
  const L = (c.a1 - c.a0) * c.r;
  const { R, rnd } = rng(hashStr(`ra${Math.round(c.cx)}|${Math.round(c.cy)}|${Math.round(c.r)}|${c.a0.toFixed(2)}`));
  const out = [];
  for (let t = R() < 0.5 ? 0 : rnd(14, 40); t < L; ) {
    const e = Math.min(L, t + rnd(44, 130));
    if (e - t > 12) out.push({ cx: c.cx, cy: c.cy, r: c.r, a0: c.a0 + t / c.r, a1: c.a0 + e / c.r });
    t = e + rnd(24, 70);
  }
  return out;
}

/** Linienzug vereinfachen (Douglas-Peucker): Punkte, die weniger als tol von der Verbindung abweichen, entfallen. */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = pts[a];
    const [x2, y2] = pts[b];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const L = Math.hypot(dx, dy) || 1;
    let far = -1;
    let max = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - x1) * dy - (pts[i][1] - y1) * dx) / L;
      if (d > max) {
        max = d;
        far = i;
      }
    }
    if (far > 0) (keep[far] = 1), stack.push([a, far], [far, b]);
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Alle Wände als Strecken für die Lichtberechnung (Bögen als Vieleck). Türen, Fenster und die Lücken verfallener
 * Mauern lassen Licht durch. loops: zusätzliche geschlossene Linienzüge (Höhlenwände), werden vereinfacht übernommen.
 */
export function wallSegments(rooms, inner, openings, loops = []) {
  const o = buildingOutline(rooms);
  const out = [];
  const add = (s) => out.push([s.x1, s.y1, s.x2, s.y2].map((v) => Math.round(v * 10) / 10));
  const ruin = (p) => isRuinWall(rooms, (p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2);
  for (const s of o.segs) for (const p of wallPieces(s, openings, true)) (ruin(p) ? ruinPieces(p) : [p]).forEach(add);
  for (const s of inner) wallPieces(s, openings, true).forEach(add);
  const straight = out.flatMap(([x1, y1, x2, y2]) => [[x1, y1], [x2, y2]]);
  for (const c of o.arcs) {
    for (const a of arcPieces(c, openings, true).flatMap((q) => (isRuinWall(rooms, q.cx + Math.cos((q.a0 + q.a1) / 2) * q.r, q.cy + Math.sin((q.a0 + q.a1) / 2) * q.r) ? ruinArcPieces(q) : [q]))) {
      const n = Math.max(2, Math.ceil(((a.a1 - a.a0) * a.r) / 24));
      // Bogenenden an die anschließende gerade Wand heften – sonst bliebe ein Spalt, durch den Licht fällt
      const at = (t, end) => {
        const p = [a.cx + Math.cos(t) * a.r, a.cy + Math.sin(t) * a.r];
        if (!end) return p;
        let best = null;
        for (const q of straight) {
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (d < 12 && (!best || d < best.d)) best = { d, q };
        }
        return best ? best.q : p;
      };
      for (let i = 0; i < n; i++) {
        const p0 = at(a.a0 + ((a.a1 - a.a0) * i) / n, i === 0);
        const p1 = at(a.a0 + ((a.a1 - a.a0) * (i + 1)) / n, i === n - 1);
        add({ x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1] });
      }
    }
  }
  for (const loop of loops) {
    // Geschlossener Zug: in zwei Hälften vereinfachen (Anfang = Ende ergäbe sonst eine Strecke der Länge null)
    const m = loop.length >> 1;
    const pts = [...simplify(loop.slice(0, m + 1), 5), ...simplify([...loop.slice(m), loop[0]], 5).slice(1)];
    for (let i = 0; i < pts.length - 1; i++) add({ x1: pts[i][0], y1: pts[i][1], x2: pts[i + 1][0], y2: pts[i + 1][1] });
  }
  return out;
}

/**
 * Räume zum raumweisen Aufdecken: Flächen, die von Wänden rundum eingeschlossen sind (Türen und Fenster gelten als zu,
 * verfallene Mauern als ganz). Jede Fläche reicht etwas über ihre Wände hinaus, damit Mauer und Türrahmen mit erscheinen.
 * Liefert [{ id, pts: [x, y, …] }]; das Freie rund um die Gebäude ist kein Raum.
 */
export function roomZones(rooms, inner, loops, W, H, g = 10) {
  return zonesFromSegments(wallSegments(rooms.map((r) => ({ ...r, ruin: false })), inner, [], loops), W, H, g);
}

/** Wie roomZones, aus fertigen Wandstrecken [[x1, y1, x2, y2], …] – etwa einer eingelesenen Karte; cell = Pixel je Feld. */
export function zonesFromSegments(segs, W, H, g = 10, cell = CELL, minCells = 0.3) {
  const gw = Math.ceil(W / g) + 2;
  const gh = Math.ceil(H / g) + 2;
  const wall = new Uint8Array(gw * gh);
  for (const [x1, y1, x2, y2] of segs) {
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (g / 3)));
    for (let i = 0; i <= n; i++) {
      const x = x1 + ((x2 - x1) * i) / n;
      const y = y1 + ((y2 - y1) * i) / n;
      // Die Wand liegt auf der Gitterlinie: beide angrenzenden Zellen sperren, sonst sickert die Füllung schräg durch
      for (const [ox, oy] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
        const cx = Math.floor(x / g + ox) + 1;
        const cy = Math.floor(y / g + oy) + 1;
        if (cx >= 0 && cy >= 0 && cx < gw && cy < gh) wall[cy * gw + cx] = 1;
      }
    }
  }
  const label = new Int32Array(gw * gh);
  const zones = [];
  let next = 0;
  for (let start = 0; start < gw * gh; start++) {
    if (wall[start] || label[start]) continue;
    const id = ++next;
    const cells = [start];
    label[start] = id;
    let outside = false;
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      const x = c % gw;
      const y = (c - x) / gw;
      if (x === 0 || y === 0 || x === gw - 1 || y === gh - 1) outside = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const q = ny * gw + nx;
        if (wall[q] || label[q]) continue;
        label[q] = id;
        cells.push(q);
      }
    }
    // auch ein Raum von einem Feld (Zelle, Wandschrank) zählt: seine Wände sperren schon die Hälfte seiner Fläche
    if (outside || cells.length * g * g < cell * cell * minCells) continue;
    // Fläche wachsen lassen und als Umriss fassen: weit (über die Wand hinaus, zum Aufdecken) und knapp (bis zur
    // Wandmitte, für „nur innen dunkel“)
    const pad = 4;
    const fw = gw + 2 * pad;
    const outline = (grow) => {
      const F = new Float32Array(fw * (gh + 2 * pad));
      for (const c of cells) {
        const x = c % gw;
        const y = (c - x) / gw;
        for (let dy = -grow; dy <= grow; dy++) for (let dx = -grow; dx <= grow; dx++) F[(y + dy + pad) * fw + x + dx + pad] = 1;
      }
      const rings = marchingSquares(F, fw, gh + 2 * pad, 0.5).sort((a, b) => Math.abs(polyArea(b)) - Math.abs(polyArea(a)));
      const flat = (ring0) => {
        const ring = ring0.map(([x, y]) => [(x - pad - 1 + 0.5) * g, (y - pad - 1 + 0.5) * g]);
        const m = ring.length >> 1;
        const pts = [...simplify(ring.slice(0, m + 1), g * 0.45), ...simplify([...ring.slice(m), ring[0]], g * 0.45).slice(1, -1)];
        return pts.length >= 3 ? pts.flatMap(([x, y]) => [Math.round(Math.max(0, Math.min(W, x))), Math.round(Math.max(0, Math.min(H, y)))]) : null;
      };
      const pts = rings.length ? flat(rings[0]) : null;
      if (!pts) return null;
      // Weitere Ringe sind Löcher: ein Gang rund um eine Kammer deckt die Kammer nicht mit auf
      const holes = rings.slice(1).filter((r) => Math.abs(polyArea(r)) * g * g > cell * cell * 0.2).map(flat).filter(Boolean);
      return { pts, holes };
    };
    // weit: über die Wand hinaus (zum Aufdecken); knapp: bis zur Wandmitte (Treffer und „nur innen dunkel“)
    const wide = outline(2);
    if (wide) zones.push({ id: `z${zones.length + 1}`, pts: wide.pts, ...(wide.holes.length ? { holes: wide.holes } : {}), in: outline(1)?.pts || wide.pts });
  }
  return zones;
}

// --- Szenen aus Vorlagen und Dateien ------------------------------------------------------------------------------------

const LISTS = ['water', 'paths', 'roads', 'dirt', 'high', 'cave', 'rooms', 'walls', 'openings', 'objects', 'fills', 'labels'];

/**
 * Fremde Szene prüfen und bereinigen: Listen ergänzen, Größe begrenzen, unbekannte Gegenstände weglassen
 * (known(t) sagt, ob es den Katalogeintrag gibt). Liefert null, wenn es keine Szene ist.
 */
export function cleanScene(raw, known = () => true) {
  if (!raw || typeof raw !== 'object' || !(raw.cols > 0) || !(raw.rows > 0)) return null;
  const scene = JSON.parse(JSON.stringify(raw));
  scene.v = 1;
  scene.cols = Math.max(6, Math.min(80, Math.round(scene.cols)));
  scene.rows = Math.max(6, Math.min(80, Math.round(scene.rows)));
  if (scene.cols * scene.rows > 3600) scene.rows = Math.floor(3600 / scene.cols);
  for (const k of LISTS) scene[k] = Array.isArray(scene[k]) ? scene[k].filter((x) => x && typeof x === 'object') : [];
  scene.objects = scene.objects.filter((o) => known(o.t) && Number.isFinite(o.x) && Number.isFinite(o.y));
  scene.seed = Number.isFinite(scene.seed) ? scene.seed : 1;
  delete scene.meta;
  return scene;
}

/** Neue Kennungen für alles in der Szene (Verweise auf Füllbereiche bleiben stimmig) und ein neuer Zufallsstart. */
export function freshIds(scene, uid, random = Math.random) {
  const fills = new Map();
  for (const f of scene.fills) {
    const id = uid();
    fills.set(f.id, id);
    f.id = id;
  }
  // Räume merken ihre alte Kennung: eingerichtete Räume finden ihre Möbel darüber wieder
  const rooms = new Map();
  for (const r of scene.rooms) {
    const id = uid();
    rooms.set(r.id, id);
    r.id = id;
  }
  for (const k of ['walls', 'openings', 'labels']) for (const x of scene[k] || []) x.id = uid();
  for (const o of scene.objects) {
    o.id = uid();
    if (o.theme) {
      if (rooms.has(o.theme)) o.theme = rooms.get(o.theme);
      else delete o.theme;
    }
    if (o.fill) {
      if (fills.has(o.fill)) o.fill = fills.get(o.fill);
      else delete o.fill;
    }
  }
  scene.seed = Math.floor(random() * 1e9);
  return scene;
}

// --- Füllbereiche -----------------------------------------------------------------------------------------------------

const inShape = (s, x, y) => (s.k === 'rect' ? x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h : ((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2 <= 1);
export const shapeBox = (s) => (s.k === 'rect' ? [s.x, s.y, s.w, s.h] : [s.cx - s.rx, s.cy - s.ry, 2 * s.rx, 2 * s.ry]);

/** Was ein Füllbereich streut: Grunddurchmesser (bei 70 px je Feld), Größenstreuung, Abstand, Anteil je Sorte. */
export const FILL_KINDS = {
  trees: [['tree', 200, [0.75, 1.35], 0.36, 1]],
  bushes: [['bush', 90, [0.8, 1.2], 0.55, 1]],
  rocks: [['rock', 90, [0.5, 1.25], 0.9, 1]],
  mixed: [['tree', 200, [0.75, 1.35], 0.36, 1], ['bush', 90, [0.8, 1.2], 0.55, 0.45], ['rock', 90, [0.5, 1.1], 0.9, 0.2]],
};

/**
 * Außenseite geschlossener Mauerringe: Für jede Strecke, die zu einem geschlossenen Zug gehört, die Richtung nach außen
 * (Einheitsvektor). Offene Züge und Verzweigungen bleiben ohne Eintrag – dort stehen Zinnen auf beiden Seiten.
 * walls: [{ x1, y1, x2, y2 }], liefert Map(Strecke → [nx, ny]).
 */
export function ringOutsides(walls) {
  const key = (x, y) => `${Math.round(x)}|${Math.round(y)}`;
  const at = new Map();
  for (const w of walls) for (const k of [key(w.x1, w.y1), key(w.x2, w.y2)]) at.set(k, [...(at.get(k) || []), w]);
  const out = new Map();
  const seen = new Set();
  for (const first of walls) {
    if (seen.has(first)) continue;
    // dem Zug folgen, solange es an jedem Punkt genau eine Fortsetzung gibt
    const loop = [];
    let w = first;
    let from = key(first.x1, first.y1);
    let closed = false;
    for (let guard = 0; guard <= walls.length; guard++) {
      const a = key(w.x1, w.y1);
      const fwd = a === from;
      loop.push([w, fwd]);
      seen.add(w);
      const end = fwd ? key(w.x2, w.y2) : a;
      const next = (at.get(end) || []).filter((q) => q !== w);
      if (next.length !== 1) break;
      if (next[0] === first) {
        closed = (at.get(key(first.x1, first.y1)) || []).length === 2;
        break;
      }
      if (seen.has(next[0])) break;
      from = end;
      w = next[0];
    }
    if (!closed || loop.length < 3) continue;
    const pts = loop.map(([q, fwd]) => (fwd ? [q.x1, q.y1] : [q.x2, q.y2]));
    const cw = polyArea(pts) > 0;
    for (const [q, fwd] of loop) {
      const dx = (fwd ? 1 : -1) * (q.x2 - q.x1);
      const dy = (fwd ? 1 : -1) * (q.y2 - q.y1);
      const L = Math.hypot(dx, dy) || 1;
      out.set(q, cw ? [dy / L, -dx / L] : [-dy / L, dx / L]);
    }
  }
  return out;
}

/**
 * Linie rund um einen geschlossenen Mauerring, um dist nach außen versetzt (für einen Graben): Punkte des Zugs, zu dem
 * die Strecke seg gehört – oder null, wenn der Zug offen ist oder sich verzweigt.
 */
export function ringAround(walls, seg, dist) {
  const outs = ringOutsides(walls);
  if (!outs.has(seg)) return null;
  const key = (x, y) => `${Math.round(x)}|${Math.round(y)}`;
  // Ecken des Rings in Umlaufrichtung
  const pts = [[seg.x1, seg.y1], [seg.x2, seg.y2]];
  const used = new Set([seg]);
  for (let guard = 0; guard < walls.length; guard++) {
    const end = pts[pts.length - 1];
    const next = walls.find((w) => !used.has(w) && outs.has(w) && (key(w.x1, w.y1) === key(end[0], end[1]) || key(w.x2, w.y2) === key(end[0], end[1])));
    if (!next) break;
    used.add(next);
    pts.push(key(next.x1, next.y1) === key(end[0], end[1]) ? [next.x2, next.y2] : [next.x1, next.y1]);
  }
  pts.pop(); // der letzte Punkt ist wieder der erste
  if (pts.length < 3) return null;
  const sign = polyArea(pts) > 0 ? 1 : -1;
  const n = pts.length;
  const ring = pts.map((p, i) => {
    // an der Ecke entlang der Winkelhalbierenden hinaus – so bleibt der Abstand zu beiden Mauern gleich
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const n1 = [(p[1] - a[1]) / (Math.hypot(p[0] - a[0], p[1] - a[1]) || 1), -(p[0] - a[0]) / (Math.hypot(p[0] - a[0], p[1] - a[1]) || 1)];
    const n2 = [(b[1] - p[1]) / (Math.hypot(b[0] - p[0], b[1] - p[1]) || 1), -(b[0] - p[0]) / (Math.hypot(b[0] - p[0], b[1] - p[1]) || 1)];
    const mx = n1[0] + n2[0];
    const my = n1[1] + n2[1];
    const L = Math.hypot(mx, my) || 1;
    const k = Math.min(2.2, 1 / Math.max(0.3, (mx / L) * n1[0] + (my / L) * n1[1]));
    return [p[0] + (mx / L) * dist * k * sign, p[1] + (my / L) * dist * k * sign];
  });
  // dichter abtasten, damit der Pinsel die Ecken weich nimmt
  const out = [];
  for (let i = 0; i <= n; i++) {
    const p = ring[i % n];
    const q = ring[(i + 1) % n];
    const steps = i === n ? 1 : Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 60));
    for (let j = 0; j < steps; j++) out.push([Math.round(p[0] + ((q[0] - p[0]) * j) / steps), Math.round(p[1] + ((q[1] - p[1]) * j) / steps)]);
    if (i === n) break;
  }
  return out;
}

/** Abstand einer Stelle im Inneren zum Rand der Form (Rechteck: zur nächsten Kante; Ellipse: genähert). */
function edgeDepth(sh, x, y) {
  if (sh.k === 'rect') return Math.min(x - sh.x, sh.x + sh.w - x, y - sh.y, sh.y + sh.h - y);
  const q = Math.hypot((x - sh.cx) / sh.rx, (y - sh.cy) / sh.ry);
  return (1 - q) * Math.min(sh.rx, sh.ry);
}

/**
 * Liegt ein Punkt in einem gedrehten Rechteck? rects: [{ x, y, hw, hh, rot (Grad) }] – z. B. die Grundflächen schon
 * gesetzter Gebäude, um die ein Häuserviertel herumgebaut wird.
 */
export function inRects(rects, px, py) {
  for (const q of rects) {
    const a = (-q.rot * Math.PI) / 180;
    const dx = (px - q.x) * Math.cos(a) - (py - q.y) * Math.sin(a);
    const dy = (px - q.x) * Math.sin(a) + (py - q.y) * Math.cos(a);
    if (Math.abs(dx) < q.hw && Math.abs(dy) < q.hh) return true;
  }
  return false;
}

/**
 * Stadthäuser (Katalog „Stadthaus“): Grundfläche je Form – 0–2 Satteldach in drei Größen, 3 Walmdach, 4 Satteldach
 * mit Anbau, 5 Winkelhaus. Die Variante eines Hauses steckt in einer Zahl: Dachton (0–6), Form, Kleinigkeiten.
 */
export const TOWN_SHAPES = [[84, 58], [98, 64], [116, 66], [104, 72], [108, 78], [104, 96]];
export const TOWN_TONES = 7;
export const townVariant = (v) => ({ tone: v % TOWN_TONES, shape: Math.floor(v / TOWN_TONES) % TOWN_SHAPES.length, seed: Math.floor(v / (TOWN_TONES * TOWN_SHAPES.length)) % 4 });
// Anteile: Ziegel altrot, orange, braunrot, ocker, Holzschindel, heller Schiefer, Stroh
const TONE_SHARE = [0.25, 0.21, 0.14, 0.07, 0.13, 0.11, 0.09];
const SHAPE_SHARE = [0.2, 0.27, 0.16, 0.22, 0.08, 0.07];
const weighted = (shares, q) => {
  for (let i = 0; i < shares.length; i++) if ((q -= shares[i]) < 0) return i;
  return 0;
};

/**
 * Straßen oder Wege so, wie sie nach dem Radieren noch daliegen: Pinselstriche einer Geländeliste (in Malreihenfolge),
 * zerlegt an den Stellen, die ein späterer Radierstrich (sub) überdeckt. Liefert [{ pts, r }].
 */
export function cutStreets(list) {
  const out = [];
  const covers = (e, x, y) => {
    if (e.k === 'rect' || e.k === 'ellipse') return inShape(e, x, y);
    const pts = e.pts || [];
    if (pts.length === 1) return Math.hypot(pts[0][0] - x, pts[0][1] - y) <= e.r;
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const dx = pts[i][0] - x1;
      const dy = pts[i][1] - y1;
      const u = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x1 + dx * u - x, y1 + dy * u - y) <= e.r) return true;
    }
    return false;
  };
  list.forEach((st, i) => {
    if (st.sub || !st.pts || st.pts.length < 2) return;
    const erasers = list.slice(i + 1).filter((e) => e.sub);
    if (!erasers.length) return out.push({ pts: st.pts, r: st.r });
    // dicht abtasten, damit auch ein Radierstrich mitten auf einer langen Geraden trennt
    let run = [];
    for (const [x, y] of resample(st.pts, 16, false)) {
      if (erasers.some((e) => covers(e, x, y))) {
        if (run.length > 1) out.push({ pts: run, r: st.r });
        run = [];
      } else run.push([x, y]);
    }
    if (run.length > 1) out.push({ pts: run, r: st.r });
  });
  return out;
}

/**
 * Häuserviertel: füllt die Fläche mit Stadthäusern. Zuerst entlang der Straßen und Wege (streets: [{ pts, r }]) –
 * beiderseits dicht an der Kante, Front zur Straße –, dahinter in Zeilen: je zwei teilen sich einen Hof, zwischen den
 * Doppelzeilen bleibt eine Gasse; die Häuser stehen mit der Front an der Gasse, der First läuft meist mit der Zeile.
 * Nachbarn haben oft denselben Dachton – sonst wirkt ein Viertel wie Konfetti. fill.angle dreht das Viertel,
 * fill.size ist die Hausgröße, fill.density rückt alles enger zusammen. Wo blocked(x, y, r, 'house') etwas einzuwenden
 * hat (Wasser, Straße, Weg, Mauer, Geländestufe), bleibt eine Lücke. Gleicher Startwert ergibt dasselbe Viertel.
 * opts.tree (Größe der Natur im Kartenmaßstab, z. B. 0.4): in Restflächen zwischen den Häusern, in die kein Haus
 * mehr passt, wachsen Bäume – Höfe und Gärten statt kahler Zwickel.
 */
export function scatterHouses(fill, blocked = () => false, streets = [], opts = {}) {
  const { R, rnd } = rng(fill.seed >>> 0);
  const s = fill.size ?? 1;
  const dens = Math.max(0.3, fill.density ?? 1);
  const deg = fill.angle || 0;
  const ang = (deg * Math.PI) / 180;
  const [bx, by, bw, bh] = shapeBox(fill.shape);
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const half = Math.hypot(bw, bh) / 2;
  const depth = 84 * s; // Tiefe einer Zeile; das tiefere Winkelhaus ragt in den Hof
  const lane = (18 * s) / dens + 6;
  const yard = (3 * s) / dens + 13 * s; // Platz für Anbauten und die Flügel der Winkelhäuser
  const out = [];
  const placed = []; // Grundflächen der schon gesetzten Häuser
  // Deckel: mehr Häuser in einem Bereich machen den Kartenbauer träge
  const MAX = 600;
  /**
   * Haus setzen, wenn es passt: Mitte (x, y), Grundfläche fw × fd im um frame Grad gedrehten Rahmen. Geprüft wird die
   * Grundfläche selbst (Mitte, Ecken, Kantenmitten) – so rücken Häuser bis an den Straßenrand.
   */
  const put = (x, y, frame, fw, fd, rot, v) => {
    const a = (frame * Math.PI) / 180;
    const at = (u, w) => [x + u * Math.cos(a) - w * Math.sin(a), y + u * Math.sin(a) + w * Math.cos(a)];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => at((p * fw) / 2, (q * fd) / 2));
    if (!inShape(fill.shape, x, y) || corners.some(([px, py]) => !inShape(fill.shape, px, py))) return false;
    const foot = [[x, y], ...corners, ...corners.map((c, i) => [(c[0] + corners[(i + 1) % 4][0]) / 2, (c[1] + corners[(i + 1) % 4][1]) / 2])];
    if (placed.length && (foot.some(([px, py]) => inRects(placed, px, py)) || placed.some((q) => Math.hypot(q.x - x, q.y - y) < 130 * s && inRects([{ x, y, hw: fw / 2, hh: fd / 2, rot: frame }], q.x, q.y)))) return false;
    if (blocked(x, y, Math.max(fw, fd) * 0.5, 'house', foot)) return false;
    out.push({ t: 'townHouse', x: Math.round(x), y: Math.round(y), rot: Math.round(((rot % 360) + 360) % 360), s: Math.round(s * 100) / 100, v });
    placed.push({ x, y, hw: fw / 2 + 2, hh: fd / 2 + 2, rot: frame });
    return true;
  };
  const variant = (tone, shape) => tone + TOWN_TONES * shape + TOWN_TONES * TOWN_SHAPES.length * Math.floor(R() * 4);

  // So tief reichen die Zeilen, die sich an einer Straße ausrichten: zwei Doppelzeilen
  const ROWS = 4;
  const reach = (ROWS / 2) * (2 * depth + yard + lane);
  // Straßen und Wege als Linien mit Lauflängen. Gemalte Striche haben alle paar Pixel einen Punkt: ausdünnen, und
  // nur Straßen nehmen, die in die Nähe der Fläche kommen – sonst rechnet ein großes Viertel sekundenlang.
  const far = reach + 140 * s;
  const close = ([x, y]) => x > bx - far && x < bx + bw + far && y > by - far && y < by + bh + far;
  const lines = streets.filter((st) => (st.pts || []).length >= 2 && st.r <= 64 && st.pts.some(close)).map((st) => {
    const pts = simplify(st.pts, 2);
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = len[len.length - 1];
    const along = (d) => {
      let i = 1;
      while (i < len.length - 1 && len[i] < d) i++;
      const t = (d - len[i - 1]) / (len[i] - len[i - 1] || 1);
      const a = pts[i - 1];
      const b = pts[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
    };
    return { r: st.r, pts, total, along };
  }).filter((st) => st.total > 0);
  /** Nächste Straße zu einem Punkt: Abstand zur Straßenkante, Richtung der Straße dort und die Seite (±1). */
  const nearest = (x, y) => {
    let best = null;
    for (const st of lines) {
      for (let i = 1; i < st.pts.length; i++) {
        const [x1, y1] = st.pts[i - 1];
        const dx = st.pts[i][0] - x1;
        const dy = st.pts[i][1] - y1;
        const L2 = dx * dx + dy * dy;
        if (!L2) continue;
        const u = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L2));
        const d = Math.hypot(x1 + dx * u - x, y1 + dy * u - y) - st.r;
        if (!best || d < best.d) best = { d, st, ang: Math.atan2(dy, dx), side: dx * (y - y1) - dy * (x - x1) > 0 ? 1 : -1 };
      }
    }
    return best;
  };

  // 1. Entlang jeder Straße und jedes Wegs: vorn die Häuserfront dicht an der Kante, Front zur Straße – so wird aus
  //    der Straße eine Häuserzeile statt eines Wegs über die Wiese. Dahinter folgen weitere Zeilen in derselben
  //    Richtung (Rücken an Rücken über einen Hof, dann eine Gasse): ein Baublock zwischen zwei Straßen hat so nur
  //    die Richtungen seiner Straßen. Erst alle Fronten, dann Zeile um Zeile nach hinten.
  for (let k = 0; k < ROWS; k++) {
    const base = Math.floor(k / 2) * (2 * depth + yard + lane) + (k % 2 ? depth + yard : 0);
    for (const st of lines) {
      for (const side of [1, -1]) {
        let tone = weighted(TONE_SHARE, R());
        for (let d = rnd(4, 40) * s; d < st.total && out.length < MAX; ) {
          if (R() > 0.6) tone = weighted(TONE_SHARE, R());
          const shape = weighted(SHAPE_SHARE.slice(0, 5), R() * 0.93);
          const turned = shape === 0 && R() < 0.3;
          const [w0, d0] = TOWN_SHAPES[shape];
          const fw = (turned ? d0 : w0) * s;
          const fd = (turned ? w0 : d0) * s;
          const [px, py, ta] = st.along(Math.min(st.total, d + fw / 2));
          // gerade Zeilen stehen mit der Front zur Straße hin, ungerade mit der Front an der Gasse dahinter
          const off = st.r + 3 + base + (k % 2 ? depth - fd / 2 : fd / 2);
          const frame = (ta * 180) / Math.PI;
          const x = px - Math.sin(ta) * side * off;
          const y = py + Math.cos(ta) * side * off;
          const face = (side > 0) === !(k % 2) ? 180 : 0;
          const jitter = rnd(-2, 2);
          const vi = variant(tone, shape);
          // hintere Zeilen nur dort, wo keine andere Straße näher liegt – deren Zeilen stehen dort
          const ok = inShape(fill.shape, x, y) && (k === 0 || !((nearest(x, y)?.d ?? 1e9) < off - st.r - fd / 2 - 14)) && put(x, y, frame, fw, fd, frame + face + (turned ? 90 : 0) + jitter, vi);
          d += ok ? fw + (R() < 0.4 ? 1 : (rnd(4, 9) * s) / dens) : 24 * s;
        }
      }
    }
  }

  // 2. Abseits der Straßen Zeile um Zeile: je zwei Zeilen teilen sich einen Hof, zwischen den Doppelzeilen bleibt
  //    eine Gasse
  const world = (u, v) => [cx + u * Math.cos(ang) - v * Math.sin(ang), cy + u * Math.sin(ang) + v * Math.cos(ang)];
  let row = 0;
  for (let v = -half + rnd(0, depth * 0.5); v < half && out.length < MAX; row++) {
    let tone = weighted(TONE_SHARE, R());
    for (let u = -half + rnd(0, 60) * s; u < half && out.length < MAX; ) {
      if (R() > 0.6) tone = weighted(TONE_SHARE, R());
      let shape = weighted(SHAPE_SHARE, R());
      // Winkelhäuser nur in jeder zweiten Zeile – sonst stießen zwei mit den Flügeln im Hof zusammen
      if (shape === 5 && row % 2) shape = 3;
      // manche einfachen Häuser stehen mit dem Giebel zur Gasse
      const turned = shape === 0 && R() < 0.5;
      const [w0, d0] = TOWN_SHAPES[shape];
      const fw = (turned ? d0 : w0) * s;
      const fd = (turned ? w0 : d0) * s;
      const lu = u + fw / 2;
      // Front an der Gasse: gerade Zeilen stehen an der oberen, ungerade an der unteren Kante ihres Streifens
      const lv = row % 2 ? v + depth - fd / 2 : v + fd / 2;
      u += fw + (R() < 0.35 ? 1 : (rnd(4, 9) * s) / dens);
      const jitter = rnd(-3, 3);
      const vi = variant(tone, shape);
      if (R() < 0.04) continue; // freies Grundstück
      const [x, y] = world(lu, lv);
      // nahe einer Straße gilt deren Richtung – dort stehen schon ihre Zeilen, Reste füllt Schritt 3
      if (lines.length && inShape(fill.shape, x, y) && (nearest(x, y)?.d ?? 1e9) < reach) continue;
      // Anbau und Flügel zeigen in den Hof
      put(x, y, deg, fw, fd, deg + (row % 2 ? 0 : 180) + (turned ? 90 : 0) + jitter, vi);
    }
    v += depth + (row % 2 ? lane : yard);
  }

  // 3. Lücken schließen: zwischen den Zeilen bleiben Restflächen – dort passen noch kleine Häuser hinein. Sie
  //    übernehmen exakt die Richtung der nächsten Zeile (keine Zwischenwinkel) und schauen zur Straße hin.
  const rows = placed.slice();
  const neighbour = (x, y) => {
    let best = null;
    let bd = (320 * s) ** 2;
    for (const q of rows) {
      const d = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (d < bd) (bd = d), (best = q);
    }
    return best;
  };
  const small = TOWN_SHAPES[0];
  const sw = small[0] * s;
  const sd = small[1] * s;
  // In halben Schritten abtasten: die Häuser stehen gedreht zum Raster, da passt oft erst die versetzte Stelle. Mit
  // etwas Luft ringsum (gw, gd), damit sich Lückenhäuser nicht an die Zeilen quetschen.
  const gw = sw + 7 * s;
  const gd = sd + 7 * s;
  for (let v = -half + sd / 2; v < half && out.length < MAX; v += (sd + 10 * s) / 2) {
    let tone = weighted(TONE_SHARE, R());
    for (let u = -half + rnd(0, sw); u < half && out.length < MAX; u += (sw + 6 * s) / 2) {
      if (R() > 0.8) tone = weighted(TONE_SHARE, R());
      const [x, y] = world(u, v);
      const flip = R() < 0.5;
      const jitter = rnd(-3, 3);
      const vi = variant(tone, 0);
      if (!inShape(fill.shape, x, y)) continue;
      const near = lines.length ? nearest(x, y) : null;
      const nb = near && near.d < reach + 60 * s ? neighbour(x, y) : null;
      if (nb) {
        // Front zur Straße: die Seite des Rahmens wählen, die der Straße zugewandt ist
        const fa = (nb.rot * Math.PI) / 180;
        const toward = Math.cos(fa - near.ang) * near.side > 0 ? 180 : 0;
        put(x, y, nb.rot, gw, gd, nb.rot + toward + jitter, vi);
      } else if (near && near.d < reach + 60 * s) {
        const frame = (near.ang * 180) / Math.PI;
        put(x, y, frame, gw, gd, frame + (near.side > 0 ? 180 : 0) + jitter, vi);
      } else put(x, y, deg, gw, gd, deg + (flip ? 180 : 0) + jitter, vi);
    }
  }

  // 4. Was jetzt noch frei ist, ist für ein Haus zu klein oder zu schief: dort stehen Bäume (Hof, Garten)
  const trees = [];
  if (opts.tree > 0 && placed.length) {
    const z = opts.tree;
    const step = 46 * s;
    for (let v = -half + step / 2; v < half && trees.length < 160; v += step) {
      for (let u = -half + rnd(0, step); u < half && trees.length < 160; u += step) {
        const [x, y] = world(u + rnd(-12, 12) * s, v + rnd(-12, 12) * s);
        // Hofbäume sind kleiner als Waldbäume; wo auch die nicht passen, wächst ein Busch
        const kinds = [['tree', 200, rnd(0.55, 0.9)], ['bush', 90, rnd(0.8, 1.2)]];
        const vv = Math.floor(R() * 1e6);
        const keep = R() < 0.75;
        if (!keep || !inShape(fill.shape, x, y) || edgeDepth(fill.shape, x, y) < 40 * s) continue;
        // nur zwischen Häusern, nicht auf der Wiese neben dem Viertel
        let nearHouse = false;
        for (const q of placed) {
          if ((q.x - x) ** 2 + (q.y - y) ** 2 < (150 * s) ** 2) {
            nearHouse = true;
            break;
          }
        }
        if (!nearHouse) continue;
        for (const [t, base, ts] of kinds) {
          const d = base * z * ts;
          const rr = d * 0.56; // die Krone ist breiter als der Stamm: etwas Luft zu den Dächern
          const ring = [[x, y]];
          for (let k = 0; k < 8; k++) ring.push([x + Math.cos(k * 0.785) * rr, y + Math.sin(k * 0.785) * rr]);
          if (ring.some(([px, py]) => inRects(placed, px, py)) || trees.some((o) => Math.hypot(o.x - x, o.y - y) < (o.d + d) * 0.45)) continue;
          // wie ein Haus geprüft (mit Grundfläche): so bleibt Abstand zu Mauern und gesetzten Gebäuden
          if (blocked(x, y, rr, t, ring)) continue;
          trees.push({ t, x: Math.round(x), y: Math.round(y), s: Math.round(ts * z * 100) / 100, v: vv, rot: 0, d });
          break;
        }
      }
    }
  }
  for (const { d, ...o } of trees) out.push(o);
  return out.map((o, i) => ({ id: `${fill.id}-${i}`, ...o, fill: fill.id }));
}

/**
 * Inhalt eines Füllbereichs erzeugen: Bäume, Büsche oder Felsen locker verteilt – nur dort, wo blocked(x, y, r, t)
 * nichts einzuwenden hat (Wasser, Gebäude, Wege, Felskanten). Gleicher Startwert ergibt dieselbe Verteilung.
 */
export function scatter(fill, cell, blocked = () => false) {
  const { R, rnd } = rng(fill.seed >>> 0);
  const cs = cell / 70;
  const [bx, by, bw, bh] = shapeBox(fill.shape);
  const area = fill.shape.k === 'rect' ? bw * bh : (Math.PI * bw * bh) / 4;
  const out = [];
  for (const [t, base, [s0, s1], gap, share] of FILL_KINDS[fill.kind] || FILL_KINDS.trees) {
    const mean = base * cs * ((s0 + s1) / 2);
    const want = Math.max(1, Math.round(((area / (mean * mean * (t === 'tree' ? 0.5 : 1.6))) * (fill.density ?? 1) * share)));
    let placed = 0;
    for (let guard = 0; placed < want && guard < want * 60; guard++) {
      const s = rnd(s0, s1);
      const d = base * cs * s;
      const x = bx + R() * bw;
      const y = by + R() * bh;
      if (!inShape(fill.shape, x, y)) continue;
      // Zum Rand hin dünner: so endet ein Wald nicht an einer geraden Kante
      const edge = edgeDepth(fill.shape, x, y);
      const fade = 55 * cs + d * 0.3;
      if (edge < fade && R() > 0.25 + (0.75 * edge) / fade) continue;
      if (blocked(x, y, d * 0.42, t)) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.y - y) < (o.d + d) * (o.t === t ? gap : 0.3))) continue;
      out.push({ t, x: Math.round(x), y: Math.round(y), s: Math.round(s * 100) / 100, v: Math.floor(R() * 1e6), rot: t === 'rock' ? Math.round(rnd(0, 360)) : 0, d });
      placed++;
    }
  }
  return out.map(({ d, ...o }, i) => ({ id: `${fill.id}-${i}`, ...o, fill: fill.id }));
}
