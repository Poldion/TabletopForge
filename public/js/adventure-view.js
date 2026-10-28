// Abenteuer der Kampagne: auswählen (dann zeigen Sessions, Karten, Handouts, Lore und Kreaturen nur, was dazugehört),
// anlegen, umbenennen, beschreiben, löschen.
import { h, fill, uid, byOrder, bindInput, prompt2 } from './util.js';
import { icon } from './icons.js';
import { tr } from './i18n.js';
import { SCOPED, inAdventure } from '../../shared/scope.js';

export function createAdventuresView({ sync, go, current, setAdventure }) {
  const S = () => sync.state;

  const add = async () => {
    const name = await prompt2(tr('Name des Abenteuers'), tr('Abenteuer {x}', { x: Object.keys(S().adventures).length + 1 }));
    if (!name) return;
    const id = uid();
    sync.set(['adventures', id], { id, name, order: Date.now(), notes: '' });
    setAdventure(id);
    go('sessions');
  };

  /** Abenteuer löschen: seine Sessions mit; Karten, Bilder usw. bleiben in der Kampagne (Mediathek). */
  const remove = (a) => {
    const st = S();
    const sessions = Object.values(st.sessions).filter((s) => s.adventureId === a.id);
    if (!confirm(tr('Abenteuer „{name}“ samt {n} Sessions löschen? Karten, Bilder, Lore und Kreaturen bleiben in der Mediathek bzw. Kampagne.', { name: a.name, n: sessions.length }))) return;
    const ops = sessions.map((s) => ({ t: 'del', p: ['sessions', s.id] }));
    for (const coll of SCOPED) {
      for (const x of Object.values(st[coll] || {})) {
        if (x.adventureIds?.includes(a.id)) ops.push({ t: 'set', p: [coll, x.id, 'adventureIds'], v: x.adventureIds.filter((y) => y !== a.id) });
      }
    }
    ops.push({ t: 'del', p: ['adventures', a.id] });
    sync.do(ops);
  };

  return function view() {
    const page = h('div.page');
    const el = h('div.scroll', { style: { width: '100%' } }, page);
    const refreshers = [];

    const card = (a, on) => {
      const st = S();
      const n = (coll) => Object.values(st[coll] || {}).filter((x) => inAdventure(x, a.id)).length;
      const sessions = Object.values(st.sessions).filter((s) => s.adventureId === a.id).length;
      const notes = h('textarea', { rows: 2, placeholder: tr('Worum geht es? (optional)') });
      refreshers.push(bindInput(notes, () => S().adventures[a.id]?.notes, (v) => sync.set(['adventures', a.id, 'notes'], v), { debounceMs: 300 }));
      return h(
        'div.card.adv-card',
        { class: on ? 'current' : '' },
        h(
          'div.row',
          h('h3.grow', { style: { margin: 0 } }, icon('flag'), ` ${a.name}`),
          on ? h('span.chip', { style: { borderColor: 'var(--accent)', color: 'var(--accent)' } }, tr('aktuell')) : h('button.primary', { onclick: () => (setAdventure(a.id), go('sessions')) }, icon('check'), tr(' Auswählen')),
          h('button.small', { title: tr('Umbenennen'), onclick: async () => { const name = await prompt2(tr('Abenteuer umbenennen'), a.name); if (name) sync.merge(['adventures', a.id], { name }); } }, icon('edit')),
          h('button.small', { title: tr('Löschen'), onclick: () => remove(a) }, icon('trash')),
        ),
        h('div.small.muted', tr('{s} Sessions · {m} Karten · {a} Handouts & Bilder · {l} Lore · {c} Kreaturen', { s: sessions, m: n('maps'), a: n('assets'), l: n('lore'), c: n('creatures') })),
        notes,
      );
    };

    const render = () => {
      refreshers.length = 0;
      const cur = current();
      const advs = byOrder(S().adventures);
      fill(
        page,
        h('div.row', h('h2.grow', icon('flag'), tr(' Abenteuer')), h('button.primary', { onclick: add }, icon('plus'), tr(' Neues Abenteuer'))),
        h('p.muted', tr('Wähle das Abenteuer, an dem du arbeitest: Sessions, Karten, Handouts, Lore und Kreaturen zeigen dann nur, was dazugehört, und Neues landet automatisch darin. Alles der Kampagne findest du in der Mediathek, die Gruppe gilt für die ganze Kampagne.')),
        advs.length ? h('div.adv-cards', advs.map((a) => card(a, a.id === cur))) : h('p', tr('Noch keine Abenteuer – lege das erste an.')),
      );
    };
    render();
    return {
      el,
      refresh(changed) {
        if (!['adventures', 'sessions', ...SCOPED, '*'].some((k) => changed.has(k))) return;
        const typing = page.contains(document.activeElement) && document.activeElement.matches('textarea, input');
        if (typing) refreshers.forEach((f) => f());
        else render();
      },
    };
  };
}
