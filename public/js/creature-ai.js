// Kreaturen und Charaktere mit KI erstellen: ein Satz („mürrische Zwergenschmiedin, HG 2“) → das Sprachmodell liefert
// einen vollständigen 5e-Statblock (bzw. die Werte eines Spielercharakters) samt Hintergrund und Bildbeschreibung;
// auf Wunsch entstehen dazu Porträt und rundes Token mit dem Bildgenerator. Das Formular bleibt daneben erhalten –
// die Werte lassen sich nach dem Übernehmen wie gewohnt ändern.
import { h, fill, uid, api, toast, markdown } from './util.js';
import { icon } from './icons.js';
import { tr, lang, LANGUAGES } from './i18n.js';
import { ai, generateImage } from './ai.js';
import { newCreature, renderStatblock } from './statblock.js';
import { crRange } from './encounter.js';
import { crLabel } from './monster-names-de.js';

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']; // i18n-ignore – Datenwerte (5e-Größen)
const int = (v, min, max, d) => Math.max(min, Math.min(max, Math.round(Number(v)) || d));
const str = (v, max = 4000) => String(v ?? '').slice(0, max);
/**
 * Antwort-Feld als Text: Modelle liefern manches als Liste oder Objekt (z.B. Fertigkeiten {"Insight": 4} oder
 * Aktionen [{name, description}]). md = Markdown-Absätze („**Name.** Text“), sonst eine Aufzählung mit Kommas.
 */
export function asText(v, md = false) {
  if (v == null || v === false) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map((x) => asText(x, md)).filter(Boolean).join(md ? '\n\n' : ', ');
  if (typeof v === 'object') {
    const name = v.name || v.title;
    const desc = v.description ?? v.desc ?? v.text ?? v.effect;
    if (name && desc != null) return md ? `**${name}.** ${asText(desc)}` : `${name} ${asText(desc)}`;
    return Object.entries(v)
      .map(([k, x]) => (md ? `**${k}.** ${asText(x)}` : `${k} ${typeof x === 'number' ? (x >= 0 ? `+${x}` : x) : asText(x)}`))
      .join(md ? '\n\n' : ', ');
  }
  return String(v);
}
const MD_FIELDS = new Set(['traits', 'actions', 'bonusActions', 'reactions', 'legendary', 'background']);
/** Fähigkeiten als eigene Absätze: „… Ende. **Nächste.** …“ in einer Zeile → Leerzeile vor jeder fetten Überschrift. */
/** Platzhalter wie „Keine.“, „None“, „-“ bedeuten: nichts. */
const isNone = (t) => /^\s*(\*\*)?\s*(keine?[rsn]?|none|n\/a|nichts)\b[^\n]{0,40}$/i.test(String(t || '')) || /^[\s*.\-–]*$/.test(String(t || ''));
export const paragraphs = (md) => String(md || '').replace(/[ \t]+(\*\*[^*\n]{1,80}?[.:]\*\*)/g, '\n\n$1').trim();

const partyLevels = (st) => (st.party?.members || []).map((m) => Number(m.level) || 1);

function parseJson(text) {
  const s = String(text).replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error(tr('Die KI hat keine verwertbare Antwort geliefert – bitte nochmal versuchen.'));
  return JSON.parse(s.slice(a, b + 1));
}

async function askJson(content) {
  const r = await api('POST', '/api/ai/text', { json: true, system: 'You are an expert Dungeons & Dragons 5e designer who writes rules-accurate stat blocks. You answer with valid JSON only.', messages: [{ role: 'user', content }] });
  return parseJson(r.text);
}

/** Statblock (NSC oder Monster) erzeugen und in unser Kreaturen-Format bringen. */
async function draftCreature(st, { prompt, kind, cr }) {
  const language = LANGUAGES[lang] || 'German';
  const levels = partyLevels(st);
  const [, maxCr] = levels.length ? crRange(levels, 'hard') : [0, 2];
  const content = [
    `Create a D&D 5e ${kind === 'npc' ? 'non-player character' : 'monster'} from this idea: "${prompt}".`,
    st.name ? `Campaign: "${st.name}"${st.description ? ` (${st.description})` : ''}.` : '',
    cr ? `Challenge rating: ${cr}.` : levels.length ? `The party has ${levels.length} characters of level ${levels.join(', ')}; unless the idea says otherwise, a challenge rating up to ${crLabel(maxCr)} fits.` : '',
    'Rules-accurate numbers: proficiency bonus, attack bonuses, save DCs and damage must match the challenge rating (DMG guidelines).',
    `Text in ${language}; keep game terms precise. Distances in feet like "30 ft.".`,
    'Answer with a JSON object only, keys:',
    '"name", "type" (e.g. "Humanoid (dwarf)"), "size" (Tiny|Small|Medium|Large|Huge|Gargantuan), "alignment", "ac" (e.g. "16 (chain mail)"), "hp" (number), "hpFormula" (e.g. "5d8 + 10"), "speed", "abilities" {"str","dex","con","int","wis","cha"} (numbers),',
    '"saves", "skills", "resistances", "immunities", "conditionImmunities", "senses", "languages", "cr" (e.g. "1/2" or "3"),',
    `"traits", "actions", "bonusActions", "reactions", "legendary" – each a single string of Markdown paragraphs "**Name.** text", separated by blank lines (${language}); use an empty string "" if there is none (never write "none"),`,
    '"actions" must contain at least one usable attack or action with attack bonus and damage (even for harmless NPCs, e.g. an improvised weapon),',
    kind === 'npc' ? `"role" (job/role, ${language}), "location" (${language}), "background" (appearance, personality, way of speaking, goals, a secret – Markdown, ${language}),` : `"background" (appearance, habitat, tactics – Markdown, ${language}),`,
    '"imagePrompt" (English: the visual appearance only – species, build, face, hair, clothing/armor, signature item, for a fantasy portrait).',
  ].filter(Boolean).join('\n');
  const j = await askJson(content);
  const a = j.abilities || {};
  const c = {
    ...newCreature(kind),
    name: str(asText(j.name), 120) || newCreature(kind).name,
    type: str(asText(j.type), 120),
    size: SIZES.includes(j.size) ? j.size : 'Medium', // i18n-ignore – Datenwert
    alignment: str(asText(j.alignment), 80),
    ac: str(asText(j.ac), 80) || '10',
    hp: int(j.hp, 1, 2000, 10),
    hpFormula: str(asText(j.hpFormula), 60),
    speed: str(asText(j.speed), 120) || '30 ft.', // i18n-ignore – Datenwert
    abilities: Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => [k, int(a[k], 1, 30, 10)])),
    cr: str(asText(j.cr), 10),
    source: tr('KI'),
  };
  for (const k of ['saves', 'skills', 'resistances', 'immunities', 'conditionImmunities', 'senses', 'languages', 'traits', 'actions', 'bonusActions', 'reactions', 'legendary', 'background', 'role', 'location']) {
    const t = MD_FIELDS.has(k) ? paragraphs(asText(j[k], true)) : asText(j[k]);
    c[k] = isNone(t) ? '' : str(t);
  }
  return { creature: c, imagePrompt: str(asText(j.imagePrompt), 600) };
}

/** Spielercharakter erzeugen (Gruppe): Volk, Klasse, Stufe, TP, RK, passive Wahrnehmung, Hintergrund. */
async function draftCharacter(st, { prompt, level }) {
  const language = LANGUAGES[lang] || 'German';
  const content = [
    `Create a D&D 5e player character from this idea: "${prompt}". Level ${level || 'as fits the idea (default 1)'}.`,
    'Rules-accurate: hit points from class hit die and constitution, armor class from armor and dexterity, passive perception from wisdom and proficiency.',
    `Text in ${language}.`,
    `Answer with a JSON object only, keys: "name", "race" (${language}), "class" (${language}, with subclass if level 3+), "level" (number), "hp" (number), "ac" (number), "passive" (number), "notes" (background, personality, goals, bonds, flaws – Markdown, ${language}), "imagePrompt" (English: visual appearance only – race, build, face, hair, clothing/armor, signature item).`,
  ].join('\n');
  const j = await askJson(content);
  return {
    member: { name: str(asText(j.name), 120), race: str(asText(j.race), 80), class: str(asText(j.class), 120), level: int(j.level ?? level, 1, 20, level || 1), hp: int(j.hp, 1, 999, 10), ac: int(j.ac, 1, 40, 10), passive: int(j.passive, 1, 40, 10), notes: str(asText(j.notes, true)) },
    imagePrompt: str(asText(j.imagePrompt), 600),
  };
}

/**
 * Porträt und Token im Hintergrund erzeugen. set(key, assetId) trägt sie ein (portraitAssetId / tokenAssetId).
 */
export function makeImages({ cid, name, imagePrompt, portrait, token, set }) {
  if (!ai.image || !imagePrompt) return;
  if (portrait) {
    generateImage({ cid, purpose: 'picture', prompt: `Portrait, head and upper body: ${imagePrompt}`, name: tr('{name} – Porträt', { name }), use: 'portrait' })
      .then((a) => (set('portraitAssetId', a.id), toast(tr('Porträt von {name} ist fertig', { name }))))
      .catch((err) => toast(tr('Porträt: {message}', { message: err.message }), 5000));
  }
  if (token) {
    generateImage({ cid, purpose: 'token', prompt: imagePrompt, name: tr('{name} – Token', { name }), use: 'token' })
      .then((a) => (set('tokenAssetId', a.id), toast(tr('Token von {name} ist fertig', { name }))))
      .catch((err) => toast(tr('Token: {message}', { message: err.message }), 5000));
  }
}

/**
 * Dialog „Mit KI erstellen“. mode: 'npc' | 'monster' | 'pc' (Spielercharakter für die Gruppe).
 * onCreated(id) nach dem Übernehmen.
 */
export function openAiCreator(sync, { mode = 'npc', onCreated } = {}) {
  const st0 = sync.state;
  const prompt = h('textarea', { rows: 3, placeholder: mode === 'pc' ? tr('z.B. „Halbelfische Barden-Hochstaplerin mit Laute und Schulden bei der Diebesgilde“') : tr('z.B. „Mürrische Zwergenschmiedin, die heimlich Waffen an Banditen verkauft“ oder „Sumpfhexe mit Froschdienern, HG 3“') });
  const kind = h('select', { style: { width: 'auto' } }, h('option', { value: 'npc', selected: mode === 'npc' }, tr('NSC')), h('option', { value: 'monster', selected: mode === 'monster' }, tr('Monster')));
  const cr = h('input', { placeholder: tr('HG (optional)'), style: { width: '110px' } });
  const level = h('input', { type: 'number', min: 1, max: 20, value: Math.max(1, ...partyLevels(st0), 1), style: { width: '80px' } });
  const portrait = h('input', { type: 'checkbox', checked: true });
  const token = h('input', { type: 'checkbox', checked: true });
  const status = h('span.small.muted.grow');
  const go = h('button.primary', { type: 'button' }, icon('sparkles'), tr(' Erstellen'));
  const preview = h('div.ai-creature-preview');
  let draft = null;

  const accept = () => {
    const name = mode === 'pc' ? draft.member.name : draft.creature.name;
    let id;
    let set;
    if (mode === 'pc') {
      id = uid();
      const members = sync.state.party?.members || [];
      sync.set(['party'], { ...(sync.state.party || {}), members: [...members, { id, ...draft.member }] });
      set = (key, assetId) => sync.set(['party'], { ...(sync.state.party || {}), members: (sync.state.party?.members || []).map((m) => (m.id === id ? { ...m, [key]: assetId } : m)) });
    } else {
      id = uid();
      sync.set(['creatures', id], { ...draft.creature, id, createdAt: Date.now() });
      set = (key, assetId) => sync.state.creatures?.[id] && sync.set(['creatures', id, key], assetId);
    }
    // Volk bzw. Art fest vorne – sonst malt das Bildmodell gern einen Menschen (z.B. statt eines Halblings)
    const who = mode === 'pc' ? [draft.member.race, draft.member.class] : [draft.creature.size === 'Small' || draft.creature.size === 'Tiny' ? 'small' : '', draft.creature.type]; // i18n-ignore – Datenwerte
    const imagePrompt = [who.filter(Boolean).join(' '), draft.imagePrompt].filter(Boolean).join(': ');
    makeImages({ cid: sync.campaignId, name, imagePrompt, portrait: portrait.checked, token: token.checked, set });
    if (ai.image && (portrait.checked || token.checked)) toast(tr('Bilder für {name} werden erzeugt …', { name }), 3000);
    dlg.close();
    onCreated?.(id);
  };

  const run = async () => {
    if (!prompt.value.trim()) return prompt.focus();
    go.disabled = true;
    fill(preview);
    status.textContent = tr('Die KI erstellt …');
    try {
      draft = mode === 'pc' ? await draftCharacter(sync.state, { prompt: prompt.value.trim(), level: Number(level.value) || 1 }) : await draftCreature(sync.state, { prompt: prompt.value.trim(), kind: kind.value, cr: cr.value.trim() });
      status.textContent = '';
      const m = draft.member;
      fill(
        preview,
        mode === 'pc'
          ? h('div.card', h('h3', { style: { marginTop: 0 } }, m.name), h('div', [m.race, m.class, tr('Stufe {level}', { level: m.level })].filter(Boolean).join(' · ')), h('div.small', tr('TP {hp} · RK {ac} · Passive Wahrnehmung {p}', { hp: m.hp, ac: m.ac, p: m.passive })), m.notes ? h('div.md.small', { innerHTML: markdown(m.notes) }) : null)
          : renderStatblock(draft.creature, { compact: true }),
        draft.imagePrompt && ai.image ? h('details.small.muted', h('summary', tr('Bildbeschreibung')), draft.imagePrompt) : null,
        h('div.row.end', { style: { marginTop: '10px' } }, h('button', { type: 'button', onclick: run }, icon('d20'), tr(' Nochmal')), h('button.primary', { type: 'button', onclick: accept }, icon('check'), tr(' Übernehmen'))),
      );
    } catch (err) {
      status.textContent = err.message;
    } finally {
      go.disabled = false;
    }
  };
  go.addEventListener('click', run);

  const dlg = h('dialog.modal.ai-dialog');
  fill(
    dlg,
    h('div.row', h('h3.grow', icon('sparkles'), mode === 'pc' ? tr(' Charakter mit KI erstellen') : tr(' Kreatur mit KI erstellen')), h('button.small', { type: 'button', onclick: () => dlg.close(), title: tr('Schließen') }, icon('x'))),
    h('label', tr('Beschreibe, was du brauchst')),
    prompt,
    h('div.row', { style: { flexWrap: 'wrap', marginTop: '6px' } }, mode === 'pc' ? [h('span.small', tr('Stufe')), level] : [kind, cr], ai.image ? [h('label.inline', portrait, tr('Porträt')), h('label.inline', token, tr('Token'))] : null),
    h('div.row', { style: { margin: '8px 0' } }, status, go),
    preview,
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  prompt.focus();
}
