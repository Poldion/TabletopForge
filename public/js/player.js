// Spieler-Display (Facing Screen): Handouts, Lore, Stimmungsbilder und Übersichtskarten.
import { $, $$, param, fileUrl, markdown, preloadImage } from './util.js';
import { Sync, touches } from './sync.js';
import { MapRenderer } from './maprender.js';
import { setupDisplayChrome, connectionBadge } from './display.js';
import { followCampaignLanguage } from './i18n.js';
import { useCampaignUnits } from './units-ui.js';

const campaignId = param('c');
setupDisplayChrome();

const sync = new Sync(campaignId, 'player');
await sync.connect();
// Anzeigen sprechen die Sprache der Kampagne (in der Spielleitung unter „Kampagne“ einstellbar)
followCampaignLanguage(sync.state.display?.lang);
useCampaignUnits(sync.state);
sync.on(() => useCampaignUnits(sync.state));
sync.on(() => followCampaignLanguage(sync.state.display?.lang));
connectionBadge(sync);

const renderer = new MapRenderer($('#mapCanvas'), { mode: 'player', campaignId, getState: () => sync.state });

let lastKey = '';

function show(id) {
  for (const el of $$('.layer')) el.classList.toggle('on', el.id === id);
}

function update() {
  const st = sync.state;
  const p = st.display.player;
  $('#blank .title').textContent = st.name;

  if (p.mode === 'image' && st.assets[p.assetId]) {
    const url = fileUrl(campaignId, st.assets[p.assetId]);
    const img = $('#image img');
    const key = `image:${url}:${p.caption}`;
    if (key !== lastKey) {
      // Erst ausblenden, dann neues Bild einblenden
      const swap = () => {
        img.src = url;
        $('#image .caption').textContent = p.caption || '';
        $('#image').classList.toggle('with-caption', !!p.caption);
        show('image');
      };
      if (lastKey.startsWith('image:')) {
        $('#image').classList.remove('on');
        setTimeout(swap, 350);
      } else swap();
      lastKey = key;
    }
  } else if (p.mode === 'map' && st.maps[p.mapId]) {
    renderer.setMap(p.mapId);
    if (!renderer.fit()) setTimeout(update, 200);
    show('mapLayer');
    lastKey = `map:${p.mapId}`;
  } else if (p.mode === 'lore' && st.lore[p.loreId]) {
    const entry = st.lore[p.loreId];
    $('#lore h1').textContent = entry.title;
    $('#lore .md').innerHTML = markdown(entry.content);
    show('lore');
    lastKey = `lore:${p.loreId}`;
  } else if (p.mode === 'text' && p.text) {
    $('#text .md').innerHTML = markdown(p.text);
    show('text');
    lastKey = 'text';
  } else {
    show('blank');
    lastKey = 'blank';
  }
}

// Handouts der aktiven Session vorladen
function preload() {
  const st = sync.state;
  const session = st.sessions[st.display.sessionId];
  // Handouts der Session sowie der Karten von Session und Spieltisch
  const mapIds = new Set([...(session?.mapIds || []), st.display.table.mapId]);
  const ids = new Set(session?.assetIds || []);
  for (const mid of mapIds) for (const id of st.maps[mid]?.handoutIds || []) ids.add(id);
  for (const id of ids) {
    if (st.assets[id]?.kind === 'image') preloadImage(fileUrl(campaignId, st.assets[id]));
  }
}

sync.on((changed) => {
  if (touches(changed, 'display', 'assets', 'lore', 'name')) update();
  if (touches(changed, 'maps', 'initiative')) renderer.requestRender();
  if (touches(changed, 'display', 'sessions', 'maps')) preload();
});
sync.onFx((fx) => {
  if (fx.type === 'ping' && fx.target === 'player') renderer.addPing(fx);
  if (fx.type === 'ruler') renderer.showRuler(fx);
});
window.addEventListener('resize', () => {
  if (sync.state.display.player.mode === 'map') renderer.fit();
});
update();
preload();
