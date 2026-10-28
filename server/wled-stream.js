// Live-Übertragung an WLED per DDP (UDP, Port 4048; WLED nimmt das ab Werk an: Einstellungen → Sync →
// „Receive UDP realtime“). Je Streifen läuft eine Quelle (Effekt oder ruhendes Muster); beim Wechsel blendet der Server
// Bild für Bild weich über. Endet der Strom, kehrt WLED nach seiner Wartezeit (2,5 s) zum eigenen Zustand zurück.
import dgram from 'node:dgram';

const FPS = 30;
const PORT = 4048;
const PER_PACKET = 480; // LEDs je Paket (1440 Byte Nutzdaten – passt in jedes WLAN-Paket)
const KEEPALIVE_MS = 1000; // ruhende Bilder nur noch einmal pro Sekunde wiederholen (WLED bleibt im Live-Modus)

// WLED korrigiert Farben aus seiner Oberfläche mit Gamma 2,8, Live-Daten aber nicht – der Server rechnet es selbst,
// damit die Stimmungen genauso aussehen wie ihre Farbwerte.
const GAMMA = 2.8;

// Räumliches Dithering: Dunkle Farben haben nach Gamma und Helligkeit nur wenige Stufen (z.B. 3, 4, 5). Sprängen alle
// LEDs gleichzeitig eine Stufe weiter, sähe man beim langsamen Atmen ein Zucken. Jede LED (und jeder Kanal) bekommt
// eine feste Rundungsschwelle, so steigen die LEDs nacheinander um eine Stufe – fest je LED, also ohne Flimmern.
const PHI = 0.6180339887;
const threshold = (i, j) => (i * PHI + j * 0.3819660113 + 0.5) % 1;

let socket = null;
const streams = new Map(); // Geräte-ID → Strom
let timer = null;

function ensureSocket() {
  if (socket) return;
  socket = dgram.createSocket('udp4');
  socket.on('error', () => {}); // einzelne Fehler (z.B. Gerät gerade weg) nicht den Server stören lassen
  socket.unref();
}

/** Ein Bild als DDP-Pakete senden (Push-Flag im letzten Paket: WLED zeigt dann alles auf einmal). */
function send(s, bytes) {
  const seq = (s.seq = (s.seq % 15) + 1);
  for (let off = 0; off < bytes.length; off += PER_PACKET * 3) {
    const chunk = bytes.subarray(off, Math.min(bytes.length, off + PER_PACKET * 3));
    const head = Buffer.alloc(10);
    const last = off + chunk.length >= bytes.length;
    head[0] = 0x40 | (last ? 0x01 : 0); // Version 1, Push
    head[1] = seq;
    head[2] = 0x0b; // RGB, 8 Bit je Kanal
    head[3] = 0x01; // Ziel: Anzeige
    head.writeUInt32BE(off, 4);
    head.writeUInt16BE(chunk.length, 8);
    socket.send(Buffer.concat([head, chunk]), PORT, s.host, (err) => err && s.onError?.(err));
  }
}

/** Farben (0–255, vor Gamma) → Bytes für die LEDs: Gamma, dann Helligkeit. */
function toBytes(frame, n, level) {
  const out = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const c = frame.length === 1 ? frame[0] : frame[i] || frame[frame.length - 1];
    for (let j = 0; j < 3; j++) {
      const v = Math.max(0, Math.min(255, c[j]));
      out[i * 3 + j] = Math.min(255, Math.floor(Math.pow(v / 255, GAMMA) * 255 * level + threshold(i, j)));
    }
  }
  return out;
}

const blend = (a, b, t, n) => {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = a.length === 1 ? a[0] : a[i] || [0, 0, 0];
    const y = b.length === 1 ? b[0] : b[i] || [0, 0, 0];
    out[i] = [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  }
  return out;
};
const ease = (t) => t * t * (3 - 2 * t);

function tick() {
  const now = performance.now();
  for (const s of streams.values()) {
    const dt = Math.min(0.2, (now - s.last) / 1000);
    s.last = now;
    const t = (now - s.started) / 1000;
    let frame = s.source(t, dt);
    let level = s.level;
    const fading = now < s.fadeEnd;
    if (fading) {
      // Weich überblenden: Bild und Helligkeit vom zuletzt gezeigten Stand zum neuen
      const k = ease(1 - (s.fadeEnd - now) / s.fadeMs);
      frame = blend(s.from, frame, k, s.n);
      level = s.fromLevel + (s.level - s.fromLevel) * k;
    } else if (s.onFaded) {
      const cb = s.onFaded;
      s.onFaded = null;
      cb();
      if (!streams.has(s.id)) continue;
    }
    s.shown = frame;
    s.shownLevel = level;
    // Ruhende Bilder nicht 30-mal pro Sekunde wiederholen
    if (!fading && s.still && now - s.sent < KEEPALIVE_MS) continue;
    s.sent = now;
    send(s, toBytes(frame, s.n, level));
  }
  if (!streams.size) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Quelle für einen Streifen setzen (startet den Strom, falls nötig). source(t, dt) → Farben; level: Helligkeit 0–1;
 * still: ruhendes Bild; onFaded: nach der Überblendung aufrufen (z.B. Gerät ausschalten).
 */
export function play(id, { host, n, source, level, still = false, fadeMs = 2000, onFaded = null, onError = null }) {
  ensureSocket();
  const prev = streams.get(id);
  const now = performance.now();
  const s = {
    id,
    host,
    n,
    source,
    level,
    still,
    onFaded,
    onError,
    started: now,
    last: now,
    sent: 0,
    seq: prev?.seq || 0,
    fadeMs,
    fadeEnd: now + fadeMs,
    // Von dem aus überblenden, was gerade zu sehen ist (beim ersten Start: von Schwarz)
    from: prev?.shown && prev.n === n ? prev.shown : [[0, 0, 0]],
    fromLevel: prev?.shown ? prev.shownLevel : level,
  };
  s.shown = s.from;
  s.shownLevel = s.fromLevel;
  streams.set(id, s);
  if (!timer) timer = setInterval(tick, 1000 / FPS);
}

/** Strom beenden (WLED kehrt nach seiner Wartezeit zum eigenen Zustand zurück). */
export function stop(id) {
  streams.delete(id);
}

export const isStreaming = (id) => streams.has(id);
