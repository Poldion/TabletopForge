// KI-Dienste (optional): ein Sprachmodell für Texte und ein Bildgenerator für Porträts, Tokens und Karten.
// Beide werden in der Oberfläche eingetragen (Adresse, Schlüssel) und sind ohne Eintrag unsichtbar.
//  – Text: jede OpenAI-kompatible Schnittstelle (/v1/chat/completions), z.B. der Ollama-Proxy oder Ollama selbst
//  – Bild: die Bild-App (ComfyUI-Oberfläche) über ihre API (/api/v1/workflows, /api/v1/generate, /api/v1/jobs)
//    oder ein öffentlicher Dienst mit OpenAI-kompatibler Schnittstelle (/v1/images/generations, /v1/images/edits)
// Schlüssel bleiben auf dem Server; die Oberfläche erfährt nur, ob einer gesetzt ist.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { DATA_DIR } from './store.js';

const FILE = path.join(DATA_DIR, 'ai.json');
const EMPTY = { text: { enabled: false, url: '', model: '', apiKey: '' }, image: { enabled: false, provider: 'imagegen', url: '', model: '', apiKey: '', enhance: true } };

let config = load();

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { text: { ...EMPTY.text, ...saved.text }, image: { ...EMPTY.image, ...saved.image } };
  } catch {
    return structuredClone(EMPTY);
  }
}

const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);

/** Adresse prüfen und vereinheitlichen (ohne Schrägstrich am Ende); leer bleibt leer. */
export function cleanUrl(v, strip = []) {
  let s = str(v).replace(/\/+$/, '');
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^https?:\/\//i.test(s)) throw new Error('Nur http(s)-Adressen');
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  const u = new URL(s); // wirft bei Unsinn
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Nur http(s)-Adressen');
  for (const suffix of strip) if (s.toLowerCase().endsWith(suffix)) s = s.slice(0, -suffix.length);
  return s.replace(/\/+$/, '');
}

const textBase = (url) => (/\/v1$/i.test(url) ? url : `${url}/v1`);
const imageBase = (url) => cleanUrl(url, ['/api/v1', '/v1']);

export const textOn = () => !!(config.text.enabled && config.text.url && config.text.model);
const isPublic = (provider = config.image.provider) => provider === 'openai';
/** Öffentlicher Dienst: Adresse wie eingetragen, „/v1“ nur ergänzen, wenn keine Versionsangabe dabei ist. */
const publicBase = (url) => (/\/v\d+\w*(\/openai)?$/i.test(url) ? url : `${url}/v1`);
export const imageOn = () => !!(config.image.enabled && config.image.url && (!isPublic() || config.image.model));

/** Was die Oberfläche anzeigen soll (für alle angemeldeten Personen). */
export const status = () => ({ text: textOn(), image: imageOn(), enhance: config.image.enhance !== false });

/** Einstellungen für die Verwaltung – ohne Schlüssel im Klartext. */
export function getConfig() {
  const mask = ({ apiKey, ...rest }) => ({ ...rest, hasKey: !!apiKey });
  return { text: mask(config.text), image: mask(config.image) };
}

/** Speichern. apiKey: nicht angegeben = behalten, '' = entfernen. */
export function saveConfig(next = {}) {
  const t = next.text || {};
  const i = next.image || {};
  config = {
    text: {
      enabled: !!t.enabled,
      url: cleanUrl(t.url),
      model: str(t.model, 200),
      apiKey: t.apiKey === undefined ? config.text.apiKey : str(t.apiKey, 500),
    },
    image: {
      enabled: !!i.enabled,
      provider: isPublic(i.provider) ? 'openai' : 'imagegen',
      url: isPublic(i.provider) ? cleanUrl(i.url) : imageBase(i.url),
      model: str(i.model, 200),
      apiKey: i.apiKey === undefined ? config.image.apiKey : str(i.apiKey, 500),
      enhance: i.enhance !== false,
    },
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  workflowCache = null;
  return getConfig();
}

const headers = (key, json = false) => ({ ...(key ? { authorization: `Bearer ${key}` } : {}), ...(json ? { 'content-type': 'application/json' } : {}) });

async function call(url, { key, body, timeout = 20000, method } = {}) {
  let res;
  const form = body instanceof FormData;
  try {
    res = await fetch(url, { method: method || (body ? 'POST' : 'GET'), headers: headers(key, !!body && !form), body: form ? body : body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? 'Zeitüberschreitung' : `nicht erreichbar (${err.cause?.code || err.message})`);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.detail || j.error?.message || j.error || '';
    } catch {
      /* keine JSON-Antwort */
    }
    throw new Error(`${res.status}${detail ? ` – ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  }
  return res;
}

// --- Verbindung testen (Verwaltung) ---------------------------------------------------------

/** Sprachmodell: Modelle abfragen. Ohne Schlüssel in der Anfrage gilt der gespeicherte. */
export async function testText({ url, apiKey } = {}) {
  const base = textBase(cleanUrl(url || config.text.url));
  const r = await call(`${base}/models`, { key: apiKey ?? config.text.apiKey });
  const j = await r.json();
  return { models: (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean).sort() };
}

/** Bildgenerator: Workflows der Bild-App bzw. Modelle des öffentlichen Dienstes abfragen. */
export async function testImage({ url, apiKey, provider } = {}) {
  if (isPublic(provider)) {
    const r = await call(`${publicBase(cleanUrl(url || config.image.url))}/models`, { key: apiKey ?? config.image.apiKey });
    const j = await r.json();
    const all = (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean).sort();
    // Die Liste enthält oft auch Sprachmodelle – Bildmodelle zuerst, sonst alle
    const images = all.filter((m) => /image|dall-?e|flux|stable|sdxl|sd3|imagen|recraft|ideogram/i.test(m));
    return { models: images.length ? images : all };
  }
  const base = imageBase(url || config.image.url);
  const r = await call(`${base}/api/v1/workflows`, { key: apiKey ?? config.image.apiKey });
  return { workflows: pickWorkflows(await r.json()).map((w) => w.title) };
}

// --- Text ---------------------------------------------------------------------------------------

/**
 * Text erzeugen. messages: [{ role: 'user'|'assistant', content }]; system: Anweisung.
 * Gibt den Text der Antwort zurück (ohne „Gedanken“-Block mancher Modelle).
 */
export async function chat({ system, messages, json = false }) {
  if (!textOn()) throw new Error('Sprachmodell nicht eingerichtet');
  const body = {
    model: config.text.model,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
    stream: false,
    temperature: 0.8,
    // Antwort als JSON-Objekt (z.B. Zufallsbegegnungen); OpenAI-kompatible Server inkl. Ollama verstehen das
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };
  const r = await call(`${textBase(config.text.url)}/chat/completions`, { key: config.text.apiKey, body, timeout: 180000 });
  const j = await r.json();
  const text = String(j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!text) throw new Error('Leere Antwort des Sprachmodells');
  return text;
}

// --- Bilder -------------------------------------------------------------------------------------

let workflowCache = null; // { at, list }

const pickWorkflows = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((w) => w && (w.kind || 'image') === 'image' && w.file)
    .map((w) => ({
      file: String(w.file),
      title: String(w.title || w.file),
      mode: w.mode === 'edit' ? 'edit' : 'generate',
      summary: String(w.summary || ''),
      seconds: Number(w.seconds) || 60,
      defaultSize: Array.isArray(w.default_size) ? w.default_size : null,
      sizes: Array.isArray(w.sizes) ? w.sizes : null,
      group: w.group || '',
      variant: w.variant || '',
      tab: w.tab || '',
      defaultPrompt: w.default_prompt || '',
    }));

// Öffentliche Dienste kennen keine Workflows: feste Arten mit einer Vorgabe für den Prompt (Texte auf Englisch, das
// verstehen alle Modelle am besten). Titel und Beschreibungen übersetzt die Route.
const PUBLIC_KINDS = [
  { file: 'token', variant: 'token', title: 'Token / Porträt', summary: 'Figur von vorn, für Tokens und Porträts', hint: 'Fantasy character portrait for a tabletop role-playing game, head and shoulders, centered, plain background, no text: ' },
  { file: 'battlemap', variant: 'battlemap', title: 'Battlemap', summary: 'Kampfkarte, genau von oben', wide: true, hint: 'Top-down battle map for a tabletop role-playing game, seen straight from above, no grid, no text, no characters: ' },
  { file: 'ortskarte', variant: 'ortskarte', title: 'Ortskarte', summary: 'Karte eines Ortes oder einer Stadt', wide: true, hint: 'Fantasy map of a location for a tabletop role-playing game, seen from above, no text: ' },
  { file: 'illustration', variant: 'illustration', title: 'Illustration', summary: 'Szenenbild oder Handout', wide: true, hint: 'Fantasy illustration for a tabletop role-playing game, no text: ' },
  { file: 'token-edit', variant: 'token', mode: 'edit', title: 'Token aus Bild', summary: 'Macht aus einem vorhandenen Bild ein Token (nicht jeder Dienst kann das)', hint: '', defaultPrompt: 'Turn this into a fantasy character portrait for a token: head and shoulders, centered, plain background.' },
];

/** Größen, die das Modell annimmt: [Bezeichnung, Breite, Höhe]; die erste ist die Vorauswahl. */
function publicSizes(model, wide) {
  const m = String(model).toLowerCase();
  if (m.includes('dall-e-2')) return [['Quadrat', 1024, 1024]];
  const [a, b] = m.includes('dall-e-3') ? [1792, 1024] : m.includes('gpt-image') ? [1536, 1024] : [1344, 768];
  const square = ['Quadrat', 1024, 1024];
  const rest = [['Quer', a, b], ['Hoch', b, a]];
  return wide ? [...rest, square] : [square, ...rest];
}

const publicWorkflows = () =>
  PUBLIC_KINDS.map(({ hint, wide, ...k }) => ({
    mode: 'generate',
    seconds: 40,
    defaultSize: null,
    group: '',
    tab: '',
    defaultPrompt: '',
    canEnhance: false,
    ...k,
    sizes: publicSizes(config.image.model, wide),
  }));

/** Bild-Workflows der Bild-App (eine Minute zwischengespeichert) bzw. die festen Arten eines öffentlichen Dienstes. */
export async function workflows() {
  if (!imageOn()) throw new Error('Bildgenerator nicht eingerichtet');
  if (isPublic()) return publicWorkflows();
  if (workflowCache && Date.now() - workflowCache.at < 60000) return workflowCache.list;
  const r = await call(`${imageBase(config.image.url)}/api/v1/workflows`, { key: config.image.apiKey });
  const list = pickWorkflows(await r.json());
  workflowCache = { at: Date.now(), list };
  return list;
}

const jobs = new Map(); // laufende und fertige Aufträge (im Speicher, eine Stunde lang abrufbar)

function prune() {
  const old = Date.now() - 3600 * 1000;
  for (const [id, j] of jobs) if (j.finished && j.finished < old) jobs.delete(id);
}

/** Öffentliche Sicht auf einen Auftrag. */
export function job(id) {
  const j = jobs.get(id);
  if (!j) return null;
  const { campaignId, ...rest } = j;
  return rest;
}

/**
 * Bild erzeugen lassen; läuft im Hintergrund weiter (auch wenn die Seite geschlossen wird).
 * opts: { workflow, prompt, enhance, width, height, image (Buffer, für Bearbeiten-Workflows) }
 * save(buffer, mime, info): legt das fertige Bild in der Kampagne ab und liefert das Asset.
 */
export function startImage(campaignId, opts, save) {
  if (!imageOn()) throw new Error('Bildgenerator nicht eingerichtet');
  prune();
  const id = crypto.randomUUID();
  const j = { id, campaignId, state: 'running', started: Date.now(), estimate: opts.estimate || 60, asset: null, error: null, prompt: null };
  jobs.set(id, j);
  runImage(j, opts, save).catch((err) => Object.assign(j, { state: 'error', error: err.message, finished: Date.now() }));
  return job(id);
}

/** Bild von einem öffentlichen Dienst: Antwort kommt direkt, als base64 oder als Adresse zum Herunterladen. */
async function runPublicImage(j, opts, save) {
  const base = publicBase(config.image.url);
  const key = config.image.apiKey;
  const kind = PUBLIC_KINDS.find((k) => k.file === opts.workflow);
  const prompt = `${kind?.hint || ''}${opts.prompt}`;
  const size = opts.width && opts.height ? `${opts.width}x${opts.height}` : null;
  const request = async (withSize) => {
    if (!opts.image) return call(`${base}/images/generations`, { key, timeout: 300000, body: { model: config.image.model, prompt, n: 1, ...(withSize && size ? { size } : {}) } });
    const form = new FormData();
    form.set('model', config.image.model);
    form.set('prompt', prompt);
    form.set('n', '1');
    if (withSize && size) form.set('size', size);
    form.set('image', new Blob([await sharp(opts.image).png().toBuffer()], { type: 'image/png' }), 'image.png');
    return call(`${base}/images/edits`, { key, timeout: 300000, body: form });
  };
  // Nicht jeder Dienst kennt das Feld „size“ oder diese Größe: dann mit seiner Standardgröße
  const r = await request(true).catch((err) => {
    if (size && /^4\d\d\b.*size/i.test(err.message)) return request(false);
    throw err;
  });
  const item = (await r.json()).data?.[0];
  if (!item) throw new Error('Kein Bild im Ergebnis');
  let buf;
  if (item.b64_json) buf = Buffer.from(item.b64_json, 'base64');
  else if (/^https?:\/\//i.test(item.url || '')) buf = Buffer.from(await (await call(item.url, { timeout: 60000 })).arrayBuffer()); // ohne Schlüssel: die Adresse ist schon signiert
  else throw new Error('Kein Bild im Ergebnis');
  const meta = await sharp(buf).metadata().catch(() => null);
  if (!meta?.format) throw new Error('Kein Bild im Ergebnis');
  j.prompt = item.revised_prompt || prompt;
  j.asset = await save(buf, `image/${meta.format === 'jpg' ? 'jpeg' : meta.format}`, j);
  Object.assign(j, { state: 'done', finished: Date.now() });
}

async function runImage(j, opts, save) {
  if (isPublic()) return runPublicImage(j, opts, save);
  const base = imageBase(config.image.url);
  const key = config.image.apiKey;
  const body = { workflow: opts.workflow, prompt: opts.prompt, enhance: opts.enhance !== false && config.image.enhance !== false, count: 1 };
  if (opts.width && opts.height) Object.assign(body, { width: opts.width, height: opts.height });
  if (opts.image) body.image = opts.image.toString('base64');
  const started = await (await call(`${base}/api/v1/generate`, { key, body, timeout: 120000 })).json();
  const pid = started.jobs?.[0]?.id || started.id;
  if (!pid) throw new Error('Bild-App hat keinen Auftrag angelegt');
  if (started.warning) j.warning = String(started.warning);
  const until = Date.now() + 40 * 60 * 1000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    let v;
    try {
      v = await (await call(`${base}/api/v1/jobs/${encodeURIComponent(pid)}`, { key })).json();
    } catch (err) {
      if (Date.now() > until) throw err;
      continue; // kurz nicht erreichbar – weiter warten
    }
    if (v.state === 'done') {
      const img = v.images?.[0];
      if (!img) throw new Error('Kein Bild im Ergebnis');
      // Adresse aus der eigenen Einstellung bilden (die App kennt ihren Namen von außen evtl. anders)
      const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || '' });
      const r = await call(`${base}/api/image?${q}`, { key, timeout: 60000 });
      const mime = String(r.headers.get('content-type') || 'image/png').split(';')[0].trim();
      const buf = Buffer.from(await r.arrayBuffer());
      j.prompt = v.prompt || null;
      j.asset = await save(buf, mime, j);
      Object.assign(j, { state: 'done', finished: Date.now() });
      return;
    }
    if (v.state !== 'queued' && v.state !== 'running') throw new Error(v.error || `Auftrag ${v.state}`);
    if (Date.now() > until) throw new Error('Zeitüberschreitung');
  }
}
