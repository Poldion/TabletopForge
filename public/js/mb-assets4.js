// Kartenbauer: Ergänzungen zum Katalog – weitere Lichtquellen (Wandfackel, Kerzen, Straßenlaterne, Portal), Möbel für
// Werkstatt, Studierstube und Kapelle, Vorräte, Kerker- und Gruftteile, Dinge für Friedhof, Lager und Richtplatz,
// Pflanzen und ein paar Teile für Schiff und Hafen. Alles von oben gesehen, im Stil des übrigen Katalogs.
import { tr } from './i18n.js';

/** h: Zeichenbausteine aus mb-assets.js. */
export function extraAssets(h) {
  const { svg, svgF, O, T, WD, grain, smoothPath, f1, INK, mulberry } = h;
  const iron = ['#8a897e', '#6c6b64', '#4a4944', '#2a2622']; // hell … dunkel
  const stone = ['#bdbc9d', '#a9a88a', '#8f8e74', '#5a594a'];
  const brass = '#a58f4e';
  const rope = '#b5aa85';
  const blob = (seed, cx, cy, rx, ry, n = 9, jit = 0.22) => {
    const r = mulberry(seed);
    return smoothPath(Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 6.283;
      const k = 1 - jit / 2 + r() * jit;
      return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
    }));
  };
  /** Flamme von oben: unruhiger Fleck, innen heller. */
  const flame = (x, y, s = 1) => `<path d="M${f1(x - 6 * s)} ${f1(y + 3 * s)} Q${f1(x - 8 * s)} ${f1(y - 5 * s)} ${f1(x - 2 * s)} ${f1(y - 7 * s)} Q${f1(x - 1 * s)} ${f1(y - 2 * s)} ${f1(x + 3 * s)} ${f1(y - 6 * s)} Q${f1(x + 8 * s)} ${f1(y - 2 * s)} ${f1(x + 6 * s)} ${f1(y + 4 * s)} Q${f1(x)} ${f1(y + 8 * s)} ${f1(x - 6 * s)} ${f1(y + 3 * s)}Z" fill="#e8922e" stroke="#a8501e" stroke-width="1"/><path d="M${f1(x - 3 * s)} ${f1(y + 2 * s)} Q${f1(x - 3 * s)} ${f1(y - 3 * s)} ${f1(x + 1 * s)} ${f1(y - 3 * s)} Q${f1(x + 4 * s)} ${f1(y)} ${f1(x + 2 * s)} ${f1(y + 4 * s)}Z" fill="#f2c24a"/>`;
  /** Kerze von oben: Wachsscheibe mit Flamme. */
  const candle = (x, y, r = 3.6) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#d9d3b8" ${T}/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.45)}" fill="#e8922e"/>`;
  /** Linie mit dunkler Kontur (Stange, Seil, Kette). */
  const rod = (d, w, col, o = 1.3) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f1(w + 2 * o)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${f1(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const board = (x, y, w, hh, fill = WD.top, seed = 3, vertical = false) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="2.5" fill="${fill}" ${O}/>${grain(x + 2, y + 2, w - 4, hh - 4, seed, vertical)}`;
  const fire = { bright: 20, dim: 20, color: '#ff9a4a', flicker: true };
  const glow = (c) => ({ bright: 5, dim: 10, color: c });

  return {
    // --- Licht ----------------------------------------------------------------------------------------------------------
    wallTorch: {
      // wallMount: rastet beim Setzen an die Wand; lightAt: das Licht sitzt ein Stück im Raum, nicht auf der Wand
      cat: 'furniture', label: tr('Wandfackel'), h: 5, light: fire, wallMount: 17, lightAt: [0, 12],
      make: () => svg(40, 34, `<rect x="9" y="3" width="22" height="7" rx="1.5" fill="${iron[1]}" ${O}/>${rod('M20 9 V19', 3, iron[2])}<circle cx="20" cy="21" r="8.5" fill="${iron[2]}" ${O}/><circle cx="20" cy="21" r="5.6" fill="${iron[3]}"/>${flame(20, 21.5, 0.78)}`, 1.2),
    },
    candelabra: {
      cat: 'furniture', label: tr('Kerzenständer'), h: 12, light: { bright: 15, dim: 15, color: '#ffd9a0', flicker: true },
      make: (v) => {
        const a0 = (v % 6) * 0.35;
        const pts = [0, 1, 2].map((i) => [30 + Math.cos(a0 + i * 2.094) * 18, 30 + Math.sin(a0 + i * 2.094) * 18]);
        return svg(60, 60, `<circle cx="31.5" cy="32" r="11" fill="#000" opacity=".2"/>${pts.map(([x, y]) => rod(`M30 30 L${f1(x)} ${f1(y)}`, 3, brass)).join('')}<circle cx="30" cy="30" r="8" fill="${brass}" ${O}/><circle cx="30" cy="30" r="4.6" fill="#7d6a36"/>${pts.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="6" fill="${brass}" ${T}/>${candle(x, y, 3.8)}`).join('')}${candle(30, 30, 3.4)}`, 1.2);
      },
    },
    candles: {
      cat: 'furniture', label: tr('Kerzen'), h: 0, layer: 'rug', light: { bright: 5, dim: 10, color: '#ffd9a0', flicker: true },
      make: (v) => {
        const r = mulberry(v + 12);
        let s = `<path d="${blob(v, 24, 24, 19, 17, 8, 0.4)}" fill="#d8d2b8" opacity=".8" stroke="${INK}" stroke-width="1" stroke-opacity=".45"/>`;
        for (let i = 0, n = 3 + (v % 3); i < n; i++) {
          const x = 12 + r() * 24;
          const y = 12 + r() * 24;
          const rr = 3.8 + r() * 1.2;
          s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}" fill="#e6dfc4" stroke="${INK}" stroke-width="2"/><circle cx="${f1(x)}" cy="${f1(y)}" r="1.6" fill="#ffb040"/>`;
        }
        return svg(48, 48, s, 1);
      },
    },
    streetLamp: {
      cat: 'outdoor', label: tr('Straßenlaterne'), h: 30, light: { bright: 20, dim: 20, color: '#ffd9a0' },
      make: () => svg(46, 46, `<rect x="7" y="7" width="32" height="32" rx="5" fill="${iron[2]}" ${O}/><rect x="12" y="12" width="22" height="22" rx="2" fill="#f2c24a" ${T}/><path d="M12 12 L34 34 M34 12 L12 34" stroke="${iron[2]}" stroke-width="3"/><circle cx="23" cy="23" r="5" fill="${iron[1]}" ${T}/><circle cx="21.8" cy="21.8" r="1.6" fill="${iron[0]}"/>`, 1.4),
    },
    cookfire: {
      cat: 'outdoor', label: tr('Kochstelle'), h: 8, light: fire,
      make: (v, B) => {
        let stones = '';
        for (let i = 0; i < 9; i++) stones += `<ellipse cx="${f1(40 + Math.cos((i / 9) * 6.283) * 25)}" cy="${f1(40 + Math.sin((i / 9) * 6.283) * 25)}" rx="7.5" ry="6" transform="rotate(${i * 40 + 20} ${f1(40 + Math.cos((i / 9) * 6.283) * 25)} ${f1(40 + Math.sin((i / 9) * 6.283) * 25)})" fill="${B.rock.top}" ${T}/>`;
        return svg(80, 80, `<circle cx="40" cy="40" r="22" fill="#2a2420"/>${stones}${flame(26, 50, 1.25)}${flame(54, 31, 1.1)}${flame(52, 52, 0.9)}${[0, 1, 2].map((i) => rod(`M40 40 L${f1(40 + Math.cos(i * 2.094 + 0.5) * 36)} ${f1(40 + Math.sin(i * 2.094 + 0.5) * 36)}`, 2.6, WD.dark)).join('')}<circle cx="40" cy="40" r="13" fill="${iron[2]}" ${O}/><circle cx="40" cy="40" r="9.5" fill="#7d6a3e"/><path d="M34 38 Q39 34 45 38" fill="none" stroke="#b9a66a" stroke-width="1.4" stroke-linecap="round"/><circle cx="40" cy="40" r="2.4" fill="${iron[0]}" ${T}/>`, 1.6);
      },
    },
    runestone: {
      cat: 'outdoor', label: tr('Runenstein'), h: 18, light: glow('#7fe0ff'),
      make: (v, B) => {
        const c = ['#7fe0ff', '#b08cf0', '#9ff5a0', '#ffb070'][v % 4];
        return svg(64, 78, `<path d="${blob(v + 2, 32, 40, 27, 34, 9, 0.26)}" fill="${B.rock.side}" ${O}/><path d="${blob(v + 2, 30, 37, 21, 28, 9, 0.26)}" fill="${B.rock.top}" stroke="${B.rock.line}" stroke-width="1"/><path d="M24 22 L30 32 L23 40 M36 20 V34 M36 26 L42 22 M27 46 L34 54 L41 45 M34 54 V60" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/>`, 2);
      },
    },
    portal: {
      cat: 'dungeon', label: tr('Portal'), h: 26, light: { bright: 10, dim: 15, color: '#b08cf0' },
      make: (v) => {
        const c = ['#b08cf0', '#7fe0ff', '#ff9a6a', '#9ff5a0'][v % 4];
        const pillar = (x) => `<rect x="${x}" y="6" width="30" height="38" rx="3" fill="${stone[1]}" ${O}/><rect x="${x + 5}" y="11" width="20" height="28" rx="2" fill="${stone[0]}" stroke="${stone[3]}" stroke-width="1"/>`;
        return svg(160, 50, `<ellipse cx="80" cy="25" rx="56" ry="20" fill="${c}" opacity=".16"/><rect x="30" y="20" width="100" height="10" fill="${c}" opacity=".9"/><path d="M34 25 Q50 20 66 25 T98 25 T128 25" fill="none" stroke="#fff" stroke-width="1.6" opacity=".7"/>${pillar(4)}${pillar(126)}`, 1.6);
      },
    },
    glyph: {
      cat: 'dungeon', label: tr('Bodenglyphe'), h: 0, layer: 'rug', light: glow('#ff9a6a'),
      make: (v) => {
        const c = ['#ff9a6a', '#7fe0ff', '#b08cf0', '#9ff5a0'][v % 4];
        const sig = ['M35 16 L52 46 H18Z M35 26 V40', 'M20 22 Q35 8 50 22 Q35 34 50 48 Q35 60 20 48', 'M35 14 V56 M20 26 L50 44 M50 26 L20 44', 'M22 20 H48 L22 50 H48 M35 20 V50'][Math.floor(v / 4) % 4];
        return svgF(70, 70, `<circle cx="35" cy="35" r="31" fill="${c}" opacity=".1"/><g fill="none" stroke="${c}" stroke-linecap="round" stroke-linejoin="round" opacity=".9"><circle cx="35" cy="35" r="30" stroke-width="2.4"/><circle cx="35" cy="35" r="25" stroke-width="1"/><path d="${sig}" stroke-width="2.4"/></g>`, 1.4);
      },
    },

    // --- Möbel ----------------------------------------------------------------------------------------------------------
    armchair: {
      cat: 'furniture', label: tr('Lehnsessel'), h: 12,
      make: (v) => {
        const [c1, c2] = [['#7a4038', '#93574c'], ['#4f5f4a', '#667860'], ['#5a5068', '#72687f'], ['#77633f', '#8f7a52']][v % 4];
        return svg(66, 66, `<rect x="6" y="4" width="54" height="20" rx="8" fill="${c1}" ${O}/><rect x="4" y="16" width="14" height="46" rx="6" fill="${c1}" ${O}/><rect x="48" y="16" width="14" height="46" rx="6" fill="${c1}" ${O}/><rect x="16" y="20" width="34" height="40" rx="6" fill="${c2}" ${O}/><path d="M22 30 Q33 34 44 30" fill="none" stroke="${c1}" stroke-width="1.4"/><circle cx="33" cy="42" r="2.2" fill="${c1}"/>`, 1.8);
      },
    },
    bathtub: {
      cat: 'furniture', label: tr('Badezuber'), h: 14,
      make: (v, B) => svg(92, 92, `<circle cx="46" cy="46" r="42" fill="#6b5a40" ${O}/><circle cx="46" cy="46" r="38" fill="none" stroke="${iron[2]}" stroke-width="2.6"/>${Array.from({ length: 16 }, (_, i) => `<path d="M${f1(46 + Math.cos((i / 16) * 6.283) * 33)} ${f1(46 + Math.sin((i / 16) * 6.283) * 33)} L${f1(46 + Math.cos((i / 16) * 6.283) * 42)} ${f1(46 + Math.sin((i / 16) * 6.283) * 42)}" stroke="${WD.line}" stroke-width="1"/>`).join('')}<circle cx="46" cy="46" r="32" fill="${B.water[2]}" ${T}/><circle cx="44" cy="44" r="24" fill="${B.water[3]}" opacity=".45"/><path d="M30 40 Q38 35 46 39 M48 56 Q56 60 64 54" fill="none" stroke="${B.foam}" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>`, 2),
    },
    workbench: {
      cat: 'furniture', label: tr('Werkbank'), h: 13,
      make: () => svg(150, 70, `${board(3, 3, 144, 64, WD.top, 21)}<path d="M5 24 Q75 26 145 23 M5 46 Q75 44 145 47" fill="none" stroke="${WD.line}" stroke-width="1"/><rect x="8" y="42" width="26" height="20" rx="2" fill="${iron[1]}" ${O}/><path d="M21 42 V62" stroke="${iron[3]}" stroke-width="3"/>${rod('M52 18 L88 30', 3.4, WD.dark)}<rect x="84" y="20" width="12" height="20" rx="2" fill="${iron[1]}" ${T} transform="rotate(18 90 30)"/><path d="M104 50 L140 44 L141 54 L106 58Z" fill="${iron[0]}" ${T}/><path d="M108 57 l2 3 l2 -3 l2 3 l2 -3 l2 3 l2 -3 l2 3 l2 -3 l2 3 l2 -3 l2 3 l2 -3 l2 3 l2 -3" fill="none" stroke="${INK}" stroke-width=".9"/><rect x="96" y="46" width="12" height="13" rx="3" fill="${WD.dark}" ${T}/>${[[56, 48], [62, 52], [58, 56], [118, 16], [124, 20]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="${iron[3]}"/>`).join('')}<path d="M110 12 Q124 6 138 14 Q132 22 116 22Z" fill="#d6c79a" ${T}/>`),
    },
    alchemyTable: {
      cat: 'furniture', label: tr('Alchemietisch'), h: 13,
      make: (v) => {
        const flask = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${T}/><circle cx="${x}" cy="${y}" r="${f1(r * 0.42)}" fill="${INK}" opacity=".55"/><path d="M${f1(x - r * 0.55)} ${f1(y - r * 0.35)} q${f1(r * 0.3)} ${f1(-r * 0.4)} ${f1(r * 0.7)} ${f1(-r * 0.25)}" fill="none" stroke="#fff" stroke-width="1" opacity=".5" stroke-linecap="round"/>`;
        return svg(140, 76, `${board(3, 3, 134, 70, WD.mid, 27 + v)}${flask(24, 24, 9, '#5f8f6a')}${flask(44, 18, 6, '#8a5a8f')}${flask(30, 48, 7, '#b0803a')}<circle cx="60" cy="50" r="10" fill="${stone[1]}" ${T}/><circle cx="60" cy="50" r="6.4" fill="${stone[3]}"/>${rod('M57 47 L70 36', 2.6, stone[0], 1)}<rect x="80" y="14" width="44" height="32" rx="1.5" fill="#d9d3b8" ${T} transform="rotate(5 102 30)"/><path d="M102 14 V46 M86 22 H98 M86 28 H97 M86 34 H98 M106 22 H119 M106 28 H118 M106 34 H116" stroke="#8a8468" stroke-width="1" transform="rotate(5 102 30)"/><path d="${blob(v + 3, 100, 60, 13, 7, 7, 0.4)}" fill="#6a8f5a" opacity=".8"/>${candle(124, 60)}`);
      },
    },
    mapTable: {
      cat: 'furniture', label: tr('Kartentisch'), h: 13,
      make: (v) => svg(160, 110, `${board(3, 3, 154, 104, WD.top, 33)}<path d="M5 38 Q80 40 155 37 M5 72 Q80 70 155 73" fill="none" stroke="${WD.line}" stroke-width="1"/><path d="M22 18 L136 14 L140 88 L26 94Z" fill="#d9d0ae" ${T}/><path d="M34 30 Q60 22 78 40 T126 36 M40 76 Q70 60 96 72 T132 66" fill="none" stroke="#6f8f8a" stroke-width="1.6" opacity=".8"/><path d="M52 44 l6 -9 l6 9Z M90 56 l5 -8 l5 8Z M110 46 l5 -8 l5 8Z" fill="#8f8a68" stroke="${INK}" stroke-width=".7"/><path d="M44 62 L70 52 L100 62" fill="none" stroke="#a8503e" stroke-width="1.4" stroke-dasharray="3 3"/><circle cx="100" cy="62" r="3" fill="#a8503e" ${T}/><circle cx="44" cy="62" r="3" fill="#4f6a7a" ${T}/>${rod('M120 80 L146 96', 2.2, iron[0], 1)}<rect x="6" y="6" width="12" height="12" rx="2" fill="${iron[1]}" ${T}/>${candle(146, 16)}`),
    },
    pew: {
      cat: 'furniture', label: tr('Kirchenbank'), h: 10,
      make: () => svg(160, 46, `<rect x="3" y="14" width="154" height="29" rx="2.5" fill="${WD.top}" ${O}/>${grain(5, 16, 150, 25, 41)}<rect x="3" y="3" width="154" height="13" rx="3" fill="${WD.dark}" ${O}/><path d="M6 8 H154" stroke="${WD.pale}" stroke-width="1" opacity=".6"/><rect x="3" y="3" width="9" height="40" rx="2" fill="${WD.mid}" ${T}/><rect x="148" y="3" width="9" height="40" rx="2" fill="${WD.mid}" ${T}/>`),
    },
    bunk: {
      cat: 'furniture', label: tr('Pritsche'), h: 9,
      make: () => svg(62, 132, `<rect x="3" y="3" width="56" height="126" rx="2.5" fill="${WD.dark}" ${O}/><rect x="8" y="8" width="46" height="116" rx="4" fill="#b9ad84" ${T}/><path d="M12 30 Q30 34 50 29 M12 60 Q32 56 50 61 M12 92 Q30 96 50 91" fill="none" stroke="#8f8560" stroke-width="1.1"/><path d="M14 16 l5 3 M24 14 l-3 5 M40 18 l5 -3 M44 110 l-4 4 M20 112 l5 2" stroke="#d6cc9c" stroke-width="1.1" stroke-linecap="round"/><rect x="8" y="64" width="46" height="60" rx="3" fill="#6f6a5a" ${T}/><path d="M8 72 H54" stroke="#4f4b40" stroke-width="1.4"/>`),
    },
    lectern: {
      // Von oben: rechteckige, nach vorn geneigte Platte (hinten etwas dunkler) mit Buchleiste an der Vorderkante
      cat: 'furniture', label: tr('Lesepult'), h: 14,
      make: () => svg(54, 46, `<rect x="4" y="4" width="46" height="38" rx="2.5" fill="${WD.mid}" ${O}/><rect x="5.5" y="5.5" width="43" height="11" fill="#000" opacity=".14"/><rect x="6" y="35" width="42" height="4.6" rx="1" fill="${WD.dark}" ${T}/><rect x="11" y="9" width="32" height="23" rx="1.5" fill="#d9d3b8" ${T}/><path d="M27 9 V32 M15 15 H24 M15 20 H23 M15 25 H24 M30 15 H39 M30 20 H38 M30 25 H37" stroke="#8a8468" stroke-width="1"/><path d="M34 32 v6 l2.5 -1.8 l2.5 1.8 v-6" fill="#8a3a34" ${T}/>`),
    },

    // --- Vorräte --------------------------------------------------------------------------------------------------------
    barrelRack: {
      // Von oben: zwei liegende Fässer nebeneinander auf zwei Querbalken; das Spundloch sitzt oben in der Fassmitte
      cat: 'goods', label: tr('Fässer im Gestell'), h: 15,
      make: () => {
        const cask = (y) => `<path d="M12 ${y + 6} Q60 ${y - 6} 108 ${y + 6} V${y + 30} Q60 ${y + 42} 12 ${y + 30}Z" fill="#8a7049" ${O}/><path d="M14 ${y + 13} Q60 ${y + 3} 106 ${y + 13} M14 ${y + 24} Q60 ${y + 34} 106 ${y + 24}" fill="none" stroke="${WD.line}" stroke-width="1"/><path d="M30 ${y + 1.6} V${y + 34.4} M90 ${y + 1.6} V${y + 34.4}" stroke="${INK}" stroke-width="5.4"/><path d="M30 ${y + 1.6} V${y + 34.4} M90 ${y + 1.6} V${y + 34.4}" stroke="${iron[1]}" stroke-width="3"/><path d="M14 ${y + 9} Q60 ${y - 2} 106 ${y + 9}" fill="none" stroke="#fff" stroke-width="2" opacity=".13"/><circle cx="60" cy="${y + 18}" r="3.2" fill="${WD.dark}" ${T}/>`;
        return svg(120, 96, `${rod('M40 4 V92 M80 4 V92', 5, WD.dark)}${cask(6)}${cask(50)}`, 1.8);
      },
    },
    crateStack: {
      cat: 'goods', label: tr('Kistenstapel'), h: 22,
      make: () => {
        const crate = (x, y, s, rot, fill) => `<g transform="rotate(${rot} ${x + s / 2} ${y + s / 2})"><rect x="${x}" y="${y}" width="${s}" height="${s}" rx="2" fill="${fill}" ${O}/><rect x="${x + 6}" y="${y + 6}" width="${s - 12}" height="${s - 12}" fill="#86704c" stroke="${WD.line}" stroke-width="1.2"/><path d="M${x + 6} ${y + 6} L${x + s - 6} ${y + s - 6}" stroke="${WD.dark}" stroke-width="3"/></g>`;
        return svg(120, 110, `${crate(6, 44, 58, -4, '#77633f')}${crate(56, 50, 54, 6, '#6f5c3a')}${crate(30, 8, 56, 3, '#7d6842')}<path d="M54 4 Q88 0 110 14 Q116 40 104 62 Q84 56 70 60 Q60 40 54 4Z" fill="#8f9078" ${O}/><path d="M64 10 Q78 30 74 56 M84 8 Q96 28 92 58 M100 18 Q106 36 102 56" fill="none" stroke="#000" stroke-width="1" opacity=".3"/><path d="M54 4 Q88 0 110 14 Q100 14 94 20 Q76 8 54 4Z" fill="#fff" opacity=".12"/>`, 2);
      },
    },
    amphorae: {
      cat: 'goods', label: tr('Krüge'), h: 12,
      make: (v) => {
        const jar = (x, y, r, c) => `${rod(`M${x - r - 1} ${y} h-4 M${x + r + 1} ${y} h4`, 2.2, c, 1)}<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${O}/><circle cx="${x}" cy="${y}" r="${f1(r * 0.62)}" fill="none" stroke="#000" stroke-width="1" opacity=".25"/><circle cx="${x}" cy="${y}" r="${f1(r * 0.42)}" fill="#3a2e22" ${T}/>`;
        const c = ['#b0764a', '#a8683e', '#9a8a62', '#b58858'];
        return svg(90, 76, `${jar(26, 26, 17, c[v % 4])}${jar(62, 30, 14, c[(v + 1) % 4])}${jar(42, 56, 13, c[(v + 2) % 4])}`, 1.6);
      },
    },
    baskets: {
      cat: 'goods', label: tr('Körbe'), h: 8,
      make: (v) => {
        const r = mulberry(v + 9);
        const basket = (x, y, rr, cols) => {
          let s = `<circle cx="${x}" cy="${y}" r="${rr}" fill="#a88a52" ${O}/><circle cx="${x}" cy="${y}" r="${rr - 4}" fill="#6f5a34"/>`;
          for (let i = 0; i < 12; i++) s += `<path d="M${f1(x + Math.cos((i / 12) * 6.283) * (rr - 4))} ${f1(y + Math.sin((i / 12) * 6.283) * (rr - 4))} L${f1(x + Math.cos((i / 12) * 6.283 + 0.2) * rr)} ${f1(y + Math.sin((i / 12) * 6.283 + 0.2) * rr)}" stroke="#7d6638" stroke-width="1.2"/>`;
          for (let i = 0; i < 9; i++) {
            const a = r() * 6.283;
            const k = Math.sqrt(r()) * (rr - 8);
            s += `<circle cx="${f1(x + Math.cos(a) * k)}" cy="${f1(y + Math.sin(a) * k)}" r="${f1(3.4 + r() * 1.4)}" fill="${cols[Math.floor(r() * cols.length)]}" stroke="${INK}" stroke-width=".8"/>`;
          }
          return s;
        };
        return svg(100, 64, `${basket(30, 32, 25, ['#a8483a', '#b9603a', '#8f9a4a'])}${basket(74, 36, 21, ['#c2a04a', '#8f7a3e', '#b08a4a'])}`, 1.6);
      },
    },
    clothBolts: {
      cat: 'goods', label: tr('Stoffballen'), h: 9,
      make: (v) => {
        const cols = ['#7a4038', '#4f6a7a', '#8f8a4a', '#5a5068', '#5c7a58', '#b08a5a'];
        const bolt = (y, c, rot) => `<g transform="rotate(${rot} 50 ${y + 8})"><rect x="8" y="${y}" width="84" height="16" rx="8" fill="${c}" ${O}/><path d="M16 ${y + 5} H84 M16 ${y + 11} H84" stroke="#000" stroke-width="1" opacity=".2"/><ellipse cx="88" cy="${y + 8}" rx="4" ry="7" fill="#d9d3b8" ${T}/><path d="M88 ${y + 4} q2 4 0 8" fill="none" stroke="${c}" stroke-width="1.4"/></g>`;
        return svg(100, 64, `${bolt(6, cols[v % 6], -3)}${bolt(24, cols[(v + 2) % 6], 2)}${bolt(42, cols[(v + 3) % 6], -1)}`, 1.6);
      },
    },
    ropeCoil: {
      cat: 'goods', label: tr('Seilrolle'), h: 4,
      make: () => svg(60, 60, `<circle cx="30" cy="30" r="25" fill="${rope}" ${O}/>${[20, 15, 10].map((r) => `<circle cx="30" cy="30" r="${r}" fill="none" stroke="#7d7455" stroke-width="1.4"/>`).join('')}<circle cx="30" cy="30" r="6" fill="#3a3226" ${T}/>${Array.from({ length: 14 }, (_, i) => `<path d="M${f1(30 + Math.cos((i / 14) * 6.283) * 21)} ${f1(30 + Math.sin((i / 14) * 6.283) * 21)} l${f1(Math.cos((i / 14) * 6.283 + 1) * 4)} ${f1(Math.sin((i / 14) * 6.283 + 1) * 4)}" stroke="#7d7455" stroke-width="1"/>`).join('')}${rod('M48 44 Q58 50 54 58', 3, rope)}`, 1.6),
    },

    // --- Kerker und Gruft -----------------------------------------------------------------------------------------------
    cellBars: {
      // Von oben: die Schiene im Boden mit den Köpfen der Gitterstäbe; ein Stück ist die Tür mit Scharnier und Schloss
      cat: 'dungeon', label: tr('Zellengitter'), h: 10,
      make: () => {
        let s = '';
        for (let x = 12; x <= 200; x += 9.4) s += `<circle cx="${f1(x)}" cy="11" r="2.9" fill="${iron[2]}" stroke="${INK}" stroke-width=".8"/><circle cx="${f1(x - 0.9)}" cy="10.1" r=".9" fill="#a09f94"/>`;
        return svg(210, 22, `<rect x="4" y="4" width="202" height="14" rx="2" fill="#6b6962" ${O}/><path d="M6 6.4 H204" stroke="${iron[0]}" stroke-width="1" opacity=".6"/><rect x="76" y="2.6" width="58" height="16.8" rx="2" fill="none" stroke="${INK}" stroke-width="1.6"/><rect x="72" y="6" width="7" height="10" rx="1.5" fill="${iron[0]}" ${T}/><rect x="129" y="5" width="9" height="12" rx="1.5" fill="#77745f" ${T}/><circle cx="133.5" cy="11" r="1.6" fill="${INK}"/>${s}`, 1.2);
      },
    },
    chains: {
      cat: 'dungeon', label: tr('Ketten'), h: 0, layer: 'rug',
      make: (v) => {
        const r = mulberry(v + 5);
        const chain = (x0, y0, a0, n) => {
          let s = '';
          let x = x0;
          let y = y0;
          let a = a0;
          for (let i = 0; i < n; i++) {
            a += (r() - 0.5) * 0.7;
            // nicht über den Bildrand hinaus: dort biegt die Kette zurück zur Mitte
            if (x < 16 || x > 94 || y > 66) a = Math.atan2(46 - y, 55 - x) + (r() - 0.5) * 0.6;
            const nx = x + Math.cos(a) * 6.4;
            const ny = y + Math.sin(a) * 6.4;
            s += `<ellipse cx="${f1((x + nx) / 2)}" cy="${f1((y + ny) / 2)}" rx="4.4" ry="${i % 2 ? 1.5 : 2.8}" transform="rotate(${f1(a * 57.3)} ${f1((x + nx) / 2)} ${f1((y + ny) / 2)})" fill="none" stroke="${INK}" stroke-width="3.2"/><ellipse cx="${f1((x + nx) / 2)}" cy="${f1((y + ny) / 2)}" rx="4.4" ry="${i % 2 ? 1.5 : 2.8}" transform="rotate(${f1(a * 57.3)} ${f1((x + nx) / 2)} ${f1((y + ny) / 2)})" fill="none" stroke="${iron[1]}" stroke-width="1.5"/>`;
            x = nx;
            y = ny;
          }
          return `${s}<circle cx="${f1(x)}" cy="${f1(y)}" r="6" fill="none" stroke="${INK}" stroke-width="5"/><circle cx="${f1(x)}" cy="${f1(y)}" r="6" fill="none" stroke="${iron[0]}" stroke-width="2.6"/>`;
        };
        return svgF(110, 84, `<rect x="40" y="3" width="30" height="9" rx="2" fill="${iron[2]}" ${O}/><circle cx="48" cy="7.5" r="1.6" fill="${iron[0]}"/><circle cx="62" cy="7.5" r="1.6" fill="${iron[0]}"/>${chain(48, 12, 2.3, 7)}${chain(62, 12, 0.9, 8)}`, 0.8);
      },
    },
    rack: {
      cat: 'dungeon', label: tr('Streckbank'), h: 12,
      make: () => svg(76, 150, `<rect x="6" y="14" width="64" height="122" rx="2.5" fill="${WD.mid}" ${O}/>${grain(8, 16, 60, 118, 51, true)}<path d="M6 54 H70 M6 96 H70" stroke="${WD.line}" stroke-width="1"/>${[10, 126].map((y) => `<rect x="3" y="${y}" width="70" height="14" rx="7" fill="${WD.dark}" ${O}/><path d="M12 ${y + 4} H64 M12 ${y + 10} H64" stroke="${WD.pale}" stroke-width="1" opacity=".5"/>`).join('')}${rod('M26 24 V46 M50 24 V46 M26 126 V104 M50 126 V104', 2, rope, 1)}${[[26, 50], [50, 50], [26, 100], [50, 100]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="${INK}" stroke-width="4.6"/><circle cx="${x}" cy="${y}" r="5" fill="none" stroke="${iron[1]}" stroke-width="2.4"/>`).join('')}${rod('M73 17 H84 M84 10 V24', 3, WD.dark)}`),
    },
    urns: {
      cat: 'dungeon', label: tr('Urnen'), h: 9,
      make: (v) => {
        const urn = (x, y, r, c) => `${rod(`M${x - r - 1} ${y} h-3.4 M${x + r + 1} ${y} h3.4`, 2.2, c, 1)}<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${O}/><circle cx="${x}" cy="${y}" r="${f1(r * 0.7)}" fill="none" stroke="#000" stroke-width="1" opacity=".22"/><circle cx="${x}" cy="${y}" r="${f1(r * 0.5)}" fill="#000" opacity=".16"/><circle cx="${x}" cy="${y}" r="${f1(r * 0.48)}" fill="${c}" ${T}/><circle cx="${x}" cy="${y}" r="2.2" fill="#c9b98f" ${T}/><circle cx="${f1(x - 0.7)}" cy="${f1(y - 0.7)}" r=".8" fill="#fff" opacity=".7"/>`;
        const c = ['#9a6a4a', '#6f7a5a', '#8a7a5c', '#a0735a'];
        return svg(92, 58, `${urn(22, 30, 15, c[v % 4])}${urn(54, 22, 12, c[(v + 1) % 4])}${urn(74, 42, 11, c[(v + 2) % 4])}`, 1.6);
      },
    },
    mineCart: {
      cat: 'dungeon', label: tr('Grubenwagen'), h: 12,
      make: (v) => {
        const r = mulberry(v + 13);
        let ore = '';
        for (let i = 0; i < 12; i++) ore += `<path d="${blob(v + i, 22 + r() * 30, 48 + r() * 44, 6 + r() * 4, 5 + r() * 3, 6, 0.4)}" fill="${['#5a5852', '#6f6c62', '#4a4944', '#8a7a4a'][i % 4]}" stroke="${INK}" stroke-width=".9"/>`;
        return svg(76, 140, `${Array.from({ length: 6 }, (_, i) => `<rect x="4" y="${6 + i * 24}" width="68" height="9" rx="1.5" fill="${WD.dark}" ${T}/>`).join('')}${rod('M18 2 V138 M58 2 V138', 2.6, iron[1], 1.1)}<rect x="8" y="46" width="8" height="18" rx="2" fill="${iron[2]}" ${T}/><rect x="60" y="46" width="8" height="18" rx="2" fill="${iron[2]}" ${T}/><rect x="8" y="80" width="8" height="18" rx="2" fill="${iron[2]}" ${T}/><rect x="60" y="80" width="8" height="18" rx="2" fill="${iron[2]}" ${T}/><rect x="13" y="36" width="50" height="70" rx="3" fill="#6b5a40" ${O}/><rect x="18" y="41" width="40" height="60" rx="2" fill="#3a3226"/>${ore}<rect x="13" y="36" width="50" height="70" rx="3" fill="none" stroke="${iron[1]}" stroke-width="1.6"/>`, 1.6);
      },
    },
    coffin: {
      cat: 'dungeon', label: tr('Sarg'), h: 10,
      make: (v) => svg(66, 146, `<path d="M20 4 H46 L62 40 L50 142 H16 L4 40Z" fill="${WD.dark}" ${O}/><path d="M22 10 H44 L56 41 L46 136 H20 L10 41Z" fill="${WD.mid}" stroke="${WD.line}" stroke-width="1.2"/>${grain(14, 16, 38, 116, 61 + v, true)}<path d="M33 26 V70 M22 40 H44" stroke="${WD.dark}" stroke-width="4"/>${[[14, 44], [52, 44], [20, 126], [46, 126]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="${iron[0]}" ${T}/>`).join('')}`, 1.8),
    },

    // --- Draußen: Friedhof, Richtplatz, Lager ------------------------------------------------------------------------------
    gravestone: {
      cat: 'outdoor', label: tr('Grab'), h: 9,
      make: (v, B) => {
        const r = mulberry(v + 15);
        let tufts = '';
        for (let i = 0; i < 7; i++) tufts += `<path d="M${f1(12 + r() * 40)} ${f1(40 + r() * 80)} l${f1((r() - 0.5) * 4)} -6 m3 6 l${f1((r() - 0.5) * 4)} -5" stroke="${B.ground[0]}" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>`;
        const head = v % 3 === 2
          ? `<path d="M32 11 L45 28 M33 22 H51" stroke="#2a1830" stroke-width="4.4" stroke-linecap="round" opacity=".22"/><rect x="22" y="8.6" width="20" height="5" rx="1.6" fill="${WD.mid}" ${O}/><rect x="29.4" y="7.4" width="5.2" height="7.4" rx="1.4" fill="${WD.dark}" ${T}/>`
          : `<rect x="12" y="6" width="40" height="15" rx="${v % 3 ? 3 : 7}" fill="${stone[1]}" ${O}/><path d="M16 10 H48" stroke="${stone[0]}" stroke-width="2" opacity=".8"/><path d="M22 15 H42" stroke="${stone[3]}" stroke-width="1" opacity=".6"/>`;
        return svg(64, 134, `<path d="${blob(v + 1, 32, 78, 24, 50, 10, 0.16)}" fill="${B.dirt}" stroke="${INK}" stroke-width="2" stroke-opacity=".8"/><path d="${blob(v + 4, 31, 76, 15, 38, 9, 0.2)}" fill="#fff" opacity=".1"/>${tufts}${head}`, 2);
      },
    },
    gallows: {
      cat: 'outdoor', label: tr('Galgen'), h: 34,
      make: () => svg(150, 130, `<rect x="4" y="34" width="112" height="92" rx="2" fill="${WD.mid}" ${O}/>${Array.from({ length: 6 }, (_, i) => `<path d="M${6 + i * 18.4 + 9} 36 V124" stroke="${WD.line}" stroke-width="1"/>`).join('')}${grain(6, 36, 108, 88, 71, true)}<rect x="46" y="72" width="34" height="34" fill="none" stroke="${INK}" stroke-width="1.6"/><path d="M63 72 V106" stroke="${INK}" stroke-width="1"/><path d="M116 60 h12 M116 80 h18 M116 100 h24 M116 120 h30" stroke="${INK}" stroke-width="6.4" stroke-linecap="round"/><path d="M116 60 h12 M116 80 h18 M116 100 h24 M116 120 h30" stroke="${WD.top}" stroke-width="4" stroke-linecap="round"/>${rod('M18 20 H68', 7, WD.dark, 1.5)}${rod('M18 20 L32 34', 4, WD.dark)}<rect x="8" y="10" width="20" height="20" rx="2" fill="${WD.dark}" ${O}/>${rod('M63 20 V40', 1.8, rope, 0.9)}<circle cx="63" cy="46" r="6" fill="none" stroke="${INK}" stroke-width="4"/><circle cx="63" cy="46" r="6" fill="none" stroke="${rope}" stroke-width="2"/>`, 1.8),
    },
    shrine: {
      // Von oben: Satteldach über zwei Dritteln des Sockels (Licht- und Schattenseite), vorn schaut die Opferschale hervor
      cat: 'outdoor', label: tr('Wegschrein'), h: 16, light: { bright: 5, dim: 5, color: '#ffd9a0', flicker: true },
      make: () => svg(70, 84, `<rect x="8" y="8" width="54" height="70" rx="3" fill="${stone[2]}" ${O}/><rect x="13" y="52" width="44" height="21" rx="2" fill="${stone[1]}" stroke="${stone[3]}" stroke-width="1"/><circle cx="35" cy="63" r="7.5" fill="${stone[0]}" ${T}/><circle cx="35" cy="63" r="4.6" fill="#7d6a3e"/>${candle(19, 64, 3)}${candle(51, 64, 3)}<rect x="4" y="4" width="62" height="46" rx="2" fill="#7a4a3e" ${O}/><rect x="5.2" y="5.2" width="59.6" height="21.8" fill="#fff" opacity=".12"/><rect x="5.2" y="27" width="59.6" height="21.8" fill="#000" opacity=".16"/><path d="M6 12 H64 M6 19 H64 M6 34 H64 M6 41 H64" stroke="${INK}" stroke-width="1" opacity=".35"/><path d="M18 5 V26 M34 5 V26 M50 5 V26 M26 28 V49 M42 28 V49 M58 28 V49" stroke="${INK}" stroke-width=".8" opacity=".25"/><path d="M4 27 H66" stroke="${INK}" stroke-width="4"/><path d="M4 27 H66" stroke="#96604e" stroke-width="2"/>`, 1.8),
    },
    trough: {
      cat: 'outdoor', label: tr('Tränke'), h: 8,
      make: (v, B) => svg(130, 50, `<rect x="3" y="3" width="124" height="44" rx="4" fill="${WD.dark}" ${O}/><rect x="10" y="10" width="110" height="30" rx="2" fill="${B.water[2]}" ${T}/><rect x="14" y="13" width="102" height="24" rx="2" fill="${B.water[3]}" opacity=".4"/><path d="M24 22 Q40 18 56 22 M70 30 Q86 34 104 29" fill="none" stroke="${B.foam}" stroke-width="1.3" stroke-linecap="round" opacity=".7"/><path d="M44 3 V10 M86 3 V10 M44 40 V47 M86 40 V47" stroke="${INK}" stroke-width="1"/>`, 1.8),
    },
    scarecrow: {
      cat: 'outdoor', label: tr('Vogelscheuche'), h: 24,
      make: (v) => {
        const c = ['#7a5a48', '#5f6a52', '#6a5a70'][v % 3];
        return svg(120, 64, `${rod('M8 32 H112', 3.4, WD.dark)}<path d="M18 22 Q40 16 60 22 Q82 16 102 22 L106 42 Q98 36 92 44 Q84 38 76 44 L60 40 L44 44 Q36 38 28 44 Q22 36 14 42Z" fill="${c}" ${O}/><path d="M36 24 Q38 34 34 42 M84 24 Q82 34 86 42" fill="none" stroke="#000" stroke-width="1" opacity=".3"/>${Array.from({ length: 5 }, (_, i) => `<path d="M${8 + i} ${28 + i * 2} l-6 ${-2 + i} M${112 - i} ${28 + i * 2} l6 ${-2 + i}" stroke="#c9ad5c" stroke-width="1.4" stroke-linecap="round"/>`).join('')}<circle cx="60" cy="32" r="19" fill="#b89a52" ${O}/><circle cx="60" cy="32" r="10" fill="#c9ad5c" ${T}/><path d="M44 30 Q60 22 76 32" fill="none" stroke="#8f7638" stroke-width="1.2"/><path d="M46 38 Q60 46 74 38" fill="none" stroke="#8f7638" stroke-width="1.2"/>`, 2);
      },
    },
    dummy: {
      cat: 'outdoor', label: tr('Übungspuppe'), h: 20,
      make: () => svg(90, 60, `${rod('M10 30 H80', 4, WD.dark)}<ellipse cx="45" cy="30" rx="19" ry="15" fill="#b5aa85" ${O}/><path d="M30 26 Q45 20 60 27 M31 36 Q45 41 59 35" fill="none" stroke="#8a8062" stroke-width="1.2"/><circle cx="45" cy="30" r="8.5" fill="#c4b98f" ${T}/><path d="M41 27 l8 6 M49 27 l-8 6" stroke="#8a3a34" stroke-width="1.6" stroke-linecap="round"/><circle cx="76" cy="30" r="11" fill="${WD.top}" ${O}/><circle cx="76" cy="30" r="5.4" fill="#8a3a34" ${T}/><circle cx="76" cy="30" r="2" fill="${iron[0]}"/>${rod('M12 30 L4 18', 2.6, WD.pale, 1)}`, 1.8),
    },
    barricade: {
      cat: 'outdoor', label: tr('Barrikade'), h: 14,
      make: (v) => {
        const r = mulberry(v + 19);
        let stakes = '';
        for (let x = 16; x <= 144; x += 16) {
          const a = (r() - 0.5) * 0.5;
          for (const sgn of [-1, 1]) {
            const tx = x + Math.sin(a) * 20 * sgn + sgn * 3;
            const ty = 28 - Math.cos(a) * 22 * sgn;
            stakes += `<path d="M${x} 28 L${f1(tx)} ${f1(ty)}" stroke="${INK}" stroke-width="7.4" stroke-linecap="round"/><path d="M${x} 28 L${f1(tx)} ${f1(ty)}" stroke="${sgn > 0 ? WD.pale : WD.mid}" stroke-width="4.6" stroke-linecap="round"/><circle cx="${f1(tx)}" cy="${f1(ty)}" r="1.6" fill="#d6c79a"/>`;
          }
        }
        return svg(160, 56, `${stakes}<rect x="4" y="21" width="152" height="14" rx="7" fill="${WD.dark}" ${O}/><path d="M12 26 H148" stroke="${WD.pale}" stroke-width="1" opacity=".5"/>`, 1.8);
      },
    },
    ballista: {
      cat: 'outdoor', label: tr('Balliste'), h: 16,
      make: () => svg(150, 150, `${rod('M40 132 L75 96 L110 132', 6, WD.dark, 1.5)}<rect x="64" y="20" width="22" height="116" rx="3" fill="${WD.mid}" ${O}/><path d="M75 24 V132" stroke="${WD.dark}" stroke-width="5"/>${rod('M10 62 Q40 38 75 44 Q110 38 140 62', 6, WD.top, 1.5)}${rod('M10 62 L75 104 L140 62', 1.4, rope, 0.8)}<rect x="56" y="36" width="38" height="16" rx="3" fill="${iron[1]}" ${O}/>${rod('M75 12 V100', 2.4, WD.pale, 1)}<path d="M75 4 L70 16 H80Z" fill="${iron[0]}" ${T}/><rect x="58" y="110" width="34" height="14" rx="4" fill="${WD.dark}" ${O}/>${rod('M52 117 H58 M92 117 H98', 3, iron[1])}`, 1.8),
    },
    wagon: {
      cat: 'outdoor', label: tr('Planwagen'), h: 26,
      make: (v) => {
        const c = ['#cfc6a4', '#b9b294', '#c4b48c'][v % 3];
        return svg(110, 210, `${rod('M55 150 V204', 4, WD.dark)}${rod('M34 196 H76', 3.4, WD.mid)}${[[6, 30], [92, 30], [6, 112], [92, 112]].map(([x, y]) => `<rect x="${x}" y="${y}" width="12" height="34" rx="4" fill="${WD.dark}" ${O}/><path d="M${x + 6} ${y + 3} V${y + 31}" stroke="${iron[1]}" stroke-width="2"/>`).join('')}<rect x="16" y="8" width="78" height="144" rx="4" fill="${WD.mid}" ${O}/><path d="M22 14 Q55 4 88 14 V140 Q55 150 22 140Z" fill="${c}" ${O}/>${[30, 56, 82, 108, 130].map((y) => `<path d="M22 ${y} Q55 ${y - 9} 88 ${y}" fill="none" stroke="#000" stroke-width="1.2" opacity=".25"/>`).join('')}<path d="M55 9 Q72 9 88 14 V140 Q72 144 55 145Z" fill="#000" opacity=".13"/><path d="M40 140 Q55 128 70 140" fill="#3a3226" ${T}/><rect x="28" y="152" width="54" height="10" rx="2" fill="${WD.top}" ${T}/>`, 2.2);
      },
    },
    banner: {
      // Von oben: der Kopf der Stange, das Tuch als schmales gewelltes Band und sein Schatten auf dem Boden
      cat: 'outdoor', label: tr('Banner'), h: 28,
      make: (v) => {
        const [c1, c2] = [['#8a3a34', '#c2a04a'], ['#3e5a7a', '#d9d3b8'], ['#4f6a4a', '#c2a04a'], ['#2e2a30', '#a8483a']][v % 4];
        const band = 'M12 12 Q26 5 40 12 T68 12 T90 10';
        return svg(100, 44, `<path d="M12 12 Q26 5 40 12 T68 12 T90 10 L99 24 Q88 27 77 26 T49 26 T21 26Z" fill="#2a1830" opacity=".2"/><path d="${band}" fill="none" stroke="${INK}" stroke-width="7.6" stroke-linecap="round"/><path d="${band}" fill="none" stroke="${c1}" stroke-width="5" stroke-linecap="round"/><path d="${band}" fill="none" stroke="${c2}" stroke-width="1.4" stroke-dasharray="7 5"/><circle cx="12" cy="12" r="5.2" fill="${WD.dark}" ${O}/><circle cx="12" cy="12" r="2.2" fill="${brass}" ${T}/>`, 1.4);
      },
    },

    // --- Natur ----------------------------------------------------------------------------------------------------------
    thornBush: {
      cat: 'nature', label: tr('Dornengestrüpp'), h: 6,
      make: (v) => {
        const r = mulberry(v + 23);
        let dark = '';
        let wood = '';
        let thorns = '';
        for (let i = 0; i < 9; i++) {
          let x = 60 + (r() - 0.5) * 30;
          let y = 50 + (r() - 0.5) * 26;
          let a = r() * 6.283;
          let d = `M${f1(x)} ${f1(y)}`;
          for (let k = 0; k < 5; k++) {
            a += (r() - 0.5) * 1.5;
            const nx = Math.max(8, Math.min(112, x + Math.cos(a) * 15));
            const ny = Math.max(8, Math.min(92, y + Math.sin(a) * 15));
            d += ` Q${f1((x + nx) / 2 + (r() - 0.5) * 12)} ${f1((y + ny) / 2 + (r() - 0.5) * 12)} ${f1(nx)} ${f1(ny)}`;
            const ta = a + (r() < 0.5 ? 1.3 : -1.3);
            thorns += `M${f1(nx)} ${f1(ny)} l${f1(Math.cos(ta) * 5)} ${f1(Math.sin(ta) * 5)}`;
            x = nx;
            y = ny;
          }
          dark += `<path d="${d}"/>`;
          wood += `<path d="${d}"/>`;
        }
        let leaves = '';
        for (let i = 0; i < 16; i++) {
          const lx = f1(14 + r() * 92);
          const ly = f1(12 + r() * 76);
          leaves += `<ellipse cx="${lx}" cy="${ly}" rx="4.4" ry="2.6" transform="rotate(${Math.round(r() * 180)} ${lx} ${ly})" fill="${['#5c6b3e', '#6f7a44', '#4a5a36'][i % 3]}" stroke="${INK}" stroke-width=".7"/>`;
        }
        return svgF(120, 100, `<radialGradient id="tb"><stop offset=".45" stop-color="#000" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><ellipse cx="62" cy="54" rx="56" ry="44" fill="url(#tb)"/><g fill="none" stroke="${INK}" stroke-width="4.6" stroke-linecap="round">${dark}</g><path d="${thorns}" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><g fill="none" stroke="#6b5a42" stroke-width="2.4" stroke-linecap="round">${wood}</g>${leaves}`, 1);
      },
    },
    fairyRing: {
      cat: 'nature', label: tr('Pilzkreis'), h: 0, layer: 'rug',
      make: (v) => {
        const r = mulberry(v + 29);
        const [cap, dot] = [['#a8483a', '#f2ead2'], ['#b08a5a', '#d9c9a0'], ['#8a6a9a', '#e6dcf0']][v % 3];
        let s = '';
        const n = 11 + (v % 4);
        for (let i = 0; i < n; i++) {
          if (r() < 0.12) continue;
          const a = (i / n) * 6.283 + (r() - 0.5) * 0.3;
          const rr = 46 + (r() - 0.5) * 10;
          const x = 60 + Math.cos(a) * rr;
          const y = 60 + Math.sin(a) * rr;
          const sz = 4.5 + r() * 4;
          s += `<ellipse cx="${f1(x + 1.6)}" cy="${f1(y + 2.2)}" rx="${f1(sz)}" ry="${f1(sz * 0.9)}" fill="#000" opacity=".2"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(sz)}" fill="${cap}" stroke="${INK}" stroke-width="1.2"/><circle cx="${f1(x - sz * 0.3)}" cy="${f1(y - sz * 0.25)}" r="${f1(sz * 0.2)}" fill="${dot}"/><circle cx="${f1(x + sz * 0.3)}" cy="${f1(y + sz * 0.1)}" r="${f1(sz * 0.16)}" fill="${dot}"/><circle cx="${f1(x - sz * 0.05)}" cy="${f1(y + sz * 0.45)}" r="${f1(sz * 0.14)}" fill="${dot}"/>`;
        }
        return svgF(120, 120, s, 0.8);
      },
    },
    steppingStones: {
      cat: 'nature', label: tr('Trittsteine'), h: 2, layer: 'rug',
      make: (v, B) => {
        const r = mulberry(v + 31);
        let s = '';
        for (let i = 0; i < 5; i++) {
          const x = 22 + i * 39 + (r() - 0.5) * 10;
          const y = 34 + (r() - 0.5) * 22;
          s += `<path d="${blob(v + i * 3, x + 1.5, y + 2.5, 17, 13, 8, 0.3)}" fill="${B.rock.side}" stroke="${INK}" stroke-width="1.8"/><path d="${blob(v + i * 3, x - 0.5, y - 0.5, 14, 10, 8, 0.3)}" fill="${B.rock.top}"/>`;
        }
        return svg(200, 68, s, 1.6);
      },
    },
    fern: {
      cat: 'nature', label: tr('Farn'), h: 3,
      make: (v, B) => {
        const r = mulberry(v + 37);
        const pal = B.trees[v % B.trees.length];
        let s = '';
        const n = 9 + (v % 3);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 6.283 + (r() - 0.5) * 0.5;
          const len = 17 + r() * 9;
          const bend = (r() - 0.5) * 0.9;
          const tip = [32 + Math.cos(a + bend) * len, 32 + Math.sin(a + bend) * len];
          const side = (sgn) => [32 + Math.cos(a + bend * 0.4 + sgn * 0.42) * len * 0.56, 32 + Math.sin(a + bend * 0.4 + sgn * 0.42) * len * 0.56];
          const l = side(-1);
          const q = side(1);
          s += `<path d="M32 32 Q${f1(l[0])} ${f1(l[1])} ${f1(tip[0])} ${f1(tip[1])} Q${f1(q[0])} ${f1(q[1])} 32 32Z" fill="${pal[1 + (i % 3)]}" stroke="${pal[0]}" stroke-width="1.2" stroke-linejoin="round"/><path d="M32 32 L${f1(tip[0])} ${f1(tip[1])}" stroke="${pal[0]}" stroke-width=".8" opacity=".4"/>`;
        }
        return svg(64, 64, s, 0);
      },
    },

    // --- Schiff und Hafen -------------------------------------------------------------------------------------------------
    cannon: {
      cat: 'ship', label: tr('Kanone'), h: 10,
      make: () => svg(60, 116, `<rect x="8" y="40" width="44" height="66" rx="3" fill="${WD.mid}" ${O}/>${grain(10, 42, 40, 62, 81, true)}${[[3, 48], [47, 48], [3, 84], [47, 84]].map(([x, y]) => `<rect x="${x}" y="${y}" width="10" height="16" rx="3" fill="${WD.dark}" ${T}/>`).join('')}<path d="M21 6 H39 L43 96 Q30 104 17 96Z" fill="${iron[2]}" ${O}/><path d="M24 10 L22 92" stroke="${iron[0]}" stroke-width="2" opacity=".6"/><path d="M20 28 H40 M19 62 H41" stroke="${INK}" stroke-width="1.2"/><rect x="19.5" y="4.6" width="21" height="5.4" rx="1.4" fill="${iron[1]}" ${T}/><circle cx="30" cy="100" r="5" fill="${iron[1]}" ${T}/>`, 1.6),
    },
    mast: {
      cat: 'ship', label: tr('Mast'), h: 40,
      make: () => svg(240, 70, `${rod('M120 35 L20 62 M120 35 L220 62 M120 35 L30 8 M120 35 L210 8', 1.2, rope, 0.7)}<rect x="6" y="28" width="228" height="14" rx="7" fill="${WD.mid}" ${O}/><path d="M12 33 H228" stroke="${WD.pale}" stroke-width="1" opacity=".6"/><path d="M10 40 Q64 52 118 42 Q176 52 230 40 L228 46 Q176 60 118 48 Q64 60 12 46Z" fill="#d6ceb0" ${T}/><circle cx="120" cy="35" r="20" fill="${WD.dark}" ${O}/><circle cx="120" cy="35" r="13" fill="${WD.top}" ${T}/><circle cx="120" cy="35" r="6" fill="none" stroke="${WD.line}" stroke-width="1"/><circle cx="120" cy="35" r="17" fill="none" stroke="${iron[1]}" stroke-width="2"/>`, 1.8),
    },
    anchor: {
      cat: 'ship', label: tr('Anker'), h: 4,
      make: () => svg(80, 110, `${rod('M40 18 V92', 5, iron[1], 1.6)}${rod('M12 66 Q14 96 40 98 Q66 96 68 66', 5, iron[1], 1.6)}<path d="M6 70 L14 56 L20 72Z M74 70 L66 56 L60 72Z" fill="${iron[1]}" ${T}/>${rod('M20 30 H60', 5, WD.dark, 1.6)}<circle cx="40" cy="12" r="7" fill="none" stroke="${INK}" stroke-width="6"/><circle cx="40" cy="12" r="7" fill="none" stroke="${iron[0]}" stroke-width="3"/>`, 1.4),
    },
    hatch: {
      cat: 'ship', label: tr('Ladeluke'), h: 0, layer: 'rug',
      make: () => svg(120, 120, `<rect x="4" y="4" width="112" height="112" rx="3" fill="${WD.dark}" ${O}/><radialGradient id="hg"><stop offset="0" stop-color="#2a2622"/><stop offset="1" stop-color="#3f3a34"/></radialGradient><rect x="12" y="12" width="96" height="96" fill="url(#hg)"/>${[24, 40, 56, 72, 88].map((p) => `<path d="M12 ${p + 4} H108" stroke="${INK}" stroke-width="7"/><path d="M12 ${p + 4} H108" stroke="${WD.mid}" stroke-width="4.6"/>`).join('')}${[24, 40, 56, 72, 88].map((p) => `<path d="M${p + 4} 12 V108" stroke="${INK}" stroke-width="7"/><path d="M${p + 4} 12 V108" stroke="${WD.top}" stroke-width="4.6"/>`).join('')}<rect x="12" y="12" width="96" height="96" fill="none" stroke="${INK}" stroke-width="1.6"/>`, 1.4),
    },
    bollard: {
      cat: 'ship', label: tr('Poller mit Tau'), h: 8,
      make: () => svg(96, 56, `${rod('M30 30 Q52 52 70 38 Q84 28 92 40', 4, rope, 1.3)}<circle cx="28" cy="28" r="19" fill="${rope}" ${O}/><circle cx="28" cy="28" r="14" fill="none" stroke="#7d7455" stroke-width="1.4"/><circle cx="28" cy="28" r="10" fill="${WD.dark}" ${O}/><circle cx="28" cy="28" r="5" fill="${WD.top}" ${T}/>`, 1.6),
    },
    net: {
      cat: 'ship', label: tr('Fischernetz'), h: 0, layer: 'rug',
      make: (v) => {
        let lines = '';
        for (let i = -6; i <= 12; i++) lines += `M${i * 12} 0 L${i * 12 + 80} 100 M${i * 12 + 80} 0 L${i * 12} 100`;
        return svgF(130, 100, `<clipPath id="nc"><path d="${blob(v + 7, 65, 50, 58, 42, 10, 0.34)}"/></clipPath><g clip-path="url(#nc)"><path d="${lines}" fill="none" stroke="#7d7455" stroke-width="1.3" opacity=".85"/></g><path d="${blob(v + 7, 65, 50, 58, 42, 10, 0.34)}" fill="none" stroke="${INK}" stroke-width="4.8"/><path d="${blob(v + 7, 65, 50, 58, 42, 10, 0.34)}" fill="none" stroke="#b9a77c" stroke-width="2.6"/>${[[22, 30], [100, 26], [108, 66], [34, 80]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.4" fill="#9a7a4a" ${T}/>`).join('')}`, 1.2);
      },
    },
  };
}
