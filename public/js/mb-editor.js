// Kartenbauer: Editor. Gelände malen, Räume aufziehen, Wände/Türen/Fenster setzen, Gegenstände platzieren und
// Flächen automatisch mit Bäumen, Büschen oder Felsen füllen. Die Szene liegt als eigene Datei je Karte auf dem
// Server; „Karte übernehmen“ backt daraus das Kartenbild, das Spieltisch und Spieler-Display wie jede Karte zeigen.
import { h, fill, api, toast, uid, uploadFiles, debounce } from './util.js';
import { icon } from './icons.js';
import { tr } from './i18n.js';
import { CELL, newScene, thin, roomAt, inRoom, buildingOutline, nearestWall, wallSegments, roomZones, scatter, scatterHouses, inRects, shapeBox } from './mb-geom.js';
import { BIOMES, CATALOG, CATEGORIES, biomeOf, previewUrl, sprite } from './mb-assets.js';
import { SceneRenderer, sceneSize, FLOORS, floorSwatch } from './mb-render.js';
import { tableCells } from '/shared/calibration.js';
import { sealDoor, zoneAt } from './doors.js';
import { takeTemplate, downloadScene, uploadScene } from './mb-templates.js';

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
    const url = `/api/campaigns/${cid}/scenes/${mapId}`;
    const renderer = new SceneRenderer();
    let scene = null;
    let tool = 'select';
    let sel = null; // { type: 'object'|'room'|'wall'|'opening'|'fill', id }
    let drag = null;
    let chain = null; // angefangener Mauerzug: { start, last }
    let hover = null; // Mausposition in Kartenkoordinaten
    let baked = true; // entspricht das Kartenbild dem Stand der Szene?
    const opt = { terrain: 'water', r: TERRAIN.water.r, erase: false, lvl: 1, room: 'rect', open: false, ruin: false, search: '', floor: 'wood', wall: 'wood', opening: 'door', obj: 'tableRound', rot: 0, fill: 'trees', density: 1, fillShape: 'ellipse' };
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
        await api('PUT', url, scene);
        status.textContent = baked ? tr('Gespeichert') : tr('Gespeichert · Kartenbild noch nicht übernommen');
      } catch (err) {
        status.textContent = tr('Speichern fehlgeschlagen: {message}', { message: err.message });
      }
    }, 900);
    /** Änderung abschließen: in den Verlauf, speichern, neu zeichnen. */
    function commit() {
      history.splice(hIndex + 1);
      history.push(JSON.stringify(scene));
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
      scene = JSON.parse(history[hIndex]);
      chain = null; // ein angefangener Mauerzug hinge sonst an einem Punkt, den es nicht mehr gibt
      if (sel && !find(sel)) sel = null;
      syncTop();
      renderSide();
      touched();
    }
    const listOf = (type) => ({ object: scene.objects, room: scene.rooms, wall: scene.walls, opening: scene.openings, fill: scene.fills })[type];
    const find = (s) => (s ? listOf(s.type).find((x) => x.id === s.id) : null);
    function syncTop() {
      cols.value = scene.cols;
      rows.value = scene.rows;
      biome.value = scene.biome;
      alive.checked = !scene.still;
      scale.value = scene.scale || 'battle';
    }
    /** Verschiebt den gesamten Inhalt der Karte. */
    function shiftScene(dx, dy) {
      for (const key of ['water', 'paths', 'roads', 'dirt', 'high', 'cave']) for (const st of scene[key]) if (st.pts) st.pts = st.pts.map(([x, y]) => [x + dx, y + dy]);
      for (const r of scene.rooms) {
        if (r.k === 'circle') Object.assign(r, { cx: r.cx + dx, cy: r.cy + dy });
        else Object.assign(r, { x: r.x + dx, y: r.y + dy });
      }
      for (const w of scene.walls) Object.assign(w, { x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy });
      for (const o of [...scene.openings, ...scene.objects]) Object.assign(o, { x: o.x + dx, y: o.y + dy });
      for (const f of scene.fills) {
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
    function recompose(hide) {
      if (!scene) return;
      const t0 = performance.now();
      renderer.compose(scene, { hide });
      slow = performance.now() - t0 > 90;
      composed = true;
      draw();
    }
    renderer.onLoad = () => el.isConnected && recompose();
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
      c.drawImage(renderer.out, view.tx, view.ty, W * view.k, H * view.k);
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
      // Auswahl
      const it = find(sel);
      if (it) {
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
          for (const [x, y] of handles(it)) c.fillRect(x - 5 * px, y - 5 * px, 10 * px, 10 * px);
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
        const o = { t: opt.obj, ...mounted(opt.obj, hover[0], hover[1], opt.rot), s: CATALOG[opt.obj].size ? zoomOf() : 1, v: ghostV };
        const sp = sprite(o, biomeOf(scene), 1);
        if (sp?.img) {
          c.save();
          c.globalAlpha = 0.75;
          c.translate(o.x, o.y);
          c.rotate((o.rot * Math.PI) / 180);
          c.drawImage(sp.img, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
          c.restore();
        } else sp?.promise.then(draw);
      } else if (hover && tool === 'opening') {
        const w = wallAt(hover[0], hover[1]);
        if (w) {
          const len = opt.opening === 'window' ? 56 : 70;
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
          setTool('object');
          renderSide();
          return null;
        }
      }
      if (tool === 'select') return startSelect(x, y);
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
            scene.rooms.push({ id, ...room, floor: opt.floor, ...(opt.open ? { open: true } : {}), ...(opt.ruin ? { ruin: true } : {}) });
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
      if (tool === 'opening') {
        const w = wallAt(x, y);
        if (!w) return toast(tr('Türen und Fenster sitzen auf einer Wand – erst einen Raum oder eine Wand anlegen.')), null;
        // Die Zeichnung liegt immer „richtig herum“: Winkel auf −90° … 90° bringen
        let a = w.a;
        while (a > Math.PI / 2) a -= Math.PI;
        while (a <= -Math.PI / 2) a += Math.PI;
        scene.openings.push({ id: uid(), k: opt.opening, x: Math.round(w.x), y: Math.round(w.y), a: Math.round(a * 1000) / 1000, w: opt.opening === 'window' ? 56 : 70 });
        commit();
        return null;
      }
      if (tool === 'object') {
        const def = CATALOG[opt.obj];
        used(opt.obj);
        scene.objects.push({ id: uid(), t: opt.obj, ...mounted(opt.obj, Math.round(x), Math.round(y), opt.rot), s: def.size ? Math.round((0.8 + Math.random() * 0.5) * zoomOf() * 100) / 100 : 1, v: ghostV });
        ghostV = Math.floor(Math.random() * 1e6);
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
    function refill(f) {
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
      const made = f.kind === 'houses' ? scatterHouses(f, free) : scatter(f, CELL * z, free);
      if (f.kind !== 'houses') for (const o of made) o.s = Math.round(o.s * z * 100) / 100;
      scene.objects.push(...made);
      if (!made.length) toast(tr('Hier ist kein freier Boden zum Füllen.'));
    }

    function startSelect(x, y) {
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
      sel = hit && { type: hit.type, id: hit.id };
      renderSide();
      const it = find(sel);
      if (!it) return null;
      const orig = JSON.stringify(it);
      const o0 = JSON.parse(orig);
      const members = sel.type === 'fill' ? scene.objects.filter((o) => o.fill === it.id).map((o) => [o, o.x, o.y]) : [];
      // Raum: Türen, Fenster, Innenwände und Einrichtung wandern mit
      const att = sel.type === 'room' ? attached(it, 'room') : { points: [], walls: [] };
      const att0 = { points: att.points.map((o) => [o, o.x, o.y]), walls: att.walls.map((w) => [w, w.x1, w.y1, w.x2, w.y2]) };
      let moved = false;
      return {
        move: (mx, my) => {
          let dx = mx - x;
          let dy = my - y;
          if (!moved && Math.hypot(dx, dy) < 4 / view.k) return;
          moved = true;
          if (sel.type === 'object') Object.assign(it, { x: Math.round(o0.x + dx), y: Math.round(o0.y + dy) });
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
    function remove() {
      const it = find(sel);
      if (!it) return;
      const list = listOf(sel.type);
      list.splice(list.indexOf(it), 1);
      if (sel.type === 'fill') scene.objects = scene.objects.filter((o) => o.fill !== it.id);
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
      if (!it || sel.type !== 'object') return;
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
      const it = find(sel);
      if (!it || sel.type === 'opening') return false;
      const step = sel.type === 'object' || sel.type === 'fill' ? (fine ? 5 : HALF) : fine ? HALF : CELL;
      moveBy(it, sel.type, ux * step, uy * step);
      commit();
      return true;
    }
    /** Verschiebt ein Element; Räume nehmen Türen, Fenster, Innenwände und Einrichtung mit, Füllbereiche ihren Inhalt. */
    function moveBy(it, type, dx, dy, att = attached(it, type)) {
      if (type === 'object') Object.assign(it, { x: it.x + dx, y: it.y + dy });
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
      if (type !== 'room') return { points: [], walls: [] };
      return {
        points: [...scene.objects.filter((o) => !o.fill && inRoom(it, o.x, o.y)), ...scene.openings.filter((o) => inRoom(it, o.x, o.y, -10))],
        walls: scene.walls.filter((w) => inRoom(it, w.x1, w.y1, -4) && inRoom(it, w.x2, w.y2, -4)),
      };
    }
    function duplicate() {
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
      tool = t;
      chain = null;
      if (t !== 'select') sel = null;
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
      if (tool === 'select') {
        if (!it) {
          out.push(
            h('div.row', { style: { flexWrap: 'wrap', gap: '6px', marginBottom: '10px' } },
              h('button.small', { title: tr('Die Szene als Datei sichern – zum Aufbewahren oder für eine andere Kampagne'), onclick: () => downloadScene(scene, S().maps[mapId]?.name) }, icon('download'), tr(' Szene sichern')),
              h('button.small', {
                title: tr('Eine gesicherte Szene laden – sie ersetzt den Inhalt dieser Karte (mit Strg+Z rückgängig)'),
                onclick: async () => {
                  try {
                    const loaded = await uploadScene();
                    if (!loaded) return;
                    scene = loaded;
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
            ),
          );
        }
        if (!it) out.push(title(tr('Auswählen')), hint(tr('Anklicken wählt aus, Ziehen verschiebt – Räume nehmen Türen und Einrichtung mit. Pfeiltasten schieben (mit Umschalt fein), R dreht, F spiegelt, Entf löscht, Strg+D verdoppelt. Alt+Klick nimmt einen Gegenstand als Vorlage. Mausrad zoomt, rechte Maustaste oder Leertaste verschiebt die Ansicht.')));
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
          out.push(title(tr('Raum')), hint(tr('Ziehen verschiebt, die Griffe ändern die Größe.')), floorPicker(() => it.floor, (f) => ((it.floor = f), commit())), h('label.inline', open, tr('Offen (ohne Wände, z. B. Veranda oder Steg)')), h('label.inline', ruin, tr('Ruine (verfallene Mauern, überwucherter Boden)')), h('button.small.danger', { onclick: remove }, icon('trash'), tr(' Raum löschen')));
        } else if (sel.type === 'wall') {
          out.push(title(tr('Wand')), choice([['wood', tr('Holz')], ['stone', tr('Stein')], ['rampart', tr('Burgmauer')], ['palisade', tr('Palisade')]], () => it.kind || 'wood', (v) => ((it.kind = v), commit())), h('button.small.danger', { onclick: remove }, icon('trash'), tr(' Wand löschen')));
        } else if (sel.type === 'opening') {
          const locked = h('input', { type: 'checkbox', checked: !!it.locked });
          locked.addEventListener('change', () => ((it.locked = locked.checked || undefined), commit()));
          out.push(title(it.k === 'door' ? tr('Tür') : it.k === 'secret' ? tr('Geheimtür') : tr('Fenster')), hint(tr('Ziehen verschiebt entlang der Wände.')), it.k === 'window' ? null : h('label.inline', { title: tr('Gilt, wenn die Karte zum ersten Mal übernommen wird – im Spiel lässt sich jede Tür auf- und zuschließen') }, locked, tr('Zu Beginn verschlossen')), h('button.small.danger', { onclick: remove }, icon('trash'), tr(' Löschen')));
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
                  return [h('label.small.muted', tr('Ausrichtung')), angle, h('label.small.muted', tr('Hausgröße')), size];
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
          choice(Object.entries(TERRAIN).map(([k, t]) => [k, t.label]), () => opt.terrain, (v) => ((opt.terrain = v), (opt.r = TERRAIN[v].r))),
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
        out.push(title(tr('Raum aufziehen')), choice([['rect', tr('Rechteck')], ['circle', tr('Kreis')]], () => opt.room, (v) => (opt.room = v)), floorPicker(() => opt.floor, (f) => (opt.floor = f)), h('label.inline', open, tr('Offen (ohne Wände)')), h('label.inline', ruin, tr('Ruine (verfallene Mauern, überwucherter Boden)')), hint(tr('Räume rasten auf halbe Felder ein. Überlappende und angrenzende Räume verschmelzen zu einem Gebäude; die Außenwand läuft um den gemeinsamen Umriss.')));
      } else if (tool === 'floor') {
        out.push(title(tr('Boden festlegen')), floorPicker(() => opt.floor, (f) => (opt.floor = f)), hint(tr('Boden wählen und einen Raum anklicken.')));
      } else if (tool === 'wall') {
        out.push(title(tr('Wand ziehen')), choice([['wood', tr('Holz')], ['stone', tr('Stein')], ['rampart', tr('Burgmauer')], ['palisade', tr('Palisade')]], () => opt.wall, (v) => (opt.wall = v)), chain ? h('button.small', { onclick: () => ((chain = null), renderSide(), draw()) }, icon('check'), tr(' Mauerzug beenden')) : null, hint(tr('Ziehen zieht eine einzelne Wand. Für einen langen Mauerzug Punkt für Punkt klicken: jeder Klick setzt die nächste Ecke, ein Klick auf den Anfang schließt den Ring, Doppelklick, Enter oder Esc beendet. Außenwände entstehen von selbst um jeden Raum. Burgmauern haben Zinnen und an jeder Ecke einen Turm, Palisaden sind Reihen aus Stämmen; ein Tor entsteht mit „Tür“ auf der Mauer.')));
      } else if (tool === 'opening') {
        out.push(title(tr('Tür oder Fenster setzen')), choice([['door', tr('Tür')], ['window', tr('Fenster')], ['secret', tr('Geheimtür')]], () => opt.opening, (v) => (opt.opening = v)), hint(tr('Auf eine Wand klicken. Türen öffnen die Wand, Fenster sitzen darauf. Eine Geheimtür sieht aus wie Wand, bis die Spielleitung sie im Spiel öffnet.')));
      } else if (tool === 'object') {
        const list = h('div.mb-cats');
        const search = h('input', { type: 'search', placeholder: tr('Katalog durchsuchen …'), value: opt.search });
        // Nur die Liste neu aufbauen – das Suchfeld behält so beim Tippen den Fokus
        const renderList = () => {
          const q = opt.search.trim().toLowerCase();
          const groups = [];
          const button = ([t, d]) => h('button', { class: opt.obj === t ? 'active' : '', title: d.label, onclick: () => ((opt.obj = t), renderList(), draw()) }, h('img', { src: previewUrl(t, B), alt: '', loading: 'lazy' }), h('span', d.label));
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
        renderList();
        out.push(title(tr('Gegenstand setzen')), hint(tr('Auswählen und auf die Karte klicken. R dreht vor dem Setzen.')), search, list);
      } else if (tool === 'fill') {
        const dens = h('input', { type: 'range', min: 0.3, max: 2, step: 0.1, value: opt.density });
        dens.addEventListener('input', () => (opt.density = Number(dens.value)));
        out.push(title(tr('Fläche füllen')), choice(Object.entries(FILL_LABEL), () => opt.fill, (v) => (opt.fill = v)), choice([['ellipse', tr('Kreis')], ['rect', tr('Rechteck')]], () => opt.fillShape, (v) => (opt.fillShape = v)), h('label.small.muted', tr('Dichte')), dens, hint(opt.fill === 'houses' ? tr('Fläche aufziehen: sie füllt sich mit Häuserzeilen – Straßen, Wege, Wasser und Mauern bleiben frei. Danach lassen sich Ausrichtung, Dichte und Hausgröße des Viertels einstellen und jedes Haus einzeln verschieben.') : tr('Fläche aufziehen: sie füllt sich von selbst – nur auf freiem Boden, nicht in Wasser, Gebäuden oder auf Wegen. Danach lässt sich jedes Stück einzeln verschieben.')));
      }
      fill(side, out);
    }

    // --- Kartenbild übernehmen -----------------------------------------------------------------------------------------
    let baking = false;
    async function bake() {
      if (baking || !scene) return false;
      baking = true;
      bakeBtn.disabled = true;
      status.textContent = tr('Kartenbild wird erzeugt …');
      try {
        await api('PUT', url, scene);
        await renderer.ready(scene);
        const cv = renderer.compose(scene, { noDoors: true }); // Türen zeichnet das Spiel selbst – sie gehen auf und zu
        const { W, H } = sceneSize(scene);
        let blob = await new Promise((res) => cv.toBlob(res, 'image/webp', 0.92));
        if (!blob || blob.type !== 'image/webp') blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.92));
        const map = S().maps[mapId];
        const file = new File([blob], `${map.name}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: blob.type });
        const [asset] = await uploadFiles(cid, [file]);
        const old = map.built ? map.assetId : null;
        // Feuerstellen und Laternen leuchten: als Lichtquellen der Karte übernehmen (eigene Lichter der Spielleitung bleiben)
        const lights = Object.fromEntries(Object.entries(map.lights || {}).filter(([k]) => !k.startsWith('mb')));
        for (const o of scene.objects) {
          const l = CATALOG[o.t]?.light;
          if (!l) continue;
          // Lichtpunkt des Gegenstands (bei der Wandfackel ein Stück vor der Wand), mitgedreht
          const [ax, ay] = CATALOG[o.t].lightAt || [0, 0];
          const ra = ((o.rot || 0) * Math.PI) / 180;
          const fx = o.flip ? -ax : ax;
          lights[`mb${o.id}`] = { id: `mb${o.id}`, x: Math.round(o.x + fx * Math.cos(ra) - ay * Math.sin(ra)), y: Math.round(o.y + fx * Math.sin(ra) + ay * Math.cos(ra)), on: true, seed: (o.v % 97) / 10, ...l };
        }
        // Türen: Zustand (offen/zu, verschlossen) bleibt über das erneute Übernehmen hinweg erhalten
        const walls = wallSegments(scene.rooms, scene.walls, scene.openings, renderer.terrain.caveLoops.map((L) => L.pts));
        const zones = roomZones(scene.rooms, scene.walls, renderer.terrain.caveLoops.map((L) => L.pts), W, H);
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
            const room = roomAt(scene.rooms, px, py);
            if ((room && !room.open && !room.ruin) || renderer.isCave(px, py)) roofed++;
          }
          if (inside && roofed * 2 < inside) z.out = true;
        }
        const outline = buildingOutline(scene.rooms);
        const doors = {};
        let orphans = 0;
        for (const o of scene.openings) {
          if (o.k === 'window') continue;
          // Eine Tür, die an keiner Wand mehr liegt, würde mitten im Raum das Licht sperren
          if ((nearestWall(outline, scene.walls, o.x, o.y)?.d ?? 99) > 8) {
            orphans++;
            continue;
          }
          const prev = map.doors?.[o.id];
          const inner = scene.walls.find((w) => (nearestWall({ segs: [w], arcs: [] }, [], o.x, o.y)?.d ?? 99) < 8);
          const d = { id: o.id, x: o.x, y: o.y, a: o.a, w: o.w, open: !!prev?.open, locked: prev ? !!prev.locked : !!o.locked, secret: o.k === 'secret', wall: inner ? inner.kind || 'wood' : 'stone' };
          d.seg = sealDoor(d, walls);
          // Räume beiderseits der Tür (null = draußen): geht sie auf, werden sie aufgedeckt
          d.z = [-1, 1].map((sgn) => zoneAt({ zones }, o.x - Math.sin(o.a) * 26 * sgn, o.y + Math.cos(o.a) * 26 * sgn)?.id || null);
          doors[o.id] = d;
        }
        if (orphans) toast(tr('{n} Türen liegen an keiner Wand und fehlen deshalb im Spiel.', { n: orphans }), 5000);
        // Dungeon und Höhle liegen im Dunkeln: beim ersten Übernehmen gleich die Beleuchtung einschalten
        const lighting = !map.assetId && biomeOf(scene).solid ? { ...(map.lighting || {}), enabled: true, ambient: 0.12 } : null;
        sync.do([
          lighting && { t: 'set', p: ['maps', mapId, 'lighting'], v: lighting },
          { t: 'merge', p: ['maps', mapId], v: { assetId: asset.id, width: W, height: H, built: true, doors, zones, walls, anim: scene.still ? null : renderer.animData(scene), lights } },
          // Übersichtskarten zeigen beim ersten Übernehmen kein Raster – es stört auf Stadt- und Landkarten
          { t: 'merge', p: ['maps', mapId, 'grid'], v: { size: CELL, offsetX: 0, offsetY: 0, cols: 0, rows: 0, ...(!map.assetId && scene.scale === 'overview' ? { show: false } : {}) } },
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
        scene = await api('GET', url);
      } catch {
        scene = null;
      }
      if (!scene || typeof scene !== 'object' || !scene.cols) {
        // neue Karte: mit der gewählten Vorlage beginnen, sonst leer
        scene = takeTemplate(mapId) || newScene();
        baked = false;
        if (scene.objects?.length || scene.rooms?.length) save();
      }
      // fehlende Listen älterer Stände ergänzen
      for (const k of ['water', 'paths', 'roads', 'dirt', 'high', 'cave', 'rooms', 'walls', 'openings', 'objects', 'fills']) scene[k] ||= [];
      history.push(JSON.stringify(scene));
      hIndex = 0;
      undoBtn.disabled = redoBtn.disabled = true;
      syncTop();
      setTool('select');
      await new Promise((r) => requestAnimationFrame(r));
      fit();
      status.textContent = '';
      recompose();
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
