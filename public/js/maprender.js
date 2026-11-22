// Gemeinsamer Canvas-Renderer für Karten (DM-Ansicht, Spieltisch, Spieler-Display).
// Alle Kartenobjekte liegen in Bildpixel-Koordinaten der Kartengrafik.
import { getImage, fileUrl, forgetImage } from './util.js';
import { tr } from './i18n.js';
import { dist } from './units-ui.js';
import { spellEffect } from './spellfx.js';
import { visibilityPolygon } from './visibility.js';
import { floorMap } from './floors.js';
import { wallsWithDoors, doorState, drawDoor, drawLabel } from './doors.js';

// Wie viele Karten der Spieltisch mit ihren vorbereiteten Kacheln behält (je etwa ein bis zwei Bildschirme groß)
const TILE_SETS = 3;

const FOG_MASK_MAX = 2048;
// Weiches Aufdecken des Nebels auf starken Geräten (Dauer des Ausblendens in ms)
const FOG_FADE_MS = 450;
// Breite des weichen Nebelrands: von voll durchsichtig zu ganz deckend über so viele Rasterfelder
const FOG_SOFT_CELLS = 1.5;

/**
 * Rasterdaten einer Karte. Sind Spalten und Zeilen hinterlegt, wird die Feldgröße aus den
 * Bildmaßen berechnet; Felder dürfen dann minimal rechteckig sein (sizeX/sizeY).
 */
export function gridOf(map) {
  const g = { size: 70, offsetX: 0, offsetY: 0, feet: 5, show: true, color: '#000000', opacity: 0.35, cols: 0, rows: 0, ...(map?.grid || {}) };
  if (g.cols > 0 && g.rows > 0 && map?.width > 0 && map?.height > 0) {
    g.sizeX = (map.width - g.offsetX) / g.cols;
    g.sizeY = (map.height - g.offsetY) / g.rows;
    g.size = (g.sizeX + g.sizeY) / 2;
  } else {
    g.sizeX = g.sizeY = g.size;
  }
  return g;
}

/**
 * Verschiebt einen Ausschnitt (Mitte cx/cy, Ausdehnung extW × extH in Kartenpixeln) so,
 * dass seine obere linke Ecke auf einer Rasterlinie liegt – am Bildschirmrand beginnen
 * dann immer volle Felder.
 */
export function snapViewCenter(map, cx, cy, extW, extH) {
  const g = gridOf(map);
  if (!(g.sizeX > 0) || !(g.sizeY > 0)) return { cx, cy };
  const left = Math.round((cx - extW / 2 - g.offsetX) / g.sizeX) * g.sizeX + g.offsetX;
  const top = Math.round((cy - extH / 2 - g.offsetY) / g.sizeY) * g.sizeY + g.offsetY;
  return { cx: left + extW / 2, cy: top + extH / 2 };
}

const DAY_ROOM = 0.4; // Grundhelligkeit eines Raums mit Fenster ins Freie bei „nur innen dunkel“

export const feetToPx = (map, feet) => {
  const g = gridOf(map);
  return (feet / (g.feet || 5)) * g.size;
};

/** Rastet einen Punkt auf Feldmitte (ungerade Größe) bzw. Kreuzung (gerade Größe) ein. */
export function snapPoint(map, x, y, size = 1) {
  const g = gridOf(map);
  const even = Math.round(size) % 2 === 0 && size >= 1;
  const ox = even ? 0 : g.sizeX / 2;
  const oy = even ? 0 : g.sizeY / 2;
  return {
    x: Math.round((x - g.offsetX - ox) / g.sizeX) * g.sizeX + g.offsetX + ox,
    y: Math.round((y - g.offsetY - oy) / g.sizeY) * g.sizeY + g.offsetY + oy,
  };
}

/** Prüft, ob ein Punkt in einem Wirkungsbereich liegt. */
export function inAoe(map, aoe, px, py) {
  const size = feetToPx(map, aoe.size || 20);
  const dx = px - aoe.x;
  const dy = py - aoe.y;
  if (aoe.shape === 'circle') return dx * dx + dy * dy <= size * size;
  const a = aoe.angle || 0;
  const u = dx * Math.cos(a) + dy * Math.sin(a);
  const v = -dx * Math.sin(a) + dy * Math.cos(a);
  if (aoe.shape === 'cone') return u >= 0 && u <= size && Math.abs(v) <= u / 2;
  if (aoe.shape === 'cube') return u >= 0 && u <= size && Math.abs(v) <= size / 2;
  if (aoe.shape === 'line') {
    const w = feetToPx(map, aoe.width || 5);
    return u >= 0 && u <= size && Math.abs(v) <= w / 2;
  }
  return false;
}

export function tokenPos(map, token) {
  return { x: token.x, y: token.y, r: (gridOf(map).size * (token.size || 1)) / 2 };
}

export function lightPos(map, light) {
  if (light.tokenId && map.tokens?.[light.tokenId]) {
    const t = map.tokens[light.tokenId];
    return { x: t.x, y: t.y };
  }
  return { x: light.x, y: light.y };
}

export class MapRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ mode: 'dm'|'table'|'player', campaignId: string, getState: () => object }} opts
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    // software: alle Flächen auf der CPU zeichnen (willReadFrequently). Auf schwachen Geräten (Pi Zero)
    // sammeln sich sonst Texturen im knappen Grafikspeicher an – bei Kartenwechseln bis er überläuft.
    this.software = !!opts.software;
    this.ctxOpts = this.software ? { willReadFrequently: true } : undefined;
    // lean: Anzeige mit schwachem Grafikchip (Kiosk auf einem Einplatinenrechner). Dort kostet jede Fläche, die der
    // Browser über die Karte legt, in jedem Bild Zeit – gemessen rund 13 ms je bildschirmfüllender Ebene in 1080p,
    // sobald sich irgendetwas bewegt. Deshalb dort:
    //  - das Kartenbild (mit Raster, Türen, Namen) auf einer CPU-Zeichenfläche: die legt der Browser in den
    //    Seitenhintergrund statt auf eine eigene Ebene, und sie wird nur neu gezeichnet, wenn sich daran etwas ändert;
    //  - Figuren, Dunkelheit und Nebel zusammen auf einer einzigen Ebene darüber, die ohne Inhalt ganz verschwindet;
    //  - Belebung in schlanker Fassung und Fackeln ohne flackernden Schein.
    this.lean = !!opts.lean && opts.mode !== 'dm';
    this.baseOpts = this.lean ? { willReadFrequently: true } : this.ctxOpts;
    this.ctx = canvas.getContext('2d', this.baseOpts);
    this.mode = opts.mode;
    this.campaignId = opts.campaignId;
    this.getState = opts.getState;
    // aspect: zusätzlicher Faktor für die Y-Achse (Kartenraum), damit Felder auf dem Tisch exakt quadratisch werden
    this.view = { cx: 0, cy: 0, scale: 1, rotation: 0, aspect: 1 };
    this.mapId = null;
    this.overlay = null; // Zusatzzeichnung (DM-Werkzeuge) im Kartenraum
    this.screenOverlay = null; // Zusatzzeichnung im Bildschirmraum
    this.pings = [];
    this.fogCache = null;
    // Zwischengespeicherte Ebenen: Animationen (Ping, Flackern) zeichnen nur noch Licht und Pings neu,
    // Karte, Tokens und Nebel kommen aus dem Cache. „dirty“ = Inhalt hat sich geändert.
    this.baseCanvas = document.createElement('canvas'); // Karte, Raster, Zeichnungen unten, Flächen, Tokens
    this.topCanvas = document.createElement('canvas'); // Licht-Markierungen (DM), Zeichnungen oben, Nebel
    this.lightCanvas = document.createElement('canvas'); // Dunkelheit mit Lichtkegeln (halbe Auflösung)
    this.glowCanvas = document.createElement('canvas'); // farbiger Lichtschein (halbe Auflösung)
    this.dirty = true;
    this.lightDirty = true;
    this.tileSets = new Map(); // vorbereitete Kartenkacheln je Kartenfassung (Tisch/Spieler-Display)
    this.mapUrls = new Set(); // von diesem Renderer geladene Kartenbilder (zum Freigeben)
    this.keepUrls = new Set(); // vorgeladene Karten der Sitzung
    // Leistungsprofil der Anzeige: „low“ (Pi Zero 2 W & Co.: 30 Bilder/s, Nebel gedrosselt und mit gröberer Maske)
    // oder „high“ (z.B. Orange Pi Zero 2W, PC: 60 Bilder/s, Nebel sofort und weich ausgeblendet)
    this.highPerf = opts.mode === 'dm' || opts.performance === 'high';
    // Animationen auf dem Tisch/Spieler-Display begrenzen (schwache Geräte wie Pi Zero: 30 Bilder/s)
    this.maxFps = opts.mode === 'dm' ? 0 : this.highPerf ? 60 : 30;
    this.lastFrame = 0;
    // DM-Ansicht: „tableLook“ zeigt Licht, Nebel und Tokens exakt wie auf dem Spieltisch (Vorschau)
    this.tableLook = false;
    this.selectedId = null;
    this.raf = 0;
    // renderScale < 1: intern mit weniger Pixeln zeichnen (schwache Geräte), Anzeige wird hochskaliert
    this.renderScale = opts.renderScale || 1;
    this.dpr = (window.devicePixelRatio || 1) * this.renderScale;
    this.blackout = false;
    // Tisch/Spieler-Display: Ping und Fackel-Flackern als HTML-Elemente mit CSS-Animation über der Karte.
    // Die Animation rechnet dann der Compositor im Grafikchip – die Karte muss dafür nicht in jedem Bild
    // neu gezeichnet werden (auf dem Pi Zero in 1080p der Unterschied zwischen ~17 und 30 Bildern/s).
    // (Auch in der DM-Ansicht für das Flackern; Pings zeichnet dort weiter die Canvas, weil der DM
    // die Karte während eines Pings verschieben kann.)
    // Ebenen über der Karten-Canvas (von unten nach oben): flackernder Schein (HTML) → Nebel und Zeichnungen
    // oben (eigene Canvas, damit der Nebel auch den Schein verdeckt) → Pings (HTML, über dem Nebel)
    this.fxLayer = opts.domEffects !== false ? createFxLayer() : null;
    this.topEl = this.fxLayer ? Object.assign(document.createElement('canvas'), { className: 'mr-top' }) : null;
    this.pingLayer = this.fxLayer ? createFxLayer() : null;
    // Belebte Karten (Kartenbauer): wiegende Bäume, Wasser, Vögel als eigene Ebene direkt über dem Kartenbild. Damit
    // Spielfiguren und Dunkelheit nicht darunter verschwinden, liegen sie dann auf einer eigenen Canvas darüber.
    // Beides entsteht erst, wenn eine belebte Karte auf einer starken Anzeige gezeigt wird – schwache Geräte laden
    // weder das Modul noch bekommen sie eine zusätzliche Ebene.
    this.anim = null;
    this.midEl = null;
    this.animWanted = !!this.fxLayer && opts.mode !== 'dm';
    this.attachFx();
    this.glows = new Map();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  /** Ebene zeigen oder ganz ausblenden (ausgeblendet belastet sie den Grafikchip nicht). */
  showLayer(el, on) {
    if (el && (el.style.display === 'none') === on) el.style.display = on ? '' : 'none';
  }

  /** Darstellung für den DM (halbe Dunkelheit, durchsichtiger Nebel, verdeckte Tokens sichtbar …)? */
  get dmLook() {
    return this.mode === 'dm' && !this.tableLook;
  }

  /** Deckkraft des Nebels; eigene Werte (z.B. Kartenvorschau) gelten nur in der DM-Darstellung. */
  get fogAlpha() {
    if (!this.dmLook) return 1;
    return this.customFogAlpha ?? 0.55;
  }

  set fogAlpha(v) {
    this.customFogAlpha = v;
  }

  /** Die Karte, wie sie gerade gezeigt wird (im Obergeschoss mit dessen Bild, Wänden, Türen, Nebel …). */
  get map() {
    return floorMap(this.getState()?.maps?.[this.mapId] || null);
  }

  get image() {
    const map = this.map;
    if (!map) return null;
    const asset = this.getState().assets[map.assetId];
    const url = fileUrl(this.campaignId, asset);
    if (this.mode === 'dm' || !url || !map.width || !map.height) return getImage(url, () => this.requestRender());
    // Tisch/Spieler-Display: nur so viele Pixel laden, wie der Maßstab braucht (Server liefert
    // verkleinerte Fassungen). Bis die Ansicht feststeht, nichts laden – sonst käme erst das Original.
    if (!this.viewSet) return null;
    const want = this.variantUrl(map, url);
    this.mapUrls.add(want);
    const img = getImage(want, () => this.requestRender());
    if (img) {
      if (this.shownImage?.img !== img) {
        this.shownImage = { url, img, want };
        this.releaseImages(want); // vorherige Karte/Fassung freigeben – sonst sammeln sich je 12–48 MB an
      }
      return img;
    }
    // Neue Fassung lädt noch: bisheriges Bild derselben Karte weiter zeigen (kein schwarzes Aufblitzen)
    return this.shownImage?.url === url ? this.shownImage.img : null;
  }

  /** Adresse der für einen Maßstab (Standard: aktuelle Ansicht) passenden (verkleinerten) Fassung eines Kartenbilds. */
  variantUrl(map, url, view = this.view) {
    // Genau die nötige Breite (auf 128 aufgerundet): die Kacheln sind dann reine Ausschnitte ohne Umrechnen
    const need = map.width * Math.min(1, view.scale * Math.max(1, view.aspect || 1) * this.dpr);
    const w = Math.max(256, Math.ceil(need / 128) * 128);
    return w < map.width * 0.95 && w <= 4096 ? `${url}?w=${w}` : url;
  }

  /**
   * Karten vorladen (nur die passende Fassung, nur herunterladen – entpackt wird erst beim Anzeigen).
   * Einträge: Karte oder { map, view } – view ist der Maßstab, mit dem die Karte gezeigt werden wird (z.B. ihre
   * gemerkte Tischansicht); ohne den der aktuellen Karte. Alles andere wird freigegeben.
   */
  preloadMaps(maps) {
    if (this.mode === 'dm') return;
    this.keepUrls = new Set();
    const assets = this.getState().assets || {};
    for (const entry of maps) {
      const { map, view } = entry.map ? entry : { map: entry };
      const url = fileUrl(this.campaignId, assets[map.assetId]);
      if (!url) continue;
      const want = map.width && map.height ? this.variantUrl(map, url, view || this.view) : url;
      this.keepUrls.add(want);
      this.mapUrls.add(want);
      getImage(want);
    }
    if (this.shownImage) this.releaseImages(null);
  }

  /** Kartenbilder freigeben, die weder angezeigt noch vorgeladen werden sollen. */
  releaseImages(current) {
    for (const u of this.mapUrls) {
      if (u === current || u === this.shownImage?.want || this.keepUrls.has(u)) continue;
      forgetImage(u);
      this.mapUrls.delete(u);
    }
  }

  /** Größe der Karte in Kartenkoordinaten (Originalpixel) – das geladene Bild kann kleiner sein. */
  mapSize(map, img) {
    if (this.mode !== 'dm' && map?.width && map?.height) return { W: map.width, H: map.height };
    return { W: img?.naturalWidth || map?.width, H: img?.naturalHeight || map?.height };
  }

  resize() {
    this.dpr = (window.devicePixelRatio || 1) * this.renderScale;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.fxLayer) {
      this.attachFx();
      for (const el of this.layers) {
        const st = el.style;
        st.left = `${this.canvas.offsetLeft}px`;
        st.top = `${this.canvas.offsetTop}px`;
        st.width = `${this.canvas.clientWidth}px`;
        st.height = `${this.canvas.clientHeight}px`;
      }
      for (const cv of [this.topEl, this.midEl]) {
        if (cv && (cv.width !== w || cv.height !== h)) {
          cv.width = w;
          cv.height = h;
        }
      }
    }
    // Automatisch eingepasste Ansichten bei Größenänderung neu einpassen
    if (this.autoFit != null) this.fit(this.autoFit);
    this.requestRender();
  }

  get width() {
    return this.canvas.clientWidth;
  }
  get height() {
    return this.canvas.clientHeight;
  }

  setMap(mapId) {
    if (this.mapId !== mapId) {
      this.mapId = mapId; // Nebelmaske: drawFog merkt sich die der vorherigen Karte
    }
    this.requestRender();
  }

  setView(v) {
    Object.assign(this.view, v);
    this.viewSet = true;
    this.requestRender();
  }

  /** Passt die Karte vollständig in den sichtbaren Bereich ein. */
  fit(padding = 0) {
    const img = this.image;
    const map = this.map;
    const { W: w, H: h } = this.mapSize(map, img);
    if (!w || !h) return false;
    const rot = this.view.rotation === 90 || this.view.rotation === 270;
    const [vw, vh] = rot ? [this.height, this.width] : [this.width, this.height];
    // Solange die Fläche noch kein Layout hat, nicht einpassen (sonst negative Skalierung)
    if (vw - padding * 2 < 20 || vh - padding * 2 < 20) return false;
    const scale = Math.min((vw - padding * 2) / w, (vh - padding * 2) / h);
    this.setView({ cx: w / 2, cy: h / 2, scale, aspect: 1 });
    return true;
  }

  screenToMap(sx, sy) {
    const { cx, cy, scale, rotation, aspect = 1 } = this.view;
    const a = (-(rotation || 0) * Math.PI) / 180;
    const dx = sx - this.width / 2;
    const dy = sy - this.height / 2;
    return {
      x: cx + (dx * Math.cos(a) - dy * Math.sin(a)) / scale,
      y: cy + (dx * Math.sin(a) + dy * Math.cos(a)) / (scale * aspect),
    };
  }

  mapToScreen(mx, my) {
    const { cx, cy, scale, rotation, aspect = 1 } = this.view;
    const a = ((rotation || 0) * Math.PI) / 180;
    const dx = (mx - cx) * scale;
    const dy = (my - cy) * scale * aspect;
    return {
      x: this.width / 2 + dx * Math.cos(a) - dy * Math.sin(a),
      y: this.height / 2 + dx * Math.sin(a) + dy * Math.cos(a),
    };
  }

  /**
   * Zaubereffekt abspielen (fx: { mapId, shape, x, y, angle (Bogenmaß, Karte), size/width in Fuß, color, style }).
   * Kurze CSS-Animation über der Karte – auf allen Anzeigen inkl. DM-Ansicht.
   */
  addSpell(fx) {
    const map = this.map;
    if (!this.pingLayer || !map || fx.mapId !== map.id || this.blackout) return;
    this.attachFx();
    const o = this.mapToScreen(fx.x, fx.y);
    const scale = this.view.scale;
    // Richtung auf dem Bildschirm: Kartenwinkel plus Drehung der Anzeige (Seitenverhältnis der Felder ≈ 1)
    const angle = ((fx.angle || 0) * 180) / Math.PI + (this.view.rotation || 0);
    spellEffect(this.pingLayer, {
      x: o.x,
      y: o.y,
      angle,
      len: feetToPx(map, fx.size || 20) * scale,
      width: feetToPx(map, fx.width || 5) * scale,
      shape: fx.shape,
      style: fx.style,
      color: fx.color,
    });
  }

  addPing(p) {
    if (this.fxLayer && this.mode !== 'dm') {
      this.domPing(p);
      return;
    }
    this.pings.push({ ...p, t0: performance.now() });
    this.requestRender();
  }

  /** Vom DM geteiltes Lineal (Tisch/Spieler-Display): Linie mit Entfernung; nach dem Loslassen blendet sie aus. */
  showRuler(r) {
    clearTimeout(this.rulerTimer);
    this.ruler = r.clear || (r.x0 === r.x1 && r.y0 === r.y1) ? null : r;
    if (this.ruler?.done) {
      this.rulerTimer = setTimeout(() => {
        this.ruler = null;
        this.syncRuler();
      }, 4000);
    }
    this.syncRuler();
  }

  /** Lineal-Element an Karte und Ansicht anpassen (auch nach Verschieben/Zoomen). */
  syncRuler() {
    const r = this.ruler;
    const map = this.map;
    if (!r || !map || r.mapId !== map.id || this.blackout || !this.pingLayer) {
      this.rulerEl?.remove();
      this.rulerEl = null;
      return;
    }
    if (!this.rulerEl) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'mr-ruler');
      svg.innerHTML = '<line class="o"/><line/><circle/><circle/><text/>'; // i18n-ignore
      this.rulerEl = svg;
    }
    const svg = this.rulerEl;
    if (svg.parentNode !== this.pingLayer) this.pingLayer.appendChild(svg);
    svg.classList.toggle('done', !!r.done);
    const a = this.mapToScreen(r.x0, r.y0);
    const b = this.mapToScreen(r.x1, r.y1);
    const cell = gridOf(map).size * this.view.scale; // Feldgröße in CSS-Pixeln
    const lw = Math.max(3, cell / 12);
    const [outline, line, ca, cb, text] = svg.children;
    for (const [el, w] of [[outline, lw + 4], [line, lw]]) {
      el.setAttribute('x1', a.x);
      el.setAttribute('y1', a.y);
      el.setAttribute('x2', b.x);
      el.setAttribute('y2', b.y);
      el.setAttribute('stroke-width', w);
    }
    for (const [el, p] of [[ca, a], [cb, b]]) {
      el.setAttribute('cx', p.x);
      el.setAttribute('cy', p.y);
      el.setAttribute('r', lw * 1.6);
    }
    // Beschriftung neben dem Endpunkt, gedreht wie die Karte (auf dem Tisch von der richtigen Seite lesbar)
    const fs = Math.max(18, cell * 0.5);
    text.setAttribute('x', b.x + fs * 0.6);
    text.setAttribute('y', b.y - fs * 0.6);
    text.setAttribute('font-size', fs);
    text.setAttribute('transform', `rotate(${this.view.rotation || 0} ${b.x} ${b.y})`);
    text.textContent = dist(r.ft);
  }

  /** Zusätzliche Ebenen über der Karte (zum Einhängen neben die Canvas). */
  get layers() {
    return [this.anim?.el, this.midEl, this.fxLayer, this.topEl, this.pingLayer].filter(Boolean);
  }

  /** Ebenen in richtiger Reihenfolge direkt hinter die Canvas hängen (auch wenn sie erst später ins Dokument kommt). */
  attachFx() {
    if (!this.fxLayer || !this.canvas.parentElement) return;
    let ref = this.canvas;
    for (const el of this.layers) {
      if (ref.nextElementSibling !== el) ref.after(el);
      ref = el;
    }
  }

  /** Ping als drei sich ausbreitende Ringe (CSS-Animation, kein Neuzeichnen der Karte). */
  domPing(p) {
    const map = this.map;
    if (!map || p.mapId !== map.id || this.blackout) return;
    const g = gridOf(map);
    const pos = this.mapToScreen(p.x, p.y);
    const R = g.size * 1.8 * this.view.scale; // größter Ringradius in CSS-Pixeln
    const lw = Math.max(3, g.size / 12) * this.view.scale;
    const el = document.createElement('div');
    el.className = 'mr-ping';
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('i');
      Object.assign(ring.style, {
        left: `${-R}px`,
        top: `${-R}px`,
        width: `${2 * R}px`,
        height: `${2 * R}px`,
        borderWidth: `${lw * 2}px`,
        borderColor: p.color || '#ffd54a',
        animationDelay: `${-i * 0.2444}s`,
      });
      el.appendChild(ring);
    }
    this.pingLayer.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  /**
   * Sichtfläche eines Lichts zwischen den Wänden der Karte (Kartenkoordinaten) – oder null ohne Wände in Reichweite.
   * Wird je Licht gemerkt und nur neu berechnet, wenn sich Lage, Reichweite oder die Wände ändern.
   */
  lightArea(map, li, x, y, total) {
    const walls = map.walls;
    if (!walls?.length) return null;
    this.areas ||= new Map();
    const key = `${map.id}|${x}|${y}|${total}|${walls.length}|${map.assetId}|${doorState(map)}`;
    const hit = this.areas.get(li.id);
    if (hit?.key === key) return hit.poly;
    const poly = visibilityPolygon(x, y, total, wallsWithDoors(map));
    this.areas.set(li.id, { key, poly });
    if (this.areas.size > 800) this.areas.delete(this.areas.keys().next().value);
    return poly;
  }

  /** Beschneidet die Zeichenfläche auf die Sichtfläche eines Lichts (ohne Wände: keine Einschränkung). */
  clipToLight(ctx, map, li, x, y, total) {
    const poly = this.lightArea(map, li, x, y, total);
    if (!poly) return;
    ctx.beginPath();
    poly.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.clip();
  }

  /** Flackernder Lichtschein je Fackel als HTML-Element; Position bei jedem Neuzeichnen abgleichen. */
  syncGlows(map) {
    if (!this.fxLayer) return;
    this.attachFx();
    const seen = new Set();
    // schlanke Fassung: kein flackernder Schein – je Fackel wären das zwei große halbdurchsichtige Flächen
    const lights = map && !this.blackout && !this.lean && map.lighting?.enabled ? Object.values(map.lights || {}) : [];
    for (const li of lights) {
      if (li.on === false || !li.flicker) continue;
      seen.add(li.id);
      let fx = this.glows.get(li.id);
      if (!fx) {
        // Zwei getrennte Ebenen: Schatten (Helligkeit schwankt) und warmer Schein (Größe/Stärke schwankt)
        const shade = Object.assign(document.createElement('div'), { className: 'mr-shade' });
        const glow = Object.assign(document.createElement('div'), { className: 'mr-glow' });
        // Unterschiedliche Phase je Licht, damit mehrere Fackeln nicht im Gleichtakt flackern
        glow.style.animationDelay = `${-((li.seed || 1) * 1.37) % 3.8}s`;
        shade.style.animationDelay = `${-((li.seed || 1) * 0.91) % 2.9}s`;
        this.fxLayer.append(shade, glow);
        fx = { shade, glow };
        this.glows.set(li.id, fx);
      }
      const { x, y } = lightPos(map, li);
      const pos = this.mapToScreen(x, y);
      const r = (feetToPx(map, li.bright ?? 20) + feetToPx(map, li.dim ?? 20)) * this.view.scale;
      const white = !li.color || li.color === '#ffffff';
      // An Wänden endet auch der flackernde Schein: Sichtfläche als Ausschnitt des Elements
      const area = this.lightArea(map, li, x, y, feetToPx(map, (li.bright ?? 20) + (li.dim ?? 20)));
      const clipPath = area
        ? `polygon(${area.map(([px, py]) => {
            const q = this.mapToScreen(px, py);
            return `${(q.x - pos.x + r).toFixed(1)}px ${(q.y - pos.y + r).toFixed(1)}px`;
          }).join(',')})`
        : 'none';
      const box = { left: `${pos.x - r}px`, top: `${pos.y - r}px`, width: `${2 * r}px`, height: `${2 * r}px`, clipPath };
      Object.assign(fx.shade.style, box, { backgroundImage: `url(${glowSprite('#000000', 0.38)})` });
      Object.assign(fx.glow.style, box, { backgroundImage: `url(${glowSprite(white ? '#ffd9a8' : li.color, white ? 0.13 : 0.2)})` });
    }
    for (const [id, fx] of this.glows) {
      if (!seen.has(id)) {
        fx.shade.remove();
        fx.glow.remove();
        this.glows.delete(id);
      }
    }
  }

  /** Neu zeichnen. dirty=false: nur Animation fortsetzen (Ebenen-Cache bleibt gültig). */
  requestRender(dirty = true) {
    if (dirty) this.dirty = true;
    if (this.raf) return;
    const frame = (t) => {
      // Reine Animationsbilder drosseln; echte Änderungen sofort zeichnen
      if (!this.dirty && this.maxFps && t - this.lastFrame < 1000 / this.maxFps - 2) {
        this.raf = requestAnimationFrame(frame);
        return;
      }
      this.raf = 0;
      this.lastFrame = t;
      this.render(t);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Leistungsprofil umstellen (Tisch/Spieler-Display): „high“ = flüssig, sonst sparsam. */
  setPerformance(p) {
    if (this.mode === 'dm') return;
    const high = p === 'high';
    if (high === this.highPerf) return;
    this.highPerf = high;
    this.maxFps = high ? 60 : 30;
    this.requestRender();
  }

  /** Obere Ebene (eigene Canvas) neu zeichnen – bei neuen Pinselstrichen nur deren Bildschirmbereich. */
  renderTopOnly(map, img) {
    const { W, H } = this.mapSize(map, img);
    const tctx = this.topEl.getContext('2d', this.ctxOpts);
    const rect = this.fogStrokeRect(map);
    tctx.save();
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    if (rect) {
      tctx.beginPath();
      tctx.rect(rect[0], rect[1], rect[2], rect[3]);
      tctx.clip();
      tctx.clearRect(rect[0], rect[1], rect[2], rect[3]);
    } else {
      tctx.clearRect(0, 0, this.topEl.width, this.topEl.height);
    }
    this.applyTransform(tctx);
    if (this.lean) {
      this.drawTokens(tctx, map);
      if (map.lighting?.enabled) this.drawLighting(tctx, map, performance.now());
    }
    this.drawDrawings(tctx, map, 'above');
    if (map.fog?.enabled) this.drawFog(tctx, map, W, H);
    tctx.restore();
  }

  /**
   * Bildschirmbereich (Gerätepixel) der Pinselstriche, die seit dem letzten Bild zum Aufdecken dazugekommen sind –
   * null, wenn sich mehr geändert hat (dann ganze Ebene).
   */
  fogStrokeRect(map) {
    const c = this.fogCache;
    const ops = map.fog?.ops || [];
    if (!this.highPerf || !c || c.mapId !== map.id || c.ops !== ops || !(c.texApplied >= 0) || c.texApplied >= ops.length || c.fadeAt) return null;
    const g = gridOf(map);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = c.texApplied; i < ops.length; i++) {
      const o = ops[i];
      if (o.m === 'hide' || o.s !== 'stroke') return null;
      const pad = o.r + (g.size * FOG_SOFT_CELLS) / 2 + 2;
      for (let j = 0; j < o.pts.length; j += 2) {
        x0 = Math.min(x0, o.pts[j] - pad);
        y0 = Math.min(y0, o.pts[j + 1] - pad);
        x1 = Math.max(x1, o.pts[j] + pad);
        y1 = Math.max(y1, o.pts[j + 1] + pad);
      }
    }
    if (!isFinite(x0)) return null;
    // Ecken in Bildschirmkoordinaten (gleiche Abbildung wie applyTransform)
    const { cx, cy, scale, rotation, aspect = 1 } = this.view;
    const a = ((rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    let sx0 = Infinity;
    let sy0 = Infinity;
    let sx1 = -Infinity;
    let sy1 = -Infinity;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const u = (x - cx) * scale;
      const v = (y - cy) * scale * aspect;
      const px = this.dpr * (this.width / 2 + u * cos - v * sin);
      const py = this.dpr * (this.height / 2 + u * sin + v * cos);
      sx0 = Math.min(sx0, px);
      sy0 = Math.min(sy0, py);
      sx1 = Math.max(sx1, px);
      sy1 = Math.max(sy1, py);
    }
    const l = Math.max(0, Math.floor(sx0) - 2);
    const t = Math.max(0, Math.floor(sy0) - 2);
    return [l, t, Math.min(this.topEl.width, Math.ceil(sx1) + 2) - l, Math.min(this.topEl.height, Math.ceil(sy1) + 2) - t];
  }

  /** Nur die obere Ebene (Nebel, Zeichnungen oben) neu zeichnen – z.B. wenn die Spielleitung Nebel aufdeckt. */
  requestTopRender() {
    this.topDirty = true;
    if (this.raf) return;
    this.raf = requestAnimationFrame((t) => {
      this.raf = 0;
      this.lastFrame = t;
      this.render(t);
    });
  }

  applyTransform(ctx, k = 1) {
    const { cx, cy, scale, rotation, aspect = 1 } = this.view;
    ctx.setTransform(this.dpr * k, 0, 0, this.dpr * k, 0, 0);
    ctx.translate(this.width / 2, this.height / 2);
    ctx.rotate(((rotation || 0) * Math.PI) / 180);
    ctx.scale(scale, scale * aspect);
    ctx.translate(-cx, -cy);
  }

  /** Passt eine Hilfsfläche an die Größe der Zeichenfläche an (Faktor k, z.B. 0.5 = halbe Auflösung). */
  sizeLayer(c, k = 1, opts = this.ctxOpts) {
    const w = Math.max(1, Math.round(this.canvas.width * k));
    const h = Math.max(1, Math.round(this.canvas.height * k));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    return c.getContext('2d', opts);
  }

  /** Woran man erkennt, ob das Kartenbild der schlanken Fassung neu gezeichnet werden muss (alles, was darauf liegt). */
  baseKeyOf(map, img) {
    const v = this.view;
    const below = Object.values(map.drawings || {}).filter((d) => (d.layer || 'above') === 'below' && d.vis !== 'dm').map((d) => `${d.id}:${JSON.stringify(d).length}`).join();
    return [img.src, decodedImages.has(img) ? 1 : 0, this.canvas.width, this.canvas.height, v.cx, v.cy, v.scale, v.rotation, v.aspect, JSON.stringify(map.doors || 0), JSON.stringify(gridOf(map)), JSON.stringify(map.labels || 0), JSON.stringify(map.aoes || 0), below].join('|');
  }

  /**
   * Kartenbild zeichnen. Tisch/Spieler-Display: in Kacheln (je ~384 Bildschirmpixel), die einmalig auf
   * der CPU in Anzeigeauflösung vorbereitet und zwischengespeichert werden – nur sichtbare Kacheln plus
   * ein Reservering. So kommt nie die ganze Karte in den Grafikspeicher (Pi Zero: Karte blieb schwarz),
   * und beim Verschieben müssen höchstens die neu sichtbaren Randkacheln vorbereitet werden.
   */
  drawMapImage(ctx, img, W, H) {
    if (this.mode === 'dm') {
      ctx.drawImage(img, 0, 0, W, H);
      return;
    }
    // Neue Kacheln erst, wenn das Bild fertig dekodiert ist – sonst entstehen leere Kacheln, die im Cache
    // bleiben (Karte erschien erst nach dem Verschieben). Schon vorbereitete Kacheln gehen sofort.
    const ready = decodedImages.has(img);
    if (!ready && !img.decodePending) {
      img.decodePending = true;
      (img.decode ? img.decode() : Promise.resolve())
        .catch(() => {})
        .then(() => {
          decodedImages.add(img);
          this.requestRender();
        });
    }
    const f = img.naturalWidth / W; // Bildpixel je Kartenpixel (< 1 bei verkleinerter Fassung vom Server)
    const k = Math.min(f, this.view.scale * Math.max(1, this.view.aspect || 1) * this.dpr);
    const T = Math.max(64, Math.round(384 / k)); // Kachelgröße in Kartenpixeln
    // Vorbereitete Kacheln je Kartenfassung (Adresse) merken: wechselt der Tisch zu einer Karte zurück, sind sie
    // noch da. Verworfen werden sie erst, wenn sie neu berechnet werden müssen (anderer Maßstab) oder wenn mehr
    // als TILE_SETS Karten zwischengespeichert sind (die am längsten nicht gezeigte zuerst).
    const sets = this.tileSets;
    const srcKey = img.src;
    let t = sets.get(srcKey);
    if (t && t.k !== k) {
      for (const tile of t.cache.values()) freeCanvas(tile.canvas);
      t = null;
    }
    if (!t) t = { k, T, cache: new Map() };
    sets.delete(srcKey);
    sets.set(srcKey, t); // ans Ende = zuletzt gezeigt
    while (sets.size > TILE_SETS) {
      const [oldKey, old] = sets.entries().next().value;
      for (const tile of old.cache.values()) freeCanvas(tile.canvas);
      sets.delete(oldKey);
    }
    // Sichtbarer Kartenbereich (Ecken der Anzeige, auch bei Drehung) plus eine Kachel Reserve
    const pts = [[0, 0], [this.width, 0], [0, this.height], [this.width, this.height]].map(([x, y]) => this.screenToMap(x, y));
    const tx0 = Math.max(0, Math.floor(Math.min(...pts.map((q) => q.x)) / T) - 1);
    const ty0 = Math.max(0, Math.floor(Math.min(...pts.map((q) => q.y)) / T) - 1);
    const tx1 = Math.min(Math.ceil(W / T) - 1, Math.floor(Math.max(...pts.map((q) => q.x)) / T) + 1);
    const ty1 = Math.min(Math.ceil(H / T) - 1, Math.floor(Math.max(...pts.map((q) => q.y)) / T) + 1);
    const keep = new Set();
    const B = 2; // Überlappung in Kartenpixeln gegen feine Nähte zwischen den Kacheln
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = `${tx},${ty}`;
        keep.add(key);
        let tile = t.cache.get(key);
        if (!tile && !ready) continue;
        if (!tile) {
          const sx = Math.max(0, tx * T - B);
          const sy = Math.max(0, ty * T - B);
          const sw = Math.min(W, (tx + 1) * T + B) - sx;
          const sh = Math.min(H, (ty + 1) * T + B) - sy;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(sw * k));
          canvas.height = Math.max(1, Math.round(sh * k));
          // willReadFrequently = auf der CPU vorbereiten. „medium“ (Mipmaps) verkleinert sauber und ist
          // ein Vielfaches schneller als „high“ (bikubisch) – bei der ganzen Weltkarte fror der Pi sonst ein
          const c = canvas.getContext('2d', { willReadFrequently: true });
          c.imageSmoothingQuality = k / f < 0.9 ? 'medium' : 'low';
          c.drawImage(img, sx * f, sy * f, sw * f, sh * f, 0, 0, canvas.width, canvas.height);
          tile = { canvas, sx, sy, sw, sh };
          t.cache.set(key, tile);
        }
        ctx.drawImage(tile.canvas, tile.sx, tile.sy, tile.sw, tile.sh);
      }
    }
    for (const [key, tile] of t.cache) {
      if (keep.has(key)) continue;
      freeCanvas(tile.canvas);
      t.cache.delete(key);
    }
  }

  /**
   * Bildschirmbereiche (Gerätepixel), die sich in einem reinen Animationsbild ändern:
   * flackernde Lichter und Pings. null = ganzes Bild neu zeichnen.
   */
  animationRects(map, now) {
    const s = this.view.scale * Math.max(1, this.view.aspect || 1) * this.dpr;
    const rects = [];
    const add = (mx, my, r) => {
      const p = this.mapToScreen(mx, my);
      const R = Math.ceil(r * s) + 3;
      rects.push([Math.floor(p.x * this.dpr) - R, Math.floor(p.y * this.dpr) - R, 2 * R, 2 * R]);
    };
    if (map.lighting?.enabled) {
      for (const li of Object.values(map.lights || {})) {
        if (li.on === false || !li.flicker || this.fxLayer) continue;
        const { x, y } = lightPos(map, li);
        add(x, y, (feetToPx(map, li.bright ?? 20) + feetToPx(map, li.dim ?? 20)) * 1.07);
      }
    }
    const g = gridOf(map);
    for (const p of this.pings) {
      if (p.mapId === map.id && now - p.t0 < 2300) add(p.x, p.y, g.size * 1.8 + Math.max(3, g.size / 12));
    }
    return rects;
  }

  render(now = performance.now()) {
    const ctx = this.ctx;
    const map = this.map;
    const img = this.image;
    let animate = false;
    const rebuild = this.dirty;
    // Tisch/Spieler-Display: nur die obere Ebene (eigene Canvas) hat sich geändert, z.B. weil die Spielleitung Nebel
    // aufdeckt – dann bleibt die Karten-Canvas unangetastet, und neu gezeichnet wird nur der Bereich der neuen
    // Pinselstriche (sonst müsste der Grafikchip bei jedem Teilstück das ganze Bild neu zusammensetzen)
    if (!rebuild && this.topDirty && this.topEl && this.mode !== 'dm' && map && img && !this.blackout && !this.overlay && !this.screenOverlay) {
      this.topDirty = false;
      this.fogFading = false;
      this.renderTopOnly(map, img);
      if (this.fogFading) {
        this.topDirty = true;
        this.requestRender(false);
      }
      return;
    }
    // Nur die obere Ebene (Nebel) neu, z.B. während der Nebel weich ausblendet – Karte und Tokens bleiben im Cache
    const rebuildTop = rebuild || this.topDirty;
    this.dirty = false;
    this.topDirty = false;
    this.fogFading = false;

    // Reines Animationsbild auf Tisch/Spieler-Display: nur die Bereiche um flackernde Lichter und
    // Pings neu zeichnen (plus die des letzten Bildes, damit nichts stehen bleibt)
    let clip = null;
    // Belebte Karte: nur auf starken Anzeigen und nur, wenn die Karte Daten dafür mitbringt
    let animOn = false;
    if (this.animWanted && this.highPerf && map?.anim && img && !this.blackout) {
      if (this.anim) animOn = true;
      else if (!this.animLoading) {
        this.animLoading = true;
        import('./mapanim.js')
          .then((m) => {
            this.anim = new m.MapAnim();
            if (!this.lean) this.midEl = Object.assign(document.createElement('canvas'), { className: 'mr-top' });
            this.resize(); // hängt die neuen Ebenen ein, bringt sie auf Größe und zeichnet neu
          })
          .catch(() => {});
      }
    }
    this.anim?.sync(animOn ? map : null, this);
    if (!rebuildTop && !animOn && this.mode !== 'dm' && !this.overlay && !this.screenOverlay && map && img && !this.blackout && this.prevRects) {
      const current = this.animationRects(map, now);
      clip = current.concat(this.prevRects);
      this.prevRects = current;
      const area = clip.reduce((a, r) => a + r[2] * r[3], 0);
      if (!clip.length) return;
      if (area > this.canvas.width * this.canvas.height * 0.6) clip = null; // lohnt nicht
    } else {
      this.prevRects = map && this.mode !== 'dm' ? this.animationRects(map, now) : null;
    }
    this.clipRects = clip;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (clip) {
      ctx.beginPath();
      for (const r of clip) ctx.rect(r[0], r[1], r[2], r[3]);
      ctx.clip();
    }
    // Schlanke Fassung: Auf der Hauptfläche liegt nur das Kartenbild. Bleibt es gleich (eine Figur zieht, Nebel wird
    // aufgedeckt), wird sie gar nicht angefasst – sonst müsste der Browser sie jedes Mal neu in den Grafikspeicher laden.
    const baseKey = this.lean && map && img && !this.blackout ? this.baseKeyOf(map, img) : null;
    const keepMain = baseKey !== null && baseKey === this.baseSig && this.mainHasBase && !clip;
    if (!keepMain) {
      ctx.fillStyle = this.dmLook ? '#0d0c0a' : '#000';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.mainHasBase = false;
    }
    // Obere Ebene: eigene Canvas über dem Schein (Nebel verdeckt ihn). Tisch/Spieler-Display zeichnen dort nur
    // bei Änderungen direkt hinein; die DM-Ansicht legt jedes Mal den Cache plus Werkzeug-Overlay darüber.
    const direct = !!this.topEl && this.mode !== 'dm';
    const tctx = this.topEl ? this.topEl.getContext('2d', this.ctxOpts) : ctx;
    const drawTop = !direct || rebuildTop;
    if (this.topEl && drawTop) {
      tctx.save();
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      if (clip) {
        tctx.beginPath();
        for (const r of clip) tctx.rect(r[0], r[1], r[2], r[3]);
        tctx.clip();
      }
      tctx.clearRect(0, 0, this.topEl.width, this.topEl.height);
    }

    if (map && img && !this.blackout) {
      const { W, H } = this.mapSize(map, img);
      const lit = !!map.lighting?.enabled;

      // Schlanke Fassung: Figuren und Dunkelheit liegen mit auf der oberen Ebene (eine statt zwei Flächen über der Karte)
      const onTop = this.lean && direct;
      // 1. Untere Ebene (Karte bis Tokens) – nur bei Änderungen neu zeichnen
      if (rebuild) {
        if (baseKey === null || baseKey !== this.baseSig) {
          this.baseSig = baseKey;
          const b = this.sizeLayer(this.baseCanvas, 1, this.baseOpts);
          b.setTransform(1, 0, 0, 1, 0, 0);
          b.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
          this.applyTransform(b);
          b.imageSmoothingQuality = 'high';
          this.drawMapImage(b, img, W, H);
          for (const d of Object.values(map.doors || {})) drawDoor(b, d, { dm: this.dmLook });
          const g = gridOf(map);
          if (g.show && g.size > 4) this.drawGrid(b, map, W, H);
          this.drawDrawings(b, map, 'below');
          for (const l of Object.values(map.labels || {})) drawLabel(b, l, { dm: this.dmLook });
          for (const aoe of Object.values(map.aoes || {})) this.drawAoe(b, map, aoe);
          if (!animOn && !onTop) this.drawTokens(b, map);
        }
        this.lightDirty = true;
        this.syncGlows(map);
      }
      if (rebuildTop) {
        // Obere Ebene (Licht-Markierungen, Zeichnungen oben, Nebel)
        const t = direct ? tctx : this.sizeLayer(this.topCanvas);
        if (!direct) {
          t.setTransform(1, 0, 0, 1, 0, 0);
          t.clearRect(0, 0, this.topCanvas.width, this.topCanvas.height);
        }
        this.applyTransform(t);
        if (onTop) {
          this.drawTokens(t, map);
          if (lit) this.drawLighting(t, map, now);
        }
        if (lit && this.dmLook) this.drawLightMarkers(t, map);
        this.drawDrawings(t, map, 'above');
        if (map.fog?.enabled) this.drawFog(t, map, W, H);
      }
      if (!keepMain) {
        ctx.drawImage(this.baseCanvas, 0, 0);
        this.mainHasBase = baseKey !== null;
      }

      // Belebte Karte: Spielfiguren und Licht auf die Ebene über den Bäumen
      let lctx = ctx;
      if (this.midEl && (animOn || this.midUsed)) {
        const m = this.midEl.getContext('2d', this.ctxOpts);
        m.setTransform(1, 0, 0, 1, 0, 0);
        m.clearRect(0, 0, this.midEl.width, this.midEl.height);
        this.midUsed = animOn;
        if (animOn) {
          this.applyTransform(m);
          this.drawTokens(m, map);
          lctx = m;
        }
      }
      // 2. Licht (bei flackernden Lichtern in jedem Bild, sonst aus dem Cache)
      if (lit && !onTop) animate = this.drawLighting(lctx, map, now) || animate;

      if (!direct) {
        tctx.setTransform(1, 0, 0, 1, 0, 0);
        tctx.drawImage(this.topCanvas, 0, 0);
        this.applyTransform(tctx);
        if (this.overlay) this.overlay(tctx, map, now);
        animate = this.drawPings(tctx, map, now) || animate;
      }
      // Ebenen ohne Inhalt ausblenden: eine leere, bildschirmfüllende Zeichenfläche kostet den Grafikchip in jedem
      // Bild so viel wie eine volle
      if (this.mode !== 'dm') {
        this.showLayer(this.midEl, animOn && (lit || Object.keys(map.tokens || {}).length > 0));
        this.showLayer(this.topEl, !!(map.fog?.enabled || this.fogFading || this.overlay || this.screenOverlay || (onTop && (lit || Object.keys(map.tokens || {}).length > 0)) || Object.values(map.drawings || {}).some((d) => (d.layer || 'above') === 'above' && d.vis !== 'dm')));
      }
    } else {
      if (this.mode !== 'dm') {
        this.showLayer(this.midEl, false);
        this.showLayer(this.topEl, !!(this.overlay || this.screenOverlay));
      }
      if (rebuild) this.syncGlows(null);
      if (this.midUsed) {
        this.midEl.getContext('2d', this.ctxOpts).clearRect(0, 0, this.midEl.width, this.midEl.height);
        this.midUsed = false;
      }
    }
    if (this.ruler || this.rulerEl) this.syncRuler();
    if (!(map && img && !this.blackout) && !this.blackout && this.mode === 'dm') {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = '#6b6252';
      ctx.font = '16px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(map ? tr('Karte wird geladen …') : tr('Keine Karte ausgewählt'), this.width / 2, this.height / 2);
    }

    if (this.screenOverlay && drawTop) {
      tctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      animate = this.screenOverlay(tctx, now) || animate;
    }
    if (this.topEl && drawTop) tctx.restore();
    ctx.restore();
    // Ladezustand melden (Ladebildschirm auf dem Tisch): Karte gewählt, Bild aber noch nicht bereit
    if (this.onLoading) {
      const hasImage = !!map && !!this.getState()?.assets?.[map.assetId];
      const loading = hasImage && !this.blackout && (!img || (this.mode !== 'dm' && !decodedImages.has(img)));
      if (loading !== this.loadingShown) {
        this.loadingShown = loading;
        this.onLoading(loading);
      }
    }
    if (this.fogFading) {
      this.topDirty = true;
      animate = true;
    }
    if (animate) this.requestRender(false);
  }

  drawGrid(ctx, map, W, H) {
    const g = gridOf(map);
    ctx.save();
    ctx.globalAlpha = g.opacity ?? 0.35;
    ctx.strokeStyle = g.color || '#000';
    ctx.lineWidth = Math.max(1 / this.view.scale, g.size / 60);
    ctx.beginPath();
    const startX = ((g.offsetX % g.sizeX) + g.sizeX) % g.sizeX;
    const startY = ((g.offsetY % g.sizeY) + g.sizeY) % g.sizeY;
    for (let x = startX; x <= W + 0.5; x += g.sizeX) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = startY; y <= H + 0.5; y += g.sizeY) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawAoe(ctx, map, aoe, preview = false) {
    const color = aoe.color || '#ff6a00';
    const g = gridOf(map);
    ctx.save();
    // Betroffene Felder hervorheben
    if (g.show && g.size > 4) {
      const size = feetToPx(map, aoe.size || 20) + g.size;
      const x0 = Math.floor((aoe.x - size - g.offsetX) / g.sizeX);
      const x1 = Math.ceil((aoe.x + size - g.offsetX) / g.sizeX);
      const y0 = Math.floor((aoe.y - size - g.offsetY) / g.sizeY);
      const y1 = Math.ceil((aoe.y + size - g.offsetY) / g.sizeY);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.28;
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const px = cx * g.sizeX + g.offsetX;
          const py = cy * g.sizeY + g.offsetY;
          if (inAoe(map, aoe, px + g.sizeX / 2, py + g.sizeY / 2)) ctx.fillRect(px + 1, py + 1, g.sizeX - 2, g.sizeY - 2);
        }
      }
    }
    ctx.globalAlpha = preview ? 0.25 : 0.18;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2 / this.view.scale, 2);
    const size = feetToPx(map, aoe.size || 20);
    ctx.translate(aoe.x, aoe.y);
    ctx.rotate(aoe.angle || 0);
    ctx.beginPath();
    if (aoe.shape === 'circle') ctx.arc(0, 0, size, 0, Math.PI * 2);
    else if (aoe.shape === 'cone') {
      ctx.moveTo(0, 0);
      ctx.lineTo(size, -size / 2);
      ctx.lineTo(size, size / 2);
      ctx.closePath();
    } else if (aoe.shape === 'cube') ctx.rect(0, -size / 2, size, size);
    else if (aoe.shape === 'line') {
      const w = feetToPx(map, aoe.width || 5);
      ctx.rect(0, -w / 2, size, w);
    }
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(3, g.size / 12), 0, Math.PI * 2);
    ctx.fill();
    if (aoe.label || this.dmLook) {
      ctx.rotate(-(aoe.angle || 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(12, g.size / 4)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      const text = `${aoe.label ? `${aoe.label} · ` : ''}${dist(aoe.size)}`;
      ctx.fillText(text, 0, -Math.max(8, g.size / 6));
    }
    ctx.restore();
  }

  drawTokens(ctx, map) {
    const tokens = Object.values(map.tokens || {}).sort((a, b) => (b.size || 1) - (a.size || 1));
    const g = gridOf(map);
    // Kampf: TP und Zustände. Spieler sehen je nach Einstellung nichts, nur „Blutend“ oder den Balken.
    const st = this.getState();
    const combat = st.display?.combat || {};
    const hpMode = this.dmLook ? 'bar' : combat.hpPlayers || 'bloodied';
    const bloodied = combat.bloodied ?? 0.25;
    const showConditions = this.dmLook || !!combat.conditionsPlayers;
    const combatants = {};
    for (const e of Object.values(st.initiative?.entries || {})) if (e.tokenId) combatants[e.tokenId] = e;
    for (const t of tokens) {
      if (t.hidden && !this.dmLook) continue;
      const { x, y, r } = tokenPos(map, t);
      const rr = r * 0.92;
      ctx.save();
      ctx.globalAlpha = t.hidden ? 0.45 : 1;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = r * 0.25;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fillStyle = t.color || '#888';
      ctx.fill();
      ctx.shadowBlur = 0;
      const asset = t.assetId && this.getState().assets[t.assetId];
      const img = asset && getImage(fileUrl(this.campaignId, asset), () => this.requestRender());
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, rr * 0.86, 0, Math.PI * 2);
        ctx.clip();
        const s = Math.max((rr * 2) / img.naturalWidth, (rr * 2) / img.naturalHeight);
        ctx.drawImage(img, x - (img.naturalWidth * s) / 2, y - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
        ctx.restore();
      } else {
        ctx.fillStyle = contrast(t.color || '#888');
        ctx.font = `bold ${rr * 0.8}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((t.name || '?').slice(0, t.size >= 2 ? 3 : 2), x, y + rr * 0.04);
      }
      ctx.lineWidth = Math.max(2, rr * 0.12);
      ctx.strokeStyle = t.kind === 'enemy' ? '#d33' : t.kind === 'pc' ? '#4caf50' : '#e0c060';
      if (t.hidden) ctx.setLineDash([rr * 0.25, rr * 0.18]);
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (t.dead) {
        ctx.strokeStyle = '#d00';
        ctx.lineWidth = rr * 0.18;
        ctx.beginPath();
        ctx.moveTo(x - rr * 0.6, y - rr * 0.6);
        ctx.lineTo(x + rr * 0.6, y + rr * 0.6);
        ctx.moveTo(x + rr * 0.6, y - rr * 0.6);
        ctx.lineTo(x - rr * 0.6, y + rr * 0.6);
        ctx.stroke();
      }
      const ce = combatants[t.id];
      if (t.maxHp > 0 && !t.dead && hpMode !== 'none') {
        const hp = t.hp ?? t.maxHp;
        const frac = Math.max(0, Math.min(1, hp / t.maxHp));
        if (hpMode === 'bar') {
          // Balken über dem Token (darunter stehen Name und Zustände)
          const bh = Math.max(4, g.size / 14);
          const by = y - rr - bh - Math.max(2, g.size / 30);
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#000b';
          ctx.fillRect(x - rr, by, rr * 2, bh);
          ctx.fillStyle = frac > 0.5 ? '#4caf50' : frac > bloodied ? '#e0a030' : '#d33';
          ctx.fillRect(x - rr, by, rr * 2 * frac, bh);
          const temp = ce?.tempHp || t.tempHp || 0;
          if (temp > 0) {
            ctx.fillStyle = '#7ec8ff';
            ctx.fillRect(x - rr, by - bh * 0.55, rr * 2 * Math.min(1, temp / t.maxHp), bh * 0.45);
          }
        }
        if (hp > 0 && frac <= bloodied) drawBloodDrop(ctx, x + rr * 0.72, y - rr * 0.62, Math.max(5, rr * 0.3));
      }
      if (ce && showConditions) {
        const marks = Object.entries(ce.conditions || {}).map(([k, c]) => [CONDITION_MARKS[k]?.[0] + (c.level || ''), CONDITION_MARKS[k]?.[1]]).filter((m) => m[1]);
        if (this.dmLook && ce.concentration) marks.push(['K', '#2196f3']);
        const br = Math.max(6, rr * 0.24);
        const n = Math.min(marks.length, 5);
        for (let i = 0; i < n; i++) {
          const bx = x + (i - (n - 1) / 2) * br * 2.1;
          const by = y + rr - br * 0.35;
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fillStyle = marks[i][1];
          ctx.fill();
          ctx.lineWidth = Math.max(1, br * 0.15);
          ctx.strokeStyle = '#000c';
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${br * 1.05}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(marks[i][0], bx, by + br * 0.05);
        }
      }
      const isSel = this.dmLook && (this.selectedId === t.id || this.selectedIds?.has(t.id));
      if (t.showName || isSel) {
        ctx.font = `${Math.max(11, g.size / 5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        ctx.fillText(t.name || '', x, y + rr + Math.max(8, g.size / 10) + (ce && showConditions && Object.keys(ce.conditions || {}).length ? rr * 0.25 : 0));
      }
      if (isSel) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / this.view.scale;
        ctx.setLineDash([6 / this.view.scale, 4 / this.view.scale]);
        ctx.beginPath();
        ctx.arc(x, y, r * 1.08, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      if (this.getState().initiative?.activeId && this.getState().initiative.entries?.[this.getState().initiative.activeId]?.tokenId === t.id) {
        ctx.save();
        ctx.strokeStyle = '#ffd54a';
        ctx.lineWidth = Math.max(3, rr * 0.12);
        ctx.shadowColor = '#ffd54a';
        ctx.shadowBlur = rr * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawDrawings(ctx, map, layer) {
    for (const d of Object.values(map.drawings || {})) {
      if ((d.layer || 'above') !== layer) continue;
      if (d.vis === 'dm' && !this.dmLook) continue;
      drawStroke(ctx, d, this.dmLook && d.vis === 'dm' ? 0.75 : 1);
    }
  }

  /** Dunkelheit mit ausgestanzten Lichtquellen. Liefert true, wenn animiert werden muss. */
  drawLighting(ctx, map, now) {
    // Weiche Lichtkegel brauchen keine volle Auflösung: halbe Größe = ein Viertel der Rechenarbeit
    const K = 0.5;
    const lc = this.lightCanvas;
    const lights = Object.values(map.lights || {}).filter((li) => li.on !== false);
    const animate = !this.fxLayer && lights.some((li) => li.flicker);
    if (this.lightDirty || animate) {
      const l = this.sizeLayer(lc, K);
      l.save();
      // Im Animationsbild nur die geänderten Ausschnitte der Dunkelheit neu berechnen
      if (this.clipRects && !this.lightDirty) {
        l.setTransform(1, 0, 0, 1, 0, 0);
        l.beginPath();
        for (const r of this.clipRects) l.rect(r[0] * K - 1, r[1] * K - 1, r[2] * K + 2, r[3] * K + 2);
        l.clip();
      }
      this.renderDarkness(l, map, lights, now, K);
      l.restore();
      // Der farbige Schein flackert nicht – nur bei echten Änderungen neu
      if (this.lightDirty) this.renderGlow(this.sizeLayer(this.glowCanvas, K), map, lights, K);
      this.lightDirty = false;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lc, 0, 0, this.canvas.width, this.canvas.height);
    // Farbiger Lichtschein
    if (this.hasGlow) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.glowCanvas, 0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.restore();
    return animate;
  }

  /** Lichtpunkte für den DM (Bearbeitung). */
  drawLightMarkers(ctx, map) {
    for (const li of Object.values(map.lights || {})) {
      const { x, y } = lightPos(map, li);
      const r = Math.max(6, gridOf(map).size / 6);
      ctx.save();
      ctx.fillStyle = li.on === false ? '#555' : li.color || '#ffd27a';
      ctx.strokeStyle = this.selectedId === li.id ? '#fff' : '#000';
      ctx.lineWidth = 2 / this.view.scale;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Farbiger Schein der Lichtquellen (additiv über die Szene gelegt). */
  renderGlow(g, map, lights, K) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    this.hasGlow = false;
    this.applyTransform(g, K);
    g.globalCompositeOperation = 'lighter';
    for (const li of lights) {
      if (!li.color || li.color === '#ffffff') continue;
      if (this.fxLayer && !this.lean && li.flicker) continue; // flackernder Schein kommt als HTML-Element
      this.hasGlow = true;
      const { x, y } = lightPos(map, li);
      const total = feetToPx(map, (li.bright ?? 20) + (li.dim ?? 20));
      const grad = g.createRadialGradient(x, y, 0, x, y, total);
      grad.addColorStop(0, hexA(li.color, 0.28));
      grad.addColorStop(1, hexA(li.color, 0));
      g.save();
      this.clipToLight(g, map, li, x, y, total);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, total, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }

  /** Dunkelheit mit ausgestanzten Lichtkegeln. */
  renderDarkness(l, map, lights, now, K) {
    const lc = l.canvas;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, lc.width, lc.height);
    const ambient = map.lighting.ambient ?? 0.15;
    let darkness = 1 - ambient;
    if (this.dmLook) darkness *= 0.5;
    l.fillStyle = `rgba(0,0,10,${darkness})`;
    if (map.lighting.indoor && map.zones?.length && !map.zones.some((z) => !z.out)) {
      // Nur innen dunkel, aber alles liegt unter freiem Himmel (lauter Höfe): es bleibt hell
      this.applyTransform(l, K);
    } else if (map.lighting.indoor && map.zones?.some((z) => !z.out)) {
      // Nur innen dunkel: draußen ist Tag, in Häusern, Kellern und Höhlen braucht es Licht
      this.applyTransform(l, K);
      // Räume mit einem Fenster ins Freie sind am Tag nicht stockdunkel: dort gilt eine Grundhelligkeit
      const lit = new Set((map.windows || []).map((w) => w[4]).filter(Boolean));
      const soft = Math.min(darkness, (1 - Math.max(ambient, DAY_ROOM)) * (this.dmLook ? 0.5 : 1));
      const trace = (only) => {
        l.beginPath();
        for (const z of map.zones) {
          if (z.out) continue; // Burghof, ummauerte Stadt: unter freiem Himmel
          if (only && lit.has(z.id)) continue;
          const p = z.in || z.pts;
          l.moveTo(p[0], p[1]);
          for (let i = 2; i < p.length; i += 2) l.lineTo(p[i], p[i + 1]);
          l.closePath();
        }
        l.fill();
      };
      if (lit.size && soft < darkness) {
        // erst alles in der helleren Stufe, dann die fensterlosen Räume auf die volle Dunkelheit nachdunkeln
        l.fillStyle = `rgba(0,0,10,${soft})`;
        trace(false);
        l.fillStyle = `rgba(0,0,10,${1 - (1 - darkness) / (1 - soft)})`;
        trace(true);
      } else trace(false);
    } else {
      l.fillRect(0, 0, lc.width, lc.height);
      this.applyTransform(l, K);
    }
    l.globalCompositeOperation = 'destination-out';
    // Nur innen dunkel heißt: draußen ist Tag – dann fällt durch jedes Fenster ins Freie Tageslicht in den Raum
    // – weich, weil es vom ganzen Himmel kommt: mehrere schwache Lichter nebeneinander, breiter als das Fenster.
    // So hat der Lichtfleck keinen scharfen Rand, sondern läuft zu den Seiten aus.
    const day = [];
    if (map.lighting.indoor && map.windows?.length) {
      // Streulicht: im Raum verteilt sich das Tageslicht – vom Fenster aus wird es weich heller, auch neben dem
      // Lichtfleck. Begrenzt auf den Raum hinter dem Fenster.
      const cell = gridOf(map).size;
      for (const [x, y, , , zid] of map.windows) {
        const zone = zid && map.zones?.find((q) => q.id === zid);
        const p = zone && (zone.in || zone.pts);
        if (!p) continue;
        l.save();
        l.beginPath();
        l.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) l.lineTo(p[i], p[i + 1]);
        l.closePath();
        l.clip();
        const R = cell * 7.5;
        const glow = l.createRadialGradient(x, y, cell * 0.4, x, y, R);
        glow.addColorStop(0, 'rgba(0,0,0,0.6)');
        glow.addColorStop(0.35, 'rgba(0,0,0,0.36)');
        glow.addColorStop(0.7, 'rgba(0,0,0,0.12)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        l.fillStyle = glow;
        l.beginPath();
        l.arc(x, y, R, 0, Math.PI * 2);
        l.fill();
        l.restore();
      }
      // bei sehr vielen Fenstern (Stadthäuser auf einer großen Karte) je Fenster nur drei – das spart Rechenzeit
      const [offs, step, part] = map.windows.length > 40 ? [[-1, 0, 1], 0.45, 0.4] : [[-3, -2, -1, 0, 1, 2, 3], 0.3, 0.2];
      map.windows.forEach(([x, y, a = 0, w = 56], i) => {
        for (const k of offs) day.push({ id: `win${i}.${k}`, x: x + Math.cos(a) * w * step * k, y: y + Math.sin(a) * w * step * k, bright: 6, dim: 12, part });
      });
    }
    for (const li of day.length ? [...lights, ...day] : lights) {
      const { x, y } = lightPos(map, li);
      let flick = 1;
      if (li.flicker && !this.fxLayer) {
        const s = (li.seed || 1) * 13.37;
        flick = 1 + 0.035 * Math.sin(now / 90 + s) + 0.025 * Math.sin(now / 37 + s * 2);
      }
      const bright = feetToPx(map, li.bright ?? 20) * flick;
      const dim = feetToPx(map, li.dim ?? 20) * flick;
      const total = Math.max(1, bright + dim);
      // Weicher Verlauf ohne harte Kante: helles Licht bis kurz vor „bright“, dann sanft über das
      // dämmrige Licht bis „dim“ auslaufen (Werte ≈ Smoothstep, damit kein Ring sichtbar wird)
      const b = bright / total;
      const grad = l.createRadialGradient(x, y, 0, x, y, total);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(b * 0.75, 'rgba(0,0,0,0.98)');
      grad.addColorStop(b, 'rgba(0,0,0,0.85)');
      grad.addColorStop(b + (1 - b) * 0.35, 'rgba(0,0,0,0.55)');
      grad.addColorStop(b + (1 - b) * 0.7, 'rgba(0,0,0,0.2)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      l.save();
      // Sichtfläche mit der unverflackerten Reichweite: so bleibt sie im Zwischenspeicher
      this.clipToLight(l, map, li, x, y, feetToPx(map, (li.bright ?? 20) + (li.dim ?? 20)));
      l.fillStyle = grad;
      if (li.part) l.globalAlpha = li.part;
      l.beginPath();
      l.arc(x, y, total, 0, Math.PI * 2);
      l.fill();
      l.restore();
    }
  }

  /** Nebel des Krieges: wird als Maske im Kartenraum gecacht und inkrementell aktualisiert. */
  drawFog(ctx, map, W, H) {
    const ops = map.fog.ops || [];
    // Masken der zuletzt gezeigten Karten merken – beim Zurückwechseln kein Neuaufbau aus allen Pinselstrichen
    this.fogCaches ??= new Map();
    if (this.fogCache && this.fogCache.mapId !== map.id) {
      this.fogCaches.set(this.fogCache.mapId, this.fogCache);
      const stored = this.fogCaches.get(map.id);
      this.fogCache = stored || null;
      for (const [id, fc] of this.fogCaches) {
        if (this.fogCaches.size <= 2 || id === map.id) continue;
        freeCanvas(fc.canvas);
        freeCanvas(fc.tex);
        this.fogCaches.delete(id);
      }
    }
    let c = this.fogCache;
    const soft = map.fog.soft !== false;
    // Mit weichem Rand reicht eine gröbere Maske (spart auf dem Pi Grafikspeicher) – starke Geräte nehmen die volle
    const maxMask = soft && !this.highPerf ? FOG_MASK_MAX / 2 : FOG_MASK_MAX;
    if (!c || c.mapId !== map.id || c.ops !== ops || c.applied > ops.length || c.W !== W || c.H !== H || c.maxMask !== maxMask) {
      const k = Math.min(1, maxMask / Math.max(W, H));
      const canvas = c?.canvas || document.createElement('canvas');
      canvas.width = Math.ceil(W * k);
      canvas.height = Math.ceil(H * k);
      c = this.fogCache = { mapId: map.id, ops, applied: 0, W, H, k, canvas, maxMask, tex: c?.mapId === map.id ? c.tex : null };
      const m = canvas.getContext('2d', this.ctxOpts);
      m.globalCompositeOperation = 'source-over';
      m.fillStyle = '#000';
      m.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (c.applied < ops.length) {
      const m = c.canvas.getContext('2d', this.ctxOpts);
      m.setTransform(c.k, 0, 0, c.k, 0, 0);
      for (let i = c.applied; i < ops.length; i++) applyFogOp(m, ops[i], W, H);
      c.applied = ops.length;
    }
    // Weicher Rand und Textur statt Schwarz – einmalig je Nebeländerung berechnet, nicht je Bild
    const style = fogStyleOf(map);
    const g = gridOf(map);
    let src = c.canvas;
    if (style !== 'black' || soft) {
      const key = `${style}|${soft}|${g.size}`;
      const sameTex = !!c.tex?.width && c.texKey === key && c.texMap === map.id && c.tex.width === c.canvas.width && c.tex.height === c.canvas.height;
      const stale = !sameTex || c.texApplied !== c.applied;
      // Starke Geräte: neue Pinselstriche zum Aufdecken direkt aus der fertigen Textur radieren (nur deren Bereich,
      // mit weichem Rand) statt alles neu zu berechnen – so folgt der Tisch dem Pinsel flüssig. Kurz nach dem
      // letzten Strich wird die Textur einmal exakt neu berechnet.
      const newOps = stale && sameTex && c.texApplied >= 0 && c.texApplied < c.applied ? ops.slice(c.texApplied, c.applied) : null;
      const incremental = this.highPerf && this.mode !== 'dm' && newOps?.length && newOps.every((o) => o.m !== 'hide' && o.s === 'stroke');
      // Tisch/Spieler-Display (schwache Geräte): während der DM malt (mehrere Teilstücke pro Sekunde) höchstens alle
      // 0,25 s neu aufbereiten und solange das letzte Ergebnis zeigen – sonst läuft auf dem Pi der Grafikspeicher
      // voll und der Nebel erscheint als schwarze Fläche ohne Textur
      const wait = stale && !this.highPerf && sameTex && this.mode !== 'dm' ? 250 - (performance.now() - (c.texAt || 0)) : 0;
      if (incremental) {
        const t = c.tex.getContext('2d', this.ctxOpts);
        for (const op of newOps) eraseFogStroke(t, op, c.k, soft ? (g.size * FOG_SOFT_CELLS) / 2 : 0);
        c.texApplied = c.applied;
        clearTimeout(this.fogTimer);
        this.fogTimer = setTimeout(() => {
          c.texApplied = -1; // exakt neu berechnen (ohne Ausblenden – das Bild ändert sich dabei kaum)
          c.exact = true;
          this.requestTopRender();
        }, 1200);
      } else if (wait > 0) {
        clearTimeout(this.fogTimer);
        this.fogTimer = setTimeout(() => this.requestRender(), wait + 10);
      } else if (stale) {
        // Weiches Aufdecken (Tisch/Spieler-Display, starke Geräte): bisherigen Nebel merken, um den gerade
        // aufgedeckten Teil über FOG_FADE_MS auszublenden statt ihn schlagartig verschwinden zu lassen
        const fade = this.highPerf && this.mode !== 'dm' && sameTex && !c.exact;
        c.exact = false;
        if (fade) {
          c.fadeTex ??= document.createElement('canvas');
          if (c.fadeTex.width !== c.tex.width || c.fadeTex.height !== c.tex.height) {
            c.fadeTex.width = c.tex.width;
            c.fadeTex.height = c.tex.height;
          }
          const f = c.fadeTex.getContext('2d', this.ctxOpts);
          f.globalCompositeOperation = 'source-over';
          f.globalAlpha = 1;
          // Ein noch laufendes Ausblenden fließt mit seinem aktuellen Stand ein
          const left = c.fadeAt ? 1 - (performance.now() - c.fadeAt) / FOG_FADE_MS : 0;
          if (left > 0) {
            f.globalCompositeOperation = 'copy';
            f.globalAlpha = left;
            f.drawImage(c.fadeTex, 0, 0);
            f.globalCompositeOperation = 'source-over';
            f.globalAlpha = 1;
          } else {
            f.clearRect(0, 0, c.fadeTex.width, c.fadeTex.height);
          }
          f.drawImage(c.tex, 0, 0);
        }
        c.texAt = performance.now();
        c.texMap = map.id;
        c.tex ??= document.createElement('canvas');
        c.tex.width = c.canvas.width;
        c.tex.height = c.canvas.height;
        const t = c.tex.getContext('2d', this.ctxOpts);
        t.globalCompositeOperation = 'source-over';
        t.clearRect(0, 0, c.tex.width, c.tex.height);
        if (soft) {
          // Weicher, halbdurchsichtiger Rand: Maske stufenweise halbieren und stufenweise wieder vergrößern. Jede
          // Stufe mittelt weich – zusammen ein glatter Übergang von voll durchsichtig zu ganz deckend über
          // FOG_SOFT_CELLS Rasterfelder (≈ 2 Pixel der kleinsten Stufe), ganz auf der Grafikeinheit (Pixelschleifen in
          // JS sind auf dem Pi zu langsam)
          const levels = Math.max(1, Math.min(9, Math.round(Math.log2((FOG_SOFT_CELLS * g.size * c.k) / 2))));
          const chain = (this.fogChain ??= []);
          let from = c.canvas;
          for (let i = 0; i < levels; i++) {
            const cv = (chain[i] ??= document.createElement('canvas'));
            const w = Math.max(1, Math.ceil(from.width / 2));
            const h = Math.max(1, Math.ceil(from.height / 2));
            if (cv.width !== w || cv.height !== h) {
              cv.width = w;
              cv.height = h;
            }
            from = scaleInto(cv, from, this.ctxOpts);
          }
          for (let i = levels - 2; i >= 0; i--) from = scaleInto(chain[i], from, this.ctxOpts);
          t.imageSmoothingEnabled = true;
          t.imageSmoothingQuality = 'low';
          t.drawImage(from, 0, 0, c.tex.width, c.tex.height);
        } else {
          t.drawImage(c.canvas, 0, 0);
        }
        if (style !== 'black') {
          t.globalCompositeOperation = 'source-in';
          // Muster nur einmal je Nebelfläche und Stil anlegen (jedes neue Muster belegt Grafikspeicher)
          if (c.patStyle !== style || !c.pattern) {
            c.pattern = t.createPattern(fogTexture(style), 'repeat');
            c.patStyle = style;
          }
          const pattern = c.pattern;
          // Musterkachel ≈ 1200 Kartenpixel – groß genug, dass die Wiederholung nicht auffällt
          const ps = (1200 * c.k) / FOG_TEX;
          pattern.setTransform?.(new DOMMatrix([ps, 0, 0, ps, 0, 0]));
          t.fillStyle = pattern;
          t.fillRect(0, 0, c.tex.width, c.tex.height);
          t.globalCompositeOperation = 'source-over';
        }
        c.texKey = key;
        c.texApplied = c.applied;
        if (fade) {
          // Ausblenden nur, wo jetzt kein Nebel mehr ist (der Rest bleibt unverändert sichtbar)
          const f = c.fadeTex.getContext('2d', this.ctxOpts);
          f.globalCompositeOperation = 'destination-out';
          f.drawImage(c.tex, 0, 0);
          f.globalCompositeOperation = 'source-over';
          c.fadeAt = performance.now();
        }
      }
      src = c.tex;
    }
    ctx.save();
    ctx.globalAlpha = this.fogAlpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, 0, 0, W, H);
    const left = c.fadeAt && src === c.tex ? 1 - (performance.now() - c.fadeAt) / FOG_FADE_MS : 0;
    if (left > 0) {
      // sanft auslaufend (ease-out)
      ctx.globalAlpha = this.fogAlpha * left * left;
      ctx.drawImage(c.fadeTex, 0, 0, W, H);
      this.fogFading = true;
    } else {
      c.fadeAt = 0;
    }
    ctx.restore();
  }

  drawPings(ctx, map, now) {
    this.pings = this.pings.filter((p) => now - p.t0 < 2200 && p.mapId === map.id);
    const g = gridOf(map);
    for (const p of this.pings) {
      const t = (now - p.t0) / 2200;
      for (let i = 0; i < 3; i++) {
        const tt = (t * 3 + i * 0.33) % 1;
        ctx.save();
        ctx.globalAlpha = (1 - tt) * (1 - t * 0.5);
        ctx.strokeStyle = p.color || '#ffd54a';
        ctx.lineWidth = Math.max(3, g.size / 12);
        ctx.beginPath();
        ctx.arc(p.x, p.y, g.size * (0.3 + tt * 1.5), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    return this.pings.length > 0;
  }
}

const decodedImages = new WeakSet();

/** Kürzel und Farbe der Zustandsmarken am Token (wie im Kampf-Panel). */
const CONDITION_MARKS = {
  blinded: [tr('Bl'), '#607d8b'], charmed: [tr('Bz'), '#e91e63'], deafened: [tr('Ta'), '#78909c'], frightened: [tr('Va'), '#9c27b0'],
  grappled: [tr('Gp'), '#8d6e63'], incapacitated: [tr('Ku'), '#ff7043'], invisible: [tr('Us'), '#4dd0e1'], paralyzed: [tr('Gl'), '#c9a400'],
  petrified: [tr('Vs'), '#9e9e9e'], poisoned: [tr('Vg'), '#7cb342'], prone: [tr('Li'), '#a1887f'], restrained: [tr('Fs'), '#6d4c41'],
  stunned: [tr('Bt'), '#ffb300'], unconscious: [tr('Bw'), '#d32f2f'], exhaustion: ['E', '#5c6bc0'],
};

/** Blutstropfen („blutend“: Token ist schwer verletzt). */
function drawBloodDrop(ctx, cx, cy, s) {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.bezierCurveTo(cx + s * 0.95, cy - s * 0.05, cx + s * 0.75, cy + s * 0.8, cx, cy + s * 0.8);
  ctx.bezierCurveTo(cx - s * 0.75, cy + s * 0.8, cx - s * 0.95, cy - s * 0.05, cx, cy - s);
  ctx.fillStyle = '#c62828';
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.16);
  ctx.strokeStyle = '#1a0000';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.25, cy + s * 0.15, s * 0.14, s * 0.25, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = '#ff8a80';
  ctx.fill();
  ctx.restore();
}

// --- Nebel-Texturen -----------------------------------------------------------------
export const FOG_STYLES = { mist: tr('Nebelschwaden'), parchment: tr('Pergament'), black: tr('Schwarz') };
/** Darstellung des Nebels einer Karte (Standard: Pergament auf Weltkarten, sonst Nebelschwaden). */
export function fogStyleOf(map) {
  const s = map?.fog?.style;
  if (s && FOG_STYLES[s]) return s;
  return map?.kind === 'world' ? 'parchment' : 'mist';
}
const FOG_TEX = 256;
const fogTextures = {};
/** Kachelbare Textur aus mehrlagigem Rauschen (einmal je Stil erzeugt, keine Bilddatei nötig). */
function fogTexture(style) {
  if (fogTextures[style]) return fogTextures[style];
  const N = FOG_TEX;
  // Wertrauschen auf einem periodischen Gitter → nahtlos kachelbar
  const rnd = (() => {
    let x = style === 'parchment' ? 7 : 3;
    return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  })();
  const layer = (cells) => {
    const g = Array.from({ length: cells * cells }, rnd);
    const at = (x, y) => g[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const fx = (x / N) * cells;
      const fy = (y / N) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = sm(fx - x0);
      const ty = sm(fy - y0);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      return a + (b - a) * ty;
    };
  };
  const octaves = [layer(4), layer(8), layer(16), layer(32), layer(64)];
  const weights = [0.42, 0.26, 0.16, 0.1, 0.06];
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const cx = c.getContext('2d');
  const img = cx.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (let o = 0; o < octaves.length; o++) v += octaves[o](x, y) * weights[o];
      let r, gr, b;
      if (style === 'parchment') {
        // Altes Papier: warme Brauntöne mit Flecken
        const t = Math.min(1, Math.max(0, (v - 0.25) * 1.6));
        r = 92 + t * 70;
        gr = 72 + t * 56;
        b = 48 + t * 34;
      } else {
        // Nebelschwaden: dunkles Blaugrau mit helleren Wolken
        const t = Math.pow(Math.min(1, Math.max(0, (v - 0.3) * 1.8)), 1.6);
        r = 14 + t * 46;
        gr = 16 + t * 50;
        b = 22 + t * 60;
      }
      const i = (y * N + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gr;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  fogTextures[style] = c;
  return c;
}

/** Speicher einer Zeichenfläche sofort freigeben (nicht erst bei der nächsten Speicherbereinigung). */
function freeCanvas(c) {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}
let fxStyle = false;
const glowSprites = {};
/**
 * Runder, weich auslaufender Lichtfleck als Bild (einmal je Farbe/Stärke). Mit feinem Rauschen, damit
 * große, schwache Verläufe keine sichtbaren Farbstufen (Ringe) bekommen wie bei CSS-Verläufen.
 */
function glowSprite(color, alpha) {
  const key = `${color}|${alpha}`;
  if (glowSprites[key]) return glowSprites[key];
  const N = 128; // wird weich hochskaliert; größer kostet auf dem Pi beim ersten Mal unnötig Zeit
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const cx = c.getContext('2d');
  const img = cx.createImageData(N, N);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / (N / 2); // 0 Mitte … 1 Rand
      const t = Math.max(0, 1 - d / 0.72);
      const a = alpha * t * t * (3 - 2 * t) + (Math.random() - 0.5) * (1.6 / 255);
      const i = (y * N + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
    }
  }
  cx.putImageData(img, 0, 0);
  glowSprites[key] = c.toDataURL('image/png');
  return glowSprites[key];
}

/** Ebene für Schein bzw. Pings (HTML) über der Karten-Canvas. */
function createFxLayer() {
  if (!fxStyle) {
    fxStyle = true;
    const st = document.createElement('style');
    // i18n-ignore-next-line – Stilregeln
    st.textContent = `
.mr-fx{position:absolute;pointer-events:none;overflow:hidden;contain:strict}
.mr-ping{position:absolute;width:0;height:0;animation:mr-ping-fade 2.2s linear forwards}
.mr-ping i{position:absolute;border-radius:50%;border-style:solid;box-sizing:border-box;will-change:transform,opacity;animation:mr-ring .7333s linear infinite}
@keyframes mr-ring{from{transform:scale(.1667);opacity:1}to{transform:scale(1);opacity:0}}
@keyframes mr-ping-fade{from{opacity:1}to{opacity:.5}}
.mr-ruler{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
.mr-ruler line{stroke:#fff;stroke-linecap:round}
.mr-ruler line.o{stroke:rgba(0,0,0,.6)}
.mr-ruler circle{fill:#fff;stroke:rgba(0,0,0,.6);stroke-width:2px}
.mr-ruler text{fill:#fff;font-family:sans-serif;font-weight:bold;stroke:rgba(0,0,0,.75);stroke-width:4px;paint-order:stroke;stroke-linejoin:round}
.mr-ruler.done{animation:mr-ruler-fade .6s linear 3.4s forwards}
@keyframes mr-ruler-fade{to{opacity:0}}
.mr-glow{position:absolute;will-change:transform,opacity;background-size:100% 100%;animation:mr-flicker 3.8s ease-in-out infinite}
.mr-shade{position:absolute;will-change:opacity;background-size:100% 100%;animation:mr-shade 2.9s ease-in-out infinite}
.mr-top{position:absolute;pointer-events:none}
@keyframes mr-flicker{0%{opacity:.83;transform:scale(1)}9%{opacity:.98;transform:scale(1.015)}21%{opacity:.8;transform:scale(.992)}34%{opacity:1;transform:scale(1.022)}45%{opacity:.86;transform:scale(1)}58%{opacity:.96;transform:scale(1.013)}71%{opacity:.8;transform:scale(.995)}86%{opacity:1;transform:scale(1.018)}100%{opacity:.83;transform:scale(1)}}
@keyframes mr-shade{0%{opacity:.04}13%{opacity:.32}27%{opacity:.02}41%{opacity:.23}55%{opacity:0}69%{opacity:.35}83%{opacity:.08}100%{opacity:.04}}`;
    document.head.appendChild(st);
  }
  const fx = document.createElement('div');
  fx.className = 'mr-fx';
  return fx;
}

/** Bild in eine Hilfsfläche skalieren (weich interpoliert, ersetzt den bisherigen Inhalt). */
function scaleInto(cv, from, ctxOpts) {
  const x = cv.getContext('2d', ctxOpts);
  x.globalCompositeOperation = 'copy';
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'low';
  x.drawImage(from, 0, 0, cv.width, cv.height);
  x.globalCompositeOperation = 'source-over';
  return cv;
}

/**
 * Pinselstrich zum Aufdecken direkt aus einer fertigen Nebeltextur radieren (Maskenmaßstab k). feather > 0: weicher
 * Rand dieser Breite (in Kartenpixeln) – kreisförmige Stempel mit Verlauf entlang des Strichs.
 */
function eraseFogStroke(t, op, k, feather) {
  const pts = op.pts || [];
  if (pts.length < 2) return;
  t.save();
  t.setTransform(k, 0, 0, k, 0, 0);
  t.globalCompositeOperation = 'destination-out';
  if (!feather) {
    applyFogOp(t, op, 0, 0);
    t.restore();
    return;
  }
  const inner = Math.max(0, op.r - feather);
  const outer = op.r + feather;
  const stamp = (x, y) => {
    const gr = t.createRadialGradient(x, y, inner, x, y, outer);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = gr;
    t.fillRect(x - outer, y - outer, outer * 2, outer * 2);
  };
  // Innen voll aufdecken (breiter Strich), Rand über die Stempel weich auslaufen lassen
  if (inner > 0 && pts.length >= 4) {
    t.lineCap = 'round';
    t.lineJoin = 'round';
    t.lineWidth = inner * 2;
    t.strokeStyle = '#000';
    t.beginPath();
    t.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) t.lineTo(pts[i], pts[i + 1]);
    t.stroke();
  }
  const step = Math.max(2, feather * 0.6);
  stamp(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) {
    const x0 = pts[i - 2];
    const y0 = pts[i - 1];
    const dx = pts[i] - x0;
    const dy = pts[i + 1] - y0;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
    for (let j = 1; j <= n; j++) stamp(x0 + (dx * j) / n, y0 + (dy * j) / n);
  }
  t.restore();
}

export function applyFogOp(m, op, W, H) {
  m.globalCompositeOperation = op.m === 'hide' ? 'source-over' : 'destination-out';
  m.fillStyle = '#000';
  m.strokeStyle = '#000';
  if (op.s === 'all') {
    m.fillRect(-10, -10, W + 20, H + 20);
  } else if (op.s === 'rect') {
    m.fillRect(op.x, op.y, op.w, op.h);
  } else if (op.s === 'poly' && op.pts?.length >= 6) {
    m.beginPath();
    for (const p of [op.pts, ...(op.holes || [])]) {
      m.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) m.lineTo(p[i], p[i + 1]);
      m.closePath();
    }
    m.fill('evenodd');
  } else if (op.s === 'stroke' && op.pts?.length >= 2) {
    m.lineCap = 'round';
    m.lineJoin = 'round';
    m.lineWidth = op.r * 2;
    m.beginPath();
    m.moveTo(op.pts[0], op.pts[1]);
    if (op.pts.length === 2) {
      m.arc(op.pts[0], op.pts[1], op.r, 0, Math.PI * 2);
      m.fill();
    } else {
      for (let i = 2; i < op.pts.length; i += 2) m.lineTo(op.pts[i], op.pts[i + 1]);
      m.stroke();
    }
  }
  m.globalCompositeOperation = 'source-over';
}

/** Zeichnet einen Freihand-Strich mit Druckempfindlichkeit (pts: x, y, druck, …). */
export function drawStroke(ctx, d, alpha = 1) {
  const p = d.pts || [];
  if (p.length < 3) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = d.color || '#e33';
  ctx.fillStyle = d.color || '#e33';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const w = d.w || 4;
  if (p.length === 3) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], (w * (0.4 + (p[2] || 0.5) * 0.8)) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 3; i < p.length; i += 3) {
    const pr = ((p[i + 2] || 0.5) + (p[i - 1] || 0.5)) / 2;
    ctx.lineWidth = w * (0.4 + pr * 0.8);
    ctx.beginPath();
    ctx.moveTo(p[i - 3], p[i - 2]);
    ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
  }
  ctx.restore();
}

function contrast(hex) {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.replace(/(.)/g, '$1$1') : c, 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#111' : '#fff';
}

function hexA(hex, a) {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.replace(/(.)/g, '$1$1') : c, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
