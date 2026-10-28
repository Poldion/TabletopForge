// Porträt-Generator für NSCs: stilisierte Brustbilder als SVG, passend zu Volk, Geschlecht, Alter und Rolle.
// Eigene Zeichnung (keine fremden Bilder) – wird als PNG in die Kampagne hochgeladen und dient als Token-Bild.
import { tr } from './i18n.js';

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

const SKIN = {
  common: ['#f6d5b8', '#eec1a0', '#e0ac85', '#c98d66', '#a86b48', '#8a5236', '#6b3e27', '#4e2d1c'],
  elf: ['#f7e4d4', '#efd2bc', '#e2bb9b', '#c9956f', '#9c6b4c', '#d9cfe0'],
  halforc: ['#9db08a', '#8aa27a', '#7c9070', '#a3a39a', '#8f9a8a', '#b0a48a'],
  tiefling: ['#c0504d', '#a83f5c', '#8e3b6e', '#6f4a8e', '#b5654a', '#d7a98e'],
  dragonborn: ['#b3392f', '#2f6fb3', '#3a8f4a', '#b38b2f', '#7a7a80', '#c9c9cf', '#3b3b44', '#b06a2a'],
};
const HAIR = ['#1c1714', '#3b2a1e', '#5a3b24', '#8a5a33', '#b07a3e', '#d8b56b', '#e8d9a8', '#9a3b1f', '#c4552b'];
const HAIR_OLD = ['#bdbdbd', '#d9d9d9', '#9e9e9e', '#eeeeee'];
const EYES = ['#3b6ea5', '#4f8a4f', '#7a5230', '#5a4636', '#8a8a99', '#2e8b8b'];

/** Kleidung je Werte-Vorlage (Rolle). */
const OUTFIT_BY_TEMPLATE = {
  commoner: ['tunic', 'tunic', 'apron', 'bandana'],
  acolyte: ['robe'],
  priest: ['robe'],
  cultist: ['cultist'],
  guard: ['armor'],
  veteran: ['armor', 'leather'],
  knight: ['armor'],
  gladiator: ['armor', 'fur'],
  noble: ['noble'],
  mage: ['mage', 'robe'],
  druid: ['druid'],
  scout: ['hood', 'leather'],
  spy: ['hood', 'leather', 'noble'],
  assassin: ['hood'],
  bandit: ['hood', 'leather', 'bandana'],
  'bandit-captain': ['leather', 'hood'],
  thug: ['leather', 'tunic'],
  berserker: ['fur'],
};
const CLOTH = ['#7a3b2e', '#2e4a7a', '#3e6b3a', '#6b5a2e', '#5a2e6b', '#2e2e2e', '#8a7a5a', '#4a6b6b'];

const AGE_BUCKET = (age = '') => (/uralt|alt|älter/.test(age) ? 'old' : /mittleren/.test(age) ? 'middle' : 'young');

/** Zufällige Merkmale für einen NSC (n wie aus npc-gen: people, gender, age, template). */
export function portraitSpec(n = {}, rnd = Math.random) {
  const people = n.people || 'human';
  const female = n.gender === 'w' || (n.gender === 'd' && rnd() < 0.5);
  const age = AGE_BUCKET(n.age);
  const skinSet = SKIN[people === 'elf' || people === 'halfelf' ? 'elf' : people] || SKIN.common;
  const outfit = pick(OUTFIT_BY_TEMPLATE[n.template] || OUTFIT_BY_TEMPLATE.commoner, rnd);
  let hair = age === 'old' && rnd() < 0.85 ? pick(HAIR_OLD, rnd) : pick(HAIR, rnd);
  if (people === 'elf' && rnd() < 0.25) hair = pick(['#dfe6ee', '#f2e6b8', '#2b2b3a'], rnd);
  if (people === 'tiefling' && rnd() < 0.6) hair = pick(['#1a1420', '#2b1d33', '#4b1f2e', '#3a3a5a'], rnd);
  const styles = female ? ['long', 'long', 'braid', 'bun', 'bob', 'ponytail', 'short'] : ['short', 'short', 'messy', 'long', 'ponytail', 'bald', 'mohawk'];
  let beard = 'none';
  if (!female && people !== 'elf' && people !== 'dragonborn' && people !== 'tiefling') {
    beard = people === 'dwarf' ? pick(['long', 'braided', 'long'], rnd) : pick(['none', 'none', 'stubble', 'short', 'long', 'moustache'], rnd);
  }
  if (people === 'dwarf' && female && rnd() < 0.15) beard = 'short';
  return {
    people,
    female,
    age,
    skin: pick(skinSet, rnd),
    hair,
    hairStyle: age === 'old' && !female && rnd() < 0.3 ? 'bald' : pick(styles, rnd),
    beard,
    eyes: people === 'tiefling' ? pick(['#f2c14e', '#e04c4c', '#1b1b1b', '#b8e0ff'], rnd) : people === 'dragonborn' ? pick(['#f2c14e', '#e04c4c', '#7fd36b'], rnd) : pick(EYES, rnd),
    outfit,
    cloth: outfit === 'cultist' ? pick(['#5a1a1a', '#2b1530'], rnd) : outfit === 'druid' ? pick(['#3e6b3a', '#5a6b2e', '#6b4a2e'], rnd) : pick(CLOTH, rnd),
    bg: pick(['#3a2f22', '#22303a', '#2f3a22', '#3a2230', '#2a2a36', '#3a3322'], rnd),
    scar: rnd() < 0.15,
    earring: rnd() < 0.2,
    horns: pick(['curl', 'straight', 'back'], rnd),
    brows: rnd() < 0.5 ? 'flat' : 'arched',
  };
}

const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

let svgCounter = 0;

/** SVG eines Porträts (200 × 200). */
export function portraitSvg(s) {
  // Eindeutige IDs der Farbverläufe – sonst übernehmen mehrere Porträts auf einer Seite die Farben des ersten
  const u = `p${++svgCounter}`;
  const out = [];
  const add = (x) => out.push(x);
  const skinD = shade(s.skin, -0.18);
  const hairD = shade(s.hair, -0.3);
  const small = s.people === 'halfling' || s.people === 'gnome';
  const dwarf = s.people === 'dwarf';
  const dragon = s.people === 'dragonborn';
  const orc = s.people === 'halforc';
  // Kopf: Mittelpunkt und Maße (Völker leicht unterschiedlich)
  const hx = 100;
  const hy = small ? 94 : 86;
  const rx = dwarf ? 36 : small ? 33 : orc ? 35 : 31;
  const ry = dwarf ? 38 : small ? 36 : 40;

  add(`<defs><radialGradient id="${u}bg" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${shade(s.bg, 0.25)}"/><stop offset="1" stop-color="${shade(s.bg, -0.35)}"/></radialGradient>
<linearGradient id="${u}cl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(s.cloth, 0.12)}"/><stop offset="1" stop-color="${shade(s.cloth, -0.3)}"/></linearGradient>
<radialGradient id="${u}sk" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="${shade(s.skin, 0.08)}"/><stop offset="1" stop-color="${skinD}"/></radialGradient></defs>`);
  add(`<rect width="200" height="200" fill="url(#${u}bg)"/>`);

  // Haare hinten (lang, Zopf)
  if (!dragon && (s.hairStyle === 'long' || s.hairStyle === 'braid') && !['hood', 'cultist', 'druid'].includes(s.outfit)) {
    add(`<path d="M${hx - rx - 6} ${hy - 10} Q${hx - rx - 14} ${hy + 60} ${hx - rx + 2} ${hy + 78} L${hx + rx - 2} ${hy + 78} Q${hx + rx + 14} ${hy + 60} ${hx + rx + 6} ${hy - 10} Z" fill="${hairD}"/>`);
  }

  // Körper / Kleidung
  const sy = hy + ry + 8; // Schulteransatz
  const body = `M18 200 Q22 ${sy + 18} 60 ${sy + 6} Q${hx} ${sy - 4} 140 ${sy + 6} Q178 ${sy + 18} 182 200 Z`;
  add(`<path d="${body}" fill="url(#${u}cl)"/>`);
  if (s.outfit === 'armor') {
    add(`<path d="M30 200 Q34 ${sy + 20} 64 ${sy + 8} L136 ${sy + 8} Q166 ${sy + 20} 170 200 Z" fill="#8d939b"/>`);
    add(`<path d="M40 ${sy + 16} Q58 ${sy + 2} 80 ${sy + 10} Q70 ${sy + 26} 46 ${sy + 30} Z M160 ${sy + 16} Q142 ${sy + 2} 120 ${sy + 10} Q130 ${sy + 26} 154 ${sy + 30} Z" fill="#b4bac2" stroke="#5f656d" stroke-width="2"/>`);
    add(`<path d="M86 ${sy + 12} L114 ${sy + 12} L110 200 L90 200 Z" fill="${s.cloth}" opacity="0.85"/>`);
  } else if (s.outfit === 'noble') {
    add(`<path d="M70 ${sy + 4} L100 ${sy + 40} L130 ${sy + 4}" fill="none" stroke="#d4a64a" stroke-width="6"/>`);
    add(`<path d="M72 ${sy + 2} Q100 ${sy + 22} 128 ${sy + 2} Q100 ${sy + 12} 72 ${sy + 2} Z" fill="#f2efe6"/>`);
    add(`<circle cx="100" cy="${sy + 40}" r="5" fill="#d4a64a"/>`);
  } else if (s.outfit === 'robe' || s.outfit === 'mage') {
    add(`<path d="M76 ${sy + 2} L100 200 L124 ${sy + 2}" fill="none" stroke="${shade(s.cloth, 0.35)}" stroke-width="5"/>`);
    if (s.outfit === 'robe') add(`<path d="M94 ${sy + 34} h12 M100 ${sy + 28} v16" stroke="#d4a64a" stroke-width="3"/>`);
  } else if (s.outfit === 'apron') {
    add(`<path d="M70 200 L74 ${sy + 20} L126 ${sy + 20} L130 200 Z" fill="#c9b48a"/>`);
  } else if (s.outfit === 'leather') {
    add(`<path d="M40 200 L70 ${sy + 8} L84 ${sy + 8} L58 200 Z" fill="#5a3b24"/><path d="M70 ${sy + 30} L130 ${sy + 30}" stroke="#3b2a1e" stroke-width="4"/>`);
  } else if (s.outfit === 'fur') {
    add(`<path d="M24 ${sy + 30} Q40 ${sy - 2} 70 ${sy + 6} Q100 ${sy + 16} 130 ${sy + 6} Q160 ${sy - 2} 176 ${sy + 30} Q150 ${sy + 34} 100 ${sy + 30} Q50 ${sy + 34} 24 ${sy + 30} Z" fill="#8a6a4a" stroke="#5a4030" stroke-width="2" stroke-dasharray="3 3"/>`);
  } else {
    add(`<path d="M84 ${sy + 2} Q100 ${sy + 18} 116 ${sy + 2}" fill="none" stroke="${shade(s.cloth, -0.4)}" stroke-width="3"/>`);
  }

  // Hals
  add(`<path d="M${hx - 13} ${hy + ry - 10} L${hx - 14} ${sy + 6} Q${hx} ${sy + 14} ${hx + 14} ${sy + 6} L${hx + 13} ${hy + ry - 10} Z" fill="${skinD}"/>`);

  // Kapuze hinten
  const hooded = ['hood', 'cultist', 'druid'].includes(s.outfit);
  if (hooded) add(`<path d="M${hx - rx - 16} ${sy + 10} Q${hx - rx - 22} ${hy - ry - 8} ${hx} ${hy - ry - 18} Q${hx + rx + 22} ${hy - ry - 8} ${hx + rx + 16} ${sy + 10} Z" fill="${shade(s.cloth, -0.25)}"/>`);

  if (dragon) {
    // Drachenblütiger: Schuppenkopf mit Schnauze und Hörnern
    add(`<path d="M${hx - 36} ${hy - 6} Q${hx - 38} ${hy - 44} ${hx} ${hy - 46} Q${hx + 38} ${hy - 44} ${hx + 36} ${hy - 6} Q${hx + 34} ${hy + 22} ${hx + 18} ${hy + 40} Q${hx} ${hy + 50} ${hx - 18} ${hy + 40} Q${hx - 34} ${hy + 22} ${hx - 36} ${hy - 6} Z" fill="url(#${u}sk)"/>`);
    add(`<path d="M${hx - 30} ${hy - 30} Q${hx - 50} ${hy - 60} ${hx - 44} ${hy - 76} Q${hx - 38} ${hy - 50} ${hx - 22} ${hy - 38} Z M${hx + 30} ${hy - 30} Q${hx + 50} ${hy - 60} ${hx + 44} ${hy - 76} Q${hx + 38} ${hy - 50} ${hx + 22} ${hy - 38} Z" fill="#e8dcc0" stroke="#8a7a5a" stroke-width="1.5"/>`);
    for (let i = 0; i < 9; i++) add(`<path d="M${hx - 24 + (i % 3) * 16} ${hy - 30 + Math.floor(i / 3) * 10} q6 -6 12 0" fill="none" stroke="${skinD}" stroke-width="1.5" opacity="0.7"/>`);
    add(`<path d="M${hx - 18} ${hy + 30} Q${hx} ${hy + 38} ${hx + 18} ${hy + 30}" fill="none" stroke="${shade(s.skin, -0.45)}" stroke-width="2.5"/>`);
    add(`<circle cx="${hx - 6}" cy="${hy + 18}" r="2" fill="#222"/><circle cx="${hx + 6}" cy="${hy + 18}" r="2" fill="#222"/>`);
    eyes(add, hx, hy - 8, 15, s, true);
  } else {
    // Ohren (vor dem Kopf gezeichnet, damit der Kopf den Ansatz verdeckt)
    const ey = hy + 2;
    if (s.people === 'elf' || s.people === 'halfelf') {
      const len = s.people === 'elf' ? 30 : 18;
      add(`<path d="M${hx - rx + 4} ${ey + 8} L${hx - rx - len} ${ey - len * 0.9} L${hx - rx + 2} ${ey - 10} Z M${hx + rx - 4} ${ey + 8} L${hx + rx + len} ${ey - len * 0.9} L${hx + rx - 2} ${ey - 10} Z" fill="${skinD}"/>`);
    } else if (s.people === 'gnome' || s.people === 'halfling' || orc) {
      add(`<path d="M${hx - rx + 4} ${ey + 10} L${hx - rx - 12} ${ey - 10} L${hx - rx + 2} ${ey - 8} Z M${hx + rx - 4} ${ey + 10} L${hx + rx + 12} ${ey - 10} L${hx + rx - 2} ${ey - 8} Z" fill="${skinD}"/>`);
    } else {
      add(`<ellipse cx="${hx - rx + 1}" cy="${ey + 2}" rx="6" ry="10" fill="${skinD}"/><ellipse cx="${hx + rx - 1}" cy="${ey + 2}" rx="6" ry="10" fill="${skinD}"/>`);
    }
    if (s.earring) add(`<circle cx="${hx + rx - 1}" cy="${ey + 13}" r="3" fill="none" stroke="#d4a64a" stroke-width="2"/>`);
    // Kopf
    const jaw = orc || dwarf ? 0.92 : s.female ? 0.78 : 0.84;
    add(`<path d="M${hx - rx} ${hy - 4} Q${hx - rx} ${hy - ry} ${hx} ${hy - ry} Q${hx + rx} ${hy - ry} ${hx + rx} ${hy - 4} Q${hx + rx * jaw} ${hy + ry * 0.75} ${hx} ${hy + ry} Q${hx - rx * jaw} ${hy + ry * 0.75} ${hx - rx} ${hy - 4} Z" fill="url(#${u}sk)"/>`);
    eyes(add, hx, hy - 2, 13, s, s.people === 'tiefling');
    // Brauen
    const by = hy - 14;
    const browCol = s.age === 'old' ? '#cfcfcf' : hairD;
    add(s.brows === 'arched'
      ? `<path d="M${hx - 22} ${by + 2} Q${hx - 13} ${by - 4} ${hx - 5} ${by + 1} M${hx + 22} ${by + 2} Q${hx + 13} ${by - 4} ${hx + 5} ${by + 1}" fill="none" stroke="${browCol}" stroke-width="${dwarf ? 4 : 3}" stroke-linecap="round"/>`
      : `<path d="M${hx - 22} ${by} L${hx - 5} ${by - 1} M${hx + 22} ${by} L${hx + 5} ${by - 1}" stroke="${browCol}" stroke-width="${dwarf ? 4 : 3}" stroke-linecap="round"/>`);
    // Nase und Mund
    const nose = small ? 7 : dwarf || orc ? 10 : 9;
    add(`<path d="M${hx - 1} ${hy - 2} Q${hx - nose * 0.5} ${hy + nose + 2} ${hx - 4} ${hy + nose + 4} Q${hx} ${hy + nose + 6} ${hx + 5} ${hy + nose + 3}" fill="none" stroke="${shade(s.skin, -0.35)}" stroke-width="2" stroke-linecap="round"/>`);
    const my = hy + ry * 0.55;
    add(`<path d="M${hx - 9} ${my} Q${hx} ${my + (s.female ? 4 : 3)} ${hx + 9} ${my}" fill="none" stroke="${s.female ? '#9a4a4a' : shade(s.skin, -0.45)}" stroke-width="${s.female ? 3 : 2.5}" stroke-linecap="round"/>`);
    if (orc) add(`<path d="M${hx - 10} ${my + 1} L${hx - 12} ${my - 9} L${hx - 6} ${my} Z M${hx + 10} ${my + 1} L${hx + 12} ${my - 9} L${hx + 6} ${my} Z" fill="#f2ead8"/>`);
    if (s.age === 'old') add(`<path d="M${hx - 20} ${hy + 6} q4 4 2 9 M${hx + 20} ${hy + 6} q-4 4 -2 9 M${hx - 12} ${hy - 26} h24 M${hx - 9} ${hy - 22} h18" fill="none" stroke="${shade(s.skin, -0.3)}" stroke-width="1.5" opacity="0.8"/>`);
    else if (s.age === 'middle') add(`<path d="M${hx - 18} ${hy + 8} q3 3 2 7 M${hx + 18} ${hy + 8} q-3 3 -2 7" fill="none" stroke="${shade(s.skin, -0.25)}" stroke-width="1.2" opacity="0.7"/>`);
    if (s.scar) add(`<path d="M${hx + 12} ${hy - 18} L${hx + 22} ${hy + 8}" stroke="#b05a5a" stroke-width="2.5" opacity="0.8"/>`);

    // Bart
    const bcol = s.age === 'old' ? s.hair : hairD;
    if (s.beard === 'stubble') add(`<path d="M${hx - rx * 0.85} ${hy + 6} Q${hx - rx * 0.7} ${hy + ry} ${hx} ${hy + ry + 2} Q${hx + rx * 0.7} ${hy + ry} ${hx + rx * 0.85} ${hy + 6} Q${hx} ${hy + ry * 0.75} ${hx - rx * 0.85} ${hy + 6} Z" fill="${bcol}" opacity="0.35"/>`);
    if (s.beard === 'short' || s.beard === 'long' || s.beard === 'braided') {
      const len = s.beard === 'short' ? 10 : 34;
      add(`<path d="M${hx - rx * 0.92} ${hy + 2} Q${hx - rx * 0.9} ${hy + ry + len * 0.6} ${hx} ${hy + ry + len} Q${hx + rx * 0.9} ${hy + ry + len * 0.6} ${hx + rx * 0.92} ${hy + 2} Q${hx + rx * 0.6} ${hy + ry * 0.4} ${hx + 10} ${my - 3} Q${hx} ${my + 6} ${hx - 10} ${my - 3} Q${hx - rx * 0.6} ${hy + ry * 0.4} ${hx - rx * 0.92} ${hy + 2} Z" fill="${bcol}"/>`);
      if (s.beard === 'braided') add(`<path d="M${hx - 8} ${hy + ry + 8} v${len - 4} M${hx + 8} ${hy + ry + 8} v${len - 4}" stroke="${shade(bcol, -0.3)}" stroke-width="5" stroke-dasharray="4 3"/><circle cx="${hx - 8}" cy="${hy + ry + len + 4}" r="3" fill="#d4a64a"/><circle cx="${hx + 8}" cy="${hy + ry + len + 4}" r="3" fill="#d4a64a"/>`);
    }
    if (s.beard === 'moustache' || s.beard === 'long' || s.beard === 'braided') add(`<path d="M${hx - 16} ${my + 2} Q${hx - 8} ${my - 8} ${hx} ${my - 4} Q${hx + 8} ${my - 8} ${hx + 16} ${my + 2} Q${hx + 6} ${my - 2} ${hx} ${my - 1} Q${hx - 6} ${my - 2} ${hx - 16} ${my + 2} Z" fill="${bcol}"/>`);

    // Haare vorne
    if (!hooded && s.outfit !== 'mage' && s.hairStyle !== 'bald') hairFront(add, s, hx, hy, rx, ry, hairD);
    if (s.hairStyle === 'bald' && !hooded && s.outfit !== 'mage') add(`<ellipse cx="${hx - 10}" cy="${hy - ry + 12}" rx="10" ry="5" fill="#fff" opacity="0.15"/>`);
  }

  // Hörner (Tiefling)
  if (s.people === 'tiefling') {
    const hc = '#3a2a2a';
    if (s.horns === 'curl') add(`<path d="M${hx - 20} ${hy - ry + 6} Q${hx - 46} ${hy - ry - 10} ${hx - 40} ${hy - ry + 22} Q${hx - 34} ${hy - ry + 6} ${hx - 14} ${hy - ry + 12} Z M${hx + 20} ${hy - ry + 6} Q${hx + 46} ${hy - ry - 10} ${hx + 40} ${hy - ry + 22} Q${hx + 34} ${hy - ry + 6} ${hx + 14} ${hy - ry + 12} Z" fill="${hc}"/>`);
    else if (s.horns === 'straight') add(`<path d="M${hx - 18} ${hy - ry + 8} L${hx - 26} ${hy - ry - 30} L${hx - 10} ${hy - ry + 4} Z M${hx + 18} ${hy - ry + 8} L${hx + 26} ${hy - ry - 30} L${hx + 10} ${hy - ry + 4} Z" fill="${hc}"/>`);
    else add(`<path d="M${hx - 22} ${hy - ry + 10} Q${hx - 40} ${hy - ry - 20} ${hx - 60} ${hy - ry - 12} Q${hx - 40} ${hy - ry - 6} ${hx - 16} ${hy - ry + 16} Z M${hx + 22} ${hy - ry + 10} Q${hx + 40} ${hy - ry - 20} ${hx + 60} ${hy - ry - 12} Q${hx + 40} ${hy - ry - 6} ${hx + 16} ${hy - ry + 16} Z" fill="${hc}"/>`);
  }

  // Kapuze vorne / Hut
  if (hooded) {
    add(`<path d="M${hx - rx - 14} ${sy + 12} Q${hx - rx - 16} ${hy - ry - 4} ${hx} ${hy - ry - 14} Q${hx + rx + 16} ${hy - ry - 4} ${hx + rx + 14} ${sy + 12} L${hx + rx + 2} ${sy + 4} Q${hx + rx + 4} ${hy - ry + 4} ${hx} ${hy - ry - 4} Q${hx - rx - 4} ${hy - ry + 4} ${hx - rx - 2} ${sy + 4} Z" fill="url(#${u}cl)"/>`);
    if (s.outfit === 'druid') add(`<path d="M${hx - 22} ${hy - ry - 10} q6 -10 12 -2 q-6 2 -12 2 Z M${hx + 10} ${hy - ry - 12} q8 -8 12 2 q-6 0 -12 -2 Z" fill="#7cb342"/>`);
  } else if (s.outfit === 'mage') {
    add(`<path d="M${hx - rx - 18} ${hy - ry + 12} Q${hx} ${hy - ry + 2} ${hx + rx + 18} ${hy - ry + 12} Q${hx} ${hy - ry + 22} ${hx - rx - 18} ${hy - ry + 12} Z" fill="${shade(s.cloth, -0.2)}"/>`);
    add(`<path d="M${hx - rx + 2} ${hy - ry + 10} L${hx + 14} ${hy - ry - 62} Q${hx + 22} ${hy - ry - 66} ${hx + 26} ${hy - ry - 54} L${hx + rx - 2} ${hy - ry + 10} Z" fill="url(#${u}cl)"/>`);
    add(`<path d="M${hx - 6} ${hy - ry - 20} l3 6 6 1 -5 4 1 6 -5 -3 -5 3 1 -6 -5 -4 6 -1 Z" fill="#f2d16b"/>`);
  } else if (s.outfit === 'bandana') {
    add(`<path d="M${hx - rx - 2} ${hy - 16} Q${hx} ${hy - ry - 14} ${hx + rx + 2} ${hy - 16} Q${hx} ${hy - ry + 2} ${hx - rx - 2} ${hy - 16} Z" fill="${s.cloth}"/><path d="M${hx + rx} ${hy - 16} l12 6 -4 10 Z" fill="${s.cloth}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${out.join('')}</svg>`;
}

function eyes(add, hx, y, dx, s, solid) {
  for (const sx of [-1, 1]) {
    const cx = hx + sx * dx;
    add(`<path d="M${cx - 8} ${y} Q${cx} ${y - 6} ${cx + 8} ${y} Q${cx} ${y + 5} ${cx - 8} ${y} Z" fill="${solid ? s.eyes : '#f6f1e8'}"/>`);
    if (!solid) add(`<circle cx="${cx}" cy="${y}" r="3.6" fill="${s.eyes}"/><circle cx="${cx}" cy="${y}" r="1.6" fill="#111"/><circle cx="${cx + 1.2}" cy="${y - 1.2}" r="0.9" fill="#fff"/>`);
    add(`<path d="M${cx - 8} ${y} Q${cx} ${y - 6} ${cx + 8} ${y}" fill="none" stroke="#2a1d14" stroke-width="1.6"/>`);
  }
}

function hairFront(add, s, hx, hy, rx, ry, hairD) {
  const top = hy - ry;
  const c = s.hair;
  switch (s.hairStyle) {
    case 'short':
    case 'ponytail':
    case 'bun':
    case 'braid':
      add(`<path d="M${hx - rx - 2} ${hy - 2} Q${hx - rx - 4} ${top - 8} ${hx} ${top - 8} Q${hx + rx + 4} ${top - 8} ${hx + rx + 2} ${hy - 2} Q${hx + rx - 4} ${top + 14} ${hx + 6} ${top + 12} Q${hx - 10} ${top + 20} ${hx - rx + 6} ${hy - 8} Z" fill="${c}"/>`);
      if (s.hairStyle === 'bun') add(`<circle cx="${hx}" cy="${top - 10}" r="13" fill="${c}"/><circle cx="${hx}" cy="${top - 10}" r="13" fill="none" stroke="${hairD}" stroke-width="2"/>`);
      if (s.hairStyle === 'ponytail') add(`<path d="M${hx + rx - 4} ${top + 8} Q${hx + rx + 24} ${top + 20} ${hx + rx + 14} ${hy + 46} Q${hx + rx + 6} ${top + 34} ${hx + rx - 8} ${top + 18} Z" fill="${c}"/>`);
      if (s.hairStyle === 'braid') add(`<path d="M${hx - rx + 2} ${hy} q-8 20 -2 40 q-6 14 0 26" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round"/><path d="M${hx - rx + 2} ${hy + 4} q-8 20 -2 40 q-6 14 0 26" fill="none" stroke="${hairD}" stroke-width="2" stroke-dasharray="5 5"/>`);
      break;
    case 'long':
    case 'bob':
      add(`<path d="M${hx - rx - 6} ${hy + (s.hairStyle === 'bob' ? 18 : 30)} Q${hx - rx - 10} ${top - 10} ${hx} ${top - 10} Q${hx + rx + 10} ${top - 10} ${hx + rx + 6} ${hy + (s.hairStyle === 'bob' ? 18 : 30)} L${hx + rx - 4} ${hy + 4} Q${hx + rx - 2} ${top + 14} ${hx + 2} ${top + 10} Q${hx - 18} ${top + 22} ${hx - rx + 4} ${hy + 4} Z" fill="${c}"/>`);
      break;
    case 'messy':
      add(`<path d="M${hx - rx - 4} ${hy - 4} L${hx - rx - 8} ${top + 2} L${hx - rx + 6} ${top - 2} L${hx - 14} ${top - 14} L${hx - 2} ${top - 6} L${hx + 10} ${top - 16} L${hx + 16} ${top - 4} L${hx + rx + 6} ${top - 6} L${hx + rx + 4} ${hy - 4} Q${hx + rx - 6} ${top + 14} ${hx} ${top + 16} Q${hx - rx + 6} ${top + 14} ${hx - rx - 4} ${hy - 4} Z" fill="${c}"/>`);
      break;
    case 'mohawk':
      add(`<path d="M${hx - 8} ${top + 10} L${hx - 12} ${top - 20} L${hx} ${top - 28} L${hx + 12} ${top - 20} L${hx + 8} ${top + 10} Z" fill="${c}"/>`);
      break;
    default:
  }
}

/** SVG in ein PNG (File) umwandeln – für den Upload als Kampagnen-Bild. */
export function svgToPngFile(svg, name = 'portrait.png', size = 384) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, 0, 0, size, size);
      c.toBlob((b) => (b ? resolve(new File([b], name, { type: 'image/png' })) : reject(new Error(tr('Bild konnte nicht erzeugt werden')))), 'image/png');
    };
    img.onerror = () => reject(new Error(tr('Porträt konnte nicht gezeichnet werden')));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
