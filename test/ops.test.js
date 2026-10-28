import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOp, applyOps } from '../shared/ops.js';
import { physicalSize, cellDevicePx, tableCells, DEFAULT_SETTINGS } from '../shared/calibration.js';

test('set/merge/del/push', () => {
  const s = { maps: { a: { tokens: {} } } };
  applyOps(s, [
    { t: 'set', p: ['maps', 'a', 'tokens', 't1'], v: { x: 1, y: 2 } },
    { t: 'merge', p: ['maps', 'a', 'tokens', 't1'], v: { x: 5 } },
    { t: 'push', p: ['maps', 'a', 'fog'], v: [{ m: 1 }, { m: 2 }] },
  ]);
  assert.deepEqual(s.maps.a.tokens.t1, { x: 5, y: 2 });
  assert.equal(s.maps.a.fog.length, 2);
  applyOp(s, { t: 'del', p: ['maps', 'a', 'tokens', 't1'] });
  assert.equal(s.maps.a.tokens.t1, undefined);
});

test('fehlende Zwischenknoten sind No-Ops', () => {
  const s = { maps: {} };
  assert.equal(applyOp(s, { t: 'merge', p: ['maps', 'x', 'tokens', 't'], v: { x: 1 } }), false);
  assert.deepEqual(s, { maps: {} });
});

test('Prototype-Pollution wird abgewiesen', () => {
  const s = {};
  assert.equal(applyOp(s, { t: 'set', p: ['__proto__', 'polluted'], v: true }), false);
  assert.equal({}.polluted, undefined);
});

test('Kalibrierung 55 Zoll 16:9 4K', () => {
  const t = DEFAULT_SETTINGS.table;
  const { widthIn, heightIn } = physicalSize(t);
  assert.ok(Math.abs(widthIn - 47.94) < 0.05);
  assert.ok(Math.abs(heightIn - 26.96) < 0.05);
  assert.ok(Math.abs(cellDevicePx(t) - 80.1) < 0.2);
  const cells = tableCells({ ...t, rotation: 90 });
  assert.ok(cells.w < cells.h);
});

test('Raster aus Spalten und Zeilen', async () => {
  const { gridOf, snapPoint } = await import('../public/js/maprender.js');
  const map = { width: 1400, height: 1000, grid: { cols: 20, rows: 14 } };
  const g = gridOf(map);
  assert.equal(g.sizeX, 70);
  assert.ok(Math.abs(g.sizeY - 1000 / 14) < 1e-9);
  const p = snapPoint(map, 100, 100, 1);
  assert.equal(p.x, 105);
  assert.ok(Math.abs(p.y - 1.5 * g.sizeY) < 1e-9);
});

test('TV-Ausschnitt rastet am Raster ein', async () => {
  const { snapViewCenter } = await import('../public/js/maprender.js');
  const map = { width: 1400, height: 1050, grid: { size: 70, offsetX: 10, offsetY: 0 } };
  // Ausdehnung 47,9 × 27 Felder
  const extW = 47.9 * 70;
  const extH = 27 * 70;
  const c = snapViewCenter(map, 733, 517, extW, extH);
  const left = c.cx - extW / 2;
  const top = c.cy - extH / 2;
  assert.ok(Math.abs(((left - 10) / 70) - Math.round((left - 10) / 70)) < 1e-9);
  assert.ok(Math.abs(top / 70 - Math.round(top / 70)) < 1e-9);
  assert.ok(Math.abs(c.cx - 733) <= 35 && Math.abs(c.cy - 517) <= 35);
});

test('Monitordaten werden geprüft und ergänzt', async () => {
  const { sanitizeTable } = await import('../shared/calibration.js');
  const t = sanitizeTable({ resW: '1920', resH: 1080, diagonalIn: 'abc', rotation: 45, output: 'evil', fineTune: 5 });
  assert.equal(t.resW, 1920);
  assert.equal(t.diagonalIn, 55);
  assert.equal(t.rotation, 0);
  assert.equal(t.output, 'auto');
  assert.equal(t.fineTune, 1);
  assert.equal(sanitizeTable({ output: '1920x1080@60', rotation: '90' }).output, '1920x1080@60');
  assert.equal(sanitizeTable({ rotation: '90' }).rotation, 90);
});
