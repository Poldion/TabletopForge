// Jede Karte merkt sich, wie sie zuletzt auf dem Spieltisch lag (Ausschnitt-Mitte, Größe, ganze Karte).
// Beim Wechsel wird der Stand der bisherigen Karte in display.table.saved abgelegt und der der neuen
// wiederhergestellt – so liegt die Weltkarte wieder bei ihrem Ausschnitt, die Kampfkarte wieder bei 1:1.

/** Gemerkte bzw. erste Ansicht einer Karte auf dem Tisch. */
export function savedTableView(st, mapId) {
  const m = st.maps[mapId];
  const saved = st.display.table.saved?.[mapId];
  if (saved) return saved;
  return { cx: (m?.width || 0) / 2, cy: (m?.height || 0) / 2, zoom: 1, fit: m?.kind === 'world' };
}

/**
 * Werte für display.table, um eine Karte auf den Tisch zu legen. extra überschreibt die gemerkte Ansicht
 * (z.B. eine neue Mitte oder blackout: false).
 */
export function tableViewPatch(st, mapId, extra = {}) {
  const t = st.display.table;
  // Gleiche Karte: nur die gewünschten Änderungen
  if (mapId && mapId === t.mapId) return { ...extra };
  const saved = {};
  // Nur Einträge noch vorhandener Karten behalten
  for (const [id, v] of Object.entries(t.saved || {})) if (st.maps[id]) saved[id] = v;
  if (t.mapId && st.maps[t.mapId]) saved[t.mapId] = { cx: t.cx, cy: t.cy, zoom: t.zoom || 1, fit: !!t.fit };
  if (!mapId) return { mapId: null, saved, ...extra };
  return { mapId, ...savedTableView({ ...st, display: { ...st.display, table: { ...t, saved } } }, mapId), ...extra, saved };
}

/** Karte auf den Tisch legen (mit ihrer zuletzt eingestellten Ansicht). */
export function putOnTable(sync, mapId, extra) {
  sync.merge(['display', 'table'], tableViewPatch(sync.state, mapId, extra));
}
