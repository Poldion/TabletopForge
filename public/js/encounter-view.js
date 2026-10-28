// Encounter-Planer im Bereich „Kreaturen“: Gegner aus der Kartei zusammenstellen, Schwierigkeit für die Gruppe
// berechnen (5e-Regeln, encounter.js) und den Encounter mit einem Klick auf die Karte und in den Kampf bringen.
import { h, uid, bindInput, sortBy, toast, TOKEN_COLORS } from './util.js';
import { icon } from './icons.js';
import { evaluate, crToXp, parseCr, DIFFICULTIES } from './encounter.js';
import { gridOf, snapPoint } from './maprender.js';
import * as Combat from './combat.js';
import { tokenPreset } from './creatures-view.js';
import { tr } from './i18n.js';
import { fileUrl, markdown } from './util.js';
import { putOnTable } from './table-view.js';
import { adventureChips } from './scope-ui.js';

export const ENC_PREFIX = 'encounter:';

const members = (st) => st.party?.members || [];
const levels = (st) => members(st).map((m) => m.level || 1);

/** Gegner eines Encounters mit ihren Kreaturen (fehlende Kreaturen werden übersprungen). */
function items(st, enc) {
  return (enc.items || []).map((it) => ({ ...it, creature: st.creatures?.[it.creatureId] })).filter((it) => it.creature);
}

export function evaluateEncounter(st, enc) {
  return evaluate(items(st, enc).map((it) => ({ cr: it.creature.cr, count: it.count })), levels(st));
}

/** Kleines Etikett mit der Schwierigkeit (für Listen). */
export function difficultyChip(st, enc) {
  const r = evaluateEncounter(st, enc);
  if (!r.difficulty) return h('span.chip', r.count ? tr('Gruppe fehlt') : tr('leer'));
  return h('span.chip', { style: { background: r.difficulty.color, color: '#111' } }, r.difficulty.name);
}

export function newEncounter(sync) {
  const id = uid();
  sync.set(['encounters', id], { id, name: 'Neuer Encounter', notes: '', items: [], createdAt: Date.now() });
  return id;
}

/**
 * Encounter starten: Gegner verdeckt auf die Karte des Spieltischs setzen (um die Mitte des TV-Bilds) und
 * zusammen mit der Gruppe in den Kampf nehmen. onlyCombat: ohne Tokens.
 */
export function startEncounter(sync, enc, { onlyCombat = false } = {}) {
  const st = sync.state;
  const list = items(st, enc);
  if (!list.length) return toast(tr('Der Encounter hat noch keine Gegner'));
  const own = enc.mapId && st.maps?.[enc.mapId] ? enc.mapId : null;
  const mapId = own || st.display?.table?.mapId || Object.keys(st.maps || {})[0];
  const map = st.maps?.[mapId];
  if (!onlyCombat && !map) return toast(tr('Keine Karte vorhanden – erst eine Karte anlegen'));
  if (!onlyCombat && own && st.display?.table?.mapId !== own) putOnTable(sync, own);
  const tx = Combat.begin(st);
  const tokenOps = [];
  if (!onlyCombat) {
    const g = gridOf(map);
    const t = st.display.table;
    const cx = t.mapId === mapId && t.cx ? t.cx : (map.width || g.size * 20) / 2;
    const cy = t.mapId === mapId && t.cy ? t.cy : (map.height || g.size * 15) / 2;
    // Belegte Flächen (große Tokens decken mehrere Felder ab)
    const occupied = Object.values(map.tokens || {}).map((tk) => ({ x: tk.x, y: tk.y, s: tk.size || 1 }));
    const names = new Set(Object.values(map.tokens || {}).map((tk) => tk.name));
    const free = (p, s) => occupied.every((o) => Math.abs(p.x - o.x) >= ((o.s + s) * g.sizeX) / 2 - 1 || Math.abs(p.y - o.y) >= ((o.s + s) * g.sizeY) / 2 - 1);
    /** Nächstes freies Feld spiralförmig um die Mitte des TV-Bilds. */
    const findSpot = (s) => {
      for (let r = 0; r < 25; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const p = snapPoint(map, cx + dx * g.sizeX, cy + dy * g.sizeY, s);
            if (free(p, s)) return p;
          }
        }
      }
      return snapPoint(map, cx, cy, s);
    };
    for (const it of list) {
      for (let i = 0; i < it.count; i++) {
        const preset = tokenPreset(it.creature);
        let n = 1;
        while (names.has(`${preset.name} ${n}`)) n++;
        const name = `${preset.name} ${n}`;
        names.add(name);
        const p = findSpot(preset.size || 1);
        occupied.push({ x: p.x, y: p.y, s: preset.size || 1 });
        const id = uid();
        tokenOps.push({
          t: 'set',
          p: ['maps', mapId, 'tokens', id],
          v: { ...preset, id, name, color: preset.kind === 'npc' ? TOKEN_COLORS[4] : TOKEN_COLORS[0], hidden: true, x: p.x, y: p.y, showName: false, dead: false },
        });
        // Token gibt es erst nach den Ops – der Kampf-Eintrag verweist schon darauf
        Combat.addCombatant(tx, { name, kind: preset.kind, tokenId: id, creatureId: it.creature.id, hp: preset.hp, maxHp: preset.maxHp });
      }
    }
  } else {
    for (const it of list) {
      for (let i = 0; i < it.count; i++) {
        Combat.addCombatant(tx, { name: it.count > 1 ? `${it.creature.name} ${i + 1}` : it.creature.name, kind: it.creature.kind === 'npc' ? 'npc' : 'enemy', creatureId: it.creature.id });
      }
    }
  }
  // Gruppe dazu, falls noch nicht im Kampf (Initiative tragen die Spieler ein)
  const inCombat = new Set(Combat.entries(tx.s).map((e) => e.name));
  for (const m of members(st)) {
    if (m.name && !inCombat.has(m.name)) Combat.addCombatant(tx, { name: m.name, kind: 'pc', hp: m.hp || null, maxHp: m.hp || null, ac: m.ac || null });
  }
  sync.do(tokenOps, tx.ops);
  const count = list.reduce((s, it) => s + it.count, 0);
  toast(onlyCombat ? tr('{count} Gegner im Kampf', { count }) : tr('{count} Gegner verdeckt auf „{x}“ gesetzt und im Kampf – aufdecken, wenn es losgeht', { count, x: map.name || tr('Karte') }), 4500);
}

/** Szenenbild und Karte einer (Zufalls-)Begegnung. */
function media(sync, enc) {
  const st = sync.state;
  const img = enc.imageAssetId && st.assets?.[enc.imageAssetId];
  const map = enc.mapId && st.maps?.[enc.mapId];
  if (!img && !map) return null;
  return h(
    'div',
    h('div.section-title', icon('image'), tr(' Bild & Karte')),
    img ? h('img', { src: fileUrl(sync.campaignId, img), style: { maxWidth: '100%', maxHeight: '260px', borderRadius: '8px', display: 'block' } }) : null,
    h(
      'div.row',
      { style: { gap: '6px', marginTop: '6px' } },
      img ? h('button', { onclick: () => (sync.merge(['display', 'player'], { mode: 'image', assetId: img.id, caption: enc.name }), toast(tr('Auf dem Spieler-Display angezeigt'))) }, icon('image'), tr(' Spielern zeigen')) : null,
      map ? h('a.btn', { href: `#maps/${map.id}` }, icon('map'), ` ${map.name}`) : null,
      map ? h('button', { onclick: () => (putOnTable(sync, map.id), toast(tr('Karte liegt auf dem Tisch'))) }, icon('monitor'), tr(' Auf den Tisch')) : null,
    ),
  );
}
/** Planer für einen Encounter (rechte Seite im Kreaturen-Bereich). */
export function encounterDetail({ sync, go }, encId) {
  const S = () => sync.state;
  const el = h('div', { style: { maxWidth: '900px' } });
  const refreshers = [];

  const render = () => {
    refreshers.length = 0;
    const st = S();
    const enc = st.encounters?.[encId];
    if (!enc) return el.replaceChildren(h('p.muted', tr('Encounter nicht gefunden.')));
    const P = (...k) => ['encounters', encId, ...k];
    const r = evaluateEncounter(st, enc);
    const its = items(st, enc);

    const name = h('input', { style: { fontSize: '18px', fontWeight: 'bold' } });
    refreshers.push(bindInput(name, () => S().encounters?.[encId]?.name, (v) => sync.set(P('name'), v), { debounceMs: 250 }));
    const notes = h('textarea', { rows: 4, placeholder: tr('Ort, Taktik, Beute, Auslöser …') });
    refreshers.push(bindInput(notes, () => S().encounters?.[encId]?.notes, (v) => sync.set(P('notes'), v), { debounceMs: 250 }));

    const setItems = (next) => sync.set(P('items'), next.filter((x) => x.count > 0));
    const changeCount = (cid, delta) => setItems((enc.items || []).map((x) => (x.creatureId === cid ? { ...x, count: x.count + delta } : x)));

    // --- Schwierigkeit
    const diff = r.difficulty;
    const max = Math.max(r.thresholds[3] * 1.3, r.adjusted, 1);
    const scale = h(
      'div.enc-scale',
      ...DIFFICULTIES.slice(1).map((d, i) => {
        const from = r.thresholds[i];
        const to = i < 3 ? r.thresholds[i + 1] : max;
        return h('div', { style: { left: `${(from / max) * 100}%`, width: `${((to - from) / max) * 100}%`, background: d.color }, title: tr('{name} ab {from} EP', { name: d.name, from }) }, h('span', d.name));
      }),
      r.count ? h('div.enc-marker', { style: { left: `${Math.min(100, (r.adjusted / max) * 100)}%` }, title: tr('{adjusted} angepasste EP', { adjusted: r.adjusted }) }) : null,
    );
    const diffCard = h(
      'div.enc-diff',
      !members(st).length
        ? h('p', tr('Trage unten deine Gruppe ein (Name und Stufe) – dann berechne ich die Schwierigkeit.'))
        : !r.count
          ? h('p.muted', tr('Noch keine Gegner – füge unten Kreaturen aus der Kartei hinzu.'))
          : [
              h('div.row', h('span.enc-badge', { style: { background: diff.color } }, diff.name), h('span.grow', diff.text)),
              scale,
              h(
                'p.small',
                tr('{xp} EP × {replace} ({count} Gegner{x}) = ', { xp: r.xp, replace: String(r.multiplier).replace('.', ','), count: r.count, x: members(st).length < 3 || members(st).length >= 6 ? tr(', Gruppe aus {length}', { length: members(st).length }) : '' }),
                h('b', tr('{adjusted} angepasste EP', { adjusted: r.adjusted })),
                tr(' · Schwellen der Gruppe: leicht {x}, mittel {x2}, schwer {x3}, tödlich {x4}', { x: r.thresholds[0], x2: r.thresholds[1], x3: r.thresholds[2], x4: r.thresholds[3] }),
              ),
              h('p.small.muted', tr('Belohnung: {xp} EP insgesamt, {perPlayer} EP pro Spieler (ohne Multiplikator).', { xp: r.xp, perPlayer: r.perPlayer })),
            ],
    );

    // --- Gegner
    const creatures = sortBy(Object.values(st.creatures || {}), (c) => (c.kind === 'npc' ? 'b' : 'a') + c.name.toLowerCase());
    const pick = h('select', h('option', { value: '' }, tr('– Kreatur aus der Kartei –')), ...creatures.map((c) => h('option', { value: c.id }, `${c.name}${c.cr ? tr(' (HG {cr})', { cr: c.cr }) : c.kind === 'npc' ? tr(' (NSC)') : ''}`)));
    const count = h('input', { type: 'number', min: 1, value: 1, style: { width: '64px' } });
    const add = () => {
      if (!pick.value) return pick.focus();
      const n = Math.max(1, Number(count.value) || 1);
      const existing = (enc.items || []).find((x) => x.creatureId === pick.value);
      setItems(existing ? enc.items.map((x) => (x === existing ? { ...x, count: x.count + n } : x)) : [...(enc.items || []), { creatureId: pick.value, count: n }]);
    };
    const foes = h(
      'div',
      its.length
        ? h(
            'table.enc-table',
            h('tr', h('th', tr('Kreatur')), h('th', tr('HG')), h('th', tr('EP')), h('th', tr('Anzahl')), h('th', tr('Summe')), h('th')),
            its.map((it) => {
              const xp = crToXp(it.creature.cr);
              const noCr = parseCr(it.creature.cr) == null;
              return h(
                'tr',
                h('td', h('a', { href: `#creatures/${it.creature.id}` }, it.creature.name)),
                h('td', noCr ? h('span', { style: { color: '#e0a030' }, title: tr('Kein Herausforderungsgrad – in der Kartei eintragen') }, '?') : it.creature.cr),
                h('td', noCr ? '–' : xp),
                h('td', h('div.row', { style: { gap: '2px', flexWrap: 'nowrap' } }, h('button.small', { onclick: () => changeCount(it.creatureId, -1) }, '−'), h('span', { style: { minWidth: '22px', textAlign: 'center' } }, it.count), h('button.small', { onclick: () => changeCount(it.creatureId, 1) }, '+'))),
                h('td', noCr ? '–' : xp * it.count),
                h('td', h('button.small', { title: tr('Entfernen'), onclick: () => setItems(enc.items.filter((x) => x.creatureId !== it.creatureId)) }, icon('trash'))),
              );
            }),
          )
        : null,
      h('div.row', { style: { gap: '6px', marginTop: '8px' } }, h('div.grow', pick), count, h('button', { onclick: add }, icon('plus'), tr(' Hinzufügen'))),
      h('p.small.muted', tr('Fehlt ein Monster? Unter „Monster importieren“ (links) aus den SRD-Daten holen – es erscheint dann hier in der Auswahl.')),
    );

    // --- Gruppe (gilt für alle Encounter der Kampagne)
    const party = members(st);
    const setParty = (next) => sync.set(['party'], { ...(st.party || {}), members: next });
    const partyRows = party.map((m, i) => {
      const nm = h('input', { value: m.name || '', placeholder: tr('Name') });
      nm.addEventListener('change', () => setParty(party.map((x, j) => (j === i ? { ...x, name: nm.value.trim() } : x))));
      const lvl = h('input', { type: 'number', min: 1, max: 20, value: m.level || 1, style: { width: '64px' } });
      lvl.addEventListener('change', () => setParty(party.map((x, j) => (j === i ? { ...x, level: Math.max(1, Math.min(20, Number(lvl.value) || 1)) } : x))));
      return h('div.row', { style: { gap: '6px', marginBottom: '4px' } }, h('div.grow', nm), h('span.small.muted', tr('Stufe')), lvl, h('button.small', { title: tr('Entfernen'), onclick: () => setParty(party.filter((_, j) => j !== i)) }, icon('trash')));
    });
    const fromCombat = () => {
      const pcs = Combat.entries(st).filter((e) => e.kind === 'pc' && !party.some((m) => m.name === e.name));
      if (!pcs.length) return toast(tr('Keine weiteren Spieler im Kampf-Tab'));
      setParty([...party, ...pcs.map((e) => ({ id: uid(), name: e.name, level: 1, hp: e.maxHp || null, ac: e.ac || null }))]);
      toast(tr('{length} Spieler übernommen – Stufen noch eintragen', { length: pcs.length }));
    };
    const partyBox = h(
      'div',
      partyRows,
      h(
        'div.row',
        { style: { gap: '6px' } },
        h('button.small', { onclick: () => setParty([...party, { id: uid(), name: '', level: party.at(-1)?.level || 1 }]) }, icon('plus'), tr(' Charakter')),
        h('button.small', { onclick: fromCombat }, icon('swords'), tr(' Aus dem Kampf-Tab übernehmen')),
        party.length ? h('button.small', { title: tr('Alle eine Stufe höher'), onclick: () => setParty(party.map((m) => ({ ...m, level: Math.min(20, (m.level || 1) + 1) }))) }, tr('Stufenaufstieg')) : null,
      ),
      h('p.small.muted', tr('Die Gruppe gilt für alle Encounter dieser Kampagne.'), ' ', h('a', { href: '#party' }, tr('Gruppe mit Porträts und Hintergrund bearbeiten'))),
    );

    el.replaceChildren(
      h('div', { style: { marginBottom: '8px' } }, name),
      adventureChips(sync, 'encounters', encId),
      h(
        'div.row',
        { style: { marginBottom: '12px', gap: '6px' } },
        h('button.primary', { disabled: !its.length, onclick: () => startEncounter(sync, S().encounters[encId]), title: tr('Gegner verdeckt auf die Karte des Spieltischs setzen und mit der Gruppe in den Kampf nehmen') }, icon('swords'), tr(' Auf Karte & in den Kampf')),
        h('button', { disabled: !its.length, onclick: () => startEncounter(sync, S().encounters[encId], { onlyCombat: true }), title: tr('Ohne Tokens nur in den Kampf-Tab') }, tr('Nur Kampf')),
        h('button', {
          title: tr('Kopie anlegen'),
          onclick: () => {
            const id = uid();
            sync.set(['encounters', id], { ...structuredClone(enc), id, name: `${enc.name} (Kopie)`, createdAt: Date.now() });
            go(`creatures/${ENC_PREFIX}${id}`);
          },
        }, icon('copy')),
        h('button.danger', { onclick: () => confirm(tr('Encounter „{name}“ löschen?', { name: enc.name })) && (sync.del(['encounters', encId]), go('creatures/encounters')) }, tr('Löschen')),
      ),
      diffCard,
      h('div.section-title', icon('skull'), tr(' Gegner')),
      foes,
      h('div.section-title', icon('user'), tr(' Gruppe ({length})', { length: party.length })),
      partyBox,
      media(sync, enc),
      h('div.section-title', icon('note'), tr(' Notizen')),
      enc.notes ? h('details', h('summary.small.muted', tr('Vorschau')), h('div.md', { innerHTML: markdown(enc.notes) })) : null,
      notes,
    );
  };
  render();
  return {
    el,
    refresh(changed) {
      if (!['encounters', 'party', 'creatures', 'initiative', 'assets', 'maps', '*'].some((k) => changed.has(k))) return;
      // Während in einem Feld getippt wird nur die Felder abgleichen
      if (el.contains(document.activeElement) && document.activeElement.matches('input, textarea, select')) refreshers.forEach((f) => f());
      else render();
    },
  };
}
