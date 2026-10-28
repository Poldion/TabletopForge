// App-Oberfläche einer Kampagne. Spielen ist ein eigener Modus; die Vorbereitung hat zwei Bereiche:
// das gewählte Abenteuer (Sessions, Karten, Handouts, Lore, Kreaturen – nur was dazugehört) und die Kampagne
// (Mediathek mit allem, Gruppe, Bildschirme, Einstellungen).
// Funktioniert eigenständig auf Laptop oder Tablet; weitere Geräte laufen synchron mit.
import { $, h, clear, fill, param, byOrder, sortBy, getImage, fileUrl, preloadImage, toast, apiContext, uid, prompt2 } from './util.js';
import { Sync } from './sync.js';
import { createMapEditor, TV_ZOOM_MIN, TV_ZOOM_MAX } from './dm-map.js';
import { createPanel, PANELS } from './dm-panels.js';
import { createPrepViews } from './prep-views.js';
import { createScreensView, LAYOUTS, playerSummary, tableSummary } from './screens.js';
import { createCreaturesView, tokenPreset } from './creatures-view.js';
import { icon } from './icons.js';
import { createMoodSelect } from './wled-admin.js';
import { putOnTable } from './table-view.js';
import { authState } from './account.js';
import { tr } from './i18n.js';
import { useCampaignUnits } from './units-ui.js';
import { loadAi } from './ai.js';
import { loadBasalt } from './basalt.js';
import { createPartyView } from './party-view.js';
import { createLibraryView } from './library-view.js';
import { createAdventuresView } from './adventure-view.js';
import { createCampaignOverview, createAdventureOverview, newAdventure } from './overview-views.js';
import { createScenesView, createReadyView } from './session-views.js';
import { sceneBar, openQuickFind } from './play-scenes.js';
import { createWrapupView } from './wrapup-view.js';
import { scope, inScope } from './scope-ui.js';
import { SCOPED, adventureOfSession } from '../../shared/scope.js';

const cid = param('c');
if (!cid) location.href = '/';

const store = {
  get(k, d) {
    try {
      return localStorage.getItem(`dm:${cid}:${k}`) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`dm:${cid}:${k}`, v);
    } catch {
      /* Speicher nicht verfügbar */
    }
  },
};

const sync = new Sync(cid, 'dm');
try {
  await sync.connect();
} catch (err) {
  alert(err.message);
  location.href = '/';
}
// Eingerichtete Dienste (ohne Einrichtung erscheinen keine KI- bzw. Basalt-Knöpfe)
await Promise.all([loadAi(), loadBasalt()]);
const S = () => sync.state;

// Ebenen der Vorbereitung: Kampagne › Abenteuer › Session. Die Seitenleiste zeigt nur die Seiten der aktuellen
// Ebene, die Pfadleiste oben, wo man gerade ist. Spielen ist ein eigener Modus (oben umschalten).
const LEVELS = {
  campaign: [
    ['overview', 'home', tr('Übersicht')],
    ['adventures', 'flag', tr('Abenteuer')],
    ['party', 'user', tr('Gruppe')],
    ['world', 'book', tr('Welt')],
    ['bestiary', 'skull', tr('Bestiarium')],
    ['library', 'folder', tr('Mediathek')],
    ['screens', 'monitor', tr('Bildschirme')],
    ['campaign', 'settings', tr('Einstellungen')],
  ],
  adventure: [
    ['adventure', 'flag', tr('Übersicht')],
    ['maps', 'map', tr('Karten')],
    ['assets', 'image', tr('Handouts')],
    ['lore', 'book', tr('Lore')],
    ['creatures', 'skull', tr('NSCs & Encounter')],
  ],
  session: [
    ['session', 'calendar', tr('Ablauf')],
    ['material', 'note', tr('Material')],
    ['ready', 'check', tr('Bereit?')],
    ['wrapup', 'book', tr('Nachbereitung')],
  ],
};
const LEVEL_OF = Object.fromEntries(Object.entries(LEVELS).flatMap(([lvl, items]) => items.map(([r]) => [r, lvl])));
LEVEL_OF.play = 'play';
// Seiten der Kampagne arbeiten ohne Abenteuer-Filter (Welt und Bestiarium zeigen alles)
const CAMPAIGN_ROUTES = new Set(LEVELS.campaign.map(([r]) => r));
// Welt und Bestiarium nutzen die Seiten Lore und Kreaturen – deren interne Links bleiben auf der Kampagnen-Ebene
const ALIAS = { world: { lore: 'world' }, bestiary: { creatures: 'bestiary' } };

// URL-Parameter: ?session=… setzt die aktive Session, ?map=… öffnet eine Karte
if (param('session') && S().sessions[param('session')] && S().display.sessionId !== param('session')) {
  sync.set(['display', 'sessionId'], param('session'));
}

// ?layout=panel o.ä. legt das Layout dieses Geräts fest (z.B. für eine reine DM-Anzeige)
if (LAYOUTS[param('layout')]) store.set('layout', param('layout'));
let layout = store.get('layout', matchMedia('(pointer: coarse)').matches && innerWidth < 900 ? 'map' : 'full');
if (!LAYOUTS[layout]) layout = 'full';
let localMapId = param('map') || store.get('map', null);
let current = null; // aktuell angezeigter Bereich { el, refresh }
let currentRoute = null;
let currentId = null; // Auswahl der Seite (z.B. Session-ID auf der Session-Ebene)

// --- Abenteuer als Arbeitsbereich ---------------------------------------------------
// Gewähltes Abenteuer (je Gerät gemerkt). Gibt es das gemerkte nicht mehr: das der aktiven Session, sonst das erste.
let adventureId = store.get('adventure', '') || null;
function currentAdventure() {
  const st = S();
  if (adventureId && st.adventures[adventureId]) return adventureId;
  return adventureOfSession(st, st.display.sessionId) || byOrder(st.adventures)[0]?.id || null;
}
function setAdventure(id) {
  adventureId = id || null;
  store.set('adventure', id || '');
  renderCrumbs();
}
/** Abenteuer, in dem gerade gearbeitet wird: beim Spielen das der aktiven Session, auf Kampagnen-Seiten keines. */
function contextAdventure() {
  if (currentRoute === 'play') return adventureOfSession(S(), S().display.sessionId) || currentAdventure();
  if (CAMPAIGN_ROUTES.has(currentRoute)) return null;
  return currentAdventure();
}
scope.current = contextAdventure;
apiContext.adventure = contextAdventure; // Uploads, KI- und Basalt-Bilder landen im Abenteuer
// Neu angelegte Karten, Lore, Kreaturen, Encounter gehören zum Abenteuer, in dem gerade gearbeitet wird
{
  const doOps = sync.do.bind(sync);
  const isNew = (op) => op.t === 'set' && op.p.length === 2 && SCOPED.includes(op.p[0]) && op.v && typeof op.v === 'object' && !op.v.adventureIds && !S()[op.p[0]]?.[op.p[1]];
  sync.do = (...ops) => {
    const adv = contextAdventure();
    const list = ops.flat().filter(Boolean);
    return doOps(adv ? list.map((op) => (isNew(op) ? { ...op, v: { ...op.v, adventureIds: [adv] } } : op)) : list);
  };
}

// --- Navigation ------------------------------------------------------------------

function go(route) {
  let [r, ...rest] = String(route).split('/');
  if (r === 'sessions') r = rest.length ? 'session' : 'adventure'; // frühere Sessions-Seite
  r = ALIAS[currentRoute]?.[r] || r;
  const target = [r, ...rest].join('/');
  if (location.hash === `#${target}`) render();
  else location.hash = target;
}

function play({ mapId, sessionId } = {}) {
  if (sessionId && S().display.sessionId !== sessionId) setSession(sessionId);
  if (mapId) localMapId = mapId;
  go('play');
  if (mapId) openMap(mapId);
}

const prepViews = createPrepViews({ sync, cid, go, play, adventure: currentAdventure, setAdventure });
prepViews.adventures = createAdventuresView({ sync, go, current: currentAdventure, setAdventure });
prepViews.library = createLibraryView({ sync, cid, go, setAdventure });
prepViews.creatures = createCreaturesView({ sync, cid, go, placeCreature: (c) => placeCreature(c) });
prepViews.party = createPartyView({ sync, cid, go });
prepViews.overview = createCampaignOverview({ sync, cid, go, setAdventure, play });
prepViews.adventure = createAdventureOverview({ sync, go, adventure: currentAdventure, setAdventure, play });
prepViews.world = (id) => prepViews.lore(id);
prepViews.bestiary = (id) => prepViews.creatures(id);
prepViews.session = createScenesView({ sync, cid, go, play });
prepViews.material = (id) => prepViews.sessions(id, { solo: true });
prepViews.ready = createReadyView({ sync, cid, go, play });
prepViews.wrapup = createWrapupView({ sync, cid, go });

// --- Modus: Vorbereiten | Spielen ------------------------------------------------------
// Vorbereiten = Verwaltung (Sessions, Karten, Lore …) mit Seitenleiste; Spielen = Karte + Panels, ohne Seitenleiste.
// Beim Wechsel zurück in die Vorbereitung öffnet sich die zuletzt genutzte Seite.
const modeEl = $('#modeSwitch');
const prepBtn = h('button', { role: 'tab', title: tr('Vorbereiten: Sessions, Karten, Handouts, Lore, Kreaturen'), onclick: () => go(store.get('lastPrep', 'overview')) }, icon('calendar'), h('span.mode-label', tr(' Vorbereiten')));
const playBtn = h('button', { role: 'tab', title: tr('Spielen: Karte, Szene, Kampf'), onclick: () => go('play') }, icon('play'), h('span.mode-label', tr(' Spielen')));
modeEl.append(prepBtn, playBtn);

const navEl = $('#sidenav');
const navItems = h('div.nav-items');
navEl.append(navItems, h('div.nav-spacer'));

/** Seitenleiste der Ebene: oben „zurück“ zur übergeordneten Ebene, darunter ihre Seiten. */
function renderNav(level, route) {
  const up =
    level === 'adventure'
      ? h('button.nav-up', { title: tr('Zur Kampagne'), onclick: () => go('overview') }, h('span.nav-icon', icon('chevronLeft')), h('span.nav-label', tr('Kampagne')))
      : level === 'session'
        ? h('button.nav-up', { title: tr('Zum Abenteuer'), onclick: () => go('adventure') }, h('span.nav-icon', icon('chevronLeft')), h('span.nav-label', tr('Abenteuer')))
        : null;
  fill(
    navItems,
    up,
    h('div.nav-section', { class: `lvl-${level}` }, { campaign: tr('Kampagne'), adventure: tr('Abenteuer'), session: tr('Session') }[level] || ''),
    (LEVELS[level] || []).map(([r, ic, label]) => h('button', { dataset: { route: r }, class: r === route ? 'active' : '', onclick: () => go(level === 'session' ? `${r}/${currentId}` : r) }, h('span.nav-icon', icon(ic)), h('span.nav-label', label))),
  );
  navEl.dataset.level = level;
}

// --- Pfadleiste: Kampagne › Abenteuer › Session ---------------------------------------
const crumbsEl = h('nav.crumbs', { 'aria-label': tr('Wo du gerade bist') });
$('#campaignName').replaceWith(crumbsEl);
let crumbSig = '';
function renderCrumbs(force = false) {
  const st = S();
  const level = LEVEL_OF[currentRoute] || 'campaign';
  const adv = currentAdventure();
  const sid = level === 'session' ? currentId : null;
  const advs = byOrder(st.adventures);
  const sessions = sortBy(Object.values(st.sessions).filter((x) => x.adventureId === adv), (x) => x.order);
  const sig = JSON.stringify([level, adv, sid, st.name, advs.map((a) => [a.id, a.name]), sessions.map((x) => [x.id, x.name])]);
  if (sig === crumbSig && !force) return;
  crumbSig = sig;
  const sep = () => h('span.crumb-sep', '›');
  const home = h('button.crumb', { class: level === 'campaign' ? 'here' : '', title: tr('Kampagnen-Übersicht'), onclick: () => go('overview') }, icon('folder'), h('span.crumb-text', ` ${st.name}`));
  if (level === 'play') return fill(crumbsEl, home);
  const advSel = h(
    'select.crumb-select',
    { class: level === 'adventure' ? 'here' : '', title: tr('Abenteuer öffnen oder wechseln') },
    level === 'campaign' ? h('option', { value: '' }, tr('Abenteuer öffnen …')) : null,
    advs.map((a) => h('option', { value: a.id, selected: level !== 'campaign' && a.id === adv }, a.name)),
    h('option', { value: '__new' }, tr('+ Neues Abenteuer …')),
  );
  advSel.addEventListener('change', async () => {
    let id = advSel.value;
    if (id === '__new') id = await newAdventure(sync);
    if (!id) return renderCrumbs(true);
    setAdventure(id);
    go(level === 'adventure' && currentRoute !== 'adventure' ? currentRoute : 'adventure');
  });
  const parts = [home, sep(), advSel];
  if (level === 'session') {
    const sesSel = h('select.crumb-select.here', { title: tr('Session wechseln') }, sessions.map((x) => h('option', { value: x.id, selected: x.id === sid }, x.name)));
    sesSel.addEventListener('change', () => go(`${currentRoute}/${sesSel.value}`));
    parts.push(sep(), sesSel);
  }
  fill(crumbsEl, ...parts);
}
// Konto (nur mit eingerichteter Anmeldung): Benutzer & freigegebene Anzeigen
{
  const accountBtn = h('button.hidden', { title: tr('Benutzer & Geräte, Abmelden'), onclick: () => (location.href = '/users.html') }, h('span.nav-icon', icon('user')), h('span.nav-label', tr('Konto')));
  navEl.append(accountBtn);
  authState().then((st) => st.active && accountBtn.classList.remove('hidden')).catch(() => {});
}

function render() {
  let [name = 'play', id = null] = location.hash.slice(1).split('/');
  if (name === 'sessions') return go(id ? `session/${id}` : 'adventure'); // alte Links
  let route = LEVEL_OF[name] ? name : 'overview';
  // Session-Ebene: deren Abenteuer gilt; Abenteuer-Ebene ohne Abenteuer → Abenteuer-Liste der Kampagne
  if (LEVEL_OF[route] === 'session') {
    const sess = S().sessions[id];
    if (!sess) return go('adventure');
    if (sess.adventureId && S().adventures[sess.adventureId] && sess.adventureId !== adventureId) {
      adventureId = sess.adventureId;
      store.set('adventure', adventureId);
    }
  }
  if (LEVEL_OF[route] === 'adventure' && !currentAdventure()) route = 'adventures';
  currentRoute = route;
  currentId = id;
  const playing = route === 'play';
  if (!playing) renderNav(LEVEL_OF[route], route);
  document.body.classList.toggle('mode-play', playing);
  prepBtn.classList.toggle('active', !playing);
  playBtn.classList.toggle('active', playing);
  if (!playing) store.set('lastPrep', location.hash.slice(1) || route);
  if (route === 'play') {
    current = playView;
  } else if (route === 'screens') {
    current = createScreensView({ sync, cid, getLayout: () => layout, setLayout, centerTv });
  } else {
    const fn = prepViews[route] || prepViews.sessions;
    current = fn(id || null);
  }
  fill($('#main'), current.el);
  renderCrumbs();
  // Handy: Listen-/Detail-Seiten zeigen entweder die Liste oder (mit Auswahl) nur die Details + „Zurück“
  const split = current.el.matches?.('.split') ? current.el : null;
  if (split) {
    // Erste Spalte = Übersicht (Liste bzw. bei den Handouts die Bildersammlung), zweite = Details
    const [master, detail] = split.children;
    master?.classList.add('master');
    detail?.classList.add('detail');
  }
  const hasDetail = !!(split && id && id !== 'encounters');
  document.body.classList.toggle('has-detail', hasDetail);
  fill($('#mobileBack'), icon('chevronLeft'), tr(' Übersicht'));
  $('#mobileBack').onclick = () => go(route);
  if (route === 'play') playView.refresh(new Set(['*']));
}
window.addEventListener('hashchange', render);

function setLayout(l) {
  layout = l;
  store.set('layout', l);
  playView = buildPlay();
  if (currentRoute === 'play') render();
}

// --- Spielen ---------------------------------------------------------------------

let editor = null;

const currentMapId = () => {
  const id = editor ? editor.mapId : localMapId;
  if (id && S().maps[id]) return id;
  // Begleit-Instanz ohne eigene Karte folgt dem Spieltisch
  return S().display.table.mapId || null;
};

function openMap(id) {
  localMapId = id;
  store.set('map', id || '');
  editor?.setMap(id);
  // Beim Kartenwechsel alles zur Karte (Notizen, Handouts, Lore) direkt anzeigen – außer man spielt gerade nach
  // Drehbuch (Panel „Ablauf“): dann bleibt die Szene vorn
  const first = playView.panels[0];
  if (id && first && first.current !== 'map' && first.current !== 'scene') first.show('map');
  playView.refresh(new Set(['maps']));
}

function centerTv() {
  if (editor) editor.centerTvHere();
  else {
    const m = S().maps[currentMapId()];
    if (m) putOnTable(sync, m.id, { cx: (m.width || 0) / 2, cy: (m.height || 0) / 2 });
  }
}

/** Kreatur als Token setzen: ins Spiel wechseln und das Token-Werkzeug vorbereiten. */
function placeCreature(c) {
  if (layout === 'panel' || layout === 'panels') return toast(tr('In diesem Layout gibt es keine Karte – auf dem Gerät mit der Karte setzen.'));
  if (currentRoute !== 'play') go('play');
  editor?.armToken(tokenPreset(c));
}

/** Werte einer Kreatur im Panel „Kreaturen“ aufklappen. */
function showCreature(id) {
  if (currentRoute !== 'play') go('play');
  const target = playView.panels.find((p) => p.current === 'creatures') || playView.panels[0];
  if (target.current !== 'creatures') target.show('creatures');
  setTimeout(() => window.dispatchEvent(new CustomEvent('show-creature', { detail: id })), 0);
}

/** Panel im Spiel nach vorn holen (z.B. „Ablauf“ nach dem Wechsel der Szene). */
function showPanel(name) {
  if (currentRoute !== 'play') go('play');
  const target = playView.panels.find((p) => p.current === name) || playView.panels[0];
  if (target && target.current !== name) target.show(name);
}

const panelCtx = { sync, cid, openMap, currentMapId, centerTv, placeCreature, showCreature, go, showPanel, menuButton };

// Schnellsuche im Spiel: Strg+K (bzw. ⌘K)
document.addEventListener('keydown', (e) => {
  if (currentRoute === 'play' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openQuickFind(panelCtx);
  }
});

function panelColumn(key, fallback) {
  let cur = store.get(key, fallback);
  if (!PANELS[cur]) cur = fallback;
  const body = h('div.panel-body');
  const tabs = h('div.tabs');
  let panel = null;
  const show = (name) => {
    cur = name;
    store.set(key, name);
    for (const b of tabs.children) b.classList.toggle('active', b.dataset.p === name);
    panel = createPanel(name, panelCtx);
    fill(body, panel.el);
  };
  for (const [name, [iconName, label]] of Object.entries(PANELS)) {
    tabs.append(h('button', { dataset: { p: name }, onclick: () => show(name), title: label }, h('span.tab-icon', icon(iconName)), h('span.tab-label', label)));
  }
  show(cur);
  return {
    el: h('div.panel-col', tabs, body),
    api: {
      refresh: (changed) => panel?.refresh(changed),
      show,
      get current() {
        return cur;
      },
    },
  };
}

/** Kartenleiste: bei aktiver Session nur deren Karten (auf Wunsch alle), ohne Session alle – ein Tipp wechselt. */
function mapStrip() {
  const el = h('div.mapstrip');
  let showAll = false;
  let sig = '';
  const render = () => {
    const st = S();
    // Nur neu aufbauen, wenn sich Karten, Session oder Anzeigen geändert haben
    const next = JSON.stringify([showAll, currentMapId(), st.display.sessionId, st.sessions[st.display.sessionId]?.mapIds, Object.values(st.maps).map((m) => [m.id, m.name, m.assetId]), st.display.table.mapId, st.display.table.blackout, st.display.player.mode, st.display.player.mapId]);
    if (next === sig) return;
    sig = next;
    const session = st.sessions[st.display.sessionId];
    const sessionMaps = (session?.mapIds || []).map((id) => st.maps[id]).filter(Boolean);
    const all = byOrder(st.maps).filter(inScope); // ohne Session: die Karten des Abenteuers
    // Mit aktiver Session nur ihre Karten – auch wenn ihr noch keine zugeordnet sind (dann ein Hinweis statt aller)
    const onlySession = !!session && !showAll;
    const list = onlySession ? sessionMaps : all;
    const active = currentMapId();
    const items = list.map((m) => {
      const live = [
        st.display.table.mapId === m.id && !st.display.table.blackout && icon('monitor', { title: tr('auf dem Tisch') }),
        st.display.player.mode === 'map' && st.display.player.mapId === m.id && icon('image', { title: tr('beim Spieler-Display') }),
      ].filter(Boolean);
      return h(
        'button.mapstrip-item',
        { class: m.id === active ? 'current' : '', title: m.name, onclick: () => openMap(m.id) },
        h('img', { src: fileUrl(cid, st.assets[m.assetId]), alt: '', loading: 'lazy' }),
        h('span.name', m.name),
        live.length ? h('span.live', live) : null,
      );
    });
    fill(
      el,
      h('span.strip-label', onlySession ? tr('Karten der Session') : tr('Alle Karten')),
      items.length
        ? items
        : onlySession
          ? h('span.small.muted', tr('Dieser Session sind noch keine Karten zugeordnet – unter „Sessions“ auswählen.'))
          : h('span.small.muted', tr('Noch keine Karten – unter „Karten“ hochladen.')),
      session && all.length > sessionMaps.length
        ? h('button.small', { onclick: () => ((showAll = !showAll), (sig = ''), render()) }, showAll ? tr('Nur Session') : tr('Alle Karten ({length})', { length: all.length }))
        : null,
      onlySession && !sessionMaps.length ? h('button.small', { onclick: () => go('sessions') }, icon('calendar'), tr(' Karten zuordnen')) : null,
      h('button.small', { onclick: () => go('maps'), title: tr('Karte hochladen oder bearbeiten') }, icon('plus'), tr(' Karte')),
    );
  };
  render();
  return { el, render };
}

/** Größe des Tischausschnitts: kleiner = mehr Karte (z.B. Weltkarten), 100 % = 1 Feld je Zoll. */
function tvZoomControls(zoom) {
  const set = (z) => sync.set(['display', 'table', 'zoom'], Math.round(Math.max(TV_ZOOM_MIN, Math.min(TV_ZOOM_MAX, z)) * 100) / 100);
  return h(
    'span.quick-zoom',
    { style: { display: 'inline-flex', alignItems: 'center', gap: '2px' } },
    h('button.small', { title: tr('Mehr Karte auf dem Tisch (Ausschnitt größer)'), onclick: () => set(zoom / 1.25) }, '−'),
    h('span.small', { style: { minWidth: '3.4em', textAlign: 'center' }, title: tr('Maßstab auf dem Tisch – 100 % = 1 Feld je Zoll') }, `${Math.round(zoom * 100)} %`),
    h('button.small', { title: tr('Weniger Karte auf dem Tisch (Ausschnitt kleiner)'), onclick: () => set(zoom * 1.25) }, '+'),
    zoom !== 1 ? h('button.small', { title: tr('Maßstabsgetreu: 1 Feld = 1 Zoll'), onclick: () => set(1) }, '1:1') : null,
  );
}

/**
 * Kleines Aufklappmenü über einem Knopf (öffnet nach oben – die Leiste steht unten). Bleibt nach einem Neuaufbau
 * der Leiste offen, solange es nicht geschlossen wurde.
 */
let openMenu = null;
function menuButton(key, label, buildContent, attrs = {}) {
  const wrap = h('span.quick-menu');
  const toggle = (on) => {
    openMenu = on ? key : null;
    wrap.classList.toggle('open', on);
  };
  const btn = h('button.small', { ...attrs, onclick: (e) => (e.stopPropagation(), toggle(openMenu !== key)) }, label, ' ', icon('chevronDown'));
  const panel = h('div.quick-menu-panel', { onclick: (e) => e.stopPropagation() }, buildContent());
  wrap.append(btn, panel);
  if (openMenu === key) wrap.classList.add('open');
  return wrap;
}
document.addEventListener('click', () => {
  if (!openMenu) return;
  openMenu = null;
  for (const m of document.querySelectorAll('.quick-menu.open')) m.classList.remove('open');
});

/** Leiste unter der Karte: was zeigen Spieltisch und Spieler-Display? Eine Zeile, Seltenes im Menü „Ausschnitt“. */
function quickBar() {
  const el = h('div.map-quick');
  const mood = createMoodSelect(sync); // LED-Stimmung (nur sichtbar, wenn WLED eingerichtet ist)
  let sig = '';
  const render = () => {
    const st = S();
    const id = editor?.mapId;
    const d = st.display;
    const next = JSON.stringify([id, d.table.mapId, d.table.blackout, d.table.fit, d.table.zoom, d.player, !!st.maps[id]]);
    if (next === sig) return;
    sig = next;
    const m = st.maps[id];
    if (!m) return fill(el, h('span.quick-label', tr('Wähle oben eine Karte.')));
    const onTable = d.table.mapId === id;
    const toPlayers = d.player.mode === 'map' && d.player.mapId === id;
    const zoom = d.table.zoom || 1;
    const viewLabel = d.table.fit ? tr('Ganze Karte') : tr('Ausschnitt {round} %', { round: Math.round(zoom * 100) });
    fill(
      el,
      h(
        'span.quick-group',
        h('span.quick-label', icon('monitor'), tr(' Tisch')),
        onTable
          ? [
              h('span.quick-state', { title: tr('Diese Karte liegt auf dem Spieltisch') }, icon('check'), tr(' diese Karte')),
              h('button.small', { class: d.table.blackout ? 'active' : '', title: tr('Tisch abdunkeln (Pausenbildschirm)'), onclick: () => sync.set(['display', 'table', 'blackout'], !d.table.blackout) }, d.table.blackout ? [icon('sun'), tr(' Einblenden')] : [icon('moon'), tr(' Verdunkeln')]),
              menuButton('view', viewLabel, () => [
                h('button.small', { onclick: centerTv, title: tr('TV-Ausschnitt auf die aktuelle Ansicht setzen') }, icon('crosshair'), tr(' TV hierher')),
                h(
                  'button.small',
                  { class: d.table.fit ? 'active' : '', title: tr('Ganze Karte auf dem Tisch (z.B. Reise-/Weltkarten)'), onclick: () => sync.merge(['display', 'table'], { fit: !d.table.fit }) },
                  icon('maximize'),
                  tr(' Ganze Karte'),
                ),
                !d.table.fit ? h('div.row', { style: { gap: '4px' } }, h('span.small.muted', tr('Größe')), tvZoomControls(zoom)) : null,
                h('div.small.muted', { style: { maxWidth: '230px' } }, tr('Tipp: Mit dem Werkzeug „TV-Bild“ den Rahmen auf der Karte verschieben oder an den Ecken größer ziehen.')),
              ]),
            ]
          : h('button.small.primary', { onclick: () => putOnTable(sync, id, { blackout: false }) }, tr('Auf den Tisch')),
      ),
      h(
        'span.quick-group',
        h('span.quick-label', icon('image'), tr(' Spieler')),
        toPlayers
          ? h('span.quick-state', icon('check'), tr(' diese Karte'), h('button.small.icon-only', { title: tr('Spieler-Display leeren'), onclick: () => sync.merge(['display', 'player'], { mode: 'blank' }) }, icon('x')))
          : [
              h('button.small', { onclick: () => sync.merge(['display', 'player'], { mode: 'map', mapId: id }) }, tr('Karte zeigen')),
              d.player.mode !== 'blank'
                ? h('span.quick-state.other', { title: tr('Das zeigt das Spieler-Display gerade') }, playerSummary(st), h('button.small.icon-only', { title: tr('Spieler-Display leeren'), onclick: () => sync.merge(['display', 'player'], { mode: 'blank' }) }, icon('x')))
                : null,
            ],
      ),
      h('span.grow'),
      mood,
    );
  };
  render();
  return { el, render };
}

function buildPlay() {
  editor = null;
  const panels = [];
  const el = h('div.play', { class: `layout-${layout}` });
  let strip = null;
  let quick = null;
  let scenes = null;
  if (layout === 'full' || layout === 'map') {
    editor = createMapEditor(sync, cid, { onShowCreature: showCreature });
    scenes = sceneBar(panelCtx); // Szenen der Session + Werkzeugkasten für Spontanes
    strip = mapStrip();
    quick = quickBar();
    el.append(h('div.play-main', scenes.el, strip.el, editor.el, quick.el));
    const first = localMapId && S().maps[localMapId] ? localMapId : S().display.table.mapId || byOrder(S().maps)[0]?.id || null;
    editor.setMap(first);
    localMapId = first;
  }
  const col1 = panelColumn('panel1', 'scene');
  el.append(col1.el);
  panels.push(col1.api);
  if (layout === 'panels') {
    const col2 = panelColumn('panel2', 'init');
    el.append(col2.el);
    panels.push(col2.api);
  }
  return {
    el,
    panels,
    refresh(changed) {
      editor?.refresh(changed);
      panels.forEach((p) => p.refresh(changed));
      strip?.render();
      quick?.render();
      scenes?.render();
    },
  };
}

let playView = buildPlay();

// --- Kopfzeile -------------------------------------------------------------------

const sessionSel = $('#sessionSel');

function setSession(id) {
  const ops = [{ t: 'set', p: ['display', 'sessionId'], v: id || null }];
  if (id && S().sessions[id]?.status === 'planned') ops.push({ t: 'set', p: ['sessions', id, 'status'], v: 'active' });
  sync.do(ops);
}
sessionSel.addEventListener('change', () => setSession(sessionSel.value));

function refreshHeader() {
  const st = S();
  renderCrumbs();
  document.title = st.name;
  const pad = (n) => String(n ?? 0).padStart(15, '0');
  const sessions = sortBy(Object.values(st.sessions), (s) => `${pad(st.adventures[s.adventureId]?.order)}|${pad(s.order)}`);
  clear(sessionSel).append(
    h('option', { value: '' }, tr('– keine –')),
    ...sessions.map((s) => h('option', { value: s.id, selected: s.id === st.display.sessionId }, `${st.adventures[s.adventureId]?.name ? `${st.adventures[s.adventureId].name} · ` : ''}${s.name}`)),
  );
  const p = sync.presence || {};
  fill($('#tableChip'), h('span.status-dot', { class: p.table > 0 ? 'on' : '' }), icon('monitor'), h('span.chip-label', tr('Tisch: {tableSummary}', { tableSummary: tableSummary(st) })));
  fill($('#playerChip'), h('span.status-dot', { class: p.player > 0 ? 'on' : '' }), icon('image'), h('span.chip-label', tr('Spieler: {playerSummary}', { playerSummary: playerSummary(st) })));
}
$('#tableChip').addEventListener('click', () => go('screens'));
$('#playerChip').addEventListener('click', () => go('screens'));

sync.onStatus((s) => {
  fill($('#serverState'), h('span.status-dot', { class: s.connected ? 'on' : '' }), h('span.chip-label', s.connected ? tr('verbunden') : tr('offline')));
  if (s.state) refreshHeader();
});

// Karten der aktiven Session vorladen (fliegender Wechsel)
function preload() {
  const st = S();
  for (const id of st.sessions[st.display.sessionId]?.mapIds || []) {
    const m = st.maps[id];
    if (m) preloadImage(fileUrl(cid, st.assets[m.assetId]));
  }
}

let combatRunning = !!S().initiative?.started;
useCampaignUnits(S());
sync.on((changed) => {
  if (changed.has('*') || changed.has('units')) useCampaignUnits(S());
  refreshHeader();
  current?.refresh?.(changed);
  // Kampf hat gerade begonnen: das Kampf-Panel nach vorn holen (im zweiten Panel steht es ohnehin)
  const running = !!S().initiative?.started;
  if (running && !combatRunning && currentRoute === 'play' && layout !== 'panels') playView.panels[0]?.show('init');
  combatRunning = running;
  if (changed.has('*') || changed.has('display')) preload();
  // Bildmaße nachtragen, falls noch unbekannt
  const m = S().maps[currentMapId()];
  if (m && !m.width) {
    const img = getImage(fileUrl(cid, S().assets[m.assetId]));
    if (img) sync.merge(['maps', m.id], { width: img.naturalWidth, height: img.naturalHeight });
  }
});
sync.onFx((fx) => {
  if (fx.type === 'ping') editor?.renderer.addPing(fx);
});

refreshHeader();
render();
preload();
