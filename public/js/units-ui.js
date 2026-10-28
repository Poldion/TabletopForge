// Einheiten in der Oberfläche: Entfernungen anzeigen und eingeben im Einheitensystem der Kampagne (metrisch/imperial).
// Gespeichert wird immer in Fuß – hier wird nur umgerechnet (siehe shared/units.js).
import { unitsOf, fmtDist, distValue, toFeet, distUnit, distStep, convertText } from '../../shared/units.js';
import { lang } from './i18n.js';

let current = null;

/** Einheitensystem der geöffneten Kampagne übernehmen (nach dem Verbinden und bei Änderungen aufrufen). */
// Ohne Einstellung entscheidet die Anzeigesprache der Kampagne (nicht die des Betrachters) – so zeigen alle Geräte
// dieselben Einheiten
export function useCampaignUnits(state) {
  current = unitsOf(state, state?.display?.lang || 'de');
}

export const units = () => current || unitsOf(null, lang);
/** Entfernung (Fuß) als Text, z.B. „9 m“ / „30 ft“. */
export const dist = (ft) => fmtDist(ft, units(), lang);
/** Entfernung (Fuß) als Zahl für ein Eingabefeld. */
export const distIn = (ft) => distValue(ft, units());
/** Eingabe → Fuß. */
export const distFrom = (v) => toFeet(v, units());
/** „m“ bzw. „ft“. */
export const unitLabel = () => distUnit(units());
/** Schrittweite eines Felds (1,5 m bzw. 5 ft). */
export const unitStep = () => distStep(units());
/** Einheiten in Fließtext (Statblöcke, Regeltexte) umrechnen. */
export const convert = (text) => convertText(text, units(), lang);
