// Übersichtsseiten der Ebenen: Kampagne (Startseite der Vorbereitung: erste Schritte, Weiterspielen, Abenteuer, Gruppe)
// und Abenteuer (worum es geht, Sessions als Zeitleiste, Inhalte des Abenteuers).
import { h, fill, uid, byOrder, sortBy, fileUrl, bindInput, prompt2 } from './util.js';
import { icon } from './icons.js';
import { tr, locale } from './i18n.js';
import { statusLabel } from './components.js';
import { inAdventure, SCOPED } from '../../shared/scope.js';

const sessionsOf = (st, advId) => sortBy(Object.values(st.sessions).filter((s) => s.adventureId === advId), (s) => s.order);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(locale) : '');

/** Neue Session im Abenteuer anlegen (nummeriert) und ihre ID liefern. */
export function newSession(sync, adventureId) {
  const id = uid();
  const n = Object.values(sync.state.sessions).filter((s) => s.adventureId === adventureId).length + 1;
  sync.set(['sessions', id], { id, adventureId, name: `Session ${n}`, date: '', status: 'planned', order: Date.now(), notes: '', liveNotes: '', mapIds: [], assetIds: [], loreIds: [], sketch: {}, scenes: {} });
  return id;
}

/** Neues Abenteuer anlegen (fragt nach dem Namen); liefert die ID oder null. */
export async function newAdventure(sync) {
  const name = await prompt2(tr('Name des Abenteuers'), tr('Abenteuer {x}', { x: Object.keys(sync.state.adventures).length + 1 }));
  if (!name) return null;
  const id = uid();
  sync.set(['adventures', id], { id, name, order: Date.now(), notes: '' });
  return id;
}

const statusChip = (s, st) =>
  st.display.sessionId === s.id
    ? h('span.chip', { style: { borderColor: 'var(--ok)', color: 'var(--ok)' } }, tr('aktiv'))
    : h('span.chip', { class: `status-${s.status || 'planned'}` }, statusLabel[s.status] || statusLabel.planned);

// --- Kampagne -------------------------------------------------------------------------------------------

export function createCampaignOverview({ sync, cid, go, setAdventure, play }) {
  const S = () => sync.state;
  return function view() {
    const page = h('div.page');
    const el = h('div.scroll', { style: { width: '100%' } }, page);
    const render = () => {
      const st = S();
      const advs = byOrder(st.adventures);
      const party = st.party?.members || [];
      const sessions = Object.values(st.sessions);
      const active = st.sessions[st.display.sessionId];
      const openAdventure = (id) => (setAdventure(id), go('adventure'));
      const addAdventure = async () => {
        const id = await newAdventure(sync);
        if (id) openAdventure(id);
      };

      // Erste Schritte, solange etwas fehlt
      const steps = [
        [party.length > 0, tr('Gruppe anlegen'), tr('Charaktere mit Stufe – bestimmt die Schwierigkeit von Begegnungen.'), () => go('party')],
        [advs.length > 0, tr('Erstes Abenteuer anlegen'), tr('Ein Handlungsbogen mit eigenen Karten, Handouts, Lore und NSCs.'), addAdventure],
        [sessions.length > 0, tr('Erste Session planen'), tr('Im Abenteuer: Ablauf, Karten und Begegnungen für einen Spielabend.'), () => (advs[0] ? openAdventure(advs[0].id) : addAdventure())],
      ];
      const todo = steps.some(([done]) => !done);

      const portraitOf = (m) => (m.portraitAssetId && st.assets[m.portraitAssetId] ? fileUrl(cid, st.assets[m.portraitAssetId]) : '');
      fill(
        page,
        h('h1', { style: { marginTop: 0 } }, st.name),
        st.description ? h('p.muted', st.description) : null,
        todo
          ? h(
              'div.card.overview-steps',
              h('h3', tr('Erste Schritte')),
              steps.map(([done, title, hint, action], i) =>
                h('div.step', { class: done ? 'done' : '' }, h('span.step-n', done ? icon('check') : String(i + 1)), h('div.grow', h('b', title), h('div.small.muted', hint)), done ? null : h('button.primary', { onclick: action }, tr('Los'))),
              ),
            )
          : null,
        active
          ? h(
              'div.card.overview-active',
              h('div.small.muted', tr('Aktive Session')),
              h('div.row', h('h3.grow', { style: { margin: 0 } }, `${st.adventures[active.adventureId]?.name ? `${st.adventures[active.adventureId].name} · ` : ''}${active.name}`), h('button', { onclick: () => go(`session/${active.id}`) }, icon('edit'), tr(' Vorbereiten')), h('button.primary', { onclick: () => play({ sessionId: active.id }) }, icon('play'), tr(' Spielen'))),
            )
          : null,
        h('div.row', { style: { marginTop: '18px' } }, h('h2.grow', { style: { margin: 0 } }, icon('flag'), tr(' Abenteuer')), h('button', { onclick: addAdventure }, icon('plus'), tr(' Neues Abenteuer'))),
        advs.length
          ? h(
              'div.overview-cards',
              advs.map((a) => {
                const ss = sessionsOf(st, a.id);
                const played = ss.filter((s) => s.status === 'done').length;
                const next = ss.find((s) => s.status !== 'done');
                return h(
                  'div.card.clickable.overview-adv',
                  { onclick: () => openAdventure(a.id) },
                  h('h3', { style: { margin: '0 0 4px' } }, a.name),
                  a.notes ? h('p.small.muted', a.notes.length > 140 ? `${a.notes.slice(0, 140)}…` : a.notes) : null,
                  h('div.small', tr('{played} von {n} Sessions gespielt', { played, n: ss.length })),
                  next ? h('div.small.muted', tr('Nächste: {name}', { name: `${next.name}${next.date ? ` · ${fmtDate(next.date)}` : ''}` })) : null,
                );
              }),
            )
          : h('p.muted', tr('Noch keine Abenteuer.')),
        h('div.row', { style: { marginTop: '18px' } }, h('h2.grow', { style: { margin: 0 } }, icon('user'), tr(' Gruppe')), h('button', { onclick: () => go('party') }, icon('edit'), tr(' Bearbeiten'))),
        party.length
          ? h(
              'div.overview-party',
              party.map((m) => h('div.clickable', { onclick: () => go(`party/${m.id}`), title: m.name }, portraitOf(m) ? h('img', { src: portraitOf(m) }) : h('div.party-noimg', icon('user')), h('div.small', m.name || '–'), h('div.small.muted', tr('Stufe {level}', { level: m.level || 1 })))),
            )
          : h('p.muted', tr('Noch keine Charaktere.')),
      );
    };
    render();
    return { el, refresh: (changed) => ['adventures', 'sessions', 'party', 'display', 'assets', 'name', 'description', '*'].some((k) => changed.has(k)) && render() };
  };
}

// --- Abenteuer ------------------------------------------------------------------------------------------

export function createAdventureOverview({ sync, go, adventure, setAdventure, play }) {
  const S = () => sync.state;
  return function view() {
    const page = h('div.page');
    const el = h('div.scroll', { style: { width: '100%' } }, page);
    const refreshers = [];
    const render = () => {
      refreshers.length = 0;
      const st = S();
      const a = st.adventures[adventure()];
      if (!a) {
        return fill(page, h('p.muted', tr('Noch keine Abenteuer.')), h('button.primary', { onclick: async () => { const id = await newAdventure(sync); if (id) (setAdventure(id), render()); } }, icon('plus'), tr(' Neues Abenteuer')));
      }
      const notes = h('textarea', { rows: 4, placeholder: tr('Worum geht es? Ziel, Hintergrund, offene Fäden …') });
      refreshers.push(bindInput(notes, () => S().adventures[a.id]?.notes, (v) => sync.set(['adventures', a.id, 'notes'], v), { debounceMs: 300 }));
      const ss = sessionsOf(st, a.id);
      const n = (coll) => Object.values(st[coll] || {}).filter((x) => inAdventure(x, a.id)).length;
      fill(
        page,
        h(
          'div.row',
          h('h1.grow', { style: { margin: 0 } }, icon('flag'), ` ${a.name}`),
          h('button.small', { title: tr('Umbenennen'), onclick: async () => { const name = await prompt2(tr('Abenteuer umbenennen'), a.name); if (name) sync.merge(['adventures', a.id], { name }); } }, icon('edit')),
        ),
        notes,
        h('div.row', { style: { marginTop: '18px' } }, h('h2.grow', { style: { margin: 0 } }, icon('calendar'), tr(' Sessions')), h('button.primary', { onclick: () => go(`session/${newSession(sync, a.id)}`) }, icon('plus'), tr(' Neue Session'))),
        ss.length
          ? h(
              'div.timeline',
              ss.map((s, i) =>
                h(
                  'div.timeline-item.clickable',
                  { class: `status-${s.status || 'planned'}`, onclick: () => go(`session/${s.id}`) },
                  h('span.timeline-n', String(i + 1)),
                  h('div.grow', h('b', s.name), h('div.small.muted', [fmtDate(s.date), s.notes ? `${s.notes.replace(/[#*>]/g, '').slice(0, 90)}…` : ''].filter(Boolean).join(' · '))),
                  statusChip(s, st),
                  s.status !== 'done' ? h('button.small', { title: tr('Diese Session spielen'), onclick: (e) => (e.stopPropagation(), play({ sessionId: s.id })) }, icon('play')) : null,
                ),
              ),
            )
          : h('p.muted', tr('Noch keine Sessions – plane den ersten Spielabend.')),
        h('h2', { style: { marginTop: '18px' } }, tr('Inhalte')),
        h(
          'div.overview-counts',
          [
            ['maps', 'map', tr('Karten'), n('maps')],
            ['assets', 'image', tr('Handouts & Bilder'), n('assets')],
            ['lore', 'book', tr('Lore'), n('lore')],
            ['creatures', 'skull', tr('NSCs & Monster'), n('creatures')],
            ['creatures/encounters', 'swords', tr('Encounter'), n('encounters')],
          ].map(([route, ic, label, count]) => h('button.overview-count', { onclick: () => go(route) }, icon(ic), h('b', String(count)), h('span.small', label))),
        ),
      );
    };
    render();
    return {
      el,
      refresh(changed) {
        if (!['adventures', 'sessions', 'display', ...SCOPED, '*'].some((k) => changed.has(k))) return;
        if (page.contains(document.activeElement) && document.activeElement.matches('textarea, input')) refreshers.forEach((f) => f());
        else render();
      },
    };
  };
}
