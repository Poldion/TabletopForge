// Anmeldeseite – und beim allerersten Start die Einrichtung des ersten Kontos (mit Code aus dem Server-Protokoll).
import { $, h, fill, api, param } from './util.js';
import { tr, languageSelect } from './i18n.js';

// Nur Ziele auf diesem Server (kein Weiterleiten auf fremde Seiten über ?next=)
const next = () => {
  const n = param('next') || '/';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/';
};

const field = (label, attrs) => {
  const input = h('input', attrs);
  return { input, el: h('label', h('span.small.muted', label), input) };
};

function form(fields, submitLabel, onSubmit) {
  const error = h('div.small.auth-error');
  const btn = h('button.primary', { type: 'submit' }, submitLabel);
  const el = h('form', ...fields.map((f) => f.el), error, btn);
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    btn.disabled = true;
    try {
      await onSubmit();
      location.href = next();
    } catch (err) {
      error.textContent = err.message;
      btn.disabled = false;
    }
  });
  return el;
}

async function init() {
  const state = await api('GET', '/api/auth/state');
  // Schon angemeldet → weiter
  if (state.me?.kind === 'user') return (location.href = next());

  if (!state.active) {
    $('#intro').textContent =
      tr('Die Anmeldung ist noch nicht eingerichtet. Lege das erste Konto an (es wird Admin). Den Einrichtungscode findest du im Protokoll des Servers (z.B. TrueNAS → App → Logs).');
    const code = field(tr('Einrichtungscode'), { required: true, autocomplete: 'off', placeholder: 'XXXX-XXXX', style: { textTransform: 'uppercase' } }); // i18n-ignore
    const name = field(tr('Name'), { required: true, autocomplete: 'username', maxlength: 40 });
    const pw = field(tr('Passwort (mindestens 8 Zeichen)'), { type: 'password', required: true, autocomplete: 'new-password', minlength: 8 });
    const pw2 = field(tr('Passwort wiederholen'), { type: 'password', required: true, autocomplete: 'new-password', minlength: 8 });
    fill(
      $('#form'),
      form([code, name, pw, pw2], tr('Konto anlegen und anmelden'), async () => {
        if (pw.input.value !== pw2.input.value) throw new Error(tr('Die Passwörter stimmen nicht überein.'));
        await api('POST', '/api/auth/setup', { code: code.input.value, name: name.input.value, password: pw.input.value });
      }),
      h('p.small.muted', { style: { marginTop: '12px' } }, tr('Ohne Konto bleibt die App wie bisher für alle im Netz offen. Mit Konto braucht jeder eine Anmeldung, Anzeigen werden per QR-Code freigegeben.')),
      state.me?.kind === 'open' ? h('a.btn.small', { href: '/' }, tr('Ohne Anmeldung weiter')) : null,
    );
    code.input.focus();
    return;
  }

  $('#intro').textContent = tr('Bitte melde dich an.');
  const name = field(tr('Name'), { required: true, autocomplete: 'username', maxlength: 40 });
  const pw = field(tr('Passwort'), { type: 'password', required: true, autocomplete: 'current-password' });
  fill($('#form'), form([name, pw], tr('Anmelden'), () => api('POST', '/api/auth/login', { name: name.input.value, password: pw.input.value })));
  name.input.focus();
}

$('#card').append(h('div.row', { style: { marginTop: '14px', justifyContent: 'flex-end' } }, languageSelect(h)));

init().catch((err) => ($('#intro').textContent = tr('Fehler: {message}', { message: err.message })));
