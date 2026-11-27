// Gastcode der Regelseite: Ablauf täglich/wöchentlich, Cookie gilt nur bis zum nächsten Code, Fragen-Bremse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-guest-'));
const g = await import('../server/guest.js');

test('Ablauf: täglich um 5 Uhr, wöchentlich montags um 5 Uhr, von Hand nie', () => {
  const at = (s) => new Date(s).getTime();
  // Mittwoch, 25.11.2026, 14 Uhr → Donnerstag 5 Uhr
  const t = at('2026-11-25T14:00:00');
  assert.equal(g.expiresAt({ rotation: 'daily', rotatedAt: t }), at('2026-11-26T05:00:00'));
  // kurz nach Mitternacht → noch am selben Morgen
  assert.equal(g.expiresAt({ rotation: 'daily', rotatedAt: at('2026-11-26T01:30:00') }), at('2026-11-26T05:00:00'));
  assert.equal(g.expiresAt({ rotation: 'weekly', rotatedAt: t }), at('2026-11-30T05:00:00'));
  assert.equal(g.expiresAt({ rotation: 'manual', rotatedAt: t }), null);
});

test('Code prüfen, Cookie gilt bis zum nächsten Code, aus heißt aus', () => {
  const c = g.config();
  assert.match(c.code, /^\d{4}$/);
  assert.equal(g.check(c.code), true);
  assert.equal(g.check('abcd'), false);
  const tok = g.token();
  assert.equal(g.valid(tok), true);
  assert.equal(g.valid(tok.replace(/.$/, (x) => (x === 'A' ? 'B' : 'A'))), false, 'verfälschte Unterschrift');
  g.rotate();
  assert.equal(g.valid(tok), false);
  assert.equal(g.check(c.code), false);
  const tok2 = g.token();
  g.setConfig({ enabled: false });
  assert.equal(g.valid(tok2), false);
  assert.equal(g.check(g.config().code), false);
  g.setConfig({ enabled: true });
  // die Datei ist nur für den Server lesbar (enthält den Schlüssel)
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(process.env.DATA_DIR, 'guest.json')).mode & 0o077, 0);
});

test('Fragen-Bremse: 20 je 10 Minuten', () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 20; i++) assert.equal(g.askAllowed('x', t0 + i), 0);
  assert.ok(g.askAllowed('x', t0 + 100) > 0);
  assert.equal(g.askAllowed('y', t0 + 100), 0, 'andere Geräte unberührt');
  assert.equal(g.askAllowed('x', t0 + 10 * 60_000 + 50), 0, 'nach zehn Minuten wieder frei');
});
