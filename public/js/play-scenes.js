// Spielen nach Drehbuch: Szenenleiste über der Karte, Panel „Ablauf“ mit allem zur aktuellen Szene (Karte auf den Tisch,
// Vorlesetext, Begegnung, Handouts, NSCs, Lore, Stichworte) und der Werkzeugkasten für Spontanes, wenn die Spieler
// vom Weg abweichen (Stegreif-Szene, Spontan-NSC, Zufallsbegegnung, Schnellsuche über alles).
import { h, fill, uid, toast, fileUrl, markdown, byOrder, sortBy, bindInput, prompt2 } from './util.js';
import { icon } from './icons.js';
import { tr } from './i18n.js';
import { scenesOf, carryOverOps } from '../../shared/sessions.js';
import { putOnTable } from './table-view.js';
import { startEncounter, difficultyChip } from './encounter-view.js';
import { inScope } from './scope-ui.js';
import { ai } from './ai.js';

// Diese Module importieren dm-panels bzw. creatures-view – erst bei Bedarf laden (keine Import-Schleifen)
const lazy = {
  creatureAi: () => import('./creature-ai.js'),
  encounterAi: () => import('./encounter-ai.js'),
  creatures: () => import('./creatures-view.js'),
};

const session = (st) => st.sessions?.[st.display?.sessionId] || null;

/** Aktuelle Szene der aktiven Session: die gewählte, sonst die erste offene. */
export function currentScene(st) {
  const s = session(st);
  const list = scenesOf(s);
  return list.find((x) => x.id === s?.currentSceneId) || list.find((x) => x.status !== 'done') || list[0] || null;
}

const setCurrent = (sync, sceneId) => {
  const s = session(sync.state);
  if (s) sync.set(['sessions', s.id, 'currentSceneId'], sceneId);
};

/** Neue Szene hinter der aktuellen (z.B. aus dem Stegreif). */
function insertScene(sync, init) {
  const st = sync.state;
  const s = session(st);
  if (!s) return null;
  const list = scenesOf(s);
  const cur = currentScene(st);
  const i = cur ? list.indexOf(cur) : list.length - 1;
  const a = list[i]?.order ?? 0;
  const b = list[i + 1]?.order ?? a + 2;
  const id = uid();
  const ops = [];
  if (!s.scenes) ops.push({ t: 'set', p: ['sessions', s.id, 'scenes'], v: {} });
  ops.push({ t: 'set', p: ['sessions', s.id, 'scenes', id], v: { id, order: (a + b) / 2, title: tr('Stegreif'), status: 'open', improvised: true, readAloud: '', notes: '', mapId: null, assetIds: [], encounterId: null, creatureIds: [], loreIds: [], ...init } });
  ops.push({ t: 'set', p: ['sessions', s.id, 'currentSceneId'], v: id });
  sync.do(ops);
  return id;
}

/** Etwas zur aktuellen Szene hinzufügen – gibt es keine, entsteht eine Stegreif-Szene. */
function addToScene(sync, key, id) {
  const st = sync.state;
  const s = session(st);
  if (!s) return;
  let sc = currentScene(st);
  if (!sc) sc = s.scenes?.[insertScene(sync, {})];
  if (!sc) return;
  if (key === 'encounterId') {
    if (sc.encounterId && sc.encounterId !== id) return insertScene(sync, { title: tr('Stegreif: Begegnung'), encounterId: id });
    return sync.set(['sessions', s.id, 'scenes', sc.id, 'encounterId'], id);
  }
  const cur = sc[key] || [];
  if (!cur.includes(id)) sync.set(['sessions', s.id, 'scenes', sc.id, key], [...cur, id]);
}

// --- Werkzeugkasten für Spontanes ------------------------------------------------------------------------

/** Menüeinträge „Stegreif“ (für Szenenleiste und Panel). */
export function improviseActions(ctx) {
  const { sync, showCreature, showPanel } = ctx;
  return [
    [icon('plus'), tr(' Stegreif-Szene'), tr('Die Spieler gehen eigene Wege: neue Szene hinter der aktuellen – Notizen landen in der Nachbereitung'), async () => {
      const title = await prompt2(tr('Worum geht es?'), tr('Stegreif'));
      if (title === null) return;
      insertScene(sync, { title: title || tr('Stegreif') });
      showPanel('scene');
    }],
    ai.text && [icon('sparkles'), tr(' Spontan-NSC (KI)'), tr('Aus einem Satz: Werte, Hintergrund und Token'), async () => {
      const { openAiCreator } = await lazy.creatureAi();
      openAiCreator(sync, { mode: 'npc', onCreated: (id) => (addToScene(sync, 'creatureIds', id), showCreature(id)) });
    }],
    [icon('d20'), tr(' Spontan-NSC (würfeln)'), tr('Sofort ein NSC mit Namen, Persönlichkeit und Werten'), async () => {
      const { quickNpc } = await lazy.creatures();
      const id = await quickNpc(sync);
      if (id) (addToScene(sync, 'creatureIds', id), showCreature(id));
    }],
    ai.text && [icon('swords'), tr(' Zufallsbegegnung'), tr('Passend zu Ort und Stufe der Gruppe'), async () => {
      const { openRandomEncounter } = await lazy.encounterAi();
      openRandomEncounter(sync, (encId) => (addToScene(sync, 'encounterId', encId), showPanel('scene')));
    }],
    [icon('search'), tr(' Schnellsuche'), tr('Karte, Handout, Lore oder Kreatur finden (Strg+K)'), () => openQuickFind(ctx)],
  ].filter(Boolean);
}

/**
 * Schnellsuche über das Abenteuer (auf Wunsch die ganze Kampagne): Karten, Handouts, Lore, Kreaturen, Encounter –
 * jeweils mit der passenden Aktion (auf den Tisch, Spielern zeigen, Werte, in den Kampf).
 */
export function openQuickFind(ctx) {
  const { sync, cid, openMap, showCreature, showPanel } = ctx;
  const S = () => sync.state;
  let all = false;
  const input = h('input', { type: 'search', placeholder: tr('Suchen … (Name, Kategorie, Text)') });
  const scopeBtn = h('button.small', { type: 'button' });
  const list = h('div.quickfind-list');
  const player = (patch) => (sync.merge(['display', 'player'], patch), toast(tr('Auf dem Spieler-Display')));
  const render = () => {
    scopeBtn.textContent = all ? tr('Ganze Kampagne') : tr('Nur dieses Abenteuer');
    const st = S();
    const q = input.value.trim().toLowerCase();
    const ok = (x) => all || inScope(x);
    const hit = (...texts) => !q || texts.join(' ').toLowerCase().includes(q);
    const mapAssets = new Set(Object.values(st.maps).map((m) => m.assetId));
    const rows = [
      ...byOrder(st.maps).filter((m) => ok(m) && hit(m.name)).map((m) => [icon('map'), m.name, tr('Karte'), [
        [tr('Öffnen'), () => (openMap(m.id), dlg.close())],
        [tr('Auf den Tisch'), () => (openMap(m.id), putOnTable(sync, m.id, { blackout: false }), dlg.close())],
      ]]),
      ...byOrder(st.assets).filter((a) => !mapAssets.has(a.id) && ok(a) && hit(a.name)).map((a) => [icon(a.kind === 'image' ? 'image' : 'file'), a.name, a.kind === 'image' ? tr('Bild') : tr('Dokument'), [
        a.kind === 'image' ? [tr('Spielern zeigen'), () => player({ mode: 'image', assetId: a.id, caption: a.name })] : [tr('Öffnen'), () => window.open(fileUrl(cid, a), '_blank')],
        [tr('Zur Szene'), () => (addToScene(sync, 'assetIds', a.id), toast(tr('Zur Szene hinzugefügt')))],
      ]]),
      ...sortBy(Object.values(st.lore).filter((l) => ok(l) && hit(l.title, l.category, l.content)), 'title').map((l) => [icon('book'), l.title, l.category || tr('Lore'), [
        [tr('Spielern zeigen'), () => player({ mode: 'lore', loreId: l.id })],
        [tr('Zur Szene'), () => (addToScene(sync, 'loreIds', l.id), toast(tr('Zur Szene hinzugefügt')))],
      ]]),
      ...sortBy(Object.values(st.creatures || {}).filter((c) => ok(c) && hit(c.name, c.type, c.role)), (c) => c.name).map((c) => [icon(c.kind === 'npc' ? 'user' : 'skull'), c.name, c.kind === 'npc' ? c.role || tr('NSC') : tr('HG {cr}', { cr: c.cr || '–' }), [
        [tr('Werte'), () => (showCreature(c.id), dlg.close())],
        [tr('Zur Szene'), () => (addToScene(sync, 'creatureIds', c.id), toast(tr('Zur Szene hinzugefügt')))],
      ]]),
      ...sortBy(Object.values(st.encounters || {}).filter((e) => ok(e) && hit(e.name)), (e) => -(e.createdAt || 0)).map((e) => [icon('swords'), e.name, tr('Begegnung'), [
        [tr('Verdeckt setzen & Kampf'), () => (startEncounter(sync, e), dlg.close())],
        [tr('Zur Szene'), () => (addToScene(sync, 'encounterId', e.id), showPanel('scene'), dlg.close())],
      ]]),
    ].slice(0, 60);
    fill(
      list,
      rows.length
        ? rows.map(([ic, name, kind, actions]) => h('div.quickfind-row', ic, h('div.grow', h('b', name), h('span.small.muted', ` · ${kind}`)), actions.map(([label, fn], i) => h(i === 0 ? 'button.small.primary' : 'button.small', { type: 'button', onclick: fn }, label))))
        : h('p.muted', all ? tr('Nichts gefunden.') : tr('Nichts im Abenteuer – „Ganze Kampagne“ durchsucht alles.')),
    );
  };
  input.addEventListener('input', render);
  scopeBtn.addEventListener('click', () => ((all = !all), render()));
  const dlg = h('dialog.modal.ai-dialog.quickfind');
  fill(dlg, h('div.row', h('h3.grow', icon('search'), tr(' Schnellsuche')), scopeBtn, h('button.small', { type: 'button', onclick: () => dlg.close(), title: tr('Schließen') }, icon('x'))), input, list);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  render();
  input.focus();
}

/** „Session beenden“: offene Szenen auf Wunsch weiterschieben, dann zur Nachbereitung. */
export function endSession(ctx) {
  const { sync, go } = ctx;
  const st = sync.state;
  const s = session(st);
  if (!s) return;
  const open = scenesOf(s).filter((x) => x.status !== 'done');
  if (!confirm(tr('Session „{name}“ beenden?', { name: s.name }))) return;
  if (open.length && confirm(tr('{n} Szenen sind noch offen. In die nächste Session schieben?', { n: open.length }))) {
    const r = carryOverOps(st, s.id, uid);
    if (r) sync.do(r.ops.filter((op) => !(op.p[0] === 'display' && op.p[1] === 'sessionId')));
  }
  sync.do([{ t: 'set', p: ['sessions', s.id, 'status'], v: 'done' }, { t: 'set', p: ['sessions', s.id, 'endedAt'], v: Date.now() }]);
  go(`wrapup/${s.id}`);
}

// --- Szenenleiste über der Karte ----------------------------------------------------------------------------

export function sceneBar(ctx) {
  const { sync, go, showPanel, menuButton } = ctx;
  const el = h('div.scenebar');
  let sig = '';
  const render = () => {
    const st = sync.state;
    const s = session(st);
    const list = scenesOf(s);
    const cur = currentScene(st);
    const next = JSON.stringify([s?.id, cur?.id, list.map((x) => [x.id, x.title, x.status])]);
    if (next === sig) return;
    sig = next;
    const tools = menuButton('improvise', [icon('sparkles'), tr(' Stegreif')], () => improviseActions(ctx).map(([ic, label, title, fn]) => h('button.small', { title, onclick: fn }, ic, label)), { title: tr('Wenn die Spieler vom Weg abweichen') });
    if (!s) return fill(el, h('span.small.muted.grow', tr('Keine aktive Session – oben auswählen, dann stehen die Szenen hier bereit.')), tools);
    fill(
      el,
      h('span.strip-label', icon('calendar'), ` ${s.name}`),
      list.length
        ? h(
            'div.scenebar-list',
            list.map((x, i) =>
              h(
                'button.scenebar-item',
                { class: [x.id === cur?.id && 'current', x.status === 'done' && 'done', x.improvised && 'improvised'].filter(Boolean).join(' '), title: x.title, onclick: () => (setCurrent(sync, x.id), showPanel('scene')) },
                h('span.n', x.status === 'done' ? '✓' : String(i + 1)),
                h('span.name', x.title),
              ),
            ),
          )
        : h('span.small.muted.grow', tr('Keine Szenen geplant – spontan geht immer.'), ' ', h('button.small', { onclick: () => go(`session/${s.id}`) }, tr('Ablauf planen'))),
      tools,
      h('button.small', { title: tr('Session beenden und nachbereiten'), onclick: () => endSession(ctx) }, icon('check'), tr(' Beenden')),
    );
  };
  render();
  return { el, render };
}

// --- Panel „Ablauf“ -------------------------------------------------------------------------------------------

export function scenePanel(ctx) {
  const { sync, cid, openMap, showCreature, go } = ctx;
  const S = () => sync.state;
  const el = h('div.scene-panel');
  let refreshNotes = null;
  let sig = '';

  const render = () => {
    const st = S();
    const s = session(st);
    const sc = currentScene(st);
    const list = scenesOf(s);
    const d = st.display;
    const next = JSON.stringify([s?.id, sc, list.map((x) => [x.id, x.status]), d.player, d.table.mapId, d.table.blackout]);
    if (next === sig) return refreshNotes?.();
    sig = next;
    refreshNotes = null;
    if (!s) return fill(el, h('p.muted', tr('Keine aktive Session. Wähle oben eine Session – dann siehst du hier Szene für Szene alles, was du brauchst.')));
    if (!sc) return fill(el, h('p.muted', tr('Diese Session hat noch keine Szenen.')), h('button', { onclick: () => go(`session/${s.id}`) }, icon('calendar'), tr(' Ablauf planen')), h('div.row', { style: { flexWrap: 'wrap', gap: '6px', marginTop: '10px' } }, improviseActions(ctx).map(([ic, label, title, fn]) => h('button.small', { title, onclick: fn }, ic, label))));
    const i = list.indexOf(sc);
    const P = (...k) => ['sessions', s.id, 'scenes', sc.id, ...k];
    const map = st.maps[sc.mapId];
    const enc = st.encounters?.[sc.encounterId];
    const onTable = map && d.table.mapId === map.id && !d.table.blackout;
    const textLive = d.player.mode === 'text' && d.player.sceneId === sc.id;

    // Szene beginnen: Karte öffnen und auf den Tisch legen
    const begin = () => {
      setCurrent(sync, sc.id);
      if (map) {
        openMap(map.id);
        putOnTable(sync, map.id, { blackout: false });
      }
    };
    const notes = h('textarea', { rows: 3, placeholder: tr('Was ist passiert? Stichworte für die Nachbereitung …') });
    refreshNotes = bindInput(notes, () => S().sessions[s.id]?.scenes?.[sc.id]?.playNotes, (v) => sync.set(P('playNotes'), v), { debounceMs: 400 });
    const chips = (ids, coll, label, onTap) => {
      const items = (ids || []).map((id) => st[coll]?.[id]).filter(Boolean);
      return items.length ? h('div.scene-chips', items.map((x) => h('button.small', { onclick: () => onTap(x) }, label(x)))) : null;
    };

    fill(
      el,
      h(
        'div.row',
        h('button.small', { title: tr('Vorherige Szene'), disabled: i <= 0, onclick: () => setCurrent(sync, list[i - 1].id) }, icon('chevronLeft')),
        h('h3.grow', { style: { margin: 0 } }, h('span.muted', `${i + 1}. `), sc.title, sc.improvised ? h('span.chip', { style: { marginLeft: '6px' } }, tr('Stegreif')) : null),
        h('button.small', { title: tr('Nächste Szene'), disabled: i >= list.length - 1, onclick: () => setCurrent(sync, list[i + 1].id) }, icon('chevronRight')),
      ),
      h(
        'div.row',
        { style: { flexWrap: 'wrap', gap: '6px', margin: '8px 0' } },
        map ? h('button', { class: onTable ? 'active' : 'primary', title: tr('Karte der Szene öffnen und auf den Tisch legen'), onclick: begin }, icon('play'), onTable ? tr(' Läuft auf dem Tisch') : tr(' Szene beginnen')) : null,
        map ? h('button.small', { onclick: () => openMap(map.id) }, icon('map'), ` ${map.name}`) : h('span.small.muted', tr('Keine Karte für diese Szene')),
      ),
      sc.readAloud
        ? h(
            'div.scene-readaloud',
            h('div.row', h('b.grow', icon('book'), tr(' Vorlesen')), h('button.small', { class: textLive ? 'active' : '', title: tr('Text auf dem Spieler-Display zeigen'), onclick: () => sync.merge(['display', 'player'], textLive ? { mode: 'blank', sceneId: null } : { mode: 'text', text: sc.readAloud, caption: sc.title, sceneId: sc.id }) }, icon('image'), textLive ? tr(' Ausblenden') : tr(' Spielern zeigen'))),
            h('div.md', { innerHTML: markdown(sc.readAloud) }),
          )
        : null,
      sc.notes ? h('details.scene-dmnotes', { open: true }, h('summary', tr('Notizen für dich')), h('div.md.small', { innerHTML: markdown(sc.notes) })) : null,
      enc
        ? h(
            'div.scene-enc',
            h('div.row', h('b.grow', icon('swords'), ` ${enc.name}`), difficultyChip(st, enc)),
            h('div.row', { style: { gap: '6px', marginTop: '6px' } }, h('button.primary', { title: tr('Gegner verdeckt auf die Tischkarte setzen und mit der Gruppe in den Kampf'), onclick: () => (map && d.table.mapId !== map.id && begin(), startEncounter(sync, enc)) }, icon('swords'), tr(' Verdeckt setzen & Kampf')), h('button.small', { onclick: () => startEncounter(sync, enc, { onlyCombat: true }) }, tr('Nur Kampf'))),
          )
        : null,
      sc.assetIds?.length
        ? h('div', h('div.section-title', icon('image'), tr(' Handouts')), h('div.thumbs', (sc.assetIds || []).map((id) => st.assets[id]).filter(Boolean).map((a) => {
            const live = d.player.mode === 'image' && d.player.assetId === a.id;
            return h('div.thumb', { class: live ? 'live' : '', title: live ? tr('Erneut tippen zum Ausblenden') : tr('Auf dem Spieler-Display zeigen'), onclick: () => (a.kind !== 'image' ? window.open(fileUrl(cid, a), '_blank') : sync.merge(['display', 'player'], live ? { mode: 'blank' } : { mode: 'image', assetId: a.id, caption: a.name })) }, a.kind === 'image' ? h('img', { src: fileUrl(cid, a), loading: 'lazy' }) : icon('file', { size: 30 }), live ? h('span.badge', { style: { background: 'var(--ok)' } }, 'LIVE') : null, h('div.cap', a.name));
          })))
        : null,
      sc.creatureIds?.length ? h('div', h('div.section-title', icon('user'), tr(' NSCs & Kreaturen')), chips(sc.creatureIds, 'creatures', (c) => c.name, (c) => showCreature(c.id))) : null,
      sc.loreIds?.length ? h('div', h('div.section-title', icon('book'), tr(' Lore')), chips(sc.loreIds, 'lore', (l) => l.title, (l) => sync.merge(['display', 'player'], { mode: 'lore', loreId: l.id }))) : null,
      h('div.section-title', icon('note'), tr(' Was ist passiert?')),
      notes,
      h(
        'div.row',
        { style: { marginTop: '10px', gap: '6px', flexWrap: 'wrap' } },
        h('button', { class: sc.status === 'done' ? 'active' : '', onclick: () => sync.set(P('status'), sc.status === 'done' ? 'open' : 'done') }, icon('check'), sc.status === 'done' ? tr(' Erledigt') : tr(' Als erledigt')),
        i < list.length - 1 ? h('button.primary', { onclick: () => sync.do([{ t: 'set', p: P('status'), v: 'done' }, { t: 'set', p: ['sessions', s.id, 'currentSceneId'], v: list[i + 1].id }]) }, tr('Erledigt & weiter '), icon('chevronRight')) : null,
      ),
      h('div.section-title', icon('sparkles'), tr(' Spontan')),
      h('div.row', { style: { flexWrap: 'wrap', gap: '6px' } }, improviseActions(ctx).map(([ic, label, title, fn]) => h('button.small', { title, onclick: fn }, ic, label))),
    );
  };
  render();
  return { el, refresh: (changed) => ['sessions', 'display', 'maps', 'assets', 'lore', 'creatures', 'encounters', 'party', '*'].some((k) => changed.has(k)) && render() };
}
