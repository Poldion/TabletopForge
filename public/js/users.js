// Benutzer & Geräte: eigenes Passwort, Konten (Admins), freigegebene Anzeigen.
import { $, h, fill, api, toast, prompt2 } from './util.js';
import { icon } from './icons.js';
import { authState, accountMenu } from './account.js';
import { tr, locale } from './i18n.js';

const when = (t) => (t ? new Date(t).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : '–');
const card = (title, ...children) => h('section.card', h('h2', { style: { marginTop: 0 } }, title), ...children);

async function guarded(fn, ok) {
  try {
    await fn();
    if (ok) toast(ok);
    render();
  } catch (err) {
    toast(err.message);
  }
}

function ownAccount(st) {
  const old = h('input', { type: 'password', placeholder: tr('Bisheriges Passwort'), autocomplete: 'current-password', required: true });
  const pw = h('input', { type: 'password', placeholder: tr('Neues Passwort (mind. 8 Zeichen)'), autocomplete: 'new-password', minlength: 8, required: true });
  const form = h('form.acc-form', old, pw, h('button', { type: 'submit' }, tr('Passwort ändern')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    guarded(() => api('POST', '/api/auth/password', { oldPassword: old.value, newPassword: pw.value }), tr('Passwort geändert – andere Sitzungen wurden abgemeldet'));
  });
  return card(tr('Mein Konto'), h('p', tr('Angemeldet als ', {  }), h('b', st.me.name), ` (${st.roles[st.me.role] || st.me.role})`), form);
}

async function usersCard(st) {
  const users = await api('GET', '/api/users');
  const roleSel = (value, onchange) => h('select', { onchange }, ...Object.entries(st.roles).map(([k, l]) => h('option', { value: k, selected: k === value }, l)));
  const list = users.map((u) =>
    h(
      'div.acc-item',
      h('div.grow', h('b', u.name), h('div.small.muted', tr('angelegt {when} · zuletzt angemeldet {when2}', { when: when(u.createdAt), when2: when(u.lastLogin) }))),
      roleSel(u.role, (e) => guarded(() => api('PUT', `/api/users/${u.id}`, { role: e.target.value }), tr('Rolle geändert'))),
      h('button.small', {
        onclick: async () => {
          const pw = await prompt2(tr('Neues Passwort für {name} (mind. 8 Zeichen)', { name: u.name }), '');
          if (pw) guarded(() => api('PUT', `/api/users/${u.id}`, { password: pw }), tr('Passwort gesetzt – das Konto wurde überall abgemeldet'));
        },
      }, tr('Passwort setzen')),
      u.name === st.me.name ? null : h('button.small.danger', { title: tr('Konto löschen'), onclick: () => confirm(tr('Konto „{name}“ löschen?', { name: u.name })) && guarded(() => api('DELETE', `/api/users/${u.id}`), tr('Konto gelöscht')) }, icon('trash')),
    ),
  );
  const name = h('input', { placeholder: tr('Name'), required: true, maxlength: 40, autocomplete: 'off' });
  const pw = h('input', { type: 'password', placeholder: tr('Passwort (mind. 8 Zeichen)'), minlength: 8, required: true, autocomplete: 'new-password' });
  const role = roleSel('dm');
  const form = h('form.acc-form', name, pw, role, h('button.primary', { type: 'submit' }, icon('plus'), tr(' Konto anlegen')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    guarded(() => api('POST', '/api/users', { name: name.value, password: pw.value, role: role.value }), tr('Konto angelegt'));
  });
  return card(
    tr('Benutzer'),
    h('p.small.muted', tr('Spielleitung: alles außer der Benutzerverwaltung. Admin: zusätzlich Konten anlegen, ändern und löschen.')),
    h('div.acc-list', list),
    form,
  );
}

async function devicesCard() {
  const devices = await api('GET', '/api/devices');
  const list = devices.length
    ? devices.map((d) =>
        h(
          'div.acc-item',
          h('div.grow', h('b', d.name), h('div.small.muted', tr('{x}freigegeben {when}{x2} · zuletzt aktiv {when2}', { x: d.kioskId ? tr('Kiosk {kioskId} · ', { kioskId: d.kioskId }) : '', when: when(d.createdAt), x2: d.approvedBy ? tr(' von {approvedBy}', { approvedBy: d.approvedBy }) : '', when2: when(d.lastSeen) }))),
          h('button.small', {
            onclick: async () => {
              const n = await prompt2(tr('Name der Anzeige'), d.name);
              if (n) guarded(() => api('PUT', `/api/devices/${d.id}`, { name: n }));
            },
          }, tr('Umbenennen')),
          h('button.small.danger', { onclick: () => confirm(tr('Freigabe für „{name}“ entziehen? Die Anzeige muss danach neu gekoppelt werden.', { name: d.name })) && guarded(() => api('DELETE', `/api/devices/${d.id}`), tr('Freigabe entzogen')) }, tr('Freigabe entziehen')),
        ),
      )
    : h('p.small.muted', tr('Noch keine Anzeige freigegeben.'));
  return card(
    tr('Freigegebene Anzeigen'),
    h('p.small.muted', tr('Öffnet ein Spieltisch, Spieler-Display oder Kiosk den Manager, zeigt er einen Code und QR-Code. Scanne ihn mit dem Handy (angemeldet) oder gib den Code hier ein.')),
    h('div.acc-list', list),
    h('div', { style: { marginTop: '10px' } }, h('a.btn', { href: '/approve.html' }, tr('Code eingeben'))),
  );
}

async function render() {
  const st = await api('GET', '/api/auth/state');
  if (!st.active) {
    fill(
      $('#content'),
      card(
        tr('Anmeldung nicht eingerichtet'),
        h('p', tr('Zurzeit kann jeder im Netz die App nutzen. Lege ein erstes Konto an, um sie zu schützen – Anzeigen werden dann per QR-Code freigegeben.')),
        h('a.btn.primary', { href: '/login.html' }, tr('Erstes Konto anlegen')),
      ),
    );
    return;
  }
  const parts = [ownAccount(st)];
  if (st.me.role === 'admin') parts.push(await usersCard(st));
  parts.push(await devicesCard());
  fill($('#content'), ...parts);
}

accountMenu($('#account'));
authState();
render().catch((err) => fill($('#content'), h('p', tr('Fehler: {message}', { message: err.message }))));
