// Kartenbauer: aus einem Bauplan eine Szene machen. Der Bauplan ist eine grobe Beschreibung in Feldern (Räume, Türen,
// Wasser, Wege, Baumgruppen …), wie sie ein Sprachmodell liefern kann; hier wird daraus eine regelgerechte Szene –
// Räume im Raster, Trennwände zwischen aneinanderstoßenden Räumen, Türen genau auf der Wand, jeder Raum erreichbar.
// Reine Rechnung ohne DOM, damit es sich ohne Browser testen lässt.
import { CELL, newScene, chaikin } from './mb-geom.js';

export const PLAN_BIOMES = ['meadow', 'desert', 'tundra', 'magic', 'shire', 'town', 'dungeon', 'cave'];
const AREA_KINDS = ['trees', 'bushes', 'rocks', 'mixed', 'houses'];
const SIDES = { n: 0, e: 1, s: 2, w: 3 };

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const half = (v) => Math.round(v * 2) / 2; // Räume rasten auf halbe Felder

/**
 * Einrichtung aus dem Bauplan in eine Regeltabelle für furnish() übersetzen.
 * list: [{ t, n, at: 'wall' | 'corner' | 'center' | 'floor', seats, seatCount }]; allowed(t) sagt, ob es den Gegenstand
 * gibt und ob er in einen Raum gehört. Liefert { wall, corner, center, rug } oder null, wenn nichts Brauchbares dabei ist.
 */
export function themeFromPlan(list, allowed = () => true) {
  const theme = { wall: [], corner: [], center: [], rug: [] };
  let total = 0;
  for (const it of Array.isArray(list) ? list.slice(0, 30) : []) {
    const t = String(it?.t ?? it?.id ?? it?.type ?? '');
    if (!allowed(t)) continue;
    const n = clamp(Math.round(num(it.n ?? it.count, 1)), 1, 12);
    if (total + n > 60) break;
    total += n;
    const at = String(it.at ?? it.where ?? 'center').toLowerCase();
    const key = at.startsWith('wall') ? 'wall' : at.startsWith('corner') ? 'corner' : at === 'floor' || at === 'rug' ? 'rug' : 'center';
    const rule = { fix: n };
    const seat = String(it.seats ?? it.with ?? '');
    if (seat && allowed(seat) && key !== 'rug') rule.with = [seat, clamp(Math.round(num(it.seatCount, seat === 'bench' ? 2 : 4)), 1, 8)];
    theme[key].push([t, 0, rule]);
  }
  return total ? theme : null;
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
  const line = (pts) => {
    const q = (Array.isArray(pts) ? pts : []).slice(0, 24).map(px);
    return q.length > 2 ? chaikin(q, false, 2).map(([x, y]) => [Math.round(x), Math.round(y)]) : q.map(([x, y]) => [Math.round(x), Math.round(y)]);
  };

  // --- Räume ---------------------------------------------------------------------------------------------------------
  const out = []; // Räume mit ihrer Einrichtung
  const byName = new Map();
  const rects = []; // { room, x, y, w, h } in Pixeln (auch für runde Räume: das umschließende Quadrat)
  const caverns = []; // nur Höhle: { cx, cy, name }
  (Array.isArray(p.rooms) ? p.rooms : []).slice(0, 24).forEach((r, i) => {
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
    const def = themeFromPlan(r.furniture, (t) => known(t) && !o.sized?.(t));
    const theme = o.themes?.includes(r.theme) ? r.theme : null;
    if (def || theme) out.push({ id: room.id, name: String(r.label ?? r.name ?? r.id ?? ''), theme: def ? null : theme, def });
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
  if (!solid) {
    for (const w of (Array.isArray(p.water) ? p.water : []).slice(0, 8)) {
      const r = Math.round(clamp((num(w?.width, 3) * CELL) / 2, 40, 240));
      const pts = aroundRooms((Array.isArray(w?.points) ? w.points : []).slice(0, 24).map(px), r + 55);
      if (pts.length) scene.water.push({ pts, r });
    }
    for (const w of (Array.isArray(p.paths) ? p.paths : []).slice(0, 12)) {
      const pts = line(w?.points);
      if (pts.length < 2) continue;
      if (w.kind === 'road' || w.kind === 'street') scene.roads.push({ pts, r: 28 });
      else scene.paths.push({ pts, r: 18 });
    }
    for (const a of (Array.isArray(p.areas) ? p.areas : Array.isArray(p.trees) ? p.trees : []).slice(0, 14)) {
      if (!a || typeof a !== 'object') continue;
      const w = clamp(num(a.w, 6), 2, cols);
      const h = clamp(num(a.h, 5), 2, rows);
      const x = clamp(num(a.x, 0), 0, cols - 1);
      const y = clamp(num(a.y, 0), 0, rows - 1);
      const kind = AREA_KINDS.includes(a.kind) ? a.kind : 'trees';
      if (kind === 'houses' && scene.scale !== 'overview') continue;
      const shape = kind === 'houses' ? { k: 'rect', x: x * CELL, y: y * CELL, w: w * CELL, h: h * CELL } : { k: 'ellipse', cx: (x + w / 2) * CELL, cy: (y + h / 2) * CELL, rx: (w / 2) * CELL, ry: (h / 2) * CELL };
      scene.fills.push({ id: uid(), kind, seed: (scene.seed * 31 + scene.fills.length * 7919) >>> 0, density: clamp(num(a.density, 1), 0.3, 2), shape });
    }
  }
  let v = scene.seed >>> 0;
  for (const it of (Array.isArray(p.objects) ? p.objects : []).slice(0, 80)) {
    const t = String(it?.t ?? it?.id ?? '');
    if (!known(t)) continue;
    const [x, y] = px([it.x, it.y]);
    if (!inMap(x, y, 10)) continue;
    v = (v * 1664525 + 1013904223) >>> 0;
    scene.objects.push({ id: uid(), t, x: Math.round(x), y: Math.round(y), rot: Math.round(num(it.rot, 0)) % 360, s: o.sized?.(t) ? o.natureScale || 1 : 1, v: v % 1000000 });
  }
  for (const l of (Array.isArray(p.labels) ? p.labels : []).slice(0, 12)) {
    const text = String(l?.text || '').trim().slice(0, 40);
    if (!text) continue;
    const [x, y] = px([l.x, l.y]);
    scene.labels.push({ id: uid(), x: Math.round(x), y: Math.round(y), text, size: 'm', kind: l.kind === 'area' ? 'area' : 'place' });
  }
  return { scene, rooms: out };
}
