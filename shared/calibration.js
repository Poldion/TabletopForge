// Umrechnung der Hardware-Kalibrierung des TV-Tisches in Pixelmaße.
// Ein Rasterfeld ist auf dem Tisch immer exakt 1 × 1 Zoll groß.

export const CELL_INCH = 1;

export const DEFAULT_SETTINGS = {
  table: {
    resW: 3840,
    resH: 2160,
    aspectW: 16,
    aspectH: 9,
    sizeMode: 'diagonal', // 'diagonal' | 'dimensions'
    diagonalIn: 55,
    widthMm: 1210,
    heightMm: 680,
    fineTune: 1, // Korrekturfaktor nach Nachmessen
    rotation: 0, // 0 | 90 | 180 | 270
  },
};

/** Physische Größe des Bildschirms in Zoll. */
export function physicalSize(t) {
  if (t.sizeMode === 'dimensions' && t.widthMm > 0 && t.heightMm > 0) {
    return { widthIn: t.widthMm / 25.4, heightIn: t.heightMm / 25.4 };
  }
  const ar = t.aspectW > 0 && t.aspectH > 0 ? t.aspectW / t.aspectH : t.resW / t.resH;
  const d = t.diagonalIn > 0 ? t.diagonalIn : 55;
  const heightIn = d / Math.sqrt(1 + ar * ar);
  return { widthIn: heightIn * ar, heightIn };
}

/** Gerätepixel pro Zoll (horizontal/vertikal). */
export function devicePpi(t) {
  const { widthIn, heightIn } = physicalSize(t);
  const f = t.fineTune > 0 ? t.fineTune : 1;
  return { x: (t.resW / widthIn) * f, y: (t.resH / heightIn) * f };
}

/** Kantenlänge eines Rasterfeldes (1 Zoll) in Gerätepixeln, getrennt nach Achse. */
export function cellDevicePxXY(t) {
  const ppi = devicePpi(t);
  return { x: ppi.x * CELL_INCH, y: ppi.y * CELL_INCH };
}

/** Mittlere Kantenlänge eines Rasterfeldes in Gerätepixeln. */
export function cellDevicePx(t) {
  const c = cellDevicePxXY(t);
  return (c.x + c.y) / 2;
}

/** Anzahl sichtbarer Rasterfelder auf dem Tisch (unter Berücksichtigung der Drehung). */
export function tableCells(t) {
  const { widthIn, heightIn } = physicalSize(t);
  const f = t.fineTune > 0 ? t.fineTune : 1;
  let w = widthIn / f / CELL_INCH;
  let h = heightIn / f / CELL_INCH;
  if (t.rotation === 90 || t.rotation === 270) [w, h] = [h, w];
  return { w, h };
}

export function mergeSettings(saved) {
  const table = { ...DEFAULT_SETTINGS.table, ...(saved?.table || {}) };
  delete table.cellInch;
  return { table };
}

// HDMI-Ausgabemodi für Kiosk-Geräte (Raspberry Pi, Kernel-Parameter video=HDMI-A-1:…)
export const OUTPUT_MODES = {
  auto: 'Automatisch (TV-Vorgabe; Pi Zero 2 W / Pi 3: 1280 × 720 für flüssige Animationen)',
  '1920x1080@60': '1920 × 1080 (60 Hz)',
  '1920x1080@50': '1920 × 1080 (50 Hz)',
  '1920x1080@30': '1920 × 1080 (30 Hz)',
  '1600x900@60': '1600 × 900 (60 Hz, Mittelweg für Pi Zero 2 W)',
  '1280x720@60': '1280 × 720 (60 Hz)',
  '3840x2160@30': '3840 × 2160 (30 Hz, nicht Pi Zero)',
};

const num = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/**
 * Prüft Monitordaten (z.B. eines Kiosk-Geräts) und ergänzt fehlende Werte.
 * Liefert immer ein vollständiges, gültiges Objekt.
 */
export function sanitizeTable(t = {}, base = DEFAULT_SETTINGS.table) {
  const d = { ...DEFAULT_SETTINGS.table, ...base };
  return {
    resW: Math.round(num(t.resW, 320, 16384, d.resW)),
    resH: Math.round(num(t.resH, 240, 16384, d.resH)),
    aspectW: num(t.aspectW, 1, 100, d.aspectW),
    aspectH: num(t.aspectH, 1, 100, d.aspectH),
    sizeMode: t.sizeMode === 'dimensions' ? 'dimensions' : t.sizeMode === 'diagonal' ? 'diagonal' : d.sizeMode,
    diagonalIn: num(t.diagonalIn, 5, 300, d.diagonalIn),
    widthMm: num(t.widthMm, 50, 8000, d.widthMm),
    heightMm: num(t.heightMm, 50, 8000, d.heightMm),
    fineTune: num(t.fineTune, 0.5, 2, d.fineTune),
    rotation: [0, 90, 180, 270].includes(Number(t.rotation)) ? Number(t.rotation) : d.rotation,
    output: Object.hasOwn(OUTPUT_MODES, t.output) ? t.output : 'auto',
  };
}
