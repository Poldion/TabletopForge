// Kartenbauer: Stadt und Festung im Übersichtsmaßstab – kleine Stadthäuser in vielen Dachtönen und -formen (für ganze
// Viertel), dazu Häuserzeile, Hofhaus, Rathaus, große Halle, Lager- und Markthalle, Stall, Türme, Bastion, Zugbrücke.
// Alles von oben gesehen: Dächer mit Licht- und Schattenseite, die beim Drehen dem Licht zugewandt bleibt.
import { tr } from './i18n.js';
import { TOWN_SHAPES, townVariant } from './mb-geom.js';

/** h: Zeichenbausteine aus mb-assets.js. */
export function cityAssets(h) {
  const { svg, O, T, WD, f1, INK, LIGHT, mulberry } = h;
  // Dachtöne einer Stadt: Ziegel in vier Tönen, Holzschindel, heller Schiefer, Stroh
  const TONES = ['#9c6f5f', '#ab7d5c', '#8b6152', '#b08e6a', '#867759', '#7a8086', '#a89c75'];
  const COPPER = '#7fa391';
  const SLATE = '#6c7175';
  const stone = ['#c7c4a7', '#b3b196', '#a3a38b', '#8f8e74', '#5a594a']; // sehr hell … Linie
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const shade = (c, k) => `rgb(${hex(c).map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(',')})`;
  /** Helligkeit einer Dachfläche, die im Bild nach (nx, ny) zeigt: Lichtseite 1, Schattenseite rund 0,71. */
  const lf = (nx, ny, rot) => {
    const a = (rot * Math.PI) / 180;
    const l = -((nx * Math.cos(a) - ny * Math.sin(a)) * LIGHT[0] + (nx * Math.sin(a) + ny * Math.cos(a)) * LIGHT[1]);
    return 0.855 + 0.18 * l;
  };
  const P = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('') + 'Z';
  const poly = (pts, fill, extra = '') => `<path d="${P(pts)}" fill="${fill}" ${extra}/>`;
  const outline = (pts, w = 2) => `<path d="${P(pts)}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>`;
  const line = (d, w = 1.6, col = INK, op = 1) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" opacity="${op}"/>`;
  /** Reihenlinien auf einer Dachfläche: n Linien zwischen First (a→b) und Traufe (c→d). */
  const rows = (a, b, c, d, n = 2) => {
    let s = '';
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      s += `M${f1(a[0] + (c[0] - a[0]) * t)} ${f1(a[1] + (c[1] - a[1]) * t)} L${f1(b[0] + (d[0] - b[0]) * t)} ${f1(b[1] + (d[1] - b[1]) * t)}`;
    }
    return line(s, 1, '#000', 0.2);
  };
  const chimney = (x, y, s = 7) => `<rect x="${f1(x - s / 2)}" y="${f1(y - s / 2)}" width="${s}" height="${s}" fill="#8a887a" stroke="${INK}" stroke-width="1"/><rect x="${f1(x - s / 4)}" y="${f1(y - s / 4)}" width="${f1(s / 2)}" height="${f1(s / 2)}" fill="#2a2420"/>`;

  /** Satteldach über dem Rechteck (x, y, w, d), First waagrecht in der Mitte. */
  const gable = (x, y, w, d, col, rot, k = 1) => {
    const m = y + d / 2;
    return `${poly([[x, y], [x + w, y], [x + w, m], [x, m]], shade(col, lf(0, -1, rot) * k))}${poly([[x, m], [x + w, m], [x + w, y + d], [x, y + d]], shade(col, lf(0, 1, rot) * k))}${rows([x, m], [x + w, m], [x, y], [x + w, y])}${rows([x, m], [x + w, m], [x, y + d], [x + w, y + d])}${line(`M${f1(x)} ${f1(m)} H${f1(x + w)}`, 1.6)}`;
  };
  /** Satteldach mit senkrechtem First (für Flügel und giebelständige Teile). */
  const gableV = (x, y, w, d, col, rot, k = 1) => {
    const m = x + w / 2;
    return `${poly([[x, y], [m, y], [m, y + d], [x, y + d]], shade(col, lf(-1, 0, rot) * k))}${poly([[m, y], [x + w, y], [x + w, y + d], [m, y + d]], shade(col, lf(1, 0, rot) * k))}${rows([m, y], [m, y + d], [x, y], [x, y + d])}${rows([m, y], [m, y + d], [x + w, y], [x + w, y + d])}${line(`M${f1(m)} ${f1(y)} V${f1(y + d)}`, 1.6)}`;
  };
  /** Walmdach: First um die halbe Tiefe verkürzt, Grate zu den Ecken. */
  const hip = (x, y, w, d, col, rot, k = 1) => {
    const m = y + d / 2;
    const a = [x + d / 2, m];
    const b = [x + w - d / 2, m];
    return `${poly([[x, y], [x + w, y], b, a], shade(col, lf(0, -1, rot) * k))}${poly([a, b, [x + w, y + d], [x, y + d]], shade(col, lf(0, 1, rot) * k))}${poly([[x, y], a, [x, y + d]], shade(col, lf(-1, 0, rot) * k))}${poly([[x + w, y], b, [x + w, y + d]], shade(col, lf(1, 0, rot) * k))}${rows(a, b, [x, y], [x + w, y], 1)}${rows(a, b, [x, y + d], [x + w, y + d], 1)}${line(`M${f1(a[0])} ${f1(a[1])} H${f1(b[0])} M${f1(x)} ${f1(y)} L${f1(a[0])} ${f1(a[1])} L${f1(x)} ${f1(y + d)} M${f1(x + w)} ${f1(y)} L${f1(b[0])} ${f1(b[1])} L${f1(x + w)} ${f1(y + d)}`, 1.3)}`;
  };
  /** Pyramidendach (Turmspitze). */
  const pyramid = (x, y, w, d, col, rot) => {
    const c = [x + w / 2, y + d / 2];
    return `${poly([[x, y], [x + w, y], c], shade(col, lf(0, -1, rot)))}${poly([[x + w, y], [x + w, y + d], c], shade(col, lf(1, 0, rot)))}${poly([[x + w, y + d], [x, y + d], c], shade(col, lf(0, 1, rot)))}${poly([[x, y + d], [x, y], c], shade(col, lf(-1, 0, rot)))}${line(`M${f1(x)} ${f1(y)} L${f1(x + w)} ${f1(y + d)} M${f1(x + w)} ${f1(y)} L${f1(x)} ${f1(y + d)}`, 1.2)}<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(d)}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="2.4" fill="${shade(col, 1.2)}" stroke="${INK}" stroke-width="1"/>`;
  };
  const rect = (x, y, w, d, lw = 2) => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(d)}" fill="none" stroke="${INK}" stroke-width="${lw}" stroke-linejoin="round"/>`;
  /** Zinnen rund um ein Rechteck. */
  const merlons = (x, y, w, d) => {
    let s = '';
    const put = (mx, my) => (s += `<rect x="${f1(mx - 5)}" y="${f1(my - 5)}" width="10" height="10" rx="1.5" fill="${stone[0]}" ${T}/>`);
    const nx = Math.max(2, Math.round(w / 19));
    const ny = Math.max(2, Math.round(d / 19));
    for (let i = 0; i <= nx; i++) (put(x + 6 + ((w - 12) * i) / nx, y + 6), put(x + 6 + ((w - 12) * i) / nx, y + d - 6));
    for (let i = 1; i < ny; i++) (put(x + 6, y + 6 + ((d - 12) * i) / ny), put(x + w - 6, y + 6 + ((d - 12) * i) / ny));
    return s;
  };

  /** Stadthaus: Dachton, Form und Kleinigkeiten (Schornsteine, Gaube) aus der Variante. */
  const townHouse = (v, rot) => {
    const { tone, shape, seed } = townVariant(v);
    const r = mulberry(seed * 977 + tone * 31 + shape * 7 + 5);
    const col = TONES[tone];
    const k = 0.95 + r() * 0.1; // jedes Haus eine Spur heller oder dunkler
    const [w, d] = TOWN_SHAPES[shape];
    const p = 4;
    let s = '';
    let hull;
    if (shape === 3) {
      s += hip(p, p, w, d, col, rot, k);
      hull = [[p, p], [p + w, p], [p + w, p + d], [p, p + d]];
    } else if (shape === 4) {
      // Anbau mit Pultdach an der Rückseite
      const a = 18;
      s += poly([[p + 14, p], [p + w - 22, p], [p + w - 22, p + a + 2], [p + 14, p + a + 2]], shade(col, lf(0, -1, rot) * k * 1.08)) + line(`M${p + 14} ${p + a} H${p + w - 22}`, 1.2) + rect(p + 14, p, w - 36, a + 2, 1.6);
      s += gable(p, p + a, w, d - a, col, rot, k);
      hull = [[p, p + a], [p + w, p + a], [p + w, p + d], [p, p + d]];
    } else if (shape === 5) {
      // Winkelhaus: Flügel nach hinten
      const ww = 46;
      const main = 56;
      s += gableV(p + w - ww, p, ww, d - main + 8, col, rot, k) + rect(p + w - ww, p, ww, d - main + 8, 2);
      s += gable(p, p + d - main, w, main, col, rot, k);
      hull = [[p, p + d - main], [p + w, p + d - main], [p + w, p + d], [p, p + d]];
    } else {
      s += gable(p, p, w, d, col, rot, k);
      hull = [[p, p], [p + w, p], [p + w, p + d], [p, p + d]];
    }
    s += outline(hull, 2);
    // Schornsteine (0–2) und ab und zu eine Gaube
    const top = hull[0][1];
    const bottom = hull[2][1];
    const mid = (top + bottom) / 2;
    for (let i = 0, n = Math.floor(r() * 2.6); i < n; i++) s += chimney(p + 12 + r() * (w - 24), mid + (r() < 0.5 ? -1 : 1) * (4 + r() * (bottom - mid - 10)), 7);
    if (shape < 3 && r() < 0.3) {
      const gx = p + 16 + r() * (w - 44);
      s += `<rect x="${f1(gx)}" y="${f1(bottom - 15)}" width="12" height="11" fill="${shade(col, lf(0, 1, rot) * k * 1.12)}" stroke="${INK}" stroke-width="1.1"/>${line(`M${f1(gx + 6)} ${f1(bottom - 15)} v11`, 1)}`;
    }
    return svg(w + 2 * p, d + 2 * p, s, 1.2, true);
  };

  return {
    townHouse: {
      // Die Variante bestimmt Dachton (sieben Töne), Form (Sattel-, Walmdach, Anbau, Winkel) und Details
      cat: 'building', label: tr('Stadthaus'), h: 16, lit: true,
      make: (v, B, px, rot = 0) => townHouse(v, rot),
    },
    rowHouses: {
      cat: 'building', label: tr('Häuserzeile'), h: 20, lit: true,
      make: (v, B, px, rot = 0) => {
        const r = mulberry(v + 3);
        let s = '';
        let x = 5;
        const n = 4 + (v % 2);
        const base = v % 5;
        const edge = [];
        for (let i = 0; i < n; i++) {
          const w = 52 + r() * 26;
          const off = Math.round(r() * 8);
          const d = 70 + Math.round(r() * 8);
          const col = TONES[(base + (r() < 0.6 ? 0 : 1 + Math.floor(r() * 3))) % 5];
          const k = 0.94 + r() * 0.12;
          s += gable(x, 6 + off, w, d, col, rot, k) + rect(x, 6 + off, w, d, 2);
          if (r() < 0.8) s += chimney(x + 5, 6 + off + d / 2 + (r() < 0.5 ? -9 : 9), 7);
          if (r() < 0.5) s += `<rect x="${f1(x + w / 2 - 6)}" y="${f1(6 + off + d - 16)}" width="12" height="11" fill="${shade(col, lf(0, 1, rot) * k * 1.12)}" stroke="${INK}" stroke-width="1.1"/>`;
          // Brandmauer zwischen den Parzellen
          if (i) edge.push(`<rect x="${f1(x - 1.6)}" y="${f1(7 + off)}" width="3.2" height="${f1(d - 2)}" fill="${stone[0]}" stroke="${INK}" stroke-width=".7"/>`);
          x += w;
        }
        return svg(Math.ceil(x + 5), 96, s + edge.join(''), 1.4, true);
      },
    },
    courtyardHouse: {
      cat: 'building', label: tr('Haus mit Innenhof'), h: 24, lit: true,
      make: (v, B, px, rot = 0) => {
        const col = TONES[v % 5];
        const W = 200;
        const t = 54; // Tiefe eines Flügels
        const a = 5;
        const b = a + W;
        const i0 = a + t;
        const i1 = b - t;
        const f = (pts, nx, ny) => poly(pts, shade(col, lf(nx, ny, rot)));
        const m = t / 2;
        // Vier Flügel, je eine äußere und eine innere Dachfläche; die Ecken sind auf Gehrung geschnitten
        const s = `<rect x="${i0}" y="${i0}" width="${i1 - i0}" height="${i1 - i0}" fill="#bdb59d"/><path d="M${i0} ${i0} h${i1 - i0} v10 h-${i1 - i0 - 12} v${i1 - i0 - 10} h-12Z" fill="#000" opacity=".2"/>${line(`M${i0 + 14} ${i0 + 30} h${i1 - i0 - 28} M${i0 + 14} ${i0 + 56} h${i1 - i0 - 28}`, 1, '#000', 0.14)}<circle cx="${(a + b) / 2 + 8}" cy="${(a + b) / 2 + 8}" r="7" fill="${stone[1]}" ${T}/><circle cx="${(a + b) / 2 + 8}" cy="${(a + b) / 2 + 8}" r="3.6" fill="#4f7f86"/>
          ${f([[a, a], [b, a], [b - m, a + m], [a + m, a + m]], 0, -1)}${f([[a + m, a + m], [b - m, a + m], [i1, i0], [i0, i0]], 0, 1)}
          ${f([[a, b], [b, b], [b - m, b - m], [a + m, b - m]], 0, 1)}${f([[a + m, b - m], [b - m, b - m], [i1, i1], [i0, i1]], 0, -1)}
          ${f([[a, a], [a, b], [a + m, b - m], [a + m, a + m]], -1, 0)}${f([[a + m, a + m], [a + m, b - m], [i0, i1], [i0, i0]], 1, 0)}
          ${f([[b, a], [b, b], [b - m, b - m], [b - m, a + m]], 1, 0)}${f([[b - m, a + m], [b - m, b - m], [i1, i1], [i1, i0]], -1, 0)}
          ${line(`M${a + m} ${a + m} H${b - m} V${b - m} H${a + m}Z M${a} ${a} L${i0} ${i0} M${b} ${a} L${i1} ${i0} M${b} ${b} L${i1} ${i1} M${a} ${b} L${i0} ${i1}`, 1.4)}${rect(i0, i0, i1 - i0, i1 - i0, 1.8)}${rect(a, a, W, W, 2.2)}
          <rect x="${(a + b) / 2 - 12}" y="${b - t}" width="24" height="${t}" fill="#bdb59d" stroke="${INK}" stroke-width="1.2"/><path d="M${(a + b) / 2 - 12} ${b - t} h24 v8 h-24Z" fill="#000" opacity=".25"/>${chimney(a + 30, a + m - 8)}${chimney(b - m + 8, b - 60)}`;
        return svg(W + 10, W + 10, s, 1.6, true);
      },
    },
    townHall: {
      cat: 'building', label: tr('Rathaus'), h: 34, lit: true,
      make: (v, B, px, rot = 0) => {
        const col = [TONES[2], TONES[5], TONES[0]][v % 3];
        const s = `<rect x="86" y="126" width="60" height="18" fill="${stone[1]}" ${T}/>${line('M88 132 h56 M88 138 h56', 1, '#000', 0.25)}${hip(6, 34, 220, 96, col, rot)}${rect(6, 34, 220, 96, 2.2)}
          ${[52, 180].map((x) => `<rect x="${x - 7}" y="104" width="14" height="13" fill="${shade(col, lf(0, 1, rot) * 1.1)}" stroke="${INK}" stroke-width="1.1"/><rect x="${x - 7}" y="46" width="14" height="13" fill="${shade(col, lf(0, -1, rot) * 1.1)}" stroke="${INK}" stroke-width="1.1"/>`).join('')}
          ${chimney(40, 82, 8)}${chimney(196, 82, 8)}<rect x="88" y="78" width="56" height="56" fill="${stone[2]}" ${O}/>${pyramid(92, 82, 48, 48, COPPER, rot)}`;
        return svg(232, 150, s, 1.6, true);
      },
    },
    greatHall: {
      cat: 'building', label: tr('Große Halle'), h: 40, lit: true,
      make: (v, B, px, rot = 0) => {
        const stepped = (x) => `<rect x="${x}" y="6" width="12" height="132" fill="${stone[1]}" ${T}/>${[18, 44, 72, 100, 126].map((y, i) => `<rect x="${x - 2}" y="${y - 6}" width="16" height="12" fill="${stone[0]}" stroke="${INK}" stroke-width="1"/>`).join('')}`;
        const s = `<rect x="118" y="134" width="30" height="20" fill="${stone[1]}" ${T}/>${line('M120 140 h26 M120 146 h26', 1, '#000', 0.25)}${gable(12, 8, 266, 128, SLATE, rot)}${rect(12, 8, 266, 128, 2.2)}${stepped(6)}${stepped(272)}${chimney(70, 50, 10)}${chimney(210, 96, 10)}`;
        return svg(290, 158, s, 1.6, true);
      },
    },
    warehouse: {
      cat: 'building', label: tr('Lagerhaus'), h: 26, lit: true,
      make: (v, B, px, rot = 0) => {
        const col = [TONES[2], TONES[4]][v % 2];
        const s = `<path d="M196 56 H232" stroke="${INK}" stroke-width="6.6" stroke-linecap="round"/><path d="M196 56 H232" stroke="${WD.dark}" stroke-width="4" stroke-linecap="round"/><circle cx="230" cy="56" r="4.4" fill="${WD.top}" ${T}/>${gable(6, 6, 196, 100, col, rot)}${rect(6, 6, 196, 100, 2.2)}${[60, 140].map((x) => `<rect x="${x - 7}" y="74" width="14" height="14" fill="#3a3530" stroke="${INK}" stroke-width="1.1"/>`).join('')}<rect x="212" y="80" width="18" height="18" rx="1.5" fill="#77633f" ${T}/><circle cx="222" cy="24" r="9" fill="#8a7049" ${T}/>`;
        return svg(240, 112, s, 1.6, true);
      },
    },
    marketHall: {
      cat: 'building', label: tr('Markthalle'), h: 22, lit: true,
      make: (v, B, px, rot = 0) => {
        let awning = '';
        for (let x = 8; x < 232; x += 14) awning += `<rect x="${x}" y="118" width="14" height="12" fill="${(x / 14) % 2 < 1 ? '#a8483a' : '#d9d3b8'}" stroke="${INK}" stroke-width=".8"/>`;
        const s = `${awning}${gable(6, 6, 228, 112, TONES[4], rot)}${rect(6, 6, 228, 112, 2.2)}<rect x="46" y="52" width="148" height="20" fill="${shade(TONES[4], 1.16)}" stroke="${INK}" stroke-width="1.4"/>${line('M46 62 H194', 1.2)}`;
        return svg(240, 136, s, 1.6, true);
      },
    },
    stable: {
      cat: 'building', label: tr('Stall'), h: 14, lit: true,
      make: (v, B, px, rot = 0) => {
        const col = [TONES[6], TONES[4]][v % 2];
        let posts = '';
        for (let x = 12; x <= 190; x += 30) posts += `<circle cx="${x}" cy="100" r="3" fill="${WD.dark}" stroke="${INK}" stroke-width="1"/>`;
        const s = `<rect x="6" y="78" width="190" height="22" fill="${shade(col, lf(0, 1, rot) * 1.1)}" stroke="${INK}" stroke-width="1.6"/>${line('M6 89 H196', 1, '#000', 0.2)}${posts}${gable(6, 6, 190, 74, col, rot)}${rect(6, 6, 190, 74, 2.2)}`;
        return svg(202, 108, s, 1.6, true);
      },
    },
    towerSquare: {
      cat: 'building', label: tr('Eckiger Turm'), h: 44,
      make: () => svg(104, 104, `<rect x="4" y="4" width="96" height="96" rx="2" fill="${stone[1]}" ${O}/><rect x="17" y="17" width="70" height="70" fill="${stone[2]}" stroke="${stone[4]}" stroke-width="1.2"/><path d="M17 17 h70 v6 h-64 v64 h-6Z" fill="#000" opacity=".16"/>${line('M17 52 H87 M52 17 V52 M40 52 V87', 1, stone[4], 0.5)}<rect x="60" y="60" width="16" height="16" fill="#4a4338" ${T}/>${merlons(4, 4, 96, 96)}`, 2),
    },
    towerBig: {
      cat: 'building', label: tr('Großer Rundturm'), h: 60,
      make: () => {
        let m = '';
        let joints = '';
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * 6.283;
          m += `<rect x="${f1(80 + Math.cos(a) * 68 - 5)}" y="${f1(80 + Math.sin(a) * 68 - 6)}" width="10" height="12" rx="1.5" fill="${stone[0]}" ${T} transform="rotate(${f1((a * 180) / Math.PI + 90)} ${f1(80 + Math.cos(a) * 68)} ${f1(80 + Math.sin(a) * 68)})"/>`;
        }
        for (let i = 0; i < 7; i++) joints += `M80 80 L${f1(80 + Math.cos(i * 0.898 + 0.3) * 56)} ${f1(80 + Math.sin(i * 0.898 + 0.3) * 56)}`;
        return svg(160, 160, `<circle cx="80" cy="80" r="76" fill="${stone[1]}" ${O}/><circle cx="80" cy="80" r="58" fill="${stone[2]}" stroke="${stone[4]}" stroke-width="1.2"/><path d="M80 22 A58 58 0 0 0 22 80 A58 58 0 0 1 80 28Z" fill="#000" opacity=".16"/>${line(joints, 1, stone[4], 0.45)}<rect x="88" y="90" width="16" height="16" fill="#4a4338" ${T}/>${m}`, 2);
      },
    },
    bastion: {
      cat: 'building', label: tr('Bastion'), h: 36,
      make: () => {
        const d = 'M8 132 V70 A77 62 0 0 1 162 70 V132Z';
        let m = '';
        for (let i = 0; i <= 12; i++) {
          const a = Math.PI + (i / 12) * Math.PI;
          m += `<rect x="${f1(85 + Math.cos(a) * 70 - 5)}" y="${f1(70 + Math.sin(a) * 55 - 6)}" width="10" height="12" rx="1.5" fill="${stone[0]}" ${T} transform="rotate(${f1((a * 180) / Math.PI + 90)} ${f1(85 + Math.cos(a) * 70)} ${f1(70 + Math.sin(a) * 55)})"/>`;
        }
        const gun = (x, rot) => `<g transform="rotate(${rot} ${x} 62)"><rect x="${x - 8}" y="58" width="16" height="26" rx="2" fill="${WD.mid}" ${T}/><path d="M${x - 4} 34 h8 l2 40 h-12Z" fill="#4a4944" ${T}/></g>`;
        return svg(170, 140, `<path d="${d}" fill="${stone[1]}" ${O}/><path d="M22 124 V72 A63 50 0 0 1 148 72 V124Z" fill="${stone[2]}" stroke="${stone[4]}" stroke-width="1.2"/>${line('M22 100 H148 M62 28 V100 M108 28 V100', 1, stone[4], 0.45)}${gun(56, -18)}${gun(114, 18)}${m}`, 2);
      },
    },
    drawbridge: {
      cat: 'building', label: tr('Zugbrücke'), h: 0, layer: 'rug',
      make: () => {
        let planks = '';
        for (let y = 10; y < 176; y += 9) planks += `M8 ${y} H82`;
        return svg(90, 186, `<rect x="10" y="8" width="76" height="174" fill="#000" opacity=".22"/><rect x="5" y="4" width="80" height="176" rx="2" fill="${WD.mid}" ${O}/>${line(planks, 1, WD.line, 0.8)}<rect x="5" y="4" width="8" height="176" fill="${WD.dark}" ${T}/><rect x="77" y="4" width="8" height="176" fill="${WD.dark}" ${T}/><path d="M20 6 V122 M70 6 V122" fill="none" stroke="#2a2622" stroke-width="3.4" stroke-dasharray="5 3"/><path d="M20 6 V122 M70 6 V122" fill="none" stroke="#9a998f" stroke-width="1.6" stroke-dasharray="5 3"/><circle cx="20" cy="124" r="3.4" fill="#6c6b64" ${T}/><circle cx="70" cy="124" r="3.4" fill="#6c6b64" ${T}/>`, 1.6);
      },
    },
  };
}
