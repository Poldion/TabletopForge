// Encounter-Schwierigkeit nach den Regeln der 5. Edition (Spielleiterhandbuch 2014):
// EP der Monster × Multiplikator für die Gegneranzahl, verglichen mit den EP-Schwellen der Gruppe. Ohne DOM.
import { tr } from './i18n.js';

/** EP-Schwellen je Charakterstufe: [leicht, mittel, schwer, tödlich]. */
export const THRESHOLDS = {
  1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700],
};

/** EP je Herausforderungsgrad. */
export const CR_XP = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900,
  11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
  21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000,
};

export const DIFFICULTIES = [
  { key: 'trivial', name: 'Trivial', color: '#78909c', text: tr('Kaum eine Herausforderung.') },
  { key: 'easy', name: 'Leicht', color: '#5aa469', text: tr('Verbraucht kaum Ressourcen, ein Charakter wird höchstens leicht verletzt.') },
  { key: 'medium', name: 'Mittel', color: '#c9a24a', text: tr('Ein paar Treffer, vielleicht ein verbrauchter Zauber – aber kein Charakter sollte fallen.') },
  { key: 'hard', name: 'Schwer', color: '#e07a30', text: tr('Kann ungünstig laufen: schwache Charaktere können fallen, ein Tod ist unwahrscheinlich, aber möglich.') },
  { key: 'deadly', name: 'Tödlich', color: '#c0473a', text: tr('Kann für einen oder mehrere Charaktere tödlich enden – die Gruppe braucht Glück und gute Taktik.') },
];

const MULTIPLIER_STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

/** „1/4“, „0.5“, „2 (450 XP)“ → Zahl; null, wenn kein HG erkennbar. */
export function parseCr(cr) {
  const m = String(cr ?? '').trim().match(/^(\d+)\s*\/\s*(\d+)|^(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return m[1] ? Number(m[1]) / Number(m[2]) : Number(m[3].replace(',', '.'));
}

export function crToXp(cr) {
  const v = typeof cr === 'number' ? cr : parseCr(cr);
  if (v == null) return 0;
  const key = Object.keys(CR_XP).map(Number).reduce((best, k) => (Math.abs(k - v) < Math.abs(best - v) ? k : best), 0);
  return CR_XP[key];
}

/** Multiplikator nach Anzahl der Gegner; kleine Gruppen (< 3) eine Stufe höher, große (≥ 6) eine niedriger. */
export function multiplier(monsterCount, partySize = 4) {
  if (monsterCount <= 0) return 0;
  const base = monsterCount === 1 ? 1 : monsterCount === 2 ? 2 : monsterCount <= 6 ? 3 : monsterCount <= 10 ? 4 : monsterCount <= 14 ? 5 : 6;
  const shift = partySize > 0 && partySize < 3 ? 1 : partySize >= 6 ? -1 : 0;
  return MULTIPLIER_STEPS[Math.max(0, Math.min(MULTIPLIER_STEPS.length - 1, base + shift))];
}

/** Summe der Schwellen der Gruppe: [leicht, mittel, schwer, tödlich]. */
export function partyThresholds(levels) {
  return levels.reduce((sum, lvl) => {
    const t = THRESHOLDS[Math.max(1, Math.min(20, Math.round(Number(lvl) || 1)))];
    return sum.map((s, i) => s + t[i]);
  }, [0, 0, 0, 0]);
}

/**
 * Auswertung. monsters: [{ cr, count }], levels: Stufen der Spielercharaktere.
 * Rückgabe: { xp, count, multiplier, adjusted, thresholds, difficulty, perPlayer }
 */
export function evaluate(monsters, levels) {
  const count = monsters.reduce((n, m) => n + Math.max(0, m.count || 0), 0);
  const xp = monsters.reduce((sum, m) => sum + crToXp(m.cr) * Math.max(0, m.count || 0), 0);
  const mult = multiplier(count, levels.length);
  const adjusted = Math.round(xp * mult);
  const thresholds = partyThresholds(levels);
  let idx = 0;
  thresholds.forEach((t, i) => {
    if (adjusted >= t) idx = i + 1;
  });
  return {
    xp,
    count,
    multiplier: mult,
    adjusted,
    thresholds,
    difficulty: levels.length && count ? DIFFICULTIES[idx] : null,
    perPlayer: levels.length ? Math.floor(xp / levels.length) : 0,
  };
}

// --- Zufallsbegegnungen: an die Gruppe anpassen ------------------------------------------------

/** Spanne der angepassten EP für eine Schwierigkeit ('easy' … 'deadly'): [ab, bis unter]. */
export function targetBand(levels, target) {
  const t = Math.max(1, DIFFICULTIES.findIndex((d) => d.key === target));
  const thr = partyThresholds(levels);
  return [thr[t - 1], t < 4 ? thr[t] : Math.round(thr[3] * 1.5)];
}

/**
 * Herausforderungsgrade, die zur Gruppe und Schwierigkeit passen: [min, max]. Höchstens so stark, dass ein
 * einzelner Gegner die Schwierigkeit nicht sprengt; mindestens so stark, dass gut ein Dutzend genügt.
 */
export function crRange(levels, target) {
  const [lo, hi] = targetBand(levels, target);
  const crs = Object.keys(CR_XP).map(Number).sort((a, b) => a - b);
  const single = multiplier(1, levels.length);
  const max = crs.filter((c) => CR_XP[c] * single < hi).at(-1) ?? 0;
  const min = crs.filter((c) => CR_XP[c] * 12 * multiplier(12, levels.length) <= lo).at(-1) ?? 0;
  return [Math.min(min, max), max];
}

/**
 * Anzahl der Gegner so anpassen, dass die Begegnung die gewünschte Schwierigkeit für die Gruppe hat.
 * items: [{ cr, count, …}] – Einträge ohne Herausforderungsgrad (z.B. NSCs) bleiben unverändert.
 * extras: weitere passende Gegnerarten (z.B. verwandte Monster mit anderem HG), die dazukommen dürfen.
 * Sucht schrittweise (einen Gegner mehr/weniger, eine Art dazu/weglassen) den nächsten Stand in der Spanne.
 * Lässt sich die Spanne nicht treffen, ist zu leicht immer besser als zu schwer.
 * Rückgabe: { items, result (evaluate), fits }
 */
export function balance(items, levels, target, extras = []) {
  const [lo, hi] = targetBand(levels, target);
  const mid = (lo + hi) / 2;
  const fixed = items.filter((x) => parseCr(x.cr) == null);
  const score = (list) => {
    const a = evaluate([...list, ...fixed], levels).adjusted;
    return [a < lo ? lo - a : a >= hi ? 1e9 + a - hi : 0, Math.abs(a - mid)];
  };
  const better = (s, t) => s[0] < t[0] || (s[0] === t[0] && s[0] > 0 && s[1] < t[1]);
  let cur = items.filter((x) => parseCr(x.cr) != null).map((x) => ({ ...x, count: Math.max(1, Math.round(x.count) || 1) }));
  if (cur.length && levels.length) {
    let best = score(cur);
    for (let step = 0; step < 80 && best[0] > 0; step++) {
      const total = cur.reduce((n, x) => n + x.count, 0);
      const options = [];
      cur.forEach((x, i) => {
        if (total < 20) options.push(cur.map((y, j) => (j === i ? { ...y, count: y.count + 1 } : y)));
        if (x.count > 1) options.push(cur.map((y, j) => (j === i ? { ...y, count: y.count - 1 } : y)));
        if (cur.length > 1) options.push(cur.filter((_, j) => j !== i));
      });
      const kinds = [...cur, ...extras.filter((x) => parseCr(x.cr) != null && !cur.some((y) => y.name === x.name))];
      for (const x of kinds) {
        if (!cur.includes(x) && cur.length < 4) options.push([...cur, { ...x, count: 1 }]);
        // Tausch: einen Gegner gegen einen anderer Art (z.B. Goblin → Hobgoblin)
        cur.forEach((y, i) => {
          if (y === x) return;
          const less = y.count > 1 ? cur.map((z, j) => (j === i ? { ...z, count: z.count - 1 } : z)) : cur.filter((_, j) => j !== i);
          const k = less.findIndex((z) => z.name === x.name && z.cr === x.cr);
          if (k >= 0) options.push(less.map((z, j) => (j === k ? { ...z, count: z.count + 1 } : z)));
          else if (less.length < 4) options.push([...less, { ...x, count: 1 }]);
        });
      }
      let next = null;
      let nextScore = best;
      for (const o of options) {
        const s = score(o);
        if (better(s, nextScore)) [next, nextScore] = [o, s];
      }
      if (!next) break;
      [cur, best] = [next, nextScore];
    }
  }
  const all = [...cur, ...fixed];
  const result = evaluate(all, levels);
  return { items: all, result, fits: result.adjusted >= lo && result.adjusted < hi };
}
