// Zufallsbegegnungen: passender Herausforderungsgrad und Anzahl der Gegner für die Gruppe
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balance, crRange, targetBand, evaluate } from '../public/js/encounter.js';

const group = (n, lvl) => Array(n).fill(lvl);

test('Spanne der Schwierigkeit folgt den Schwellen der Gruppe', () => {
  assert.deepEqual(targetBand(group(4, 1), 'easy'), [100, 200]);
  assert.deepEqual(targetBand(group(4, 1), 'medium'), [200, 300]);
  assert.deepEqual(targetBand(group(4, 5), 'hard'), [3000, 4400]);
});

test('Herausforderungsgrad wächst mit der Stufe', () => {
  const [, low] = crRange(group(4, 1), 'medium');
  const [, high] = crRange(group(4, 10), 'medium');
  assert.ok(low <= 1, `Stufe 1: höchstens HG 1, war ${low}`);
  assert.ok(high >= 7, `Stufe 10: mindestens HG 7, war ${high}`);
});

test('Anzahl wird auf die gewünschte Schwierigkeit gebracht', () => {
  for (const [lvl, target] of [[1, 'easy'], [1, 'medium'], [3, 'hard'], [5, 'deadly'], [8, 'medium']]) {
    const levels = group(4, lvl);
    const r = balance([{ name: 'Goblin', cr: '1/4', count: 1 }, { name: 'Hobgoblin', cr: '1/2', count: 1 }], levels, target);
    if (lvl <= 3) assert.ok(r.fits, `Stufe ${lvl}, ${target}: ${r.result.adjusted} EP`);
    assert.equal(r.result.difficulty.key, r.fits ? target : r.result.difficulty.key);
  }
  // zu viele starke Gegner werden reduziert
  const r = balance([{ cr: '5', count: 4 }], group(4, 2), 'medium');
  assert.ok(r.result.adjusted < targetBand(group(4, 2), 'medium')[1] || r.items[0].count === 1);
});

test('NSCs ohne Herausforderungsgrad bleiben erhalten', () => {
  const r = balance([{ name: 'Wirt', cr: '', count: 1 }, { cr: '1/4', count: 1 }], group(4, 1), 'medium');
  assert.ok(r.items.some((x) => x.name === 'Wirt'));
  assert.equal(evaluate(r.items, group(4, 1)).difficulty.key, 'medium');
});

test('Lücke wird mit verwandten Gegnern gefüllt, sonst lieber zu leicht als zu schwer', () => {
  const levels = group(3, 1); // schwer = 225–299 EP; nur Goblins: 150 oder 300
  const only = balance([{ name: 'Goblin', cr: '1/4', count: 3 }], levels, 'hard');
  assert.ok(only.result.adjusted < 300, `ohne Verwandte nicht tödlich: ${only.result.adjusted}`);
  const mixed = balance([{ name: 'Goblin', cr: '1/4', count: 3 }], levels, 'hard', [{ name: 'Hobgoblin', cr: '1/2' }, { name: 'Bugbear', cr: '1' }]);
  assert.ok(mixed.fits, `mit Verwandten passend: ${mixed.result.adjusted}`);
  assert.equal(mixed.result.difficulty.key, 'hard');
});
