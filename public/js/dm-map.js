// Karten-Arbeitsfläche der Spielleitung: Werkzeuge für Nebel, Tokens, Licht, Zauberradien,
// Freihand-Annotationen, Messen, Pings und die Steuerung des TV-Ausschnitts.
import { h, uid, clear, bindInput, byOrder, TOKEN_COLORS, toast, fill } from './util.js';
import { MapRenderer, gridOf, snapPoint, snapViewCenter, inAoe, feetToPx, lightPos, drawStroke, FOG_STYLES, fogStyleOf } from './maprender.js';
import { Viewport } from './viewport.js';
import { doorAt, zoneAt, zoneOp, zoneShown, labelAt } from './doors.js';
import { tableCells } from '/shared/calibration.js';
import { addCreatureToInitiative } from './creatures-view.js';
import { putOnTable } from './table-view.js';
import * as Combat from './combat.js';
import { tokenSelection } from './selection.js';
import { icon } from './icons.js';
import { tr } from './i18n.js';
import { t } from './i18n.js';
import { dist, distIn, distFrom, unitLabel, unitStep } from './units-ui.js';

// [id, Symbol, Kurzname, Erklärung] – gruppiert nach Zweck
const TOOL_GROUPS = [
  [tr('Bewegen'), [
    ['select', 'cursor', tr('Auswahl'), tr('Objekte antippen & ziehen, leere Fläche ziehen = Karte verschieben (V)')],
    ['tv', 'monitor', tr('TV-Bild'), tr('Ausschnitt verschieben, den der Spieltisch zeigt (T)')],
  ]],
  [tr('Nebel'), [
    ['reveal', 'sun', tr('Aufdecken'), tr('Nebel mit dem Pinsel aufdecken (F)')],
    ['hide', 'cloud', tr('Verdecken'), tr('Nebel mit dem Pinsel wieder verdecken (H)')],
    ['revealRect', 'rect', tr('Rechteck'), tr('Rechteckigen Bereich aufdecken')],
    ['revealRoom', 'home', tr('Raum'), tr('Ganzen Raum einer gebauten Karte aufdecken – mit Umschalt-Taste wieder verdecken')],
  ]],
  [tr('Setzen'), [
    ['token', 'token', tr('Token'), tr('Spieler, NSC oder Gegner platzieren (K)')],
    ['light', 'bulb', tr('Licht'), tr('Lichtquelle setzen (L)')],
    ['aoe', 'aoe', tr('Zauber'), tr('Wirkungsbereich: Kreis, Kegel, Würfel, Linie (A)')],
  ]],
  [tr('Notieren'), [
    ['draw', 'pen', tr('Stift'), tr('Auf der Karte zeichnen (D)')],
    ['erase', 'eraser', tr('Radierer'), tr('Zeichnungen entfernen (E)')],
  ]],
  [tr('Hilfen'), [
    ['ruler', 'ruler', tr('Messen'), tr('Entfernung messen (M)')],
    ['ping', 'ping', tr('Zeigen'), tr('Stelle auf dem Tisch aufblinken lassen (P)')],
  ]],
];
const TOOLS = TOOL_GROUPS.flatMap(([, tools]) => tools);
// Vergrößerung des Tischausschnitts: 0,1 (zehnmal so viel Karte, z.B. Weltkarten) bis 4
export const TV_ZOOM_MIN = 0.1;
export const TV_ZOOM_MAX = 4;

const KEYS = { v: 'select', t: 'tv', f: 'reveal', h: 'hide', k: 'token', l: 'light', a: 'aoe', d: 'draw', e: 'erase', m: 'ruler', p: 'ping' };

const AOE_SHAPES = { circle: tr('Kreis/Sphäre'), cone: tr('Kegel'), cube: tr('Würfel'), line: tr('Linie') };

const SEND_MS = 40;

/**
 * @param {object} hooks  onShowCreature(id): Werte einer Kreatur im Panel anzeigen
 */
/** Länge einer Messlinie in Fuß (5e-Diagonalregel: jedes Feld zählt 5 ft, auch schräg). */
function rulerFeet(map, r) {
  const g = gridOf(map);
  const cells = Math.max(Math.abs(r.x1 - r.x0) / g.sizeX, Math.abs(r.y1 - r.y0) / g.sizeY);
  return Math.round(cells) * (g.feet || 5);
}

export function createMapEditor(sync, cid, hooks = {}) {
  const S = () => sync.state;
  const opt = {
    tool: 'select',
    brush: 2, // Pinselbreite in Feldern
    token: { name: 'Gegner', kind: 'enemy', color: TOKEN_COLORS[0], size: 1, hidden: true },
    // mode: 'fx' = kurzer Zaubereffekt auf allen Anzeigen, 'mark' = Bereich bleibt markiert (z.B. Feuerwand)
    // style (nur Linie): 'bolt' = Geschoss fliegt die Linie entlang, 'beam' = Strahl flammt auf (z.B. Blitz)
    aoe: { shape: 'circle', size: 20, color: '#ff6a00', mode: 'fx', style: 'bolt' },
    pen: { color: '#e53935', width: 4, vis: 'all' },
  };
  let mapId = null;
  let selected = null; // { type: 'token'|'light'|'aoe', id } – bei mehreren Tokens { type: 'tokens' }
  let picked = new Set(); // ausgewählte Tokens (Mehrfachauswahl)
  let drag = null;
  let preview = null; // Vorschau während eines Werkzeugs
  let stream = null; // laufender Strich (Nebel/Zeichnung)
  const views = new Map(); // gespeicherte Ansicht pro Karte
  // Lineal auch auf dem Spieltisch und in der Spieleransicht zeigen – Wahl wird je Gerät gemerkt
  const rulerShareKey = 'dm:rulerShare';
  let rulerShare = false;
  try {
    rulerShare = localStorage.getItem(rulerShareKey) === '1';
  } catch {
    /* nicht verfügbar */
  }
  let rulerTimer = 0;
  let rulerNext = null;
  /** Messlinie an Tisch und Spieler schicken: während des Ziehens höchstens alle 50 ms, beim Loslassen sofort. */
  function shareRuler(r, done = false) {
    if (!rulerShare || !mapId || !M()) return;
    rulerNext = { type: 'ruler', mapId, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, ft: rulerFeet(M(), r), done };
    if (done) {
      clearTimeout(rulerTimer);
      rulerTimer = 0;
      sync.fx(rulerNext);
    } else if (!rulerTimer) {
      rulerTimer = setTimeout(() => {
        rulerTimer = 0;
        sync.fx(rulerNext);
      }, 50);
    }
  }
  function clearSharedRuler() {
    clearTimeout(rulerTimer);
    rulerTimer = 0;
    if (mapId) sync.fx({ type: 'ruler', mapId, clear: true });
  }

  const canvas = h('canvas', { style: { position: 'absolute', inset: 0, width: '100%', height: '100%' } });
  const renderer = new MapRenderer(canvas, { mode: 'dm', campaignId: cid, getState: S });
  const M = () => S().maps[mapId];
  const P = (...k) => ['maps', mapId, ...k];

  /** Von den verbundenen Tischanzeigen gemeldete Ausschnitte (in Feldern). */
  function tvViews() {
    return Object.values(S().display.table.views || {}).filter((v) => v?.w > 0 && v?.h > 0);
  }

  function tvExtent(map, view) {
    // Bevorzugt den vom Spieltisch gemeldeten, tatsächlich sichtbaren Ausschnitt
    const cells = view || tvViews()[0] || tableCells(sync.settings.table);
    const g = gridOf(map);
    return { w: (cells.w * g.sizeX) / tvZoom(), h: (cells.h * g.sizeY) / tvZoom() };
  }

  /** Vergrößerung des Tischausschnitts (1 = 1 Feld je Zoll); beim Ziehen an einer Ecke der vorläufige Wert. */
  function tvZoom() {
    return (drag?.tv && drag.pending?.zoom) || S().display.table.zoom || 1;
  }

  /** Ecke des (ersten) TV-Rahmens unter dem Zeiger? Liefert -1/1 je Achse oder null. */
  function tvCornerAt(map, p) {
    const t = S().display.table;
    if (t.mapId !== map.id || t.fit || !sync.settings) return null;
    const e = tvExtent(map, tvViews()[0]);
    const c = snapTv(map, t.cx, t.cy, tvViews()[0]);
    const tol = 22 / renderer.view.scale; // Fangbereich in Bildschirmpixeln
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        if (Math.abs(p.x - (c.cx + (sx * e.w) / 2)) < tol && Math.abs(p.y - (c.cy + (sy * e.h) / 2)) < tol) return { sx, sy, c, e };
      }
    }
    return null;
  }

  /** TV-Mitte so setzen, dass der Ausschnitt am Raster einrastet. */
  function snapTv(map, cx, cy, view) {
    const e = tvExtent(map, view);
    return snapViewCenter(map, cx, cy, e.w, e.h);
  }

  // --- Overlays --------------------------------------------------------------

  renderer.overlay = (ctx, map) => {
    const scale = renderer.view.scale;
    // Während des Ziehens den Rahmen an der neuen (noch nicht übertragenen) Position zeigen
    const t = drag?.tv && drag.pending ? { ...S().display.table, ...drag.pending, fit: false } : S().display.table;
    // TV-Ausschnitt
    if (t.mapId === map.id && !t.fit && sync.settings) {
      // Ein Rahmen je verbundener Tischanzeige; ohne Meldung aus der Kalibrierung berechnet
      const views = tvViews();
      const list = views.length ? views : [null];
      const colors = ['#3fa7d6', '#e0a030', '#c060c0', '#4caf50'];
      list.forEach((view, i) => {
        const { w, h: hh } = tvExtent(map, view);
        const { cx: tcx, cy: tcy } = snapTv(map, t.cx, t.cy, view);
        const cells = view || tableCells(sync.settings.table);
        const name = view?.label || (list.length > 1 ? tr('TV {x}', { x: i + 1 }) : 'TV');
        const color = t.blackout ? '#888' : colors[i % colors.length];
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3 / scale;
        ctx.setLineDash([12 / scale, 6 / scale]);
        ctx.strokeRect(tcx - w / 2, tcy - hh / 2, w, hh);
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = `${14 / scale}px sans-serif`;
        const z = tvZoom();
        const info = tr('TV: {name} · {floor} × {floor2} Felder{x}{x2}{x3}', { name, floor: Math.floor(cells.w / z), floor2: Math.floor(cells.h / z), x: z !== 1 ? ` (${Math.round(z * 100)} %)` : '', x2: view ? '' : tr(' (berechnet, Tisch nicht verbunden)'), x3: t.blackout ? tr(' · verdunkelt') : '' });
        if (opt.tool === 'tv' && i === 0) {
          // Griffe an den Ecken: ziehen ändert die Größe des Ausschnitts
          const s = 12 / scale;
          for (const [x, y] of [[tcx - w / 2, tcy - hh / 2], [tcx + w / 2, tcy - hh / 2], [tcx - w / 2, tcy + hh / 2], [tcx + w / 2, tcy + hh / 2]]) {
            ctx.fillRect(x - s / 2, y - s / 2, s, s);
          }
        }
        ctx.fillText(info, tcx - w / 2 + 6 / scale, tcy - hh / 2 + 18 / scale);
        ctx.restore();
      });
    }
    if (!preview) return;
    if (preview.type === 'aoe') renderer.drawAoe(ctx, map, preview.aoe, true);
    if (preview.type === 'select') {
      ctx.save();
      ctx.fillStyle = 'rgba(80,160,255,0.15)';
      ctx.strokeStyle = '#64b5f6';
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([8 / scale, 5 / scale]);
      const { x0, y0, x1, y1 } = preview;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.restore();
    }
    if (preview.type === 'rect') {
      ctx.save();
      ctx.fillStyle = 'rgba(255,220,120,0.25)';
      ctx.strokeStyle = '#ffd54a';
      ctx.lineWidth = 2 / scale;
      const { x0, y0, x1, y1 } = preview;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.restore();
    }
    if (preview.type === 'brush') {
      ctx.save();
      ctx.strokeStyle = opt.tool === 'hide' ? '#888' : '#ffd54a';
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.arc(preview.x, preview.y, preview.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (preview.type === 'ruler') {
      const ft = rulerFeet(map, preview);
      ctx.save();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3 / scale;
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(preview.x0, preview.y0);
      ctx.lineTo(preview.x1, preview.y1);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${16 / scale}px sans-serif`;
      ctx.fillText(dist(ft), preview.x1 + 10 / scale, preview.y1 - 10 / scale);
      ctx.restore();
    }
    if (preview.type === 'erase') {
      ctx.save();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 / scale;
      ctx.beginPath();
      ctx.arc(preview.x, preview.y, 14 / scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  // --- Treffertest -----------------------------------------------------------

  function hitTest(x, y) {
    const map = M();
    if (!map) return null;
    const tokens = Object.values(map.tokens || {}).sort((a, b) => (a.size || 1) - (b.size || 1));
    for (const t of tokens) {
      const r = (gridOf(map).size * (t.size || 1)) / 2;
      if (Math.hypot(t.x - x, t.y - y) <= r) return { type: 'token', id: t.id };
    }
    if (map.lighting?.enabled) {
      const r = Math.max(10 / renderer.view.scale, gridOf(map).size / 5);
      for (const l of Object.values(map.lights || {})) {
        if (l.tokenId) continue;
        const p = lightPos(map, l);
        if (Math.hypot(p.x - x, p.y - y) <= r) return { type: 'light', id: l.id };
      }
    }
    for (const a of Object.values(map.aoes || {})) {
      if (Math.hypot(a.x - x, a.y - y) <= Math.max(14 / renderer.view.scale, gridOf(map).size / 4) || inAoe(map, a, x, y)) return { type: 'aoe', id: a.id };
    }
    const door = doorAt(map, x, y, 4 / renderer.view.scale);
    if (door) return { type: 'door', id: door.id };
    const label = labelAt(map.labels, x, y);
    if (label) return { type: 'label', id: label.id };
    return null;
  }

  function select(sel) {
    selected = sel;
    picked = new Set(sel?.type === 'token' ? [sel.id] : []);
    renderer.selectedId = sel?.id || null;
    renderer.selectedIds = picked;
    renderer.requestRender();
    renderInspector();
    tokenSelection.set(picked, 'map');
  }

  /** Mehrere Tokens auswählen (Shift/Strg-Klick, Auswahlrahmen, Kampf-Tab). */
  function pick(ids, { publish = true } = {}) {
    picked = new Set(ids);
    selected = picked.size === 1 ? { type: 'token', id: [...picked][0] } : picked.size ? { type: 'tokens' } : null;
    renderer.selectedId = picked.size === 1 ? [...picked][0] : null;
    renderer.selectedIds = picked;
    renderer.requestRender();
    renderInspector();
    if (publish) tokenSelection.set(picked, 'map');
  }

  // Auswahl aus dem Kampf-Tab übernehmen (nur Tokens dieser Karte)
  tokenSelection.on((ids, source) => {
    if (source === 'map' || !M()) return;
    pick([...ids].filter((id) => M().tokens?.[id]), { publish: false });
  });

  // --- Werkzeuge -------------------------------------------------------------

  // Pinsel auf Karten mit Raster in Feldern, ohne Raster (z.B. Weltkarten) in Bildschirmpixeln –
  // sonst wäre er auf großen, weit herausgezoomten Karten nur wenige Pixel breit.
  const BRUSH_SCREEN_PX = 25;
  const brushInCells = () => gridOf(M()).show !== false;
  const brushRadius = () => (brushInCells() ? (opt.brush * gridOf(M()).size) / 2 : (opt.brush * BRUSH_SCREEN_PX) / 2 / renderer.view.scale);
  const brushLabel = () => (brushInCells() ? tr('{brush} Felder', { brush: opt.brush }) : tr('{round} px', { round: Math.round(opt.brush * BRUSH_SCREEN_PX) }));

  /** Zaubereffekt auf allen Anzeigen abspielen (Tisch, Spieler-Display, weitere DM-Geräte) und hier selbst. */
  function castSpell(aoe) {
    if (!mapId) return;
    const fx = { type: 'spell', mapId, shape: aoe.shape, x: aoe.x, y: aoe.y, angle: aoe.angle || 0, size: aoe.size, width: aoe.width, color: aoe.color, style: aoe.style };
    sync.fx(fx);
    renderer.addSpell(fx);
  }

  function startStream(kind, first) {
    stream = { kind, pts: [...first], last: performance.now(), id: null };
    const map = M();
    if (kind === 'fog') {
      const op = { m: opt.tool === 'hide' ? 'hide' : 'reveal', s: 'stroke', r: brushRadius(), pts: [...first] };
      stream.op = op;
      sync.push(P('fog', 'ops'), [op]);
      stream.pts = [];
      stream.lastPt = first;
    } else if (kind === 'draw') {
      stream.id = uid();
      const w = opt.pen.width / renderer.view.scale;
      sync.set(P('drawings', stream.id), { id: stream.id, color: opt.pen.color, w, vis: opt.pen.vis, layer: 'above', pts: first });
      stream.pts = [];
    }
    if (!map.fog) sync.set(P('fog'), { enabled: false, ops: [] });
  }

  function streamPoints(samples) {
    if (!stream) return;
    if (stream.kind === 'fog') {
      for (const s of samples) stream.pts.push(s.x, s.y);
      if (performance.now() - stream.last > SEND_MS) flushStream();
    } else if (stream.kind === 'draw') {
      const pts = samples.flatMap((s) => [s.x, s.y, s.pressure]);
      sync.local({ t: 'push', p: P('drawings', stream.id, 'pts'), v: pts });
      stream.pts.push(...pts);
      if (performance.now() - stream.last > SEND_MS) flushStream();
    }
  }

  function flushStream() {
    if (!stream || !stream.pts.length) return;
    if (stream.kind === 'fog') {
      // Jedes Teilstück ist ein eigener Op und beginnt am letzten Punkt des vorherigen
      const op = { m: stream.op.m, s: 'stroke', r: stream.op.r, pts: [...stream.lastPt, ...stream.pts] };
      sync.push(P('fog', 'ops'), [op]);
      stream.lastPt = stream.pts.slice(-2);
    } else {
      sync.send({ t: 'push', p: P('drawings', stream.id, 'pts'), v: stream.pts });
    }
    stream.pts = [];
    stream.last = performance.now();
  }

  function endStream() {
    flushStream();
    stream = null;
  }

  function eraseAt(x, y) {
    const map = M();
    const r = 14 / renderer.view.scale;
    const ops = [];
    for (const d of Object.values(map.drawings || {})) {
      const p = d.pts || [];
      for (let i = 0; i < p.length; i += 3) {
        if (Math.hypot(p[i] - x, p[i + 1] - y) < r + (d.w || 4) / 2) {
          ops.push({ t: 'del', p: P('drawings', d.id) });
          break;
        }
      }
    }
    if (ops.length) sync.do(ops);
  }

  function nextTokenName(base) {
    const names = new Set(Object.values(M().tokens || {}).map((t) => t.name));
    if (!names.has(base) && !opt.token.numbered) return base;
    let i = 1;
    while (names.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  function placeToken(x, y) {
    const map = M();
    const p = snapPoint(map, x, y, opt.token.size);
    const id = uid();
    sync.set(P('tokens', id), {
      id,
      name: nextTokenName(opt.token.name || tr('Token')),
      kind: opt.token.kind,
      color: opt.token.color,
      size: opt.token.size,
      hidden: !!opt.token.hidden,
      assetId: opt.token.assetId || null,
      creatureId: opt.token.creatureId || null,
      x: p.x,
      y: p.y,
      hp: opt.token.hp ?? null,
      maxHp: opt.token.maxHp ?? null,
      showName: false,
      dead: false,
    });
    select({ type: 'token', id });
  }

  function placeLight(x, y) {
    const map = M();
    const p = snapPoint(map, x, y, 1);
    const id = uid();
    const ops = [{ t: 'set', p: P('lights', id), v: { id, x: p.x, y: p.y, bright: 20, dim: 20, color: '#ffb347', flicker: true, on: true, seed: Math.random() * 10 } }];
    if (!map.lighting?.enabled) {
      ops.push({ t: 'set', p: P('lighting'), v: { ambient: 0.15, ...(map.lighting || {}), enabled: true } });
      toast(tr('Dynamische Beleuchtung für diese Karte aktiviert'));
    }
    sync.do(ops);
    select({ type: 'light', id });
  }

  const handlers = {
    isPanTool: () => opt.tool === 'select' || !M(),
    onPanToolDown(e, p) {
      const hit = hitTest(p.x, p.y);
      // Mehrfachauswahl: Shift/Strg/Cmd oder Schalter „Mehrfach“ (für Touch)
      const additive = e.shiftKey || e.ctrlKey || e.metaKey || opt.multi;
      if (!hit) {
        if (additive) {
          // Auswahlrahmen aufziehen statt die Karte zu verschieben
          drag = { box: true };
          preview = { type: 'select', x0: p.x, y0: p.y, x1: p.x, y1: p.y };
          return true;
        }
        select(null);
        return false;
      }
      if (hit.type === 'door') {
        // Tür: ein Klick öffnet oder schließt sie (Ziehen verschiebt nichts)
        drag = { door: hit.id, x: e.clientX, y: e.clientY };
        return true;
      }
      if (hit.type === 'label') {
        // Name auf der Karte: auswählen, rechts zeigen oder verbergen; die Karte lässt sich trotzdem verschieben
        select(hit);
        return false;
      }
      if (hit.type === 'token' && additive) {
        const next = new Set(picked);
        if (next.has(hit.id)) next.delete(hit.id);
        else next.add(hit.id);
        pick(next);
        return true;
      }
      const map = M();
      if (hit.type === 'token' && picked.has(hit.id) && picked.size > 1) {
        // Gruppe gemeinsam verschieben
        const group = [...picked].filter((id) => map.tokens?.[id]).map((id) => ({ id, dx: map.tokens[id].x - p.x, dy: map.tokens[id].y - p.y }));
        drag = { hit, group, moved: false };
        return true;
      }
      select(hit);
      const obj = map[hit.type === 'token' ? 'tokens' : hit.type === 'light' ? 'lights' : 'aoes'][hit.id];
      drag = { hit, dx: obj.x - p.x, dy: obj.y - p.y, moved: false };
      return true;
    },
    onToolDown(e, p) {
      const map = M();
      if (!map) return;
      switch (opt.tool) {
        case 'tv': {
          const corner = tvCornerAt(map, p);
          if (corner) {
            // Größe ändern: Mitte bleibt, die gegriffene Ecke folgt dem Zeiger
            const z = S().display.table.zoom || 1;
            drag = { tv: true, resize: true, cx: corner.c.cx, cy: corner.c.cy, w1: corner.e.w * z, h1: corner.e.h * z };
            break;
          }
          drag = { tv: true, sx: p.x, sy: p.y, cx: S().display.table.cx, cy: S().display.table.cy };
          if (S().display.table.mapId !== mapId) {
            putOnTable(sync, mapId, { ...snapTv(map, p.x, p.y), fit: false });
            drag.cx = p.x;
            drag.cy = p.y;
          }
          break;
        }
        case 'reveal':
        case 'hide':
          if (!map.fog?.enabled) {
            sync.merge(P('fog'), { enabled: true });
            toast(tr('Nebel des Krieges für diese Karte aktiviert'));
          }
          // Verdecken auf einer noch komplett verdeckten Karte hat keine sichtbare Wirkung
          if (opt.tool === 'hide' && !(map.fog?.ops || []).some((o) => o.m !== 'hide')) {
            toast(tr('Die Karte ist noch komplett verdeckt – zum Aufdecken das Werkzeug „Aufdecken“ verwenden'), 3500);
          }
          startStream('fog', [p.x, p.y]);
          preview = { type: 'brush', x: p.x, y: p.y, r: brushRadius() };
          break;
        case 'revealRoom': {
          if (!map.zones?.length) {
            toast(map.built ? tr('Diese Karte kennt ihre Räume noch nicht – bitte einmal im Kartenbauer öffnen und „Karte übernehmen“') : tr('Räume kennt nur eine Karte aus dem Kartenbauer – hier bitte Pinsel oder Rechteck nehmen'), 4500);
            break;
          }
          const zone = zoneAt(map, p.x, p.y);
          if (!zone) {
            toast(tr('Hier ist kein geschlossener Raum – im Freien bitte Pinsel oder Rechteck nehmen'), 3500);
            break;
          }
          if (opt.roomSky) {
            // Hof, Garten, Dachterrasse: für „nur innen dunkel“ als draußen merken (oder wieder als Innenraum)
            sync.set(P('zones'), map.zones.map((z) => {
              if (z.id !== zone.id) return z;
              // von Hand gesetzt (man) samt Klickpunkt: so findet der Kartenbauer den Bereich beim nächsten
              // Übernehmen wieder und behält die Einstufung
              const { out, ...rest } = z;
              return { ...rest, ...(out ? {} : { out: true }), man: 1, at: [Math.round(p.x), Math.round(p.y)] };
            }));
            toast(zone.out ? tr('Dieser Bereich gilt wieder als Innenraum.') : tr('Dieser Bereich liegt jetzt unter freiem Himmel – bei „nur innen dunkel“ bleibt er hell.'), 3500);
            break;
          }
          if (!map.fog?.enabled) sync.merge(P('fog'), { enabled: true });
          sync.push(P('fog', 'ops'), [zoneOp(zone, e.shiftKey !== !!opt.roomHide)]);
          break;
        }
        case 'revealRect':
          if (!map.fog?.enabled) sync.merge(P('fog'), { enabled: true });
          preview = { type: 'rect', x0: p.x, y0: p.y, x1: p.x, y1: p.y };
          break;
        case 'token':
          placeToken(p.x, p.y);
          break;
        case 'light':
          placeLight(p.x, p.y);
          break;
        case 'aoe': {
          const o = snapPoint(map, p.x, p.y, 2);
          preview = { type: 'aoe', sx: p.sx, sy: p.sy, aoe: { ...opt.aoe, x: o.x, y: o.y, angle: 0 } };
          break;
        }
        case 'draw':
          startStream('draw', [p.x, p.y, p.pressure]);
          break;
        case 'erase':
          preview = { type: 'erase', x: p.x, y: p.y };
          eraseAt(p.x, p.y);
          break;
        case 'ruler': {
          const o = snapPoint(map, p.x, p.y, 1);
          preview = { type: 'ruler', x0: o.x, y0: o.y, x1: o.x, y1: o.y };
          shareRuler(preview);
          break;
        }
        case 'ping': {
          const fx = { type: 'ping', mapId, x: p.x, y: p.y, target: 'all' };
          sync.fx(fx);
          renderer.addPing(fx);
          break;
        }
      }
      renderer.requestRender();
    },
    onToolMove(e, p, samples) {
      const map = M();
      if (!map) return;
      if (drag?.tv && drag.resize) {
        const dx = Math.abs(p.x - drag.cx) || 1;
        const dy = Math.abs(p.y - drag.cy) || 1;
        // Seitenverhältnis bleibt (es ist das des Bildschirms) – die Achse, die weiter reicht, bestimmt die Größe
        const zoom = Math.round(Math.max(TV_ZOOM_MIN, Math.min(TV_ZOOM_MAX, Math.min(drag.w1 / (2 * dx), drag.h1 / (2 * dy)))) * 100) / 100;
        drag.pending = { zoom };
        Object.assign(drag.pending, snapTv(map, drag.cx, drag.cy));
        renderer.requestRender();
        return;
      }
      if (drag?.tv) {
        // Ungerundet mitzählen, eingerastet (feldweise) anzeigen. An den Tisch geht die Position erst
        // beim Loslassen – so muss der Spieltisch nur einmal neu zeichnen statt bei jedem Feld.
        drag.pending = snapTv(map, drag.cx + (p.x - drag.sx), drag.cy + (p.y - drag.sy));
        drag.cx += p.x - drag.sx;
        drag.cy += p.y - drag.sy;
        drag.sx = p.x;
        drag.sy = p.y;
        renderer.requestRender();
        return;
      }
      if (drag?.box) {
        Object.assign(preview, { x1: p.x, y1: p.y });
        renderer.requestRender();
        return;
      }
      if (drag?.group) {
        drag.moved = true;
        sync.do(drag.group.map((g) => ({ t: 'merge', p: P('tokens', g.id), v: { x: p.x + g.dx, y: p.y + g.dy } })));
        return;
      }
      if (drag?.hit) {
        drag.moved = true;
        const coll = drag.hit.type === 'token' ? 'tokens' : drag.hit.type === 'light' ? 'lights' : 'aoes';
        sync.merge(P(coll, drag.hit.id), { x: p.x + drag.dx, y: p.y + drag.dy });
        return;
      }
      if (stream) streamPoints(samples);
      if (!preview) return;
      if (preview.type === 'brush') Object.assign(preview, { x: p.x, y: p.y });
      if (preview.type === 'rect') Object.assign(preview, { x1: p.x, y1: p.y });
      if (preview.type === 'erase') {
        Object.assign(preview, { x: p.x, y: p.y });
        eraseAt(p.x, p.y);
      }
      if (preview.type === 'ruler') {
        const o = snapPoint(map, p.x, p.y, 1);
        Object.assign(preview, { x1: o.x, y1: o.y });
        shareRuler(preview);
      }
      if (preview.type === 'aoe') {
        const a = preview.aoe;
        const dist = Math.hypot(p.x - a.x, p.y - a.y);
        if (Math.hypot(p.sx - preview.sx, p.sy - preview.sy) > 12) {
          a.angle = Math.atan2(p.y - a.y, p.x - a.x);
          const feet = (dist / gridOf(map).size) * (gridOf(map).feet || 5);
          a.size = Math.max(5, Math.round(feet / 5) * 5);
        }
      }
      renderer.requestRender();
    },
    onToolUp(e, p) {
      const map = M();
      if (drag?.door && map?.doors?.[drag.door] && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) {
        const door = map.doors[drag.door];
        if (door.locked && !door.open) toast(tr('Die Tür ist verschlossen – rechts lässt sie sich aufschließen'), 2500);
        else setDoor(door, !door.open);
        select({ type: 'door', id: door.id });
      }
      // Rahmen gezogen: Position übernehmen und (falls die ganze Karte gezeigt wurde) zum Ausschnitt wechseln
      if (drag?.tv && drag.pending) sync.merge(['display', 'table'], { ...drag.pending, fit: false });
      if (drag?.box && map && preview?.type === 'select') {
        const { x0, y0, x1, y1 } = preview;
        const [ax, bx, ay, by] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
        const inside = Object.values(map.tokens || {}).filter((t) => t.x >= ax && t.x <= bx && t.y >= ay && t.y <= by).map((t) => t.id);
        pick(new Set([...picked, ...inside]));
        preview = null;
      }
      if (drag?.group && map) {
        if (drag.moved && !e.altKey) {
          sync.do(drag.group.map((g) => map.tokens[g.id] && { t: 'merge', p: P('tokens', g.id), v: snapPoint(map, map.tokens[g.id].x, map.tokens[g.id].y, map.tokens[g.id].size || 1) }));
        }
      } else if (drag?.hit && map) {
        const coll = drag.hit.type === 'token' ? 'tokens' : drag.hit.type === 'light' ? 'lights' : 'aoes';
        const obj = map[coll][drag.hit.id];
        if (obj && drag.moved && !e.altKey) {
          const snap = snapPoint(map, obj.x, obj.y, drag.hit.type === 'token' ? obj.size || 1 : drag.hit.type === 'aoe' ? 2 : 1);
          sync.merge(P(coll, drag.hit.id), snap);
        }
      }
      drag = null;
      if (stream) endStream();
      if (preview?.type === 'ruler') shareRuler(preview, true);
      if (preview?.type === 'rect') {
        const { x0, y0, x1, y1 } = preview;
        if (Math.abs(x1 - x0) > 2 && Math.abs(y1 - y0) > 2) {
          sync.push(P('fog', 'ops'), [{ m: 'reveal', s: 'rect', x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }]);
        }
      }
      if (preview?.type === 'aoe') {
        const { mode, ...aoe } = preview.aoe;
        if (mode === 'fx') {
          castSpell(aoe);
        } else {
          const id = uid();
          sync.set(P('aoes', id), { ...aoe, id });
          select({ type: 'aoe', id });
        }
      }
      preview = opt.tool === 'reveal' || opt.tool === 'hide' ? { type: 'brush', x: p.x, y: p.y, r: brushRadius() } : null;
      renderer.requestRender();
    },
    onToolCancel() {
      if (stream) endStream();
      if (preview?.type === 'ruler' && rulerShare) clearSharedRuler();
      drag = null;
      preview = null;
      renderer.requestRender();
    },
    onHover(p) {
      if (opt.tool === 'tv' && M()) {
        const corner = tvCornerAt(M(), p);
        canvas.style.cursor = corner ? (corner.sx === corner.sy ? 'nwse-resize' : 'nesw-resize') : 'move';
      }
      if ((opt.tool === 'reveal' || opt.tool === 'hide') && M()) {
        preview = { type: 'brush', x: p.x, y: p.y, r: brushRadius() };
        renderer.requestRender();
      }
    },
    onViewChange() {
      renderer.autoFit = null;
      if (mapId) views.set(mapId, { ...renderer.view });
    },
  };
  const viewport = new Viewport(renderer, handlers);

  // --- Werkzeugleiste ----------------------------------------------------------

  const toolButtons = TOOLS.map(([id, iconName, label, title]) =>
    h('button.tool', { title: `${label.replace(/\u00ad/g, '')} – ${title}`, dataset: { tool: id }, onclick: () => setTool(id) }, h('span.tool-icon', icon(iconName)), h('span.tool-label', label)),
  );
  const byId = Object.fromEntries(toolButtons.map((b) => [b.dataset.tool, b]));
  // Tischansicht: Licht, Nebel und Tokens genau so wie auf dem Spieltisch (ohne DM-Hilfen)
  const lookBtn = h(
    'button.tool',
    {
      title: tr('Karte so anzeigen, wie die Spieler sie am Tisch sehen – volle Dunkelheit, deckender Nebel, ohne verdeckte Tokens und DM-Notizen'),
      onclick: () => {
        renderer.tableLook = !renderer.tableLook;
        lookBtn.classList.toggle('active', renderer.tableLook);
        renderer.requestRender();
      },
    },
    h('span.tool-icon', icon('eye')),
    h('span.tool-label', tr('Tisch­ansicht')),
  );
  // Werkzeugleiste kompakt (nur Symbole) oder mit Beschriftung – Wahl wird je Gerät gemerkt
  const compactKey = 'dm:toolsCompact';
  let compact = false;
  try {
    compact = localStorage.getItem(compactKey) === '1';
  } catch {
    /* nicht verfügbar */
  }
  const compactBtn = h('button.tool.toolbar-toggle', {
    onclick: () => {
      compact = !compact;
      try {
        localStorage.setItem(compactKey, compact ? '1' : '0');
      } catch {
        /* nicht verfügbar */
      }
      applyCompact();
    },
  });
  const toolbar = h(
    'div.map-toolbar',
    ...TOOL_GROUPS.map(([name, tools]) => h('div.tool-group', h('div.tool-group-title', name), ...tools.map(([id]) => byId[id]))),
    h('div.tool-group', h('div.tool-group-title', tr('Ansicht')), lookBtn),
    compactBtn,
  );
  const optionsBar = h('div.map-options');
  function applyCompact() {
    toolbar.classList.toggle('compact', compact);
    optionsBar.classList.toggle('beside-compact', compact);
    compactBtn.title = compact ? tr('Werkzeuge mit Beschriftung zeigen') : tr('Werkzeugleiste verkleinern (nur Symbole)');
    fill(compactBtn, h('span.tool-icon', icon(compact ? 'chevronRight' : 'chevronLeft')));
  }
  applyCompact();

  function setTool(t, { keepPreset = false } = {}) {
    if (!keepPreset && t === 'token' && opt.tool !== 'token') {
      delete opt.token.creatureId;
      delete opt.token.hp;
      delete opt.token.maxHp;
    }
    opt.tool = t;
    preview = null;
    toolButtons.forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    canvas.style.cursor = t === 'select' ? 'grab' : t === 'tv' ? 'move' : 'crosshair';
    renderOptions();
    renderer.requestRender();
  }

  /** Farbfelder; custom: zusätzlich ein Feld mit freier Farbwahl (zeigt die gewählte Farbe, wenn sie keine Vorgabe ist). */
  function swatchRow(get, set, colors = TOKEN_COLORS, custom = false) {
    const row = h('div.row', { style: { gap: '4px' } });
    const draw = () => {
      const own = !colors.includes(get());
      const picker = custom
        ? h('input.swatch', {
            type: 'color',
            value: own ? get() : '#ffffff',
            title: tr('Eigene Farbe'),
            class: own ? 'active' : '',
            onchange: (e) => (set(e.target.value), draw()),
          })
        : null;
      clear(row).append(
        ...colors.map((c) => h('button.swatch', { style: { background: c }, class: get() === c ? 'active' : '', onclick: () => (set(c), draw()) })),
        ...(picker ? [picker] : []),
      );
    };
    draw();
    return row;
  }

  function renderOptions() {
    clear(optionsBar);
    const t = opt.tool;
    const add = (...els) => optionsBar.append(...els.filter(Boolean));
    if (t === 'reveal' || t === 'hide') {
      // Deutlich anzeigen, ob gerade auf- oder zugedeckt wird, mit Umschalter
      add(
        h('div.row', { style: { gap: '2px' } },
          h('button.small', { class: t === 'reveal' ? 'active' : '', onclick: () => setTool('reveal') }, icon('sun'), tr(' Aufdecken')),
          h('button.small', { class: t === 'hide' ? 'active' : '', style: t === 'hide' ? { background: '#6b6f7a', borderColor: '#9aa0ad', color: '#fff' } : null, onclick: () => setTool('hide') }, icon('cloud'), tr(' Verdecken')),
        ),
      );
      const range = h('input', { type: 'range', min: 0.5, max: 12, step: 0.5, value: opt.brush, style: { width: '140px' } });
      const lbl = h('span.small', brushLabel());
      range.addEventListener('input', () => {
        opt.brush = Number(range.value);
        lbl.textContent = brushLabel();
      });
      add(h('span.small.muted', tr('Größe')), range, lbl);
      // Darstellung des Nebels (je Karte): Textur statt einfachem Schwarz
      const style = h('select', { title: tr('So erscheint der Nebel auf dem Tisch'), style: { width: '150px' } }, ...Object.entries(FOG_STYLES).map(([v, l]) => h('option', { value: v }, l)));
      style.value = fogStyleOf(M());
      style.addEventListener('change', () => sync.merge(P('fog'), { style: style.value }));
      add(h('span.small.muted', tr('Nebel')), style);
      const softBox = h('input', { type: 'checkbox', checked: M()?.fog?.soft !== false });
      softBox.addEventListener('change', () => sync.merge(P('fog'), { soft: softBox.checked }));
      add(h('label.row', { title: tr('Nebelrand weich und leicht durchsichtig statt harter Kante'), style: { gap: '4px', alignItems: 'center' } }, softBox, h('span.small', tr('Weicher Rand'))));
      add(
        h('button.small', { onclick: () => sync.set(P('fog', 'ops'), [{ m: 'reveal', s: 'all' }]) }, tr('Alles aufdecken')),
        h('button.small', { onclick: () => confirm(tr('Gesamte Karte wieder verdecken?')) && sync.set(P('fog', 'ops'), []) }, tr('Alles verdecken')),
      );
    } else if (t === 'revealRoom') {
      // Ohne Umschalt-Taste (Tablet): Aufdecken oder Verdecken umschalten
      const reveal = M()?.fog?.doorReveal !== false;
      const doorBox = h('input', { type: 'checkbox', checked: reveal });
      doorBox.addEventListener('change', () => sync.merge(P('fog'), { doorReveal: doorBox.checked }));
      add(
        h('div.row', { style: { gap: '2px' } },
          h('button.small', { class: opt.roomHide || opt.roomSky ? '' : 'active', onclick: () => ((opt.roomHide = false), (opt.roomSky = false), renderOptions()) }, icon('sun'), tr(' Aufdecken')),
          h('button.small', { class: opt.roomHide && !opt.roomSky ? 'active' : '', style: opt.roomHide && !opt.roomSky ? { background: '#6b6f7a', borderColor: '#9aa0ad', color: '#fff' } : null, onclick: () => ((opt.roomHide = true), (opt.roomSky = false), renderOptions()) }, icon('cloud'), tr(' Verdecken')),
          h('button.small', { class: opt.roomSky ? 'active' : '', title: tr('Klick auf einen Bereich: Er gilt als unter freiem Himmel (Hof, Garten) und bleibt bei „nur innen dunkel“ hell. Noch ein Klick macht ihn wieder zum Innenraum.'), onclick: () => ((opt.roomSky = !opt.roomSky), renderOptions()) }, tr('Hof')),
        ),
        h('label.row', { title: tr('Öffnet die Spielleitung eine Tür, werden die Räume beiderseits aufgedeckt'), style: { gap: '4px', alignItems: 'center' } }, doorBox, h('span.small', tr('Türen decken auf'))),
        h('button.small', { onclick: () => sync.set(P('fog', 'ops'), [{ m: 'reveal', s: 'all' }]) }, tr('Alles aufdecken')),
        h('button.small', { onclick: () => confirm(tr('Gesamte Karte wieder verdecken?')) && sync.set(P('fog', 'ops'), []) }, tr('Alles verdecken')),
      );
    } else if (t === 'token') {
      const name = h('input', { value: opt.token.name, style: { width: '130px' } });
      name.addEventListener('input', () => (opt.token.name = name.value));
      const kind = h('select', { style: { width: '110px' } }, h('option', { value: 'enemy' }, tr('Gegner')), h('option', { value: 'npc' }, tr('NSC')), h('option', { value: 'pc' }, tr('Spieler')));
      kind.value = opt.token.kind;
      kind.addEventListener('change', () => (opt.token.kind = kind.value));
      const size = h('select', { style: { width: '120px' } }, ...[
        [0.5, tr('Winzig')],
        [1, tr('Mittel')],
        [2, tr('Groß')],
        [3, tr('Riesig')],
        [4, tr('Gigantisch')],
      ].map(([v, l]) => h('option', { value: v }, l)));
      size.value = opt.token.size;
      size.addEventListener('change', () => (opt.token.size = Number(size.value)));
      const hidden = h('input', { type: 'checkbox', checked: opt.token.hidden });
      hidden.addEventListener('change', () => (opt.token.hidden = hidden.checked));
      const numbered = h('input', { type: 'checkbox', checked: !!opt.token.numbered });
      numbered.addEventListener('change', () => (opt.token.numbered = numbered.checked));
      const imgSel = h('select', { style: { width: '140px' } }, h('option', { value: '' }, tr('ohne Bild')), ...byOrder(S().assets).filter((a) => a.kind === 'image').map((a) => h('option', { value: a.id }, a.name)));
      imgSel.value = opt.token.assetId || '';
      imgSel.addEventListener('change', () => (opt.token.assetId = imgSel.value || null));
      add(name, kind, size, imgSel, swatchRow(() => opt.token.color, (c) => (opt.token.color = c)), h('label.inline', hidden, tr('verdeckt')), h('label.inline', numbered, tr('nummerieren')));
    } else if (t === 'aoe') {
      const shape = h('select', { style: { width: '140px' } }, ...Object.entries(AOE_SHAPES).map(([v, l]) => h('option', { value: v }, l)));
      shape.value = opt.aoe.shape;
      shape.addEventListener('change', () => (opt.aoe.shape = shape.value));
      const size = h('input', { type: 'number', min: distIn(5), step: unitStep(), value: distIn(opt.aoe.size), style: { width: '80px' } });
      size.addEventListener('input', () => (opt.aoe.size = Math.max(5, distFrom(size.value) || 5)));
      // Kurzer Effekt (Standard) oder dauerhaft markierter Bereich
      const mode = h('select', { style: { width: '170px' }, title: tr('Effekt: leuchtet auf allen Anzeigen kurz auf. Markieren: Bereich bleibt auf der Karte (z.B. Feuerwand)') },
        h('option', { value: 'fx' }, tr('Effekt (kurz)')),
        h('option', { value: 'mark' }, tr('Bereich markieren')),
      );
      mode.value = opt.aoe.mode || 'fx';
      mode.addEventListener('change', () => (opt.aoe.mode = mode.value));
      // Linie: Geschoss (Pfeil, Feuerpfeil) oder Strahl (Blitz)
      const style = h('select', { style: { width: '120px' } }, h('option', { value: 'bolt' }, tr('Geschoss')), h('option', { value: 'beam' }, tr('Strahl')));
      style.value = opt.aoe.style || 'bolt';
      style.addEventListener('change', () => (opt.aoe.style = style.value));
      style.hidden = opt.aoe.shape !== 'line';
      shape.addEventListener('change', () => (style.hidden = shape.value !== 'line'));
      add(mode, shape, style, size, h('span.small', unitLabel()), swatchRow(() => opt.aoe.color, (c) => (opt.aoe.color = c), ['#ff6a00', '#3fa7d6', '#9c27b0', '#4caf50', '#f5f5f5', '#e53935'], true));
      add(h('span.small.muted', tr('Tippen = Ursprung, Ziehen = Richtung & Größe')));
      add(h('button.small', { onclick: () => sync.set(P('aoes'), {}) }, tr('Alle entfernen')));
    } else if (t === 'draw') {
      const w = h('select', { style: { width: '100px' } }, h('option', { value: 2 }, tr('fein')), h('option', { value: 4 }, tr('normal')), h('option', { value: 8 }, tr('dick')), h('option', { value: 16 }, tr('Marker')));
      w.value = opt.pen.width;
      w.addEventListener('change', () => (opt.pen.width = Number(w.value)));
      const vis = h('select', { style: { width: '170px' } }, h('option', { value: 'all' }, tr('für alle sichtbar')), h('option', { value: 'dm' }, tr('nur Spielleitung')));
      vis.value = opt.pen.vis;
      vis.addEventListener('change', () => (opt.pen.vis = vis.value));
      add(swatchRow(() => opt.pen.color, (c) => (opt.pen.color = c), ['#e53935', '#ffd54a', '#4caf50', '#3fa7d6', '#ffffff', '#111111']), w, vis);
      add(h('button.small', { onclick: () => confirm(tr('Alle Zeichnungen dieser Karte löschen?')) && sync.set(P('drawings'), {}) }, tr('Alle löschen')));
    } else if (t === 'tv') {
      add(h('span.small.muted', tr('Ziehen verschiebt den Ausschnitt auf dem Spieltisch, an einer Ecke ziehen ändert seine Größe.')));
      add(h('button.small', { onclick: centerTvHere }, tr('TV auf Ansicht zentrieren')));
      const fit = S().display.table.mapId === mapId && S().display.table.fit;
      add(
        h(
          'button.small',
          { class: fit ? 'active' : '', title: tr('Ganze Karte auf dem Tisch zeigen bzw. zurück zum Ausschnitt'), onclick: () => { putOnTable(sync, mapId, { fit: !fit }); renderOptions(); } },
          icon('maximize'),
          tr(' Ganze Karte'),
        ),
      );
    } else if (t === 'select') {
      const tokens = Object.values(M()?.tokens || {});
      add(
        h('button.small', { class: opt.multi ? 'active' : '', title: tr('Antippen nimmt Tokens zur Auswahl dazu, Ziehen auf freier Fläche zieht einen Auswahlrahmen auf (wie Shift)'), onclick: () => ((opt.multi = !opt.multi), renderOptions()) }, icon('check'), tr(' Mehrfach')),
        h('button.small', { title: tr('Alle verdeckten Tokens dieser Karte auswählen'), onclick: () => pick(tokens.filter((x) => x.hidden).map((x) => x.id)) }, icon('eyeOff'), tr(' Alle verdeckten')),
        h('button.small', { title: tr('Alle Gegner dieser Karte auswählen'), onclick: () => pick(tokens.filter((x) => x.kind === 'enemy' && !x.dead).map((x) => x.id)) }, icon('skull'), tr(' Alle Gegner')),
        h('span.map-hint', { title: opt.multi ? tr('Antippen = dazu/weg · Ziehen = Rahmen') : tr('Shift/Strg-Klick = mehrere auswählen\nShift + Ziehen = Auswahlrahmen\nleere Fläche ziehen = Karte verschieben') }, '?'),
      );
    } else if (t === 'ruler') {
      add(
        h(
          'button.small',
          {
            class: rulerShare ? 'active' : '',
            title: tr('Messlinie live auf dem Spieltisch und in der Spieleransicht zeigen'),
            onclick: () => {
              rulerShare = !rulerShare;
              try {
                localStorage.setItem(rulerShareKey, rulerShare ? '1' : '0');
              } catch {
                /* nicht verfügbar */
              }
              if (!rulerShare) clearSharedRuler();
              renderOptions();
            },
          },
          icon('eye'),
          tr(' Spielern zeigen'),
        ),
        h('span.small.muted', tr('Ziehen misst die Entfernung (5e-Diagonalregel).')),
      );
    }
  }

  function centerTvHere() {
    if (!mapId) return;
    putOnTable(sync, mapId, { ...snapTv(M(), renderer.view.cx, renderer.view.cy), fit: false });
  }

  // --- Inspektor für das ausgewählte Objekt ---------------------------------

  const inspector = h('div.map-inspector.hidden');

  /** Inspektor für mehrere ausgewählte Tokens: gemeinsam aufdecken, verdecken, in den Kampf, löschen. */
  function renderMultiInspector(map) {
    const tokens = [...picked].map((id) => map?.tokens?.[id]).filter(Boolean);
    if (!tokens.length) return select(null);
    inspector.classList.remove('hidden');
    const hidden = tokens.filter((t) => t.hidden).length;
    const setAll = (key, v) => sync.do(tokens.map((t) => ({ t: 'set', p: P('tokens', t.id, key), v })));
    const inCombat = new Set(Object.values(S().initiative?.entries || {}).map((e) => e.tokenId));
    const missing = tokens.filter((t) => !inCombat.has(t.id) && !t.dead);
    clear(inspector);
    inspector.append(
      h('div.row', h('strong.grow', icon('token'), tr(' {length} Tokens ausgewählt', { length: tokens.length })), h('button.small', { onclick: () => select(null), title: tr('Auswahl aufheben') }, icon('x'))),
      h('div.small.muted', { style: { margin: '4px 0 8px' } }, tokens.map((t) => t.name).join(', ')),
      h(
        'div.row',
        { style: { gap: '4px' } },
        h('button.small.primary', { disabled: !hidden, onclick: () => (setAll('hidden', false), renderInspector()) }, icon('eye'), tr(' Aufdecken{x}', { x: hidden ? ` (${hidden})` : '' })),
        h('button.small', { disabled: hidden === tokens.length, onclick: () => (setAll('hidden', true), renderInspector()) }, icon('eyeOff'), tr(' Verdecken')),
      ),
      h(
        'div.row',
        { style: { gap: '4px', marginTop: '6px' } },
        h('button.small', {
          disabled: !missing.length,
          onclick: () => {
            const tx = Combat.begin(S());
            for (const t of missing) Combat.addCombatant(tx, { name: t.name, kind: t.kind || 'enemy', tokenId: t.id, creatureId: t.creatureId || null, hp: t.hp, maxHp: t.maxHp });
            sync.do(tx.ops);
            toast(tr('{length} in den Kampf genommen', { length: missing.length }));
            renderInspector();
          },
        }, icon('swords'), missing.length ? tr(' In den Kampf ({length})', { length: missing.length }) : tr(' Alle im Kampf')),
        h('label.inline', h('input', { type: 'checkbox', checked: tokens.every((t) => t.showName), onchange: (ev) => setAll('showName', ev.target.checked) }), tr('Namen zeigen')),
        h('button.small.danger', {
          onclick: () => {
            if (!confirm(tr('{length} Tokens löschen?', { length: tokens.length }))) return;
            const ops = tokens.map((t) => ({ t: 'del', p: P('tokens', t.id) }));
            for (const l of Object.values(map.lights || {})) if (picked.has(l.tokenId)) ops.push({ t: 'del', p: P('lights', l.id) });
            sync.do(ops);
            select(null);
          },
        }, tr('Löschen')),
      ),
    );
  }

  /** Name auf einer gebauten Karte: für die Spieler zeigen oder verbergen. */
  function renderLabelInspector(map) {
    const label = map?.labels?.[selected.id];
    if (!label) {
      inspector.classList.add('hidden');
      return;
    }
    inspector.classList.remove('hidden');
    const all = Object.values(map.labels);
    const setAll = (shown) => sync.do(all.map((l) => ({ t: 'set', p: P('labels', l.id, 'shown'), v: shown })));
    clear(inspector);
    inspector.append(
      h('div.row', h('strong.grow', label.text), h('button.small', { onclick: () => select(null), title: tr('Schließen') }, icon('x'))),
      h('label.row', h('input', { type: 'checkbox', checked: label.shown !== false, onchange: (e) => sync.set(P('labels', label.id, 'shown'), e.target.checked) }), tr(' für die Spieler sichtbar')),
      h('div.row', h('button.small', { onclick: () => setAll(true) }, icon('eye'), tr(' Alle Namen zeigen')), h('button.small', { onclick: () => setAll(false) }, icon('eyeOff'), tr(' Alle verbergen'))),
      h('div.muted.small', tr('Namen stammen aus dem Kartenbauer. Verborgene Namen siehst nur du – so erscheint ein Ort erst, wenn die Gruppe ihn kennt.')),
    );
  }

  /** Tür öffnen oder schließen. Geht sie auf und ist der Nebel an, erscheinen die Räume beiderseits. */
  function setDoor(door, open) {
    const map = M();
    sync.set(P('doors', door.id, 'open'), open);
    // Eine Geheimtür ist nach dem ersten Öffnen entdeckt: geschlossen bleibt dann eine feine Fuge in der Wand sichtbar
    if (open && door.secret && !door.found) sync.set(P('doors', door.id, 'found'), true);
    if (!open || !map.fog?.enabled || map.fog.doorReveal === false) return;
    const fresh = (door.z || []).map((id) => id && map.zones?.find((z) => z.id === id)).filter((z) => z && !zoneShown(map, z));
    if (fresh.length) sync.push(P('fog', 'ops'), fresh.map((z) => zoneOp(z)));
  }

  /** Tür einer gebauten Karte: öffnen, schließen, abschließen. */
  function renderDoorInspector(map) {
    const door = map?.doors?.[selected.id];
    if (!door) {
      inspector.classList.add('hidden');
      return;
    }
    inspector.classList.remove('hidden');
    const set = (k, v) => (k === 'open' ? setDoor(door, v) : sync.set(P('doors', door.id, k), v));
    clear(inspector);
    inspector.append(
      h('div.row', h('strong.grow', door.secret ? tr('Geheimtür') : door.gate ? tr('Tor') : tr('Tür')), h('button.small', { onclick: () => select(null), title: tr('Schließen') }, icon('x'))),
      h('div.row', h('button.small.primary', { disabled: door.locked && !door.open, onclick: () => set('open', !door.open) }, door.open ? tr('Tür schließen') : tr('Tür öffnen')), h('label.row', h('input', { type: 'checkbox', checked: !!door.locked, onchange: (e) => set('locked', e.target.checked) }), tr(' verschlossen'))),
      door.secret ? h('label.row', h('input', { type: 'checkbox', checked: !!door.found, onchange: (e) => set('found', e.target.checked) }), tr(' entdeckt (Fuge in der Wand sichtbar)')) : null,
      h('div.muted.small', door.secret ? tr('Am Spieltisch sieht die Geheimtür aus wie Wand, bis sie offen ist. Danach gilt sie als entdeckt: geschlossen bleibt eine feine Fuge sichtbar.') : tr('Eine geschlossene Tür hält das Licht auf. Ein Klick auf die Tür öffnet und schließt sie.')),
    );
  }

  function renderInspector() {
    const map = M();
    if (selected?.type === 'tokens') return renderMultiInspector(map);
    if (selected?.type === 'door') return renderDoorInspector(map);
    if (selected?.type === 'label') return renderLabelInspector(map);
    const obj = selected && map?.[selected.type === 'token' ? 'tokens' : selected.type === 'light' ? 'lights' : 'aoes']?.[selected.id];
    if (!obj) {
      inspector.classList.add('hidden');
      return;
    }
    if (inspector.contains(document.activeElement)) return;
    inspector.classList.remove('hidden');
    const coll = selected.type === 'token' ? 'tokens' : selected.type === 'light' ? 'lights' : 'aoes';
    const OP = (...k) => P(coll, obj.id, ...k);
    const input = (key, attrs = {}, parse = (v) => v) => {
      const el = h('input', attrs);
      bindInput(el, () => M()?.[coll]?.[obj.id]?.[key], (v) => sync.set(OP(key), parse(v)), { debounceMs: attrs.type === 'checkbox' ? 0 : 200, event: attrs.type === 'checkbox' ? 'change' : 'input' });
      return el;
    };
    const numOrNull = (v) => (v === '' ? null : Number(v));
    // Entfernung: Anzeige und Eingabe in der Einheit der Kampagne, gespeichert in Fuß
    const distInput = (key, min = 0) => {
      const el = h('input', { type: 'number', min: distIn(min), step: unitStep() });
      bindInput(el, () => (M()?.[coll]?.[obj.id]?.[key] == null ? '' : distIn(M()[coll][obj.id][key])), (v) => v !== '' && sync.set(OP(key), Math.max(min, distFrom(v) || 0)), { debounceMs: 200, event: 'input' });
      return el;
    };
    const del = h('button.small.danger', {
      onclick: () => {
        const ops = [{ t: 'del', p: OP() }];
        if (selected.type === 'token') {
          for (const l of Object.values(map.lights || {})) if (l.tokenId === obj.id) ops.push({ t: 'del', p: P('lights', l.id) });
        }
        sync.do(ops);
        select(null);
      },
    }, tr('Löschen'));
    clear(inspector);
    if (selected.type === 'token') {
      const kind = h('select', h('option', { value: 'enemy' }, tr('Gegner')), h('option', { value: 'npc' }, tr('NSC')), h('option', { value: 'pc' }, tr('Spieler')));
      bindInput(kind, () => M()?.tokens?.[obj.id]?.kind, (v) => sync.set(OP('kind'), v), { debounceMs: 0, event: 'change' });
      const size = h('select', ...[0.5, 1, 2, 3, 4].map((v) => h('option', { value: v }, `${v} × ${v}`)));
      bindInput(size, () => M()?.tokens?.[obj.id]?.size, (v) => sync.set(OP('size'), Number(v)), { debounceMs: 0, event: 'change' });
      const lightOn = Object.values(map.lights || {}).find((l) => l.tokenId === obj.id);
      const creature = obj.creatureId ? S().creatures?.[obj.creatureId] : null;
      inspector.append(
        h('div.row', h('strong.grow', icon('token'), tr(' Token')), h('button.small', { onclick: () => select(null), title: tr('Schließen') }, icon('x'))),
        input('name', { placeholder: tr('Name') }),
        h('div.grid2', kind, size),
        h('div.grid2', h('div', h('label', tr('TP')), input('hp', { type: 'number' }, numOrNull)), h('div', h('label', tr('TP max')), input('maxHp', { type: 'number' }, numOrNull))),
        swatchRow(() => M()?.tokens?.[obj.id]?.color, (c) => sync.set(OP('color'), c)),
        h(
          'div.row',
          { style: { marginTop: '6px' } },
          h('label.inline', input('hidden', { type: 'checkbox' }), tr('verdeckt')),
          h('label.inline', input('showName', { type: 'checkbox' }), tr('Name zeigen')),
          h('label.inline', input('dead', { type: 'checkbox' }), tr('besiegt')),
        ),
        h(
          'div.row',
          { style: { marginTop: '8px' } },
          creature ? h('button.small', { onclick: () => hooks.onShowCreature?.(creature.id) }, icon('note'), tr(' Werte')) : null,
          h('button.small', {
            onclick: () => {
              if (Object.values(S().initiative?.entries || {}).some((e) => e.tokenId === obj.id)) return toast(tr('{name} ist schon im Kampf', { name: obj.name }));
              if (creature) return addCreatureToInitiative(sync, creature, { tokenId: obj.id, name: obj.name, hp: obj.hp, maxHp: obj.maxHp });
              const tx = Combat.begin(S());
              Combat.addCombatant(tx, { name: obj.name, kind: obj.kind || 'enemy', tokenId: obj.id, hp: obj.hp, maxHp: obj.maxHp });
              sync.do(tx.ops);
              toast(tx.notes.at(-1) || tr('{name} ist im Kampf', { name: obj.name }));
            },
          }, icon('swords'), tr(' Initiative')),
          h('button.small', {
            onclick: () => {
              if (lightOn) sync.del(P('lights', lightOn.id));
              else {
                const id = uid();
                sync.do(
                  { t: 'set', p: P('lights', id), v: { id, tokenId: obj.id, bright: 20, dim: 20, color: '#ffb347', flicker: true, on: true, seed: Math.random() * 10 } },
                  map.lighting?.enabled ? null : { t: 'set', p: P('lighting'), v: { ambient: 0.15, ...(map.lighting || {}), enabled: true } },
                );
              }
              renderInspector();
            },
          }, icon('flame'), lightOn ? tr(' Fackel löschen') : tr(' Fackel')),
          del,
        ),
      );
    } else if (selected.type === 'light') {
      inspector.append(
        h('div.row', h('strong.grow', icon('bulb'), tr(' Lichtquelle')), h('button.small', { onclick: () => select(null), title: tr('Schließen') }, icon('x'))),
        h('div.grid2', h('div', h('label', tr('Helles Licht ({unit})', { unit: unitLabel() })), distInput('bright')), h('div', h('label', tr('Dämmerlicht ({unit})', { unit: unitLabel() })), distInput('dim'))),
        h('label', tr('Farbe')),
        swatchRow(() => M()?.lights?.[obj.id]?.color, (c) => sync.set(OP('color'), c), ['#ffffff', '#ffb347', '#ffd54a', '#7ec8ff', '#b388ff', '#69f0ae', '#ff5252']),
        h('div.row', { style: { marginTop: '6px' } }, h('label.inline', input('on', { type: 'checkbox' }), tr('an')), h('label.inline', input('flicker', { type: 'checkbox' }), tr('flackern (dynamisch)'))),
        h('div.row.end', { style: { marginTop: '8px' } }, del),
      );
    } else {
      const shape = h('select', ...Object.entries(AOE_SHAPES).map(([v, l]) => h('option', { value: v }, l)));
      bindInput(shape, () => M()?.aoes?.[obj.id]?.shape, (v) => sync.set(OP('shape'), v), { debounceMs: 0, event: 'change' });
      inspector.append(
        h('div.row', h('strong.grow', icon('aoe'), tr(' Zauberradius')), h('button.small', { onclick: () => select(null), title: tr('Schließen') }, icon('x'))),
        input('label', { placeholder: tr('Bezeichnung (z.B. Feuerball)') }),
        h('div.grid2', shape, h('div.row', h('div.grow', distInput('size', 5)), unitLabel())),
        h('div.row', h('span.small.muted', tr('Drehen')), h('button.small', { onclick: () => sync.set(OP('angle'), (M().aoes[obj.id].angle || 0) - Math.PI / 4) }, icon('rotateLeft'), ' 45°'), h('button.small', { onclick: () => sync.set(OP('angle'), (M().aoes[obj.id].angle || 0) + Math.PI / 4) }, icon('rotateRight'), ' 45°')),
        h(
          'div.row.end',
          { style: { marginTop: '8px' } },
          // Markierten Bereich (z.B. Feuerwand) einmal mit Effekt aufleuchten lassen
          h('button.small', { onclick: () => M()?.aoes?.[obj.id] && castSpell(M().aoes[obj.id]), title: tr('Zaubereffekt auf allen Anzeigen abspielen') }, icon('aoe'), tr(' Effekt abspielen')),
          del,
        ),
      );
    }
  }

  // --- Öffentliche API ---------------------------------------------------------

  const el = h('div.map-area', canvas, ...renderer.layers, toolbar, optionsBar, inspector);

  function setMap(id) {
    if (mapId) views.set(mapId, { ...renderer.view });
    mapId = id || null;
    select(null);
    renderer.setMap(mapId);
    const v = views.get(mapId);
    renderer.autoFit = null;
    if (v) renderer.setView(v);
    else {
      // Einpassen, bis der Nutzer selbst zoomt/verschiebt (auch nach Layout-Änderungen)
      renderer.autoFit = 10;
      const tryFit = () => {
        if (renderer.autoFit != null && !renderer.fit(10) && renderer.mapId === mapId) setTimeout(tryFit, 150);
      };
      tryFit();
    }
    renderOptions();
  }

  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    // Nur solange die Karte zu sehen ist – sonst löschte Entf im Kartenbauer oder in der Vorbereitung ein hier gewähltes Token
    if (!renderer.canvas.getClientRects().length) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected?.type === 'tokens') {
      if (!confirm(tr('{size} Tokens löschen?', { size: picked.size }))) return;
      sync.do([...picked].map((id) => ({ t: 'del', p: P('tokens', id) })));
      select(null);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && selected.type !== 'door' && selected.type !== 'label') {
      const coll = selected.type === 'token' ? 'tokens' : selected.type === 'light' ? 'lights' : 'aoes';
      sync.del(P(coll, selected.id));
      select(null);
    } else if (e.key === 'Escape') {
      select(null);
      setTool('select');
    } else if (KEYS[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setTool(KEYS[e.key.toLowerCase()]);
    }
  });

  setTool('select');

  return {
    el,
    renderer,
    viewport,
    setMap,
    get mapId() {
      return mapId;
    },
    centerTvHere,
    /** Token-Werkzeug mit einer Vorlage (z.B. aus der Kreaturen-Kartei) aktivieren. */
    armToken(preset) {
      opt.token = { ...opt.token, color: preset.kind === 'npc' ? TOKEN_COLORS[4] : TOKEN_COLORS[0], ...preset };
      setTool('token', { keepPreset: true });
      toast(tr('Tippe auf die Karte, um „{name}“ zu platzieren', { name: preset.name }), 3000);
    },
    refresh(changed) {
      renderer.requestRender();
      if ((changed.has('maps') || changed.has('*')) && selected) renderInspector();
      if (changed.has('assets') && opt.tool === 'token') renderOptions();
    },
    drawStroke,
    feetToPx,
  };
}
