// KI-Hilfen in der Oberfläche: Texte mit dem Sprachmodell ausarbeiten, Bilder (Tokens, Karten, Handouts) erzeugen.
// Beides nur, wenn es unter „KI-Dienste“ eingerichtet ist – sonst erscheinen die Knöpfe gar nicht (ai.text/ai.image).
import { h, fill, api, toast, fileUrl, byOrder } from './util.js';
import { icon } from './icons.js';
import { tr, lang, LANGUAGES } from './i18n.js';

/** Was eingerichtet ist (nach loadAi()). */
export const ai = { text: false, image: false, enhance: true };

let loading = null;
export const loadAi = () =>
  (loading ||= api('GET', '/api/ai')
    .then((s) => Object.assign(ai, s))
    .catch(() => ai));

function dialog(title, ...content) {
  const dlg = h('dialog.modal.ai-dialog');
  dlg.append(h('div.row', h('h3.grow', icon('sparkles'), ` ${title}`), h('button.small', { type: 'button', onclick: () => dlg.close(), title: tr('Schließen') }, icon('x'))), ...content);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

// --- Text -----------------------------------------------------------------------------------------

/** Vorgaben für die Aufgabe (Knöpfe über dem Eingabefeld). */
export const TEXT_TASKS = {
  expand: () => tr('Formuliere den vorhandenen Text aus und ergänze stimmige Details. Behalte alle Fakten und Namen bei.'),
  readAloud: () => tr('Schreibe daraus einen stimmungsvollen Vorlesetext für die Spieler (2–3 kurze Absätze, sprich die Gruppe direkt an, verrate keine Geheimnisse).'),
  ideas: () => tr('Schlage 5 Ideen, Wendungen oder Komplikationen vor, die dazu passen – als Liste mit je 1–2 Sätzen.'),
  summary: () => tr('Fasse den Text knapp in Stichpunkten zusammen, damit ich ihn am Tisch schnell überblicke.'),
  npc: () => tr('Arbeite diesen NSC aus: Aussehen, Persönlichkeit, Sprechweise (mit einem typischen Satz), Ziele, ein Geheimnis und ein Aufhänger für die Gruppe. Behalte vorhandene Angaben bei.'),
};
const TASK_LABELS = () => ({ expand: tr('Ausformulieren'), readAloud: tr('Vorlesetext'), ideas: tr('Ideen'), summary: tr('Stichpunkte'), npc: tr('NSC ausarbeiten') });

/**
 * Dialog: Text vom Sprachmodell schreiben lassen.
 * about: worum es geht (Kampagne, Session, NSC …), current(): vorhandener Text,
 * apply(text, mode): 'replace' | 'append'. tasks: angebotene Vorgaben (Schlüssel aus TEXT_TASKS).
 */
export function openAiText({ title, about = '', current = () => '', apply, tasks = ['expand', 'readAloud', 'ideas', 'summary'], task = tasks[0] }) {
  const labels = TASK_LABELS();
  const instruction = h('textarea', { rows: 3, placeholder: tr('Was soll die KI tun? z.B. „Beschreibe die Taverne aus Sicht eines Halblings“') });
  instruction.value = TEXT_TASKS[task]?.() || '';
  const out = h('textarea.ai-result', { rows: 14, placeholder: tr('Hier erscheint der Vorschlag – du kannst ihn vor dem Übernehmen noch ändern.') });
  const status = h('span.small.muted.grow');
  const go = h('button.primary', { type: 'button' }, icon('sparkles'), tr(' Schreiben'));
  const applyRow = h('div.row.end.hidden', { style: { marginTop: '8px' } },
    h('button', { type: 'button', onclick: () => (apply(out.value.trim(), 'append'), dlg.close()) }, icon('plus'), tr(' Anhängen')),
    h('button.primary', { type: 'button', onclick: () => (apply(out.value.trim(), 'replace'), dlg.close()) }, icon('check'), tr(' Ersetzen')),
  );
  go.addEventListener('click', async () => {
    const task = instruction.value.trim();
    if (!task) return instruction.focus();
    go.disabled = true;
    status.textContent = tr('Die KI schreibt …');
    const text = String(current() || '').trim();
    try {
      const r = await api('POST', '/api/ai/text', {
        system:
          `You are a creative assistant for the game master of a Dungeons & Dragons 5e campaign. Always answer in ${LANGUAGES[lang] || 'German'}. ` +
          'Use Markdown (headings, **bold**, lists) where it helps. Reply only with the requested text, without preamble or closing remarks.',
        messages: [{ role: 'user', content: `${about ? `Context: ${about}\n\n` : ''}${text ? `Existing text:\n"""\n${text}\n"""\n\n` : ''}Task: ${task}` }],
      });
      out.value = r.text;
      status.textContent = '';
      applyRow.classList.remove('hidden');
    } catch (err) {
      status.textContent = err.message;
    } finally {
      go.disabled = false;
    }
  });
  const dlg = dialog(
    title || tr('Mit KI schreiben'),
    h('div.row', { style: { flexWrap: 'wrap', gap: '6px', margin: '6px 0' } }, ...tasks.map((k) => h('button.small', { type: 'button', onclick: () => ((instruction.value = TEXT_TASKS[k]()), instruction.focus()) }, labels[k]))),
    instruction,
    h('div.row', { style: { margin: '8px 0' } }, status, go),
    out,
    applyRow,
  );
  return dlg;
}

/** Knopf „KI“ für ein Textfeld (nur wenn ein Sprachmodell eingerichtet ist). */
export function aiTextButton(opts, label = tr(' KI')) {
  if (!ai.text) return null;
  return h('button.small', { type: 'button', title: tr('Mit KI ausformulieren, Vorlesetext oder Ideen'), onclick: () => openAiText(typeof opts === 'function' ? opts() : opts) }, icon('sparkles'), label);
}

/** Text in ein Feld übernehmen (ersetzen oder anhängen). */
export const mergeText = (old, text, mode) => (mode === 'append' && String(old || '').trim() ? `${String(old).trimEnd()}\n\n${text}` : text);

// --- Bilder ---------------------------------------------------------------------------------------

// Welcher Workflow passt zu welchem Zweck (Bild-App: D&D-Arten als „variant“)
const PURPOSE = {
  token: [/^token$/i, /token/i],
  map: [/battlemap/i, /karte|map/i],
  town: [/ortskarte/i, /karte|map/i],
  picture: [/^illustration$/i, /^ort$/i, /d&d|dnd/i],
};

function defaultWorkflow(list, purpose) {
  try {
    const saved = localStorage.getItem(`ai:wf:${purpose}`);
    if (list.some((w) => w.file === saved)) return saved;
  } catch {
    /* nicht verfügbar */
  }
  for (const re of PURPOSE[purpose] || []) {
    const w = list.find((x) => x.mode === 'generate' && (re.test(x.variant) || re.test(x.file) || re.test(x.title)));
    if (w) return w.file;
  }
  return list.find((w) => w.mode === 'generate')?.file || list[0]?.file;
}

/** Größen eines Workflows: eigene Liste, sonst Standardgröße quer/hoch. */
function sizesOf(w) {
  if (w.sizes?.length) return w.sizes.map(([label, wd, ht]) => ({ label: `${label} (${wd}×${ht})`, w: wd, h: ht }));
  if (!w.defaultSize) return [];
  const [a, b] = w.defaultSize;
  const out = [{ label: `${a}×${b}`, w: a, h: b }];
  if (a !== b) out.push({ label: `${b}×${a}`, w: b, h: a });
  return out;
}

/**
 * Bild ohne Dialog erzeugen (im Hintergrund, z.B. für Zufallsbegegnungen): Workflow passend zum Zweck,
 * Standardgröße. Liefert das fertige Asset (liegt dann unter Handouts).
 */
export async function generateImage({ cid, purpose = 'picture', prompt, name, use }) {
  const list = (await api('GET', '/api/ai/workflows')).filter((w) => w.mode === 'generate');
  const w = list.find((x) => x.file === defaultWorkflow(list, purpose));
  if (!w) throw new Error(tr('Die Bild-App bietet keine Bild-Workflows an.'));
  const size = sizesOf(w)[0];
  const j = await api('POST', `/api/campaigns/${cid}/ai/image`, { workflow: w.file, prompt, width: size?.w, height: size?.h, name: name || w.title, use });
  const until = Date.now() + 45 * 60 * 1000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 3000));
    let v;
    try {
      v = await api('GET', `/api/ai/jobs/${j.id}`);
    } catch {
      continue; // kurz nicht erreichbar
    }
    if (v.state === 'done') return v.asset;
    if (v.state !== 'running') throw new Error(v.error || tr('Fehler'));
  }
  throw new Error(tr('Zeitüberschreitung'));
}

/**
 * Dialog: Bild erzeugen lassen. Das Ergebnis landet als Datei in der Kampagne (Handouts); onDone(asset) bei „Übernehmen“.
 * purpose: 'token' | 'map' | 'town' | 'picture' (wählt den passenden Workflow vor), sourceAssetId: Ausgangsbild für
 * Bearbeiten-Workflows (z.B. Token aus vorhandenem Porträt).
 */
export async function openAiImage({ sync, cid, purpose = 'picture', prompt = '', name = '', sourceAssetId = null, onDone }) {
  let list;
  try {
    list = await api('GET', '/api/ai/workflows');
  } catch (err) {
    return toast(err.message, 4000);
  }
  if (!list.length) return toast(tr('Die Bild-App bietet keine Bild-Workflows an.'), 4000);
  // D&D-Workflows zuerst
  list = [...list.filter((w) => w.tab === 'dnd' || /d&d|dnd/i.test(w.title)), ...list.filter((w) => !(w.tab === 'dnd' || /d&d|dnd/i.test(w.title)))];
  const images = () => byOrder(sync.state.assets).filter((a) => a.kind === 'image');

  const wfSel = h('select', ...list.map((w) => h('option', { value: w.file }, w.title)));
  wfSel.value = defaultWorkflow(list, purpose);
  const summary = h('div.small.muted');
  const sizeSel = h('select');
  const sizeField = h('div', h('label', tr('Größe')), sizeSel);
  const srcSel = h('select');
  const srcPreview = h('img.ai-src');
  const srcField = h('div', h('label', tr('Ausgangsbild')), h('div.row', srcPreview, h('div.grow', srcSel)));
  const text = h('textarea', { rows: 4, placeholder: tr('Was soll zu sehen sein? Kurz reicht – z.B. „Zwergenschmied mit rußigem Bart“') });
  text.value = prompt;
  // Vorgeschlagene Beschreibung: passt sich dem Workflow an, bis selbst etwas eingetippt wird
  // (Bearbeiten-Workflows wie „Token aus Bild“ brauchen statt der Beschreibung nur eine Anweisung)
  let suggested = true;
  text.addEventListener('input', () => (suggested = false));
  const enhance = h('input', { type: 'checkbox', checked: ai.enhance !== false });
  const enhanceField = h('label.inline', { title: tr('Die Bild-App macht aus einer kurzen Beschreibung einen ausführlichen Prompt') }, enhance, tr('Beschreibung ausformulieren lassen'));
  const status = h('span.small.muted.grow');
  const bar = h('div.ai-progress.hidden', h('i'));
  const result = h('div.ai-result-img.hidden');
  const go = h('button.primary', { type: 'button' }, icon('sparkles'), tr(' Erzeugen'));

  const W = () => list.find((w) => w.file === wfSel.value);
  const renderSrc = () => {
    const a = sync.state.assets[srcSel.value];
    srcPreview.src = a ? fileUrl(cid, a) : '';
    srcPreview.classList.toggle('hidden', !a);
  };
  const renderWf = () => {
    const w = W();
    summary.textContent = w.summary ? `${w.summary} · ${tr('ca. {n} s', { n: w.seconds })}` : tr('ca. {n} s', { n: w.seconds });
    const sizes = sizesOf(w);
    fill(sizeSel, ...sizes.map((s, i) => h('option', { value: i }, s.label)));
    sizeField.classList.toggle('hidden', !sizes.length);
    enhanceField.classList.toggle('hidden', w.canEnhance === false); // öffentliche Dienste formulieren nichts aus
    const edit = w.mode === 'edit';
    srcField.classList.toggle('hidden', !edit);
    if (edit) {
      const cur = srcSel.value || sourceAssetId;
      fill(srcSel, ...images().map((a) => h('option', { value: a.id }, a.name)));
      if (cur && sync.state.assets[cur]) srcSel.value = cur;
      renderSrc();
    }
    if (suggested) text.value = (edit && w.defaultPrompt) || prompt || w.defaultPrompt || '';
  };
  wfSel.addEventListener('change', () => {
    try {
      localStorage.setItem(`ai:wf:${purpose}`, wfSel.value);
    } catch {
      /* nicht verfügbar */
    }
    renderWf();
  });
  srcSel.addEventListener('change', renderSrc);

  let current = null; // gerade gezeigtes, noch nicht übernommenes Ergebnis
  let timer = 0;
  const discard = async () => {
    if (!current) return;
    const a = current;
    current = null;
    await api('DELETE', `/api/campaigns/${cid}/assets/${a.id}`).catch(() => {});
  };
  const showResult = (asset) => {
    current = asset;
    fill(
      result,
      h('img', { src: fileUrl(cid, asset) }),
      asset.ai?.prompt ? h('details.small.muted', h('summary', tr('Verwendeter Prompt')), asset.ai.prompt) : null,
      h(
        'div.row.end',
        { style: { marginTop: '8px' } },
        h('button.danger', { type: 'button', onclick: async () => (await discard(), result.classList.add('hidden')) }, icon('trash'), tr(' Verwerfen')),
        h('button', { type: 'button', onclick: async () => (await discard(), start()) }, icon('d20'), tr(' Nochmal')),
        h('button.primary', { type: 'button', onclick: () => ((current = null), onDone?.(asset), dlg.close()) }, icon('check'), tr(' Übernehmen')),
      ),
    );
    result.classList.remove('hidden');
  };

  const start = async () => {
    const w = W();
    const size = sizesOf(w)[Number(sizeSel.value)] || null;
    go.disabled = true;
    result.classList.add('hidden');
    status.textContent = tr('Wird erzeugt …');
    bar.classList.remove('hidden');
    let j;
    try {
      j = await api('POST', `/api/campaigns/${cid}/ai/image`, {
        workflow: w.file,
        prompt: text.value.trim(),
        enhance: w.canEnhance !== false && enhance.checked,
        width: size?.w,
        height: size?.h,
        sourceAssetId: w.mode === 'edit' ? srcSel.value : null,
        name: name || w.title,
      });
    } catch (err) {
      status.textContent = err.message;
      bar.classList.add('hidden');
      go.disabled = false;
      return;
    }
    const t0 = Date.now();
    const tick = async () => {
      if (!dlg.open) return;
      const s = (Date.now() - t0) / 1000;
      bar.firstChild.style.width = `${Math.min(95, (s / j.estimate) * 100)}%`;
      status.textContent = s > j.estimate * 1.5 ? tr('Dauert länger als üblich ({s} s) – die Bild-App ist wohl beschäftigt …', { s: Math.round(s) }) : tr('Wird erzeugt … {s} von ca. {n} s', { s: Math.round(s), n: j.estimate });
      let v;
      try {
        v = await api('GET', `/api/ai/jobs/${j.id}`);
      } catch {
        v = { state: 'running' };
      }
      if (v.state === 'running') return (timer = setTimeout(tick, 2000));
      bar.classList.add('hidden');
      go.disabled = false;
      if (v.state === 'done') {
        status.textContent = v.warning || '';
        showResult(v.asset);
      } else status.textContent = v.error || tr('Fehler');
    };
    timer = setTimeout(tick, 1000);
  };
  go.addEventListener('click', start);

  const dlg = dialog(
    tr('Bild erzeugen'),
    h('div', h('label', tr('Art')), wfSel, summary),
    srcField,
    h('div', h('label', tr('Beschreibung')), text),
    h('div.row', { style: { flexWrap: 'wrap' } }, sizeField, enhanceField),
    h('div.row', { style: { margin: '10px 0 6px' } }, status, go),
    bar,
    result,
  );
  dlg.classList.add('ai-image');
  dlg.addEventListener('close', () => {
    clearTimeout(timer);
    // Läuft noch: das Bild kommt trotzdem (unter Handouts); ein gezeigtes, nicht übernommenes bleibt ebenfalls dort
    if (go.disabled) toast(tr('Das Bild wird im Hintergrund fertig und landet unter Handouts.'), 4000);
  });
  renderWf();
}

/** Knopf „KI-Bild“ (nur wenn ein Bildgenerator eingerichtet ist). */
export function aiImageButton(opts, label = tr(' KI-Bild')) {
  if (!ai.image) return null;
  return h('button', { type: 'button', title: tr('Bild mit dem Bildgenerator erzeugen'), onclick: () => openAiImage(typeof opts === 'function' ? opts() : opts) }, icon('sparkles'), label);
}
