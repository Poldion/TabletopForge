// Erzeugt die Karte der Beispielkampagne (Dorfplatz am Moor) als PNG – eigenes Werk, steht unter der MIT-Lizenz.
// 20 × 14 Felder à 70 px. Aufruf im Projektordner: node server/demo/make-map.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const W = 1400;
const H = 980;
const rnd = (() => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

const tufts = Array.from({ length: 260 }, () => `<circle cx="${(rnd() * W).toFixed(0)}" cy="${(rnd() * H).toFixed(0)}" r="${(2 + rnd() * 5).toFixed(1)}" fill="#5f7233" opacity="0.55"/>`).join('');
const stones = Array.from({ length: 420 }, () => {
  const x = 430 + rnd() * 540;
  const y = 300 + rnd() * 380;
  return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(14 + rnd() * 14).toFixed(0)}" height="${(10 + rnd() * 10).toFixed(0)}" rx="4" fill="#a39886" stroke="#7d7360" stroke-width="1.5" opacity="0.9"/>`;
}).join('');
const tree = (x, y, r) => `<g><circle cx="${x + 6}" cy="${y + 8}" r="${r}" fill="#000" opacity="0.25"/><circle cx="${x}" cy="${y}" r="${r}" fill="#3f5a25" stroke="#23331a" stroke-width="3"/><circle cx="${x - r / 3}" cy="${y - r / 3}" r="${r / 2}" fill="#4f6d2c"/></g>`;
const house = (x, y, w, h, roof = '#7a3b2a') =>
  `<g><rect x="${x + 8}" y="${y + 10}" width="${w}" height="${h}" fill="#000" opacity="0.3"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${roof}" stroke="#3b1d14" stroke-width="4"/><line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="#3b1d14" stroke-width="3"/>${Array.from({ length: Math.floor(w / 18) }, (_, i) => `<line x1="${x + 9 + i * 18}" y1="${y}" x2="${x + 9 + i * 18}" y2="${y + h}" stroke="#5e2c1f" stroke-width="1.5" opacity="0.6"/>`).join('')}</g>`;
const crate = (x, y) => `<rect x="${x}" y="${y}" width="34" height="34" fill="#9a6b3f" stroke="#4a3018" stroke-width="3"/><path d="M${x} ${y} L${x + 34} ${y + 34} M${x + 34} ${y} L${x} ${y + 34}" stroke="#4a3018" stroke-width="2"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#748a3f"/>
  ${tufts}
  <!-- Moor im Osten -->
  <path d="M1080 0 C1150 160 1050 300 1180 420 C1290 520 1200 760 1320 980 L1400 980 L1400 0 Z" fill="#4b5a39"/>
  <ellipse cx="1260" cy="220" rx="70" ry="40" fill="#3d5a5a" stroke="#2b3d3a" stroke-width="3"/>
  <ellipse cx="1300" cy="620" rx="55" ry="32" fill="#3d5a5a" stroke="#2b3d3a" stroke-width="3"/>
  <ellipse cx="1210" cy="830" rx="40" ry="24" fill="#3d5a5a" stroke="#2b3d3a" stroke-width="3"/>
  <!-- Wege -->
  <path d="M0 490 L440 490" stroke="#8a7a5c" stroke-width="110" fill="none"/>
  <path d="M700 0 L700 300" stroke="#8a7a5c" stroke-width="100" fill="none"/>
  <path d="M960 500 C1080 520 1150 560 1400 540" stroke="#7d6e52" stroke-width="80" fill="none"/>
  <path d="M700 680 L640 980" stroke="#8a7a5c" stroke-width="100" fill="none"/>
  <!-- Platz -->
  <rect x="420" y="290" width="560" height="400" rx="60" fill="#8f8573" stroke="#6d6453" stroke-width="5"/>
  ${stones}
  <!-- Brunnen -->
  <circle cx="700" cy="490" r="78" fill="#000" opacity="0.25"/>
  <circle cx="700" cy="490" r="70" fill="#7b7466" stroke="#4a443a" stroke-width="6"/>
  <circle cx="700" cy="490" r="46" fill="#2f4f4a" stroke="#1d2f2c" stroke-width="5"/>
  <circle cx="700" cy="490" r="20" fill="#3f6b60" opacity="0.8"/>
  <!-- Häuser -->
  ${house(150, 170, 210, 150)}
  ${house(160, 640, 190, 170, '#6b4a2a')}
  ${house(470, 100, 170, 130)}
  ${house(790, 90, 210, 150, '#6b4a2a')}
  ${house(820, 760, 200, 150)}
  ${house(420, 760, 170, 140, '#5a5a62')}
  <!-- Bäume -->
  ${tree(70, 70, 46)}${tree(400, 40, 38)}${tree(1040, 220, 44)}${tree(80, 880, 50)}${tree(1010, 640, 36)}${tree(330, 520, 30)}${tree(1110, 920, 42)}
  <!-- Marktstand und Kisten -->
  <rect x="560" y="330" width="120" height="60" fill="#a33b2f" stroke="#4a1a14" stroke-width="4"/>
  <rect x="560" y="330" width="120" height="14" fill="#e8d9b0" opacity="0.8"/>
  ${crate(870, 600)}${crate(910, 600)}${crate(890, 566)}
  <!-- Nebel über dem Moor -->
  <ellipse cx="1260" cy="420" rx="200" ry="120" fill="#e6ece8" opacity="0.18"/>
  <ellipse cx="1220" cy="760" rx="220" ry="140" fill="#e6ece8" opacity="0.15"/>
</svg>`;

const out = fileURLToPath(new URL('./dorfplatz.png', import.meta.url));
await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(out);
console.log('geschrieben:', out);
