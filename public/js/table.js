// Digitaler Spieltisch: zeigt die aktive Kampfkarte maßstabsgetreu auf dem liegenden TV.
import { $, param, api } from './util.js';
import { Sync, touches } from './sync.js';
import { MapRenderer, gridOf, snapViewCenter } from './maprender.js';
import { cellDevicePxXY } from '/shared/calibration.js';
import { setupDisplayChrome, connectionBadge, loadingScreen, pauseScreen } from './display.js';
import { savedTableView } from './table-view.js';
import { followCampaignLanguage, tr } from './i18n.js';
import { useCampaignUnits } from './units-ui.js';

const canvas = $('#canvas');
const campaignId = param('c');
setupDisplayChrome();

/** CSS-Pixel pro Gerätepixel – bevorzugt aus der hinterlegten Auflösung abgeleitet. */
function cssPerDevicePx(t) {
  const sw = Math.max(screen.width, screen.height);
  const resMax = Math.max(t.resW, t.resH);
  return resMax > 0 && sw > 0 ? sw / resMax : 1 / (window.devicePixelRatio || 1);
}

/** Feldgröße (1 Zoll) in CSS-Pixeln entlang der Bildschirmachsen. */
function cellCssPxXY(settings) {
  const c = cellDevicePxXY(settings.table);
  const k = cssPerDevicePx(settings.table);
  return { x: c.x * k, y: c.y * k };
}

// Auf Kiosk-Geräten mit eigenen Monitordaten gelten diese statt der globalen Kalibrierung
const kioskId = param('kiosk');
let kioskCalibration = null;
if (kioskId) {
  try {
    const res = await fetch(`/api/kiosks/${encodeURIComponent(kioskId)}/display`, { cache: 'no-store' });
    if (res.ok) kioskCalibration = (await res.json()).calibration || null;
  } catch {
    /* Server nicht erreichbar – globale Kalibrierung */
  }
}
const tableSettings = (settings) => kioskCalibration || settings.table;

if (param('calibrate') || !campaignId) {
  document.getElementById('loading')?.remove();
  runCalibration();
} else {
  runTable();
}

async function runTable() {
  const loading = loadingScreen();
  const pause = pauseScreen();
  const sync = new Sync(campaignId, 'table');
  await sync.connect();
  // Anzeigen sprechen die Sprache der Kampagne (in der Spielleitung unter „Kampagne“ einstellbar)
  followCampaignLanguage(sync.state.display?.lang);
  useCampaignUnits(sync.state);
  sync.on(() => useCampaignUnits(sync.state));
  sync.on(() => followCampaignLanguage(sync.state.display?.lang));
  connectionBadge(sync);
  const renderer = new MapRenderer(canvas, { mode: 'table', campaignId, getState: () => sync.state, renderScale: Number(param('scale')) || 1 });
  if (param('maxfps')) renderer.maxFps = Number(param('maxfps'));
  // Ladebildschirm, solange die gewählte Karte noch lädt
  renderer.onLoading = (on) => loading.set(on, tr('Karte wird geladen …'));
  if (param('fps')) {
    // Messung für schwache Geräte: gezeichnete Bilder und Bildwiederholungen pro Sekunde in die Konsole
    const draw = renderer.render.bind(renderer);
    let renders = 0;
    let frames = 0;
    let t0 = performance.now();
    renderer.render = (now) => {
      const s = performance.now();
      draw(now);
      renders++;
      renderer.renderMs = (renderer.renderMs || 0) + performance.now() - s;
    };
    const tick = () => {
      frames++;
      const t = performance.now();
      if (t - t0 >= 5000) {
        const sec = (t - t0) / 1000;
        console.log(`[fps] ${(frames / sec).toFixed(1)} Bilder/s, ${(renders / sec).toFixed(1)} Zeichnungen/s, ${(renderer.renderMs / Math.max(1, renders)).toFixed(1)} ms je Zeichnung`);
        frames = renders = renderer.renderMs = 0;
        t0 = t;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /**
   * CSS-Pixel pro Rasterfeld (1 Zoll) entlang der Karten-X- und -Y-Achse.
   * Berücksichtigt die Drehung aus den Einstellungen und eine vom Betriebssystem
   * vorgenommene Drehung ins Hochformat (Fensterausrichtung ≠ physische Ausrichtung).
   */
  const cellAxes = () => {
    const tbl = tableSettings(sync.settings);
    const k = cssPerDevicePx(tbl);
    let { x: sx, y: sy } = cellDevicePxXY(tbl); // entlang der physischen Breite/Höhe
    const physLandscape = tbl.resW >= tbl.resH;
    const winLandscape = renderer.width >= renderer.height;
    if (physLandscape !== winLandscape) [sx, sy] = [sy, sx]; // Fenster vom OS gedreht
    const rotated = tbl.rotation === 90 || tbl.rotation === 270;
    return {
      rotated,
      pxX: (rotated ? sy : sx) * k, // Bildschirmpixel pro Feld entlang der Karten-X-Achse
      pxY: (rotated ? sx : sy) * k,
    };
  };

  // Tatsächlich sichtbaren Ausschnitt (in Feldern, Zoom 1) melden, damit der TV-Rahmen
  // in der DM-Ansicht exakt dem entspricht, was hier zu sehen ist.
  let lastReport = '';
  const reportView = () => {
    if (!sync.connected || renderer.width < 20 || renderer.height < 20) return;
    const { rotated, pxX, pxY } = cellAxes();
    const w = Math.round(((rotated ? renderer.height : renderer.width) / pxX) * 100) / 100;
    const h = Math.round(((rotated ? renderer.width : renderer.height) / pxY) * 100) / 100;
    const id = sync.socket.id;
    const key = `${id}:${w}x${h}`;
    const views = sync.state.display.table.views;
    const cur = views?.[id];
    if (key === lastReport && cur?.w === w && cur?.h === h) return;
    lastReport = key;
    const entry = { w, h, label: param('name') || '' };
    if (views) sync.set(['display', 'table', 'views', id], entry);
    else sync.set(['display', 'table', 'views'], { [id]: entry });
  };

  const update = () => {
    const st = sync.state;
    const t = st.display.table;
    const tbl = tableSettings(sync.settings);
    renderer.blackout = !!t.blackout;
    // Verdunkelt: Pausenbildschirm mit Sprüchen (abschaltbar – dann bleibt der Tisch einfach schwarz)
    pause.set(!!t.blackout && t.pauseScreen !== false, t.pauseText);
    renderer.setMap(t.mapId);
    const map = st.maps[t.mapId];
    renderer.view.rotation = tbl.rotation || 0;
    if (map) {
      if (t.fit) {
        if (!renderer.fit()) setTimeout(update, 200);
      } else {
        // Jedes Kartenfeld wird auf exakt 1 × 1 Zoll abgebildet – je Achse getrennt,
        // damit auch leicht rechteckige Bildfelder und nicht-quadratische Pixel stimmen.
        const g = gridOf(map);
        const { rotated, pxX, pxY } = cellAxes();
        const zoom = t.zoom || 1;
        const scale = (pxX / g.sizeX) * zoom;
        const aspect = (pxY / g.sizeY) * zoom / scale;
        // Sichtbare Ausdehnung in Kartenpixeln (bei 90°/270° sind die Bildschirmachsen vertauscht)
        const extW = (rotated ? renderer.height : renderer.width) / scale;
        const extH = (rotated ? renderer.width : renderer.height) / (scale * aspect);
        const c = snapViewCenter(map, t.cx, t.cy, extW, extH);
        renderer.setView({ cx: c.cx, cy: c.cy, scale, aspect });
      }
    }
    renderer.requestRender();
    reportView();
  };

  /** Maßstab, mit dem eine Karte bei dieser Ansicht (Mitte/Größe/ganze Karte) auf dem Tisch erscheint. */
  const scaleFor = (map, v) => {
    const { rotated, pxX, pxY } = cellAxes();
    if (v.fit) {
      const [vw, vh] = rotated ? [renderer.height, renderer.width] : [renderer.width, renderer.height];
      return { scale: Math.min(vw / (map.width || 1), vh / (map.height || 1)), aspect: 1 };
    }
    const g = gridOf(map);
    const zoom = v.zoom || 1;
    const scale = (pxX / g.sizeX) * zoom;
    return { scale, aspect: ((pxY / g.sizeY) * zoom) / scale };
  };

  // Alle Karten der aktiven Session vorladen, damit der Wechsel ohne Verzögerung klappt – jede in der Fassung
  // für ihre gemerkte Tischansicht (sonst passte die vorgeladene Größe nicht und müsste neu berechnet werden)
  const preload = () => {
    const st = sync.state;
    const t = st.display.table;
    const session = st.sessions[st.display.sessionId];
    const ids = new Set([...(session?.mapIds || []), t.mapId]);
    const maps = [...ids].map((id) => st.maps[id]).filter(Boolean);
    // Nur die passende verkleinerte Fassung vorladen; nicht mehr benötigte Karten gibt der Renderer frei
    renderer.preloadMaps(maps.map((map) => ({ map, view: scaleFor(map, map.id === t.mapId ? t : savedTableView(st, map.id)) })));
  };

  sync.on((changed) => {
    if (touches(changed, 'display', 'maps', 'settings', 'assets', 'initiative')) update();
    if (touches(changed, 'display', 'sessions')) preload();
  });
  sync.onFx((fx) => {
    if (fx.type === 'ping') renderer.addPing(fx);
    if (fx.type === 'ruler') renderer.showRuler(fx);
  });
  window.addEventListener('resize', update);
  update();
  preload();
  // Keine Karte gewählt oder Bildschirm abgedunkelt: Ladebildschirm trotzdem ausblenden
  requestAnimationFrame(() => {
    if (!renderer.loadingShown) loading.set(false);
  });
}

/** Testmuster zur Kontrolle und Feinjustierung der physischen Rastergröße. */
async function runCalibration() {
  let settings = await api('GET', '/api/settings');
  // eslint-disable-next-line no-undef
  const socket = io();
  socket.on('settings', (s) => {
    settings = s;
    draw();
  });
  const ctx = canvas.getContext('2d');
  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const cell = cellCssPxXY({ table: tableSettings(settings) });
    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#3a6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += cell.x) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, H);
    }
    for (let y = 0; y <= H; y += cell.y) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
    }
    ctx.stroke();
    // 10-Felder-Lineal
    const x0 = cell.x;
    const y0 = Math.round(H / 2);
    ctx.strokeStyle = '#ffd54a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + cell.x * 10, y0);
    for (let i = 0; i <= 10; i++) {
      ctx.moveTo(x0 + cell.x * i, y0 - (i % 5 === 0 ? 20 : 10));
      ctx.lineTo(x0 + cell.x * i, y0 + (i % 5 === 0 ? 20 : 10));
    }
    // senkrechtes Lineal zur Kontrolle der Y-Achse
    const vx = Math.round(W - cell.x * 2);
    const vy0 = cell.y;
    ctx.moveTo(vx, vy0);
    ctx.lineTo(vx, vy0 + cell.y * Math.min(10, Math.floor(H / cell.y) - 2));
    ctx.stroke();
    const expectedCm = (10 * 2.54).toFixed(1);
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`10 Felder = ${expectedCm} cm (Soll)`, x0, y0 - 32);
    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText(
      `Fenster ${W}×${H} CSS-px · DPR ${dpr} · Bildschirm ${screen.width}×${screen.height} · Feld ${cell.x.toFixed(2)} × ${cell.y.toFixed(2)} CSS-px (= 1″ × 1″)`,
      x0,
      y0 + 50,
    );
  };
  window.addEventListener('resize', draw);
  draw();
}
