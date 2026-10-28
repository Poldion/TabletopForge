// Kopplungsseite einer Anzeige: zeigt Code und QR-Code; die Spielleitung scannt ihn mit dem Handy und bestätigt.
// Danach bekommt diese Anzeige ihr eigenes Anmelde-Cookie und geht zur ursprünglich gewünschten Seite.
import { $, api, param } from './util.js';
import { tr } from './i18n.js';

const next = () => {
  const n = param('next') || '/table.html';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/table.html';
};
const kiosk = param('kiosk');
let pairId = null;

async function start() {
  const state = await api('GET', '/api/auth/state');
  if (state.me) return location.replace(next()); // schon angemeldet (oder Anmeldung nicht eingerichtet)
  const p = await api('POST', '/api/auth/pair/start', { kiosk });
  if (p.kioskPaired) {
    // Freigegebener Kiosk, dessen Browser nur die Anmeldung verloren hat (z.B. nach Neustart des Browsers):
    // über die lokale Startseite des Geräts holt er sich mit seinem Geräteschlüssel eine neue
    $('#msg').textContent = tr('Dieses Gerät ist freigegeben – melde es an …');
    setTimeout(() => location.replace('http://127.0.0.1:8088/start.html'), 4000);
  }
  pairId = p.pairId;
  $('#code').textContent = `${p.code.slice(0, 3)} ${p.code.slice(3)}`;
  $('#qr').src = `/api/auth/pair/qr.svg?code=${p.code}`;
  if (!p.kioskPaired) $('#msg').textContent = tr('QR-Code mit dem Handy scannen und dort bestätigen – oder in der Spielleitung unter „Benutzer & Geräte“ diesen Code eingeben:');
  $('#hint').textContent = p.approveUrl;
  // Neuer Code, bevor dieser abläuft
  setTimeout(() => location.reload(), (p.expiresIn - 30) * 1000);
}

async function poll() {
  if (pairId) {
    try {
      const r = await api('POST', '/api/auth/pair/poll', { pairId });
      if (r.state === 'approved') {
        $('#msg').textContent = tr('Freigegeben!');
        return location.replace(next());
      }
      if (r.state === 'expired') return location.reload();
    } catch {
      /* Server kurz weg – weiter versuchen */
    }
  }
  setTimeout(poll, 2000);
}

start()
  .then(poll)
  .catch((err) => {
    $('#msg').textContent = tr('Server nicht erreichbar ({message}) – neuer Versuch …', { message: err.message });
    setTimeout(() => location.reload(), 5000);
  });
