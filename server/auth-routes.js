// HTTP-Seite der Anmeldung: wer welche Seiten und Schnittstellen nutzen darf, Anmelden/Abmelden, Kopplung von
// Anzeigen per QR-Code und die Benutzerverwaltung. Regeln (sobald es ein Konto gibt):
//  – Seiten der Spielleitung und alle übrigen Schnittstellen: nur angemeldete Personen
//  – Anzeigeseiten (Spieltisch, Spieler-Display, Kiosk): Personen oder gekoppelte Geräte, sonst Kopplungsseite
//  – Geräte dürfen nur lesen, was eine Anzeige braucht (Einstellungen, Bilder, Kiosk-Zuweisung)
//  – Benutzerverwaltung: nur Admins
import qrcode from 'qrcode-generator';
import * as auth from './auth.js';

const DISPLAY_PAGES = new Set(['table', 'player', 'kiosk']);
const PUBLIC_PAGES = new Set(['login', 'pair']);
const USER_PAGES = new Set(['index', 'dm', 'prep', 'settings', 'users', 'approve', 'ai']);

// Schnittstellen ohne Anmeldung (eigene Prüfung im Handler, z.B. Geräteschlüssel des Kiosk-Agenten)
const isPublicApi = (req) =>
  req.path.startsWith('/api/auth/') ||
  req.path === '/api/version' ||
  (req.method === 'POST' && req.path === '/api/kiosks/heartbeat') ||
  (req.method === 'GET' && /^\/api\/kiosk-updates\/[^/]+\/download$/.test(req.path)) ||
  req.path === '/auth/kiosk';

// Nur für Admins: Benutzerverwaltung, Einstellungen der Dienste (Adressen, Schlüssel)
const adminOnly = (req) => req.path.startsWith('/api/users') || ['/api/ai/config', '/api/ai/test', '/api/basalt/config', '/api/basalt/test'].includes(req.path);

// Was gekoppelte Anzeigen lesen dürfen
const deviceAllowed = (req) =>
  (req.method === 'GET' || req.method === 'HEAD') && (req.path === '/api/settings' || /^\/api\/kiosks\/[^/]+\/display$/.test(req.path) || req.path.startsWith('/files/'));

const pageName = (p) => (p === '/' ? 'index' : p.replace(/^\//, '').replace(/\.html$/, ''));
const loginKey = (req, name) => `${req.ip}|${String(name || '').toLowerCase()}`;

/** Gleiche Herkunft? (Schutz gegen fremde Seiten, die Anfragen mit dem Cookie auslösen wollen) */
function sameOrigin(req, origin) {
  if (!origin) return true; // ältere Browser/Agenten ohne Origin – SameSite=Lax schützt dort
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

const fail = (res, status, error) => res.status(status).json({ error });
const errMsg = (err) => (err instanceof Error ? err.message : String(err));

/**
 * Anmeldung einbauen. Muss vor den statischen Dateien und allen anderen Routen stehen.
 * hooks.kiosks: Kiosk-Verwaltung (für Freigaben), hooks.onChange(): Oberflächen über Änderungen informieren.
 */
export function installAuth(app, { kiosks, onChange = () => {} }) {
  // Hinter einem Reverse-Proxy (HTTPS im Internet): dessen Angaben zu Protokoll und Absender-IP nutzen
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback, linklocal, uniquelocal');

  app.use((req, res, next) => {
    req.auth = auth.resolve(auth.tokenFromCookie(req.headers.cookie));
    next();
  });

  // --- Wächter ----------------------------------------------------------------------------
  app.use((req, res, next) => {
    const a = req.auth;
    if (a?.kind === 'open') return next();
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req, req.get('origin'))) return fail(res, 403, 'Anfrage von fremder Seite abgelehnt.');

    const isApi = req.path.startsWith('/api/') || req.path.startsWith('/files/') || req.path === '/auth/kiosk';
    if (isApi) {
      if (isPublicApi(req)) return next();
      if (a?.kind === 'user') {
        if (adminOnly(req) && a.role !== 'admin') return fail(res, 403, 'Nur für Admins.');
        return next();
      }
      if (a?.kind === 'device' && deviceAllowed(req)) return next();
      return fail(res, 401, a ? 'Für dieses Gerät nicht erlaubt.' : 'Bitte anmelden.');
    }

    // HTML-Seiten (statische Skripte, Styles und Bilder der Oberfläche sind frei – sie enthalten keine Daten)
    const name = pageName(req.path);
    if (req.method !== 'GET' || (!req.path.endsWith('.html') && req.path !== '/' && !/^\/[a-z-]+$/.test(req.path))) return next();
    if (PUBLIC_PAGES.has(name)) return next();
    const next_ = encodeURIComponent(req.originalUrl);
    if (DISPLAY_PAGES.has(name)) {
      if (a) return next();
      const kiosk = name === 'kiosk' && req.query.id ? `&kiosk=${encodeURIComponent(String(req.query.id))}` : '';
      return res.redirect(`/pair.html?next=${next_}${kiosk}`);
    }
    if (USER_PAGES.has(name)) {
      if (a?.kind === 'user') return next();
      return res.redirect(`/login.html?next=${next_}`);
    }
    next();
  });

  // --- Anmelden ---------------------------------------------------------------------------
  app.get('/api/auth/state', (req, res) => {
    const a = req.auth;
    res.json({
      active: auth.active(),
      me: a ? { kind: a.kind, name: a.name, role: a.role || null } : null,
      roles: auth.ROLES,
    });
  });

  app.post('/api/auth/setup', (req, res) => {
    try {
      const user = auth.setupFirstUser(req.body || {});
      auth.setCookie(req, res, auth.login(user.name, req.body.password, loginKey(req, user.name)), auth.USER_COOKIE_MS);
      onChange();
      res.json({ ok: true });
    } catch (err) {
      fail(res, 400, errMsg(err));
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const { name, password } = req.body || {};
    try {
      auth.setCookie(req, res, auth.login(name, password, loginKey(req, name)), auth.USER_COOKIE_MS);
      res.json({ ok: true });
    } catch (err) {
      fail(res, 401, errMsg(err));
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    auth.logout(auth.tokenFromCookie(req.headers.cookie));
    auth.clearCookie(req, res);
    onChange();
    res.json({ ok: true });
  });

  app.post('/api/auth/password', (req, res) => {
    if (req.auth?.kind !== 'user') return fail(res, 401, 'Bitte anmelden.');
    try {
      auth.changeOwnPassword(req.auth, req.body?.oldPassword, req.body?.newPassword);
      onChange();
      res.json({ ok: true });
    } catch (err) {
      fail(res, 400, errMsg(err));
    }
  });

  // --- Anzeigen koppeln -------------------------------------------------------------------
  // Anzeige: Kopplung beginnen → Code + QR-Code zeigen → regelmäßig nachfragen, bis bestätigt
  app.post('/api/auth/pair/start', (req, res) => {
    const kioskId = kiosks.isKioskId(req.body?.kiosk) ? req.body.kiosk : null;
    try {
      const p = auth.startPairing({ kioskId, info: { ip: req.ip, agent: String(req.get('user-agent') || '').slice(0, 160) } });
      res.json({ ...p, approveUrl: approveUrl(req, p.code), kioskPaired: kioskId ? auth.isKioskPaired(kioskId) : false });
    } catch (err) {
      fail(res, 429, errMsg(err));
    }
  });

  app.get('/api/auth/pair/qr.svg', (req, res) => {
    const code = String(req.query.code || '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return res.status(400).end();
    const qr = qrcode(0, 'M');
    qr.addData(approveUrl(req, code));
    qr.make();
    res.type('image/svg+xml').set('Cache-Control', 'no-store').send(qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true }));
  });

  app.post('/api/auth/pair/poll', (req, res) => {
    const r = auth.pollPairing(req.body?.pairId);
    if (r.state === 'approved') {
      auth.setCookie(req, res, r.token, auth.DEVICE_COOKIE_MS);
      onChange();
      return res.json({ state: 'approved' });
    }
    res.json({ state: r.state });
  });

  // Handy der Spielleitung: Code ansehen und bestätigen
  app.get('/api/auth/pair/info', (req, res) => {
    if (req.auth?.kind !== 'user') return fail(res, 401, 'Bitte anmelden.');
    const p = auth.pairingByCode(req.query.code);
    if (!p) return fail(res, 404, 'Code nicht gefunden oder abgelaufen.');
    const k = p.kioskId ? kiosks.get(p.kioskId) : null;
    res.json({ ...p, kiosk: k ? { id: k.id, name: k.name, hostname: k.info?.hostname || '', ip: k.info?.ip || '' } : null });
  });

  app.post('/api/auth/pair/approve', (req, res) => {
    if (req.auth?.kind !== 'user') return fail(res, 401, 'Bitte anmelden.');
    try {
      const d = auth.approvePairing(req.body?.code, req.body?.name, req.auth);
      onChange();
      res.json(d);
    } catch (err) {
      fail(res, 400, errMsg(err));
    }
  });

  // Kiosk-Browser nach dem Start: Einmal-Anmeldung, die der Agent mit seinem Geräteschlüssel geholt hat
  app.get('/auth/kiosk', (req, res) => {
    const id = String(req.query.id || '');
    const target = `/kiosk.html?id=${encodeURIComponent(id)}`;
    if (!kiosks.isKioskId(id)) return res.redirect('/pair.html');
    const token = auth.active() ? auth.redeemKioskBrowserToken(id, req.query.token) : null;
    if (token) auth.setCookie(req, res, token, auth.DEVICE_COOKIE_MS);
    res.redirect(target);
  });

  // --- Benutzer und Geräte verwalten --------------------------------------------------------
  app.get('/api/users', (req, res) => res.json(auth.listUsers()));
  app.post('/api/users', (req, res) => {
    try {
      res.status(201).json(auth.createUser(req.body || {}));
    } catch (err) {
      fail(res, 400, errMsg(err));
    }
  });
  app.put('/api/users/:id', (req, res) => {
    try {
      res.json(auth.updateUser(req.params.id, req.body || {}, req.auth));
      onChange();
    } catch (err) {
      fail(res, 400, errMsg(err));
    }
  });
  app.delete('/api/users/:id', (req, res) => {
    try {
      auth.deleteUser(req.params.id, req.auth);
      onChange();
      res.status(204).end();
    } catch (err) {
      fail(res, 400, errMsg(err));
    }
  });

  app.get('/api/devices', (req, res) => res.json(auth.listDevices()));
  app.put('/api/devices/:id', (req, res) => {
    try {
      auth.renameDevice(req.params.id, req.body?.name);
      onChange();
      res.json({ ok: true });
    } catch (err) {
      fail(res, 400, errMsg(err));
    }
  });
  app.delete('/api/devices/:id', (req, res) => {
    try {
      auth.revokeDevice(req.params.id);
      onChange();
      res.status(204).end();
    } catch (err) {
      fail(res, 404, errMsg(err));
    }
  });
}

/** Adresse der Bestätigungsseite (für den QR-Code) – so, wie der Browser den Server erreicht. */
function approveUrl(req, code) {
  const base = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/+$/, '') : `${req.protocol}://${req.get('host')}`;
  return `${base}/approve.html?code=${encodeURIComponent(code)}`;
}

/** Socket.IO: nur angemeldete Personen und gekoppelte Geräte; Herkunft muss passen. */
export function socketAuth(socket, next) {
  const h = socket.handshake.headers;
  const a = auth.resolve(auth.tokenFromCookie(h.cookie));
  if (!a) return next(new Error('unauthorized'));
  if (a.kind !== 'open' && h.origin) {
    try {
      if (new URL(h.origin).host !== h.host) return next(new Error('unauthorized'));
    } catch {
      return next(new Error('unauthorized'));
    }
  }
  socket.data.auth = a;
  next();
}
