import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Eigener, leerer Datenordner – der Store liest DATA_DIR beim Import
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-demo-'));
const store = await import('../server/store.js');
const { createDemoCampaign } = await import('../server/demo/demo.js');

test('Beispielkampagne: nur einmal, vollständig und verknüpft', () => {
  assert.equal(createDemoCampaign(store, '0'), null);
  const id = createDemoCampaign(store, 'en');
  assert.ok(id);
  const st = store.getCampaign(id);
  assert.match(st.name, /^Example/);
  const [adv] = Object.keys(st.adventures);
  const sess = st.sessions[st.display.sessionId];
  assert.equal(sess.adventureId, adv);
  assert.equal(Object.keys(sess.scenes).length, 3);
  assert.equal(st.party.members.length, 3);
  for (const m of st.party.members) assert.ok(st.assets[m.portraitAssetId]);
  for (const a of Object.values(st.assets)) assert.ok(fs.existsSync(path.join(store.uploadsDir(id), a.file)), a.file);
  const map = st.maps[st.display.table.mapId];
  assert.ok(st.assets[map.assetId]);
  for (const sc of Object.values(sess.scenes)) assert.equal(sc.mapId, map.id);
  const enc = Object.values(st.encounters)[0];
  for (const it of enc.items) assert.ok(st.creatures[it.creatureId]);
  for (const coll of ['maps', 'assets', 'lore', 'creatures', 'encounters']) for (const x of Object.values(st[coll])) assert.deepEqual(x.adventureIds, [adv], `${coll}/${x.id}`);
  // Zweiter Start: nichts Neues
  assert.equal(createDemoCampaign(store, 'en'), null);
  assert.equal(store.listCampaigns().length, 1);
});
