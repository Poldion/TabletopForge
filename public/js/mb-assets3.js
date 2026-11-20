// Kartenbauer: Gegenstände, die als Zeichnung statt als Piktogramm angelegt sind – unregelmäßig, überlappend, ohne
// Raster und Symmetrie: Skelett und Schädel mit richtigen Knochen, Schatz, Kristalle, Risse, Fallen, Käfig, Zelt,
// Pflanzen am Wasser, kahle Bäume, Heu und Felder.
import { tr } from './i18n.js';

/** h: Zeichenbausteine aus mb-assets.js. */
export function drawnAssets(h) {
  const { svg, svgF, O, T, WD, smoothPath, f1, INK, mulberry } = h;
  const bone = '#cfc8a8';
  const boneShade = '#a8a184';
  const hole = '#3a3226';
  const blob = (seed, cx, cy, rx, ry, n = 9, jit = 0.22) => {
    const r = mulberry(seed);
    return smoothPath(Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 6.283;
      const k = 1 - jit / 2 + r() * jit;
      return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
    }));
  };
  /**
   * Schädel von oben, Gesicht nach oben: Hirnschale, die sich an den Jochbögen verjüngt, Kiefer mit Kinn (jaw = false:
   * ohne Unterkiefer), schräg stehende Augenhöhlen, birnenförmige Nasenöffnung, Zahnreihe und eine Schädelnaht.
   */
  const skull = (x, y, r, rot, jaw = true, sw = 2.2) => {
    const P = (px, py) => `${f1(x + px * r)} ${f1(y + py * r)}`;
    const chin = jaw ? `L${P(0.44, 1.0)} Q${P(0, 1.2)} ${P(-0.44, 1.0)} L${P(-0.58, 0.62)}` : `Q${P(0, 0.84)} ${P(-0.58, 0.62)}`;
    const head = `M${P(-0.82, -0.1)} C${P(-0.92, -1.0)} ${P(0.92, -1.0)} ${P(0.82, -0.1)} C${P(0.86, 0.26)} ${P(0.64, 0.4)} ${P(0.58, 0.62)} ${chin} C${P(-0.64, 0.4)} ${P(-0.86, 0.26)} ${P(-0.82, -0.1)}Z`;
    const eye = (sx) => `<ellipse cx="${f1(x + sx * 0.37 * r)}" cy="${f1(y + 0.13 * r)}" rx="${f1(0.27 * r)}" ry="${f1(0.22 * r)}" transform="rotate(${sx * 14} ${f1(x + sx * 0.37 * r)} ${f1(y + 0.13 * r)})" fill="${hole}"/>`;
    const ty = jaw ? 0.82 : 0.7;
    let teeth = `M${P(-0.33, ty)} L${P(0.33, ty)}`;
    for (let k = -2; k <= 2; k++) teeth += `M${P(k * 0.13, ty - 0.08)} L${P(k * 0.13, ty + 0.08)}`;
    return `<g transform="rotate(${f1(rot)} ${f1(x)} ${f1(y)})"><path d="${head}" fill="${bone}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/><path d="M${P(0.58, 0.62)} ${chin} Q${P(0, 0.48)} ${P(0.58, 0.62)}Z" fill="${boneShade}" opacity=".75"/><path d="M${P(0.5, -0.72)} C${P(0.95, -0.3)} ${P(0.86, 0.2)} ${P(0.62, 0.5)} C${P(0.74, 0.1)} ${P(0.72, -0.3)} ${P(0.5, -0.72)}Z" fill="${boneShade}" opacity=".6"/>${eye(-1)}${eye(1)}<path d="M${P(0, 0.34)} L${P(-0.13, 0.62)} Q${P(0, 0.55)} ${P(0.13, 0.62)}Z" fill="${hole}"/><path d="${teeth}" stroke="${hole}" stroke-width=".8" fill="none"/><path d="M${P(0.02, -0.88)} q${f1(0.1 * r)} ${f1(0.18 * r)} ${f1(-0.05 * r)} ${f1(0.4 * r)}" fill="none" stroke="${boneShade}" stroke-width=".8"/></g>`;
  };
  /** Einzelner Röhrenknochen: Schaft mit verdickten Gelenkenden; o = Stärke der dunklen Kontur. */
  const boneAt = (x1, y1, x2, y2, w = 2.6, o = 2) => {
    const L = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = ((y1 - y2) / L) * w * 0.55;
    const ny = ((x2 - x1) / L) * w * 0.55;
    const ends = [[x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny]];
    const knobs = (rad, fill) => ends.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad)}" fill="${fill}"/>`).join('');
    const shaft = (sw, col) => `<path d="M${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)}" stroke="${col}" stroke-width="${f1(sw)}" stroke-linecap="round"/>`;
    return `${shaft(w + 2 * o, INK)}${knobs(w * 0.62 + o, INK)}${knobs(w * 0.62, bone)}${shaft(w, bone)}`;
  };
  /** Rippe: Bogen von der Wirbelsäule nach außen und vorn zurück. */
  const rib = (cx, y, sgn, w, front, o = 2) => {
    const d = `M${cx} ${f1(y)} C${f1(cx + sgn * w * 0.5)} ${f1(y - 3)} ${f1(cx + sgn * w)} ${f1(y - 1)} ${f1(cx + sgn * w)} ${f1(y + 3)} C${f1(cx + sgn * w)} ${f1(y + 6)} ${f1(cx + sgn * w * 0.55)} ${f1(y + 6.6)} ${f1(cx + sgn * front)} ${f1(y + 5.6)}`;
    return [`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f1(1.9 + 2 * o)}" stroke-linecap="round"/>`, `<path d="${d}" fill="none" stroke="${bone}" stroke-width="1.9" stroke-linecap="round"/>`];
  };

  return {
    bones: {
      cat: 'dungeon', label: tr('Skelett'), h: 0, layer: 'rug',
      make: (v) => {
        const r = mulberry(v + 4);
        const j = (a) => (r() - 0.5) * a;
        const cx = 35;
        const O2 = 2.7; // Kontur vor dem Verkleinern – ergibt rund 2 px wie bei den übrigen Gegenständen
        // Ein Toter, der schon lange liegt: ein Arm abgespreizt, ein Knie angewinkelt, der Schädel zur Seite gekippt
        const side = v % 2 ? -1 : 1;
        const X = (x) => cx + (x - cx) * side;
        const elbowL = [X(13 + j(5)), 62 + j(6)];
        const wristL = [X(12 + j(8)), 86 + j(6)];
        const elbowR = [X(68 + j(5)), 53 + j(5)];
        const wristR = [X(80 + j(6)), 71 + j(8)];
        const kneeL = [X(13 + j(5)), 123 + j(5)];
        const ankleL = [X(27 + j(6)), 147 + j(5)];
        const kneeR = [X(46 + j(6)), 128 + j(6)];
        const ankleR = [X(50 + j(8)), 157 + j(5)];
        const pair = (a, b, w) => {
          // Elle und Speiche bzw. Schien- und Wadenbein: zwei Knochen nebeneinander
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const ox = ((a[1] - b[1]) / L) * 2.6;
          const oy = ((b[0] - a[0]) / L) * 2.6;
          return boneAt(a[0], a[1], b[0], b[1], w, O2) + boneAt(a[0] + ox, a[1] + oy, b[0] + ox * 0.6, b[1] + oy * 0.6, w * 0.7, O2);
        };
        const hand = (w, e) => {
          const a = Math.atan2(w[1] - e[1], w[0] - e[0]);
          let dark = '';
          let light = '';
          for (let k = 0; k < 4; k++) {
            const t = a + (k - 1.5) * 0.32 + j(0.25);
            const len = 7 + r() * 3;
            const d = `M${f1(w[0])} ${f1(w[1])} l${f1(Math.cos(t) * len)} ${f1(Math.sin(t) * len)}`;
            dark += `<path d="${d}" stroke="${INK}" stroke-width="${f1(1.6 + 2 * O2)}" stroke-linecap="round"/>`;
            light += `<path d="${d}" stroke="${bone}" stroke-width="1.6" stroke-linecap="round"/>`;
          }
          return dark + light;
        };
        const foot = (a, k) => {
          const ang = Math.atan2(a[1] - k[1], a[0] - k[0]) * 57.3 - 90 + j(30);
          return `<g transform="rotate(${f1(ang)} ${f1(a[0])} ${f1(a[1])})"><path d="M${f1(a[0] - 3.5)} ${f1(a[1] - 1)} l-1 10 l9 2 l1 -11Z" fill="${bone}" stroke="${INK}" stroke-width="${O2}" stroke-linejoin="round"/><path d="M${f1(a[0] - 1.6)} ${f1(a[1] + 6)} v4 M${f1(a[0] + 1.4)} ${f1(a[1] + 7)} v4 M${f1(a[0] + 4.2)} ${f1(a[1] + 7)} v4" stroke="${boneShade}" stroke-width="1"/></g>`;
        };
        const hipL = [X(29), 99];
        const hipR = [X(41), 99];
        let s = boneAt(hipL[0], hipL[1], kneeL[0], kneeL[1], 3.6, O2) + boneAt(hipR[0], hipR[1], kneeR[0], kneeR[1], 3.6, O2) + pair(kneeL, ankleL, 2.8) + pair(kneeR, ankleR, 2.8) + foot(ankleL, kneeL) + foot(ankleR, kneeR);
        for (const k of [kneeL, kneeR]) s += `<circle cx="${f1(k[0])}" cy="${f1(k[1])}" r="2.8" fill="${bone}" stroke="${INK}" stroke-width="${O2 - 0.6}"/>`;
        // Becken: eine Schmetterlingsform mit den beiden kleinen Öffnungen unten, dazwischen das Kreuzbein
        s += `<path d="M35 88 L31 83 C27 80 23 82 23 88 C23 92 26 95 26 98 C27 102 32 102 33.5 99 L35 96 L36.5 99 C38 102 43 102 44 98 C44 95 47 92 47 88 C47 82 43 80 39 83Z" fill="${bone}" stroke="${INK}" stroke-width="${O2}" stroke-linejoin="round"/><path d="M25 87 Q28 84 32 86 M45 87 Q42 84 38 86" fill="none" stroke="${boneShade}" stroke-width="1.1"/><ellipse cx="29.6" cy="96.8" rx="1.9" ry="1.5" transform="rotate(-28 29.6 96.8)" fill="${hole}"/><ellipse cx="40.4" cy="96.8" rx="1.9" ry="1.5" transform="rotate(28 40.4 96.8)" fill="${hole}"/><path d="M35 86 L32.6 93 H37.4Z" fill="${boneShade}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`;
        // Wirbelsäule: erst die dunkle Kontur als Ganzes, dann die Wirbel
        let spineDark = '';
        let spine = '';
        for (let y = 33; y < 85; y += 4.3) {
          const x = cx - 2.6 + j(1.4);
          spineDark += `<rect x="${f1(x - O2 + 0.4)}" y="${f1(y - O2 + 0.4)}" width="${f1(5.2 + 2 * O2 - 0.8)}" height="${f1(3.4 + 2 * O2 - 0.8)}" rx="2" fill="${INK}"/>`;
          spine += `<rect x="${f1(x)}" y="${f1(y)}" width="5.2" height="3.4" rx="1.2" fill="${bone}"/>`;
        }
        s += spineDark + spine;
        // Rippen: zwei, drei sind verrutscht oder fehlen
        let ribDark = '';
        let ribs = '';
        [9, 11.5, 13.5, 14.5, 15, 15, 14.5, 13.5, 11.5, 9].forEach((w, i) => {
          for (const sgn of [-1, 1]) {
            const q = r();
            if (q < 0.07) continue;
            const [a, b] = rib(cx, 38 + i * 3.9 + (q < 0.22 ? j(6) : 0), sgn, w * (q < 0.22 ? 0.8 + r() * 0.3 : 1), i < 7 ? 2 : w * 0.42, O2 - 0.9);
            ribDark += a;
            ribs += b;
          }
        });
        s += `${ribDark}${ribs}<path d="M35 38 L32.4 60 L35 66 L37.6 60Z" fill="${bone}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
        const shL = [X(19), 36];
        const shR = [X(51), 36];
        s += boneAt(cx, 35.5, shL[0], 34, 2, O2) + boneAt(cx, 35.5, shR[0], 34, 2, O2);
        s += boneAt(shL[0], shL[1], elbowL[0], elbowL[1], 3, O2) + pair(elbowL, wristL, 2.3) + hand(wristL, elbowL);
        s += boneAt(shR[0], shR[1], elbowR[0], elbowR[1], 3, O2) + pair(elbowR, wristR, 2.3) + hand(wristR, elbowR);
        s += skull(cx + j(4) - side * 2, 17, 11.5, -side * (12 + r() * 16), true, O2 + 0.3);
        return svgF(78, 120, `<g transform="scale(.68) translate(22.5 3) rotate(${f1(j(8))} 35 86)">${s}</g>`, 0.8);
      },
    },
    skulls: {
      cat: 'dungeon', label: tr('Schädelhaufen'), h: 5,
      make: (v) => {
        const r = mulberry(v + 1);
        const j = (a) => (r() - 0.5) * a;
        let s = `<path d="${blob(v, 50, 46, 42, 32, 9, 0.3)}" fill="#000" opacity=".22"/>`;
        s += boneAt(12, 62, 46, 72, 2.8) + boneAt(56, 70, 90, 54, 2.8) + boneAt(20, 22, 40, 12, 2.2);
        for (const [y, sg] of [[58, 1], [62, 1], [66, 1]]) s += rib(70, y - 40, sg, 12, 3, 1.6).join('');
        // lose Unterkiefer und Schädel in verschiedenen Lagen, die vorderen verdecken die hinteren
        s += `<path d="M22 50 q8 9 17 0 q-2 -4 -4 -1 q-4 4 -9 0 q-2 -3 -4 1Z" fill="${boneShade}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
        [[32, 30, 9.5, false], [60, 28, 10, true], [78, 40, 8.5, false], [44, 50, 11, true], [66, 56, 9.5, true]].forEach(([x, y, rr, jw]) => {
          s += skull(x + j(4), y + j(4), rr, j(170), jw);
        });
        return svg(100, 86, s, 1.2);
      },
    },
    lever: {
      cat: 'dungeon', label: tr('Hebel'), h: 8,
      make: () => svg(56, 46, `<rect x="5" y="12" width="40" height="22" rx="2" fill="#5a5750" ${O}/><rect x="13" y="20" width="24" height="6" rx="3" fill="#1c1a16"/>${[[9, 16], [41, 16], [9, 30], [41, 30]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#8a887c"/>`).join('')}<path d="M27 23 L44 9" stroke="${INK}" stroke-width="6.4" stroke-linecap="round"/><path d="M27 23 L44 9" stroke="#77756c" stroke-width="3.6" stroke-linecap="round"/><path d="M40 12 L49 5" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M40 12 L49 5" stroke="${WD.dark}" stroke-width="6" stroke-linecap="round"/>`, 1.4),
    },
    treasure: {
      cat: 'dungeon', label: tr('Schatz'), h: 5,
      make: (v) => {
        const r = mulberry(v + 2);
        const coin = (x, y, s = 1) => `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(4.8 * s)}" ry="${f1(3.6 * s)}" transform="rotate(${Math.round(r() * 180)} ${f1(x)} ${f1(y)})" fill="${r() < 0.5 ? '#a58f4e' : '#c2aa62'}" stroke="#5e4f28" stroke-width=".9"/>`;
        const gem = (x, y, c1, c2) => `<path d="M${x} ${y - 5} L${x + 5} ${y} L${x} ${y + 5} L${x - 5} ${y}Z" fill="${c1}" ${T}/><path d="M${x} ${y - 5} L${x + 5} ${y} L${x} ${y}Z" fill="${c2}"/>`;
        let s = `<path d="${blob(v, 55, 46, 40, 30, 10, 0.3)}" fill="#8a7640" ${O}/>`;
        for (let i = 0; i < 46; i++) {
          const a = r() * 6.283;
          const k = Math.sqrt(r());
          s += coin(55 + Math.cos(a) * 36 * k, 46 + Math.sin(a) * 26 * k);
        }
        // einzelne Münzen sind über den Rand hinaus gerollt
        for (let i = 0; i < 7; i++) {
          const a = r() * 6.283;
          s += coin(55 + Math.cos(a) * (44 + r() * 8), 46 + Math.sin(a) * (34 + r() * 8), 0.9);
        }
        return svg(110, 92, `${s}<circle cx="70" cy="38" r="9" fill="#8a7640" ${T}/><circle cx="70" cy="38" r="5.4" fill="#5e4f28"/><circle cx="68.5" cy="36.5" r="2" fill="#c2aa62"/>${gem(40, 40, '#8a4e55', '#b98088')}${gem(58, 60, '#4e6a7a', '#86a0ad')}${gem(34, 56, '#5a7a58', '#8fae8a')}`, 1.8);
      },
    },
    crystal: {
      cat: 'dungeon', label: tr('Kristalle'), h: 10, light: { bright: 5, dim: 10, color: '#b8d0e8' },
      make: (v) => {
        const [hi, mid, lo] = [['#d7c8dc', '#a98fb5', '#7f6a93'], ['#c8dce2', '#8fb0bd', '#63889a'], ['#cfe0c8', '#96b592', '#6a8f6c'], ['#e2cfcf', '#bd9494', '#986a6a']][v % 4];
        const r = mulberry(v + 6);
        let s = `<path d="${blob(v, 50, 52, 20, 16, 8, 0.3)}" fill="#6e6a5c" ${T}/>`;
        const n = 5 + Math.floor(r() * 3);
        const order = Array.from({ length: n }, (_, i) => ({ a: (i / n) * 6.283 + r() * 0.7, len: 16 + r() * 26, w: 5 + r() * 4 })).sort((p, q) => p.len - q.len);
        let outline = '';
        let faces = '';
        for (const { a, len, w } of order) {
          // sechseckiges Prisma in Schrägsicht: drei Längsflächen in drei Tönen, zugespitzt
          const ux = Math.cos(a);
          const uy = Math.sin(a);
          const nx = -uy * w;
          const ny = ux * w;
          const bx = 50 + ux * 6;
          const by = 52 + uy * 6;
          const ex = bx + ux * len;
          const ey = by + uy * len;
          const tx = ex + ux * w * 1.1;
          const ty = ey + uy * w * 1.1;
          const P = (x, y) => `${f1(x)} ${f1(y)}`;
          const hull = `M${P(bx - nx, by - ny)} L${P(ex - nx, ey - ny)} L${P(tx, ty)} L${P(ex + nx, ey + ny)} L${P(bx + nx, by + ny)}Z`;
          outline += `<path d="${hull}" fill="${INK}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
          faces += `<path d="${hull}" fill="${mid}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/><path d="M${P(bx - nx, by - ny)} L${P(ex - nx, ey - ny)} L${P(tx, ty)} L${P(ex - nx * 0.3, ey - ny * 0.3)} L${P(bx - nx * 0.3, by - ny * 0.3)}Z" fill="${hi}"/><path d="M${P(bx + nx, by + ny)} L${P(ex + nx, ey + ny)} L${P(tx, ty)} L${P(ex + nx * 0.35, ey + ny * 0.35)} L${P(bx + nx * 0.35, by + ny * 0.35)}Z" fill="${lo}"/>`;
        }
        s += outline + faces;
        return svg(100, 104, s, 1.2);
      },
    },
    crack: {
      cat: 'dungeon', label: tr('Riss im Boden'), h: 0, layer: 'rug',
      make: (v) => {
        const r = mulberry(v + 8);
        // Hauptast läuft dünn aus, zwei bis drei Nebenäste zweigen ab – nie im gleichmäßigen Zickzack
        const branch = (x, y, a, len, w) => {
          let s = '';
          const pts = [[x, y]];
          for (let d = 0; d < len; ) {
            const step = 8 + r() * 14;
            a += (r() - 0.5) * 0.9;
            x += Math.cos(a) * step;
            y += Math.sin(a) * step;
            d += step;
            pts.push([x, y]);
          }
          pts.forEach((p, i) => {
            if (!i) return;
            const k = 1 - i / pts.length;
            s += `<path d="M${f1(pts[i - 1][0])} ${f1(pts[i - 1][1])} L${f1(p[0])} ${f1(p[1])}" stroke="#1c1a16" stroke-width="${f1(0.6 + w * k)}" stroke-linecap="round"/><path d="M${f1(pts[i - 1][0] + 1)} ${f1(pts[i - 1][1] + 1.2)} L${f1(p[0] + 1)} ${f1(p[1] + 1.2)}" stroke="#fff" stroke-width=".7" opacity=".16" stroke-linecap="round"/>`;
          });
          return [s, pts];
        };
        const [main, pts] = branch(10, 44 + (r() - 0.5) * 20, 0, 150, 3.4);
        let s = main;
        for (let i = 0, n = 2 + Math.floor(r() * 2); i < n; i++) {
          const p = pts[1 + Math.floor(r() * (pts.length - 3))];
          s += branch(p[0], p[1], (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.7), 26 + r() * 34, 1.8)[0];
        }
        return svgF(180, 90, s, 1.2);
      },
    },
    haystack: {
      cat: 'building', label: tr('Heuhaufen'), h: 16,
      make: (v) => {
        const r = mulberry(v + 3);
        let d = '';
        for (let i = 0; i < 46; i++) {
          const a = r() * 6.283;
          const k = 0.15 + r() * 0.7;
          const len = 6 + r() * 10;
          d += `M${f1(38 + Math.cos(a) * 28 * k)} ${f1(38 + Math.sin(a) * 28 * k)} l${f1(Math.cos(a + (r() - 0.5) * 0.6) * len)} ${f1(Math.sin(a + (r() - 0.5) * 0.6) * len)}`;
        }
        return svg(76, 76, `<path d="${blob(v, 38, 38, 33, 32, 11, 0.16)}" fill="#857955" ${O}/><path d="${blob(v + 1, 35, 34, 23, 22, 9, 0.2)}" fill="#a8996c"/><path d="${d}" stroke="#5e5434" stroke-width="1" stroke-linecap="round" opacity=".7"/>`, 2.2);
      },
    },
    field: {
      cat: 'building', label: tr('Feld'), h: 0, layer: 'rug',
      make: (v) => {
        const [a, b] = [['#b3a373', '#8f8258'], ['#8e9558', '#6f7644'], ['#a3a467', '#7f8150'], ['#7d6a4d', '#5f503a']][v % 4];
        const r = mulberry(v + 12);
        const shape = blob(v + 1, 150, 105, 142, 96, 13, 0.22);
        let rows = '';
        for (let i = 0; i < 19; i++) {
          const y = 8 + i * 10.6;
          rows += `<path d="M-4 ${f1(y)} Q${f1(80 + r() * 40)} ${f1(y + 3 + r() * 4)} 150 ${f1(y + 2)} T304 ${f1(y - 1 + r() * 3)}" fill="none" stroke="${b}" stroke-width="${f1(2 + r() * 1.6)}" opacity=".8"/>`;
        }
        return svg(300, 210, `<path d="${shape}" fill="#6b5a40" stroke="#4a3d2a" stroke-width="3" stroke-linejoin="round"/><clipPath id="f"><path d="${shape}"/></clipPath><g clip-path="url(#f)"><path d="${shape}" fill="${a}"/>${rows}</g><path d="${shape}" fill="none" stroke="${INK}" stroke-width="1.2" opacity=".6"/>`, 3.4);
      },
    },
    flowers: {
      cat: 'nature', label: tr('Blumen'), h: 0, layer: 'rug',
      make: (v) => {
        const r = mulberry(v);
        const cols = [['#e8e4cf', '#d9c26a', '#d9a9b8'], ['#b9a6c9', '#e8e4cf', '#a9c9d2'], ['#d99a84', '#d9c26a', '#e8e4cf']][v % 3];
        let s = '';
        for (let i = 0; i < 9; i++) {
          const x = 16 + r() * 88;
          const y = 16 + r() * 68;
          s += `<path d="M${f1(x)} ${f1(y)} l-3 -7 M${f1(x)} ${f1(y)} l1 -9 M${f1(x)} ${f1(y)} l4 -6" stroke="#3f6a36" stroke-width="1" stroke-linecap="round" opacity=".7"/>`;
        }
        for (let i = 0; i < 30; i++) s += `<circle cx="${f1(12 + r() * 96)}" cy="${f1(10 + r() * 80)}" r="${f1(1.5 + r() * 1.3)}" fill="${cols[i % 3]}"/>`;
        return svgF(120, 100, s, 0);
      },
    },
    reeds: {
      cat: 'nature', label: tr('Schilf'), h: 5,
      make: (v) => {
        const r = mulberry(v);
        let s = '';
        for (const [cx, cy] of [[30, 54], [56, 36], [62, 66]]) {
          const n = 8 + Math.floor(r() * 5);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * 6.283 + r() * 0.6;
            const len = 14 + r() * 14;
            const w = 2.2;
            const P = (x, y) => `${f1(x)} ${f1(y)}`;
            s += `<path d="M${P(cx - Math.sin(a) * w, cy + Math.cos(a) * w)} L${P(cx + Math.cos(a) * len, cy + Math.sin(a) * len)} L${P(cx + Math.sin(a) * w, cy - Math.cos(a) * w)}Z" fill="${['#667a3e', '#81934b', '#4f6332'][i % 3]}" stroke="#2e3a1c" stroke-width=".8" stroke-linejoin="round"/>`;
          }
          s += `<circle cx="${cx}" cy="${cy}" r="2.4" fill="#2e3a1c"/>`;
        }
        return svgF(90, 96, s, 0);
      },
    },
    lilypads: {
      cat: 'nature', label: tr('Seerosen'), h: 0, layer: 'rug',
      make: (v) => {
        const r = mulberry(v + 5);
        let s = '';
        const pads = [[30, 34, 17], [62, 28, 14], [50, 62, 19], [86, 58, 13], [24, 70, 11], [78, 84, 15], [104, 32, 10]];
        pads.forEach(([x, y, rr], i) => {
          const a0 = r() * 6.283;
          const a1 = a0 + 5.5 + r() * 0.4;
          const P = (a, k = 1) => `${f1(x + Math.cos(a) * rr * k)} ${f1(y + Math.sin(a) * rr * k)}`;
          // rundes Blatt mit Kerbe bis zur Mitte
          s += `<path d="M${f1(x)} ${f1(y)} L${P(a0)} A${rr} ${rr} 0 1 1 ${P(a1)}Z" fill="${i % 2 ? '#4a7040' : '#5a8a4c'}" stroke="#1f3a1c" stroke-width="1.3" stroke-linejoin="round"/><path d="M${f1(x)} ${f1(y)} L${P(a0 + 2)} M${f1(x)} ${f1(y)} L${P(a0 + 3.3)} M${f1(x)} ${f1(y)} L${P(a0 + 4.5)}" stroke="#1f3a1c" stroke-width=".7" opacity=".5"/>`;
        });
        for (const [x, y] of [[44, 54], [80, 80]]) {
          for (let k = 0; k < 6; k++) s += `<ellipse cx="${x}" cy="${y - 5}" rx="2.4" ry="5" fill="#e6d3dc" stroke="${INK}" stroke-width=".7" transform="rotate(${k * 60} ${x} ${y})"/>`;
          s += `<circle cx="${x}" cy="${y}" r="2.2" fill="#d9c26a"/>`;
        }
        return svg(124, 108, s, 1.4);
      },
    },
    deadTree: {
      cat: 'nature', label: tr('Kahler Baum'), h: 22,
      make: (v) => {
        const r = mulberry(v + 9);
        let dark = '';
        let wood = '';
        // Ast: verjüngt sich in Stücken, gabelt sich in ungleichen Winkeln
        const limb = (x, y, a, len, w, depth) => {
          for (let i = 0; i < 3; i++) {
            const step = (len / 3) * (0.8 + r() * 0.4);
            a += (r() - 0.5) * 0.7;
            const nx = x + Math.cos(a) * step;
            const ny = y + Math.sin(a) * step;
            const ww = Math.max(1, w * (1 - i * 0.28));
            dark += `<path d="M${f1(x)} ${f1(y)} L${f1(nx)} ${f1(ny)}" stroke-width="${f1(ww + 2.2)}"/>`;
            wood += `<path d="M${f1(x)} ${f1(y)} L${f1(nx)} ${f1(ny)}" stroke-width="${f1(ww)}"/>`;
            x = nx;
            y = ny;
            if (depth && i > 0 && r() < 0.75) limb(x, y, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.7), len * (0.35 + r() * 0.25), ww * 0.65, depth - 1);
          }
        };
        const n = 4 + Math.floor(r() * 2);
        for (let i = 0; i < n; i++) limb(100, 100, (i / n) * 6.283 + r() * 1.1, 42 + r() * 44, 5.5, 2);
        return svgF(200, 200, `<g fill="none" stroke="${INK}" stroke-linecap="round">${dark}</g><g fill="none" stroke="#6b5a42" stroke-linecap="round">${wood}</g><path d="${blob(v, 100, 100, 13, 11, 8, 0.4)}" fill="#6b5a42" ${O}/><path d="M94 96 q5 4 3 10 M103 93 q-2 6 2 12" fill="none" stroke="#3a2e1e" stroke-width="1"/>`, 0);
      },
    },
    web: {
      cat: 'dungeon', label: tr('Spinnennetz'), h: 0, layer: 'rug',
      make: (v) => {
        const r = mulberry(v + 3);
        // Speichen aus der Ecke, dazwischen durchhängende Fäden – einige fehlen, einer ist gerissen
        const spokes = [];
        for (let i = 0; i < 6; i++) spokes.push([(i / 5) * 1.5708 + (i && i < 5 ? (r() - 0.5) * 0.21 : 0), 90 + r() * 42]);
        let d = '';
        for (const [a, len] of spokes) d += `M4 4 L${f1(4 + Math.cos(a) * len)} ${f1(4 + Math.sin(a) * len)}`;
        for (let ring = 1; ring <= 6; ring++) {
          for (let i = 0; i < spokes.length - 1; i++) {
            if (r() < 0.2) continue;
            const k0 = (ring / 6.4) * (0.88 + r() * 0.2);
            const k1 = (ring / 6.4) * (0.88 + r() * 0.2);
            const [a0, l0] = spokes[i];
            const [a1, l1] = spokes[i + 1];
            const p0 = [4 + Math.cos(a0) * l0 * k0, 4 + Math.sin(a0) * l0 * k0];
            const p1 = [4 + Math.cos(a1) * l1 * k1, 4 + Math.sin(a1) * l1 * k1];
            const am = (a0 + a1) / 2;
            const sag = 0.8 - r() * 0.1;
            d += `M${f1(p0[0])} ${f1(p0[1])} Q${f1(4 + Math.cos(am) * ((l0 * k0 + l1 * k1) / 2) * sag)} ${f1(4 + Math.sin(am) * ((l0 * k0 + l1 * k1) / 2) * sag)} ${f1(p1[0])} ${f1(p1[1])}`;
          }
        }
        return svgF(140, 140, `<path d="${d}" fill="none" stroke="#e6e2d0" stroke-width="1.5" stroke-linecap="round" opacity=".55"/><path d="M${f1(40 + r() * 20)} ${f1(40 + r() * 20)} q6 14 2 30 M${f1(70 + r() * 20)} ${f1(24 + r() * 16)} q-3 12 4 22 M${f1(20 + r() * 14)} ${f1(74 + r() * 20)} q10 4 16 -3" fill="none" stroke="#e6e2d0" stroke-width="1.2" stroke-linecap="round" opacity=".5"/><ellipse cx="${f1(30 + r() * 30)}" cy="${f1(30 + r() * 30)}" rx="2.6" ry="2" fill="#2a2420"/>`, 1.2);
      },
    },
    cage: {
      cat: 'dungeon', label: tr('Käfig'), h: 16,
      make: () => {
        let bars = '';
        for (let x = 17; x <= 77; x += 12) bars += `<path d="M${x} 9 V85" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M${x} 9 V85" stroke="#6c6b64" stroke-width="2.8" stroke-linecap="round"/><path d="M${x - 0.8} 11 V83" stroke="#a09f94" stroke-width=".9" opacity=".7"/>`;
        return svg(94, 94, `<rect x="6" y="6" width="82" height="82" rx="3" fill="#1c1a16" fill-opacity=".5"/><path d="M12 30 H82 M12 64 H82" stroke="#000" stroke-width="5" opacity=".25"/>${bars}<path d="M9 30 H85 M9 64 H85" stroke="${INK}" stroke-width="5.4"/><path d="M9 30 H85 M9 64 H85" stroke="#5a5952" stroke-width="3.2"/><rect x="6" y="6" width="82" height="82" rx="3" fill="none" stroke="${INK}" stroke-width="7.4"/><rect x="6" y="6" width="82" height="82" rx="3" fill="none" stroke="#5a5952" stroke-width="5"/><rect x="6" y="6" width="82" height="82" rx="3" fill="none" stroke="#8a897e" stroke-width="1" opacity=".6"/>${[[6, 6], [88, 6], [6, 88], [88, 88]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#8a897e" ${T}/>`).join('')}<rect x="82" y="40" width="10" height="14" rx="2" fill="#77745f" ${T}/><circle cx="87" cy="47" r="1.8" fill="${INK}"/>`, 1.4);
      },
    },
    spikes: {
      cat: 'dungeon', label: tr('Stachelfalle'), h: 0, layer: 'rug',
      make: (v) => {
        const r = mulberry(v + 7);
        let s = `<rect x="4" y="4" width="92" height="92" rx="3" fill="#55534c" ${O}/><rect x="9" y="9" width="82" height="82" rx="2" fill="#4a4842" stroke="#34322d" stroke-width="1"/>`;
        for (let i = 0; i < 9; i++) s += `<path d="M${f1(12 + r() * 76)} ${f1(12 + r() * 76)} l${f1((r() - 0.5) * 26)} ${f1((r() - 0.5) * 26)}" stroke="#8a887c" stroke-width=".8" opacity=".5"/>`;
        // Stacheln stehen ungefähr im Raster, aber nicht in Reih und Glied – und nicht alle sind gleich lang
        for (let i = 0; i < 16; i++) {
          const x = 20 + (i % 4) * 20 + (r() - 0.5) * 6;
          const y = 20 + Math.floor(i / 4) * 20 + (r() - 0.5) * 6;
          const sz = 4 + r() * 2.6;
          const tx = x - sz * 0.5 - r() * 2;
          const ty = y - sz * 0.6 - r() * 2;
          s += `<ellipse cx="${f1(x + 1.5)}" cy="${f1(y + 2)}" rx="${f1(sz * 0.9)}" ry="${f1(sz * 0.7)}" fill="#1c1a16" opacity=".55"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(sz * 0.62)}" fill="#34322d" stroke="${INK}" stroke-width="1"/><path d="M${f1(x - sz * 0.55)} ${f1(y + sz * 0.25)} L${f1(tx)} ${f1(ty)} L${f1(x + sz * 0.4)} ${f1(y - sz * 0.5)}Z" fill="#8a897e" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M${f1(x + sz * 0.4)} ${f1(y - sz * 0.5)} L${f1(tx)} ${f1(ty)} L${f1(x - sz * 0.05)} ${f1(y - sz * 0.1)}Z" fill="#6c6b64"/>`;
        }
        return svg(100, 100, s, 1.6);
      },
    },
    portcullis: {
      // Von oben gesehen: die Führungsschiene quer im Durchgang, darin die runden Köpfe der senkrechten Stäbe
      cat: 'dungeon', label: tr('Fallgitter'), h: 10,
      make: () => {
        let s = '';
        for (let x = 13; x <= 78; x += 9.2) s += `<circle cx="${f1(x)}" cy="12" r="2.9" fill="#2a2622" stroke="${INK}" stroke-width=".8"/><circle cx="${f1(x - 0.9)}" cy="11.1" r=".9" fill="#a09f94"/>`;
        return svg(90, 24, `<rect x="4" y="4" width="82" height="16" rx="2" fill="#5a5952" ${O}/><rect x="8" y="8" width="74" height="8" rx="1.5" fill="#3d3b36" stroke="#2a2824" stroke-width=".8"/><path d="M6 6.4 H84" stroke="#8a897e" stroke-width="1" opacity=".6"/>${s}`, 1.2);
      },
    },
    tent: {
      cat: 'outdoor', label: tr('Zelt'), h: 20,
      make: (v) => {
        const c1 = ['#bcb08a', '#a3a47e', '#b29878'][v % 3];
        const pegs = [[10, 12], [140, 12], [10, 182], [140, 182], [5, 97], [145, 97]];
        const from = [[32, 26], [118, 26], [32, 168], [118, 168], [32, 97], [118, 97]];
        const ropes = pegs.map(([x, y], i) => `<path d="M${from[i][0]} ${from[i][1]} L${x} ${y}" stroke="${INK}" stroke-width="2"/><path d="M${from[i][0]} ${from[i][1]} L${x} ${y}" stroke="#b5aa85" stroke-width=".9"/><circle cx="${x}" cy="${y}" r="2.6" fill="${WD.dark}" ${T}/>`).join('');
        // Firstzelt: zwei Stoffbahnen, die vom First abfallen, mit Falten zu den Abspannpunkten; Eingang als Schlitz
        return svg(150, 194, `${ropes}<path d="M75 16 L120 24 L122 170 L75 178 L28 170 L30 24Z" fill="${c1}" ${O}/><path d="M75 16 L120 24 L122 170 L75 178Z" fill="#000" opacity=".17"/><path d="M75 16 V178" stroke="${INK}" stroke-width="2.4"/><path d="M75 16 V178" stroke="${WD.pale}" stroke-width="1"/><path d="M52 22 Q48 96 50 174 M98 22 Q103 96 100 174 M40 24 Q36 60 38 96 M110 24 Q115 130 112 172" fill="none" stroke="#000" stroke-width="1" opacity=".28"/><path d="M36 26 Q54 60 34 96 Q54 134 36 168" fill="none" stroke="#000" stroke-width="7" opacity=".06"/><path d="M75 178 L67 148 Q75 142 83 148Z" fill="#3a3328" ${T}/><path d="M75 146 L66 149 Q58 164 62 177 L72 178Z" fill="${c1}" ${T}/><path d="M75 146 L84 149 Q92 164 88 177 L78 178Z" fill="${c1}" ${T}/><path d="M75 146 L84 149 Q92 164 88 177 L78 178Z" fill="#000" opacity=".17"/><path d="M68 152 Q63 166 66 175 M82 152 Q87 166 84 175" fill="none" stroke="#000" stroke-width="1" opacity=".3"/>`, 2.4);
      },
    },
  };
}
