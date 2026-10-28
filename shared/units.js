// Einheiten: D&D rechnet intern in Fuß, Meilen und Pfund (so stehen die Werte in den Daten). Je Kampagne wird metrisch
// oder imperial angezeigt – umgerechnet nach der Konvention der deutschen Regelwerke: 5 ft = 1,5 m (1 Feld),
// 1 Meile = 1,5 km, 1 Pfund = 0,5 kg. Gespeichert wird immer in Fuß; umgerechnet wird nur für Anzeige und Eingabe.

export const UNIT_SYSTEMS = { metric: 'Metrisch (m, km, kg)', imperial: 'Imperial (ft, mi, lb)' };
const M_PER_FT = 0.3;
const KM_PER_MI = 1.5;
const KG_PER_LB = 0.5;

const round = (n, step) => Math.round(n / step) * step;
const fmt = (n, lang) => Number(n).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 2 });

/** Einheitensystem einer Kampagne; ohne Einstellung nach Sprache (Deutsch metrisch, sonst imperial). */
export const unitsOf = (campaign, lang = 'de') => (UNIT_SYSTEMS[campaign?.units] ? campaign.units : lang === 'de' ? 'metric' : 'imperial');

/** Kürzel für Entfernungen. */
export const distUnit = (units) => (units === 'metric' ? 'm' : 'ft');

/** Entfernung (Fuß) als Zahl in der Anzeigeeinheit. */
export const distValue = (ft, units) => (units === 'metric' ? round(Number(ft) * M_PER_FT, 0.1) : Number(ft));

/** Entfernung (Fuß) als Text, z.B. „9 m“ bzw. „30 ft“. */
export const fmtDist = (ft, units, lang = 'de') => `${fmt(distValue(ft, units), lang)} ${distUnit(units)}`;

/** Eingabe in der Anzeigeeinheit → Fuß (auf 1/100 gerundet). */
export const toFeet = (value, units) => {
  const v = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(v)) return NaN;
  return units === 'metric' ? Math.round((v / M_PER_FT) * 100) / 100 : v;
};

/** Schrittweite für Entfernungs-Eingaben (ein Feld = 5 ft = 1,5 m). */
export const distStep = (units) => (units === 'metric' ? 1.5 : 5);

/**
 * Einheiten in Fließtext umrechnen (z.B. Statblöcke: „reach 5 ft.“, „range 80/320 ft.“, „darkvision 60 ft“,
 * „Gewicht 3 lb“). Metrisch: Fuß/Meilen/Pfund → m/km/kg; imperial: m/km/kg (aus deutschen Statblöcken) → ft/mi/lb.
 */
export function convertText(text, units, lang = 'de') {
  if (!text) return text;
  const s = String(text);
  const num = (x) => Number(String(x).replace(',', '.'));
  if (units === 'metric') {
    return s
      .replace(/(\d+(?:[.,]\d+)?)(?:\/(\d+(?:[.,]\d+)?))?(\s?|-)(?:ft(?:\.(?=[,;)]|$))?|feet|foot|Fuß)(?![a-zäöü])/gi, (_, a, b, sep) => {
        const conv = (x) => fmt(round(num(x) * M_PER_FT, 0.1), lang);
        return `${conv(a)}${b ? `/${conv(b)}` : ''}${sep === '-' ? '-' : ' '}m`;
      })
      .replace(/(\d+(?:[.,]\d+)?)\s?(?:miles?|mi(?:\.(?=[,;)]|$))?|Meilen?)(?![a-zäöü])/gi, (_, a) => `${fmt(round(num(a) * KM_PER_MI, 0.1), lang)} km`)
      .replace(/(\d+(?:[.,]\d+)?)\s?(?:lbs?(?:\.(?=[,;)]|$))?|pounds?|Pfund)(?![a-zäöü])/gi, (_, a) => `${fmt(round(num(a) * KG_PER_LB, 0.1), lang)} kg`);
  }
  return s
    .replace(/(\d+(?:[.,]\d+)?)(?:\/(\d+(?:[.,]\d+)?))?(\s?|-)(?:m|Meter)(?![a-zäöü²³])/g, (_, a, b, sep) => {
      const conv = (x) => fmt(round(num(x) / M_PER_FT, 1), lang);
      return `${conv(a)}${b ? `/${conv(b)}` : ''}${sep === '-' ? '-' : ' '}ft.`;
    })
    .replace(/(\d+(?:[.,]\d+)?)\s?km(?![a-zäöü])/g, (_, a) => `${fmt(round(num(a) / KM_PER_MI, 0.1), lang)} mi`)
    .replace(/(\d+(?:[.,]\d+)?)\s?kg(?![a-zäöü])/g, (_, a) => `${fmt(round(num(a) / KG_PER_LB, 0.1), lang)} lb`);
}
