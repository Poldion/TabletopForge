// Zuordnung zu Abenteuern: Karten, Dateien (Handouts/Bilder), Lore, Kreaturen und Encounter tragen eine Liste
// adventureIds – ein Element kann in mehreren Abenteuern vorkommen (z.B. die Stammtaverne). Ohne Eintrag ist es
// „nicht zugeordnet“ und nur in der Mediathek der Kampagne zu sehen. Die Gruppe gilt immer für die ganze Kampagne.
// Ohne DOM (Server und Oberfläche).

export const SCOPED = ['maps', 'assets', 'lore', 'creatures', 'encounters'];

/** Gehört das Element zum Abenteuer? (ohne Abenteuer = alles) */
export const inAdventure = (item, advId) => !advId || !!item?.adventureIds?.includes(advId);

/** Elemente einer Sammlung, die zum Abenteuer gehören. */
export const scoped = (st, coll, advId) => Object.values(st?.[coll] || {}).filter((x) => inAdventure(x, advId));

/** Abenteuer, zu dem eine Session gehört (oder null). */
export const adventureOfSession = (st, sessionId) => {
  const id = st?.sessions?.[sessionId]?.adventureId;
  return id && st.adventures?.[id] ? id : null;
};

/**
 * Bestehende Kampagnen einmalig zuordnen: Gibt es genau ein Abenteuer, gehört alles dazu. Sonst gehört zu einem
 * Abenteuer, was seine Sessions schon verknüpft haben (Karten samt Kartenbild, Handouts, Lore) und was mit diesen
 * Karten verknüpft ist (Handouts, Lore). Der Rest bleibt nicht zugeordnet. Liefert true, wenn sich etwas geändert hat.
 */
export function migrateScopes(st) {
  if (st.scopeVersion >= 1) return false;
  st.scopeVersion = 1;
  const advs = Object.keys(st.adventures || {});
  const add = (coll, id, adv) => {
    const x = st[coll]?.[id];
    if (!x) return;
    if (!Array.isArray(x.adventureIds)) x.adventureIds = [];
    if (!x.adventureIds.includes(adv)) x.adventureIds.push(adv);
  };
  if (advs.length === 1) {
    for (const coll of SCOPED) for (const id of Object.keys(st[coll] || {})) add(coll, id, advs[0]);
    return true;
  }
  for (const s of Object.values(st.sessions || {})) {
    const adv = s.adventureId;
    if (!adv || !st.adventures?.[adv]) continue;
    for (const id of s.mapIds || []) {
      add('maps', id, adv);
      const m = st.maps?.[id];
      if (!m) continue;
      add('assets', m.assetId, adv);
      for (const h of m.handoutIds || []) add('assets', h, adv);
      for (const l of Object.values(st.lore || {})) if (l.mapIds?.includes(id)) add('lore', l.id, adv);
    }
    for (const id of s.assetIds || []) add('assets', id, adv);
    for (const id of s.loreIds || []) add('lore', id, adv);
  }
  return true;
}

/** Op, die ein Element einem Abenteuer hinzufügt bzw. es daraus entfernt. */
export function membershipOp(st, coll, id, advId, on) {
  const cur = st?.[coll]?.[id]?.adventureIds || [];
  const next = on ? (cur.includes(advId) ? cur : [...cur, advId]) : cur.filter((x) => x !== advId);
  return { t: 'set', p: [coll, id, 'adventureIds'], v: next };
}
