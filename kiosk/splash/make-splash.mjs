// Erzeugt das Startbild für den Bildspeicher des Pi (kiosk-splash): das Motiv als Rohdaten (zlib-komprimiert)
// in mehreren Größen (1080p, 900p, 720p) und zwei Farbtiefen: 16 Bit RGB565 (Bildspeicher des Grafiktreibers)
// und 32 Bit BGRA (Bildspeicher der Firmware in den ersten Sekunden).
// Schrift: DejaVu Serif wie im Kiosk-Browser (Buildroot hat nur DejaVu) – Ordner mit DejaVuSerif.ttf und
// DejaVuSerif-Italic.ttf per DEJAVU_DIR angeben, z.B. aus Buildroots out/target/usr/share/fonts/dejavu.
// Aufruf (im Projektordner, braucht sharp aus node_modules):
//   DEJAVU_DIR=… node kiosk/splash/make-splash.mjs        (PREVIEW=Ordner legt zusätzlich PNG-Vorschauen ab)
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = fileURLToPath(new URL('../files/rootfs/opt/kiosk/splash/', import.meta.url));
const FONTS = process.env.DEJAVU_DIR;
if (!FONTS) throw new Error('DEJAVU_DIR fehlt (Ordner mit DejaVuSerif.ttf und DejaVuSerif-Italic.ttf)');

// Gleiche Farben und Maße (in 1080p) wie die Startseite des Kiosks (start.html): ganzes 16:9-Bild, Würfel in der
// Mitte, Titel und Hinweis viermal – je zu einer Seite des liegenden TVs lesbar.
const BG = '#0b0a08';
const W = 1920;
const H = 1080;
const D_LONG = 216; // Abstand Bildmitte → Textblock oben/unten (20vh)
const D_SHORT = W / 2 - 324; // … links/rechts (Block beginnt 30vh vor dem Rand)
const GAP = 9; // Abstand Titel → Hinweis (0,83vh)

const icon = (size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <g fill="none" stroke="#c9a24a" stroke-width="2.2" stroke-linejoin="round">
    <polygon points="50,4 90,27 90,73 50,96 10,73 10,27"/>
    <polygon points="50,24 74,64 26,64"/>
    <path d="M50,4 50,24 M90,27 74,64 M10,27 26,64 M90,73 74,64 M10,73 26,64 M50,96 50,64 M50,24 90,27 M50,24 10,27 M26,64 50,96 74,64"/>
  </g></svg>`);

const text = (str, color, size, file, style = '') =>
  sharp({ text: { text: `<span foreground="${color}">${str}</span>`, font: `DejaVu Serif ${style}${size}`, fontfile: join(FONTS, file), rgba: true, dpi: 72 } })
    .png()
    .toBuffer({ resolveWithObject: true });

mkdirSync(OUT, { recursive: true });
for (const screenH of [1080, 900, 720]) {
  const k = screenH / 1080;
  const w = Math.round(W * k);
  const h = Math.round(H * k);
  const iconSize = Math.round(160 * k);
  const title = await text('Tabletop Forge', '#c9a24a', Math.round(56 * k), 'DejaVuSerif.ttf');
  const sub = await text('Der Tisch wird vorbereitet …', '#8a7d63', Math.round(26 * k), 'DejaVuSerif-Italic.ttf', 'Italic ');
  // Ein Textblock (Titel über Hinweis, mittig), dann gedreht für die anderen drei Seiten
  const bw = Math.max(title.info.width, sub.info.width);
  const bh = title.info.height + Math.round(GAP * k) + sub.info.height;
  const block = await sharp({ create: { width: bw, height: bh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: title.data, left: Math.round((bw - title.info.width) / 2), top: 0 },
      { input: sub.data, left: Math.round((bw - sub.info.width) / 2), top: title.info.height + Math.round(GAP * k) },
    ])
    .png()
    .toBuffer();
  const turned = async (deg) => sharp(block).rotate(deg).png().toBuffer();
  const cx = w / 2;
  const cy = h / 2;
  const dl = Math.round(D_LONG * k);
  const ds = Math.round(D_SHORT * k);
  const { data } = await sharp({ create: { width: w, height: h, channels: 3, background: BG } })
    .composite([
      { input: icon(iconSize), left: Math.round(cx - iconSize / 2), top: Math.round(cy - iconSize / 2) },
      { input: block, left: Math.round(cx - bw / 2), top: Math.round(cy + dl) }, // unten
      { input: await turned(180), left: Math.round(cx - bw / 2), top: Math.round(cy - dl - bh) }, // oben, kopfüber
      { input: await turned(270), left: Math.round(cx + ds), top: Math.round(cy - bw / 2) }, // rechts
      { input: await turned(90), left: Math.round(cx - ds - bh), top: Math.round(cy - bw / 2) }, // links
    ])
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px16 = Buffer.alloc(w * h * 2);
  const px32 = Buffer.alloc(w * h * 4);
  for (let i = 0, p = 0; i < data.length; i += 3, p++) {
    px16.writeUInt16LE(((data[i] >> 3) << 11) | ((data[i + 1] >> 2) << 5) | (data[i + 2] >> 3), p * 2);
    px32[p * 4] = data[i + 2];
    px32[p * 4 + 1] = data[i + 1];
    px32[p * 4 + 2] = data[i];
    px32[p * 4 + 3] = 255;
  }
  for (const [bpp, px] of [[16, px16], [32, px32]]) {
    const head = Buffer.alloc(8);
    head.write('SPL1');
    head.writeUInt16LE(w, 4);
    head.writeUInt16LE(h, 6);
    writeFileSync(`${OUT}splash-${screenH}-${bpp}.bin`, Buffer.concat([head, deflateSync(px, { level: 9 })]));
  }
  if (process.env.PREVIEW) await sharp(data, { raw: { width: w, height: h, channels: 3 } }).png().toFile(join(process.env.PREVIEW, `splash-${screenH}.png`));
  console.log(`splash-${screenH} ${w}x${h}`);
}
