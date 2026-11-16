// Zaubereffekte: kurz aufleuchtende Animationen in der gewählten Farbe (rot wirkt wie Feuer, blau wie Wasser/Eis …),
// je nach Form des Wirkungsbereichs. Wie die Pings nur HTML-Elemente mit CSS-Animation über der Karte – Transform und
// Deckkraft rechnet der Grafikchip, die Karte muss nicht neu gezeichnet werden (auch auf dem Pi Zero).
//
// spellEffect(layer, s): s = { x, y } Ursprung in Bildschirmpixeln (CSS), angle (Grad, Bildschirm), len und width in
// Bildschirmpixeln, shape: circle | cone | cube | line, style (Linie): bolt | beam, color: '#rrggbb'.

export const SPELL_FX_MS = 2000;

let styled = false;
function ensureStyle() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  // i18n-ignore-next-line – Stilregeln
  st.textContent = `
.sp{position:absolute;width:0;height:0;pointer-events:none}
.sp *{position:absolute;pointer-events:none;will-change:transform,opacity}
.sp .sp-flash{border-radius:50%;animation:sp-flash .55s ease-out forwards}
.sp .sp-wave{border-radius:50%;animation:sp-wave .75s cubic-bezier(.2,.7,.3,1) forwards}
.sp .sp-ring{border-radius:50%;box-sizing:border-box;animation:sp-ring .7s cubic-bezier(.15,.6,.3,1) forwards}
.sp .sp-glow{border-radius:50%;animation:sp-glow 1.9s ease-out forwards}
.sp .sp-spark{border-radius:50%;animation:sp-spark .9s cubic-bezier(.1,.6,.3,1) forwards}
.sp .sp-fan{transform-origin:0 50%;animation:sp-fan .7s cubic-bezier(.2,.7,.3,1) forwards}
.sp .sp-ripple{transform-origin:0 50%;animation:sp-ripple .8s cubic-bezier(.2,.6,.3,1) forwards}
.sp .sp-afterglow{transform-origin:0 50%;animation:sp-after 1.8s ease-out forwards}
.sp .sp-block{transform-origin:0 50%;animation:sp-block .6s cubic-bezier(.2,.7,.3,1) forwards}
.sp .sp-bolt{animation:sp-bolt var(--t) cubic-bezier(.45,0,.9,.6) forwards}
.sp .sp-trail{transform-origin:100% 50%;animation:sp-trail var(--t) cubic-bezier(.45,0,.9,.6) forwards}
.sp .sp-beam{transform-origin:0 50%;animation:sp-beam .9s cubic-bezier(.15,.7,.3,1) forwards}
@keyframes sp-flash{0%{transform:scale(.15);opacity:1}35%{opacity:1}100%{transform:scale(1);opacity:0}}
@keyframes sp-wave{0%{transform:scale(.05);opacity:.95}70%{opacity:.85}100%{transform:scale(1);opacity:0}}
@keyframes sp-ring{0%{transform:scale(.05);opacity:1}80%{opacity:.9}100%{transform:scale(1.04);opacity:0}}
@keyframes sp-glow{0%,25%{opacity:0}40%{opacity:.55}100%{opacity:0}}
@keyframes sp-spark{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.3);opacity:0}}
@keyframes sp-fan{0%{transform:scaleX(.02) scaleY(.02);opacity:1}70%{opacity:.85}100%{transform:scale(1);opacity:0}}
@keyframes sp-ripple{0%{transform:scale(.02);opacity:0}15%{opacity:.9}100%{transform:scale(1.02);opacity:0}}
@keyframes sp-after{0%,30%{opacity:0}45%{opacity:.5}100%{opacity:0}}
@keyframes sp-block{0%{transform:scaleX(.02);opacity:1}60%{opacity:.85}100%{transform:scaleX(1);opacity:0}}
@keyframes sp-bolt{0%{transform:translateX(0);opacity:1}92%{opacity:1}100%{transform:translateX(var(--len));opacity:0}}
@keyframes sp-trail{0%{transform:translateX(0) scaleX(.1);opacity:0}20%{opacity:1}100%{transform:translateX(var(--len)) scaleX(1);opacity:0}}
@keyframes sp-beam{0%{transform:scaleX(.02);opacity:1}35%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1);opacity:0}}`;
  document.head.appendChild(st);
}

/** '#rrggbb' → 'rgba(r,g,b,a)'; heller Kern: Farbe zu Weiß gemischt. */
function rgba(hex, a, mixWhite = 0) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '') || [0, 'ff6a00'];
  const n = parseInt(m[1], 16);
  const mix = (c) => Math.round(c + (255 - c) * mixWhite);
  return `rgba(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)},${a})`;
}

function el(parent, cls, style) {
  const e = document.createElement('i');
  e.className = cls;
  for (const [k, v] of Object.entries(style)) {
    if (k.startsWith('--')) e.style.setProperty(k, v);
    else e.style[k] = v;
  }
  parent.appendChild(e);
  return e;
}

/** Funken, die vom Ursprung (bzw. aus einem Bereich) nach außen fliegen. */
function sparks(root, c, n, size, pick) {
  for (let i = 0; i < n; i++) {
    const { x, y, dx, dy } = pick(i);
    const s = size * (0.6 + Math.random() * 0.8);
    el(root, 'sp-spark', {
      left: `${x - s / 2}px`,
      top: `${y - s / 2}px`,
      width: `${s}px`,
      height: `${s}px`,
      background: rgba(c, 1, 0.55),
      boxShadow: `0 0 ${s * 1.5}px ${s * 0.6}px ${rgba(c, 0.8)}`,
      // Bis zum Start der eigenen Animation unsichtbar (sonst stünden die Funken kurz still im Ursprung)
      opacity: 0,
      animationDelay: `${0.05 + Math.random() * 0.15}s`,
      '--dx': `${dx}px`,
      '--dy': `${dy}px`,
    });
  }
}

/** Kreis/Sphäre: Lichtblitz im Zentrum, Farbwelle bis zum Rand, Druckring, Funken, kurzes Nachglühen. */
function burst(root, c, R) {
  const box = (r) => ({ left: `${-r}px`, top: `${-r}px`, width: `${2 * r}px`, height: `${2 * r}px` });
  el(root, 'sp-glow', { ...box(R), background: `radial-gradient(circle closest-side, ${rgba(c, 0.55)}, ${rgba(c, 0.3)} 70%, transparent)` });
  el(root, 'sp-wave', {
    ...box(R),
    background: `radial-gradient(circle closest-side, ${rgba(c, 0.15)} 0 35%, ${rgba(c, 0.75)} 75%, ${rgba(c, 0.95, 0.35)} 90%, transparent 100%)`,
  });
  el(root, 'sp-ring', { ...box(R), border: `${Math.max(3, R * 0.05)}px solid ${rgba(c, 0.95, 0.5)}`, boxShadow: `0 0 ${R * 0.12}px ${rgba(c, 0.9)}` });
  el(root, 'sp-flash', { ...box(R * 0.55), background: `radial-gradient(circle closest-side, ${rgba(c, 1, 0.9)}, ${rgba(c, 0.85, 0.3)} 45%, transparent)` });
  sparks(root, c, 14, Math.max(4, R * 0.06), () => {
    const a = Math.random() * Math.PI * 2;
    const d = R * (0.65 + Math.random() * 0.4);
    return { x: 0, y: 0, dx: Math.cos(a) * d, dy: Math.sin(a) * d };
  });
}

/** Kegel: Farbwelle fächert vom Ursprung in Wirkrichtung auf, Wellenringe laufen hinterher, Funken im Kegel. */
function cone(root, c, L) {
  const tri = 'polygon(0 50%, 100% 0, 100% 100%)';
  const area = { left: '0px', top: `${-L / 2}px`, width: `${L}px`, height: `${L}px`, clipPath: tri, webkitClipPath: tri };
  el(root, 'sp-afterglow', { ...area, background: `radial-gradient(circle at 0 50%, ${rgba(c, 0.5)}, ${rgba(c, 0.25)} 70%, transparent 100%)` });
  el(root, 'sp-fan', {
    ...area,
    background: `radial-gradient(circle at 0 50%, ${rgba(c, 1, 0.7)} 0, ${rgba(c, 0.85, 0.2)} 25%, ${rgba(c, 0.6)} 65%, transparent 100%)`,
  });
  for (let i = 0; i < 3; i++) {
    el(root, 'sp-ripple', {
      ...area,
      background: `radial-gradient(circle at 0 50%, transparent 0 82%, ${rgba(c, 0.9, 0.4)} 92%, transparent 100%)`,
      opacity: 0,
      animationDelay: `${0.12 + i * 0.16}s`,
    });
  }
  sparks(root, c, 12, Math.max(4, L * 0.035), () => {
    const a = (Math.random() - 0.5) * 0.9; // innerhalb des Kegels (halber Öffnungswinkel ≈ 26,6°)
    const d = L * (0.5 + Math.random() * 0.5);
    return { x: 0, y: 0, dx: Math.cos(a) * d, dy: Math.sin(a) * d };
  });
}

/** Würfel: Das Quadrat vor dem Ursprung lodert von vorn nach hinten auf. */
function cube(root, c, L) {
  const area = { left: '0px', top: `${-L / 2}px`, width: `${L}px`, height: `${L}px` };
  el(root, 'sp-afterglow', { ...area, background: `linear-gradient(90deg, ${rgba(c, 0.5)}, ${rgba(c, 0.3)})`, boxShadow: `0 0 ${L * 0.08}px ${rgba(c, 0.6)}` });
  el(root, 'sp-block', {
    ...area,
    background: `linear-gradient(90deg, ${rgba(c, 0.95, 0.6)}, ${rgba(c, 0.8, 0.15)} 55%, ${rgba(c, 0.4)})`,
    boxShadow: `0 0 ${L * 0.1}px ${rgba(c, 0.8)}`,
  });
  sparks(root, c, 12, Math.max(4, L * 0.035), () => ({
    x: L * Math.random() * 0.3,
    y: (Math.random() - 0.5) * L * 0.9,
    dx: L * (0.4 + Math.random() * 0.5),
    dy: (Math.random() - 0.5) * L * 0.3,
  }));
}

/** Linie als Geschoss: leuchtender Kopf mit Schweif fliegt die Linie entlang und zerplatzt am Ende. */
function bolt(root, c, L, W) {
  const t = Math.min(0.75, 0.25 + L / 2400); // längere Strecken etwas länger, aber immer zügig
  const head = Math.max(10, W * 1.3);
  const trail = Math.min(L * 0.45, head * 7);
  el(root, 'sp-trail', {
    left: `${-trail}px`,
    top: `${-head * 0.3}px`,
    width: `${trail}px`,
    height: `${head * 0.6}px`,
    borderRadius: `${head}px`,
    background: `linear-gradient(90deg, transparent, ${rgba(c, 0.55)} 60%, ${rgba(c, 0.95, 0.5)})`,
    '--len': `${L}px`,
    '--t': `${t}s`,
  });
  el(root, 'sp-bolt', {
    left: `${-head / 2}px`,
    top: `${-head / 2}px`,
    width: `${head}px`,
    height: `${head}px`,
    borderRadius: '50%',
    background: `radial-gradient(circle closest-side, ${rgba(c, 1, 0.95)}, ${rgba(c, 0.95, 0.4)} 45%, transparent)`,
    boxShadow: `0 0 ${head}px ${head * 0.3}px ${rgba(c, 0.7)}`,
    '--len': `${L}px`,
    '--t': `${t}s`,
  });
  // Einschlag am Ende
  const impact = document.createElement('i');
  impact.style.cssText = `left:${L}px;top:0px;width:0;height:0;will-change:auto`;
  root.appendChild(impact);
  const r = Math.max(head * 2.2, 24);
  const box = { left: `${-r}px`, top: `${-r}px`, width: `${2 * r}px`, height: `${2 * r}px` };
  // Erst beim Einschlag sichtbar (vorher hält opacity: 0, die Animation selbst bringt Deckkraft mit)
  el(impact, 'sp-flash', { ...box, background: `radial-gradient(circle closest-side, ${rgba(c, 1, 0.9)}, ${rgba(c, 0.8, 0.2)} 50%, transparent)`, animationDelay: `${t - 0.03}s`, opacity: 0 });
  el(impact, 'sp-ring', { ...box, border: `${Math.max(2, r * 0.08)}px solid ${rgba(c, 0.9, 0.5)}`, animationDelay: `${t}s`, opacity: 0 });
  sparks(impact, c, 8, Math.max(3, head * 0.3), () => {
    const a = Math.PI + (Math.random() - 0.5) * 2.4; // zurückspritzend
    const d = r * (0.6 + Math.random() * 0.6);
    return { x: 0, y: 0, dx: Math.cos(a) * d, dy: Math.sin(a) * d };
  });
  for (const s of impact.querySelectorAll('.sp-spark')) s.style.animationDelay = `${t + Math.random() * 0.1}s`;
}

/** Linie als Strahl (z.B. Blitz): die ganze Linie flammt vom Ursprung aus auf und verglimmt. */
function beam(root, c, L, W) {
  const w = Math.max(6, W);
  el(root, 'sp-beam', {
    left: '0px',
    top: `${-w}px`,
    width: `${L}px`,
    height: `${w * 2}px`,
    borderRadius: `${w}px`,
    background: `linear-gradient(0deg, transparent, ${rgba(c, 0.6)} 30%, ${rgba(c, 1, 0.85)} 50%, ${rgba(c, 0.6)} 70%, transparent)`,
    boxShadow: `0 0 ${w * 1.5}px ${rgba(c, 0.8)}`,
  });
  el(root, 'sp-afterglow', { left: '0px', top: `${-w * 1.5}px`, width: `${L}px`, height: `${w * 3}px`, borderRadius: `${w * 1.5}px`, background: `linear-gradient(0deg, transparent, ${rgba(c, 0.45)} 50%, transparent)` });
  sparks(root, c, 14, Math.max(3, w * 0.4), () => {
    const x = Math.random() * L;
    const a = (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + (Math.random() - 0.5) * 1.2);
    const d = w * (1.5 + Math.random() * 2.5);
    return { x, y: 0, dx: Math.cos(a) * d * 0.4, dy: Math.sin(a) * d };
  });
}

/** Effekt in der Ebene abspielen; entfernt sich nach SPELL_FX_MS selbst. */
export function spellEffect(layer, s) {
  ensureStyle();
  const root = document.createElement('div');
  root.className = 'sp';
  root.style.left = `${s.x}px`;
  root.style.top = `${s.y}px`;
  if (s.shape !== 'circle') root.style.transform = `rotate(${s.angle || 0}deg)`;
  const c = s.color || '#ff6a00';
  if (s.shape === 'circle') burst(root, c, s.len);
  else if (s.shape === 'cone') cone(root, c, s.len);
  else if (s.shape === 'cube') cube(root, c, s.len);
  else if (s.style === 'beam') beam(root, c, s.len, s.width);
  else bolt(root, c, s.len, s.width);
  layer.appendChild(root);
  setTimeout(() => root.remove(), SPELL_FX_MS + 400);
}
