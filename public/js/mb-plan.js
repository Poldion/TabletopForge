// Kartenbauer: aus einem Bauplan eine Szene machen. Der Bauplan ist eine grobe Beschreibung in Feldern (Räume, Türen,
// Wasser, Wege, Baumgruppen …), wie sie ein Sprachmodell liefern kann; hier wird daraus eine regelgerechte Szene –
// Räume im Raster, Trennwände zwischen aneinanderstoßenden Räumen, Türen genau auf der Wand, jeder Raum erreichbar.
// Reine Rechnung ohne DOM, damit es sich ohne Browser testen lässt.
import { CELL, newScene, chaikin } from './mb-geom.js';
import { PLACE, TABLE_SEATS, THEMES } from './mb-themes.js';

/** Bodenarten des Pinsels „Untergrund“ (wie in mb-render.js). */
const GROUND_KINDS = ['forest', 'gravel', 'ruin', 'mud', 'leaves', 'ash', 'snow', 'gloom'];

export const PLAN_BIOMES = ['meadow', 'desert', 'tundra', 'magic', 'shire', 'swamp', 'town', 'dungeon', 'cave'];
const AREA_KINDS = ['trees', 'bushes', 'rocks', 'mixed', 'swamp', 'ruins', 'deadwood', 'graves', 'houses'];
const SIDES = { n: 0, e: 1, s: 2, w: 3 };
/** Was nur in Häuser gehört und draußen wegfällt. */
const INDOOR_ONLY = new Set('bar fireplace stove shelf bookshelf bed wardrobe bunk wallTorch chains cellBars desk rug rugRound bathtub armchair pew lectern candelabra'.split(' '));

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const half = (v) => Math.round(v * 2) / 2; // Räume rasten auf halbe Felder

/**
 * Einrichtung aus dem Bauplan in eine Regeltabelle für furnish() übersetzen.
 * list: [{ t, n, at: 'wall' | 'corner' | 'center' | 'floor', seats, seatCount }]; allowed(t) sagt, ob es den Gegenstand
 * gibt und ob er in einen Raum gehört. Liefert { wall, corner, center, rug } oder null, wenn nichts Brauchbares dabei ist.
 */
export function themeFromPlan(list, allowed = () => true) {
  const theme = { wall: [], corner: [], center: [], rug: [], custom: true };
  let total = 0;
  const loose = []; // Sitze ohne Tisch: [t, n]
  const seen = new Map(); // gleiche Gegenstände an gleicher Stelle zusammenfassen
  for (const it of Array.isArray(list) ? list.slice(0, 30) : []) {
    const t = String(it?.t ?? it?.id ?? it?.type ?? '');
    if (!allowed(t)) continue;
    const n = clamp(Math.round(num(it.n ?? it.count, 1)), 1, 12);
    if (total + n > 60) break;
    total += n;
    const wish = String(it.at ?? it.where ?? '').toLowerCase();
    const said = wish.startsWith('wall') ? 'wall' : wish.startsWith('corner') ? 'corner' : wish === 'floor' || wish === 'rug' ? 'rug' : wish ? 'center' : '';
    // Der Stellplatz steht für bekannte Gegenstände fest (Regal an die Wand, Fass in die Ecke, Teppich auf den Boden);
    // die Angabe der KI zählt nur, wo mehrere Plätze passen
    const ok = PLACE[t];
    if (ok?.[0] === 'seat') {
      loose.push([t, n]);
      continue;
    }
    const key = ok ? (ok.includes(said) ? said : ok[0]) : said || 'center';
    const rule = { fix: n };
    const seat = String(it.seats ?? it.with ?? '');
    if (key !== 'rug' && seat && allowed(seat) && (PLACE[seat]?.[0] === 'seat' || seat === 'bench')) rule.with = [seat, clamp(Math.round(num(it.seatCount, seat === 'bench' ? 2 : 4)), 1, 8)];
    const same = seen.get(`${key}:${t}`);
    if (same && !rule.with === !same[2].with) {
      same[2].fix = Math.min(12, same[2].fix + n);
      continue;
    }
    const entry = [t, 0, rule];
    seen.set(`${key}:${t}`, entry);
    theme[key].push(entry);
  }
  // Hocker und Stühle, die die KI für sich aufzählt, rücken an Tische, die noch keine Sitze haben – sonst entfallen sie
  const tables = [...theme.center, ...theme.wall].filter((e) => TABLE_SEATS[e[0]] || e[0] === 'kitchenTable');
  for (const [t, n] of loose) {
    const table = tables.find((e) => !e[2].with);
    if (table) table[2].with = [t, clamp(Math.round(n / table[2].fix) || 1, 1, 6)];
    else total -= n;
  }
  // Tische ohne Sitze bekommen die üblichen
  for (const e of tables) if (!e[2].with && TABLE_SEATS[e[0]] && allowed(TABLE_SEATS[e[0]][0])) e[2].with = [...TABLE_SEATS[e[0]]];
  return total > 0 ? theme : null;
}

/** Was in einem verfallenen Raum stehen bleibt: Stein und Unverwüstliches. */
const RUIN_KEEP = new Set(['altar', 'statue', 'sarcophagus', 'coffin', 'pillar', 'pillarBroken', 'urns', 'skulls', 'bones', 'web', 'rubble', 'candles', 'fountain', 'throne', 'glyph', 'magicCircle', 'treasure', 'crystal', 'spiral', 'trapdoor', 'stairsDown', 'chains', 'lever', 'portal', 'pebbles', 'mossPatch', 'fallenStatue']);

/**
 * Düstere Zonen gehören an den Schauplatz: Liegt eine weit weg von allem, was düster sein kann (Ruine, Gräber,
 * Totholz, Sumpf, Treppe in die Tiefe, verfallene Räume), rückt sie dorthin – mit ihrer Form.
 */
function placeGloom(scene, rects) {
  const spots = [];
  const mid = (sh) => (sh.k === 'rect' ? [sh.x + sh.w / 2, sh.y + sh.h / 2] : [sh.cx, sh.cy]);
  for (const f of scene.fills) if (['ruins', 'graves', 'deadwood', 'swamp'].includes(f.kind) && !f.edge) spots.push(mid(f.shape));
  for (const g of scene.grounds) if (['ruin', 'ash'].includes(g.g)) spots.push(g.pts[Math.floor(g.pts.length / 2)]);
  for (const q of scene.objects) if (['stairsDown', 'fallenStatue', 'ruinArch', 'gravestone', 'sarcophagus', 'altar'].includes(q.t)) spots.push([q.x, q.y]);
  for (const b of rects) if (b.ruin) spots.push([b.cx, b.cy]);
  if (!spots.length) return;
  for (const g of scene.grounds) {
    if (g.g !== 'gloom' || g.sub) continue;
    const c = [g.pts.reduce((a, p) => a + p[0], 0) / g.pts.length, g.pts.reduce((a, p) => a + p[1], 0) / g.pts.length];
    const near = spots.slice().sort((p, q) => Math.hypot(p[0] - c[0], p[1] - c[1]) - Math.hypot(q[0] - c[0], q[1] - c[1]))[0];
    if (Math.hypot(near[0] - c[0], near[1] - c[1]) < g.r + 2 * CELL) continue;
    const [dx, dy] = [near[0] - c[0], near[1] - c[1]];
    g.pts = g.pts.map(([x, y]) => [Math.round(x + dx), Math.round(y + dy)]);
  }
}

/**
 * Deckung ergänzen: Eine Kampfkarte braucht alle paar Felder etwas, hinter dem man sich verstecken kann. Wo ein
 * großes Stück freie Wiese ohne jede Deckung liegt (kein Gebäude, kein Wasser, kein Weg, kein Gegenstand, kein
 * Füllbereich), kommt eine kleine, lockere Gruppe Büsche oder Felsen dazu. Freie Kampffläche bleibt trotzdem.
 */
function addCover(scene, rects, { W, H, cols, rows, uid }) {
  const S = 2.5 * CELL; // Schrittweite der Prüfstellen
  let v = (scene.seed * 2654435761) >>> 0;
  const R = () => ((v = (v * 1664525 + 1013904223) >>> 0) / 4294967296);
  const inFill = (x, y, m) => scene.fills.some((f) => {
    const sh = f.shape;
    return sh.k === 'rect' ? x > sh.x - m && x < sh.x + sh.w + m && y > sh.y - m && y < sh.y + sh.h + m : ((x - sh.cx) / (sh.rx + m)) ** 2 + ((y - sh.cy) / (sh.ry + m)) ** 2 < 1;
  });
  const busy = (x, y) => inFill(x, y, 0.8 * CELL)
    || rects.some((b) => x > b.x - 2 * CELL && x < b.x + b.w + 2 * CELL && y > b.y - 2 * CELL && y < b.y + b.h + 2 * CELL)
    || scene.objects.some((q) => Math.hypot(q.x - x, q.y - y) < 2.2 * CELL)
    || [...scene.water].some((w) => nearestOn([w.pts], x, y)?.d < w.r + CELL)
    || [...scene.paths, ...scene.roads].some((w) => nearestOn([w.pts], x, y)?.d < w.r + 0.8 * CELL);
  const kinds = scene.biome === 'desert' ? ['rocks'] : scene.biome === 'swamp' ? ['swamp'] : ['bushes', 'rocks', 'bushes', 'deadwood'];
  let added = 0;
  for (let gy = 0; gy < Math.floor(rows / 2.5); gy++) {
    for (let gx = 0; gx < Math.floor(cols / 2.5); gx++) {
      const x = (gx + 0.5) * S + (R() - 0.5) * CELL;
      const y = (gy + 0.5) * S + (R() - 0.5) * CELL;
      if (x < 2 * CELL || y < 2 * CELL || x > W - 2 * CELL || y > H - 2 * CELL) continue;
      // nur, wenn das ganze Prüffeld leer ist – eine Ecke mit Deckung reicht schon
      const probe = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [x + a * 1.4 * CELL, y + b * 1.4 * CELL]);
      if (probe.some(([px, py]) => busy(px, py))) continue;
      if (R() < 0.35) continue; // nicht jede leere Stelle: freie Fläche bleibt
      const rx = (1.4 + R() * 0.8) * CELL;
      if (scene.fills.some((f) => f.cover && Math.hypot(f.shape.cx - x, f.shape.cy - y) < 5 * CELL)) continue;
      scene.fills.push({ id: uid(), kind: kinds[Math.floor(R() * kinds.length)], seed: Math.floor(R() * 1e9), density: 1.5, shape: { k: 'ellipse', cx: Math.round(x), cy: Math.round(y), rx: Math.round(rx), ry: Math.round(rx * (0.6 + R() * 0.4)) }, cover: true });
      if (++added >= 12) return;
    }
  }
}

/** Umriss eines Füllbereichs (Rechteck oder Ellipse) als Rechteck. */
const shapeBounds = (sh) => (sh.k === 'rect' ? { x: sh.x, y: sh.y, w: sh.w, h: sh.h } : { x: sh.cx - sh.rx, y: sh.cy - sh.ry, w: 2 * sh.rx, h: 2 * sh.ry });

/**
 * Fluss mäandern lassen: die Linie der KI (oft nur zwei, drei Punkte) dicht abtasten und quer dazu in weiten,
 * unregelmäßigen Bögen auslenken – zwei überlagerte Wellen mit zufälliger Phase, die Weite wächst mit der Breite des
 * Flusses. Liefert Punkte etwa alle 35 px.
 */
export function meander(pts, seed, r, { amp = 1, taper = false } = {}) {
  let v = seed >>> 0 || 1;
  const R = () => ((v = (v * 1664525 + 1013904223) >>> 0) / 4294967296);
  const dense = [];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 35));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) dense.push([x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n]);
  }
  if (dense.length < 6) return pts;
  const len = (dense.length - 1) * 35;
  if (len < 6 * CELL) return pts;
  // Kurven nie enger als gut die doppelte Flussbreite, sonst knickt das Ufer innen: Krümmung einer Welle a·sin(2πt/l)
  // ist höchstens a·(2π/l)²; drei Viertel davon für die große Welle, ein Viertel für die kleine
  const cmax = 1 / (2.4 * Math.max(r, 40) + 40);
  const l1 = (12 + R() * 6) * CELL;
  const a1 = Math.min(clamp(1.2 * CELL + r * 0.4, 70, 220), (0.75 * cmax) / (6.283 / l1) ** 2);
  const l2 = (6 + R() * 3) * CELL;
  const a2 = Math.min(0.4 * CELL, (0.25 * cmax) / (6.283 / l2) ** 2);
  const p1 = R() * 6.283;
  const p2 = R() * 6.283;
  return dense.map(([x, y], i) => {
    // Richtung aus den Nachbarn (geglättet), quer dazu auslenken
    const [ax, ay] = dense[Math.max(0, i - 3)];
    const [bx, by] = dense[Math.min(dense.length - 1, i + 3)];
    const d = Math.hypot(bx - ax, by - ay) || 1;
    const [nx, ny] = [-(by - ay) / d, (bx - ax) / d];
    const t = i * 35;
    // Wege bleiben an ihren Enden (Tür, Brücke, Rand), nur dazwischen schwingen sie
    const ends = taper ? Math.min(1, t / (2 * CELL), (len - t) / (2 * CELL)) : 1;
    const off = (a1 * Math.sin((6.283 * t) / l1 + p1) + a2 * Math.sin((6.283 * t) / l2 + p2)) * amp * ends;
    return [x + nx * off, y + ny * off];
  }).filter((_, i, all) => i % 2 === 0 || i === all.length - 1);
}

/** Nächster Punkt auf einer der Linien: { x, y, d, a } (a = Richtung der Linie dort). */
function nearestOn(lines, x, y) {
  let best = null;
  for (const pts of lines) {
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const u = clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      const px = x1 + dx * u;
      const py = y1 + dy * u;
      const d = Math.hypot(px - x, py - y);
      if (!best || d < best.d) best = { x: px, y: py, d, a: Math.atan2(dy, dx) };
    }
    if (pts.length === 1) {
      const d = Math.hypot(pts[0][0] - x, pts[0][1] - y);
      if (!best || d < best.d) best = { x: pts[0][0], y: pts[0][1], d, a: 0 };
    }
  }
  return best;
}

/** Vier und mehr Runen- oder Hinkelsteine dicht beieinander stellen sich zu einem gleichmäßigen Kreis auf. */
const CIRCLE_STONES = new Set(['runestone', 'menhir']);
function stoneCircle(objects, inMap) {
  const st = objects.filter((q) => CIRCLE_STONES.has(q.t));
  if (st.length < 4) return;
  const cx = st.reduce((a, q) => a + q.x, 0) / st.length;
  const cy = st.reduce((a, q) => a + q.y, 0) / st.length;
  const ds = st.map((q) => Math.hypot(q.x - cx, q.y - cy));
  if (Math.max(...ds) > 9 * CELL) return;
  const r = clamp(ds.reduce((a, d) => a + d, 0) / ds.length, 1.6 * CELL, 3.5 * CELL);
  const a0 = Math.atan2(st[0].y - cy, st[0].x - cx);
  st.forEach((q, i) => {
    const a = a0 + (i / st.length) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (inMap(x, y, 20)) Object.assign(q, { x, y, rot: Math.round(((a * 180) / Math.PI + 450) % 360) });
  });
}

/**
 * Wege verlegen: Wege enden an einer Tür, einem anderen Weg, einem Gegenstand, am Wasser oder am Kartenrand – nicht
 * mitten in der Wiese oder im Haus. Ein Ende im Haus rückt vor die nächste Außentür, ein loses Ende läuft zum nächsten
 * Weg oder zum Rand. Über jede Brücke führt ein Weg.
 */
function layPaths(raw, { scene, rects, W, H, seed, uid }) {
  let v = seed >>> 0;
  const R = () => ((v = (v * 1664525 + 1013904223) >>> 0) / 4294967296);
  const inRect = (x, y, m = 4) => rects.find((b) => x > b.x - m && x < b.x + b.w + m && y > b.y - m && y < b.y + b.h + m);
  // vor jeder Außentür ein Feld nach draußen
  const doors = scene.openings.filter((d) => d.k !== 'window').map((d) => {
    const [nx, ny] = d.a ? [1, 0] : [0, 1];
    for (const sg of [1, -1]) {
      const ox = d.x + nx * sg * 50;
      const oy = d.y + ny * sg * 50;
      if (!inRect(ox, oy)) return [ox, oy];
    }
    return null;
  }).filter(Boolean);
  const edge = (x, y) => {
    const d = [[x, -1, 0], [W - x, 1, 0], [y, 0, -1], [H - y, 0, 1]].sort((a, b) => a[0] - b[0])[0];
    return { d: d[0], pt: [x + d[1] * (d[0] + 30), y + d[2] * (d[0] + 30)] };
  };
  const toEdge = (x, y, dx, dy) => {
    const t = Math.min(dx < 0 ? -x / dx : dx > 0 ? (W - x) / dx : 1e9, dy < 0 ? -y / dy : dy > 0 ? (H - y) / dy : 1e9);
    return [x + dx * (t + 0.5 * CELL), y + dy * (t + 0.5 * CELL)];
  };
  const list = raw.map((q) => ({ ...q, pts: q.pts.map((p) => [...p]) }));
  // über jede Brücke ein Weg, wenn keiner hinführt
  for (const b of scene.objects.filter((q) => /bridge/i.test(q.t))) {
    if (list.some((q) => nearestOn([q.pts], b.x, b.y)?.d < 1.5 * CELL)) continue;
    const a = ((b.rot || 0) * Math.PI) / 180;
    const [ux, uy] = [-Math.sin(a), Math.cos(a)];
    const wob = () => (R() - 0.5) * 1.2 * CELL;
    // auf der Brücke quer zum Wasser, danach zu den Kartenseiten quer zum Fluss als Ganzem
    const river = scene.water.slice().sort((p, q) => (nearestOn([p.pts], b.x, b.y)?.d ?? 1e9) - (nearestOn([q.pts], b.x, b.y)?.d ?? 1e9))[0];
    const [f0, f1] = river ? [river.pts[0], river.pts[river.pts.length - 1]] : [[0, 0], [0, 1]];
    const across = Math.abs(f1[0] - f0[0]) > Math.abs(f1[1] - f0[1]) ? [0, 1] : [1, 0];
    const sg = across[0] * ux + across[1] * uy >= 0 ? 1 : -1;
    const e1 = toEdge(b.x, b.y, -across[0] * sg, -across[1] * sg);
    const e2 = toEdge(b.x, b.y, across[0] * sg, across[1] * sg);
    const mid = (p, f) => [b.x + (p[0] - b.x) * f + uy * wob(), b.y + (p[1] - b.y) * f - ux * wob()];
    list.push({ pts: [e1, mid(e1, 0.5), [b.x - ux * 140, b.y - uy * 140], [b.x, b.y], [b.x + ux * 140, b.y + uy * 140], mid(e2, 0.5), e2], road: false, bridge: true });
  }
  // Stücke im Haus fallen weg; ein Weg, der im Haus beginnt oder endet, setzt vor der nächsten Außentür an
  const nearDoor = (pt) => doors.slice().sort((p, r) => Math.hypot(p[0] - pt[0], p[1] - pt[1]) - Math.hypot(r[0] - pt[0], r[1] - pt[1]))[0];
  for (const q of list) {
    if (q.bridge) continue;
    const inside = q.pts.map((pt) => !!inRect(pt[0], pt[1], -2));
    const keep = q.pts.filter((_, k) => !inside[k]);
    if (!keep.length) {
      q.pts = [];
      continue;
    }
    // wo der Weg auf eine Außenwand trifft, kommt dort eine Tür hin; geht das nicht, führt er zur nächsten Tür
    const entry = (from, to) => {
      for (let k = 1; k <= 40; k++) {
        const x = from[0] + ((to[0] - from[0]) * k) / 40;
        const y = from[1] + ((to[1] - from[1]) * k) / 40;
        const b = rects.find((r) => !r.round && x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
        if (!b) continue;
        // nächste Seite des Raums und die Stelle darauf
        const sd = [[y - b.y, 0], [b.x + b.w - x, 1], [b.y + b.h - y, 2], [x - b.x, 3]].sort((u, q) => u[0] - q[0])[0][1];
        const along = sd % 2 ? clamp(y, b.y + 50, b.y + b.h - 50) : clamp(x, b.x + 50, b.x + b.w - 50);
        const [dx, dy] = sd % 2 ? [sd === 1 ? b.x + b.w : b.x, along] : [along, sd === 0 ? b.y : b.y + b.h];
        const [nx, ny] = [[0, -1], [1, 0], [0, 1], [-1, 0]][sd];
        if (inRect(dx + nx * 20, dy + ny * 20, -2)) return null; // dahinter liegt ein anderer Raum
        if (scene.openings.some((o) => Math.hypot(o.x - dx, o.y - dy) < 84)) return null;
        if ((sd % 2 ? b.h : b.w) < 140) return null;
        scene.openings.push({ id: uid(), k: 'door', x: Math.round(dx), y: Math.round(dy), a: sd % 2 ? 1.571 : 0, w: 70 });
        const out = [dx + nx * 50, dy + ny * 50];
        doors.push(out);
        return out;
      }
      return null;
    };
    if (inside[0]) {
      const d = entry(keep[0], q.pts[inside.indexOf(true) >= 0 ? inside.lastIndexOf(true, inside.indexOf(false)) : 0]) || nearDoor(keep[0]);
      if (d) keep.unshift(d);
    }
    if (inside[inside.length - 1]) {
      const firstIn = inside.indexOf(true, inside.lastIndexOf(false));
      const d = entry(keep[keep.length - 1], q.pts[firstIn]) || nearDoor(keep[keep.length - 1]);
      if (d) keep.push(d);
    }
    q.pts = keep;
  }
  for (let k = list.length - 1; k >= 0; k--) if (list[k].pts.length < 2) list.splice(k, 1);
  list.forEach((q, i) => {
    if (q.bridge) return;
    for (const end of [0, 1]) {
      const pts = q.pts;
      const at = end ? pts[pts.length - 1] : pts[0];
      const add = (pt) => (end ? pts.push(pt) : pts.unshift(pt));
      const put = (pt) => (end ? (pts[pts.length - 1] = pt) : (pts[0] = pt));
      // im Haus: vor die nächste Außentür
      if (inRect(at[0], at[1], -2)) {
        const d = doors.slice().sort((p, r) => Math.hypot(p[0] - at[0], p[1] - at[1]) - Math.hypot(r[0] - at[0], r[1] - at[1]))[0];
        if (d) put(d);
        continue;
      }
      const others = list.filter((_, j) => j !== i).map((r) => r.pts);
      if (edge(at[0], at[1]).d < 1.5 * CELL) continue;
      if (doors.some((d) => Math.hypot(d[0] - at[0], d[1] - at[1]) < 2 * CELL)) continue;
      if (scene.objects.some((o) => Math.hypot(o.x - at[0], o.y - at[1]) < 2 * CELL)) continue;
      if (scene.water.some((w) => nearestOn([w.pts], at[0], at[1])?.d < w.r + CELL)) continue;
      const hit = nearestOn(others, at[0], at[1]);
      if (hit && hit.d < 1.5 * CELL) continue;
      if (edge(at[0], at[1]).d < 4 * CELL) add(edge(at[0], at[1]).pt);
      else if (hit && hit.d < 12 * CELL) add([hit.x, hit.y]);
      else add(edge(at[0], at[1]).pt);
    }
  });
  // ein Weg, der am Wasser endet, hört am Ufer auf – kein Stummel am anderen Ufer
  const wet = (x, y) => scene.water.some((w) => nearestOn([w.pts], x, y)?.d < w.r);
  for (const q of list) {
    if (q.bridge) continue;
    for (const end of [0, 1]) {
      const pts = end ? q.pts.slice().reverse() : q.pts;
      const dense = [];
      for (let i = 1; i < pts.length; i++) {
        const n = Math.max(1, Math.round(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) / 20));
        for (let k = i === 1 ? 0 : 1; k <= n; k++) dense.push([pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * k) / n, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * k) / n]);
      }
      const hit = dense.findIndex(([x, y]) => wet(x, y));
      if (hit > 0 && hit * 20 < 3 * CELL && !wet(...dense[0])) {
        // vom Ende bis ins Wasser weg, der Rest bleibt
        const rest = dense.slice(hit);
        const cut = [rest[0], ...pts.filter((p) => Math.hypot(p[0] - dense[0][0], p[1] - dense[0][1]) > hit * 20 + 5)];
        q.pts = end ? cut.reverse() : cut;
      }
    }
  }
  for (const q of list) {
    const pts = (q.pts.length > 2 ? chaikin(q.pts, false, 2) : q.pts).map(([x, y]) => [Math.round(clamp(x, -60, W + 60)), Math.round(clamp(y, -60, H + 60))]);
    if (q.road) scene.roads.push({ pts, r: 28 });
    else scene.paths.push({ pts, r: 18 });
  }
}

/**
 * Räume des Bauplans aufräumen (in Feldern): Überlappungen werden weggeschnitten – am Raum, der dabei anteilig am
 * wenigsten verliert –, und Lücken von höchstens einem Feld zwischen zwei Räumen geschlossen, damit sie sich eine Wand
 * teilen statt einen Streifen Fels oder Gras dazwischen zu lassen. Runde Räume und Höhlen bleiben, wie sie sind.
 */
export function tidyRooms(list, cols, rows, cave = false) {
  const rs = list.filter((r) => r && typeof r === 'object').map((r) => {
    const w = half(clamp(num(r.w, 5), 2, cols - 2));
    const h = half(clamp(num(r.h, 4), 2, rows - 2));
    return { ...r, w, h, x: half(clamp(num(r.x, 1), 1, cols - 1 - w)), y: half(clamp(num(r.y, 1), 1, rows - 1 - h)) };
  });
  if (cave) return rs;
  const box = (r) => !r.round && !r.gone;
  // Lücken schließen: der kleinere Raum wächst bis an den Nachbarn
  for (let i = 0; i < rs.length; i++) {
    for (let j = 0; j < rs.length; j++) {
      const a = rs[i];
      const b = rs[j];
      if (i === j || !box(a) || !box(b)) continue;
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const small = a.w * a.h <= b.w * b.h;
      if (!small) continue;
      const gx = b.x - (a.x + a.w); // b rechts von a
      const gx2 = a.x - (b.x + b.w); // b links von a
      const gy = b.y - (a.y + a.h);
      const gy2 = a.y - (b.y + b.h);
      if (oy >= 2 && gx > 0 && gx <= 1) a.w += gx;
      else if (oy >= 2 && gx2 > 0 && gx2 <= 1) (a.x -= gx2), (a.w += gx2);
      else if (ox >= 2 && gy > 0 && gy <= 1) a.h += gy;
      else if (ox >= 2 && gy2 > 0 && gy2 <= 1) (a.y -= gy2), (a.h += gy2);
    }
  }
  // Überlappungen wegschneiden
  const trim = (r, o) => {
    // r so beschneiden, dass er o nicht mehr überlappt; liefert den neuen Raum oder null
    const opts = [];
    if (r.x < o.x) opts.push({ ...r, w: o.x - r.x });
    if (r.x + r.w > o.x + o.w) opts.push({ ...r, x: o.x + o.w, w: r.x + r.w - (o.x + o.w) });
    if (r.y < o.y) opts.push({ ...r, h: o.y - r.y });
    if (r.y + r.h > o.y + o.h) opts.push({ ...r, y: o.y + o.h, h: r.y + r.h - (o.y + o.h) });
    const ok = opts.filter((q) => q.w >= 2 && q.h >= 2).sort((p, q) => q.w * q.h - p.w * p.h);
    return ok[0] || null;
  };
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i];
      const b = rs[j];
      if (!box(a) || !box(b)) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox <= 0.01 || oy <= 0.01) continue;
      const ta = trim(a, b);
      const tb = trim(b, a);
      const lossA = ta ? 1 - (ta.w * ta.h) / (a.w * a.h) : 2;
      const lossB = tb ? 1 - (tb.w * tb.h) / (b.w * b.h) : 2;
      if (lossA >= 2 && lossB >= 2) b.gone = true;
      else if (lossA < lossB) Object.assign(a, ta);
      else Object.assign(b, tb);
    }
  }
  return rs.filter((r) => !r.gone);
}

/**
 * Bauplan → Szene. o: { known(t), sized(t) (frei skalierte Natur wie Baum, Fels), floors: [Bodenarten],
 * themes: [bekannte Raumthemen], uid(), seed, natureScale }. Liefert { scene, rooms: [{ id, name, theme, def }] } –
 * die Einrichtung der Räume (theme = Themenname oder def = Regeltabelle) und der Inhalt der Füllbereiche entstehen
 * danach im Kartenbauer, weil sie die Größen der Gegenstände brauchen.
 */
export function planToScene(plan, o) {
  const p = plan && typeof plan === 'object' ? plan : {};
  const known = o.known || (() => true);
  /** Gehört der Gegenstand in einen Raum (Möbel, Waren, Dungeon)? */
  const indoor = (t) => known(t) && !o.sized?.(t) && (o.indoor ? o.indoor(t) : true);
  const uid = o.uid;
  const biome = PLAN_BIOMES.includes(p.biome) ? p.biome : 'meadow';
  const solid = biome === 'dungeon' || biome === 'cave';
  const cols = clamp(Math.round(num(p.cols, 30)), 12, 60);
  const rows = clamp(Math.round(num(p.rows, 20)), 12, 45);
  const scene = newScene(cols, rows, biome);
  scene.seed = o.seed ?? 1;
  if (p.scale === 'overview' && !solid) scene.scale = 'overview';
  const W = cols * CELL;
  const H = rows * CELL;
  const inMap = (x, y, m = 0) => x >= m && y >= m && x <= W - m && y <= H - m;
  const px = (pt) => [clamp(num(pt?.[0] ?? pt?.x, 0), 0, cols) * CELL, clamp(num(pt?.[1] ?? pt?.y, 0), 0, rows) * CELL];

  // --- Räume ---------------------------------------------------------------------------------------------------------
  const out = []; // Räume mit ihrer Einrichtung
  const byName = new Map();
  const rects = []; // { room, x, y, w, h } in Pixeln (auch für runde Räume: das umschließende Quadrat)
  const caverns = []; // nur Höhle: { cx, cy, name }
  tidyRooms(Array.isArray(p.rooms) ? p.rooms.slice(0, 24) : [], cols, rows, biome === 'cave').forEach((r, i) => {
    if (!r || typeof r !== 'object') return;
    const w = half(clamp(num(r.w, 5), 2, cols - 2));
    const h = half(clamp(num(r.h, 4), 2, rows - 2));
    const x = half(clamp(num(r.x, 1), 1, cols - 1 - w));
    const y = half(clamp(num(r.y, 1), 1, rows - 1 - h));
    const name = String(r.id ?? r.name ?? i);
    if (biome === 'cave') {
      // Kaverne: Höhlenboden statt Raum – ein Pinselstrich längs durch das Rechteck, leicht versetzt
      const rad = (Math.min(w, h) / 2) * CELL * 0.95;
      const cx = (x + w / 2) * CELL;
      const cy = (y + h / 2) * CELL;
      const d = ((Math.max(w, h) - Math.min(w, h)) / 2) * CELL;
      const wob = ((i % 3) - 1) * 0.25 * rad;
      const pts = d < 10 ? [[cx, cy]] : w > h ? [[cx - d, cy + wob], [cx, cy - wob], [cx + d, cy + wob]] : [[cx + wob, cy - d], [cx - wob, cy], [cx + wob, cy + d]];
      scene.cave.push({ pts: pts.map(([a, b]) => [Math.round(a), Math.round(b)]), r: Math.round(clamp(rad, 70, 400)) });
      const c = { cx, cy, name };
      caverns.push(c);
      byName.set(name, c);
      return;
    }
    const floor = o.floors?.includes(r.floor) ? r.floor : solid ? 'stone' : 'wood';
    const room = r.round
      ? { id: uid(), k: 'circle', cx: (x + w / 2) * CELL, cy: (y + h / 2) * CELL, r: (Math.min(w, h) / 2) * CELL, floor }
      : { id: uid(), k: 'rect', x: x * CELL, y: y * CELL, w: w * CELL, h: h * CELL, floor };
    if (r.timber && !solid) room.timber = true;
    if (r.ruin) room.ruin = true;
    scene.rooms.push(room);
    const box = room.k === 'circle' ? { room, x: room.cx - room.r, y: room.cy - room.r, w: 2 * room.r, h: 2 * room.r, round: true } : { room, x: room.x, y: room.y, w: room.w, h: room.h };
    box.cx = box.x + box.w / 2;
    box.cy = box.y + box.h / 2;
    rects.push(box);
    byName.set(name, box);
    // die Einrichtung entsteht erst am Ende: Gegenstände, die die KI unter „objects“ mitten in den Raum setzt, kommen dazu
    box.list = Array.isArray(r.furniture) ? r.furniture.slice(0, 30) : [];
    box.theme = o.themes?.includes(r.theme) ? r.theme : null;
    box.ruin = !!r.ruin;
    box.label = String(r.label ?? r.name ?? r.id ?? '');
  });

  // --- Trennwände zwischen aneinanderstoßenden Räumen -----------------------------------------------------------------
  // Räume, die sich berühren, verschmelzen im Kartenbauer zu einem Gebäude: die Wand dazwischen kommt eigens dazu
  const shared = []; // { a, b, x1, y1, x2, y2 }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (a.round || b.round) continue;
      const near = (u, v) => Math.abs(u - v) < 2;
      const y0 = Math.max(a.y, b.y);
      const y1 = Math.min(a.y + a.h, b.y + b.h);
      const x0 = Math.max(a.x, b.x);
      const x1 = Math.min(a.x + a.w, b.x + b.w);
      let seg = null;
      if ((near(a.x + a.w, b.x) || near(b.x + b.w, a.x)) && y1 - y0 >= 60) {
        const x = near(a.x + a.w, b.x) ? b.x : a.x;
        seg = { x1: x, y1: y0, x2: x, y2: y1 };
      } else if ((near(a.y + a.h, b.y) || near(b.y + b.h, a.y)) && x1 - x0 >= 60) {
        const y = near(a.y + a.h, b.y) ? b.y : a.y;
        seg = { x1: x0, y1: y, x2: x1, y2: y };
      }
      if (!seg) continue;
      shared.push({ a, b, ...seg });
      scene.walls.push({ id: uid(), ...seg, kind: solid || (a.room.floor === 'stone' && b.room.floor === 'stone') ? 'stone' : 'wood' });
    }
  }
  const onShared = (x, y) => shared.find((q) => (q.x1 === q.x2 ? Math.abs(x - q.x1) < 3 && y >= q.y1 - 1 && y <= q.y2 + 1 : Math.abs(y - q.y1) < 3 && x >= q.x1 - 1 && x <= q.x2 + 1));
  const inOther = (box, x, y) => rects.some((q) => q !== box && x > q.x + 2 && x < q.x + q.w - 2 && y > q.y + 2 && y < q.y + q.h - 2);

  // --- Türen und Fenster -----------------------------------------------------------------------------------------------
  // Verbunden-Sein: jeder Raum ist ein Knoten, „draußen“ ist ein weiterer
  const OUT = rects.length;
  const parent = rects.map((_, i) => i).concat(OUT);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (i, j) => (parent[find(i)] = find(j));
  const free = (x, y, min = 84) => !scene.openings.some((q) => Math.hypot(q.x - x, q.y - y) < min);
  /** Öffnung auf einer Strecke setzen, t = Lage (0…1); hält Abstand zu den Enden. Liefert die Stelle oder null. */
  const onSeg = (q, t, width) => {
    const len = Math.hypot(q.x2 - q.x1, q.y2 - q.y1);
    if (len < width + 36) return null;
    const m = (width / 2 + 18) / len;
    const u = clamp(num(t, 0.5), m, 1 - m);
    return [Math.round(q.x1 + (q.x2 - q.x1) * u), Math.round(q.y1 + (q.y2 - q.y1) * u), q.x1 === q.x2 ? 1.571 : 0];
  };
  const sideSeg = (box, side) => (side === 0 ? { x1: box.x, y1: box.y, x2: box.x + box.w, y2: box.y } : side === 1 ? { x1: box.x + box.w, y1: box.y, x2: box.x + box.w, y2: box.y + box.h } : side === 2 ? { x1: box.x, y1: box.y + box.h, x2: box.x + box.w, y2: box.y + box.h } : { x1: box.x, y1: box.y, x2: box.x, y2: box.y + box.h });
  const outward = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  /** Tür in der Seite eines Raums: innen (zum Nachbarn) oder nach draußen. */
  const sideDoor = (box, side, t, kind) => {
    let at;
    if (box.round) {
      const [nx, ny] = outward[side];
      at = [Math.round(box.cx + nx * box.w / 2), Math.round(box.cy + ny * box.h / 2), side % 2 ? 1.571 : 0];
    } else at = onSeg(sideSeg(box, side), t, 70);
    if (!at || !free(at[0], at[1])) return false;
    const [x, y, a] = at;
    const sh = onShared(x, y);
    const [nx, ny] = outward[side];
    if (!sh) {
      if (inOther(box, x + nx * 20, y + ny * 20)) return false; // die Seite liegt in einem anderen Raum: dort steht keine Wand
      if (!inMap(x + nx * 40, y + ny * 40, 20)) return false;
      if (solid) {
        // im Fels führt eine Tür nach draußen in einen kurzen Gang
        scene.cave.push({ pts: [[x + nx * 30, y + ny * 30], [Math.round(clamp(x + nx * 190, 60, W - 60)), Math.round(clamp(y + ny * 190, 60, H - 60))]], r: 46 });
      }
      join(rects.indexOf(box), OUT);
    } else join(rects.indexOf(sh.a), rects.indexOf(sh.b));
    scene.openings.push({ id: uid(), k: kind, x, y, a, w: 70 });
    return true;
  };
  const kindOf = (k) => (k === 'secret' ? 'secret' : 'door');
  for (const d of (Array.isArray(p.doors) ? p.doors : []).slice(0, 40)) {
    if (!d || typeof d !== 'object') continue;
    if (Array.isArray(d.between)) {
      const a = byName.get(String(d.between[0]));
      const b = byName.get(String(d.between[1]));
      const sh = shared.find((q) => (q.a === a && q.b === b) || (q.a === b && q.b === a));
      const at = sh && onSeg(sh, d.pos, 70);
      if (at && free(at[0], at[1])) {
        scene.openings.push({ id: uid(), k: kindOf(d.kind), x: at[0], y: at[1], a: at[2], w: 70 });
        join(rects.indexOf(sh.a), rects.indexOf(sh.b));
      }
      continue;
    }
    const box = byName.get(String(d.room));
    const side = SIDES[String(d.side || '').toLowerCase()[0]];
    if (box && box.room && side !== undefined) sideDoor(box, side, d.pos, kindOf(d.kind));
  }
  // Nachbessern: Räume, die sich berühren, aber getrennt geblieben sind, bekommen eine Tür in der gemeinsamen Wand
  for (const sh of shared) {
    const i = rects.indexOf(sh.a);
    const j = rects.indexOf(sh.b);
    if (find(i) === find(j)) continue;
    const at = onSeg(sh, 0.5, 70);
    if (!at || !free(at[0], at[1], 60)) continue;
    scene.openings.push({ id: uid(), k: 'door', x: at[0], y: at[1], a: at[2], w: 70 });
    join(i, j);
  }
  // Gebäude ohne Ausgang: eine Tür an der Seite, die frei liegt (bevorzugt unten)
  rects.forEach((box, i) => {
    if (find(i) === find(OUT)) return;
    if ([2, 1, 3, 0].some((side) => sideDoor(box, side, 0.5, 'door'))) return;
    // im Fels eingeschlossen und ohne Nachbarn: ein Gang zum nächsten erreichbaren Raum
    const to = rects.filter((q, j) => j !== i && find(j) === find(OUT)).sort((q, r) => Math.hypot(q.cx - box.cx, q.cy - box.cy) - Math.hypot(r.cx - box.cx, r.cy - box.cy))[0];
    if (solid && to) {
      scene.cave.push({ pts: [[Math.round(box.cx), Math.round(box.cy)], [Math.round(to.cx), Math.round(to.cy)]], r: 46 });
      join(i, OUT);
    }
  });
  if (!solid) {
    for (const d of (Array.isArray(p.windows) ? p.windows : []).slice(0, 40)) {
      const box = byName.get(String(d?.room));
      const side = SIDES[String(d?.side || '').toLowerCase()[0]];
      if (!box || box.round || side === undefined) continue;
      const at = onSeg(sideSeg(box, side), d.pos, 56);
      const [nx, ny] = outward[side];
      if (!at || !free(at[0], at[1], 76) || onShared(at[0], at[1]) || inOther(box, at[0] + nx * 20, at[1] + ny * 20)) continue;
      scene.openings.push({ id: uid(), k: 'window', x: at[0], y: at[1], a: at[2], w: 56 });
    }
  }

  // --- Höhle: Gänge zwischen den Kavernen -----------------------------------------------------------------------------
  if (biome === 'cave' && caverns.length > 1) {
    const linked = new Set();
    const tunnel = (a, b) => {
      const key = [caverns.indexOf(a), caverns.indexOf(b)].sort().join('-');
      if (a === b || linked.has(key)) return;
      linked.add(key);
      // leicht geschwungen statt schnurgerade
      const mx = (a.cx + b.cx) / 2 + (b.cy - a.cy) * 0.12;
      const my = (a.cy + b.cy) / 2 - (b.cx - a.cx) * 0.12;
      scene.cave.push({ pts: [[a.cx, a.cy], [mx, my], [b.cx, b.cy]].map(([x, y]) => [Math.round(x), Math.round(y)]), r: 48 });
    };
    for (const l of (Array.isArray(p.links) ? p.links : []).slice(0, 40)) {
      const a = byName.get(String(l?.[0]));
      const b = byName.get(String(l?.[1]));
      if (a && b && caverns.includes(a) && caverns.includes(b)) tunnel(a, b);
    }
    // jede Kaverne hängt am Rest: sonst ein Gang zur nächstgelegenen früheren
    const group = caverns.map((_, i) => i);
    const root = (i) => (group[i] === i ? i : (group[i] = root(group[i])));
    for (const key of linked) {
      const [i, j] = key.split('-').map(Number);
      group[root(i)] = root(j);
    }
    for (let i = 1; i < caverns.length; i++) {
      if (root(i) === root(0)) continue;
      const near = caverns.map((c, j) => [j, Math.hypot(c.cx - caverns[i].cx, c.cy - caverns[i].cy)]).filter(([j]) => root(j) === root(0)).sort((a, b) => a[1] - b[1])[0];
      tunnel(caverns[i], caverns[near[0]]);
      group[root(i)] = root(0);
    }
  }

  // --- Gelände, Füllbereiche, einzelne Gegenstände, Namen ---------------------------------------------------------------
  /**
   * Wasserlauf um die Gebäude herumführen: die Linie dicht abtasten und jeden Punkt, der einem Raum näher als m kommt,
   * auf dem kürzesten Weg hinausschieben – ein Bach fließt dann am Haus vorbei statt hindurch.
   */
  const aroundRooms = (q, m) => {
    if (!q.length) return [];
    const dense = [q[0]];
    for (let i = 1; i < q.length; i++) {
      const n = Math.max(1, Math.round(Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]) / CELL));
      for (let k = 1; k <= n; k++) dense.push([q[i - 1][0] + ((q[i][0] - q[i - 1][0]) * k) / n, q[i - 1][1] + ((q[i][1] - q[i - 1][1]) * k) / n]);
    }
    let moved = false;
    for (const pt of dense) {
      for (const b of rects) {
        const [x, y] = pt;
        if (x <= b.x - m || x >= b.x + b.w + m || y <= b.y - m || y >= b.y + b.h + m) continue;
        const d = [[x - (b.x - m), -1, 0], [b.x + b.w + m - x, 1, 0], [y - (b.y - m), 0, -1], [b.y + b.h + m - y, 0, 1]].sort((a, c) => a[0] - c[0])[0];
        pt[0] = x + d[1] * d[0];
        pt[1] = y + d[2] * d[0];
        moved = true;
      }
    }
    const pts = moved ? dense.filter((_, i) => i % 2 === 0 || i === dense.length - 1) : q;
    return (pts.length > 2 ? chaikin(pts, false, 2) : pts).map(([x, y]) => [Math.round(clamp(x, -200, W + 200)), Math.round(clamp(y, -200, H + 200))]);
  };
  const rawPaths = []; // Wege in Pixeln, verlegt erst, wenn Türen, Brücken und Gegenstände feststehen
  if (!solid) {
    for (const w of (Array.isArray(p.water) ? p.water : []).slice(0, 8)) {
      const r = Math.round(clamp((num(w?.width, 3) * CELL) / 2, 40, 240));
      const raw = (Array.isArray(w?.points) ? w.points : []).slice(0, 24).map(px);
      // ein Fluss endet nicht mitten in der Wiese: Enden in Randnähe laufen bis über den Kartenrand
      if (raw.length >= 2) {
        for (const end of [raw.length - 1, 0]) {
          const [x, y] = raw[end];
          const [qx, qy] = raw[end ? end - 1 : 1];
          const len = Math.hypot(x - qx, y - qy) || 1;
          const [dx, dy] = [(x - qx) / len, (y - qy) / len];
          // in Laufrichtung weiter bis über den Rand, wenn der nicht weit ist
          const t = Math.min(dx < -0.01 ? -x / dx : dx > 0.01 ? (W - x) / dx : 1e9, dy < -0.01 ? -y / dy : dy > 0.01 ? (H - y) / dy : 1e9);
          if (t > 0.5 && t < Math.max(W, H) / 3) {
            const pt = [x + dx * (t + CELL), y + dy * (t + CELL)];
            if (end) raw.push(pt);
            else raw.unshift(pt);
          }
        }
      }
      const pts = aroundRooms(raw.length >= 2 ? meander(raw, (scene.seed * 7 + scene.water.length * 131) >>> 0, r) : raw, r + 55);
      if (pts.length) scene.water.push({ pts, r });
    }
    for (const w of (Array.isArray(p.paths) ? p.paths : []).slice(0, 12)) {
      const pts = (Array.isArray(w?.points) ? w.points : []).slice(0, 24).map(px);
      // gerade Linien der KI schwingen leicht – Straßen weniger als Trampelpfade
      const road = w.kind === 'road' || w.kind === 'street';
      if (pts.length >= 2) rawPaths.push({ pts: meander(pts, (scene.seed * 13 + rawPaths.length * 97) >>> 0, road ? 28 : 18, { amp: road ? 0.45 : 0.6, taper: true }), road });
    }
    for (const a of (Array.isArray(p.areas) ? p.areas : Array.isArray(p.trees) ? p.trees : []).slice(0, 14)) {
      if (!a || typeof a !== 'object') continue;
      const w = clamp(num(a.w, 6), 2, cols);
      const h = clamp(num(a.h, 5), 2, rows);
      const x = clamp(num(a.x, 0), 0, cols - 1);
      const y = clamp(num(a.y, 0), 0, rows - 1);
      const kind = AREA_KINDS.includes(a.kind) ? a.kind : 'trees';
      if (kind === 'houses' && scene.scale !== 'overview') continue;
      // Wald über fast die ganze Karte deckt alles zu: daraus wird ein Waldring, die Mitte bleibt Lichtung
      if ((kind === 'trees' || kind === 'mixed') && w * h > 0.5 * cols * rows) {
        const d = Math.max(3, Math.round(Math.min(cols, rows) * 0.2)) * CELL;
        for (const [bx, by, bw, bh] of [[0, 0, W, d], [0, H - d, W, d], [0, d, d, H - 2 * d], [W - d, d, d, H - 2 * d]]) {
          scene.fills.push({ id: uid(), kind, seed: (scene.seed * 31 + scene.fills.length * 7919) >>> 0, density: clamp(num(a.density, 1), 0.3, 2), shape: { k: 'rect', x: bx, y: by, w: bw, h: bh } });
        }
        continue;
      }
      const shape = kind === 'houses' ? { k: 'rect', x: x * CELL, y: y * CELL, w: w * CELL, h: h * CELL } : { k: 'ellipse', cx: (x + w / 2) * CELL, cy: (y + h / 2) * CELL, rx: (w / 2) * CELL, ry: (h / 2) * CELL };
      scene.fills.push({ id: uid(), kind, seed: (scene.seed * 31 + scene.fills.length * 7919) >>> 0, density: clamp(num(a.density, 1), 0.3, 2), shape });
    }
    // Bodenzonen: breite, weiche Pinselstriche
    for (const g of (Array.isArray(p.grounds) ? p.grounds : []).slice(0, 16)) {
      const kind = String(g?.kind || g?.g || '');
      if (!GROUND_KINDS.includes(kind)) continue;
      const pts = (Array.isArray(g.points) ? g.points : Array.isArray(g.pts) ? g.pts : g.x !== undefined ? [[g.x, g.y]] : []).slice(0, 24).map(px);
      if (!pts.length) continue;
      const r = Math.round(clamp((num(g.width ?? g.w, 5) * CELL) / 2, 60, 500));
      scene.grounds.push({ k: 'brush', g: kind, r, pts: (pts.length > 2 ? chaikin(pts, false, 2) : pts).map(([x, y]) => [Math.round(x), Math.round(y)]) });
    }
    // Füllbereiche bringen ihren Boden mit, wenn die KI keinen genannt hat: Ruinen liegen auf Geröll und alten Platten,
    // Sumpf auf Morast, Totholz auf Waldboden und Laub
    const UNDER = { ruins: [['gravel', 1], ['ruin', 0.6]], swamp: [['mud', 0.8]], deadwood: [['forest', 0.9], ['leaves', 0.5]] };
    for (const f of scene.fills) {
      const under = UNDER[f.kind];
      if (!under) continue;
      const [bx2, by2, bw2, bh2] = f.shape.k === 'rect' ? [f.shape.x, f.shape.y, f.shape.w, f.shape.h] : [f.shape.cx - f.shape.rx, f.shape.cy - f.shape.ry, 2 * f.shape.rx, 2 * f.shape.ry];
      const [cx2, cy2] = [bx2 + bw2 / 2, by2 + bh2 / 2];
      for (const [g, k] of under) {
        if (scene.grounds.some((q) => q.g === g && nearestOn([q.pts], cx2, cy2)?.d < Math.max(bw2, bh2) / 2)) continue;
        // ein Strich längs der längeren Seite
        const r = Math.round((Math.min(bw2, bh2) / 2) * k);
        const d = Math.max(0, (Math.max(bw2, bh2) / 2) * k - r);
        const pts = bw2 >= bh2 ? [[cx2 - d, cy2], [cx2 + d, cy2]] : [[cx2, cy2 - d], [cx2, cy2 + d]];
        scene.grounds.push({ k: 'brush', g, r: Math.max(60, r), pts: pts.map(([x, y]) => [Math.round(x), Math.round(y)]) });
      }
    }
    // Ränder ohne Bewuchs bekommen einen lockeren Saum (Bäume, in der Wüste Felsen) – die Karte wirkt gerahmt statt
    // wie ein Ausschnitt aus einer leeren Wiese. Wasser, Wege und Gebäude bleiben beim Füllen ohnehin frei.
    if (scene.scale !== 'overview' && biome !== 'town') {
      const band = 2.5 * CELL;
      const boxes = scene.fills.map((f) => shapeBounds(f.shape));
      const sides = [{ x: 0, y: 0, w: W, h: band }, { x: W - band, y: 0, w: band, h: H }, { x: 0, y: H - band, w: W, h: band }, { x: 0, y: 0, w: band, h: H }];
      sides.forEach((sd, i) => {
        // schon bewachsen, wenn Füllbereiche zusammen mindestens ein Drittel dieser Seite säumen
        const horiz = i % 2 === 0;
        const cover = boxes.filter((b) => b.x < sd.x + sd.w + CELL && b.x + b.w > sd.x - CELL && b.y < sd.y + sd.h + CELL && b.y + b.h > sd.y - CELL)
          .reduce((a, b) => a + (horiz ? Math.min(b.x + b.w, W) - Math.max(b.x, 0) : Math.min(b.y + b.h, H) - Math.max(b.y, 0)), 0);
        if (cover >= (horiz ? W : H) / 3) return;
        const kind = biome === 'desert' ? 'rocks' : biome === 'swamp' ? 'swamp' : 'trees';
        scene.fills.push({ id: uid(), kind, seed: (scene.seed * 17 + i * 104729) >>> 0, density: 0.55, shape: { k: 'rect', x: Math.round(sd.x), y: Math.round(sd.y), w: Math.round(sd.w), h: Math.round(sd.h) }, edge: true });
        // unter dem Baumsaum dunkler Waldboden, der zur Mitte hin ausläuft
        if (kind === 'trees') scene.grounds.unshift({ k: 'brush', g: 'forest', r: Math.round(band * 0.9), pts: i % 2 === 0 ? [[0, Math.round(sd.y + sd.h / 2)], [W, Math.round(sd.y + sd.h / 2)]] : [[Math.round(sd.x + sd.w / 2), 0], [Math.round(sd.x + sd.w / 2), H]], edge: true });
      });
    }
  }
  let v = scene.seed >>> 0;
  for (const it of (Array.isArray(p.objects) ? p.objects : []).slice(0, 80)) {
    const t = String(it?.t ?? it?.id ?? '');
    if (!known(t)) continue;
    let [x, y] = px([it.x, it.y]);
    if (!inMap(x, y, 10)) continue;
    // Liegt die Stelle in einem Raum (oder auf seiner Wand)? Dann gehört der Gegenstand zur Einrichtung und wird nach
    // deren Regeln gestellt – statt irgendwo mitten im Raum oder halb in der Wand zu stehen
    const host = rects.find((b) => (b.round ? Math.hypot(x - b.cx, y - b.cy) < b.w / 2 + 12 : x > b.x - 12 && x < b.x + b.w + 12 && y > b.y - 12 && y < b.y + b.h + 12));
    if (host) {
      if (indoor(t) && (!host.theme || host.list.length) && host.list.length < 30) host.list.push({ t, n: 1 });
      continue;
    }
    // unter der Erde ist außerhalb der Räume und Höhlengänge massiver Fels: in den nächsten Raum holen oder weglassen
    if (solid && !scene.cave.some((c) => nearestOn([c.pts], x, y)?.d < c.r)) {
      const b = rects.slice().sort((p, q) => Math.hypot(p.cx - x, p.cy - y) - Math.hypot(q.cx - x, q.cy - y))[0];
      if (!b || Math.hypot(b.cx - x, b.cy - y) > Math.max(b.w, b.h) / 2 + 4 * CELL) continue;
      if (indoor(t) || /stair|spiral/i.test(t)) {
        if (b.list.length < 30) b.list.push({ t, n: 1 });
        continue;
      }
      [x, y] = [clamp(x, b.x + 50, b.x + b.w - 50), clamp(y, b.y + 50, b.y + b.h - 50)];
    }
    // draußen: keine Betten, Regale oder Kamine im Gras; was dicht an einer Außenwand steht, rückt ein Stück ab
    if (!solid && INDOOR_ONLY.has(t)) continue;
    let rot = Math.round(num(it.rot, 0)) % 360;
    // Brücken rasten quer über das nächste Wasser ein
    if (/bridge/i.test(t)) {
      // eine Brücke ohne Wasser in der Nähe fällt weg
      const hit = scene.water.length ? nearestOn(scene.water.map((q) => q.pts), x, y) : null;
      if (!hit || hit.d > 6 * CELL) continue;
      [x, y, rot] = [hit.x, hit.y, Math.round(((hit.a * 180) / Math.PI + 360) % 180)];
    }
    // vor Haustüren bleibt ein Feld frei: was davor steht, rückt zur Seite
    for (const d of scene.openings) {
      if (d.k === 'window' || /bridge/i.test(t)) continue;
      const [nx, ny] = d.a ? [1, 0] : [0, 1];
      for (const sg of [1, -1]) {
        const fx = d.x + nx * sg * 60;
        const fy = d.y + ny * sg * 60;
        if (rects.some((b) => fx > b.x && fx < b.x + b.w && fy > b.y && fy < b.y + b.h)) continue;
        if (Math.hypot(x - fx, y - fy) < 110) {
          const side = (x - d.x) * ny - (y - d.y) * nx >= 0 ? 1 : -1; // längs der Wand zur näheren Seite
          [x, y] = [x + ny * side * 150, y - nx * side * 150];
        }
      }
    }
    for (const b of rects) {
      if (b.round) {
        const d = Math.hypot(x - b.cx, y - b.cy);
        if (d < b.w / 2 + 40 && d > 0) [x, y] = [b.cx + ((x - b.cx) / d) * (b.w / 2 + 40), b.cy + ((y - b.cy) / d) * (b.w / 2 + 40)];
        continue;
      }
      if (x <= b.x - 40 || x >= b.x + b.w + 40 || y <= b.y - 40 || y >= b.y + b.h + 40) continue;
      const d = [[x - (b.x - 40), -1, 0], [b.x + b.w + 40 - x, 1, 0], [y - (b.y - 40), 0, -1], [b.y + b.h + 40 - y, 0, 1]].sort((a, c) => a[0] - c[0])[0];
      [x, y] = [x + d[1] * d[0], y + d[2] * d[0]];
    }
    if (!inMap(x, y, 10)) continue;
    v = (v * 1664525 + 1013904223) >>> 0;
    scene.objects.push({ id: uid(), t, x: Math.round(x), y: Math.round(y), rot, s: o.sized?.(t) ? o.natureScale || 1 : 1, v: v % 1000000 });
  }
  if (!solid) {
    stoneCircle(scene.objects, inMap);
    layPaths(rawPaths, { scene, rects, W, H, seed: scene.seed, uid });
  }
  for (const b of rects) {
    let def = themeFromPlan(b.list, indoor);
    // Thema und eigene Stücke zusammen: das Thema füllt den Raum, die genannten Stücke kommen sicher dazu
    if (def && b.theme && THEMES[b.theme]) {
      const base = THEMES[b.theme];
      const mine = def;
      // gleiche Stücke: die Regel des Themas bleibt, Sitze aus der KI-Liste kommen dazu (Barhocker am Tresen)
      const withOf = (t) => ['wall', 'corner', 'center'].map((k) => (mine[k] || []).find((e) => e[0] === t)?.[2]?.with).find(Boolean);
      const merged = (k) => (base[k] || []).map((e) => (withOf(e[0]) ? [e[0], e[1], { ...(e[2] || {}), with: withOf(e[0]) }] : e));
      def = { ...Object.fromEntries(['wall', 'corner', 'center', 'rug'].map((k) => [k, [...merged(k), ...(mine[k] || []).filter((e) => !['wall', 'corner', 'center', 'rug'].some((kk) => (base[kk] || []).some((q) => q[0] === e[0])))]])), custom: true };
      // mehr als ein Teppich je Raum liegt übereinander: der des Themas reicht, sonst der erste genannte
      const rugs = def.rug.filter((e) => /^rug/.test(e[0]));
      def.rug = def.rug.filter((e) => !/^rug/.test(e[0]) || e === rugs[0]);
    }
    // Verfallene Räume: keine heilen Möbel mehr – Bänke, Betten, Tische, Regale sind längst zerfallen. Es bleibt,
    // was aus Stein ist (Altar, Statue, Sarkophag, Säule, Urnen …), dazu kommen Geröll, Bruchstücke und Moos
    if (b.ruin) {
      const src = def || THEMES[b.theme] || { wall: [], corner: [], center: [], rug: [] };
      const keep = (e) => RUIN_KEEP.has(e[0]);
      def = { wall: (src.wall || []).filter(keep).map((e) => [e[0], e[1], { ...(e[2] || {}), with: undefined }]), corner: [...(src.corner || []).filter(keep), ['rubble', 0, { fix: 2 }], ['pebbles', 0, { fix: 2 }]], center: [...(src.center || []).filter(keep), ['pillarBroken', 0, { fix: 1 }], ['rubble', 0, { fix: 1 }]], rug: [['mossPatch', 0, { fix: 2 }]], custom: true };
    }
    if (def || b.theme) out.push({ id: b.room.id, name: b.label, theme: def ? null : b.theme, def });
  }
  if (!solid && scene.scale !== 'overview') {
    placeGloom(scene, rects);
    addCover(scene, rects, { W, H, cols, rows, uid });
  }
  for (const l of (Array.isArray(p.labels) ? p.labels : []).slice(0, 12)) {
    const text = String(l?.text || '').trim().slice(0, 40);
    if (!text) continue;
    const [x, y] = px([l.x, l.y]);
    scene.labels.push({ id: uid(), x: Math.round(x), y: Math.round(y), text, size: 'm', kind: l.kind === 'area' ? 'area' : 'place' });
  }
  return { scene, rooms: out };
}
