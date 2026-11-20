// Kartenbauer: weitere Gegenstände – Gebäude für Übersichtskarten (Häuser mit Dach, Türme, Mauern, Burgteile),
// Dungeon-Einrichtung (Säulen, Sarkophage, Fallen …) und mehr Natur. Gleicher Stil wie der übrige Katalog.
import { tr } from './i18n.js';

/** h: Zeichenbausteine aus mb-assets.js (so braucht diese Datei den Katalog selbst nicht zu laden). */
export function moreAssets(h) {
  const { svg, svgF, O, T, WD, disc, planks, smoothPath, f1, INK, LIGHT, mulberry } = h;

  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  /** Farbe aufhellen (k > 0) oder abdunkeln (k < 0). */
  const tone = (c, k) => `rgb(${hex(c).map((v) => Math.max(0, Math.min(255, Math.round(v * (1 + 0.24 * k)))))})`;
  /**
   * Wie stark eine Fläche im Licht liegt (−1 … 1): (nx, ny) = Richtung, in die sie im Bild des Gegenstands zeigt;
   * rot = Drehung des Gegenstands auf der Karte. So bleibt die helle Dachseite beim Drehen dem Licht zugewandt.
   */
  const lit = (nx, ny, rot) => {
    const a = (rot * Math.PI) / 180;
    return -((nx * Math.cos(a) - ny * Math.sin(a)) * LIGHT[0] + (nx * Math.sin(a) + ny * Math.cos(a)) * LIGHT[1]);
  };
  // Dächer: [Grundton, Linienfarbe]
  const ROOFS = { thatch: ['#978a62', '#544a2e'], tile: ['#8e6050', '#4e2f26'], slate: ['#5f6468', '#30333a'], wood: ['#77694a', '#463a26'] };
  /**
   * Eine Dachfläche (Rechteck). dn: Richtung des Gefälles (+1 = Traufe unten, −1 = Traufe oben; der First liegt
   * gegenüber). Ziegel als Schuppenreihen, die zur Traufe hin überlappen; Schiefer und Schindeln als versetzte
   * Reihen; Stroh als Halme in Fallrichtung mit zwei Bindungen. Einzelne Stücke sind heller oder dunkler, am First
   * liegt eine helle Kappe, an der Traufe ein dunkler Saum.
   */
  const roofFace = (x, y, w, hh, kind, k, seed, dn = 1) => {
    const [base, line] = ROOFS[kind];
    const r = mulberry(seed);
    const ridge = dn > 0 ? y : y + hh;
    const id = `r${seed % 100000}`;
    let s = `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(hh)}" fill="${tone(base, k)}"/>`;
    let d = '';
    let extra = '';
    if (kind === 'thatch') {
      for (let i = 0, n = (w * hh) / 80; i < n; i++) d += `M${f1(x + 2 + r() * (w - 4))} ${f1(y + r() * (hh - 10))} l${f1((r() - 0.5) * 3)} ${f1(6 + r() * 10)}`;
      for (const t of [0.36, 0.72]) extra += `<path d="M${f1(x)} ${f1(ridge + dn * hh * t)} h${f1(w)}" stroke="${line}" stroke-width="1.8" stroke-dasharray="6 3" opacity=".55"/>`;
    } else {
      const step = kind === 'tile' ? 7 : 9;
      const tw = kind === 'tile' ? 9 : 13;
      for (let t = step, row = 0; t < hh - 1; t += step, row++) {
        const yy = ridge + dn * t;
        if (kind === 'tile') {
          d += `M${f1(x - (row % 2 ? tw / 2 : 0))} ${f1(yy)}`;
          for (let xx = 0; xx < w + tw; xx += tw) d += `q${tw / 2} ${f1(dn * 3.2)} ${tw} 0`;
        } else {
          d += `M${f1(x)} ${f1(yy + (r() - 0.5))} h${f1(w)}`;
          for (let xx = x + (row % 2 ? tw / 2 : 0) + r() * 3; xx < x + w - 2; xx += tw * (0.8 + r() * 0.5)) d += `M${f1(xx)} ${f1(yy)} v${f1(-dn * step * (0.6 + r() * 0.4))}`;
        }
      }
    }
    return `<clipPath id="${id}"><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(hh)}"/></clipPath><g clip-path="url(#${id})">${s}<path d="${d}" fill="none" stroke="${line}" stroke-width="1" opacity="${kind === 'thatch' ? '.4' : '.5'}"/>${extra}<rect x="${f1(x)}" y="${f1(dn > 0 ? y : y + hh - 4)}" width="${f1(w)}" height="4" fill="#fff" opacity=".13"/><rect x="${f1(x)}" y="${f1(dn > 0 ? y + hh - 5 : y)}" width="${f1(w)}" height="5" fill="#000" opacity=".22"/></g>`;
  };
  /** Haus von oben: Satteldach mit First entlang der langen Seite, Schornstein, Kontur. */
  const house = (w, hh, kind, rot, seed, extra = '') => {
    const p = 4;
    const mid = hh / 2;
    const r = mulberry(seed + 3);
    const cx = p + 16 + r() * (w - 2 * p - 44);
    const up = r() < 0.5;
    return svg(w, hh, `${roofFace(p, p, w - 2 * p, mid - p, kind, lit(0, -1, rot) * 0.9, seed, -1)}${roofFace(p, mid, w - 2 * p, mid - p, kind, lit(0, 1, rot) * 0.9, seed + 1, 1)}
      <rect x="${p}" y="${p}" width="${w - 2 * p}" height="${hh - 2 * p}" rx="2" fill="none" ${O}/><path d="M${p} ${mid} H${w - p}" stroke="${INK}" stroke-width="2.2"/>
      <rect x="${f1(cx)}" y="${f1(up ? mid - 24 : mid + 10)}" width="13" height="13" fill="#8a887a" ${T}/><rect x="${f1(cx + 3.5)}" y="${f1((up ? mid - 24 : mid + 10) + 3.5)}" width="6" height="6" fill="#2a2420"/>${extra}`, 2.4);
  };
  const HOUSE = [[150, 106], [186, 120], [232, 126], [128, 118]];
  const houseDef = (kind, label) => ({ cat: 'building', label, h: 26, lit: true, make: (v, B, px, rot = 0) => house(...HOUSE[v % HOUSE.length], kind, rot, v) });
  /** Runder Turm mit Kegeldach; die Schattierung bleibt beim Drehen stehen. */
  const coneRoof = (d, kind, rot, wall = '#bdbc9d') => {
    const c = d / 2;
    const [base, line] = ROOFS[kind];
    let rays = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.283;
      rays += `M${c} ${c} L${f1(c + Math.cos(a) * (c - 9))} ${f1(c + Math.sin(a) * (c - 9))}`;
    }
    return `<circle cx="${c}" cy="${c}" r="${c - 3}" fill="${wall}" ${O}/><g transform="rotate(${-rot} ${c} ${c})"><clipPath id="t"><circle cx="${c}" cy="${c}" r="${c - 9}"/></clipPath><circle cx="${c}" cy="${c}" r="${c - 9}" fill="${tone(base, -0.7)}"/><g clip-path="url(#t)"><path d="M${c} ${c} L${f1(c - d)} ${f1(c + d * 0.75)} L${f1(c - d)} ${f1(c - d)} L${f1(c + d * 0.75)} ${f1(c - d)}Z" fill="${tone(base, 0.6)}"/></g></g><path d="${rays}" stroke="${line}" stroke-width="1" opacity=".55"/><circle cx="${c}" cy="${c}" r="${f1((c - 9) * 0.68)}" fill="none" stroke="${line}" stroke-width="1" stroke-dasharray="6 3" opacity=".5"/><circle cx="${c}" cy="${c}" r="${f1((c - 9) * 0.36)}" fill="none" stroke="${line}" stroke-width="1" stroke-dasharray="4 3" opacity=".5"/><circle cx="${c}" cy="${c}" r="${c - 9}" fill="none" ${T}/><circle cx="${c}" cy="${c}" r="3" fill="${INK}"/>`;
  };
  /** Zinnenkranz als kleine Blöcke rund um ein Rechteck. */
  const merlons = (x, y, w, hh, col) => {
    let s = '';
    const put = (mx, my) => (s += `<rect x="${f1(mx - 5)}" y="${f1(my - 5)}" width="10" height="10" rx="1.5" fill="${col}" ${T}/>`);
    for (let mx = x + 8; mx <= x + w - 8; mx += Math.max(16, (w - 16) / Math.round((w - 16) / 18))) (put(mx, y + 6), put(mx, y + hh - 6));
    for (let my = y + 24; my <= y + hh - 24; my += Math.max(16, (hh - 48) / Math.max(1, Math.round((hh - 48) / 18)))) (put(x + 6, my), put(x + w - 6, my));
    return s;
  };
  const stone = ['#bdbc9d', '#a9a88a', '#8f8e74', '#5a594a']; // hell, mittel, dunkel, Linie
  const bone = '#d9d3b8';
  const metal = '#6c6b64';
  const ring = (cx, cy, r, n, draw) => Array.from({ length: n }, (_, i) => draw(cx + Math.cos((i / n) * 6.283) * r, cy + Math.sin((i / n) * 6.283) * r, i)).join('');
  const blob = (seed, cx, cy, rx, ry, n = 9, jit = 0.22) => {
    const r = mulberry(seed);
    return smoothPath(Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 6.283;
      const k = 1 - jit / 2 + r() * jit;
      return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
    }));
  };

  return {
    // --- Gebäude (Übersichtskarten) ---------------------------------------------------------------------------------
    houseThatch: houseDef('thatch', tr('Haus mit Strohdach')),
    houseTile: houseDef('tile', tr('Haus mit Ziegeldach')),
    houseSlate: houseDef('slate', tr('Haus mit Schieferdach')),
    houseL: {
      cat: 'building', label: tr('Winkelhaus'), h: 34, lit: true,
      make: (v, B, px, rot = 0) => {
        const kind = ['tile', 'thatch', 'slate'][v % 3];
        const main = `${roofFace(4, 4, 212, 52, kind, lit(0, -1, rot) * 0.9, v, -1)}${roofFace(4, 56, 212, 52, kind, lit(0, 1, rot) * 0.9, v + 1, 1)}`;
        // Anbau nach unten: First senkrecht bei x = 69, die beiden Dachflächen links und rechts davon
        const wing = `<g transform="translate(69 108) rotate(90)">${roofFace(0, 0, 68, 49, kind, lit(-1, 0, rot) * 0.9, v + 2, 1)}${roofFace(0, -49, 68, 49, kind, lit(1, 0, rot) * 0.9, v + 3, -1)}</g>`;
        return svg(220, 180, `${wing}${main}<path d="M4 4 H216 V108 H118 V176 H20 V108 H4Z" fill="none" ${O}/><path d="M4 56 H216 M69 108 V176" stroke="${INK}" stroke-width="2.2"/><rect x="170" y="24" width="13" height="13" fill="#8a887a" ${T}/>`, 2.4);
      },
    },
    barn: { cat: 'building', label: tr('Scheune'), h: 38, lit: true, make: (v, B, px, rot = 0) => house(250, 156, 'wood', rot, v, `<path d="M4 60 H18 M4 96 H18" stroke="${INK}" stroke-width="2"/>`) },
    church: {
      cat: 'building', label: tr('Kirche'), h: 52, lit: true,
      make: (v, B, px, rot = 0) => svg(300, 200, `<g transform="translate(150 100) rotate(90) translate(-100 -50)">${roofFace(0, 0, 200, 50, 'slate', lit(1, 0, rot) * 0.9, v + 5, -1)}${roofFace(0, 50, 200, 50, 'slate', lit(-1, 0, rot) * 0.9, v + 6, 1)}</g>
        ${roofFace(60, 50, 236, 50, 'slate', lit(0, -1, rot) * 0.9, v, -1)}${roofFace(60, 100, 236, 50, 'slate', lit(0, 1, rot) * 0.9, v + 1, 1)}
        <path d="M100 4 H200 V50 H296 V150 H200 V196 H100 V150 H60 V50 H100Z" fill="none" ${O}/><path d="M60 100 H296 M150 4 V50 M150 150 V196" stroke="${INK}" stroke-width="2.2"/>
        <rect x="4" y="56" width="88" height="88" rx="2" fill="${stone[0]}" ${O}/><path d="M4 56 L48 100 L92 56 M4 144 L48 100 L92 144" stroke="${stone[3]}" stroke-width="1.4" fill="none"/><path d="M4 56 L48 100 L4 144Z" fill="${tone(ROOFS.slate[0], lit(-1, 0, rot))}" ${T}/><path d="M92 56 L48 100 L92 144Z" fill="${tone(ROOFS.slate[0], lit(1, 0, rot))}" ${T}/><path d="M4 56 L48 100 L92 56Z" fill="${tone(ROOFS.slate[0], lit(0, -1, rot))}" ${T}/><path d="M4 144 L48 100 L92 144Z" fill="${tone(ROOFS.slate[0], lit(0, 1, rot))}" ${T}/>`, 2.4),
    },
    towerRound: { cat: 'building', label: tr('Rundturm'), h: 50, lit: true, make: (v, B, px, rot = 0) => svg(120, 120, coneRoof(120, ['slate', 'tile', 'wood'][v % 3], rot), 2) },
    keep: {
      cat: 'building', label: tr('Bergfried'), h: 70,
      make: () => svg(170, 170, `<rect x="4" y="4" width="162" height="162" rx="3" fill="${stone[1]}" ${O}/><rect x="20" y="20" width="130" height="130" fill="${stone[2]}" stroke="${stone[3]}" stroke-width="1.4"/><path d="M20 62 H150 M20 106 H150 M62 20 V62 M108 62 V106 M50 106 V150 M120 106 V150" stroke="${stone[3]}" stroke-width="1" opacity=".6"/>${merlons(4, 4, 162, 162, stone[0])}<rect x="72" y="72" width="26" height="26" fill="${WD.dark}" ${T}/>`, 2.2),
    },
    wallTower: {
      cat: 'building', label: tr('Mauerturm'), h: 44,
      make: () => svg(110, 110, `<circle cx="55" cy="55" r="51" fill="${stone[1]}" ${O}/><circle cx="55" cy="55" r="37" fill="${stone[2]}" stroke="${stone[3]}" stroke-width="1.4"/>${ring(55, 55, 44, 14, (x, y, i) => `<rect x="${f1(x - 5)}" y="${f1(y - 5)}" width="10" height="10" rx="1.5" fill="${stone[0]}" ${T} transform="rotate(${Math.round((i / 14) * 360)} ${f1(x)} ${f1(y)})"/>`)}`, 2.2),
    },
    rampart: {
      cat: 'building', label: tr('Burgmauer (Stück)'), h: 30,
      make: () => svg(214, 40, `<rect x="2" y="4" width="210" height="32" fill="${stone[1]}" ${O}/><rect x="2" y="13" width="210" height="14" fill="${stone[2]}"/><path d="M40 13 V27 M92 13 V27 M150 13 V27 M186 13 V27" stroke="${stone[3]}" stroke-width="1" opacity=".6"/>${Array.from({ length: 11 }, (_, i) => `<rect x="${6 + i * 19.4}" y="5" width="10" height="8" rx="1" fill="${stone[0]}" ${T}/><rect x="${6 + i * 19.4}" y="27" width="10" height="8" rx="1" fill="${stone[0]}" ${T}/>`).join('')}`, 1.8),
    },
    gatehouse: {
      cat: 'building', label: tr('Torhaus'), h: 48,
      make: () => svg(210, 120, `<rect x="40" y="26" width="130" height="68" fill="${stone[1]}" ${O}/><rect x="78" y="35" width="54" height="50" fill="${stone[2]}" stroke="${stone[3]}" stroke-width="1.2"/><path d="M78 52 H132 M78 69 H132 M96 35 V52 M116 35 V52 M88 52 V69 M108 52 V69 M124 52 V69 M100 69 V85 M118 69 V85" stroke="${stone[3]}" stroke-width="1" opacity=".5"/><rect x="84" y="56" width="42" height="8" rx="1" fill="#3a3530" ${T}/><path d="M90 56 V64 M97 56 V64 M105 56 V64 M113 56 V64 M120 56 V64" stroke="#6b665a" stroke-width="2"/>${[82, 96, 110, 124].map((x) => `<rect x="${x - 5}" y="24" width="10" height="9" rx="1.5" fill="${stone[0]}" ${T}/><rect x="${x - 5}" y="87" width="10" height="9" rx="1.5" fill="${stone[0]}" ${T}/>`).join('')}
        ${[45, 165].map((x) => `<circle cx="${x}" cy="60" r="41" fill="${stone[1]}" ${O}/><circle cx="${x}" cy="60" r="28" fill="${stone[2]}" stroke="${stone[3]}" stroke-width="1.4"/>${ring(x, 60, 35, 11, (px2, py2, i) => `<rect x="${f1(px2 - 4.5)}" y="${f1(py2 - 4.5)}" width="9" height="9" rx="1.5" fill="${stone[0]}" ${T} transform="rotate(${Math.round((i / 11) * 360)} ${f1(px2)} ${f1(py2)})"/>`)}`).join('')}`, 2.2),
    },
    windmill: {
      // Von oben gesehen: Die Flügel drehen sich in einer senkrechten Ebene – man sieht sie nur als schmale Kante
      // quer vor dem Turm, je nach Stellung verschieden weit ausladend. Vorn die Flügelwelle, hinten der Steert.
      cat: 'building', label: tr('Windmühle'), h: 50, lit: true,
      make: (v, B, px, rot = 0) => {
        const phi = ((20 + (v % 5) * 14) * Math.PI) / 180;
        const L = 92;
        // Flügel, die gerade nach unten zeigen, zuerst (liegen aus dieser Sicht hinter den oberen)
        const sails = [0, 1, 2, 3].map((i) => phi + (i * Math.PI) / 2).sort((p, q) => Math.sin(p) - Math.sin(q)).map((ang) => {
          const reach = Math.cos(ang) * L;
          const up = Math.sin(ang) > 0;
          const y = up ? 37 : 42;
          const x0 = 100 + Math.sign(reach) * 5;
          const x1 = 100 + reach;
          const lo = Math.min(x0, x1);
          const w = Math.abs(x1 - x0);
          if (w < 6) return '';
          let slats = '';
          for (let x = lo + 5; x < lo + w - 2; x += 6) slats += `M${f1(x)} ${y + 2} v6`;
          return `<rect x="${f1(lo)}" y="${y}" width="${f1(w)}" height="8" rx="1.2" fill="${up ? '#e6dfc6' : '#d0c9ae'}" ${T}/><path d="${slats}" stroke="#6b5236" stroke-width="1" opacity=".8"/><path d="M${f1(lo)} ${y + 1.4} h${f1(w)}" stroke="#6b5236" stroke-width="2.8"/><path d="M${f1(lo)} ${y + 7.4} h${f1(w)}" stroke="#6b5236" stroke-width="1.2"/>`;
        }).join('');
        return svg(200, 200, `<path d="M100 112 L88 192 M100 112 L112 192 M100 112 V196" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M100 112 L88 192 M100 112 L112 192 M100 112 V196" stroke="${WD.mid}" stroke-width="2.6" stroke-linecap="round"/><rect x="82" y="186" width="36" height="9" rx="2" fill="${WD.dark}" ${T}/><g transform="translate(40 52)">${coneRoof(120, 'wood', rot, '#c9c3a8')}</g><rect x="94" y="40" width="12" height="74" rx="2" fill="${WD.dark}" ${O}/><path d="M100 46 V110" stroke="${WD.pale}" stroke-width="1" opacity=".6"/>${sails}<rect x="92" y="33" width="16" height="20" rx="3" fill="${WD.mid}" ${O}/><circle cx="100" cy="43" r="3.4" fill="${metal}" ${T}/>`, 2);
      },
    },
    stoneBridge: {
      cat: 'building', label: tr('Steinbrücke'), h: 0, layer: 'rug',
      make: () => svg(130, 290, `<rect x="4" y="4" width="122" height="282" rx="4" fill="${stone[2]}" ${O}/><rect x="18" y="4" width="94" height="282" fill="${stone[1]}"/><path d="M18 40 H112 M18 86 H112 M18 132 H112 M18 178 H112 M18 224 H112 M18 262 H112 M50 4 V40 M82 40 V86 M44 86 V132 M76 132 V178 M56 178 V224 M84 224 V262" stroke="${stone[3]}" stroke-width="1" opacity=".55"/><path d="M18 4 V286 M112 4 V286" stroke="${INK}" stroke-width="1.6"/>${Array.from({ length: 12 }, (_, i) => `<rect x="5" y="${10 + i * 23.4}" width="12" height="15" rx="1.5" fill="${stone[0]}" ${T}/><rect x="113" y="${10 + i * 23.4}" width="12" height="15" rx="1.5" fill="${stone[0]}" ${T}/>`).join('')}`, 2.4),
    },
    ship: {
      cat: 'building', label: tr('Schiff'), h: 14,
      make: () => svg(130, 330, `<path d="M65 6 Q122 80 116 220 Q112 300 65 324 Q18 300 14 220 Q8 80 65 6Z" fill="${WD.dark}" ${O}/><path d="M65 26 Q104 90 100 216 Q96 286 65 304 Q34 286 30 216 Q26 90 65 26Z" fill="${WD.top}" ${T}/>${Array.from({ length: 12 }, (_, i) => `<path d="M${32 + (i < 3 ? (3 - i) * 7 : 0)} ${60 + i * 20} H${98 - (i < 3 ? (3 - i) * 7 : 0)}" stroke="${WD.line}" stroke-width="1"/>`).join('')}<rect x="38" y="238" width="54" height="40" rx="3" fill="${WD.mid}" ${T}/><path d="M12 150 Q65 132 118 150 L112 168 Q65 152 18 168Z" fill="#d9d3b8" ${T}/><circle cx="65" cy="158" r="8" fill="${WD.mid}" ${O}/><circle cx="65" cy="82" r="6" fill="${WD.mid}" ${O}/>`, 2.6),
    },
    ruinHouse: {
      cat: 'building', label: tr('Hausruine'), h: 10,
      make: (v, B) => svg(190, 140, `<path d="M10 12 H70 M96 12 H180 V58 M180 86 V128 H120 M84 128 H10 V70 M10 44 V12" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round"/><path d="M10 12 H70 M96 12 H180 V58 M180 86 V128 H120 M84 128 H10 V70 M10 44 V12" fill="none" stroke="${B.rock.top}" stroke-width="9.4" stroke-linecap="round"/><path d="M30 12 V12.1 M56 12 V12.1 M120 12 V12.1 M150 12 V12.1 M180 34 V34.1 M180 106 V106.1 M150 128 V128.1 M44 128 V128.1 M10 100 V100.1 M10 28 V28.1" stroke="${B.rock.line}" stroke-width="9" opacity=".35"/>${[[80, 20, 7], [90, 132, 6], [102, 124, 5], [186, 72, 6], [16, 56, 6], [60, 60, 5], [130, 90, 7], [112, 70, 4]].map(([x, y, rr], i) => `<path d="${blob(v + i, x, y, rr, rr * 0.8, 6, 0.4)}" fill="${i % 2 ? B.rock.top : B.rock.side}" ${T}/>`).join('')}`, 2.6),
    },
    menhir: { cat: 'building', label: tr('Hinkelstein'), h: 30, make: (v, B) => svg(64, 64, `<path d="${blob(v, 32, 32, 26, 22, 8, 0.3)}" fill="${B.rock.side}" ${O}/><path d="${blob(v + 4, 28, 28, 15, 12, 7, 0.3)}" fill="${B.rock.top}" stroke="${B.rock.line}" stroke-width="1"/>`, 2) },
    caveMouth: {
      cat: 'building', label: tr('Höhleneingang'), h: 24,
      make: (v, B) => svg(170, 130, `<path d="${blob(v, 85, 65, 80, 60, 11, 0.24)}" fill="${B.rock.side}" ${O}/><path d="${blob(v + 2, 80, 58, 58, 42, 10, 0.22)}" fill="${B.rock.top}" stroke="${B.rock.line}" stroke-width="1"/><path d="M52 112 Q48 62 85 58 Q122 62 118 112Z" fill="#17140f" ${T}/><path d="M60 110 Q58 72 85 68" fill="none" stroke="#000" stroke-width="6" opacity=".4"/>`, 2.6),
    },

    // --- Dungeon ---------------------------------------------------------------------------------------------------------
    pillar: { cat: 'dungeon', label: tr('Säule'), h: 26, make: () => svg(64, 64, `<rect x="5" y="5" width="54" height="54" rx="3" fill="${stone[2]}" ${O}/>${disc(32, 32, 21, stone[0], stone[1], '', 'p')}<circle cx="32" cy="32" r="12" fill="none" stroke="${stone[3]}" stroke-width="1" opacity=".6"/>`, 1.8) },
    pillarBroken: {
      cat: 'dungeon', label: tr('Zerbrochene Säule'), h: 12,
      make: (v) => svg(120, 84, `<rect x="5" y="15" width="54" height="54" rx="3" fill="${stone[2]}" ${O}/><path d="${blob(v, 32, 42, 21, 20, 9, 0.35)}" fill="${stone[1]}" ${T}/><g transform="rotate(${-18 + (v % 30)} 86 44)"><rect x="62" y="30" width="52" height="30" rx="6" fill="${stone[0]}" ${O}/><path d="M74 30 V60 M88 30 V60 M102 30 V60" stroke="${stone[3]}" stroke-width="1" opacity=".6"/></g><path d="${blob(v + 3, 70, 72, 6, 5, 6, 0.4)}" fill="${stone[0]}" ${T}/><path d="${blob(v + 5, 52, 12, 5, 4, 6, 0.4)}" fill="${stone[1]}" ${T}/>`, 2),
    },
    rubble: {
      cat: 'dungeon', label: tr('Geröll'), h: 8,
      make: (v, B) => {
        const r = mulberry(v + 9);
        return svg(110, 90, Array.from({ length: 11 }, (_, i) => {
          const x = 22 + r() * 66;
          const y = 20 + r() * 50;
          const s = 6 + r() * 12;
          return `<path d="${blob(v + i * 7, x, y, s, s * 0.8, 7, 0.4)}" fill="${[B.rock.top, B.rock.side, stone[1]][i % 3]}" stroke="${INK}" stroke-width="1.9" stroke-linejoin="round"/>`;
        }).join(''), 2);
      },
    },
    sarcophagus: { cat: 'dungeon', label: tr('Sarkophag'), h: 16, make: () => svg(84, 170, `<rect x="4" y="4" width="76" height="162" rx="5" fill="${stone[2]}" ${O}/><rect x="11" y="11" width="62" height="148" rx="4" fill="${stone[0]}" stroke="${stone[3]}" stroke-width="1.4"/><path d="M42 30 V120 M26 52 H58" stroke="${stone[3]}" stroke-width="5" stroke-linecap="round" opacity=".55"/><circle cx="42" cy="140" r="8" fill="none" stroke="${stone[3]}" stroke-width="1.6" opacity=".6"/>`, 2.2) },
    altar: { cat: 'dungeon', label: tr('Altar'), h: 16, make: () => svg(150, 86, `<rect x="4" y="4" width="142" height="78" rx="3" fill="${stone[2]}" ${O}/><rect x="14" y="13" width="122" height="60" rx="2" fill="${stone[0]}" stroke="${stone[3]}" stroke-width="1.4"/><rect x="48" y="13" width="54" height="60" fill="#7a2d32" ${T}/><path d="M48 24 H102 M48 62 H102" stroke="#b98f5a" stroke-width="2" opacity=".7"/><circle cx="26" cy="26" r="4" fill="${bone}" ${T}/><circle cx="26" cy="26" r="1.7" fill="#e8922e"/><circle cx="124" cy="26" r="4" fill="${bone}" ${T}/><circle cx="124" cy="26" r="1.7" fill="#e8922e"/><ellipse cx="75" cy="43" rx="12" ry="8" fill="${metal}" ${T}/>`, 2.2) },
    throne: { cat: 'dungeon', label: tr('Thron'), h: 22, make: () => svg(96, 104, `<rect x="6" y="6" width="84" height="26" rx="4" fill="${stone[2]}" ${O}/><rect x="6" y="24" width="18" height="70" rx="3" fill="${stone[1]}" ${O}/><rect x="72" y="24" width="18" height="70" rx="3" fill="${stone[1]}" ${O}/><rect x="24" y="32" width="48" height="62" rx="3" fill="#7a2d32" ${O}/><path d="M30 46 Q48 52 66 46" fill="none" stroke="#000" stroke-width="1.2" opacity=".3"/><circle cx="15" cy="15" r="4" fill="#b0a060" ${T}/><circle cx="81" cy="15" r="4" fill="#b0a060" ${T}/>`, 2) },
    trapdoor: { cat: 'dungeon', label: tr('Falltür'), h: 0, layer: 'rug', make: () => svg(92, 92, `<rect x="4" y="4" width="84" height="84" rx="3" fill="${WD.dark}" ${O}/><rect x="10" y="10" width="72" height="72" fill="${WD.mid}" stroke="${WD.line}" stroke-width="1.2"/><path d="M28 10 V82 M46 10 V82 M64 10 V82" stroke="${WD.line}" stroke-width="1"/><path d="M10 26 H82 M10 66 H82" stroke="${metal}" stroke-width="5"/><circle cx="70" cy="46" r="6" fill="none" stroke="${metal}" stroke-width="3"/>`, 2) },
    pit: { cat: 'dungeon', label: tr('Grube'), h: 0, layer: 'rug', make: (v, B) => svg(130, 130, `<path d="${blob(v, 65, 65, 60, 58, 11, 0.16)}" fill="${B.rock.side}" ${O}/><path d="${blob(v + 1, 68, 69, 48, 46, 10, 0.16)}" fill="#14110d" ${T}/><path d="${blob(v + 2, 74, 76, 30, 28, 9, 0.2)}" fill="#000" opacity=".5"/>`, 2.4) },
    plate: { cat: 'dungeon', label: tr('Druckplatte'), h: 0, layer: 'rug', make: () => svg(76, 76, `<rect x="4" y="4" width="68" height="68" rx="2" fill="${stone[2]}" ${O}/><rect x="11" y="11" width="54" height="54" rx="2" fill="${stone[0]}" stroke="${stone[3]}" stroke-width="1.4"/><path d="M26 38 H50 M38 26 V50" stroke="${stone[3]}" stroke-width="2" opacity=".6"/>`, 1.6) },
    spiral: { cat: 'dungeon', label: tr('Wendeltreppe'), h: 0, layer: 'rug', make: () => svg(140, 140, `<circle cx="70" cy="70" r="65" fill="${stone[2]}" ${O}/>${Array.from({ length: 14 }, (_, i) => `<path d="M70 70 L${f1(70 + Math.cos((i / 14) * 6.283) * 62)} ${f1(70 + Math.sin((i / 14) * 6.283) * 62)} A62 62 0 0 1 ${f1(70 + Math.cos(((i + 1) / 14) * 6.283) * 62)} ${f1(70 + Math.sin(((i + 1) / 14) * 6.283) * 62)}Z" fill="${stone[0]}" fill-opacity="${(1 - i * 0.055).toFixed(2)}" stroke="${stone[3]}" stroke-width="1"/>`).join('')}<circle cx="70" cy="70" r="11" fill="${stone[1]}" ${O}/>`, 2) },
    fountain: { cat: 'dungeon', label: tr('Brunnenbecken'), h: 10, make: (v, B) => svg(150, 150, `<circle cx="75" cy="75" r="70" fill="${stone[1]}" ${O}/><circle cx="75" cy="75" r="56" fill="${B.water[2]}" ${T}/><path d="M40 92 A40 40 0 0 0 112 96" fill="none" stroke="${B.water[0]}" stroke-width="10" opacity=".45"/><circle cx="75" cy="75" r="30" fill="none" stroke="${B.foam}" stroke-width="1.6" opacity=".7" stroke-dasharray="14 9"/><circle cx="75" cy="75" r="16" fill="${stone[0]}" ${O}/><circle cx="75" cy="75" r="6" fill="${B.water[3]}" ${T}/>`, 2.6) },
    weaponRack: { cat: 'dungeon', label: tr('Waffenständer'), h: 14, make: () => svg(150, 44, `<rect x="4" y="14" width="142" height="16" rx="3" fill="${WD.dark}" ${O}/>${[20, 44, 68, 92, 116].map((x, i) => (i % 2 ? `<path d="M${x} 6 V38" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="M${x} 6 V38" stroke="${WD.pale}" stroke-width="2.4" stroke-linecap="round"/><path d="M${x - 6} 6 L${x} 2 L${x + 6} 6 L${x} 13Z" fill="#9a998f" ${T}/>` : `<path d="M${x} 5 V39" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/><path d="M${x} 5 V30" stroke="#b9b8ae" stroke-width="2.6" stroke-linecap="round"/><path d="M${x - 6} 31 H${x + 6}" stroke="${INK}" stroke-width="3"/>`)).join('')}`, 1.6) },
    bedroll: { cat: 'dungeon', label: tr('Schlafrolle'), h: 4, make: (v) => svg(60, 124, `<rect x="5" y="5" width="50" height="114" rx="9" fill="${['#6d7d52', '#7a5a44', '#5e6f78'][v % 3]}" ${O}/><path d="M5 34 Q30 40 55 34" fill="none" stroke="#000" stroke-width="1.4" opacity=".35"/><rect x="12" y="10" width="36" height="20" rx="7" fill="#d9d3b8" ${T}/>`, 2) },
    stalagmite: { cat: 'dungeon', label: tr('Tropfstein'), h: 18, make: (v, B) => svg(60, 60, `<path d="${blob(v, 30, 30, 25, 23, 9, 0.3)}" fill="${B.rock.side}" ${O}/><path d="${blob(v + 1, 27, 27, 15, 14, 8, 0.3)}" fill="${B.rock.top}" stroke="${B.rock.line}" stroke-width="1"/><path d="${blob(v + 2, 25, 25, 6, 6, 7, 0.3)}" fill="${B.rock.cell}" ${T}/>`, 1.8) },
    puddle: {
      cat: 'dungeon', label: tr('Pfütze'), h: 0, layer: 'rug',
      make: (v, B) => svgF(130, 100, `<radialGradient id="pg" cx="48%" cy="46%" r="60%"><stop offset="0" stop-color="${B.water[0]}"/><stop offset=".7" stop-color="${B.water[1]}"/><stop offset="1" stop-color="${B.water[2]}"/></radialGradient><path d="${blob(v + 5, 65, 50, 63, 47, 11, 0.24)}" fill="#000" opacity=".1"/><path d="${blob(v + 5, 65, 50, 60, 44, 11, 0.26)}" fill="#000" opacity=".1"/><path d="${blob(v, 65, 50, 56, 40, 10, 0.3)}" fill="url(#pg)" stroke="${B.shoreLine}" stroke-width="1.4" stroke-opacity=".7"/><path d="M40 40 Q52 36 64 39 M70 62 Q80 65 88 61" fill="none" stroke="${B.foam}" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>`, 2.4),
    },
    magicCircle: {
      cat: 'dungeon', label: tr('Magischer Kreis'), h: 0, layer: 'rug', light: { bright: 5, dim: 10, color: '#b08cf0' },
      make: (v) => {
        const c = ['#b08cf0', '#7fe0ff', '#ff9a6a', '#9ff5a0'][v % 4];
        return svgF(220, 220, `<g fill="none" stroke="${c}" opacity=".9"><circle cx="110" cy="110" r="102" stroke-width="3"/><circle cx="110" cy="110" r="88" stroke-width="1.4"/><circle cx="110" cy="110" r="50" stroke-width="2"/><path d="M110 22 L186 154 H34Z M110 198 L34 66 H186Z" stroke-width="1.8"/>${ring(110, 110, 95, 12, (x, y) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.4" fill="${c}"/>`)}</g><circle cx="110" cy="110" r="102" fill="${c}" opacity=".1"/>`, 1.6);
      },
    },

    // --- Natur ----------------------------------------------------------------------------------------------------------
    stump: { cat: 'nature', label: tr('Baumstumpf'), h: 8, make: (v) => svg(64, 64, `<path d="${blob(v, 32, 32, 27, 26, 10, 0.2)}" fill="${WD.dark}" ${O}/>${disc(32, 32, 19, '#b59a68', '#8f7a50', `<circle cx="31" cy="31" r="12" fill="none" stroke="${WD.line}" stroke-width="1"/><circle cx="31" cy="31" r="6" fill="none" stroke="${WD.line}" stroke-width="1"/>`, 's')}`, 1.8) },
    fallenLog: { cat: 'nature', label: tr('Umgestürzter Stamm'), h: 9, make: () => svg(170, 50, `<rect x="5" y="9" width="160" height="32" rx="14" fill="${WD.mid}" ${O}/><path d="M24 17 H140 M30 27 H150 M22 34 H120" stroke="${WD.line}" stroke-width="1" opacity=".7"/><ellipse cx="17" cy="25" rx="9" ry="13" fill="#b59a68" ${T}/><ellipse cx="17" cy="25" rx="4" ry="6" fill="none" stroke="${WD.line}" stroke-width="1"/><path d="M96 9 L104 2 M120 41 L130 48" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M96 9 L104 2 M120 41 L130 48" stroke="${WD.mid}" stroke-width="2.6" stroke-linecap="round"/>`, 2) },
    boulders: { cat: 'nature', label: tr('Felsgruppe'), h: 16, make: (v, B) => svg(160, 130, [[52, 54, 44, 36], [108, 76, 40, 34], [92, 34, 22, 18], [42, 100, 20, 16]].map(([x, y, rx, ry], i) => `<path d="${blob(v + i * 3, x, y, rx, ry, 9, 0.24)}" fill="${B.rock.side}" ${O}/><path d="${blob(v + i * 3 + 1, x - rx * 0.12, y - ry * 0.16, rx * 0.66, ry * 0.62, 8, 0.24)}" fill="${B.rock.top}" stroke="${B.rock.line}" stroke-width="1"/>`).join(''), 2.4) },
  };
}
