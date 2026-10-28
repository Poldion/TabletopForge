// Dienste einrichten (nur Admins): Sprachmodell (OpenAI-kompatibel, z.B. Ollama-Proxy), Bildgenerator (Bild-App) und
// BasaltNotes (Notizen zu Charakteren und Lore). Nicht aktivierte Dienste tauchen in der Oberfläche nirgends auf.
import { $, h, fill, api, toast } from './util.js';
import { icon } from './icons.js';
import { authState, accountMenu } from './account.js';
import { tr } from './i18n.js';

const card = (title, ...children) => h('section.card', h('h2', { style: { marginTop: 0 } }, title), ...children);
const field = (label, el, hint) => h('div', h('label', label), el, hint ? h('div.small.muted', hint) : null);

/** Schlüsselfeld: leer lassen = gespeicherten behalten; „entfernen“ löscht ihn. */
function keyField(hasKey, placeholder, label = tr('API-Schlüssel')) {
  const input = h('input', { type: 'password', autocomplete: 'off', placeholder: hasKey ? tr('gespeichert – leer lassen zum Behalten') : placeholder });
  const remove = h('input', { type: 'checkbox' });
  return {
    el: field(label, input, hasKey ? h('label.inline', remove, tr('Gespeicherten Schlüssel entfernen')) : tr('Nur nötig, wenn der Dienst einen verlangt.')),
    // undefined = unverändert lassen
    value: () => (remove.checked ? '' : input.value.trim() || undefined),
    typed: () => input.value.trim() || undefined,
  };
}

function textCard(cfg) {
  const enabled = h('input', { type: 'checkbox', checked: cfg.enabled });
  const url = h('input', { value: cfg.url, placeholder: 'http://<host>:11435' });
  const model = h('input', { value: cfg.model, placeholder: tr('z.B. gemma4:26b'), list: 'aiModels' });
  const models = h('datalist', { id: 'aiModels' });
  const key = keyField(cfg.hasKey, tr('optional'));
  const result = h('div.small.muted');
  const test = h('button', {
    type: 'button',
    onclick: async () => {
      result.textContent = tr('Prüfe …');
      try {
        const r = await api('POST', '/api/ai/test', { kind: 'text', url: url.value, apiKey: key.typed() });
        fill(models, ...r.models.map((m) => h('option', { value: m })));
        if (!model.value && r.models.length) model.value = r.models[0];
        result.textContent = tr('Verbunden – {n} Modelle gefunden (Auswahl im Feld „Modell“).', { n: r.models.length });
      } catch (err) {
        result.textContent = err.message;
      }
    },
  }, icon('check'), tr(' Verbindung testen'));
  const el = card(
    tr('Sprachmodell (Texte)'),
    h('p.small.muted', tr('Schreibt Vorlesetexte, arbeitet NSCs aus, formuliert Notizen und Lore aus. Jede OpenAI-kompatible Schnittstelle (/v1/chat/completions) geht – z.B. der Ollama-Proxy, Ollama selbst oder ein Cloud-Dienst.')),
    h('label.inline', enabled, tr('Aktiv')),
    h('div.row', field(tr('Adresse'), url, tr('Basis-Adresse, „/v1“ wird bei Bedarf ergänzt')), key.el),
    h('div.row', field(tr('Modell'), model), h('div', { style: { alignSelf: 'end' } }, test)),
    models,
    result,
  );
  return { el, value: () => ({ enabled: enabled.checked, url: url.value, model: model.value, apiKey: key.value() }) };
}

function imageCard(cfg) {
  const enabled = h('input', { type: 'checkbox', checked: cfg.enabled });
  const url = h('input', { value: cfg.url, placeholder: 'http://<host>:8190' });
  const key = keyField(cfg.hasKey, 'ig_…');
  const enhance = h('input', { type: 'checkbox', checked: cfg.enhance !== false });
  const result = h('div.small.muted');
  const test = h('button', {
    type: 'button',
    onclick: async () => {
      result.textContent = tr('Prüfe …');
      try {
        const r = await api('POST', '/api/ai/test', { kind: 'image', url: url.value, apiKey: key.typed() });
        result.textContent = tr('Verbunden – {n} Bild-Workflows: {list}', { n: r.workflows.length, list: r.workflows.join(', ') });
      } catch (err) {
        result.textContent = err.message;
      }
    },
  }, icon('check'), tr(' Verbindung testen'));
  const el = card(
    tr('Bildgenerator'),
    h('p.small.muted', tr('Erzeugt Tokens und Porträts für Kreaturen, Karten und Handout-Bilder. Gedacht für die Bild-App (ComfyUI) mit ihrer API; den Schlüssel erzeugst du dort oben unter „API“.')),
    h('label.inline', enabled, tr('Aktiv')),
    h('div.row', field(tr('Adresse'), url), key.el),
    h('label.inline', enhance, tr('Beschreibungen standardmäßig von der Bild-App ausformulieren lassen')),
    h('div.row', { style: { marginTop: '8px' } }, test),
    result,
  );
  return { el, value: () => ({ enabled: enabled.checked, url: url.value, apiKey: key.value(), enhance: enhance.checked }) };
}

function basaltCard(cfg) {
  const enabled = h('input', { type: 'checkbox', checked: cfg.enabled });
  const url = h('input', { value: cfg.url, placeholder: 'http://<host>:4400' });
  const key = keyField(cfg.hasToken, 'bn_…', tr('API-Token'));
  const vault = h('input', { value: cfg.vault || 'dnd', placeholder: 'dnd' });
  const result = h('div.small.muted');
  const test = h('button', {
    type: 'button',
    onclick: async () => {
      result.textContent = tr('Prüfe …');
      try {
        const r = await api('POST', '/api/basalt/test', { url: url.value, token: key.typed(), vault: vault.value });
        result.textContent = tr('Verbunden – {n} Kampagnen: {list}', { n: r.campaigns.length, list: r.campaigns.join(', ') });
      } catch (err) {
        result.textContent = err.message;
      }
    },
  }, icon('check'), tr(' Verbindung testen'));
  const el = card(
    'BasaltNotes',
    h('p.small.muted', tr('Notizen zu Charakteren, NSCs und Lore. Charaktere der Gruppe lassen sich mit ihrer Notiz verknüpfen; der Hintergrund wird dann von dort angezeigt. Das Token erzeugst du in BasaltNotes unter Einstellungen → API-Tokens (Lesen genügt).')),
    h('label.inline', enabled, tr('Aktiv')),
    h('div.row', field(tr('Adresse'), url), key.el),
    h('div.row', field(tr('Standard-Vault'), vault, tr('Gilt für Kampagnen ohne eigenen Vault (Auswahl auf der Kampagnenseite)')), h('div', { style: { alignSelf: 'end' } }, test)),
    result,
  );
  return { el, value: () => ({ enabled: enabled.checked, url: url.value, token: key.value(), vault: vault.value }) };
}

async function render() {
  const content = $('#content');
  const st = await authState().catch(() => null);
  if (st?.active && st.me?.role !== 'admin') return fill(content, h('p', tr('Nur Admins können die Dienste einrichten.')));
  let cfg;
  let bcfg;
  try {
    [cfg, bcfg] = await Promise.all([api('GET', '/api/ai/config'), api('GET', '/api/basalt/config')]);
  } catch (err) {
    return fill(content, h('p', err.message));
  }
  const text = textCard(cfg.text);
  const image = imageCard(cfg.image);
  const notes = basaltCard(bcfg);
  const save = h('button.primary', {
    onclick: async () => {
      try {
        await api('PUT', '/api/ai/config', { text: text.value(), image: image.value() });
        await api('PUT', '/api/basalt/config', notes.value());
        toast(tr('Gespeichert'));
        render();
      } catch (err) {
        toast(err.message, 4000);
      }
    },
  }, icon('check'), tr(' Speichern'));
  fill(
    content,
    h('p.muted', tr('Alle Dienste sind freiwillig. Was hier nicht aktiv ist, erscheint in der Oberfläche nicht. Schlüssel und Tokens bleiben auf dem Server.')),
    text.el,
    image.el,
    notes.el,
    h('div.row.end', save),
  );
}

accountMenu($('#account'));
render();
