// Regeltab (optional): ein Regelwerk als Vault in BasaltNotes (Dienste → „Regelwerk-Vault“). Normale Suche mit
// Treffer-Ausschnitten, Regeltext direkt im Tab und – wenn in BasaltNotes unter Einstellungen → Funktionen der
// KI-Chat an ist – Fragen an die KI, die das Regelwerk durchsucht und die Regel erklärt.
import { h, fill, api, escapeHtml, markdown } from './util.js';
import { icon } from './icons.js';
import { tr, lang } from './i18n.js';
import { basalt, basaltHtml } from './basalt.js';

export const rules = { enabled: false, chat: false };

let loading = null;
export const loadRules = () =>
  (loading ||= (basalt.enabled && basalt.rulesVault ? api('GET', '/api/basalt/rules') : Promise.resolve({ enabled: false }))
    .then((r) => Object.assign(rules, { enabled: !!r.enabled, chat: !!r.chat }))
    .catch(() => rules));

// Zustand bleibt beim Wechsel der Tabs erhalten (Panels werden neu aufgebaut)
// (auch eine laufende Antwort: sie erscheint in der zuletzt aufgebauten Ansicht)
const memo = { mode: 'search', q: '', results: null, noteId: null, chat: [], previous: [], busy: false, ctrl: null, redraw: null };

/** Treffer-Ausschnitt: alles escapen, nur <mark> aus BasaltNotes wieder zulassen. */
const snippet = (s) => escapeHtml(s).replace(/&lt;(\/?)mark&gt;/g, '<$1mark>');

/** Antwort aus BasaltNotes (Server-Sent Events) lesen: onEvent(name, daten) für jedes Ereignis. */
async function readEvents(res, onEvent) {
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let name = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        onEvent(name, JSON.parse(data));
      } catch {
        /* unvollständiges Ereignis */
      }
    }
  }
}

/**
 * Regeltab: { el, refresh }. Läuft als Panel im Spiel und als Seite der Kampagne.
 */
export function createRulesView({ page = false } = {}) {
  const body = h('div.rules-body');
  const tabs = h('div.rules-modes');
  const view = h('div.rules-view', { class: page ? 'page' : '' }, tabs, body);
  const el = page ? h('div.scroll', { style: { width: '100%' } }, view) : view;

  const setMode = (m) => {
    memo.mode = m;
    render();
  };

  function render() {
    if (!rules.chat && memo.mode === 'chat') memo.mode = 'search';
    fill(
      tabs,
      h('button', { class: memo.mode === 'search' ? 'active' : '', onclick: () => setMode('search') }, icon('search'), tr(' Suchen')),
      rules.chat ? h('button', { class: memo.mode === 'chat' ? 'active' : '', onclick: () => setMode('chat') }, icon('sparkles'), tr(' KI fragen')) : null,
    );
    if (memo.mode === 'chat') return renderChat();
    if (memo.noteId) return renderNote(memo.noteId);
    renderSearch();
  }

  // --- Suche ----------------------------------------------------------------------------
  function renderSearch() {
    const input = h('input', { type: 'search', placeholder: tr('Regel, Zauber, Zustand … z.B. Feuerwand'), value: memo.q, enterkeyhint: 'search' });
    const list = h('div.list.rules-results');
    let timer = null;
    let seq = 0;
    const run = async () => {
      const q = input.value.trim();
      memo.q = q;
      if (!q) {
        memo.results = null;
        return showResults();
      }
      const n = ++seq;
      fill(list, h('p.small.muted', tr('Sucht …')));
      try {
        const r = await api('GET', `/api/basalt/rules/search?q=${encodeURIComponent(q)}`);
        if (n !== seq) return;
        memo.results = r;
      } catch (err) {
        if (n === seq) fill(list, h('p', err.message));
        return;
      }
      showResults();
    };
    const showResults = () => {
      if (!memo.results) return fill(list, h('p.small.muted', rules.chat ? tr('Suche im Regelwerk – oder stelle der KI eine Frage („KI fragen“).') : tr('Suche im Regelwerk.')));
      if (!memo.results.length) return fill(list, h('p.muted', tr('Nichts gefunden.')), rules.chat ? h('button', { onclick: () => askFromSearch(memo.q) }, icon('sparkles'), tr(' Die KI fragen')) : null);
      fill(
        list,
        memo.results.map((r) =>
          h(
            'div.list-item.clickable',
            { onclick: () => openNote(r.id) },
            h('span.title', h('span', { innerHTML: snippet(r.title) }), r.highlight ? h('div.small.muted.rules-snippet', { innerHTML: snippet(r.highlight) }) : null),
          ),
        ),
      );
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, 300);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(timer);
        run();
      }
    });
    fill(body, h('div.row', input), list);
    showResults();
    if (memo.q && !memo.results) run();
    setTimeout(() => input.focus(), 0);
  }

  const askFromSearch = (q) => {
    memo.mode = 'chat';
    render();
    ask(q);
  };

  // --- Regeltext --------------------------------------------------------------------------
  function openNote(id) {
    memo.mode = 'search';
    memo.noteId = id;
    render();
  }

  async function renderNote(id) {
    const back = h('button.small', { onclick: () => ((memo.noteId = null), render()) }, icon('chevronLeft'), tr(' Zurück zur Suche'));
    const box = h('div', h('p.small.muted', tr('Lädt …')));
    fill(body, h('div.row', back), box);
    let n;
    try {
      n = await api('GET', `/api/basalt/rules/notes/${encodeURIComponent(id)}`);
    } catch (err) {
      return fill(box, h('p', err.message));
    }
    if (memo.noteId !== id) return;
    const html = basaltHtml(n.html || `<p>${escapeHtml(tr('(kein Text)'))}</p>`);
    // Verweise auf andere Regeln bleiben im Tab, alles andere öffnet BasaltNotes
    for (const a of html.querySelectorAll('a[href]')) {
      const m = /\/([^/]+)\/note\/([^/?#]+)/.exec(a.getAttribute('href'));
      if (m && decodeURIComponent(m[1]) === basalt.rulesVault) {
        a.removeAttribute('target');
        a.addEventListener('click', (e) => {
          e.preventDefault();
          openNote(decodeURIComponent(m[2]));
        });
      }
    }
    // Die meisten Notizen beginnen mit ihrem Titel als Überschrift – dann nicht doppelt
    const title = html.querySelector('h1') ? h('span.grow') : h('h3.grow', n.title);
    fill(box, h('div.row', title, h('a.btn.small', { href: n.url, target: '_blank', rel: 'noopener', title: tr('In BasaltNotes öffnen') }, icon('external'))), html);
  }

  // --- KI fragen --------------------------------------------------------------------------
  const log = h('div.rules-chat');
  const question = h('textarea', { rows: 2, placeholder: tr('z.B. Wie funktioniert der Zauber Feuerwand und wie wende ich ihn an?') });
  const send = h('button.primary', { onclick: () => ask(question.value) }, icon('sparkles'), tr(' Fragen'));
  question.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(question.value);
    }
  });

  function renderChat() {
    const reset = h('button.small', { title: tr('Neues Gespräch'), onclick: () => (memo.ctrl?.abort(), (memo.chat = []), (memo.previous = []), renderLog()) }, icon('plus'), tr(' Neu'));
    fill(body, log, h('div.rules-ask', question, h('div.row.end', reset, send)));
    memo.redraw = () => el.isConnected && renderLog();
    renderLog();
    setTimeout(() => question.focus(), 0);
  }

  function renderLog() {
    send.disabled = memo.busy;
    if (!memo.chat.length) {
      return fill(log, h('p.small.muted', tr('Stell eine Frage zu den Regeln. Die KI sucht die passenden Einträge im Regelwerk und erklärt sie – mit Quellen zum Nachlesen.')));
    }
    fill(
      log,
      memo.chat.map((m) =>
        m.role === 'user'
          ? h('div.rules-msg.user', m.content)
          : h(
              'div.rules-msg.assistant',
              m.error ? h('p', m.error) : m.content ? h('div.md', { innerHTML: markdown(m.content) }) : h('p.small.muted', m.status || tr('Sucht im Regelwerk …')),
              m.sources?.length
                ? h('div.rules-sources', h('span.small.muted', tr('Quellen:')), m.sources.map((s) => h('button.chip', { onclick: () => openNote(s.id) }, s.title)))
                : null,
            ),
      ),
    );
    log.scrollTop = log.scrollHeight;
  }

  async function ask(text) {
    const q = String(text || '').trim();
    if (!q || memo.busy) return;
    memo.busy = true;
    question.value = '';
    const history = memo.chat.filter((m) => m.content && !m.error).map((m) => ({ role: m.role, content: m.content }));
    const answer = { role: 'assistant', content: '', sources: [], status: '' };
    memo.chat.push({ role: 'user', content: q }, answer);
    renderLog();
    const ctrl = (memo.ctrl = new AbortController());
    try {
      const res = await fetch('/api/basalt/rules/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-lang': lang },
        body: JSON.stringify({ question: q, history, previous: memo.previous }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        let msg = res.statusText;
        try {
          msg = (await res.json()).error || msg;
        } catch {
          /* kein JSON */
        }
        throw new Error(msg);
      }
      await readEvents(res, (name, d) => {
        if (name === 'context') {
          answer.sources = (d.sources || []).filter((s) => s.id && s.role !== 'list').slice(0, 8);
          memo.previous = d.focus || [];
        } else if (name === 'start') answer.status = tr('Die KI liest die Regeln …');
        else if (name === 'token') answer.content += d.text || '';
        else if (name === 'done') answer.content = d.answer || answer.content;
        else if (name === 'error') answer.error = d.message || tr('Fehler');
        memo.redraw?.();
      });
      if (!answer.content && !answer.error) answer.error = tr('Keine Antwort erhalten.');
    } catch (err) {
      if (err.name !== 'AbortError') answer.error = err.message;
    } finally {
      memo.busy = false;
      memo.ctrl = null;
      memo.redraw?.();
    }
  }

  render();
  return { el, refresh: () => {} };
}
