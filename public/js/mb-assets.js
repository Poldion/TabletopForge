// Kartenbauer: Umgebungsstile (Farbwelten) und der Katalog der Gegenstände. Alle Gegenstände sind SVG-Zeichnungen
// im selben Stil: dunkle, leicht zittrige Konturen, entsättigtes Holz, harte Schattierung ohne Glanz.
import { mulberry } from './mb-geom.js';
import { moreAssets } from './mb-assets2.js';
import { drawnAssets } from './mb-assets3.js';
import { extraAssets } from './mb-assets4.js';
import { cityAssets } from './mb-assets5.js';
import { tr } from './i18n.js';

export const INK = '#2a1e10';
/** Lichtrichtung: alle Schatten fallen nach rechts unten. */
export const LIGHT = [0.6, 0.8];

const ROCK = { top: '#b6b893', side: '#8b8a6c', line: '#4a4736', plateau: '#b2b392', cell: '#c6c8a8' };
const TEAL = ['#1d6164', '#237376', '#2c8c90', '#3aa5a8'];
// Bäume: [Linie, dunkel, mittel, hell] – der helle Ton bleibt dunkler als der Boden.
export const BIOMES = {
  meadow: {
    label: tr('Wiese'),
    ground: ['#59a844', '#6aae44', '#76b444', '#8cb14d'], strokes: ['200,235,130', '35,95,45'], dots: ['#b9e39a', '#e8e07a', '#d8f0c0'],
    road: '#b9ae90', path: '#c5a967', pathEdge: '#b3a65e', dirt: '#bf9f62', sand: '#cbc198', sandShade: '#a89f7c', rock: ROCK,
    water: TEAL, foam: '#a0d4d3', shoreLine: '#1f3b36', shadow: '#b0a2b2',
    trees: [['#1f3a1c', '#36522e', '#4a7040', '#5a8a4c'], ['#2e3a1c', '#485731', '#66763f', '#808f56'], ['#1c3a2c', '#2f5540', '#3f7052', '#4f8a62']],
  },
  desert: {
    label: tr('Wüste'), tree: 'palm', strokeDir: 'flat', strokeAlpha: [0.16, 0.08], blades: false,
    ground: ['#d39c5c', '#dba96a', '#e2b376', '#e9c088'], strokes: ['250,225,170', '150,95,50'], dots: ['#f2dca8', '#c98f55'],
    road: '#d2b98c', path: '#c98f55', pathEdge: '#bd8850', dirt: '#c48a50', sand: '#ecd3a0', sandShade: '#c9a878',
    rock: { top: '#ce8f59', side: '#ad5d38', line: '#5a2e1c', plateau: '#c98a56', cell: '#d9a06a' },
    water: TEAL, foam: '#a0d4d3', shoreLine: '#3b2a1f', shadow: '#b09a9c',
    trees: [['#22301a', '#47692f', '#648a3d', '#82a44e'], ['#262e1a', '#516a31', '#708a41', '#8da253'], ['#30321c', '#5f6734', '#808745', '#9ba15a']],
  },
  tundra: {
    label: tr('Tundra'), tree: 'fir', strokeDir: 'flat', strokeAlpha: [0.4, 0.07], blades: false, dirtAlpha: 0.5,
    ground: ['#c4d2df', '#cddae6', '#d6e1ec', '#dee7f1'], strokes: ['255,255,255', '150,170,185'], dots: ['#ffffff', '#c9d6de'],
    road: '#b4b8b8', path: '#b9b3a4', pathEdge: '#aaa799', dirt: '#aab4ba', sand: '#c9cfd0', sandShade: '#a4acae',
    rock: { top: '#aeb6b6', side: '#7b8587', line: '#3d4648', plateau: '#a9b1b1', cell: '#c0c8c8' },
    water: ['#175a60', '#1f6f76', '#2f858a', '#46999c'], foam: '#c6e4e4', shoreLine: '#24383c', shadow: '#a2a4a6',
    trees: [['#1c211e', '#6d7f77', '#93a59d', '#c5d3cc'], ['#1c2420', '#667c70', '#8aa294', '#bcd0c4']],
  },
  magic: {
    label: tr('Magischer Wald'),
    ground: ['#256355', '#2f7460', '#3a8268', '#4c9474'], strokes: ['120,220,190', '14,40,50'], dots: ['#9ff5e0', '#c9a6ff', '#7fe0ff'],
    road: '#8f93a4', path: '#8c8fa0', pathEdge: '#7b8496', dirt: '#74788c', sand: '#8a98a8', sandShade: '#6c788a',
    rock: { top: '#8f9ab8', side: '#5d6784', line: '#2a3048', plateau: '#8791ae', cell: '#a0aac6' },
    water: ['#1a2a5a', '#24407a', '#3260a0', '#4a86c0'], foam: '#b6c8f0', shoreLine: '#141c38', shadow: '#9a98c0',
    trees: [['#0f2a33', '#1c5a5c', '#267a70', '#3f9f8c'], ['#1f1838', '#3a2a64', '#4f3a84', '#6c52a8'], ['#10302a', '#1f5a46', '#2c7a5c', '#44a078']],
  },
  shire: {
    label: tr('Auenland'),
    ground: ['#6aa83a', '#7cb640', '#8cc048', '#a6c850'], strokes: ['225,245,140', '50,110,40'], dots: ['#fff6d8', '#ffd34a', '#f2a7c0', '#ffffff'],
    road: '#bfb190', path: '#cdb074', pathEdge: '#bca968', dirt: '#c2a468', sand: '#d6caa0', sandShade: '#b3a880', rock: ROCK,
    water: ['#1f6a70', '#278084', '#32989c', '#48b4b4'], foam: '#b4e0dc', shoreLine: '#1f3b36', shadow: '#b29fb8',
    trees: [['#24401c', '#3d5e2c', '#567e3c', '#6c9a4a'], ['#33401c', '#546430', '#748840', '#92a652'], ['#38331f', '#665c3a', '#80744a', '#a2975c']],
  },
  town: {
    label: tr('Stadt'), strokeDir: 'any', strokeAlpha: [0.14, 0.08], strokeLen: [4, 9], pebbles: 0.34, blades: false,
    ground: ['#8a8672', '#96927c', '#a09c86', '#aaa690'], strokes: ['200,196,170', '70,66,52'], dots: ['#b8b49c', '#7c7864'],
    road: '#c2bca4', path: '#b0a888', pathEdge: '#9c957a', dirt: '#8f8468', sand: '#b8b094', sandShade: '#96907a',
    rock: { top: '#b0ae96', side: '#84826e', line: '#444236', plateau: '#a6a48c', cell: '#bcbaa2' },
    water: ['#1f5660', '#27686f', '#337c82', '#479498'], foam: '#a8cccc', shoreLine: '#1f3438', shadow: '#a8a0a8',
    trees: [['#1f3a1c', '#36522e', '#4a7040', '#5a8a4c'], ['#2e3a1c', '#485731', '#667a3e', '#81934b']],
  },
  dungeon: {
    label: tr('Dungeon'), solid: true, tree: 'shroom', strokeDir: 'any', strokeAlpha: [0.07, 0.1], strokeLen: [4, 8], cracks: 0.3, blades: false,
    ground: ['#373632', '#3e3c37', '#44413b', '#4b4740'], strokes: ['122,116,104', '29,27,24'], dots: ['#6f6a5e', '#857f70', '#272521', '#2c2a25'],
    road: '#99937e', path: '#8d8872', pathEdge: '#7c7764', dirt: '#6f6a58', sand: '#8c8874', sandShade: '#6a6756', cave: '#7d786a',
    rock: { top: '#8a887a', side: '#5e5c52', line: '#24231e', plateau: '#7e7c6e', cell: '#96947f' },
    water: ['#143c44', '#1a4c54', '#235e66', '#2f747a'], foam: '#8fc0c0', shoreLine: '#101c1e', shadow: '#9c99a2',
    trees: [['#2e2020', '#4f3530', '#69423c', '#7d4f49'], ['#22302c', '#3f5a50', '#56796c', '#6a9484'], ['#302a1c', '#5c5338', '#7a6e48', '#948659']],
  },
  cave: {
    label: tr('Höhle'), solid: true, tree: 'shroom', strokeDir: 'any', strokeAlpha: [0.07, 0.095], strokeLen: [4, 8], cracks: 0.3, blades: false,
    ground: ['#39322a', '#40382e', '#463e33', '#4d4538'], strokes: ['133,119,95', '31,26,21'], dots: ['#5e5444', '#7a6e58', '#27221c', '#2c261f'],
    road: '#a09478', path: '#9a8c6c', pathEdge: '#867a5e', dirt: '#74684e', sand: '#948a6e', sandShade: '#70684e', cave: '#857a62',
    rock: { top: '#93876c', side: '#75694f', line: '#20180f', plateau: '#857a62', cell: '#a3977c' },
    water: ['#123a40', '#184a50', '#215c62', '#2d7276'], foam: '#8fc0bc', shoreLine: '#0e1a1c', shadow: '#9390a0',
    trees: [['#2e2020', '#4f3530', '#69423c', '#7d4f49'], ['#22302c', '#3f5a50', '#56796c', '#6a9484'], ['#302a1c', '#5c5338', '#7a6e48', '#948659']],
  },
};
export const biomeOf = (scene) => BIOMES[scene?.biome] || BIOMES.meadow;

// --- Bausteine der Zeichnungen ----------------------------------------------------------------------------------------
const O = `stroke="${INK}" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"`;
const T = `stroke="${INK}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"`;
const WD = { top: '#977a54', mid: '#806743', dark: '#594930', line: '#6a5436', pale: '#a88c62', shade: '#7c6343' };
/** Sättigung aller Gegenstände (1 = unverändert): gedeckte Farben wirken weniger nach Spielzeug. */
const SAT = 0.86;
/**
 * SVG-Rahmen. Jede Zeichnung läuft durch einen Filter, der sie weniger flach und technisch wirken lässt:
 * wob > 0 verzieht sie leicht (wie von Hand statt mit Zirkel und Lineal), dazu feine Körnung und größere Tonflecken
 * (gemalt statt einfarbig gefüllt), zu den Rändern hin etwas dunkler (Körper statt Aufkleber), gedeckte Farben.
 * flat: ohne Randabdunklung – für Zeichnungen aus dünnen Linien (Spinnennetz, Risse), die sonst vergrauen würden.
 */
const svg = (w, h, body, wob = 2.6, flat = false) => {
  const seed = Math.round(w * 3 + h) % 89;
  const blur = Math.max(1.8, Math.min(5, Math.min(w, h) / 20)).toFixed(1);
  const gray = (k, o) => `${k} ${k} ${k} 0 ${o}  ${k} ${k} ${k} 0 ${o}  ${k} ${k} ${k} 0 ${o}  0 0 0 0 1`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><filter id="w" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">${
    wob ? `<feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${wob}" xChannelSelector="R" yChannelSelector="G" result="d"/>` : '<feOffset in="SourceGraphic" result="d"/>'
  }<feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="${seed + 5}" result="g"/><feColorMatrix in="g" type="matrix" values="${Math.min(w, h) > 110 ? gray(0.115, 0.822) : gray(0.17, 0.74)}" result="g1"/><feTurbulence type="fractalNoise" baseFrequency="0.055" numOctaves="2" seed="${seed + 11}" result="t"/><feColorMatrix in="t" type="matrix" values="${gray(0.15, 0.775)}" result="t1"/><feComposite in="d" in2="g1" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="m"/><feComposite in="m" in2="t1" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="m2"/>${
    flat ? '' : `<feColorMatrix in="d" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="a"/><feGaussianBlur in="a" stdDeviation="${blur}" result="b"/><feComposite in="a" in2="b" operator="out" result="rim"/><feComponentTransfer in="rim" result="rim2"><feFuncA type="linear" slope="0.42"/></feComponentTransfer><feMerge result="m2"><feMergeNode in="m2"/><feMergeNode in="rim2"/></feMerge>`
  }<feColorMatrix in="m2" type="saturate" values="${SAT}"/></filter><g filter="url(#w)">${body}</g></svg>`;
};
/** Wie svg, ohne Randabdunklung. */
const svgF = (w, h, body, wob = 2.6) => svg(w, h, body, wob, true);
const f1 = (v) => v.toFixed(1);
/** Krug von oben: Rand, dunkler Inhalt und ein Henkel. */
const mug = (x, y) => `<path d="M${x + 3.6} ${y - 2.2} q5 2.2 0 4.6" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M${x + 3.6} ${y - 2.2} q5 2.2 0 4.6" fill="none" stroke="#a8a288" stroke-width="1.2" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="4.5" fill="#b9b39a" ${T}/><circle cx="${x}" cy="${y}" r="2.8" fill="#8a6a34"/><path d="M${x - 1.8} ${y - 1} q1.6 -1.4 3 -0.4" fill="none" stroke="#d9c690" stroke-width=".9"/>`;
/** Teller mit Rand; darauf je nach Platz Brot, ein Stück Fleisch mit Knochen oder nur Krümel. */
const plate = (x, y) => {
  const k = Math.abs(Math.round(x * 7 + y * 3)) % 3;
  const food = k === 0 ? `<path d="M${x - 4} ${y + 1} q0 -5 4 -5 q5 0 4 5 q-4 3 -8 0Z" fill="#b08f5c" ${T}/><path d="M${x - 2} ${y - 1} l1.6 2.4 M${x + 1} ${y - 2} l1.6 2.4" stroke="#7d6238" stroke-width=".8"/>` : k === 1 ? `<path d="M${x - 3} ${y - 2} q5 -3 6 2 q-2 4 -6 2Z" fill="#8a5a48" ${T}/><path d="M${x + 2} ${y + 1} l3.4 2.6" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M${x + 2} ${y + 1} l3.4 2.6" stroke="#d9d3b8" stroke-width="1.1" stroke-linecap="round"/>` : `<path d="M${x - 3.6} ${y - 0.6} q1.4 -3.6 4.6 -2.6 q3.6 0.6 2.4 3.6 q-1.6 3.6 -4.8 2.6 q-3 -0.6 -2.2 -3.6Z" fill="#b5683e" stroke="#7d4226" stroke-width=".7"/><path d="M${x - 1.4} ${y - 0.8} q1.6 -1 2.8 0.2" fill="none" stroke="#d99a66" stroke-width=".8" stroke-linecap="round"/>`;
  return `<circle cx="${x}" cy="${y}" r="8" fill="#bdbaa4" ${T}/><circle cx="${x}" cy="${y}" r="5.8" fill="#d0cdb8" stroke="#9a977f" stroke-width=".8"/>${food}`;
};
const candle = (x, y) => `<circle cx="${x}" cy="${y}" r="3.6" fill="#d9d3b8" ${T}/><circle cx="${x}" cy="${y}" r="1.6" fill="#e8922e"/>`;
const bottle = (x, y, c = '#4f6a4a') => `<circle cx="${x}" cy="${y}" r="4.6" fill="${c}" ${T}/>`;
/** Runde Fläche mit harter Schattensichel rechts unten; inner = Zeichnung auf der Oberseite (z. B. Brettfugen). */
const disc = (cx, cy, r, top, shade, inner = '', id = 'c') => `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><circle cx="${cx}" cy="${cy}" r="${r}" fill="${shade}"/><g clip-path="url(#${id})"><circle cx="${cx - r * 0.07}" cy="${cy - r * 0.1}" r="${r}" fill="${top}"/>${inner}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" ${O}/>`;
/** Brettfugen einer runden Platte, leicht krumm, um ang Grad gedreht. */
const planks = (c, r, ang, ks = [-0.62, -0.3, 0.02, 0.34, 0.66]) => `<g transform="rotate(${ang} ${c} ${c})">${ks.map((k, i) => `<path d="M${f1(c + k * r)} ${c - r} Q${f1(c + k * r + (i % 2 ? 2 : -2))} ${c} ${f1(c + k * r)} ${c + r}" fill="none" stroke="${WD.line}" stroke-width="1"/>`).join('')}</g>`;
/** Holzmaserung in einem Rechteck: kurze, leicht gewellte Linien längs der Bretter und ab und zu ein Astloch. */
function grain(x, y, w, h, seed, vertical = false) {
  const r = mulberry(seed + 31);
  let d = '';
  let knots = '';
  for (let i = 0, n = Math.max(4, Math.round((w * h) / 520)); i < n; i++) {
    const px = x + 3 + r() * (w - 6);
    const py = y + 3 + r() * (h - 6);
    const len = 10 + r() * 26;
    d += vertical ? `M${f1(px)} ${f1(py)} q${f1((r() - 0.5) * 3)} ${f1(len / 2)} ${f1((r() - 0.5) * 2)} ${f1(Math.min(len, y + h - 2 - py))}` : `M${f1(px)} ${f1(py)} q${f1(len / 2)} ${f1((r() - 0.5) * 3)} ${f1(Math.min(len, x + w - 2 - px))} ${f1((r() - 0.5) * 2)}`;
    if (r() < 0.12) knots += `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="${vertical ? 1.5 : 2.4}" ry="${vertical ? 2.4 : 1.5}" fill="${WD.dark}" opacity=".55"/>`;
  }
  return `<path d="${d}" fill="none" stroke="${WD.line}" stroke-width=".8" stroke-linecap="round" opacity=".5"/>${knots}`;
}
/** Geschlossene, glatte Kurve durch Punkte als SVG-Pfad. */
function smoothPath(pts) {
  const n = pts.length;
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d + 'Z';
}

const tableRound = (d, ang) => {
  const c = d / 2;
  return svg(d, d, `${disc(c, c, c - 3, WD.top, WD.shade, planks(c, c - 3, ang))}${mug(c - 22, c + 14)}${mug(c + 24, c - 8)}${plate(c + 8, c + 24)}${candle(c - 2, c - 6)}`);
};
const bed = (blanket) => svg(90, 156, `<rect x="3" y="3" width="84" height="150" rx="4" fill="#6f5838" ${O}/><rect x="3" y="3" width="84" height="9" rx="3" fill="${WD.dark}" ${T}/><rect x="9" y="12" width="72" height="136" rx="3" fill="#d6d0b6" ${T}/>
  <rect x="17" y="18" width="56" height="30" rx="8" fill="#e3ddc4" ${T}/><path d="M26 32 Q44 38 62 30 M30 24 Q40 27 52 23" fill="none" stroke="#a8a288" stroke-width="1"/>
  <path d="M9 62 Q22 55 36 61 T60 59 T81 63 V144 Q81 148 77 148 H13 Q9 148 9 144Z" fill="${blanket}" ${T}/>
  <path d="M9 62 Q22 55 36 61 T60 59 T81 63 V72 Q60 66 36 71 T9 72Z" fill="#fff" opacity=".12"/>
  <path d="M60 59 L81 63 L80 82 Q70 70 60 59Z" fill="#d6d0b6" ${T}/>
  <path d="M22 80 Q30 104 20 140 M46 76 Q54 106 44 146 M66 86 Q72 112 64 144" fill="none" stroke="#000" stroke-width="7" opacity=".07"/>
  <path d="M22 80 Q30 104 20 140 M46 76 Q54 106 44 146 M66 86 Q72 112 64 144" fill="none" stroke="#000" stroke-width="1" opacity=".3"/>
  <path d="M10 126 Q45 132 80 125 M10 133 Q45 139 80 132" fill="none" stroke="#d6d0b6" stroke-width="1.6" opacity=".45"/>`);
const rug = (w, h, c) => svg(w, h, `<path d="M5 7 V${h - 7} M${w - 5} 7 V${h - 7}" stroke="#c9bf9a" stroke-width="8" stroke-dasharray="1.6 3.4"/><rect x="9" y="4" width="${w - 18}" height="${h - 8}" rx="2" fill="${c}" ${O}/><path d="M17 ${h - 14} ${Array.from({ length: Math.floor((w - 34) / 8) }, (_, i) => `l4 ${i % 2 ? 5 : -5} l4 ${i % 2 ? -5 : 5}`).join(' ')} M17 14 ${Array.from({ length: Math.floor((w - 34) / 8) }, (_, i) => `l4 ${i % 2 ? -5 : 5} l4 ${i % 2 ? 5 : -5}`).join(' ')}" fill="none" stroke="#c9bf9a" stroke-width="1.4" opacity=".55"/><rect x="15" y="9" width="${w - 30}" height="${h - 18}" fill="none" stroke="#000" stroke-width="1" opacity=".25"/><path d="M${w / 2} 22 L${w - 34} ${h / 2} L${w / 2} ${h - 22} L34 ${h / 2}Z" fill="#000" fill-opacity=".1" stroke="#c9bf9a" stroke-width="1.6" stroke-opacity=".55"/>`, 3.2);
const rugRound = (d, c1, c2) => {
  const c = d / 2;
  return svg(d, d, `<circle cx="${c}" cy="${c}" r="${c - 4}" fill="none" stroke="#c9b98f" stroke-width="6" stroke-dasharray="1.6 3.6"/><circle cx="${c}" cy="${c}" r="${c - 7}" fill="${c1}" ${O}/><circle cx="${c}" cy="${c}" r="${c - 14}" fill="none" stroke="#b98f5a" stroke-width="3" stroke-dasharray="7 5" opacity=".55"/><circle cx="${c}" cy="${c}" r="${c - 24}" fill="${c2}" stroke="#000" stroke-opacity=".3" stroke-width="1.5"/><circle cx="${c}" cy="${c}" r="${c * 0.42}" fill="none" stroke="#b98f5a" stroke-width="2" opacity=".45"/>`, 3.4);
};
/** Findling: rundlicher Klumpen, Flanke dunkler, Oberseite zum Licht versetzt, dazu Facettenlinie und Riss. */
function rock(seed, w, B) {
  const r = mulberry(seed);
  const c = w / 2;
  const n = 8 + Math.floor(r() * 4);
  const outer = [];
  const top = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + (r() - 0.5) * 0.4;
    const d = c * (0.66 + r() * 0.24);
    outer.push([c + Math.cos(a) * d, c + Math.sin(a) * d * 0.86]);
    const k = 0.62 + r() * 0.12;
    top.push([c - w * 0.06 + Math.cos(a) * d * k, c - w * 0.08 + Math.sin(a) * d * 0.86 * k]);
  }
  const i0 = Math.floor(r() * n);
  const crack = `M${f1(top[i0][0])} ${f1(top[i0][1])} L${f1((top[i0][0] + outer[i0][0]) / 2 + 3)} ${f1((top[i0][1] + outer[i0][1]) / 2)} L${f1(outer[i0][0])} ${f1(outer[i0][1])}`;
  const lw = Math.max(2.2, w / 45);
  return svg(w, w, `<path d="${smoothPath(outer)}" fill="${B.rock.side}" stroke="${INK}" stroke-width="${f1(lw)}" stroke-linejoin="round"/><path d="${smoothPath(top)}" fill="${B.rock.top}" stroke="${B.rock.line}" stroke-width="1" stroke-dasharray="${f1(w * 0.5)} ${f1(w * 0.12)} ${f1(w * 0.3)} ${f1(w * 0.2)}"/><path d="${crack}" fill="none" stroke="${B.rock.line}" stroke-width="1"/>`, 2);
}
/**
 * Baumkrone von oben: unregelmäßiger Umriss aus kleinen Blattbuckeln mit spitzen Kerben, drei harte Tonflächen
 * (hell zum Licht, dunkle Sichel auf der Schattenseite) und offene, gekerbte Bogenlinien als Laubstufen.
 */
export function canopy(d, seed, pal, kind = 'leaf') {
  if (kind === 'palm') return palm(d, seed, pal);
  if (kind === 'fir') return fir(d, seed, pal);
  if (kind === 'shroom') return shroom(d, seed, pal);
  const r = mulberry(seed);
  const c = d / 2;
  const R0 = d * 0.4;
  const sx = 1 + (r() - 0.5) * 0.18;
  const k1 = 2 + Math.floor(r() * 3);
  const k2 = 5 + Math.floor(r() * 3);
  const p1 = r() * 6.283;
  const p2 = r() * 6.283;
  const bump = Math.max(5, d * 0.05);
  const rad = (a) => R0 * (1 + 0.07 * Math.sin(k1 * a + p1) + 0.045 * Math.sin(k2 * a + p2));
  // gekerbter Bogen von a0 bis a1 um (cx, cy); geschlossen, wenn der Bogen einen vollen Kreis umfasst
  const scal = (cx, cy, rf, a0, a1, b) => {
    const pts = [];
    const closed = a1 - a0 > 6.28;
    for (let a = a0, i = 0; a < a1 - (closed ? (b * 0.5) / rf(a) : 0); i++) {
      const rr = rf(a) * (i % 3 === 2 || r() < 0.18 ? 0.95 - r() * 0.05 : 1 - r() * 0.02);
      pts.push([cx + Math.cos(a) * rr * sx, cy + Math.sin(a) * rr, a]);
      a += (b * (0.6 + r() * 0.9)) / rf(a);
    }
    if (closed) pts.push([pts[0][0], pts[0][1], pts[0][2] + 6.283]);
    let s = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    for (let j = 1; j < pts.length; j++) {
      const p = pts[j - 1];
      const q = pts[j];
      const am = (p[2] + q[2]) / 2 + (r() - 0.5) * 0.06;
      const h = Math.hypot(q[0] - p[0], q[1] - p[1]) * (0.5 + r() * 0.35);
      s += `Q${f1((p[0] + q[0]) / 2 + Math.cos(am) * h * sx)} ${f1((p[1] + q[1]) / 2 + Math.sin(am) * h)} ${f1(q[0])} ${f1(q[1])}`;
    }
    return closed ? s + 'Z' : s;
  };
  const off = r() * 6.283;
  const out = scal(c, c, rad, off, off + 6.2832, bump);
  const lit = scal(c - d * 0.055, c - d * 0.075, (a) => rad(a) * 0.98, off + 1, off + 7.2832, bump * 1.25);
  const p3 = r() * 6.283;
  const hi = scal(c - d * 0.1, c - d * 0.12, (a) => R0 * 0.52 * (1 + 0.14 * Math.sin(3 * a + p3)), 0, 6.2832, bump * 1.1);
  const hi2 = scal(c + (r() - 0.6) * R0 * 0.8, c + (r() - 0.35) * R0 * 0.8, () => R0 * 0.2, 0, 6.2832, bump * 0.9);
  const p4 = r() * 6.283;
  const deep = scal(c + d * 0.13, c + d * 0.16, (a) => R0 * 0.5 * (1 + 0.16 * Math.sin(3 * a + p4)), 0, 6.2832, bump * 1.2);
  let tufts = '';
  for (let i = 0, n = 26 + Math.floor(r() * 14); i < n; i++) {
    const a = r() * 6.283;
    const k = 0.25 + 0.68 * Math.sqrt(r());
    const x = c + Math.cos(a) * R0 * k * sx;
    const y = c + Math.sin(a) * R0 * k;
    const l = bump * (0.7 + r() * 0.9);
    const t = a + 1.5708 + (r() - 0.5) * 0.9;
    tufts += `M${f1(x - (Math.cos(t) * l) / 2)} ${f1(y - (Math.sin(t) * l) / 2)}q${f1((Math.cos(t) * l) / 2 + Math.cos(a) * l * 0.45)} ${f1((Math.sin(t) * l) / 2 + Math.sin(a) * l * 0.45)} ${f1(Math.cos(t) * l)} ${f1(Math.sin(t) * l)}`;
  }
  let tiers = '';
  const away = Math.atan2(LIGHT[1], LIGHT[0]);
  for (let i = 0, n = 4 + Math.floor(r() * 3); i < n; i++) {
    const tr2 = R0 * (0.24 + r() * 0.44);
    const mid = away + (r() - 0.5) * 2.6;
    const span = 1.5 + r() * 1.9;
    tiers += `<path d="${scal(c + (r() - 0.5) * R0 * 0.7, c + (r() - 0.5) * R0 * 0.7, () => tr2, mid - span / 2, mid + span / 2, bump)}"/>`;
  }
  return svg(d, d, `<clipPath id="k"><path d="${out}"/></clipPath><path d="${out}" fill="${pal[1]}"/><g clip-path="url(#k)"><path d="${lit}" fill="${pal[2]}"/><path d="${deep}" fill="${pal[0]}" opacity=".3"/><path d="${hi}" fill="${pal[3]}"/><path d="${hi2}" fill="${pal[3]}" opacity=".7"/><path d="${tufts}" fill="none" stroke="${pal[0]}" stroke-width="1" stroke-linecap="round" opacity=".5"/><g fill="none" stroke="${pal[0]}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" opacity=".85">${tiers}</g></g><path d="${out}" fill="none" stroke="${pal[0]}" stroke-width="2.3" stroke-linejoin="round"/>`, 0);
}

/** Palme von oben: Wedel, die strahlenförmig aus der Mitte wachsen – unten dunklere, oben hellere. */
function palm(d, seed, pal) {
  const r = mulberry(seed);
  const c = d / 2;
  const R0 = d * 0.48;
  // Wedel entlang einer gebogenen Mittelrippe: glatter Umriss, beiderseits viele feine Einschnitte (Fiedern), helle Rippe
  const frond = (a, len, w, fill) => {
    const bend = (r() < 0.5 ? -1 : 1) * (0.3 + r() * 0.3);
    const at = (t) => {
      const ang = a + bend * t * t;
      return [c + Math.cos(ang) * len * t, c + Math.sin(ang) * len * t, ang];
    };
    const width = (t) => w * Math.sin(Math.PI * Math.pow(t, 0.6));
    const edge = (sgn, t) => {
      const [x, y, ang] = at(t);
      return [x + Math.cos(ang + sgn * 1.5708) * width(t), y + Math.sin(ang + sgn * 1.5708) * width(t)];
    };
    const n = 9;
    const left = Array.from({ length: n }, (_, i) => edge(-1, (i + 1) / (n + 1)));
    const right = Array.from({ length: n }, (_, i) => edge(1, (i + 1) / (n + 1))).reverse();
    const tip = at(1);
    let cuts = '';
    for (const sgn of [-1, 1]) {
      for (let i = 2; i <= 16; i++) {
        const t = i / 17.5;
        const [ex, ey] = edge(sgn, t);
        const [rx, ry] = at(Math.max(0.02, t - 0.07));
        cuts += `M${f1(ex)} ${f1(ey)} L${f1(ex + (rx - ex) * 0.7)} ${f1(ey + (ry - ey) * 0.7)}`;
      }
    }
    const mid = at(0.5);
    const rib = `M${f1(c)} ${f1(c)} Q${f1(mid[0] - Math.cos(mid[2] + 1.5708) * bend * len * 0.12)} ${f1(mid[1] - Math.sin(mid[2] + 1.5708) * bend * len * 0.12)} ${f1(tip[0])} ${f1(tip[1])}`;
    return `<path d="M${f1(c)} ${f1(c)} ${[...left, [tip[0], tip[1]], ...right].map(([x, y]) => `L${f1(x)} ${f1(y)}`).join(' ')}Z" fill="${fill}" stroke="${pal[0]}" stroke-width="1.5" stroke-linejoin="round"/><path d="${cuts}" fill="none" stroke="${pal[0]}" stroke-width="1" stroke-linecap="round" opacity=".5"/><path d="${rib}" fill="none" stroke="${shadeHex(pal[3], 0.25)}" stroke-width="1.5" stroke-linecap="round" opacity=".85"/>`;
  };
  let s = '';
  for (const [n, len, fill] of [[7 + Math.floor(r() * 3), 1, pal[1]], [5 + Math.floor(r() * 2), 0.6, pal[2]]]) {
    const off = r() * 6.283;
    for (let i = 0; i < n; i++) s += frond(off + (i / n) * 6.283 + (r() - 0.5) * 0.42, R0 * len * (0.78 + r() * 0.22), d * 0.062 * (0.85 + r() * 0.3), fill);
  }
  // Stammscheibe mit ein paar Kokosnüssen
  let nuts = '';
  for (let i = 0, n = 2 + Math.floor(r() * 2); i < n; i++) {
    const a = r() * 6.283;
    nuts += `<circle cx="${f1(c + Math.cos(a) * d * 0.04)}" cy="${f1(c + Math.sin(a) * d * 0.04)}" r="${f1(d * 0.014)}" fill="#5a4630" stroke="${pal[0]}" stroke-width="1"/>`;
  }
  return svg(d, d, `${s}<circle cx="${c}" cy="${c}" r="${f1(d * 0.032)}" fill="#6b5236" stroke="${pal[0]}" stroke-width="1.4"/>${nuts}`, 0);
}
/** Nadelbaum von oben: gestapelte Astkränze, im Umriss zu Büscheln gruppiert, mit kurzen, leicht gebogenen Zacken. */
function fir(d, seed, pal) {
  const r = mulberry(seed);
  const c = d / 2;
  const R0 = d * 0.46;
  const whorl = (cx, cy, rad, n, fill, lw) => {
    const off = r() * 6.283;
    // Astbüschel: fünf, sechs Wellen um den Kranz, dazu jede Zacke etwas anders
    const k1 = 5 + Math.floor(r() * 2);
    const p1 = r() * 6.283;
    const shape = (a) => 1 - 0.12 * (1 + Math.sin(k1 * a + p1));
    let p = '';
    let veins = '';
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = off + ((i + (r() - 0.5) * 0.5) / n) * 6.283;
      pts.push([a, rad * shape(a) * (0.9 + r() * 0.1)]);
    }
    pts.forEach(([a, len], i) => {
      const [a2, len2] = pts[(i + 1) % n];
      const an = i === n - 1 ? a2 + 6.283 : a2;
      const am = (a + an) / 2;
      // Kerbe zwischen zwei Zacken: ein gutes Viertel des Radius tief
      const notch = Math.min(len, len2) * (0.7 + r() * 0.06);
      const tipX = cx + Math.cos(a) * len;
      const tipY = cy + Math.sin(a) * len;
      const nx = cx + Math.cos(am) * notch;
      const ny = cy + Math.sin(am) * notch;
      const nextX = cx + Math.cos(an) * len2;
      const nextY = cy + Math.sin(an) * len2;
      // leicht gebogene Flanken: Stützpunkt etwas nach außen gewölbt
      const q1 = [cx + Math.cos(a + (am - a) * 0.45) * (len * 0.93), cy + Math.sin(a + (am - a) * 0.45) * (len * 0.93)];
      const q2 = [cx + Math.cos(am + (an - am) * 0.55) * (len2 * 0.93), cy + Math.sin(am + (an - am) * 0.55) * (len2 * 0.93)];
      p += `${i ? '' : `M${f1(tipX)} ${f1(tipY)}`}Q${f1(q1[0])} ${f1(q1[1])} ${f1(nx)} ${f1(ny)}Q${f1(q2[0])} ${f1(q2[1])} ${f1(nextX)} ${f1(nextY)}`;
      veins += `M${f1(cx + Math.cos(a) * len * 0.2)} ${f1(cy + Math.sin(a) * len * 0.2)} L${f1(cx + Math.cos(a) * len * 0.86)} ${f1(cy + Math.sin(a) * len * 0.86)}`;
    });
    return `<path d="${p}Z" fill="${fill}" stroke="${pal[0]}" stroke-width="${lw}" stroke-linejoin="round"/><path d="${veins}" stroke="${pal[0]}" stroke-width="1" opacity=".28"/>`;
  };
  const n = 15 + Math.floor(r() * 5);
  const ox = (r() - 0.5) * d * 0.06 - d * 0.02;
  const oy = (r() - 0.5) * d * 0.06 - d * 0.03;
  return svg(d, d, `${whorl(c, c, R0, n, pal[1], 2)}${whorl(c + ox * 0.45, c + oy * 0.45, R0 * 0.68, n - 3, pal[2], 1.4)}${whorl(c + ox * 0.8, c + oy * 0.8, R0 * 0.4, n - 6, pal[3], 1.2)}<circle cx="${f1(c + ox)}" cy="${f1(c + oy)}" r="${f1(d * 0.02)}" fill="${pal[0]}" opacity=".55"/>`, 0);
}
/** Farbton aufhellen (k > 0) oder abdunkeln. */
const shadeHex = (hex, k) => `rgb(${[1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 + k)))))})`;
/**
 * Riesenpilz von oben (Höhlen und Dungeons): unrunder, gewellter Hut, zur Mitte dunkler, mit unregelmäßigen Warzen
 * im Ton des Huts und kurzen Lamellenstrichen nur am Rand – matt, ohne Glanzlicht.
 */
function shroom(d, seed, pal) {
  const r = mulberry(seed);
  const c = d / 2;
  const R0 = d * 0.42;
  const ph = r() * 6.283;
  const ringPath = (k, jit) => smoothPath(Array.from({ length: 13 }, (_, i) => {
    const a = (i / 13) * 6.283;
    const q = k * (1 + 0.07 * Math.sin(3 * a + ph) + (r() - 0.5) * jit);
    return [c + Math.cos(a) * R0 * q, c + Math.sin(a) * R0 * q];
  }));
  const cap = ringPath(1, 0.1);
  let warts = '';
  for (let i = 0, n = 6 + Math.floor(r() * 5); i < n; i++) {
    const a = r() * 6.283;
    const k = 0.15 + r() * 0.6;
    const x = c + Math.cos(a) * R0 * k;
    const y = c + Math.sin(a) * R0 * k;
    const s0 = d * (0.022 + r() * 0.03);
    warts += `<path d="${smoothPath(Array.from({ length: 6 }, (_, j) => [x + Math.cos(j * 1.047) * s0 * (0.7 + r() * 0.6), y + Math.sin(j * 1.047) * s0 * (0.6 + r() * 0.5)]))}" fill="${shadeHex(pal[3], 0.16)}" stroke="${pal[0]}" stroke-width=".7" stroke-opacity=".5"/>`;
  }
  let gills = '';
  for (let i = 0, n = 16 + Math.floor(r() * 10); i < n; i++) {
    const a = r() * 6.283;
    const k0 = 0.78 + r() * 0.1;
    gills += `M${f1(c + Math.cos(a) * R0 * k0)} ${f1(c + Math.sin(a) * R0 * k0)} L${f1(c + Math.cos(a) * R0 * 0.99)} ${f1(c + Math.sin(a) * R0 * 0.99)}`;
  }
  return svg(d, d, `<clipPath id="k"><path d="${cap}"/></clipPath><path d="${cap}" fill="${pal[1]}"/><g clip-path="url(#k)"><path d="${ringPath(0.97, 0.06)}" fill="${pal[2]}" transform="translate(${f1(-d * 0.03)} ${f1(-d * 0.04)})"/><path d="${ringPath(0.7, 0.12)}" fill="${pal[3]}" transform="translate(${f1(-d * 0.04)} ${f1(-d * 0.05)})"/><path d="${ringPath(0.36, 0.2)}" fill="${pal[2]}"/><path d="${ringPath(0.14, 0.3)}" fill="${pal[1]}"/>${warts}<path d="${gills}" stroke="${pal[0]}" stroke-width="1" opacity=".45"/></g><path d="${cap}" fill="none" stroke="${pal[0]}" stroke-width="2" stroke-linejoin="round"/>`, 0);
}

const BLANKETS = ['#90373c', '#4e575c', '#5a6a4a', '#7a6a4a'];
const RUGS = ['#5a6a70', '#7a6a4a', '#90373c', '#4f6a4a'];
const SHELF = ['#4f6a4a', '#7a4038', '#4e5a66', '#a8904e', '#6a5670', '#b9b39a'];

/**
 * Katalog. Je Eintrag: Gruppe, Name, Schattenlänge h (Höhe des Gegenstands, bei 70 px je Feld), Ebene
 * (rug = liegt flach unter den Schatten, top = Baumkrone über allem) und make(v, B, px) → SVG.
 * v = Variante/Zufallswert des einzelnen Gegenstands, px = gewünschte Größe (nur bei frei skalierten Formen).
 */
export const CATALOG = {
  tableRound: { cat: 'furniture', label: tr('Runder Tisch'), h: 13, make: (v) => tableRound(100, v % 170) },
  tableBig: { cat: 'furniture', label: tr('Großer runder Tisch'), h: 13, make: (v) => tableRound(130, v % 170) },
  longTable: {
    cat: 'furniture', label: tr('Langer Tisch'), h: 13,
    make: () => svg(216, 82, `<rect x="3" y="3" width="210" height="76" rx="3" fill="${WD.top}" ${O}/><path d="M5 22 Q110 24 211 21 M5 41 Q110 39 211 42 M5 60 Q110 62 211 59 M70 5 V22 M140 22 V41 M96 41 V60 M160 60 V77" fill="none" stroke="${WD.line}" stroke-width="1"/><path d="M5 76 H211 M211 5 V77" stroke="${WD.shade}" stroke-width="3" opacity=".8"/>${grain(5, 5, 206, 72, 3)}
      ${plate(40, 24)}${plate(110, 58)}${plate(176, 26)}${mug(70, 56)}${mug(146, 22)}${candle(108, 34)}${mug(186, 58)}`),
  },
  bench: { cat: 'furniture', label: tr('Bank'), h: 7, make: () => svg(216, 28, `<rect x="3" y="3" width="210" height="22" rx="3" fill="${WD.mid}" ${O}/><path d="M6 14 Q110 16 210 13" fill="none" stroke="${WD.line}" stroke-width="1"/>${grain(5, 5, 206, 18, 5)}`) },
  stool: { cat: 'furniture', label: tr('Hocker'), h: 7, make: (v) => svg(34, 34, disc(17, 17, 13, WD.mid, '#685236', planks(17, 13, v % 170, [-0.35, 0.35])), 1.8) },
  chair: { cat: 'furniture', label: tr('Stuhl'), h: 8, make: () => svg(40, 40, `<rect x="6" y="10" width="28" height="25" rx="5" fill="${WD.mid}" ${O}/><rect x="4" y="4" width="32" height="9" rx="3" fill="${WD.dark}" ${O}/><path d="M12 22 H28" stroke="${WD.line}" stroke-width="1"/>`) },
  bar: {
    cat: 'furniture', label: tr('Tresen'), h: 15,
    make: () => {
      const w = 300;
      return svg(w, 66, `<rect x="3" y="3" width="${w - 6}" height="60" rx="3" fill="${WD.dark}" ${O}/><rect x="8" y="8" width="${w - 16}" height="42" rx="2" fill="${WD.top}" stroke="${WD.line}" stroke-width="1.4"/>
        <path d="M8 22 Q${w / 2} 24 ${w - 8} 21 M8 36 Q${w / 2} 34 ${w - 8} 37 M${w * 0.3} 8 V22 M${w * 0.62} 22 V36 M${w * 0.45} 36 V50" fill="none" stroke="${WD.line}" stroke-width="1"/>
        ${grain(10, 10, w - 20, 38, 7)}${mug(40, 28)}${mug(w - 60, 24)}${bottle(90, 30)}${bottle(104, 22, '#7a4038')}${plate(w / 2, 28)}${bottle(w - 110, 34, '#4e5a66')}${candle(w - 26, 30)}`);
    },
  },
  shelf: {
    cat: 'furniture', label: tr('Regal'), h: 16,
    make: (v) => {
      const w = 150;
      let s = `<rect x="3" y="3" width="${w - 6}" height="32" rx="2" fill="${WD.dark}" ${O}/><path d="M6 19 H${w - 6}" stroke="#463924" stroke-width="1"/>`;
      for (let x = 14, i = v % 6; x < w - 12; x += 15, i++) s += i % 4 === 3 ? `<rect x="${x - 6}" y="10" width="11" height="18" fill="${SHELF[i % 6]}" ${T}/>` : bottle(x, 19 + ((i * 7) % 5) - 2, SHELF[i % 6]);
      return svg(w, 38, s);
    },
  },
  bed: { cat: 'furniture', label: tr('Bett'), h: 9, make: (v) => bed(BLANKETS[v % BLANKETS.length]) },
  chest: { cat: 'furniture', label: tr('Truhe'), h: 10, make: () => svg(66, 46, `<rect x="3" y="3" width="60" height="40" rx="4" fill="#7a6040" ${O}/><path d="M3 17 H63" stroke="${INK}" stroke-width="1.4"/><rect x="12" y="3" width="8" height="40" fill="#77745f" ${T}/><rect x="46" y="3" width="8" height="40" fill="#77745f" ${T}/><rect x="28" y="13" width="10" height="9" rx="2" fill="#b0a060" ${T}/>`) },
  fireplace: {
    cat: 'furniture', label: tr('Kamin'), h: 16, light: { bright: 15, dim: 20, color: '#ff9a4a', flicker: true },
    make: () => svg(160, 70, `<rect x="3" y="3" width="154" height="64" rx="4" fill="#aaa78c" ${O}/><path d="M3 24 H157 M40 3 V24 M84 3 V24 M124 3 V24 M22 24 V67 M138 24 V67 M3 46 H22 M138 44 H157" stroke="#5f5c4a" stroke-width="1.3"/>
      <rect x="28" y="22" width="104" height="45" fill="#2a2420" ${T}/><rect x="42" y="46" width="76" height="12" rx="6" fill="${WD.dark}" ${T}/><rect x="52" y="36" width="58" height="11" rx="5" fill="${WD.mid}" ${T}/>
      <path d="M58 52 Q52 34 68 28 Q66 40 78 30 Q82 20 90 30 Q100 28 98 42 Q110 40 104 54Z" fill="#e8922e" stroke="#a8501e" stroke-width="1.3"/><path d="M70 50 Q68 40 78 38 Q84 32 88 42 Q96 44 92 52Z" fill="#f2c24a"/>`),
  },
  stove: {
    cat: 'furniture', label: tr('Herd'), h: 15,
    make: () => svg(116, 80, `<rect x="3" y="3" width="110" height="74" rx="3" fill="#908d7c" ${O}/><path d="M3 22 H113 M3 58 H113 M30 3 V22 M70 3 V22 M96 22 V58 M18 22 V58 M44 58 V77 M84 58 V77" stroke="#5f5c4a" stroke-width="1.2"/>
      <rect x="22" y="14" width="72" height="52" rx="3" fill="#3d3b36" ${T}/><circle cx="42" cy="40" r="15" fill="#1c1a16" ${T}/><circle cx="42" cy="40" r="10" fill="#b8501e"/><circle cx="41" cy="39" r="6" fill="#e8922e"/><circle cx="40" cy="38" r="2.6" fill="#f2c24a"/><path d="M33 40 H51 M42 31 V49" stroke="#1c1a16" stroke-width="2.4"/>
      <rect x="57" y="36" width="8" height="8" rx="2" fill="#4a4842" ${T}/><rect x="93" y="36" width="8" height="8" rx="2" fill="#4a4842" ${T}/><circle cx="79" cy="40" r="16" fill="#34312d" ${T}/><circle cx="79" cy="40" r="12" fill="#6e5236" stroke="#1c1a16" stroke-width="1"/><path d="M72 37 Q79 33 86 38" fill="none" stroke="#a88660" stroke-width="1.4" stroke-linecap="round" opacity=".8"/><circle cx="75" cy="43" r="1.8" fill="#a88660"/><circle cx="83" cy="44" r="1.4" fill="#8a9a5a"/>
      <path d="M84 34 L104 14" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/><path d="M84 34 L104 14" stroke="${WD.pale}" stroke-width="2.4" stroke-linecap="round"/>`),
  },
  kitchenTable: {
    cat: 'furniture', label: tr('Küchentisch'), h: 13,
    make: () => svg(150, 80, `<rect x="3" y="3" width="144" height="74" rx="3" fill="#a08660" ${O}/><path d="M5 27 Q75 29 145 26 M5 52 Q75 50 145 53 M60 5 V27 M100 27 V52 M40 52 V75" fill="none" stroke="${WD.line}" stroke-width="1"/>
      <ellipse cx="40" cy="40" rx="24" ry="16" fill="${WD.mid}" ${T}/><circle cx="34" cy="38" r="6" fill="#a5484a" ${T}/><circle cx="46" cy="42" r="6" fill="#b99a4a" ${T}/><circle cx="40" cy="32" r="5" fill="#6f8a4a" ${T}/>
      <rect x="84" y="20" width="44" height="30" rx="3" fill="#c2ad7c" ${T}/><path d="M92 26 L120 44" stroke="#8b8a80" stroke-width="3.4" stroke-linecap="round"/>${plate(110, 62)}`),
  },
  rugRound: { cat: 'furniture', label: tr('Runder Teppich'), h: 0, layer: 'rug', make: (v) => rugRound(250, ['#90373c', '#4e5a66', '#5a6a4a'][v % 3], ['#a5484a', '#5f6c7a', '#6c7e58'][v % 3]) },
  rug: { cat: 'furniture', label: tr('Teppich'), h: 0, layer: 'rug', make: (v) => rug(170, 110, RUGS[v % RUGS.length]) },
  barrel: { cat: 'goods', label: tr('Fass'), h: 15, make: (v) => svg(58, 58, `<circle cx="29" cy="29" r="26" fill="#6b5a40" ${O}/><circle cx="29" cy="29" r="22.5" fill="none" stroke="#55544a" stroke-width="2.5"/>${disc(29, 29, 19, '#8a7049', '#6f5a3b', planks(29, 19, v % 170, [-0.5, 0, 0.5]))}`) },
  crate: { cat: 'goods', label: tr('Kiste'), h: 13, make: () => svg(60, 60, `<rect x="3" y="3" width="54" height="54" rx="2" fill="#77633f" ${O}/><rect x="11" y="11" width="38" height="38" fill="#86704c" stroke="${WD.line}" stroke-width="1.4"/><path d="M11 11 L49 49 M49 11 L11 49" stroke="${WD.dark}" stroke-width="3.2"/><path d="M3 20 H11 M3 40 H11 M49 20 H57 M49 40 H57" stroke="${WD.line}" stroke-width="1"/>`) },
  sack: { cat: 'goods', label: tr('Sack'), h: 7, make: () => svg(52, 46, `<path d="M8 24 Q6 8 24 7 Q44 5 46 22 Q48 40 28 41 Q9 42 8 24Z" fill="#b5aa85" ${O}/><path d="M22 12 Q28 16 34 11" fill="none" stroke="#7d7455" stroke-width="1.4"/><path d="M14 27 Q24 32 38 26" fill="none" stroke="#978d6a" stroke-width="1.2"/><path d="M30 41 Q40 38 45 27" fill="none" stroke="#8a8062" stroke-width="3" opacity=".5"/>`) },
  logs: { cat: 'goods', label: tr('Holzstapel'), h: 8, make: () => svg(110, 62, `<rect x="3" y="4" width="104" height="18" rx="9" fill="${WD.mid}" ${O}/><rect x="8" y="22" width="98" height="18" rx="9" fill="#8a7049" ${O}/><rect x="3" y="40" width="102" height="18" rx="9" fill="${WD.dark}" ${O}/><circle cx="12" cy="13" r="5" fill="#c2ad7c" ${T}/><circle cx="17" cy="31" r="5" fill="#c2ad7c" ${T}/><circle cx="12" cy="49" r="5" fill="#c2ad7c" ${T}/><path d="M30 13 H90 M36 31 H96 M28 49 H88" stroke="${WD.line}" stroke-width="1" opacity=".7"/>`) },
  well: {
    cat: 'outdoor', label: tr('Brunnen'), h: 13,
    make: (v, B) => {
      let s = `<circle cx="60" cy="60" r="56" fill="${B.rock.top}" ${O}/><circle cx="60" cy="60" r="38" fill="${B.water[2]}" ${T}/><path d="M34 74 A30 30 0 0 0 86 78" fill="none" stroke="${B.water[0]}" stroke-width="9" opacity=".5"/>`;
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * 6.283 + 0.2;
        s += `<path d="M${f1(60 + Math.cos(a) * 39)} ${f1(60 + Math.sin(a) * 39)} L${f1(60 + Math.cos(a) * 55)} ${f1(60 + Math.sin(a) * 55)}" stroke="${B.rock.line}" stroke-width="1.3"/>`;
      }
      s += `<rect x="4" y="54" width="112" height="12" rx="3" fill="${WD.dark}" ${O}/><circle cx="60" cy="60" r="9" fill="${WD.mid}" ${O}/>`;
      return svg(120, 120, s, 3.2);
    },
  },
  campfire: {
    cat: 'outdoor', label: tr('Lagerfeuer'), h: 4, light: { bright: 20, dim: 20, color: '#ff9a4a', flicker: true },
    make: (v, B) => {
      let s = '';
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * 6.283;
        s += `<ellipse cx="${f1(40 + Math.cos(a) * 28)}" cy="${f1(40 + Math.sin(a) * 28)}" rx="8" ry="6.5" transform="rotate(${Math.round((a * 180) / Math.PI)} ${f1(40 + Math.cos(a) * 28)} ${f1(40 + Math.sin(a) * 28)})" fill="${i % 2 ? B.rock.top : B.rock.side}" ${T}/>`;
      }
      return svg(80, 80, `<circle cx="40" cy="40" r="22" fill="#2a2420"/>${s}<rect x="22" y="36" width="36" height="8" rx="4" fill="${WD.dark}" ${T} transform="rotate(28 40 40)"/><rect x="22" y="36" width="36" height="8" rx="4" fill="${WD.mid}" ${T} transform="rotate(-34 40 40)"/><path d="M32 46 Q28 34 38 30 Q37 38 44 32 Q47 26 51 33 Q56 34 53 46Z" fill="#e8922e" stroke="#a8501e" stroke-width="1.2"/><path d="M38 45 Q37 39 42 38 Q45 35 47 41 Q50 43 48 46Z" fill="#f2c24a"/>`, 2.2);
    },
  },
  boat: { cat: 'outdoor', label: tr('Ruderboot'), h: 5, make: () => svg(70, 150, `<path d="M35 4 Q64 40 60 100 Q58 138 35 146 Q12 138 10 100 Q6 40 35 4Z" fill="${WD.dark}" ${O}/><path d="M35 16 Q54 46 51 98 Q49 128 35 134 Q21 128 19 98 Q16 46 35 16Z" fill="${WD.top}" ${T}/><path d="M35 18 V132" stroke="${WD.line}" stroke-width="1"/><rect x="18" y="58" width="34" height="10" fill="${WD.mid}" ${T}/><rect x="19" y="98" width="32" height="10" fill="${WD.mid}" ${T}/><path d="M4 60 L66 110" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M4 60 L66 110" stroke="#a88c62" stroke-width="2.6" stroke-linecap="round"/>`) },
  cart: {
    cat: 'outdoor', label: tr('Karren'), h: 12,
    make: () => svg(120, 190, `<path d="M52 150 V186 M68 150 V186" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M52 150 V186 M68 150 V186" stroke="${WD.mid}" stroke-width="3.4" stroke-linecap="round"/><rect x="4" y="52" width="14" height="52" rx="5" fill="#4a4034" ${O}/><rect x="102" y="52" width="14" height="52" rx="5" fill="#4a4034" ${O}/><rect x="18" y="8" width="84" height="144" rx="3" fill="${WD.top}" ${O}/><path d="M39 10 V150 M60 10 V150 M81 10 V150" stroke="${WD.line}" stroke-width="1"/><rect x="18" y="8" width="84" height="10" fill="${WD.dark}" ${T}/><rect x="18" y="142" width="84" height="10" fill="${WD.dark}" ${T}/>`),
  },
  tableSquare: { cat: 'furniture', label: tr('Eckiger Tisch'), h: 13, make: () => svg(96, 96, `<rect x="3" y="3" width="90" height="90" rx="3" fill="${WD.top}" ${O}/><path d="M5 25 Q48 27 91 24 M5 48 Q48 46 91 49 M5 71 Q48 73 91 70 M40 5 V25 M62 25 V48 M30 48 V71 M70 71 V91" fill="none" stroke="${WD.line}" stroke-width="1"/><path d="M5 90 H91 M91 5 V91" stroke="${WD.shade}" stroke-width="3" opacity=".8"/>${grain(5, 5, 86, 86, 9)}${plate(30, 36)}${mug(66, 60)}${candle(52, 40)}`) },
  bookshelf: {
    cat: 'furniture', label: tr('Bücherregal'), h: 18,
    make: (v) => {
      const r = mulberry(v + 17);
      const cols = ['#6f4a44', '#565c62', '#5c6652', '#9a8a5c', '#655a6a', '#7d6a4c', '#4a4e44'];
      let s = `<rect x="3" y="3" width="144" height="36" rx="2" fill="${WD.dark}" ${O}/><rect x="7" y="7" width="136" height="28" fill="#4a3a27"/><path d="M7 30.5 H143" stroke="#2f2518" stroke-width="1" opacity=".6"/>`;
      for (let x = 8.5; x < 132; ) {
        const w = 4.5 + r() * 5.5;
        const q = r();
        if (q < 0.1) {
          // Lücke mit Schriftrolle
          s += `<rect x="${f1(x + 1)}" y="13" width="13" height="7" rx="3.5" fill="#d6d0b6" ${T}/><circle cx="${f1(x + 2.5)}" cy="16.5" r="1.4" fill="#a8a288"/>`;
          x += 16;
          continue;
        }
        if (q < 0.2) {
          // liegender Stapel: man sieht den Deckel des obersten Buchs
          const col = cols[Math.floor(r() * cols.length)];
          s += `<rect x="${f1(x + 0.8)}" y="9" width="15" height="19.5" rx="1" fill="${col}" stroke="${INK}" stroke-width=".9" transform="rotate(${f1((r() - 0.5) * 12)} ${f1(x + 8)} 19)"/><path d="M${f1(x + 4)} 14 h8 M${f1(x + 4)} 17 h6" stroke="#c9b98f" stroke-width=".8" opacity=".6"/>`;
          x += 17.5;
          continue;
        }
        // stehendes Buch von oben: schmaler Rücken hinten, vorn der helle Schnitt der Seiten
        const depth = 19.5 + (r() < 0.25 ? -2.5 : 0);
        s += `<rect x="${f1(x)}" y="8.5" width="${f1(w)}" height="${f1(depth)}" fill="${cols[Math.floor(r() * cols.length)]}" stroke="${INK}" stroke-width=".9"/><rect x="${f1(x + 0.9)}" y="${f1(8.5 + depth - 3.2)}" width="${f1(w - 1.8)}" height="2.2" fill="#d9d3b8"/>`;
        x += w + 0.5;
      }
      return svg(150, 42, s);
    },
  },
  wardrobe: { cat: 'furniture', label: tr('Schrank'), h: 20, make: () => svg(120, 56, `<rect x="3" y="3" width="114" height="50" rx="3" fill="${WD.mid}" ${O}/><rect x="8" y="8" width="104" height="40" rx="2" fill="${WD.top}" stroke="${WD.line}" stroke-width="1.2"/>${grain(10, 10, 100, 36, 13)}<path d="M60 8 V48" stroke="${INK}" stroke-width="1.4"/><circle cx="54" cy="28" r="2.4" fill="#b0a060" ${T}/><circle cx="66" cy="28" r="2.4" fill="#b0a060" ${T}/>`) },
  desk: { cat: 'furniture', label: tr('Schreibtisch'), h: 13, make: () => svg(140, 76, `<rect x="3" y="3" width="134" height="70" rx="3" fill="${WD.top}" ${O}/><path d="M5 26 Q70 28 135 25 M5 50 Q70 48 135 51" fill="none" stroke="${WD.line}" stroke-width="1"/>${grain(5, 5, 130, 66, 11)}<rect x="20" y="16" width="42" height="30" rx="1" fill="#d9d3b8" ${T} transform="rotate(-6 41 31)"/><path d="M27 26 H55 M27 32 H52 M27 38 H48" stroke="#8a8468" stroke-width="1" transform="rotate(-6 41 31)"/><rect x="78" y="20" width="34" height="24" rx="2" fill="#7a4038" ${T} transform="rotate(8 95 32)"/><circle cx="120" cy="56" r="6" fill="#34312d" ${T}/><path d="M118 52 L104 34" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M118 52 L104 34" stroke="#d9d3b8" stroke-width="1.2" stroke-linecap="round"/>${candle(22, 60)}`) },
  cauldron: { cat: 'furniture', label: tr('Kessel'), h: 12, make: () => svg(70, 70, `${disc(35, 35, 30, '#4a4944', '#34332f')}<circle cx="35" cy="35" r="22" fill="#5c7a4a" ${T}/><path d="M22 30 Q30 24 40 28 M30 42 Q40 46 48 38" fill="none" stroke="#8fae6a" stroke-width="2" stroke-linecap="round" opacity=".8"/><circle cx="26" cy="38" r="2.4" fill="#8fae6a"/><circle cx="44" cy="30" r="1.8" fill="#8fae6a"/>`, 2) },
  anvil: { cat: 'furniture', label: tr('Amboss'), h: 12, make: () => svg(90, 60, `<rect x="24" y="14" width="42" height="34" rx="3" fill="${WD.dark}" ${O}/><path d="M14 18 H62 Q78 18 86 30 Q78 42 62 42 H14 Q8 42 8 36 V24 Q8 18 14 18Z" fill="#6c6b64" ${O}/><path d="M16 23 H60 Q72 23 78 30" fill="none" stroke="#9a998f" stroke-width="2.4" stroke-linecap="round" opacity=".8"/><rect x="18" y="33" width="8" height="5" fill="#34332f"/>`) },
  torch: {
    cat: 'furniture', label: tr('Feuerschale'), h: 10, light: { bright: 20, dim: 20, color: '#ff9a4a', flicker: true },
    make: () => svg(54, 54, `${disc(27, 27, 22, '#5a5850', '#3e3d38')}<circle cx="27" cy="27" r="15" fill="#2a2420" ${T}/><path d="M18 31 Q15 20 24 17 Q23 24 29 19 Q32 14 35 21 Q40 22 38 32Z" fill="#e8922e" stroke="#a8501e" stroke-width="1.2"/><path d="M24 31 Q23 25 28 24 Q31 21 33 27 Q35 29 34 32Z" fill="#f2c24a"/>`, 2),
  },
  lantern: {
    cat: 'furniture', label: tr('Laterne'), h: 6, light: { bright: 15, dim: 15, color: '#ffd9a0' },
    make: () => svg(34, 34, `<rect x="6" y="6" width="22" height="22" rx="4" fill="#4a4944" ${O}/><rect x="10" y="10" width="14" height="14" rx="2" fill="#f2c24a" ${T}/><circle cx="17" cy="17" r="3" fill="#fff3c4"/>`, 1.6),
  },
  hay: { cat: 'goods', label: tr('Heuballen'), h: 12, make: () => svg(84, 60, `<rect x="3" y="3" width="78" height="54" rx="8" fill="#c9ad5c" ${O}/><path d="M8 16 Q40 12 76 17 M8 30 Q42 34 76 29 M8 44 Q40 40 76 45 M20 6 Q18 30 22 54 M44 5 Q46 30 42 55 M64 6 Q62 30 66 54" fill="none" stroke="#a08440" stroke-width="1.1"/><path d="M28 3 V57 M56 3 V57" stroke="#7a6436" stroke-width="2.6"/>`) },
  stall: {
    cat: 'outdoor', label: tr('Marktstand'), h: 18,
    make: (v) => {
      const c1 = ['#a5484a', '#5e6f78', '#6d7d52'][v % 3];
      let s = `<rect x="3" y="3" width="174" height="104" rx="3" fill="#d9d3b8" ${O}/>`;
      for (let x = 3; x < 177; x += 29) s += `<rect x="${x}" y="3" width="14.5" height="104" fill="${c1}"/>`;
      return svg(180, 110, `${s}<rect x="3" y="3" width="174" height="104" rx="3" fill="none" ${O}/><path d="M3 92 H177" stroke="${INK}" stroke-width="1.4"/><path d="M3 55 H177" stroke="#000" stroke-width="10" opacity=".08"/>`);
    },
  },
  fence: { cat: 'outdoor', label: tr('Zaun'), h: 6, make: () => svg(214, 22, `<rect x="8" y="7.5" width="198" height="7" rx="2" fill="${WD.mid}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>${[10, 58, 107, 156, 204].map((x) => `<circle cx="${x}" cy="11" r="7" fill="${WD.top}" ${O}/><circle cx="${x}" cy="11" r="3" fill="none" stroke="${WD.line}" stroke-width="1"/>`).join('')}`, 1.6) },
  bridge: { cat: 'outdoor', label: tr('Holzbrücke'), h: 0, layer: 'rug', make: () => svg(120, 284, `${Array.from({ length: 18 }, (_, i) => `<rect x="${10 + (i % 3)}" y="${6 + i * 15.2}" width="${100 - (i % 2) * 3}" height="13.6" rx="1.5" fill="${[WD.top, WD.mid, '#8a7049', '#8f7650'][i % 4]}" ${T}/>`).join('')}<rect x="3" y="3" width="9" height="278" rx="3" fill="${WD.dark}" ${O}/><rect x="108" y="3" width="9" height="278" rx="3" fill="${WD.dark}" ${O}/>`) },
  pier: { cat: 'outdoor', label: tr('Steg'), h: 6, make: () => svg(94, 160, `${Array.from({ length: 10 }, (_, i) => `<rect x="${10 + (i % 3)}" y="${6 + i * 15}" width="${74 - (i % 2) * 3}" height="13.4" rx="1.5" fill="${[WD.top, WD.mid, '#8a7049', '#8f7650'][i % 4]}" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"/>`).join('')}${[[9, 10], [85, 10], [9, 84], [85, 84]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="#96784c" ${O}/><circle cx="${x}" cy="${y}" r="3.4" fill="none" stroke="${WD.line}" stroke-width="1"/>`).join('')}`) },
  statue: { cat: 'outdoor', label: tr('Statue'), h: 22, make: (v, B) => svg(84, 84, `<rect x="6" y="6" width="72" height="72" rx="4" fill="${B.rock.side}" ${O}/><rect x="14" y="14" width="56" height="56" rx="3" fill="${B.rock.top}" stroke="${B.rock.line}" stroke-width="1.2"/><ellipse cx="42" cy="46" rx="15" ry="11" fill="${B.rock.side}" ${T}/><circle cx="42" cy="34" r="8" fill="${B.rock.top}" ${T}/><path d="M28 44 L16 36 M56 44 L68 36" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M28 44 L16 36 M56 44 L68 36" stroke="${B.rock.top}" stroke-width="2.6" stroke-linecap="round"/>`, 2.2) },
  stairs: { cat: 'outdoor', label: tr('Treppe'), h: 0, layer: 'rug', make: (v, B) => svg(100, 140, `<rect x="3" y="3" width="94" height="134" rx="2" fill="${B.rock.side}" ${O}/>${Array.from({ length: 7 }, (_, i) => `<rect x="6" y="${6 + i * 18.6}" width="88" height="16" rx="1.5" fill="${B.rock.top}" stroke="${B.rock.line}" stroke-width="1" opacity="${(1 - i * 0.07).toFixed(2)}"/>`).join('')}`, 2) },
  signpost: { cat: 'outdoor', label: tr('Wegweiser'), h: 14, make: () => svg(80, 44, `<path d="M8 12 H58 L72 22 L58 32 H8Z" fill="${WD.top}" ${O}/><path d="M14 19 H50 M14 25 H44" stroke="${WD.line}" stroke-width="1.2"/><circle cx="24" cy="22" r="6" fill="#96784c" ${O}/>`) },
  tree: { cat: 'nature', label: tr('Baum'), size: 200, layer: 'top', make: (v, B, px) => canopy(px, v, B.trees[v % B.trees.length], B.tree) },
  bush: { cat: 'nature', label: tr('Busch'), size: 90, make: (v, B, px) => canopy(px, v, B.trees[(v + B.trees.length - 1) % B.trees.length], B.tree === 'shroom' ? 'shroom' : 'leaf') },
  rock: { cat: 'nature', label: tr('Fels'), size: 90, make: (v, B, px) => rock(v, px, B) },
};
{
  const tools = { svg, svgF, O, T, WD, disc, planks, grain, smoothPath, f1, INK, LIGHT, mulberry };
  Object.assign(CATALOG, moreAssets(tools), drawnAssets(tools), extraAssets(tools), cityAssets(tools));
}
export const CATEGORIES = { furniture: tr('Möbel'), goods: tr('Vorräte'), dungeon: tr('Dungeon'), building: tr('Gebäude'), outdoor: tr('Draußen'), nature: tr('Natur'), ship: tr('Schiff & Hafen') };

// --- Bilder -----------------------------------------------------------------------------------------------------------
const cache = new Map(); // SVG-Text → { img, ready, promise }
export const dataUrl = (s) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
function entry(s) {
  let e = cache.get(s);
  if (!e) {
    const img = new Image();
    e = { img, ready: false };
    e.promise = new Promise((res) => {
      img.onload = () => {
        // Einmal in ein Pixelbild umwandeln: SVG bei jedem Zeichnen neu zu rastern wäre beim Verschieben zu langsam
        const cv = document.createElement('canvas');
        cv.width = img.width;
        cv.height = img.height;
        cv.getContext('2d').drawImage(img, 0, 0);
        e.img = cv;
        e.ready = true;
        res(cv);
      };
      img.onerror = () => res(null);
    });
    img.src = dataUrl(s);
    cache.set(s, e);
    if (cache.size > 4000) cache.delete(cache.keys().next().value);
  }
  return e;
}
/** Gegenstände aus hellem Stein: unter der Erde (Dungeon, Höhle) gedämpft wie Mauern und Böden dort. */
const STONE = new Set(['sarcophagus', 'pillar', 'pillarBroken', 'altar', 'rubble', 'menhir', 'throne', 'fountain', 'well', 'statue', 'stalagmite', 'boulders', 'rock', 'urns', 'runestone', 'portal', 'steppingStones']);
/** Zahl der verschiedenen Formen je Größe bei Bäumen, Büschen und Felsen. */
export const SHAPES = 18;
const svgCache = new Map(); // Schlüssel → SVG-Text (das Erzeugen einer Baumkrone kostet etwas)

/**
 * Bild eines Gegenstands der Szene: { img (null, solange es lädt), promise, w, h (Zeichengröße in Karten-Pixeln),
 * shadow (Schattenlänge), layer }. cs = Pixel je Feld / 70.
 */
export function sprite(o, B, cs) {
  const def = CATALOG[o.t];
  if (!def) return null;
  const s = (o.s || 1) * cs;
  // Frei skalierte Formen (Baum, Busch, Fels) werden in Zielgröße gezeichnet – so bleiben die Linien gleich stark
  // (Riesenpilze in Höhle und Dungeon fallen kleiner aus als Bäume)
  const px = def.size ? Math.max(24, Math.round((def.size * s * (o.t === 'tree' && B.tree === 'shroom' ? 0.6 : 1)) / 6) * 6) : 0;
  // Dächer und Türme haben eine Licht- und eine Schattenseite: je Drehung (in 15°-Schritten) eigens gezeichnet
  const rot = def.lit ? (((Math.round((o.rot || 0) / 15) * 15) % 360) + 360) % 360 : 0;
  const dim = B.solid && STONE.has(o.t);
  // Bäume, Büsche und Felsen gibt es in einer festen Zahl von Formen – ein Wald aus tausend Bäumen bräuchte sonst
  // tausend verschiedene Bilder
  const v = def.size ? (o.v | 0) % SHAPES : o.v | 0;
  const key = `${o.t}|${v}|${px}|${rot}|${def.make.length > 1 ? B.label : ''}|${dim ? 'd' : ''}`;
  let text = svgCache.get(key);
  if (!text) {
    text = def.make(v, B, px, rot);
    if (dim) text = text.replace(`type="saturate" values="${SAT}"/>`, `type="saturate" values="${SAT}" result="s"/><feComponentTransfer in="s"><feFuncR type="linear" slope=".86"/><feFuncG type="linear" slope=".86"/><feFuncB type="linear" slope=".86"/></feComponentTransfer>`);
    svgCache.set(key, text);
    if (svgCache.size > 3000) svgCache.delete(svgCache.keys().next().value);
  }
  const e = entry(text);
  const m = /width="([\d.]+)" height="([\d.]+)"/.exec(text);
  const k = def.size ? 1 : s;
  return {
    img: e.ready ? e.img : null,
    promise: e.promise,
    w: Number(m[1]) * k,
    h: Number(m[2]) * k,
    shadow: def.size ? px * (o.t === 'tree' ? 0.17 : o.t === 'bush' ? 0.12 : 0.2) : (def.h || 0) * s,
    layer: def.layer || 'obj',
  };
}
/** Vorschaubild für die Palette. */
export const previewUrl = (t, B) => dataUrl(CATALOG[t].make(7, B, CATALOG[t].size ? (t === 'tree' ? 120 : 84) : 0));
