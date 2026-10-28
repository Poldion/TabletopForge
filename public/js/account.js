// Konto-Anzeige für Kopfzeilen: angemeldeter Name, Benutzerverwaltung, Abmelden.
// Ohne eingerichtete Anmeldung ein Hinweis-Link zur Einrichtung.
import { h, fill, api } from './util.js';
import { icon } from './icons.js';
import { tr, languageSelect } from './i18n.js';

let statePromise = null;
/** Anmeldestatus (einmal pro Seite geladen). */
export const authState = () => (statePromise ||= api('GET', '/api/auth/state'));

export async function logout() {
  await api('POST', '/api/auth/logout');
  location.href = '/login.html';
}

const aiLink = () => h('a.btn.small', { href: '/ai.html', title: tr('Sprachmodell, Bildgenerator und BasaltNotes einrichten') }, icon('sparkles'), tr(' Dienste'));

/** Füllt ein Element mit Name + Links (für die Kopfzeile). */
export async function accountMenu(el) {
  const st = await authState().catch(() => null);
  if (!st) return;
  const langSel = languageSelect(h);
  langSel.classList.add('small');
  if (!st.active) {
    fill(el, langSel, ' ', aiLink(), ' ', h('a.btn.small', { href: '/login.html', title: tr('Konten anlegen, damit nicht jeder im Netz zugreifen kann') }, icon('user'), tr(' Anmeldung einrichten')));
    return;
  }
  fill(
    el,
    h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
      langSel,
      st.me?.role === 'admin' ? aiLink() : null,
      h('a.btn.small', { href: '/users.html', title: tr('Benutzer & freigegebene Anzeigen') }, icon('user'), ` ${st.me?.name || ''}`),
      h('button.small', { onclick: logout, title: tr('Abmelden') }, tr('Abmelden')),
    ),
  );
}
