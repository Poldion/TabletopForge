// Porträts und Tokens gehören zur Figur – bei den Handouts nur, wenn ausdrücklich gewünscht
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHandout, characterImageIds } from '../public/js/components.js';

test('Porträts und Tokens erscheinen nicht automatisch bei den Handouts', () => {
  const st = {
    assets: { brief: { id: 'brief' }, por: { id: 'por' }, tok: { id: 'tok' }, ki: { id: 'ki', use: 'token' }, pc: { id: 'pc' }, gezeigt: { id: 'gezeigt', handout: true } },
    creatures: { c: { id: 'c', portraitAssetId: 'por', tokenAssetId: 'tok' }, d: { id: 'd', portraitAssetId: 'gezeigt' } },
    party: { members: [{ id: 'm', portraitAssetId: 'pc' }] },
  };
  const ids = characterImageIds(st);
  assert.deepEqual([...ids].sort(), ['gezeigt', 'pc', 'por', 'tok']);
  const shown = Object.values(st.assets).filter((a) => isHandout(st, a, ids)).map((a) => a.id).sort();
  assert.deepEqual(shown, ['brief', 'gezeigt'], 'normales Handout und ausdrücklich freigegebenes Porträt');
});
