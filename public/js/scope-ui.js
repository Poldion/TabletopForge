// Abenteuer als Arbeitsbereich: Listen zeigen nur, was zum aktuellen Abenteuer gehört (Karten, Handouts, Lore,
// Kreaturen, Encounter). Welches Abenteuer gilt, legt die DM-Seite fest (scope.current): in der Vorbereitung das
// gewählte, beim Spielen das der aktiven Session, in den Kampagnen-Seiten (Mediathek …) keines = alles.
import { h, fill, byOrder, sortBy } from './util.js';
import { icon } from './icons.js';
import { tr, locale } from './i18n.js';
import { inAdventure, membershipOp } from '../../shared/scope.js';

export const scope = { current: () => null };

/** Gehört das Element zum aktuellen Abenteuer? (ohne Abenteuer: ja) */
export const inScope = (item) => inAdventure(item, scope.current());

/**
 * Zugehörigkeit zu Abenteuern als Umschalter (je Abenteuer ein Knopf). coll: 'maps' | 'assets' | 'lore' | …
 * Aktualisiert sich nach dem Klicken selbst.
 */
export function adventureChips(sync, coll, id) {
  const el = h('div.row.adv-chips');
  const render = () => {
    const st = sync.state;
    const advs = byOrder(st.adventures);
    const item = st[coll]?.[id];
    if (!advs.length || !item) return fill(el);
    fill(
      el,
      h('span.small.muted', icon('flag'), tr(' Abenteuer:')),
      advs.map((a) => {
        const on = !!item.adventureIds?.includes(a.id);
        return h('button.small', { class: on ? 'active' : '', title: on ? tr('Aus diesem Abenteuer nehmen') : tr('Zu diesem Abenteuer hinzufügen'), onclick: () => (sync.do(membershipOp(st, coll, id, a.id, !on)), render()) }, on ? icon('check') : null, ` ${a.name}`);
      }),
      item.adventureIds?.length ? null : h('span.small.muted', tr('(nicht zugeordnet – nur in der Mediathek)')),
    );
  };
  render();
  return el;
}

/**
 * Auswahl „aus der Kampagne hinzufügen“: Elemente, die (noch) nicht zum aktuellen Abenteuer gehören, neueste zuerst.
 * label: Beschriftung der leeren Option, name(x): Anzeigename, filter(x): weitere Einschränkung.
 */
export function addFromCampaign(sync, coll, { label, name = (x) => x.name || x.title, filter = () => true, onAdded } = {}) {
  const adv = scope.current();
  if (!adv) return null;
  const others = sortBy(Object.values(sync.state[coll] || {}).filter((x) => !inAdventure(x, adv) && filter(x)), (x) => -(x.createdAt || 0));
  if (!others.length) return null;
  const sel = h(
    'select',
    { title: tr('Aus anderen Abenteuern oder der Mediathek zu diesem Abenteuer hinzufügen') },
    h('option', { value: '' }, label || tr('+ Aus der Kampagne hinzufügen …')),
    others.map((x) => h('option', { value: x.id }, `${name(x)}${x.createdAt ? ` · ${new Date(x.createdAt).toLocaleDateString(locale)}` : ''}`)),
  );
  sel.addEventListener('change', () => {
    if (!sel.value) return;
    sync.do(membershipOp(sync.state, coll, sel.value, adv, true));
    onAdded?.(sel.value);
  });
  return sel;
}
