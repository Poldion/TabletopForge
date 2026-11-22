// Stockwerke einer gebauten Karte. Obergeschosse (map.uppers, von unten nach oben) und Untergeschosse (map.lowers, von
// oben nach unten) liegen auf derselben Karte wie das Erdgeschoss und werden nur gezeigt, wenn die Spielleitung sie
// einblendet (map.floor = 1, 2, … nach oben, −1, −2, … nach unten) – etwa wenn die Gruppe eine Treppe nimmt.
// Eigen je Stockwerk sind Bild, Wände, Türen, Räume, Fenster, Lichter, Namen, Nebel und die Beleuchtung; Raster und
// Zeichnungen teilen sich alle. Figuren gehören zu einem Stockwerk (token.f, ohne Angabe das Erdgeschoss) und sind nur
// dort zu sehen. Ohne DOM, damit es sich ohne Browser testen lässt.

export const FLOOR_KEYS = ['assetId', 'walls', 'doors', 'zones', 'windows', 'lights', 'labels', 'fog', 'lighting'];
const OWN = new Set(FLOOR_KEYS);
const NO_FOG = Object.freeze({ enabled: false, ops: Object.freeze([]) });

const count = (list) => (Array.isArray(list) ? list.filter((u) => u?.assetId).length : 0);
/** Zahl der Obergeschosse bzw. Untergeschosse, die sich zeigen lassen. */
export const upperCount = (map) => count(map?.uppers);
export const lowerCount = (map) => count(map?.lowers);
/** Hat die Karte außer dem Erdgeschoss weitere Stockwerke? */
export const hasFloors = (map) => upperCount(map) + lowerCount(map) > 0;
/** Welches Stockwerk wird gezeigt? 0 = Erdgeschoss, 1 = erstes Obergeschoss, −1 = erstes Untergeschoss … */
export const shownFloor = (map) => Math.max(-lowerCount(map), Math.min(upperCount(map), Math.trunc(Number(map?.floor) || 0)));
/** Alle Stockwerke der Karte von ganz unten nach ganz oben, z. B. [-1, 0, 1, 2]. */
export const floorList = (map) => Array.from({ length: lowerCount(map) + upperCount(map) + 1 }, (_, i) => i - lowerCount(map));
/** Die Daten eines Stockwerks (für das Erdgeschoss die Karte selbst). */
const floorData = (map, f) => (f > 0 ? map.uppers?.[f - 1] : f < 0 ? map.lowers?.[-f - 1] : map);
/** Stockwerk einer Figur, auf die vorhandenen Stockwerke begrenzt. */
export const tokenFloor = (map, token) => Math.max(-lowerCount(map), Math.min(upperCount(map), Math.trunc(Number(token?.f) || 0)));

/** Name eines Stockwerks; nUp/nDown: wie viele es nach oben und unten gibt (bei nur einem entfällt die Nummer). */
export function floorLabel(f, nUp, nDown, tr) {
  if (!f) return tr('Erdgeschoss');
  if (f > 0) return nUp <= 1 ? tr('Obergeschoss') : tr('{n}. Obergeschoss', { n: f });
  return nDown <= 1 ? tr('Untergeschoss') : tr('{n}. Untergeschoss', { n: -f });
}

const views = new WeakMap();
/**
 * Die Karte so, wie sie gerade gezeigt wird: ohne weitere Stockwerke die Karte selbst, sonst eine Sicht darauf, in der
 * alles Stockwerk-Eigene vom gezeigten Stockwerk kommt und nur dessen Figuren erscheinen. Die Sicht liest bei jedem
 * Zugriff frisch – der Zustand wird an Ort und Stelle geändert.
 */
export function floorMap(map) {
  if (!map || !hasFloors(map)) return map || null;
  let v = views.get(map);
  if (!v) {
    v = new Proxy(map, {
      get(t, k) {
        const f = shownFloor(t);
        if (k === 'tokens') {
          if (!t.tokens) return t.tokens;
          const out = {};
          for (const id in t.tokens) if (tokenFloor(t, t.tokens[id]) === f) out[id] = t.tokens[id];
          return out;
        }
        if (!f) return t[k];
        if (OWN.has(k)) return floorData(t, f)?.[k] ?? (k === 'fog' ? NO_FOG : k === 'lighting' ? t.lighting : undefined);
        if (k === 'anim') return null; // wiegende Bäume gehören zum Erdgeschoss
        return t[k];
      },
    });
    views.set(map, v);
  }
  return v;
}

/** Pfad für eine Änderung an der gezeigten Karte: Stockwerk-Eigenes landet in dem Stockwerk, das gezeigt wird. */
export function floorPath(map, id, keys) {
  const f = shownFloor(map);
  if (!f || !OWN.has(keys[0])) return ['maps', id, ...keys];
  return f > 0 ? ['maps', id, 'uppers', f - 1, ...keys] : ['maps', id, 'lowers', -f - 1, ...keys];
}
