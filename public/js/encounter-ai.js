// Zufallsbegegnung mit KI: Das Sprachmodell entwirft Szene, Gegner (SRD), NSCs, Taktik und Beute; die Gegner
// kommen aus der Kartei oder der Monster-Datenbank, ihre Anzahl wird nach den 5e-Regeln auf die Gruppe und die
// gewünschte Schwierigkeit gebracht (encounter.js). Optional entstehen dazu ein Szenenbild und eine Battlemap.
import { h, fill, uid, api, toast, markdown } from './util.js';
import { icon } from './icons.js';
import { tr, lang, LANGUAGES } from './i18n.js';
import { ai, generateImage } from './ai.js';
import { DIFFICULTIES, balance, crRange, parseCr, crToXp } from './encounter.js';
import { fromOpen5e, newCreature } from './statblock.js';
import { germanName, crLabel } from './monster-names-de.js';
import { newMap } from './components.js';
import { scope } from './scope-ui.js';
import { membershipOp } from '../../shared/scope.js';

const TYPES = () => ({ any: tr('Überrasch mich'), combat: tr('Kampf'), social: tr('Begegnung mit NSCs'), hazard: tr('Hindernis oder Rätsel') });
const TYPE_EN = { any: 'any kind (combat, social or hazard – pick what fits the place)', combat: 'combat', social: 'a social encounter with NPCs (fighting possible but not the point)', hazard: 'a hazard, trap or puzzle in the environment' };

/** Stufen der Gruppe aus der Kampagne (Encounter-Planer). */
const partyLevels = (st) => (st.party?.members || []).map((m) => Math.max(1, Math.min(20, Number(m.level) || 1)));

/** JSON aus der Antwort des Sprachmodells (verträgt ```json-Blöcke und Text drumherum). */
function parseJson(text) {
  const s = String(text).replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error(tr('Die KI hat keine verwertbare Antwort geliefert – bitte nochmal würfeln.'));
  return JSON.parse(s.slice(a, b + 1));
}

/** Gegner finden: zuerst in der Kartei der Kampagne, sonst in der Monster-Datenbank (SRD). */
async function resolveMonster(st, name) {
  const want = String(name || '').trim().toLowerCase();
  if (!want) return null;
  const own = Object.values(st.creatures || {}).find((c) => c.kind !== 'npc' && (c.name.toLowerCase() === want || germanName(c.name).toLowerCase() === want));
  if (own) return { name: own.name, cr: own.cr, creatureId: own.id };
  for (const source of ['srd', 'all']) {
    try {
      const r = await api('GET', `/api/srd/monsters?q=${encodeURIComponent(name)}&source=${source}`);
      const list = r.results || [];
      const m = list.find((x) => x.name.toLowerCase() === want) || list.find((x) => x.name.toLowerCase().startsWith(want)) || list[0];
      if (m) return { name: m.name, cr: m.challenge_rating || String(m.cr ?? ''), srd: m };
    } catch {
      /* Datenbank nicht erreichbar */
    }
  }
  return null;
}

/**
 * Verwandte Gegner mit anderem Herausforderungsgrad (gleicher Typ, möglichst gleiche Untergruppe oder Namensteil –
 * z.B. Hobgoblin und Bugbear zu Goblins). Damit lässt sich die Schwierigkeit genauer treffen.
 */
async function relatives(st, found, [min, max]) {
  const first = found[0];
  if (!first) return [];
  const typeStr = first.srd ? first.srd.type : st.creatures?.[first.creatureId]?.type || '';
  const type = String(typeStr).split(/[\s(]/)[0];
  if (!type) return [];
  const sub = (first.srd?.subtype || String(typeStr).match(/\(([^)]+)\)/)?.[1] || '').toLowerCase();
  const r = await api('GET', `/api/srd/monsters?type=${encodeURIComponent(type[0].toUpperCase() + type.slice(1).toLowerCase())}&crMin=${min}&crMax=${max}&sort=cr`);
  const words = new Set(found.flatMap((f) => f.name.toLowerCase().split(/\W+/)).filter((w) => w.length > 2));
  const rank = (m) => (sub && String(m.subtype || '').toLowerCase() === sub ? 0 : m.name.toLowerCase().split(/\W+/).some((w) => words.has(w)) ? 1 : 2);
  const list = (r.results || []).filter((m) => !found.some((f) => f.name === m.name));
  // Lieber nur Verwandte; gibt es keine, dann Gegner desselben Typs
  const best = list.some((m) => rank(m) < 2) ? list.filter((m) => rank(m) < 2) : list;
  const seen = new Set(found.map((f) => String(f.cr)));
  const out = [];
  for (const m of best.sort((a, b) => rank(a) - rank(b))) {
    const cr = m.challenge_rating || String(m.cr ?? '');
    if (seen.has(cr)) continue;
    seen.add(cr);
    out.push({ name: m.name, cr, srd: m });
    if (out.length >= 4) break;
  }
  return out;
}

/** Die Charaktere der Gruppe (Volk, Klasse) – damit die Begegnung zu ihnen passt. */
const party = (st) => {
  const list = (st.party?.members || []).filter((m) => m.class || m.race).map((m) => `${m.name || '?'} (${[m.race, m.class, `level ${m.level || 1}`].filter(Boolean).join(' ')})`);
  return list.length ? `The characters: ${list.join(', ')}.` : '';
};

/** Entwurf vom Sprachmodell holen. */
async function draft(st, { place, type, target, levels, wishes }) {
  const [minCr, maxCr] = crRange(levels, target);
  const own = Object.values(st.creatures || {})
    .filter((c) => c.kind !== 'npc' && parseCr(c.cr) != null && parseCr(c.cr) <= maxCr)
    .slice(0, 60)
    .map((c) => `${c.name} (CR ${c.cr})`);
  const language = LANGUAGES[lang] || 'German';
  const user = [
    `Create a random encounter for a D&D 5e campaign${st.name ? ` called "${st.name}"` : ''}${st.description ? ` (${st.description})` : ''}.`,
    `Place / environment: ${place || 'choose something that fits the campaign'}.`,
    `Kind of encounter: ${TYPE_EN[type]}.`,
    `Party: ${levels.length} characters of level ${levels.join(', ')}. Intended difficulty: ${target}.`,
    party(st),
    `Opponents must be real monsters from the D&D 5e SRD with challenge rating between ${crLabel(minCr)} and ${crLabel(maxCr)}; the exact number will be adjusted to the party afterwards, so suggest 1–3 kinds with a plausible count.`,
    own.length ? `Monsters already prepared in this campaign (prefer them when they fit): ${own.join(', ')}.` : '',
    wishes ? `Wishes of the game master: ${wishes}.` : '',
    '',
    'Answer with a JSON object only, with these keys:',
    `"name": short title (${language}),`,
    `"summary": what happens, 2–3 sentences (${language}),`,
    `"readAloud": read-aloud text for the players, 1–2 short paragraphs, address the group directly, no secrets (${language}),`,
    '"monsters": [{"name": exact English SRD monster name, "count": number}] – may be empty for non-combat encounters,',
    `"npcs": [{"name": name, "role": role (${language}), "description": appearance, personality and what they want (${language})}] – 0 to 2,`,
    `"tactics": how the opponents behave and fight (${language}),`,
    `"twist": an optional complication (${language}),`,
    `"loot": treasure or reward fitting the party level (${language}),`,
    '"scenePrompt": English prompt for a painted illustration of the scene, without text,',
    '"mapPrompt": English description of a top-down battle map of the location (layout, terrain, furniture), without creatures.',
  ]
    .filter(Boolean)
    .join('\n');
  const r = await api('POST', '/api/ai/text', {
    json: true,
    system: 'You are an experienced Dungeons & Dragons 5e game master who designs memorable, fair encounters. You answer with valid JSON only.',
    messages: [{ role: 'user', content: user }],
  });
  return parseJson(r.text);
}

/**
 * Dialog „Zufallsbegegnung“. onCreated(encounterId) nach dem Übernehmen.
 */
export function openRandomEncounter(sync, onCreated) {
  const S = () => sync.state;
  const levels0 = partyLevels(S());
  const tableMap = S().maps?.[S().display?.table?.mapId];

  const place = h('input', { placeholder: tr('z.B. Sumpf bei Nacht, Bergpass, Hafenviertel'), value: tableMap?.name || '' });
  const type = h('select', ...Object.entries(TYPES()).map(([k, l]) => h('option', { value: k }, l)));
  const target = h('select', ...DIFFICULTIES.slice(1).map((d) => h('option', { value: d.key, selected: d.key === 'medium' }, d.name)));
  const wishes = h('input', { placeholder: tr('optional, z.B. „mit Untoten“, „ein Verräter in der Gruppe“') });
  // Gruppe: aus dem Encounter-Planer; fehlt sie, hier Größe und Stufe angeben
  const size = h('input', { type: 'number', min: 1, max: 10, value: 4, style: { width: '70px' } });
  const level = h('input', { type: 'number', min: 1, max: 20, value: 1, style: { width: '70px' } });
  const levels = () => (levels0.length ? levels0 : Array(Math.max(1, Math.min(10, Number(size.value) || 4))).fill(Math.max(1, Math.min(20, Number(level.value) || 1))));
  const partyField = levels0.length
    ? h('p.small.muted', tr('Gruppe: {n} Charaktere, Stufe {levels} – die Begegnung wird darauf ausgelegt.', { n: levels0.length, levels: [...new Set(levels0)].join('/') }))
    : h('div.row', h('span.small', tr('Gruppe:')), size, h('span.small', tr('Charaktere, Stufe')), level, h('span.small.muted', tr('(trag die Gruppe im Encounter-Planer ein, dann wird sie übernommen)')));
  const scene = h('input', { type: 'checkbox', checked: true });
  const battlemap = h('input', { type: 'checkbox' });
  const imageRow = ai.image ? h('div.row', h('label.inline', scene, tr('Szenenbild erzeugen')), h('label.inline', battlemap, tr('Battlemap erzeugen'))) : null;

  const status = h('span.small.muted.grow');
  const roll = h('button.primary', { type: 'button' }, icon('d20'), tr(' Würfeln'));
  const preview = h('div.enc-ai-preview');
  let plan = null; // { d (Entwurf), items, result, fits, missing, target, levels }

  const renderPlan = () => {
    const { d, items, result, fits, missing, dropped } = plan;
    const diff = result.difficulty;
    fill(
      preview,
      h('h3', d.name || tr('Zufallsbegegnung')),
      d.summary ? h('p', d.summary) : null,
      d.readAloud ? h('div.md', { innerHTML: markdown(String(d.readAloud).split('\n').map((l) => `> ${l}`).join('\n')) }) : null,
      items.length
        ? h(
            'div',
            h('div.section-title', icon('skull'), tr(' Gegner')),
            h('ul', items.map((it) => h('li', `${it.count}× ${it.name}`, it.cr ? h('span.muted', tr(' (HG {cr}, {xp} EP)', { cr: it.cr, xp: crToXp(it.cr) })) : null))),
            diff
              ? h('div.row', h('span.enc-badge', { style: { background: diff.color } }, diff.name), h('span.small.muted.grow', tr('{adjusted} angepasste EP für {n} Charaktere der Stufe {levels}', { adjusted: result.adjusted, n: plan.levels.length, levels: [...new Set(plan.levels)].join('/') })))
              : null,
            fits ? null : h('p.small', { style: { color: '#e0a030' } }, tr('Passt nicht ganz zur gewünschten Schwierigkeit – im Planer kannst du die Anzahl noch ändern.')),
          )
        : null,
      missing.length ? h('p.small.muted', tr('Nicht in der Monster-Datenbank gefunden: {list}', { list: missing.join(', ') })) : null,
      dropped.length ? h('p.small', { style: { color: '#e0a030' } }, tr('Für die Gruppe weggelassen (zu stark): {list} – der Text erwähnt sie evtl. noch.', { list: dropped.join(', ') })) : null,
      d.npcs?.length ? h('div', h('div.section-title', icon('user'), tr(' NSCs')), h('ul', d.npcs.map((n) => h('li', h('b', n.name), n.role ? ` – ${n.role}` : '', n.description ? h('div.small.muted', n.description) : null)))) : null,
      d.tactics ? h('p', h('b', tr('Taktik: ')), d.tactics) : null,
      d.twist ? h('p', h('b', tr('Wendung: ')), d.twist) : null,
      d.loot ? h('p', h('b', tr('Beute: ')), d.loot) : null,
      h('div.row.end', { style: { marginTop: '10px' } }, h('button.primary', { type: 'button', onclick: accept }, icon('check'), tr(' Als Encounter übernehmen'))),
    );
  };

  roll.addEventListener('click', async () => {
    roll.disabled = true;
    fill(preview);
    const lv = levels();
    try {
      status.textContent = tr('Die KI entwirft die Begegnung …');
      const d = await draft(S(), { place: place.value.trim(), type: type.value, target: target.value, levels: lv, wishes: wishes.value.trim() });
      status.textContent = tr('Gegner werden nachgeschlagen …');
      const found = [];
      const missing = [];
      for (const m of (Array.isArray(d.monsters) ? d.monsters : []).slice(0, 4)) {
        const r = await resolveMonster(S(), m?.name);
        if (!r) {
          if (m?.name) missing.push(m.name);
          continue;
        }
        const same = found.find((x) => x.name === r.name);
        if (same) same.count += Math.max(1, Number(m.count) || 1);
        else found.push({ ...r, count: Math.max(1, Number(m.count) || 1) });
      }
      // Anzahl auf die Gruppe und die gewünschte Schwierigkeit bringen
      let b = balance(found, lv, target.value);
      if (!b.fits && found.length) {
        // Trifft nicht: verwandte Gegner mit anderem HG dazunehmen (z.B. ein Hobgoblin statt eines Goblins)
        status.textContent = tr('Passende Verstärkung wird gesucht …');
        const extras = await relatives(S(), found, crRange(lv, target.value)).catch(() => []);
        if (extras.length) b = balance(found, lv, target.value, extras);
      }
      // Gegnerarten, die das Ausbalancieren gestrichen hat (Taktik/Vorlesetext können sie noch nennen)
      const dropped = found.filter((f) => !b.items.some((x) => x.name === f.name)).map((f) => f.name);
      plan = { d, items: b.items, result: b.result, fits: b.fits || !b.items.length, missing, dropped, levels: lv };
      status.textContent = '';
      renderPlan();
    } catch (err) {
      status.textContent = err.message;
    } finally {
      roll.disabled = false;
    }
  });

  /** Encounter mit Gegnern (Kartei/Datenbank), NSCs und Notizen anlegen; Bilder im Hintergrund. */
  async function accept() {
    const { d, items, dropped } = plan;
    const ops = [];
    const encItems = [];
    const adv = scope.current();
    for (const it of items) {
      let creatureId = it.creatureId;
      // Kreatur aus der Kartei, aber noch nicht in diesem Abenteuer: dazunehmen
      if (creatureId && adv) ops.push(membershipOp(S(), 'creatures', creatureId, adv, true));
      if (!creatureId) {
        creatureId = uid();
        ops.push({ t: 'set', p: ['creatures', creatureId], v: { ...fromOpen5e(it.srd), id: creatureId, createdAt: Date.now() } });
        const img = it.srd.img_main ? String(it.srd.img_main).replace(/^http:\/\//, 'https://') : '';
        if (img) {
          api('POST', `/api/campaigns/${sync.campaignId}/assets/from-url`, { url: img, name: it.name })
            .then((a) => sync.set(['creatures', creatureId, 'portraitAssetId'], a.id))
            .catch(() => {});
        }
      }
      encItems.push({ creatureId, count: it.count });
    }
    for (const n of (Array.isArray(d.npcs) ? d.npcs : []).slice(0, 3)) {
      if (!n?.name) continue;
      const id = uid();
      ops.push({ t: 'set', p: ['creatures', id], v: { ...newCreature('npc', String(n.name)), id, role: String(n.role || ''), background: String(n.description || ''), source: tr('KI-Zufallsbegegnung'), createdAt: Date.now() } });
      encItems.push({ creatureId: id, count: 1 });
    }
    const notes = [
      d.summary,
      d.readAloud ? `**${tr('Vorlesetext')}**\n${String(d.readAloud).split('\n').map((l) => `> ${l}`).join('\n')}` : '',
      d.tactics ? `**${tr('Taktik:')}** ${d.tactics}` : '',
      d.twist ? `**${tr('Wendung:')}** ${d.twist}` : '',
      d.loot ? `**${tr('Beute:')}** ${d.loot}` : '',
      dropped.length ? `_${tr('Für die Gruppe weggelassen: {list}', { list: dropped.join(', ') })}_` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const encId = uid();
    const name = String(d.name || tr('Zufallsbegegnung')).slice(0, 120);
    ops.push({ t: 'set', p: ['encounters', encId], v: { id: encId, name, notes, items: encItems, createdAt: Date.now(), random: { place: place.value.trim(), type: type.value, target: target.value } } });
    sync.do(ops);
    dlg.close();
    onCreated?.(encId);

    // Bilder im Hintergrund: Szenenbild zum Zeigen, Battlemap als neue Karte (beides in der aktiven Session)
    const cid = sync.campaignId;
    const addToSession = (key, id) => {
      const sid = S().display?.sessionId;
      const s = S().sessions?.[sid];
      if (s && !(s[key] || []).includes(id)) sync.set(['sessions', sid, key], [...(s[key] || []), id]);
    };
    if (ai.image && scene.checked && d.scenePrompt) {
      toast(tr('Szenenbild wird erzeugt …'), 3000);
      generateImage({ cid, purpose: 'picture', prompt: String(d.scenePrompt), name: tr('{name} – Szene', { name }) })
        .then((a) => {
          if (S().encounters?.[encId]) sync.set(['encounters', encId, 'imageAssetId'], a.id);
          addToSession('assetIds', a.id);
          toast(tr('Szenenbild für „{name}“ ist fertig', { name }), 4000);
        })
        .catch((err) => toast(tr('Szenenbild: {message}', { message: err.message }), 5000));
    }
    if (ai.image && battlemap.checked && d.mapPrompt) {
      toast(tr('Battlemap wird erzeugt …'), 3000);
      generateImage({ cid, purpose: 'map', prompt: String(d.mapPrompt), name: tr('{name} – Karte', { name }) })
        .then((a) => {
          const m = { ...newMap(a, 'battle'), name };
          sync.set(['maps', m.id], m);
          if (S().encounters?.[encId]) sync.set(['encounters', encId, 'mapId'], m.id);
          addToSession('mapIds', m.id);
          toast(tr('Battlemap für „{name}“ ist fertig', { name }), 4000);
        })
        .catch((err) => toast(tr('Battlemap: {message}', { message: err.message }), 5000));
    }
  }

  const dlg = h('dialog.modal.ai-dialog');
  fill(
    dlg,
    h('div.row', h('h3.grow', icon('d20'), tr(' Zufallsbegegnung')), h('button.small', { type: 'button', onclick: () => dlg.close(), title: tr('Schließen') }, icon('x'))),
    h('div.grid2', h('div', h('label', tr('Ort / Umgebung')), place), h('div', h('label', tr('Art')), type)),
    h('div.grid2', h('div', h('label', tr('Schwierigkeit')), target), h('div', h('label', tr('Wünsche')), wishes)),
    partyField,
    imageRow, // nur mit Bildgenerator (sonst null – fill überspringt das)
    h('div.row', { style: { margin: '8px 0' } }, status, roll),
    preview,
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}
