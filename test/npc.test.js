import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateNpc, npcName, npcBackground, templateForRole, ROLLERS, FIELD_LABELS } from '../public/js/npc-gen.js';
import { toEnglishQuery, germanName } from '../public/js/monster-names-de.js';

test('NSC-Generator füllt alle Felder und respektiert Vorgaben', () => {
  for (let i = 0; i < 200; i++) {
    const n = generateNpc({ people: 'dwarf', gender: 'w' });
    assert.equal(n.people, 'dwarf');
    for (const key of Object.keys(FIELD_LABELS)) assert.ok(n[key], `Feld ${key} leer`);
    assert.ok(n.template);
    assert.ok(npcName(n).length > 2);
  }
  assert.equal(templateForRole('Stadtwache'), 'guard');
  assert.equal(templateForRole('unbekannt'), 'commoner');
  assert.match(npcBackground(generateNpc()), /\*\*Geheimnis:\*\*/);
  assert.equal(Object.keys(ROLLERS).length, Object.keys(FIELD_LABELS).length);
});

test('Deutsche Monstersuche wird übersetzt', () => {
  assert.equal(toEnglishQuery('Eulenbär'), 'Owlbear');
  assert.equal(toEnglishQuery('eulen'), 'Owlbear');
  assert.equal(toEnglishQuery('Skelett'), 'Skeleton');
  assert.equal(toEnglishQuery('roter Drache'), 'red dragon');
  assert.equal(toEnglishQuery('junger blauer Drache'), 'young blue dragon');
  assert.equal(toEnglishQuery('Drache'), 'dragon');
  assert.equal(toEnglishQuery('goblin'), 'Goblin');
  assert.equal(toEnglishQuery('beholder'), 'beholder');
  assert.equal(germanName('Gelatinous Cube'), 'Gallertwürfel');
});
