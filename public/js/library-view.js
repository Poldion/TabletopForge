// Mediathek der Kampagne: alle Karten, Bilder und Dokumente aller Abenteuer an einem Ort – neueste zuerst, nach Tag,
// Woche oder Monat gruppiert (aufklappbar), mit Filter nach Art und Abenteuer. Rechts: Vorschau, Zuordnung zu
// Abenteuern und der Weg zur Bearbeitung.
import { h, fill, byOrder, fileUrl, api, toast } from './util.js';
import { icon } from './icons.js';
import { tr, locale } from './i18n.js';
import { thumb, dropzone, MAP_KINDS, isHandout, characterImageIds } from './components.js';
import { adventureChips } from './scope-ui.js';

const KINDS = () => ({ all: tr('Alles'), map: tr('Karten'), image: tr('Bilder'), document: tr('Dokumente') });
const GROUPS = () => ({ day: tr('Tag'), week: tr('Woche'), month: tr('Monat') });

/** Kalenderwoche nach ISO 8601: [Jahr, Woche]. */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  return [y, Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)];
}

/** Gruppe eines Zeitpunkts: { key (sortierbar), label }. */
export function periodOf(ts, by) {
  const d = new Date(ts || 0);
  if (!ts) return { key: '0', label: tr('Ohne Datum') };
  if (by === 'day') return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) };
  if (by === 'week') {
    const [y, w] = isoWeek(d);
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = (x) => x.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    return { key: `${y}-${String(w).padStart(2, '0')}`, label: tr('KW {w} · {from} – {to} {y}', { w, from: fmt(mon), to: fmt(sun), y }) };
  }
  return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }) };
}

export function createLibraryView({ sync, cid, go, setAdventure }) {
  const S = () => sync.state;
  const pref = (k, d) => {
    try {
      return localStorage.getItem(`dm:${cid}:library:${k}`) || d;
    } catch {
      return d;
    }
  };
  const savePref = (k, v) => {
    try {
      localStorage.setItem(`dm:${cid}:library:${k}`, v);
    } catch {
      /* nicht verfügbar */
    }
  };

  /** Einträge: Karten (mit ihrem Bild) und alle Dateien, die kein Kartenbild sind. */
  const entries = () => {
    const st = S();
    const mapAssets = new Set(Object.values(st.maps).map((m) => m.assetId));
    const charIds = characterImageIds(st);
    const tokenIds = new Set([...Object.values(st.creatures || {}), ...(st.party?.members || [])].map((x) => x.tokenAssetId).filter(Boolean));
    const badgeOf = (a) => (!isHandout(st, a, charIds) ? (a.use === 'token' || tokenIds.has(a.id) ? tr('Token') : tr('Porträt')) : a.ai ? tr('KI') : null);
    return [
      ...Object.values(st.maps).map((m) => ({ type: 'map', coll: 'maps', id: m.id, name: m.name, asset: st.assets[m.assetId], createdAt: m.createdAt || st.assets[m.assetId]?.createdAt || 0, adventureIds: m.adventureIds || [], badge: MAP_KINDS[m.kind] })),
      ...Object.values(st.assets)
        .filter((a) => !mapAssets.has(a.id))
        .map((a) => ({ type: a.kind === 'image' ? 'image' : 'document', coll: 'assets', id: a.id, name: a.name, asset: a, createdAt: a.createdAt || 0, adventureIds: a.adventureIds || [], badge: badgeOf(a) })),
    ].sort((x, y) => y.createdAt - x.createdAt);
  };

  return function view(selected) {
    let kind = pref('kind', 'all');
    let group = pref('group', 'month');
    let adv = pref('adv', '');
    let q = '';
    const [selColl, selId] = String(selected || '').split(':');
    const grid = h('div');
    const side = h('aside.library-side');

    const search = h('input', { type: 'search', placeholder: tr('Suchen …'), style: { maxWidth: '220px' } });
    search.addEventListener('input', () => ((q = search.value.trim().toLowerCase()), renderGrid()));
    const select = (opts, value, onchange) => h('select', { style: { width: 'auto' }, onchange: (e) => onchange(e.target.value) }, Object.entries(opts).map(([k, l]) => h('option', { value: k, selected: k === value }, l)));
    const advOptions = () => ({ '': tr('Alle Abenteuer'), none: tr('Nicht zugeordnet'), ...Object.fromEntries(byOrder(S().adventures).map((a) => [a.id, a.name])) });
    const advSel = h('span');
    const bar = h(
      'div.row',
      { style: { gap: '6px', flexWrap: 'wrap', margin: '10px 0' } },
      select(KINDS(), kind, (v) => ((kind = v), savePref('kind', v), renderGrid())),
      advSel,
      h('span.small.muted', tr('gruppiert nach')),
      select(GROUPS(), group, (v) => ((group = v), savePref('group', v), renderGrid())),
      search,
    );

    const renderGrid = () => {
      if (adv && adv !== 'none' && !S().adventures[adv]) adv = '';
      fill(advSel, select(advOptions(), adv, (v) => ((adv = v), savePref('adv', v), renderGrid())));
      const list = entries().filter(
        (e) =>
          (kind === 'all' || e.type === kind) &&
          (!adv || (adv === 'none' ? !e.adventureIds.length : e.adventureIds.includes(adv))) &&
          (!q || String(e.name || '').toLowerCase().includes(q)),
      );
      if (!list.length) return fill(grid, h('p.muted', entries().length ? tr('Nichts gefunden.') : tr('Noch keine Karten oder Dateien – oben hochladen.')));
      // Gruppen in Reihenfolge (neueste zuerst); die ersten beiden aufgeklappt
      const groups = new Map();
      for (const e of list) {
        const p = periodOf(e.createdAt, group);
        if (!groups.has(p.key)) groups.set(p.key, { label: p.label, items: [] });
        groups.get(p.key).items.push(e);
      }
      fill(
        grid,
        [...groups.values()].map((g, i) =>
          h(
            'details.library-group',
            { open: i < 2 || g.items.some((e) => e.id === selId) },
            h('summary', h('b', g.label), h('span.small.muted', ` · ${g.items.length}`)),
            h(
              'div.thumbs',
              g.items.map((e) => {
                const names = e.adventureIds.map((a) => S().adventures[a]?.name).filter(Boolean);
                return thumb(cid, e.asset, {
                  caption: e.name,
                  badge: e.type === 'map' ? e.badge : e.badge,
                  selected: e.id === selId,
                  title: `${e.name}\n${names.length ? names.join(', ') : tr('nicht zugeordnet')}`,
                  onclick: () => go(`library/${e.coll}:${e.id}`),
                });
              }),
            ),
          ),
        ),
      );
    };

    const renderSide = () => {
      const st = S();
      const item = st[selColl]?.[selId];
      if (!item) {
        const all = entries();
        const none = all.filter((e) => !e.adventureIds.length).length;
        return fill(
          side,
          h('h3', icon('folder'), tr(' Mediathek')),
          h('p.small.muted', tr('Alles, was die Kampagne an Karten, Bildern und Dokumenten hat – über alle Abenteuer. In den Abenteuern siehst du nur, was ihnen zugeordnet ist.')),
          h('p.small', tr('{n} Einträge · {none} keinem Abenteuer zugeordnet', { n: all.length, none })),
          none ? h('button.small', { onclick: () => ((adv = 'none'), savePref('adv', 'none'), renderGrid()) }, tr('Nicht zugeordnete zeigen')) : null,
        );
      }
      const isMap = selColl === 'maps';
      const asset = isMap ? st.assets[item.assetId] : item;
      // Bearbeiten: im Abenteuer öffnen, zu dem es gehört (sonst im aktuellen)
      const open = () => {
        const a = item.adventureIds?.[0];
        if (a) setAdventure(a);
        go(isMap ? `maps/${item.id}` : `assets/${item.id}`);
      };
      fill(
        side,
        asset?.kind === 'image' ? h('img', { src: fileUrl(cid, asset), style: { width: '100%', borderRadius: '8px', background: '#000' } }) : h('a.btn', { href: fileUrl(cid, asset), target: '_blank' }, icon('file'), tr(' Dokument öffnen')),
        h('h3', item.name),
        h('div.small.muted', [isMap ? MAP_KINDS[item.kind] : asset?.mime, item.createdAt || asset?.createdAt ? new Date(item.createdAt || asset.createdAt).toLocaleString(locale) : null].filter(Boolean).join(' · ')),
        asset?.ai ? h('details.small.muted', h('summary', tr('KI-Bild: {workflow}', { workflow: asset.ai.workflow })), asset.ai.prompt) : null,
        h('div.section-title', tr('Gehört zu')),
        adventureChips(sync, selColl, item.id),
        !isMap && !isHandout(st, item)
          ? h('label.inline', { style: { marginTop: '8px' } }, h('input', { type: 'checkbox', checked: item.handout === true, onchange: (e) => sync.set(['assets', item.id, 'handout'], e.target.checked) }), tr('Porträt/Token auch bei den Handouts zeigen'))
          : null,
        h('div.section-title', tr('Aktionen')),
        h('button.primary', { style: { width: '100%' }, onclick: open }, icon('edit'), isMap ? tr(' Karte bearbeiten') : tr(' Im Abenteuer öffnen')),
        asset?.kind === 'image'
          ? h('button', { style: { width: '100%', marginTop: '6px' }, onclick: () => (sync.merge(['display', 'player'], { mode: isMap ? 'map' : 'image', assetId: isMap ? null : asset.id, mapId: isMap ? item.id : null, caption: isMap ? '' : item.name }), toast(tr('Auf dem Spieler-Display angezeigt'))) }, icon('image'), tr(' Auf Spieler-Display zeigen'))
          : null,
        isMap
          ? null
          : h('button.danger', {
              style: { width: '100%', marginTop: '16px' },
              onclick: async () => {
                if (!confirm(tr('„{name}“ endgültig löschen?', { name: item.name }))) return;
                await api('DELETE', `/api/campaigns/${cid}/assets/${item.id}`);
                go('library');
              },
            }, tr('Datei löschen')),
      );
    };

    const el = h(
      'div.split',
      { style: { gridTemplateColumns: '1fr minmax(260px, 340px)' } },
      h('section', h('h2', { style: { margin: '0 0 6px' } }, icon('folder'), tr(' Mediathek')), dropzone(cid, { onUploaded: () => renderGrid() }), bar, grid),
      side,
    );
    side.style.borderRight = 'none';
    side.style.borderLeft = '1px solid var(--line)';
    renderGrid();
    renderSide();
    return {
      el,
      refresh(changed) {
        if (!['maps', 'assets', 'adventures', '*'].some((k) => changed.has(k))) return;
        renderGrid();
        if (selId && !S()[selColl]?.[selId]) return go('library');
        renderSide();
      },
    };
  };
}
