// Kreaturen (NPCs & Monster): Datenmodell, Import (Statblock-Text, Open5e/SRD) und Darstellung.
import { h, markdown } from './util.js';
import { tr } from './i18n.js';
import { convert } from './units-ui.js';
import { lang } from './i18n.js';

export const ABILITIES = [
  ['str', 'STR', 'ST'],
  ['dex', 'DEX', 'GE'],
  ['con', 'CON', 'KO'],
  ['int', 'INT', 'IN'],
  ['wis', 'WIS', 'WE'],
  ['cha', 'CHA', 'CH'],
];

export const SIZES = {
  Tiny: 0.5,
  Small: 1,
  Medium: 1,
  Large: 2,
  Huge: 3,
  Gargantuan: 4,
};

const SIZE_DE = { Winzig: 'Tiny', Klein: 'Small', Mittelgroß: 'Medium', Mittel: 'Medium', Groß: 'Large', Riesig: 'Huge', Gigantisch: 'Gargantuan' };

export const abilityMod = (score) => Math.floor((Number(score || 10) - 10) / 2);
export const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);

/** Größe einer Kreatur in Rasterfeldern (für Tokens). */
export function sizeToCells(size) {
  const s = String(size || '').trim();
  const en = SIZE_DE[s] || s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return SIZES[en] ?? 1;
}

export function newCreature(kind = 'monster', name = '') {
  return {
    kind,
    name: name || (kind === 'npc' ? tr('Neuer NSC') : tr('Neues Monster')),
    size: 'Medium',
    type: kind === 'npc' ? 'Humanoid' : '', // i18n-ignore – Datenwert, keine Anzeige
    alignment: '',
    role: '',
    location: '',
    ac: '10',
    hp: 10,
    hpFormula: '',
    speed: '30 ft.',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: '',
    skills: '',
    vulnerabilities: '',
    resistances: '',
    immunities: '',
    conditionImmunities: '',
    senses: '',
    languages: '',
    cr: '',
    traits: '',
    actions: '',
    bonusActions: '',
    reactions: '',
    legendary: '',
    background: '',
    portraitAssetId: null,
    source: '',
    createdAt: Date.now(),
  };
}

// --- Statblock-Text (z.B. aus D&D Beyond kopiert) -----------------------------------

const LABELS = {
  ac: ['Armor Class', 'Rüstungsklasse', 'RK'],
  hp: ['Hit Points', 'Trefferpunkte', 'TP'],
  speed: ['Speed', 'Bewegungsrate', 'Geschwindigkeit'],
  saves: ['Saving Throws', 'Rettungswürfe'],
  skills: ['Skills', 'Fertigkeiten'],
  vulnerabilities: ['Damage Vulnerabilities', 'Schadensanfälligkeiten', 'Verwundbarkeiten'],
  resistances: ['Damage Resistances', 'Schadensresistenzen', 'Resistenzen'],
  immunities: ['Damage Immunities', 'Schadensimmunitäten', 'Immunitäten'],
  conditionImmunities: ['Condition Immunities', 'Zustandsimmunitäten'],
  senses: ['Senses', 'Sinne'],
  languages: ['Languages', 'Sprachen'],
  cr: ['Challenge', 'Herausforderung', 'Herausforderungsgrad', 'CR', 'HG'],
};

const SECTIONS = {
  actions: ['Actions', 'Aktionen'],
  bonusActions: ['Bonus Actions', 'Bonusaktionen'],
  reactions: ['Reactions', 'Reaktionen'],
  legendary: ['Legendary Actions', 'Legendäre Aktionen'],
  mythic: ['Mythic Actions', 'Mythische Aktionen'],
  lair: ['Lair Actions', 'Hortaktionen'],
};

const IGNORE_LINES = /^(proficiency bonus|übungsbonus|traits?|merkmale|description|beschreibung)\b/i;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Formatiert Absätze „Name. Text“ als Markdown „**Name.** Text“. */
function paragraphsToMd(lines) {
  const out = [];
  for (const line of lines) {
    const m = line.match(/^([A-ZÄÖÜ][^.:]{1,60}?(?:\s*\([^)]*\))?)\.\s+(.+)$/);
    if (m) out.push(`**${m[1]}.** ${m[2]}`);
    else if (out.length && !/^[A-ZÄÖÜ]/.test(line)) out[out.length - 1] += ` ${line}`;
    else out.push(line);
  }
  return out.join('\n\n');
}

/**
 * Erkennt einen Statblock im Fließtext (englisch oder deutsch) – bewusst fehlertolerant.
 * Alles, was nicht erkannt wird, bleibt im Feld „Merkmale“ erhalten.
 */
export function parseStatblock(text, kind = 'monster') {
  const c = newCreature(kind);
  c.source = 'Statblock-Import'; // i18n-ignore – Datenwert (Quelle der Kreatur)
  const lines = String(text || '')
    .replace(/\r/g, '')
    .replace(/[−–]/g, '-')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return c;

  c.name = lines.shift();
  // „Medium humanoid (goblinoid), neutral evil“
  if (lines.length && /^(tiny|small|medium|large|huge|gargantuan|winzig|klein|mittelgroß|groß|riesig|gigantisch)\b/i.test(lines[0])) {
    const meta = lines.shift();
    const [left, ...rest] = meta.split(',');
    const parts = left.trim().split(/\s+/);
    const size = parts.shift();
    c.size = SIZE_DE[size] || size.charAt(0).toUpperCase() + size.slice(1).toLowerCase();
    c.type = parts.join(' ');
    c.alignment = rest.join(',').trim();
  }

  // Attributswerte: „STR DEX …“ gefolgt von sechs „10 (+0)“ oder einzeln je Zeile
  const joined = lines.join('\n');
  const scoreRe = /(\d{1,2})\s*\(\s*([+-]?\d+)\s*\)/g;
  const abilityStart = joined.search(/\b(STR|ST)\b[\s\S]{0,40}\b(DEX|GE)\b/);
  if (abilityStart >= 0) {
    const scores = [...joined.slice(abilityStart).matchAll(scoreRe)].slice(0, 6).map((m) => Number(m[1]));
    if (scores.length === 6) ABILITIES.forEach(([k], i) => (c.abilities[k] = scores[i]));
  }

  const rest = [];
  let section = 'traits';
  const buckets = { traits: [], actions: [], bonusActions: [], reactions: [], legendary: [], mythic: [], lair: [] };
  for (const line of lines) {
    // Zeilen der Attributstabelle überspringen
    if (/^(STR|DEX|CON|INT|WIS|CHA|ST|GE|KO|IN|WE|CH)$/i.test(line) || /^(\d{1,2}\s*\([+-]?\d+\)\s*){1,6}$/.test(line)) continue;
    if (/^(STR|ST)\s+(DEX|GE)\s+/i.test(line)) continue;
    const sec = Object.entries(SECTIONS).find(([, names]) => names.some((n) => line.toLowerCase() === n.toLowerCase()));
    if (sec) {
      section = sec[0];
      continue;
    }
    let matched = false;
    if (section === 'traits') {
      for (const [field, names] of Object.entries(LABELS)) {
        const m = line.match(new RegExp(`^(?:${names.map(esc).join('|')})\\s*:?\\s+(.+)$`, 'i'));
        if (!m) continue;
        matched = true;
        const v = m[1].trim();
        if (field === 'hp') {
          const hm = v.match(/^(\d+)\s*(?:\(([^)]+)\))?/);
          c.hp = hm ? Number(hm[1]) : c.hp;
          c.hpFormula = hm?.[2] || '';
        } else if (field === 'cr') {
          c.cr = v.replace(/\s*\(.*$/, '');
        } else {
          c[field] = v;
        }
        break;
      }
    }
    if (matched || IGNORE_LINES.test(line)) continue;
    (buckets[section] || rest).push(line);
  }
  c.traits = paragraphsToMd(buckets.traits);
  c.actions = paragraphsToMd(buckets.actions);
  c.bonusActions = paragraphsToMd(buckets.bonusActions);
  c.reactions = paragraphsToMd(buckets.reactions);
  c.legendary = paragraphsToMd([...buckets.legendary, ...buckets.mythic, ...buckets.lair]);
  return c;
}

// --- Open5e (SRD-Monster) -----------------------------------------------------------

const listMd = (arr) => (arr || []).map((a) => `**${a.name}.** ${a.desc}`).join('\n\n');

export function fromOpen5e(m) {
  const c = newCreature('monster', m.name);
  c.source = `SRD (${m.document__title || 'Open5e'})`; // i18n-ignore – Datenwert, keine Anzeige
  c.size = m.size || 'Medium'; // i18n-ignore – Datenwert, keine Anzeige
  c.type = [m.type, m.subtype ? `(${m.subtype})` : ''].filter(Boolean).join(' ');
  c.alignment = m.alignment || '';
  c.ac = `${m.armor_class ?? 10}${m.armor_desc ? ` (${m.armor_desc})` : ''}`;
  c.hp = Number(m.hit_points) || 1;
  c.hpFormula = m.hit_dice || '';
  c.speed = Object.entries(m.speed || {})
    .filter(([k]) => k !== 'hover')
    .map(([k, v]) => (k === 'walk' ? `${v} ft.` : `${k} ${v} ft.`)) // i18n-ignore – Datenwert, keine Anzeige
    .join(', ');
  c.abilities = {
    str: m.strength ?? 10,
    dex: m.dexterity ?? 10,
    con: m.constitution ?? 10,
    int: m.intelligence ?? 10,
    wis: m.wisdom ?? 10,
    cha: m.charisma ?? 10,
  };
  const saves = ABILITIES.map(([k, en]) => [en, m[`${{ str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' }[k]}_save`]])
    .filter(([, v]) => v != null)
    .map(([en, v]) => `${en.charAt(0) + en.slice(1).toLowerCase()} ${fmtMod(Number(v))}`);
  c.saves = saves.join(', ');
  c.skills = Object.entries(m.skills || {})
    .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} ${fmtMod(Number(v))}`)
    .join(', ');
  c.vulnerabilities = m.damage_vulnerabilities || '';
  c.resistances = m.damage_resistances || '';
  c.immunities = m.damage_immunities || '';
  c.conditionImmunities = m.condition_immunities || '';
  c.senses = m.senses || '';
  c.languages = m.languages || '';
  c.cr = m.challenge_rating || String(m.cr ?? '');
  c.traits = listMd(m.special_abilities);
  c.actions = listMd(m.actions);
  c.bonusActions = listMd(m.bonus_actions);
  c.reactions = listMd(m.reactions);
  c.legendary = [m.legendary_desc, listMd(m.legendary_actions)].filter(Boolean).join('\n\n');
  c.background = m.desc || '';
  return c;
}

// --- Darstellung --------------------------------------------------------------------

const KIND_LABEL = { monster: tr('Monster'), npc: tr('NSC') };

/** Klassischer 5e-Statblock als DOM-Element. */
export function renderStatblock(c, { compact = false, portraitUrl = '' } = {}) {
  // Entfernungen, Gewichte usw. im Text in der Einheit der Kampagne
  const line = (label, value) => (value ? h('div.sb-line', h('strong', `${label} `), convert(String(value))) : null);
  const section = (title, md) => (md && md.trim() ? [h('div.sb-section', title), h('div.md.sb-md', { innerHTML: markdown(convert(md)) })] : []);
  const meta = [c.size, c.type].filter(Boolean).join(' ') + (c.alignment ? `, ${c.alignment}` : '');
  return h(
    'div.statblock',
    { class: compact ? 'compact' : '' },
    h(
      'div.sb-head',
      portraitUrl ? h('img.sb-portrait', { src: portraitUrl, alt: '' }) : null,
      h('div', h('div.sb-name', c.name), h('div.sb-meta', meta || KIND_LABEL[c.kind] || ''), c.role || c.location ? h('div.sb-meta', [c.role, c.location].filter(Boolean).join(' · ')) : null),
    ),
    // Bei NSCs im Spiel zuerst das Rollenspiel-Wissen, dann die Werte
    compact && c.kind === 'npc' && c.background?.trim() ? [h('div.sb-rule'), h('div.md.sb-md.sb-roleplay', { innerHTML: markdown(c.background) })] : null,
    h('div.sb-rule'),
    line(tr('Rüstungsklasse'), c.ac),
    line(tr('Trefferpunkte'), c.hp ? `${c.hp}${c.hpFormula ? ` (${c.hpFormula})` : ''}` : ''),
    line(tr('Bewegungsrate'), c.speed),
    h('div.sb-rule'),
    h(
      'div.sb-abilities',
      ABILITIES.map(([k, en, de]) => h('div', h('div.sb-ab', lang === 'de' ? de : en), h('div', `${c.abilities?.[k] ?? 10} (${fmtMod(abilityMod(c.abilities?.[k]))})`), lang === 'de' ? h('div.sb-en', en) : null)),
    ),
    h('div.sb-rule'),
    line(tr('Rettungswürfe'), c.saves),
    line(tr('Fertigkeiten'), c.skills),
    line(tr('Anfälligkeiten'), c.vulnerabilities),
    line(tr('Resistenzen'), c.resistances),
    line(tr('Immunitäten'), c.immunities),
    line(tr('Zustandsimmunitäten'), c.conditionImmunities),
    line(tr('Sinne'), c.senses),
    line(tr('Sprachen'), c.languages),
    line(tr('Herausforderung'), c.cr),
    c.traits?.trim() ? [h('div.sb-rule'), h('div.md.sb-md', { innerHTML: markdown(convert(c.traits)) })] : null,
    ...section(tr('Aktionen'), c.actions),
    ...section(tr('Bonusaktionen'), c.bonusActions),
    ...section(tr('Reaktionen'), c.reactions),
    ...section(tr('Legendäre Aktionen'), c.legendary),
    compact ? null : section(tr('Hintergrund & Notizen'), c.background),
  );
}
