// Bereich „Bildschirme“: Spieltisch und Spieler-Display an einer Stelle steuern.
import { h, byOrder, bindInput, toast } from './util.js';
import { icon } from './icons.js';
import { createKioskAdmin } from './kiosk-admin.js';
import { createWledCard } from './wled-admin.js';
import { putOnTable } from './table-view.js';
import { tr } from './i18n.js';
import { t } from './i18n.js';

export const LAYOUTS = {
  full: tr('Karte + Seitenpanel (ein Gerät)'),
  map: tr('Nur Karte (z.B. kleines Tablet)'),
  panel: tr('Nur Panel – reine DM-Anzeige (Initiative, Kreaturen, Notizen …)'),
  panels: tr('Begleit-Instanz: zwei Panels nebeneinander (zweites Gerät)'),
};

/** Kurzbeschreibung, was gerade auf dem Spieler-Display läuft. */
export function playerSummary(st) {
  const p = st.display.player;
  switch (p.mode) {
    case 'image':
      return st.assets[p.assetId]?.name || tr('Bild');
    case 'map':
      return tr('Karte „{x}“', { x: st.maps[p.mapId]?.name || '?' });
    case 'lore':
      return tr('Lore „{x}“', { x: st.lore[p.loreId]?.title || '?' });
    case 'text':
      return tr('Text');
    default:
      return tr('leer');
  }
}

export function tableSummary(st) {
  const t = st.display.table;
  if (!t.mapId || !st.maps[t.mapId]) return tr('keine Karte');
  return `${st.maps[t.mapId].name}${t.blackout ? tr(' (verdunkelt)') : ''}`;
}

/**
 * @param {{ sync: import('./sync.js').Sync, cid: string, getLayout: () => string, setLayout: (l: string) => void, centerTv: () => void }} ctx
 */
export function createScreensView({ sync, cid, getLayout, setLayout, centerTv }) {
  const S = () => sync.state;
  const el = h('div.scroll', { style: { width: '100%' } });
  const kioskAdmin = createKioskAdmin(sync, cid);
  const wledCard = createWledCard(sync);
  const text = h('textarea', { rows: 5, placeholder: tr('Vorlesetext, Inschrift, Brief … (Markdown)') });
  bindInput(text, () => S().display.player.text, (v) => sync.set(['display', 'player', 'text'], v), { debounceMs: 300 });

  const link = (path, label) => {
    const url = location.origin + path;
    return h(
      'div.row',
      { style: { marginTop: '6px' } },
      h('a.btn.small.primary', { href: path, target: '_blank' }, icon('external'), ' ', label),
      h('code.small', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, url),
      h('button.small', {
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast(tr('Adresse kopiert'));
          } catch {
            prompt(tr('Adresse kopieren:'), url);
          }
        },
      }, icon('copy'), tr(' Kopieren')),
    );
  };

  const statusDot = (on) => h('span.status-dot', { class: on ? 'on' : '' });

  const render = () => {
    if (el.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox]):not([type=range]), textarea')) return;
    const st = S();
    const t = st.display.table;
    const p = st.display.player;
    const presence = sync.presence || {};
    const mapOptions = (sel) => [h('option', { value: '' }, tr('– keine –')), ...byOrder(st.maps).map((m) => h('option', { value: m.id, selected: m.id === sel }, m.name))];
    const layoutSel = h('select', ...Object.entries(LAYOUTS).map(([v, l]) => h('option', { value: v, selected: v === getLayout() }, l)));
    layoutSel.addEventListener('change', () => setLayout(layoutSel.value));

    el.replaceChildren(
      h(
        'div.page',
        h('h2', icon('monitor'), tr(' Bildschirme')),
        h('p.muted', tr('Hier steuerst du, was auf dem Spieltisch und dem Spieler-Display zu sehen ist. Beim Spielen geht das auch direkt über die Leiste unten auf der Karte.')),

        h(
          'div.screens',
          h(
            'div.card',
            h('h3.row', statusDot(presence.table > 0), tr('Spieltisch (liegender TV)')),
            h('div.small.muted', presence.table > 0 ? tr('verbunden · zeigt: {tableSummary}', { tableSummary: tableSummary(st) }) : tr('nicht verbunden – Adresse unten im Browser des TVs öffnen')),
            h('label', tr('Karte auf dem Tisch')),
            h('select', {
              onchange: (e) => {
                const m = st.maps[e.target.value];
                putOnTable(sync, m ? m.id : null, m ? { blackout: false } : {});
              },
            }, mapOptions(t.mapId)),
            h(
              'div.row',
              { style: { marginTop: '10px' } },
              h('button', { class: t.blackout ? 'active' : '', onclick: () => sync.set(['display', 'table', 'blackout'], !t.blackout) }, t.blackout ? [icon('sun'), tr(' Wieder einblenden')] : [icon('moon'), tr(' Verdunkeln')]),
              h('button', { class: t.fit ? 'active' : '', onclick: () => sync.set(['display', 'table', 'fit'], !t.fit) }, t.fit ? [icon('check'), tr(' Ganze Karte')] : tr('Ganze Karte zeigen')),
              h('button', { onclick: centerTv }, icon('crosshair'), tr(' Auf meine Ansicht zentrieren')),
            ),
            // Verdunkeln: Pausenbildschirm mit Sprüchen oder eigener Nachricht statt schwarzem Bild
            h(
              'div.row',
              { style: { marginTop: '8px', gap: '6px' } },
              h('label.inline', h('input', { type: 'checkbox', checked: t.pauseScreen !== false, onchange: (e) => sync.set(['display', 'table', 'pauseScreen'], e.target.checked) }), tr('Beim Verdunkeln Pausenbildschirm zeigen')),
              h('input', {
                value: t.pauseText || '',
                placeholder: tr('Eigene Nachricht – leer = wechselnde Sprüche'),
                style: { flex: 1, minWidth: '180px' },
                title: tr('Erscheint auf dem verdunkelten Tisch, z.B. „5 Minuten Pause – Pizza ist da!“'),
                onchange: (e) => sync.set(['display', 'table', 'pauseText'], e.target.value.trim()),
              }),
            ),
            h(
              'div.row',
              { style: { marginTop: '10px' } },
              h('span.small.muted', tr('Zoom')),
              h('input', { type: 'range', min: 0.1, max: 4, step: 0.05, value: t.zoom || 1, disabled: t.fit, style: { flex: 1 }, oninput: (e) => sync.set(['display', 'table', 'zoom'], Number(e.target.value)) }),
              h('button.small', { disabled: t.fit, onclick: () => sync.set(['display', 'table', 'zoom'], 1), title: tr('Maßstabsgetreu: 1 Feld = 1 Zoll') }, '1:1'),
            ),
            (t.zoom || 1) !== 1 && !t.fit ? h('div.small', { style: { color: '#e0a030' } }, tr('Achtung: Bei Zoom ≠ 1:1 sind die Felder nicht 1″ groß.')) : null,
            link(`/table.html?c=${cid}`, tr('Tischanzeige öffnen')),
            h('div.row', { style: { marginTop: '8px' } }, h('a.btn.small', { href: '/settings.html', target: '_blank' }, icon('settings'), tr(' TV-Kalibrierung (Größe, Auflösung, Drehung)'))),
          ),

          h(
            'div.card',
            h('h3.row', statusDot(presence.player > 0), tr('Spieler-Display')),
            h('div.small.muted', presence.player > 0 ? tr('verbunden · zeigt: {playerSummary}', { playerSummary: playerSummary(st) }) : tr('nicht verbunden · würde zeigen: {playerSummary}', { playerSummary: playerSummary(st) })),
            h(
              'div.row',
              { style: { marginTop: '10px' } },
              h('button', { class: p.mode === 'blank' ? 'active' : '', onclick: () => sync.merge(['display', 'player'], { mode: 'blank' }) }, tr('Leer')),
              h('button', { class: p.mode === 'text' ? 'active' : '', onclick: () => sync.merge(['display', 'player'], { mode: 'text' }) }, tr('Text unten zeigen')),
            ),
            h('label', tr('Karte zeigen')),
            h('select', { onchange: (e) => e.target.value && sync.merge(['display', 'player'], { mode: 'map', mapId: e.target.value }) }, mapOptions(p.mode === 'map' ? p.mapId : '')),
            h('label', tr('Text für das Spieler-Display')),
            text,
            h('div.small.muted', tr('Bilder und Lore zeigst du am schnellsten im Spiel über das Karten-Panel.')),
            link(`/player.html?c=${cid}`, tr('Spieler-Display öffnen')),
          ),

          h(
            'div.card',
            h('h3', tr('Dieses Gerät')),
            h('label', tr('Aufteilung beim Spielen')),
            layoutSel,
            h('p.small.muted', tr('Mit „Begleit-Instanz“ nutzt du ein zweites Gerät (z.B. Tablet neben dem Laptop) für Initiative und Notizen – alles bleibt synchron.')),
            link(`/dm.html?c=${cid}`, tr('Spielleitung auf weiterem Gerät öffnen')),
            link(`/dm.html?c=${cid}&layout=panel`, tr('Reine DM-Anzeige (nur Panel) öffnen')),
          ),
        ),
        h('h3.section-title', icon('monitor'), tr(' Kiosk-Geräte (z.B. Raspberry Pi am Tisch)')),
        kioskAdmin.el,
        h('h3.section-title', icon('bulb'), tr(' LED-Beleuchtung')),
        wledCard,
      ),
    );
    text.value = S().display.player.text || '';
  };

  render();
  sync.onStatus(() => el.isConnected && render());
  return { el, refresh: render };
}
