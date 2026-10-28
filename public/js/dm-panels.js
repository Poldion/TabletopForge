// Seitenpanels der Spielleitung. Jedes Panel liefert { el, refresh(changed) }.
import { h, uid, clear, bindInput, byOrder, sortBy, markdown, fileUrl, toast, uploadFiles, prompt2 } from './util.js';
import { MAP_KINDS, isHandout, characterImageIds } from './components.js';
import { sketchPad } from './sketch.js';
import { renderStatblock } from './statblock.js';
import { addCreatureToInitiative, quickNpc, openNpcGenerator, openImportDialog } from './creatures-view.js';
import { icon } from './icons.js';
import { moodOptions } from './wled-admin.js';
import { createCombatPanel } from './combat-panel.js';
import * as Combat from './combat.js';
import { ENC_PREFIX, difficultyChip, evaluateEncounter, startEncounter } from './encounter-view.js';
import { tr } from './i18n.js';
import { inScope } from './scope-ui.js';
import { scenePanel } from './play-scenes.js';
import { ai } from './ai.js';
import { openAiCreator } from './creature-ai.js';
import { t } from './i18n.js';
import { dist } from './units-ui.js';
import { createRulesView } from './rules.js';

// [Symbol, Beschriftung]
export const PANELS = {
  // Ablauf = Szenen der aktiven Session (Drehbuch); Karte = alles zur geöffneten Karte
  scene: ['calendar', tr('Ablauf')],
  map: ['map', tr('Karte')],
  init: ['swords', tr('Kampf')],
  creatures: ['skull', tr('Kreaturen')],
  notes: ['note', tr('Notizen')],
  lore: ['book', tr('Lore')],
  // nur mit eingerichtetem Regelwerk (siehe rules.js)
  rules: ['scale', tr('Regeln')],
};

/**
 * Baut Inhalte neu auf, außer der Nutzer tippt gerade darin – dann wird nach dem Verlassen
 * des Feldes nachgeholt. So gehen keine Eingaben durch Synchronisation verloren.
 */
function live(build) {
  const el = h('div');
  let dirty = false;
  const run = () => {
    const a = document.activeElement;
    if (a && el.contains(a) && a.matches('input:not([type=checkbox]):not([type=range]):not([type=file]), textarea')) {
      dirty = true;
      return;
    }
    dirty = false;
    el.replaceChildren(...[build()].flat(Infinity).filter((c) => c != null && c !== false));
  };
  el.addEventListener('focusout', () =>
    setTimeout(() => {
      if (dirty) run();
    }, 0),
  );
  run();
  return { el, run };
}

const title = (text, ...extra) => h('div.section-title', text, ...extra);

export function createPanel(name, ctx) {
  const fn = builders[name] || builders.map;
  return fn(ctx);
}

const builders = {
  scene: (ctx) => scenePanel(ctx),
  rules: () => createRulesView(),
  // --- Karte: alles zur aktuellen Karte an einem Ort ---------------------------
  map({ sync, cid, currentMapId }) {
    const S = () => sync.state;
    const M = () => S().maps[currentMapId()];
    const editing = new Set(); // Textblöcke im Bearbeitungsmodus
    const openKey = 'dm:mapSections';
    let open;
    try {
      open = new Set(JSON.parse(localStorage.getItem(openKey) || '["notes"]'));
    } catch {
      open = new Set(['notes']);
    }
    const saveOpen = () => {
      try {
        localStorage.setItem(openKey, JSON.stringify([...open]));
      } catch {
        /* nicht verfügbar */
      }
    };

    /** Einklappbarer Abschnitt, dessen Zustand gemerkt wird. */
    const section = (key, label, ...children) =>
      h(
        'details.map-section',
        {
          open: open.has(key),
          ontoggle: (e) => {
            if (e.target.open) open.add(key);
            else open.delete(key);
            saveOpen();
          },
        },
        h('summary', label),
        h('div.map-section-body', ...children),
      );

    let focusKey = null;

    /** Markdown-Text: Antippen zum Bearbeiten, „Fertig“ zeigt wieder die Vorschau. */
    const mdBlock = (key, get, set, placeholder) => {
      if (editing.has(key)) {
        const ta = h('textarea', { rows: 10, placeholder });
        ta.value = get() || '';
        ta.addEventListener('input', () => set(ta.value));
        // Fokus anfordern, bis das Feld ihn wirklich hat (es kann kurz danach neu aufgebaut werden)
        ta.addEventListener('focus', () => {
          if (focusKey === key) focusKey = null;
        });
        if (focusKey === key) {
          setTimeout(() => {
            if (ta.isConnected) {
              ta.focus();
              ta.setSelectionRange(ta.value.length, ta.value.length);
            }
          }, 0);
        }
        return h(
          'div',
          ta,
          h(
            'div.row.end',
            { style: { marginTop: '4px' } },
            h('span.small.muted.grow', '# Überschrift · **fett** · *kursiv* · - Liste'),
            h('button.small.primary', {
              // pointerdown statt click: reagiert vor dem Verlassen des Textfelds
              onpointerdown: (e) => {
                e.preventDefault();
                editing.delete(key);
                document.activeElement?.blur();
                content.run();
              },
            }, tr('Fertig')),
          ),
        );
      }
      const text = get() || '';
      return h('div.md.md-editable', {
        title: tr('Antippen zum Bearbeiten'),
        innerHTML: text.trim() ? markdown(text) : `<p class="muted small">${placeholder} – antippen zum Schreiben.</p>`,
        onclick: (e) => {
          if (e.target.closest('a')) return;
          editing.add(key);
          focusKey = key;
          content.run();
        },
      });
    };

    const handoutThumb = (map, a, removable = true) => {
      const p = S().display.player;
      const isLive = p.mode === 'image' && p.assetId === a.id;
      return h(
        'div.thumb',
        {
          class: isLive ? 'live' : '',
          title: a.kind !== 'image' ? tr('Dokument öffnen') : isLive ? tr('Erneut tippen zum Ausblenden') : tr('Auf dem Spieler-Display zeigen'),
          onclick: () => {
            if (a.kind !== 'image') return window.open(fileUrl(cid, a), '_blank');
            sync.merge(['display', 'player'], isLive ? { mode: 'blank' } : { mode: 'image', assetId: a.id });
          },
        },
        a.kind === 'image' ? h('img', { src: fileUrl(cid, a), alt: '', loading: 'lazy' }) : icon('file', { size: 30 }),
        isLive ? h('span.badge', { style: { background: 'var(--ok)' } }, 'LIVE') : null,
        removable && h('button.thumb-x', {
          title: tr('Von dieser Karte entfernen'),
          onclick: (e) => {
            e.stopPropagation();
            sync.set(['maps', map.id, 'handoutIds'], (M().handoutIds || []).filter((x) => x !== a.id));
          },
        }, icon('x')),
        h('div.cap', a.name),
      );
    };

    const content = live(() => {
      const map = M();
      if (!map) return h('p.muted.small', tr('Keine Karte geöffnet. Wähle oben eine Karte aus.'));
      const st = S();
      const P = (...k) => ['maps', map.id, ...k];
      const d = st.display;
      const onTable = d.table.mapId === map.id;
      const tokens = sortBy(Object.values(map.tokens || {}), (t) => `${t.kind}|${t.name}`);
      const hiddenCount = tokens.filter((t) => t.hidden).length;

      // Handouts dieser Karte
      const handouts = (map.handoutIds || []).map((id) => st.assets[id]).filter(Boolean);
      const mapAssets = new Set(Object.values(st.maps).map((m) => m.assetId));
      const charIds = characterImageIds(st);
      const assignable = byOrder(st.assets).filter((a) => !mapAssets.has(a.id) && !handouts.includes(a) && inScope(a) && isHandout(st, a, charIds));
      const file = h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, class: 'hidden' });
      file.addEventListener('change', async () => {
        const created = await uploadFiles(cid, [...file.files]);
        sync.set(P('handoutIds'), [...(M().handoutIds || []), ...created.map((a) => a.id)]);
        toast(tr('{length} Handout(s) hinzugefügt', { length: created.length }));
      });
      const pick = h('select', { style: { flex: 1, minWidth: '140px', width: 'auto' } }, h('option', { value: '' }, tr('+ Vorhandenes zuordnen …')), ...assignable.map((a) => h('option', { value: a.id }, a.name)));
      pick.addEventListener('change', () => {
        if (pick.value) sync.set(P('handoutIds'), [...(M().handoutIds || []), pick.value]);
      });

      // Handouts der aktiven Session, die nicht schon bei der Karte stehen
      const sessionHandouts = (st.sessions[d.sessionId]?.assetIds || []).map((id) => st.assets[id]).filter((a) => a && !handouts.includes(a));

      // Lore dieser Karte
      const lore = sortBy(Object.values(st.lore).filter((l) => l.mapIds?.includes(map.id)), 'title');
      const linkable = sortBy(Object.values(st.lore).filter((l) => !l.mapIds?.includes(map.id) && inScope(l)), 'title');
      const lorePick = h('select', { style: { flex: 1, minWidth: '140px', width: 'auto' } }, h('option', { value: '' }, tr('+ Eintrag verknüpfen …')), ...linkable.map((l) => h('option', { value: l.id }, l.title)));
      lorePick.addEventListener('change', () => {
        const l = st.lore[lorePick.value];
        if (l) sync.set(['lore', l.id, 'mapIds'], [...(l.mapIds || []), map.id]);
      });

      const caption = h('input', { placeholder: tr('optional'), style: { flex: 1, width: 'auto' } });
      caption.value = d.player.caption || '';
      caption.addEventListener('input', () => sync.set(['display', 'player', 'caption'], caption.value));

      return [
        h('div.row', h('h3.grow', { style: { margin: '0' } }, map.name), h('span.chip', MAP_KINDS[map.kind]), onTable ? h('span.chip', { title: tr('Läuft auf dem Spieltisch') }, icon('monitor'), tr(' Tisch')) : null),

        section('notes', [icon('note'), tr(' Notizen zur Karte')], mdBlock(`notes:${map.id}`, () => M()?.notes, (v) => sync.set(P('notes'), v), tr('Raumbeschreibungen, NPC-Werte, Fallen, Hinweise'))),

        section(
          'handouts',
          [icon('image'), tr(' Handouts zur Karte ({length})', { length: handouts.length })],
          handouts.length ? h('div.thumbs', handouts.map((a) => handoutThumb(map, a))) : h('p.small.muted', tr('Noch keine Handouts. Ein Bild antippen zeigt es auf dem Spieler-Display.')),
          h('div.row', { style: { marginTop: '8px' } }, file, h('button.small', { onclick: () => file.click() }, icon('upload'), tr(' Hochladen')), assignable.length ? pick : null),
          d.player.mode === 'image'
            ? h('div.row', { style: { marginTop: '8px' } }, h('span.small.muted', tr('Bildunterschrift')), caption, h('button.small', { onclick: () => sync.merge(['display', 'player'], { mode: 'blank' }) }, tr('Ausblenden')))
            : null,
        ),

        sessionHandouts.length
          ? section('sessionHandouts', [icon('calendar'), tr(' Handouts der Session ({length})', { length: sessionHandouts.length })], h('div.thumbs', sessionHandouts.map((a) => handoutThumb(map, a, false))))
          : null,

        section(
          'lore',
          [icon('book'), tr(' Lore zur Karte ({length})', { length: lore.length })],
          ...lore.map((l) =>
            h(
              'div.lore-card',
              h(
                'div.row',
                h('strong.grow', l.title),
                l.category ? h('span.chip', l.category) : null,
                h('button.small', { title: tr('Den Spielern zeigen'), class: d.player.mode === 'lore' && d.player.loreId === l.id ? 'active' : '', onclick: () => sync.merge(['display', 'player'], { mode: 'lore', loreId: l.id }) }, icon('image')),
                h('button.small', { title: tr('Verknüpfung mit der Karte lösen'), onclick: () => sync.set(['lore', l.id, 'mapIds'], (l.mapIds || []).filter((x) => x !== map.id)) }, icon('x')),
              ),
              mdBlock(`lore:${l.id}`, () => S().lore[l.id]?.content, (v) => sync.set(['lore', l.id, 'content'], v), tr('Inhalt')),
            ),
          ),
          h(
            'div.row',
            { style: { marginTop: '8px' } },
            h('button.small', {
              onclick: async () => {
                const t = await prompt2(tr('Titel des neuen Lore-Eintrags'));
                if (!t) return;
                const id = uid();
                editing.add(`lore:${id}`);
                focusKey = `lore:${id}`;
                sync.set(['lore', id], { id, title: t, category: '', content: '', pinned: false, mapIds: [map.id], createdAt: Date.now() });
              },
            }, icon('plus'), tr(' Neuer Eintrag')),
            linkable.length ? lorePick : null,
          ),
        ),

        section(
          'encounter',
          [icon('swords'), tr(' Encounter ({length}{x})', { length: tokens.length, x: hiddenCount ? tr(', {hiddenCount} verdeckt', { hiddenCount }) : '' })],
          hiddenCount
            ? h('button.primary', { style: { width: '100%', marginBottom: '6px' }, onclick: () => sync.do(tokens.filter((t) => t.hidden).map((t) => ({ t: 'set', p: P('tokens', t.id, 'hidden'), v: false }))) }, icon('swords'), tr(' Kampf beginnen – {hiddenCount} verdeckte aufdecken', { hiddenCount }))
            : null,
          tokens.length
            ? h(
                'div.list',
                tokens.map((t) =>
                  h(
                    'div.list-item',
                    h('span', { style: { width: '14px', height: '14px', borderRadius: '50%', background: t.color, display: 'inline-block', flexShrink: 0 } }),
                    h('span.title', { style: { opacity: t.hidden ? 0.6 : 1, textDecoration: t.dead ? 'line-through' : 'none' } }, t.name),
                    t.maxHp ? h('span.small.muted', `${t.hp ?? t.maxHp}/${t.maxHp}`) : null,
                    h('button.small', { title: t.hidden ? tr('Aufdecken') : tr('Verdecken'), onclick: () => sync.set(P('tokens', t.id, 'hidden'), !t.hidden) }, icon(t.hidden ? 'eyeOff' : 'eye')),
                  ),
                ),
              )
            : h('p.small.muted', tr('Mit dem Werkzeug „Token“ Gegner und NSCs platzieren – „verdeckt“ ist vorausgewählt, damit du Encounter vorab vorbereiten kannst.')),
          tokens.length
            ? h('button.small', {
                style: { marginTop: '6px' },
                onclick: () => {
                  const existing = new Set(Object.values(S().initiative?.entries || {}).map((e) => e.tokenId));
                  const tx = Combat.begin(S());
                  let n = 0;
                  for (const t of tokens) {
                    if (existing.has(t.id) || t.dead) continue;
                    n++;
                    Combat.addCombatant(tx, { name: t.name, kind: t.kind || 'enemy', tokenId: t.id, creatureId: t.creatureId || null, hp: t.hp, maxHp: t.maxHp });
                  }
                  sync.do(tx.ops);
                  toast(tr('{n} zum Kampf hinzugefügt', { n }));
                },
              }, tr('Alle in den Kampf'))
            : null,
        ),

        section(
          'fog',
          [icon('cloud'), tr(' Nebel, Licht & Raster')],
          h(
            'div.row',
            h('label.inline', h('input', { type: 'checkbox', checked: !!map.fog?.enabled, onchange: (e) => sync.merge(P('fog'), { enabled: e.target.checked }) }), tr('Nebel aktiv')),
            h('button.small', { onclick: () => sync.set(P('fog', 'ops'), [{ m: 'reveal', s: 'all' }]) }, tr('Alles aufdecken')),
            h('button.small', { onclick: () => confirm(tr('Gesamte Karte verdecken? Der Erkundungsstand geht verloren.')) && sync.set(P('fog', 'ops'), []) }, tr('Alles verdecken')),
          ),
          h(
            'div.row',
            { style: { marginTop: '8px' } },
            h('label.inline', h('input', { type: 'checkbox', checked: !!map.lighting?.enabled, onchange: (e) => sync.set(P('lighting'), { ambient: 0.15, ...(map.lighting || {}), enabled: e.target.checked }) }), tr('Beleuchtung')),
            h('span.small.muted', tr('Umgebung')),
            h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: map.lighting?.ambient ?? 0.15, style: { flex: 1 }, oninput: (e) => sync.set(P('lighting'), { enabled: true, ...(map.lighting || {}), ambient: Number(e.target.value) }) }),
          ),
          h(
            'div.list',
            Object.values(map.lights || {}).map((l) =>
              h(
                'div.list-item',
                h('span', { style: { color: l.color } }, icon('bulb')),
                h('span.title', l.tokenId ? tr('Fackel: {x}', { x: map.tokens?.[l.tokenId]?.name || '?' }) : tr('Lichtquelle'), h('span.small.muted', ` ${dist(l.bright ?? 20)} / ${dist(l.dim ?? 20)}`)),
                h('button.small', { class: l.on !== false ? 'active' : '', onclick: () => sync.set(P('lights', l.id, 'on'), l.on === false) }, l.on !== false ? tr('an') : tr('aus')),
              ),
            ),
          ),
          h('label.inline', { style: { marginTop: '8px' } }, h('input', { type: 'checkbox', checked: map.grid?.show !== false, onchange: (e) => sync.merge(P('grid'), { show: e.target.checked }) }), tr('Raster anzeigen')),
          h(
            'div.row',
            { style: { marginTop: '8px' }, title: tr('Stimmung der LED-Streifen (WLED), solange diese Karte auf dem Tisch liegt') },
            h('span.small.muted', icon('bulb'), tr(' LED-Stimmung')),
            h('select', { style: { flex: 1 }, onchange: (e) => sync.set(P('ledMood'), e.target.value || null) }, moodOptions(map.ledMood)),
          ),
        ),
      ];
    });

    return { el: content.el, refresh: () => content.run() };
  },

  // --- Kampf (Initiative mit Regelunterstützung) ------------------------------------
  init(ctx) {
    return createCombatPanel(ctx);
  },

  // --- Kreaturen: schnell nachschlagen, setzen, in die Initiative -----------------
  creatures({ sync, cid, placeCreature, go }) {
    const S = () => sync.state;
    const search = h('input', { type: 'search', placeholder: tr('NSC oder Monster suchen …') });
    let openId = null;
    let filter = 'all';
    // Neu angelegte Kreatur direkt aufgeklappt zeigen
    const openCreated = (id) => {
      openId = id;
      search.value = '';
      filter = 'all';
      content.run();
      setTimeout(() => el.querySelector(`[data-creature="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
    };
    const quickBtn = () =>
      h('button.small.primary', {
        title: tr('Zufälligen NSC würfeln und sofort anlegen – für spontane Begegnungen'),
        onclick: async (e) => {
          e.currentTarget.disabled = true;
          openCreated(await quickNpc(sync));
        },
      }, icon('d20'), tr(' Spontan-NSC'));
    const importBtn = () => h('button.small', { onclick: () => openImportDialog(sync, openCreated), title: tr('Monster aus der Datenbank oder per Statblock importieren') }, icon('download'), tr(' Import'));

    const content = live(() => {
      const st = S();
      const q = search.value.trim().toLowerCase();
      const all = sortBy(Object.values(st.creatures || {}).filter(inScope), (c) => c.name.toLowerCase());
      const list = all.filter((c) => (filter === 'all' || c.kind === filter) && (!q || `${c.name} ${c.type} ${c.role} ${c.location}`.toLowerCase().includes(q)));
      if (!all.length) {
        return [
          h('p.small.muted', tr('Noch keine Kreaturen angelegt.')),
          h('div.row', h('button', { onclick: () => go('creatures') }, icon('skull'), tr(' Zur Kreaturen-Kartei')), quickBtn(), importBtn()),
        ];
      }
      return [
        h(
          'div.row',
          { style: { margin: '6px 0' } },
          ...Object.entries({ all: tr('Alle'), npc: tr('NSCs'), monster: tr('Monster') }).map(([k, l]) => h('button.small', { class: filter === k ? 'active' : '', onclick: () => ((filter = k), content.run()) }, l)),
          h('span.spacer'),
          h('button.small', { onclick: () => go('creatures'), title: tr('Kartei öffnen') }, icon('edit'), tr(' Kartei')),
        ),
        h('div.row', { style: { marginBottom: '8px' } }, quickBtn(), h('button.small', { onclick: () => openNpcGenerator(sync, openCreated), title: tr('NSC mit Generator erstellen') }, icon('d20'), tr(' Generator')), importBtn(), ai.text ? h('button.small', { onclick: () => openAiCreator(sync, { mode: 'npc', onCreated: openCreated }), title: tr('Spontan-NSC aus einem Satz – mit Werten und Token') }, icon('sparkles'), tr(' KI')) : null),
        // Geplante Encounter: mit einem Klick verdeckt auf die Karte und in den Kampf
        Object.keys(st.encounters || {}).length && !q
          ? [
              h('div.section-title', icon('swords'), tr(' Encounter')),
              sortBy(Object.values(st.encounters).filter(inScope), (e) => -(e.createdAt || 0)).map((e) =>
                h(
                  'div.list-item',
                  h('span.title', { style: { cursor: 'pointer' }, onclick: () => go(`creatures/${ENC_PREFIX}${e.id}`), title: tr('Im Planer öffnen') }, e.name, h('div.small.muted', tr('{count} Gegner', { count: evaluateEncounter(st, e).count }))),
                  difficultyChip(st, e),
                  h('button.small', { onclick: () => startEncounter(sync, e), title: tr('Gegner verdeckt auf die Karte des Spieltischs setzen und in den Kampf nehmen') }, icon('swords'), tr(' Start')),
                ),
              ),
              h('div.section-title', icon('skull'), tr(' Kreaturen')),
            ]
          : null,
        list.length ? null : h('p.small.muted', tr('Keine Treffer.')),
        ...list.map((c) => {
          const isOpen = openId === c.id;
          const portrait = c.portraitAssetId && st.assets[c.portraitAssetId] ? fileUrl(cid, st.assets[c.portraitAssetId]) : '';
          return h(
            'div.lore-card',
            { dataset: { creature: c.id } },
            h(
              'div.row',
              { style: { cursor: 'pointer' }, onclick: () => ((openId = isOpen ? null : c.id), content.run()) },
              icon(c.kind === 'npc' ? 'user' : 'skull'),
              h('strong.grow', c.name),
              h('span.small.muted', c.kind === 'npc' ? c.role || tr('NSC') : tr('HG {x}', { x: c.cr || '–' })),
              h('span.small.muted', icon(isOpen ? 'chevronDown' : 'chevronRight')),
            ),
            isOpen
              ? h(
                  'div',
                  h(
                    'div.row',
                    { style: { margin: '8px 0' } },
                    placeCreature ? h('button.small.primary', { onclick: () => placeCreature(c) }, icon('token'), tr(' Auf Karte setzen')) : null,
                    h('button.small', { onclick: () => addCreatureToInitiative(sync, c) }, icon('swords'), tr(' Initiative')),
                    h('button.small', { onclick: () => go(`creatures/${c.id}`) }, icon('edit'), tr(' Bearbeiten')),
                  ),
                  renderStatblock(c, { compact: true, portraitUrl: portrait }),
                )
              : null,
          );
        }),
      ];
    });
    search.addEventListener('input', () => content.run());

    // Von außen (z.B. Token-Inspektor) eine Kreatur aufklappen
    const onShow = (e) => {
      if (!el.isConnected) return window.removeEventListener('show-creature', onShow);
      openId = e.detail;
      search.value = '';
      filter = 'all';
      content.run();
      el.querySelector(`[data-creature="${openId}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    window.addEventListener('show-creature', onShow);

    const el = h('div', search, content.el);
    return {
      el,
      refresh: (changed) => (changed.has('creatures') || changed.has('assets') || changed.has('*')) && content.run(),
      open(id) {
        onShow({ detail: id });
      },
    };
  },

  // --- Notizen -----------------------------------------------------------------
  notes({ sync }) {
    const S = () => sync.state;
    const sid = () => S().display.sessionId;
    const live2 = h('textarea', { rows: 10, placeholder: tr('Laufende Notizen dieser Session: Ereignisse, Namen, Beute, offene Fäden …') });
    const refreshLive = bindInput(live2, () => S().sessions[sid()]?.liveNotes, (v) => sid() && sync.set(['sessions', sid(), 'liveNotes'], v));
    const pad = h('textarea', { rows: 6, placeholder: tr('Kampagnenweiter Notizblock') });
    const refreshPad = bindInput(pad, () => S().notepad, (v) => sync.set(['notepad'], v));
    const sketchPath = () => (sid() && S().sessions[sid()] ? ['sessions', sid(), 'sketch'] : ['notepadSketch']);
    const sketch = sketchPad(sync, sketchPath);
    const sessionLabel = h('div.small.muted');
    const prepNotes = h('details', h('summary.small', tr('Vorbereitungsnotizen der Session')), h('div.md'));
    const refresh = () => {
      const s = S().sessions[sid()];
      sessionLabel.textContent = s ? tr('Session: {name}', { name: s.name }) : tr('Keine aktive Session – die Notizen landen im Kampagnen-Notizblock.');
      live2.disabled = !s;
      refreshLive();
      refreshPad();
      prepNotes.classList.toggle('hidden', !s?.notes);
      prepNotes.querySelector('.md').innerHTML = markdown(s?.notes || '');
      sketch.render();
    };
    const el = h('div', sessionLabel, prepNotes, title(tr('Session-Notizen')), live2, title(tr('Handschriftlich (Stift / Finger)')), sketch.el, title(tr('Kampagnen-Notizblock')), pad);
    refresh();
    return { el, refresh };
  },

  // --- Lore --------------------------------------------------------------------
  lore({ sync, currentMapId }) {
    const S = () => sync.state;
    const search = h('input', { type: 'search', placeholder: tr('Lore durchsuchen …') });
    const open = new Set();
    const entry = (l, highlight) =>
      h(
        'details',
        {
          open: open.has(l.id),
          ontoggle: (e) => (e.target.open ? open.add(l.id) : open.delete(l.id)),
          style: { background: 'var(--panel2)', borderRadius: '8px', padding: '6px 10px', marginBottom: '6px', border: highlight ? '1px solid var(--accent)' : '1px solid transparent' },
        },
        h('summary', l.pinned ? [icon('pin'), ' '] : '', h('strong', l.title), l.category ? h('span.chip', { style: { marginLeft: '6px' } }, l.category) : null),
        h('div.md', { innerHTML: markdown(l.content) }),
        h('div.row.end', h('button.small', { onclick: () => sync.merge(['display', 'player'], { mode: 'lore', loreId: l.id }) }, icon('image'), tr(' Spielern zeigen'))),
      );
    const content = live(() => {
      const st = S();
      const session = st.sessions[st.display.sessionId];
      const mapId = currentMapId();
      const q = search.value.trim().toLowerCase();
      const all = sortBy(Object.values(st.lore).filter((l) => inScope(l) || l.pinned), 'title');
      const inContext = (l) => l.pinned || l.mapIds?.includes(mapId) || l.mapIds?.includes(st.display.table.mapId) || session?.loreIds?.includes(l.id);
      const matches = (l) => !q || `${l.title} ${l.category} ${l.content}`.toLowerCase().includes(q);
      const ctx = all.filter((l) => inContext(l) && matches(l));
      const rest = all.filter((l) => !inContext(l) && matches(l));
      if (!all.length) return h('p.small.muted', tr('Noch keine Lore hinterlegt. Einträge werden in der Vorbereitung unter „Lore“ angelegt.'));
      return [
        title(tr('Im aktuellen Kontext')),
        ctx.length ? ctx.map((l) => entry(l, true)) : h('p.small.muted', tr('Keine angepinnten oder mit Karte/Session verknüpften Einträge.')),
        title(tr('Weitere Einträge')),
        rest.map((l) => entry(l, false)),
      ];
    });
    search.addEventListener('input', () => content.run());
    return { el: h('div', search, content.el), refresh: () => content.run() };
  },

};
