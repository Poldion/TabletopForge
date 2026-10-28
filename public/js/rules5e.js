// Regeln der 5. Edition (SRD 5.1) für den Kampf-Manager: Zustände, Schadensarten, Würfel und das Auslesen
// von Statblöcken (englisch aus Open5e/D&D Beyond, deutsch aus eigenen Importen). Ohne DOM – auch in Tests nutzbar.
import { tr } from './i18n.js';
import { convert } from './units-ui.js';

/**
 * Zustände. short = Kürzel für die Marke am Token, color = Markenfarbe, incap = macht kampfunfähig
 * (beendet u.a. Konzentration), rules = Kurzfassung der Auswirkungen.
 */
export const CONDITIONS = {
  blinded: { name: 'Blind', short: tr('Bl'), color: '#607d8b', rules: [tr('Sieht nichts – Proben, die Sicht erfordern, scheitern'), tr('Angriffe gegen ihn mit Vorteil, seine Angriffe mit Nachteil')] },
  charmed: { name: 'Bezaubert', short: tr('Bz'), color: '#e91e63', rules: [tr('Kann den Bezauberer nicht angreifen oder schädlich zum Ziel nehmen'), tr('Bezauberer hat Vorteil bei sozialen Proben gegen ihn')] },
  deafened: { name: 'Taub', short: tr('Ta'), color: '#78909c', rules: [tr('Hört nichts – Proben, die Gehör erfordern, scheitern')] },
  frightened: { name: 'Verängstigt', short: tr('Va'), color: '#9c27b0', rules: [tr('Nachteil auf Proben und Angriffe, solange die Quelle der Angst in Sicht ist'), tr('Kann sich der Quelle nicht freiwillig nähern')] },
  grappled: { name: 'Gepackt', short: tr('Gp'), color: '#8d6e63', rules: [tr('Bewegungsrate 0'), tr('Endet, wenn der Packende kampfunfähig ist oder aus der Reichweite gebracht wird')] },
  incapacitated: { name: 'Kampfunfähig', short: tr('Ku'), color: '#ff7043', incap: true, rules: [tr('Keine Aktionen und keine Reaktionen')] },
  invisible: { name: 'Unsichtbar', short: tr('Us'), color: '#4dd0e1', rules: [tr('Ohne besondere Sinne nicht zu sehen (gilt als schwer verborgen)'), tr('Seine Angriffe mit Vorteil, Angriffe gegen ihn mit Nachteil')] },
  paralyzed: { name: 'Gelähmt', short: tr('Gl'), color: '#fdd835', incap: true, rules: [tr('Kampfunfähig, kann sich nicht bewegen oder sprechen'), tr('ST- und GE-Rettungswürfe scheitern automatisch'), tr('Angriffe gegen ihn mit Vorteil – Treffer aus bis zu 1,5 m sind kritisch')] },
  petrified: { name: 'Versteinert', short: tr('Vs'), color: '#9e9e9e', incap: true, rules: [tr('Kampfunfähig, kann sich nicht bewegen oder sprechen, nimmt nichts wahr'), tr('ST- und GE-Rettungswürfe scheitern, Angriffe gegen ihn mit Vorteil'), tr('Resistenz gegen jeden Schaden, immun gegen Gift und Krankheit')] },
  poisoned: { name: 'Vergiftet', short: tr('Vg'), color: '#7cb342', rules: [tr('Nachteil auf Angriffe und Attributsproben')] },
  prone: { name: 'Liegend', short: tr('Li'), color: '#a1887f', rules: [tr('Kann nur kriechen; Aufstehen kostet die halbe Bewegungsrate'), tr('Seine Angriffe mit Nachteil'), tr('Angriffe gegen ihn aus bis zu 1,5 m mit Vorteil, sonst mit Nachteil')] },
  restrained: { name: 'Festgesetzt', short: tr('Fs'), color: '#6d4c41', rules: [tr('Bewegungsrate 0'), tr('Angriffe gegen ihn mit Vorteil, seine Angriffe mit Nachteil'), tr('Nachteil auf GE-Rettungswürfe')] },
  stunned: { name: 'Betäubt', short: tr('Bt'), color: '#ffb300', incap: true, rules: [tr('Kampfunfähig, kann sich nicht bewegen, spricht nur stockend'), tr('ST- und GE-Rettungswürfe scheitern automatisch'), tr('Angriffe gegen ihn mit Vorteil')] },
  unconscious: { name: 'Bewusstlos', short: tr('Bw'), color: '#d32f2f', incap: true, rules: [tr('Kampfunfähig, bewegt sich nicht, nimmt nichts wahr, lässt fallen, was er hält, liegt am Boden'), tr('ST- und GE-Rettungswürfe scheitern automatisch'), tr('Angriffe gegen ihn mit Vorteil – Treffer aus bis zu 1,5 m sind kritisch')] },
  exhaustion: { name: 'Erschöpfung', short: 'E', color: '#5c6bc0', levels: true, rules: [] },
};

/** Erschöpfungsstufen (wirken zusammen mit allen niedrigeren Stufen). */
export const EXHAUSTION = [
  '',
  tr('Nachteil auf Attributsproben'),
  tr('Bewegungsrate halbiert'),
  tr('Nachteil auf Angriffe und Rettungswürfe'),
  tr('Trefferpunktmaximum halbiert'),
  tr('Bewegungsrate 0'),
  tr('Tod'),
];

export function conditionRules(key, level) {
  if (key === 'exhaustion') return EXHAUSTION.slice(1, (level || 1) + 1);
  return (CONDITIONS[key]?.rules || []).map(convert); // „bis zu 1,5 m“ bzw. „within 5 ft“ in der Einheit der Kampagne
}

/** Zustände, deren Rettungswürfe auf ST und GE automatisch scheitern. */
const AUTO_FAIL_STR_DEX = ['paralyzed', 'petrified', 'stunned', 'unconscious'];

export const ABILITY_NAMES = { str: tr('ST'), dex: tr('GE'), con: tr('KO'), int: tr('IN'), wis: tr('WE'), cha: tr('CH') };
const ABILITY_WORDS = {
  str: ['str', 'strength', 'st', 'stärke'],
  dex: ['dex', 'dexterity', 'ge', 'ges', 'geschicklichkeit'],
  con: ['con', 'constitution', 'ko', 'kon', 'konstitution'],
  int: ['int', 'intelligence', 'in', 'intelligenz'],
  wis: ['wis', 'wisdom', 'we', 'wei', 'weisheit'],
  cha: ['cha', 'charisma', 'ch'],
};
const abilityFromWord = (w) => Object.entries(ABILITY_WORDS).find(([, words]) => words.includes(String(w).toLowerCase()))?.[0] || null;

/** Schadensarten mit deutschen und englischen Bezeichnungen. */
export const DAMAGE_TYPES = {
  slashing: { name: 'Hieb', words: ['slashing', 'hieb', 'hiebschaden'] },
  piercing: { name: 'Stich', words: ['piercing', 'stich', 'stichschaden'] },
  bludgeoning: { name: 'Wucht', words: ['bludgeoning', 'wucht', 'wuchtschaden'] },
  fire: { name: 'Feuer', words: ['fire', 'feuer', 'feuerschaden'] },
  cold: { name: 'Kälte', words: ['cold', 'kälte', 'kälteschaden'] },
  lightning: { name: 'Blitz', words: ['lightning', 'blitz', 'blitzschaden'] },
  thunder: { name: 'Schall', words: ['thunder', 'schall', 'schallschaden', 'donner', 'donnerschaden'] },
  acid: { name: 'Säure', words: ['acid', 'säure', 'säureschaden'] },
  poison: { name: 'Gift', words: ['poison', 'gift', 'giftschaden'] },
  necrotic: { name: 'Nekrotisch', words: ['necrotic', 'nekrotisch', 'nekrotischer', 'nekrotischen', 'nekrotischschaden'] },
  radiant: { name: 'Gleißend', words: ['radiant', 'gleißend', 'gleißender', 'gleißenden', 'gleißendschaden', 'strahlend', 'strahlender'] },
  psychic: { name: 'Psychisch', words: ['psychic', 'psychisch', 'psychischer', 'psychischen', 'psychischschaden'] },
  force: { name: 'Energie', words: ['force', 'energie', 'energieschaden', 'kraft', 'kraftschaden'] },
};
const PHYSICAL = ['slashing', 'piercing', 'bludgeoning'];

export function damageTypeFromWord(word) {
  const w = String(word || '').toLowerCase().replace(/[^a-zäöüß]/g, '');
  if (!w) return null;
  for (const [key, d] of Object.entries(DAMAGE_TYPES)) {
    if (d.words.includes(w)) return key;
  }
  // „Feuerschaden“, „Hiebschaden“ … auch mit Endungen
  for (const [key, d] of Object.entries(DAMAGE_TYPES)) {
    if (d.words.some((x) => w.startsWith(x))) return key;
  }
  return null;
}

/**
 * Resistenzen/Anfälligkeiten/Immunitäten aus Statblock-Text lesen.
 * „bludgeoning, piercing, and slashing from nonmagical attacks; cold“ → [{type, nonmagical}]
 */
export function parseDamageList(text) {
  const out = [];
  for (const group of String(text || '').split(';')) {
    const nonmagical = /nonmagical|non-magical|nichtmagisch|nicht magisch|that aren'?t silvered|that aren'?t adamantine|nicht versilbert/i.test(group);
    for (const word of group.split(/[\s,]+/)) {
      const type = damageTypeFromWord(word);
      if (type && !out.some((o) => o.type === type)) out.push({ type, nonmagical: nonmagical && PHYSICAL.includes(type) });
    }
  }
  return out;
}

const hits = (list, type, magical) => list.some((r) => r.type === type && !(r.nonmagical && magical));

/**
 * Schaden nach Resistenz/Anfälligkeit/Immunität. Rückgabe { amount, note } – note erklärt die Änderung.
 * defenses: { resist: [...], vuln: [...], immune: [...] } wie von parseDamageList
 */
export function adjustDamage(amount, type, defenses = {}, { magical = false, petrified = false } = {}) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (!type) return { amount: n, note: '' };
  if (hits(defenses.immune || [], type, magical)) return { amount: 0, note: 'immun' };
  let v = n;
  const notes = [];
  if (hits(defenses.resist || [], type, magical) || petrified) {
    v = Math.floor(v / 2);
    notes.push('resistent');
  }
  if (hits(defenses.vuln || [], type, magical)) {
    v *= 2;
    notes.push('anfällig');
  }
  return { amount: v, note: notes.join(', ') };
}

/** SG für Konzentration nach Schaden. */
export const concentrationDc = (damage) => Math.max(10, Math.floor(damage / 2));

// --- Würfel -------------------------------------------------------------------------

let random = Math.random;
/** Für Tests: eigenen Zufall setzen (Funktion → Zahl in [0,1)). */
export const setRandom = (fn) => (random = fn || Math.random);
export const d = (sides) => Math.floor(random() * sides) + 1;

/**
 * Würfelausdruck auswerten: „2d6+3“, „1W8 + 2“, „d20“, „3“. Bei crit werden die Würfel verdoppelt (nicht der Bonus).
 * Rückgabe { total, rolls, bonus, text } oder null bei ungültigem Ausdruck.
 */
export function roll(expr, { crit = false } = {}) {
  const s = String(expr || '').replace(/\s+/g, '').replace(/[−–]/g, '-').toLowerCase().replace(/w/g, 'd');
  if (!/^[0-9d+-]+$/.test(s) || !s) return null;
  const terms = s.match(/[+-]?[^+-]+/g) || [];
  let total = 0;
  let bonus = 0;
  const rolls = [];
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const t = term.replace(/^[+-]/, '');
    const m = t.match(/^(\d*)d(\d+)$/);
    if (m) {
      const count = (Number(m[1]) || 1) * (crit ? 2 : 1);
      const sides = Number(m[2]);
      if (count > 100 || sides < 1 || sides > 1000) return null;
      for (let i = 0; i < count; i++) {
        const r = d(sides);
        rolls.push(sign * r);
        total += sign * r;
      }
    } else if (/^\d+$/.test(t)) {
      bonus += sign * Number(t);
      total += sign * Number(t);
    } else {
      return null;
    }
  }
  const text = `${rolls.length ? `[${rolls.join(', ')}]` : ''}${bonus ? `${rolls.length ? ' ' : ''}${bonus > 0 && rolls.length ? '+' : ''}${bonus}` : ''}`;
  return { total, rolls, bonus, text };
}

/** W20-Wurf mit Modifikator, optional mit Vorteil/Nachteil. */
export function d20(mod = 0, mode = '') {
  const a = d(20);
  const b = mode ? d(20) : null;
  const nat = mode === 'adv' ? Math.max(a, b) : mode === 'dis' ? Math.min(a, b) : a;
  return { nat, total: nat + mod, mod, rolls: b == null ? [a] : [a, b] };
}

export const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);

// --- Statblock auslesen -------------------------------------------------------------

export const abilityMod = (score) => Math.floor((Number(score || 10) - 10) / 2);

/** Rettungswurf-Boni aus „Dex +5, Con +6“ / „Geschicklichkeit +5“; sonst Attributsmodifikator. */
export function saveBonuses(c) {
  const out = {};
  for (const k of Object.keys(ABILITY_NAMES)) out[k] = abilityMod(c?.abilities?.[k]);
  const text = String(c?.saves || '').replace(/[−–]/g, '-');
  for (const m of text.matchAll(/([A-Za-zÄÖÜäöüß]+)\.?\s*([+-])\s*(\d+)/g)) {
    const k = abilityFromWord(m[1]);
    if (k) out[k] = Number(m[3]) * (m[2] === '-' ? -1 : 1);
  }
  return out;
}

/** Abwehr einer Kreatur (für adjustDamage). */
export function defensesOf(c) {
  return {
    resist: parseDamageList(c?.resistances),
    vuln: parseDamageList(c?.vulnerabilities),
    immune: parseDamageList(c?.immunities),
  };
}

/** Zustandsimmunitäten (Schlüssel aus CONDITIONS). */
export function conditionImmunities(c) {
  const text = String(c?.conditionImmunities || '').toLowerCase();
  const words = {
    blinded: ['blinded', 'blind'], charmed: ['charmed', 'bezaubert'], deafened: ['deafened', 'taub'], frightened: ['frightened', 'verängstigt'],
    grappled: ['grappled', 'gepackt'], incapacitated: ['incapacitated', 'kampfunfähig'], invisible: ['invisible', 'unsichtbar'], paralyzed: ['paralyzed', 'gelähmt'],
    petrified: ['petrified', 'versteinert'], poisoned: ['poisoned', 'vergiftet'], prone: ['prone', 'liegend'], restrained: ['restrained', 'festgesetzt'],
    stunned: ['stunned', 'betäubt'], unconscious: ['unconscious', 'bewusstlos'], exhaustion: ['exhaustion', 'erschöpfung', 'erschöpft'],
  };
  return Object.entries(words).filter(([, ws]) => ws.some((w) => text.includes(w))).map(([k]) => k);
}

/** Absätze „**Name.** Text“ aus dem Markdown eines Statblock-Abschnitts. */
function paragraphs(md) {
  return String(md || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^\*\*(.+?)\*\*\s*(.*)$/s);
      return m ? { name: m[1].replace(/\.$/, '').trim(), text: m[2].trim() } : { name: '', text: p };
    });
}

const SAVE_RE = /(?:DC|SG)\s*(\d+)\s+([A-Za-zÄÖÜäöüß]+)/i;

/**
 * Aktionen eines Statblocks mit allem, was der Kampf-Manager würfeln kann:
 * { name, toHit, damage: [{ dice, avg, type }], save: { dc, ability }, recharge, perDay, section }
 */
export function parseActions(c) {
  const out = [];
  for (const [section, md] of [['action', c?.actions], ['bonus', c?.bonusActions], ['reaction', c?.reactions], ['legendary', c?.legendary]]) {
    for (const p of paragraphs(md)) {
      if (!p.name) continue;
      const text = p.text.replace(/[−–]/g, '-');
      const a = { name: p.name.replace(/\s*\((?:recharge|aufladung|aufladen)[^)]*\)/i, '').replace(/\s*\(\d+\s*\/\s*(?:day|tag)[^)]*\)/i, '').trim(), section, text: p.text };
      const hit = text.match(/([+-]\d+)\s*(?:to hit|auf Treffer|zum Treffen|zum Treffer)/i);
      if (hit) a.toHit = Number(hit[1]);
      const dmg = [...text.matchAll(/(\d+)\s*\(\s*(\d+\s*[dDwW]\s*\d+(?:\s*[+-]\s*\d+)?)\s*\)\s*([A-Za-zÄÖÜäöüß]+)?/g)];
      a.damage = dmg.map((m) => ({ avg: Number(m[1]), dice: m[2].replace(/\s+/g, '').replace(/[wW]/, 'd'), type: damageTypeFromWord(m[3]) }));
      const save = text.match(SAVE_RE);
      if (save) {
        const ability = abilityFromWord(save[2]);
        if (ability) a.save = { dc: Number(save[1]), ability };
      }
      const rc = (p.name + ' ' + text).replace(/[−–]/g, '-').match(/\((?:recharge|aufladung|aufladen)\s*(\d)(?:\s*-\s*6)?\)/i);
      if (rc) a.recharge = Number(rc[1]);
      const pd = p.name.match(/\((\d+)\s*\/\s*(?:day|tag)/i);
      if (pd) a.perDay = Number(pd[1]);
      if (a.toHit != null || a.damage.length || a.save) out.push(a);
      else if (a.recharge || a.perDay) out.push(a);
    }
  }
  return out;
}

/** Anzahl legendärer Aktionen pro Runde (0 = keine). */
export function legendaryActions(c) {
  const m = String(c?.legendary || '').match(/(?:take|kann|führt)\s+(\d+)\s+(?:legendary|legendäre)/i);
  return m ? Number(m[1]) : String(c?.legendary || '').trim() ? 3 : 0;
}

/** Legendäre Resistenz pro Tag (0 = keine). */
export function legendaryResistance(c) {
  const m = String(c?.traits || '').match(/(?:Legendary Resistance|Legendäre Resistenz)\s*\((\d+)\s*\/\s*(?:day|tag)/i);
  return m ? Number(m[1]) : 0;
}

/**
 * Regeneration: { amount, blockedBy: [Schadensarten] } oder null.
 * „regains 10 hit points at the start of its turn. If the troll takes acid or fire damage, this trait doesn't function…“
 */
export function regeneration(c) {
  const p = paragraphs(c?.traits).find((x) => /^(regeneration|regeneration\b|regenerieren)/i.test(x.name));
  if (!p) return null;
  const amount = Number(p.text.match(/(\d+)\s*(?:hit points|trefferpunkte|TP)/i)?.[1]);
  if (!amount) return null;
  const blockText = p.text.match(/(?:takes|erleidet|nimmt)\s+([^.]*?)\s*(?:damage|schaden)/i)?.[1] || '';
  return { amount, blockedBy: blockText.split(/[\s,]+/).map(damageTypeFromWord).filter(Boolean) };
}

/** Initiative-Bonus: GE-Modifikator. */
export const initiativeBonus = (c) => abilityMod(c?.abilities?.dex);

/** Scheitert der Rettungswurf automatisch (ST/GE bei Lähmung, Betäubung, Bewusstlosigkeit, Versteinerung)? */
export function autoFailsSave(conditions, ability) {
  return (ability === 'str' || ability === 'dex') && Object.keys(conditions || {}).some((k) => AUTO_FAIL_STR_DEX.includes(k));
}

/** Ist die Kreatur kampfunfähig (keine Aktionen/Reaktionen, Konzentration endet)? */
export const isIncapacitated = (conditions) => Object.keys(conditions || {}).some((k) => CONDITIONS[k]?.incap);
