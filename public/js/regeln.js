// Regelseite für Spieler (/regeln): Mit dem vierstelligen Code der Spielleitung im Regelwerk suchen, Regeln lesen und
// der KI Fragen stellen. Der Code wechselt (meist täglich); dann fragt die Seite von selbst wieder danach.
import { $, h, fill, api } from './util.js';
import { tr, languageSelect, translateDom } from './i18n.js';
import { rules, createRulesView } from './rules.js';

const content = $('#content');
let view = null; // Regelansicht, solange der Code gilt

async function state() {
  return api('GET', '/api/guest/state');
}

function showCode(message = '') {
  view = null;
  const input = h('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 4, autocomplete: 'one-time-code', 'aria-label': tr('Code'), placeholder: '····' });
  const error = h('div.small.auth-error', message);
  const btn = h('button.primary', { type: 'submit' }, tr('Weiter'));
  const form = h(
    'form.card.guest-code',
    h('p', tr('Gib den Code ein, den dir die Spielleitung nennt.')),
    input,
    error,
    btn,
    h('p.small.muted', tr('Der Code wechselt regelmäßig – dann fragt die Seite wieder danach.')),
  );
  const send = async () => {
    const code = input.value.replace(/\D/g, '');
    if (code.length !== 4) return;
    btn.disabled = true;
    error.textContent = '';
    try {
      await api('POST', '/api/guest/login', { code });
      await start();
    } catch (err) {
      error.textContent = err.message;
      input.value = '';
      btn.disabled = false;
      input.focus();
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send();
  });
  // Sobald vier Ziffern dastehen, gleich prüfen
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 4);
    if (input.value.length === 4) send();
  });
  fill(content, form);
  setTimeout(() => input.focus(), 0);
}

async function start() {
  let s;
  try {
    s = await state();
  } catch (err) {
    return fill(content, h('p', err.message));
  }
  if (!s.enabled) return (view = null), fill(content, h('div.card', h('p', tr('Die Regelseite ist gerade nicht freigegeben – frag die Spielleitung.'))));
  if (!s.ok) return showCode();
  if (!s.rules) return (view = null), fill(content, h('div.card', h('p', tr('Es ist noch kein Regelwerk eingerichtet.'))));
  Object.assign(rules, { enabled: true, chat: !!s.chat });
  if (!view) {
    view = createRulesView({ page: true, base: '/api/guest/rules', vault: s.vault, external: false });
    fill(content, view.el);
  }
}

// Wechselt der Code oder schaltet die Spielleitung die Seite ab, merkt es die Seite beim nächsten Blick darauf
async function recheck() {
  if (!view) return;
  try {
    const s = await state();
    if (!s.enabled || !s.ok) start();
  } catch {
    /* offline – später noch einmal */
  }
}
setInterval(recheck, 60_000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && recheck());

translateDom();
fill($('#lang'), languageSelect(h));
start();
