// Gastzugang zum Regelwerk: Spieler öffnen /regeln auf ihrem Handy und geben einen vierstelligen Code ein, den die
// Spielleitung herausgibt. Der Code wechselt von selbst (täglich, wöchentlich oder nur von Hand); mit jedem neuen Code
// verlieren alle bisherigen Gäste den Zugang – wer nicht am Tisch sitzt, kommt also nicht dauerhaft hinein.
// Gäste dürfen nur im Regelwerk suchen, Regeln lesen und der KI Fragen stellen, sonst nichts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './store.js';

const FILE = path.join(DATA_DIR, 'guest.json');
export const ROTATIONS = ['daily', 'weekly', 'manual'];
/** Stunde, zu der täglich bzw. wöchentlich (montags) ein neuer Code gilt – mitten in der Nacht. */
export const ROTATE_HOUR = 5;
export const COOKIE = 'tf_guest';

let st = null;

const newCode = (old) => {
  for (;;) {
    const c = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    if (c !== old) return c;
  }
};

function load() {
  if (st) return st;
  try {
    st = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    st = null;
  }
  if (!st || !/^\d{4}$/.test(st.code || '') || !st.secret) {
    st = { enabled: true, rotation: 'daily', code: newCode(), gen: 1, rotatedAt: Date.now(), secret: crypto.randomBytes(32).toString('hex') };
    save();
  }
  return st;
}
function save() {
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(st, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

/** Wann der aktuelle Code abläuft (ms) – null bei „nur von Hand“. */
export function expiresAt(s = load()) {
  if (s.rotation === 'manual') return null;
  const d = new Date(s.rotatedAt);
  d.setHours(ROTATE_HOUR, 0, 0, 0);
  if (d.getTime() <= s.rotatedAt) d.setDate(d.getDate() + 1);
  if (s.rotation === 'weekly') while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Abgelaufenen Code ersetzen. Liefert den Zustand. */
function fresh(now = Date.now()) {
  const s = load();
  const until = expiresAt(s);
  if (until !== null && now >= until) rotate(now);
  return st;
}

/** Neuer Code: alle bisherigen Gäste sind draußen. */
export function rotate(now = Date.now()) {
  const s = load();
  s.code = newCode(s.code);
  s.gen += 1;
  s.rotatedAt = now;
  save();
  return config();
}

/** Für die Spielleitung: Code, Wechselrhythmus und wann er wechselt. */
export function config() {
  const s = fresh();
  return { enabled: !!s.enabled, code: s.code, rotation: s.rotation, expiresAt: expiresAt(s) };
}

export function setConfig({ enabled, rotation } = {}) {
  const s = load();
  if (enabled !== undefined) {
    // Wieder einschalten heißt neuer Code: wer vorher drin war, muss neu fragen
    if (enabled && !s.enabled) (s.code = newCode(s.code)), (s.gen += 1), (s.rotatedAt = Date.now());
    s.enabled = !!enabled;
  }
  if (rotation !== undefined && ROTATIONS.includes(rotation) && rotation !== s.rotation) {
    s.rotation = rotation;
    s.rotatedAt = Date.now(); // ab jetzt neu zählen, der Code bleibt
  }
  save();
  return config();
}

const sign = (gen) => crypto.createHmac('sha256', load().secret).update(`guest:${gen}`).digest('base64url');

/** Cookie-Wert für den aktuellen Code. */
export const token = () => `${fresh().gen}.${sign(st.gen)}`;

/** Gilt der Cookie-Wert noch (Zugang an, Code seither nicht gewechselt)? */
export function valid(tok) {
  const s = fresh();
  if (!s.enabled || !tok) return false;
  const [gen, mac] = String(tok).split('.');
  if (Number(gen) !== s.gen || !mac) return false;
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(s.gen));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Stimmt der eingegebene Code? (Bremse gegen Durchprobieren macht der Aufrufer.) */
export function check(code) {
  const s = fresh();
  if (!s.enabled) return false;
  const a = Buffer.from(String(code ?? '').trim());
  const b = Buffer.from(s.code);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Wie lange der Cookie halten soll (ms): bis zum Wechsel, bei „nur von Hand“ 30 Tage. */
export function cookieMs(now = Date.now()) {
  const until = expiresAt(fresh(now));
  return until === null ? 30 * 24 * 3600 * 1000 : Math.max(60_000, until - now);
}

/** Cookie aus dem Header lesen. */
export function fromCookie(header) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// --- Bremse für Fragen an die KI: je Gast höchstens 20 Fragen in 10 Minuten -------------------------------------------
const asked = new Map(); // Schlüssel → Zeitpunkte
export function askAllowed(key, now = Date.now(), max = 20, windowMs = 10 * 60_000) {
  const list = (asked.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    asked.set(key, list);
    return Math.ceil((windowMs - (now - list[0])) / 1000);
  }
  list.push(now);
  asked.set(key, list);
  if (asked.size > 2000) asked.delete(asked.keys().next().value);
  return 0;
}
