// Verwaltung der Kiosk-Geräte (z.B. Raspberry Pi am Spieltisch).
// Der Kiosk-Agent auf dem Gerät meldet sich per Heartbeat und erhält dabei geänderte
// Einstellungen („desired“) sowie ausstehende Befehle zurück.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, getSettings } from './store.js';
import { sanitizeTable } from '../shared/calibration.js';

const FILE = path.join(DATA_DIR, 'kiosks.json');
const ONLINE_MS = 45_000;

let kiosks = {};
try {
  kiosks = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  kiosks = {};
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(kiosks, null, 2));
    fs.renameSync(tmp, FILE);
  }, 200);
}

export const isKioskId = (id) => typeof id === 'string' && /^[a-z0-9-]{4,40}$/i.test(id);

function blank(id) {
  return {
    id,
    name: `Kiosk ${id.slice(-4)}`,
    createdAt: Date.now(),
    lastSeen: 0,
    info: {},
    // Was das Gerät anzeigen soll – wird von der Kiosk-Seite im Browser abgefragt
    display: { campaignId: null, mode: 'table' },
    // Gewünschte Geräte-Einstellungen; rev steigt bei jeder Änderung
    // monitor: Monitordaten des Geräts (Auflösung, Größe …) – null = globale Kalibrierung verwenden
    desired: { rev: 0, serverUrl: '', hostname: '', country: 'DE', wifi: [], monitor: null },
    reportedRev: 0,
    commands: [],
    reloadToken: 0,
  };
}

/** Öffentliche Sicht für die Oberfläche – WLAN-Passwörter werden nie zurückgegeben. */
export function publicView(k) {
  return {
    id: k.id,
    name: k.name,
    online: Date.now() - k.lastSeen < ONLINE_MS,
    hot: hotFor(k),
    lastSeen: k.lastSeen,
    info: k.info,
    display: k.display,
    desired: { ...k.desired, wifi: k.desired.wifi.map((w) => ({ ssid: w.ssid, hasPsk: !!w.psk || !!w.keep })) },
    reportedRev: k.reportedRev,
    pendingCommands: k.commands.map((c) => c.cmd),
  };
}

export const list = () => Object.values(kiosks).map(publicView).sort((a, b) => a.name.localeCompare(b.name));
export const all = () => Object.values(kiosks);

/** Geräteschlüssel des Agenten (nur sein Hash). Legt das Gerät an, falls es neu ist. */
export function setKeyHash(id, hash) {
  if (!kiosks[id]) kiosks[id] = blank(id);
  kiosks[id].keyHash = hash;
  save();
}
export const get = (id) => kiosks[id] || null;

// Hitzeschutz der Anzeige: Die Wärme eines Kiosk kommt vor allem vom Grafikchip, der die belebte Karte zeichnet –
// den Prozessor zu drosseln ändert daran kaum etwas (gemessen am Orange Pi Zero 2W). Ab HOT_AT °C pausiert die
// Tischanzeige deshalb die Belebung, bis das Gerät um HOT_BACK Grad abgekühlt ist. Nur im Arbeitsspeicher gemerkt.
// Die Fühler springen einzeln um 2–3 Grad nach oben – erst zwei Messungen in Folge über der Schwelle zählen.
export const HOT_AT = 85;
export const HOT_BACK = 10;
const hot = new Set();
const hotSeen = new Map();
/** Ist das Gerät gerade zu heiß für die belebte Karte? Meldet es sich nicht mehr, gilt die letzte Messung nicht weiter. */
export const hotFor = (k, now = Date.now()) => !!k && hot.has(k.id) && now - k.lastSeen < 3 * 60_000;

/** Heartbeat des Agenten: Gerät anlegen/aktualisieren, ausstehende Änderungen zurückgeben. */
export function heartbeat(id, body = {}) {
  if (!kiosks[id]) kiosks[id] = blank(id);
  const k = kiosks[id];
  k.lastSeen = Date.now();
  k.info = {
    hostname: String(body.hostname || '').slice(0, 64),
    ip: String(body.ip || '').slice(0, 64),
    model: String(body.model || '').slice(0, 80),
    // Gerät und Systemvariante (Buildroot, Raspberry Pi OS, Armbian) und welche Update-Pakete passen
    platform: sanitizePlatform(body.platform, body.slot),
    agent: String(body.agent || '').slice(0, 20),
    // Vorhandene Browser (fehlt bei älteren Agenten → Oberfläche bietet alle an)
    engines: Array.isArray(body.engines) ? body.engines.filter((e) => ['cog', 'chromium'].includes(e)) : null,
    ssid: String(body.ssid || '').slice(0, 64),
    serverUrl: String(body.serverUrl || '').slice(0, 200),
    uptime: Number(body.uptime) || 0,
    // Systemabbild (Buildroot): Version, laufender Systemplatz, Stand eines laufenden Updates
    system: String(body.system || '').slice(0, 40),
    slot: ['a', 'b'].includes(body.slot) ? body.slot : null,
    update: sanitizeUpdate(body.update),
    // Stromversorgung und Temperatur (Unterspannung = Netzteil/USB-Anschluss zu schwach)
    power: body.power
      ? {
          undervoltage: body.power.undervoltage === true,
          undervoltageSeen: body.power.undervoltageSeen === true,
          temp: Number.isFinite(body.power.temp) ? body.power.temp : null,
          // Hitzeschutz des Geräts: Stufe, auf die es seinen Prozessor gedrosselt hat (0 = frei)
          throttle: Number.isInteger(body.power.throttle) ? Math.max(0, Math.min(3, body.power.throttle)) : 0,
        }
      : null,
  };
  // Zu heiß? Dann pausiert die Tischanzeige ihre Belebung (siehe hotFor). Mit Abstand beim Zurückschalten.
  const temp = k.info.power?.temp;
  if (Number.isFinite(temp)) {
    const seen = temp >= HOT_AT ? (hotSeen.get(id) || 0) + 1 : 0;
    hotSeen.set(id, seen);
    if (seen >= 2) hot.add(id);
    else if (temp <= HOT_AT - HOT_BACK) hot.delete(id);
  }
  if (Number.isInteger(body.rev)) k.reportedRev = body.rev;
  let ack = null;
  if (body.localChange && body.config) {
    // Am Gerät geändert (Einrichtungsmodus): Stand übernehmen, Passwörter bleiben auf dem Gerät
    k.desired = fromDevice(body.config, Math.max(k.desired.rev, Number(body.rev) || 0) + 1);
    k.reportedRev = k.desired.rev;
    ack = k.desired.rev;
  } else if (k.desired.rev === 0 && body.config) {
    // Beim ersten Kontakt die Einstellungen des Geräts übernehmen (ohne Passwörter) –
    // so gehen z.B. Monitordaten auch bei einem neu aufgesetzten Server nicht verloren
    k.desired = fromDevice(body.config, Number(body.rev) || 0);
  }
  const commands = k.commands;
  k.commands = [];
  save();
  const needsUpdate = k.desired.rev > k.reportedRev;
  return { desired: needsUpdate ? k.desired : null, commands: commands.map((c) => c.cmd), ack };
}

const OS_VARIANTS = ['buildroot', 'raspios', 'armbian', 'linux'];

/** Plattform des Geräts. Ältere Agenten (vor 1.8) melden sie nicht: mit Systemplätzen ist es die Buildroot-Variante des Pi Zero 2 W. */
function sanitizePlatform(p, slot) {
  const legacy = ['a', 'b'].includes(slot) ? 'zero2w' : null;
  if (!p || typeof p !== 'object') return { board: '', os: legacy ? 'buildroot' : '', updates: legacy };
  const updates = typeof p.updates === 'string' && /^[\w.-]{1,40}$/.test(p.updates) ? p.updates : null;
  return {
    board: String(p.board || '').slice(0, 80),
    os: OS_VARIANTS.includes(p.os) ? p.os : '',
    updates,
  };
}

/**
 * Leistungsprofil der Tischanzeige: „low“ für Raspberry Pi bis Modell 3 / Zero 2 W (VideoCore IV – Nebel gedrosselt,
 * 30 Bilder/s), „high“ für alles mit modernerem Grafikchip (Orange Pi Zero 2W, Pi 4/5). Unbekannt → „low“.
 */
export function performanceFor(k) {
  const board = k?.info?.platform?.board || '';
  if (!board) return 'low';
  // z.B. raspberrypi,model-zero-2-w · raspberrypi,3-model-b-plus · raspberrypi,model-b-plus (Pi 1)
  if (/^raspberrypi,(model-zero|model-[ab]|[0-3]-)/.test(board)) return 'low';
  return 'high';
}

/** Passt ein Update-Paket (manifest → board) zu diesem Gerät? */
export const acceptsUpdate = (k, pkg) => Boolean(pkg && k?.info?.platform?.updates && pkg.board === k.info.platform.updates);

function sanitizeUpdate(u) {
  if (!u || typeof u !== 'object') return null;
  const state = ['idle', 'download', 'install', 'reboot', 'trial', 'done', 'error'].includes(u.state) ? u.state : 'idle';
  return {
    state,
    version: String(u.version || '').slice(0, 40),
    progress: Math.max(0, Math.min(100, Number(u.progress) || 0)),
    message: String(u.message || '').slice(0, 300),
  };
}

/** Browser-Einstellungen des Geräts prüfen (Engine, Grafikbeschleunigung, Zusatz-Flags). */
function sanitizeBrowser(b = {}) {
  return {
    engine: b?.engine === 'chromium' ? 'chromium' : 'cog',
    gpu: ['on', 'off'].includes(b?.gpu) ? b.gpu : 'auto',
    // Obergrenze der Bildrate: 30 schont den Grafikchip (weniger Wärme), „auto“ = Vorgabe des Geräts
    fps: [30, 60].includes(Number(b?.fps)) ? Number(b.fps) : 'auto',
    flags: String(b?.flags || '')
      .replace(/[^A-Za-z0-9 \-_=,.:/]/g, '')
      .slice(0, 500)
      .split(/\s+/)
      .filter((t) => t.startsWith('--'))
      .join(' '),
  };
}

/** Geräte-Einstellungen aus einer Meldung des Agenten (Passwörter bleiben auf dem Gerät). */
function fromDevice(config, rev) {
  return {
    rev,
    serverUrl: String(config.serverUrl || ''),
    hostname: String(config.hostname || ''),
    country: String(config.country || 'DE'),
    wifi: (config.wifi || []).map((w) => ({ ssid: String(w.ssid || ''), psk: null, keep: true })),
    monitor: config.monitor ? sanitizeTable(config.monitor, getSettings().table) : null,
    browser: sanitizeBrowser(config.browser),
  };
}

/** Kalibrierung für die Anzeige eines Geräts: eigene Monitordaten oder die globalen. */
export function calibrationFor(k) {
  return k.desired.monitor ? sanitizeTable(k.desired.monitor, getSettings().table) : null;
}

/** Änderungen aus der Oberfläche übernehmen. */
export function update(id, patch = {}) {
  const k = kiosks[id];
  if (!k) return null;
  if (typeof patch.name === 'string') k.name = patch.name.trim().slice(0, 60) || k.name;
  if (patch.display) {
    const mode = ['player', 'calibrate'].includes(patch.display.mode) ? patch.display.mode : 'table';
    k.display = { campaignId: patch.display.campaignId || null, mode };
  }
  if (patch.desired) {
    const d = patch.desired;
    const old = k.desired;
    const wifi = Array.isArray(d.wifi)
      ? d.wifi
          .filter((w) => w && String(w.ssid || '').trim())
          .map((w) => {
            const ssid = String(w.ssid).trim().slice(0, 64);
            // Leeres Passwort = bisheriges Passwort für dieses Netz beibehalten
            const prev = old.wifi.find((o) => o.ssid === ssid);
            const psk = w.psk ? String(w.psk).slice(0, 64) : prev?.psk ?? null;
            return { ssid, psk, keep: !w.psk && (prev?.keep || false) };
          })
      : old.wifi;
    k.desired = {
      rev: old.rev + 1,
      serverUrl: typeof d.serverUrl === 'string' ? d.serverUrl.trim().slice(0, 200) : old.serverUrl,
      hostname: typeof d.hostname === 'string' ? d.hostname.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) : old.hostname,
      country: typeof d.country === 'string' ? d.country.trim().toUpperCase().slice(0, 2) || 'DE' : old.country,
      wifi,
      monitor: d.monitor === null ? null : d.monitor ? sanitizeTable(d.monitor, getSettings().table) : old.monitor ?? null,
      browser: d.browser ? sanitizeBrowser(d.browser) : old.browser ?? sanitizeBrowser(),
    };
  }
  save();
  return publicView(k);
}

export function command(id, cmd) {
  const k = kiosks[id];
  if (!k) return false;
  if (cmd === 'reload') {
    // Wird von der Kiosk-Seite im Browser selbst erkannt
    k.reloadToken = Date.now();
  } else {
    k.commands.push({ cmd, at: Date.now() });
  }
  save();
  return true;
}

export function remove(id) {
  if (!kiosks[id]) return false;
  delete kiosks[id];
  save();
  return true;
}
