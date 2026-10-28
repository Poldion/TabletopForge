// Meldungen des Servers in der Sprache des Browsers. Der Server schreibt seine Meldungen auf Deutsch; Antworten mit
// einem Feld „error“ werden beim Senden übersetzt – mit demselben Sprachpaket wie die Oberfläche
// (public/i18n/<sprache>.js), auch Meldungen mit eingesetzten Werten („… in 30 s …“ passt auf „… in {s} s …“).
import en from '../public/i18n/en.js';

const PACKS = { en };

function compile(pack) {
  return Object.entries(pack)
    .filter(([k]) => /\{\w+\}/.test(k))
    .map(([k, v]) => {
      const names = [];
      const re = new RegExp(`^${k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, (_, n) => (names.push(n), '(.+?)'))}$`);
      return { re, names, v };
    });
}
const PATTERNS = Object.fromEntries(Object.entries(PACKS).map(([l, p]) => [l, compile(p)]));

/** Fertige Meldung übersetzen; unbekannte bleiben, wie sie sind. */
export function translate(msg, lang) {
  const pack = PACKS[lang];
  if (!pack || typeof msg !== 'string') return msg;
  if (pack[msg]) return pack[msg];
  for (const p of PATTERNS[lang]) {
    const m = p.re.exec(msg);
    if (m) return p.v.replace(/\{(\w+)\}/g, (s, n) => (p.names.includes(n) ? m[p.names.indexOf(n) + 1] : s));
  }
  return msg;
}

/** Sprache einer Anfrage: vom Browser mitgeschickt (X-Lang), sonst aus Accept-Language. */
export function langOf(req) {
  const x = String(req.get('x-lang') || '').slice(0, 2).toLowerCase();
  if (x === 'de' || PACKS[x]) return x;
  return req.acceptsLanguages('de', ...Object.keys(PACKS)) || 'de';
}

/** Express: Fehlermeldungen in Antworten übersetzen. */
export function middleware(req, res, next) {
  const lang = langOf(req);
  if (lang === 'de') return next();
  const json = res.json.bind(res);
  res.json = (body) => json(body && typeof body.error === 'string' ? { ...body, error: translate(body.error, lang) } : body);
  next();
}
