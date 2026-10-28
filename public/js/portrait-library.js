// Porträt-Bibliothek: fertige Bilder (public/portraits/<paket>/portraits.json), getaggt nach Volk und Geschlecht.
// Enthalten: „Fantasy Character Portraits vol.1“ von orchidrabbit (remy ripple), CC BY 4.0.
import { tr } from './i18n.js';

const PACKS = ['orchidrabbit'];
let cache = null;

/** Alle Porträts aller Pakete: [{ url, race, gender, old, credit, label }] */
export async function loadLibrary() {
  if (cache) return cache;
  const all = [];
  for (const id of PACKS) {
    try {
      const m = await (await fetch(`/portraits/${id}/portraits.json`)).json();
      for (const p of m.portraits) {
        all.push({ ...p, url: `/portraits/${id}/${p.file}`, credit: `${m.artist}, ${m.license}`, label: p.file.replace(/\.png$/, '') });
      }
    } catch {
      /* Paket fehlt – Bibliothek bleibt kleiner */
    }
  }
  cache = all;
  return all;
}

/** Bibliotheks-Völker zu den Völkern des NSC-Generators. */
const RACES_FOR = {
  human: ['human'],
  elf: ['elf'],
  halfelf: ['elf', 'human'],
  dwarf: ['dwarf'],
  halfling: ['halfling'],
  gnome: ['halfling'],
  halforc: ['orc', 'hobgoblin'],
  tiefling: ['tiefling'],
  dragonborn: ['dragonborn', 'kobold'],
};

export const RACE_LABELS = {
  human: tr('Mensch'), elf: tr('Elf'), dwarf: tr('Zwerg'), halfling: tr('Halbling'), tiefling: tr('Tiefling'), orc: tr('Ork'), hobgoblin: tr('Hobgoblin'),
  goblin: tr('Goblin'), kobold: tr('Kobold'), genasi: tr('Genasi'), giant: tr('Riese / Goliath'), dragonborn: tr('Drachenblütiger'), dragon: tr('Drache'), oni: tr('Oni'), satyr: tr('Satyr'),
};

/** Passende Bibliotheksbilder für einen NSC (Volk, Geschlecht w/m/d) – ältere zuerst, wenn der NSC alt ist. */
export function matchLibrary(lib, { people, gender, age } = {}) {
  const races = RACES_FOR[people] || [people];
  const old = /alt|älter/.test(age || '');
  return lib
    .filter((p) => races.includes(p.race) && (!p.gender || gender === 'd' || !gender || p.gender === gender))
    .sort((a, b) => (old ? Number(b.old) - Number(a.old) : 0) || races.indexOf(a.race) - races.indexOf(b.race));
}

/** Für Monster: Bibliotheksbilder, deren Volk im Namen/Typ der Kreatur vorkommt (z.B. „Goblin“, „Red Dragon“). */
export function matchCreature(lib, c) {
  const words = { dragon: ['dragon', 'drache'], goblin: ['goblin'], hobgoblin: ['hobgoblin'], kobold: ['kobold'], orc: ['orc', 'ork'], giant: ['giant', 'riese', 'goliath'], oni: ['oni'], satyr: ['satyr'], genasi: ['genasi'], dragonborn: ['dragonborn', 'drachenblüt'], tiefling: ['tiefling'], dwarf: ['dwarf', 'zwerg'], elf: ['elf', 'drow'], halfling: ['halfling', 'halbling'], human: ['human', 'mensch'] };
  // Erst der Name („Red Dragon“, „Goblin Boss“), dann der Typ – dort nur ganze Wörter („Humanoid“ ist kein Mensch)
  const find = (text, whole) =>
    Object.entries(words)
      .filter(([, ws]) => ws.some((w) => new RegExp(`(^|[^a-zäöü])${w}${whole ? '($|[^a-zäöü])' : ''}`, 'i').test(text)))
      .map(([r]) => r);
  let hit = find(String(c?.name || ''), false);
  if (!hit.length) hit = find(String(c?.type || ''), true);
  // Humanoide ohne bestimmtes Volk (Bandit, Wache, Kultist …): Menschen vorschlagen
  if (!hit.length && /humanoid/i.test(String(c?.type || ''))) hit = ['human'];
  return lib.filter((p) => hit.includes(p.race));
}
