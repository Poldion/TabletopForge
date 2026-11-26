// Kartenbauer: Räume auf einen Klick einrichten. Je Thema eine Regeltabelle – was an die Wand gehört, was in die Ecken,
// was in die Mitte (mit Hockern oder Stühlen darum) und was als Teppich auf den Boden. Reine Rechnung ohne DOM:
// Größen und Hindernisse kommen von außen, damit es sich ohne Browser testen lässt.
import { rng, inRoom, inRects } from './mb-geom.js';

const WALL = 9; // halbe Wandstärke plus etwas Luft
/** Wandstücke mit Platz dahinter (in Pixeln): hinter dem Tresen steht der Wirt. */
const BEHIND = { bar: 70 };
/** Niedrige Wandstücke, die auch unter einem Fenster stehen dürfen. */
const LOW = new Set(['bar', 'bed', 'bench', 'chest', 'desk', 'bedroll', 'pew', 'sarcophagus', 'coffin', 'candles', 'logs', 'hay', 'armchair', 'bathtub', 'workbench', 'mineCart', 'cannon', 'bollard', 'lever', 'chains']);

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

/**
 * Wohin ein Gegenstand gehört – unabhängig davon, was ein Sprachmodell dazu meint. Erster Eintrag = Standard, die
 * übrigen sind ebenfalls erlaubt ('seat' = nur als Sitz an einem Tisch). Was hier fehlt, darf frei gewählt werden.
 */
const P = (s, ids) => Object.fromEntries(ids.split(' ').map((t) => [t, s.split('|')]));
export const PLACE = {
  ...P('wall', 'bar fireplace stove shelf bookshelf bed wardrobe weaponRack workbench bunk chains cellBars wallTorch lever throne bench'),
  ...P('wall|corner', 'barrelRack candelabra urns chest mineCart cannon bollard'),
  ...P('wall|center', 'desk sarcophagus altar portal'),
  ...P('wall|corner|center', 'crateStack statue'),
  ...P('corner', 'barrel crate sack amphorae baskets clothBolts ropeCoil skulls web candles anchor'),
  ...P('corner|wall', 'logs hay armchair bathtub bedroll'),
  ...P('corner|center', 'rubble treasure crystal cage stalagmite pillarBroken'),
  ...P('corner|rug', 'bones'),
  ...P('center', 'tableRound tableBig longTable tableSquare kitchenTable mapTable pillar rack fountain pew anvil mast'),
  ...P('center|wall', 'alchemyTable cauldron coffin'),
  ...P('center|wall|corner', 'lectern'),
  ...P('center|corner', 'torch lantern'),
  ...P('rug', 'rug rugRound magicCircle glyph puddle trapdoor pit plate spiral crack spikes hatch'),
  ...P('rug|corner', 'net'),
  ...P('seat', 'stool chair'),
};
/** Sitze, die ein Tisch bekommt, wenn die KI keine nennt. */
export const TABLE_SEATS = { tableRound: ['stool', 4], tableBig: ['chair', 5], tableSquare: ['chair', 2], longTable: ['bench', 2], desk: ['chair', 1] };

const count = (per10, o, area, density) =>(o.fix ? o.fix : Math.max(o.min || 0, Math.min(o.max ?? 99, Math.round((per10 * area * density) / 10))));

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
  // Eigene Listen (von der KI) nennen feste Stückzahlen ohne Blick auf die Raumgröße: höchstens etwa ein Stück je
  // zwei Felder, sonst wird alles anteilig weniger (jedes genannte Stück bleibt mindestens einmal dabei)
  let scale = 1;
  if (theme.custom) {
    const sum = ['wall', 'corner', 'center'].reduce((s, k) => s + (theme[k] || []).reduce((a, r) => a + (r[2]?.fix || 0), 0), 0);
    const cap = Math.max(4, Math.round(area * 0.45));
    if (sum > cap) scale = cap / sum;
  }
  const many = (per10, o) => (scale < 1 && o.fix ? Math.max(1, Math.round(o.fix * scale)) : count(per10, o, area, density));
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
  const around = (t, n, x, y, w, h, rot, parentT) => {
    if (!known(t)) return;
    const [cw, ch] = ctx.size(t);
    // Hocker rücken dicht an ihren Tisch: der zählt für sie nicht als Hindernis
    const parent = placed.pop();
    try {
      if (parentT === 'bar') row(t, n, x, y, w, h, rot, cw, ch);
      else seat(t, n, x, y, w, h, rot, cw, ch);
    } finally {
      placed.push(parent);
    }
  };
  /** Hocker in einer Reihe vor einem Stück (Tresen): vorn ist im Bild unten, also zum Raum hin. */
  const row = (t, n, x, y, w, h, rot, cw, ch) => {
    const a = (rot * Math.PI) / 180;
    const k = Math.min(n, Math.max(1, Math.floor((w - 20) / (cw + 14))));
    for (let i = 0; i < k; i++) {
      const u = (i - (k - 1) / 2) * ((w - 20) / k);
      const v = h / 2 + ch / 2 + 6;
      const sx = x + u * Math.cos(a) - v * Math.sin(a);
      const sy = y + u * Math.sin(a) + v * Math.cos(a);
      if (fits(sx, sy, cw, ch, rot)) put(t, sx, sy, rot, cw, ch);
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
  const rugs = []; // Teppichflächen: der Tresen steht nicht darauf
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
      // auf Teppiche kommt ein Tisch, auf Treppen, Falltüren oder Glyphen nichts
      if (/^rug/.test(t)) (rugAt = [x, y]), rugs.push({ x, y, hw: w / 2, hh: h / 2, rot });
    }
  }

  // 2. Wandstücke: Rücken zur Wand, nur wo wirklich Wand steht; feste Stücke zuerst und bevorzugt an die längste Wand.
  // Aus mehreren passenden Stellen gewinnt die, die am weitesten von allem steht, was schon da ist – so verteilen sich
  // die Stücke über alle Wände, statt sich an einer zu drängen. Hohe Stücke (Regal, Schrank, Kamin) bleiben aus den
  // Fenstern; niedrige (Bett, Bank, Truhe) dürfen darunter stehen.
  const windows = (ctx.openings || []).filter((o) => o.k === 'window');
  const spread = (x, y) => placed.reduce((m, q) => Math.min(m, Math.hypot(q.x - x, q.y - y) - Math.max(q.hw, q.hh)), 1e9);
  const wallSpot = (t, w, h, prefer) => {
    const gap = BEHIND[t] || 0;
    // der Tresen steht auf der Seite zur Küche (ctx.toward), sonst bevorzugt an einer langen Wand
    const toward = t === 'bar' ? ctx.toward : null;
    const found = [];
    for (let tries = 0; tries < (toward ? 160 : 90) && found.length < (toward ? 40 : 10); tries++) {
      let wx;
      let wy;
      let nx;
      let ny;
      let side = -1;
      if (circle) {
        const a = rnd(0, 6.283);
        [nx, ny] = [-Math.cos(a), -Math.sin(a)];
        [wx, wy] = [room.cx - nx * room.r, room.cy - ny * room.r];
      } else {
        // Seiten: 0 oben, 1 rechts, 2 unten, 3 links
        const long = room.w >= room.h ? [0, 2] : [1, 3];
        side = prefer && tries < 30 ? long[tries % 2] : Math.floor(R() * 4);
        const len = side % 2 ? room.h : room.w;
        if (len < w + 30) continue;
        const u = rnd(w / 2 + 14, len - w / 2 - 14);
        [wx, wy, nx, ny] = side === 0 ? [room.x + u, room.y, 0, 1] : side === 1 ? [room.x + room.w, room.y + u, -1, 0] : side === 2 ? [room.x + u, room.y + room.h, 0, -1] : [room.x, room.y + u, 1, 0];
      }
      if (!isWall(wx, wy)) continue;
      if (!LOW.has(t) && windows.some((q) => Math.hypot(q.x - wx, q.y - wy) < w / 2 + (q.w || 56) / 2 + 6)) continue;
      const x = wx + nx * (WALL + gap + h / 2);
      const y = wy + ny * (WALL + gap + h / 2);
      const rot = (Math.atan2(nx, -ny) * 180) / Math.PI + 180;
      if (!fits(x, y, w, h, rot)) continue;
      // der Gang dahinter muss frei sein (kein Stück, keine Tür)
      if (gap && !fits(wx + nx * (WALL + gap / 2), wy + ny * (WALL + gap / 2), w, gap - 4, rot)) continue;
      if (gap && rugs.length && [[x, y], ...corners(x, y, w, h, rot)].some(([px, py]) => inRects(rugs, px, py))) continue;
      const long = !circle && (room.w >= room.h ? side % 2 === 0 : side % 2 === 1);
      const near = toward ? 2000 - Math.min(2000, Math.hypot(toward[0] - wx, toward[1] - wy)) : 0;
      found.push({ at: [x, y, rot, wx + nx * (WALL + gap / 2), wy + ny * (WALL + gap / 2), gap], score: Math.min(spread(x, y), 600) + (prefer && long && !toward ? 1000 : 0) + near * 2 });
    }
    if (!found.length) return null;
    return found.sort((a, b) => b.score - a.score)[0].at;
  };
  // feste Stücke zuerst, unter ihnen die breitesten (Tresen vor Bänken) – sonst ist die lange Wand schon belegt
  const fixed = (r) => (theme.custom ? 1 : r[2]?.fix ? 1 : 0);
  const walls = [...(theme.wall || [])].sort((a, b) => fixed(b) - fixed(a) || (known(b[0]) ? ctx.size(b[0])[0] : 0) - (known(a[0]) ? ctx.size(a[0])[0] : 0));
  for (const [t, per10, o = {}] of walls) {
    if (!known(t)) continue;
    const [w, h] = ctx.size(t);
    for (let i = 0, n = many(per10, o); i < n; i++) {
      const spot = wallSpot(t, w, h, theme.custom ? w >= 150 : !!o.fix);
      if (!spot) break;
      put(t, spot[0], spot[1], spot[2], w, h);
      // den Gang dahinter freihalten
      if (spot[5]) placed.push({ x: spot[3], y: spot[4], hw: w / 2 + 4, hh: spot[5] / 2, rot: spot[2] });
      if (o.with) around(o.with[0], o.with[1], spot[0], spot[1], w, h, spot[2], t);
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
      for (let i = 0, n = Math.min(2, many(per10, o)); i < n; i++) {
        const [sx, sy] = [[-1, -1], [1, -1], [1, 1], [-1, 1]][Math.floor(R() * 4)];
        put(t, cx + sx * (room.w / 2 - 5 - w / 2), cy + sy * (room.h / 2 - 5 - h / 2), sx < 0 ? (sy < 0 ? 0 : 270) : sy < 0 ? 90 : 180, w, h, false);
      }
      continue;
    }
    for (let i = 0, n = many(per10, o); i < n; i++) {
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

  // 4. Mitte: Tische mit Hockern, Truhen, Säulen – mit Abstand zur Wand. Mehrere gleiche Stücke stehen in Reihen und
  // Spalten mit Gängen dazwischen (Bankreihen, Tische einer Schankstube, Pritschen), ein einzelnes kommt in die Mitte
  // oder auf den Teppich; erst was so keinen Platz findet, wird frei verteilt. Alle Stücke einer Art gleich ausgerichtet.
  const along = circle || room.w >= room.h ? 0 : 90;
  for (const [t, per10, o = {}] of theme.center || []) {
    if (!known(t)) continue;
    const [w, h] = ctx.size(t);
    const n = many(per10, o);
    const m = 46 + Math.max(w, h) / 2;
    if (!circle && (room.w < 2 * m || room.h < 2 * m)) continue;
    // lange Stücke liegen längs im Raum, Bankreihen quer dazu
    const straight = t === 'pew' || w > h * 1.6;
    const rot0 = t === 'pew' ? along + 90 : straight ? along : 0;
    const turn = () => rot0 + (straight ? 0 : Math.round(rnd(-4, 4)));
    let done = 0;
    const at = (x, y) => {
      const rot = turn();
      if (!fits(x, y, w + 16, h + 16, rot)) return false;
      put(t, x, y, rot, w, h);
      if (o.with) around(o.with[0], o.with[1], x, y, w, h, rot);
      done++;
      return true;
    };
    if (n === 1) {
      if (rugAt && at(...rugAt)) rugAt = null;
      else at(cx, cy);
    } else if (!circle && PLACE[t]?.[0] !== 'seat') {
      const sw = rot0 % 180 ? h : w;
      const sh = rot0 % 180 ? w : h;
      // Platz für die Sitze: Hocker und Stühle rundherum, Bänke nur längs an den beiden langen Seiten
      const seatSize = o.with && known(o.with[0]) ? ctx.size(o.with[0]) : null;
      const bench = o.with?.[0] === 'bench';
      const ext = seatSize ? (bench ? Math.min(...seatSize) : Math.max(...seatSize)) + 8 : 0;
      const [ex, ey] = bench ? (rot0 % 180 ? [ext, 0] : [0, ext]) : [ext, ext];
      const gx = sw + 2 * ex + (t === 'pew' ? 34 : 56);
      const gy = sh + 2 * ey + (t === 'pew' ? 26 : 56);
      // etwas weiter innen als nötig: an den Wänden stehen schon Tresen, Regale und Betten
      const g = m + Math.min(40, Math.max(0, (Math.min(room.w, room.h) - 2 * m - sh) / 4));
      const [x0, x1, y0, y1] = [room.x + g, room.x + room.w - g, room.y + g, room.y + room.h - g];
      const maxC = Math.max(1, Math.floor((x1 - x0) / gx) + 1);
      const maxR = Math.max(1, Math.floor((y1 - y0) / gy) + 1);
      let cols;
      let rows;
      if (room.w >= room.h) (cols = Math.min(maxC, n)), (rows = Math.min(maxR, Math.ceil(n / cols)));
      else (rows = Math.min(maxR, n)), (cols = Math.min(maxC, Math.ceil(n / rows)));
      // nur ein Raster, in das alle passen – eine halbe Reihe plus Streuner sieht schlechter aus als gleichmäßig verteilt
      if (cols * rows >= n) {
        const sx = cols > 1 ? Math.min((x1 - x0) / (cols - 1), gx * 1.3) : 0;
        const sy = rows > 1 ? Math.min((y1 - y0) / (rows - 1), gy * 1.3) : 0;
        const spots = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) spots.push([cx + (c - (cols - 1) / 2) * sx, cy + (r - (rows - 1) / 2) * sy]);
        // bei einer unvollständigen letzten Reihe: die mittleren Plätze zuerst
        spots.sort((p, q) => Math.abs(p[1] - cy) - Math.abs(q[1] - cy) || Math.abs(p[0] - cx) - Math.abs(q[0] - cx));
        const mark = out.length;
        const mk = placed.length;
        for (const [x, y] of spots) if (done < n) at(x, y);
        // ging das Raster nicht ganz auf (Tresen, Kamin im Weg), lieber alles gleichmäßig verteilen
        if (done < n && done < Math.ceil(n * 0.75)) {
          out.length = mark;
          placed.length = mk;
          done = 0;
        }
      }
    }
    // gleichmäßig verteilen: unter mehreren freien Stellen die, die am weitesten von allem anderen und von den Wänden
    // entfernt ist; auf halbe Felder gerastet, damit es ruhig wirkt
    // liegt ein Teppich, kommt das erste Stück mitten darauf
    if (done < n && rugAt && at(...rugAt)) rugAt = null;
    while (done < n) {
      let best = null;
      for (let tries = 0; tries < 70; tries++) {
        let x = circle ? room.cx + rnd(-1, 1) * Math.max(0, room.r - m) * 0.75 : rnd(room.x + m, room.x + room.w - m);
        let y = circle ? room.cy + rnd(-1, 1) * Math.max(0, room.r - m) * 0.75 : rnd(room.y + m, room.y + room.h - m);
        if (!circle) (x = room.x + Math.round((x - room.x) / 35) * 35), (y = room.y + Math.round((y - room.y) / 35) * 35);
        const rot = turn();
        if (!fits(x, y, w + 16 + (o.with ? 60 : 0), h + 16 + (o.with ? 60 : 0), rot) && !fits(x, y, w + 16, h + 16, rot)) continue;
        const edge = circle ? room.r - Math.hypot(x - room.cx, y - room.cy) : Math.min(x - room.x, room.x + room.w - x, y - room.y, room.y + room.h - y);
        const score = Math.min(spread(x, y), edge * 1.6);
        if (!best || score > best.score) best = { x, y, score };
      }
      if (!best || !at(best.x, best.y)) break;
    }
  }
  return out;
}
