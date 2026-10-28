// Live-Effekte für WLED: der Server berechnet jedes Bild selbst (Farbe je LED, 0–255 wie in WLED vor Gamma und
// Helligkeit) und streamt es. So laufen die Effekte so langsam und weich wie gewünscht, rundum gleichmäßig und
// unabhängig davon, was die WLED-Version auf dem Gerät kann.
//
// Jeder Effekt: create(n) → frame(t, dt) mit t, dt in Sekunden; liefert ein Array aus n Farben [r, g, b].
import { gradient } from './wled-patterns.js';

const TAU = Math.PI * 2;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
// Weiches Hin und Her (0 → 1 → 0) mit der Periode p Sekunden
const breathe = (t, p) => 0.5 - 0.5 * Math.cos((TAU * t) / p);
const approach = (dt, tau) => 1 - Math.exp(-dt / tau); // Anteil, um den ein Wert in dt auf sein Ziel zugeht

/**
 * Flackern wie Flammen: jede LED hat eine Helligkeit, die weich zufälligen Zielwerten folgt; Nachbarn werden etwas
 * angeglichen, damit Flammenbereiche statt Einzelpunkte flackern.
 */
function flames(n, { min, max, rate, smooth, spread, dark, bright }) {
  const level = Array.from({ length: n }, () => min + Math.random() * (max - min));
  const target = [...level];
  const tmp = new Array(n);
  return (t, dt) => {
    const k = approach(dt, smooth);
    for (let i = 0; i < n; i++) {
      if (Math.random() < rate * dt) target[i] = min + Math.random() * (max - min);
      level[i] += (target[i] - level[i]) * k;
    }
    for (let i = 0; i < n; i++) tmp[i] = level[i] * (1 - spread) + ((level[(i + n - 1) % n] + level[(i + 1) % n]) / 2) * spread;
    return tmp.map((v) => scale(mix(dark, bright, v), 0.3 + 0.7 * v));
  };
}

export const LIVE = {
  candle: (n) => flames(n, { min: 0.5, max: 1, rate: 7, smooth: 0.07, spread: 0.35, dark: [150, 40, 0], bright: [255, 140, 40] }),
  fire: (n) => flames(n, { min: 0.25, max: 1, rate: 9, smooth: 0.06, spread: 0.7, dark: [140, 15, 0], bright: [255, 125, 10] }),

  // Ruhiges Atmen in Gold, ein Atemzug ≈ 9 s. Ohne Blauanteil und nicht zu dunkel: die winzigen Werte eines dunklen
  // Blaus/Grüns springen sonst sichtbar zwischen 0 und 1 (Farbzucken)
  pause: () => (t) => [mix([150, 108, 0], [225, 170, 20], breathe(t, 9))],

  // Gleichmäßiges Pulsieren in Rot (≈ 2,4 s), gedämpft statt bis Schwarz
  combat: () => (t) => [mix([90, 0, 0], [255, 12, 0], breathe(t, 2.4) ** 1.5)],

  // Sternenhimmel: Sterne werden langsam heller und dunkler, jeder in seinem eigenen Takt
  night: (n) => {
    const sky = gradient([[6, 10, 48], [12, 16, 70], [4, 8, 36]], n, 80);
    const list = [];
    for (let i = Math.floor(Math.random() * 6); i < n; i += 6 + Math.floor(Math.random() * 10)) {
      list.push({ i, strength: 0.5 + Math.random() * 0.5, period: 5 + Math.random() * 9, phase: Math.random() * 20 });
    }
    const star = [200, 210, 255];
    return (t) => {
      const out = sky.map((c) => [...c]);
      for (const s of list) {
        const v = s.strength * (0.25 + 0.75 * breathe(t + s.phase, s.period));
        out[s.i] = mix(out[s.i], star, v);
        if (s.i > 0) out[s.i - 1] = mix(out[s.i - 1], star, v * 0.2);
        if (s.i + 1 < n) out[s.i + 1] = mix(out[s.i + 1], star, v * 0.2);
      }
      return out;
    };
  },

  // Magie: der Farbverlauf wandert ganz langsam um den Tisch (eine Runde ≈ 2 min)
  magic: (n) => {
    const ring = gradient([[110, 40, 230], [40, 150, 230], [200, 50, 190]], n, 60);
    return (t) => {
      const shift = (t / 120) * n;
      const k = Math.floor(shift);
      const f = shift - k;
      return ring.map((_, i) => mix(ring[(i + k) % n], ring[(i + k + 1) % n], f));
    };
  },

  // Unterwasser: zwei langsam gegeneinander laufende Wellen in Blau/Türkis, helle Wellenkämme
  water: (n) => (t) => {
    const out = new Array(n);
    const cycles = Math.max(1, Math.round(n / 70));
    for (let i = 0; i < n; i++) {
      const x = (i / n) * TAU * cycles;
      const v = 0.5 + 0.28 * Math.sin(x + t * 0.35) + 0.22 * Math.sin(2.3 * x - t * 0.22);
      let c = mix([0, 22, 70], [15, 130, 165], v);
      if (v > 0.82) c = mix(c, [90, 190, 210], (v - 0.82) / 0.18);
      out[i] = c;
    }
    return out;
  },

  // Gewitter: dunkler, leicht wogender Himmel; alle 4–12 s ein Blitz (2–3 schnelle Zuckungen über einem Teil des Tischs)
  storm: (n) => {
    let next = 2 + Math.random() * 4;
    let strike = null;
    return (t) => {
      if (t >= next) {
        const flashes = [{ at: 0, len: 0.07, v: 1 }, { at: 0.14, len: 0.05, v: 0.6 }];
        if (Math.random() < 0.6) flashes.push({ at: 0.3 + Math.random() * 0.15, len: 0.3, v: 0.9, decay: true });
        strike = { start: t, center: Math.random() * n, width: n * (0.2 + Math.random() * 0.35), flashes };
        next = t + 4 + Math.random() * 8;
      }
      let amount = 0;
      if (strike) {
        const s = t - strike.start;
        for (const f of strike.flashes) {
          if (s >= f.at && s < f.at + f.len) amount = Math.max(amount, f.decay ? f.v * (1 - (s - f.at) / f.len) ** 2 : f.v);
        }
        if (s > 1) strike = null;
      }
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        const sky = mix([4, 6, 24], [14, 16, 44], 0.5 + 0.5 * Math.sin((i / n) * TAU * 2 + t * 0.15));
        let hit = 0;
        if (amount && strike) {
          const d = Math.min(Math.abs(i - strike.center), n - Math.abs(i - strike.center)); // Abstand im Ring
          hit = amount * Math.max(0, 1 - (d / strike.width) ** 2);
        }
        out[i] = mix(sky, [215, 220, 255], hit);
      }
      return out;
    };
  },
};

/** Ruhendes Muster als „Effekt“ (gleiches Bild in jedem Schritt). */
export const still = (colors) => () => colors;
