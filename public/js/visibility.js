// Sichtfläche einer Lichtquelle zwischen Wänden: Licht endet an Wänden und wirft dahinter harte Schatten.
// Ohne DOM, damit es sich ohne Browser testen lässt.

/** Abstand eines Punkts zu einer Strecke. */
function distToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L2)) : 0;
  return Math.hypot(x1 + dx * t - x, y1 + dy * t - y);
}

/**
 * Vieleck der von (ox, oy) aus sichtbaren Fläche bis zum Radius – oder null, wenn keine Wand in Reichweite ist
 * (dann leuchtet das Licht als voller Kreis). walls: [[x1, y1, x2, y2], …].
 * Eine Wand, auf der das Licht genau sitzt (Wandfackel), hält es nicht auf.
 */
export function visibilityPolygon(ox, oy, radius, walls) {
  const near = [];
  for (const w of walls || []) {
    const d = distToSegment(ox, oy, w[0], w[1], w[2], w[3]);
    if (d < radius && d > 0.5) near.push(w);
  }
  if (!near.length) return null;
  // Rand als Vieleck etwas außerhalb des Lichtkreises: jeder Strahl trifft dann sicher etwas
  const R = radius * 1.06;
  const N = 24;
  const segs = near.slice();
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * 2 * Math.PI;
    const a1 = ((i + 1) / N) * 2 * Math.PI;
    segs.push([ox + Math.cos(a0) * R, oy + Math.sin(a0) * R, ox + Math.cos(a1) * R, oy + Math.sin(a1) * R]);
  }
  const angles = [];
  for (const s of segs) {
    for (const [px, py] of [[s[0], s[1]], [s[2], s[3]]]) {
      const a = Math.atan2(py - oy, px - ox);
      angles.push(a - 1e-4, a, a + 1e-4);
    }
  }
  angles.sort((a, b) => a - b);
  const out = [];
  let last = null;
  for (const a of angles) {
    if (a === last) continue;
    last = a;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = Infinity;
    for (const s of segs) {
      const ex = s[2] - s[0];
      const ey = s[3] - s[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const fx = s[0] - ox;
      const fy = s[1] - oy;
      const t = (fx * ey - fy * ex) / den; // Abstand entlang des Strahls
      const u = (fx * dy - fy * dx) / den; // Lage auf der Strecke (0…1)
      if (t > 1e-3 && t < best && u >= -1e-9 && u <= 1 + 1e-9) best = t;
    }
    if (best < Infinity) out.push([ox + dx * best, oy + dy * best]);
  }
  return out;
}
