// Türen und Räume einer gebauten Karte. Die Türen stehen nicht im Kartenbild, sondern werden im Spiel darüber gezeichnet –
// so lassen sie sich öffnen und schließen, und eine geschlossene Tür hält das Licht auf wie eine Wand.
// Ohne DOM-Zugriff außer der übergebenen Zeichenfläche, damit sich die Rechnung ohne Browser testen lässt.

const INK = '#2a1e10';
/** Winkel, um den ein offenes Türblatt um sein Scharnier schwenkt. */
export const DOOR_SWING = -1.42;

/** Strecke, die eine geschlossene Tür versperrt: [x1, y1, x2, y2]. */
export function doorSegment(d) {
  if (d.seg) return d.seg;
  const ux = (Math.cos(d.a) * d.w) / 2;
  const uy = (Math.sin(d.a) * d.w) / 2;
  return [d.x - ux, d.y - uy, d.x + ux, d.y + uy].map((v) => Math.round(v * 10) / 10);
}

/**
 * Sperrstrecke einer Tür, an die Wandenden geheftet: In runden Wänden endet die Lücke auf dem Bogen, die Tür aber
 * wäre eine gerade Sehne – ohne das Heften bliebe ein Spalt, durch den Licht fällt.
 */
export function sealDoor(d, walls, slack = 16) {
  const seg = doorSegment({ ...d, seg: null });
  for (const i of [0, 2]) {
    let best = null;
    for (const w of walls) {
      for (const k of [0, 2]) {
        const dist = Math.hypot(w[k] - seg[i], w[k + 1] - seg[i + 1]);
        if (dist < slack && (!best || dist < best.dist)) best = { dist, x: w[k], y: w[k + 1] };
      }
    }
    if (best) (seg[i] = best.x), (seg[i + 1] = best.y);
  }
  return seg;
}

/** Wände der Karte samt aller geschlossenen Türen. */
export function wallsWithDoors(map) {
  const walls = map.walls || [];
  const shut = Object.values(map.doors || {}).filter((d) => !d.open);
  return shut.length ? walls.concat(shut.map(doorSegment)) : walls;
}

/** Kennung des Türzustands – ändert sich, sobald eine Tür auf- oder zugeht. */
export const doorState = (map) => (map.doors ? Object.values(map.doors).map((d) => (d.open ? 1 : 0)).join('') : '');

/** Tür an der Stelle (x, y) – getroffen wird die Türöffnung, gleich ob das Blatt offen oder zu ist. */
export function doorAt(map, x, y, slack = 0) {
  for (const d of Object.values(map.doors || {})) {
    const dx = x - d.x;
    const dy = y - d.y;
    const t = dx * Math.cos(d.a) + dy * Math.sin(d.a);
    const n = -dx * Math.sin(d.a) + dy * Math.cos(d.a);
    if (Math.abs(t) <= d.w / 2 + slack && Math.abs(n) <= 13 + slack) return d;
  }
  return null;
}

const inPoly = (p, x, y) => {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if (p[i + 1] > y !== p[j + 1] > y && x < ((p[j] - p[i]) * (y - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) inside = !inside;
  }
  return inside;
};
const polyArea = (p) => {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
  return Math.abs(a) / 2;
};

/**
 * Raum (Fläche zwischen Wänden) an der Stelle (x, y) oder null. Zuerst zählt die knappe Fläche bis zur Wandmitte –
 * so trifft ein Klick nahe der Wand nicht den Nachbarraum; erst danach die weite, die über die Wand hinausreicht.
 */
export function zoneAt(map, x, y) {
  for (const key of ['in', 'pts']) {
    let best = null;
    for (const z of map.zones || []) {
      const p = z[key] || z.pts;
      if (!inPoly(p, x, y) || (z.holes || []).some((h) => inPoly(h, x, y))) continue;
      const area = polyArea(p);
      if (!best || area < best.area) best = { zone: z, area };
    }
    if (best) return best.zone;
  }
  return null;
}

/** Nebel-Anweisung, die einen Raum auf- oder zudeckt. */
export const zoneOp = (zone, hide = false) => ({ m: hide ? 'hide' : 'reveal', s: 'poly', pts: zone.pts, ...(zone.holes ? { holes: zone.holes } : {}), z: zone.id });

/** Ist der Raum schon aufgedeckt (seit dem letzten Verdecken)? */
export function zoneShown(map, zone) {
  const ops = map.fog?.ops || [];
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    if (op.m === 'hide') return false;
    if (op.s === 'all' || op.z === zone.id) return true;
  }
  return false;
}

/**
 * Tür zeichnen: zu quer in der Öffnung, offen um das Scharnier geschwenkt.
 * Eine Geheimtür ist geschlossen nur für die Spielleitung markiert (dm) – am Tisch steht dort die Wand aus dem Kartenbild.
 * Offen zeigt sie den Durchgang und ein Stück Wand, das zur Seite geschwenkt ist.
 */
export function drawDoor(c, d, { dm = false } = {}) {
  const w = d.w;
  c.save();
  c.translate(d.x, d.y);
  c.rotate(d.a);
  if (d.secret && !d.open) {
    if (dm) {
      c.setLineDash([5, 4]);
      c.strokeStyle = '#d9a6ff';
      c.lineWidth = 2.4;
      c.strokeRect(-w / 2, -10, w, 20);
      c.setLineDash([]);
      c.fillStyle = 'rgba(150,90,200,.3)';
      c.fillRect(-w / 2, -10, w, 20);
    }
    c.restore();
    return;
  }
  // Wandstärke und Farbe des Stücks, das bei der Geheimtür zur Seite schwenkt
  const [thick, slab] = { wood: [8, '#806743'], palisade: [15, '#7a6242'], rampart: [30, '#a9a58c'] }[d.wall] || [14, '#a9a58c'];
  if (d.secret) {
    // Durchgang: die Wand aus dem Kartenbild überdecken
    const g = thick / 2 + 2.5;
    c.fillStyle = '#2b2520';
    c.fillRect(-w / 2, -g, w, 2 * g);
    c.strokeStyle = INK;
    c.lineWidth = 1.6;
    c.beginPath();
    for (const x of [-w / 2, w / 2]) {
      c.moveTo(x, -g);
      c.lineTo(x, g);
    }
    c.stroke();
  }
  c.translate(-w / 2, 0);
  if (d.open) {
    // Schatten des offenen Blatts auf dem Boden
    c.save();
    c.rotate(DOOR_SWING);
    c.fillStyle = 'rgba(40,24,34,.22)';
    c.fillRect(2, 0, w - 2, d.secret ? thick / 2 + 6 : 9);
    c.restore();
    c.rotate(DOOR_SWING);
  }
  const t = d.secret ? thick / 2 - 0.5 : 3.5;
  c.beginPath();
  if (c.roundRect) c.roundRect(0, -t, w, 2 * t, 1.4);
  else c.rect(0, -t, w, 2 * t);
  c.fillStyle = d.secret ? slab : d.open ? '#84653c' : '#7a5c36';
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 1.6;
  c.lineJoin = 'round';
  c.stroke();
  // Bretter- oder Steinfugen
  c.strokeStyle = 'rgba(42,30,16,.4)';
  c.lineWidth = 1;
  c.beginPath();
  for (const k of [0.34, 0.67]) {
    c.moveTo(w * k, -t + 0.5);
    c.lineTo(w * k, t - 0.5);
  }
  c.stroke();
  if (!d.secret) {
    c.fillStyle = '#b0a060';
    c.beginPath();
    c.arc(w - 9, 0, 2, 0, 7);
    c.fill();
    c.fillStyle = INK;
    c.beginPath();
    c.arc(0.5, 0, 2.6, 0, 7);
    c.fill();
  }
  if (dm && d.locked) {
    // Schloss – nur für die Spielleitung
    c.fillStyle = '#e8c04a';
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(w / 2, -4.5, 4.2, Math.PI, 0);
    c.stroke();
    c.fillRect(w / 2 - 6, -4.5, 12, 9.5);
    c.strokeRect(w / 2 - 6, -4.5, 12, 9.5);
  }
  c.restore();
}
