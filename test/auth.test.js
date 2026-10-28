// Anmeldung Ende-zu-Ende: echter Server mit leerem Datenordner, Anfragen wie Browser und Kiosk-Agent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const CODE = 'TEST-CODE';
let server;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-auth-'));
  server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, SETUP_CODE: CODE }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${BASE}/api/version`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('Server startet nicht');
});

after(() => {
  server?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** Anfrage mit optionalem Cookie; liefert Status, JSON und gesetztes Cookie. */
async function req(method, url, { body, cookie, headers = {} } = {}) {
  const res = await fetch(BASE + url, {
    method,
    redirect: 'manual',
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* kein JSON */
  }
  return { status: res.status, json, location: res.headers.get('location'), cookie: set ? set.split(';')[0] : null, setCookie: set };
}

const heartbeat = (id, key) => req('POST', '/api/kiosks/heartbeat', { body: { id, hostname: 'pi' }, headers: key ? { 'x-kiosk-key': key } : {} });

let admin; // Cookie der Admin-Sitzung
let device; // Cookie einer gekoppelten Anzeige
const KIOSK = 'pi-test0001';
const KEY = 'k'.repeat(43);

test('ohne Konto ist alles offen wie bisher', async () => {
  assert.equal((await req('GET', '/api/auth/state')).json.active, false);
  assert.equal((await req('GET', '/api/campaigns')).status, 200);
  assert.equal((await req('GET', '/dm.html')).status, 200);
});

test('Kiosk mit Schlüssel meldet sich schon vor der Einrichtung an', async () => {
  const r = await heartbeat(KIOSK, KEY);
  assert.equal(r.status, 200);
  assert.equal(r.json.pairing, undefined);
});

test('erstes Konto nur mit dem Einrichtungscode', async () => {
  const wrong = await req('POST', '/api/auth/setup', { body: { code: 'FALSCH', name: 'Pold', password: 'geheim123' } });
  assert.equal(wrong.status, 400);
  const short = await req('POST', '/api/auth/setup', { body: { code: CODE, name: 'Pold', password: 'kurz' } });
  assert.equal(short.status, 400);
  const ok = await req('POST', '/api/auth/setup', { body: { code: CODE, name: 'Pold', password: 'geheim123' } });
  assert.equal(ok.status, 200);
  assert.match(ok.setCookie, /HttpOnly/);
  assert.match(ok.setCookie, /SameSite=Lax/);
  admin = ok.cookie;
  const again = await req('POST', '/api/auth/setup', { body: { code: CODE, name: 'Zweiter', password: 'geheim123' } });
  assert.equal(again.status, 400);
});

test('ohne Anmeldung: Seiten leiten um, Schnittstellen und Bilder sind gesperrt', async () => {
  assert.match((await req('GET', '/dm.html?c=x')).location, /^\/login\.html\?next=%2Fdm\.html/);
  assert.match((await req('GET', '/')).location, /^\/login\.html/);
  assert.match((await req('GET', '/table.html?c=x')).location, /^\/pair\.html\?next=/);
  assert.match((await req('GET', '/kiosk.html?id=pi-1')).location, /kiosk=pi-1/);
  assert.equal((await req('GET', '/login.html')).status, 200);
  assert.equal((await req('GET', '/api/campaigns')).status, 401);
  assert.equal((await req('GET', '/api/settings')).status, 401);
  assert.equal((await req('GET', '/files/abc/def.png')).status, 401);
  assert.equal((await req('GET', '/api/version')).status, 200);
  assert.equal((await req('GET', '/js/util.js')).status, 200); // Oberflächen-Code ist frei
});

test('Anmelden, Abmelden, falsches Passwort', async () => {
  assert.equal((await req('POST', '/api/auth/login', { body: { name: 'pold', password: 'falsch' } })).status, 401);
  const r = await req('POST', '/api/auth/login', { body: { name: 'pold', password: 'geheim123' } });
  assert.equal(r.status, 200);
  assert.equal((await req('GET', '/api/campaigns', { cookie: r.cookie })).status, 200);
  await req('POST', '/api/auth/logout', { cookie: r.cookie });
  assert.equal((await req('GET', '/api/campaigns', { cookie: r.cookie })).status, 401);
  assert.equal((await req('GET', '/api/campaigns', { cookie: admin })).status, 200);
});

test('Anfragen von fremden Seiten werden abgelehnt', async () => {
  const r = await req('POST', '/api/campaigns', { cookie: admin, body: { name: 'X' }, headers: { origin: 'https://boese.example' } });
  assert.equal(r.status, 403);
  const ok = await req('POST', '/api/campaigns', { cookie: admin, body: { name: 'Testkampagne' }, headers: { origin: BASE } });
  assert.equal(ok.status, 201);
});

test('Anzeige koppeln per Code', async () => {
  const start = await req('POST', '/api/auth/pair/start', { body: {} });
  assert.match(start.json.code, /^[A-Z2-9]{6}$/);
  assert.match(start.json.approveUrl, /\/approve\.html\?code=/);
  assert.equal((await req('POST', '/api/auth/pair/poll', { body: { pairId: start.json.pairId } })).json.state, 'waiting');
  // Bestätigen nur angemeldet
  assert.equal((await req('POST', '/api/auth/pair/approve', { body: { code: start.json.code, name: 'TV' } })).status, 401);
  const qr = await fetch(`${BASE}/api/auth/pair/qr.svg?code=${start.json.code}`);
  assert.match(await qr.text(), /^<svg/);
  const ok = await req('POST', '/api/auth/pair/approve', { cookie: admin, body: { code: start.json.code.toLowerCase(), name: 'Wohnzimmer-TV' } });
  assert.equal(ok.status, 200);
  const poll = await req('POST', '/api/auth/pair/poll', { body: { pairId: start.json.pairId } });
  assert.equal(poll.json.state, 'approved');
  device = poll.cookie;
  assert.ok(device);
  // Code nur einmal verwendbar
  assert.equal((await req('POST', '/api/auth/pair/poll', { body: { pairId: start.json.pairId } })).json.state, 'expired');
});

test('Anzeige darf nur lesen, was sie braucht', async () => {
  assert.equal((await req('GET', '/table.html', { cookie: device })).status, 200);
  assert.equal((await req('GET', '/player.html', { cookie: device })).status, 200);
  assert.match((await req('GET', '/dm.html', { cookie: device })).location, /^\/login\.html/);
  assert.equal((await req('GET', '/api/settings', { cookie: device })).status, 200);
  assert.equal((await req('GET', '/api/campaigns', { cookie: device })).status, 401);
  assert.equal((await req('PUT', '/api/settings', { cookie: device, body: {} })).status, 401);
  assert.equal((await req('GET', '/api/users', { cookie: device })).status, 401);
});

test('Freigabe entziehen meldet die Anzeige ab', async () => {
  const devices = (await req('GET', '/api/devices', { cookie: admin })).json;
  const tv = devices.find((d) => d.name === 'Wohnzimmer-TV');
  assert.ok(tv);
  assert.equal((await req('DELETE', `/api/devices/${tv.id}`, { cookie: admin })).status, 204);
  assert.match((await req('GET', '/table.html', { cookie: device })).location, /^\/pair\.html/);
});

test('Kiosk: Schlüssel nötig, Einstellungen erst nach Freigabe, Browser meldet sich mit Einmal-Token an', async () => {
  // Vor der Einrichtung mit Schlüssel bekannt → gilt als freigegeben
  const known = await heartbeat(KIOSK, KEY);
  assert.equal(known.status, 200);
  assert.ok(known.json.browserToken);
  assert.equal((await heartbeat(KIOSK, 'x'.repeat(43))).status, 401); // falscher Schlüssel
  // Alte Software ohne Schlüssel: kein Fehler (sonst Einrichtungsmodus), aber auch keine Einstellungen
  const old = await heartbeat('pi-ohneschluessel', null);
  assert.equal(old.status, 200);
  assert.equal(old.json.pairing, true);
  assert.equal(old.json.desired, null);
  assert.equal((await req('GET', '/api/kiosks', { cookie: admin })).json.some((k) => k.id === 'pi-ohneschluessel'), false);

  // Neuer Kiosk: bekommt nichts, bis er gekoppelt ist
  const NEW = 'pi-test0002';
  const KEY2 = 'z'.repeat(43);
  const first = await heartbeat(NEW, KEY2);
  assert.equal(first.json.pairing, true);
  assert.equal(first.json.desired, null);
  assert.equal(first.json.browserToken, undefined);
  const start = await req('POST', '/api/auth/pair/start', { body: { kiosk: NEW } });
  assert.equal(start.json.kioskPaired, false);
  const info = await req('GET', `/api/auth/pair/info?code=${start.json.code}`, { cookie: admin });
  assert.equal(info.json.kiosk.id, NEW);
  await req('POST', '/api/auth/pair/approve', { cookie: admin, body: { code: start.json.code, name: 'Tisch' } });
  const after = await heartbeat(NEW, KEY2);
  assert.ok(after.json.browserToken);

  // Einmal-Token → Cookie → Kiosk-Seite
  const login = await req('GET', `/auth/kiosk?id=${NEW}&token=${encodeURIComponent(after.json.browserToken)}`);
  assert.equal(login.status, 302);
  assert.ok(login.cookie);
  assert.equal((await req('GET', `/api/kiosks/${NEW}/display`, { cookie: login.cookie })).status, 200);
  // Token nur einmal gültig
  const again = await req('GET', `/auth/kiosk?id=${NEW}&token=${encodeURIComponent(after.json.browserToken)}`);
  assert.equal(again.cookie, null);

  // Update-Download nur mit passendem Schlüssel
  const dl = (key) => fetch(`${BASE}/api/kiosk-updates/9.9.9/download`, { headers: { 'x-kiosk-id': NEW, 'x-kiosk-key': key } });
  assert.equal((await dl('falsch')).status, 401);
  assert.equal((await dl(KEY2)).status, 404); // erlaubt, nur kein Paket vorhanden

  // Kiosk-Liste zeigt den Status, nie den Schlüssel
  const list = (await req('GET', '/api/kiosks', { cookie: admin })).json;
  assert.equal(list.find((k) => k.id === NEW).paired, true);
  assert.ok(!JSON.stringify(list).includes('keyHash'));
});

test('Rollen: Spielleitung darf keine Konten verwalten, letzter Admin bleibt', async () => {
  const created = await req('POST', '/api/users', { cookie: admin, body: { name: 'Mitspieler', password: 'passwort1', role: 'dm' } });
  assert.equal(created.status, 201);
  const dm = (await req('POST', '/api/auth/login', { body: { name: 'Mitspieler', password: 'passwort1' } })).cookie;
  assert.equal((await req('GET', '/api/campaigns', { cookie: dm })).status, 200);
  assert.equal((await req('GET', '/api/users', { cookie: dm })).status, 403);
  const users = (await req('GET', '/api/users', { cookie: admin })).json;
  const me = users.find((u) => u.name === 'Pold');
  assert.equal((await req('PUT', `/api/users/${me.id}`, { cookie: admin, body: { role: 'dm' } })).status, 400);
  assert.equal((await req('DELETE', `/api/users/${me.id}`, { cookie: admin })).status, 400);
  // Passwort vom Admin neu gesetzt → Sitzungen des Kontos enden
  const mit = users.find((u) => u.name === 'Mitspieler');
  await req('PUT', `/api/users/${mit.id}`, { cookie: admin, body: { password: 'neuespasswort' } });
  assert.equal((await req('GET', '/api/campaigns', { cookie: dm })).status, 401);
});

test('KI-Dienste: nur Admins richten ein, Schlüssel bleiben auf dem Server', async () => {
  await req('POST', '/api/users', { cookie: admin, body: { name: 'Spielleitung', password: 'passwort2', role: 'dm' } });
  const dm = (await req('POST', '/api/auth/login', { body: { name: 'Spielleitung', password: 'passwort2' } })).cookie;
  assert.deepEqual((await req('GET', '/api/ai', { cookie: dm })).json, { text: false, image: false, enhance: true });
  assert.equal((await req('GET', '/api/ai/config', { cookie: dm })).status, 403);
  assert.equal((await req('PUT', '/api/ai/config', { cookie: dm, body: {} })).status, 403);
  assert.equal((await req('POST', '/api/ai/test', { cookie: dm, body: { kind: 'text', url: 'http://127.0.0.1:9' } })).status, 403);

  const body = { text: { enabled: true, url: '127.0.0.1:9/v1/', model: 'm', apiKey: 'geheimer-text-schluessel' }, image: { enabled: true, url: 'http://127.0.0.1:9/api/v1', apiKey: 'ig_geheim' } };
  const saved = await req('PUT', '/api/ai/config', { cookie: admin, body });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.text.url, 'http://127.0.0.1:9/v1');
  assert.equal(saved.json.image.url, 'http://127.0.0.1:9');
  assert.equal(saved.json.image.hasKey, true);
  const cfg = await req('GET', '/api/ai/config', { cookie: admin });
  assert.doesNotMatch(JSON.stringify(cfg.json), /geheim/);
  assert.deepEqual((await req('GET', '/api/ai', { cookie: dm })).json, { text: true, image: true, enhance: true });
  // Schlüssel weglassen = behalten, leer = entfernen
  await req('PUT', '/api/ai/config', { cookie: admin, body: { text: { ...body.text, apiKey: undefined }, image: { ...body.image, apiKey: '' } } });
  const after2 = (await req('GET', '/api/ai/config', { cookie: admin })).json;
  assert.equal(after2.text.hasKey, true);
  assert.equal(after2.image.hasKey, false);
  // Dienst nicht erreichbar: verständliche Meldung
  const wf = await req('GET', '/api/ai/workflows', { cookie: dm });
  assert.equal(wf.status, 502);
  assert.match(wf.json.error, /^KI-Dienst: /);
  assert.equal((await req('PUT', '/api/ai/config', { cookie: admin, body: { text: { url: 'ftp://x' } } })).status, 400);
  // ausgeschaltet: nichts mehr sichtbar
  await req('PUT', '/api/ai/config', { cookie: admin, body: {} });
  assert.deepEqual((await req('GET', '/api/ai', { cookie: dm })).json, { text: false, image: false, enhance: true });
});

test('BasaltNotes: nur Admins richten ein, Token bleibt auf dem Server', async () => {
  const dm = (await req('POST', '/api/auth/login', { body: { name: 'Spielleitung', password: 'passwort2' } })).cookie;
  assert.deepEqual((await req('GET', '/api/basalt', { cookie: dm })).json, { enabled: false });
  assert.equal((await req('GET', '/api/basalt/config', { cookie: dm })).status, 403);
  assert.equal((await req('PUT', '/api/basalt/config', { cookie: dm, body: {} })).status, 403);
  const saved = await req('PUT', '/api/basalt/config', { cookie: admin, body: { enabled: true, url: '127.0.0.1:9/api/v1', token: 'Bearer bn_geheim', vault: 'dnd' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.url, 'http://127.0.0.1:9');
  assert.equal(saved.json.hasToken, true);
  assert.doesNotMatch(JSON.stringify((await req('GET', '/api/basalt/config', { cookie: admin })).json), /geheim/);
  assert.deepEqual((await req('GET', '/api/basalt', { cookie: dm })).json, { enabled: true, url: 'http://127.0.0.1:9', vault: 'dnd' });
  const chars = await req('GET', '/api/basalt/characters?campaign=x', { cookie: dm });
  assert.equal(chars.status, 502);
  assert.match(chars.json.error, /^BasaltNotes: /);
  await req('PUT', '/api/basalt/config', { cookie: admin, body: { enabled: false, token: '' } });
  assert.deepEqual((await req('GET', '/api/basalt', { cookie: dm })).json, { enabled: false });
});

test('Fehlermeldungen in der Sprache des Browsers', async () => {
  const en = await req('POST', '/api/auth/login', { body: { name: 'niemand', password: 'falsch' }, headers: { 'x-lang': 'en' } });
  assert.equal(en.json.error, 'Name or password is wrong.');
  const de = await req('POST', '/api/auth/login', { body: { name: 'niemand', password: 'falsch' } });
  assert.equal(de.json.error, 'Name oder Passwort stimmt nicht.');
  const accept = await req('GET', '/api/campaigns', { headers: { 'accept-language': 'en-US,en;q=0.9' } });
  assert.equal(accept.json.error, 'Please log in.');
});

test('Fehlversuche bremsen', async () => {
  for (let i = 0; i < 5; i++) await req('POST', '/api/auth/login', { body: { name: 'Pold', password: 'falsch' } });
  const blocked = await req('POST', '/api/auth/login', { body: { name: 'Pold', password: 'geheim123' } });
  assert.equal(blocked.status, 401);
  assert.match(blocked.json.error, /Fehlversuche/);
  // Meldung mit eingesetzter Wartezeit, übersetzt über das Muster
  const blockedEn = await req('POST', '/api/auth/login', { body: { name: 'Pold', password: 'geheim123' }, headers: { 'x-lang': 'en' } });
  assert.match(blockedEn.json.error, /^Too many failed attempts – please try again in \d+ s\.$/);
});

test('Daten: Passwörter und Sitzungen nur als Hash gespeichert', async () => {
  await new Promise((r) => setTimeout(r, 600)); // Server speichert leicht verzögert
  const raw = fs.readFileSync(path.join(dataDir, 'auth.json'), 'utf8');
  assert.ok(!raw.includes('geheim123'));
  assert.ok(!raw.includes(admin.split('=')[1]));
});
