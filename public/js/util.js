// Kleine DOM- und Hilfsfunktionen ohne Abhängigkeiten.
import { tr, lang } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16))
    .replace(/-/g, '')
    .slice(0, 12);

export const param = (name) => new URLSearchParams(location.search).get(name);

/**
 * Erzeugt ein Element: h('button.primary', { onclick }, 'Text', kind...)
 * Attribute mit "on" werden als Event-Listener gesetzt, "style" darf ein Objekt sein.
 */
export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'innerHTML' || k === 'textContent') el[k] = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Ersetzt den Inhalt eines Elements; null/false-Einträge werden übersprungen. */
export function fill(el, ...children) {
  clear(el);
  appendChildren(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** Sehr kleines, sicheres Markdown: Überschriften, Listen, fett, kursiv, Code, Links. */
export function markdown(src) {
  const inline = (s) =>
    escapeHtml(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = [];
  let list = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of String(src || '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      closeList();
      const n = m[1].length + 1;
      out.push(`<h${n}>${inline(m[2])}</h${n}>`);
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      closeList();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else if (line === '---') {
      closeList();
      out.push('<hr>');
    } else if (line === '') {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

export const fileUrl = (campaignId, asset) => (asset ? `/files/${campaignId}/${encodeURIComponent(asset.file)}` : '');

const imageCache = new Map();

/**
 * Liefert ein geladenes Bild oder null; ruft onLoad auf, sobald es verfügbar ist.
 * Bilder bleiben im Cache, damit Kartenwechsel ohne Verzögerung möglich sind.
 */
export function getImage(url, onLoad) {
  if (!url) return null;
  let entry = imageCache.get(url);
  if (!entry) {
    const img = new Image();
    img.decoding = 'async';
    entry = { img, loaded: false, waiting: new Set() };
    imageCache.set(url, entry);
    img.onload = () => {
      entry.loaded = true;
      entry.waiting.forEach((fn) => fn(img));
      entry.waiting.clear();
    };
    img.onerror = () => entry.waiting.clear();
    img.src = url;
  }
  if (entry.loaded) return entry.img;
  if (onLoad) entry.waiting.add(onLoad);
  return null;
}

export const preloadImage = (url) => getImage(url);

/** Bild aus dem Cache werfen und seinen Speicher freigeben (schwache Geräte: Karten nicht ansammeln). */
export function forgetImage(url) {
  const entry = imageCache.get(url);
  if (!entry) return;
  imageCache.delete(url);
  entry.waiting.clear();
  entry.img.onload = entry.img.onerror = null;
  entry.img.removeAttribute('src');
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const sortBy = (arr, key) =>
  [...arr].sort((a, b) => {
    const va = typeof key === 'function' ? key(a) : a[key];
    const vb = typeof key === 'function' ? key(b) : b[key];
    return va < vb ? -1 : va > vb ? 1 : 0;
  });

export const byOrder = (obj) => sortBy(Object.values(obj || {}), (x) => x.order ?? x.createdAt ?? 0);

/** Bindet ein Eingabefeld an einen Wert, ohne das Feld während der Eingabe zu überschreiben. */
export function bindInput(el, get, set, { debounceMs = 250, event = 'input' } = {}) {
  const push = debounceMs ? debounce(set, debounceMs) : set;
  el.addEventListener(event, () => push(el.type === 'checkbox' ? el.checked : el.value));
  const refresh = () => {
    if (document.activeElement === el) return;
    const v = get();
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.value !== String(v ?? '')) el.value = v ?? '';
  };
  refresh();
  return refresh;
}

export function toast(msg, ms = 2200) {
  let box = $('#toasts');
  if (!box) {
    box = h('div', { id: 'toasts' });
    document.body.append(box);
  }
  const t = h('div.toast', msg);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

/**
 * Nicht (mehr) angemeldet: Anzeigen (Spieltisch, Spieler-Display, Kiosk) zur Kopplung per QR-Code, alle anderen
 * Seiten zur Anmeldung – danach geht es zur aktuellen Seite zurück.
 */
export function goToLogin() {
  const page = location.pathname.replace(/^\//, '').replace(/\.html$/, '');
  if (page === 'login' || page === 'pair') return;
  const next = encodeURIComponent(location.pathname + location.search + location.hash);
  const kiosk = page === 'kiosk' && param('id') ? `&kiosk=${encodeURIComponent(param('id'))}` : '';
  location.href = ['table', 'player', 'kiosk'].includes(page) ? `/pair.html?next=${next}${kiosk}` : `/login.html?next=${next}`;
}

/** Arbeitskontext der Oberfläche: aktuelles Abenteuer (neue Dateien gehören dazu). Setzt die DM-Seite. */
export const apiContext = { adventure: () => null };

export async function api(method, url, body) {
  const opts = { method, headers: { 'x-lang': lang } }; // Server antwortet mit Meldungen in dieser Sprache
  const adv = apiContext.adventure();
  if (adv) opts.headers['x-adventure'] = adv;
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 401 && !url.startsWith('/api/auth/')) goToLogin();
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* kein JSON */
    }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

export function uploadFiles(campaignId, files) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  return api('POST', `/api/campaigns/${campaignId}/assets`, fd);
}

/** Öffnet einen einfachen modalen Dialog und liefert das Formular-Ergebnis. */
export function prompt2(title, value = '') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', value });
    const dlg = h(
      'dialog.modal',
      h(
        'form',
        { method: 'dialog' },
        h('h3', title),
        input,
        // „Abbrechen“ ist kein Absende-Knopf, damit Enter immer „OK“ auslöst
        h('div.row.end', h('button', { type: 'button', onclick: () => dlg.close('cancel') }, tr('Abbrechen')), h('button.primary', { value: 'ok', type: 'submit' }, 'OK')),
      ),
    );
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok' ? input.value.trim() : null);
      dlg.remove();
    });
    document.body.append(dlg);
    dlg.showModal();
    input.select();
  });
}

export const confirm2 = (msg) => Promise.resolve(window.confirm(msg));

export const TOKEN_COLORS = ['#e05252', '#e0a030', '#d8d040', '#4caf50', '#3fa7d6', '#6a5acd', '#c060c0', '#9e9e9e', '#f5f5f5', '#222222'];
