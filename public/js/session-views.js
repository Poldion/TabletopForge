// Session als Drehbuch: der Ablauf in Szenen (Vorlesetext, DM-Notizen, Karte, Handouts, Encounter, NSCs, Lore),
// die Prüfung vor dem Spiel („Bereit?“) und das Weiterschieben offener Szenen, wenn ein Abend nicht fertig wird.
import { h, fill, uid, api, toast, byOrder, sortBy, bindInput, prompt2 } from './util.js';
import { icon } from './icons.js';
import { tr, lang, LANGUAGES } from './i18n.js';
import { thumb, MAP_KINDS, isHandout, characterImageIds } from './components.js';
import { inScope } from './scope-ui.js';
import { ai, aiTextButton, mergeText } from './ai.js';
import { evaluateEncounter, difficultyChip } from './encounter-view.js';
import { gridOf } from './maprender.js';
import { scenesOf, carryOverOps } from '../../shared/sessions.js';

export { scenesOf };

/** Neue Szene am Ende der Session. */
export function newScene(sync, sid, init = {}) {
  const id = uid();
  const last = scenesOf(sync.state.sessions[sid]).at(-1);
  // Ältere Sessions haben noch keine Szenen-Sammlung – erst anlegen (Ops in fehlende Knoten wirken nicht)
  if (!sync.state.sessions[sid]?.scenes) sync.set(['sessions', sid, 'scenes'], {});
  sync.set(['sessions', sid, 'scenes', id], { id, order: (last?.order ?? 0) + 1, title: tr('Neue Szene'), status: 'open', readAloud: '', notes: '', mapId: null, assetIds: [], encounterId: null, creatureIds: [], loreIds: [], ...init });
  return id;
}

/** Karte und Handouts einer Szene gehören zum Material der Session (Kartenleiste beim Spielen, Vorladen). */
function linkMaterial(sync, sid, { mapId, assetIds = [] }) {
  const s = sync.state.sessions[sid];
  if (!s) return;
  const ops = [];
  if (mapId && !(s.mapIds || []).includes(mapId)) ops.push({ t: 'set', p: ['sessions', sid, 'mapIds'], v: [...(s.mapIds || []), mapId] });
  const missing = assetIds.filter((a) => !(s.assetIds || []).includes(a));
  if (missing.length) ops.push({ t: 'set', p: ['sessions', sid, 'assetIds'], v: [...(s.assetIds || []), ...missing] });
  if (ops.length) sync.do(ops);
}

/** Offene Szenen in die nächste Session schieben (siehe shared/sessions.js); liefert die ID der Ziel-Session. */
export function carryOver(sync, sid) {
  const r = carryOverOps(sync.state, sid, uid);
  if (!r) return null;
  sync.do(r.ops);
  return r.target;
}

/** Szenen-Vorschläge vom Sprachmodell (Titel, Notizen, Vorlesetext). */
async function suggestScenes(st, s, wish) {
  const adv = st.adventures[s.adventureId];
  const prev = sortBy(Object.values(st.sessions).filter((x) => x.adventureId === s.adventureId && (x.order ?? 0) < (s.order ?? 0)), (x) => x.order)
    .flatMap((x) => scenesOf(x).map((c) => `${x.name}: ${c.title}`))
    .slice(-12);
  const party = (st.party?.members || []).map((m) => `${m.name || '?'} (${[m.race, m.class, `level ${m.level || 1}`].filter(Boolean).join(' ')})`);
  const language = LANGUAGES[lang] || 'German';
  const content = [
    `Campaign "${st.name}"${st.description ? `: ${st.description}` : ''}.`,
    adv ? `Adventure "${adv.name}"${adv.notes ? `: ${adv.notes}` : ''}.` : '',
    `Session "${s.name}"${s.notes ? `, preparation notes: ${s.notes}` : ''}.`,
    prev.length ? `Scenes of earlier sessions: ${prev.join('; ')}.` : '',
    party.length ? `Party: ${party.join(', ')}.` : '',
    wish ? `Wishes of the game master: ${wish}.` : '',
    '',
    'Plan 3 to 5 scenes for this game night (a good mix of exploration, social interaction and combat, with room for the players to make choices).',
    `Answer with a JSON object only: {"scenes": [{"title": short title (${language}), "notes": what happens, what the players can find out, possible outcomes – for the game master (${language}), "readAloud": 1 short atmospheric paragraph to read to the players (${language})}]}`,
  ].filter(Boolean).join('\n');
  const r = await api('POST', '/api/ai/text', { json: true, system: 'You are an experienced Dungeons & Dragons 5e game master. You answer with valid JSON only.', messages: [{ role: 'user', content }] });
  const txt = String(r.text).replace(/```(?:json)?/gi, '');
  const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
  return (Array.isArray(j.scenes) ? j.scenes : []).slice(0, 8);
}

// --- Ablauf -------------------------------------------------------------------------------------------

export function createScenesView({ sync, cid, go, play }) {
  const S = () => sync.state;
  const collapsed = new Set(); // zugeklappte Szenen (je Ansicht)

  return function view(sid) {
    const page = h('div.page.scenes-page');
    const el = h('div.scroll', { style: { width: '100%' } }, page);
    const refreshers = [];
    const SP = (sceneId, ...k) => ['sessions', sid, 'scenes', sceneId, ...k];

    const pickSelect = (label, items, name, onPick) =>
      items.length
        ? h(
            'select.scene-add',
            { onchange: (e) => e.target.value && onPick(e.target.value) },
            h('option', { value: '' }, label),
            items.map((x) => h('option', { value: x.id }, name(x))),
          )
        : null;

    const sceneCard = (sc, i, list) => {
      const st = S();
      const P = (...k) => SP(sc.id, ...k);
      const C = () => S().sessions[sid]?.scenes?.[sc.id] || {};
      const isOpen = !collapsed.has(sc.id);
      const title = h('input.scene-title', { placeholder: tr('Titel der Szene') });
      refreshers.push(bindInput(title, () => C().title, (v) => sync.set(P('title'), v), { debounceMs: 250 }));
      const head = h(
        'div.scene-head',
        h('button.small.scene-toggle', { title: isOpen ? tr('Zuklappen') : tr('Aufklappen'), onclick: () => (collapsed.has(sc.id) ? collapsed.delete(sc.id) : collapsed.add(sc.id), render()) }, icon(isOpen ? 'chevronDown' : 'chevronRight')),
        h('span.scene-n', String(i + 1)),
        title,
        sc.carried ? h('span.chip', { title: tr('Aus der vorigen Session übernommen') }, tr('fortgesetzt')) : null,
        h('button.small', { class: sc.status === 'done' ? 'active' : '', title: tr('Als erledigt markieren'), onclick: () => sync.set(P('status'), sc.status === 'done' ? 'open' : 'done') }, icon('check'), sc.status === 'done' ? tr(' erledigt') : tr(' offen')),
        h('button.small', { title: tr('Nach oben'), disabled: i === 0, onclick: () => swap(list, i, i - 1) }, '↑'),
        h('button.small', { title: tr('Nach unten'), disabled: i === list.length - 1, onclick: () => swap(list, i, i + 1) }, '↓'),
        h('button.small', { title: tr('Szene löschen'), onclick: () => confirm(tr('Szene „{title}“ löschen?', { title: sc.title })) && sync.del(SP(sc.id)) }, icon('trash')),
      );
      if (!isOpen) return h('div.card.scene', { class: `scene-${sc.status}` }, head);

      const ta = (key, rows, placeholder) => {
        const t = h('textarea', { rows, placeholder });
        refreshers.push(bindInput(t, () => C()[key], (v) => sync.set(P(key), v), { debounceMs: 300 }));
        return t;
      };
      const readAloud = ta('readAloud', 3, tr('Was die Spieler zu hören bekommen …'));
      const notes = ta('notes', 4, tr('Für dich: was passiert, was die Spieler herausfinden können, mögliche Ausgänge …'));
      const about = () => `D&D 5e session "${S().sessions[sid]?.name}", scene "${C().title}". DM notes: ${C().notes || '-'}`;

      // Karte
      const maps = byOrder(st.maps).filter((m) => inScope(m) || m.id === sc.mapId);
      const mapSel = h('select', h('option', { value: '' }, tr('– keine Karte –')), maps.map((m) => h('option', { value: m.id, selected: m.id === sc.mapId }, `${m.name} (${MAP_KINDS[m.kind] || ''})`)));
      mapSel.addEventListener('change', () => (sync.set(P('mapId'), mapSel.value || null), linkMaterial(sync, sid, { mapId: mapSel.value })));
      const map = st.maps[sc.mapId];

      // Encounter
      const encs = sortBy(Object.values(st.encounters || {}).filter((e) => inScope(e) || e.id === sc.encounterId), (e) => -(e.createdAt || 0));
      const encSel = h('select', h('option', { value: '' }, tr('– keine Begegnung –')), encs.map((e) => h('option', { value: e.id, selected: e.id === sc.encounterId }, e.name)));
      encSel.addEventListener('change', () => sync.set(P('encounterId'), encSel.value || null));
      const enc = st.encounters?.[sc.encounterId];

      // Handouts, NSCs, Lore als Listen mit „hinzufügen“
      const mapAssets = new Set(Object.values(st.maps).map((m) => m.assetId));
      const handouts = (sc.assetIds || []).map((id) => st.assets[id]).filter(Boolean);
      const charIds = characterImageIds(st);
      const addHandout = pickSelect(tr('+ Handout …'), byOrder(st.assets).filter((a) => !mapAssets.has(a.id) && inScope(a) && isHandout(st, a, charIds) && !sc.assetIds?.includes(a.id)), (a) => a.name, (id) => (sync.set(P('assetIds'), [...(C().assetIds || []), id]), linkMaterial(sync, sid, { assetIds: [id] })));
      const npcs = (sc.creatureIds || []).map((id) => st.creatures?.[id]).filter(Boolean);
      const addNpc = pickSelect(tr('+ NSC / Kreatur …'), sortBy(Object.values(st.creatures || {}).filter((c) => inScope(c) && !sc.creatureIds?.includes(c.id)), (c) => (c.kind === 'npc' ? 'a' : 'b') + c.name), (c) => c.name, (id) => sync.set(P('creatureIds'), [...(C().creatureIds || []), id]));
      const lore = (sc.loreIds || []).map((id) => st.lore[id]).filter(Boolean);
      const addLore = pickSelect(tr('+ Lore …'), sortBy(Object.values(st.lore).filter((l) => inScope(l) && !sc.loreIds?.includes(l.id)), 'title'), (l) => l.title, (id) => sync.set(P('loreIds'), [...(C().loreIds || []), id]));
      const removeFrom = (key, id) => sync.set(P(key), (C()[key] || []).filter((x) => x !== id));
      const chip = (label, key, id, href) => h('span.chip.scene-chip', h('a', { href }, label), h('button.small', { title: tr('Entfernen'), onclick: () => removeFrom(key, id) }, icon('x')));

      return h(
        'div.card.scene',
        { class: `scene-${sc.status}` },
        head,
        h(
          'div.scene-body',
          h(
            'div.scene-text',
            h('div.row', h('label.grow', tr('Vorlesetext')), aiTextButton(() => ({ title: tr('Vorlesetext mit KI'), about: about(), current: () => readAloud.value, task: 'readAloud', tasks: ['readAloud', 'expand'], apply: (t, mode) => { const v = mergeText(readAloud.value, t, mode); readAloud.value = v; sync.set(P('readAloud'), v); } }))),
            readAloud,
            h('div.row', h('label.grow', tr('Notizen für dich')), aiTextButton(() => ({ about: about(), current: () => notes.value, tasks: ['expand', 'ideas', 'summary'], apply: (t, mode) => { const v = mergeText(notes.value, t, mode); notes.value = v; sync.set(P('notes'), v); } }))),
            notes,
          ),
          h(
            'div.scene-side',
            h('label', icon('map'), tr(' Karte')),
            mapSel,
            map ? h('div.scene-map', thumb(cid, st.assets[map.assetId], { caption: map.name, onclick: () => go(`maps/${map.id}`) })) : null,
            h('label', icon('swords'), tr(' Begegnung')),
            h('div.row', h('div.grow', encSel), enc ? difficultyChip(st, enc) : null),
            enc ? h('a.small', { href: `#creatures/encounter:${enc.id}` }, tr('Begegnung öffnen')) : h('a.small', { href: '#creatures/encounters' }, tr('Begegnung planen / würfeln')),
            h('label', icon('image'), tr(' Handouts')),
            handouts.length ? h('div.scene-chips', handouts.map((a) => chip(a.name, 'assetIds', a.id, `#assets/${a.id}`))) : null,
            addHandout,
            h('label', icon('user'), tr(' NSCs')),
            npcs.length ? h('div.scene-chips', npcs.map((c) => chip(c.name, 'creatureIds', c.id, `#creatures/${c.id}`))) : null,
            addNpc,
            h('label', icon('book'), tr(' Lore')),
            lore.length ? h('div.scene-chips', lore.map((l) => chip(l.title, 'loreIds', l.id, `#lore/${l.id}`))) : null,
            addLore,
          ),
        ),
      );
    };

    const swap = (list, a, b) => {
      const x = list[a];
      const y = list[b];
      sync.do([
        { t: 'set', p: SP(x.id, 'order'), v: y.order ?? b },
        { t: 'set', p: SP(y.id, 'order'), v: x.order ?? a },
      ]);
    };

    const suggest = async (btn) => {
      const wish = await prompt2(tr('Wünsche für die Szenen? (optional, z.B. „Verfolgungsjagd über die Dächer“)'));
      if (wish === null) return;
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = tr('Die KI plant …');
      try {
        const scenes = await suggestScenes(S(), S().sessions[sid], wish.trim());
        for (const x of scenes) newScene(sync, sid, { title: String(x.title || tr('Neue Szene')).slice(0, 120), notes: String(x.notes || ''), readAloud: String(x.readAloud || '') });
        toast(tr('{n} Szenen vorgeschlagen – passe sie an, ordne Karten und Begegnungen zu.', { n: scenes.length }), 4000);
      } catch (err) {
        toast(err.message, 4000);
      } finally {
        btn.disabled = false;
        btn.textContent = old;
      }
    };

    const render = () => {
      refreshers.length = 0;
      const st = S();
      const s = st.sessions[sid];
      if (!s) return fill(page, h('p.muted', tr('Session nicht gefunden.')));
      const list = scenesOf(s);
      const open = list.filter((x) => x.status !== 'done').length;
      const aiBtn = ai.text ? h('button', { title: tr('Szenen von der KI vorschlagen lassen'), onclick: (e) => suggest(e.currentTarget) }, icon('sparkles'), tr(' Szenen vorschlagen')) : null;
      fill(
        page,
        h(
          'div.row',
          h('h1.grow', { style: { margin: 0 } }, s.name),
          open && list.length > open
            ? h('button', {
                title: tr('Abend nicht fertig geworden? Offene Szenen kommen an den Anfang der nächsten Session.'),
                onclick: () => {
                  if (!confirm(tr('{n} offene Szenen in die nächste Session schieben und diese Session als gespielt markieren?', { n: open }))) return;
                  const t = carryOver(sync, sid);
                  if (t) (toast(tr('In „{name}“ übernommen', { name: S().sessions[t]?.name })), go(`session/${t}`));
                },
              }, icon('chevronRight'), tr(' Offene Szenen weiterschieben'))
            : null,
          h('button.primary', { onclick: () => go(`ready/${sid}`) }, icon('check'), tr(' Bereit?')),
        ),
        h('p.small.muted', list.length ? tr('{n} Szenen · {open} offen. Beim Spielen stehen Karte, Handouts, Begegnung und Vorlesetext jeder Szene mit einem Tipp bereit.', { n: list.length, open }) : tr('Plane den Abend als Folge von Szenen – jede mit Vorlesetext, Karte, Handouts, Begegnung und NSCs. Spontanes bleibt beim Spielen trotzdem möglich.')),
        list.map((sc, i) => sceneCard(sc, i, list)),
        h('div.row', { style: { marginTop: '10px' } }, h('button.primary', { onclick: () => newScene(sync, sid) }, icon('plus'), tr(' Szene')), aiBtn),
      );
    };
    render();
    return {
      el,
      refresh(changed) {
        if (!['sessions', 'maps', 'assets', 'encounters', 'creatures', 'lore', 'party', '*'].some((k) => changed.has(k))) return;
        if (page.contains(document.activeElement) && document.activeElement.matches('textarea, input')) refreshers.forEach((f) => f());
        else render();
      },
    };
  };
}

// --- Bereit? --------------------------------------------------------------------------------------------

export function createReadyView({ sync, cid, go, play }) {
  const S = () => sync.state;
  return function view(sid) {
    const page = h('div.page');
    const el = h('div.scroll', { style: { width: '100%' } }, page);
    const render = () => {
      const st = S();
      const s = st.sessions[sid];
      if (!s) return fill(page, h('p.muted', tr('Session nicht gefunden.')));
      const scenes = scenesOf(s).filter((x) => x.status !== 'done');
      const party = st.party?.members || [];
      const checks = []; // [stufe: ok|warn|bad, Text, Hinweis, Aktion]
      checks.push(scenes.length ? ['ok', tr('{n} offene Szenen geplant', { n: scenes.length })] : ['warn', tr('Noch keine offenen Szenen'), tr('Ohne Szenen spielst du frei – das geht, aber du hast weniger parat.'), [tr('Ablauf planen'), () => go(`session/${sid}`)]]);
      checks.push(party.length ? ['ok', tr('Gruppe: {n} Charaktere, Stufe {levels}', { n: party.length, levels: [...new Set(party.map((m) => m.level || 1))].join('/') })] : ['bad', tr('Keine Gruppe eingetragen'), tr('Ohne Gruppe lässt sich die Schwierigkeit nicht berechnen.'), [tr('Gruppe anlegen'), () => go('party')]]);
      for (const sc of scenes) {
        const map = st.maps[sc.mapId];
        if (map) {
          const g = gridOf(map);
          const calibrated = map.kind !== 'battle' || g.cols > 0 || g.size !== 70 || g.offsetX || g.offsetY;
          checks.push(calibrated ? ['ok', tr('„{scene}“: Karte „{map}“ bereit', { scene: sc.title, map: map.name })] : ['warn', tr('„{scene}“: Raster von „{map}“ noch nicht eingestellt', { scene: sc.title, map: map.name }), tr('Damit Felder auf dem Tisch genau 1 Zoll groß sind.'), [tr('Karte einstellen'), () => go(`maps/${map.id}`)]]);
        }
        const enc = st.encounters?.[sc.encounterId];
        if (enc) {
          const r = evaluateEncounter(st, enc);
          const d = r.difficulty;
          checks.push(!d ? ['warn', tr('„{scene}“: Begegnung „{enc}“ ohne Gegner oder Gruppe', { scene: sc.title, enc: enc.name }), '', [tr('Öffnen'), () => go(`creatures/encounter:${enc.id}`)]] : [d.key === 'deadly' ? 'warn' : 'ok', tr('„{scene}“: Begegnung „{enc}“ – {diff}', { scene: sc.title, enc: enc.name, diff: d.name }), d.key === 'deadly' ? tr('Tödlich für die Gruppe – Absicht?') : '', d.key === 'deadly' ? [tr('Öffnen'), () => go(`creatures/encounter:${enc.id}`)] : null]);
        }
      }
      const p = sync.presence || {};
      checks.push(p.table > 0 ? ['ok', tr('Spieltisch verbunden')] : ['warn', tr('Spieltisch nicht verbunden'), tr('Kein Tisch-Bildschirm online.'), [tr('Bildschirme'), () => go('screens')]]);
      checks.push(p.player > 0 ? ['ok', tr('Spieler-Display verbunden')] : ['warn', tr('Spieler-Display nicht verbunden'), tr('Optional – für Handouts und Porträts.'), null]);
      const bad = checks.filter((c) => c[0] === 'bad').length;
      const warn = checks.filter((c) => c[0] === 'warn').length;
      const iconOf = { ok: 'check', warn: 'eye', bad: 'x' };
      fill(
        page,
        h('h1', { style: { marginTop: 0 } }, tr('Bereit für „{name}“?', { name: s.name })),
        h('div.ready-list', checks.map(([lvl, text, hint, action]) => h('div.ready-item', { class: `ready-${lvl}` }, h('span.ready-icon', icon(iconOf[lvl])), h('div.grow', h('div', text), hint ? h('div.small.muted', hint) : null), action ? h('button.small', { onclick: action[1] }, action[0]) : null))),
        h('p.small.muted', bad ? tr('Es fehlt noch etwas Wichtiges.') : warn ? tr('Ein paar Hinweise – spielen kannst du trotzdem.') : tr('Alles bereit. Viel Spaß!')),
        h('button.primary.big-start', { onclick: () => play({ sessionId: sid }) }, icon('play'), tr(' Session starten')),
      );
    };
    render();
    return { el, refresh: (changed) => ['sessions', 'maps', 'encounters', 'party', 'creatures', '*'].some((k) => changed.has(k)) && render() };
  };
}
