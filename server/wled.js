// WLED-Steuerung: LED-Streifen (z.B. am Tisch, an der Decke) reagieren aufs Spiel. Spricht die JSON-API von WLED an
// (http://<gerät>/json/state). Effekte werden über ihren Namen aus der Effektliste des Geräts gesucht – so
// passt es zu jeder WLED-Version.
//
// Zwei Wege: „Live“ (Standard) – der Server berechnet jedes Bild selbst und streamt es per DDP (wled-stream.js,
// Effekte in wled-fx.js), mit weichen Überblendungen; oder klassisch über die JSON-API mit WLEDs eigenen Effekten.
//
// Mehrere Geräte: Jeder Streifen folgt entweder der Automatik oder hält eine feste Stimmung (z.B. Leselicht an der Decke).
// Automatik (Vorrang von oben nach unten): Tisch verdunkelt → „Pause“, Kampf läuft → „Kampf“, von Hand gewählte
// Stimmung, Stimmung der Tischkarte, Grundstimmung des Streifens.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './store.js';
import { gradient, stars, vary, toWledList } from './wled-patterns.js';
import { LIVE, still } from './wled-fx.js';
import * as live from './wled-stream.js';

const FILE = path.join(DATA_DIR, 'wled.json');

/**
 * Stimmungen. Die meisten sind ruhende Muster (pattern: Farbe je LED, vom Server berechnet) – weich, ohne Flackern,
 * rundum gleichmäßig und unabhängig von der WLED-Version. Nur wo Bewegung dazugehört (Feuer, Kerzen, Wasser, Gewitter,
 * Kampf), läuft ein langsamer WLED-Effekt; die Palette wird dabei ausdrücklich gesetzt, sonst nehmen manche Effekte
 * ihre eigene Regenbogen-Palette.
 * bri: Helligkeit relativ zur Obergrenze des Streifens (0–1).
 */
const GREEN = [[18, 92, 22], [46, 120, 18], [10, 70, 30], [80, 128, 24], [24, 100, 48]];
export const MOODS = {
  read: { name: 'Leselicht (hell, warmweiß)', pattern: () => [[255, 196, 130]], bri: 1 },
  warm: { name: 'Taverne (warmes Licht)', pattern: (n) => vary(gradient([[255, 140, 50], [255, 118, 34], [255, 158, 72]], n, 45), 0.06), bri: 0.75 },
  candle: { name: 'Kerzenschein', fx: 'Candle Multi', pal: 'color1', col: [[255, 125, 35], [70, 20, 0]], sx: 70, ix: 120, bri: 0.6 },
  fire: { name: 'Lagerfeuer', fx: 'Candle Multi', pal: 'color1', col: [[255, 80, 0], [90, 12, 0]], sx: 100, ix: 165, bri: 0.85 },
  forest: { name: 'Wald', pattern: (n) => vary(gradient(GREEN, n, 50), 0.12), bri: 0.65 },
  cave: { name: 'Höhle / Dungeon', pattern: (n) => gradient([[14, 22, 70], [4, 8, 26], [26, 14, 52], [8, 18, 44]], n, 70), bri: 0.5 },
  night: { name: 'Nacht', pattern: (n) => stars(gradient([[6, 10, 48], [12, 16, 70], [4, 8, 36]], n, 80), [200, 210, 255], { every: 11 }), bri: 0.55 },
  storm: { name: 'Gewitter', fx: 'Lightning', pal: 'color1', col: [[210, 215, 255], [6, 8, 28]], sx: 90, ix: 60, bri: 0.9 },
  magic: { name: 'Magie', pattern: (n) => gradient([[110, 40, 230], [40, 150, 230], [200, 50, 190]], n, 60), bri: 0.7 },
  water: { name: 'Unterwasser', fx: 'Pacifica', sx: 35, ix: 128, bri: 0.6 },
  combat: { name: 'Kampf', fx: 'Breathe', pal: 'color1', col: [[255, 0, 0], [60, 0, 0]], sx: 90, bri: 1 },
  // Pause: langsames goldenes Atmen. Der Server blendet selbst zwischen Gold und gedämpftem Gold hin und her (WLED-
  // Farbübergang, je 5 s) – WLEDs „Breathe“ geht nicht so langsam, und ganz hell griff dort die Strombegrenzung ein.
  pause: { name: 'Pause', pulse: { a: [225, 170, 20], b: [150, 108, 0], ms: 5000 }, bri: 0.45 },
  off: { name: 'Aus', off: true },
};

// Paletten mit festen Nummern in jeder WLED-Version: „* Color 1“ = nur Farbe 1 (Hintergrund Farbe 2)
const PALETTES = { color1: 2, colors12: 3, gradient: 4 };

const DEVICE_DEFAULTS = {
  name: 'LED-Streifen',
  enabled: true,
  host: '', // z.B. 192.168.1.50
  brightness: 160, // 1–255 – Obergrenze, die Stimmungen skalieren darunter
  mode: 'auto', // 'auto' = folgt dem Spiel, sonst fester Stimmungs-Schlüssel (z.B. 'read')
  stream: true, // Live-Übertragung vom Server (sonst JSON-API mit WLED-Effekten)
  idleMood: 'warm',
  auto: { blackout: true, combat: true, maps: true },
};

const newId = () => crypto.randomBytes(4).toString('hex');

/** Geräteadresse prüfen: Hostname oder IP, optional mit Port – nichts anderes. */
export function sanitizeHost(host) {
  const h = String(host || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  return /^[a-z0-9.-]{1,120}(:\d{1,5})?$/i.test(h) ? h : '';
}

function sanitizeDevice(d = {}) {
  return {
    id: /^[a-z0-9]{1,16}$/i.test(String(d.id || '')) ? String(d.id) : newId(),
    name: String(d.name || '').trim().slice(0, 60) || DEVICE_DEFAULTS.name,
    enabled: d.enabled !== false,
    host: sanitizeHost(d.host),
    brightness: Math.max(1, Math.min(255, Math.round(Number(d.brightness) || DEVICE_DEFAULTS.brightness))),
    mode: d.mode === 'auto' || !MOODS[d.mode] ? 'auto' : d.mode,
    stream: d.stream !== false,
    idleMood: MOODS[d.idleMood] ? d.idleMood : DEVICE_DEFAULTS.idleMood,
    auto: {
      blackout: d.auto?.blackout !== false,
      combat: d.auto?.combat !== false,
      maps: d.auto?.maps !== false,
    },
  };
}

let devices = [];
try {
  const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  // Ältere Fassung (ein Gerät direkt in der Datei) übernehmen
  const list = Array.isArray(saved.devices) ? saved.devices : saved.host ? [{ ...saved, name: 'Tisch', enabled: !!saved.enabled }] : [];
  devices = list.map(sanitizeDevice);
} catch {
  /* noch nicht eingerichtet */
}

const runtime = new Map(); // id → { current, error, dev: { host, effects, leds } }
const rt = (id) => runtime.get(id) || runtime.set(id, { current: null, error: '', dev: null }).get(id);
const auto = { manual: null, mapId: null }; // von Hand gewählte Stimmung gilt bis zum nächsten Kartenwechsel
let lastCampaign = null;
let onStatus = () => {};

/** Rückruf für Statusänderungen (z.B. an alle Oberflächen senden). */
export const setStatusListener = (fn) => (onStatus = fn);

const active = (d) => d.enabled && d.host;

export function status() {
  return {
    devices: devices.map((d) => ({ ...d, current: rt(d.id).current, error: rt(d.id).error })),
    moods: Object.entries(MOODS).map(([key, m]) => ({ key, name: m.name })),
    manual: auto.manual,
    // Gibt es Streifen, die dem Spiel folgen? (sonst braucht die Schnellauswahl beim Spielen nicht zu erscheinen)
    hasAuto: devices.some((d) => active(d) && d.mode === 'auto'),
  };
}

export function saveConfig(next = {}) {
  devices = (Array.isArray(next.devices) ? next.devices : []).slice(0, 20).map(sanitizeDevice);
  fs.writeFileSync(FILE, JSON.stringify({ devices }, null, 2));
  for (const id of runtime.keys()) {
    if (!devices.some((d) => d.id === id)) {
      runtime.delete(id);
      live.stop(id);
    }
  }
  for (const d of devices) {
    Object.assign(rt(d.id), { current: null, dev: null, live: false }); // neu senden
    if (!d.stream || !active(d)) live.stop(d.id);
  }
  refresh();
  return status();
}

async function request(host, pathName, body) {
  const res = await fetch(`http://${host}${pathName}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`WLED antwortet mit ${res.status}`);
  return res.json();
}

/** Verbindung testen: Name, Version und LED-Anzahl des Geräts unter dieser Adresse. */
export async function info(host) {
  const h = sanitizeHost(host);
  if (!h) throw new Error('Keine gültige Adresse');
  const i = await request(h, '/json/info');
  return { name: i.name, version: i.ver, leds: i.leds?.count, ip: i.ip };
}

/** Effektliste und Länge des (ersten) Segments eines Geräts – einmal je Adresse gelesen. */
async function deviceData(d) {
  const r = rt(d.id);
  if (!r.dev || r.dev.host !== d.host) {
    const [effects, state, info] = await Promise.all([request(d.host, '/json/effects'), request(d.host, '/json/state'), request(d.host, '/json/info')]);
    const seg = state?.seg?.[0];
    const leds = seg ? (seg.len ?? seg.stop - seg.start) : info?.leds?.count;
    const clampLeds = (v) => Math.max(1, Math.min(2000, Number(v) || 60));
    r.dev = {
      host: d.host,
      effects: new Map(effects.map((n, i) => [String(n).toLowerCase(), i])),
      leds: clampLeds(leds), // erstes Segment (JSON-Weg)
      total: clampLeds(info?.leds?.count ?? leds), // ganzer Streifen (Live-Übertragung)
    };
  }
  return r.dev;
}

const FADE_MS = 2000; // Überblendung zwischen Stimmungen

/**
 * WLED-Zustände für eine Stimmung: { now, later? }. Ruhende Muster kommen in zwei Schritten: erst weich auf die
 * Durchschnittsfarbe des Musters überblenden (einfarbig), danach die Farben je LED setzen. Direkt zusammen mit
 * einem Effektwechsel gesendet, löscht WLED die LED-Farben beim Zurücksetzen des Effekts wieder – der Streifen blieb
 * dann dunkel.
 */
async function statesFor(d, m) {
  if (m.off) return { now: { on: false, transition: FADE_MS / 100 } };
  const base = { on: true, bri: Math.max(20, Math.round(d.brightness * (m.bri ?? 1))), transition: FADE_MS / 100 };
  const dev = await deviceData(d);
  if (m.pulse) return { now: { ...base, seg: [{ id: 0, frz: false, fx: 0, pal: 0, col: [m.pulse.b, [0, 0, 0], [0, 0, 0]] }] } };
  if (m.pattern) {
    const colors = m.pattern(dev.leds);
    const avg = [0, 1, 2].map((j) => Math.round(colors.reduce((sum, c) => sum + c[j], 0) / colors.length));
    const now = { ...base, seg: [{ id: 0, frz: false, fx: 0, pal: 0, col: [avg, [0, 0, 0], [0, 0, 0]] }] };
    // Einfarbig ist mit dem ersten Schritt schon fertig
    if (colors.every((c) => c.join() === colors[0].join())) return { now };
    return { now, later: { seg: [{ id: 0, i: toWledList(colors) }] } };
  }
  const fx = dev.effects.get(m.fx.toLowerCase()) ?? 0; // unbekannter Effekt → „Solid“
  return {
    now: {
      ...base,
      seg: [{ id: 0, frz: false, fx, sx: m.sx ?? 128, ix: m.ix ?? 128, pal: PALETTES[m.pal] ?? 0, col: [...(m.col || [[255, 255, 255]]), [0, 0, 0], [0, 0, 0]].slice(0, 3) }],
    },
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Atmen: abwechselnd zur hellen und zur dunklen Farbe überblenden, bis eine andere Stimmung kommt. */
async function pulse(d, { a, b, ms }, seq) {
  const r = rt(d.id);
  await wait(FADE_MS + 100); // erst die Überblendung in die Pause abwarten
  for (let up = true; r.seq === seq && active(d); up = !up) {
    try {
      await request(d.host, '/json/state', { transition: Math.round(ms / 100), seg: [{ id: 0, col: [up ? a : b, [0, 0, 0], [0, 0, 0]] }] });
    } catch {
      /* einzelner Aussetzer – beim nächsten Atemzug weiter */
    }
    await wait(ms + 150); // kurz verweilen, damit der nächste Übergang nicht mitten in den laufenden fällt
  }
}

/** Live-Weg: Quelle für den Strom setzen; der Server blendet vom aktuellen Bild weich über. */
async function applyLive(d, key, m, r) {
  const { total: n } = await deviceData(d);
  const onError = (err) => {
    r.error = `Live-Übertragung gestört (${err.message})`;
    onStatus(status());
  };
  const host = d.host.replace(/:\d+$/, ''); // DDP hat einen festen Port, die HTTP-Portangabe gilt dafür nicht
  if (m.off) {
    // Zu Schwarz überblenden, dann wirklich ausschalten (sonst kehrte WLED nach dem Strom zu seinem Bild zurück)
    live.play(d.id, {
      host,
      n,
      source: still([[0, 0, 0]]),
      level: 0,
      still: true,
      onError,
      onFaded: () => {
        live.stop(d.id);
        r.live = false;
        request(d.host, '/json/state', { on: false }).catch(() => {});
      },
    });
    return;
  }
  const source = LIVE[key] ? LIVE[key](n) : still(m.pattern ? m.pattern(n) : [m.col?.[0] || [255, 255, 255]]);
  live.play(d.id, { host, n, source, level: (d.brightness / 255) * (m.bri ?? 1), still: !LIVE[key], onError });
  if (!r.live) {
    // Helligkeit macht der Server selbst (in den Bilddaten), WLED läuft dafür auf voller Helligkeit
    await request(d.host, '/json/state', { on: true, bri: 255, transition: 0 });
    r.live = true;
  }
}

/** Stimmung an ein Gerät senden (nur wenn sie sich geändert hat). */
async function applyMood(d, key) {
  const m = MOODS[key];
  const r = rt(d.id);
  if (!m || !active(d) || r.current === key) return;
  r.current = key; // sofort merken, damit schnelle Änderungen nicht doppelt senden
  const seq = (r.seq = (r.seq || 0) + 1); // neuere Stimmung bricht den zweiten Schritt einer älteren ab
  try {
    if (d.stream) {
      await applyLive(d, key, m, r);
      r.error = '';
      onStatus(status());
      return;
    }
    const { now, later } = await statesFor(d, m);
    await request(d.host, '/json/state', now);
    if (later) {
      await wait(FADE_MS + 300);
      if (r.seq === seq) await request(d.host, '/json/state', later);
    }
    r.error = '';
    if (m.pulse) pulse(d, m.pulse, seq);
  } catch (err) {
    if (r.seq === seq) {
      r.current = null; // beim nächsten Mal erneut versuchen
      r.dev = null;
      r.live = false;
      r.error = `nicht erreichbar (${err.message})`;
    }
  }
  onStatus(status());
}

/** Gewünschte Stimmung eines Geräts für den aktuellen Spielstand. */
function moodFor(d, campaign) {
  if (d.mode !== 'auto') return d.mode;
  const t = campaign?.display?.table || {};
  let mood = d.idleMood;
  const mapMood = campaign?.maps?.[t.mapId]?.ledMood;
  if (d.auto.maps && MOODS[mapMood]) mood = mapMood;
  if (auto.manual) mood = auto.manual;
  if (d.auto.combat && campaign?.initiative?.started) mood = 'combat';
  if (d.auto.blackout && t.blackout) mood = 'pause';
  return mood;
}

function refresh() {
  return Promise.all(devices.filter(active).map((d) => applyMood(d, moodFor(d, lastCampaign))));
}

/** Von Hand gewählte Stimmung für alle Streifen mit Automatik (gilt bis zum nächsten Kartenwechsel; null = Automatik). */
export function setManual(key, campaign) {
  auto.manual = MOODS[key] ? key : null;
  if (campaign) lastCampaign = campaign;
  return refresh();
}

/** Nach jeder Änderung einer Kampagne: gewünschte Stimmungen bestimmen und bei Bedarf senden. */
export function update(campaign) {
  if (!campaign || !devices.some(active)) return;
  const t = campaign.display?.table || {};
  if (t.mapId !== auto.mapId) {
    // Kartenwechsel: Stimmung der neuen Karte gilt wieder (Handwahl verfällt)
    if (auto.mapId !== null) auto.manual = null;
    auto.mapId = t.mapId;
  }
  lastCampaign = campaign;
  return refresh();
}
