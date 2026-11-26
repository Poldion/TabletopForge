// Kartenbauer: Geometrie ohne Browser – Umrisse, Gebäudewände, Türöffnungen und das Streuen in Füllbereichen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL, marchingSquares, chamfer, boxBlur, polyArea, tileField, cutSpans, buildingOutline, wallPieces, arcPieces, wallSegments, roomZones, cleanScene, freshIds, nearestWall, scatter, roomAt, thin, ruinPieces, isRuinWall, simplify } from '../public/js/mb-geom.js';

const len = (s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
const total = (segs) => segs.reduce((a, s) => a + len(s), 0);

test('Höhenlinien: eine Scheibe ergibt genau einen geschlossenen Umriss passender Größe', () => {
  const n = 60;
  const F = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) F[y * n + x] = Math.hypot(x - 30, y - 30) < 18 ? 1 : 0;
  boxBlur(F, n, n, 1, 1);
  const loops = marchingSquares(F, n, n, 0.5);
  assert.equal(loops.length, 1);
  const area = Math.abs(polyArea(loops[0]));
  assert.ok(Math.abs(area - Math.PI * 18 * 18) < 60, `Fläche ${area}`);
});

test('Höhenlinien: ein Ring ergibt zwei Umrisse (außen und Loch)', () => {
  const n = 60;
  const F = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) F[y * n + x] = Math.abs(Math.hypot(x - 30, y - 30) - 15) < 5 ? 1 : 0;
  assert.equal(marchingSquares(F, n, n, 0.5).length, 2);
});

test('Abstandsfeld: wächst von der Kante nach innen', () => {
  const n = 21;
  const inside = new Uint8Array(n * n);
  for (let y = 3; y < 18; y++) for (let x = 3; x < 18; x++) inside[y * n + x] = 1;
  const D = chamfer(inside, n, n);
  assert.equal(D[0], 0);
  assert.equal(D[3 * n + 3], 1);
  assert.equal(D[10 * n + 10], 8);
});

test('Rauschkachel wiederholt sich nahtlos und nutzt den Wertebereich', () => {
  const size = 64;
  const f = tileField(5, size, 4, 2);
  let min = 255;
  let max = 0;
  let jump = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = f[y * size + x];
      min = Math.min(min, v);
      max = Math.max(max, v);
      // Nachbar über den Rand hinweg unterscheidet sich nicht stärker als im Inneren
      jump = Math.max(jump, Math.abs(v - f[y * size + ((x + 1) % size)]), Math.abs(v - f[((y + 1) % size) * size + x]));
    }
  }
  assert.ok(min < 60 && max > 195, `Bereich ${min}…${max}`);
  assert.ok(jump < 70, `größter Sprung ${jump}`);
});

test('cutSpans zieht Abschnitte ab', () => {
  assert.deepEqual(cutSpans(100, [[40, 60]]), [[0, 40], [60, 100]]);
  assert.deepEqual(cutSpans(100, [[-10, 30], [90, 120]]), [[30, 90]]);
  assert.deepEqual(cutSpans(100, [[0, 100]]), []);
});

test('Ein einzelner Raum bekommt vier Wände und vier Eckpfosten', () => {
  const o = buildingOutline([{ id: 'a', k: 'rect', x: 0, y: 0, w: 280, h: 140 }]);
  assert.equal(o.segs.length, 4);
  assert.equal(total(o.segs), 2 * (280 + 140));
  assert.equal(o.posts.length, 4);
  assert.equal(o.arcs.length, 0);
});

test('Angrenzende und überlappende Räume verschmelzen: keine Wand im Inneren', () => {
  // L-förmiges Haus aus zwei Rechtecken, die sich eine Kante teilen
  const rooms = [
    { id: 'a', k: 'rect', x: 0, y: 0, w: 280, h: 280 },
    { id: 'b', k: 'rect', x: 280, y: 0, w: 140, h: 140 },
  ];
  const o = buildingOutline(rooms);
  assert.equal(o.segs.length, 6);
  assert.equal(total(o.segs), 280 + 140 + 140 + 140 + 140 + 280 + 280);
  assert.equal(o.posts.length, 6);
  // überlappend gezeichnet ergibt denselben Umriss
  const o2 = buildingOutline([rooms[0], { id: 'b', k: 'rect', x: 210, y: 0, w: 210, h: 140 }]);
  assert.equal(total(o2.segs), total(o.segs));
});

test('Offene Räume (Veranda) bekommen keine Wand', () => {
  const o = buildingOutline([{ id: 'a', k: 'rect', x: 0, y: 0, w: 140, h: 140, open: true }]);
  assert.equal(o.segs.length + o.arcs.length, 0);
});

test('Rundraum: freistehend ein voller Kreis, an der Hausecke ein Bogen', () => {
  const tower = { id: 't', k: 'circle', cx: 0, cy: 0, r: 105 };
  assert.equal(buildingOutline([tower]).arcs[0].full, true);
  const o = buildingOutline([{ id: 'a', k: 'rect', x: 0, y: 0, w: 420, h: 280 }, tower]);
  assert.equal(o.arcs.length, 1);
  const a = o.arcs[0];
  // drei Viertel des Kreises liegen außerhalb des Hauses
  assert.ok(Math.abs((a.a1 - a.a0) - 1.5 * Math.PI) < 0.1, `Bogen ${a.a1 - a.a0}`);
  // die Hauswände beginnen erst am Kreis
  assert.equal(total(o.segs), 2 * (420 + 280) - 2 * 105);
});

test('Türen öffnen die Wand, Fenster nicht', () => {
  const wall = { x1: 0, y1: 0, x2: 280, y2: 0 };
  const door = { id: 'd', k: 'door', x: 140, y: 0, a: 0, w: 70 };
  const pieces = wallPieces(wall, [door, { id: 'f', k: 'window', x: 40, y: 0, a: 0, w: 56 }]);
  assert.deepEqual(pieces.map((p) => [p.x1, p.x2]), [[0, 105], [175, 280]]);
  // eine Tür an einer anderen Wand lässt diese hier ganz
  assert.equal(wallPieces(wall, [{ ...door, y: 200 }]).length, 1);
  const arc = { cx: 0, cy: 0, r: 100, a0: 0, a1: 6.2832, full: true };
  const parts = arcPieces(arc, [{ id: 'd', k: 'door', x: 0, y: 100, a: 0, w: 70 }]);
  assert.ok(Math.abs(parts.reduce((s, p) => s + (p.a1 - p.a0) * p.r, 0) - (628.32 - 70)) < 1);
});

test('Wandstrecken für die Lichtberechnung: Außenwände ohne Türöffnung, dazu Innenwände', () => {
  const rooms = [{ id: 'a', k: 'rect', x: 0, y: 0, w: 280, h: 140 }];
  const inner = [{ id: 'w', x1: 140, y1: 0, x2: 140, y2: 140, kind: 'wood' }];
  const segs = wallSegments(rooms, inner, [{ id: 'd', k: 'door', x: 70, y: 140, a: 0, w: 70 }]);
  assert.equal(segs.length, 6); // 4 Außenwände, eine davon geteilt, plus Innenwand
  assert.equal(segs.reduce((s, [x1, y1, x2, y2]) => s + Math.hypot(x2 - x1, y2 - y1), 0), 2 * (280 + 140) - 70 + 140);
});

test('nearestWall findet die Wand samt Richtung', () => {
  const o = buildingOutline([{ id: 'a', k: 'rect', x: 0, y: 0, w: 280, h: 140 }]);
  const n = nearestWall(o, [], 100, 150);
  assert.deepEqual([n.x, n.y, Math.round(n.d)], [100, 140, 10]);
  assert.ok(Math.abs(Math.sin(n.a)) < 1e-9); // waagerechte Wand
});

test('roomAt: später gezeichnete Räume liegen oben', () => {
  const rooms = [{ id: 'a', k: 'rect', x: 0, y: 0, w: 200, h: 200 }, { id: 't', k: 'circle', cx: 100, cy: 100, r: 50 }];
  assert.equal(roomAt(rooms, 100, 100).id, 't');
  assert.equal(roomAt(rooms, 10, 10).id, 'a');
  assert.equal(roomAt(rooms, 300, 10), null);
});

test('Füllbereich: gleiche Verteilung bei gleichem Startwert, alles innerhalb und auf freiem Boden', () => {
  const fill = { id: 'f1', kind: 'trees', density: 1, seed: 42, shape: { k: 'ellipse', cx: 700, cy: 700, rx: 500, ry: 400 } };
  const a = scatter(fill, CELL);
  const b = scatter(fill, CELL);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 8, `${a.length} Bäume`);
  for (const o of a) {
    assert.equal(o.fill, 'f1');
    assert.ok(((o.x - 700) / 500) ** 2 + ((o.y - 700) / 400) ** 2 <= 1.01);
  }
  assert.equal(new Set(a.map((o) => o.id)).size, a.length);
  // Bäume stehen nicht ineinander
  for (const p of a) for (const q of a) if (p !== q) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > 80);
  // gesperrte Hälfte bleibt leer
  const half = scatter(fill, CELL, (x) => x < 700);
  assert.ok(half.length > 0 && half.every((o) => o.x >= 700));
  // anderer Startwert, andere Verteilung
  assert.notDeepEqual(scatter({ ...fill, seed: 43 }, CELL), a);
});

test('Füllbereich „Gemischt“ streut Bäume, Büsche und Felsen', () => {
  const kinds = new Set(scatter({ id: 'm', kind: 'mixed', density: 1.5, seed: 7, shape: { k: 'rect', x: 0, y: 0, w: 1400, h: 1400 } }, CELL).map((o) => o.t));
  assert.deepEqual([...kinds].sort(), ['bush', 'rock', 'tree']);
});

test('thin dünnt Freihand-Linien aus und behält Anfang und Ende', () => {
  const pts = Array.from({ length: 101 }, (_, i) => [i, 0]);
  const out = thin(pts, 10);
  assert.deepEqual(out[0], [0, 0]);
  assert.deepEqual(out[out.length - 1], [100, 0]);
  assert.equal(out.length, 11);
});

test('Sichtfläche: ohne Wand in Reichweite voller Kreis, hinter einer Wand Schatten', async () => {
  const { visibilityPolygon } = await import('../public/js/visibility.js');
  assert.equal(visibilityPolygon(0, 0, 100, []), null);
  assert.equal(visibilityPolygon(0, 0, 100, [[500, -50, 500, 50]]), null);
  // Wand rechts vom Licht: dahinter bleibt es dunkel, links ist frei
  const poly = visibilityPolygon(0, 0, 200, [[80, -60, 80, 60]]);
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  assert.equal(inside(60, 0), true); // vor der Wand
  assert.equal(inside(150, 0), false); // im Schatten
  assert.equal(inside(150, 20), false);
  assert.equal(inside(-150, 0), true); // freie Seite
  assert.equal(inside(60, 150), true); // an der Wand vorbei
  // Licht genau auf einer Wand (Wandfackel) leuchtet nach beiden Seiten
  const torch = visibilityPolygon(0, 0, 100, [[-50, 0, 50, 0], [-80, 60, 80, 60]]);
  assert.ok(torch.some(([, y]) => y < -90) && torch.some(([, y]) => Math.abs(y - 60) < 1));
});

test('Fenster lassen Licht durch, bleiben aber Wand', () => {
  const wall = { x1: 0, y1: 0, x2: 280, y2: 0 };
  const win = [{ id: 'f', k: 'window', x: 140, y: 0, a: 0, w: 56 }];
  assert.equal(wallPieces(wall, win).length, 1);
  assert.equal(wallPieces(wall, win, true).length, 2);
});

test('Rundturm an der Hausecke: Bogen und gerade Wände schließen lückenlos aneinander', () => {
  const rooms = [{ id: 'a', k: 'rect', x: 0, y: 0, w: 420, h: 280 }, { id: 't', k: 'circle', cx: 0, cy: 0, r: 140 }];
  const segs = wallSegments(rooms, [], []);
  const ends = segs.flatMap(([x1, y1, x2, y2]) => [`${x1}|${y1}`, `${x2}|${y2}`]);
  // jeder Endpunkt kommt genau zweimal vor: ein geschlossener Wandzug
  const count = new Map();
  for (const e of ends) count.set(e, (count.get(e) || 0) + 1);
  assert.deepEqual([...count.values()].filter((n) => n !== 2), []);
});

test('Ruine: Mauerstücke mit Lücken, bei gleicher Lage immer dieselben', () => {
  const wall = { x1: 0, y1: 0, x2: 700, y2: 0 };
  const a = ruinPieces(wall);
  assert.deepEqual(a, ruinPieces(wall));
  assert.ok(a.length >= 3, `${a.length} Stücke`);
  const kept = a.reduce((s, p) => s + (p.x2 - p.x1), 0);
  assert.ok(kept > 300 && kept < 640, `${kept} px stehen noch`);
  for (let i = 1; i < a.length; i++) assert.ok(a[i].x1 - a[i - 1].x2 >= 24, 'Lücke zwischen den Stücken');
});

test('Ruine: Lücken lassen Licht durch, heile Räume daneben bleiben geschlossen', () => {
  const ruin = [{ id: 'a', k: 'rect', x: 0, y: 0, w: 700, h: 420, ruin: true }];
  const whole = [{ id: 'a', k: 'rect', x: 0, y: 0, w: 700, h: 420 }];
  const sum = (segs) => segs.reduce((s, [x1, y1, x2, y2]) => s + Math.hypot(x2 - x1, y2 - y1), 0);
  assert.equal(sum(wallSegments(whole, [], [])), 2 * (700 + 420));
  assert.ok(sum(wallSegments(ruin, [], [])) < 0.9 * 2 * (700 + 420));
  assert.equal(isRuinWall(ruin, 350, 0), true);
  assert.equal(isRuinWall(ruin, 350, 200), false);
  assert.equal(isRuinWall(whole, 350, 0), false);
});

test('simplify lässt gerade Stücke zusammenfallen und behält Ecken', () => {
  const pts = [[0, 0], [10, 0.2], [20, -0.1], [30, 0], [30, 10], [30, 20], [30, 30]];
  assert.deepEqual(simplify(pts, 1), [[0, 0], [30, 0], [30, 30]]);
});

test('Höhlenwände werden zu geschlossenen Wandzügen für das Licht', () => {
  const n = 80;
  const loop = Array.from({ length: n }, (_, i) => [500 + Math.cos((i / n) * 6.2832) * 200, 400 + Math.sin((i / n) * 6.2832) * 150]);
  const segs = wallSegments([], [], [], [loop]);
  assert.ok(segs.length >= 10 && segs.length < n, `${segs.length} Strecken`);
  const count = new Map();
  for (const [x1, y1, x2, y2] of segs) for (const k of [`${x1}|${y1}`, `${x2}|${y2}`]) count.set(k, (count.get(k) || 0) + 1);
  assert.deepEqual([...count.values()].filter((v) => v !== 2), []);
});

test('Türen im Spiel: geschlossen sperrt die Tür das Licht ein, offen fällt es hinaus', async () => {
  const { visibilityPolygon } = await import('../public/js/visibility.js');
  const { wallsWithDoors, doorSegment, doorAt, doorState } = await import('../public/js/doors.js');
  const rooms = [{ id: 'a', k: 'rect', x: 0, y: 0, w: 420, h: 420 }];
  const door = { id: 'd', k: 'door', x: 420, y: 210, a: Math.PI / 2, w: 70 };
  const map = { walls: wallSegments(rooms, [], [door]), doors: { d: { ...door, open: false } } };
  assert.deepEqual(doorSegment(door), [420, 175, 420, 245]);
  const reach = (m) => Math.max(...visibilityPolygon(210, 210, 600, wallsWithDoors(m)).map(([x]) => x));
  assert.ok(reach(map) <= 421, 'geschlossene Tür hält das Licht im Raum');
  const before = doorState(map);
  map.doors.d.open = true;
  assert.notEqual(doorState(map), before);
  assert.ok(reach(map) > 700, 'durch die offene Tür fällt Licht nach draußen');
  assert.equal(doorAt(map, 424, 190)?.id, 'd');
  assert.equal(doorAt(map, 424, 300), null);
  assert.equal(doorAt(map, 300, 210), null);
});

test('Räume zum Aufdecken: zwei Zimmer mit Tür dazwischen sind zwei Flächen, das Freie ist keine', async () => {
  const { zoneAt } = await import('../public/js/doors.js');
  const rooms = [{ id: 'a', k: 'rect', x: 140, y: 140, w: 420, h: 280 }, { id: 'b', k: 'rect', x: 560, y: 140, w: 280, h: 280 }, { id: 'c', k: 'circle', cx: 350, cy: 700, r: 140 }];
  // Aneinanderstoßende Rechtecke verschmelzen zu einem Gebäude – erst die Innenwand trennt die Zimmer
  const zones = roomZones(rooms, [{ id: 'w', x1: 560, y1: 140, x2: 560, y2: 420 }], [], 1050, 980);
  assert.equal(zones.length, 3);
  const map = { zones };
  const a = zoneAt(map, 300, 280);
  const b = zoneAt(map, 700, 280);
  const c = zoneAt(map, 350, 700);
  assert.ok(a && b && c && a !== b && b !== c);
  assert.equal(zoneAt(map, 950, 600), null, 'draußen ist kein Raum');
  // Die Fläche reicht über die Wand hinaus, aber nicht weit in den Nachbarraum
  const xs = a.pts.filter((_, i) => i % 2 === 0);
  assert.ok(Math.min(...xs) < 135 && Math.min(...xs) > 100, `linker Rand ${Math.min(...xs)}`);
  assert.ok(Math.max(...xs) > 565 && Math.max(...xs) < 600, `rechter Rand ${Math.max(...xs)}`);
  assert.ok(a.pts.length <= 24, `${a.pts.length / 2} Punkte`);
  // Innenwand teilt einen Raum
  const split = roomZones([rooms[0]], [{ id: 'w', x1: 350, y1: 140, x2: 350, y2: 420 }], [], 700, 560);
  assert.equal(split.length, 2);
});

test('Tür in runder Wand: geschlossen bleibt kein Spalt für das Licht', async () => {
  const { visibilityPolygon } = await import('../public/js/visibility.js');
  const { wallsWithDoors, sealDoor } = await import('../public/js/doors.js');
  for (const r of [70, 140, 210]) {
    const rooms = [{ id: 't', k: 'circle', cx: 400, cy: 400, r }];
    // Tür unten am Turm
    const door = { id: 'd', k: 'door', x: 400, y: 400 + r, a: 0, w: 70 };
    const walls = wallSegments(rooms, [], [door]);
    const d = { ...door, open: false };
    d.seg = sealDoor(d, walls);
    const map = { walls, doors: { d } };
    for (const [lx, ly] of [[400, 400], [400 - r * 0.5, 400 + r * 0.3], [400 + r * 0.6, 400 + r * 0.5]]) {
      const poly = visibilityPolygon(lx, ly, 900, wallsWithDoors(map));
      const far = Math.max(...poly.map(([x, y]) => Math.hypot(x - 400, y - 400)));
      assert.ok(far <= r + 2, `Radius ${r}, Licht bei ${lx}|${ly}: reicht bis ${far.toFixed(1)}`);
    }
  }
});

test('Räume: Ringgang lässt die Kammer in der Mitte verdeckt, Klick nahe der Wand trifft den eigenen Raum, 1×1 zählt', async () => {
  const { zoneAt, zoneOp, zoneShown } = await import('../public/js/doors.js');
  // Gang rund um eine Kammer: großer Raum, darin vier Innenwände als Kammer
  const hall = [{ id: 'h', k: 'rect', x: 70, y: 70, w: 700, h: 700 }];
  const box = [[280, 280, 560, 280], [560, 280, 560, 560], [560, 560, 280, 560], [280, 560, 280, 280]].map(([x1, y1, x2, y2], i) => ({ id: `w${i}`, x1, y1, x2, y2 }));
  const zones = roomZones(hall, box, [], 840, 840);
  assert.equal(zones.length, 2);
  const map = { zones };
  const ring = zoneAt(map, 150, 150);
  const core = zoneAt(map, 420, 420);
  assert.ok(ring && core && ring !== core);
  assert.ok(ring.holes?.length === 1, 'der Gang hat die Kammer als Loch');
  // Die Mitte der Kammer liegt im Loch des Gangs
  const [hx, hy] = [ring.holes[0].filter((_, i) => i % 2 === 0), ring.holes[0].filter((_, i) => i % 2 === 1)];
  assert.ok(Math.min(...hx) < 320 && Math.max(...hx) > 520 && Math.min(...hy) < 320 && Math.max(...hy) > 520);
  // Klick knapp vor der Trennwand trifft den Gang, knapp dahinter die Kammer
  assert.equal(zoneAt(map, 272, 420), ring);
  assert.equal(zoneAt(map, 288, 420), core);
  // Anweisung für den Nebel und „schon aufgedeckt“
  const op = zoneOp(ring);
  assert.deepEqual([op.m, op.s, op.z, op.holes.length], ['reveal', 'poly', ring.id, 1]);
  assert.equal(zoneShown({ fog: { ops: [] } }, ring), false);
  assert.equal(zoneShown({ fog: { ops: [op] } }, ring), true);
  assert.equal(zoneShown({ fog: { ops: [op, zoneOp(ring, true)] } }, ring), false);
  assert.equal(zoneShown({ fog: { ops: [{ m: 'reveal', s: 'all' }] } }, core), true);
  // Zelle von einem Feld
  assert.equal(roomZones([{ id: 'c', k: 'rect', x: 140, y: 140, w: 70, h: 70 }], [], [], 420, 420).length, 1);
});

test('Vorlagen und Szenen-Dateien: bereinigen, begrenzen, neue Kennungen', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  assert.equal(cleanScene(null), null);
  assert.equal(cleanScene({ foo: 1 }), null);
  const raw = { cols: 200, rows: 12.4, biome: 'meadow', objects: [{ id: 'a', t: 'barrel', x: 1, y: 2, fill: 'f1' }, { id: 'b', t: 'gibtsnicht', x: 1, y: 2 }, { id: 'c', t: 'crate', x: 'x', y: 2 }, null], fills: [{ id: 'f1', kind: 'trees', shape: { k: 'rect', x: 0, y: 0, w: 70, h: 70 } }], rooms: 'kaputt', meta: { title: 'x' } };
  const s = cleanScene(raw, (t) => t !== 'gibtsnicht');
  assert.deepEqual([s.cols, s.rows, s.objects.length, s.rooms.length, s.water.length, s.meta], [80, 12, 1, 0, 0, undefined]);
  assert.equal(raw.cols, 200, 'das Original bleibt unverändert');
  let n = 0;
  freshIds(s, () => `n${++n}`, () => 0.5);
  assert.equal(s.objects[0].fill, s.fills[0].id);
  assert.notEqual(s.fills[0].id, 'f1');
  assert.equal(s.seed, 5e8);
  // Die mitgelieferten Vorlagen sind gültige Szenen
  const dir = new URL('../public/mb-templates/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 5);
  for (const f of files) {
    const t = cleanScene(JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
    assert.ok(t && t.cols >= 6 && t.objects.length > 5, f);
    assert.ok(readdirSync(dir).includes(f.replace('.json', '.webp')), `Vorschaubild zu ${f}`);
  }
});

test('Häuserviertel: Zeilen ohne Überlappung, Straßen bleiben frei, gleicher Startwert ergibt dasselbe Viertel', async () => {
  const { scatterHouses, TOWN_SHAPES, townVariant } = await import('../public/js/mb-geom.js');
  const fill = { id: 'h', kind: 'houses', seed: 7, density: 1, angle: 20, shape: { k: 'rect', x: 0, y: 0, w: 1400, h: 900 } };
  const a = scatterHouses(fill);
  assert.ok(a.length > 40, `${a.length} Häuser`);
  assert.deepEqual(a, scatterHouses(fill));
  assert.ok(a.every((o) => o.t === 'townHouse' && o.fill === 'h' && o.x > 0 && o.x < 1400 && o.y > 0 && o.y < 900));
  // Dachtöne: mehrere, aber Nachbarn oft gleich
  const tones = a.map((o) => townVariant(o.v).tone);
  assert.ok(new Set(tones).size >= 4);
  // keine zwei Häuser ineinander: Grundflächen als gedrehte Rechtecke, Mittelpunkt des einen nie im anderen
  const inside = (o, x, y) => {
    const [w, d] = TOWN_SHAPES[townVariant(o.v).shape];
    const r = (-o.rot * Math.PI) / 180;
    const dx = (x - o.x) * Math.cos(r) - (y - o.y) * Math.sin(r);
    const dy = (x - o.x) * Math.sin(r) + (y - o.y) * Math.cos(r);
    return Math.abs(dx) < w / 2 - 6 && Math.abs(dy) < d / 2 - 6;
  };
  for (const o of a) for (const q of a) if (o !== q) assert.ok(!inside(o, q.x, q.y), `Haus ${q.id} steckt in ${o.id}`);
  // Sperre (z. B. Straße quer durch die Mitte) wird beachtet
  const b = scatterHouses(fill, (x, y, r, t, foot) => foot.some(([, py]) => Math.abs(py - 450) < 40));
  assert.ok(b.length < a.length && b.every((o) => Math.abs(o.y - 450) > 40));
  // Ellipse und winzige Fläche
  assert.ok(scatterHouses({ ...fill, shape: { k: 'ellipse', cx: 500, cy: 400, rx: 400, ry: 300 } }).length > 10);
  assert.equal(scatterHouses({ ...fill, shape: { k: 'rect', x: 0, y: 0, w: 60, h: 40 } }).length, 0);
});

test('Häuserviertel an der Straße: beiderseits eine Häuserfront dicht an der Kante, zur Straße gedreht', async () => {
  const { scatterHouses, TOWN_SHAPES, townVariant } = await import('../public/js/mb-geom.js');
  const fill = { id: 'h', kind: 'houses', seed: 3, density: 1, angle: 0, shape: { k: 'rect', x: 0, y: 0, w: 1400, h: 700 } };
  const street = { pts: [[0, 350], [1400, 350]], r: 28 };
  // Die Straße selbst ist gesperrt (wie im Kartenbauer über das Gelände)
  const onRoad = (x, y, r, t, foot) => foot.some(([, py]) => Math.abs(py - 350) < 27);
  const a = scatterHouses(fill, onRoad, [street]);
  const front = a.filter((o) => Math.abs(o.y - 350) < 28 + 3 + 50);
  assert.ok(front.length >= 16, `${front.length} Häuser an der Straße`);
  // dicht an der Kante: Abstand der Hauskante zur Straßenkante höchstens ein paar Pixel
  for (const o of front) {
    const { shape } = townVariant(o.v);
    const turned = Math.round(o.rot / 90) % 2 === 1;
    const depth = TOWN_SHAPES[shape][turned ? 0 : 1];
    const gap = Math.abs(o.y - 350) - depth / 2 - 28;
    assert.ok(gap > -1 && gap < 8, `Abstand zur Straße ${gap.toFixed(1)} px`);
  }
  // beide Seiten besetzt, und die Fronten zeigen zueinander (Drehung um 180° versetzt)
  const north = front.filter((o) => o.y < 350);
  const south = front.filter((o) => o.y > 350);
  assert.ok(north.length >= 7 && south.length >= 7);
  const facing = (o) => Math.round(((o.rot % 180) + 180) % 180 / 90) % 2 === 0 ? Math.round(o.rot / 180) % 2 : -1;
  assert.notEqual(facing(north.find((o) => facing(o) >= 0)), facing(south.find((o) => facing(o) >= 0)));
  assert.ok(a.length > front.length, 'dahinter stehen weitere Zeilen');
});

test('Mauerring: Außenseite je Strecke, unabhängig von Zeichenrichtung; offene Züge bleiben ohne', async () => {
  const { ringOutsides } = await import('../public/js/mb-geom.js');
  const sq = [[0, 0, 100, 0], [100, 100, 100, 0], [100, 100, 0, 100], [0, 100, 0, 0]].map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2 }));
  const o = ringOutsides(sq);
  assert.deepEqual([...o.values()].map(([x, y]) => [Math.round(x) + 0, Math.round(y) + 0]), [[0, -1], [1, 0], [0, 1], [-1, 0]]);
  // offener Zug und ein Ring mit Abzweig
  assert.equal(ringOutsides(sq.slice(0, 3)).size, 0);
  assert.equal(ringOutsides([...sq, { x1: 100, y1: 0, x2: 200, y2: 0 }]).size, 0);
  // zwei getrennte Ringe
  const far = sq.map((w) => ({ x1: w.x1 + 500, y1: w.y1, x2: w.x2 + 500, y2: w.y2 }));
  assert.equal(ringOutsides([...sq, ...far]).size, 8);
});

test('Universal-VTT: Wände, Türen, Lichter und Räume in Bild-Pixeln', async () => {
  const { parseUvtt, isUvtt } = await import('../public/js/uvtt.js');
  assert.equal(isUvtt('Keller.dd2vtt'), true);
  assert.equal(isUvtt('karte.png'), false);
  assert.throws(() => parseUvtt({ foo: 1 }));
  // Zwei Räume 4×4 Felder nebeneinander, Tür in der Trennwand; ein Licht im linken Raum
  const data = {
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 6 }, pixels_per_grid: 100 },
    line_of_sight: [
      [{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 5 }, { x: 1, y: 5 }, { x: 1, y: 1 }],
      [{ x: 5, y: 1 }, { x: 5, y: 2.5 }],
      [{ x: 5, y: 3.5 }, { x: 5, y: 5 }],
    ],
    portals: [{ position: { x: 5, y: 3 }, bounds: [{ x: 5, y: 2.5 }, { x: 5, y: 3.5 }], rotation: 1.5708, closed: true, freestanding: false }],
    lights: [{ position: { x: 3, y: 3 }, range: 6, intensity: 1, color: 'ffeccd8b', shadows: true }],
    image: 'iVBORw0KGgo=',
  };
  const u = parseUvtt(data);
  assert.deepEqual([u.width, u.height, u.grid.size, u.image.mime, u.image.ext], [1000, 600, 100, 'image/png', 'png']);
  assert.equal(u.walls.length, 6);
  assert.deepEqual(u.walls[0], [100, 100, 900, 100]);
  const d = Object.values(u.doors)[0];
  assert.deepEqual([d.x, d.y, d.w, d.open, d.plain], [500, 300, 100, false, true]);
  const l = Object.values(u.lights)[0];
  assert.deepEqual([l.x, l.y, l.bright, l.dim, l.color], [300, 300, 15, 15, '#cd8b' === l.color ? l.color : '#eccd8b']);
  assert.equal(u.zones.length, 2, 'zwei Räume, durch die Tür getrennt');
  // Licht bleibt bei geschlossener Tür im linken Raum
  const { visibilityPolygon } = await import('../public/js/visibility.js');
  const { wallsWithDoors } = await import('../public/js/doors.js');
  const reach = (map) => Math.max(...visibilityPolygon(300, 300, 900, wallsWithDoors(map)).map(([x]) => x));
  assert.ok(reach({ walls: u.walls, doors: u.doors }) <= 501);
  d.open = true;
  assert.ok(reach({ walls: u.walls, doors: u.doors }) > 850);
});

test('Raum einrichten: Wandstücke an der Wand, nichts vor Türen, nichts ineinander, gleiches Ergebnis bei gleichem Startwert', async () => {
  const { furnish, THEMES } = await import('../public/js/mb-themes.js');
  const { inRects } = await import('../public/js/mb-geom.js');
  const room = { id: 'r', k: 'rect', x: 140, y: 140, w: 700, h: 490 };
  const SIZE = { bar: [300, 70], fireplace: [160, 70], tableRound: [100, 100], stool: [30, 30], bench: [210, 22], wallTorch: [40, 34] };
  const size = (t) => SIZE[t] || [60, 60];
  const door = { id: 'd', k: 'door', x: 490, y: 630, a: 0, w: 70 };
  const ctx = { size, openings: [door] };
  const a = furnish(room, 'tavern', 5, ctx);
  assert.deepEqual(a, furnish(room, 'tavern', 5, ctx));
  assert.notDeepEqual(a, furnish(room, 'tavern', 6, ctx));
  assert.equal(a.filter((o) => o.t === 'bar').length, 1);
  assert.equal(a.filter((o) => o.t === 'fireplace').length, 1);
  assert.ok(a.filter((o) => o.t === 'tableRound').length >= 1 && a.filter((o) => o.t === 'stool').length >= 2);
  // der Tresen steht mit dem Rücken an einer Wand
  const bar = a.find((o) => o.t === 'bar');
  const gap = Math.min(bar.y - 140, 630 - bar.y, bar.x - 140, 840 - bar.x);
  assert.ok(gap > 100 && gap < 125, `Tresen ${gap} px von der Wand – dahinter ein Feld Platz für den Wirt`);
  // hinter dem Tresen steht nichts
  const behind = a.filter((o) => o !== bar && Math.abs(o.x - bar.x) < 150 && Math.hypot(o.x - bar.x, o.y - bar.y) < 130 && Math.min(o.y - 140, 630 - o.y, o.x - 140, 840 - o.x) < gap);
  assert.deepEqual(behind.map((o) => o.t).filter((t) => t !== 'stool'), [], 'hinter dem Tresen ist frei');
  // mit Küche rechts: der Tresen steht an der rechten Wand
  for (const seed of [1, 2, 3]) {
    const b2 = furnish(room, 'tavern', seed, { ...ctx, toward: [900, 385] }).find((o) => o.t === 'bar');
    assert.ok(b2.x > 700, `Tresen zur Küche hin (x ${b2.x}, Startwert ${seed})`);
  }
  // alles im Raum, nichts vor der Tür, kein Stück mit der Mitte in einem anderen
  const solid = a.filter((o) => o.t !== 'rugRound');
  for (const o of solid) {
    assert.ok(o.x > 140 && o.x < 840 && o.y > 140 && o.y < 630, `${o.t} liegt im Raum`);
    assert.ok(Math.hypot(o.x - door.x, o.y - door.y) > 50, `${o.t} steht nicht vor der Tür`);
    for (const q of solid) if (q !== o) assert.ok(!inRects([{ x: o.x, y: o.y, hw: size(o.t)[0] / 2 - 4, hh: size(o.t)[1] / 2 - 4, rot: o.rot }], q.x, q.y), `${q.t} steckt in ${o.t}`);
  }
  // jedes Thema liefert etwas; ohne Wände bleiben Wandstücke weg; Kreisraum geht auch
  for (const k of Object.keys(THEMES)) assert.ok(furnish(room, k, 1, ctx).length >= 3, k);
  assert.equal(furnish(room, 'tavern', 5, { ...ctx, isWall: () => false }).filter((o) => o.t === 'bar').length, 0);
  assert.ok(furnish({ id: 'c', k: 'circle', cx: 500, cy: 500, r: 245 }, 'storage', 2, ctx).length >= 4);
  assert.deepEqual(furnish(room, 'gibtsnicht', 1, ctx), []);
});

test('Graben um den Mauerring: geschlossene Linie in gleichem Abstand außen herum', async () => {
  const { ringAround } = await import('../public/js/mb-geom.js');
  const sq = [[0, 0, 400, 0], [400, 0, 400, 300], [400, 300, 0, 300], [0, 300, 0, 0]].map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2 }));
  const ring = ringAround(sq, sq[2], 50);
  assert.ok(ring && ring.length >= 12);
  assert.deepEqual(ring[0], ring[ring.length - 1], 'die Linie schließt sich');
  // alle Punkte liegen außerhalb, 50 px von der Mauer entfernt (an den Ecken etwas mehr)
  for (const [x, y] of ring) {
    const d = Math.max(-x, x - 400, -y, y - 300);
    assert.ok(d >= 49 && d <= 51, `Abstand ${d}`);
  }
  assert.equal(ringAround(sq.slice(0, 3), sq[0], 50), null);
});

test('Raum einrichten: nichts steht quer durch eine Innenwand', async () => {
  const { furnish, THEMES } = await import('../public/js/mb-themes.js');
  const { inRects } = await import('../public/js/mb-geom.js');
  const room = { id: 'r', k: 'rect', x: 0, y: 0, w: 700, h: 560 };
  const size = () => [70, 50];
  const wall = [350, 0, 350, 560, 4];
  for (const theme of Object.keys(THEMES)) {
    for (let seed = 1; seed <= 6; seed++) {
      for (const o of furnish(room, theme, seed, { size, walls: [wall] })) {
        const box = [{ x: o.x, y: o.y, hw: 35, hh: 25, rot: o.rot }];
        for (let y = 0; y <= 560; y += 10) assert.ok(!inRects(box, 350, y), `${theme}: ${o.t} bei ${o.x}|${o.y} steht auf der Innenwand`);
      }
    }
  }
});

test('Universal-VTT: Farbe mit Raute, kaputte Züge, Hindernisse bilden keine Räume, Base64 in Stücken', async () => {
  const { parseUvtt, base64Bytes } = await import('../public/js/uvtt.js');
  const base = { resolution: { map_origin: { x: 2, y: 1 }, map_size: { x: 8, y: 6 }, pixels_per_grid: 50 }, image: '/9j/4AAQ' };
  const u = parseUvtt({ ...base,
    line_of_sight: [[{ x: 3, y: 2 }, { x: 9, y: 2 }, { x: 9, y: 6 }, { x: 3, y: 6 }, { x: 3, y: 2 }], [null, { x: 1, y: 1 }]],
    objects_line_of_sight: [[{ x: 5, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 3 }]],
    lights: [{ position: { x: 4, y: 3 }, range: 4, color: '#ff8800' }] });
  assert.equal(u.image.mime, 'image/jpeg');
  assert.deepEqual(u.walls[0], [50, 50, 350, 50], 'Ursprung der Karte wird abgezogen');
  assert.equal(u.walls.length, 8, 'vier Wände, vier Kanten der Säule; der kaputte Zug fehlt');
  assert.equal(Object.values(u.lights)[0].color, '#ff8800');
  assert.equal(u.zones.length, 1, 'die Säule ist kein eigener Raum');
  assert.deepEqual([...base64Bytes('SGFsbG8gV2VsdA==')], [...Buffer.from('Hallo Welt')]);
});

test('Häuserviertel: die Zeilen hinter der Front übernehmen die Richtung ihrer Straße', async () => {
  const { scatterHouses } = await import('../public/js/mb-geom.js');
  const fill = { id: 'h', kind: 'houses', seed: 11, density: 1, angle: 0, shape: { k: 'rect', x: 0, y: 0, w: 1800, h: 1400 } };
  // Straße schräg durch das Viertel (30°)
  const a = (30 * Math.PI) / 180;
  const street = { pts: [[100, 200], [100 + Math.cos(a) * 1700, 200 + Math.sin(a) * 1700]], r: 26 };
  const dist = (o) => Math.abs(-Math.sin(a) * (o.x - 100) + Math.cos(a) * (o.y - 200));
  const all = scatterHouses(fill, (x, y, r, t, foot) => foot.some(([px, py]) => dist({ x: px, y: py }) < 25), [street]);
  const near = all.filter((o) => dist(o) < 330);
  assert.ok(near.length > 30, `${near.length} Häuser nahe der Straße`);
  // gleiche Richtung wie die Straße (Giebelhäuser stehen quer dazu), nicht die des Viertels (0°)
  const off = (o) => Math.abs(((((o.rot - 30) % 90) + 135) % 90) - 45);
  const aligned = near.filter((o) => off(o) <= 4);
  assert.ok(aligned.length >= near.length * 0.97, `${aligned.length} von ${near.length} ausgerichtet`);
  // mehr als nur die Front: auch eine zweite Zeile steht da
  assert.ok(near.some((o) => dist(o) > 150));
  assert.deepEqual(all, scatterHouses(fill, (x, y, r, t, foot) => foot.some(([px, py]) => dist({ x: px, y: py }) < 25), [street]));
});

test('Holzwände: nur die Außenwand eines Raums mit Holzwänden zählt, offene Räume nicht', async () => {
  const { isTimberWall } = await import('../public/js/mb-geom.js');
  const rooms = [
    { id: 'a', k: 'rect', x: 0, y: 0, w: 280, h: 210, timber: true },
    { id: 'b', k: 'rect', x: 280, y: 0, w: 210, h: 210 },
    { id: 'c', k: 'circle', cx: 700, cy: 100, r: 105, timber: true },
    { id: 'd', k: 'rect', x: 0, y: 400, w: 140, h: 140, timber: true, open: true },
  ];
  assert.equal(isTimberWall(rooms, 140, 0), true);
  assert.equal(isTimberWall(rooms, 0, 100), true);
  assert.equal(isTimberWall(rooms, 400, 0), false);
  assert.equal(isTimberWall(rooms, 140, 100), false); // mitten im Raum
  assert.equal(isTimberWall(rooms, 805, 100), true); // Rundbau
  assert.equal(isTimberWall(rooms, 70, 400), false); // offener Raum hat keine Wand
});

test('Häuserviertel: handgemalte Straßen (ein Punkt alle paar Pixel) bremsen nicht, entartete stören nicht', async () => {
  const { scatterHouses } = await import('../public/js/mb-geom.js');
  const fill = { id: 'h', kind: 'houses', seed: 5, density: 1, angle: 0, shape: { k: 'rect', x: 0, y: 0, w: 2100, h: 1400 } };
  // zehn gemalte Straßen mit leichtem Zittern, dazu eine weit entfernte und eine aus zwei gleichen Punkten
  const streets = [];
  for (let k = 0; k < 10; k++) {
    const pts = [];
    for (let x = -200; x <= 2300; x += 7) pts.push(k % 2 ? [150 + k * 200 + Math.sin(x / 90) * 6, x] : [x, 100 + k * 140 + Math.sin(x / 70) * 6]);
    streets.push({ pts, r: 24 });
  }
  streets.push({ pts: [[9000, 9000], [9900, 9000]], r: 24 }, { pts: [[500, 500], [500, 500]], r: 24 });
  const t0 = Date.now();
  const a = scatterHouses(fill, () => false, streets);
  const ms = Date.now() - t0;
  assert.ok(a.length > 100, `${a.length} Häuser`);
  assert.ok(ms < 2500, `${ms} ms`);
});

test('Radierte Straßenstücke zählen nicht mehr als Straße; in den Höfen eines Viertels wachsen Bäume', async () => {
  const { cutStreets, scatterHouses } = await import('../public/js/mb-geom.js');
  const road = { pts: [[0, 300], [1400, 300]], r: 26 };
  // ohne Radierer bleibt die Straße ganz
  assert.deepEqual(cutStreets([road]), [{ pts: road.pts, r: 26 }]);
  // ein Radierstrich quer über die Mitte trennt sie in zwei Stücke; ein früherer Radierstrich zählt nicht
  const cut = cutStreets([{ pts: [[100, 300], [200, 300]], r: 40, sub: true }, road, { pts: [[700, 200], [700, 400]], r: 60, sub: true }]);
  assert.equal(cut.length, 2);
  assert.ok(cut[0].pts.every(([x]) => x < 645) && cut[1].pts.every(([x]) => x > 755));
  assert.ok(cut[0].pts[0][0] === 0 && cut[1].pts.at(-1)[0] > 1380);
  // ganz wegradiert: nichts übrig
  assert.deepEqual(cutStreets([road, { pts: [[0, 300], [1400, 300]], r: 30, sub: true }]), []);
  // Bäume nur auf Wunsch, nie in einem Haus, und nur zwischen Häusern
  const fill = { id: 'h', kind: 'houses', seed: 9, density: 1, angle: 0, shape: { k: 'rect', x: 0, y: 0, w: 1400, h: 900 } };
  const plain = scatterHouses(fill, () => false, [road]);
  assert.ok(plain.every((o) => o.t === 'townHouse'));
  const green = scatterHouses(fill, () => false, [road], { tree: 0.4 });
  const trees = green.filter((o) => o.t === 'tree' || o.t === 'bush');
  const houses = green.filter((o) => o.t === 'townHouse');
  assert.equal(trees.length + houses.length, green.length);
  assert.deepEqual(houses.map((o) => [o.x, o.y, o.rot]), plain.map((o) => [o.x, o.y, o.rot]));
  assert.ok(trees.length > 3, `${trees.length} Bäume`);
  for (const t of trees) {
    assert.ok(t.fill === 'h' && t.s > 0.15 && t.s < 0.6);
    assert.ok(houses.some((o) => Math.hypot(o.x - t.x, o.y - t.y) < 150));
    assert.ok(!houses.some((o) => Math.hypot(o.x - t.x, o.y - t.y) < 20), 'Baum steht in einem Haus');
  }
});

test('Obergeschosse: werden beim Prüfen einer fremden Szene mitgenommen und bekommen eigene Kennungen', async () => {
  const { cleanScene, freshIds } = await import('../public/js/mb-geom.js');
  const raw = {
    cols: 20, rows: 12, biome: 'meadow', seed: 3,
    rooms: [{ id: 'a', k: 'rect', x: 0, y: 0, w: 280, h: 210 }],
    objects: [{ id: 'o1', t: 'bed', x: 50, y: 50, theme: 'a' }],
    uppers: [
      {
        rooms: [{ id: 'u', k: 'rect', x: 0, y: 0, w: 140, h: 140 }],
        objects: [{ id: 'o2', t: 'chest', x: 40, y: 40, theme: 'u', fill: 'weg' }, { id: 'o3', t: 'gibtsnicht', x: 1, y: 1 }, null],
        walls: 'kaputt',
        water: [{ pts: [[0, 0]], r: 40 }],
      },
      { rooms: [] },
      { rooms: [{ id: 'u', k: 'circle', cx: 70, cy: 70, r: 70 }], objects: [{ id: 'o2', t: 'bed', x: 60, y: 60, theme: 'u' }] },
      { rooms: [] },
      'unsinn',
    ],
  };
  const s = cleanScene(raw, (t) => t !== 'gibtsnicht');
  // die leeren Stockwerke ganz oben fallen weg, das leere dazwischen bleibt (sonst rutschte das dritte nach unten)
  assert.equal(s.uppers.length, 3);
  assert.deepEqual(Object.keys(s.uppers[0]).sort(), ['labels', 'objects', 'openings', 'rooms', 'walls']);
  assert.equal(s.uppers[0].objects.length, 1);
  assert.deepEqual(s.uppers[0].walls, []);
  let n = 0;
  freshIds(s, () => `n${++n}`, () => 0.5);
  assert.equal(s.uppers[0].objects[0].theme, s.uppers[0].rooms[0].id);
  assert.equal(s.uppers[0].objects[0].fill, undefined);
  assert.equal(s.uppers[2].objects[0].theme, s.uppers[2].rooms[0].id);
  assert.equal(s.objects[0].theme, s.rooms[0].id);
  // alle Kennungen verschieden, auch über die Stockwerke hinweg
  const ids = [...s.rooms, ...s.objects, ...s.uppers.flatMap((u) => [...u.rooms, ...u.objects])].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  // ein einzelnes „upper“ älterer Stände zählt als erstes Obergeschoss; nur Leeres fällt ganz weg
  const old = cleanScene({ cols: 10, rows: 10, upper: { rooms: [{ id: 'x', k: 'rect', x: 0, y: 0, w: 70, h: 70 }] } });
  assert.equal(old.upper, undefined);
  assert.equal(old.uppers.length, 1);
  assert.equal(cleanScene({ cols: 10, rows: 10, uppers: [{ rooms: [], objects: [] }] }).uppers, undefined);
  assert.equal(cleanScene({ cols: 10, rows: 10, upper: 'x', uppers: 7 }).uppers, undefined);
  // Untergeschosse: dazu Höhlenboden; leere am unteren Ende fallen weg
  const deep = cleanScene({ cols: 10, rows: 10, lowers: [{ rooms: [{ id: 'k', k: 'rect', x: 0, y: 0, w: 70, h: 70 }], objects: [{ id: 'f', t: 'barrel', x: 5, y: 5, theme: 'k' }] }, { cave: [{ pts: [[1, 1]], r: 60 }] }, { rooms: [] }] });
  assert.equal(deep.lowers.length, 2);
  assert.deepEqual(Object.keys(deep.lowers[0]).sort(), ['cave', 'labels', 'objects', 'openings', 'rooms', 'walls']);
  assert.equal(deep.lowers[1].cave.length, 1);
  let m = 0;
  freshIds(deep, () => `d${++m}`, () => 0.5);
  assert.equal(deep.lowers[0].objects[0].theme, deep.lowers[0].rooms[0].id);
  assert.equal(cleanScene({ cols: 10, rows: 10, lowers: [{}] }).lowers, undefined);
});

test('Bauplan → Szene: Räume im Raster, Trennwand und Tür zwischen Nachbarn, jeder Raum erreichbar', async () => {
  const { planToScene } = await import('../public/js/mb-plan.js');
  const { nearestWall, buildingOutline } = await import('../public/js/mb-geom.js');
  let n = 0;
  const o = { known: (t) => ['well', 'tree', 'bed'].includes(t), sized: (t) => t === 'tree', floors: ['wood', 'stone'], themes: ['tavern', 'kitchen'], uid: () => `i${++n}`, seed: 5 };
  const plan = {
    biome: 'meadow', cols: 24, rows: 16,
    rooms: [
      { id: 'hall', x: 4, y: 3, w: 8, h: 6, floor: 'wood', theme: 'tavern' },
      { id: 'kitchen', x: 12, y: 3, w: 4, h: 6, floor: 'stone', theme: 'kitchen' },
      { id: 'store', x: 12.2, y: 9, w: 4, h: 3, theme: 'gibtsnicht', furniture: [{ t: 'bed', n: 2, at: 'wall' }, { t: 'drache', n: 1 }] },
      { id: 'shed', x: 19, y: 11, w: 3, h: 3 },
    ],
    doors: [{ room: 'hall', side: 's', pos: 0.5 }, { between: ['hall', 'kitchen'] }, { room: 'hall', side: 'x' }, { room: 'nix', side: 'n' }],
    windows: [{ room: 'hall', side: 'n', pos: 0.3 }, { room: 'hall', side: 'e', pos: 0.5 }],
    water: [{ points: [[0, 14], [10, 15], [24, 14]], width: 2 }],
    paths: [{ points: [[8, 9], [8, 16]] }, { points: [[1, 1]] }],
    areas: [{ x: 0, y: 0, w: 4, h: 5, kind: 'trees' }, { x: 18, y: 0, w: 5, h: 4, kind: 'houses' }],
    objects: [{ t: 'well', x: 18, y: 8 }, { t: 'tree', x: 2, y: 9 }, { t: 'ufo', x: 3, y: 3 }, { t: 'well', x: 99, y: 99 }],
    labels: [{ text: 'Zum Eber', x: 8, y: 2 }, { text: '' }],
  };
  const { scene, rooms } = planToScene(plan, o);
  assert.equal(scene.cols, 24);
  assert.equal(scene.rooms.length, 4);
  // auf halbe Felder gerastet
  assert.ok(scene.rooms.every((r) => r.x % 35 === 0 && r.y % 35 === 0 && r.w % 35 === 0));
  // Trennwände: Halle–Küche (senkrecht), Küche–Lager (waagerecht)
  assert.equal(scene.walls.length, 2);
  assert.ok(scene.walls.some((w) => w.x1 === w.x2 && w.x1 === 840 && w.y1 === 210 && w.y2 === 630));
  // jede Tür und jedes Fenster sitzt auf einer Wand
  const outline = buildingOutline(scene.rooms);
  for (const d of scene.openings) assert.ok(nearestWall(outline, scene.walls, d.x, d.y).d < 4, `Öffnung ${d.k} bei ${d.x},${d.y} sitzt nicht auf einer Wand`);
  const doors = scene.openings.filter((d) => d.k === 'door');
  // Halle nach draußen, Halle–Küche, nachgebessert: Küche–Lager und der einzeln stehende Schuppen
  assert.equal(doors.length, 4);
  assert.ok(doors.some((d) => d.y === 630 && d.x > 280 && d.x < 840 && d.a === 0));
  assert.ok(doors.some((d) => d.x === 840 && d.a === 1.571));
  // das Fenster in der Wand zur Küche fällt weg (dort ist innen), das nach Norden bleibt
  assert.equal(scene.openings.filter((d) => d.k === 'window').length, 1);
  // Einrichtung: Themen und die eigene Liste (Unbekanntes fällt heraus)
  assert.deepEqual(rooms.map((r) => [r.theme, !!r.def]), [['tavern', false], ['kitchen', false], [null, true]]);
  assert.deepEqual(rooms[2].def.wall, [['bed', 0, { fix: 2 }]]);
  assert.equal(scene.water.length, 1);
  assert.equal(scene.paths.length, 1);
  // Häuser nur auf Übersichtskarten
  assert.deepEqual(scene.fills.filter((f) => !f.edge).map((f) => f.kind), ['trees']);
  assert.deepEqual(scene.objects.map((q) => q.t), ['well', 'tree']);
  assert.equal(scene.labels.length, 1);
  // Unsinn stört nicht
  assert.equal(planToScene(null, o).scene.rooms.length, 0);
  assert.equal(planToScene({ rooms: 'x', doors: [null, 3], cols: 'breit', biome: 'mond' }, o).scene.biome, 'meadow');
});

test('KI-Einrichtung: Stellplatz nach Gegenstand, Sitze an Tische, Menge nach Raumgröße', async () => {
  const { themeFromPlan } = await import('../public/js/mb-plan.js');
  const { furnish } = await import('../public/js/mb-themes.js');
  const def = themeFromPlan([
    { t: 'barrel', n: 3, at: 'center' }, // Fässer gehören in die Ecke, auch wenn die KI „Mitte“ sagt
    { t: 'shelf', n: 2 }, // ohne Angabe: an die Wand
    { t: 'chest', n: 1, at: 'wall' }, // passt beides – der Wunsch zählt
    { t: 'rug', n: 1, at: 'center' },
    { t: 'tableRound', n: 2 }, // bekommt die einzeln genannten Hocker
    { t: 'stool', n: 6 },
    { t: 'tableSquare', n: 1 }, // ohne Sitze: die üblichen Stühle
    { t: 'barrel', n: 2, at: 'corner' }, // gleiche Stücke werden zusammengefasst
  ]);
  assert.equal(def.custom, true);
  assert.deepEqual(def.corner, [['barrel', 0, { fix: 5 }]]);
  assert.deepEqual(def.wall.map((e) => e[0]), ['shelf', 'chest']);
  assert.deepEqual(def.rug.map((e) => e[0]), ['rug']);
  assert.deepEqual(def.center.map((e) => [e[0], e[2].with]), [['tableRound', ['stool', 3]], ['tableSquare', ['chair', 2]]]);
  // nur Hocker, kein Tisch: nichts Verwertbares
  assert.equal(themeFromPlan([{ t: 'stool', n: 4 }]), null);
  // zu viel für einen kleinen Raum (4×4 Felder): anteilig weniger, jedes Stück mindestens einmal
  const room = { id: 'r', k: 'rect', x: 0, y: 0, w: 280, h: 280 };
  const big = themeFromPlan([{ t: 'crate', n: 12 }, { t: 'sack', n: 12 }, { t: 'shelf', n: 6 }, { t: 'anvil', n: 1 }]);
  const made = furnish(room, big, 3, { size: () => [40, 40] });
  assert.ok(made.length <= 8, `${made.length} Stücke in 16 Feldern`);
  assert.ok(made.some((o) => o.t === 'anvil'));
});

test('Raum einrichten: gleiche Stücke in der Mitte stehen in Reihen und gleich ausgerichtet', async () => {
  const { furnish } = await import('../public/js/mb-themes.js');
  const room = { id: 'r', k: 'rect', x: 0, y: 0, w: 840, h: 560 };
  const SIZE = { pew: [150, 34], altar: [120, 60], lectern: [40, 40] };
  for (let seed = 1; seed <= 5; seed++) {
    const pews = furnish(room, 'chapel', seed, { size: (t) => SIZE[t] || [50, 50] }).filter((o) => o.t === 'pew');
    assert.ok(pews.length >= 2);
    assert.equal(new Set(pews.map((o) => o.rot)).size, 1, 'alle Bänke gleich gedreht');
    // die Bänke teilen sich wenige Zeilen bzw. Spalten statt kreuz und quer zu liegen
    assert.ok(new Set(pews.map((o) => o.y)).size <= Math.ceil(pews.length / 2) || new Set(pews.map((o) => o.x)).size <= Math.ceil(pews.length / 2), `Bänke ungeordnet (Startwert ${seed})`);
  }
});

test('Bauplan: Gegenstände im Raum gehören zur Einrichtung, Möbel nicht ins Freie, Abstand zur Außenwand', async () => {
  const { planToScene } = await import('../public/js/mb-plan.js');
  let n = 0;
  const o = { known: () => true, indoor: (t) => t !== 'well', floors: ['wood'], themes: ['tavern'], uid: () => `i${++n}`, seed: 1 };
  const { scene, rooms } = planToScene({
    cols: 24, rows: 16,
    rooms: [{ id: 'a', x: 4, y: 4, w: 6, h: 5 }, { id: 'b', x: 14, y: 4, w: 6, h: 5, theme: 'tavern' }],
    objects: [{ t: 'barrel', x: 6, y: 6 }, { t: 'well', x: 7, y: 7 }, { t: 'crate', x: 16, y: 6 }, { t: 'bed', x: 2, y: 13 }, { t: 'barrel', x: 10.3, y: 6 }],
  }, o);
  // Fass in Raum a wird Teil der Einrichtung (Ecke); der Brunnen im Raum fällt weg; Raum b behält sein Thema
  assert.deepEqual(rooms.map((r) => [r.theme, r.def?.corner?.[0]?.[0] ?? null]), [[null, 'barrel'], ['tavern', null]]);
  // draußen: kein Bett; das Fass dicht an der Ostwand von a rückt nach außen ab
  assert.deepEqual(scene.objects.map((q) => q.t), ['barrel']);
  assert.ok(scene.objects[0].x >= 700 + 40);
});

test('Bauplan: Räume ohne Überlappung, schmale Lücken geschlossen', async () => {
  const { tidyRooms } = await import('../public/js/mb-plan.js');
  const r = tidyRooms([{ id: 'a', x: 4, y: 8, w: 4, h: 4 }, { id: 'b', x: 9, y: 8, w: 4, h: 4 }, { id: 'c', x: 15, y: 1, w: 5, h: 4 }, { id: 'd', x: 16, y: 4, w: 5, h: 6 }], 30, 20);
  const by = Object.fromEntries(r.map((q) => [q.id, q]));
  assert.equal(by.a.x + by.a.w, by.b.x, 'Lücke von einem Feld geschlossen');
  for (let i = 0; i < r.length; i++) {
    for (let j = i + 1; j < r.length; j++) {
      const [p, q] = [r[i], r[j]];
      const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
      const oy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
      assert.ok(ox <= 0 || oy <= 0, `${p.id} und ${q.id} überlappen`);
    }
  }
  assert.ok(by.d.h >= 4, 'die Gruft bleibt brauchbar groß');
});

test('Bauplan draußen: Fluss bis zum Rand, Brücke quer darüber mit Weg, lose Wege zum Rand, Steinkreis', async () => {
  const { planToScene } = await import('../public/js/mb-plan.js');
  let n = 0;
  const o = { known: () => true, floors: ['wood'], themes: [], uid: () => `i${++n}`, seed: 3 };
  const { scene } = planToScene({
    cols: 40, rows: 30,
    water: [{ points: [[20, 6], [21, 15], [20, 24]], width: 3 }],
    paths: [{ points: [[30, 15], [26, 17]] }],
    areas: [{ x: 0, y: 0, w: 6, h: 30, kind: 'trees' }],
    objects: [{ t: 'bridge', x: 18, y: 12 }, ...[[32, 6], [38, 12], [33, 14], [36, 7], [31, 10]].map(([x, y]) => ({ t: 'runestone', x, y }))],
  }, o);
  const w = scene.water[0].pts;
  assert.ok(Math.min(...w.map((q) => q[1])) < 0 && Math.max(...w.map((q) => q[1])) > 30 * 70, 'der Fluss läuft über beide Ränder');
  const bridge = scene.objects.find((q) => q.t === 'bridge');
  const onWater = Math.min(...w.map(([x, y]) => Math.hypot(x - bridge.x, y - bridge.y)));
  assert.ok(onWater < 40, `Brücke liegt auf dem Wasser (${onWater} px daneben)`);
  assert.ok(Math.abs(bridge.rot - 90) < 50, `Brücke quer zum Fluss (${bridge.rot})`);
  // der Fluss schlängelt sich: quer zur Laufrichtung mindestens zwei Felder Spielraum
  const xs0 = w.filter(([, y]) => y > 0 && y < 30 * 70).map(([x]) => x);
  assert.ok(Math.max(...xs0) - Math.min(...xs0) > 140, 'Fluss mäandert');
  assert.equal(scene.paths.length, 2, 'Weg über die Brücke kommt dazu');
  // jeder Weg endet am Rand oder an einem anderen Weg
  const across = scene.paths.find((q) => q.pts.some(([x, y]) => Math.hypot(x - bridge.x, y - bridge.y) < 40));
  const xs = across.pts.map((q) => q[0]);
  assert.ok(Math.min(...xs) <= 0 && Math.max(...xs) >= 40 * 70, `Weg über die Brücke von Rand zu Rand (${Math.min(...xs)}…${Math.max(...xs)})`);
  // Steinkreis: alle gleich weit von der Mitte
  const st = scene.objects.filter((q) => q.t === 'runestone');
  const cx = st.reduce((a, q) => a + q.x, 0) / st.length;
  const cy = st.reduce((a, q) => a + q.y, 0) / st.length;
  const ds = st.map((q) => Math.hypot(q.x - cx, q.y - cy));
  assert.ok(Math.max(...ds) - Math.min(...ds) < 4, 'Steine auf einem Kreis');
  // Saum an den drei Rändern ohne Bäume
  assert.equal(scene.fills.filter((f) => f.edge).length, 3);
});

test('Bauplan draußen: Bodenzonen, Füllbereiche bringen ihren Boden mit, Sumpf', async () => {
  const { planToScene } = await import('../public/js/mb-plan.js');
  let n = 0;
  const o = { known: () => true, floors: ['wood'], themes: [], uid: () => `i${++n}`, seed: 2 };
  const { scene } = planToScene({
    cols: 30, rows: 20,
    grounds: [{ kind: 'gravel', points: [[22, 2], [23, 18]], width: 8 }, { kind: 'gloom', points: [[25, 10]], width: 10 }, { kind: 'lava', points: [[1, 1]] }],
    areas: [{ x: 20, y: 4, w: 8, h: 10, kind: 'ruins' }, { x: 2, y: 12, w: 6, h: 5, kind: 'swamp' }],
  }, o);
  const kinds = scene.grounds.filter((g) => !g.edge).map((g) => g.g);
  assert.ok(kinds.includes('gravel') && kinds.includes('gloom'), 'genannte Bodenzonen');
  assert.ok(!kinds.includes('lava'), 'Unbekanntes fällt weg');
  assert.ok(kinds.includes('ruin'), 'die Ruine bringt ihren Plattenboden mit');
  assert.ok(kinds.includes('mud'), 'der Sumpf bringt Morast mit');
  assert.equal(kinds.filter((k) => k === 'gravel').length, 1, 'Geröll war schon da und kommt nicht doppelt');
  assert.deepEqual(scene.fills.filter((f) => !f.edge && !f.cover).map((f) => f.kind), ['ruins', 'swamp']);
  assert.equal(planToScene({ biome: 'swamp', cols: 20, rows: 14 }, o).scene.biome, 'swamp');
});

test('Bauplan unter der Erde: Gang nach draußen im Dungeon, Kavernen mit Gängen in der Höhle', async () => {
  const { planToScene } = await import('../public/js/mb-plan.js');
  let n = 0;
  const o = { known: () => true, floors: ['wood', 'stone'], themes: ['crypt'], uid: () => `i${++n}`, seed: 2 };
  const d = planToScene({ biome: 'dungeon', cols: 30, rows: 20, rooms: [{ id: 'a', x: 4, y: 4, w: 6, h: 5 }, { id: 'gang', x: 10, y: 5, w: 6, h: 2 }, { id: 'b', x: 16, y: 3, w: 6, h: 6 }, { id: 'c', x: 22, y: 14, w: 4, h: 4 }], doors: [{ room: 'a', side: 'w' }], windows: [{ room: 'a', side: 'n' }], water: [{ points: [[1, 1]], width: 4 }] }, o).scene;
  assert.equal(d.rooms.length, 4);
  assert.ok(d.rooms.every((r) => r.floor === 'stone'));
  assert.equal(d.walls.length, 2);
  assert.equal(d.openings.filter((q) => q.k === 'window').length, 0);
  assert.equal(d.water.length, 0);
  // Tür nach draußen bekommt einen Gang im Fels; der abgelegene Raum c auch
  assert.ok(d.cave.length >= 2);
  assert.ok(d.openings.length >= 4);
  const c = planToScene({ biome: 'cave', rooms: [{ id: 'a', x: 2, y: 2, w: 8, h: 5 }, { id: 'b', x: 16, y: 3, w: 5, h: 5 }, { id: 'c', x: 8, y: 12, w: 6, h: 4 }], links: [['a', 'b']] }, o).scene;
  assert.equal(c.rooms.length, 0);
  // drei Kavernen, ein gewünschter Gang, ein nachgebesserter zur dritten
  assert.equal(c.cave.length, 5);
  assert.equal(c.openings.length, 0);
});

test('Stockwerke: gezeigt wird das gewählte; Änderungen und Figuren gehören zum jeweiligen Stockwerk', async () => {
  const { floorMap, floorPath, hasFloors, upperCount, lowerCount, shownFloor, floorList, floorLabel, tokenFloor } = await import('../public/js/floors.js');
  const map = {
    id: 'm', assetId: 'unten', width: 700, grid: { size: 70 }, anim: { trees: [] },
    tokens: { a: { id: 'a', x: 1 }, b: { id: 'b', f: 1 }, c: { id: 'c', f: -1 }, d: { id: 'd', f: 7 } },
    doors: { a: { id: 'a' } }, walls: [[0, 0, 1, 1]], fog: { enabled: true, ops: [1] }, lighting: { enabled: false },
  };
  // ohne weitere Stockwerke: die Karte selbst, alle Figuren
  assert.equal(floorMap(map), map);
  assert.equal(floorMap(null), null);
  assert.equal(hasFloors(map), false);
  map.floor = 1;
  assert.equal(floorMap(map), map, 'ohne Obergeschoss bleibt es beim Erdgeschoss');
  assert.deepEqual(floorPath(map, 'm', ['doors', 'a']), ['maps', 'm', 'doors', 'a']);
  map.floor = 0;
  map.uppers = [
    { assetId: 'oben1', doors: { b: { id: 'b' } }, walls: [], fog: { enabled: false, ops: [] }, lighting: { enabled: false } },
    { assetId: 'oben2', doors: {}, walls: [[1, 1, 2, 2]] },
  ];
  map.lowers = [{ assetId: 'keller', doors: { k: { id: 'k' } }, lighting: { enabled: true, ambient: 0.12 }, fog: { enabled: true, ops: [] } }];
  assert.deepEqual([upperCount(map), lowerCount(map)], [2, 1]);
  assert.deepEqual(floorList(map), [-1, 0, 1, 2]);
  const t = (k, o) => `${k}${o?.n ?? ''}`;
  assert.deepEqual(floorList(map).map((f) => floorLabel(f, 2, 1, t)), ['Untergeschoss', 'Erdgeschoss', '{n}. Obergeschoss1', '{n}. Obergeschoss2']);
  assert.equal(floorLabel(-2, 1, 3, t), '{n}. Untergeschoss2');
  assert.equal(floorLabel(1, 1, 0, t), 'Obergeschoss');
  // Erdgeschoss: eigene Daten, nur die Figuren des Erdgeschosses
  const v = floorMap(map);
  assert.notEqual(v, map);
  assert.equal(v.assetId, 'unten');
  assert.equal(v.anim, map.anim);
  assert.deepEqual(Object.keys(v.tokens), ['a']);
  assert.deepEqual(floorPath(map, 'm', ['fog', 'ops']), ['maps', 'm', 'fog', 'ops']);
  // erstes Obergeschoss
  map.floor = 1;
  assert.equal(floorMap(map), v, 'dieselbe Sicht, solange es dieselbe Karte ist');
  assert.equal(v.assetId, 'oben1');
  assert.deepEqual(Object.keys(v.doors), ['b']);
  assert.deepEqual(v.fog, { enabled: false, ops: [] });
  assert.equal(v.zones, undefined);
  assert.equal(v.anim, null);
  assert.deepEqual(Object.keys(v.tokens), ['b']);
  // geteilt: Raster und Kennung
  assert.equal(v.id, 'm');
  assert.equal(v.grid.size, 70);
  // die Sicht liest frisch: der Zustand wird an Ort und Stelle geändert
  map.uppers[0].doors.c = { id: 'c' };
  assert.deepEqual(Object.keys(v.doors), ['b', 'c']);
  map.tokens.a.f = 1;
  assert.deepEqual(Object.keys(v.tokens), ['a', 'b']);
  assert.deepEqual(floorPath(map, 'm', ['doors', 'b', 'open']), ['maps', 'm', 'uppers', 0, 'doors', 'b', 'open']);
  assert.deepEqual(floorPath(map, 'm', ['lighting']), ['maps', 'm', 'uppers', 0, 'lighting']);
  assert.deepEqual(floorPath(map, 'm', ['tokens', 'a']), ['maps', 'm', 'tokens', 'a']);
  assert.deepEqual(floorPath(map, 'm', ['grid']), ['maps', 'm', 'grid']);
  // zweites Obergeschoss: ohne eigenen Nebel ein leerer, ohne eigene Beleuchtung die des Erdgeschosses; eine Figur mit
  // einem Stockwerk, das es nicht gibt, steht im obersten
  map.floor = 2;
  assert.equal(v.assetId, 'oben2');
  assert.deepEqual(v.fog.ops, []);
  assert.equal(v.lighting, map.lighting);
  assert.equal(tokenFloor(map, map.tokens.d), 2);
  assert.deepEqual(Object.keys(v.tokens), ['d']);
  assert.deepEqual(floorPath(map, 'm', ['fog', 'ops']), ['maps', 'm', 'uppers', 1, 'fog', 'ops']);
  map.floor = 9;
  assert.equal(shownFloor(map), 2);
  // Untergeschoss
  map.floor = -1;
  assert.equal(v.assetId, 'keller');
  assert.deepEqual(Object.keys(v.doors), ['k']);
  assert.equal(v.lighting.enabled, true);
  assert.deepEqual(Object.keys(v.tokens), ['c']);
  assert.deepEqual(floorPath(map, 'm', ['doors', 'k']), ['maps', 'm', 'lowers', 0, 'doors', 'k']);
  map.floor = -5;
  assert.equal(shownFloor(map), -1);
});
