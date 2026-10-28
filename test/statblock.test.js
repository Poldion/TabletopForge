import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatblock, fromOpen5e, sizeToCells, abilityMod } from '../public/js/statblock.js';

const GOBLIN_EN = `Goblin
Small Humanoid (Goblinoid), Neutral Evil
Armor Class 15 (Leather Armor, Shield)
Hit Points 7 (2d6)
Speed 30 ft.
STR
8 (-1)
DEX
14 (+2)
CON
10 (+0)
INT
10 (+0)
WIS
8 (-1)
CHA
8 (-1)
Skills Stealth +6
Senses Darkvision 60 ft., Passive Perception 9
Languages Common, Goblin
Challenge 1/4 (50 XP)
Proficiency Bonus +2
Nimble Escape. The goblin can take the Disengage or Hide action as a bonus action on each of its turns.
Actions
Scimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.
Shortbow. Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.`;

test('Statblock (englisch, D&D-Beyond-Format) wird erkannt', () => {
  const c = parseStatblock(GOBLIN_EN);
  assert.equal(c.name, 'Goblin');
  assert.equal(c.size, 'Small');
  assert.equal(c.type, 'Humanoid (Goblinoid)');
  assert.equal(c.alignment, 'Neutral Evil');
  assert.equal(c.ac, '15 (Leather Armor, Shield)');
  assert.equal(c.hp, 7);
  assert.equal(c.hpFormula, '2d6');
  assert.equal(c.speed, '30 ft.');
  assert.deepEqual(c.abilities, { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 });
  assert.equal(c.skills, 'Stealth +6');
  assert.equal(c.cr, '1/4');
  assert.match(c.traits, /^\*\*Nimble Escape\.\*\* The goblin/);
  assert.match(c.actions, /\*\*Scimitar\.\*\* Melee Weapon Attack/);
  assert.match(c.actions, /\*\*Shortbow\.\*\*/);
  assert.doesNotMatch(c.traits, /Proficiency/);
});

test('Statblock (deutsch, Attribute in einer Zeile) wird erkannt', () => {
  const c = parseStatblock(`Wolf
Mittelgroß Tier, gesinnungslos
Rüstungsklasse 13 (natürliche Rüstung)
Trefferpunkte 11 (2W8 + 2)
Bewegungsrate 12 m
ST GE KO IN WE CH
12 (+1) 15 (+2) 12 (+1) 3 (−4) 12 (+1) 6 (−2)
Fertigkeiten Heimlichkeit +4, Wahrnehmung +3
Sinne Passive Wahrnehmung 13
Sprachen –
Herausforderung 1/4 (50 EP)
Rudeltaktik. Der Wolf ist bei Angriffswürfen im Vorteil.
Aktionen
Biss. Nahkampf-Waffenangriff: +4 auf Treffer.`);
  assert.equal(c.name, 'Wolf');
  assert.equal(c.size, 'Medium');
  assert.equal(c.hp, 11);
  assert.equal(c.ac, '13 (natürliche Rüstung)');
  assert.deepEqual(c.abilities, { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 });
  assert.equal(c.cr, '1/4');
  assert.match(c.traits, /\*\*Rudeltaktik\.\*\*/);
  assert.match(c.actions, /\*\*Biss\.\*\*/);
});

test('Open5e-Datensatz wird übernommen', () => {
  const c = fromOpen5e({
    name: 'Goblin',
    size: 'Small',
    type: 'humanoid',
    subtype: 'goblinoid',
    alignment: 'neutral evil',
    armor_class: 15,
    armor_desc: 'leather armor, shield',
    hit_points: 7,
    hit_dice: '2d6',
    speed: { walk: 30 },
    strength: 8,
    dexterity: 14,
    constitution: 10,
    intelligence: 10,
    wisdom: 8,
    charisma: 8,
    skills: { stealth: 6 },
    senses: 'darkvision 60 ft., passive Perception 9',
    languages: 'Common, Goblin',
    challenge_rating: '1/4',
    actions: [{ name: 'Scimitar', desc: 'Melee Weapon Attack' }],
    special_abilities: [{ name: 'Nimble Escape', desc: 'Disengage or Hide' }],
    document__title: 'Systems Reference Document',
  });
  assert.equal(c.ac, '15 (leather armor, shield)');
  assert.equal(c.speed, '30 ft.');
  assert.equal(c.skills, 'Stealth +6');
  assert.equal(c.abilities.dex, 14);
  assert.match(c.actions, /\*\*Scimitar\.\*\*/);
  assert.match(c.source, /Systems Reference Document/);
});

test('Größe und Modifikatoren', () => {
  assert.equal(sizeToCells('Large'), 2);
  assert.equal(sizeToCells('Groß'), 2);
  assert.equal(sizeToCells('tiny'), 0.5);
  assert.equal(abilityMod(14), 2);
  assert.equal(abilityMod(7), -2);
});
