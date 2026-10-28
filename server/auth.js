// Anmeldung: Benutzerkonten (Spielleitung), freigegebene Anzeigegeräte und Kopplung per QR-Code.
//
// Solange es kein Konto gibt, ist alles offen wie früher (Heimnetz). Mit dem ersten Konto ist der Schutz aktiv:
// – Personen melden sich mit Name und Passwort an (Sitzung per Cookie, 30 Tage, verlängert sich bei Nutzung).
// – Anzeigen (Spieltisch, Spieler-Display, Kiosk) werden einmal gekoppelt: Sie zeigen einen Code und QR-Code,
//   die Spielleitung bestätigt ihn am Handy. Danach bleiben sie angemeldet, bis die Freigabe entzogen wird.
// Das erste Konto lässt sich nur mit dem Einrichtungscode aus dem Server-Protokoll anlegen – so kann niemand
// sonst einen frisch ins Internet gestellten Server übernehmen.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './store.js';

const FILE = path.join(DATA_DIR, 'auth.json');
export const COOKIE = 'dnd_auth';
const USER_SESSION_MS = 30 * 24 * 3600 * 1000;
const PAIR_MS = 15 * 60 * 1000; // so lange gilt ein Kopplungscode
const KIOSK_TOKEN_MS = 10 * 60 * 1000; // Anmeldung des Kiosk-Browsers nach dem Start
export const ROLES = { admin: 'Admin', dm: 'Spielleitung' };

let db = { users: [], sessions: [], devices: [] };
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
} catch {
  /* noch keine Konten */
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}
export function flush() {
  clearTimeout(saveTimer);
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const newId = () => crypto.randomBytes(6).toString('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Schutz aktiv, sobald es mindestens ein Konto gibt. */
export const active = () => db.users.length > 0;

// --- Einrichtungscode für das erste Konto ------------------------------------------------

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne verwechselbare Zeichen (0/O, 1/I)
const randomCode = (n) => Array.from(crypto.randomBytes(n), (x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
const SETUP_CODE = String(process.env.SETUP_CODE || `${randomCode(4)}-${randomCode(4)}`).trim().toUpperCase();
export function announceSetup() {
  if (active()) return;
  console.log('──────────────────────────────────────────────────────────────');
  console.log(' Anmeldung ist noch nicht eingerichtet – die App ist offen für alle im Netz.');
  console.log(` Erstes Konto anlegen unter /login.html mit dem Einrichtungscode:  ${SETUP_CODE}`);
  console.log('──────────────────────────────────────────────────────────────');
}

// --- Passwörter ------------------------------------------------------------------------

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT).toString('hex');
  return { salt, hash };
}
const checkPassword = (user, password) => safeEqual(hashPassword(password, user.salt).hash, user.hash);

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Das Passwort braucht mindestens 8 Zeichen.';
  if (pw.length > 200) return 'Das Passwort ist zu lang.';
  return null;
}
const cleanName = (n) => String(n || '').trim().slice(0, 40);

// --- Fehlversuche bremsen --------------------------------------------------------------

const failures = new Map(); // Schlüssel (IP + Name) → { count, until }
export function loginBlocked(key) {
  const f = failures.get(key);
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}
function loginFailed(key) {
  const f = failures.get(key) || { count: 0, until: 0 };
  f.count += 1;
  // Ab dem 5. Fehlversuch zunehmend länger sperren (1, 2, 4 … bis 15 Minuten)
  if (f.count >= 5) f.until = Date.now() + Math.min(15 * 60, 60 * 2 ** (f.count - 5)) * 1000;
  failures.set(key, f);
}

// --- Konten ----------------------------------------------------------------------------

const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role, createdAt: u.createdAt, lastLogin: u.lastLogin || null });
export const listUsers = () => db.users.map(publicUser);
const findUser = (id) => db.users.find((u) => u.id === id);

export function createUser({ name, password, role }) {
  const n = cleanName(name);
  if (!n) throw new Error('Bitte einen Namen angeben.');
  if (db.users.some((u) => u.name.toLowerCase() === n.toLowerCase())) throw new Error('Diesen Namen gibt es schon.');
  const err = validatePassword(password);
  if (err) throw new Error(err);
  const user = { id: newId(), name: n, role: ROLES[role] ? role : 'dm', ...hashPassword(password), createdAt: Date.now() };
  db.users.push(user);
  save();
  return publicUser(user);
}

/** Erstes Konto (immer Admin) – nur mit dem Einrichtungscode. */
export function setupFirstUser({ code, name, password }) {
  if (active()) throw new Error('Die Anmeldung ist bereits eingerichtet.');
  if (!safeEqual(String(code || '').trim().toUpperCase(), SETUP_CODE)) throw new Error('Der Einrichtungscode stimmt nicht (er steht im Protokoll des Servers).');
  const user = createUser({ name, password, role: 'admin' });
  onActivate?.();
  return user;
}
let onActivate = null;
/** Wird aufgerufen, wenn der Schutz eingeschaltet wird (erstes Konto). */
export const setActivateListener = (fn) => (onActivate = fn);

export function updateUser(id, { role, password, name }, actor) {
  const u = findUser(id);
  if (!u) throw new Error('Konto nicht gefunden.');
  if (role !== undefined && ROLES[role] && role !== u.role) {
    if (u.role === 'admin' && db.users.filter((x) => x.role === 'admin').length === 1) throw new Error('Es muss mindestens einen Admin geben.');
    u.role = role;
  }
  if (name !== undefined) {
    const n = cleanName(name);
    if (!n) throw new Error('Bitte einen Namen angeben.');
    if (db.users.some((x) => x !== u && x.name.toLowerCase() === n.toLowerCase())) throw new Error('Diesen Namen gibt es schon.');
    u.name = n;
  }
  if (password !== undefined) {
    const err = validatePassword(password);
    if (err) throw new Error(err);
    Object.assign(u, hashPassword(password));
    // Neues Passwort: alle anderen Sitzungen dieses Kontos beenden
    db.sessions = db.sessions.filter((s) => !(s.kind === 'user' && s.subject === u.id && s.id !== actor?.sessionId));
  }
  save();
  return publicUser(u);
}

export function deleteUser(id, actor) {
  const u = findUser(id);
  if (!u) throw new Error('Konto nicht gefunden.');
  if (u.id === actor?.userId) throw new Error('Das eigene Konto kann nicht gelöscht werden.');
  if (u.role === 'admin' && db.users.filter((x) => x.role === 'admin').length === 1) throw new Error('Es muss mindestens einen Admin geben.');
  db.users = db.users.filter((x) => x !== u);
  db.sessions = db.sessions.filter((s) => !(s.kind === 'user' && s.subject === id));
  save();
}

/** Eigenes Passwort ändern (altes Passwort nötig). */
export function changeOwnPassword(actor, oldPassword, newPassword) {
  const u = findUser(actor.userId);
  if (!u || !checkPassword(u, oldPassword)) throw new Error('Das bisherige Passwort stimmt nicht.');
  return updateUser(u.id, { password: newPassword }, actor);
}

// --- Sitzungen -------------------------------------------------------------------------

function createSession(kind, subject) {
  const token = randomToken();
  const now = Date.now();
  db.sessions.push({ id: newId(), tokenHash: sha256(token), kind, subject, createdAt: now, lastSeen: now });
  save();
  return token;
}

export function login(name, password, key) {
  const wait = loginBlocked(key);
  if (wait) throw new Error(`Zu viele Fehlversuche – bitte in ${wait} s erneut versuchen.`);
  const u = db.users.find((x) => x.name.toLowerCase() === cleanName(name).toLowerCase());
  // Auch ohne passendes Konto rechnen, damit die Antwortzeit nichts verrät
  const ok = u ? checkPassword(u, password) : (hashPassword(password), false);
  if (!ok) {
    loginFailed(key);
    throw new Error('Name oder Passwort stimmt nicht.');
  }
  failures.delete(key);
  u.lastLogin = Date.now();
  return createSession('user', u.id);
}

export function logout(token) {
  if (!token) return;
  const h = sha256(token);
  db.sessions = db.sessions.filter((s) => s.tokenHash !== h);
  save();
}

/**
 * Wer steckt hinter einem Cookie? { kind: 'user', userId, name, role } | { kind: 'device', deviceId, name } | null.
 * Ohne eingerichtete Anmeldung: { kind: 'open' } (alles erlaubt wie früher).
 */
export function resolve(token) {
  if (!active()) return { kind: 'open', role: 'admin', name: null };
  if (!token) return null;
  const h = sha256(token);
  const s = db.sessions.find((x) => x.tokenHash === h);
  if (!s) return null;
  const now = Date.now();
  if (s.kind === 'user') {
    const u = findUser(s.subject);
    if (!u || now - s.lastSeen > USER_SESSION_MS) {
      db.sessions = db.sessions.filter((x) => x !== s);
      save();
      return null;
    }
    touch(s, now);
    return { kind: 'user', userId: u.id, name: u.name, role: u.role, sessionId: s.id };
  }
  const d = db.devices.find((x) => x.id === s.subject);
  if (!d) return null;
  touch(s, now);
  if (now - (d.lastSeen || 0) > 60_000) {
    d.lastSeen = now;
    save();
  }
  return { kind: 'device', deviceId: d.id, name: d.name, kioskId: d.kioskId || null };
}
function touch(s, now) {
  // Nur gelegentlich schreiben
  if (now - s.lastSeen > 3600_000) {
    s.lastSeen = now;
    save();
  }
}

/** Cookie-Wert aus dem Header lesen. */
export function tokenFromCookie(header) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Cookie setzen (Secure über HTTPS, auch hinter einem Reverse-Proxy mit X-Forwarded-Proto). */
export function setCookie(req, res, token, maxAgeMs) {
  const parts = [`${COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
  if (req.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}
export const clearCookie = (req, res) => setCookie(req, res, '', 0);
export const USER_COOKIE_MS = USER_SESSION_MS;
export const DEVICE_COOKIE_MS = 400 * 24 * 3600 * 1000; // Browser begrenzen Cookies auf ~400 Tage

// --- Anzeigegeräte und Kopplung ----------------------------------------------------------

export const listDevices = () =>
  db.devices.map((d) => ({ id: d.id, name: d.name, kioskId: d.kioskId || null, createdAt: d.createdAt, lastSeen: d.lastSeen || null, approvedBy: d.approvedBy || null }));

export function renameDevice(id, name) {
  const d = db.devices.find((x) => x.id === id);
  if (!d) throw new Error('Gerät nicht gefunden.');
  d.name = cleanName(name) || d.name;
  save();
}

/** Freigabe entziehen: Gerät und seine Sitzungen löschen. Liefert die Kiosk-ID (falls ein Kiosk). */
export function revokeDevice(id) {
  const d = db.devices.find((x) => x.id === id);
  if (!d) throw new Error('Gerät nicht gefunden.');
  db.devices = db.devices.filter((x) => x !== d);
  db.sessions = db.sessions.filter((s) => !(s.kind === 'device' && s.subject === id));
  save();
  return d.kioskId || null;
}

/** Alle Freigaben eines Kiosks entziehen (z.B. wenn er gelöscht wird). */
export function revokeKiosk(kioskId) {
  for (const d of db.devices.filter((x) => x.kioskId === kioskId)) revokeDevice(d.id);
}

const pairs = new Map(); // geheime Kopplungs-ID → { code, created, kioskId, info, approved }

function sweepPairs() {
  const now = Date.now();
  for (const [id, p] of pairs) if (now - p.created > PAIR_MS) pairs.delete(id);
}

/** Anzeige möchte gekoppelt werden: liefert die geheime Kopplungs-ID (bleibt im Browser) und den Code. */
export function startPairing({ kioskId = null, info = {} } = {}) {
  sweepPairs();
  if (pairs.size > 500) throw new Error('Zu viele offene Kopplungen – bitte später erneut versuchen.');
  let code;
  do code = randomCode(6);
  while ([...pairs.values()].some((p) => p.code === code));
  const pairId = randomToken();
  pairs.set(pairId, { code, created: Date.now(), kioskId, info, approved: null });
  return { pairId, code, expiresIn: PAIR_MS / 1000 };
}

/** Offene Kopplung zu einem Code (für die Bestätigungsseite). */
export function pairingByCode(code) {
  sweepPairs();
  const c = String(code || '').trim().toUpperCase();
  for (const p of pairs.values()) if (p.code === c && !p.approved) return { code: p.code, kioskId: p.kioskId, info: p.info, created: p.created };
  return null;
}

/** Spielleitung bestätigt einen Code: Gerät anlegen. */
export function approvePairing(code, name, actor) {
  sweepPairs();
  const c = String(code || '').trim().toUpperCase();
  const p = [...pairs.values()].find((x) => x.code === c && !x.approved);
  if (!p) throw new Error('Code nicht gefunden oder abgelaufen – auf der Anzeige wird gleich ein neuer angezeigt.');
  const device = deviceFor({ name, kioskId: p.kioskId, actor });
  p.approved = device.id;
  return { id: device.id, name: device.name, kioskId: device.kioskId || null };
}

function deviceFor({ name, kioskId, actor }) {
  // Ein Kiosk hat genau einen Geräteeintrag (sein Browser meldet sich nach jedem Neustart neu an)
  let d = kioskId ? db.devices.find((x) => x.kioskId === kioskId) : null;
  if (!d) {
    d = { id: newId(), name: cleanName(name) || 'Anzeige', kioskId: kioskId || undefined, createdAt: Date.now(), approvedBy: actor?.name || null };
    db.devices.push(d);
  } else if (cleanName(name)) d.name = cleanName(name);
  save();
  return d;
}

/** Anzeige fragt nach: schon bestätigt? Dann Sitzung anlegen (Token fürs Cookie). */
export function pollPairing(pairId) {
  const p = pairs.get(String(pairId || ''));
  if (!p) return { state: 'expired' };
  if (!p.approved) return { state: 'waiting', code: p.code };
  pairs.delete(pairId);
  const d = db.devices.find((x) => x.id === p.approved);
  if (!d) return { state: 'expired' };
  return { state: 'approved', token: createSession('device', d.id), kioskId: d.kioskId || null };
}

export const isKioskPaired = (kioskId) => db.devices.some((d) => d.kioskId === kioskId);

/** Kiosk direkt freigeben (z.B. bestehende Kiosks beim Einschalten der Anmeldung). */
export const pairKiosk = (kioskId, name) => deviceFor({ name, kioskId, actor: null });

// Einmal-Anmeldung für den Browser eines freigegebenen Kiosks (der Agent holt sie mit seinem Geräteschlüssel)
const kioskTokens = new Map(); // Kiosk-ID → { tokenHash, created }
export function issueKioskBrowserToken(kioskId) {
  const token = randomToken();
  kioskTokens.set(kioskId, { tokenHash: sha256(token), created: Date.now() });
  return token;
}
export function redeemKioskBrowserToken(kioskId, token) {
  const t = kioskTokens.get(kioskId);
  if (!t || Date.now() - t.created > KIOSK_TOKEN_MS || !safeEqual(sha256(String(token || '')), t.tokenHash)) return null;
  kioskTokens.delete(kioskId);
  const d = db.devices.find((x) => x.kioskId === kioskId);
  return d ? createSession('device', d.id) : null;
}

// Geräteschlüssel der Kiosk-Agenten (nur der Hash wird gespeichert)
export const hashKey = (key) => sha256(`kiosk:${key}`);
export const keyMatches = (key, hash) => !!hash && safeEqual(hashKey(String(key || '')), hash);
