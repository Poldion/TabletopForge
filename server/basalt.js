// BasaltNotes (optional): Notiz-App mit den Hintergründen der Charaktere, NSCs und Orte. Tabletop Forge liest
// über die REST-API (/api/v1) – Charaktere einer Kampagne, Notizen als HTML, Bilder aus den Anhängen.
// Adresse und Token werden in der Oberfläche eingetragen; das Token bleibt auf dem Server.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './store.js';
import { cleanUrl } from './ai.js';

const FILE = path.join(DATA_DIR, 'basalt.json');
const EMPTY = { enabled: false, url: '', token: '', vault: 'dnd', rulesVault: '' };

let config = load();
let features = null; // eingeschaltete Funktionen von BasaltNotes (siehe chatEnabled)

function load() {
  try {
    return { ...EMPTY, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    return { ...EMPTY };
  }
}

const base = () => cleanUrl(config.url, ['/api/v1']);
export const on = () => !!(config.enabled && config.url && config.token);

/** Für alle angemeldeten Personen: ist Basalt da, und wo öffnet man Notizen im Browser? */
export const status = () => (on() ? { enabled: true, url: base(), vault: config.vault, rulesVault: config.rulesVault || '' } : { enabled: false });

/** Regelwerk: eigener Vault mit den Regeln (Zauber, Zustände, Regeln …); ohne Eintrag gibt es keinen Regeltab. */
export const rulesOn = () => on() && !!config.rulesVault;

export function getConfig() {
  const { token, ...rest } = config;
  return { ...rest, hasToken: !!token };
}

/** Speichern. token: nicht angegeben = behalten, '' = entfernen. */
export function saveConfig(next = {}) {
  config = {
    enabled: !!next.enabled,
    url: cleanUrl(next.url, ['/api/v1']),
    token: next.token === undefined ? config.token : String(next.token || '').trim().replace(/^Bearer\s+/i, '').slice(0, 500),
    vault: String(next.vault || 'dnd').trim().slice(0, 80) || 'dnd',
    rulesVault: next.rulesVault === undefined ? config.rulesVault : /^[\w.-]{1,80}$/.test(String(next.rulesVault).trim()) ? String(next.rulesVault).trim() : '',
  };
  features = null;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  return getConfig();
}

async function call(p, { token = config.token, url = base(), raw = false, body, headers = {} } = {}) {
  if (!url) throw new Error('Keine Adresse eingetragen');
  let res;
  try {
    res = await fetch(`${url}/api/v1${p}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, accept: raw ? '*/*' : 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? 'Zeitüberschreitung' : `nicht erreichbar (${err.cause?.code || err.message})`);
  }
  if (!res.ok) {
    let msg = '';
    try {
      const j = await res.json();
      msg = j.error?.message || j.message || j.error || '';
    } catch {
      /* keine JSON-Antwort */
    }
    throw new Error(`${res.status}${msg ? ` – ${typeof msg === 'string' ? msg : JSON.stringify(msg)}` : ''}`);
  }
  return raw ? res : res.json();
}

/** Eingeschaltete Funktionen von BasaltNotes (KI-Chat ja/nein), eine Minute zwischengespeichert. */
export async function chatEnabled() {
  if (!features || Date.now() - features.at > 60000) {
    let chat = false;
    try {
      chat = !!(await call('/system/features')).chat;
    } catch {
      /* ältere Version oder nicht erreichbar: Chat bleibt aus */
    }
    features = { chat, at: Date.now() };
  }
  return features.chat;
}

/** Vault einer Anfrage (je Kampagne wählbar); ohne Angabe der Standard-Vault aus den Einstellungen. */
export const vaultId = (v) => (/^[\w.-]{1,80}$/.test(String(v || '')) ? String(v) : config.vault);
const vault = (v) => encodeURIComponent(vaultId(v));
const items = (j) => (Array.isArray(j) ? j : j.items || j.notes || j.data || j.results || []);

/** Verbindung testen (Verwaltung): Kampagnen des Vaults. Ohne Angaben gelten die gespeicherten. */
export async function test({ url, token, vault: v } = {}) {
  const u = url ? cleanUrl(url, ['/api/v1']) : base();
  const opts = { url: u, token: token || config.token };
  const j = await call(`/vaults/${encodeURIComponent(v || config.vault)}/campaigns`, opts);
  // Vaults zur Auswahl des Regelwerks (darf fehlen, z.B. bei einem Token für nur einen Vault)
  const vs = await call('/vaults', opts).catch(() => []);
  return { campaigns: items(j).map((c) => c.title || c.name).filter(Boolean), vaults: items(vs).map((x) => x.id).filter(Boolean) };
}

/** Vaults, auf die das Token Zugriff hat. */
export async function vaults() {
  return items(await call('/vaults')).map((v) => ({ id: v.id, name: v.name || v.id, preset: v.preset || '' }));
}

export async function campaigns(v) {
  return items(await call(`/vaults/${vault(v)}/campaigns`)).map((c) => ({ id: c.id, title: c.title || c.name, slug: c.slug }));
}

/** Eigenschaften einer Notiz (je nach Abfrage als Objekt oder als JSON-Text). */
function props(fm) {
  if (typeof fm !== 'string') return fm || {};
  try {
    return JSON.parse(fm);
  } catch {
    return {};
  }
}

/** Charaktere (Typ „character“) einer Kampagne mit ihren Eigenschaften (Spieler:in, Klasse, Volk …). */
export async function characters(campaign, v) {
  const q = new URLSearchParams({ type: 'character', limit: '200' });
  if (campaign) q.set('campaign', campaign);
  return items(await call(`/vaults/${vault(v)}/notes?${q}`)).map((n) => ({ id: n.id, title: n.title, frontmatter: props(n.frontmatter) }));
}

/** Bilder, die eine Notiz einbettet (![[bild.png]] oder ![](…/attachments/bild.png)). */
function embeddedImages(body) {
  const out = new Set();
  for (const m of String(body || '').matchAll(/!\[\[([^\]|#]+\.(?:png|jpe?g|webp|gif))(?:\|[^\]]*)?\]\]/gi)) out.add(path.basename(m[1].trim()));
  for (const m of String(body || '').matchAll(/!\[[^\]]*\]\(([^)\s]+\.(?:png|jpe?g|webp|gif))\)/gi)) out.add(decodeURIComponent(path.basename(m[1])));
  return [...out];
}

/**
 * Notiz für die Anzeige: Titel, Eigenschaften, HTML (Links öffnen BasaltNotes, Bilder laufen über den Server)
 * und die eingebetteten Bilder (zum Übernehmen als Porträt).
 */
export async function note(id, v) {
  const n = await call(`/vaults/${vault(v)}/notes/${encodeURIComponent(id)}?format=json`);
  const linkBase = `${base()}/{vault}/note/{id}`;
  let html = '';
  try {
    const r = await call(`/vaults/${vault(v)}/notes/${encodeURIComponent(id)}/html?link_base=${encodeURIComponent(linkBase)}`, { raw: true });
    const text = await r.text();
    html = r.headers.get('content-type')?.includes('json') ? JSON.parse(text).html || '' : text;
  } catch {
    html = '';
  }
  // Bilder aus den Anhängen brauchen das Token → über unseren Server ausliefern
  html = html.replace(/(<img[^>]*\ssrc=")([^"]*\/attachments\/)([^"?]+)([^"]*")/gi, (_, a, _b, name) => `${a}/api/basalt/attachments/${name}?vault=${vault(v)}"`);
  return { id: n.id, title: n.title, frontmatter: props(n.frontmatter), html, images: embeddedImages(n.body), url: `${base()}/${vault(v)}/note/${n.id}` };
}

/** Ausschnitt als Fließtext: ohne Markdown-Zeichen und Kommentare (auch abgeschnittene), <mark> bleibt. */
const plainSnippet = (s) =>
  String(s || '')
    .replace(/^(?:(?!<!--)[\s\S])*?-->/, '…')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(/(^|\s)#{1,6}\s+/g, '$1')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/[*_`]+|(?<=^|\s)>\s/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Volltextsuche im Regelwerk: Treffer mit Ausschnitten (<mark>…</mark> um die Suchwörter). */
export async function searchRules(q) {
  const p = new URLSearchParams({ q: String(q).slice(0, 200), limit: '30' });
  const j = await call(`/vaults/${encodeURIComponent(config.rulesVault)}/search?${p}`);
  return items(j).map((n) => ({ id: n.id, title: n.title, type: n.type || '', highlight: plainSnippet((n.highlights || [])[0]) }));
}

/**
 * Frage an den KI-Chat von BasaltNotes über das Regelwerk (Antwort als Server-Sent Events: context, start, token,
 * done, error). Gibt die offene Antwort zurück; der Aufrufer reicht sie durch.
 */
export async function askRules({ question, history, previous }, signal, lang = 'de') {
  const body = {
    question: String(question || '').slice(0, 2000),
    history: (Array.isArray(history) ? history : []).slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 8000) })),
    previous: (Array.isArray(previous) ? previous : []).slice(0, 10).map(String),
    stream: true,
  };
  let res;
  try {
    res = await fetch(`${base()}/api/v1/vaults/${encodeURIComponent(config.rulesVault)}/chat`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json', accept: 'text/event-stream', 'accept-language': lang },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(10 * 60000)]),
    });
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? 'Zeitüberschreitung' : `nicht erreichbar (${err.cause?.code || err.message})`);
  }
  if (!res.ok) {
    let msg = '';
    try {
      const j = await res.json();
      msg = j.error?.message || j.message || '';
    } catch {
      /* keine JSON-Antwort */
    }
    throw new Error(`${res.status}${msg ? ` – ${msg}` : ''}`);
  }
  return res;
}

/** Anhang (Bild) holen: { buffer, mime }. */
export async function attachment(name, v) {
  const r = await call(`/vaults/${vault(v)}/attachments/${encodeURIComponent(path.basename(String(name)))}`, { raw: true });
  return { buffer: Buffer.from(await r.arrayBuffer()), mime: String(r.headers.get('content-type') || '').split(';')[0].trim() };
}

/**
 * Nachbereitung einer Session als Session-Notiz in den Eingang von BasaltNotes (der Kurator sortiert NSCs, Orte …
 * ein). Gleicher key = dieselbe Notiz wird aktualisiert. Braucht ein Token mit Recht „Eingang“.
 */
export async function sendSession({ vault: v, key, title, campaign, date, body, attachments = [] }) {
  const payload = {
    source: { app: 'tabletop-forge', key: String(key).slice(0, 200) },
    note: { type: 'session', title: String(title).slice(0, 200), frontmatter: { ...(campaign ? { campaign: String(campaign) } : {}), ...(date ? { date: String(date) } : {}) }, body: String(body || '').slice(0, 200000) },
    attachments: attachments.slice(0, 10).map((a) => ({ name: String(a.name || '').slice(0, 120), kind: String(a.kind || 'notes').slice(0, 40), markdown: String(a.markdown || '').slice(0, 200000), ...(a.visibility ? { visibility: a.visibility } : {}) })),
    curate: 'auto',
  };
  return call(`/vaults/${vault(v)}/inbox`, { body: payload, headers: { 'idempotency-key': `${payload.source.key}:${Date.now()}` } });
}
