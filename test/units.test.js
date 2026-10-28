import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDist, toFeet, distValue, convertText, unitsOf, distStep } from '../shared/units.js';

test('Entfernungen: 5 ft = 1,5 m (deutsche Regelwerke), Eingabe zurück in Fuß', () => {
  assert.equal(fmtDist(5, 'metric', 'de'), '1,5 m');
  assert.equal(fmtDist(30, 'metric', 'de'), '9 m');
  assert.equal(fmtDist(30, 'metric', 'en'), '9 m');
  assert.equal(fmtDist(60, 'imperial', 'en'), '60 ft');
  assert.equal(distValue(15, 'metric'), 4.5);
  assert.equal(toFeet('1,5', 'metric'), 5);
  assert.equal(toFeet(9, 'metric'), 30);
  assert.equal(toFeet(20, 'imperial'), 20);
  assert.equal(distStep('metric'), 1.5);
});

test('Einheitensystem: Einstellung der Kampagne, sonst nach Sprache', () => {
  assert.equal(unitsOf({ units: 'imperial' }, 'de'), 'imperial');
  assert.equal(unitsOf({}, 'de'), 'metric');
  assert.equal(unitsOf({}, 'en'), 'imperial');
});

test('Statblock-Texte metrisch', () => {
  assert.equal(convertText('Melee Weapon Attack: +7 to hit, reach 5 ft., one target.', 'metric', 'de'), 'Melee Weapon Attack: +7 to hit, reach 1,5 m, one target.');
  assert.equal(convertText('range 80/320 ft.', 'metric', 'de'), 'range 24/96 m'); // Abkürzungspunkt am Ende entfällt
  assert.equal(convertText('Speed 40 ft.', 'metric', 'en'), 'Speed 12 m');
  assert.equal(convertText('within 30 ft. of it', 'metric', 'en'), 'within 9 m. of it');
  assert.equal(convertText('darkvision 60 ft., passive Perception 13', 'metric', 'de'), 'darkvision 18 m, passive Perception 13');
  assert.equal(convertText('each creature in a 20-foot cube', 'metric', 'en'), 'each creature in a 6-m cube');
  assert.equal(convertText('travels 24 miles a day, carries 50 lb.', 'metric', 'de'), 'travels 36 km a day, carries 25 kg');
  assert.equal(convertText('Bewegungsrate 9 m', 'metric', 'de'), 'Bewegungsrate 9 m'); // schon metrisch
  assert.equal(convertText('carries 50 lbx and 2 mix', 'metric', 'de'), 'carries 50 lbx and 2 mix'); // keine Fehltreffer
  assert.equal(convertText('weighs 10 lb, costs', 'metric', 'de'), 'weighs 5 kg, costs');
});

test('Statblock-Texte imperial (z.B. aus deutschen Statblöcken)', () => {
  assert.equal(convertText('Bewegungsrate 9 m, Klettern 6 m', 'imperial', 'en'), 'Bewegungsrate 30 ft., Klettern 20 ft.');
  assert.equal(convertText('Reichweite 1,5 m', 'imperial', 'de'), 'Reichweite 5 ft.');
  assert.equal(convertText('Speed 30 ft.', 'imperial', 'en'), 'Speed 30 ft.'); // unverändert
  assert.equal(convertText('3 mm Stärke, 2 min', 'imperial', 'en'), '3 mm Stärke, 2 min'); // keine Fehltreffer
});
