import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { Server } from 'socket.io';
import * as store from './store.js';
import * as kiosks from './kiosks.js';
import * as kioskUpdates from './kiosk-updates.js';
import * as wled from './wled.js';
import * as ai from './ai.js';
import * as basalt from './basalt.js';
import * as auth from './auth.js';
import { installAuth, socketAuth } from './auth-routes.js';
import * as i18n from './i18n.js';
import { validPath } from '../shared/ops.js';
import { createDemoCampaign } from './demo/demo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 200;
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

// Top-Level-Schlüssel, die Clients per Op verändern dürfen.
const WRITABLE_ROOTS = new Set([
  'name',
  'description',
  'adventures',
  'sessions',
  'assets',
  'maps',
  'lore',
  'creatures',
  'encounters',
  'party',
  'notepad',
  'notepadSketch',
  'initiative',
  'display',
  'units',
  'basalt',
]);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6 });

app.use(express.json({ limit: '5mb' }));
// Fehlermeldungen in der Sprache des Browsers
app.use(i18n.middleware);
// Anmeldung: vor allen Seiten und Schnittstellen. Nach jeder Änderung (Freigabe entzogen, Konto gelöscht, neues
// Passwort …) offene Verbindungen neu prüfen – ungültige werden getrennt, die Seite landet dann bei Anmeldung/Kopplung.
function recheckSockets() {
  for (const s of io.sockets.sockets.values()) {
    if (!auth.resolve(auth.tokenFromCookie(s.handshake.headers.cookie))) s.disconnect(true);
  }
}
installAuth(app, {
  kiosks,
  onChange: () => {
    io.to('staff').emit('kiosks');
    recheckSockets();
  },
});
// Oberfläche immer neu validieren, damit nach Updates keine alten Skripte aus dem Cache laufen
const noCache = { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') };
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], ...noCache }));
app.use('/shared', express.static(path.join(ROOT, 'shared'), noCache));

app.get('/api/version', (req, res) => res.json({ version: VERSION }));

function campaignOr404(req, res) {
  const st = store.getCampaign(req.params.id);
  if (!st) res.status(404).json({ error: 'Kampagne nicht gefunden' });
  return st;
}

/**
 * Abenteuer, in dem die Oberfläche gerade arbeitet (Kopfzeile X-Adventure): neu angelegte Dateien gehören dazu.
 * Liefert { adventureIds } zum Einmischen oder ein leeres Objekt.
 */
function adventureOf(req, st) {
  const a = String(req.get('x-adventure') || '');
  return a && st?.adventures?.[a] ? { adventureIds: [a] } : {};
}

/** Wendet serverseitig erzeugte Ops an und verteilt sie an alle Clients der Kampagne. */
function broadcast(id, ops) {
  if (store.commit(id, ops)) {
    io.to(id).emit('ops', ops);
    wled.update(store.getCampaign(id));
  }
}

// --- Kampagnen ---------------------------------------------------------------

app.get('/api/campaigns', (req, res) => res.json(store.listCampaigns()));

app.post('/api/campaigns', (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 120);
  const st = store.createCampaign(name || 'Neue Kampagne');
  // Neue Kampagne: Einheiten und Anzeigesprache passend zur Sprache der Person, die sie anlegt
  const lang = i18n.langOf(req);
  const units = ['metric', 'imperial'].includes(req.body?.units) ? req.body.units : lang === 'de' ? 'metric' : 'imperial';
  store.commit(st.id, [{ t: 'set', p: ['units'], v: units }, { t: 'set', p: ['display', 'lang'], v: lang }]);
  res.status(201).json({ id: st.id, name: st.name });
});

app.get('/api/campaigns/:id', (req, res) => {
  const st = campaignOr404(req, res);
  if (st) res.json(st);
});

app.delete('/api/campaigns/:id', (req, res) => {
  if (!store.deleteCampaign(req.params.id)) return res.status(404).end();
  fs.rmSync(path.join(store.DATA_DIR, 'cache', path.basename(req.params.id)), { recursive: true, force: true });
  io.to(req.params.id).emit('campaign-deleted');
  res.status(204).end();
});

// --- Dateien -----------------------------------------------------------------

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = store.uploadsDir(req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path
        .extname(file.originalname)
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, '')
        .slice(0, 10);
      cb(null, store.newId() + ext);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

app.post('/api/campaigns/:id/assets', (req, res) => {
  const st = campaignOr404(req, res);
  if (!st) return;
  const scope = adventureOf(req, st);
  upload.array('files', 50)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const ops = [];
    const created = [];
    for (const f of req.files || []) {
      // multer liefert die Originalnamen latin1-kodiert
      const original = Buffer.from(f.originalname, 'latin1').toString('utf8');
      const asset = {
        id: path.parse(f.filename).name,
        name: path.parse(original).name.slice(0, 120),
        file: f.filename,
        mime: f.mimetype,
        size: f.size,
        kind: f.mimetype.startsWith('image/') ? 'image' : 'document',
        createdAt: Date.now(),
        ...scope,
      };
      created.push(asset);
      ops.push({ t: 'set', p: ['assets', asset.id], v: asset });
    }
    broadcast(req.params.id, ops);
    res.status(201).json(created);
  });
});

// Bild aus der Monster-Datenbank (Open5e) übernehmen – nur von dort, damit der Server keine beliebigen
// Adressen abruft. Wird beim Import einer Kreatur als Porträt/Token-Bild genutzt.
const IMAGE_HOSTS = new Set(['api.open5e.com', 'open5e.com', 'www.open5e.com']);
const IMAGE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

app.post('/api/campaigns/:id/assets/from-url', async (req, res) => {
  const st = campaignOr404(req, res);
  if (!st) return;
  let url;
  try {
    url = new URL(String(req.body?.url || '').replace(/^http:\/\//, 'https://'));
  } catch {
    return res.status(400).json({ error: 'Ungültige Bild-Adresse' });
  }
  if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname)) return res.status(400).json({ error: 'Nur Bilder aus der Monster-Datenbank (Open5e) möglich' });
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const mime = String(r.headers.get('content-type') || '').split(';')[0].trim();
    if (!r.ok || !IMAGE_EXT[mime]) return res.status(502).json({ error: `Bild nicht abrufbar (${r.status})` });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 15 * 1024 * 1024) return res.status(400).json({ error: 'Bild zu groß' });
    const dir = store.uploadsDir(st.id);
    fs.mkdirSync(dir, { recursive: true });
    const file = store.newId() + IMAGE_EXT[mime];
    fs.writeFileSync(path.join(dir, file), buf);
    const asset = {
      id: path.parse(file).name,
      name: String(req.body?.name || path.parse(url.pathname).name).slice(0, 120),
      file,
      mime,
      size: buf.length,
      kind: 'image',
      createdAt: Date.now(),
      ...adventureOf(req, st),
    };
    broadcast(st.id, [{ t: 'set', p: ['assets', asset.id], v: asset }]);
    res.status(201).json(asset);
  } catch (err) {
    res.status(502).json({ error: `Bild nicht abrufbar (${err.message})` });
  }
});

app.delete('/api/campaigns/:id/assets/:assetId', (req, res) => {
  const st = campaignOr404(req, res);
  if (!st) return;
  const asset = st.assets[req.params.assetId];
  if (!asset) return res.status(404).end();
  fs.rmSync(path.join(store.uploadsDir(st.id), path.basename(asset.file)), { force: true });
  removeVariants(st.id, path.basename(asset.file));
  broadcast(st.id, [{ t: 'del', p: ['assets', asset.id] }]);
  res.status(204).end();
});

// Verkleinerte Fassungen großer Bilder (?w=2048): schwache Anzeigegeräte (Pi Zero) laden nur so viel,
// wie sie wirklich darstellen – eine 4096er-Karte belegt entpackt sonst ~48 MB Arbeitsspeicher.
// Erlaubt: Breiten in 128er-Schritten – so kann die Anzeige genau die Auflösung anfordern, die sie braucht
const isVariantWidth = (w) => Number.isInteger(w) && w >= 256 && w <= 4096 && w % 128 === 0;
const variantJobs = new Map(); // Ziel-Datei -> laufende Erzeugung

function removeVariants(campaignId, fileName) {
  const dir = path.join(store.DATA_DIR, 'cache', campaignId);
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) if (f.startsWith(`${fileName}.w`)) fs.rmSync(path.join(dir, f), { force: true });
}

async function imageVariant(campaignId, fileName, width) {
  const src = path.join(store.uploadsDir(campaignId), fileName);
  const dir = path.join(store.DATA_DIR, 'cache', campaignId);
  // JPEG für Karten ohne Transparenz (dekodiert auf dem Pi deutlich schneller), sonst WebP
  for (const ext of ['jpg', 'webp']) {
    const done = path.join(dir, `${fileName}.w${width}.${ext}`);
    if (fs.existsSync(done)) return done;
  }
  const key = path.join(dir, `${fileName}.w${width}`);
  if (!variantJobs.has(key)) {
    const job = (async () => {
      const { default: sharp } = await import('sharp');
      const meta = await sharp(src).metadata();
      if (!meta.width || meta.width <= width) return src; // Original ist schon klein genug
      fs.mkdirSync(dir, { recursive: true });
      // Viele PNG-Karten haben einen Alphakanal, ohne transparent zu sein – dann ebenfalls JPEG
      const transparent = meta.hasAlpha && !(await sharp(src).stats()).isOpaque;
      const out = `${key}.${transparent ? 'webp' : 'jpg'}`;
      const tmp = `${out}.${process.pid}.tmp`;
      const img = sharp(src).resize({ width, withoutEnlargement: true });
      await (transparent ? img.webp({ quality: 88 }) : img.flatten({ background: '#000' }).jpeg({ quality: 88, mozjpeg: true })).toFile(tmp);
      fs.renameSync(tmp, out);
      return out;
    })().finally(() => variantJobs.delete(key));
    variantJobs.set(key, job);
  }
  return variantJobs.get(key);
}

app.get('/files/:id/:file', async (req, res) => {
  if (!store.getCampaign(req.params.id)) return res.status(404).end();
  const name = path.basename(req.params.file);
  let file = path.join(store.uploadsDir(req.params.id), name);
  const w = Number(req.query.w);
  if (isVariantWidth(w) && /\.(jpe?g|png|webp)$/i.test(name) && fs.existsSync(file)) {
    try {
      file = await imageVariant(req.params.id, name, w);
    } catch (err) {
      console.warn('Bildvariante fehlgeschlagen:', name, w, err.message); // dann eben das Original
    }
  }
  res.sendFile(file, { maxAge: '7d', immutable: true }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// --- SRD-Monster über Open5e (frei lizenzierte 5e-Daten) ---------------------

const OPEN5E = 'https://api.open5e.com/v1/monsters/';
const PAGE_SIZE = 30;
const srdCache = new Map(); // URL -> { at, data }

async function open5e(params) {
  const url = `${OPEN5E}?${new URLSearchParams(params)}`;
  const hit = srdCache.get(url);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.data;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`Open5e antwortet mit ${r.status}`);
  const data = await r.json();
  srdCache.set(url, { at: Date.now(), data });
  if (srdCache.size > 300) srdCache.delete(srdCache.keys().next().value);
  return data;
}

const srdError = (res, err) => res.status(502).json({ error: `Monster-Datenbank nicht erreichbar (${err.message}). Hat der Server Internetzugang?` });

/**
 * Suche mit Filtern: q (Name, englisch), source (srd|all), type, crMin, crMax, sort (name|cr), page.
 * Ohne Suchbegriff wird nach Filtern geblättert.
 */
app.get('/api/srd/monsters', async (req, res) => {
  const q = String(req.query.q ?? req.query.search ?? '').trim().slice(0, 80);
  const page = Math.max(0, Number(req.query.page) || 0);
  const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE, ordering: req.query.sort === 'cr' ? 'cr' : 'name' };
  if (req.query.source !== 'all') params.document__slug = 'wotc-srd';
  if (req.query.type) params.type = String(req.query.type).slice(0, 40);
  if (req.query.crMin !== undefined && req.query.crMin !== '') params.cr__gte = Number(req.query.crMin);
  if (req.query.crMax !== undefined && req.query.crMax !== '') params.cr__lte = Number(req.query.crMax);
  try {
    let data;
    if (q) {
      // Zuerst im Namen suchen (präzise), sonst Volltextsuche als Rückfall
      data = await open5e({ ...params, name__icontains: q });
      if (!data.count) data = await open5e({ ...params, search: q });
    } else {
      data = await open5e(params);
    }
    res.json({ results: data.results || [], count: data.count || 0, hasMore: !!data.next });
  } catch (err) {
    srdError(res, err);
  }
});

app.get('/api/srd/monster/:slug', async (req, res) => {
  try {
    const r = await fetch(`${OPEN5E}${encodeURIComponent(req.params.slug)}/`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return res.status(r.status === 404 ? 404 : 502).json({ error: 'Nicht gefunden' });
    res.json(await r.json());
  } catch (err) {
    srdError(res, err);
  }
});

// --- Kiosk-Geräte (z.B. Raspberry Pi am Spieltisch) ----------------------------

const kioskOr404 = (req, res) => {
  if (!kiosks.isKioskId(req.params.id) || !kiosks.get(req.params.id)) {
    res.status(404).json({ error: 'Gerät nicht gefunden' });
    return null;
  }
  return kiosks.get(req.params.id);
};

// Agent auf dem Gerät: meldet sich und holt Änderungen/Befehle ab
// Jeder Agent hat einen eigenen geheimen Geräteschlüssel (X-Kiosk-Key); der Server merkt sich beim ersten Kontakt
// dessen Hash. Mit eingerichteter Anmeldung bekommt ein Gerät Einstellungen (inkl. WLAN-Passwörtern) und Befehle nur,
// wenn der Schlüssel passt und es per QR-Code freigegeben wurde.
app.post('/api/kiosks/heartbeat', (req, res) => {
  const id = String(req.body?.id || '');
  if (!kiosks.isKioskId(id)) return res.status(400).json({ error: 'Ungültige Geräte-ID' });
  const key = String(req.get('x-kiosk-key') || '');
  const known = kiosks.get(id);
  if (known?.keyHash) {
    if (!auth.keyMatches(key, known.keyHash)) return res.status(401).json({ error: 'Geräteschlüssel passt nicht – Gerät unter „Kiosk-Geräte“ entfernen und neu koppeln.' });
  } else if (key.length >= 20) {
    // Neue Geräte begrenzen, solange sie nicht freigegeben sind (sonst ließe sich die Liste vollschreiben)
    if (auth.active() && !known && kiosks.all().filter((k) => !auth.isKioskPaired(k.id)).length >= 20) {
      return res.status(429).json({ error: 'Zu viele nicht freigegebene Geräte.' });
    }
    kiosks.setKeyHash(id, auth.hashKey(key));
  } else if (auth.active()) {
    // Ältere Kiosk-Software ohne Geräteschlüssel: nichts preisgeben, aber auch kein Fehler – sonst wechselt
    // sie nach einigen Minuten in den Einrichtungsmodus. Ihr Browser kann per QR-Code gekoppelt werden.
    return res.json({ desired: null, commands: [], pairing: true });
  }
  const isNew = !known;
  const wasOnline = kiosks.list().find((k) => k.id === id)?.online;
  const result = kiosks.heartbeat(id, req.body);
  if (isNew || !wasOnline) io.to('staff').emit('kiosks');
  if (auth.active()) {
    // Noch nicht freigegeben: nichts preisgeben, die Anzeige zeigt den QR-Code zum Koppeln
    if (!auth.isKioskPaired(id)) return res.json({ desired: null, commands: [], ack: result.ack, pairing: true });
    result.browserToken = auth.issueKioskBrowserToken(id);
  }
  res.json(result);
});

app.get('/api/kiosks', (req, res) => res.json(kiosks.list().map((k) => ({ ...k, paired: !auth.active() || auth.isKioskPaired(k.id) }))));

// Kiosk-Seite im Browser: was soll angezeigt werden?
app.get('/api/kiosks/:id/display', (req, res) => {
  const k = kioskOr404(req, res);
  if (!k) return;
  res.json({
    name: k.name,
    display: k.display,
    reloadToken: k.reloadToken,
    campaign: k.display.campaignId ? store.getCampaign(k.display.campaignId)?.name || null : null,
    // Eigene Monitordaten des Geräts (sonst null = globale Kalibrierung)
    calibration: kiosks.calibrationFor(k),
  });
});

app.put('/api/kiosks/:id', (req, res) => {
  if (!kioskOr404(req, res)) return;
  const view = kiosks.update(req.params.id, req.body || {});
  io.to('staff').emit('kiosks');
  res.json(view);
});

app.post('/api/kiosks/:id/command', (req, res) => {
  if (!kioskOr404(req, res)) return;
  let cmd = String(req.body?.cmd || '');
  if (cmd === 'update') {
    // Update über das Netz: der Agent lädt das Paket selbst über /api/kiosk-updates/<version>/download
    const version = String(req.body?.version || '');
    if (!kioskUpdates.filePath(version)) return res.status(404).json({ error: 'Update-Paket nicht gefunden' });
    cmd = `update:${version}`;
  } else if (!['reload', 'reboot', 'restart-browser'].includes(cmd)) {
    return res.status(400).json({ error: 'Unbekannter Befehl' });
  }
  kiosks.command(req.params.id, cmd);
  io.to('staff').emit('kiosks');
  res.json({ ok: true });
});

// --- Kiosk-Updates (Systemabbild für Geräte mit Systemplätzen A/B) -------------------

const kupUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(kioskUpdates.DIR, { recursive: true });
      cb(null, kioskUpdates.DIR);
    },
    filename: (req, file, cb) => cb(null, `.upload-${store.newId()}`),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 },
});

app.get('/api/kiosk-updates', (req, res) => res.json(kioskUpdates.list()));

app.post('/api/kiosk-updates', (req, res) => {
  kupUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
    const result = kioskUpdates.add(req.file.path);
    if (result.error) return res.status(400).json(result);
    io.to('staff').emit('kiosks');
    res.status(201).json(result);
  });
});

app.get('/api/kiosk-updates/:version/download', (req, res) => {
  if (auth.active() && req.auth?.kind !== 'user') {
    const k = kiosks.get(String(req.get('x-kiosk-id') || ''));
    if (!k || !auth.keyMatches(req.get('x-kiosk-key'), k.keyHash) || !auth.isKioskPaired(k.id)) return res.status(401).json({ error: 'Nicht erlaubt' });
  }
  const file = kioskUpdates.filePath(req.params.version);
  if (!file) return res.status(404).json({ error: 'Update-Paket nicht gefunden' });
  res.sendFile(file, { headers: { 'Content-Type': 'application/x-tar' } });
});

app.delete('/api/kiosk-updates/:version', (req, res) => {
  if (!kioskUpdates.remove(req.params.version)) return res.status(404).end();
  io.to('staff').emit('kiosks');
  res.status(204).end();
});

app.delete('/api/kiosks/:id', (req, res) => {
  if (!kioskOr404(req, res)) return;
  kiosks.remove(req.params.id);
  auth.revokeKiosk(req.params.id);
  io.to('staff').emit('kiosks');
  recheckSockets();
  res.status(204).end();
});

// --- WLED (LED-Streifen am Spieltisch) ---------------------------------------------

wled.setStatusListener((st) => io.to('staff').emit('wled', st));

app.get('/api/wled', (req, res) => res.json(wled.status()));

app.put('/api/wled', (req, res) => {
  const st = wled.saveConfig(req.body || {});
  io.to('staff').emit('wled', st);
  res.json(st);
});

app.get('/api/wled/test', async (req, res) => {
  try {
    res.json(await wled.info(req.query.host));
  } catch (err) {
    res.status(502).json({ error: `WLED nicht erreichbar: ${err.message}` });
  }
});

// Stimmung von Hand wählen (mood: null = zurück zur Automatik). campaignId: für die Automatik danach.
app.post('/api/wled/mood', async (req, res) => {
  const mood = req.body?.mood ? String(req.body.mood) : null;
  if (mood && !wled.MOODS[mood]) return res.status(400).json({ error: 'Unbekannte Stimmung' });
  const campaign = req.body?.campaignId ? store.getCampaign(String(req.body.campaignId)) : null;
  await wled.setManual(mood, campaign);
  res.json(wled.status());
});

// --- KI-Dienste (optional: Sprachmodell und Bildgenerator) -------------------------------

app.get('/api/ai', (req, res) => res.json(ai.status()));

// Einstellungen und Verbindungstest: nur Admins (siehe auth-routes.js)
app.get('/api/ai/config', (req, res) => res.json(ai.getConfig()));

app.put('/api/ai/config', (req, res) => {
  try {
    const c = ai.saveConfig(req.body || {});
    io.emit('ai', ai.status());
    res.json(c);
  } catch (err) {
    res.status(400).json({ error: `Ungültige Adresse: ${err.message}` });
  }
});

app.post('/api/ai/test', async (req, res) => {
  const b = req.body || {};
  try {
    res.json(b.kind === 'image' ? await ai.testImage(b) : await ai.testText(b));
  } catch (err) {
    res.status(502).json({ error: `KI-Dienst: ${err.message}` });
  }
});

app.post('/api/ai/text', async (req, res) => {
  const b = req.body || {};
  const messages = (Array.isArray(b.messages) ? b.messages : [])
    .slice(-20)
    .map((m) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: String(m?.content || '').slice(0, 20000) }))
    .filter((m) => m.content.trim());
  if (!messages.length) return res.status(400).json({ error: 'Kein Text angegeben' });
  try {
    res.json({ text: await ai.chat({ system: String(b.system || '').slice(0, 8000), messages, json: b.json === true }) });
  } catch (err) {
    res.status(502).json({ error: `KI-Dienst: ${err.message}` });
  }
});

app.get('/api/ai/workflows', async (req, res) => {
  try {
    const lang = i18n.langOf(req);
    res.json((await ai.workflows()).map((w) => ({ ...w, title: i18n.translate(w.title, lang), summary: i18n.translate(w.summary, lang), sizes: w.sizes?.map(([l, ...s]) => [i18n.translate(l, lang), ...s]) ?? w.sizes })));
  } catch (err) {
    res.status(502).json({ error: `KI-Dienst: ${err.message}` });
  }
});

app.get('/api/ai/jobs/:id', (req, res) => {
  const j = ai.job(req.params.id);
  if (!j) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(j);
});

// Bild erzeugen: läuft im Hintergrund, das fertige Bild landet als Datei in der Kampagne (Abfrage über /api/ai/jobs/:id)
app.post('/api/campaigns/:id/ai/image', async (req, res) => {
  const st = campaignOr404(req, res);
  if (!st) return;
  const b = req.body || {};
  let wf;
  try {
    wf = (await ai.workflows()).find((w) => w.file === b.workflow);
  } catch (err) {
    return res.status(502).json({ error: `KI-Dienst: ${err.message}` });
  }
  if (!wf) return res.status(400).json({ error: 'Unbekannter Workflow' });
  let image = null;
  if (wf.mode === 'edit') {
    const a = st.assets[String(b.sourceAssetId || '')];
    if (!a || a.kind !== 'image') return res.status(400).json({ error: 'Dieser Workflow braucht ein Ausgangsbild' });
    image = fs.readFileSync(path.join(store.uploadsDir(st.id), a.file));
  }
  const prompt = String(b.prompt || wf.defaultPrompt || '').slice(0, 4000);
  if (!prompt.trim()) return res.status(400).json({ error: 'Bitte beschreiben, was zu sehen sein soll.' });
  const size = (v) => (Number.isInteger(v) && v >= 256 && v <= 4096 ? v : null);
  const name = String(b.name || wf.title).slice(0, 120);
  const scope = adventureOf(req, st); // beim Start merken – das Bild kommt erst später
  // Porträt/Token einer Figur: erscheint nicht automatisch bei den Handouts
  const use = ['portrait', 'token'].includes(b.use) ? { use: b.use } : {};
  try {
    const j = ai.startImage(st.id, { workflow: wf.file, prompt, enhance: b.enhance !== false, width: size(b.width), height: size(b.height), image, estimate: wf.seconds }, async (buf, mime, job) => {
      if (!store.getCampaign(st.id)) throw new Error('Kampagne nicht gefunden');
      const dir = store.uploadsDir(st.id);
      fs.mkdirSync(dir, { recursive: true });
      const file = store.newId() + (IMAGE_EXT[mime] || '.png');
      fs.writeFileSync(path.join(dir, file), buf);
      const asset = { id: path.parse(file).name, name, file, mime: IMAGE_EXT[mime] ? mime : 'image/png', size: buf.length, kind: 'image', createdAt: Date.now(), ai: { workflow: wf.title, prompt: job.prompt || prompt }, ...scope, ...use };
      broadcast(st.id, [{ t: 'set', p: ['assets', asset.id], v: asset }]);
      return asset;
    });
    res.status(202).json(j);
  } catch (err) {
    res.status(502).json({ error: `KI-Dienst: ${err.message}` });
  }
});

// --- BasaltNotes (optional: Hintergründe der Charaktere und Lore) ------------------------

const basaltError = (res, err) => res.status(502).json({ error: `BasaltNotes: ${err.message}` });

app.get('/api/basalt', (req, res) => res.json(basalt.status()));

// Einstellungen und Verbindungstest: nur Admins (siehe auth-routes.js)
app.get('/api/basalt/config', (req, res) => res.json(basalt.getConfig()));

app.put('/api/basalt/config', (req, res) => {
  try {
    const c = basalt.saveConfig(req.body || {});
    io.emit('basalt', basalt.status());
    res.json(c);
  } catch (err) {
    res.status(400).json({ error: `Ungültige Adresse: ${err.message}` });
  }
});

app.post('/api/basalt/test', async (req, res) => {
  try {
    res.json(await basalt.test(req.body || {}));
  } catch (err) {
    basaltError(res, err);
  }
});

app.get('/api/basalt/vaults', async (req, res) => {
  if (!basalt.on()) return res.json([]);
  try {
    res.json(await basalt.vaults());
  } catch (err) {
    basaltError(res, err);
  }
});

app.get('/api/basalt/campaigns', async (req, res) => {
  if (!basalt.on()) return res.json([]);
  try {
    res.json(await basalt.campaigns(req.query.vault));
  } catch (err) {
    basaltError(res, err);
  }
});

app.get('/api/basalt/characters', async (req, res) => {
  if (!basalt.on()) return res.json([]);
  try {
    res.json(await basalt.characters(String(req.query.campaign || '').slice(0, 200), req.query.vault));
  } catch (err) {
    basaltError(res, err);
  }
});

app.get('/api/basalt/notes/:id', async (req, res) => {
  if (!basalt.on()) return res.status(404).json({ error: 'Nicht gefunden' });
  try {
    res.json(await basalt.note(req.params.id, req.query.vault));
  } catch (err) {
    basaltError(res, err);
  }
});

app.get('/api/basalt/attachments/:name', async (req, res) => {
  if (!basalt.on()) return res.status(404).end();
  try {
    const a = await basalt.attachment(req.params.name, req.query.vault);
    res.type(a.mime || 'application/octet-stream').set('Cache-Control', 'private, max-age=300').send(a.buffer);
  } catch (err) {
    basaltError(res, err);
  }
});

// Regelwerk (optional): ein Vault mit den Regeln in BasaltNotes – Suche, Regeltext und Fragen an dessen KI-Chat
const noRules = (res) => res.status(404).json({ error: 'Kein Regelwerk eingerichtet' });

app.get('/api/basalt/rules', async (req, res) => {
  if (!basalt.rulesOn()) return res.json({ enabled: false });
  res.json({ enabled: true, chat: await basalt.chatEnabled() });
});

app.get('/api/basalt/rules/search', async (req, res) => {
  if (!basalt.rulesOn()) return noRules(res);
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    res.json(await basalt.searchRules(q));
  } catch (err) {
    basaltError(res, err);
  }
});

app.get('/api/basalt/rules/notes/:id', async (req, res) => {
  if (!basalt.rulesOn()) return noRules(res);
  try {
    res.json(await basalt.note(req.params.id, basalt.status().rulesVault));
  } catch (err) {
    basaltError(res, err);
  }
});

// Antwort kommt als Server-Sent Events von BasaltNotes und wird unverändert durchgereicht
app.post('/api/basalt/rules/chat', async (req, res) => {
  if (!basalt.rulesOn()) return noRules(res);
  if (!String(req.body?.question || '').trim()) return res.status(400).json({ error: 'Frage fehlt' });
  const ctrl = new AbortController();
  res.on('close', () => ctrl.abort());
  let up;
  try {
    up = await basalt.askRules(req.body, ctrl.signal, i18n.langOf(req));
  } catch (err) {
    return basaltError(res, err);
  }
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' });
  try {
    for await (const chunk of up.body) res.write(chunk);
  } catch {
    /* abgebrochen */
  } finally {
    res.end();
  }
});

// Nachbereitung einer Session als Session-Notiz an BasaltNotes (Recap, Szenen, Stichworte)
app.post('/api/campaigns/:id/basalt/session', async (req, res) => {
  const st = campaignOr404(req, res);
  if (!st) return;
  if (!basalt.on()) return res.status(400).json({ error: 'BasaltNotes ist nicht eingerichtet' });
  const s = st.sessions[String(req.body?.sessionId || '')];
  if (!s) return res.status(404).json({ error: 'Nicht gefunden' });
  const b = req.body || {};
  try {
    const r = await basalt.sendSession({ vault: b.vault, key: `tabletop-forge:${st.id}:${s.id}`, title: b.title || s.name, campaign: b.campaign || st.name, date: s.date || undefined, body: b.body, attachments: Array.isArray(b.attachments) ? b.attachments : [] });
    res.json({ ok: true, noteId: r.note_id || null });
  } catch (err) {
    basaltError(res, err);
  }
});

// Bild aus einer Basalt-Notiz in die Kampagne übernehmen (z.B. als Porträt eines Charakters)
app.post('/api/campaigns/:id/basalt/image', async (req, res) => {
  const st = campaignOr404(req, res);
  if (!st) return;
  if (!basalt.on()) return res.status(400).json({ error: 'BasaltNotes ist nicht eingerichtet' });
  try {
    const a = await basalt.attachment(String(req.body?.name || ''), req.body?.vault);
    if (!IMAGE_EXT[a.mime]) return res.status(400).json({ error: 'Kein Bild' });
    const dir = store.uploadsDir(st.id);
    fs.mkdirSync(dir, { recursive: true });
    const file = store.newId() + IMAGE_EXT[a.mime];
    fs.writeFileSync(path.join(dir, file), a.buffer);
    const asset = { id: path.parse(file).name, name: String(req.body?.title || req.body?.name).slice(0, 120), file, mime: a.mime, size: a.buffer.length, kind: 'image', createdAt: Date.now(), ...adventureOf(req, st) };
    broadcast(st.id, [{ t: 'set', p: ['assets', asset.id], v: asset }]);
    res.status(201).json(asset);
  } catch (err) {
    basaltError(res, err);
  }
});

// --- Hardware-Einstellungen --------------------------------------------------

app.get('/api/settings', (req, res) => res.json(store.getSettings()));

app.put('/api/settings', (req, res) => {
  const s = store.saveSettings(req.body);
  io.emit('settings', s);
  res.json(s);
});

// --- Echtzeit-Synchronisation ------------------------------------------------

io.use(socketAuth);

io.on('connection', (socket) => {
  const isDevice = socket.data.auth?.kind === 'device';
  // Meldungen für die Spielleitung (Kiosk-Liste, LED-Status) nur an Personen
  if (!isDevice) socket.join('staff');
  socket.on('join', ({ campaignId, role } = {}, ack) => {
    if (typeof ack !== 'function') return;
    const st = store.getCampaign(campaignId);
    if (!st) return ack({ error: 'Kampagne nicht gefunden' });
    if (isDevice && !['table', 'player'].includes(role)) return ack({ error: 'Dieses Gerät ist nur als Anzeige freigegeben.' });
    for (const room of socket.rooms) if (room !== socket.id && room !== 'staff') socket.leave(room);
    socket.join(campaignId);
    socket.data.campaignId = campaignId;
    socket.data.role = String(role || 'dm').slice(0, 20);
    ack({ state: st, settings: store.getSettings(), version: VERSION });
    emitPresence(campaignId);
  });

  socket.on('ops', (ops) => {
    const id = socket.data.campaignId;
    if (!id || !Array.isArray(ops)) return;
    // Anzeigen dürfen nur ihren sichtbaren Ausschnitt melden (Rahmen in der DM-Ansicht)
    const allowed = isDevice ? (op) => op.p[0] === 'display' && op.p[1] === 'table' && op.p[2] === 'views' : (op) => WRITABLE_ROOTS.has(op.p[0]);
    const valid = ops.filter((op) => validPath(op?.p) && allowed(op));
    if (valid.length && store.commit(id, valid)) {
      socket.to(id).emit('ops', valid);
      // LED-Stimmung folgt dem Spiel (Kampf, Verdunkeln, Karte)
      wled.update(store.getCampaign(id));
    }
  });

  // Flüchtige Ereignisse (z.B. Ping auf der Karte) werden nur weitergereicht.
  socket.on('fx', (fx) => {
    const id = socket.data.campaignId;
    if (id && fx && typeof fx === 'object') socket.to(id).emit('fx', fx);
  });

  socket.on('disconnect', () => {
    const id = socket.data.campaignId;
    if (!id) return;
    // Rahmen einer geschlossenen Tischanzeige entfernen
    if (store.getCampaign(id)?.display.table.views?.[socket.id]) {
      broadcast(id, [{ t: 'del', p: ['display', 'table', 'views', socket.id] }]);
    }
    emitPresence(id);
  });
});

async function emitPresence(id) {
  const sockets = await io.in(id).fetchSockets();
  const roles = {};
  for (const s of sockets) roles[s.data.role] = (roles[s.data.role] || 0) + 1;
  io.to(id).emit('presence', roles);
}

function shutdown() {
  store.flushAll();
  auth.flush();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Beim Einschalten der Anmeldung: Kiosks, die schon einen Geräteschlüssel haben, gelten als freigegeben
// (sie liefen bisher im eigenen Netz). Ältere Kiosks ohne Schlüssel müssen per QR-Code gekoppelt werden.
auth.setActivateListener(() => {
  for (const k of kiosks.all()) if (k.keyHash) auth.pairKiosk(k.id, k.name);
});

try {
  if (createDemoCampaign(store)) console.log('Beispielkampagne angelegt (abschaltbar mit DEMO_CAMPAIGN=0)');
} catch (err) {
  console.error('Beispielkampagne konnte nicht angelegt werden:', err.message);
}

server.listen(PORT, () => {
  console.log(`Tabletop Forge läuft auf http://0.0.0.0:${PORT} (Daten: ${store.DATA_DIR})`);
  auth.announceSetup();
});
