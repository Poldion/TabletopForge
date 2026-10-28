// Gemeinsame Zustandsoperationen für Server und Client.
// Ein Op hat die Form { t: 'set'|'merge'|'del'|'push', p: [pfad...], v: wert }.
// Sammlungen werden als Objekte (id -> eintrag) gespeichert, damit Pfade stabil bleiben.

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export function validPath(p) {
  return (
    Array.isArray(p) &&
    p.length > 0 &&
    p.every((k) => (typeof k === 'string' || Number.isInteger(k)) && !FORBIDDEN.has(k))
  );
}

/**
 * Wendet einen Op auf den Zustand an. Fehlende Zwischenknoten führen zu einem No-Op,
 * damit z.B. eine verspätete Bewegung eines bereits gelöschten Tokens nichts neu anlegt.
 * @returns {boolean} ob der Zustand verändert wurde
 */
export function applyOp(state, op) {
  if (!op || !validPath(op.p)) return false;
  const { t, p, v } = op;
  let obj = state;
  for (let i = 0; i < p.length - 1; i++) {
    obj = obj[p[i]];
    if (obj == null || typeof obj !== 'object') return false;
  }
  const last = p[p.length - 1];
  switch (t) {
    case 'set':
      obj[last] = clone(v);
      return true;
    case 'merge': {
      const cur = obj[last];
      if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) return false;
      Object.assign(cur, clone(v));
      return true;
    }
    case 'del':
      if (Array.isArray(obj)) obj.splice(last, 1);
      else delete obj[last];
      return true;
    case 'push': {
      if (!Array.isArray(obj[last])) obj[last] = [];
      const items = Array.isArray(v) ? v : [v];
      for (const item of items) obj[last].push(clone(item));
      return true;
    }
    default:
      return false;
  }
}

export function applyOps(state, ops) {
  let changed = false;
  for (const op of ops) changed = applyOp(state, op) || changed;
  return changed;
}

export function getPath(state, p) {
  let obj = state;
  for (const k of p) {
    if (obj == null) return undefined;
    obj = obj[k];
  }
  return obj;
}
