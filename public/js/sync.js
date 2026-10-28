// Client-seitige Synchronisation: hält eine lokale Kopie des Kampagnenzustands,
// wendet eigene Änderungen sofort an (optimistisch) und gleicht sie über Socket.IO ab.
import { applyOps } from '/shared/ops.js';
import { toast, goToLogin } from './util.js';
import { tr, tMsg } from './i18n.js';

const FLUSH_MS = 30;

const samePath = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);

export class Sync {
  constructor(campaignId, role = 'dm') {
    this.campaignId = campaignId;
    this.role = role;
    this.state = null;
    this.settings = null;
    this.presence = {};
    this.listeners = new Set();
    this.fxListeners = new Set();
    this.statusListeners = new Set();
    this.queue = [];
    this.flushTimer = null;
    this.pendingKeys = new Set();
    this.frame = 0;
    this.connected = false;
    // eslint-disable-next-line no-undef
    this.socket = io({ transports: ['websocket', 'polling'] });
  }

  /** Verbindet und tritt der Kampagne bei. Bei Wiederverbindung wird der Zustand komplett neu geladen. */
  connect() {
    return new Promise((resolve, reject) => {
      let first = true;
      const join = () => {
        this.socket.emit('join', { campaignId: this.campaignId, role: this.role }, (res) => {
          if (res?.error) {
            if (first) reject(new Error(tMsg(res.error)));
            return;
          }
          // Server wurde aktualisiert: Anzeigen (Spieltisch, Spieler-Display) laden die neue Fassung selbst nach –
          // sonst liefe auf einem Kiosk-TV bis zum nächsten Neustart der alte Code weiter.
          if (this.version && res.version && res.version !== this.version) {
            if (this.role !== 'dm') return location.reload();
            toast(tr('Neue Version {version} installiert – bitte die Seite neu laden.', { version: res.version }), 10000);
          }
          this.version = res.version || this.version;
          this.state = res.state;
          this.settings = res.settings;
          this.connected = true;
          this.emitStatus();
          if (first) {
            first = false;
            resolve(this.state);
          } else {
            this.notify(['*']);
          }
        });
      };
      this.socket.on('connect', join);
      // Abgemeldet oder Freigabe entzogen → zur Anmeldung bzw. Kopplung
      this.socket.on('connect_error', (err) => err?.message === 'unauthorized' && goToLogin());
      this.socket.on('disconnect', (reason) => {
        this.connected = false;
        this.emitStatus();
        // Vom Server getrennt (z.B. Freigabe entzogen, abgemeldet): Socket.IO verbindet dann nicht von selbst neu.
        // Noch angemeldet → neu verbinden, sonst zur Anmeldung bzw. Kopplung.
        if (reason === 'io server disconnect') {
          fetch('/api/auth/state', { cache: 'no-store' })
            .then((r) => r.json())
            .then((st) => (st.me ? this.socket.connect() : goToLogin()))
            .catch(() => setTimeout(() => this.socket.connect(), 3000));
        }
      });
      this.socket.on('ops', (ops) => {
        if (!this.state) return;
        applyOps(this.state, ops);
        this.notify(ops.map((o) => o.p[0]));
      });
      this.socket.on('settings', (s) => {
        this.settings = s;
        this.notify(['settings']);
      });
      this.socket.on('presence', (p) => {
        this.presence = p;
        this.emitStatus();
      });
      this.socket.on('fx', (fx) => this.fxListeners.forEach((fn) => fn(fx)));
      this.socket.on('campaign-deleted', () => {
        alert(tr('Diese Kampagne wurde gelöscht.'));
        location.href = '/';
      });
    });
  }

  /** Führt Ops lokal aus und sendet sie gebündelt an den Server. */
  do(...ops) {
    ops = ops.flat().filter(Boolean);
    if (!ops.length) return;
    applyOps(this.state, ops);
    for (const op of ops) this.enqueue(op);
    this.notify(ops.map((o) => o.p[0]));
  }

  enqueue(op) {
    // Aufeinanderfolgende Änderungen am gleichen Pfad (z.B. beim Ziehen) zusammenfassen
    const last = this.queue[this.queue.length - 1];
    if (last && last.t === op.t && (op.t === 'set' || op.t === 'merge') && samePath(last.p, op.p)) {
      last.v = op.t === 'merge' ? { ...last.v, ...op.v } : op.v;
    } else {
      this.queue.push(structuredClone(op));
    }
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.queue.length) return;
    this.socket.emit('ops', this.queue);
    this.queue = [];
  }

  /** Nur lokal anwenden (z.B. während eines laufenden Stiftstrichs). */
  local(...ops) {
    ops = ops.flat().filter(Boolean);
    applyOps(this.state, ops);
    this.notify(ops.map((o) => o.p[0]));
  }

  /** Bereits lokal angewendete Ops sofort (nach der Warteschlange) senden. */
  send(...ops) {
    ops = ops.flat().filter(Boolean);
    this.flush();
    if (ops.length) this.socket.emit('ops', ops);
  }

  set(p, v) {
    this.do({ t: 'set', p, v });
  }
  merge(p, v) {
    this.do({ t: 'merge', p, v });
  }
  del(p) {
    this.do({ t: 'del', p });
  }
  push(p, v) {
    this.do({ t: 'push', p, v });
  }

  fx(data) {
    this.socket.emit('fx', data);
  }

  /** Listener erhalten einmal pro Frame die Menge der geänderten Top-Level-Schlüssel. */
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onFx(fn) {
    this.fxListeners.add(fn);
  }
  onStatus(fn) {
    this.statusListeners.add(fn);
    fn(this);
  }
  emitStatus() {
    this.statusListeners.forEach((fn) => fn(this));
  }

  notify(keys) {
    keys.forEach((k) => this.pendingKeys.add(k));
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const changed = this.pendingKeys;
      this.pendingKeys = new Set();
      this.listeners.forEach((fn) => fn(changed));
    });
  }
}

/** Prüft, ob eine Änderungsmenge einen der Schlüssel betrifft. */
export const touches = (changed, ...keys) => changed.has('*') || keys.some((k) => changed.has(k));
