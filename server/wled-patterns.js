// Ruhende Lichtmuster für WLED: Farbe je LED, vom Server berechnet und einmal gesendet. Kein Effekt auf dem Gerät –
// nichts flackert, nichts wandert, nichts hängt von Paletten der WLED-Version ab.

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
// Weiche Kurve statt linearer Übergänge: die Farbstellen gehen sanft ineinander über
const ease = (t) => t * t * (3 - 2 * t);

/** Kleiner, fester Zufallsgenerator: dasselbe Muster bei jedem Senden (kein Springen beim Wiederholen). */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * Ringförmiger Verlauf über n LEDs: die Farbstellen wiederholen sich alle `period` LEDs, das Ende geht nahtlos in den
 * Anfang über (Streifen rund um den Tisch). Eine einzelne Farbe ergibt einfarbiges Licht.
 */
export function gradient(stops, n, period = 60) {
  if (stops.length === 1) return Array.from({ length: n }, () => stops[0]);
  // So viele Wiederholungen, dass eine ganze Zahl in den Ring passt (sonst Bruchkante am Übergang)
  const cycles = Math.max(1, Math.round(n / period));
  const out = [];
  for (let i = 0; i < n; i++) {
    const pos = ((i / n) * cycles * stops.length) % stops.length;
    const k = Math.floor(pos);
    out.push(mix(stops[k], stops[(k + 1) % stops.length], ease(pos - k)));
  }
  return out;
}

/** Sterne: einzelne, unterschiedlich helle LEDs auf dem Grund, mit weichem Rand zu den Nachbarn. */
export function stars(base, color, { every = 9, seed = 7 } = {}) {
  const out = base.map((c) => [...c]);
  const rand = rng(seed);
  for (let i = Math.floor(rand() * every); i < out.length; i += Math.max(3, Math.round(every * (0.6 + rand() * 0.8)))) {
    const strength = 0.45 + rand() * 0.55;
    out[i] = mix(out[i], color, strength);
    const glow = strength * 0.25;
    if (i > 0) out[i - 1] = mix(out[i - 1], color, glow);
    if (i + 1 < out.length) out[i + 1] = mix(out[i + 1], color, glow);
  }
  return out;
}

/** Leichte, feste Unregelmäßigkeit (z.B. Blätter): jede LED etwas heller oder dunkler. */
export function vary(colors, amount = 0.15, seed = 3) {
  const rand = rng(seed);
  return colors.map((c) => {
    const f = 1 - amount + rand() * amount * 2;
    return c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  });
}

const hex = (c) => c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

/**
 * WLED-Liste für einzelne LEDs ("i"): gleiche Nachbarn werden zu Bereichen [start, stop, farbe] zusammengefasst,
 * das hält die Nachricht klein (ESP8266 haben wenig Speicher für JSON).
 */
export function toWledList(colors) {
  const out = [];
  let start = 0;
  for (let i = 1; i <= colors.length; i++) {
    if (i < colors.length && hex(colors[i]) === hex(colors[start])) continue;
    if (i - start === 1) out.push(hex(colors[start]));
    else out.push(start, i, hex(colors[start]));
    start = i;
  }
  return out;
}
