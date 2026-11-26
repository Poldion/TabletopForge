// Kartenbauer: Gegenstände für Außenkarten – Ruinenreste (Mauerstücke, Mauerecke, Torbogen, Treppe in die Tiefe,
// umgestürzte Statue), Totholz, Wurzelwerk, Laubhaufen, Moospolster und kleine Steine. Gleicher Stil wie der übrige
// Katalog: Tuschekontur, gedeckte Farben; Stein nimmt die Felsfarben der Umgebung an.
import { tr } from './i18n.js';

/** h: Zeichenbausteine aus mb-assets.js. */
export function outdoorAssets(h) {
  const { svg, svgF, O, T, WD, f1, INK, mulberry, smoothPath } = h;
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  /** Farbe zwischen a und b (t = 0 … 1), leicht verrauscht. */
  const mixc = (a, b, t) => `rgb(${hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t)).join(',')})`;
  const blob = (seed, cx, cy, rx, ry, n = 9, jit = 0.22) => {
    const r = mulberry(seed);
    return smoothPath(Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 6.283;
      const k = 1 - jit / 2 + r() * jit;
      return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
    }));
  };
  const MOSS = ['#5d7440', '#6f8a4a', '#4c6236'];
  const moss = (r, x, y, s = 1) => `<path d="${blob(Math.floor(r() * 1e5), x, y, 7 * s, 5 * s, 7, 0.5)}" fill="${MOSS[Math.floor(r() * 3)]}" opacity=".85"/>`;

  /**
   * Mauerstück von oben: zwei Lagen unregelmäßiger Steine längs einer Strecke von (x0, y) nach rechts, Länge len.
   * Die Enden sind ausgebrochen (Lagen enden versetzt), dazu ein paar lose Steine daneben.
   */
  const wallRun = (r, B, x0, y0, len, thick = 40) => {
    let s = '';
    const top = B.rock.top;
    const side = B.rock.side;
    const courses = [y0, y0 + thick / 2];
    courses.forEach((cy, k) => {
      // jede Lage beginnt und endet an einer anderen Stelle: ausgebrochene Enden
      let x = x0 + r() * 14 * (k + 0.5);
      const end = x0 + len - r() * 18 * (k + 0.6);
      while (x < end - 8) {
        const w = Math.min(end - x, 22 + r() * 20);
        const hh = thick / 2 - 1.5;
        s += `<rect x="${f1(x)}" y="${f1(cy + (r() - 0.5) * 1.5)}" width="${f1(w - 2)}" height="${f1(hh)}" rx="2.6" fill="${mixc(side, top, 0.35 + r() * 0.6)}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
        if (r() < 0.16) s += moss(r, x + w / 2, cy + hh / 2, 0.8);
        x += w;
      }
    });
    // lose Steine neben der Mauer
    for (let i = 0; i < 3; i++) {
      const x = x0 + r() * len;
      const y = r() < 0.5 ? y0 - 9 - r() * 6 : y0 + thick + 6 + r() * 6;
      const sz = 4 + r() * 5;
      s += `<path d="${blob(Math.floor(r() * 1e5), x, y, sz, sz * 0.8, 6, 0.4)}" fill="${mixc(side, top, r())}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`;
    }
    return s;
  };

  /** Ast oder Wurzel: verjüngt sich in Stücken und gabelt sich; liefert [Kontur, Holz]. */
  const limbs = (r, x, y, a, len, w, depth, bend = 0.6) => {
    let dark = '';
    let wood = '';
    const go = (x1, y1, a1, l1, w1, d1) => {
      for (let i = 0; i < 3; i++) {
        const step = (l1 / 3) * (0.8 + r() * 0.4);
        a1 += (r() - 0.5) * bend;
        const nx = x1 + Math.cos(a1) * step;
        const ny = y1 + Math.sin(a1) * step;
        const ww = Math.max(1, w1 * (1 - i * 0.26));
        dark += `<path d="M${f1(x1)} ${f1(y1)} L${f1(nx)} ${f1(ny)}" stroke-width="${f1(ww + 2.4)}"/>`;
        wood += `<path d="M${f1(x1)} ${f1(y1)} L${f1(nx)} ${f1(ny)}" stroke-width="${f1(ww)}"/>`;
        x1 = nx;
        y1 = ny;
        if (d1 && i > 0 && r() < 0.7) go(x1, y1, a1 + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), l1 * (0.4 + r() * 0.25), ww * 0.6, d1 - 1);
      }
    };
    go(x, y, a, len, w, depth);
    return [dark, wood];
  };

  return {
    ruinWall: {
      cat: 'outdoor', label: tr('Mauerrest'), h: 12, tags: 'ruine mauer wall ruin',
      make: (v, B) => {
        const r = mulberry(v + 31);
        const len = [150, 200, 250][v % 3];
        return svg(len + 20, 80, wallRun(r, B, 10, 20, len), 1.6);
      },
    },
    ruinCorner: {
      cat: 'outdoor', label: tr('Mauerecke'), h: 14, tags: 'ruine mauer ecke ruin corner',
      make: (v, B) => {
        const r = mulberry(v + 47);
        const a = 120 + (v % 3) * 25;
        const b = 100 + ((v >> 2) % 3) * 25;
        return svg(a + 50, b + 50, `${wallRun(r, B, 14, 14, a)}<g transform="rotate(90 34 34)">${wallRun(r, B, 14, 14, b)}</g>`, 1.6);
      },
    },
    ruinArch: {
      cat: 'outdoor', label: tr('Torbogen-Ruine'), h: 26, tags: 'ruine tor bogen arch gate ruin',
      make: (v, B) => {
        const r = mulberry(v + 59);
        const pier = (x) => `<rect x="${x}" y="22" width="44" height="44" rx="3" fill="${B.rock.side}" ${O}/><rect x="${x + 6}" y="28" width="32" height="32" rx="2" fill="${B.rock.top}" stroke="${B.rock.line}" stroke-width="1.2"/>`;
        // Sturz: vom linken Pfeiler her erhalten, rechts abgebrochen; Bruchstücke liegen davor
        let lintel = '';
        let x = 38;
        const end = 110 + r() * 40;
        while (x < end) {
          const w = 18 + r() * 10;
          lintel += `<rect x="${f1(x)}" y="32" width="${f1(w - 2)}" height="24" rx="2.5" fill="${mixc(B.rock.side, B.rock.top, 0.5 + r() * 0.5)}" stroke="${INK}" stroke-width="1.7"/>`;
          x += w;
        }
        let fallen = '';
        for (let i = 0; i < 4; i++) {
          const fx = 90 + r() * 80;
          const fy = 74 + r() * 18;
          fallen += `<rect x="${f1(fx)}" y="${f1(fy)}" width="${f1(16 + r() * 8)}" height="${f1(11 + r() * 5)}" rx="2.5" fill="${mixc(B.rock.side, B.rock.top, r())}" stroke="${INK}" stroke-width="1.6" transform="rotate(${f1((r() - 0.5) * 60)} ${f1(fx + 10)} ${f1(fy + 6)})"/>`;
        }
        return svg(230, 104, `${fallen}${pier(14)}${pier(172)}${lintel}${moss(r, 36, 44)}${moss(r, 194, 40)}`, 1.6);
      },
    },
    stairsDown: {
      cat: 'outdoor', label: tr('Treppe in die Tiefe'), h: 18, tags: 'treppe abgang eingang dungeon stairs entrance ruin',
      make: (v, B) => {
        const r = mulberry(v + 71);
        // Stufen von oben (hell) nach unten (dunkel), seitlich Mauern aus Steinblöcken, unten Dunkelheit
        let steps = '';
        for (let i = 0; i < 8; i++) {
          const y = 30 + i * 17;
          const t = i / 7;
          steps += `<rect x="36" y="${y}" width="88" height="16" fill="${mixc(B.rock.top, '#1a1814', t * 0.85)}" stroke="${INK}" stroke-width="1.3"/>`;
          steps += `<path d="M37 ${y + 14.5} H123" stroke="#000" stroke-width="2.5" opacity="${f1(0.15 + t * 0.2)}"/>`;
        }
        const side = (x) => {
          let s = '';
          for (let y = 14; y < 176; ) {
            const hh = 16 + r() * 14;
            s += `<rect x="${x}" y="${f1(y)}" width="24" height="${f1(Math.min(hh, 180 - y) - 2)}" rx="2.5" fill="${mixc(B.rock.side, B.rock.top, 0.3 + r() * 0.6)}" stroke="${INK}" stroke-width="1.7"/>`;
            y += hh;
          }
          return s;
        };
        // Rückwand oben und schwarzer Abgrund unten
        return svg(160, 196, `<rect x="36" y="150" width="88" height="30" fill="#0e0d0b"/>${steps}<path d="M36 112 H124 V180 H36Z" fill="#000" opacity=".35"/>${side(10)}${side(126)}<rect x="10" y="8" width="140" height="22" rx="3" fill="${B.rock.side}" ${O}/><rect x="16" y="12" width="128" height="14" rx="2" fill="${B.rock.top}" stroke="${B.rock.line}" stroke-width="1.1"/>${moss(r, 22, 60)}${moss(r, 138, 120)}`, 1.4);
      },
    },
    fallenStatue: {
      cat: 'outdoor', label: tr('Umgestürzte Statue'), h: 12, tags: 'statue ruine ruin',
      make: (v, B) => {
        const r = mulberry(v + 83);
        const st = B.rock.top;
        const sd = B.rock.side;
        const ln = B.rock.line;
        const lite = mixc(st, '#ffffff', 0.18);
        // Von links nach rechts: Sockel mit den abgebrochenen Füßen – dort stand sie –, dann die Figur, rücklings
        // hingeschlagen: Gewand mit Faltenwurf, Schultern, ein Arm vor der Brust; am Hals abgebrochen, der Kopf ein
        // Stück weitergerollt (Gesicht nach oben). Der andere Arm liegt abgebrochen daneben, dazu Bruchstücke und Moos.
        const body = smoothPath([[78, 38], [100, 40], [124, 39], [148, 35], [168, 29], [184, 27], [193, 34], [195, 48], [195, 62], [193, 76], [184, 83], [168, 81], [148, 75], [124, 71], [100, 70], [78, 72], [73, 55]]);
        // abgebrochener Saum: gezackte, helle Bruchfläche am Fußende
        const breakEdge = 'M78 40 L74 46 L77 50 L72 55 L76 60 L73 65 L78 70';
        const crack = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`;
        let bits = '';
        for (let i = 0; i < 7; i++) {
          const x = [64, 70, 200, 208, 150, 120, 88][i] + (r() - 0.5) * 8;
          const y = [92, 22, 88, 30, 90, 24, 96][i] + (r() - 0.5) * 6;
          const z = 3.5 + r() * 4;
          bits += `<path d="${blob(Math.floor(r() * 1e5), x, y, z, z * 0.8, 6, 0.45)}" fill="${mixc(sd, st, r())}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
        }
        return svg(250, 120, `
<rect x="6" y="30" width="54" height="54" rx="3" fill="${sd}" ${O}/><rect x="12" y="36" width="42" height="42" rx="2" fill="${st}" stroke="${ln}" stroke-width="1.2"/>
<path d="M12 44 H54" stroke="${ln}" stroke-width="1" opacity=".5"/>
<path d="M22 44 Q20 50 26 52 L40 52 Q46 50 44 46 Q38 42 26 43Z M22 62 Q20 68 26 70 L40 70 Q46 68 44 64 Q38 60 26 61Z" fill="${st}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
<ellipse cx="38" cy="47.5" rx="5" ry="3.6" fill="${lite}" stroke="${INK}" stroke-width="1.1"/><ellipse cx="38" cy="65.5" rx="5" ry="3.6" fill="${lite}" stroke="${INK}" stroke-width="1.1"/>
<path d="${body}" fill="${sd}" stroke="${INK}" stroke-width="2.3" transform="translate(2 4)"/>
<path d="${body}" fill="${st}" ${O}/>
<path d="${breakEdge}" fill="none" stroke="${lite}" stroke-width="3" stroke-linejoin="round"/>
<path d="M84 43 Q120 46 150 41 M84 50 Q118 52 146 50 M84 60 Q118 59 146 62 M84 67 Q120 65 150 70" fill="none" stroke="${ln}" stroke-width="1.3" opacity=".75"/>
<path d="M146 37 Q142 55 146 74" fill="none" stroke="${ln}" stroke-width="2.4" opacity=".85"/>
<path d="M150 37 Q153 55 150 74" fill="none" stroke="${ln}" stroke-width="1.1" opacity=".6"/>
<path d="M168 32 Q174 55 168 79" fill="none" stroke="${ln}" stroke-width="1.1" opacity=".55"/>
<path d="M186 29 L182 33 L186 36 L181 40" fill="none" stroke="${lite}" stroke-width="2.6" stroke-linejoin="round"/>
<path d="M186 29 L182 33 L186 36 L181 40" fill="none" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
<path d="M186 76 Q174 72 166 64 Q160 57 150 56" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
<path d="M186 76 Q174 72 166 64 Q160 57 150 56" fill="none" stroke="${lite}" stroke-width="7.4" stroke-linecap="round"/>
<circle cx="148" cy="56" r="4.8" fill="${lite}" stroke="${INK}" stroke-width="1.4"/>
${crack('M118 41 L114 48 L119 53 L115 60 L118 67')}${crack('M170 36 L166 43 L170 47')}
<path d="M195 46 L199 50 L196 54 L200 58 L195 62" fill="none" stroke="${lite}" stroke-width="2.6" stroke-linejoin="round"/>
<g transform="rotate(${f1(-14 + r() * 10)} 220 56)">
<ellipse cx="221" cy="57" rx="16" ry="14" fill="${sd}" stroke="${INK}" stroke-width="2.2" transform="translate(1.5 3)"/>
<ellipse cx="221" cy="57" rx="16" ry="14" fill="${st}" ${O}/>
<path d="M226 44 Q240 50 238 57 Q240 64 226 70 Q233 57 226 44Z" fill="${mixc(sd, st, 0.35)}" stroke="${INK}" stroke-width="1.3"/>
<path d="M214 52 q2 -2 4 0 M214 62 q2 2 4 0" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
<path d="M210 57 h-4" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
<path d="M205 50 L208 54 L205 58 L208 62" fill="none" stroke="${lite}" stroke-width="2.2"/>
</g>
<g transform="rotate(${f1(18 + r() * 14)} 120 96)">
<rect x="102" y="91" width="34" height="11" rx="5.5" fill="${st}" ${O}/><path d="M136 91 l3 3 l-3 2.5 l3 3 l-3 2.5" fill="none" stroke="${lite}" stroke-width="2"/>
<circle cx="102" cy="96.5" r="5" fill="${lite}" stroke="${INK}" stroke-width="1.4"/>
</g>
${bits}${moss(r, 104, 62, 1)}${moss(r, 30, 76, 0.8)}${moss(r, 186, 44, 0.7)}`, 1.4);
      },
    },
    roots: {
      cat: 'nature', label: tr('Wurzelwerk'), h: 6, tags: 'wurzeln wurzel roots',
      make: (v) => {
        const r = mulberry(v + 97);
        let dark = '';
        let wood = '';
        const n = 6 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const [d, w] = limbs(r, 80, 80, (i / n) * 6.283 + r() * 0.8, 40 + r() * 30, 6.5, 2, 0.9);
          dark += d;
          wood += w;
        }
        return svgF(160, 160, `<g fill="none" stroke="${INK}" stroke-linecap="round">${dark}</g><g fill="none" stroke="#7a6446" stroke-linecap="round">${wood}</g><path d="${blob(v, 80, 80, 15, 13, 8, 0.3)}" fill="#6b5638" ${O}/><path d="M74 76 q6 -4 12 2 M76 84 q5 3 9 -1" stroke="${INK}" stroke-width="1.2" fill="none"/>`);
      },
    },
    deadwood: {
      cat: 'nature', label: tr('Totholz'), h: 8, tags: 'holz äste reisig deadwood branches',
      make: (v) => {
        const r = mulberry(v + 113);
        let s = '';
        for (let i = 0; i < 6; i++) {
          const x = 30 + r() * 70;
          const y = 26 + r() * 40;
          const a = (r() - 0.5) * 120;
          const len = 40 + r() * 40;
          const w = 7 + r() * 6;
          s += `<g transform="rotate(${f1(a)} ${f1(x)} ${f1(y)})"><rect x="${f1(x - len / 2)}" y="${f1(y - w / 2)}" width="${f1(len)}" height="${f1(w)}" rx="${f1(w / 2)}" fill="${mixc('#5f4e36', '#8a7452', r())}" ${T}/><circle cx="${f1(x + len / 2 - w / 2)}" cy="${f1(y)}" r="${f1(w / 2 - 1)}" fill="#b09a72" stroke="${INK}" stroke-width="1"/></g>`;
        }
        return svg(130, 92, s, 1.8);
      },
    },
    leafPile: {
      cat: 'nature', label: tr('Laubhaufen'), h: 5, tags: 'laub blätter leaves',
      make: (v) => {
        const r = mulberry(v + 127);
        let leaves = '';
        for (let i = 0; i < 46; i++) {
          const a = r() * 6.283;
          const d = Math.sqrt(r()) * 34;
          leaves += `<ellipse cx="${f1(50 + Math.cos(a) * d)}" cy="${f1(40 + Math.sin(a) * d * 0.75)}" rx="${f1(3 + r() * 2)}" ry="${f1(1.8 + r())}" transform="rotate(${f1(r() * 180)} ${f1(50 + Math.cos(a) * d)} ${f1(40 + Math.sin(a) * d * 0.75)})" fill="${['#b5752f', '#c99a3e', '#8f5a2a', '#a0662c', '#7d6236'][i % 5]}"/>`;
        }
        return svg(100, 80, `<path d="${blob(v, 50, 40, 40, 30, 10, 0.3)}" fill="#7d5c30" ${O}/>${leaves}`, 2);
      },
    },
    mossPatch: {
      cat: 'nature', label: tr('Moospolster'), h: 0, layer: 'rug', tags: 'moos moss',
      make: (v) => {
        const r = mulberry(v + 139);
        let d = '';
        for (let i = 0; i < 26; i++) d += `<circle cx="${f1(14 + r() * 92)}" cy="${f1(12 + r() * 66)}" r="${f1(1 + r() * 1.6)}" fill="${['#8fae5c', '#3e5430', '#a8b86a'][i % 3]}"/>`;
        return svgF(120, 90, `<path d="${blob(v, 60, 45, 52, 38, 11, 0.4)}" fill="#5a7238" opacity=".85"/><path d="${blob(v + 5, 56, 42, 34, 24, 9, 0.4)}" fill="#6c8644" opacity=".8"/>${d}`, 2);
      },
    },
    pebbles: {
      cat: 'nature', label: tr('Kleine Steine'), h: 3, tags: 'steine kiesel stones pebbles',
      make: (v, B) => {
        const r = mulberry(v + 151);
        let s = '';
        for (let i = 0; i < 7; i++) {
          const x = 14 + r() * 52;
          const y = 12 + r() * 36;
          const sz = 3 + r() * 6;
          s += `<path d="${blob(v * 7 + i, x, y, sz, sz * 0.75, 6, 0.4)}" fill="${mixc(B.rock.side, B.rock.top, r())}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`;
        }
        return svg(80, 60, s, 1.6);
      },
    },
  };
}
