// Bestätigungsseite (Handy der Spielleitung nach dem Scannen des QR-Codes): Anzeige benennen und freigeben.
import { $, h, fill, api, param } from './util.js';
import { tr } from './i18n.js';

const fmt = (c) => `${c.slice(0, 3)} ${c.slice(3)}`;

function askCode(message = '') {
  const input = h('input', { required: true, autocomplete: 'off', placeholder: tr('Code von der Anzeige'), maxlength: 7, style: { textTransform: 'uppercase', fontSize: '20px', letterSpacing: '0.1em' } });
  const el = h('form', h('p.small', message || tr('Gib den Code ein, den die Anzeige zeigt:')), input, h('button.primary', { type: 'submit' }, tr('Weiter')));
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    show(input.value.replace(/\s+/g, '').toUpperCase());
  });
  fill($('#body'), el);
  input.focus();
}

async function show(code) {
  let info;
  try {
    info = await api('GET', `/api/auth/pair/info?code=${encodeURIComponent(code)}`);
  } catch (err) {
    return askCode(tr('{message} Bitte den aktuellen Code von der Anzeige eingeben:', { message: err.message }));
  }
  const k = info.kiosk;
  const name = h('input', { required: true, maxlength: 40, value: k?.name || tr('Spieltisch') });
  const error = h('div.small.auth-error');
  const btn = h('button.primary', { type: 'submit' }, tr('Freigeben'));
  const form = h(
    'form',
    h('div', h('div.small.muted', tr('Code auf der Anzeige')), h('div.big-code', fmt(info.code))),
    k
      ? h('p.small', tr('Kiosk-Gerät {id}{x}{x2}', { id: k.id, x: k.hostname ? ` · ${k.hostname}` : '', x2: k.ip ? ` · ${k.ip}` : '' }))
      : h('p.small.muted', tr('Browser: {x}{x2}', { x: info.info?.agent || 'unbekannt', x2: info.info?.ip ? ` · ${info.info.ip}` : '' })),
    h('p.small.muted', tr('Nur freigeben, wenn derselbe Code gerade auf deiner Anzeige steht. Die Anzeige bleibt angemeldet, bis du die Freigabe unter „Benutzer & Geräte“ entziehst.')),
    h('label', h('span.small.muted', tr('Name der Anzeige')), name),
    error,
    btn,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    error.textContent = '';
    try {
      const d = await api('POST', '/api/auth/pair/approve', { code: info.code, name: name.value });
      fill($('#body'), h('p', tr('„{name}“ ist freigegeben – die Anzeige wechselt in wenigen Sekunden.', { name: d.name })), h('a.btn', { href: '/users.html' }, tr('Zu Benutzer & Geräte')), ' ', h('a.btn', { href: '/' }, tr('Zur Startseite')));
    } catch (err) {
      error.textContent = err.message;
      btn.disabled = false;
    }
  });
  fill($('#body'), form);
}

const code = (param('code') || '').toUpperCase();
if (code) show(code);
else askCode();
