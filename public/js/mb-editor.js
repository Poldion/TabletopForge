// Kartenbauer: Editor. Gelände malen, Räume aufziehen, Wände/Türen/Fenster setzen, Gegenstände platzieren und
// Flächen automatisch mit Bäumen, Büschen oder Felsen füllen. Die Szene liegt als eigene Datei je Karte auf dem
// Server; „Karte übernehmen“ backt daraus das Kartenbild, das Spieltisch und Spieler-Display wie jede Karte zeigen.
import { h, fill, api, toast, uid, uploadFiles, debounce, prompt2 } from './util.js';
import { icon } from './icons.js';
import { tr } from './i18n.js';
import { CELL, newScene, thin, roomAt, inRoom, buildingOutline, nearestWall, wallSegments, roomZones, isTimberWall, scatter, scatterHouses, cutStreets, inRects, UPPER_LISTS, LOWER_LISTS, ringAround, ringOutsides, shapeBox } from './mb-geom.js';
import { BIOMES, CATALOG, CATEGORIES, biomeOf, previewUrl, variantsOf, sprite } from './mb-assets.js';
import { SceneRenderer, sceneSize, FLOORS, floorSwatch } from './mb-render.js';
import { tableCells } from '/shared/calibration.js';
import { sealDoor, zoneAt, drawLabel, labelAt, labelBox } from './doors.js';
import { takeTemplate, takeWish, askWish, downloadScene, uploadScene } from './mb-templates.js';
import { planToScene, themeFromPlan } from './mb-plan.js';
import { ai } from './ai.js';
import { floorLabel } from './floors.js';
import { THEMES, furnish } from './mb-themes.js';

const HALF = CELL / 2;
const snap = (v) => Math.round(v / HALF) * HALF;
const TERRAIN = {
  water: { label: tr('Wasser'), color: '44,140,144', r: 60, key: 'water' },
  path: { label: tr('Weg'), color: '197,169,103', r: 18, key: 'paths' },
  road: { label: tr('Straße'), color: '200,190,160', r: 28, key: 'roads' },
  dirt: { label: tr('Erde'), color: '150,118,78', r: 50, key: 'dirt' },
  high: { label: tr('Erhöhung'), color: '182,184,147', r: 70, key: 'high' },
  cave: { label: tr('Höhle'), color: '133,122,98', r: 80, key: 'cave' },
};
/** Maßstab: auf Übersichtskarten sind Bäume, Büsche und Felsen entsprechend kleiner. */
const SCALES = { battle: 1, overview: 0.32 };
const FLOOR_LABEL = { wood: tr('Dielen'), woodDark: tr('Dielen dunkel'), woodLight: tr('Dielen hell'), stone: tr('Steinplatten'), cobble: tr('Kopfstein'), earth: tr('Erde') };
const THEME_LABEL = { tavern: tr('Schankraum'), kitchen: tr('Küche'), bedroom: tr('Schlafkammer'), storage: tr('Lager'), smithy: tr('Schmiede'), library: tr('Bibliothek'), chapel: tr('Kapelle'), barracks: tr('Wachstube'), crypt: tr('Gruft'), cell: tr('Kerkerzelle') };
const FILL_LABEL = { trees: tr('Bäume'), bushes: tr('Büsche'), rocks: tr('Felsen'), mixed: tr('Gemischt'), houses: tr('Häuser') };
const TOOLS = [
  ['select', 'cursor', tr('Auswählen')],
  ['terrain', 'pen', tr('Gelände')],
  ['room', 'rect', tr('Raum')],
  ['floor', 'grid', tr('Boden')],
  ['wall', 'ruler', tr('Wand')],
  ['opening', 'home', tr('Tür/Fenster')],
  ['object', 'token', tr('Gegenstand')],
  ['fill', 'cloud', tr('Füllen')],
  ['label', 'edit', tr('Text')],
];

/** @param {{ sync: import('./sync.js').Sync, cid: string, go: (route: string) => void, play: (o: object) => void }} ctx */
export function createBuilderView({ sync, cid, go, play }) {
  const S = () => sync.state;

  return (mapId) => {
    const el = h('div.mb');
    if (!mapId || !S().maps[mapId]) {
      setTimeout(() => go('maps'));
      return { el, refresh() {} };
    }
    let floor = 0; // 0 Erdgeschoss, 1 = erstes Obergeschoss, 2 = zweites …, −1 = erstes Untergeschoss, −2 …
    const MAX_UP = 4; // so viele Obergeschosse höchstens
    const MAX_DOWN = 3; // und so viele Untergeschosse
    const url = `/api/campaigns/${cid}/scenes/${mapId}`;
    const renderer = new SceneRenderer();
    const upRenderers = []; // je Obergeschoss einer: zeichnet es über das Bild des Stockwerks darunter
    const lowRenderers = []; // je Untergeschoss einer: Räume und Gänge im Fels
    let root = null; // die ganze Szene, wie sie gespeichert wird (Erdgeschoss, darin uppers und lowers)
    let scene = null; // das Stockwerk, an dem gerade gebaut wird: root oder ein Eintrag aus root.uppers / root.lowers
    let tool = 'select';
    let sel = null; // { type: 'object'|'room'|'wall'|'opening'|'fill', id }
    let drag = null;
    let chain = null; // angefangener Mauerzug: { start, last }
    let multi = []; // Mehrfachauswahl: [{ type, id }] (ab zwei Elementen; sonst gilt sel)
    let hover = null; // Mausposition in Kartenkoordinaten
    let baked = true; // entspricht das Kartenbild dem Stand der Szene?
    const opt = { terrain: 'water', r: TERRAIN.water.r, erase: false, lvl: 1, room: 'rect', open: false, ruin: false, timber: false, search: '', floor: 'wood', wall: 'wood', opening: 'door', obj: 'tableRound', rot: 0, vary: true, rotMode: 'off', flipRand: false, fill: 'trees', density: 1, fillShape: 'ellipse', labelSize: 'm', labelKind: 'place' };
    // Setz-Optionen des Gegenstand-Werkzeugs: je Gerät gemerkt
    const PLACE = 'mb:place';
    try {
      const p = JSON.parse(localStorage.getItem(PLACE) || '{}');
      if (typeof p.vary === 'boolean') opt.vary = p.vary;
      if (['off', 'slight', 'quarter', 'free'].includes(p.rotMode)) opt.rotMode = p.rotMode;
      if (typeof p.flipRand === 'boolean') opt.flipRand = p.flipRand;
    } catch {
      /* ohne Speicher gelten die Vorgaben */
    }
    const savePlace = () => {
      try {
        localStorage.setItem(PLACE, JSON.stringify({ vary: opt.vary, rotMode: opt.rotMode, flipRand: opt.flipRand }));
      } catch {
        /* dann eben nicht */
      }
    };
    const view = { k: 0.4, tx: 0, ty: 0 };
    const history = [];
    let hIndex = -1;

    // --- Aufbau ---------------------------------------------------------------------------------------------------
    const canvas = h('canvas.mb-canvas');
    const stage = h('div.mb-stage', canvas);
    const side = h('div.mb-side');
    const toolbar = h('div.mb-tools');
    // Statuszeile darf die Knöpfe nicht in die nächste Zeile drängen
    const status = h('span.small.muted', { style: { width: '130px', flex: 'none', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } });
    const name = h('input', { value: S().maps[mapId].name, style: { width: '120px' }, title: tr('Name der Karte') });
    name.addEventListener('change', () => name.value.trim() && sync.set(['maps', mapId, 'name'], name.value.trim()));
    const cols = h('input', { type: 'number', min: 6, max: 80, style: { width: '62px' }, title: tr('Breite in Feldern') });
    const rows = h('input', { type: 'number', min: 6, max: 80, style: { width: '62px' }, title: tr('Höhe in Feldern') });
    const biome = h('select', { title: tr('Umgebung') }, Object.entries(BIOMES).map(([k, b]) => h('option', { value: k }, b.label)));
    const scale = h('select', { title: tr('Maßstab: Auf Übersichtskarten (Dorf, Stadt, Burg, Landstrich) werden Bäume, Büsche und Felsen klein gesetzt – passend zu Häusern mit Dach, Türmen und Mauern aus dem Katalog „Gebäude“.') }, h('option', { value: 'battle' }, tr('Kampfkarte')), h('option', { value: 'overview' }, tr('Übersichtskarte')));
    scale.addEventListener('change', () => {
      scene.scale = scale.value === 'overview' ? 'overview' : undefined;
      if (scene.scale && CATALOG[opt.obj].cat !== 'building') opt.obj = 'houseTile';
      commit();
      renderSide();
    });
    const zoomOf = () => SCALES[scene?.scale] || 1;
    // Stockwerk-Schalter: liegt über der Zeichenfläche, damit die Kopfzeile nicht überläuft
    const floorBar = h('div.mb-floors');
    stage.append(floorBar);
    const floorName = (f) => floorLabel(f, root?.uppers?.length || 0, root?.lowers?.length || 0, tr);
    function renderFloors() {
      const nUp = root?.uppers?.length || 0;
      const nDown = root?.lowers?.length || 0;
      const tip = (f) =>
        f < 0
          ? tr('Untergeschoss: Keller, Gruft oder Gänge unter dem Gebäude – Räume im Fels, dazu Höhlenboden mit dem Gelände-Pinsel. Im Spiel blendest du es ein, wenn die Gruppe hinabsteigt.')
          : tr('Stockwerk: In einem Obergeschoss baust du Räume über dem Stockwerk darunter (Turmzimmer, Empore, Dachboden). Was darunter liegt, scheint abgedunkelt durch. Im Spiel zeigt die Karte das Erdgeschoss; die Obergeschosse blendest du dort ein, wenn die Gruppe hinaufgeht.');
      const list = Array.from({ length: nDown + nUp + 1 }, (_, i) => i - nDown);
      fill(floorBar, [
        nDown < MAX_DOWN ? h('button.small', { type: 'button', title: nDown ? tr('Ein weiteres Stockwerk darunter anlegen') : tr('Untergeschoss anlegen: Keller und Gänge unter dem Erdgeschoss bauen'), onclick: () => setFloor(-nDown - 1) }, nDown ? '+' : `+ ${tr('Untergeschoss')}`) : null,
        ...list.map((f) => h('button.small', { type: 'button', class: f === floor ? 'active' : '', title: tip(f), onclick: () => setFloor(f) }, floorName(f))),
        nUp < MAX_UP ? h('button.small', { type: 'button', title: nUp ? tr('Ein weiteres Stockwerk darüber anlegen') : tr('Obergeschoss anlegen: Räume über dem Erdgeschoss bauen'), onclick: () => setFloor(nUp + 1) }, nUp ? '+' : `+ ${tr('Obergeschoss')}`) : null,
      ]);
    }
    // Anbauen: Links und oben wandert der ganze Inhalt mit, damit nichts neu gesetzt werden muss
    const grow = h('select', { title: tr('Karte an einer Seite um fünf Felder erweitern – der Inhalt bleibt, wo er ist') }, h('option', { value: '' }, tr('Anbauen …')), h('option', { value: 'l' }, tr('links')), h('option', { value: 't' }, tr('oben')), h('option', { value: 'r' }, tr('rechts')), h('option', { value: 'b' }, tr('unten')));
    grow.addEventListener('change', () => {
      const side = grow.value;
      grow.value = '';
      const wide = side === 'l' || side === 'r';
      const c = scene.cols + (wide ? 5 : 0);
      const r = scene.rows + (wide ? 0 : 5);
      if (c > 80 || r > 80 || c * r > 3600) return toast(tr('Die Karte darf höchstens 3600 Felder groß sein.'));
      scene.cols = c;
      scene.rows = r;
      if (side === 'l') shiftScene(5 * CELL, 0);
      if (side === 't') shiftScene(0, 5 * CELL);
      syncTop();
      commit();
      fit();
    });
    const undoBtn = h('button.small', { title: tr('Rückgängig (Strg+Z)'), onclick: () => undo(-1) }, icon('rotateLeft'));
    const redoBtn = h('button.small', { title: tr('Wiederholen (Strg+Y)'), onclick: () => undo(1) }, icon('rotateRight'));
    const alive = h('input', { type: 'checkbox' });
    alive.addEventListener('change', () => {
      scene.still = alive.checked ? undefined : true;
      commit();
    });
    // Tischrahmen: zeigt am Mauszeiger, wie viel der Karte der Spieltisch auf einmal zeigt (ein Feld = ein Zoll)
    let showTv = false;
    const tvBox = h('input', { type: 'checkbox' });
    tvBox.addEventListener('change', () => ((showTv = tvBox.checked), draw()));
    const bakeBtn = h('button.primary', { onclick: () => bake() }, icon('check'), tr(' Karte übernehmen'));
    el.append(
      h(
        'div.mb-top',
        h('button.small', { onclick: () => leave(`maps/${mapId}`) }, icon('chevronLeft'), tr(' Karten')),
        name,
        h('span.chip', cols, '×', rows, tr('Felder')),
        grow,
        biome,
        scale,
        undoBtn,
        redoBtn,
        h('button.small', { title: tr('Ganze Karte zeigen'), onclick: () => (fit(), draw()) }, icon('maximize')),
        h('label.inline.small', { title: tr('Auf starken Anzeigen wiegen sich die Bäume, das Wasser bewegt sich und Vögel ziehen vorbei. Schwache Geräte zeigen die Karte unbewegt.') }, alive, tr('Belebt')),
        h('label.inline.small', { title: tr('Zeigt am Mauszeiger einen Rahmen in der Größe des Spieltischs – so siehst du, was auf einmal aufs Bild passt. Auf Übersichtskarten zeigt der Tisch je nach Vergrößerung mehr.') }, tvBox, tr('Tisch')),
        h('span.grow'),
        status,
        h('button.small', { title: tr('Karte übernehmen und im Spiel öffnen'), onclick: async () => (await bake()) && play({ mapId }) }, icon('play'), tr(' Spielen')),
        bakeBtn,
      ),
      h('div.mb-body', toolbar, stage, side),
    );
    for (const [id, ic, label] of TOOLS) {
      toolbar.append(h('button', { dataset: { tool: id }, title: label, onclick: () => setTool(id) }, icon(ic), h('span', label)));
    }

    // --- Szene, Verlauf, Speichern ---------------------------------------------------------------------------------
    const save = debounce(async () => {
      try {
        await api('PUT', url, root);
        status.textContent = baked ? tr('Gespeichert') : tr('Gespeichert · Kartenbild noch nicht übernommen');
      } catch (err) {
        status.textContent = tr('Speichern fehlgeschlagen: {message}', { message: err.message });
      }
    }, 900);
    /** Änderung abschließen: in den Verlauf, speichern, neu zeichnen. */
    function commit() {
      history.splice(hIndex + 1);
      history.push(JSON.stringify(root));
      if (history.length > 60) history.shift();
      hIndex = history.length - 1;
      touched();
    }
    function touched() {
      baked = false;
      status.textContent = tr('Wird gespeichert …');
      save();
      undoBtn.disabled = hIndex <= 0;
      redoBtn.disabled = hIndex >= history.length - 1;
      recompose();
    }
    function undo(dir) {
      if (hIndex + dir < 0 || hIndex + dir >= history.length) return;
      hIndex += dir;
      root = JSON.parse(history[hIndex]);
      link();
      chain = null; // ein angefangener Mauerzug hinge sonst an einem Punkt, den es nicht mehr gibt
      multi = multi.filter((g) => find(g));
      if (multi.length < 2) multi = [];
      if (sel && !find(sel)) sel = null;
      syncTop();
      renderSide();
      touched();
    }
    const listOf = (type) => ({ object: scene.objects, room: scene.rooms, wall: scene.walls, opening: scene.openings, fill: scene.fills, label: scene.labels })[type];
    const find = (s) => (s ? listOf(s.type).find((x) => x.id === s.id) : null);
    /**
     * Nach dem Laden oder Zurückholen der Szene: Listen ergänzen und die weiteren Stockwerke anbinden. Größe, Umgebung
     * und Maßstab gehören dem Erdgeschoss – die anderen Stockwerke lesen sie von dort (nicht mitgespeichert). Ein
     * Untergeschoss liegt immer im Fels (Umgebung „Dungeon“, Kampfmaßstab, unbewegt).
     */
    function link() {
      for (const k of ['water', 'paths', 'roads', 'dirt', 'high', 'cave', 'rooms', 'walls', 'openings', 'objects', 'fills', 'labels']) root[k] ||= [];
      // ein einzelnes „upper“ aus einem früheren Stand zählt als erstes Obergeschoss
      if (root.upper && typeof root.upper === 'object') root.uppers = [root.upper, ...(Array.isArray(root.uppers) ? root.uppers : [])];
      delete root.upper;
      for (const [key, max] of [['uppers', MAX_UP], ['lowers', MAX_DOWN]]) {
        if (!Array.isArray(root[key]) || !root[key].length) delete root[key];
        else root[key] = root[key].slice(0, max).map((u) => (u && typeof u === 'object' ? u : {}));
      }
      const fixed = (st, k, value) => Object.defineProperty(st, k, { value, enumerable: false, configurable: true });
      const fromRoot = (st, k, get = () => root[k]) => Object.defineProperty(st, k, { get, set: (v) => (root[k] = v), enumerable: false, configurable: true });
      for (const up of root.uppers || []) {
        for (const k of UPPER_LISTS) up[k] = Array.isArray(up[k]) ? up[k] : [];
        for (const k of ['cols', 'rows', 'biome', 'seed', 'scale', 'still']) fromRoot(up, k);
        fixed(up, 'fills', []);
      }
      (root.lowers || []).forEach((low, i) => {
        for (const k of LOWER_LISTS) low[k] = Array.isArray(low[k]) ? low[k] : [];
        for (const k of ['cols', 'rows']) fromRoot(low, k);
        fromRoot(low, 'biome', () => 'dungeon');
        fromRoot(low, 'scale', () => undefined);
        fromRoot(low, 'still', () => true);
        fromRoot(low, 'seed', () => ((root.seed | 0) + 7919 * (i + 1)) | 0);
        for (const k of ['fills', 'water', 'paths', 'roads', 'dirt', 'high']) fixed(low, k, []);
      });
      floor = Math.max(-(root.lowers?.length || 0), Math.min(root.uppers?.length || 0, floor));
      scene = floor > 0 ? root.uppers[floor - 1] : floor < 0 ? root.lowers[-floor - 1] : root;
      renderFloors();
      for (const b of toolbar.children) b.disabled = (floor > 0 && b.dataset.tool === 'terrain') || (floor !== 0 && b.dataset.tool === 'fill');
    }
    const emptyFloor = (u, lists) => !lists.some((k) => u[k].length);
    /**
     * Stockwerk wechseln. Ein neues Stockwerk entsteht beim ersten Betreten (f = eins über dem obersten bzw. eins unter
     * dem untersten); leere Stockwerke am äußeren Ende verschwinden wieder, sobald man sie verlässt.
     */
    function setFloor(f) {
      if (!root) return;
      root.uppers ||= [];
      root.lowers ||= [];
      if (f === root.uppers.length + 1 && f <= MAX_UP) root.uppers.push(Object.fromEntries(UPPER_LISTS.map((k) => [k, []])));
      if (f === -root.lowers.length - 1 && -f <= MAX_DOWN) root.lowers.push(Object.fromEntries(LOWER_LISTS.map((k) => [k, []])));
      floor = Math.max(-root.lowers.length, Math.min(root.uppers.length, f));
      while (root.uppers.length > Math.max(floor, 0) && emptyFloor(root.uppers[root.uppers.length - 1], UPPER_LISTS)) root.uppers.pop();
      while (root.lowers.length > Math.max(-floor, 0) && emptyFloor(root.lowers[root.lowers.length - 1], LOWER_LISTS)) root.lowers.pop();
      link();
      sel = null;
      multi = [];
      chain = null;
      // im Untergeschoss malt der Gelände-Pinsel nur Höhlenboden
      if (floor < 0) (opt.terrain = 'cave'), (opt.r = TERRAIN.cave.r), (opt.erase = false);
      if ((floor > 0 && tool === 'terrain') || (floor !== 0 && tool === 'fill')) setTool('select');
      renderSide();
      recompose();
    }
    /** Renderer des Untergeschosses i (1 = erstes); entsteht beim ersten Gebrauch. */
    function lowR(i) {
      if (!lowRenderers[i - 1]) {
        lowRenderers[i - 1] = new SceneRenderer();
        lowRenderers[i - 1].onLoad = onSprites;
      }
      return lowRenderers[i - 1];
    }
    /** Der Renderer des Stockwerks, an dem gebaut wird. */
    const viewR = () => (floor > 0 ? upR(floor) : floor < 0 ? lowR(-floor) : renderer);
    /** Renderer des Obergeschosses i (1 = erstes); entsteht beim ersten Gebrauch. */
    function upR(i) {
      if (!upRenderers[i - 1]) {
        upRenderers[i - 1] = new SceneRenderer();
        upRenderers[i - 1].onLoad = onSprites;
      }
      return upRenderers[i - 1];
    }
    /**
     * Was unter dem Obergeschoss i liegt: das Bild des Stockwerks darunter und die Fläche aller Räume darunter (wird
     * abgedunkelt – je tiefer, desto dunkler, weil jedes Stockwerk noch einmal abdunkelt).
     */
    function underOf(i) {
      const dim = new Path2D();
      for (const sc of [root, ...root.uppers.slice(0, i - 1)]) {
        for (const r of sc.rooms) {
          if (r.k === 'circle') (dim.moveTo(r.cx + r.r + 8, r.cy), dim.arc(r.cx, r.cy, r.r + 8, 0, 7));
          else dim.rect(r.x - 8, r.y - 8, r.w + 16, r.h + 16);
        }
      }
      return { img: i > 1 ? upR(i - 1).out : renderer.out, dim };
    }
    function syncTop() {
      // die Kopfzeile zeigt immer die Werte der Karte (des Erdgeschosses), auch wenn an einem anderen Stockwerk gebaut wird
      cols.value = root.cols;
      rows.value = root.rows;
      biome.value = root.biome;
      alive.checked = !root.still;
      scale.value = root.scale || 'battle';
    }
    /** Verschiebt den gesamten Inhalt der Karte. */
    function shiftScene(dx, dy) {
      for (const key of ['water', 'paths', 'roads', 'dirt', 'high', 'cave']) for (const st of root[key]) if (st.pts) st.pts = st.pts.map(([x, y]) => [x + dx, y + dy]);
      for (const low of root.lowers || []) for (const st of low.cave) if (st.pts) st.pts = st.pts.map(([x, y]) => [x + dx, y + dy]);
      for (const sc of [root, ...(root.uppers || []), ...(root.lowers || [])]) {
        for (const r of sc.rooms) {
          if (r.k === 'circle') Object.assign(r, { cx: r.cx + dx, cy: r.cy + dy });
          else Object.assign(r, { x: r.x + dx, y: r.y + dy });
        }
        for (const w of sc.walls) Object.assign(w, { x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy });
        for (const o of [...sc.openings, ...sc.objects, ...(sc.labels || [])]) Object.assign(o, { x: o.x + dx, y: o.y + dy });
      }
      for (const f of root.fills) {
        const sh = f.shape;
        if (sh.k === 'rect') Object.assign(sh, { x: sh.x + dx, y: sh.y + dy });
        else Object.assign(sh, { cx: sh.cx + dx, cy: sh.cy + dy });
      }
    }
    const resize = () => {
      let c = Math.max(6, Math.min(80, parseInt(cols.value, 10) || scene.cols));
      let r = Math.max(6, Math.min(80, parseInt(rows.value, 10) || scene.rows));
      // Zusammen höchstens 3600 Felder (etwa 17 Megapixel) – mehr überfordert Browser und Anzeigen
      if (c * r > 3600) {
        if (c !== scene.cols) c = Math.floor(3600 / r);
        else r = Math.floor(3600 / c);
        toast(tr('Die Karte darf höchstens 3600 Felder groß sein.'));
      }
      cols.value = c;
      rows.value = r;
      if (c === scene.cols && r === scene.rows) return;
      scene.cols = c;
      scene.rows = r;
      commit();
      fit();
    };
    cols.addEventListener('change', resize);
    rows.addEventListener('change', resize);
    biome.addEventListener('change', () => {
      scene.biome = biome.value;
      commit();
      renderSide();
    });

    // --- Zeichnen ---------------------------------------------------------------------------------------------------
    let composed = false;
    // Auf sehr großen Karten mit vielen Gegenständen dauert das Zusammensetzen spürbar: dann wird beim Ziehen nur
    // ein Geisterbild bewegt und erst beim Loslassen neu zusammengesetzt
    let slow = false;
    let ghost = null;
    let lowKey = null; // Stand der Stockwerke unter dem, an dem gebaut wird (deren Bilder liegen fertig bereit)
    /** Kartenbild des Stockwerks, an dem gebaut wird. */
    function composeView(o = {}) {
      if (!floor) {
        lowKey = null;
        return renderer.compose(root, o);
      }
      // Untergeschoss: für sich im Fels, nichts scheint durch
      if (floor < 0) return lowR(-floor).compose(scene, o);
      // Die Stockwerke darunter nur neu zusammensetzen, wenn sich dort etwas geändert hat (z. B. durch Rückgängig)
      const key = JSON.stringify(root, (k, v) => (k === 'uppers' ? v.slice(0, floor - 1) : v));
      if (key !== lowKey) {
        renderer.compose(root);
        for (let i = 1; i < floor; i++) upR(i).compose(root.uppers[i - 1], { under: underOf(i) });
        lowKey = key;
      }
      return upR(floor).compose(root.uppers[floor - 1], { ...o, under: underOf(floor) });
    }
    function recompose(hide) {
      if (!scene) return;
      const t0 = performance.now();
      composeView({ hide });
      slow = performance.now() - t0 > 90;
      composed = true;
      draw();
    }
    function onSprites() {
      lowKey = null;
      if (el.isConnected) recompose();
    }
    renderer.onLoad = onSprites;
    let raf = 0;
    function draw() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        paint();
      });
    }
    function fit() {
      const { W, H } = sceneSize(scene);
      const cw = stage.clientWidth;
      const ch = stage.clientHeight;
      view.k = Math.min(cw / W, ch / H) * 0.95;
      view.tx = (cw - W * view.k) / 2;
      view.ty = (ch - H * view.k) / 2;
    }
    function paint() {
      if (!scene || !composed) return;
      const dpr = window.devicePixelRatio || 1;
      const cw = stage.clientWidth;
      const ch = stage.clientHeight;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }
      const c = canvas.getContext('2d');
      const { W, H } = sceneSize(scene);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = '#0d0c0a';
      c.fillRect(0, 0, cw, ch);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = view.k < 0.6 ? 'high' : 'medium';
      c.drawImage(viewR().out, view.tx, view.ty, W * view.k, H * view.k);
      c.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.tx, dpr * view.ty);
      const px = 1 / view.k; // ein Bildschirmpixel in Kartenmaß
      // Raster nur beim Bauen
      if (['room', 'floor', 'wall', 'opening'].includes(tool) || sel?.type === 'room') {
        c.strokeStyle = 'rgba(255,255,255,.22)';
        c.lineWidth = px;
        c.beginPath();
        for (let x = 0; x <= W; x += CELL) (c.moveTo(x, 0), c.lineTo(x, H));
        for (let y = 0; y <= H; y += CELL) (c.moveTo(0, y), c.lineTo(W, y));
        c.stroke();
      }
      c.strokeStyle = 'rgba(0,0,0,.6)';
      c.lineWidth = px;
      c.strokeRect(0, 0, W, H);
      const above = floor + 1 > 0 ? root.uppers?.[floor] : floor + 1 < 0 ? root.lowers?.[-floor - 2] : root;
      if (above?.rooms.length && above !== scene) {
        // ein gestrichelter Umriss zeigt, wo das nächste Stockwerk darüber liegt
        c.save();
        c.setLineDash([9 * px, 7 * px]);
        c.strokeStyle = 'rgba(255,213,74,.6)';
        c.lineWidth = 1.6 * px;
        c.beginPath();
        for (const r of above.rooms) {
          if (r.k === 'circle') (c.moveTo(r.cx + r.r, r.cy), c.arc(r.cx, r.cy, r.r, 0, 7));
          else c.rect(r.x, r.y, r.w, r.h);
        }
        c.stroke();
        c.restore();
      }
      if (showTv && sync.settings?.table) {
        // Rahmen in Tischgröße, an Feldgrenzen ausgerichtet; ohne Mauszeiger in der Kartenmitte
        const cells = Object.values(S().display.table.views || {}).find((v) => v?.w > 0 && v?.h > 0) || tableCells(sync.settings.table);
        const fw = cells.w * CELL;
        const fh = cells.h * CELL;
        const [mx, my] = hover || [W / 2, H / 2];
        const fx = Math.round((mx - fw / 2) / CELL) * CELL;
        const fy = Math.round((my - fh / 2) / CELL) * CELL;
        c.save();
        c.fillStyle = 'rgba(0,0,0,.35)';
        c.beginPath();
        c.rect(0, 0, W, H);
        c.rect(fx, fy, fw, fh);
        c.fill('evenodd');
        c.setLineDash([10 * px, 6 * px]);
        c.strokeStyle = '#ffd54a';
        c.lineWidth = 2 * px;
        c.strokeRect(fx, fy, fw, fh);
        c.setLineDash([]);
        c.fillStyle = '#ffd54a';
        c.font = `${13 * px}px sans-serif`;
        c.fillText(tr('Spieltisch: {w} × {h} Felder', { w: Math.round(cells.w * 10) / 10, h: Math.round(cells.h * 10) / 10 }), fx + 6 * px, fy - 6 * px);
        c.restore();
      }
      // Füllbereiche
      if (tool === 'fill' || tool === 'select') {
        for (const f of scene.fills) {
          const on = sel?.type === 'fill' && sel.id === f.id;
          c.setLineDash([8 * px, 6 * px]);
          c.strokeStyle = on ? '#ffd54a' : 'rgba(255,255,255,.45)';
          c.lineWidth = (on ? 2 : 1.2) * px;
          shapePath(c, f.shape);
          c.stroke();
          c.setLineDash([]);
        }
      }
      // Namen: stehen nicht im Kartenbild, das Spiel schreibt sie darüber (und kann sie verbergen)
      for (const l of scene.labels || []) drawLabel(c, l, { dm: true });
      // Auswahl (einzeln oder mehrere)
      for (const one of multi.length ? multi : sel ? [sel] : []) {
        const it = find(one);
        if (!it) continue;
        const sel = one; // eslint-disable-line no-shadow
        c.strokeStyle = '#ffd54a';
        c.lineWidth = 2 * px;
        c.setLineDash([6 * px, 4 * px]);
        if (sel.type === 'object') {
          const sp = sprite(it, biomeOf(scene), 1);
          c.save();
          c.translate(it.x, it.y);
          c.rotate(((it.rot || 0) * Math.PI) / 180);
          if (CATALOG[it.t].size) (c.beginPath(), c.arc(0, 0, sp.w * 0.44, 0, 7), c.stroke());
          else c.strokeRect(-sp.w / 2, -sp.h / 2, sp.w, sp.h);
          c.restore();
        } else if (sel.type === 'room') {
          shapePath(c, roomShape(it));
          c.stroke();
          c.setLineDash([]);
          c.fillStyle = '#ffd54a';
          if (!multi.length) for (const [x, y] of handles(it)) c.fillRect(x - 5 * px, y - 5 * px, 10 * px, 10 * px);
        } else if (sel.type === 'wall') {
          c.beginPath();
          c.moveTo(it.x1, it.y1);
          c.lineTo(it.x2, it.y2);
          c.lineWidth = 5 * px;
          c.stroke();
        } else if (sel.type === 'opening') {
          c.beginPath();
          c.arc(it.x, it.y, it.w / 2 + 8, 0, 7);
          c.stroke();
        } else if (sel.type === 'label') {
          const [hw, hh] = labelBox(it);
          c.save();
          c.translate(it.x, it.y);
          c.rotate(((it.rot || 0) * Math.PI) / 180);
          c.strokeRect(-hw, -hh, 2 * hw, 2 * hh);
          c.restore();
        } else if (sel.type === 'fill' && multi.length) {
          shapePath(c, it.shape);
          c.stroke();
        }
        c.setLineDash([]);
      }
      // Mauerzug: Vorschau der nächsten Strecke und der Punkt, an dem es weitergeht
      if (chain && tool === 'wall') {
        c.fillStyle = '#ffd54a';
        c.beginPath();
        c.arc(chain.last[0], chain.last[1], 6 * px, 0, 7);
        c.fill();
        if (hover && !drag) {
          c.strokeStyle = 'rgba(255,213,74,.6)';
          c.lineWidth = 3 * px;
          c.setLineDash([8 * px, 6 * px]);
          c.beginPath();
          c.moveTo(chain.last[0], chain.last[1]);
          c.lineTo(snap(hover[0]), snap(hover[1]));
          c.stroke();
          c.setLineDash([]);
        }
      }
      // Große Karte: der gezogene Gegenstand als Geisterbild an seiner neuen Stelle
      if (ghost) {
        const sp = sprite(ghost, biomeOf(scene), 1);
        if (sp?.img) {
          c.save();
          c.globalAlpha = 0.8;
          c.translate(ghost.x, ghost.y);
          c.rotate(((ghost.rot || 0) * Math.PI) / 180);
          if (ghost.flip) c.scale(-1, 1);
          c.drawImage(sp.img, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
          c.restore();
        }
      }
      // Vorschau des Werkzeugs
      if (drag?.preview) drag.preview(c, px);
      else if (hover && tool === 'terrain') {
        c.strokeStyle = opt.erase ? '#ff8a7a' : `rgb(${TERRAIN[opt.terrain].color})`;
        c.lineWidth = 2 * px;
        c.beginPath();
        c.arc(hover[0], hover[1], opt.r, 0, 7);
        c.stroke();
      } else if (hover && tool === 'object') {
        const o = { ...ghostObj(hover[0], hover[1]), s: CATALOG[opt.obj].size ? zoomOf() : 1 };
        const sp = sprite(o, biomeOf(scene), 1);
        if (sp?.img) {
          c.save();
          c.globalAlpha = 0.75;
          c.translate(o.x, o.y);
          c.rotate((o.rot * Math.PI) / 180);
          if (o.flip) c.scale(-1, 1);
          c.drawImage(sp.img, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
          c.restore();
        } else sp?.promise.then(draw);
      } else if (hover && tool === 'opening') {
        const w = wallAt(hover[0], hover[1]);
        if (w) {
          const len = opt.opening === 'window' ? 56 : opt.opening === 'gate' ? 140 : 70;
          c.strokeStyle = '#ffd54a';
          c.lineWidth = 6 * px;
          c.beginPath();
          c.moveTo(w.x - (Math.cos(w.a) * len) / 2, w.y - (Math.sin(w.a) * len) / 2);
          c.lineTo(w.x + (Math.cos(w.a) * len) / 2, w.y + (Math.sin(w.a) * len) / 2);
          c.stroke();
        }
      } else if (hover && tool === 'floor') {
        const r = roomAt(scene.rooms, hover[0], hover[1]);
        if (r) {
          c.fillStyle = 'rgba(255,213,74,.2)';
          shapePath(c, roomShape(r));
          c.fill();
        }
      }
    }
    const roomShape = (r) => (r.k === 'circle' ? { k: 'ellipse', cx: r.cx, cy: r.cy, rx: r.r, ry: r.r } : r);
    function shapePath(c, s) {
      c.beginPath();
      if (s.k === 'ellipse') c.ellipse(s.cx, s.cy, s.rx, s.ry, 0, 0, 7);
      else c.rect(s.x, s.y, s.w, s.h);
    }
    const handles = (r) => (r.k === 'circle' ? [[r.cx + r.r, r.cy]] : [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]);
    /**
     * Wandfackel und Ähnliches: nahe einer Wand rastet das Stück mit dem Rücken an sie und dreht sich zum Raum
     * (auf die Seite, auf der der Mauszeiger steht). Sonst bleibt es, wo es ist.
     */
    function mounted(t, x, y, rot) {
      const depth = CATALOG[t].wallMount;
      const w = depth && nearestWall(buildingOutline(scene.rooms), scene.walls, x, y);
      if (!w || w.d > 45) return { x, y, rot };
      let nx = x - w.x;
      let ny = y - w.y;
      const L = Math.hypot(nx, ny);
      if (L < 2) [nx, ny] = [-Math.sin(w.a), Math.cos(w.a)];
      else [nx, ny] = [nx / L, ny / L];
      return { x: Math.round(w.x + nx * (depth + 5)), y: Math.round(w.y + ny * (depth + 5)), rot: Math.round((Math.atan2(-nx, ny) * 180) / Math.PI + 360) % 360 };
    }
    /**
     * Stelle auf der Wand so verschieben, dass eine Öffnung der Breite width Abstand zu den Enden des Wandstücks hält
     * (ein Tor in der Burgmauer braucht Platz für seine Tortürme). Liefert [x, y] oder null, wenn es nicht passt.
     */
    function awayFromEnds(w, width, kind) {
      const outline = buildingOutline(scene.rooms);
      const on = (q) => {
        const dx = q.x2 - q.x1;
        const dy = q.y2 - q.y1;
        const L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((w.x - q.x1) * dx + (w.y - q.y1) * dy) / L2));
        return Math.hypot(q.x1 + dx * t - w.x, q.y1 + dy * t - w.y) < 2 ? t : -1;
      };
      const seg = [...scene.walls, ...outline.segs].find((q) => on(q) >= 0);
      if (!seg) {
        // runde Wand: Tore nur in weiten Bögen
        const arc = outline.arcs.find((c) => Math.abs(Math.hypot(w.x - c.cx, w.y - c.cy) - c.r) < 3);
        return arc && kind === 'gate' && arc.r < 3 * CELL ? null : [w.x, w.y];
      }
      const L = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
      const margin = kind === 'gate' && seg.kind === 'rampart' ? 134 : width / 2 + (kind === 'gate' ? 12 : 6);
      if (L < 2 * margin) return null;
      const t = Math.max(margin / L, Math.min(1 - margin / L, on(seg)));
      return [seg.x1 + (seg.x2 - seg.x1) * t, seg.y1 + (seg.y2 - seg.y1) * t];
    }
    const wallAt = (x, y) => {
      const w = nearestWall(buildingOutline(scene.rooms), scene.walls, x, y);
      return w && w.d < 60 ? w : null;
    };

    // --- Treffer ----------------------------------------------------------------------------------------------------
    function pick(x, y) {
      const B = biomeOf(scene);
      const rank = { top: 2, obj: 1, rug: 0 };
      let best = null;
      scene.objects.forEach((o, i) => {
        const sp = sprite(o, B, 1);
        if (!sp) return;
        const a = (-(o.rot || 0) * Math.PI) / 180;
        const dx = (x - o.x) * Math.cos(a) - (y - o.y) * Math.sin(a);
        const dy = (x - o.x) * Math.sin(a) + (y - o.y) * Math.cos(a);
        const hit = CATALOG[o.t].size ? Math.hypot(dx, dy) < sp.w * 0.42 : Math.abs(dx) < sp.w / 2 && Math.abs(dy) < sp.h / 2;
        const score = rank[sp.layer] * 1e6 + i;
        if (hit && (!best || score > best.score)) best = { type: 'object', id: o.id, score };
      });
      if (best) return best;
      for (const o of scene.openings) if (Math.hypot(o.x - x, o.y - y) < o.w / 2) return { type: 'opening', id: o.id };
      for (const w of scene.walls) {
        const n = nearestWall({ segs: [w], arcs: [] }, [], x, y);
        if (n.d < 8) return { type: 'wall', id: w.id };
      }
      // Namen erst jetzt: was unter einem breiten Viertelnamen steht, bleibt anklickbar
      const label = labelAt(scene.labels, x, y);
      if (label) return { type: 'label', id: label.id };
      const r = roomAt(scene.rooms, x, y);
      if (r) return { type: 'room', id: r.id };
      for (let i = scene.fills.length - 1; i >= 0; i--) {
        const [bx, by, bw, bh] = shapeBox(scene.fills[i].shape);
        if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return { type: 'fill', id: scene.fills[i].id };
      }
      return null;
    }

    // --- Eingabe ----------------------------------------------------------------------------------------------------
    const toMap = (e) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left - view.tx) / view.k, (e.clientY - r.top - view.ty) / view.k];
    };
    let ghostV = 7;
    let ghostRot = 0; // zufällige Drehung des nächsten Stücks, zusätzlich zur eingestellten
    let ghostFlip = false;
    /** Das nächste Stück vorbereiten: Variante, Drehung und Spiegelung nach den Setz-Optionen. */
    function nextGhost() {
      if (opt.vary) ghostV = Math.floor(Math.random() * 1e6);
      ghostRot = opt.rotMode === 'free' ? Math.floor(Math.random() * 360) : opt.rotMode === 'quarter' ? Math.floor(Math.random() * 4) * 90 : opt.rotMode === 'slight' ? Math.round(Math.random() * 24 - 12) : 0;
      ghostFlip = !!opt.flipRand && Math.random() < 0.5;
    }
    /** Das Stück, das als Nächstes gesetzt wird – so, wie es die Vorschau am Mauszeiger zeigt. */
    const ghostObj = (x, y) => ({ t: opt.obj, ...mounted(opt.obj, x, y, (opt.rot + ghostRot + 360) % 360), v: ghostV, ...(ghostFlip && !CATALOG[opt.obj].lit ? { flip: true } : {}) });
    let spaceDown = false;
    const pointers = new Map();
    let pinch = null;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const k = Math.max(0.05, Math.min(4, view.k * Math.exp(-e.deltaY * 0.0015)));
      view.tx = sx - ((sx - view.tx) / view.k) * k;
      view.ty = sy - ((sy - view.ty) / view.k) * k;
      view.k = k;
      draw();
    }, { passive: false });
    canvas.addEventListener('pointerdown', (e) => {
      if (!scene) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* z. B. bereits beendeter Zeiger */
      }
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) {
        // Zwei Finger: verschieben und zoomen; ein begonnener Strich wird verworfen
        drag = null;
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 };
        return;
      }
      const [x, y] = toMap(e);
      if (e.button === 1 || e.button === 2 || spaceDown) {
        drag = { pan: [e.clientX, e.clientY, view.tx, view.ty] };
        return;
      }
      if (e.button !== 0) return;
      drag = start(x, y, e) || null;
      draw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!scene) return;
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const cx = (a[0] + b[0]) / 2;
        const cy = (a[1] + b[1]) / 2;
        const r = canvas.getBoundingClientRect();
        const k = Math.max(0.05, Math.min(4, (view.k * d) / pinch.d));
        view.tx = cx - r.left - ((pinch.cx - r.left - view.tx) / view.k) * k;
        view.ty = cy - r.top - ((pinch.cy - r.top - view.ty) / view.k) * k;
        view.k = k;
        pinch = { d, cx, cy };
        return draw();
      }
      hover = toMap(e);
      if (drag?.pan) {
        view.tx = drag.pan[2] + e.clientX - drag.pan[0];
        view.ty = drag.pan[3] + e.clientY - drag.pan[1];
      } else if (drag?.move) drag.move(hover[0], hover[1], e);
      draw();
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pinch) {
        if (pointers.size < 2) pinch = null;
        return;
      }
      const d = drag;
      drag = null;
      if (d?.up) d.up(...toMap(e), e);
      draw();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', (e) => {
      pointers.delete(e.pointerId);
      pinch = null;
      drag = null;
      recompose();
    });
    canvas.addEventListener('pointerleave', () => {
      hover = null;
      draw();
    });
    const onKey = (e) => {
      if (!el.isConnected) return window.removeEventListener('keydown', onKey), window.removeEventListener('keyup', onKeyUp);
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.code === 'Space') {
        spaceDown = true;
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') (e.preventDefault(), undo(e.shiftKey ? 1 : -1));
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') (e.preventDefault(), undo(1));
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') (e.preventDefault(), duplicate());
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') copySelection();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') paste();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && tool === 'select') (e.preventDefault(), setSelection([...scene.fills.map((f) => ({ type: 'fill', id: f.id })), ...scene.objects.filter((o) => !o.fill).map((o) => ({ type: 'object', id: o.id })), ...(scene.labels || []).map((l) => ({ type: 'label', id: l.id })), ...scene.openings.map((o) => ({ type: 'opening', id: o.id })), ...scene.walls.map((w) => ({ type: 'wall', id: w.id })), ...scene.rooms.map((r) => ({ type: 'room', id: r.id }))]));
      else if (e.key === 'Delete' || e.key === 'Backspace') remove();
      else if (e.key === 'Enter' && chain) ((chain = null), draw());
      else if (e.key.toLowerCase() === 'r') rotate(e.shiftKey ? -15 : 15);
      else if (e.key.toLowerCase() === 'f') flip();
      else if (e.key === 'PageUp') (e.preventDefault(), reorder(1));
      else if (e.key === 'PageDown') (e.preventDefault(), reorder(-1));
      else if (e.key.startsWith('Arrow')) {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (d && nudge(d[0], d[1], e.shiftKey)) e.preventDefault();
      } else if (e.key === 'Escape') {
        sel = null;
        multi = [];
        setTool('select');
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') spaceDown = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    new ResizeObserver(() => el.isConnected && draw()).observe(stage);

    // --- Werkzeuge --------------------------------------------------------------------------------------------------
    /** Beginnt eine Aktion; liefert { move, up, preview } oder nichts. */
    function start(x, y, e) {
      if (e.altKey && (tool === 'select' || tool === 'object')) {
        // Pipette: den angeklickten Gegenstand als Vorlage nehmen
        const hit = pick(x, y);
        const src = hit?.type === 'object' && find(hit);
        if (src) {
          opt.obj = src.t;
          opt.rot = src.rot || 0;
          // das nächste Stück gleicht der Vorlage genau; danach gelten wieder die Setz-Optionen
          ghostV = src.v | 0;
          ghostRot = 0;
          ghostFlip = !!src.flip;
          setTool('object');
          renderSide();
          return null;
        }
      }
      if (tool === 'select') return startSelect(x, y, e);
      if (tool === 'terrain') {
        const def = TERRAIN[opt.terrain];
        const stroke = { k: 'brush', pts: [[x, y]], r: opt.r, ...(opt.erase || e.altKey ? { sub: true } : {}), ...(opt.terrain === 'high' ? { lvl: opt.lvl } : {}) };
        return {
          move: (mx, my) => stroke.pts.push([mx, my]),
          preview: (c) => {
            c.strokeStyle = stroke.sub ? 'rgba(255,120,100,.5)' : `rgba(${def.color},.6)`;
            c.lineWidth = 2 * stroke.r;
            c.lineCap = c.lineJoin = 'round';
            c.beginPath();
            stroke.pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
            if (stroke.pts.length === 1) c.lineTo(x + 0.1, y);
            c.stroke();
          },
          up: () => {
            stroke.pts = thin(stroke.pts, Math.max(4, stroke.r / 4));
            // Radieren ohne etwas darunter wäre nur Ballast
            if (stroke.sub && !scene[def.key].length) return;
            scene[def.key].push(stroke);
            commit();
          },
        };
      }
      if (tool === 'room') {
        const x0 = snap(x);
        const y0 = snap(y);
        let room = null;
        return {
          move: (mx, my) => {
            if (opt.room === 'circle') {
              const r = Math.max(HALF, snap(Math.hypot(mx - x0, my - y0)));
              room = { k: 'circle', cx: x0, cy: y0, r };
            } else {
              const x1 = snap(mx);
              const y1 = snap(my);
              room = Math.abs(x1 - x0) >= HALF && Math.abs(y1 - y0) >= HALF ? { k: 'rect', x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) } : null;
            }
          },
          preview: (c, px) => {
            if (!room) return;
            c.fillStyle = 'rgba(255,213,74,.25)';
            c.strokeStyle = '#ffd54a';
            c.lineWidth = 2 * px;
            shapePath(c, roomShape(room));
            c.fill();
            c.stroke();
          },
          up: () => {
            if (!room) return;
            const id = uid();
            scene.rooms.push({ id, ...room, floor: opt.floor, ...(opt.open ? { open: true } : {}), ...(opt.ruin ? { ruin: true } : {}), ...(opt.timber ? { timber: true } : {}) });
            sel = { type: 'room', id };
            commit();
            renderSide();
          },
        };
      }
      if (tool === 'floor') {
        const r = roomAt(scene.rooms, x, y);
        if (r && r.floor !== opt.floor) {
          r.floor = opt.floor;
          commit();
        }
        return null;
      }
      if (tool === 'wall') {
        // Mauerzug: Klick für Klick weiter vom letzten Punkt; Ziehen zieht eine einzelne Strecke. Ein Klick auf den
        // letzten Punkt (Doppelklick) oder Esc/Enter beendet den Zug, ein Klick auf den Anfang schließt den Ring.
        let p = [snap(x), snap(y)];
        // Fangbereich in Bildschirmpixeln: mit dem Finger trifft man den Punkt sonst kaum
        const near = (q) => Math.hypot(q[0] - x, q[1] - y) < 16 / view.k;
        if (chain && near(chain.last)) {
          chain = null;
          renderSide();
          draw();
          return null;
        }
        if (chain && near(chain.start)) p = chain.start;
        const chained = !!chain;
        const from = chain ? chain.last : p;
        const w = { x1: from[0], y1: from[1], x2: p[0], y2: p[1] };
        return {
          move: (mx, my) => ((w.x2 = snap(mx)), (w.y2 = snap(my))),
          preview: (c, px) => {
            c.strokeStyle = '#ffd54a';
            c.lineWidth = 5 * px;
            c.beginPath();
            c.moveTo(w.x1, w.y1);
            c.lineTo(w.x2, w.y2);
            c.stroke();
          },
          up: () => {
            if (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < HALF) {
              // Klick ohne Ziehen: hier beginnt ein Zug
              if (!chain) chain = { start: p, last: p };
              renderSide();
              return draw();
            }
            scene.walls.push({ id: uid(), ...w, kind: opt.wall });
            // Nur ein angefangener Zug geht weiter – eine einzeln gezogene Wand bleibt für sich
            if (chained) {
              const end = [w.x2, w.y2];
              // Ring geschlossen? Dann ist der Zug fertig
              chain = end[0] === chain.start[0] && end[1] === chain.start[1] ? null : { start: chain.start, last: end };
              if (!chain) renderSide();
            }
            commit();
          },
        };
      }
      if (tool === 'label') {
        prompt2(tr('Name auf der Karte'), '').then((text) => {
          if (!text) return;
          const id = uid();
          scene.labels.push({ id, x: Math.round(x), y: Math.round(y), text, size: opt.labelSize, kind: opt.labelKind });
          sel = { type: 'label', id };
          setTool('select');
          sel = { type: 'label', id };
          commit();
          renderSide();
        });
        return null;
      }
      if (tool === 'opening') {
        const w = wallAt(x, y);
        if (!w) return toast(tr('Türen und Fenster sitzen auf einer Wand – erst einen Raum oder eine Wand anlegen.')), null;
        // Die Zeichnung liegt immer „richtig herum“: Winkel auf −90° … 90° bringen
        let a = w.a;
        while (a > Math.PI / 2) a -= Math.PI;
        while (a <= -Math.PI / 2) a += Math.PI;
        const width = opt.opening === 'window' ? 56 : opt.opening === 'gate' ? 140 : 70;
        const at = awayFromEnds(w, width, opt.opening);
        if (!at) return toast(opt.opening === 'gate' ? tr('Für ein Tor ist dieses Mauerstück zu kurz oder zu stark gebogen.') : tr('Dieses Wandstück ist dafür zu kurz.')), null;
        scene.openings.push({ id: uid(), k: opt.opening, x: Math.round(at[0]), y: Math.round(at[1]), a: Math.round(a * 1000) / 1000, w: width });
        commit();
        return null;
      }
      if (tool === 'object') {
        const def = CATALOG[opt.obj];
        used(opt.obj);
        scene.objects.push({ id: uid(), ...ghostObj(Math.round(x), Math.round(y)), s: def.size ? Math.round((0.8 + Math.random() * 0.5) * zoomOf() * 100) / 100 : 1 });
        nextGhost();
        commit();
        return null;
      }
      if (tool === 'fill') {
        let shape = null;
        return {
          move: (mx, my) => {
            if (opt.fillShape === 'rect') shape = { k: 'rect', x: Math.min(x, mx), y: Math.min(y, my), w: Math.abs(mx - x), h: Math.abs(my - y) };
            else {
              const r = Math.hypot(mx - x, my - y);
              shape = { k: 'ellipse', cx: x, cy: y, rx: r, ry: r };
            }
          },
          preview: (c, px) => {
            if (!shape) return;
            c.fillStyle = 'rgba(120,200,110,.2)';
            c.strokeStyle = '#bfe7a8';
            c.lineWidth = 2 * px;
            shapePath(c, shape);
            c.fill();
            c.stroke();
          },
          up: () => {
            const [, , bw, bh] = shape ? shapeBox(shape) : [0, 0, 0, 0];
            if (bw < 60 || bh < 60) return;
            for (const k of Object.keys(shape)) if (k !== 'k') shape[k] = Math.round(shape[k]);
            const f = { id: uid(), kind: opt.fill, density: opt.density, seed: Math.floor(Math.random() * 1e9), shape };
            scene.fills.push(f);
            refill(f);
            sel = { type: 'fill', id: f.id };
            commit();
            renderSide();
          },
        };
      }
      return null;
    }
    /** Inhalt eines Füllbereichs (neu) erzeugen – nur auf freiem Boden. */
    function refill(f, quiet = false) {
      scene.objects = scene.objects.filter((o) => o.fill !== f.id);
      renderer.compose(scene); // Gelände und Gebäude aktuell, damit das Streuen weiß, wo Platz ist
      // Wo schon etwas steht (Häuser, Möbel, andere Bäume), bleibt frei
      const taken = scene.objects.map((o) => {
        const sp = sprite(o, biomeOf(scene), 1);
        return sp && sp.layer !== 'rug' ? [o.x, o.y, CATALOG[o.t].size ? sp.w / 2 : Math.max(sp.w, sp.h) * 0.62] : null;
      }).filter(Boolean);
      const z = zoomOf();
      // Häuser weichen den Grundflächen gesetzter Gebäude und anderer Häuser aus (mit etwas Abstand)
      const rects = f.kind !== 'houses' ? [] : scene.objects.map((o) => {
        const sp = sprite(o, biomeOf(scene), 1);
        return sp && sp.layer !== 'rug' && !CATALOG[o.t].size ? { x: o.x, y: o.y, hw: sp.w / 2 + 6, hh: sp.h / 2 + 6, rot: o.rot || 0 } : null;
      }).filter(Boolean);
      const free = (x, y, r, t, foot) => renderer.blocked(scene, x, y, r, t, foot) || (foot ? foot.some(([px, py]) => inRects(rects, px, py)) || rects.some((q) => inRects([{ x, y, hw: r, hh: r * 0.6, rot: 0 }], q.x, q.y)) : taken.some(([ox, oy, or]) => Math.hypot(ox - x, oy - y) < (or + r) * 0.7));
      // Häuser haben ihre eigene Größe; Bäume, Büsche und Felsen richten sich nach dem Maßstab der Karte
      const made = f.kind === 'houses' ? scatterHouses(f, free, [...cutStreets(scene.roads || []), ...cutStreets(scene.paths || [])], { tree: z }) : scatter(f, CELL * z, free);
      if (f.kind !== 'houses') for (const o of made) o.s = Math.round(o.s * z * 100) / 100;
      scene.objects.push(...made);
      if (!made.length && !quiet) toast(tr('Hier ist kein freier Boden zum Füllen.'));
    }

    function startSelect(x, y, e) {
      // Griffe des gewählten Raums zuerst
      const cur = find(sel);
      if (cur && sel.type === 'room') {
        const hs = handles(cur);
        const i = hs.findIndex(([hx, hy]) => Math.hypot(hx - x, hy - y) < 12 / view.k);
        if (i >= 0) {
          const fixed = cur.k === 'circle' ? null : hs[(i + 2) % 4];
          let moved = false;
          return {
            move: (mx, my) => {
              moved = true;
              if (cur.k === 'circle') cur.r = Math.max(HALF, snap(Math.hypot(mx - cur.cx, my - cur.cy)));
              else {
                const nx = snap(mx);
                const ny = snap(my);
                if (Math.abs(nx - fixed[0]) < HALF || Math.abs(ny - fixed[1]) < HALF) return;
                Object.assign(cur, { x: Math.min(nx, fixed[0]), y: Math.min(ny, fixed[1]), w: Math.abs(nx - fixed[0]), h: Math.abs(ny - fixed[1]) });
              }
              recompose();
            },
            up: () => moved && commit(),
          };
        }
      }
      const hit = pick(x, y);
      const same = (a, b) => a.type === b.type && a.id === b.id;
      if (hit && (e?.shiftKey || opt.multiSel)) {
        // Umschalt-Klick (oder Schalter „Mehrfach“): Element zur Auswahl dazunehmen oder wieder herausnehmen
        const one = { type: hit.type, id: hit.id };
        let group = multi.length ? multi : sel ? [sel] : [];
        group = group.some((g) => same(g, one)) ? group.filter((g) => !same(g, one)) : [...group, one];
        setSelection(group);
        return null;
      }
      if (hit && multi.some((g) => same(g, hit))) {
        // Gruppe gemeinsam ziehen
        const mv = movers(multi);
        const grid = mv.rooms.size || mv.walls.size;
        let done = [0, 0];
        let moved = false;
        return {
          move: (mx, my) => {
            let dx = mx - x;
            let dy = my - y;
            if (!moved && Math.hypot(dx, dy) < 4 / view.k) return;
            moved = true;
            if (grid) [dx, dy] = [snap(dx), snap(dy)];
            shiftMovers(mv, Math.round(dx - done[0]), Math.round(dy - done[1]));
            done = [Math.round(dx), Math.round(dy)];
            if (slow) draw();
            else recompose();
          },
          up: () => moved && commit(),
        };
      }
      if (!hit) {
        // Rahmen auf freier Fläche: alles darin auswählen
        let box = null;
        return {
          move: (mx, my) => (box = [Math.min(x, mx), Math.min(y, my), Math.max(x, mx), Math.max(y, my)]),
          preview: (c, px) => {
            if (!box) return;
            c.fillStyle = 'rgba(255,213,74,.12)';
            c.strokeStyle = '#ffd54a';
            c.lineWidth = 1.5 * px;
            c.setLineDash([6 * px, 4 * px]);
            c.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
            c.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
            c.setLineDash([]);
          },
          up: () => {
            if (!box || (box[2] - box[0] < 6 / view.k && box[3] - box[1] < 6 / view.k)) return setSelection([]);
            const inBox = (px2, py2) => px2 >= box[0] && px2 <= box[2] && py2 >= box[1] && py2 <= box[3];
            const group = [];
            // Füllbereiche zählen als Ganzes; ihre Bäume und Häuser kommen dann nicht einzeln in die Auswahl
            const fills = new Set();
            for (const f of scene.fills) {
              const [fx, fy, fw, fh] = shapeBox(f.shape);
              if (inBox(fx + fw / 2, fy + fh / 2)) (fills.add(f.id), group.push({ type: 'fill', id: f.id }));
            }
            for (const o of scene.objects) if (!fills.has(o.fill) && inBox(o.x, o.y)) group.push({ type: 'object', id: o.id });
            for (const l of scene.labels || []) if (inBox(l.x, l.y)) group.push({ type: 'label', id: l.id });
            for (const o of scene.openings) if (inBox(o.x, o.y)) group.push({ type: 'opening', id: o.id });
            for (const w of scene.walls) if (inBox((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2)) group.push({ type: 'wall', id: w.id });
            for (const r of scene.rooms) if (r.k === 'circle' ? inBox(r.cx, r.cy) : inBox(r.x + r.w / 2, r.y + r.h / 2)) group.push({ type: 'room', id: r.id });
            setSelection(group);
          },
        };
      }
      multi = [];
      sel = hit && { type: hit.type, id: hit.id };
      renderSide();
      const it = find(sel);
      if (!it) return null;
      const orig = JSON.stringify(it);
      const o0 = JSON.parse(orig);
      const members = sel.type === 'fill' ? scene.objects.filter((o) => o.fill === it.id).map((o) => [o, o.x, o.y]) : [];
      // Raum: Türen, Fenster, Innenwände und Einrichtung wandern mit
      const att = sel.type === 'room' || sel.type === 'wall' ? attached(it, sel.type) : { points: [], walls: [] };
      const att0 = { points: att.points.map((o) => [o, o.x, o.y]), walls: att.walls.map((w) => [w, w.x1, w.y1, w.x2, w.y2]) };
      let moved = false;
      return {
        move: (mx, my) => {
          let dx = mx - x;
          let dy = my - y;
          if (!moved && Math.hypot(dx, dy) < 4 / view.k) return;
          moved = true;
          if (sel.type === 'object' || sel.type === 'label') Object.assign(it, { x: Math.round(o0.x + dx), y: Math.round(o0.y + dy) });
          else if (sel.type === 'room') {
            dx = snap(dx);
            dy = snap(dy);
            if (it.k === 'circle') Object.assign(it, { cx: o0.cx + dx, cy: o0.cy + dy });
            else Object.assign(it, { x: o0.x + dx, y: o0.y + dy });
            for (const [o, ox, oy] of att0.points) Object.assign(o, { x: ox + dx, y: oy + dy });
            for (const [w, x1, y1, x2, y2] of att0.walls) Object.assign(w, { x1: x1 + dx, y1: y1 + dy, x2: x2 + dx, y2: y2 + dy });
          } else if (sel.type === 'wall') {
            dx = snap(dx);
            dy = snap(dy);
            Object.assign(it, { x1: o0.x1 + dx, y1: o0.y1 + dy, x2: o0.x2 + dx, y2: o0.y2 + dy });
            for (const [o, ox, oy] of att0.points) Object.assign(o, { x: ox + dx, y: oy + dy });
          } else if (sel.type === 'opening') {
            const w = wallAt(mx, my);
            if (!w) return;
            let a = w.a;
            while (a > Math.PI / 2) a -= Math.PI;
            while (a <= -Math.PI / 2) a += Math.PI;
            Object.assign(it, { x: Math.round(w.x), y: Math.round(w.y), a: Math.round(a * 1000) / 1000 });
          } else if (sel.type === 'fill') {
            const s = it.shape;
            if (s.k === 'rect') Object.assign(s, { x: Math.round(o0.shape.x + dx), y: Math.round(o0.shape.y + dy) });
            else Object.assign(s, { cx: Math.round(o0.shape.cx + dx), cy: Math.round(o0.shape.cy + dy) });
            for (const [o, ox, oy] of members) Object.assign(o, { x: Math.round(ox + dx), y: Math.round(oy + dy) });
          }
          if (slow) {
            ghost = sel.type === 'object' ? it : null;
            draw();
          } else recompose();
        },
        up: () => {
          ghost = null;
          if (moved && JSON.stringify(it) !== orig) commit();
        },
      };
    }
    // Zuletzt benutzte Gegenstände – je Gerät gemerkt
    const RECENT = 'mb:recent';
    let recent = [];
    try {
      recent = JSON.parse(localStorage.getItem(RECENT) || '[]').filter((t) => CATALOG[t]);
    } catch {
      /* ohne Speicher eben ohne Liste */
    }
    function used(t) {
      recent = [t, ...recent.filter((x) => x !== t)].slice(0, 8);
      try {
        localStorage.setItem(RECENT, JSON.stringify(recent));
      } catch {
        /* voll oder gesperrt */
      }
    }
    /**
     * Raum nach einem Thema einrichten (oder mit theme = '' wieder leeren). Die erzeugten Stücke gehören zum Raum:
     * „Neu würfeln“ ersetzt sie, alles andere im Raum bleibt stehen und wird umstellt.
     */
    /**
     * Raum einrichten. theme: Name eines Themas, 'custom' (eigene Regeltabelle in room.themeDef, z. B. von der KI) oder
     * leer (Einrichtung entfernen). quiet: ohne Meldung und ohne eigenen Schritt im Verlauf.
     */
    function furnishRoom(room, theme, reroll = true, quiet = false) {
      scene.objects = scene.objects.filter((o) => o.theme !== room.id);
      room.theme = theme || undefined;
      if (theme !== 'custom') (delete room.themeDef, delete room.themeName);
      if (!theme) return quiet ? null : commit();
      if (reroll || !room.themeSeed) room.themeSeed = Math.floor(Math.random() * 1e9);
      const B = biomeOf(scene);
      const box = (t) => {
        const sp = sprite({ t, v: 0, s: 1, rot: 0 }, B, 1);
        return sp ? [sp.w, sp.h] : [60, 60];
      };
      const outline = buildingOutline(scene.rooms);
      const taken = scene.objects.filter((o) => inRoom(room, o.x, o.y) && CATALOG[o.t] && CATALOG[o.t].layer !== 'rug').map((o) => {
        const [w, h2] = box(o.t);
        return { x: o.x, y: o.y, hw: w / 2 + 4, hh: h2 / 2 + 4, rot: o.rot || 0 };
      });
      const made = furnish(room, theme === 'custom' ? room.themeDef : theme, room.themeSeed, {
        size: box,
        known: (t) => !!CATALOG[t] && !CATALOG[t].size,
        openings: scene.openings,
        walls: scene.walls.map((w) => [w.x1, w.y1, w.x2, w.y2, w.kind === 'rampart' ? 15 : w.kind === 'stone' ? 7 : w.kind === 'palisade' ? 8 : 4]),
        isWall: (x, y) => (nearestWall(outline, scene.walls, x, y)?.d ?? 99) < 6,
        taken,
      });
      for (const o of made) scene.objects.push({ id: uid(), s: 1, ...o, theme: room.id });
      if (quiet) return made.length;
      if (!made.length) toast(tr('Der Raum ist zu klein oder zu voll für diese Einrichtung.'));
      commit();
      return made.length;
    }

    // --- Sprachmodell: Räume einrichten, ganze Karten entwerfen ---------------------------------------------------------
    let aiBusy = false;
    /** Führt eine Anfrage an das Sprachmodell aus; währenddessen steht in der Statuszeile, was geschieht. */
    async function withAi(label, run) {
      if (aiBusy) return toast(tr('Die KI arbeitet noch.'));
      aiBusy = true;
      status.textContent = label;
      const note = h('div.mb-ai-busy', icon('sparkles'), ` ${label}`);
      stage.append(note);
      try {
        await run(await import('./mb-ai.js'));
      } catch (err) {
        toast(err.message || String(err), 6000);
      } finally {
        aiBusy = false;
        note.remove();
        if (status.textContent === label) status.textContent = '';
      }
    }
    /** Einen Raum nach einer Beschreibung von der KI einrichten lassen. */
    async function aiFurnish(room) {
      const wish = await prompt2(tr('Was ist das für ein Raum? (z. B. „Alchemistenlabor nach einer Explosion“)'), room.themeName || '');
      if (!wish) return;
      await withAi(tr('Die KI richtet den Raum ein …'), async ({ aiFurniture }) => {
        const size = room.k === 'circle' ? [Math.round((2 * room.r) / CELL), Math.round((2 * room.r) / CELL)] : [Math.round(room.w / CELL), Math.round(room.h / CELL)];
        const def = themeFromPlan(await aiFurniture(wish, size), (t) => !!CATALOG[t] && !CATALOG[t].size);
        if (!def) throw new Error(tr('Die KI hat nichts Passendes aus dem Katalog gewählt – bitte noch einmal versuchen.'));
        // der Raum kann inzwischen gelöscht oder das Stockwerk gewechselt sein
        if (!scene.rooms.includes(room)) return;
        room.themeDef = def;
        room.themeName = wish.slice(0, 80);
        furnishRoom(room, 'custom');
        renderSide();
      });
    }
    /** Bauplan der KI als Szene übernehmen: Räume und Gelände anlegen, Füllbereiche füllen, Räume einrichten. */
    function applyPlan(plan) {
      const made = planToScene(plan, { known: (t) => !!CATALOG[t], sized: (t) => !!CATALOG[t]?.size, floors: FLOORS, themes: Object.keys(THEMES), uid, seed: Math.floor(Math.random() * 1e9), natureScale: plan.scale === 'overview' ? SCALES.overview : 1 });
      root = made.scene;
      floor = 0;
      link();
      sel = null;
      multi = [];
      chain = null;
      syncTop();
      for (const f of root.fills) refill(f, true);
      for (const t of made.rooms) {
        const room = root.rooms.find((r) => r.id === t.id);
        if (!room) continue;
        if (t.def) (room.themeDef = t.def), (room.themeName = t.name || tr('KI-Entwurf'));
        furnishRoom(room, t.def ? 'custom' : t.theme, true, true);
      }
      commit();
      fit();
      renderSide();
      return made;
    }
    /** Ganze Karte von der KI entwerfen lassen (ersetzt den Inhalt; mit Strg+Z rückgängig). */
    async function aiMap(wish) {
      wish ||= await askWish();
      if (!wish) return;
      await withAi(tr('Die KI entwirft die Karte …'), async ({ aiPlan }) => {
        const plan = await aiPlan(wish);
        const made = applyPlan(plan);
        if (!made.scene.rooms.length && !made.scene.cave.length && !made.scene.objects.length && !made.scene.fills.length) toast(tr('Der Entwurf der KI war leer – bitte noch einmal versuchen oder genauer beschreiben.'), 6000);
        else if (plan.name && /^(Neue Karte|New map)$/i.test(S().maps[mapId]?.name || '')) sync.set(['maps', mapId, 'name'], String(plan.name).slice(0, 60));
      });
    }
    /** Auswahl setzen: kein, ein oder mehrere Elemente. */
    function setSelection(group) {
      multi = group.length > 1 ? group : [];
      sel = group.length === 1 ? group[0] : null;
      renderSide();
      draw();
    }
    /** Alles, was mit einer Auswahl wandert – jedes Stück nur einmal, auch wenn ein Raum samt Einrichtung gewählt ist. */
    function movers(group) {
      const mv = { pts: new Set(), rooms: new Set(), walls: new Set(), shapes: new Set() };
      for (const g of group) {
        const it = find(g);
        if (!it) continue;
        // In einer Gruppe wandert eine Tür oder ein Fenster nur mit der Wand, an der sie sitzt – allein mitgezogen
        // läge sie danach mitten im Raum
        if (g.type === 'opening' && group.length > 1) continue;
        if (g.type === 'room') mv.rooms.add(it);
        else if (g.type === 'wall') mv.walls.add(it);
        else if (g.type === 'fill') mv.shapes.add(it.shape);
        else mv.pts.add(it);
        const att = attached(it, g.type);
        att.points.forEach((q) => mv.pts.add(q));
        att.walls.forEach((q) => mv.walls.add(q));
      }
      return mv;
    }
    function shiftMovers(mv, dx, dy) {
      if (!dx && !dy) return;
      for (const o of mv.pts) Object.assign(o, { x: o.x + dx, y: o.y + dy });
      for (const r of mv.rooms) {
        if (r.k === 'circle') Object.assign(r, { cx: r.cx + dx, cy: r.cy + dy });
        else Object.assign(r, { x: r.x + dx, y: r.y + dy });
      }
      for (const w of mv.walls) Object.assign(w, { x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy });
      for (const sh of mv.shapes) {
        if (sh.k === 'rect') Object.assign(sh, { x: sh.x + dx, y: sh.y + dy });
        else Object.assign(sh, { cx: sh.cx + dx, cy: sh.cy + dy });
      }
    }
    /** Auswahl samt Anhang als eigenständige Daten (für Verdoppeln und die Zwischenablage). */
    function snapshot(group) {
      const out = { objects: [], rooms: [], walls: [], openings: [], fills: [], labels: [] };
      const seen = new Set();
      const add = (key, it) => {
        if (seen.has(it)) return;
        seen.add(it);
        out[key].push(JSON.parse(JSON.stringify(it)));
      };
      for (const g of group) {
        const it = find(g);
        if (!it) continue;
        if (g.type === 'opening' && group.length > 1) continue; // kommt nur mit ihrer Wand mit
        add({ object: 'objects', room: 'rooms', wall: 'walls', opening: 'openings', fill: 'fills', label: 'labels' }[g.type], it);
        const att = attached(it, g.type);
        for (const q of att.points) add(scene.objects.includes(q) ? 'objects' : 'openings', q);
        for (const q of att.walls) add('walls', q);
      }
      return out;
    }
    /** Daten aus snapshot() um (dx, dy) versetzt in die Szene einfügen; liefert die neue Auswahl. */
    function insert(data, dx, dy) {
      const group = [];
      const fills = new Map();
      // Füllbereiche gibt es nur im Erdgeschoss; ihr Inhalt kommt oben als einzelne Stücke an
      for (const f of floor ? [] : data.fills || []) {
        const id = uid();
        fills.set(f.id, id);
        const sh = f.shape;
        if (sh.k === 'rect') Object.assign(sh, { x: sh.x + dx, y: sh.y + dy });
        else Object.assign(sh, { cx: sh.cx + dx, cy: sh.cy + dy });
        scene.fills.push({ ...f, id });
        group.push({ type: 'fill', id });
      }
      const rooms = new Map(); // alte → neue Kennung: die mitkopierte Einrichtung gehört zum neuen Raum
      for (const r of data.rooms || []) {
        const id = uid();
        rooms.set(r.id, id);
        scene.rooms.push(r.k === 'circle' ? { ...r, id, cx: r.cx + dx, cy: r.cy + dy } : { ...r, id, x: r.x + dx, y: r.y + dy });
        group.push({ type: 'room', id });
      }
      for (const w of data.walls || []) {
        const id = uid();
        scene.walls.push({ ...w, id, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy });
        group.push({ type: 'wall', id });
      }
      for (const o of data.openings || []) {
        const id = uid();
        scene.openings.push({ ...o, id, x: o.x + dx, y: o.y + dy });
        group.push({ type: 'opening', id });
      }
      for (const o of data.objects || []) {
        if (!CATALOG[o.t]) continue;
        const id = uid();
        const copy = { ...o, id, x: o.x + dx, y: o.y + dy };
        if (fills.has(o.fill)) copy.fill = fills.get(o.fill);
        else delete copy.fill;
        if (rooms.has(o.theme)) copy.theme = rooms.get(o.theme);
        else delete copy.theme;
        scene.objects.push(copy);
        if (!copy.fill) group.push({ type: 'object', id });
      }
      for (const l of data.labels || []) {
        const id = uid();
        scene.labels.push({ ...l, id, x: l.x + dx, y: l.y + dy });
        group.push({ type: 'label', id });
      }
      return group;
    }
    const CLIP = 'mb:clip';
    /** Auswahl in die Zwischenablage (je Gerät gemerkt – so lässt sich auch in eine andere Karte einfügen). */
    function copySelection() {
      const group = multi.length ? multi : sel ? [sel] : [];
      if (!group.length) return;
      const data = snapshot(group);
      // Bezugspunkt: Mitte aller Stücke
      const pts = [...data.objects, ...data.openings, ...data.labels].map((o) => [o.x, o.y]).concat(data.rooms.map((r) => (r.k === 'circle' ? [r.cx, r.cy] : [r.x + r.w / 2, r.y + r.h / 2])), data.walls.map((w) => [(w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2]), data.fills.map((f) => { const b = shapeBox(f.shape); return [b[0] + b[2] / 2, b[1] + b[3] / 2]; }));
      if (!pts.length) return;
      data.at = [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length];
      try {
        localStorage.setItem(CLIP, JSON.stringify(data));
        toast(tr('{n} Elemente kopiert – mit Strg+V einfügen, auch in einer anderen Karte', { n: group.length }), 2500);
      } catch {
        toast(tr('Die Auswahl ist zu groß für die Zwischenablage.'));
      }
    }
    function paste() {
      let data = null;
      try {
        data = JSON.parse(localStorage.getItem(CLIP) || 'null');
      } catch {
        /* nichts Brauchbares */
      }
      if (!data?.at) return toast(tr('Die Zwischenablage ist leer – erst etwas auswählen und mit Strg+C kopieren.'));
      const { W, H } = sceneSize(scene);
      // Ziel: der Mauszeiger, aber immer in der Karte
      const [tx, ty] = (hover || [W / 2, H / 2]).map((v, i) => Math.max(40, Math.min((i ? H : W) - 40, v)));
      const grid = (data.rooms?.length || 0) + (data.walls?.length || 0) > 0;
      let dx = tx - data.at[0];
      let dy = ty - data.at[1];
      // Die ganze Gruppe soll in der Karte landen, nicht nur ihr Mittelpunkt
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      const grow = (x, y) => ((box[0] = Math.min(box[0], x)), (box[1] = Math.min(box[1], y)), (box[2] = Math.max(box[2], x)), (box[3] = Math.max(box[3], y)));
      for (const o of [...(data.objects || []), ...(data.openings || []), ...(data.labels || [])]) grow(o.x, o.y);
      for (const r of data.rooms || []) r.k === 'circle' ? (grow(r.cx - r.r, r.cy - r.r), grow(r.cx + r.r, r.cy + r.r)) : (grow(r.x, r.y), grow(r.x + r.w, r.y + r.h));
      for (const w of data.walls || []) (grow(w.x1, w.y1), grow(w.x2, w.y2));
      for (const f of data.fills || []) {
        const b = shapeBox(f.shape);
        grow(b[0], b[1]);
        grow(b[0] + b[2], b[1] + b[3]);
      }
      if (box[2] >= box[0]) {
        // passt die Gruppe nicht ganz hinein, kommt sie mittig
        dx = box[2] - box[0] > W ? W / 2 - (box[0] + box[2]) / 2 : Math.max(-box[0], Math.min(W - box[2], dx));
        dy = box[3] - box[1] > H ? H / 2 - (box[1] + box[3]) / 2 : Math.max(-box[1], Math.min(H - box[3], dy));
      }
      dx = grid ? snap(dx) : Math.round(dx);
      dy = grid ? snap(dy) : Math.round(dy);
      if (tool !== 'select') setTool('select');
      const group = insert(data, dx, dy);
      commit();
      setSelection(group);
    }
    function remove() {
      if (multi.length) {
        for (const g of multi) {
          const it = find(g);
          if (!it) continue;
          const list = listOf(g.type);
          list.splice(list.indexOf(it), 1);
          if (g.type === 'fill') scene.objects = scene.objects.filter((o) => o.fill !== it.id);
          if (g.type === 'room') scene.objects = scene.objects.filter((o) => o.theme !== it.id);
        }
        multi = [];
        commit();
        return renderSide();
      }
      const it = find(sel);
      if (!it) return;
      const list = listOf(sel.type);
      list.splice(list.indexOf(it), 1);
      if (sel.type === 'fill') scene.objects = scene.objects.filter((o) => o.fill !== it.id);
      if (sel.type === 'room') scene.objects = scene.objects.filter((o) => o.theme !== it.id);
      sel = null;
      commit();
      renderSide();
    }
    function rotate(deg) {
      if (tool === 'object') {
        opt.rot = (opt.rot + deg + 360) % 360;
        return draw();
      }
      const it = find(sel);
      if (!it || (sel.type !== 'object' && sel.type !== 'label')) return;
      it.rot = ((it.rot || 0) + deg + 360) % 360;
      commit();
    }
    /** Gegenstand spiegeln (nicht bei Dächern und Türmen – deren Licht- und Schattenseite stünde sonst falsch). */
    function flip() {
      const it = find(sel);
      if (!it || sel.type !== 'object' || CATALOG[it.t].lit) return;
      it.flip = it.flip ? undefined : true;
      commit();
    }
    /** Gegenstand über (1) oder unter (-1) alle anderen legen. */
    function reorder(dir) {
      const it = find(sel);
      if (!it || sel.type !== 'object') return;
      scene.objects.splice(scene.objects.indexOf(it), 1);
      if (dir > 0) scene.objects.push(it);
      else scene.objects.unshift(it);
      commit();
    }
    /** Auswahl mit den Pfeiltasten schieben: Gegenstände ein halbes Feld (fein: 5 px), Räume und Wände ein ganzes (fein: ein halbes). */
    function nudge(ux, uy, fine) {
      if (multi.length) {
        const mv = movers(multi);
        const step = mv.rooms.size || mv.walls.size ? (fine ? HALF : CELL) : fine ? 5 : HALF;
        shiftMovers(mv, ux * step, uy * step);
        commit();
        return true;
      }
      const it = find(sel);
      if (!it || sel.type === 'opening') return false;
      const step = sel.type === 'object' || sel.type === 'fill' || sel.type === 'label' ? (fine ? 5 : HALF) : fine ? HALF : CELL;
      moveBy(it, sel.type, ux * step, uy * step);
      commit();
      return true;
    }
    /** Verschiebt ein Element; Räume nehmen Türen, Fenster, Innenwände und Einrichtung mit, Füllbereiche ihren Inhalt. */
    function moveBy(it, type, dx, dy, att = attached(it, type)) {
      if (type === 'object' || type === 'label') Object.assign(it, { x: it.x + dx, y: it.y + dy });
      else if (type === 'room') {
        if (it.k === 'circle') Object.assign(it, { cx: it.cx + dx, cy: it.cy + dy });
        else Object.assign(it, { x: it.x + dx, y: it.y + dy });
      } else if (type === 'wall') Object.assign(it, { x1: it.x1 + dx, y1: it.y1 + dy, x2: it.x2 + dx, y2: it.y2 + dy });
      else if (type === 'fill') {
        const sh = it.shape;
        if (sh.k === 'rect') Object.assign(sh, { x: sh.x + dx, y: sh.y + dy });
        else Object.assign(sh, { cx: sh.cx + dx, cy: sh.cy + dy });
      }
      for (const o of att.points) Object.assign(o, { x: o.x + dx, y: o.y + dy });
      for (const w of att.walls) Object.assign(w, { x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy });
    }
    /** Was an einem Element hängt und mitwandert. */
    function attached(it, type) {
      if (type === 'fill') return { points: scene.objects.filter((o) => o.fill === it.id), walls: [] };
      if (type === 'wall') return { points: scene.openings.filter((o) => (nearestWall({ segs: [it], arcs: [] }, [], o.x, o.y)?.d ?? 99) < 8), walls: [] };
      if (type !== 'room') return { points: [], walls: [] };
      return {
        points: [...scene.objects.filter((o) => !o.fill && inRoom(it, o.x, o.y)), ...scene.openings.filter((o) => inRoom(it, o.x, o.y, -10))],
        walls: scene.walls.filter((w) => inRoom(it, w.x1, w.y1, -4) && inRoom(it, w.x2, w.y2, -4)),
      };
    }
    function duplicate() {
      if (multi.length || (sel && sel.type !== 'object')) {
        // Gruppe oder Raum/Wand/Füllbereich: samt Anhang ein Feld versetzt noch einmal
        const group = insert(snapshot(multi.length ? multi : [sel]), CELL, CELL);
        commit();
        return setSelection(group);
      }
      const it = find(sel);
      if (!it || sel.type !== 'object') return;
      const copy = { ...it, id: uid(), x: it.x + 30, y: it.y + 30 };
      delete copy.fill;
      scene.objects.push(copy);
      sel = { type: 'object', id: copy.id };
      commit();
    }

    // --- Seitenleiste: Einstellungen des Werkzeugs bzw. der Auswahl ---------------------------------------------------
    function setTool(t) {
      if ((floor > 0 && t === 'terrain') || (floor !== 0 && t === 'fill')) return toast(tr('Gelände und Füllbereiche gehören zum Erdgeschoss.'));
      tool = t;
      chain = null;
      if (t !== 'select') (sel = null), (multi = []);
      for (const b of toolbar.children) b.classList.toggle('active', b.dataset.tool === t);
      canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
      renderSide();
      draw();
    }
    const choice = (items, get, set) => h('div.mb-choice', items.map(([v, label]) => h('button.small', { class: get() === v ? 'active' : '', onclick: () => (set(v), renderSide(), draw()) }, label)));
    const floorPicker = (get, set) => h('div.mb-palette', FLOORS.map((f) => {
      const b = h('button', { class: get() === f ? 'active' : '', title: FLOOR_LABEL[f], onclick: () => (set(f), renderSide()) }, floorSwatch(f, biomeOf(scene)), h('span', FLOOR_LABEL[f]));
      return b;
    }));
    function renderSide() {
      if (!scene) return;
      const it = find(sel);
      const B = biomeOf(scene);
      const out = [];
      const title = (t) => h('div.section-title', t);
      const hint = (t) => h('p.small.muted', t);
      if (tool === 'select' && multi.length) {
        out.push(
          title(tr('{n} Elemente ausgewählt', { n: multi.length })),
          h('div.row', { style: { flexWrap: 'wrap', gap: '6px' } }, h('button.small', { title: tr('Verdoppeln (Strg+D)'), onclick: duplicate }, icon('copy'), tr(' Verdoppeln')), h('button.small', { title: tr('In die Zwischenablage (Strg+C)'), onclick: copySelection }, icon('clipboard'), tr(' Kopieren')), h('button.small.danger', { title: tr('Löschen (Entf)'), onclick: remove }, icon('trash'), tr(' Löschen'))),
          hint(tr('Ziehen verschiebt alles gemeinsam, die Pfeiltasten schieben. Räume nehmen ihre Türen und Einrichtung mit. Umschalt-Klick nimmt ein Stück dazu oder heraus.')),
          h('button.small', { onclick: () => setSelection([]) }, tr('Auswahl aufheben')),
        );
      } else if (tool === 'select') {
        if (!it) {
          const many = h('input', { type: 'checkbox', checked: !!opt.multiSel });
          many.addEventListener('change', () => (opt.multiSel = many.checked));
          out.push(
            h('div.row', { style: { flexWrap: 'wrap', gap: '6px', marginBottom: '6px' } }, h('label.inline.small', { title: tr('Jeder Klick nimmt ein Stück zur Auswahl dazu – für Geräte ohne Umschalt-Taste') }, many, tr('Mehrfach')), h('button.small', { title: tr('Aus der Zwischenablage einfügen (Strg+V)'), onclick: paste }, icon('clipboard'), tr(' Einfügen'))),
          );
          out.push(
            h('div.row', { style: { flexWrap: 'wrap', gap: '6px', marginBottom: '10px' } },
              h('button.small', { title: tr('Die Szene als Datei sichern – zum Aufbewahren oder für eine andere Kampagne'), onclick: () => downloadScene(root, S().maps[mapId]?.name) }, icon('download'), tr(' Szene sichern')),
              h('button.small', {
                title: tr('Eine gesicherte Szene laden – sie ersetzt den Inhalt dieser Karte (mit Strg+Z rückgängig)'),
                onclick: async () => {
                  try {
                    const loaded = await uploadScene();
                    if (!loaded) return;
                    root = loaded;
                    floor = 0;
                    link();
                    sel = null;
                    syncTop();
                    commit();
                    fit();
                    renderSide();
                  } catch (err) {
                    toast(err.message, 4000);
                  }
                },
              }, icon('upload'), tr(' Szene laden')),
              ai.text && !floor ? h('button.small', { title: tr('Beschreibe, was die Karte zeigen soll – das Sprachmodell entwirft Räume, Einrichtung und Gelände. Der Entwurf ersetzt den Inhalt dieser Karte (mit Strg+Z rückgängig).'), onclick: () => aiMap() }, icon('sparkles'), tr(' Karte mit KI entwerfen …')) : null,
            ),
          );
        }
        if (!it) out.push(title(tr('Auswählen')), hint(tr('Anklicken wählt aus, Ziehen verschiebt – Räume nehmen Türen und Einrichtung mit. Ein Rahmen auf freier Fläche oder Umschalt-Klick wählt mehrere Stücke; Strg+C und Strg+V kopieren sie, auch in eine andere Karte. Pfeiltasten schieben (mit Umschalt fein), R dreht, F spiegelt, Entf löscht, Strg+D verdoppelt. Alt+Klick nimmt einen Gegenstand als Vorlage. Mausrad zoomt, rechte Maustaste oder Leertaste verschiebt die Ansicht.')));
        else if (sel.type === 'object') {
          const scale = h('input', { type: 'range', min: 0.5, max: 2, step: 0.05, value: it.s || 1 });
          scale.addEventListener('input', () => ((it.s = Number(scale.value)), slow ? draw() : recompose()));
          scale.addEventListener('change', () => commit());
          out.push(
            title(CATALOG[it.t].label),
            h('div.row', h('button.small', { title: tr('Nach links drehen'), onclick: () => rotate(-15) }, icon('rotateLeft')), h('button.small', { title: tr('Nach rechts drehen (R)'), onclick: () => rotate(15) }, icon('rotateRight')), h('button.small', { title: tr('Andere Variante'), onclick: () => ((it.v = Math.floor(Math.random() * 1e6)), commit()) }, icon('d20')), h('button.small', { title: tr('Verdoppeln (Strg+D)'), onclick: duplicate }, icon('copy')), h('button.small.danger', { title: tr('Löschen (Entf)'), onclick: remove }, icon('trash'))),
            h('div.row', CATALOG[it.t].lit ? null : h('button.small', { title: tr('Spiegeln (F)'), onclick: flip }, tr('Spiegeln')), h('button.small', { title: tr('Über alle anderen legen (Bild auf)'), onclick: () => reorder(1) }, tr('Nach vorn')), h('button.small', { title: tr('Unter alle anderen legen (Bild ab)'), onclick: () => reorder(-1) }, tr('Nach hinten'))),
            h('label.small.muted', tr('Größe')),
            scale,
          );
        } else if (sel.type === 'room') {
          const open = h('input', { type: 'checkbox', checked: !!it.open });
          open.addEventListener('change', () => ((it.open = open.checked || undefined), commit()));
          const ruin = h('input', { type: 'checkbox', checked: !!it.ruin });
          ruin.addEventListener('change', () => ((it.ruin = ruin.checked || undefined), commit()));
          const timber = h('input', { type: 'checkbox', checked: !!it.timber });
          timber.addEventListener('change', () => ((it.timber = timber.checked || undefined), commit()));
          const theme = h('select', { title: tr('Stellt passende Möbel an Wände, in Ecken und in die Mitte – Türen bleiben frei') }, h('option', { value: '' }, tr('– leer lassen –')), Object.keys(THEMES).map((k) => h('option', { value: k }, THEME_LABEL[k])));
          if (it.theme === 'custom') theme.append(h('option', { value: 'custom' }, `✦ ${it.themeName || tr('KI-Entwurf')}`));
          theme.value = it.theme || '';
          theme.addEventListener('change', () => (furnishRoom(it, theme.value), renderSide()));
          out.push(title(tr('Raum')), hint(tr('Ziehen verschiebt, die Griffe ändern die Größe.')), floorPicker(() => it.floor, (f) => ((it.floor = f), commit())),
            h('label.small.muted', tr('Einrichten als')),
            theme,
            ai.text ? h('button.small', { title: tr('Beschreibe den Raum in eigenen Worten – das Sprachmodell wählt passende Möbel aus dem Katalog, gestellt werden sie nach den üblichen Regeln'), onclick: () => aiFurnish(it) }, icon('sparkles'), tr(' Mit KI einrichten …')) : null,
            it.theme ? h('div.row', h('button.small', { onclick: () => furnishRoom(it, it.theme) }, icon('d20'), tr(' Neu würfeln')), h('button.small', { title: tr('Die Möbel behalten und einzeln weiterbearbeiten'), onclick: () => ((scene.objects.forEach((o) => o.theme === it.id && delete o.theme)), delete it.theme, commit(), renderSide()) }, tr('Auflösen'))) : null, h('label.inline', open, tr('Offen (ohne Wände, z. B. Veranda oder Steg)')), h('label.inline', ruin, tr('Ruine (verfallene Mauern, überwucherter Boden)')), h('label.inline', timber, tr('Holzwände (Blockhaus, Scheune, Hütte)')), h('button.small.danger', { onclick: remove }, icon('trash'), tr(' Raum löschen')));
        } else if (sel.type === 'wall') {
          out.push(title(tr('Wand')), choice([['wood', tr('Holz')], ['stone', tr('Stein')], ['rampart', tr('Burgmauer')], ['palisade', tr('Palisade')]], () => it.kind || 'wood', (v) => ((it.kind = v), commit())),
            // der Graben ist Gelände: nur im Erdgeschoss
            !floor && (it.kind === 'rampart' || it.kind === 'palisade')
              ? h('button.small', {
                  title: tr('Malt einen Wassergraben rund um den geschlossenen Mauerring – wie mit dem Wasserpinsel, also danach frei änderbar'),
                  onclick: () => {
                    const ring = ringAround(scene.walls.filter((w) => w.kind === it.kind), it, 124);
                    if (!ring) return toast(tr('Ein Graben braucht einen geschlossenen Mauerring.'));
                    scene.water.push({ k: 'brush', r: 44, pts: ring });
                    commit();
                  },
                }, icon('plus'), tr(' Graben um den Ring'))
              : null, h('button.small.danger', { onclick: remove }, icon('trash'), tr(' Wand löschen')));
        } else if (sel.type === 'opening') {
          const locked = h('input', { type: 'checkbox', checked: !!it.locked });
          locked.addEventListener('change', () => ((it.locked = locked.checked || undefined), commit()));
          out.push(title(it.k === 'door' ? tr('Tür') : it.k === 'secret' ? tr('Geheimtür') : it.k === 'gate' ? tr('Tor') : tr('Fenster')), hint(tr('Ziehen verschiebt entlang der Wände.')), it.k === 'window' ? null : h('label.inline', { title: tr('Gilt, wenn die Karte zum ersten Mal übernommen wird – im Spiel lässt sich jede Tür auf- und zuschließen') }, locked, tr('Zu Beginn verschlossen')), h('button.small.danger', { onclick: remove }, icon('trash'), tr(' Löschen')));
        } else if (sel.type === 'label') {
          const text = h('input', { type: 'text', value: it.text });
          text.addEventListener('input', () => ((it.text = text.value), draw()));
          text.addEventListener('change', () => (it.text.trim() ? commit() : remove()));
          out.push(
            title(tr('Name')),
            text,
            choice([['place', tr('Ort')], ['area', tr('Viertel')]], () => it.kind || 'place', (v) => ((it.kind = v), (opt.labelKind = v), commit())),
            choice([['s', tr('Klein')], ['m', tr('Mittel')], ['l', tr('Groß')], ['xl', tr('Sehr groß')]], () => it.size || 'm', (v) => ((it.size = v), (opt.labelSize = v), commit())),
            hint(tr('Ziehen verschiebt, R dreht. Namen stehen nicht im Kartenbild: Im Spiel lässt sich jeder einzeln für die Spieler zeigen oder verbergen.')),
            h('button.small.danger', { onclick: remove }, icon('trash'), tr(' Löschen')),
          );
        } else if (sel.type === 'fill') {
          const dens = h('input', { type: 'range', min: 0.3, max: 2, step: 0.1, value: it.density });
          dens.addEventListener('change', () => ((it.density = Number(dens.value)), refill(it), commit()));
          out.push(
            title(tr('Füllbereich')),
            choice(Object.entries(FILL_LABEL), () => it.kind, (v) => ((it.kind = v), refill(it), commit())),
            h('label.small.muted', tr('Dichte')),
            dens,
            ...(it.kind === 'houses'
              ? (() => {
                  // Häuserviertel: Ausrichtung der Zeilen und Größe der Häuser
                  const angle = h('input', { type: 'range', min: 0, max: 175, step: 5, value: it.angle || 0 });
                  angle.addEventListener('change', () => ((it.angle = Number(angle.value)), refill(it), commit()));
                  const size = h('input', { type: 'range', min: 0.7, max: 1.8, step: 0.05, value: it.size ?? 1 });
                  size.addEventListener('change', () => ((it.size = Number(size.value)), refill(it), commit()));
                  return [h('label.small.muted', { title: tr('Wirkt abseits der Straßen – an Straßen und Wegen richten sich die Häuser nach diesen') }, tr('Ausrichtung')), angle, h('label.small.muted', tr('Hausgröße')), size];
                })()
              : []),
            h('div.row', h('button.small', { onclick: () => ((it.seed = Math.floor(Math.random() * 1e9)), refill(it), commit()) }, icon('d20'), tr(' Neu würfeln')), h('button.small', { title: tr('Bereich entfernen, Inhalt behalten'), onclick: () => ((scene.objects.forEach((o) => o.fill === it.id && delete o.fill)), scene.fills.splice(scene.fills.indexOf(it), 1), (sel = null), commit(), renderSide()) }, tr('Auflösen')), h('button.small.danger', { title: tr('Bereich samt Inhalt löschen'), onclick: remove }, icon('trash'))),
            hint(tr('Einzelne Bäume, Büsche und Felsen lassen sich danach anklicken und verschieben.')),
          );
        }
      } else if (tool === 'terrain') {
        const size = h('input', { type: 'range', min: 8, max: 200, step: 2, value: opt.r });
        size.addEventListener('input', () => (opt.r = Number(size.value)));
        const def = TERRAIN[opt.terrain];
        out.push(
          title(tr('Gelände malen')),
          choice(Object.entries(TERRAIN).filter(([k]) => floor >= 0 || k === 'cave').map(([k, t]) => [k, t.label]), () => opt.terrain, (v) => ((opt.terrain = v), (opt.r = TERRAIN[v].r))),
          opt.terrain === 'high' ? h('div', h('label.small.muted', tr('Höhenstufe')), choice([[1, '1'], [2, '2'], [3, '3']], () => opt.lvl, (v) => (opt.lvl = v))) : null,
          h('label.small.muted', tr('Pinselgröße')),
          size,
          choice([[false, tr('Malen')], [true, tr('Radieren')]], () => opt.erase, (v) => (opt.erase = v)),
          hint(opt.terrain === 'cave' ? tr('Höhlenboden: In den Umgebungen „Dungeon“ und „Höhle“ ist die Karte massiver Fels – hiermit malst du Gänge und Kavernen hinein. Die Felswand hält Licht auf. Anderswo entsteht eine Senke.') : opt.terrain === 'high' ? tr('Erhöhungen werden zu Felsplateaus mit Kante und Schatten. Stufe 2 und 3 legen Terrassen darauf.') : opt.terrain === 'road' ? tr('Straßen und Plätze sind gepflastert, mit sauberem Rand – für Städte und Burghöfe. Mit großem Pinsel entsteht ein Platz. Häuser aus dem Füllbereich halten Abstand.') : opt.terrain === 'path' ? tr('Wege sind schmale Trampelpfade mit ausgefranstem Rand; „Erde“ ergibt weiche, festgetretene Flächen.') : tr('Mit gedrückter Maustaste malen. Alt radiert.')),
          scene[def.key].length ? h('button.small', { onclick: () => confirm(tr('Alles von „{label}“ entfernen?', { label: def.label })) && ((scene[def.key] = []), commit(), renderSide()) }, icon('trash'), tr(' {label} leeren', { label: def.label })) : null,
        );
      } else if (tool === 'room') {
        const open = h('input', { type: 'checkbox', checked: opt.open });
        open.addEventListener('change', () => (opt.open = open.checked));
        const ruin = h('input', { type: 'checkbox', checked: opt.ruin });
        ruin.addEventListener('change', () => (opt.ruin = ruin.checked));
        const timber = h('input', { type: 'checkbox', checked: opt.timber });
        timber.addEventListener('change', () => (opt.timber = timber.checked));
        out.push(title(tr('Raum aufziehen')), choice([['rect', tr('Rechteck')], ['circle', tr('Kreis')]], () => opt.room, (v) => (opt.room = v)), floorPicker(() => opt.floor, (f) => (opt.floor = f)), h('label.inline', open, tr('Offen (ohne Wände)')), h('label.inline', ruin, tr('Ruine (verfallene Mauern, überwucherter Boden)')), h('label.inline', timber, tr('Holzwände (Blockhaus, Scheune, Hütte)')), hint(tr('Räume rasten auf halbe Felder ein. Überlappende und angrenzende Räume verschmelzen zu einem Gebäude; die Außenwand läuft um den gemeinsamen Umriss.')));
      } else if (tool === 'floor') {
        out.push(title(tr('Boden festlegen')), floorPicker(() => opt.floor, (f) => (opt.floor = f)), hint(tr('Boden wählen und einen Raum anklicken.')));
      } else if (tool === 'wall') {
        out.push(title(tr('Wand ziehen')), choice([['wood', tr('Holz')], ['stone', tr('Stein')], ['rampart', tr('Burgmauer')], ['palisade', tr('Palisade')]], () => opt.wall, (v) => (opt.wall = v)), chain ? h('button.small', { onclick: () => ((chain = null), renderSide(), draw()) }, icon('check'), tr(' Mauerzug beenden')) : null, hint(tr('Ziehen zieht eine einzelne Wand. Für einen langen Mauerzug Punkt für Punkt klicken: jeder Klick setzt die nächste Ecke, ein Klick auf den Anfang schließt den Ring, Doppelklick, Enter oder Esc beendet. Außenwände entstehen von selbst um jeden Raum. Burgmauern haben Zinnen und an jeder Ecke einen Turm, Palisaden sind Reihen aus Stämmen; ein Tor entsteht mit „Tür“ auf der Mauer.')));
      } else if (tool === 'opening') {
        out.push(title(tr('Tür oder Fenster setzen')), choice([['door', tr('Tür')], ['window', tr('Fenster')], ['secret', tr('Geheimtür')], ['gate', tr('Tor')]], () => opt.opening, (v) => (opt.opening = v)), hint(tr('Auf eine Wand klicken. Türen öffnen die Wand, Fenster sitzen darauf. Eine Geheimtür sieht aus wie Wand, bis die Spielleitung sie im Spiel öffnet. Ein Tor ist zwei Felder breit und hat zwei Flügel – in der Burgmauer mit zwei Tortürmen.')));
      } else if (tool === 'object') {
        const list = h('div.mb-cats');
        const search = h('input', { type: 'search', placeholder: tr('Katalog durchsuchen …'), value: opt.search });
        // Nur die Liste neu aufbauen – das Suchfeld behält so beim Tippen den Fokus
        const renderList = () => {
          const q = opt.search.trim().toLowerCase();
          const groups = [];
          const button = ([t, d]) => h('button', { class: opt.obj === t ? 'active' : '', title: d.label, onclick: () => ((opt.obj = t), renderList(), renderVariants(), draw()) }, h('img', { src: previewUrl(t, B), alt: '', loading: 'lazy' }), h('span', d.label));
          if (!q && recent.length) groups.push(h('div.small.muted', tr('Zuletzt benutzt')), h('div.mb-palette', recent.map((t) => button([t, CATALOG[t]]))));
          // Auf Übersichtskarten stehen die Gebäude vorn
          const cats = Object.entries(CATEGORIES).sort(([a], [b]) => (scene.scale ? (b === 'building') - (a === 'building') : 0));
          for (const [cat, label] of cats) {
            const items = Object.entries(CATALOG).filter(([, d]) => d.cat === cat && (!q || d.label.toLowerCase().includes(q) || label.toLowerCase().includes(q)));
            if (!items.length) continue;
            groups.push(h('div.small.muted', `${label} (${items.length})`), h('div.mb-palette', items.map(button)));
          }
          fill(list, groups.length ? groups : h('p.small.muted', tr('Nichts gefunden.')));
        };
        search.addEventListener('input', () => ((opt.search = search.value), renderList()));
        // Setz-Optionen: Ausführung wechseln oder festhalten, zufällig drehen und spiegeln
        const vary = h('input', { type: 'checkbox', checked: opt.vary });
        vary.addEventListener('change', () => ((opt.vary = vary.checked), savePlace(), renderVariants()));
        const flipR = h('input', { type: 'checkbox', checked: opt.flipRand });
        flipR.addEventListener('change', () => ((opt.flipRand = flipR.checked), savePlace(), nextGhost(), draw()));
        const variants = h('div');
        const renderVariants = () => {
          const def = CATALOG[opt.obj];
          const vs = variantsOf(opt.obj, B);
          const same = (v) => !opt.vary && (def.size ? v % 18 === ghostV % 18 : v === ghostV);
          fill(variants, vs.length ? [h('div.small.muted', tr('Ausführung')), h('div.mb-palette.mb-var', vs.map((q) => h('button', { class: same(q.v) ? 'active' : '', title: tr('Immer diese Ausführung setzen'), onclick: () => ((ghostV = q.v), (opt.vary = false), (vary.checked = false), savePlace(), renderVariants(), draw()) }, h('img', { src: q.url, alt: '' }))))] : []);
        };
        renderList();
        renderVariants();
        out.push(
          title(tr('Gegenstand setzen')),
          hint(tr('Auswählen und auf die Karte klicken. R dreht vor dem Setzen.')),
          h('label.inline.small', { title: tr('Gibt es einen Gegenstand in mehreren Ausführungen, kommt nach jedem Setzen eine andere. Aus: es bleibt bei der gewählten.') }, vary, tr('Ausführung nach jedem Setzen wechseln')),
          variants,
          h('div.small.muted', tr('Drehung beim Setzen')),
          choice([['off', tr('Fest')], ['slight', tr('Leicht schief')], ['quarter', tr('In 90°-Schritten')], ['free', tr('Beliebig')]], () => opt.rotMode, (v) => ((opt.rotMode = v), savePlace(), nextGhost())),
          h('label.inline.small', { title: tr('Jedes zweite Stück wird gespiegelt gesetzt (nicht bei Dächern und Türmen)') }, flipR, tr('Zufällig spiegeln')),
          search,
          list,
        );
      } else if (tool === 'label') {
        out.push(title(tr('Namen setzen')), choice([['place', tr('Ort')], ['area', tr('Viertel')]], () => opt.labelKind, (v) => (opt.labelKind = v)), choice([['s', tr('Klein')], ['m', tr('Mittel')], ['l', tr('Groß')], ['xl', tr('Sehr groß')]], () => opt.labelSize, (v) => (opt.labelSize = v)), hint(tr('Auf die Karte klicken und den Namen eingeben – für Orte (Rathaus, Zum Eber) oder ganze Viertel und Landstriche (große, gesperrte Schrift). Im Spiel entscheidest du, welche Namen die Spieler sehen.')));
      } else if (tool === 'fill') {
        const dens = h('input', { type: 'range', min: 0.3, max: 2, step: 0.1, value: opt.density });
        dens.addEventListener('input', () => (opt.density = Number(dens.value)));
        out.push(title(tr('Fläche füllen')), choice(Object.entries(FILL_LABEL), () => opt.fill, (v) => (opt.fill = v)), choice([['ellipse', tr('Kreis')], ['rect', tr('Rechteck')]], () => opt.fillShape, (v) => (opt.fillShape = v)), h('label.small.muted', tr('Dichte')), dens, hint(opt.fill === 'houses' ? tr('Fläche aufziehen: sie füllt sich mit Häuserzeilen – Straßen, Wege, Wasser und Mauern bleiben frei. Danach lassen sich Ausrichtung, Dichte und Hausgröße des Viertels einstellen und jedes Haus einzeln verschieben.') : tr('Fläche aufziehen: sie füllt sich von selbst – nur auf freiem Boden, nicht in Wasser, Gebäuden oder auf Wegen. Danach lässt sich jedes Stück einzeln verschieben.')));
      }
      fill(side, out);
    }

    // --- Kartenbild übernehmen -----------------------------------------------------------------------------------------
    let baking = false;
    /**
     * Was das Spiel über ein Stockwerk wissen muss: Lichter, Wände, Räume, Türen, Fenster und Namen. map: die Karte,
     * deren Zustand (Türen offen/zu, sichtbare Namen, eigene Lichter) erhalten bleibt.
     */
    function playData(sc, map, W, H, loops, isCave) {
          // Feuerstellen und Laternen leuchten: als Lichtquellen der Karte übernehmen (eigene Lichter der Spielleitung bleiben)
          const lights = Object.fromEntries(Object.entries(map.lights || {}).filter(([k]) => !k.startsWith('mb')));
          for (const o of sc.objects) {
            const l = CATALOG[o.t]?.light;
            if (!l) continue;
            // Lichtpunkt des Gegenstands (bei der Wandfackel ein Stück vor der Wand), mitgedreht
            const [ax, ay] = CATALOG[o.t].lightAt || [0, 0];
            const ra = ((o.rot || 0) * Math.PI) / 180;
            const fx = o.flip ? -ax : ax;
            lights[`mb${o.id}`] = { id: `mb${o.id}`, x: Math.round(o.x + fx * Math.cos(ra) - ay * Math.sin(ra)), y: Math.round(o.y + fx * Math.sin(ra) + ay * Math.cos(ra)), on: true, seed: (o.v % 97) / 10, ...l };
          }
          // Türen: Zustand (offen/zu, verschlossen) bleibt über das erneute Übernehmen hinweg erhalten
          const walls = wallSegments(sc.rooms, sc.walls, sc.openings, loops);
          const zones = roomZones(sc.rooms, sc.walls, loops, W, H);
          // Unter freiem Himmel: Flächen, die nur von Mauerzügen umschlossen sind (Burghof, ummauerte Stadt). Sie lassen
          // sich aufdecken wie Räume, gelten für „nur innen dunkel“ aber als draußen.
          for (const z of zones) {
            const xs = z.in.filter((_, k) => k % 2 === 0);
            const ys = z.in.filter((_, k) => k % 2 === 1);
            const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
            let inside = 0;
            let roofed = 0;
            for (let k = 0; k < 400 && inside < 16; k++) {
              const px = x0 + ((k * 0.618034) % 1) * (x1 - x0);
              const py = y0 + ((k * 0.414214) % 1) * (y1 - y0);
              if (!zoneAt({ zones: [{ id: z.id, pts: z.in, holes: z.holes }] }, px, py)) continue;
              inside++;
              const room = roomAt(sc.rooms, px, py);
              if ((room && !room.open && !room.ruin) || isCave(px, py)) roofed++;
            }
            if (inside && roofed * 2 < inside) z.out = true;
          }
          // Was die Spielleitung im Spiel von Hand als Hof oder Innenraum eingestuft hat, bleibt so
          for (const pz of map.zones || []) {
            if (!pz.man || !pz.at) continue;
            const z = zoneAt({ zones }, pz.at[0], pz.at[1]);
            if (!z) continue;
            if (pz.out) z.out = true;
            else delete z.out;
            z.man = 1;
            z.at = pz.at;
          }
          const outline = buildingOutline(sc.rooms);
          const doors = {};
          let orphans = 0;
          for (const o of sc.openings) {
            if (o.k === 'window') continue;
            // Eine Tür, die an keiner Wand mehr liegt, würde mitten im Raum das Licht sperren
            if ((nearestWall(outline, sc.walls, o.x, o.y)?.d ?? 99) > 8) {
              orphans++;
              continue;
            }
            const prev = map.doors?.[o.id];
            const inner = sc.walls.find((w) => (nearestWall({ segs: [w], arcs: [] }, [], o.x, o.y)?.d ?? 99) < 8);
            const d = { id: o.id, x: o.x, y: o.y, a: o.a, w: o.w, open: !!prev?.open, locked: prev ? !!prev.locked : !!o.locked, secret: o.k === 'secret', gate: o.k === 'gate', found: !!prev?.found, wall: inner ? inner.kind || 'wood' : isTimberWall(sc.rooms, o.x, o.y) ? 'timber' : 'stone' };
            d.seg = sealDoor(d, walls);
            if (d.gate && inner) {
              // Tor im Mauerring: die Flügel schwenken in den Hof
              const n = ringOutsides(sc.walls.filter((w) => w.kind === inner.kind)).get(inner);
              if (n) d.sw = n[0] * Math.sin(o.a) - n[1] * Math.cos(o.a) > 0 ? 1 : -1;
            }
            // Räume beiderseits der Tür (null = draußen): geht sie auf, werden sie aufgedeckt
            d.z = [-1, 1].map((sgn) => zoneAt({ zones }, o.x - Math.sin(o.a) * 26 * sgn, o.y + Math.cos(o.a) * 26 * sgn)?.id || null);
            doors[o.id] = d;
          }
          if (orphans) toast(tr('{n} Türen liegen an keiner Wand und fehlen deshalb im Spiel.', { n: orphans }), 5000);
          // Tageslicht: Fenster, die ins Freie gehen. Gemerkt werden ein Punkt knapp vor dem Fenster, seine Richtung und
          // Breite und der Raum dahinter – von dort fällt bei „nur innen dunkel“ das Licht in den Raum.
          const windows = [];
          for (const o of sc.openings) {
            if (o.k !== 'window') continue;
            const nx = -Math.sin(o.a);
            const ny = Math.cos(o.a);
            const side = [-1, 1].map((sg) => {
              const z = zoneAt({ zones }, o.x + nx * 30 * sg, o.y + ny * 30 * sg);
              return z && !z.out ? z.id : null;
            });
            if (!side[0] === !side[1]) continue; // Fenster zwischen zwei Räumen oder in einer Hofmauer
            const sg = side[0] ? 1 : -1;
            windows.push([Math.round(o.x + nx * 24 * sg), Math.round(o.y + ny * 24 * sg), Math.round(o.a * 1000) / 1000, Math.round(o.w), side[0] || side[1]]);
          }
          // Namen: ob die Spieler sie sehen, bleibt über das erneute Übernehmen hinweg erhalten
          const labels = Object.fromEntries((sc.labels || []).filter((l) => l.text).map((l) => [l.id, { id: l.id, x: l.x, y: l.y, text: l.text, size: l.size || 'm', kind: l.kind || 'place', rot: l.rot || 0, shown: map.labels?.[l.id]?.shown !== false }]));
          return { lights, walls, zones, doors, windows, labels };
    }
    /**
     * Weitere Stockwerke fürs Spiel: je Stockwerk ein weiteres Bild derselben Karte mit eigenen Wänden, Türen, Räumen,
     * Lichtern, Namen, eigenem Nebel und eigener Beleuchtung (map.uppers, map.lowers). In einem Obergeschoss scheint
     * alles darunter abgedunkelt durch, ein Untergeschoss liegt für sich im Fels. Gezeigt wird ein Stockwerk erst, wenn
     * die Spielleitung es einblendet. Liefert die Änderungen.
     */
    async function bakeFloors(map, W, H) {
      const used = (list, keys) => {
        let n = list.length;
        while (n && !keys.some((k) => list[n - 1][k].length)) n--;
        return n;
      };
      const ups = root.uppers || [];
      const lows = root.lowers || [];
      const nUp = used(ups, ['rooms', 'objects', 'walls']);
      const nDown = used(lows, ['rooms', 'objects', 'walls', 'cave']);
      const prevUp = Array.isArray(map.uppers) ? map.uppers : [];
      const prevDown = Array.isArray(map.lowers) ? map.lowers : [];
      const image = async (cv, f) => {
        let blob = await new Promise((res) => cv.toBlob(res, 'image/webp', 0.92));
        if (!blob || blob.type !== 'image/webp') blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.92));
        const [asset] = await uploadFiles(cid, [new File([blob], `${map.name} – ${floorLabel(f, nUp, nDown, tr)}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: blob.type })]);
        return asset.id;
      };
      // Nebel, Beleuchtung und Zustände (Türen, sichtbare Namen, eigene Lichter) eines Stockwerks bleiben erhalten; ein
      // neues beginnt mit dem Nebel so, wie er im Erdgeschoss steht (an oder aus)
      const fog = (prev) => prev?.fog || { enabled: !!map.fog?.enabled, ops: [] };
      const upOut = [];
      if (nUp) renderer.compose(root); // unten mit geschlossenen Türen – in den Bildern der Obergeschosse bewegt sich dort nichts
      lowKey = null;
      for (let i = 1; i <= nUp; i++) {
        const up = ups[i - 1];
        const prev = prevUp[i - 1] || null;
        await upR(i).ready(up);
        const assetId = await image(upR(i).compose(up, { noDoors: true, under: underOf(i) }), i);
        upOut.push({ assetId, ...playData(up, prev || {}, W, H, [], () => false), fog: fog(prev), lighting: prev?.lighting || { enabled: false, ambient: 0.15, ...(map.lighting || {}) } });
        // fürs nächste Stockwerk liegt dieses mit geschlossenen Türen darunter
        if (i < nUp) upR(i).compose(up, { under: underOf(i) });
      }
      const downOut = [];
      for (let i = 1; i <= nDown; i++) {
        const low = lows[i - 1];
        const prev = prevDown[i - 1] || null;
        const R = lowR(i);
        await R.ready(low);
        const assetId = await image(R.compose(low, { noDoors: true }), -i);
        // unter der Erde ist es dunkel: ein neues Untergeschoss beginnt mit eingeschalteter Beleuchtung
        downOut.push({ assetId, ...playData(low, prev || {}, W, H, R.terrain.caveLoops.map((L) => L.pts), (x, y) => R.isCave(x, y)), fog: fog(prev), lighting: prev?.lighting || { enabled: true, ambient: 0.12 } });
        R.compose(low); // im Kartenbauer wieder mit Türen
      }
      // Bilder, die keiner mehr braucht, wieder entfernen
      const keep = new Set([...upOut, ...downOut].map((u) => u.assetId));
      const old = [...prevUp, ...prevDown].map((u) => u?.assetId).filter((id) => id && !keep.has(id));
      const inUse = (id) => Object.values(S().maps).some((m) => m.assetId === id || [...(m.uppers || []), ...(m.lowers || [])].some((u) => u?.assetId === id));
      if (old.length) setTimeout(() => old.forEach((id) => !inUse(id) && api('DELETE', `/api/campaigns/${cid}/assets/${id}`).catch(() => {})), 2000);
      if (!nUp && !nDown && !prevUp.length && !prevDown.length) return [];
      const clampF = (f) => Math.max(-nDown, Math.min(nUp, Math.trunc(Number(f) || 0)));
      const ops = [{ t: 'merge', p: ['maps', mapId], v: { uppers: nUp ? upOut : null, lowers: nDown ? downOut : null, floor: clampF(map.floor) } }];
      // Figuren auf einem Stockwerk, das es nicht mehr gibt, rücken auf das nächste vorhandene
      for (const t of Object.values(map.tokens || {})) if (t.f && clampF(t.f) !== t.f) ops.push({ t: 'set', p: ['maps', mapId, 'tokens', t.id, 'f'], v: clampF(t.f) });
      return ops;
    }
    async function bake() {
      if (baking || !scene) return false;
      baking = true;
      bakeBtn.disabled = true;
      status.textContent = tr('Kartenbild wird erzeugt …');
      try {
        await api('PUT', url, root);
        await renderer.ready(root);
        const cv = renderer.compose(root, { noDoors: true }); // Türen zeichnet das Spiel selbst – sie gehen auf und zu
        lowKey = null;
        const { W, H } = sceneSize(root);
        let blob = await new Promise((res) => cv.toBlob(res, 'image/webp', 0.92));
        if (!blob || blob.type !== 'image/webp') blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.92));
        const map = S().maps[mapId];
        const file = new File([blob], `${map.name}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: blob.type });
        const [asset] = await uploadFiles(cid, [file]);
        const old = map.built ? map.assetId : null;
        const { lights, walls, zones, doors, windows, labels } = playData(root, map, W, H, renderer.terrain.caveLoops.map((L) => L.pts), (px, py) => renderer.isCave(px, py));
        const upper = await bakeFloors(map, W, H);
        // Dungeon und Höhle liegen im Dunkeln: beim ersten Übernehmen gleich die Beleuchtung einschalten
        const lighting = !map.assetId && biomeOf(root).solid ? { ...(map.lighting || {}), enabled: true, ambient: 0.12 } : null;
        sync.do([
          lighting && { t: 'set', p: ['maps', mapId, 'lighting'], v: lighting },
          { t: 'merge', p: ['maps', mapId], v: { assetId: asset.id, width: W, height: H, built: true, doors, labels, zones, walls, windows, anim: root.still ? null : renderer.animData(root), lights } },
          // Übersichtskarten zeigen beim ersten Übernehmen kein Raster – es stört auf Stadt- und Landkarten
          { t: 'merge', p: ['maps', mapId, 'grid'], v: { size: CELL, offsetX: 0, offsetY: 0, cols: 0, rows: 0, ...(!map.assetId && root.scale === 'overview' ? { show: false } : {}) } },
          ...upper,
        ]);
        if (old && old !== asset.id && !Object.values(S().maps).some((m) => m.id !== mapId && m.assetId === old)) api('DELETE', `/api/campaigns/${cid}/assets/${old}`).catch(() => {});
        baked = true;
        draw();
        status.textContent = tr('Kartenbild übernommen');
        return true;
      } catch (err) {
        status.textContent = '';
        toast(tr('Kartenbild konnte nicht übernommen werden: {message}', { message: err.message }), 5000);
        return false;
      } finally {
        baking = false;
        bakeBtn.disabled = false;
      }
    }
    async function leave(route) {
      if (!baked && confirm(tr('Die Karte wurde geändert. Kartenbild jetzt übernehmen?'))) await bake();
      go(route);
    }

    // --- Start -------------------------------------------------------------------------------------------------------
    (async () => {
      status.textContent = tr('Lädt …');
      try {
        root = await api('GET', url);
      } catch {
        root = null;
      }
      let fresh = false;
      if (!root || typeof root !== 'object' || !root.cols) {
        // neue Karte: mit der gewählten Vorlage beginnen, sonst leer
        root = takeTemplate(mapId) || newScene();
        baked = false;
        fresh = !!(root.objects?.length || root.rooms?.length);
      }
      // fehlende Listen älterer Stände ergänzen, Obergeschoss anbinden
      link();
      if (fresh) save();
      history.push(JSON.stringify(root));
      hIndex = 0;
      undoBtn.disabled = redoBtn.disabled = true;
      syncTop();
      setTool('select');
      await new Promise((r) => requestAnimationFrame(r));
      fit();
      status.textContent = '';
      recompose();
      // neue Karte mit Wunsch an die KI: gleich entwerfen lassen
      const wish = takeWish(mapId);
      if (wish && ai.text) aiMap(wish);
    })();

    return {
      el,
      refresh(changed) {
        if (!S().maps[mapId]) return go('maps');
        if ((changed.has('maps') || changed.has('*')) && document.activeElement !== name) name.value = S().maps[mapId].name;
      },
    };
  };
}
