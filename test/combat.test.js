import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOps } from '../shared/ops.js';
import { setRandom } from '../public/js/rules5e.js';
import * as C from '../public/js/combat.js';

/** Würfel mit fester Folge (Werte 1–n je Wurf: gibt für W20 genau diese Zahl). */
function dice(...values) {
  const queue = [...values];
  // d(sides) = floor(r * sides) + 1 → r so wählen, dass der gewünschte Wert herauskommt
  let sides = 20;
  setRandom(() => (queue.length ? (queue.shift() - 0.5) / sides : 0.5));
  return { forSides: (s) => (sides = s) };
}

const troll = {
  id: 'troll', kind: 'monster', name: 'Troll', hp: 84, ac: '15', abilities: { dex: 13, con: 20 }, saves: '',
  resistances: '', immunities: '', conditionImmunities: '',
  traits: '**Regeneration.** The troll regains 10 hit points at the start of its turn. If the troll takes acid or fire damage, this trait doesn\'t function at the start of the troll\'s next turn.',
  actions: '**Bite.** Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 7 (1d6 + 4) piercing damage.',
};
const dragon = {
  id: 'dragon', kind: 'monster', name: 'Drache', hp: 100, ac: '18', abilities: { dex: 10, con: 18 }, saves: 'Con +8',
  resistances: 'bludgeoning, piercing, and slashing from nonmagical attacks', immunities: 'fire', conditionImmunities: 'frightened',
  actions: '**Fire Breath (Recharge 5–6).** Each creature must make a DC 15 Dexterity saving throw, taking 45 (10d8) fire damage.',
  legendary: 'The dragon can take 3 legendary actions.',
  traits: '**Legendary Resistance (3/Day).** If the dragon fails a saving throw, it can choose to succeed instead.',
};

function world() {
  return {
    initiative: C.emptyCombat(),
    creatures: { troll, dragon },
    maps: { m1: { id: 'm1', tokens: { t1: { id: 't1', name: 'Troll', hp: 84, maxHp: 84 } } } },
  };
}

/** Transaktion ausführen und Ops auf den Zustand anwenden (wie sync.do). */
function run(st, fn) {
  const tx = C.begin(st);
  const r = fn(tx);
  applyOps(st, tx.ops);
  return { tx, r };
}

test('Schaden: Resistenz, Immunität, magische Waffen, temporäre TP', () => {
  const st = world();
  let id;
  run(st, (tx) => (id = C.addCombatant(tx, { creatureId: 'dragon', kind: 'enemy', init: 10 })));
  run(st, (tx) => C.damage(tx, id, 20, 'slashing'));
  assert.equal(C.hpOf(st, st.initiative.entries[id]).hp, 90, 'nichtmagischer Hieb halbiert');
  run(st, (tx) => C.damage(tx, id, 20, 'slashing', { magical: true }));
  assert.equal(C.hpOf(st, st.initiative.entries[id]).hp, 70, 'magischer Hieb voll');
  run(st, (tx) => C.damage(tx, id, 30, 'fire'));
  assert.equal(C.hpOf(st, st.initiative.entries[id]).hp, 70, 'immun gegen Feuer');
  run(st, (tx) => C.setTempHp(tx, id, 10));
  run(st, (tx) => C.setTempHp(tx, id, 5));
  assert.equal(st.initiative.entries[id].tempHp, 10, 'temporäre TP stapeln sich nicht');
  run(st, (tx) => C.damage(tx, id, 14, 'cold'));
  assert.equal(st.initiative.entries[id].tempHp, 0);
  assert.equal(C.hpOf(st, st.initiative.entries[id]).hp, 66, 'erst temporäre TP, dann echte');
});

test('Token-TP werden mitgeführt, Monster bei 0 TP besiegt', () => {
  const st = world();
  let id;
  run(st, (tx) => (id = C.addCombatant(tx, { creatureId: 'troll', tokenId: 't1', kind: 'enemy', init: 12 })));
  run(st, (tx) => C.damage(tx, id, 30, 'slashing'));
  assert.equal(st.maps.m1.tokens.t1.hp, 54);
  run(st, (tx) => C.damage(tx, id, 99, 'slashing'));
  assert.equal(st.maps.m1.tokens.t1.hp, 0);
  assert.equal(st.maps.m1.tokens.t1.dead, true);
  assert.equal(st.initiative.entries[id].dead, true);
});

test('Spielercharakter: bewusstlos, Todesrettungswürfe, Heilung, Massivschaden', () => {
  const st = world();
  let pc;
  run(st, (tx) => (pc = C.addCombatant(tx, { name: 'Mira', kind: 'pc', hp: 12, maxHp: 12, init: 15 })));
  run(st, (tx) => C.damage(tx, pc, 15));
  let e = st.initiative.entries[pc];
  assert.equal(C.hpOf(st, e).hp, 0);
  assert.ok(e.conditions.unconscious && e.conditions.prone, 'bewusstlos und liegend');
  assert.equal(e.dead, false);
  run(st, (tx) => C.damage(tx, pc, 3, 'slashing', { crit: true }));
  assert.equal(st.initiative.entries[pc].death.f, 2, 'kritischer Treffer bei 0 TP = zwei Fehlschläge');
  run(st, (tx) => C.deathSave(tx, pc, 14));
  assert.equal(st.initiative.entries[pc].death.s, 1);
  run(st, (tx) => C.heal(tx, pc, 5));
  e = st.initiative.entries[pc];
  assert.equal(C.hpOf(st, e).hp, 5);
  assert.ok(!e.conditions.unconscious && e.conditions.prone, 'wach, aber noch liegend');
  assert.deepEqual(e.death, { s: 0, f: 0 });
  run(st, (tx) => C.damage(tx, pc, 17));
  assert.equal(st.initiative.entries[pc].dead, true, '5 TP, 17 Schaden: 12 Überhang ≥ 12 Maximum → sofort tot');
});

test('Todesrettungswurf 20 und drei Fehlschläge', () => {
  const st = world();
  let pc;
  run(st, (tx) => (pc = C.addCombatant(tx, { name: 'Bo', kind: 'pc', hp: 10, maxHp: 10, init: 5 })));
  run(st, (tx) => C.damage(tx, pc, 10));
  run(st, (tx) => C.deathSave(tx, pc, 20));
  assert.equal(C.hpOf(st, st.initiative.entries[pc]).hp, 1);
  run(st, (tx) => C.damage(tx, pc, 1));
  run(st, (tx) => C.deathSave(tx, pc, 1));
  run(st, (tx) => C.deathSave(tx, pc, 3));
  assert.equal(st.initiative.entries[pc].dead, true);
});

test('Konzentration: Monster würfelt selbst, Spieler bekommt eine Abfrage', () => {
  const st = world();
  let pc, mob;
  run(st, (tx) => {
    pc = C.addCombatant(tx, { name: 'Mira', kind: 'pc', hp: 30, maxHp: 30, init: 15 });
    mob = C.addCombatant(tx, { creatureId: 'dragon', kind: 'enemy', init: 10 });
  });
  run(st, (tx) => C.setConcentration(tx, pc, 'Segen'));
  run(st, (tx) => C.damage(tx, pc, 24));
  const prompts = Object.values(st.initiative.prompts);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].dc, 12, 'SG = halber Schaden, mindestens 10');
  run(st, (tx) => C.resolvePrompt(tx, prompts[0].id, 'fail'));
  assert.equal(st.initiative.entries[pc].concentration, null);

  run(st, (tx) => C.setConcentration(tx, mob, 'Nebel'));
  dice(1); // natürliche 1 → misslungen
  run(st, (tx) => C.damage(tx, mob, 10, 'cold'));
  assert.equal(st.initiative.entries[mob].concentration, null);
  setRandom();
});

test('Zustände: Dauer, Rettungswurf am Zugende, Immunität, Kampfunfähigkeit beendet Konzentration', () => {
  const st = world();
  let a, b;
  run(st, (tx) => {
    a = C.addCombatant(tx, { creatureId: 'troll', kind: 'enemy', init: 20 });
    b = C.addCombatant(tx, { creatureId: 'dragon', kind: 'enemy', init: 10 });
  });
  run(st, (tx) => C.addCondition(tx, b, 'frightened'));
  assert.equal(st.initiative.entries[b].conditions.frightened, undefined, 'Drache ist immun gegen Angst');
  run(st, (tx) => C.addCondition(tx, a, 'poisoned', { rounds: 1, ends: 'end' }));
  run(st, (tx) => C.addCondition(tx, a, 'restrained', { save: { ability: 'str', dc: 30 } }));
  run(st, (tx) => C.setConcentration(tx, b, 'Nebel'));
  run(st, (tx) => C.addCondition(tx, b, 'stunned'));
  assert.equal(st.initiative.entries[b].concentration, null);

  run(st, (tx) => C.startCombat(tx));
  assert.equal(st.initiative.activeId, a);
  dice(5);
  run(st, (tx) => C.nextTurn(tx)); // Ende Troll-Zug: Gift endet, RW gegen SG 30 misslingt
  assert.equal(st.initiative.entries[a].conditions.poisoned, undefined);
  assert.ok(st.initiative.entries[a].conditions.restrained);
  assert.equal(st.initiative.activeId, b);
  setRandom();
});

test('Zugwechsel: tote Monster werden übersprungen, Runde zählt hoch, Reaktion/legendäre Aktionen zurückgesetzt', () => {
  const st = world();
  let a, b, c;
  run(st, (tx) => {
    a = C.addCombatant(tx, { name: 'A', kind: 'pc', hp: 10, maxHp: 10, init: 20 });
    b = C.addCombatant(tx, { creatureId: 'troll', kind: 'enemy', init: 15 });
    c = C.addCombatant(tx, { creatureId: 'dragon', kind: 'enemy', init: 10 });
  });
  run(st, (tx) => C.startCombat(tx));
  run(st, (tx) => C.damage(tx, b, 500));
  run(st, (tx) => C.nextTurn(tx));
  assert.equal(st.initiative.activeId, c, 'toter Troll übersprungen');
  run(st, (tx) => C.useLegendary(tx, c, 2));
  run(st, (tx) => C.toggleReaction(tx, a));
  run(st, (tx) => C.nextTurn(tx));
  assert.equal(st.initiative.round, 2);
  assert.equal(st.initiative.activeId, a);
  assert.equal(st.initiative.entries[a].reactionUsed, false, 'Reaktion zu Zugbeginn wieder frei');
  run(st, (tx) => C.nextTurn(tx));
  assert.equal(st.initiative.entries[c].legendary.used, 0, 'legendäre Aktionen zu Zugbeginn zurückgesetzt');
});

test('Aufladung und Regeneration zu Zugbeginn', () => {
  const st = world();
  let t, dr;
  run(st, (tx) => {
    t = C.addCombatant(tx, { creatureId: 'troll', tokenId: 't1', kind: 'enemy', init: 20 });
    dr = C.addCombatant(tx, { creatureId: 'dragon', kind: 'enemy', init: 10 });
  });
  run(st, (tx) => C.startCombat(tx));
  run(st, (tx) => C.useRecharge(tx, dr, 'Fire Breath'));
  run(st, (tx) => C.damage(tx, t, 30, 'fire'));
  assert.equal(st.initiative.entries[t].regenBlocked, true);
  dice(6).forSides(6);
  run(st, (tx) => C.nextTurn(tx)); // Drache: W6 = 6 → Odem wieder bereit
  assert.equal(st.initiative.entries[dr].recharge['Fire Breath'], true);
  setRandom();
  run(st, (tx) => C.nextTurn(tx)); // Troll: Regeneration blockiert (Feuer)
  assert.equal(st.maps.m1.tokens.t1.hp, 54);
  assert.equal(st.initiative.entries[t].regenBlocked, false);
  run(st, (tx) => C.nextTurn(tx));
  run(st, (tx) => C.nextTurn(tx)); // Troll erneut: regeneriert 10
  assert.equal(st.maps.m1.tokens.t1.hp, 64);
});

test('Ältere Initiative-Einträge werden ergänzt', () => {
  const st = world();
  st.initiative = { round: 1, activeId: null, entries: { x: { id: 'x', name: 'Alt', init: 3, hp: 5, maxHp: 5, kind: 'pc' } } };
  const tx = C.begin(st);
  applyOps(st, tx.ops);
  assert.deepEqual(st.initiative.entries.x.conditions, {});
  assert.deepEqual(st.initiative.prompts, {});
  run(st, (tx2) => C.addCondition(tx2, 'x', 'prone'));
  assert.ok(st.initiative.entries.x.conditions.prone);
});
