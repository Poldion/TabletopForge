// Kartenbauer: zeichnet aus einer Szene (Gelände, Räume, Gegenstände) das Kartenbild.
// Aufbau in Stufen, die einzeln zwischengespeichert werden: Gelände (langsam, Bildpunkt für Bildpunkt gemalt) →
// Gebäude (Böden, Wände, deren Schatten) → Zusammensetzen mit Gegenständen und einem gemeinsamen Schattenwurf.
import { CELL, rng, hashStr, valueNoise, tileField, boxBlur, chamfer, marchingSquares, chaikin, resample, normals, buildingOutline, wallPieces, arcPieces, inRoom, isRuinWall, ruinPieces, ruinArcPieces } from './mb-geom.js';
import { INK, LIGHT, SHAPES, biomeOf, sprite } from './mb-assets.js';
import { drawDoor } from './doors.js';

const WT = 14; // Wandstärke Stein
const BT = 8; // Balkenstärke Holz
const RT = 30; // Stärke einer Burgmauer
const TR = 38; // Halbmesser der Türme an den Enden einer Burgmauer
const PT = 15; // Stärke einer Palisade
const K = 4; // Geländefelder in Viertel-Auflösung
const PAD = 10; // Rand der Geländefelder (Zellen), damit Ufer über den Kartenrand hinauslaufen
const TS = 1024; // Kantenlänge der kachelbaren Rauschfelder
const TM = TS - 1;

let FA = null; // Ausfransen der Ränder
let FB = null; // Spritzer am Rand
function tiles() {
  if (!FA) {
    FA = tileField(5, TS, 22, 2);
    FB = tileField(8, TS, 93, 2);
  }
}
const n1src = valueNoise(21);
const coarseSrc = valueNoise(3);
/** Große, ruhige Farbzonen (0…1). */
const coarse = (x, y, s = 0) => {
  const v = ((coarseSrc(x / 380 + s, y / 380 + s * 1.3) * 2 + coarseSrc(x / 190 + 17.3 + s, y / 190 + 9.1)) / 3 - 0.5) * 1.7 + 0.5;
  return v < 0 ? 0 : v > 1 ? 1 : v;
};

const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb = (h) => hx(h).join(',');
function mix3(a, b, t, out) {
  const a0 = a[0];
  const a1 = a[1];
  const a2 = a[2];
  out[0] = a0 + (b[0] - a0) * t;
  out[1] = a1 + (b[1] - a1) * t;
  out[2] = a2 + (b[2] - a2) * t;
  return out;
}
function ramp(cols, t, out) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const f = t * (cols.length - 1);
  const i = Math.min(cols.length - 2, Math.floor(f));
  return mix3(cols[i], cols[i + 1], f - i, out);
}
const css = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  return cv;
}
function soft(c, x, y, r, col, a = 1, core = 0.45) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${col},${a})`);
  g.addColorStop(core, `rgba(${col},${a * 0.9})`);
  g.addColorStop(1, `rgba(${col},0)`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, 2 * r, 2 * r);
}
function trace(c, pts, closed = true) {
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  if (closed) c.closePath();
}
function poly(c, pts) {
  c.beginPath();
  trace(c, pts);
}
/** Tuschelinie wie von Hand: leicht zittrig, wechselnde Strichstärke, auf Wunsch mit kleinen Lücken (breaks = Anteil). */
function ink(c, P, pts, w = 2, color = INK, closed = false, breaks = 0) {
  const src = closed ? [...pts, pts[0]] : pts;
  const s = P.rnd(0, 900);
  c.strokeStyle = color;
  c.lineCap = 'round';
  let prev = null;
  let i = 0;
  let carry = 0;
  for (let k = 0; k < src.length - 1; k++) {
    const [x0, y0] = src[k];
    const [x1, y1] = src[k + 1];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 1e-6) continue;
    const nx = (y0 - y1) / L;
    const ny = (x1 - x0) / L;
    let t = carry;
    for (; t <= L; t += 6, i++) {
      const j = (n1src(i * 0.33 + s, 1.3) - 0.5) * 1.7;
      const p = [x0 + ((x1 - x0) * t) / L + nx * j, y0 + ((y1 - y0) * t) / L + ny * j];
      if (prev && !(breaks && n1src(i * 0.19 + s, 9.1) > 1 - breaks)) {
        c.lineWidth = w * (0.7 + 0.62 * n1src(i * 0.24 + s, 5.5));
        c.beginPath();
        c.moveTo(prev[0], prev[1]);
        c.lineTo(p[0], p[1]);
        c.stroke();
      }
      prev = p;
    }
    carry = t - L;
  }
}

// --- Flächen aus Formen ------------------------------------------------------------------------------------------------
/** Gezeichnete Formen (Pinselstriche, Rechtecke, Ellipsen) als weiße Fläche; „sub“ radiert. */
function drawShapes(m, shapes, grow = 0) {
  m.fillStyle = m.strokeStyle = '#fff';
  m.lineCap = m.lineJoin = 'round';
  for (const s of shapes) {
    m.globalCompositeOperation = s.sub ? 'destination-out' : 'source-over';
    m.beginPath();
    if (s.k === 'rect') m.rect(s.x - grow, s.y - grow, s.w + 2 * grow, s.h + 2 * grow);
    else if (s.k === 'ellipse') m.ellipse(s.cx, s.cy, s.rx + grow, s.ry + grow, 0, 0, 7);
    else if (s.pts.length === 1) m.arc(s.pts[0][0], s.pts[0][1], s.r + grow, 0, 7);
    else {
      trace(m, s.pts, false);
      m.lineWidth = 2 * (s.r + grow);
      m.stroke();
      continue;
    }
    m.fill();
  }
  m.globalCompositeOperation = 'source-over';
}
function shapesBox(shapes, margin, W, H) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x, y, r) => {
    x0 = Math.min(x0, x - r);
    y0 = Math.min(y0, y - r);
    x1 = Math.max(x1, x + r);
    y1 = Math.max(y1, y + r);
  };
  for (const s of shapes) {
    if (s.sub) continue;
    if (s.k === 'rect') (add(s.x, s.y, 0), add(s.x + s.w, s.y + s.h, 0));
    else if (s.k === 'ellipse') (add(s.cx - s.rx, s.cy - s.ry, 0), add(s.cx + s.rx, s.cy + s.ry, 0));
    else for (const p of s.pts) add(p[0], p[1], s.r);
  }
  x0 = Math.max(0, Math.floor(x0 - margin));
  y0 = Math.max(0, Math.floor(y0 - margin));
  x1 = Math.min(W, Math.ceil(x1 + margin));
  y1 = Math.min(H, Math.ceil(y1 + margin));
  return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
}
/** Formen als geglättetes Feld in Viertel-Auflösung (mit Rand); der äußerste Ring ist leer, damit Umrisse schließen. */
function shapeField(shapes, W, H, blur = 2) {
  const gw = Math.ceil(W / K) + 2 * PAD;
  const gh = Math.ceil(H / K) + 2 * PAD;
  const cv = canvas(gw, gh);
  const m = cv.getContext('2d', { willReadFrequently: true });
  m.scale(1 / K, 1 / K);
  m.translate(PAD * K, PAD * K);
  drawShapes(m, shapes);
  const d = m.getImageData(0, 0, gw, gh).data;
  const F = new Float32Array(gw * gh);
  for (let p = 0; p < F.length; p++) F[p] = d[p * 4 + 3] / 255;
  if (blur) boxBlur(F, gw, gh, blur, 2);
  for (let x = 0; x < gw; x++) F[x] = F[(gh - 1) * gw + x] = 0;
  for (let y = 0; y < gh; y++) F[y * gw] = F[y * gw + gw - 1] = 0;
  return { F, gw, gh };
}
function fieldAt(f, x, y) {
  const gx = Math.min(f.gw - 1.001, Math.max(0, x / K + PAD));
  const gy = Math.min(f.gh - 1.001, Math.max(0, y / K + PAD));
  const xi = Math.floor(gx);
  const yi = Math.floor(gy);
  const fx = gx - xi;
  const fy = gy - yi;
  const p = yi * f.gw + xi;
  const a = f.F[p];
  const b = f.F[p + 1];
  const c = f.F[p + f.gw];
  const d = f.F[p + f.gw + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** Umrisse eines Felds in Kartenpixeln: geglättet, gleichmäßig abgetastet, Normalen zeigen aus der Fläche heraus. */
function contours(f) {
  const out = [];
  for (const raw of marchingSquares(f.F, f.gw, f.gh, 0.5)) {
    let pts = resample(chaikin(raw.map(([x, y]) => [(x - PAD) * K, (y - PAD) * K]), true, 2), 6, true);
    if (pts.length < 8) continue;
    let nrm = normals(pts, true);
    let vote = 0;
    for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 12))) {
      vote += fieldAt(f, pts[i][0] + nrm[i][0] * 6, pts[i][1] + nrm[i][1] * 6) < fieldAt(f, pts[i][0] - nrm[i][0] * 6, pts[i][1] - nrm[i][1] * 6) ? 1 : -1;
    }
    if (vote < 0) {
      pts = pts.reverse();
      nrm = normals(pts, true);
    }
    out.push({ pts, nrm, seed: (pts[0][0] * 7.3 + pts[0][1] * 3.1) % 500 });
  }
  return out;
}
/** Weiche Fläche für eine Maske (Weichzeichnen über den Schatten-Trick – läuft in jedem Browser). */
function blurShapes(m, shapes, grow, blur) {
  const cv = canvas(m.canvas.width, m.canvas.height);
  const t = cv.getContext('2d');
  t.setTransform(m.getTransform());
  drawShapes(t, shapes, grow);
  m.save();
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.shadowColor = '#fff';
  m.shadowBlur = blur;
  m.shadowOffsetX = 30000;
  m.drawImage(cv, -30000, 0);
  m.restore();
}
/**
 * Gemalte Geländeschicht im Ausschnitt box: drawMask zeichnet die Fläche weich (Deckkraft = Dichte). Der Rand entsteht
 * per Schwelle aus Dichte plus Rauschen – hart und ausgefranst mit abgesprengten Flecken (edge klein) oder weich
 * auslaufend (edge groß). shade(v, x, y, out) liefert die Farbe; v = Abstand zur Schwelle (0 = Rand).
 */
function paintMask(c, box, drawMask, shade, o = {}) {
  if (!box) return;
  tiles();
  const [bx, by, bw, bh] = box;
  const cv = canvas(bw, bh);
  const m = cv.getContext('2d', { willReadFrequently: true });
  m.translate(-bx, -by);
  drawMask(m);
  m.setTransform(1, 0, 0, 1, 0, 0);
  const img = m.getImageData(0, 0, bw, bh);
  const d = img.data;
  const thr = o.thr ?? 0.42;
  const edge = o.edge ?? 0.05;
  const warp = (o.warp ?? 0.45) / 255;
  const fine = (o.fine ?? 0.3) / 255;
  const amax = (o.alpha ?? 1) * 255;
  const ox = o.ox | 0;
  const oy = o.oy | 0;
  const out = [0, 0, 0];
  for (let y = 0, i = 0; y < bh; y++) {
    const ra = ((y + by + oy) & TM) * TS;
    const rb = ((y + by + oy * 3 + 517) & TM) * TS;
    for (let x = 0; x < bw; x++, i += 4) {
      const a = d[i + 3];
      if (a < 3) {
        d[i + 3] = 0;
        continue;
      }
      const v = a / 255 + (FA[ra + ((x + bx + ox) & TM)] - 127.5) * warp + (FB[rb + ((x + bx + ox * 3 + 211) & TM)] - 127.5) * fine - thr;
      if (v <= 0) {
        d[i + 3] = 0;
        continue;
      }
      shade(v, x + bx, y + by, out);
      d[i] = out[0] > 255 ? 255 : out[0];
      d[i + 1] = out[1] > 255 ? 255 : out[1];
      d[i + 2] = out[2] > 255 ? 255 : out[2];
      d[i + 3] = (v >= edge ? 1 : v / edge) * amax;
    }
  }
  m.putImageData(img, 0, 0);
  c.drawImage(cv, bx, by);
}
const fa = (x, y) => FA[((y & TM) * TS) + (x & TM)] / 255;

// --- Gelände ----------------------------------------------------------------------------------------------------------
function groundColors(B) {
  const g = B.ground.map(hx);
  return [g[0], g[1], g[1], g[2], g[2], g[3]];
}
function drawGround(c, W, H, B, P, seed) {
  const GR = groundColors(B);
  const s = (seed % 97) * 0.731;
  const gw = Math.ceil(W / K);
  const gh = Math.ceil(H / K);
  const cv = canvas(gw, gh);
  const m = cv.getContext('2d');
  const img = m.createImageData(gw, gh);
  const d = img.data;
  const o = [0, 0, 0];
  for (let y = 0, i = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++, i += 4) {
      ramp(GR, coarse(x * K, y * K, s), o);
      const k = 1 + (coarse(x * K + 5000, y * K + 3000, s) - 0.5) * 0.1;
      d[i] = o[0] * k;
      d[i + 1] = o[1] * k;
      d[i + 2] = o[2] * k;
      d[i + 3] = 255;
    }
  }
  m.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(cv, 0, 0, gw * K, gh * K);
  // Feinstruktur: kurze Pinselstriche, kaum sichtbar. Richtung je Umgebung: Halme (aufrecht), Rippel (liegend),
  // Fels (je Feld von rund 250 px eine eigene Richtung) oder regellos (Pflaster)
  const [la, da] = B.strokeAlpha || [0.08, 0.08];
  const dir = B.strokeDir || 'up';
  const [l0, l1] = B.strokeLen || [6, 14];
  // Regellose Striche halten Abstand voneinander – sonst kreuzen sie sich zu kleinen Figuren
  const spaced = dir === 'any';
  const gw2 = Math.ceil(W / 9);
  const taken = spaced ? new Uint8Array(gw2 * Math.ceil(H / 9)) : null;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (let i = 0, n = W * H * 0.0058; i < n; i++) {
    const x = P.rnd(0, W);
    const y = P.rnd(0, H);
    const len = P.rnd(l0, l1);
    const base = dir === 'up' ? -1.5708 : dir === 'flat' ? 0 : P.rnd(0, 6.283);
    const a = base + P.rnd(-0.35, 0.35);
    const light = P.R() < 0.5;
    const kind = P.R();
    if (taken) {
      const k = Math.floor((y + (Math.sin(a) * len) / 2) / 9) * gw2 + Math.floor((x + (Math.cos(a) * len) / 2) / 9);
      if (taken[k]) continue;
      taken[k] = 1;
    }
    c.strokeStyle = c.fillStyle = `rgba(${B.strokes[light ? 0 : 1]},${((light ? la : da) * P.rnd(0.65, 1.35)).toFixed(3)})`;
    c.lineWidth = P.rnd(1, 1.6);
    c.beginPath();
    if (kind < (B.pebbles || 0)) {
      // Kiesel statt Strich
      c.arc(x, y, P.rnd(1, 1.9), 0, 7);
      c.fill();
      continue;
    }
    c.moveTo(x, y);
    if (kind > 1 - (B.cracks || 0)) {
      // feiner Riss: zwei, drei kurze Glieder
      c.lineWidth = 1;
      let px = x;
      let py = y;
      for (let g = 0, m = 2 + P.int(2); g < m; g++) {
        const ag = a + P.rnd(-0.9, 0.9);
        px += Math.cos(ag) * P.rnd(3, 4.5);
        py += Math.sin(ag) * P.rnd(3, 4.5);
        c.lineTo(px, py);
      }
    } else c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
  }
  // Blütenpunkte in kleinen Grüppchen
  for (let g = 0; g < (W * H) / 15000; g++) {
    const gx = P.rnd(0, W);
    const gy = P.rnd(0, H);
    c.fillStyle = P.pick(B.dots);
    c.globalAlpha = P.rnd(0.55, 0.9);
    for (let i = 0, n = 2 + P.int(4); i < n; i++) {
      c.beginPath();
      c.arc(gx + P.rnd(-13, 13), gy + P.rnd(-13, 13), P.rnd(0.9, 1.6), 0, 7);
      c.fill();
    }
  }
  c.globalAlpha = 1;
}

/** Festgetretene Erde: weich auslaufend, mit hellem, gelblichem Hof. */
function drawDirt(c, W, H, B, shapes) {
  if (!shapes.length) return;
  const col = hx(B.dirt);
  const halo = hx(B.ground[3]);
  paintMask(c, shapesBox(shapes, 150, W, H), (m) => blurShapes(m, shapes, 26, 80), (v, x, y, out) => mix3(halo, halo, 0, out), { thr: 0.12, edge: 0.55, warp: 0.3, fine: 0.06, alpha: 0.55 * (B.dirtAlpha ?? 1), ox: 300, oy: 120 });
  paintMask(c, shapesBox(shapes, 110, W, H), (m) => blurShapes(m, shapes, 0, 60), (v, x, y, out) => {
    const k = 0.94 + fa(x, y) * 0.12;
    out[0] = col[0] * k;
    out[1] = col[1] * k;
    out[2] = col[2] * k;
  }, { thr: 0.2, edge: 0.5, warp: 0.4, fine: 0.1, alpha: 0.86 * (B.dirtAlpha ?? 1) });
}
/**
 * Gepflasterte Straße oder Platz: ruhige, helle Fläche mit sauberem Rand und dunkler Randlinie, dazu locker verteilte
 * Fugen – genug, um als Pflaster zu lesen, ohne auf Übersichtskarten zu flimmern. f: Dichtefeld der Fläche.
 */
function drawRoads(c, W, H, B, P, shapes, f) {
  if (!shapes.length) return;
  const core = hx(B.road || '#b9ae90');
  const box = shapesBox(shapes, 40, W, H);
  paintMask(c, box, (m) => blurShapes(m, shapes, 0, 10), (v, x, y, out) => {
    // zum Rand hin eine Spur dunkler (Rinnstein)
    const k = 0.95 + fa(x, y) * 0.1 - (v < 0.08 ? 0.07 * (1 - v / 0.08) : 0);
    out[0] = core[0] * k;
    out[1] = core[1] * k;
    out[2] = core[2] * k;
  }, { thr: 0.5, edge: 0.03, warp: 0.1, fine: 0.08, ox: 513, oy: 77 });
  const dark = (k, a) => `rgba(${core.map((v) => Math.round(v * k)).join(',')},${a})`;
  // Randstein: eine ruhige, etwas dunklere Linie – keine Tuschekontur (der Trampelpfad hat auch keine)
  for (const L of contours(f)) ink(c, P, L.pts, 2, dark(0.8, 0.62), true, 0.06);
  if (!box) return;
  const [bx, by, bw, bh] = box;
  c.lineWidth = 1;
  c.lineCap = 'round';
  // Steinkürzel: kleine Gruppen aus ein paar Bögen, locker verteilt – kein Einzelpflaster
  for (let i = 0, n = (bw * bh) / 2400; i < n; i++) {
    const gx = bx + P.R() * bw;
    const gy = by + P.R() * bh;
    const m = 3 + P.int(3);
    const arcs = Array.from({ length: m }, () => [gx + P.rnd(-9, 9), gy + P.rnd(-9, 9), P.rnd(3, 5.5), P.rnd(0, 6.283), P.rnd(1.3, 2.6)]);
    if (fieldAt(f, gx, gy) < 0.75) continue;
    c.strokeStyle = dark(0.8, 0.5);
    for (const [x, y, r, a, da] of arcs) {
      c.beginPath();
      c.arc(x, y, r, a, a + da);
      c.stroke();
    }
  }
}
/** Trampelpfad: innen fast flach, Rand hart und ausgefranst mit abgesprengten Flecken. */
function drawPaths(c, W, H, B, P, shapes, ruts = false) {
  if (!shapes.length) return;
  const core = hx(B.path);
  const rim = hx(B.pathEdge);
  paintMask(c, shapesBox(shapes, 60, W, H), (m) => blurShapes(m, shapes, 0, 26), (v, x, y, out) => {
    mix3(rim, core, v > 0.14 ? 1 : v / 0.14, out);
    const k = 0.97 + fa(x, y) * 0.06;
    out[0] *= k;
    out[1] *= k;
    out[2] *= k;
  }, { thr: 0.44, edge: 0.04, warp: 0.5, fine: 0.36, ox: 77, oy: 411 });
  // Übersichtskarte: Wege sind Fahrwege – zwei unterbrochene Radspuren entlang der Mitte
  if (ruts) {
    const dark = `rgba(${hx(B.pathEdge).map((v) => Math.round(v * 0.62)).join(',')},.6)`;
    for (const s of shapes) {
      if (s.sub || !s.pts || s.pts.length < 2) continue;
      const pts = resample(chaikin(s.pts, false, 2), 8, false);
      const nrm = normals(pts, false);
      for (const sgn of [-1, 1]) ink(c, P, pts.map((q, i) => [q[0] + nrm[i][0] * sgn * s.r * 0.36, q[1] + nrm[i][1] * sgn * s.r * 0.36]), 1.3, dark, false, 0.3);
    }
  }
  // wenige Kiesel, ohne Kontur
  for (const s of shapes) {
    if (s.sub || !s.pts) continue;
    for (let i = 0; i < s.pts.length; i += 1 + P.int(9)) {
      if (P.R() < 0.6) continue;
      const [gx, gy] = s.pts[i];
      for (let k = 0, n = 1 + P.int(3); k < n; k++) {
        c.fillStyle = P.R() < 0.5 ? B.sandShade : B.sand;
        c.beginPath();
        c.ellipse(gx + P.rnd(-s.r, s.r) * 0.6, gy + P.rnd(-s.r, s.r) * 0.6, P.rnd(1.6, 3.4), P.rnd(1.2, 2.4), P.rnd(0, 3), 0, 7);
        c.fill();
      }
    }
  }
}

/** Wasser: Sandsaum mit gezacktem Halmrand, Ausschnitt fürs Wasser, Uferstriche und Tuschelinie. */
function drawShore(c, B, P, loops) {
  const water = new Path2D();
  for (const L of loops) {
    const { pts, nrm } = L;
    const n = pts.length;
    const loopPath = new Path2D();
    trace(loopPath, pts);
    water.addPath(loopPath);
    const rw = (i) => 9 + 13 * n1src(i * 0.085 + L.seed, 4.2);
    const ring = new Path2D();
    trace(ring, pts.map((p, i) => [p[0] - nrm[i][0] * 4, p[1] - nrm[i][1] * 4]));
    for (let s = 0, k = 0; s < n; s += P.rnd(0.25, 0.9), k++) {
      const i = Math.floor(s);
      const t = s - i;
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const na = nrm[i];
      const nb = nrm[(i + 1) % n];
      const off = rw(s) - (k % 2 ? P.rnd(1.5, 8) : P.rnd(0, 2)) * (B.blades === false ? 0.3 : 1);
      const x = a[0] + (b[0] - a[0]) * t + (na[0] + (nb[0] - na[0]) * t) * off;
      const y = a[1] + (b[1] - a[1]) * t + (na[1] + (nb[1] - na[1]) * t) * off;
      if (k) ring.lineTo(x, y);
      else ring.moveTo(x, y);
    }
    ring.closePath();
    c.fillStyle = B.sand;
    c.fill(ring, 'evenodd');
    c.save();
    c.clip(ring, 'evenodd');
    for (let i = P.int(14); i < n; i += 8 + P.int(18)) soft(c, pts[i][0] + nrm[i][0] * P.rnd(4, 14), pts[i][1] + nrm[i][1] * P.rnd(4, 14), P.rnd(16, 40), rgb(B.sandShade), P.rnd(0.3, 0.55), 0.4);
    c.strokeStyle = `rgba(${rgb(B.sandShade)},.55)`;
    c.lineWidth = 10;
    c.stroke(loopPath);
    c.lineWidth = 1;
    for (let i = P.int(6); i < n - 6; i += 3 + P.int(12)) {
      const dy = P.rnd(4, 12);
      c.strokeStyle = `rgba(${rgb(B.rock.line)},${P.rnd(0.18, 0.35)})`;
      c.beginPath();
      for (let k = 0, len = 2 + P.int(4); k <= len; k++) {
        const q = pts[(i + k) % n];
        const nn = nrm[(i + k) % n];
        c.lineTo(q[0] + nn[0] * (dy + P.rnd(-1, 1)), q[1] + nn[1] * (dy + P.rnd(-1, 1)));
      }
      c.stroke();
    }
    c.restore();
  }
  // Wasser ausschneiden: darunter liegt die Wasser-Ebene
  c.save();
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = '#000';
  c.fill(water, 'evenodd');
  c.restore();
  for (const L of loops) {
    const { pts, nrm } = L;
    const n = pts.length;
    c.lineCap = 'round';
    for (let i = P.int(10); i < n; i += 7 + P.int(16)) {
      if (P.R() < 0.35) continue;
      const dy = P.rnd(4, 11);
      c.strokeStyle = `rgba(${rgb(B.foam)},${P.rnd(0.6, 0.9)})`;
      c.lineWidth = P.rnd(1.5, 2.2);
      c.beginPath();
      for (let k = 0, len = 3 + P.int(5); k <= len; k++) {
        const q = pts[(i + k) % n];
        const nn = nrm[(i + k) % n];
        c.lineTo(q[0] - nn[0] * dy, q[1] - nn[1] * dy);
      }
      c.stroke();
    }
    ink(c, P, pts, 1.9, B.shoreLine, true, 0.04);
  }
  return water;
}
/** Wasserfläche: ruhiger Verlauf nach Abstand zum Ufer, dazu Glitzerpunkte und weiche dunklere Zonen. */
function drawWaterBase(W, H, B, P, f) {
  const cv = canvas(W, H);
  const c = cv.getContext('2d');
  c.fillStyle = B.water[0];
  c.fillRect(0, 0, W, H);
  const inside = new Uint8Array(f.F.length);
  let any = false;
  for (let p = 0; p < inside.length; p++) if (f.F[p] >= 0.5) (inside[p] = 1), (any = true);
  if (!any) return cv;
  const D = chamfer(inside, f.gw, f.gh);
  const small = canvas(f.gw, f.gh);
  const m = small.getContext('2d');
  const img = m.createImageData(f.gw, f.gh);
  const d = img.data;
  const cols = [hx(B.foam), hx(B.water[3]), hx(B.water[2]), hx(B.water[1]), hx(B.water[0]), hx(B.water[0])];
  const o = [0, 0, 0];
  for (let y = 0, p = 0, i = 0; y < f.gh; y++) {
    for (let x = 0; x < f.gw; x++, p++, i += 4) {
      const dist = D[p] * K + (f.F[p] - 0.5) * 8 + (coarse(x * K, y * K, 7) - 0.5) * 46;
      // Stufen: 0 Schaum, 10 Uferband, 34, 80, 150 tief
      const t = dist < 10 ? (dist / 10) * 0.2 : dist < 34 ? 0.2 + ((dist - 10) / 24) * 0.2 : dist < 80 ? 0.4 + ((dist - 34) / 46) * 0.2 : 0.6 + ((dist - 80) / 70) * 0.2;
      ramp(cols, t, o);
      d[i] = o[0];
      d[i + 1] = o[1];
      d[i + 2] = o[2];
      d[i + 3] = 255;
    }
  }
  m.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(small, -PAD * K, -PAD * K, f.gw * K, f.gh * K);
  for (let i = 0, n = (W * H) / 26000; i < n; i++) {
    const x = P.rnd(0, W);
    const y = P.rnd(0, H);
    if (fieldAt(f, x, y) < 0.6) continue;
    if (P.R() < 0.4) soft(c, x, y, P.rnd(40, 120), '6,34,44', 0.13, 0.3);
    else {
      for (let k = 0, g = 2 + P.int(3); k < g; k++) {
        c.fillStyle = `rgba(215,245,240,${P.rnd(0.4, 0.85)})`;
        c.beginPath();
        c.arc(x + P.rnd(-11, 11), y + P.rnd(-11, 11), P.rnd(0.7, 1.4), 0, 7);
        c.fill();
      }
    }
  }
  return cv;
}

/** Rauschen entlang eines geschlossenen Linienzugs (Wellenlänge wl in Pixeln) – ohne Sprung am Anfang/Ende. */
function loopNoise(L, i, wl, s = 0) {
  const n = L.pts.length;
  const a = (i / n) * 6.2832;
  const r = (n * 6) / wl / 6.2832;
  const v = (n1src(Math.cos(a) * r + L.seed + s, Math.sin(a) * r + s * 1.7 + 3.1) - 0.5) * 2.3 + 0.5;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
/** Felskante aufrauen: große Buchten, mittlere Ausbuchtungen und kleine Zacken statt einer glatten Linie. */
function roughen(L, amp = 1) {
  const pts = L.pts.map((p, i) => {
    const d = ((loopNoise(L, i, 130) - 0.5) * 24 + (loopNoise(L, i, 42, 9) - 0.5) * 13 + (loopNoise(L, i, 14, 21) - 0.5) * 6 + (n1src(i * 7.31 + L.seed, 0.7) - 0.5) * 5) * amp;
    return [p[0] + L.nrm[i][0] * d, p[1] + L.nrm[i][1] * d];
  });
  return { pts, nrm: normals(pts, true), seed: L.seed };
}
/**
 * Felsband zwischen Kante und Außenlinie: unregelmäßig breit und in Facetten gebrochen – jede Facette etwas anders
 * getönt, mit shade = true zum Licht heller und auf der Schattenseite dunkler. Liefert die Außenlinie.
 */
function rockBand(c, B, P, L, shade) {
  const n = L.pts.length;
  const side = hx(B.rock.side);
  const lit = hx(B.rock.cell);
  const dark = [30, 28, 14];
  const tmp = [0, 0, 0];
  const outer = L.pts.map((p, i) => {
    const w = 5 + 34 * loopNoise(L, i, 95, 40) ** 1.6 + 10 * loopNoise(L, i, 24, 55) + 4 * n1src(i * 5.17 + L.seed, 8.3);
    return [p[0] + L.nrm[i][0] * w, p[1] + L.nrm[i][1] * w];
  });
  const band = new Path2D();
  trace(band, L.pts);
  trace(band, outer);
  c.fillStyle = B.rock.side;
  c.fill(band, 'evenodd');
  const cuts = [];
  for (let i = 0; i < n; ) {
    const j = Math.min(n, i + 2 + P.int(P.R() < 0.3 ? 14 : 6));
    const m = (i + j) >> 1;
    const dot = shade ? (L.nrm[m % n][0] * LIGHT[0] + L.nrm[m % n][1] * LIGHT[1]) * (shade === -1 ? -1 : 1) : 0;
    const base = dot < 0 ? mix3(side, lit, -dot * 0.75, tmp) : mix3(side, dark, dot * 0.38, tmp);
    const k = P.rnd(0.9, 1.1);
    c.fillStyle = css(base.map((v) => Math.min(255, v * k)));
    c.beginPath();
    for (let q = i; q <= j; q++) c.lineTo(L.pts[q % n][0], L.pts[q % n][1]);
    for (let q = j; q >= i; q--) c.lineTo(outer[q % n][0], outer[q % n][1]);
    c.closePath();
    c.fill();
    if (P.R() < 0.55) cuts.push(i);
    i = j;
  }
  // Bruchlinien zwischen den Facetten
  c.strokeStyle = `rgba(${rgb(B.rock.line)},.6)`;
  c.lineWidth = 1;
  c.lineCap = 'round';
  c.beginPath();
  for (const i of cuts) {
    const t = P.rnd(0.45, 1);
    const k = (i + P.int(5) - 2 + n) % n; // schräg zum Nachbarn hinüber
    c.moveTo(L.pts[i][0], L.pts[i][1]);
    c.lineTo(L.pts[i][0] + (outer[k][0] - L.pts[i][0]) * t + P.rnd(-2, 2), L.pts[i][1] + (outer[k][1] - L.pts[i][1]) * t + P.rnd(-2, 2));
  }
  c.stroke();
  return outer;
}
/** Loses Geröll entlang einer Linie: kleine Steine in Grüppchen, um off (Bereich) in Richtung der Normalen versetzt. */
function pebbles(c, B, P, pts, nrm, off0, off1) {
  const n = pts.length;
  for (let i = P.int(10); i < n; i += 5 + P.int(18)) {
    if (P.R() < 0.35) continue;
    for (let k = 0, m = 1 + P.int(3); k < m; k++) {
      const q = (i + P.int(4)) % n;
      const off = P.rnd(off0, off1);
      const x = pts[q][0] + nrm[q][0] * off + P.rnd(-5, 5);
      const y = pts[q][1] + nrm[q][1] * off + P.rnd(-5, 5);
      const s = P.rnd(2.6, 6.5);
      const a0 = P.rnd(0, 6.28);
      c.beginPath();
      for (let j = 0; j < 6; j++) {
        const a = a0 + (j / 6) * 6.283;
        const rr = s * P.rnd(0.7, 1.1);
        c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.82);
      }
      c.closePath();
      c.fillStyle = P.R() < 0.5 ? B.rock.top : B.rock.side;
      c.fill();
      c.strokeStyle = B.rock.line;
      c.lineWidth = 1;
      c.stroke();
    }
  }
}

/**
 * Höhle bzw. Senke: begehbarer Boden, umgeben von einer zackigen Felswand. Die Wand ringsum ist höher – sie wirft
 * einen Schatten in die Höhle und einen dunklen Saum entlang der Kante; am Fuß liegt Geröll.
 * Liefert die aufgerauten Umrisse (für die Lichtberechnung).
 */
function drawCave(c, W, H, B, P, f, loops0, shadow) {
  const line = B.rock.line;
  const loops = loops0.map((L) => roughen(L, 0.85));
  const path = new Path2D();
  for (const L of loops) trace(path, L.pts);
  const rims = loops.map((L) => rockBand(c, B, P, L, -1));
  c.save();
  c.fillStyle = B.cave || B.dirt;
  c.fill(path, 'evenodd');
  c.clip(path, 'evenodd');
  // Boden in der Malweise der Wiese: weiche Wolken, kurze Striche, Kieselgrüppchen
  let bx0 = W;
  let by0 = H;
  let bx1 = 0;
  let by1 = 0;
  for (const L of loops) {
    for (const [x, y] of L.pts) {
      bx0 = Math.min(bx0, x);
      by0 = Math.min(by0, y);
      bx1 = Math.max(bx1, x);
      by1 = Math.max(by1, y);
    }
  }
  bx0 = Math.max(0, bx0);
  by0 = Math.max(0, by0);
  bx1 = Math.min(W, bx1);
  by1 = Math.min(H, by1);
  const area = Math.max(1, (bx1 - bx0) * (by1 - by0));
  for (let i = 0, n = area / 22000; i < n; i++) soft(c, P.rnd(bx0, bx1), P.rnd(by0, by1), P.rnd(120, 260), P.R() < 0.5 ? '108,98,80' : '158,146,116', 0.4, 0.2);
  c.lineCap = 'round';
  for (let i = 0, n = area * 0.0038; i < n; i++) {
    const x = P.rnd(bx0, bx1);
    const y = P.rnd(by0, by1);
    const len = P.rnd(6, 12);
    const a = n1src(Math.floor(x / 250) * 3.1 + 17, Math.floor(y / 250) * 1.7) * 6.283 + P.rnd(-0.35, 0.35);
    const light = P.R() < 0.43;
    c.strokeStyle = light ? `rgba(185,173,142,${P.rnd(0.06, 0.11).toFixed(3)})` : `rgba(85,73,58,${P.rnd(0.09, 0.16).toFixed(3)})`;
    c.lineWidth = P.rnd(1, 1.5);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
  }
  for (let g = 0, n = area / 15000; g < n; g++) {
    const gx = P.rnd(bx0, bx1);
    const gy = P.rnd(by0, by1);
    c.fillStyle = P.R() < 0.5 ? '#5d5443' : '#b0a487';
    c.globalAlpha = P.rnd(0.5, 0.85);
    for (let i = 0, m = 2 + P.int(5); i < m; i++) {
      c.beginPath();
      c.arc(gx + P.rnd(-12, 12), gy + P.rnd(-12, 12), P.rnd(0.9, 1.7), 0, 7);
      c.fill();
    }
  }
  c.globalAlpha = 1;
  // Die Wand wirft einen weich auslaufenden Schatten auf den Boden, nach rechts unten etwas breiter
  c.save();
  c.translate(3, 3);
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(32,24,15,0.045)';
  for (let k = 0; k < 10; k++) {
    c.lineWidth = 6 + k * 5;
    c.stroke(path);
  }
  c.restore();
  for (const L of loops) pebbles(c, B, P, L.pts, L.nrm, -24, -7);
  for (let i = 0, n = (W * H) / 26000; i < n; i++) {
    const x = P.rnd(0, W);
    const y = P.rnd(0, H);
    const sz = P.rnd(1.8, 4.6);
    const a = P.rnd(0, 3);
    if (fieldAt(f, x, y) < 0.7) continue;
    c.fillStyle = P.R() < 0.5 ? B.rock.top : B.rock.side;
    c.strokeStyle = `rgba(${rgb(line)},.7)`;
    c.lineWidth = 0.9;
    c.beginPath();
    c.ellipse(x, y, sz, sz * 0.72, a, 0, 7);
    c.fill();
    c.stroke();
  }
  c.restore();
  // Schlagschatten der Wand: der Teil der Höhle, den die in Lichtrichtung verschobene Höhle nicht mehr deckt
  const tmp = canvas(W, H);
  const t = tmp.getContext('2d');
  t.fill(path, 'evenodd');
  t.globalCompositeOperation = 'destination-out';
  t.translate(LIGHT[0] * 30, LIGHT[1] * 30);
  t.fill(path, 'evenodd');
  shadow.getContext('2d').drawImage(tmp, 0, 0);
  loops.forEach((L, li) => {
    ink(c, P, rims[li], 1.3, `rgba(${rgb(line)},.7)`, true, 0.22);
    ink(c, P, L.pts, 2.2, line, true, 0.02);
  });
  return loops;
}

/**
 * Erhöhung: Felsplateau mit zackiger Kante und in Facetten gebrochener Felswand, an deren Fuß Geröll liegt. Oben
 * wächst Gras mit ausgefranstem Rand über den Fels; ein Streifen Fels bleibt an der Kante frei.
 */
function drawPlateau(c, W, H, B, P, f, loops0, grass, shadow) {
  const line = B.rock.line;
  const loops = loops0.map((L) => roughen(L));
  const feet = loops.map((L) => rockBand(c, B, P, L, true));
  // Schlagschatten auf den tieferen Boden
  const s = shadow.getContext('2d');
  s.fillStyle = '#000';
  for (let k = 0; k <= 46; k += 1.5) {
    s.save();
    s.translate(LIGHT[0] * k, LIGHT[1] * k);
    for (const ft of feet) {
      poly(s, ft);
      s.fill();
    }
    s.restore();
  }
  // Oberseite: Fels mit rundlichem Zellmuster nur über Hell/Dunkel, ohne Linien
  const top = new Path2D();
  for (const L of loops) trace(top, L.pts);
  c.save();
  c.fillStyle = B.rock.plateau;
  c.fill(top, 'evenodd');
  c.clip(top, 'evenodd');
  for (let gy = -20, row = 0; gy < H + 20; gy += 19, row++) {
    for (let gx = -20 + (row % 2 ? 10 : 0); gx < W + 20; gx += 20) {
      const x = gx + P.rnd(-6, 6);
      const y = gy + P.rnd(-6, 6);
      const rad = P.rnd(8, 14);
      const a0 = P.rnd(0, 6.28);
      const tone = P.R() < 0.75 ? `rgba(${rgb(B.rock.cell)},${P.rnd(0.25, 0.6)})` : 'rgba(60,58,36,.12)';
      const rr = [0, 0, 0, 0, 0, 0].map(() => rad * P.rnd(0.66, 1.12));
      if (fieldAt(f, x, y) < 0.2) continue;
      c.beginPath();
      for (let j = 0; j <= 6; j++) {
        const a = a0 + (j / 6) * 6.283;
        const b = a0 + ((j + 1) / 6) * 6.283;
        const px = x + Math.cos(a) * rr[j % 6];
        const py = y + Math.sin(a) * rr[j % 6];
        const mx = (px + x + Math.cos(b) * rr[(j + 1) % 6]) / 2;
        const my = (py + y + Math.sin(b) * rr[(j + 1) % 6]) / 2;
        if (j) c.quadraticCurveTo(px, py, mx, my);
        else c.moveTo(mx, my);
      }
      c.fillStyle = tone;
      c.fill();
    }
  }
  // Schichtlinien dicht an der Kante: unterbrochen und unruhig
  for (const L of loops) {
    ink(c, P, L.pts.map((p, i) => [p[0] - L.nrm[i][0] * (6 + 5 * loopNoise(L, i, 30, 70)), p[1] - L.nrm[i][1] * (6 + 5 * loopNoise(L, i, 30, 70))]), 1.1, `rgba(${rgb(line)},.75)`, true, 0.4);
    ink(c, P, L.pts.map((p, i) => [p[0] - L.nrm[i][0] * (14 + 10 * loopNoise(L, i, 50, 90)), p[1] - L.nrm[i][1] * (14 + 10 * loopNoise(L, i, 50, 90))]), 1, `rgba(${rgb(line)},.45)`, true, 0.6);
  }
  // Gras wächst von der Mitte her über den Fels – mit hartem, ausgefranstem Rand und abgesprengten Flecken
  {
    const inside = new Uint8Array(f.F.length);
    for (let p = 0; p < inside.length; p++) inside[p] = f.F[p] >= 0.5 ? 1 : 0;
    const D = chamfer(inside, f.gw, f.gh);
    const small = canvas(f.gw, f.gh);
    const m = small.getContext('2d');
    const img = m.createImageData(f.gw, f.gh);
    for (let p = 0; p < D.length; p++) {
      const t = (D[p] * K - 12) / 64;
      img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = 255;
      img.data[p * 4 + 3] = (t < 0 ? 0 : t > 1 ? 1 : t) * 255;
    }
    m.putImageData(img, 0, 0);
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    for (const L of loops) {
      for (const [x, y] of L.pts) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1));
    y1 = Math.min(H, Math.ceil(y1));
    if (x1 > x0 && y1 > y0) {
      const over = canvas(W, H);
      const o = over.getContext('2d');
      paintMask(o, [x0, y0, x1 - x0, y1 - y0], (mm) => {
        mm.imageSmoothingEnabled = true;
        mm.drawImage(small, -PAD * K, -PAD * K, f.gw * K, f.gh * K);
      }, (v, x, y, out) => {
        out[0] = out[1] = out[2] = 255;
      }, { thr: 0.36, edge: 0.34, warp: 0.6, fine: 0.34, alpha: 0.95, ox: 150, oy: 420 });
      o.globalCompositeOperation = 'source-in';
      o.drawImage(grass, 0, 0);
      c.drawImage(over, 0, 0);
    }
  }
  c.restore();
  // Der eigene Schatten liegt nicht auf der Oberseite
  s.save();
  s.globalCompositeOperation = 'destination-out';
  for (const ft of feet) {
    poly(s, ft);
    s.fill();
  }
  s.restore();
  loops.forEach((L, li) => {
    const ft = feet[li];
    pebbles(c, B, P, ft, L.nrm, 4, 16);
    // Zwischenstufe: eine unterbrochene Linie auf halber Höhe der Wand
    ink(c, P, L.pts.map((q, i) => [(q[0] * 0.55 + ft[i][0] * 0.45), (q[1] * 0.55 + ft[i][1] * 0.45)]), 1.1, `rgba(${rgb(line)},.6)`, true, 0.45);
    ink(c, P, ft, 1.9, line, true);
    ink(c, P, L.pts, 1.8, line, true, 0.04);
  });
}

// --- Gebäude ----------------------------------------------------------------------------------------------------------
export const FLOORS = ['wood', 'woodDark', 'woodLight', 'stone', 'cobble', 'earth'];
/** Holzboden: schmale, lange Dielen, kaum sichtbare Fugen, leichte Tonwechsel. */
function woodFloor(c, P, x, y, w, h, base) {
  c.fillStyle = `rgb(${base})`;
  c.fillRect(x, y, w, h);
  for (let py = y; py < y + h; ) {
    const ph = P.rnd(7, 9.5);
    for (let px = x - P.rnd(0, 300); px < x + w; ) {
      const len = P.rnd(160, 520);
      const t = P.rnd(-1, 1);
      c.fillStyle = t > 0 ? `rgba(255,225,170,${t * 0.07})` : `rgba(20,10,0,${-t * 0.08})`;
      c.fillRect(px, py, len, ph);
      c.fillStyle = 'rgba(40,25,10,.3)';
      c.fillRect(px + len - 1, py, 1, ph);
      px += len;
    }
    c.fillStyle = `rgba(40,25,10,${P.rnd(0.18, 0.3)})`;
    c.fillRect(x, py, w, 1);
    py += ph;
  }
  for (let i = 0; i < (w * h) / 60000; i++) {
    const bx = x + P.rnd(0, w);
    const by = y + P.rnd(0, h);
    for (let k = 0, n = 2 + P.int(3); k < n; k++) soft(c, bx + P.rnd(-30, 30), by + P.rnd(-20, 20), P.rnd(20, 60), '30,16,4', P.rnd(0.04, 0.09), 0.4);
  }
}
/** Steinboden: kleine Platten im Läuferverband, helle warme Töne, kontrastarme Fugen. */
function stoneFloor(c, P, x, y, w, h) {
  c.fillStyle = '#b9b28a';
  c.fillRect(x, y, w, h);
  for (let ty = y; ty < y + h; ) {
    const th = P.rnd(22, 28);
    for (let tx = x - P.rnd(4, 34); tx < x + w; ) {
      const tw = P.rnd(28, 44);
      const t = P.rnd(-1, 1);
      c.fillStyle = t > 0 ? `rgba(215,208,170,${t * 0.5})` : `rgba(150,141,104,${-t * 0.45})`;
      c.fillRect(tx, ty, tw, th);
      c.fillStyle = 'rgba(120,112,84,.55)';
      c.fillRect(tx + tw - 1, ty, 1, th);
      tx += tw;
    }
    c.fillStyle = 'rgba(120,112,84,.55)';
    c.fillRect(x, ty, w, 1);
    ty += th;
  }
  for (let i = 0; i < (w * h) / 40000; i++) soft(c, x + P.rnd(0, w), y + P.rnd(0, h), P.rnd(30, 70), '90,80,50', P.rnd(0.06, 0.12), 0.4);
}
/** Kopfsteinpflaster: rundliche Steine in wechselnden Grautönen. */
function cobbleFloor(c, P, x, y, w, h) {
  c.fillStyle = '#7f7b68';
  c.fillRect(x, y, w, h);
  for (let gy = y - 6, row = 0; gy < y + h + 8; gy += 13, row++) {
    for (let gx = x - 6 + (row % 2 ? 8 : 0); gx < x + w + 8; gx += 16) {
      const t = P.rnd(0, 1);
      c.fillStyle = css([150 + t * 40, 147 + t * 38, 124 + t * 34]);
      c.beginPath();
      c.ellipse(gx + P.rnd(-2, 2), gy + P.rnd(-2, 2), P.rnd(5.5, 7.6), P.rnd(4.4, 5.8), P.rnd(-0.4, 0.4), 0, 7);
      c.fill();
    }
  }
  for (let i = 0; i < (w * h) / 40000; i++) soft(c, x + P.rnd(0, w), y + P.rnd(0, h), P.rnd(30, 80), '50,46,30', P.rnd(0.08, 0.16), 0.4);
}
/** Gestampfte Erde. */
function earthFloor(c, P, x, y, w, h, B) {
  const col = hx(B.dirt);
  c.fillStyle = css(col.map((v) => v * 0.86));
  c.fillRect(x, y, w, h);
  for (let i = 0; i < (w * h) / 5000; i++) soft(c, x + P.rnd(0, w), y + P.rnd(0, h), P.rnd(20, 70), P.R() < 0.5 ? '40,26,10' : '255,230,170', P.rnd(0.04, 0.1), 0.4);
  for (let i = 0; i < (w * h) / 900; i++) {
    c.fillStyle = `rgba(40,26,10,${P.rnd(0.1, 0.25)})`;
    c.fillRect(x + P.rnd(0, w), y + P.rnd(0, h), P.rnd(1, 2.4), P.rnd(1, 2));
  }
}
function drawFloor(c, P, kind, x, y, w, h, B) {
  if (kind === 'stone') stoneFloor(c, P, x, y, w, h);
  else if (kind === 'cobble') cobbleFloor(c, P, x, y, w, h);
  else if (kind === 'earth') earthFloor(c, P, x, y, w, h, B);
  else woodFloor(c, P, x, y, w, h, kind === 'woodDark' ? [100, 82, 58] : kind === 'woodLight' ? [158, 132, 92] : [123, 99, 65]);
}
/** Vorschau eines Bodens (für die Auswahl im Editor). */
export function floorSwatch(kind, B, size = 56) {
  const cv = canvas(size, size);
  drawFloor(cv.getContext('2d'), rng(7), kind, 0, 0, size, size, B);
  return cv;
}
const roomPath = (r) => {
  const p = new Path2D();
  if (r.k === 'circle') p.arc(r.cx, r.cy, r.r, 0, 7);
  else p.rect(r.x, r.y, r.w, r.h);
  return p;
};
const roomBox = (r) => (r.k === 'circle' ? [r.cx - r.r, r.cy - r.r, 2 * r.r, 2 * r.r] : [r.x, r.y, r.w, r.h]);

/** Einzelner Block mit eigener, dünner Kontur: leicht schiefes Viereck mit runden Ecken. */
function block(c, P, x, y, w, h, fill, r = 2.6, lw = 1.5) {
  const j = () => P.rnd(-0.9, 0.9);
  const p = [[x + j(), y + j()], [x + w + j(), y + j()], [x + w + j(), y + h + j()], [x + j(), y + h + j()]];
  c.beginPath();
  c.moveTo((p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2);
  for (let i = 1; i <= 4; i++) c.arcTo(p[i % 4][0], p[i % 4][1], p[(i + 1) % 4][0], p[(i + 1) % 4][1], r);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = lw * P.rnd(0.85, 1.2);
  c.lineJoin = 'round';
  c.stroke();
}
const STONES = ['#bfbda0', '#c9c7aa', '#b3b194', '#bfbda0', '#c4c1a4'];
const STONES_DEEP = ['#a8a48d', '#b6b29a', '#96917b', '#a8a48d', '#aeaa92']; // Dungeon und Höhle
let stones = STONES;
function stoneBlock(c, P, x, l) {
  const ins = P.rnd(0, 1.2);
  block(c, P, x, -WT / 2 + ins, l - P.rnd(0, 1), WT - ins, P.pick(stones), P.rnd(2, 3.4));
  if (P.R() < 0.25) {
    c.strokeStyle = 'rgba(42,30,16,.55)';
    c.lineWidth = 1;
    c.beginPath();
    const cx = x + l * P.rnd(0.25, 0.75);
    const cy = P.rnd(-WT / 4, WT / 4);
    c.moveTo(cx, cy);
    c.lineTo(cx + P.rnd(-4, 4), cy + P.rnd(-4, 4));
    c.lineTo(cx + P.rnd(-6, 6), cy + P.rnd(-6, 6));
    c.stroke();
  }
}
/** Steinwand: Reihe einzelner Blöcke mit eigener Kontur – kein durchgehendes dunkles Band. */
function stoneWall(c, s) {
  const P = rng(hashStr(`${s.x1}|${s.y1}|${s.x2}|${s.y2}`));
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  c.save();
  c.translate(s.x1, s.y1);
  c.rotate(Math.atan2(s.y2 - s.y1, s.x2 - s.x1));
  c.fillStyle = '#6e6a55';
  c.fillRect(0, -WT / 2 + 3, len, WT - 6);
  for (let p = 0; p < len; ) {
    let l = P.rnd(12, 34);
    if (len - p - l < 9) l = len - p;
    stoneBlock(c, P, p, l);
    p += l;
  }
  c.restore();
}
function stoneArc(c, a) {
  const P = rng(hashStr(`${a.cx}|${a.cy}|${a.r}|${a.a0.toFixed(2)}`));
  const len = (a.a1 - a.a0) * a.r;
  c.save();
  c.strokeStyle = '#6e6a55';
  c.lineWidth = WT - 6;
  c.beginPath();
  c.arc(a.cx, a.cy, a.r, a.a0, a.a1);
  c.stroke();
  c.restore();
  for (let p = 0; p < len; ) {
    let l = P.rnd(12, 26);
    if (len - p - l < 9) l = len - p;
    const ang = a.a0 + (p + l / 2) / a.r;
    c.save();
    c.translate(a.cx + Math.cos(ang) * a.r, a.cy + Math.sin(ang) * a.r);
    c.rotate(ang + Math.PI / 2);
    stoneBlock(c, P, -l / 2, l);
    c.restore();
    p += l;
  }
}
function woodWall(c, s) {
  const P = rng(hashStr(`w${s.x1}|${s.y1}|${s.x2}|${s.y2}`));
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  c.save();
  c.translate(s.x1, s.y1);
  c.rotate(Math.atan2(s.y2 - s.y1, s.x2 - s.x1));
  block(c, P, 0, -BT / 2, len, BT, '#8a6c44', 1.5);
  c.strokeStyle = 'rgba(60,40,18,.5)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(4, 0);
  c.lineTo(len - 4, P.rnd(-0.6, 0.6));
  c.stroke();
  c.restore();
}
/** Burgmauer: breites Steinband mit Wehrgang und Zinnen auf beiden Seiten. */
function rampartWall(c, s) {
  const P = rng(hashStr(`rm${s.x1}|${s.y1}|${s.x2}|${s.y2}`));
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  c.save();
  c.translate(s.x1, s.y1);
  c.rotate(Math.atan2(s.y2 - s.y1, s.x2 - s.x1));
  block(c, P, 0, -RT / 2, len, RT, '#a9a88a', 1.5, 2.4);
  c.fillStyle = '#9a9a82';
  c.fillRect(2, -RT / 2 + 8, len - 4, RT - 16);
  c.strokeStyle = 'rgba(42,30,16,.4)';
  c.lineWidth = 1;
  c.beginPath();
  for (let p = P.rnd(20, 50); p < len - 10; p += P.rnd(30, 60)) (c.moveTo(p, -RT / 2 + 8), c.lineTo(p + P.rnd(-1, 1), RT / 2 - 8));
  c.stroke();
  const n = Math.max(1, Math.round((len - 12) / 19));
  for (let i = 0; i <= n; i++) {
    const x = 6 + ((len - 12) * i) / n;
    block(c, P, x - 5, -RT / 2 - 1, 10, 9, '#cfcdae', 1.2, 1.3);
    block(c, P, x - 5, RT / 2 - 8, 10, 9, '#cfcdae', 1.2, 1.3);
  }
  c.restore();
}
/** Palisade: dicht an dicht gesetzte Stämme, von oben als Kette runder Stammköpfe mit hellem Kern. */
function palisadeWall(c, s) {
  const P = rng(hashStr(`pl${s.x1}|${s.y1}|${s.x2}|${s.y2}`));
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  c.save();
  c.translate(s.x1, s.y1);
  c.rotate(Math.atan2(s.y2 - s.y1, s.x2 - s.x1));
  const n = Math.max(1, Math.round(len / 13));
  const logs = Array.from({ length: n + 1 }, (_, i) => [(len * i) / n, P.rnd(-1.5, 1.5), P.rnd(6.6, 8)]);
  // erst die gemeinsame Kontur, dann die Stämme
  c.fillStyle = INK;
  for (const [x, y, r] of logs) (c.beginPath(), c.arc(x, y, r + 2, 0, 7), c.fill());
  for (const [x, y, r] of logs) {
    c.fillStyle = P.pick(['#7a6242', '#836a48', '#6f5a3c']);
    c.beginPath();
    c.arc(x, y, r, 0, 7);
    c.fill();
    c.fillStyle = '#b89a6a';
    c.beginPath();
    c.arc(x - 0.8, y - 0.8, 1.7, 0, 7);
    c.fill();
  }
  c.restore();
}
/** Runder Holzpfosten, Eckstein oder (an Burgmauern) Mauerturm an Wandenden. */
function post(c, x, y, kind) {
  const P = rng(hashStr(`p${Math.round(x)}|${Math.round(y)}`));
  if (kind === 'rampart') {
    c.fillStyle = '#a9a88a';
    c.beginPath();
    c.arc(x, y, TR, 0, 7);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2.5;
    c.stroke();
    c.fillStyle = '#9a9a82';
    c.beginPath();
    c.arc(x, y, TR - 12, 0, 7);
    c.fill();
    c.strokeStyle = 'rgba(42,30,16,.5)';
    c.lineWidth = 1.2;
    c.stroke();
    // Brüstungsschatten an der Lichtseite, damit die Plattform tiefer liegt als der Zinnenkranz
    c.strokeStyle = 'rgba(0,0,0,.16)';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(x, y, TR - 15, 3.3, 5.2);
    c.stroke();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * 6.283;
      c.save();
      c.translate(x + Math.cos(a) * (TR - 5.5), y + Math.sin(a) * (TR - 5.5));
      c.rotate(a);
      block(c, P, -4.5, -5, 9, 10, '#cfcdae', 1.2, 1.3);
      c.restore();
    }
    return;
  }
  if (kind === 'palisade') {
    c.fillStyle = INK;
    c.beginPath();
    c.arc(x, y, 12.5, 0, 7);
    c.fill();
    c.fillStyle = '#6f5a3c';
    c.beginPath();
    c.arc(x, y, 10.5, 0, 7);
    c.fill();
    c.fillStyle = '#b89a6a';
    c.beginPath();
    c.arc(x - 1, y - 1, 2.4, 0, 7);
    c.fill();
    return;
  }
  if (kind === 'wood') {
    c.fillStyle = '#96784c';
    c.beginPath();
    c.ellipse(x, y, 10 + P.rnd(-0.6, 0.6), 10 + P.rnd(-0.6, 0.6), 0, 0, 7);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.7;
    c.stroke();
    c.strokeStyle = 'rgba(70,46,20,.7)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(x + P.rnd(-0.5, 0.5), y + P.rnd(-0.5, 0.5), 5.5, P.rnd(0, 1), P.rnd(5, 6.2));
    c.stroke();
    c.beginPath();
    c.arc(x, y, 2, 0, 7);
    c.stroke();
  } else {
    block(c, P, x - 12, y - 12, 24, 24, stones[1], 3, 1.7);
    c.strokeStyle = 'rgba(42,30,16,.45)';
    c.lineWidth = 1;
    c.strokeRect(x - 6 + P.rnd(-0.5, 0.5), y - 6 + P.rnd(-0.5, 0.5), 12, 12);
  }
}
/** Tür (Holzblatt in der Wandöffnung) oder Fenster (Holzrahmen, breiter als die Wand, mit Glasstreifen). */
export function drawOpening(c, o) {
  if (o.k === 'door') return drawDoor(c, o);
  if (o.k === 'secret') return drawDoor(c, { ...o, secret: true }, { dm: true }); // nur im Kartenbauer zu sehen
  const P = rng(hashStr(`o${o.id}`));
  c.save();
  c.translate(o.x, o.y);
  c.rotate(o.a);
  const w = o.w;
  {
    block(c, P, -w / 2, -10, w, 20, '#896c44', 1.5, 1.7);
    block(c, P, -w / 2 - 2, -12, 8, 24, '#5e452c', 1.2);
    block(c, P, w / 2 - 6, -12, 8, 24, '#5e452c', 1.2);
    c.fillStyle = INK;
    c.fillRect(-w / 2 + 8, -2.6, w - 16, 5.2);
    c.fillStyle = '#8fd6cf';
    c.fillRect(-w / 2 + 9, -1.5, w - 18, 3);
  }
  c.restore();
}

// --- Szene → Bild ------------------------------------------------------------------------------------------------------
export const sceneSize = (scene) => ({ W: scene.cols * CELL, H: scene.rows * CELL });

export class SceneRenderer {
  constructor() {
    this.out = canvas(1, 1);
    this.sh = canvas(1, 1);
    this.terrain = null;
    this.build = null;
    this.keys = {};
    this.onLoad = null; // wird gerufen, wenn nachgeladene Bilder fertig sind
    this.loading = new Set();
  }

  /** Gelände neu malen, falls sich daran etwas geändert hat. */
  renderTerrain(scene) {
    const key = JSON.stringify([scene.cols, scene.rows, scene.biome, scene.seed, scene.scale, scene.water, scene.paths, scene.roads, scene.dirt, scene.high, scene.cave]);
    if (this.keys.terrain === key) return;
    this.keys.terrain = key;
    const { W, H } = sceneSize(scene);
    const B = biomeOf(scene);
    const P = rng((scene.seed | 0) + 11);
    tiles();
    // Die Wiese selbst hängt nur von Größe, Stil und Startwert ab
    const gkey = JSON.stringify([W, H, scene.biome, scene.seed]);
    if (this.keys.grass !== gkey) {
      this.keys.grass = gkey;
      this.grass = canvas(W, H);
      drawGround(this.grass.getContext('2d'), W, H, B, rng((scene.seed | 0) + 5), scene.seed | 0);
    }
    const ground = canvas(W, H);
    const c = ground.getContext('2d');
    c.drawImage(this.grass, 0, 0);
    const shadow = canvas(W, H);
    const cf = shapeField(scene.cave || [], W, H);
    let caveLoops = contours(cf);
    if (caveLoops.length) caveLoops = drawCave(c, W, H, B, P, cf, caveLoops, shadow);
    drawDirt(c, W, H, B, scene.dirt || []);
    drawPaths(c, W, H, B, P, scene.paths || [], scene.scale === 'overview');
    const rf = shapeField(scene.roads || [], W, H);
    drawRoads(c, W, H, B, P, scene.roads || [], rf);
    const wf = shapeField(scene.water || [], W, H);
    const loops = contours(wf);
    drawShore(c, B, P, loops);
    const water = drawWaterBase(W, H, B, P, wf);
    const levels = [];
    for (const lvl of [1, 2, 3]) {
      const shapes = (scene.high || []).filter((s) => (s.lvl || 1) === lvl);
      if (!shapes.length) continue;
      const f = shapeField(shapes, W, H);
      const loops = contours(f);
      if (loops.length) drawPlateau(c, W, H, B, P, f, loops, this.grass, shadow);
      levels.push(f);
    }
    if (levels.length && ((scene.dirt || []).length || (scene.paths || []).length || (scene.roads || []).length)) {
      // Zufahrt und Burghof liegen auf dem Hügel: dort noch einmal malen, beschnitten auf die Hochfläche –
      // wo ein Weg die Felskante quert, wirkt er als Rampe
      const top = canvas(W, H);
      const t = top.getContext('2d');
      drawDirt(t, W, H, B, scene.dirt || []);
      drawPaths(t, W, H, B, rng((scene.seed | 0) + 12), scene.paths || [], scene.scale === 'overview');
      drawRoads(t, W, H, B, rng((scene.seed | 0) + 13), scene.roads || [], rf);
      t.globalCompositeOperation = 'destination-in';
      // Maske: alle Stufen zusammen (eine obere Stufe kann über die untere hinausragen)
      const mk = canvas(W, H);
      const m = mk.getContext('2d');
      for (const f of levels) {
        const one = new Path2D();
        for (const L of contours(f)) trace(one, L.pts);
        m.fill(one, 'evenodd');
      }
      t.drawImage(mk, 0, 0);
      c.drawImage(top, 0, 0);
    }
    this.terrain = { ground, water, shadow, wf, loops, levels, cf, caveLoops, rf, pf: shapeField(scene.paths || [], W, H, 0) };
  }

  isWater(x, y) {
    return fieldAt(this.terrain.wf, x, y) >= 0.5;
  }
  /** Liegt die Stelle auf Höhlenboden? */
  isCave(x, y) {
    return fieldAt(this.terrain.cf, x, y) >= 0.5;
  }
  levelAt(x, y) {
    let l = 0;
    this.terrain.levels.forEach((f, i) => {
      if (fieldAt(f, x, y) >= 0.5) l = i + 1;
    });
    return l;
  }
  /** Darf hier ein Baum/Busch/Fels stehen? (Wasser, Gebäude, Wege und Felskanten bleiben frei.) */
  blocked(scene, x, y, r, t, foot) {
    const { W, H } = sceneSize(scene);
    if (x < -r || y < -r || x > W + r || y > H + r) return true;
    const lvl = this.levelAt(x, y);
    const k = t === 'rock' ? 0.5 : 1;
    const solid = biomeOf(scene).solid;
    // Häuser prüfen ihre Grundfläche (foot) und dürfen bis an den Straßenrand; alles andere einen Kreis um die Mitte
    const road = foot ? 0.55 : 0.4;
    for (let i = 0; i < 9; i++) {
      const px = foot ? foot[i][0] : i ? x + Math.cos(i * 0.785) * r * k : x;
      const py = foot ? foot[i][1] : i ? y + Math.sin(i * 0.785) * r * k : y;
      if (this.isWater(px, py) && t !== 'rock') return true;
      // In Dungeon und Höhle ist nur der Höhlenboden frei – der Rest ist massiver Fels
      if (solid && fieldAt(this.terrain.cf, px, py) < 0.5) return true;
      if (fieldAt(this.terrain.pf, px, py) > 0.3 || fieldAt(this.terrain.rf, px, py) > road) return true;
      if (this.levelAt(px, py) !== lvl) return true;
      if ((scene.rooms || []).some((rm) => inRoom(rm, px, py, -WT))) return true;
      // Häuser halten Abstand zu Mauern, Palisaden und deren Türmen
      if (foot) {
        for (const w of scene.walls || []) {
          const dx = w.x2 - w.x1;
          const dy = w.y2 - w.y1;
          const u = Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / (dx * dx + dy * dy || 1)));
          const d = Math.hypot(w.x1 + dx * u - px, w.y1 + dy * u - py);
          if (d < (w.kind === 'rampart' ? RT / 2 + 8 : 14)) return true;
          if (w.kind === 'rampart' && (Math.hypot(w.x1 - px, w.y1 - py) < TR + 6 || Math.hypot(w.x2 - px, w.y2 - py) < TR + 6)) return true;
        }
      }
    }
    return false;
  }

  /** Böden, Wände und deren Schatten neu zeichnen, falls sich am Gebäude etwas geändert hat. */
  renderBuild(scene) {
    const key = JSON.stringify([scene.cols, scene.rows, scene.biome, scene.seed, scene.rooms, scene.walls, scene.openings]);
    if (this.keys.build === key) return;
    this.keys.build = key;
    const { W, H } = sceneSize(scene);
    const B = biomeOf(scene);
    const rooms = scene.rooms || [];
    const inner = scene.walls || [];
    const openings = scene.openings || [];
    const floors = canvas(W, H);
    const f = floors.getContext('2d');
    stones = B.solid ? STONES_DEEP : STONES;
    if (B.solid) {
      // Mauerfuß: der Fels wird zur Mauer hin weich dunkler – die Räume sitzen im Gestein statt wie ausgeschnitten
      const foot = buildingOutline(rooms);
      f.lineCap = 'round';
      for (const [lw, al] of [[66, 0.07], [46, 0.09], [28, 0.12]]) {
        f.strokeStyle = `rgba(20,19,17,${al})`;
        f.lineWidth = lw;
        f.beginPath();
        for (const q of foot.segs) (f.moveTo(q.x1, q.y1), f.lineTo(q.x2, q.y2));
        for (const q of foot.arcs) (f.moveTo(q.cx + Math.cos(q.a0) * q.r, q.cy + Math.sin(q.a0) * q.r), f.arc(q.cx, q.cy, q.r, q.a0, q.a1));
        f.stroke();
      }
    }
    // Je Bodenart ein durchgehendes Muster über alle Räume dieser Art – verschmolzene Räume haben so keine Naht
    const patterns = new Map();
    const pattern = (kind) => {
      if (!patterns.has(kind)) {
        const boxes = rooms.filter((r) => (r.floor || 'wood') === kind).map(roomBox);
        const x0 = Math.floor(Math.min(...boxes.map((b) => b[0])));
        const y0 = Math.floor(Math.min(...boxes.map((b) => b[1])));
        const x1 = Math.ceil(Math.max(...boxes.map((b) => b[0] + b[2])));
        const y1 = Math.ceil(Math.max(...boxes.map((b) => b[1] + b[3])));
        const cv = canvas(x1 - x0, y1 - y0);
        const p = cv.getContext('2d');
        p.translate(-x0, -y0);
        drawFloor(p, rng(hashStr(kind)), kind, x0, y0, x1 - x0, y1 - y0, B);
        patterns.set(kind, [cv, x0, y0]);
      }
      return patterns.get(kind);
    };
    for (const r of rooms) {
      const path = roomPath(r);
      if (r.ruin) {
        const [bx, by, bw, bh] = roomBox(r);
        const x0 = Math.max(0, Math.floor(bx - 20));
        const y0 = Math.max(0, Math.floor(by - 20));
        const x1 = Math.min(W, Math.ceil(bx + bw + 20));
        const y1 = Math.min(H, Math.ceil(by + bh + 20));
        if (x1 <= x0 || y1 <= y0) continue;
        const tmp = canvas(x1 - x0, y1 - y0);
        const t = tmp.getContext('2d');
        t.translate(-x0, -y0);
        paintMask(t, [x0, y0, x1 - x0, y1 - y0], (m) => {
          // Raumfläche mit weichem Rand: die Schwelle mit Rauschen macht daraus eine ausgebrochene Kante
          m.shadowColor = '#fff';
          m.shadowBlur = 22;
          m.shadowOffsetX = 30000;
          m.translate(-30000, 0);
          m.fillStyle = '#fff';
          m.fill(path);
        }, (v, x, y, out) => {
          out[0] = out[1] = out[2] = 255;
        }, { thr: 0.5, edge: 0.05, warp: 0.55, fine: 0.42, ox: 91, oy: 300 });
        t.globalCompositeOperation = 'source-in';
        t.drawImage(...pattern(r.floor || 'wood'));
        f.drawImage(tmp, x0, y0);
        continue;
      }
      f.save();
      f.clip(path);
      f.drawImage(...pattern(r.floor || 'wood'));
      f.restore();
      if (r.open) {
        f.strokeStyle = INK;
        f.lineWidth = 1.6;
        f.stroke(path);
      }
    }
    if (B.solid) {
      // unter der Erde: Böden gedämpfter, mit weichen Schmutzwolken
      const PD = rng(hashStr(`deep${scene.seed}`));
      f.save();
      f.globalCompositeOperation = 'source-atop';
      f.fillStyle = 'rgba(38,32,24,.14)';
      f.fillRect(0, 0, W, H);
      for (let i = 0, n = (W * H) / 90000; i < n; i++) soft(f, PD.rnd(0, W), PD.rnd(0, H), PD.rnd(120, 260), '58,52,43', PD.rnd(0.18, 0.28), 0.25);
      f.restore();
    }
    // Ruinen: Gras wächst stellenweise über den Boden – weich auslaufend, über alle Ruinenräume hinweg
    const ruins = rooms.filter((r) => r.ruin);
    if (ruins.length && this.grass) {
      const boxes = ruins.map(roomBox);
      const x0 = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b[0]))));
      const y0 = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b[1]))));
      const x1 = Math.min(W, Math.ceil(Math.max(...boxes.map((b) => b[0] + b[2]))));
      const y1 = Math.min(H, Math.ceil(Math.max(...boxes.map((b) => b[1] + b[3]))));
      if (x1 > x0 && y1 > y0) {
        const PR = rng(hashStr(`ruin${ruins[0].id}`));
        const over = canvas(x1 - x0, y1 - y0);
        const o = over.getContext('2d');
        o.translate(-x0, -y0);
        paintMask(o, [x0, y0, x1 - x0, y1 - y0], (m) => {
          for (let i = 0, n = Math.max(3, ((x1 - x0) * (y1 - y0)) / 12000); i < n; i++) soft(m, PR.rnd(x0, x1), PR.rnd(y0, y1), PR.rnd(40, 120), '255,255,255', PR.rnd(0.5, 0.9), 0.4);
        }, (v, x, y, out) => {
          out[0] = out[1] = out[2] = 255;
        }, { thr: 0.42, edge: 0.14, warp: 0.5, fine: 0.2 });
        o.globalCompositeOperation = 'source-in';
        o.drawImage(this.grass, 0, 0);
        const all = new Path2D();
        for (const r of ruins) all.addPath(roomPath(r));
        f.save();
        f.clip(all);
        f.drawImage(over, x0, y0);
        f.restore();
      }
    }
    const outline = buildingOutline(rooms);
    const closed = rooms.filter((r) => !r.open);
    // Schatten: der Grundriss wirft einen langen Schatten nach außen; innen bleibt es hell, dort werfen nur die Wände
    const shadow = canvas(W, H);
    const s = shadow.getContext('2d');
    s.fillStyle = s.strokeStyle = '#000';
    const sweep = (len, draw) => {
      for (let k = 0; ; k += 1.5) {
        const t = Math.min(k, len);
        s.save();
        s.translate(LIGHT[0] * t, LIGHT[1] * t);
        draw();
        s.restore();
        if (k >= len) break;
      }
    };
    const grown = new Path2D();
    const inside = new Path2D();
    for (const r of closed) {
      // Ruinen haben kein Dach mehr, und im massiven Fels gibt es kein Außen: dort entfällt der lange Hausschatten
      const tall = !r.ruin && !B.solid;
      if (r.k === 'circle') (tall && (grown.moveTo(r.cx + r.r + WT / 2, r.cy), grown.arc(r.cx, r.cy, r.r + WT / 2, 0, 7)), inside.moveTo(r.cx + r.r, r.cy), inside.arc(r.cx, r.cy, r.r, 0, 7));
      else (tall && grown.rect(r.x - WT / 2, r.y - WT / 2, r.w + WT, r.h + WT), inside.rect(r.x, r.y, r.w, r.h));
    }
    sweep(112, () => s.fill(grown));
    s.save();
    s.globalCompositeOperation = 'destination-out';
    s.fill(inside);
    s.restore();
    // Verfallene Mauern: nur Teile bleiben stehen; an den Bruchstellen liegen lose Steine
    const rubble = [];
    const pieces = outline.segs.flatMap((sg) => wallPieces(sg, openings)).flatMap((p) => {
      if (!isRuinWall(rooms, (p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2)) return [p];
      const parts = ruinPieces(p);
      for (const q of parts) rubble.push([q.x1, q.y1], [q.x2, q.y2]);
      return parts;
    });
    const arcs = outline.arcs.flatMap((a) => arcPieces(a, openings)).flatMap((a) => {
      const mid = (a.a0 + a.a1) / 2;
      if (!isRuinWall(rooms, a.cx + Math.cos(mid) * a.r, a.cy + Math.sin(mid) * a.r)) return [a];
      const parts = ruinArcPieces(a);
      for (const q of parts) rubble.push([q.cx + Math.cos(q.a0) * q.r, q.cy + Math.sin(q.a0) * q.r], [q.cx + Math.cos(q.a1) * q.r, q.cy + Math.sin(q.a1) * q.r]);
      return parts;
    });
    const posts = outline.posts.filter(([x, y]) => !isRuinWall(rooms, x, y) || rng(hashStr(`rp${Math.round(x)}|${Math.round(y)}`)).R() < 0.6);
    const innerPieces = inner.flatMap((w) => wallPieces(w, openings).map((p) => ({ ...p, kind: w.kind || 'wood' })));
    // Der Boden wird zu den Wänden hin weich dunkler (Schmutz in den Ecken, weniger Licht)
    f.save();
    f.clip(inside);
    f.lineCap = 'round';
    for (const [lw, al] of [[56, 0.022], [50, 0.024], [44, 0.026], [38, 0.028], [32, 0.03], [26, 0.032], [20, 0.034], [15, 0.04]]) {
      f.strokeStyle = `rgba(30,22,10,${al})`;
      f.lineWidth = lw;
      f.beginPath();
      for (const q of [...pieces, ...innerPieces]) (f.moveTo(q.x1, q.y1), f.lineTo(q.x2, q.y2));
      for (const q of arcs) (f.moveTo(q.cx + Math.cos(q.a0) * q.r, q.cy + Math.sin(q.a0) * q.r), f.arc(q.cx, q.cy, q.r, q.a0, q.a1));
      f.stroke();
    }
    f.restore();
    const line = (p, w) => {
      s.lineWidth = w;
      s.lineCap = 'butt';
      s.beginPath();
      s.moveTo(p.x1, p.y1);
      s.lineTo(p.x2, p.y2);
      s.stroke();
    };
    sweep(16, () => {
      for (const p of pieces) line(p, WT);
      for (const a of arcs) {
        s.lineWidth = WT;
        s.beginPath();
        s.arc(a.cx, a.cy, a.r, a.a0, a.a1);
        s.stroke();
      }
      for (const [x, y] of posts) s.fillRect(x - 12, y - 12, 24, 24);
    });
    sweep(12, () => {
      for (const p of innerPieces) if (p.kind !== 'rampart') line(p, p.kind === 'stone' ? WT : p.kind === 'palisade' ? PT : BT);
    });
    const towers = [];
    for (const p of inner) if (p.kind === 'rampart') towers.push([p.x1, p.y1], [p.x2, p.y2]);
    // Schatten nach Höhe: die Türme überragen die Mauer
    sweep(30, () => {
      for (const p of innerPieces) if (p.kind === 'rampart') line(p, RT);
    });
    sweep(46, () => {
      for (const [x, y] of towers) (s.beginPath(), s.arc(x, y, TR, 0, 7), s.fill());
    });
    // Wände
    const walls = canvas(W, H);
    const w = walls.getContext('2d');
    for (const p of pieces) stoneWall(w, p);
    for (const a of arcs) stoneArc(w, a);
    for (const p of innerPieces) (p.kind === 'stone' ? stoneWall : p.kind === 'rampart' ? rampartWall : p.kind === 'palisade' ? palisadeWall : woodWall)(w, p);
    for (const [x, y] of posts) post(w, x, y, 'stone');
    for (const [x, y] of rubble) {
      const P = rng(hashStr(`rb${Math.round(x)}|${Math.round(y)}`));
      for (let i = 0, n = 2 + P.int(4); i < n; i++) {
        const sz = P.rnd(7, 15);
        w.save();
        w.translate(x + P.rnd(-24, 24), y + P.rnd(-24, 24));
        w.rotate(P.rnd(0, 3));
        block(w, P, -sz / 2, -sz * 0.36, sz, sz * 0.72, P.pick(stones), 2, 1.3);
        w.restore();
      }
    }
    const ends = new Map();
    for (const p of inner) {
      for (const [x, y] of [[p.x1, p.y1], [p.x2, p.y2]]) {
        const k = `${Math.round(x)}|${Math.round(y)}`;
        if (ends.get(k)?.[2] !== 'rampart') ends.set(k, [x, y, p.kind || 'wood']);
      }
    }
    for (const [x, y, kind] of ends.values()) {
      if (kind === 'rampart' || !posts.some((q) => Math.hypot(q[0] - x, q[1] - y) < 6)) post(w, x, y, kind);
    }
    // Türblätter auf eigener Ebene: im Kartenbild fehlen sie, im Spiel werden sie darüber gezeichnet (auf und zu)
    const doors = canvas(W, H);
    const dc = doors.getContext('2d');
    for (const o of openings) {
      if (o.k === 'door') {
        for (const d of [-1, 1]) post(w, o.x + Math.cos(o.a) * d * (o.w / 2), o.y + Math.sin(o.a) * d * (o.w / 2), 'wood');
      }
      drawOpening(o.k === 'window' ? w : dc, o);
    }
    this.build = { floors, walls, shadow, doors };
  }

  /**
   * Daten für die belebte Karte auf Spieltisch und Spieler-Display: Baumkronen zum Wiegen, auf dem Wasser Stellen
   * für treibende dunklere Zonen, Glitzern und Wellen, die ans Ufer laufen. Alles steht auch unbewegt im Kartenbild.
   */
  animData(scene) {
    this.renderTerrain(scene);
    const { W, H } = sceneSize(scene);
    const B = biomeOf(scene);
    const P = rng((scene.seed | 0) + 77);
    // Pilze (Höhle, Dungeon) wiegen sich nicht
    let trees = B.tree === 'shroom' ? [] : (scene.objects || []).filter((o) => o.t === 'tree').map((o) => [o.x, o.y, Math.round(sprite(o, B, 1).w), (o.v | 0) % SHAPES]);
    // Wiegende Kronen kosten auf der Anzeige je Stück ein Bild: bei Wäldern nur eine Auswahl bewegen, gleichmäßig verteilt
    if (trees.length > 120) trees = trees.filter((_, k) => Math.floor((k * 120) / trees.length) !== Math.floor(((k - 1) * 120) / trees.length));
    const f = this.terrain.wf;
    const inside = new Uint8Array(f.F.length);
    let any = false;
    for (let p = 0; p < inside.length; p++) if (f.F[p] >= 0.5) (inside[p] = 1), (any = true);
    const water = { blobs: [], glints: [], waves: [] };
    if (any) {
      const D = chamfer(inside, f.gw, f.gh);
      const depth = (x, y) => D[Math.min(f.gh - 1, Math.max(0, Math.round(y / K) + PAD)) * f.gw + Math.min(f.gw - 1, Math.max(0, Math.round(x / K) + PAD))] * K;
      for (let i = 0, n = (W * H) / 9000; i < n; i++) {
        const x = Math.round(P.rnd(0, W));
        const y = Math.round(P.rnd(0, H));
        const d = depth(x, y);
        if (d > 60 && P.R() < 0.3 && water.blobs.length < 60) water.blobs.push([x, y, Math.round(Math.min((d - 10) * 0.7, P.rnd(60, 150)))]);
        else if (d > 16 && P.R() < 0.5 && water.glints.length < 120) water.glints.push([x, y]);
      }
      for (const L of this.terrain.loops) {
        for (let i = P.int(10); i < L.pts.length; i += 10 + P.int(12)) {
          const off = P.rnd(12, 24);
          const x = Math.round(L.pts[i][0] - L.nrm[i][0] * off);
          const y = Math.round(L.pts[i][1] - L.nrm[i][1] * off);
          if (x < 0 || y < 0 || x > W || y > H || water.waves.length >= 160) continue;
          water.waves.push([x, y, Math.round((Math.atan2(L.nrm[i][1], L.nrm[i][0]) * 180) / Math.PI)]);
        }
      }
    }
    // Unter der Erde ziehen weder Wolken noch Vögel; ohne Wasser gibt es dort nichts zu bewegen
    if (B.solid) return any ? { v: 1, biome: scene.biome, trees, water, birds: false, clouds: false } : null;
    return { v: 1, biome: scene.biome, trees, water };
  }

  /** Bild eines Gegenstands; lädt es noch, wird nach dem Laden onLoad gerufen. */
  spriteOf(scene, o) {
    const sp = sprite(o, biomeOf(scene), 1);
    if (sp && !sp.img && !this.loading.has(sp.promise)) {
      this.loading.add(sp.promise);
      sp.promise.then(() => {
        this.loading.delete(sp.promise);
        if (!this.loading.size) this.onLoad?.();
      });
    }
    return sp;
  }
  /** Wartet, bis alle Bilder der Szene geladen sind. */
  async ready(scene) {
    await Promise.all((scene.objects || []).map((o) => sprite(o, biomeOf(scene), 1)?.promise));
  }

  /** Alles zusammensetzen. hide: IDs von Gegenständen, die fehlen sollen (z. B. der gerade gezogene). */
  compose(scene, { hide, noDoors } = {}) {
    this.renderTerrain(scene);
    this.renderBuild(scene);
    const { W, H } = sceneSize(scene);
    const B = biomeOf(scene);
    for (const cv of [this.out, this.sh]) {
      if (cv.width !== W || cv.height !== H) {
        cv.width = W;
        cv.height = H;
      }
    }
    const c = this.out.getContext('2d');
    c.globalCompositeOperation = 'source-over';
    c.drawImage(this.terrain.water, 0, 0);
    c.drawImage(this.terrain.ground, 0, 0);
    c.drawImage(this.build.floors, 0, 0);
    const list = [];
    for (const o of scene.objects || []) {
      if (hide?.has(o.id)) continue;
      const sp = this.spriteOf(scene, o);
      if (sp?.img) list.push([o, sp]);
    }
    const draw = (ctx, o, sp) => {
      ctx.translate(o.x, o.y);
      if (o.rot) ctx.rotate((o.rot * Math.PI) / 180);
      if (o.flip) ctx.scale(-1, 1);
      ctx.drawImage(sp.img, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
    };
    for (const [o, sp] of list) {
      if (sp.layer !== 'rug') continue;
      c.save();
      draw(c, o, sp);
      c.restore();
    }
    // Steine im Wasser: heller Hof und unterbrochene Ringe
    for (const [o, sp] of list) {
      if (o.t !== 'rock' || !this.isWater(o.x, o.y)) continue;
      const P = rng(hashStr(o.id));
      const r = sp.w * 0.42;
      soft(c, o.x, o.y, r * 1.9, rgb(B.foam), 0.3, 0.5);
      for (const [k, w, br] of [[1.14, 2.6, 0.12], [1.42, 2, 0.3]]) {
        const s0 = P.rnd(0, 50);
        const pts = [];
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * 6.283;
          const rr = r * k * (1 + 0.1 * (n1src(Math.cos(a) * 2.2 + s0, Math.sin(a) * 2.2 + s0) - 0.5));
          pts.push([o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr * 0.86]);
        }
        ink(c, P, pts, w, `rgba(${rgb(B.foam)},.95)`, true, br);
      }
    }
    // Ein Schattenwurf für alles: Silhouetten in Lichtrichtung, einmal als harte, leicht kühle Abdunklung aufgetragen
    const s = this.sh.getContext('2d');
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, W, H);
    s.drawImage(this.terrain.shadow, 0, 0);
    s.drawImage(this.build.shadow, 0, 0);
    for (const [o, sp] of list) {
      if (!sp.shadow) continue;
      // lange Schatten in größeren Schritten: der weiche Rand glättet die Stufen, und es spart viele Stempel
      const step = sp.shadow > 30 ? 4 : sp.shadow > 14 ? 3 : 2;
      for (let k = 0; ; k += step) {
        const t = Math.min(k, sp.shadow);
        s.save();
        s.translate(LIGHT[0] * t, LIGHT[1] * t);
        draw(s, o, sp);
        s.restore();
        if (k >= sp.shadow) break;
      }
    }
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = B.shadow;
    s.fillRect(0, 0, W, H);
    // Fünf leicht versetzte Lagen: zusammen die volle Abdunklung, am Rand ein weicher Übergang von wenigen Pixeln
    c.globalCompositeOperation = 'multiply';
    c.globalAlpha = 0.24;
    for (const [dx, dy] of [[0, 0], [2.2, 0], [-2.2, 0], [0, 2.2], [0, -2.2]]) c.drawImage(this.sh, dx, dy);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.drawImage(this.build.walls, 0, 0);
    if (!noDoors) c.drawImage(this.build.doors, 0, 0);
    for (const layer of ['obj', 'top']) {
      for (const [o, sp] of list) {
        if (sp.layer !== layer) continue;
        c.save();
        draw(c, o, sp);
        c.restore();
      }
    }
    return this.out;
  }
}
