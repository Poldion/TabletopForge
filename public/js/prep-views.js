// Verwaltungsansichten der Kampagne (Kampagne, Sessions, Karten, Handouts, Lore).
// Werden in der App-Oberfläche (dm.html) als Bereiche der Seitennavigation angezeigt.
import { $$, h, clear, fill, uid, bindInput, byOrder, sortBy, markdown, fileUrl, getImage, api, toast, prompt2 } from './util.js';
import { MapRenderer, gridOf } from './maprender.js';
import { Viewport } from './viewport.js';
import { thumb, dropzone, newMap, MAP_KINDS, statusLabel, isHandout, characterImageIds } from './components.js';
import { icon } from './icons.js';
import { tr, lang, LANGUAGES, languageSelect, locale } from './i18n.js';
import { UNIT_SYSTEMS, unitsOf } from '../../shared/units.js';
import { t } from './i18n.js';
import { distIn, distFrom, unitLabel } from './units-ui.js';
import { ai, aiTextButton, aiImageButton, mergeText } from './ai.js';
import { basalt, basaltVault } from './basalt.js';
import { inScope, adventureChips, addFromCampaign, scope } from './scope-ui.js';
import { membershipOp } from '../../shared/scope.js';

/**
 * @param {{ sync: import('./sync.js').Sync, cid: string, go: (route: string) => void, play: (opts?: { mapId?: string, sessionId?: string }) => void }} ctx
 */
export function createPrepViews({ sync, cid, go, play, adventure = () => null, setAdventure = () => {} }) {
  const S = () => sync.state;

  // --- Hilfen ------------------------------------------------------------------

  /** Textfeld mit Markdown-Vorschau. */
  function mdEditor(get, set, { rows = 12, placeholder = '', about = null } = {}) {
    const ta = h('textarea', { rows, placeholder });
    const preview = h('div.md.md-preview.hidden');
    const toggle = h('button.small', { type: 'button' }, tr('Vorschau'));
    toggle.addEventListener('click', () => {
      const on = preview.classList.toggle('hidden');
      ta.classList.toggle('hidden', !on);
      toggle.textContent = on ? tr('Vorschau') : tr('Bearbeiten');
      preview.innerHTML = markdown(ta.value);
    });
    const refresh = bindInput(ta, get, set, { debounceMs: 300 });
    return {
      el: h(
        'div',
        h(
          'div.row.end',
          h('span.small.muted.grow', tr('Markdown: # Überschrift, **fett**, *kursiv*, - Liste, > Zitat')),
          // KI: ausformulieren, Vorlesetext, Ideen … (nur mit eingerichtetem Sprachmodell)
          about
            ? aiTextButton(() => ({
                about: about(),
                current: () => ta.value,
                apply: (text, mode) => {
                  const v = mergeText(ta.value, text, mode);
                  ta.value = v;
                  set(v);
                },
              }))
            : null,
          toggle,
        ),
        ta,
        preview,
      ),
      refresh: () => {
        refresh();
        if (!preview.classList.contains('hidden')) preview.innerHTML = markdown(get());
      },
    };
  }

  /** Worum es geht – Kontext für das Sprachmodell (nicht angezeigt). */
  const campaignAbout = () => `Campaign "${S().name}"${S().description ? ` (${S().description})` : ''}`;

  function field(label, input) {
    return h('div', h('label', label), input);
  }

  const toggleIn = (arr, id) => (arr?.includes(id) ? arr.filter((x) => x !== id) : [...(arr || []), id]);

  // --- Ansichten ---------------------------------------------------------------

  const views = {
    campaign() {
      // Sprache: dieses Gerät (je Person) und die Anzeigen der Kampagne; Einheiten gelten für die ganze Kampagne
      const languageCard = () => {
        const st = S();
        const displayLang = h(
          'select',
          { onchange: (e) => sync.set(['display', 'lang'], e.target.value || null) },
          h('option', { value: '' }, tr('wie die Spielleitung ({x})', { x: LANGUAGES[lang] })),
          ...Object.entries(LANGUAGES).map(([k, l]) => h('option', { value: k, selected: st.display?.lang === k }, l)),
        );
        const units = h(
          'select',
          { onchange: (e) => sync.set(['units'], e.target.value) },
          ...Object.entries(UNIT_SYSTEMS).map(([k, l]) => h('option', { value: k, selected: unitsOf(st, st.display?.lang || 'de') === k }, tr(l))),
        );
        return h(
          'div.card',
          { style: { marginTop: '14px' } },
          h('h3', tr('Sprache & Einheiten')),
          h('div.grid3',
            field(tr('Sprache auf diesem Gerät'), languageSelect(h)),
            field(tr('Sprache für Spieltisch & Spieler-Display'), displayLang),
            field(tr('Einheiten'), units),
          ),
          h('p.small.muted', tr('Die eigene Sprache wählt jede Person für ihr Gerät. Einheiten: metrisch rechnet nach den deutschen Regelwerken (1 Feld = 1,5 m, 1 Meile = 1,5 km, 1 Pfund = 0,5 kg); gespeichert wird intern immer in Fuß, ein Wechsel ändert keine Daten.')),
        );
      };
      // Vault und Kampagne in BasaltNotes (für Charaktere und Hintergründe); ohne Auswahl Standard-Vault bzw. gleichnamig
      const basaltCard = () => {
        const setB = (v) => sync.set(['basalt'], { ...(S().basalt || {}), ...v });
        const sel = h('select', { onchange: (e) => setB({ campaign: e.target.value || null }) });
        const hint = h('p.small.muted', tr('Lädt aus BasaltNotes …'));
        const loadCampaigns = () => {
          fill(sel, h('option', { value: '' }, tr('gleichnamig („{name}“)', { name: S().name })));
          api('GET', `/api/basalt/campaigns?vault=${encodeURIComponent(basaltVault(S()))}`)
            .then((list) => {
              const cur = S().basalt?.campaign;
              sel.append(...list.map((c) => h('option', { value: c.title, selected: c.title === cur }, c.title)));
              if (cur && !list.some((c) => c.title === cur)) sel.append(h('option', { value: cur, selected: true }, cur));
              hint.textContent = list.length ? tr('Charaktere der Gruppe lassen sich mit ihren Notizen in dieser Kampagne verknüpfen.') : tr('In diesem Vault gibt es noch keine Kampagnen.');
            })
            .catch((err) => (hint.textContent = err.message));
        };
        // Vault wechseln: Kampagnenauswahl zurücksetzen (die alte gibt es dort meist nicht)
        const vaultSel = h('select', { onchange: (e) => (setB({ vault: e.target.value || null, campaign: null }), loadCampaigns()) }, h('option', { value: '' }, tr('Standard („{vault}“)', { vault: basalt.vault })));
        api('GET', '/api/basalt/vaults')
          .then((list) => {
            const cur = S().basalt?.vault;
            vaultSel.append(...list.map((v) => h('option', { value: v.id, selected: v.id === cur }, v.name === v.id ? v.id : `${v.name} (${v.id})`)));
            if (cur && !list.some((v) => v.id === cur)) vaultSel.append(h('option', { value: cur, selected: true }, cur));
          })
          .catch((err) => (hint.textContent = err.message));
        loadCampaigns();
        return h('div.card', { style: { marginTop: '14px' } }, h('h3', icon('book'), tr(' BasaltNotes')), h('div.grid2', field(tr('Vault'), vaultSel), field(tr('Kampagne in BasaltNotes'), sel)), hint);
      };
      const name = h('input', { maxlength: 120 });
      const desc = h('textarea', { rows: 4 });
      const stats = h('div.small');
      const refreshers = [
        bindInput(name, () => S().name, (v) => sync.set(['name'], v.trim() || 'Unbenannt')),
        bindInput(desc, () => S().description, (v) => sync.set(['description'], v)),
      ];
      const refresh = () => {
        refreshers.forEach((f) => f());
        const st = S();
        stats.textContent = tr('{length} Abenteuer · {length2} Sessions · {length3} Karten · {length4} Dateien · {length5} Lore-Einträge', { length: Object.keys(st.adventures).length, length2: Object.keys(st.sessions).length, length3: Object.keys(st.maps).length, length4: Object.keys(st.assets).length, length5: Object.keys(st.lore).length });
      };
      const el = h(
        'div.scroll',
        { style: { width: '100%' } },
        h(
          'div.page',
          h('div.card', h('h2', tr('Kampagne')), field(tr('Name'), name), field(tr('Beschreibung / Pitch'), desc), h('div.section-title', tr('Umfang')), stats),
          languageCard(),
          basalt.enabled ? basaltCard() : null,
          h(
            'div.card',
            { style: { marginTop: '14px' } },
            h('h3', tr('Anzeigen verbinden')),
            h('p.muted.small', tr('Öffne diese Adressen auf den jeweiligen Geräten im lokalen Netzwerk (z.B. im Browser des TVs oder eines angeschlossenen Mini-PCs):')),
            ...[
              [tr('Spielleitung (Laptop/Tablet)'), `/dm.html?c=${cid}`],
              [tr('Spieltisch (liegender TV)'), `/table.html?c=${cid}`],
              [tr('Spieler-Display'), `/player.html?c=${cid}`],
            ].map(([label, path]) => h('div.row', h('span', { style: { width: '220px' } }, label), h('a', { href: path, target: '_blank' }, location.origin + path))),
            h('div.section-title', tr('Sicherung')),
            h('a.btn', { href: `/api/campaigns/${cid}`, download: `${S().name}.json` }, tr('Kampagnendaten als JSON herunterladen')),
          ),
        ),
      );
      refresh();
      return { el, refresh };
    },

    sessions(selectedId, { solo = false } = {}) {
      const tree = h('div.tree');
      const editorBox = h('section');
      let editor = null;

      const addAdventure = async () => {
        const name = await prompt2(tr('Name des Abenteuers'), tr('Abenteuer {x}', { x: Object.keys(S().adventures).length + 1 }));
        if (!name) return;
        const id = uid();
        sync.set(['adventures', id], { id, name, order: Date.now(), notes: '' });
        setAdventure(id);
        renderTree();
      };
      const addSession = (adventureId) => {
        const id = uid();
        const n = Object.values(S().sessions).filter((s) => s.adventureId === adventureId).length + 1;
        sync.set(['sessions', id], {
          id,
          adventureId,
          name: `Session ${n}`,
          date: '',
          status: 'planned',
          order: Date.now(),
          notes: '',
          liveNotes: '',
          mapIds: [],
          assetIds: [],
          loreIds: [],
          sketch: {},
        });
        go(`sessions/${id}`);
      };

      const renderTree = () => {
        clear(tree);
        tree.append(h('button.primary', { onclick: addAdventure, style: { width: '100%', marginBottom: '12px' } }, icon('plus'), tr(' Neues Abenteuer')));
        // Nur das gewählte Abenteuer (Wechsel über „Abenteuer“ in der Navigation)
        const advs = byOrder(S().adventures).filter((a) => !adventure() || a.id === adventure());
        if (!advs.length) tree.append(h('p.muted.small', tr('Lege ein Abenteuer an, um Sessions zu planen.')));
        for (const adv of advs) {
          const sessions = sortBy(
            Object.values(S().sessions).filter((s) => s.adventureId === adv.id),
            (s) => s.order,
          );
          tree.append(
            h(
              'div.adventure',
              h(
                'div.list-item',
                h('span.title', adv.name),
                h('button.small', { title: tr('Session hinzufügen'), onclick: () => addSession(adv.id) }, icon('plus')),
                h(
                  'button.small',
                  {
                    title: tr('Umbenennen'),
                    onclick: async () => {
                      const name = await prompt2(tr('Abenteuer umbenennen'), adv.name);
                      if (name) sync.merge(['adventures', adv.id], { name });
                    },
                  },
                  icon('edit'),
                ),
                h(
                  'button.small',
                  {
                    title: tr('Löschen'),
                    onclick: () => {
                      if (!confirm(tr('Abenteuer „{name}“ samt {length} Sessions löschen?', { name: adv.name, length: sessions.length }))) return;
                      sync.do([...sessions.map((s) => ({ t: 'del', p: ['sessions', s.id] })), { t: 'del', p: ['adventures', adv.id] }]);
                    },
                  },
                  icon('trash'),
                ),
              ),
              ...sessions.map((s) =>
                h(
                  'div.list-item.clickable.session',
                  { class: s.id === selectedId ? 'selected' : '', onclick: () => go(`sessions/${s.id}`) },
                  h('span.title', s.name),
                  S().display.sessionId === s.id ? h('span.chip', { style: { borderColor: 'var(--ok)' } }, tr('aktiv')) : null,
                  h('span.small.muted', s.date ? new Date(s.date).toLocaleDateString(locale) : statusLabel[s.status] || ''),
                ),
              ),
            ),
          );
        }
      };

      const buildEditor = () => {
        const s = S().sessions[selectedId];
        if (!s) {
          editor = null;
          fill(editorBox, 
            h('div.muted', { style: { padding: '30px' } }, tr('Wähle links eine Session aus oder lege ein Abenteuer mit Sessions an.')),
          );
          return;
        }
        const P = (k) => ['sessions', s.id, k];
        const name = h('input');
        const date = h('input', { type: 'date' });
        const status = h('select', ...Object.entries(statusLabel).map(([v, l]) => h('option', { value: v }, l)));
        const adv = h('select');
        const notes = mdEditor(
          () => S().sessions[s.id]?.notes,
          (v) => sync.set(P('notes'), v),
          { placeholder: tr('Ablauf, Szenen, Hinweise, NPC-Werte …'), rows: 14, about: () => `${campaignAbout()}, notes for the session "${S().sessions[s.id]?.name || ''}"` },
        );
        const mapsBox = h('div.thumbs');
        const assetsBox = h('div.thumbs');
        const loreBox = h('div.row');
        const activeBtn = h('button.primary');
        const refreshers = [
          bindInput(name, () => S().sessions[s.id]?.name, (v) => sync.set(P('name'), v)),
          bindInput(date, () => S().sessions[s.id]?.date, (v) => sync.set(P('date'), v), { debounceMs: 0, event: 'change' }),
          bindInput(status, () => S().sessions[s.id]?.status, (v) => sync.set(P('status'), v), { debounceMs: 0, event: 'change' }),
          bindInput(adv, () => S().sessions[s.id]?.adventureId, (v) => sync.set(P('adventureId'), v), { debounceMs: 0, event: 'change' }),
          notes.refresh,
        ];

        const refresh = () => {
          const cur = S().sessions[s.id];
          if (!cur) return;
          clear(adv).append(...byOrder(S().adventures).map((a) => h('option', { value: a.id }, a.name)));
          refreshers.forEach((f) => f());
          const isActive = S().display.sessionId === s.id;
          fill(activeBtn, ...(isActive ? [icon('check'), tr(' Aktive Session')] : [tr('Als aktive Session setzen')]));
          activeBtn.disabled = isActive;

          clear(mapsBox);
          for (const m of byOrder(S().maps).filter((m) => inScope(m) || cur.mapIds?.includes(m.id))) {
            mapsBox.append(
              thumb(cid, S().assets[m.assetId], {
                caption: m.name,
                badge: MAP_KINDS[m.kind],
                selected: cur.mapIds?.includes(m.id),
                onclick: () => sync.set(P('mapIds'), toggleIn(S().sessions[s.id].mapIds, m.id)),
              }),
            );
          }
          if (!mapsBox.children.length) mapsBox.append(h('p.muted.small', tr('Noch keine Karten angelegt.')));

          clear(assetsBox);
          const mapAssets = new Set(Object.values(S().maps).map((m) => m.assetId));
          const charIds = characterImageIds(S());
          for (const a of byOrder(S().assets).filter((a) => !mapAssets.has(a.id) && ((inScope(a) && isHandout(S(), a, charIds)) || cur.assetIds?.includes(a.id)))) {
            assetsBox.append(
              thumb(cid, a, {
                selected: cur.assetIds?.includes(a.id),
                onclick: () => sync.set(P('assetIds'), toggleIn(S().sessions[s.id].assetIds, a.id)),
              }),
            );
          }
          if (!assetsBox.children.length) assetsBox.append(h('p.muted.small', tr('Noch keine Handouts hochgeladen.')));

          clear(loreBox);
          for (const l of sortBy(Object.values(S().lore), 'title').filter((l) => inScope(l) || cur.loreIds?.includes(l.id))) {
            const on = cur.loreIds?.includes(l.id);
            loreBox.append(
              h('button.small', { class: on ? 'active' : '', onclick: () => sync.set(P('loreIds'), toggleIn(S().sessions[s.id].loreIds, l.id)) }, l.title),
            );
          }
          if (!loreBox.children.length) loreBox.append(h('p.muted.small', tr('Noch keine Lore-Einträge.')));
        };

        activeBtn.addEventListener('click', () => {
          const ops = [{ t: 'set', p: ['display', 'sessionId'], v: s.id }];
          for (const other of Object.values(S().sessions)) {
            if (other.status === 'active' && other.id !== s.id) ops.push({ t: 'set', p: ['sessions', other.id, 'status'], v: 'done' });
          }
          ops.push({ t: 'set', p: P('status'), v: 'active' });
          sync.do(ops);
        });

        fill(editorBox, 
          h(
            'div',
            { style: { maxWidth: '1000px' } },
            h(
              'div.row',
              h('h2.grow', tr('Session vorbereiten')),
              activeBtn,
              h('button', { onclick: () => play({ sessionId: s.id }) }, icon('play'), tr(' Spielen')),
              h(
                'button.danger',
                {
                  onclick: () => {
                    if (!confirm(tr('Session löschen?'))) return;
                    sync.del(['sessions', s.id]);
                    go('sessions');
                  },
                },
                tr('Löschen'),
              ),
            ),
            h('div.grid3', field(tr('Name'), name), field(tr('Datum'), date), field(tr('Status'), status)),
            field(tr('Abenteuer'), adv),
            h('div.section-title', tr('Vorbereitungsnotizen')),
            notes.el,
            h('div.section-title', tr('Schnellauswahl: Karten')),
            h('p.small.muted', tr('Ausgewählte Karten stehen während der Session sofort griffbereit und werden auf den Anzeigen vorgeladen.')),
            mapsBox,
            h('div.section-title', tr('Schnellauswahl: Handouts & Bilder')),
            assetsBox,
            h(
              'div',
              { style: { marginTop: '8px' } },
              dropzone(cid, {
                label: tr('Neue Handouts direkt für diese Session hochladen: '),
                onUploaded: (created) => sync.set(P('assetIds'), [...(S().sessions[s.id].assetIds || []), ...created.map((a) => a.id)]),
              }),
            ),
            h('div.section-title', tr('Lore für diese Session')),
            loreBox,
          ),
        );
        editor = { refresh };
        refresh();
      };

      // Session-Ebene: nur die Vorbereitung dieser Session (die Liste steht in der Abenteuer-Übersicht)
      const el = solo ? h('div.scroll', { style: { width: '100%' } }, editorBox) : h('div.split', h('aside', tree), editorBox);
      renderTree();
      buildEditor();
      return {
        el,
        refresh() {
          renderTree();
          if (selectedId && !S().sessions[selectedId]) return go('sessions');
          editor?.refresh();
        },
      };
    },

    maps(selectedId) {
      const list = h('div');
      const editorBox = h('section', { style: { display: 'flex', flexDirection: 'column' } });
      let editor = null;
      const kindSel = h('select', ...Object.entries(MAP_KINDS).map(([v, l]) => h('option', { value: v }, l)));

      const createFromAsset = (asset) => {
        const m = newMap(asset, kindSel.value);
        sync.set(['maps', m.id], m);
        return m;
      };

      const renderList = () => {
        clear(list);
        // Bilder des Abenteuers, dazu Bilder ohne Abenteuer (z.B. von anderen Apps über die API hochgeladen)
        const charIds = characterImageIds(S());
        const usable = byOrder(S().assets).filter((a) => a.kind === 'image' && isHandout(S(), a, charIds));
        const imgs = usable.filter(inScope);
        const loose = scope.current() ? usable.filter((a) => !a.adventureIds?.length) : [];
        const pick = h(
          'select',
          h('option', { value: '' }, tr('– vorhandenes Bild wählen –')),
          ...imgs.map((a) => h('option', { value: a.id }, a.name)),
          loose.length ? h('optgroup', { label: tr('Mediathek – keinem Abenteuer zugeordnet') }, loose.map((a) => h('option', { value: a.id }, a.name))) : null,
        );
        pick.addEventListener('change', () => {
          const a = S().assets[pick.value];
          if (!a) return;
          // Bild aus der Mediathek: gehört ab jetzt auch zu diesem Abenteuer
          if (scope.current() && !inScope(a)) sync.do(membershipOp(S(), 'assets', a.id, scope.current(), true));
          go(`maps/${createFromAsset(a).id}`);
        });
        // append() schreibt null als Text – leere Einträge (kein KI-Knopf, nichts aus der Kampagne) weglassen
        list.append(...[
          h('div.section-title', tr('Neue Karte')),
          field(tr('Kartentyp'), kindSel),
          dropzone(cid, {
            accept: 'image/*',
            label: tr('Kartenbild hierher ziehen oder '),
            onUploaded: (created) => {
              let last = null;
              for (const a of created) last = createFromAsset(a);
              if (last) go(`maps/${last.id}`);
            },
          }),
          h('div', { style: { marginTop: '8px' } }, pick),
          ai.image
            ? h(
                'div',
                { style: { marginTop: '8px' } },
                aiImageButton(
                  () => ({
                    sync,
                    cid,
                    purpose: kindSel.value === 'battle' ? 'map' : 'town',
                    name: tr('KI-Karte'),
                    onDone: (a) => go(`maps/${createFromAsset(a).id}`),
                  }),
                  tr(' Karte mit KI erzeugen'),
                ),
              )
            : null,
          h('div.section-title', tr('Karten')),
          addFromCampaign(sync, 'maps', { label: tr('+ Karte aus der Kampagne hinzufügen …'), onAdded: (id) => go(`maps/${id}`) }),
        ].filter(Boolean));
        const grid = h('div.thumbs', { style: { marginTop: '8px' } });
        for (const m of byOrder(S().maps).filter(inScope)) {
          grid.append(
            thumb(cid, S().assets[m.assetId], {
              caption: m.name,
              badge: MAP_KINDS[m.kind],
              selected: m.id === selectedId,
              onclick: () => go(`maps/${m.id}`),
            }),
          );
        }
        list.append(grid);
      };

      const buildEditor = () => {
        editor?.destroy?.();
        const m0 = S().maps[selectedId];
        if (!m0) {
          editor = null;
          fill(editorBox, h('div.muted', { style: { padding: '30px' } }, tr('Wähle eine Karte aus oder lade ein Kartenbild hoch.')));
          return;
        }
        const id = m0.id;
        const M = () => S().maps[id];
        const P = (...k) => ['maps', id, ...k];

        const canvas = h('canvas');
        const renderer = new MapRenderer(canvas, { mode: 'dm', campaignId: cid, getState: S });
        renderer.fogAlpha = 0.35;
        renderer.setMap(id);
        let calib = null; // Rechteck zur Rasterausrichtung
        let calibMode = false;
        const cellsN = h('input', { type: 'number', min: 1, max: 50, value: 3, style: { width: '70px' } });
        const calibBtn = h('button.small', tr('Raster per Rechteck ausrichten'));
        calibBtn.addEventListener('click', () => {
          calibMode = !calibMode;
          calibBtn.classList.toggle('active', calibMode);
          canvas.style.cursor = calibMode ? 'crosshair' : 'grab';
        });
        renderer.overlay = (ctx) => {
          if (!calib) return;
          ctx.save();
          ctx.strokeStyle = '#ffd54a';
          ctx.lineWidth = 2 / renderer.view.scale;
          ctx.setLineDash([8 / renderer.view.scale, 5 / renderer.view.scale]);
          ctx.strokeRect(calib.x0, calib.y0, calib.x1 - calib.x0, calib.y1 - calib.y0);
          ctx.restore();
        };
        new Viewport(renderer, {
          isPanTool: () => !calibMode,
          onViewChange: () => (renderer.autoFit = null),
          onToolDown: (e, p) => {
            calib = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
          },
          onToolMove: (e, p) => {
            if (!calib) return;
            calib.x1 = p.x;
            calib.y1 = p.y;
            renderer.requestRender();
          },
          onToolUp: () => {
            if (!calib) return;
            const n = Math.max(1, parseInt(cellsN.value, 10) || 1);
            const w = Math.abs(calib.x1 - calib.x0);
            const hh = Math.abs(calib.y1 - calib.y0);
            const size = (w + hh) / 2 / n;
            if (size >= 5) {
              const x = Math.min(calib.x0, calib.x1);
              const y = Math.min(calib.y0, calib.y1);
              sync.merge(P('grid'), {
                size: Math.round(size * 100) / 100,
                offsetX: Math.round((x % size) * 100) / 100,
                offsetY: Math.round((y % size) * 100) / 100,
                show: true,
                cols: 0,
                rows: 0,
              });
              toast(tr('Rastergröße {toFixed} px übernommen', { toFixed: size.toFixed(1) }));
            }
            calib = null;
            calibMode = false;
            calibBtn.classList.remove('active');
            canvas.style.cursor = 'grab';
            renderer.requestRender();
          },
        });

        let fitted = false;
        const tryFit = () => {
          const img = renderer.image;
          if (!img) return getImage(fileUrl(cid, S().assets[M()?.assetId]), tryFit);
          if (!fitted) {
            renderer.autoFit = 20;
            fitted = renderer.fit(20);
          }
          const map = M();
          if (map && (map.width !== img.naturalWidth || map.height !== img.naturalHeight)) {
            sync.merge(P(), { width: img.naturalWidth, height: img.naturalHeight });
          }
        };

        const name = h('input');
        const kind = h('select', ...Object.entries(MAP_KINDS).map(([v, l]) => h('option', { value: v }, l)));
        const image = h('select');
        const gShow = h('input', { type: 'checkbox' });
        const gSize = h('input', { type: 'number', step: 0.1, min: 5 });
        const gCols = h('input', { type: 'number', step: 1, min: 0, placeholder: 'z.B. 30' });
        const gRows = h('input', { type: 'number', step: 1, min: 0, placeholder: 'z.B. 20' });
        const gOx = h('input', { type: 'number', step: 0.5 });
        const gOy = h('input', { type: 'number', step: 0.5 });
        const gFeet = h('input', { type: 'number', step: 'any', min: 0.1 });
        const gColor = h('input', { type: 'color' });
        const gOpacity = h('input', { type: 'range', min: 0, max: 1, step: 0.05 });
        const fogOn = h('input', { type: 'checkbox' });
        const lightOn = h('input', { type: 'checkbox' });
        const ambient = h('input', { type: 'range', min: 0, max: 1, step: 0.05 });
        const info = h('div.small.muted');
        const handoutsBox = h('div.thumbs');
        const notes = mdEditor(
          () => M()?.notes,
          (v) => sync.set(P('notes'), v),
          {
            rows: 10,
            placeholder: tr('Raumbeschreibungen, NPC-Werte, Fallen … erscheinen beim Spielen im Karten-Panel neben der Karte.'),
            about: () => `${campaignAbout()}, notes for the ${M()?.kind === 'battle' ? 'battle map' : 'map'} "${M()?.name || ''}"`,
          },
        );
        const num = (v) => parseFloat(v) || 0;
        const g = (k) => () => gridOf(M())[k];
        const refreshers = [
          bindInput(name, () => M()?.name, (v) => sync.set(P('name'), v)),
          bindInput(kind, () => M()?.kind, (v) => sync.set(P('kind'), v), { debounceMs: 0, event: 'change' }),
          bindInput(image, () => M()?.assetId, (v) => {
            fitted = false;
            sync.set(P('assetId'), v);
          }, { debounceMs: 0, event: 'change' }),
          bindInput(gShow, g('show'), (v) => sync.merge(P('grid'), { show: v }), { debounceMs: 0, event: 'change' }),
          bindInput(gSize, () => Math.round(gridOf(M()).size * 100) / 100, (v) => num(v) >= 5 && sync.merge(P('grid'), { size: num(v), cols: 0, rows: 0 }), { debounceMs: 150 }),
          bindInput(gCols, () => gridOf(M()).cols || '', (v) => sync.merge(P('grid'), { cols: Math.max(0, Math.round(num(v))), show: true }), { debounceMs: 250 }),
          bindInput(gRows, () => gridOf(M()).rows || '', (v) => sync.merge(P('grid'), { rows: Math.max(0, Math.round(num(v))), show: true }), { debounceMs: 250 }),
          bindInput(gOx, g('offsetX'), (v) => sync.merge(P('grid'), { offsetX: num(v) }), { debounceMs: 150 }),
          bindInput(gOy, g('offsetY'), (v) => sync.merge(P('grid'), { offsetY: num(v) }), { debounceMs: 150 }),
          bindInput(gFeet, () => distIn(g('feet')() || 5), (v) => num(v) > 0 && sync.merge(P('grid'), { feet: distFrom(v) }), { debounceMs: 150 }),
          bindInput(gColor, g('color'), (v) => sync.merge(P('grid'), { color: v }), { debounceMs: 100 }),
          bindInput(gOpacity, g('opacity'), (v) => sync.merge(P('grid'), { opacity: num(v) }), { debounceMs: 50 }),
          bindInput(fogOn, () => M()?.fog?.enabled, (v) => sync.merge(P('fog'), { enabled: v }), { debounceMs: 0, event: 'change' }),
          bindInput(lightOn, () => M()?.lighting?.enabled, (v) => sync.merge(P('lighting'), { enabled: v }), { debounceMs: 0, event: 'change' }),
          bindInput(ambient, () => M()?.lighting?.ambient ?? 0.15, (v) => sync.merge(P('lighting'), { ambient: num(v) }), { debounceMs: 50 }),
          notes.refresh,
        ];
        const nudge = (k, d) => h('button.small', { type: 'button', onclick: () => sync.merge(P('grid'), { [k]: Math.round((gridOf(M())[k] + d) * 100) / 100 }) }, d > 0 ? '+' : '−');

        const refresh = () => {
          const map = M();
          if (!map) return;
          clear(image).append(...byOrder(S().assets).filter((a) => a.kind === 'image').map((a) => h('option', { value: a.id }, a.name)));
          refreshers.forEach((f) => f());
          const gr = gridOf(map);
          const byCount = gr.cols > 0 && gr.rows > 0;
          gSize.disabled = byCount;
          info.textContent = map.width
            ? tr('Bild {width} × {height} px · {toFixed} × {toFixed2} Felder', { width: map.width, height: map.height, toFixed: ((map.width - gr.offsetX) / gr.sizeX).toFixed(1), toFixed2: ((map.height - gr.offsetY) / gr.sizeY).toFixed(1) }) +
              (byCount ? tr(' · Feld {toFixed} × {toFixed2} px (aus Spalten/Zeilen berechnet)', { toFixed: gr.sizeX.toFixed(1), toFixed2: gr.sizeY.toFixed(1) }) : '')
            : '';
          // Handouts zur Karte: antippen ordnet zu bzw. entfernt
          const mapAssets = new Set(Object.values(S().maps).map((m) => m.assetId));
          const charIds = characterImageIds(S());
          const assets = byOrder(S().assets).filter((a) => !mapAssets.has(a.id) && ((inScope(a) && isHandout(S(), a, charIds)) || map.handoutIds?.includes(a.id)));
          fill(
            handoutsBox,
            assets.length
              ? assets.map((a) =>
                  thumb(cid, a, {
                    selected: map.handoutIds?.includes(a.id),
                    onclick: () => sync.set(P('handoutIds'), toggleIn(M().handoutIds, a.id)),
                  }),
                )
              : h('p.muted.small', tr('Noch keine Handouts hochgeladen.')),
          );
          renderer.requestRender();
          tryFit();
        };

        fill(editorBox, 
          h(
            'div.row',
            h('h2.grow', tr('Karte bearbeiten')),
            h('button.primary', { onclick: () => play({ mapId: id }) }, icon('play'), tr(' Im Spiel öffnen')),
            h(
              'button.danger',
              {
                onclick: () => {
                  if (!confirm(tr('Karte „{name}“ löschen? Das Bild bleibt in den Dateien erhalten.', { name: M().name }))) return;
                  const ops = [{ t: 'del', p: ['maps', id] }];
                  for (const s of Object.values(S().sessions)) {
                    if (s.mapIds?.includes(id)) ops.push({ t: 'set', p: ['sessions', s.id, 'mapIds'], v: s.mapIds.filter((x) => x !== id) });
                  }
                  sync.do(ops);
                  go('maps');
                },
              },
              tr('Löschen'),
            ),
          ),
          h('div.grid3', field(tr('Name'), name), field(tr('Typ'), kind), field(tr('Bild'), image)),
          adventureChips(sync, 'maps', id),
          h(
            'div.preview-wrap',
            { style: { marginTop: '10px' } },
            canvas,
            ...renderer.layers,
            h('div.preview-tools', calibBtn, h('span.chip', tr('über'), cellsN, tr('Felder')), h('span.chip.small', tr('Ziehen = verschieben · Mausrad = zoomen'))),
          ),
          info,
          h('div.section-title', tr('Raster')),
          h(
            'div.grid3',
            field(tr('Spalten (Felder in der Breite)'), gCols),
            field(tr('Zeilen (Felder in der Höhe)'), gRows),
            h('div.small.muted', { style: { alignSelf: 'end', paddingBottom: '8px' } }, tr('Bei Kampfkarten mit bekannter Feldanzahl genügt das – die Rastergröße wird daraus berechnet. Leer lassen für manuelle Rastergröße.')),
          ),
          h(
            'div.grid3',
            field(tr('Rastergröße (px im Bild)'), h('div.row', nudge('size', -0.5), h('div.grow', gSize), nudge('size', 0.5))),
            field(tr('Versatz X'), h('div.row', nudge('offsetX', -1), h('div.grow', gOx), nudge('offsetX', 1))),
            field(tr('Versatz Y'), h('div.row', nudge('offsetY', -1), h('div.grow', gOy), nudge('offsetY', 1))),
          ),
          h('div.grid3', field(tr('{unit} pro Feld', { unit: unitLabel() }), gFeet), field(tr('Linienfarbe'), gColor), field(tr('Deckkraft'), gOpacity)),
          h('label.inline', { style: { marginTop: '8px' } }, gShow, tr('Raster anzeigen')),
          h('div.section-title', tr('Nebel & Licht')),
          h(
            'div.row',
            h('label.inline', fogOn, tr('Nebel des Krieges')),
            h('button.small', { onclick: () => confirm(tr('Nebel komplett zurücksetzen (alles verdeckt)?')) && sync.set(P('fog', 'ops'), []) }, tr('Alles verdecken')),
            h('button.small', { onclick: () => sync.set(P('fog', 'ops'), [{ m: 'reveal', s: 'all' }]) }, tr('Alles aufdecken')),
          ),
          h('div.row', { style: { marginTop: '8px' } }, h('label.inline', lightOn, tr('Dynamische Beleuchtung')), h('span.small.muted', tr('Umgebungslicht')), h('div.grow', ambient)),
          h('div.section-title', tr('Kartennotizen')),
          notes.el,
          h('div.section-title', tr('Handouts zur Karte')),
          h('p.small.muted', tr('Markierte Bilder und Dokumente erscheinen beim Spielen im Karten-Panel dieser Karte.')),
          handoutsBox,
          h(
            'div',
            { style: { marginTop: '8px' } },
            dropzone(cid, {
              label: tr('Neue Handouts für diese Karte hochladen: '),
              onUploaded: (created) => sync.set(P('handoutIds'), [...(M().handoutIds || []), ...created.map((a) => a.id)]),
            }),
          ),
        );
        editor = { refresh };
        refresh();
      };

      const el = h('div.split', h('aside', list), h('div.scroll', editorBox));
      renderList();
      buildEditor();
      return {
        el,
        refresh(changed) {
          if (changed.has('maps') || changed.has('assets') || changed.has('*')) renderList();
          if (selectedId && !S().maps[selectedId]) return go('maps');
          editor?.refresh();
        },
      };
    },

    assets(selectedId) {
      const grid = h('div.thumbs');
      const side = h('aside');
      let filter = 'all';
      const filterBar = h(
        'div.row',
        ...[
          ['all', tr('Alle')],
          ['image', tr('Bilder')],
          ['document', tr('Dokumente')],
        ].map(([k, l]) =>
          h('button.small', {
            dataset: { f: k },
            onclick: () => {
              filter = k;
              renderGrid();
            },
          }, l),
        ),
      );
      const usage = (a) => {
        const maps = Object.values(S().maps).filter((m) => m.assetId === a.id);
        const sessions = Object.values(S().sessions).filter((s) => s.assetIds?.includes(a.id));
        return { maps, sessions };
      };
      const fromBox = h('div', { style: { marginTop: '8px' } });
      const renderGrid = () => {
        clear(grid);
        for (const b of $$('button', filterBar)) b.classList.toggle('active', b.dataset.f === filter);
        const charIds = characterImageIds(S());
        fill(fromBox, addFromCampaign(sync, 'assets', { label: tr('+ Bild oder Datei aus der Kampagne hinzufügen …'), filter: (a) => isHandout(S(), a, charIds), onAdded: (id) => go(`assets/${id}`) }));
        for (const a of byOrder(S().assets).reverse()) {
          if (filter !== 'all' && a.kind !== filter) continue;
          if (!inScope(a)) continue;
          if (!isHandout(S(), a, charIds) && a.id !== selectedId) continue; // Porträts/Tokens gehören zur Figur
          const u = usage(a);
          grid.append(
            thumb(cid, a, {
              selected: a.id === selectedId,
              badge: u.maps.length ? tr('Karte') : u.sessions.length ? tr('{length} Session', { length: u.sessions.length }) : null,
              onclick: () => go(`assets/${a.id}`),
            }),
          );
        }
        if (!grid.children.length) grid.append(h('p.muted', tr('Keine Dateien.')));
      };
      let nameRefresh = null;
      const renderSide = () => {
        const a = S().assets[selectedId];
        if (!a) {
          fill(side, h('p.muted.small', tr('Wähle eine Datei aus, um sie zu bearbeiten.')));
          nameRefresh = null;
          return;
        }
        const u = usage(a);
        const name = h('input');
        nameRefresh = bindInput(name, () => S().assets[a.id]?.name, (v) => sync.set(['assets', a.id, 'name'], v));
        const kindSel = h('select', ...Object.entries(MAP_KINDS).map(([v, l]) => h('option', { value: v }, l)));
        const sessSel = h(
          'select',
          h('option', { value: '' }, tr('– zu Session hinzufügen –')),
          ...sortBy(Object.values(S().sessions), 'order').map((s) => h('option', { value: s.id }, `${S().adventures[s.adventureId]?.name || ''} · ${s.name}`)),
        );
        sessSel.addEventListener('change', () => {
          const s = S().sessions[sessSel.value];
          if (s && !s.assetIds?.includes(a.id)) sync.set(['sessions', s.id, 'assetIds'], [...(s.assetIds || []), a.id]);
          toast(tr('Zur Session hinzugefügt'));
          sessSel.value = '';
        });
        fill(side, 
          a.kind === 'image'
            ? h('img', { src: fileUrl(cid, a), style: { width: '100%', borderRadius: '8px', background: '#000' } })
            : h('a.btn', { href: fileUrl(cid, a), target: '_blank' }, icon('file'), tr(' Dokument öffnen')),
          field(tr('Name'), name),
          h('div.small.muted', tr('{mime} · {toFixed} MB', { mime: a.mime, toFixed: (a.size / 1024 / 1024).toFixed(2) })),
          a.ai ? h('details.small.muted', h('summary', tr('KI-Bild: {workflow}', { workflow: a.ai.workflow })), a.ai.prompt) : null,
          adventureChips(sync, 'assets', a.id),
          u.maps.length ? h('div.small', tr('Verwendet als Karte: '), ...u.maps.map((m) => h('a', { href: `#maps/${m.id}` }, m.name, ' '))) : null,
          u.sessions.length ? h('div.small', tr('In Sessions: '), u.sessions.map((s) => s.name).join(', ')) : null,
          h('div.section-title', tr('Aktionen')),
          sessSel,
          a.kind === 'image'
            ? h(
                'div.row',
                { style: { marginTop: '8px' } },
                h('div.grow', kindSel),
                h(
                  'button',
                  {
                    onclick: () => {
                      const m = newMap(a, kindSel.value);
                      sync.set(['maps', m.id], m);
                      go(`maps/${m.id}`);
                    },
                  },
                  tr('Als Karte anlegen'),
                ),
              )
            : null,
          a.kind === 'image'
            ? h(
                'button',
                {
                  style: { marginTop: '8px', width: '100%' },
                  onclick: () => {
                    sync.set(['display', 'player'], { ...S().display.player, mode: 'image', assetId: a.id, caption: '' });
                    toast(tr('Auf dem Spieler-Display angezeigt'));
                  },
                },
                icon('image'),
              tr(' Auf Spieler-Display zeigen'),
              )
            : null,
          h(
            'button.danger',
            {
              style: { marginTop: '16px', width: '100%' },
              onclick: async () => {
                if (u.maps.length && !confirm(tr('Diese Datei wird von Karten verwendet. Trotzdem löschen?'))) return;
                if (!u.maps.length && !confirm(tr('„{name}“ endgültig löschen?', { name: a.name }))) return;
                const ops = [];
                for (const s of u.sessions) ops.push({ t: 'set', p: ['sessions', s.id, 'assetIds'], v: s.assetIds.filter((x) => x !== a.id) });
                for (const m of Object.values(S().maps)) {
                  if (m.handoutIds?.includes(a.id)) ops.push({ t: 'set', p: ['maps', m.id, 'handoutIds'], v: m.handoutIds.filter((x) => x !== a.id) });
                }
                sync.do(ops);
                await api('DELETE', `/api/campaigns/${cid}/assets/${a.id}`);
                go('assets');
              },
            },
            tr('Datei löschen'),
          ),
        );
      };
      const el = h(
        'div.split',
        { style: { gridTemplateColumns: '1fr minmax(260px, 340px)' } },
        h(
          'section',
          dropzone(cid, { onUploaded: () => renderGrid() }),
          ai.image ? h('div', { style: { marginTop: '8px' } }, aiImageButton(() => ({ sync, cid, purpose: 'picture', onDone: (a) => go(`assets/${a.id}`) }), tr(' Bild mit KI erzeugen'))) : null,
          fromBox,
          h('div', { style: { margin: '12px 0' } }, filterBar),
          grid,
        ),
        side,
      );
      side.style.borderRight = 'none';
      side.style.borderLeft = '1px solid var(--line)';
      renderGrid();
      renderSide();
      return {
        el,
        refresh(changed) {
          renderGrid();
          if (selectedId && !S().assets[selectedId]) return go('assets');
          if (changed.has('*') || changed.has('maps') || changed.has('sessions')) renderSide();
          else nameRefresh?.();
        },
      };
    },

    lore(selectedId) {
      const listBox = h('div.list');
      const search = h('input', { placeholder: tr('Suchen …'), type: 'search' });
      search.addEventListener('input', () => renderList());
      const editorBox = h('section');
      let editor = null;

      const renderList = () => {
        clear(listBox);
        const q = search.value.trim().toLowerCase();
        const entries = sortBy(Object.values(S().lore), (l) => `${l.category || ''}|${l.title}`).filter(
          (l) => inScope(l) && (!q || `${l.title} ${l.category} ${l.content}`.toLowerCase().includes(q)),
        );
        const from = addFromCampaign(sync, 'lore', { label: tr('+ Eintrag aus der Kampagne hinzufügen …'), name: (l) => l.title, onAdded: (id) => go(`lore/${id}`) });
        if (from) listBox.append(h('div', { style: { marginBottom: '8px' } }, from));
        for (const l of entries) {
          listBox.append(
            h(
              'div.list-item.clickable',
              { class: l.id === selectedId ? 'selected' : '', onclick: () => go(`lore/${l.id}`) },
              l.pinned ? icon('pin') : null,
              h('span.title', l.title),
              l.category ? h('span.chip', l.category) : null,
            ),
          );
        }
        if (!entries.length) listBox.append(h('p.muted.small', tr('Keine Einträge.')));
      };

      const buildEditor = () => {
        const l0 = S().lore[selectedId];
        if (!l0) {
          editor = null;
          fill(editorBox, 
            h('div.muted', { style: { padding: '30px' } }, tr('Hintergrundwissen zur Welt: Orte, NPCs, Fraktionen, Geschichte. Angepinnte und mit der aktuellen Karte verknüpfte Einträge erscheinen beim Spielen automatisch im Karten-Panel bzw. im Tab „Lore“.')),
          );
          return;
        }
        const id = l0.id;
        const L = () => S().lore[id];
        const P = (k) => ['lore', id, k];
        const title = h('input');
        const category = h('input', { placeholder: tr('z.B. Ort, NPC, Fraktion, Geschichte'), list: 'loreCats' });
        const pinned = h('input', { type: 'checkbox' });
        const content = mdEditor(() => L()?.content, (v) => sync.set(P('content'), v), {
          rows: 18,
          about: () => `${campaignAbout()}, lore entry "${L()?.title || ''}"${L()?.category ? ` (category: ${L().category})` : ''}`,
        });
        const mapsBox = h('div.row');
        const cats = h('datalist', { id: 'loreCats' });
        const refreshers = [
          bindInput(title, () => L()?.title, (v) => sync.set(P('title'), v)),
          bindInput(category, () => L()?.category, (v) => sync.set(P('category'), v)),
          bindInput(pinned, () => L()?.pinned, (v) => sync.set(P('pinned'), v), { debounceMs: 0, event: 'change' }),
          content.refresh,
        ];
        const refresh = () => {
          if (!L()) return;
          refreshers.forEach((f) => f());
          clear(cats).append(...[...new Set(Object.values(S().lore).map((x) => x.category).filter(Boolean))].map((c) => h('option', { value: c })));
          clear(mapsBox);
          for (const m of byOrder(S().maps).filter((m) => inScope(m) || L().mapIds?.includes(m.id))) {
            const on = L().mapIds?.includes(m.id);
            mapsBox.append(h('button.small', { class: on ? 'active' : '', onclick: () => sync.set(P('mapIds'), toggleIn(L().mapIds, m.id)) }, m.name));
          }
          if (!mapsBox.children.length) mapsBox.append(h('span.small.muted', tr('Keine Karten vorhanden.')));
        };
        fill(editorBox, 
          h(
            'div',
            { style: { maxWidth: '1000px' } },
            h(
              'div.row',
              h('h2.grow', tr('Lore-Eintrag')),
              h(
                'button',
                {
                  onclick: () => {
                    sync.set(['display', 'player'], { ...S().display.player, mode: 'lore', loreId: id });
                    toast(tr('Auf dem Spieler-Display angezeigt'));
                  },
                },
                icon('image'),
              tr(' Spielern zeigen'),
              ),
              h(
                'button.danger',
                {
                  onclick: () => {
                    if (!confirm(tr('Eintrag löschen?'))) return;
                    sync.del(['lore', id]);
                    go('lore');
                  },
                },
                tr('Löschen'),
              ),
            ),
            h('div.grid2', field(tr('Titel'), title), field(tr('Kategorie'), category)),
            adventureChips(sync, 'lore', id),
            cats,
            h('label.inline', { style: { marginTop: '10px' } }, pinned, tr('Angepinnt – beim Spielen immer oben im Tab „Lore“')),
            h('div.section-title', tr('Inhalt')),
            content.el,
            h('div.section-title', tr('Verknüpfte Karten')),
            h('p.small.muted', tr('Der Eintrag erscheint beim Spielen im Karten-Panel dieser Karten.')),
            mapsBox,
          ),
        );
        editor = { refresh };
        refresh();
      };

      const add = () => {
        const id = uid();
        sync.set(['lore', id], { id, title: tr('Neuer Eintrag'), category: '', content: '', pinned: false, mapIds: [], createdAt: Date.now() });
        go(`lore/${id}`);
      };

      const el = h('div.split', h('aside', h('button.primary', { onclick: add, style: { width: '100%' } }, icon('plus'), tr(' Neuer Eintrag')), h('div', { style: { margin: '10px 0' } }, search), listBox), h('div.scroll', editorBox));
      renderList();
      buildEditor();
      return {
        el,
        refresh() {
          renderList();
          if (selectedId && !S().lore[selectedId]) return go('lore');
          editor?.refresh();
        },
      };
    },
  };

  return views;
}
