// Karten im Universal-VTT-Format (.dd2vtt, .uvtt, .df2vtt) einlesen: Das Kartenbild steckt mit Raster, Wänden, Türen und
// Lichtern in einer Datei. Hier wird sie zerlegt – ohne DOM, damit sich das ohne Browser testen lässt.
import { zonesFromSegments, simplify } from './mb-geom.js';

export const isUvtt = (name) => /\.(dd2vtt|uvtt|df2vtt)$/i.test(name || '');

const hexColor = (c) => (typeof c === 'string' && /^#?[0-9a-f]{6,8}$/i.test(c) ? `#${c.slice(-6).toLowerCase()}` : '#ffd9a0');

/** Base64 stückweise in Bytes wandeln – große Kartenbilder (viele MB) am Stück würden den Browser unnötig belasten. */
export function base64Bytes(b64) {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let n = 0;
  const STEP = 1 << 20; // durch vier teilbar
  for (let i = 0; i < clean.length; i += STEP) {
    const bin = atob(clean.slice(i, i + STEP));
    for (let k = 0; k < bin.length; k++) out[n++] = bin.charCodeAt(k);
  }
  return out.subarray(0, n);
}
/** Bildart aus den ersten Zeichen der Base64-Daten. */
const mimeOf = (b64) => (b64.startsWith('iVBOR') ? 'image/png' : b64.startsWith('/9j/') ? 'image/jpeg' : b64.startsWith('UklGR') ? 'image/webp' : 'image/png');

/**
 * Inhalt einer Universal-VTT-Datei für diese App aufbereiten. Liefert
 * { image: { b64, mime, ext }, width, height, grid, walls, doors, lights, zones } – Maße in Bild-Pixeln – oder wirft,
 * wenn es keine solche Datei ist.
 */
export function parseUvtt(data, feetPerCell = 5) {
  const res = data?.resolution;
  const ppg = Number(res?.pixels_per_grid);
  if (!data || typeof data.image !== 'string' || !(ppg > 0) || !res.map_size) throw new Error('uvtt');
  const ox = Number(res.map_origin?.x) || 0;
  const oy = Number(res.map_origin?.y) || 0;
  const px = (p) => [Math.round((p.x - ox) * ppg * 10) / 10, Math.round((p.y - oy) * ppg * 10) / 10];
  const width = Math.round(res.map_size.x * ppg);
  const height = Math.round(res.map_size.y * ppg);

  // Wände: Linienzüge in Feldern → einzelne Strecken in Pixeln; fast gerade Züge werden vereinfacht
  const walls = [];
  let roomWalls = 0; // die ersten Strecken stammen aus line_of_sight: nur sie begrenzen Räume
  const lines = [...(data.line_of_sight || []), ...(data.objects_line_of_sight || [])];
  lines.forEach((line, li) => {
    if (li === (data.line_of_sight || []).length) roomWalls = walls.length;
    if (!Array.isArray(line) || line.length < 2 || line.some((q) => !q || !Number.isFinite(q.x) || !Number.isFinite(q.y))) return;
    const raw = line.map(px);
    const tol = Math.max(0.6, ppg * 0.012);
    // Geschlossener Zug (Anfang = Ende): in zwei Hälften vereinfachen, sonst fiele er zu einem Punkt zusammen
    const closed = raw.length > 3 && Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) < 0.5;
    const m = raw.length >> 1;
    const pts = closed ? [...simplify(raw.slice(0, m + 1), tol), ...simplify(raw.slice(m), tol).slice(1)] : simplify(raw, tol);
    for (let i = 0; i < pts.length - 1; i++) {
      if (Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) < 0.5) continue;
      walls.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
    }
  });
  if (lines.length <= (data.line_of_sight || []).length) roomWalls = walls.length;

  // Türen: im Bild schon gezeichnet (plain) – hier zählt nur, ob sie Licht durchlassen
  const doors = {};
  (data.portals || []).forEach((p, i) => {
    const b = p?.bounds;
    if (!Array.isArray(b) || b.length < 2) return;
    const [x1, y1] = px(b[0]);
    const [x2, y2] = px(b[1]);
    const w = Math.hypot(x2 - x1, y2 - y1);
    if (w < 2) return;
    const id = `uv${i}`;
    doors[id] = { id, x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2), a: Math.round(Math.atan2(y2 - y1, x2 - x1) * 1000) / 1000, w: Math.round(w), open: p.closed === false, locked: false, plain: true, seg: [x1, y1, x2, y2] };
  });

  const lights = {};
  (data.lights || []).forEach((l, i) => {
    if (!l?.position || !(l.range > 0)) return;
    const [x, y] = px(l.position);
    const id = `uv${i}`;
    const reach = l.range * feetPerCell;
    lights[id] = { id, x: Math.round(x), y: Math.round(y), bright: Math.round(reach / 2), dim: Math.round(reach / 2), color: hexColor(l.color), on: true, seed: (i % 9) + 1 };
  });

  // Räume zum Aufdecken: zwischen Wänden und (geschlossenen) Türen eingeschlossene Flächen
  // Säulen, Stämme und andere Hindernisse (objects_line_of_sight) halten Licht auf, bilden aber keine Räume
  const segs = [...walls.slice(0, roomWalls), ...Object.values(doors).map((d) => d.seg)];
  const cells = (width / ppg) * (height / ppg);
  const zones = segs.length && cells <= 6000 ? zonesFromSegments(segs, width, height, Math.max(6, ppg / 7), ppg, 1.2) : [];
  const mime = mimeOf(data.image);
  return { image: { b64: data.image, mime, ext: mime.split('/')[1].replace('jpeg', 'jpg') }, width, height, grid: { size: Math.round(ppg * 100) / 100, offsetX: 0, offsetY: 0 }, walls, doors, lights, zones };
}
