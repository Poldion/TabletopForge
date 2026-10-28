// Zuordnung zu Abenteuern: einmalige Zuordnung bestehender Kampagnen und Filter
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateScopes, inAdventure, membershipOp, scoped } from '../shared/scope.js';

const campaign = (advs) => ({
  adventures: Object.fromEntries(advs.map((a) => [a, { id: a }])),
  sessions: { s1: { id: 's1', adventureId: 'a1', mapIds: ['m1'], assetIds: ['h1'], loreIds: ['l1'] } },
  maps: { m1: { id: 'm1', assetId: 'img1', handoutIds: ['h2'] }, m2: { id: 'm2', assetId: 'img2' } },
  assets: { img1: { id: 'img1' }, img2: { id: 'img2' }, h1: { id: 'h1' }, h2: { id: 'h2' }, x: { id: 'x' } },
  lore: { l1: { id: 'l1' }, l2: { id: 'l2', mapIds: ['m1'] }, l3: { id: 'l3' } },
  creatures: { c1: { id: 'c1' } },
  encounters: {},
});

test('ein Abenteuer: alles gehört dazu', () => {
  const st = campaign(['a1']);
  assert.equal(migrateScopes(st), true);
  for (const coll of ['maps', 'assets', 'lore', 'creatures']) for (const x of Object.values(st[coll])) assert.deepEqual(x.adventureIds, ['a1'], `${coll}/${x.id}`);
  assert.equal(migrateScopes(st), false, 'nur einmal');
});

test('mehrere Abenteuer: was die Sessions verknüpfen', () => {
  const st = campaign(['a1', 'a2']);
  migrateScopes(st);
  const ids = (coll) => Object.values(st[coll]).filter((x) => inAdventure(x, 'a1')).map((x) => x.id).sort();
  assert.deepEqual(ids('maps'), ['m1']);
  assert.deepEqual(ids('assets'), ['h1', 'h2', 'img1']);
  assert.deepEqual(ids('lore'), ['l1', 'l2']);
  assert.deepEqual(scoped(st, 'creatures', 'a1'), []);
  assert.equal(st.assets.x.adventureIds, undefined, 'nicht zugeordnet bleibt nicht zugeordnet');
});

test('Zugehörigkeit umschalten', () => {
  const st = campaign(['a1', 'a2']);
  migrateScopes(st);
  const op = membershipOp(st, 'maps', 'm1', 'a2', true);
  assert.deepEqual(op, { t: 'set', p: ['maps', 'm1', 'adventureIds'], v: ['a1', 'a2'] });
  assert.deepEqual(membershipOp(st, 'maps', 'm1', 'a1', false).v, []);
  assert.equal(inAdventure({}, null), true, 'ohne Abenteuer gilt alles');
});

test('offene Szenen in die nächste Session schieben', async () => {
  const { applyOps } = await import('../shared/ops.js');
  const { carryOverOps, scenesOf } = await import('../shared/sessions.js');
  const state = {
    display: { sessionId: 's1' },
    sessions: {
      s1: { id: 's1', adventureId: 'a', order: 1, status: 'active', mapIds: [], assetIds: [], scenes: { x: { id: 'x', order: 1, status: 'done' }, y: { id: 'y', order: 2, status: 'open', mapId: 'm1', assetIds: ['h1'] } } },
      s2: { id: 's2', adventureId: 'a', order: 2, status: 'planned', mapIds: ['m2'], assetIds: [], scenes: { z: { id: 'z', order: 1, status: 'open' } } },
      other: { id: 'other', adventureId: 'b', order: 5, status: 'planned', scenes: {} },
    },
  };
  // ältere Ziel-Session ohne Szenen-Sammlung
  const old = structuredClone(state);
  delete old.sessions.s2.scenes;
  const r0 = carryOverOps(old, 's1', () => 'neu');
  applyOps(old, r0.ops);
  assert.deepEqual(Object.keys(old.sessions.s2.scenes), ['y']);
  const r = carryOverOps(state, 's1', () => 'neu');
  applyOps(state, r.ops);
  assert.equal(r.target, 's2', 'nächste geplante Session desselben Abenteuers');
  assert.deepEqual(scenesOf(state.sessions.s2).map((x) => x.id), ['y', 'z'], 'übernommene Szene steht vorn');
  assert.ok(state.sessions.s2.scenes.y.carried);
  assert.equal(state.sessions.s1.scenes.y, undefined);
  assert.equal(state.sessions.s1.status, 'done');
  assert.deepEqual(state.sessions.s2.mapIds.sort(), ['m1', 'm2']);
  assert.deepEqual(state.sessions.s2.assetIds, ['h1']);
  assert.equal(state.display.sessionId, 's2');
  assert.equal(carryOverOps(state, 's1', () => 'x'), null, 'nichts mehr offen');
  // ohne geplante Session: neue anlegen
  const r2 = carryOverOps(state, 's2', () => 'neu');
  applyOps(state, r2.ops);
  assert.equal(r2.target, 'neu');
  assert.equal(state.sessions.neu.adventureId, 'a');
  assert.equal(Object.keys(state.sessions.neu.scenes).length, 2);
});
