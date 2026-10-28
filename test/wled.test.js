import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradient, stars, toWledList } from '../server/wled-patterns.js';

test('Verlauf: richtige Länge, beginnt mit der ersten Farbe, schließt den Ring nahtlos', () => {
  const g = gradient([[0, 0, 0], [200, 0, 0]], 120, 60);
  assert.equal(g.length, 120);
  assert.deepEqual(g[0], [0, 0, 0]);
  // Letzte LED liegt kurz vor dem Anfang – nah an der ersten Farbe, kein harter Sprung
  const jump = Math.abs(g[119][0] - g[0][0]);
  assert.ok(jump < 30, `Sprung am Ringschluss: ${jump}`);
  // Nachbarn unterscheiden sich nur wenig (weich)
  for (let i = 1; i < g.length; i++) assert.ok(Math.abs(g[i][0] - g[i - 1][0]) <= 15);
});

test('Einfarbig ergibt eine Farbe für alle LEDs und einen einzigen Bereich', () => {
  const g = gradient([[255, 196, 130]], 300);
  assert.deepEqual(toWledList(g), [0, 300, 'FFC482']);
});

test('WLED-Liste: Bereiche und Einzelfarben in der richtigen Reihenfolge', () => {
  assert.deepEqual(toWledList([[255, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [0, 0, 255]]), [0, 2, 'FF0000', '00FF00', 3, 5, '0000FF']);
});

test('Sterne: festes Muster, nur einzelne helle Punkte', () => {
  const base = gradient([[5, 5, 40]], 100);
  const a = stars(base, [200, 210, 255]);
  assert.deepEqual(a, stars(base, [200, 210, 255]));
  const bright = a.filter((c) => c[0] > 80).length;
  assert.ok(bright > 3 && bright < 25, `helle LEDs: ${bright}`);
});

test('Live-Effekte: liefern gültige Farben, ändern sich weich von Bild zu Bild', async () => {
  const { LIVE } = await import('../server/wled-fx.js');
  for (const [key, create] of Object.entries(LIVE)) {
    const frame = create(90);
    let prev = null;
    for (let f = 0; f < 90; f++) {
      const out = frame(f / 30, 1 / 30);
      assert.ok(out.length === 1 || out.length === 90, `${key}: Länge ${out.length}`);
      for (const c of out) for (const v of c) assert.ok(v >= 0 && v <= 255 && Number.isFinite(v), `${key}: Wert ${v}`);
      // Atmen und Pulsieren: keine Sprünge zwischen zwei Bildern
      if (prev && ['pause', 'combat'].includes(key)) assert.ok(Math.abs(out[0][0] - prev[0][0]) < 12, `${key}: Sprung`);
      prev = out;
    }
  }
});
