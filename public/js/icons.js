// Einheitlicher Icon-Satz: Linien-Icons im 24er-Raster, Strichstärke 2, Farbe = Textfarbe.
// Ersetzt Emojis, die je nach Gerät unterschiedlich aussehen.

const PATHS = {
  // Navigation & Bereiche
  play: '<polygon points="7 4 20 12 7 20 7 4"/>',
  map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  skull: '<path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 4.5 3 5.5V21h10v-4.5c1.6-1 3-2.7 3-5.5a8 8 0 0 0-8-8z"/><circle cx="9" cy="11.5" r="1.6"/><circle cx="15" cy="11.5" r="1.6"/><line x1="10.5" y1="21" x2="10.5" y2="18"/><line x1="13.5" y1="21" x2="13.5" y2="18"/>',
  scale: '<line x1="12" y1="3" x2="12" y2="21"/><line x1="7" y1="21" x2="17" y2="21"/><line x1="4" y1="7" x2="20" y2="7"/><path d="M4 7l-3 7a3.5 3.5 0 0 0 6 0z"/><path d="M20 7l-3 7a3.5 3.5 0 0 0 6 0z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  swords: '<line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/><line x1="15" y1="19" x2="19" y2="15"/><line x1="5" y1="15" x2="9" y2="19"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  d20: '<polygon points="12 2 21 7 21 17 12 22 3 17 3 7"/><polygon points="12 7 16.5 15 7.5 15"/><line x1="12" y1="2" x2="12" y2="7"/><line x1="3" y1="17" x2="7.5" y2="15"/><line x1="21" y1="17" x2="16.5" y2="15"/><line x1="3" y1="7" x2="7.5" y2="15"/><line x1="21" y1="7" x2="16.5" y2="15"/>',

  // Kartenwerkzeuge
  cursor: '<path d="M5 3l14 8-6.2 1.8L11 19z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="6.3" y2="17.7"/><line x1="17.7" y1="6.3" x2="19.1" y2="4.9"/>',
  cloud: '<path d="M17.5 19H7a5 5 0 1 1 1.6-9.7A6 6 0 0 1 20 11.5a3.75 3.75 0 0 1-2.5 7.5z"/>',
  rect: '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 3"/>',
  token: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18a6 6 0 0 1 11 0"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"/>',
  aoe: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9" stroke-dasharray="2.5 3"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  eraser: '<path d="M20 20H8l-5-5a2 2 0 0 1 0-2.8l9.2-9.2a2 2 0 0 1 2.8 0l5.2 5.2a2 2 0 0 1 0 2.8L11 20"/><line x1="6" y1="11" x2="13" y2="18"/>',
  ruler: '<rect x="2" y="8" width="20" height="8" rx="1"/><line x1="6" y1="8" x2="6" y2="11"/><line x1="10" y1="8" x2="10" y2="12"/><line x1="14" y1="8" x2="14" y2="11"/><line x1="18" y1="8" x2="18" y2="12"/>',
  ping: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8a7 7 0 0 0 7 7z"/>',
  crosshair: '<circle cx="12" cy="12" r="8"/><line x1="12" y1="1" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="23"/><line x1="1" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="23" y2="12"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="1"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>',
  rotateLeft: '<polyline points="1 4 1 10 7 10"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/>',
  rotateRight: '<polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>',

  // Allgemeine Aktionen
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16" y2="16"/>',
  clipboard: '<rect x="6" y="4" width="12" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.9 17.9A10.1 10.1 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.1-5.9"/><path d="M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2"/><line x1="1" y1="1" x2="23" y2="23"/>',
  pin: '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-2-4V5h1V3H6v2h1v8z"/>',
  chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
  chevronRight: '<polyline points="9 18 15 12 9 6"/>',
  chevronDown: '<polyline points="6 9 12 15 18 9"/>',
  maximize: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  sparkles: '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.1 2.2.9-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.9z"/><path d="M5 16l.6 1.4L7 18l-1.4.6L5 20l-.6-1.4L3 18l1.4-.6z"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  flag: '<path d="M4 22V4"/><path d="M4 4h13l-2.5 4 2.5 4H4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
};

const NS = 'http://www.w3.org/2000/svg';

/** Liefert ein Icon als SVG-Element. */
export function icon(name, { size, title, className = '' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', title ? 'false' : 'true');
  svg.setAttribute('class', `icon ${className}`.trim());
  if (size) {
    svg.style.width = typeof size === 'number' ? `${size}px` : size;
    svg.style.height = svg.style.width;
  }
  svg.innerHTML = (title ? `<title>${title}</title>` : '') + (PATHS[name] || PATHS.x);
  return svg;
}

export const ICON_NAMES = Object.keys(PATHS);
