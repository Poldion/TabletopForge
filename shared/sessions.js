// Sessions als Drehbuch (ohne DOM): Szenen sortieren und offene Szenen in die nächste Session schieben, wenn ein Abend
// nicht fertig geworden ist.

const byOrder = (list) => [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/** Szenen einer Session in Reihenfolge. */
export const scenesOf = (s) => byOrder(Object.values(s?.scenes || {}));

/**
 * Ops, die die offenen Szenen einer Session an den Anfang der nächsten geplanten Session desselben Abenteuers schieben
 * (gibt es keine, wird eine angelegt – newId() liefert ihre ID). Karten und Handouts der Szenen kommen ins Material
 * der Ziel-Session, die aktuelle gilt als gespielt, und war sie die aktive, wird es die Ziel-Session.
 * Rückgabe: { ops, target } oder null, wenn nichts offen ist.
 */
export function carryOverOps(st, sid, newId, now = Date.now()) {
  const s = st.sessions?.[sid];
  const open = scenesOf(s).filter((x) => x.status !== 'done');
  if (!s || !open.length) return null;
  const later = byOrder(Object.values(st.sessions).filter((x) => x.adventureId === s.adventureId && x.id !== sid && (x.order ?? 0) > (s.order ?? 0) && x.status !== 'done'));
  let target = later[0]?.id;
  const ops = [];
  let targetSession = st.sessions[target];
  if (!target) {
    target = newId();
    const n = Object.values(st.sessions).filter((x) => x.adventureId === s.adventureId).length + 1;
    targetSession = { id: target, adventureId: s.adventureId, name: `Session ${n}`, date: '', status: 'planned', order: now, notes: '', liveNotes: '', mapIds: [], assetIds: [], loreIds: [], sketch: {}, scenes: {} };
    ops.push({ t: 'set', p: ['sessions', target], v: targetSession });
  }
  if (!targetSession.scenes) ops.push({ t: 'set', p: ['sessions', target, 'scenes'], v: {} }); // ältere Session ohne Szenen
  // Offene Szenen vor die schon geplanten der Ziel-Session
  const first = Math.min(0, ...scenesOf(targetSession).map((x) => x.order ?? 0)) - open.length - 1;
  const maps = new Set(targetSession.mapIds || []);
  const assets = new Set(targetSession.assetIds || []);
  open.forEach((x, i) => {
    ops.push({ t: 'set', p: ['sessions', target, 'scenes', x.id], v: { ...x, order: first + i, carried: true } });
    ops.push({ t: 'del', p: ['sessions', sid, 'scenes', x.id] });
    if (x.mapId) maps.add(x.mapId);
    for (const a of x.assetIds || []) assets.add(a);
  });
  ops.push({ t: 'set', p: ['sessions', target, 'mapIds'], v: [...maps] });
  ops.push({ t: 'set', p: ['sessions', target, 'assetIds'], v: [...assets] });
  if (s.status !== 'done') ops.push({ t: 'set', p: ['sessions', sid, 'status'], v: 'done' });
  if (st.display?.sessionId === sid) ops.push({ t: 'set', p: ['display', 'sessionId'], v: target });
  return { ops, target };
}
