// Gemeinsame Helfer für Vollbild-Anzeigen (Spieltisch und Spieler-Display).
import { h, param } from './util.js';
import { icon } from './icons.js';
import { FUN_FACTS, PAUSE_QUOTES } from './funfacts.js';
import { tr } from './i18n.js';

/** Zieladresse für eine Kiosk-Zuweisung oder null, wenn noch nichts zugewiesen ist. */
export function kioskTargetUrl(kioskId, info) {
  // Testmuster zum Nachmessen – braucht keine Kampagne
  if (info?.display?.mode === 'calibrate') return `/table.html?calibrate=1&kiosk=${encodeURIComponent(kioskId)}`;
  if (!info?.display?.campaignId) return null;
  const page = info.display.mode === 'player' ? 'player.html' : 'table.html';
  return `/${page}?c=${encodeURIComponent(info.display.campaignId)}&kiosk=${encodeURIComponent(kioskId)}&name=${encodeURIComponent(info.name || '')}`;
}

/**
 * Läuft die Anzeige auf einem Kiosk-Gerät (?kiosk=…), wird regelmäßig geprüft, ob sich die
 * Zuweisung geändert hat oder ein Neuladen angefordert wurde.
 */
function watchKiosk() {
  const kioskId = param('kiosk');
  if (!kioskId) return;
  document.body.classList.add('kiosk');
  let token = null;
  const here = location.pathname + location.search;
  setInterval(async () => {
    try {
      const res = await fetch(`/api/kiosks/${encodeURIComponent(kioskId)}/display`, { cache: 'no-store' });
      if (!res.ok) return;
      const info = await res.json();
      // Neu laden bei geänderter Zuweisung, Neuladen-Befehl oder geänderten Monitordaten
      const stamp = `${info.reloadToken}|${JSON.stringify(info.calibration)}`;
      if (token === null) token = stamp;
      const target = kioskTargetUrl(kioskId, info);
      if (target !== here || stamp !== token) location.replace(`/kiosk.html?id=${encodeURIComponent(kioskId)}`);
    } catch {
      /* Server kurz nicht erreichbar – nächster Versuch */
    }
  }, 5000);
}

export function setupDisplayChrome(extraButtons = []) {
  document.body.classList.add('display');
  watchKiosk();
  const fsBtn = h(
    'button',
    {
      onclick: () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.().catch(() => {});
      },
    },
    icon('maximize'),
    tr(' Vollbild'),
  );
  document.body.append(h('div.display-hint', ...extraButtons, fsBtn));

  let hideTimer;
  const show = () => {
    document.body.classList.add('show-cursor');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => document.body.classList.remove('show-cursor'), 2500);
  };
  window.addEventListener('mousemove', show);

  // Bildschirm nicht in den Ruhezustand gehen lassen
  let lock = null;
  const requestLock = async () => {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
    } catch {
      lock = null;
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !lock) requestLock();
  });
  requestLock();
}

export function connectionBadge(sync) {
  const badge = h('div', {
    style: {
      position: 'fixed',
      left: '10px',
      bottom: '10px',
      padding: '4px 10px',
      borderRadius: '12px',
      background: '#000a',
      color: '#f88',
      font: '13px sans-serif',
      zIndex: 20,
    },
  });
  document.body.append(badge);
  sync.onStatus((s) => {
    badge.textContent = s.connected ? '' : tr('Verbindung getrennt – verbinde neu …');
    badge.style.display = s.connected ? 'none' : 'block';
  });
}

/**
 * Vierseitige Anordnung der Start-/Lade-/Pausenbildschirme: den Textblock (.quad) für jede Seite des liegenden
 * TVs kopieren (unten, oben, rechts, links – je zum Rand hin lesbar). Liefert Setzer, die alle Kopien ändern.
 */
export function quadSides(screen) {
  const base = screen.querySelector('.quad');
  base.classList.add('s-bottom');
  // Seiten, die schon fest in der Seite stehen (Start ohne Zwischenbild), nicht noch einmal anlegen
  const missing = ['s-top', 's-right', 's-left'].filter((side) => !screen.querySelector(`.quad.${side}`));
  for (const side of missing) {
    const copy = base.cloneNode(true);
    copy.classList.replace('s-bottom', side);
    copy.setAttribute('aria-hidden', 'true');
    screen.append(copy);
  }
  const all = (sel) => screen.querySelectorAll(`.quad ${sel}`);
  return {
    text: (sel, text) => all(sel).forEach((e) => (e.textContent = text)),
    toggle: (sel, cls, on) => all(sel).forEach((e) => e.classList.toggle(cls, on)),
  };
}

/**
 * Ladebildschirm mit wechselnden D&D-Fakten (Element #loading aus der Seite). Er ist beim Laden der Seite
 * sofort sichtbar; set(true) zeigt ihn nach kurzer Verzögerung wieder (schnelle Kartenwechsel blitzen nicht),
 * set(false) blendet ihn aus.
 */
export function loadingScreen() {
  const el = document.getElementById('loading');
  if (!el) return { set() {} };
  const q = quadSides(el);
  const setFact = (text) => q.text('.loading-fact', text);
  let order = [];
  const next = () => {
    if (!order.length) order = FUN_FACTS.map((f) => [Math.random(), f]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    return order.pop();
  };
  setFact(next());
  let rotate = null;
  let showTimer = null;
  let goneTimer = null;
  const startRotation = () => {
    clearInterval(rotate);
    rotate = setInterval(() => {
      q.toggle('.loading-fact', 'fade', true);
      setTimeout(() => {
        setFact(next());
        q.toggle('.loading-fact', 'fade', false);
      }, 600);
    }, 7000);
  };
  startRotation();
  let shown = true;
  return {
    set(on, text) {
      if (text) q.text('.loading-title', text);
      clearTimeout(showTimer);
      clearTimeout(this.maxTimer);
      // Sicherheitsnetz: lädt eine Karte gar nicht (z.B. Datei fehlt), nicht ewig den Tisch verdecken
      if (on) this.maxTimer = setTimeout(() => this.set(false), 20000);
      if (on === shown) return;
      if (on) {
        showTimer = setTimeout(() => {
          shown = true;
          clearTimeout(goneTimer);
          setFact(next());
          el.classList.remove('gone');
          requestAnimationFrame(() => el.classList.remove('hidden'));
          startRotation();
        }, 400);
      } else {
        shown = false;
        el.classList.add('hidden');
        clearInterval(rotate);
        // Nach dem Ausblenden ganz entfernen, damit die Animation auf dem Pi keine Leistung kostet
        goneTimer = setTimeout(() => el.classList.add('gone'), 600);
      }
    },
  };
}

const D20_SVG = '<svg class="boot-icon" viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,4 90,27 90,73 50,96 10,73 10,27" /><polygon points="50,24 74,64 26,64" /><path d="M50,4 50,24 M90,27 74,64 M10,27 26,64 M90,73 74,64 M10,73 26,64 M50,96 50,64 M50,24 90,27 M50,24 10,27 M26,64 50,96 74,64" /></svg>';

/**
 * Pausenbildschirm, wenn die Spielleitung den Tisch verdunkelt: „Kurze Pause“ mit wechselnden Sprüchen
 * oder einer eigenen Nachricht der Spielleitung.
 */
export function pauseScreen() {
  const el = h('div.loading-screen.pause-screen.hidden.gone', { innerHTML: D20_SVG });
  el.append(h('div.quad', h('div.boot-title', tr('Kurze Pause')), h('div.boot-sub', tr('Gleich geht es weiter …')), h('div.boot-fact')));
  document.body.append(el);
  const q = quadSides(el);
  const setFact = (text) => q.text('.boot-fact', text);
  let order = [];
  const next = () => {
    if (!order.length) order = PAUSE_QUOTES.map((q) => [Math.random(), q]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    return order.pop();
  };
  let rotate = null;
  let goneTimer = null;
  let shown = false;
  let custom = '';
  return {
    set(on, text = '') {
      const msg = String(text || '').trim();
      if (msg !== custom) {
        custom = msg;
        setFact(msg || next());
      }
      if (on === shown) return;
      shown = on;
      clearInterval(rotate);
      clearTimeout(goneTimer);
      if (on) {
        if (!custom) setFact(next());
        el.classList.remove('gone');
        requestAnimationFrame(() => el.classList.remove('hidden'));
        // Eigene Nachricht bleibt stehen, sonst alle 9 s ein neuer Spruch
        rotate = setInterval(() => {
          if (custom) return;
          q.toggle('.boot-fact', 'fade', true);
          setTimeout(() => {
            setFact(next());
            q.toggle('.boot-fact', 'fade', false);
          }, 600);
        }, 9000);
      } else {
        el.classList.add('hidden');
        goneTimer = setTimeout(() => el.classList.add('gone'), 600);
      }
    },
  };
}
