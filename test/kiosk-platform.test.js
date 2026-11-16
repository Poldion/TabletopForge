// Kiosk-Geräte: Plattform aus dem Heartbeat und passende Update-Pakete (kein Pi-Update auf dem Orange Pi).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-kiosk-'));
const kiosks = await import('../server/kiosks.js');
// Erst aufräumen, wenn das verzögerte Speichern (200 ms) durch ist
after(async () => {
  await new Promise((r) => setTimeout(r, 400));
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

const pkg = { version: '1.0.0', board: 'zero2w' };

test('Buildroot-Pi mit Systemplätzen nimmt Pakete für den Zero 2 W', () => {
  kiosks.heartbeat('pi-br000001', { slot: 'a', platform: { board: 'raspberrypi,model-zero-2-w', os: 'buildroot', updates: 'zero2w' } });
  const k = kiosks.get('pi-br000001');
  assert.deepEqual(k.info.platform, { board: 'raspberrypi,model-zero-2-w', os: 'buildroot', updates: 'zero2w' });
  assert.equal(kiosks.acceptsUpdate(k, pkg), true);
});

test('Orange Pi (Armbian) nimmt kein Pi-Paket', () => {
  kiosks.heartbeat('pi-opi00001', { platform: { board: 'xunlong,orangepi-zero2w', os: 'armbian', updates: null } });
  const k = kiosks.get('pi-opi00001');
  assert.equal(k.info.platform.os, 'armbian');
  assert.equal(kiosks.acceptsUpdate(k, pkg), false);
  assert.equal(kiosks.acceptsUpdate(k, { version: '1.0.0', board: 'orangepi' }), false);
});

test('Raspberry Pi OS ohne Systemplätze nimmt keine Pakete', () => {
  kiosks.heartbeat('pi-ros00001', { platform: { board: 'raspberrypi,4-model-b', os: 'raspios', updates: null } });
  assert.equal(kiosks.acceptsUpdate(kiosks.get('pi-ros00001'), pkg), false);
});

test('älterer Agent ohne Plattform: Systemplätze heißen Buildroot-Pi', () => {
  kiosks.heartbeat('pi-old00001', { slot: 'b' });
  const k = kiosks.get('pi-old00001');
  assert.equal(k.info.platform.updates, 'zero2w');
  assert.equal(kiosks.acceptsUpdate(k, pkg), true);
  kiosks.heartbeat('pi-old00002', {});
  assert.equal(kiosks.acceptsUpdate(kiosks.get('pi-old00002'), pkg), false);
});

test('Leistungsprofil: Pi bis Zero 2 W sparsam, Orange Pi und Pi 4/5 flüssig', () => {
  const k = (board) => ({ info: { platform: { board } } });
  assert.equal(kiosks.performanceFor(k('raspberrypi,model-zero-2-w')), 'low');
  assert.equal(kiosks.performanceFor(k('raspberrypi,3-model-b-plus')), 'low');
  assert.equal(kiosks.performanceFor(k('raspberrypi,model-b-plus')), 'low');
  assert.equal(kiosks.performanceFor(k('raspberrypi,4-model-b')), 'high');
  assert.equal(kiosks.performanceFor(k('raspberrypi,5-model-b')), 'high');
  assert.equal(kiosks.performanceFor(k('xunlong,orangepi-zero2w')), 'high');
  assert.equal(kiosks.performanceFor(k('')), 'low');
  assert.equal(kiosks.performanceFor({}), 'low');
});

test('ungültige Plattform-Angaben werden verworfen', () => {
  kiosks.heartbeat('pi-bad00001', { platform: { board: 'x'.repeat(200), os: 'windows', updates: '../../etc' } });
  const p = kiosks.get('pi-bad00001').info.platform;
  assert.equal(p.board.length, 80);
  assert.equal(p.os, '');
  assert.equal(p.updates, null);
});
