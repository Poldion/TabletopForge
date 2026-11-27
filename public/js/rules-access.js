// Regelseite für Spieler – Verwaltung für die Spielleitung: Anzeige in der Kopfzeile mit dem aktuellen Code und ein
// Fenster mit QR-Code, Adresse, „Neuer Code“, Wechselrhythmus und Ein/Aus. Der Code selbst entsteht auf dem Server
// (server/guest.js) und wechselt dort von selbst.
import { h, fill, api, toast } from './util.js';
import { icon } from './icons.js';
import { tr, locale } from './i18n.js';

const ROTATION = () => ({ daily: tr('täglich (um 5 Uhr)'), weekly: tr('wöchentlich (montags um 5 Uhr)'), manual: tr('nur von Hand') });
let cfg = null;
let chipEl = null;

const until = (c) =>
  c.expiresAt ? tr('Gilt bis {when}', { when: new Date(c.expiresAt).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) }) : tr('Gilt, bis du einen neuen Code erzeugst.');

function paintChip() {
  if (!chipEl) return;
  chipEl.hidden = !cfg?.rules;
  if (!cfg?.rules) return;
  fill(chipEl, h('span.status-dot', { class: cfg.enabled ? 'on' : '' }), icon('book'), h('span.chip-label', cfg.enabled ? tr('Regeln: {code}', { code: cfg.code }) : tr('Regeln: aus')));
  chipEl.title = cfg.enabled ? `${tr('Regelseite für Spieler')} – ${until(cfg)}` : tr('Regelseite für Spieler – ausgeschaltet');
}

async function load() {
  try {
    cfg = await api('GET', '/api/rules-access');
  } catch {
    cfg = null;
  }
  paintChip();
  return cfg;
}

/** Kopfzeilen-Anzeige anbinden: zeigt den Code, solange ein Regelwerk eingerichtet ist; Klick öffnet die Verwaltung. */
export function bindRulesChip(el) {
  chipEl = el;
  el.hidden = true;
  el.addEventListener('click', openRulesAccess);
  load();
  // Der Code wechselt nachts – gelegentlich nachsehen
  setInterval(load, 5 * 60_000);
}

export async function openRulesAccess() {
  const c = await load();
  if (!c) return;
  const dlg = h('dialog.modal');
  const body = h('div');
  const render = () => {
    const enabled = h('input', { type: 'checkbox', checked: cfg.enabled });
    enabled.addEventListener('change', async () => {
      cfg = await api('PUT', '/api/rules-access', { enabled: enabled.checked });
      paintChip();
      render();
    });
    const rot = h('select', Object.entries(ROTATION()).map(([v, l]) => h('option', { value: v, selected: cfg.rotation === v }, l)));
    rot.addEventListener('change', async () => {
      cfg = await api('PUT', '/api/rules-access', { rotation: rot.value });
      paintChip();
      render();
    });
    const copy = h('button.small', {
      title: tr('Adresse kopieren'),
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(cfg.url);
          toast(tr('Adresse kopiert'));
        } catch {
          /* ohne Zwischenablage: Adresse steht zum Abschreiben da */
        }
      },
    }, icon('copy'));
    fill(
      body,
      h('p.small.muted', tr('Spieler öffnen die Seite auf ihrem Handy und geben den Code ein. Dann können sie im Regelwerk suchen und der KI Regelfragen stellen – sonst nichts. Mit jedem neuen Code müssen alle den Code neu eingeben.')),
      h('label.inline', enabled, ` ${tr('Regelseite freigegeben')}`),
      cfg.enabled
        ? h(
            'div.rules-access',
            h('img.rules-access-qr', { src: `/api/rules-access/qr.svg?t=${Date.now()}`, alt: tr('QR-Code der Regelseite') }),
            h(
              'div.rules-access-info',
              h('div.small.muted', tr('Code')),
              h('div.rules-access-code', cfg.code),
              h('div.small.muted', until(cfg)),
              h('div.row', h('code.small', cfg.url), copy),
              h('button', { onclick: async () => ((cfg = await api('POST', '/api/rules-access/new')), paintChip(), render(), toast(tr('Neuer Code: {code}', { code: cfg.code }))) }, icon('d20'), tr(' Neuer Code')),
            ),
          )
        : h('p', tr('Ausgeschaltet: Niemand kommt ohne Anmeldung auf die Regelseite.')),
      h('label', h('span.small.muted', tr('Code wechselt')), rot),
    );
  };
  render();
  fill(dlg, h('div.row', h('h3.grow', icon('book'), tr(' Regelseite für Spieler')), h('button.small', { onclick: () => dlg.close(), title: tr('Schließen') }, icon('x'))), body);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}
