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
  const provider = h(
    'select',
    h('option', { value: 'imagegen', selected: cfg.provider !== 'openai' }, tr('Eigene Bild-App (ImageGen)')),
    h('option', { value: 'openai', selected: cfg.provider === 'openai' }, tr('Öffentlicher Dienst (OpenAI-kompatible API)')),
  );
  const url = h('input', { value: cfg.url });
  const model = h('input', { value: cfg.model || '', placeholder: tr('z.B. gpt-image-1'), list: 'imageModels' });
  const models = h('datalist', { id: 'imageModels' });
  const key = keyField(cfg.hasKey, tr('Schlüssel des Dienstes'));
  const enhance = h('input', { type: 'checkbox', checked: cfg.enhance !== false });
  const result = h('div.small.muted');
  const test = h('button', {
    type: 'button',
    onclick: async () => {
      result.textContent = tr('Prüfe …');
      try {
        const r = await api('POST', '/api/ai/test', { kind: 'image', provider: provider.value, url: url.value, apiKey: key.typed() });
        if (r.models) {
          fill(models, ...r.models.map((m) => h('option', { value: m })));
          if (!model.value && r.models.length) model.value = r.models[0];
          result.textContent = tr('Verbunden – {n} Modelle gefunden (Auswahl im Feld „Modell“).', { n: r.models.length });
        } else result.textContent = tr('Verbunden – {n} Bild-Workflows: {list}', { n: r.workflows.length, list: r.workflows.join(', ') });
      } catch (err) {
        result.textContent = err.message;
      }
    },
  }, icon('check'), tr(' Verbindung testen'));
  const hint = h('p.small.muted');
  const modelField = field(tr('Modell'), model);
  const enhanceField = h('label.inline', enhance, tr('Beschreibungen standardmäßig von der Bild-App ausformulieren lassen'));
  const renderProvider = () => {
    const pub = provider.value === 'openai';
    hint.textContent = pub
      ? tr('Erzeugt Tokens und Porträts für Kreaturen, Karten und Handout-Bilder über einen Dienst im Internet, ganz ohne eigene KI. Geht mit jeder OpenAI-kompatiblen Schnittstelle (/v1/images/generations), z.B. OpenAI (Adresse https://api.openai.com). Jedes Bild kostet dort Geld, und die Beschreibungen gehen an diesen Dienst.')
      : tr('Erzeugt Tokens und Porträts für Kreaturen, Karten und Handout-Bilder. Gedacht für die Bild-App (ComfyUI) mit ihrer API; den Schlüssel erzeugst du dort oben unter „API“.');
    url.placeholder = pub ? 'https://api.openai.com' : 'http://<host>:8190';
    modelField.classList.toggle('hidden', !pub);
    enhanceField.classList.toggle('hidden', pub);
  };
  provider.addEventListener('change', renderProvider);
  renderProvider();
  const el = card(
    tr('Bildgenerator'),
    hint,
    h('label.inline', enabled, tr('Aktiv')),
    field(tr('Anbieter'), provider),
    h('div.row', field(tr('Adresse'), url), key.el),
    modelField,
    models,
    enhanceField,
    h('div.row', { style: { marginTop: '8px' } }, test),
    result,
  );
  return { el, value: () => ({ enabled: enabled.checked, provider: provider.value, url: url.value, model: model.value, apiKey: key.value(), enhance: enhance.checked }) };
}

function basaltCard(cfg) {
  const enabled = h('input', { type: 'checkbox', checked: cfg.enabled });
  const url = h('input', { value: cfg.url, placeholder: 'http://<host>:4400' });
  const key = keyField(cfg.hasToken, 'bn_…', tr('API-Token'));
  const vault = h('input', { value: cfg.vault || 'dnd', placeholder: 'dnd' });
  const rulesVault = h('input', { value: cfg.rulesVault || '', placeholder: tr('z.B. regeln'), list: 'basaltVaults' });
  const vaultList = h('datalist', { id: 'basaltVaults' });
  const result = h('div.small.muted');
  const test = h('button', {
    type: 'button',
    onclick: async () => {
      result.textContent = tr('Prüfe …');
      try {
        const r = await api('POST', '/api/basalt/test', { url: url.value, token: key.typed(), vault: vault.value });
        result.textContent = tr('Verbunden – {n} Kampagnen: {list}', { n: r.campaigns.length, list: r.campaigns.join(', ') });
        fill(vaultList, ...(r.vaults || []).map((v) => h('option', { value: v })));
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
    field(tr('Regelwerk-Vault'), rulesVault, tr('Optional: Vault mit den Spielregeln (Zauber, Zustände, Regeln …). Dann gibt es einen Tab „Regeln“ mit Suche; ist in BasaltNotes unter Einstellungen → Funktionen der KI-Chat an, beantwortet dort auch die KI Fragen zu den Regeln.')),
    vaultList,
    result,
  );
  return { el, value: () => ({ enabled: enabled.checked, url: url.value, token: key.value(), vault: vault.value, rulesVault: rulesVault.value.trim() }) };
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
