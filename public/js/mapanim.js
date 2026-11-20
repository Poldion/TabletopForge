// Belebte Karte auf Spieltisch und Spieler-Display: wiegende Baumkronen, Wellen und Glitzern auf dem Wasser,
// Wolkenschatten und ab und zu ein Vogel. Alles sind HTML-Elemente über dem Kartenbild, bewegt nur per
// transform/opacity – das rechnet der Grafikchip, die Karte selbst wird dafür nicht neu gezeichnet.
// Die Daten (map.anim) schreibt der Kartenbauer beim Übernehmen der Karte; das Kartenbild enthält alles auch
// unbewegt, deshalb sieht die Karte ohne diese Ebene (schwache Geräte, DM-Ansicht) genauso aus.
import { BIOMES, canopy, dataUrl } from './mb-assets.js';

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
.mr-anim{position:absolute;pointer-events:none;overflow:hidden;contain:strict}
.mr-world{position:absolute;left:0;top:0;overflow:hidden;transform-origin:0 0}
.mr-world>*{position:absolute}
.mr-tree{will-change:transform;transform-origin:50% 56%}
@keyframes mr-sway1{from{transform:rotate(-1.6deg) translate(-2px,0)}to{transform:rotate(1.7deg) translate(2px,1px)}}
@keyframes mr-sway2{from{transform:rotate(1.3deg) translate(1px,-1px) scale(1.012)}to{transform:rotate(-1.5deg) translate(-2px,1px) scale(.99)}}
.mr-blob{will-change:transform;border-radius:50%;background:radial-gradient(closest-side,rgba(6,34,44,.2),rgba(6,34,44,.1) 55%,transparent);animation:mr-blob 19s ease-in-out infinite alternate}
@keyframes mr-blob{from{transform:translate(-9%,-5%) scale(.92)}to{transform:translate(10%,6%) scale(1.08)}}
.mr-glint{width:26px;height:26px;margin:-13px;will-change:opacity;animation:mr-glint 3.1s ease-in-out infinite alternate;background:radial-gradient(circle at 20% 30%,rgba(225,250,245,.95) 0 1.3px,transparent 1.9px),radial-gradient(circle at 70% 22%,rgba(225,250,245,.8) 0 1px,transparent 1.6px),radial-gradient(circle at 52% 74%,rgba(225,250,245,.9) 0 1.4px,transparent 2px)}
@keyframes mr-glint{0%{opacity:.05}60%{opacity:.35}100%{opacity:1}}
.mr-wave{width:0;height:0}
.mr-wave i{position:absolute;left:-24px;top:-7px;width:48px;height:13px;box-sizing:border-box;border-bottom:2px solid var(--foam);border-radius:0 0 50% 50%/0 0 100% 100%;will-change:transform,opacity;opacity:0;animation:mr-wave 5.2s ease-in-out infinite}
@keyframes mr-wave{0%{transform:translateY(-11px) scaleX(.8);opacity:0}45%{opacity:.85}80%{transform:translateY(5px) scaleX(1.05);opacity:.5}100%{transform:translateY(8px) scaleX(1.1);opacity:0}}
.mr-cloud{width:1100px;height:700px;will-change:transform;background:radial-gradient(ellipse closest-side,rgba(8,20,40,.17),rgba(8,20,40,.1) 55%,transparent)}
.mr-bird{left:0;top:0;width:0;height:0;will-change:transform}
.mr-bird b{position:absolute;left:14px;top:30px;width:56px;height:34px;background:radial-gradient(ellipse closest-side,rgba(0,0,0,.28),transparent)}
.mr-bird span{position:absolute;left:-30px;top:-25px;width:60px;height:50px}
.mr-bird img{position:absolute;left:0;top:0}
.mr-bird .w{will-change:transform;animation:mr-flap .19s ease-in-out infinite alternate}
@keyframes mr-flap{from{transform:scaleY(1)}to{transform:scaleY(.38)}}`;
  document.head.appendChild(st);
}

const INK = '#2a1e10';
const svg = (body) => dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="50" viewBox="0 0 60 50">${body}</svg>`);
// Vogel von oben, Flugrichtung nach rechts: Flügel und Rumpf getrennt – der Flügelschlag staucht nur das Flügelbild
const WINGS = svg(`<path d="M24 22 L15 1 L37 8 L36 23Z" fill="#d6d3c6" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M24 28 L15 49 L37 42 L36 27Z" fill="#d6d3c6" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M15 1 L22 4 L18 9Z M15 49 L22 46 L18 41Z" fill="#55524a"/>`);
const BODY = svg(`<path d="M8 25 L2 19 L4 25 L2 31Z" fill="#c9c6ba" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><ellipse cx="29" cy="25" rx="17" ry="7" fill="#e6e3d8" stroke="${INK}" stroke-width="1.6"/><circle cx="46" cy="25" r="6" fill="#e6e3d8" stroke="${INK}" stroke-width="1.6"/><path d="M51 23 L58 25 L51 27Z" fill="#d08a34" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`);

export class MapAnim {
  constructor() {
    style();
    this.el = Object.assign(document.createElement('div'), { className: 'mr-anim' });
    this.world = Object.assign(document.createElement('div'), { className: 'mr-world' });
    this.el.appendChild(this.world);
    this.el.style.display = 'none';
    this.key = null;
    this.items = []; // [Element, x, y, Radius] für das Ausblenden außerhalb des Bildschirms
    this.birdTimer = 0;
  }

  /** An Karte und Ansicht anpassen; map = null blendet die Ebene aus. r: MapRenderer (Ansicht und Größe). */
  sync(map, r) {
    if (!map?.anim) {
      if (this.key) this.clear();
      return;
    }
    const key = `${map.id}|${map.assetId}`;
    if (key !== this.key) this.build(map, key);
    const { cx, cy, scale, rotation, aspect = 1 } = r.view;
    this.world.style.transform = `translate(${r.width / 2}px,${r.height / 2}px) rotate(${rotation || 0}deg) scale(${scale},${scale * aspect}) translate(${-cx}px,${-cy}px)`;
    // Was nicht im Bild ist, braucht keine eigene Ebene im Grafikspeicher
    const corners = [r.screenToMap(0, 0), r.screenToMap(r.width, 0), r.screenToMap(0, r.height), r.screenToMap(r.width, r.height)];
    const x0 = Math.min(...corners.map((p) => p.x));
    const x1 = Math.max(...corners.map((p) => p.x));
    const y0 = Math.min(...corners.map((p) => p.y));
    const y1 = Math.max(...corners.map((p) => p.y));
    for (const [el, x, y, rad] of this.items) {
      const on = x + rad > x0 && x - rad < x1 && y + rad > y0 && y - rad < y1;
      if (el.hidden === on) el.hidden = !on;
    }
    this.bounds = [x0, y0, x1, y1];
  }

  clear() {
    this.key = null;
    this.items = [];
    this.world.replaceChildren();
    this.el.style.display = 'none';
    clearTimeout(this.birdTimer);
  }

  build(map, key) {
    this.clear();
    this.key = key;
    this.el.style.display = '';
    const a = map.anim;
    const B = BIOMES[a.biome] || BIOMES.meadow;
    const add = (el, x, y, rad) => {
      this.world.appendChild(el);
      this.items.push([el, x, y, rad]);
      return el;
    };
    const div = (cls, css) => {
      const el = document.createElement('div');
      el.className = cls;
      el.style.cssText = css;
      return el;
    };
    const W = map.width || 2000;
    const H = map.height || 1400;
    // Auf die Kartenfläche begrenzen: Kronen am Rand ragen sonst über die Karte hinaus
    this.world.style.width = `${W}px`;
    this.world.style.height = `${H}px`;
    this.world.style.setProperty('--foam', B.foam);
    const w = a.water || {};
    (w.blobs || []).forEach(([x, y, rad], i) => add(div('mr-blob', `left:${x - rad}px;top:${y - rad}px;width:${2 * rad}px;height:${2 * rad}px;animation-duration:${14 + (i % 7) * 2}s;animation-delay:${-(i * 3.7) % 20}s`), x, y, rad * 1.3));
    (w.glints || []).forEach(([x, y], i) => add(div('mr-glint', `left:${x}px;top:${y}px;animation-duration:${2.3 + (i % 5) * 0.6}s;animation-delay:${-(i * 1.3) % 5}s`), x, y, 20));
    (w.waves || []).forEach(([x, y, deg], i) => {
      const el = div('mr-wave', `left:${x}px;top:${y}px;transform:rotate(${deg - 90}deg)`);
      el.appendChild(document.createElement('i')).style.cssText = `animation-duration:${4.2 + (i % 6) * 0.5}s;animation-delay:${-(i * 1.9) % 7}s`;
      add(el, x, y, 40);
    });
    (a.trees || []).forEach(([x, y, d, seed]) => {
      const im = document.createElement('img');
      im.className = 'mr-tree';
      im.alt = '';
      im.src = dataUrl(canopy(d, seed, B.trees[seed % B.trees.length], B.tree));
      im.style.cssText = `left:${x - d / 2}px;top:${y - d / 2}px;width:${d}px;height:${d}px;animation:mr-sway${1 + (seed % 2)} ${(3.4 + (seed % 30) / 10).toFixed(1)}s ease-in-out ${(-(seed % 50) / 10).toFixed(1)}s infinite alternate`;
      add(im, x, y, d / 2);
    });
    if (a.clouds !== false) {
      for (const delay of [0, 0.5]) {
        const cl = div('mr-cloud', '');
        this.world.appendChild(cl);
        cl.animate([{ transform: `translate(-1200px,${H * 0.1}px)` }, { transform: `translate(${W + 200}px,${H * 0.45}px)` }], { duration: 55000 + W * 12, iterations: Infinity, delay: -delay * (55000 + W * 12) });
      }
    }
    if (a.birds !== false) {
      const fly = () => {
        if (!this.key || !document.body.contains(this.el)) return;
        const [bx0, by0, bx1, by1] = this.bounds || [0, 0, W, H];
        const fromLeft = Math.random() < 0.5;
        const y0 = by0 + Math.random() * (by1 - by0);
        const y1 = by0 + Math.random() * (by1 - by0);
        const xa = (fromLeft ? bx0 : bx1) + (fromLeft ? -90 : 90);
        const xb = (fromLeft ? bx1 : bx0) + (fromLeft ? 90 : -90);
        const ang = (Math.atan2(y1 - y0, xb - xa) * 180) / Math.PI;
        for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) {
          const b = div('mr-bird', '');
          b.innerHTML = `<b></b><span style="transform:rotate(${ang}deg)"><img class="w" src="${WINGS}" alt=""><img src="${BODY}" alt=""></span>`;
          this.world.appendChild(b);
          const ox = -i * 70 * Math.sign(xb - xa);
          const oy = (i % 2 ? 46 : -40) * i;
          const anim = b.animate([{ transform: `translate(${xa + ox}px,${y0 + oy}px)` }, { transform: `translate(${xb + ox}px,${y1 + oy}px)` }], { duration: Math.max(5000, Math.abs(xb - xa) * 5) + Math.random() * 3000, easing: 'linear' });
          anim.onfinish = () => b.remove();
        }
        this.birdTimer = setTimeout(fly, 9000 + Math.random() * 16000);
      };
      this.birdTimer = setTimeout(fly, 4000 + Math.random() * 6000);
    }
  }
}
