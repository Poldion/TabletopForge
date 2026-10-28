// Übersetzung der Oberfläche. Ausgangssprache ist Deutsch: t('Kampf beginnen') liefert in einer anderen Sprache den
// Eintrag aus deren Sprachpaket (public/i18n/<sprache>.js) – fehlt er, bleibt der deutsche Text stehen. Platzhalter in
// geschweiften Klammern: t('Runde {n}', { n: 3 }).
//
// Sprache: je Gerät/Person (localStorage), sonst die Sprache des Browsers. Spieltisch und Spieler-Display folgen der
// Sprache der Kampagne (siehe followCampaignLanguage).
import en from '../i18n/en.js';

export const LANGUAGES = { de: 'Deutsch', en: 'English' };
const PACKS = { en };
const KEY = 'dnd:lang';

function detect() {
  if (typeof window === 'undefined') return 'de'; // Tests unter Node: Ausgangstexte
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGUAGES[saved]) return saved;
  } catch {
    /* nicht verfügbar */
  }
  const nav = (navigator.languages || [navigator.language || 'de']).map((l) => String(l).slice(0, 2).toLowerCase());
  return nav.find((l) => LANGUAGES[l]) || 'de';
}

export const lang = detect();
if (typeof document !== 'undefined') document.documentElement.lang = lang;
const pack = PACKS[lang] || null;

// Einträge mit Platzhaltern zusätzlich als Muster, damit auch fertig zusammengesetzte Meldungen (z.B. vom Server)
// erkannt werden: „Noch {n} Versuche“ passt auf „Noch 3 Versuche“
const patterns = pack
  ? Object.entries(pack)
      .filter(([k]) => /\{\w+\}/.test(k))
      .map(([k, v]) => {
        const names = [];
        const re = new RegExp(`^${k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(\w+)\\?\}/g, (_, n) => (names.push(n), '(.+?)'))}$`);
        return { re, names, v };
      })
  : [];

const fill = (s, params) => (params ? String(s).replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m)) : s);

/** Text in der eingestellten Sprache. */
export function t(s, params) {
  if (!pack) return fill(s, params);
  return fill(pack[s] ?? s, params);
}

/** Kurzform für die Oberfläche (kollidiert nicht mit den vielen lokalen Variablen „t“ für Token/Tisch/Ziel). */
export const tr = t;

/** Fertigen Text übersetzen (z.B. Meldung des Servers mit eingesetzten Werten). */
export function tMsg(s) {
  if (!pack || s == null) return s;
  if (pack[s]) return pack[s];
  for (const p of patterns) {
    const m = p.re.exec(s);
    if (m) return fill(p.v, Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]])));
  }
  return s;
}

/** Sprache dieses Geräts wechseln (lädt die Seite neu). */
export function setLang(l) {
  if (!LANGUAGES[l] || l === lang) return;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* nicht verfügbar */
  }
  location.reload();
}

/**
 * Anzeigen (Spieltisch, Spieler-Display) folgen der Sprache der Kampagne: weicht sie ab, einmal umstellen und neu laden.
 */
export function followCampaignLanguage(campaignLang) {
  if (LANGUAGES[campaignLang] && campaignLang !== lang) setLang(campaignLang);
}

/** Gebietsschema für Datum und Zahlen. */
export const locale = lang === 'de' ? 'de-DE' : 'en-US';

/** Zahl im Format der Sprache (Komma bzw. Punkt). */
export const fmtNumber = (n, digits = 1) => Number(n).toLocaleString(locale, { maximumFractionDigits: digits });

/**
 * Feste Texte in HTML-Seiten übersetzen: data-t (Inhalt), data-t-title, data-t-placeholder, data-t-value.
 * Ohne Wert gilt der vorhandene Text als Schlüssel (Leerraum und Zeilenumbrüche zusammengefasst).
 */
const normKey = (s) => String(s || '').replace(/\s+/g, ' ').trim();
export function translateDom(root = document) {
  if (!pack) return;
  for (const el of root.querySelectorAll('[data-t]')) el.textContent = t(normKey(el.dataset.t || el.textContent));
  for (const attr of ['title', 'placeholder', 'aria-label', 'value']) {
    for (const el of root.querySelectorAll(`[data-t-${attr}]`)) el.setAttribute(attr, t(normKey(el.getAttribute(`data-t-${attr}`) || el.getAttribute(attr))));
  }
  if (root === document && document.title) document.title = t(normKey(document.title));
}
// Seiten übersetzen sich beim Laden selbst (Module laufen erst nach dem Aufbau der Seite)
if (typeof document !== 'undefined') translateDom();

/** Auswahlfeld für die Sprache (z.B. in der Kopfzeile oder unter „Konto“). */
export function languageSelect(h) {
  const sel = h('select', { title: t('Sprache'), style: { width: 'auto' } }, ...Object.entries(LANGUAGES).map(([k, l]) => h('option', { value: k, selected: k === lang }, l)));
  sel.addEventListener('change', () => setLang(sel.value));
  return sel;
}
