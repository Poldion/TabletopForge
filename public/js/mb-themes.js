// Kartenbauer: Räume auf einen Klick einrichten. Je Thema eine Regeltabelle – was an die Wand gehört, was in die Ecken,
// was in die Mitte (mit Hockern oder Stühlen darum) und was als Teppich auf den Boden. Reine Rechnung ohne DOM:
// Größen und Hindernisse kommen von außen, damit es sich ohne Browser testen lässt.
import { rng, inRoom, inRects } from './mb-geom.js';

const WALL = 9; // halbe Wandstärke plus etwas Luft

/**
 * Regeln: [Gegenstand, Stück je 10 Felder Raumfläche, { min, max, fix (genau eins), with: [Begleiter, Anzahl] }].
 * Wandstücke stehen mit dem Rücken zur Wand (im Bild ist oben hinten).
 */
export const THEMES = {
  tavern: {
    wall: [['bar', 0, { fix: 1 }], ['fireplace', 0, { fix: 1 }], ['barrelRack', 0.25], ['bench', 0.4], ['wallTorch', 0.5], ['shelf', 0.2]],
    corner: [['barrel', 0.4], ['crate', 0.2]],
    center: [['tableRound', 0.5, { min: 1, with: ['stool', 4] }], ['tableBig', 0.15, { with: ['chair', 5] }], ['longTable', 0.1, { with: ['bench', 2] }]],
    rug: [['rugRound', 0.1, { max: 1 }]],
  },
  kitchen: {
    wall: [['stove', 0, { fix: 1 }], ['shelf', 0.8], ['barrelRack', 0.3], ['wallTorch', 0.3]],
    corner: [['barrel', 0.6], ['sack', 0.6], ['baskets', 0.4], ['amphorae', 0.4], ['logs', 0.3]],
    center: [['kitchenTable', 0.5, { min: 1, max: 2 }], ['cauldron', 0.2, { max: 1 }], ['stool', 0.4]],
  },
  bedroom: {
    wall: [['bed', 0.8, { min: 1 }], ['wardrobe', 0.4, { max: 2 }], ['desk', 0.25, { max: 1, with: ['chair', 1] }], ['shelf', 0.2], ['candelabra', 0.3, { max: 2 }]],
    corner: [['chest', 0.6], ['armchair', 0.2], ['bathtub', 0.1, { max: 1 }]],
    center: [['tableSquare', 0.15, { max: 1, with: ['chair', 2] }]],
    rug: [['rug', 0.4, { max: 1 }]],
  },
  storage: {
    wall: [['shelf', 1.0], ['barrelRack', 0.6], ['crateStack', 0.8]],
    corner: [['barrel', 1.2], ['sack', 1.0], ['crate', 1.0], ['amphorae', 0.4], ['ropeCoil', 0.3], ['clothBolts', 0.3], ['baskets', 0.3]],
    center: [['crate', 0.5], ['crateStack', 0.3], ['barrel', 0.4], ['lantern', 0.15, { max: 1 }]],
  },
  smithy: {
    wall: [['fireplace', 0, { fix: 1 }], ['workbench', 0.5, { min: 1 }], ['weaponRack', 0.4], ['shelf', 0.3], ['logs', 0.3]],
    corner: [['barrel', 0.4], ['sack', 0.3], ['crate', 0.3]],
    center: [['anvil', 0, { fix: 1 }], ['trough', 0.2, { max: 1 }], ['torch', 0.15, { max: 1 }], ['stool', 0.2]],
  },
  library: {
    wall: [['bookshelf', 1.5, { min: 1 }], ['desk', 0.3, { with: ['chair', 1] }], ['candelabra', 0.4], ['fireplace', 0.1, { max: 1 }]],
    corner: [['armchair', 0.4], ['chest', 0.2], ['lectern', 0.2]],
    center: [['mapTable', 0.15, { max: 1 }], ['tableSquare', 0.2, { with: ['chair', 2] }], ['alchemyTable', 0.1, { max: 1 }]],
    rug: [['rug', 0.3, { max: 1 }]],
  },
  chapel: {
    wall: [['altar', 0, { fix: 1 }], ['candelabra', 0.5], ['statue', 0.2, { max: 2 }], ['urns', 0.2], ['wallTorch', 0.4]],
    corner: [['candles', 0.4], ['chest', 0.1]],
    center: [['pew', 1.2, { min: 2 }], ['lectern', 0, { fix: 1 }]],
  },
  barracks: {
    wall: [['bunk', 1.0, { min: 2 }], ['weaponRack', 0.5, { min: 1 }], ['shelf', 0.2], ['wallTorch', 0.4]],
    corner: [['chest', 0.5], ['barrel', 0.3], ['crate', 0.2], ['dummy', 0.1, { max: 1 }]],
    center: [['tableSquare', 0.3, { with: ['stool', 3] }], ['bench', 0.2], ['torch', 0.1, { max: 1 }]],
  },
  crypt: {
    wall: [['sarcophagus', 0.6, { min: 1 }], ['urns', 0.5], ['wallTorch', 0.3], ['statue', 0.2]],
    corner: [['skulls', 0.4], ['bones', 0.3], ['web', 0.6], ['rubble', 0.3], ['candles', 0.3]],
    center: [['altar', 0.1, { max: 1 }], ['coffin', 0.3], ['pillar', 0.4]],
    rug: [['glyph', 0.1, { max: 1 }]],
  },
  cell: {
    wall: [['chains', 0.8, { min: 1 }], ['bunk', 0.5, { min: 1 }], ['wallTorch', 0.2]],
    corner: [['bones', 0.3], ['web', 0.4]],
    center: [['rack', 0.1, { max: 1 }], ['cage', 0.2], ['torch', 0.1, { max: 1 }]],
    rug: [['puddle', 0.2, { max: 1 }]],
  },
};

const count = (per10, o, area, density) => (o.fix ? o.fix : Math.max(o.min || 0, Math.min(o.max ?? 99, Math.round((per10 * area * density) / 10))));

/**
 * Einrichtung eines Raums erzeugen. room: Rechteck { x, y, w, h } oder Kreis { cx, cy, r }; ctx:
 *   size(t) → [Breite, Tiefe] des Gegenstands, known(t) → gibt es ihn?, openings: Türen und Fenster der Szene,
 *   isWall(x, y) → steht dort wirklich eine Wand?, taken: Grundflächen dessen, was schon im Raum steht,
 *   density (Standard 1).
 * themeKey: Name eines Themas oder eine eigene Regeltabelle { wall, corner, center, rug }.
 * Liefert [{ t, x, y, rot, v }] – gleiche Eingaben, gleiches Ergebnis.
 */
export function furnish(room, themeKey, seed, ctx) {
  const theme = themeKey && typeof themeKey === 'object' ? themeKey : THEMES[themeKey];
  if (!theme) return [];
  const { R, rnd } = rng(seed >>> 0);
  const density = ctx.density ?? 1;
  const known = ctx.known || (() => true);
  const isWall = ctx.isWall || (() => true);
  const doors = (ctx.openings || []).filter((o) => o.k !== 'window');
  const circle = room.k === 'circle';
  const area = circle ? (Math.PI * room.r * room.r) / 4900 : (room.w * room.h) / 4900;
  const cx = circle ? room.cx : room.x + room.w / 2;
  const cy = circle ? room.cy : room.y + room.h / 2;
  const out = [];
  const placed = [...(ctx.taken || [])];
  const corners = (x, y, w, h, rot) => {
    const a = (rot * Math.PI) / 180;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => [x + ((p * w) / 2) * Math.cos(a) - ((q * h) / 2) * Math.sin(a), y + ((p * w) / 2) * Math.sin(a) + ((q * h) / 2) * Math.cos(a)]);
  };
  // Innenwände im Raum: Möbel (und Teppiche) dürfen sie nicht kreuzen und halten etwas Abstand
  const inner = (ctx.walls || []).map(([x1, y1, x2, y2, half = 4]) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 10));
    return { x1, y1, x2, y2, half, pts: Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]) };
  });
  const hitsWall = (x, y, w, h, rot) => {
    for (const q of inner) {
      // Wand läuft durch die (um die Wandstärke vergrößerte) Grundfläche?
      const box = [{ x, y, hw: w / 2 + q.half + 3, hh: h / 2 + q.half + 3, rot }];
      if (q.pts.some(([px, py]) => inRects(box, px, py))) return true;
    }
    return false;
  };
  const fits = (x, y, w, h, rot, solid = true) => {
    const cs = corners(x, y, w, h, rot);
    if (!cs.every(([px, py]) => inRoom(room, px, py, WALL - 3))) return false;
    if (hitsWall(x, y, w, h, rot)) return false;
    if (!solid) return true;
    const pts = [[x, y], ...cs, ...cs.map((c, i) => [(c[0] + cs[(i + 1) % 4][0]) / 2, (c[1] + cs[(i + 1) % 4][1]) / 2])];
    if (pts.some(([px, py]) => inRects(placed, px, py))) return false;
    if (placed.some((q) => inRects([{ x, y, hw: w / 2, hh: h / 2, rot }], q.x, q.y))) return false;
    // vor Türen bleibt ein Feld frei
    return !doors.some((d) => Math.hypot(d.x - x, d.y - y) < Math.max(w, h) / 2 + 52);
  };
  const put = (t, x, y, rot, w, h, solid = true) => {
    out.push({ t, x: Math.round(x), y: Math.round(y), rot: Math.round(((rot % 360) + 360) % 360), v: Math.floor(R() * 1e6) });
    if (solid) placed.push({ x, y, hw: w / 2 + 4, hh: h / 2 + 4, rot });
  };
  /** Begleiter (Hocker, Stühle, Bänke) um ein Stück herum. */
  const around = (t, n, x, y, w, h, rot) => {
    if (!known(t)) return;
    const [cw, ch] = ctx.size(t);
    // Hocker rücken dicht an ihren Tisch: der zählt für sie nicht als Hindernis
    const parent = placed.pop();
    try {
      seat(t, n, x, y, w, h, rot, cw, ch);
    } finally {
      placed.push(parent);
    }
  };
  const seat = (t, n, x, y, w, h, rot, cw, ch) => {
    if (t === 'bench') {
      // Bänke längs an beide Seiten
      const a = (rot * Math.PI) / 180;
      for (const sgn of [-1, 1].slice(0, n)) {
        const bx = x - Math.sin(a) * sgn * (h / 2 + ch / 2 + 5);
        const by = y + Math.cos(a) * sgn * (h / 2 + ch / 2 + 5);
        if (fits(bx, by, cw, ch, rot)) put(t, bx, by, rot, cw, ch);
      }
      return;
    }
    const start = rnd(0, 6.283);
    const rad = Math.max(w, h) / 2 + Math.max(cw, ch) / 2 + 3;
    for (let i = 0; i < n; i++) {
      const a = start + (i / n) * 6.283 + rnd(-0.2, 0.2);
      const sx = x + Math.cos(a) * rad;
      const sy = y + Math.sin(a) * rad;
      // Lehne nach außen, Blick zum Tisch
      if (fits(sx, sy, cw, ch, (a * 180) / Math.PI + 90)) put(t, sx, sy, (a * 180) / Math.PI + 90, cw, ch);
    }
  };

  let rugAt = null; // der erste Tisch kommt mitten auf den Teppich
  // 1. Teppiche und Flaches: in die Mitte, zählt nicht als Hindernis
  for (const [t, per10, o = {}] of theme.rug || []) {
    if (!known(t)) continue;
    const [w, h] = ctx.size(t);
    for (let i = 0, n = count(per10, o, area, density); i < n; i++) {
      const x = cx + rnd(-0.12, 0.12) * (circle ? room.r : room.w);
      const y = cy + rnd(-0.12, 0.12) * (circle ? room.r : room.h);
      const rot = circle || room.w >= room.h ? 0 : 90;
      if (!fits(x, y, w, h, rot, false)) continue;
      put(t, x, y, rot, w, h, false);
      rugAt = [x, y];
    }
  }

  // 2. Wandstücke: Rücken zur Wand, nur wo wirklich Wand steht; feste Stücke zuerst und bevorzugt an die längste Wand
  const wallSpot = (w, h, prefer) => {
    for (let tries = 0; tries < 60; tries++) {
      let wx;
      let wy;
      let nx;
      let ny;
      if (circle) {
        const a = rnd(0, 6.283);
        [nx, ny] = [-Math.cos(a), -Math.sin(a)];
        [wx, wy] = [room.cx - nx * room.r, room.cy - ny * room.r];
      } else {
        // Seiten: 0 oben, 1 rechts, 2 unten, 3 links
        const long = room.w >= room.h ? [0, 2] : [1, 3];
        const side = prefer && tries < 24 ? long[tries % 2] : Math.floor(R() * 4);
        const len = side % 2 ? room.h : room.w;
        if (len < w + 30) continue;
        const u = rnd(w / 2 + 14, len - w / 2 - 14);
        [wx, wy, nx, ny] = side === 0 ? [room.x + u, room.y, 0, 1] : side === 1 ? [room.x + room.w, room.y + u, -1, 0] : side === 2 ? [room.x + u, room.y + room.h, 0, -1] : [room.x, room.y + u, 1, 0];
      }
      if (!isWall(wx, wy)) continue;
      const x = wx + nx * (WALL + h / 2);
      const y = wy + ny * (WALL + h / 2);
      const rot = (Math.atan2(nx, -ny) * 180) / Math.PI + 180;
      if (fits(x, y, w, h, rot)) return [x, y, rot];
    }
    return null;
  };
  const walls = [...(theme.wall || [])].sort((a, b) => (b[2]?.fix || 0) - (a[2]?.fix || 0));
  for (const [t, per10, o = {}] of walls) {
    if (!known(t)) continue;
    const [w, h] = ctx.size(t);
    for (let i = 0, n = count(per10, o, area, density); i < n; i++) {
      const spot = wallSpot(w, h, !!o.fix);
      if (!spot) break;
      put(t, spot[0], spot[1], spot[2], w, h);
      if (o.with) around(o.with[0], o.with[1], spot[0], spot[1], w, h, spot[2]);
    }
  }

  // 3. Ecken: Fässer, Säcke und Kisten sammeln sich in zwei, drei Ecken zu Gruppen – dicht an dicht, gerade gestellt
  const hot = [[-1, -1], [1, -1], [1, 1], [-1, 1]].sort(() => R() - 0.5).slice(0, 2 + (area > 30 ? 1 : 0));
  const hotAngle = rnd(0, 6.283);
  for (const [t, per10, o = {}] of theme.corner || []) {
    if (!known(t)) continue;
    const [w, h] = ctx.size(t);
    // Spinnennetz: gehört genau in eine rechtwinklige Ecke – im Rundraum gibt es keine
    if (t === 'web') {
      if (circle) continue;
      for (let i = 0, n = Math.min(2, count(per10, o, area, density)); i < n; i++) {
        const [sx, sy] = [[-1, -1], [1, -1], [1, 1], [-1, 1]][Math.floor(R() * 4)];
        put(t, cx + sx * (room.w / 2 - 5 - w / 2), cy + sy * (room.h / 2 - 5 - h / 2), sx < 0 ? (sy < 0 ? 0 : 270) : sy < 0 ? 90 : 180, w, h, false);
      }
      continue;
    }
    for (let i = 0, n = count(per10, o, area, density); i < n; i++) {
      for (let tries = 0; tries < 30; tries++) {
        let x;
        let y;
        if (circle) {
          const a = hotAngle + Math.floor(R() * 2) * 2.4 + rnd(-0.5, 0.5);
          const d = room.r - WALL - Math.max(w, h) / 2 - rnd(1, 26);
          [x, y] = [room.cx + Math.cos(a) * d, room.cy + Math.sin(a) * d];
        } else {
          const [sx, sy] = hot[Math.floor(R() * hot.length)];
          const reach = Math.min(room.w, room.h) * (0.1 + tries * 0.012);
          x = cx + sx * (room.w / 2 - WALL - w / 2 - rnd(0, reach));
          y = cy + sy * (room.h / 2 - WALL - h / 2 - rnd(0, reach));
        }
        const rot = Math.floor(R() * 4) * 90 + rnd(-8, 8);
        if (!fits(x, y, w - 6, h - 6, rot)) continue;
        put(t, x, y, rot, w - 8, h - 8);
        break;
      }
    }
  }

  // 4. Mitte: Tische mit Hockern, Truhen, Säulen – mit Abstand zur Wand
  for (const [t, per10, o = {}] of theme.center || []) {
    if (!known(t)) continue;
    const [w, h] = ctx.size(t);
    for (let i = 0, n = count(per10, o, area, density); i < n; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const m = 46 + Math.max(w, h) / 2;
        let x = circle ? room.cx + rnd(-1, 1) * Math.max(0, room.r - m) * 0.7 : rnd(room.x + m, room.x + room.w - m);
        let y = circle ? room.cy + rnd(-1, 1) * Math.max(0, room.r - m) * 0.7 : rnd(room.y + m, room.y + room.h - m);
        if (rugAt && tries === 0) {
          [x, y] = rugAt;
          rugAt = null;
        }
        if (!circle && (room.w < 2 * m || room.h < 2 * m)) break;
        // lange Stücke liegen längs im Raum, Bankreihen quer dazu
        const along = circle || room.w >= room.h ? 0 : 90;
        const rot = t === 'pew' ? along + 90 : w > h * 1.6 ? along + (R() < 0.15 ? 90 : 0) : Math.round(rnd(-10, 10));
        if (!fits(x, y, w + 16, h + 16, rot)) continue;
        put(t, x, y, rot, w, h);
        if (o.with) around(o.with[0], o.with[1], x, y, w, h, rot);
        break;
      }
    }
  }
  return out;
}
