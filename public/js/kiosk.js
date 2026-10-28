// Kiosk-Startseite: fragt beim Server ab, was dieses Gerät anzeigen soll, und leitet weiter.
// Wechselt die Zuweisung (Kampagne, Spieltisch/Spieler-Display), folgt die Anzeige automatisch.
import { param } from './util.js';
import { kioskTargetUrl as targetUrl, quadSides } from './display.js';
import { tr } from './i18n.js';

const boot = quadSides(document.querySelector('.loading-screen'));
const say = (text) => boot.text('.kiosk-msg', text);

const id = param('id');
const POLL_MS = 5000;

async function check() {
  try {
    const res = await fetch(`/api/kiosks/${encodeURIComponent(id)}/display`, { cache: 'no-store' });
    if (res.status === 404) {
      say(tr('Gerät ist noch nicht angemeldet – der Kiosk-Agent meldet es in wenigen Sekunden an.'));
      return;
    }
    const info = await res.json();
    boot.text('.kiosk-name', info.name);
    const url = targetUrl(id, info);
    if (url) {
      location.replace(url);
      return;
    }
    say(tr('Bereit. In der Spielleitung unter „Bildschirme → Kiosk-Geräte“ eine Kampagne zuweisen.'));
  } catch {
    say(tr('Server nicht erreichbar – neuer Versuch …'));
  }
}

if (id) {
  check();
  setInterval(check, POLL_MS);
} else {
  say(tr('Keine Geräte-ID angegeben (kiosk.html?id=…).'));
}
