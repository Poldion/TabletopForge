// NSC-Generator: deutsch und englisch gleich aufgebaut, Werte-Vorlagen in beiden Sprachen auffindbar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateNpc, npcBackground, templateForRole, PEOPLE_LABELS_ALL, ROLES } from '../public/js/npc-gen.js';
import { EN } from '../public/js/npc-gen-en.js';

test('englische Tabellen haben dieselbe Struktur wie die deutschen', () => {
  assert.deepEqual(Object.keys(EN.PEOPLES), Object.keys(PEOPLE_LABELS_ALL));
  for (const k of Object.keys(EN.NAMES)) for (const g of ['m', 'w', 'last']) assert.ok(EN.NAMES[k][g].length > 3, `${k}.${g}`);
  assert.equal(EN.ROLES.length, ROLES.length, 'gleich viele Rollen');
  assert.deepEqual(EN.ROLES.map((r) => r[1]), ROLES.map((r) => r[1]), 'gleiche Werte-Vorlagen je Rolle');
});

test('Werte-Vorlage einer Rolle in beiden Sprachen', () => {
  assert.equal(templateForRole('Hauptmann der Wache'), 'veteran');
  assert.equal(templateForRole('Captain of the guard'), 'veteran');
  assert.equal(templateForRole('Unbekannt'), 'commoner');
});

test('gewürfelter NSC hat alle Felder und einen Hintergrundtext', () => {
  const n = generateNpc({ people: 'dwarf', gender: 'w' }, () => 0.42);
  for (const k of ['firstName', 'lastName', 'age', 'role', 'appearance', 'secret', 'template']) assert.ok(n[k], k);
  assert.match(npcBackground(n), /\*\*.+:\*\* /);
});
