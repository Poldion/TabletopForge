// Panel „Kampf“: Initiative mit Regelunterstützung (Züge, Schaden, Zustände, Konzentration, Todesrettungswürfe,
// Aktionen aus dem Statblock würfeln). Die Regeln stecken in combat.js / rules5e.js.
import { h, toast } from './util.js';
import { icon } from './icons.js';
import * as C from './combat.js';
import { tokenSelection } from './selection.js';
import { CONDITIONS, DAMAGE_TYPES, ABILITY_NAMES, conditionRules, parseActions, roll, d20, fmtMod, saveBonuses, d, autoFailsSave } from './rules5e.js';
import { tr } from './i18n.js';
import { t } from './i18n.js';

const KIND_LABEL = { pc: tr('Spieler'), npc: tr('NSC'), enemy: tr('Gegner') };
const DURATIONS = [
  ['', tr('bis aufgehoben')],
  ['1', tr('1 Runde')],
  ['2', tr('2 Runden')],
  ['3', tr('3 Runden')],
  ['10', tr('1 Minute (10 Runden)')],
  ['save', tr('bis Rettungswurf gelingt (Zugende)')],
];
export const PLAYER_HP_MODES = { none: tr('TP für Spieler verborgen'), bloodied: tr('Nur „Blutend“-Symbol'), bar: tr('TP-Balken zeigen') };

/** Wie dm-panels: neu aufbauen, außer während in einem Feld getippt wird. */
function live(build) {
  const el = h('div');
  let dirty = false;
  const run = () => {
    const a = document.activeElement;
    if (a && el.contains(a) && a.matches('input:not([type=checkbox]), textarea, select')) {
      dirty = true;
      return;
    }
    dirty = false;
    el.replaceChildren(...[build()].flat(Infinity).filter((c) => c != null && c !== false));
  };
  el.addEventListener('focusout', () => setTimeout(() => dirty && run(), 0));
  run();
  return { el, run };
}

const hpColor = (frac) => (frac > 0.5 ? 'var(--ok)' : frac > 0.25 ? '#e0a030' : 'var(--danger)');

export function createCombatPanel({ sync, showCreature, currentMapId }) {
  const S = () => sync.state;
  let selectedId = null; // aufgeklappter Teilnehmer
  let lastRoll = null; // { text, total, type, from } – Schaden kann direkt auf ein Ziel angewendet werden
  let showLog = false;
  let showMore = false; // „Hinzufügen · Anzeige · Protokoll“ während des Kampfs aufgeklappt
  let targetId = null; // Ziel der Angriffe der aktiven Kreatur (Würfel am Tisch)
  // Würfel am Tisch (Standard): Ergebnisse eintippen; digital: der Manager würfelt
  const tableDice = () => (S().display?.combat?.dice || 'table') === 'table';

  /** Regel-Transaktion ausführen und synchronisieren; Meldungen kurz anzeigen. */
  const act = (fn, { quiet = false } = {}) => {
    const tx = C.begin(S());
    fn(tx);
    sync.do(tx.ops);
    if (!quiet && tx.notes.length) toast(tx.notes.slice(-2).join(' · '), 3500);
    // Eingabe ist erledigt – Fokus freigeben, sonst wartet die Anzeige mit dem Neuaufbau
    if (content.el.contains(document.activeElement)) document.activeElement.blur();
    content.run();
  };

  // --- Bausteine -------------------------------------------------------------------

  const hpBar = (st, e, big = false) => {
    const { hp, maxHp, temp } = C.hpOf(st, e);
    if (!maxHp) return h('span.small.muted', hp ?? '–');
    const frac = Math.max(0, Math.min(1, (hp ?? 0) / maxHp));
    return h(
      'div.cm-hp',
      { class: big ? 'big' : '' },
      h('div.cm-hpbar', h('div', { style: { width: `${frac * 100}%`, background: hpColor(frac) } }), temp ? h('div.temp', { style: { width: `${Math.min(1, temp / maxHp) * 100}%` } }) : null),
      h('span', `${hp ?? '?'}/${maxHp}`, temp ? h('span.cm-temp', ` +${temp}`) : null),
    );
  };

  const chips = (e) => [
    ...Object.entries(e.conditions || {}).map(([k, c]) =>
      h('span.cm-chip', { style: { background: CONDITIONS[k]?.color }, title: `${CONDITIONS[k]?.name}${c.rounds ? tr(' – noch {rounds} Rd.', { rounds: c.rounds }) : ''}\n${conditionRules(k, c.level).join('\n')}` }, CONDITIONS[k]?.short + (c.level ? c.level : '')),
    ),
    e.concentration ? h('span.cm-chip.conc', { title: tr('Konzentration: {concentration}', { concentration: e.concentration }) }, 'K') : null,
    e.reactionUsed ? h('span.cm-chip.used', { title: tr('Reaktion verbraucht') }, 'R') : null,
  ];

  // --- Abfragen (Würfe der Spieler) -------------------------------------------------------

  const promptCard = (p) => {
    const btn = (label, outcome, cls = '') => h(`button.small${cls}`, { onclick: () => act((tx) => C.resolvePrompt(tx, p.id, outcome)) }, label);
    return h(
      'div.cm-prompt',
      h('div', p.text),
      h(
        'div.row',
        { style: { marginTop: '6px', gap: '4px' } },
        p.type === 'deathSave'
          ? [
              h('button.small.primary', { onclick: () => act((tx) => C.resolvePrompt(tx, p.id, d(20))) }, icon('d20'), tr(' W20 würfeln')),
              btn(tr('Erfolg'), 'success'),
              btn(tr('Fehlschlag'), 'fail'),
              h('button.small', { onclick: () => act((tx) => { C.resolvePrompt(tx, p.id, null); C.stabilize(tx, p.entryId); }) }, tr('Stabilisiert')),
            ]
          : [btn(tr('Geschafft'), 'success', '.primary'), btn(tr('Misslungen'), 'fail')],
      ),
    );
  };

  // --- Aktive Kreatur ---------------------------------------------------------------------

  const rollAttack = (e, a) => {
    const r = d20(a.toHit);
    const crit = r.nat === 20;
    const text = tr('{name} – {name2}: Angriff W20 {nat} {mod} = {total}{x}', { name: e.name, name2: a.name, nat: r.nat, mod: fmtMod(a.toHit), total: r.total, x: crit ? tr(' – KRITISCH!') : r.nat === 1 ? tr(' – Patzer') : '' });
    sync.push(['initiative', 'log'], { at: Date.now(), round: S().initiative.round, text });
    lastRoll = { text, attack: r.total, nat: r.nat, crit, action: a, from: e.id };
    content.run();
  };
  const rollDamage = (e, a, crit = false) => {
    let total = 0;
    const parts = [];
    let type = null;
    for (const dmg of a.damage) {
      const r = roll(dmg.dice, { crit });
      if (!r) continue;
      total += r.total;
      type ||= dmg.type;
      parts.push(`${r.total} ${dmg.type ? DAMAGE_TYPES[dmg.type].name : ''} ${r.text}`.trim());
    }
    const text = tr('{name} – {name2}: {total} Schaden{x} = {join}', { name: e.name, name2: a.name, total, x: crit ? tr(' (kritisch)') : '', join: parts.join(' + ') });
    sync.push(['initiative', 'log'], { at: Date.now(), round: S().initiative.round, text });
    const attack = lastRoll?.action === a && lastRoll?.attack != null ? { attack: lastRoll.attack, nat: lastRoll.nat } : {};
    lastRoll = { text, damage: total, type, parts: a.damage.length > 1 ? a.damage : null, from: e.id, action: a, ...attack };
    content.run();
  };

  /** Ziel der aktiven Kreatur (zuletzt gewählt, sonst der erste noch stehende Spieler). */
  const currentTarget = (st, e) => {
    const targets = C.order(st).filter((x) => !x.dead && x.id !== e.id);
    const t = targets.find((x) => x.id === targetId) || targets.find((x) => x.kind === 'pc') || targets[0] || null;
    return { t, targets };
  };

  /**
   * Aktion mit echten Würfeln: gewürfelte Zahl des W20 eintippen → Summe und Treffer gegen die RK des Ziels;
   * Schaden eintippen → Enter wendet ihn auf das Ziel an (mit Resistenzen usw.).
   */
  const tableActionRow = (st, e, a) => {
    const { t } = currentTarget(st, e);
    const used = a.recharge && e.recharge?.[a.name] === false;
    const perDayUsed = a.perDay ? e.perDay?.[a.name] || 0 : 0;
    const exhausted = a.perDay && perDayUsed >= a.perDay;
    let crit = false;
    const verdict = h('span.small.cm-verdict');
    const nat = a.toHit != null ? h('input.cm-roll-in', { type: 'number', inputmode: 'numeric', min: 1, max: 20, placeholder: 'W20', title: tr('Gewürfelte Zahl auf dem W20 – der Bonus {mod} wird addiert', { mod: fmtMod(a.toHit) }) }) : null;
    const formula = a.damage.map((x) => x.dice).join('+');
    const dmg = a.damage.length ? h('input.cm-roll-in.wide', { type: 'number', inputmode: 'numeric', min: 0, placeholder: formula, title: tr('Gewürfelten Schaden ({formula}) eintippen – Enter wendet ihn an', { formula }) }) : null;
    const judge = () => {
      const n = Number(nat.value);
      if (!n) return verdict.replaceChildren();
      const total = n + a.toHit;
      crit = n === 20;
      const hit = n === 20 || (n !== 1 && (!t?.ac || total >= t.ac));
      verdict.replaceChildren(`= ${total}${t?.ac ? (hit ? ' ✔' : ' ✘') : ''}${n === 20 ? tr(' krit!') : ''}`);
      verdict.title = n === 20 ? tr('Kritischer Treffer – Schadenswürfel doppelt') : t?.ac ? (hit ? tr('trifft (RK {ac})', { ac: t.ac }) : tr('verfehlt (RK {ac})', { ac: t.ac })) : '';
      verdict.style.color = hit ? 'var(--ok)' : 'var(--danger)';
    };
    nat?.addEventListener('input', judge);
    nat?.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' || !nat.value) return;
      const n = Number(nat.value);
      sync.push(['initiative', 'log'], { at: Date.now(), round: S().initiative.round, text: tr('{name} – {name2} gegen {x}: W20 {n} {mod} = {x2}{x3}', { name: e.name, name2: a.name, x: t?.name || '?', n, mod: fmtMod(a.toHit), x2: n + a.toHit, x3: n === 20 ? tr(' – KRITISCH') : n === 1 ? tr(' – Patzer') : '' }) });
      if (dmg) dmg.focus();
    });
    const apply = (half = false) => {
      if (!t || dmg.value === '') return;
      const v = Number(dmg.value);
      const amount = half ? Math.floor(v / 2) : v;
      targetId = t.id;
      act((tx) => {
        C.log(tx, `${e.name} – ${a.name}: ${amount} Schaden an ${t.name}${half ? ' (halb)' : ''}`);
        C.damage(tx, t.id, amount, a.damage[0]?.type || null, { crit });
      });
    };
    dmg?.addEventListener('keydown', (ev) => ev.key === 'Enter' && apply(false));
    return h(
      'div.cm-action.table',
      { title: a.text, class: used || exhausted ? 'used' : '' },
      h(
        'div.row',
        h(
          'span.grow',
          h('b', a.name),
          a.toHit != null ? h('span.small.muted', ` ${fmtMod(a.toHit)}`) : null,
          a.save ? h('span.small.muted', tr(' · SG {dc} {x}', { dc: a.save.dc, x: ABILITY_NAMES[a.save.ability] })) : null,
          a.recharge ? h('span.small.muted', tr(' · Aufl. {recharge}–6{x}', { recharge: a.recharge, x: used ? tr(', verbraucht') : '' })) : null,
          a.perDay ? h('span.small.muted', tr(' · {x}/{perDay} heute', { x: a.perDay - perDayUsed, perDay: a.perDay })) : null,
        ),
        a.recharge ? h('button.small', { disabled: used, onclick: () => act((tx) => C.useRecharge(tx, e.id, a.name)) }, tr('nutzen')) : null,
        a.perDay ? h('button.small', { disabled: exhausted, onclick: () => act((tx) => C.usePerDay(tx, e.id, a.name, a.perDay)) }, tr('nutzen')) : null,
      ),
      nat || dmg
        ? h(
            'div.row.cm-roll-row',
            nat,
            nat ? verdict : null,
            dmg,
            dmg ? h('button.small.primary', { onclick: () => apply(false), title: tr('Schaden auf {x} anwenden', { x: t?.name || tr('das Ziel') }) }, tr('Schaden')) : null,
            dmg && a.save ? h('button.small', { onclick: () => apply(true), title: tr('Rettungswurf geschafft – halber Schaden') }, tr('halb')) : null,
          )
        : null,
    );
  };

  const actionRow = (e, a) => {
    const used = a.recharge && e.recharge?.[a.name] === false;
    const perDayUsed = a.perDay ? e.perDay?.[a.name] || 0 : 0;
    const exhausted = a.perDay && perDayUsed >= a.perDay;
    return h(
      'div.cm-action',
      { title: a.text, class: used || exhausted ? 'used' : '' },
      h('span.grow', a.name, a.recharge ? h('span.small.muted', tr(' (Aufl. {recharge}–6{x})', { recharge: a.recharge, x: used ? tr(', verbraucht') : '' })) : null, a.perDay ? h('span.small.muted', tr(' ({x}/{perDay} heute)', { x: a.perDay - perDayUsed, perDay: a.perDay })) : null),
      a.toHit != null ? h('button.small', { onclick: () => rollAttack(e, a), title: tr('Angriffswurf') }, `${fmtMod(a.toHit)}`) : null,
      a.save ? h('span.small.muted', tr('SG {dc} {x}', { dc: a.save.dc, x: ABILITY_NAMES[a.save.ability] })) : null,
      a.damage.length ? h('button.small', { onclick: () => rollDamage(e, a, lastRoll?.crit && lastRoll?.action === a), title: tr('Schaden würfeln (nach kritischem Treffer doppelte Würfel)') }, a.damage.map((x) => x.dice).join('+')) : null,
      a.recharge ? h('button.small', { disabled: used, onclick: () => act((tx) => C.useRecharge(tx, e.id, a.name)), title: tr('Einsetzen – lädt sich zu Zugbeginn per W6 wieder auf') }, tr('nutzen')) : null,
      a.perDay ? h('button.small', { disabled: exhausted, onclick: () => act((tx) => C.usePerDay(tx, e.id, a.name, a.perDay)) }, tr('nutzen')) : null,
    );
  };

  const lastRollBox = (st) => {
    if (!lastRoll) return null;
    const targets = C.order(st).filter((x) => !x.dead && x.id !== lastRoll.from);
    // Vorauswahl: das Ziel des letzten Angriffs bzw. der erste Spieler
    const pre = targets.find((t) => t.id === lastRoll.target) || targets.find((t) => t.kind === 'pc') || targets[0];
    const sel = h('select', ...targets.map((t) => h('option', { value: t.id, selected: t === pre }, `${t.name}${t.ac ? tr(' (RK {ac})', { ac: t.ac }) : ''}`)));
    const typeSel = h('select', h('option', { value: '' }, '–'), ...Object.entries(DAMAGE_TYPES).map(([k, t]) => h('option', { value: k, selected: k === lastRoll.type }, t.name)));
    // Trifft der Angriff die RK des gewählten Ziels? (20 trifft immer, 1 verfehlt immer)
    const verdict = h('span.small');
    const judge = () => {
      lastRoll.target = sel.value;
      const t = st.initiative.entries[sel.value];
      if (lastRoll.attack == null || !t?.ac) return verdict.replaceChildren();
      const hit = lastRoll.nat === 20 || (lastRoll.nat !== 1 && lastRoll.attack >= t.ac);
      verdict.replaceChildren(hit ? tr('✔ trifft') : tr('✘ verfehlt'));
      verdict.style.color = hit ? 'var(--ok)' : 'var(--danger)';
    };
    sel.addEventListener('change', judge);
    judge();
    const apply = (half) => {
      const amount = half ? Math.floor(lastRoll.damage / 2) : lastRoll.damage;
      const target = sel.value;
      const type = typeSel.value || null;
      lastRoll = null; // nicht versehentlich doppelt anwenden
      act((tx) => C.damage(tx, target, amount, type));
    };
    return h(
      'div.cm-roll',
      h('div.row', h('span.grow', lastRoll.text), h('button.small', { onclick: () => ((lastRoll = null), content.run()), title: tr('Schließen') }, icon('x'))),
      targets.length && (lastRoll.damage != null || lastRoll.attack != null)
        ? h(
            'div.row',
            { style: { marginTop: '6px', gap: '4px' } },
            h('span.small', tr('Ziel')),
            sel,
            verdict,
            lastRoll.damage != null
              ? [
                  typeSel,
                  h('button.small.primary', { onclick: () => apply(false) }, tr('Schaden anwenden')),
                  h('button.small', { title: tr('Ziel hat den Rettungswurf geschafft – halber Schaden'), onclick: () => apply(true) }, tr('halb')),
                ]
              : null,
          )
        : null,
    );
  };

  /** Ziel für die Angriffe der aktiven Kreatur (mit RK, damit Treffer sofort beurteilt werden). */
  const targetPicker = (st, e) => {
    const { t, targets } = currentTarget(st, e);
    if (!targets.length) return null;
    const sel = h(
      'select',
      { onchange: (ev) => ((targetId = ev.target.value), content.run()) },
      ...targets.map((x) => h('option', { value: x.id, selected: x === t }, `${x.name}${x.ac ? tr(' · RK {ac}', { ac: x.ac }) : ''}`)),
    );
    return h('div.row.cm-target', h('span.small.muted', tr('Ziel')), sel);
  };

  const activeCard = (st, e) => {
    const c = C.creatureOf(st, e);
    const actions = c ? parseActions(c) : [];
    const saves = c ? saveBonuses(c) : null;
    const hints = C.turnHints(st, e);
    return h(
      'div.cm-active',
      h('div.row', h('strong.grow', icon('swords'), ` ${e.name}`), e.ac ? h('span.cm-ac', { title: tr('Rüstungsklasse') }, tr('RK {ac}', { ac: e.ac })) : null, c ? h('button.small', { onclick: () => showCreature?.(c.id), title: tr('Statblock') }, icon('note')) : null),
      hpBar(st, e, true),
      hints.length ? h('ul.cm-hints', hints.map((x) => h('li', x))) : null,
      Object.entries(e.conditions || {}).map(([k, cnd]) =>
        h('div.cm-cond', h('span.cm-chip', { style: { background: CONDITIONS[k]?.color } }, CONDITIONS[k]?.short + (cnd.level || '')), h('span', h('b', CONDITIONS[k]?.name + (cnd.level ? ` ${cnd.level}` : '')), cnd.rounds ? tr(' – noch {rounds} Rd.', { rounds: cnd.rounds }) : '', cnd.save ? tr(' – RW {x} SG {dc} am Zugende', { x: ABILITY_NAMES[cnd.save.ability], dc: cnd.save.dc }) : '', h('div.small.muted', conditionRules(k, cnd.level).join(' · ')))),
      ),
      h(
        'div.row.cm-res',
        h('button.small', { class: e.reactionUsed ? '' : 'active', onclick: () => act((tx) => C.toggleReaction(tx, e.id), { quiet: true }) }, e.reactionUsed ? tr('Reaktion verbraucht') : tr('Reaktion frei')),
        e.legendary ? h('button.small', { disabled: e.legendary.used >= e.legendary.max, onclick: () => act((tx) => C.useLegendary(tx, e.id, 1)), title: tr('Legendäre Aktion nutzen (am Ende des Zuges einer anderen Kreatur)') }, tr('Legendär {x}/{max}', { x: e.legendary.max - e.legendary.used, max: e.legendary.max })) : null,
        e.lr ? h('button.small', { disabled: e.lr.used >= e.lr.max, onclick: () => act((tx) => C.useLegendaryResistance(tx, e.id)), title: tr('Misslungenen Rettungswurf in einen Erfolg verwandeln') }, tr('Leg. Resistenz {x}/{max}', { x: e.lr.max - e.lr.used, max: e.lr.max })) : null,
      ),
      actions.length && tableDice() ? targetPicker(st, e) : null,
      actions.length ? h('div.cm-actions', actions.map((a) => (tableDice() ? tableActionRow(st, e, a) : actionRow(e, a)))) : null,
      saves && tableDice()
        ? h('div.small.muted.cm-saves', tr('Rettungswürfe: '), Object.entries(saves).map(([k, b]) => `${ABILITY_NAMES[k]} ${fmtMod(b)}`).join(' · '))
        : saves
        ? h(
            'div.row.cm-saves',
            h('span.small.muted', tr('RW')),
            Object.entries(saves).map(([k, b]) =>
              h('button.small', {
                onclick: () => {
                  const auto = autoFailsSave(e.conditions, k);
                  const r = d20(b);
                  const text = tr('{name}: {x}-Rettungswurf {x2}', { name: e.name, x: ABILITY_NAMES[k], x2: auto ? tr('scheitert automatisch (Zustand)') : `W20 ${r.nat} ${fmtMod(b)} = ${r.total}` });
                  sync.push(['initiative', 'log'], { at: Date.now(), round: st.initiative.round, text });
                  lastRoll = { text, from: e.id };
                  content.run();
                },
              }, `${ABILITY_NAMES[k]} ${fmtMod(b)}`),
            ),
          )
        : null,
    );
  };

  // --- Teilnehmer bearbeiten ----------------------------------------------------------------

  const editor = (st, e) => {
    const amount = h('input', { type: 'number', min: 0, placeholder: tr('Wert'), style: { width: '72px' } });
    const type = h('select', h('option', { value: '' }, tr('Schadensart')), ...Object.entries(DAMAGE_TYPES).map(([k, t]) => h('option', { value: k }, t.name)));
    const magical = h('input', { type: 'checkbox' });
    const crit = h('input', { type: 'checkbox' });
    const val = () => Number(amount.value) || 0;
    const doDamage = () => val() && act((tx) => C.damage(tx, e.id, val(), type.value || null, { magical: magical.checked, crit: crit.checked }));
    amount.addEventListener('keydown', (ev) => ev.key === 'Enter' && doDamage());

    const condSel = h('select', ...Object.entries(CONDITIONS).map(([k, c]) => h('option', { value: k }, c.name)));
    const durSel = h('select', ...DURATIONS.map(([v, l]) => h('option', { value: v }, l)));
    const endsSel = h('select', h('option', { value: 'end' }, tr('endet am Zugende')), h('option', { value: 'start' }, tr('endet zu Zugbeginn')));
    const saveAb = h('select', ...Object.entries(ABILITY_NAMES).map(([k, l]) => h('option', { value: k, selected: k === 'wis' }, l)));
    const saveDc = h('input', { type: 'number', min: 1, value: 13, style: { width: '60px' } });
    const saveRow = h('div.row.hidden', { style: { gap: '4px' } }, h('span.small', tr('RW')), saveAb, h('span.small', tr('SG')), saveDc);
    durSel.addEventListener('change', () => {
      saveRow.classList.toggle('hidden', durSel.value !== 'save');
      endsSel.classList.toggle('hidden', durSel.value === 'save' || durSel.value === '');
    });
    endsSel.classList.add('hidden');
    const addCond = () =>
      act((tx) =>
        C.addCondition(tx, e.id, condSel.value, {
          rounds: /^\d+$/.test(durSel.value) ? Number(durSel.value) : null,
          ends: endsSel.value,
          save: durSel.value === 'save' ? { ability: saveAb.value, dc: Number(saveDc.value) || 10 } : null,
        }),
      );
    const conc = h('input', { placeholder: tr('Zauber'), value: '', style: { flex: 1 } });
    const { hp, maxHp } = C.hpOf(st, e);
    const maxIn = h('input', { type: 'number', min: 1, value: maxHp ?? '', style: { width: '64px' }, title: tr('TP-Maximum') });
    maxIn.addEventListener('change', () => {
      const v = Number(maxIn.value) || null;
      const ops = [{ t: 'set', p: ['initiative', 'entries', e.id, 'maxHp'], v }];
      const t = C.tokenOf(st, e);
      if (t) ops.push({ t: 'set', p: ['maps', t.mapId, 'tokens', e.tokenId, 'maxHp'], v });
      if (hp == null) act((tx) => C.setHp(tx, e.id, v), { quiet: true });
      sync.do(ops);
    });
    const hpIn = h('input', { type: 'number', min: 0, value: hp ?? '', style: { width: '64px' }, title: tr('TP direkt setzen (ohne Regeln, z.B. zum Korrigieren)') });
    hpIn.addEventListener('change', () => act((tx) => C.setHp(tx, e.id, hpIn.value === '' ? null : Number(hpIn.value)), { quiet: true }));
    const iniIn = h('input', { type: 'number', value: e.init ?? '', style: { width: '64px' } });
    iniIn.addEventListener('change', () => sync.set(['initiative', 'entries', e.id, 'init'], iniIn.value === '' ? null : Number(iniIn.value)));
    const acIn = h('input', { type: 'number', value: e.ac ?? '', style: { width: '64px' } });
    acIn.addEventListener('change', () => sync.set(['initiative', 'entries', e.id, 'ac'], acIn.value === '' ? null : Number(acIn.value)));
    const atZero = e.kind === 'pc' && hp === 0 && !e.dead;
    return h(
      'div.cm-editor',
      h(
        'div.row',
        { style: { gap: '4px' } },
        amount,
        type,
        h('button.small.danger', { onclick: doDamage }, tr('Schaden')),
        h('button.small', { onclick: () => val() && act((tx) => C.heal(tx, e.id, val())), style: { color: 'var(--ok)' } }, tr('Heilen')),
        h('button.small', { onclick: () => val() && act((tx) => C.setTempHp(tx, e.id, val())), title: tr('Temporäre Trefferpunkte (stapeln sich nicht)') }, tr('Temp')),
      ),
      h('div.row.small', { style: { gap: '10px' } }, h('label.inline', magical, tr('magisch / versilbert')), h('label.inline', crit, tr('kritischer Treffer'))),
      atZero
        ? h(
            'div.cm-death',
            h('span', tr('Todesrettungswürfe: {repeat}{repeat2} Erfolg · {repeat3}{repeat4} Fehlschlag{x}', { repeat: '●'.repeat(e.death?.s || 0), repeat2: '○'.repeat(3 - (e.death?.s || 0)), repeat3: '●'.repeat(e.death?.f || 0), repeat4: '○'.repeat(3 - (e.death?.f || 0)), x: e.stable ? tr(' · stabil') : '' })),
            h(
              'div.row',
              { style: { gap: '4px', marginTop: '4px' } },
              h('button.small', { onclick: () => act((tx) => C.deathSave(tx, e.id, d(20))) }, icon('d20'), ' W20'),
              h('button.small', { onclick: () => act((tx) => C.deathSave(tx, e.id, 10)) }, tr('Erfolg')),
              h('button.small', { onclick: () => act((tx) => C.deathSave(tx, e.id, 9)) }, tr('Fehlschlag')),
              h('button.small', { onclick: () => act((tx) => C.stabilize(tx, e.id)) }, tr('Stabilisieren')),
            ),
          )
        : null,
      h('div.section-title.small', tr('Zustand')),
      h('div.row', { style: { gap: '4px' } }, condSel, durSel, endsSel, h('button.small', { onclick: addCond }, icon('plus'))),
      saveRow,
      Object.keys(e.conditions || {}).length
        ? h('div.row', { style: { gap: '4px', marginTop: '4px' } }, Object.entries(e.conditions).map(([k, cnd]) => h('button.small', { onclick: () => act((tx) => C.removeCondition(tx, e.id, k)), title: tr('Aufheben') }, `${CONDITIONS[k]?.name}${cnd.level ? ` ${cnd.level}` : ''}${cnd.rounds ? ` (${cnd.rounds})` : ''} `, icon('x'))))
        : null,
      h('div.section-title.small', tr('Konzentration')),
      e.concentration
        ? h('div.row', h('span.grow', `„${e.concentration}“`), h('button.small', { onclick: () => act((tx) => C.setConcentration(tx, e.id, null)) }, tr('Beenden')))
        : h('div.row', { style: { gap: '4px' } }, conc, h('button.small', { onclick: () => conc.value.trim() && act((tx) => C.setConcentration(tx, e.id, conc.value.trim())) }, tr('Beginnen'))),
      h(
        'div.row.small',
        { style: { gap: '6px', marginTop: '8px' } },
        h('span.muted', tr('Ini')),
        iniIn,
        h('span.muted', tr('TP')),
        hpIn,
        h('span.muted', '/'),
        maxIn,
        h('span.muted', tr('RK')),
        acIn,
        h('span.grow'),
        h('button.small', { title: tr('Aus dem Kampf entfernen'), onclick: () => act((tx) => C.removeCombatant(tx, e.id), { quiet: true }) }, icon('trash')),
      ),
    );
  };

  /** Schnellfeld in der Zeile: „7“ + Enter = 7 Schaden, „+5“ = 5 Heilung (ohne Schadensart). */
  const quickHp = (e) => {
    if (e.dead) return h('span');
    const input = h('input.cm-quick', { type: 'text', inputmode: 'numeric', placeholder: tr('Schaden'), title: tr('Schaden eintippen und Enter (z.B. 7) – mit + heilen (z.B. +5). Schadensart/magisch: Zeile aufklappen.') });
    input.addEventListener('click', (ev) => ev.stopPropagation());
    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const m = input.value.trim().match(/^([+-]?)\s*(\d+)$/);
      if (!m) return;
      const n = Number(m[2]);
      act((tx) => (m[1] === '+' ? C.heal(tx, e.id, n) : C.damage(tx, e.id, n)));
    });
    return input;
  };

  const row = (st, e, active) => {
    const open = selectedId === e.id;
    return h(
      'div.cm-row-wrap',
      h(
        'div.cm-row',
        {
          class: [e.kind, active && 'active', e.dead && 'dead', open && 'open', e.tokenId && tokenSelection.ids.has(e.tokenId) && 'picked'].filter(Boolean).join(' '),
          title: e.tokenId ? tr('Klick: aufklappen und Token auf der Karte auswählen') : tr('Klick: aufklappen'),
          onclick: () => {
            selectedId = open ? null : e.id;
            // Token auf der Karte mit auswählen (beim Zuklappen Auswahl lassen)
            if (!open && e.tokenId) tokenSelection.set([e.tokenId], 'combat');
            content.run();
          },
        },
        h('span.cm-ini', e.init ?? '–'),
        h('span.cm-name', e.name, h('span.cm-kind', [KIND_LABEL[e.kind] || '', e.ac ? tr(' · RK {ac}', { ac: e.ac }) : ''].join(''))),
        hpBar(st, e),
        h('span.cm-chips', chips(e)),
        quickHp(e),
      ),
      open ? editor(st, e) : null,
    );
  };

  // --- Teilnehmer hinzufügen ------------------------------------------------------------------

  const name = h('input', { placeholder: tr('Name (Spieler)') });
  const ini = h('input', { type: 'number', placeholder: tr('Ini') });
  const hpNew = h('input', { type: 'number', placeholder: tr('TP') });
  const acNew = h('input', { type: 'number', placeholder: tr('RK') });
  const addPc = () => {
    if (!name.value.trim()) return name.focus();
    const v = Number(hpNew.value) || null;
    act((tx) => C.addCombatant(tx, { name: name.value.trim(), kind: 'pc', init: ini.value === '' ? null : Number(ini.value), hp: v, maxHp: v, ac: Number(acNew.value) || null }), { quiet: true });
    name.value = ini.value = hpNew.value = acNew.value = '';
    name.focus();
  };
  for (const i of [name, ini, hpNew, acNew]) i.addEventListener('keydown', (ev) => ev.key === 'Enter' && addPc());

  const addMapTokens = () => {
    const map = S().maps[currentMapId?.()];
    if (!map) return toast(tr('Keine Karte geöffnet'));
    const existing = new Set(C.entries(S()).map((e) => e.tokenId));
    let n = 0;
    act((tx) => {
      for (const t of Object.values(map.tokens || {})) {
        if (existing.has(t.id) || t.dead) continue;
        n++;
        C.addCombatant(tx, { name: t.name, kind: t.kind || 'enemy', tokenId: t.id, creatureId: t.creatureId || null, hp: t.hp, maxHp: t.maxHp });
      }
    });
    toast(n ? tr('{n} Tokens im Kampf', { n }) : tr('Alle Tokens der Karte sind schon dabei'));
  };

  // --- Gesamtansicht -------------------------------------------------------------------------

  /** Initiative eintragen: Spieler sagen ihre Zahl an, Enter springt weiter; Gegner würfelt der Manager oder ihr selbst. */
  const setupList = (st) => {
    // Feste Reihenfolge beim Eintragen: Spieler zuerst, dann die übrigen
    const list = C.entries(st).sort((x, y) => (x.kind === 'pc' ? 0 : 1) - (y.kind === 'pc' ? 0 : 1) || String(x.name).localeCompare(String(y.name)));
    const setIni = (e, v) => sync.set(['initiative', 'entries', e.id, 'init'], v === '' || v == null ? null : Number(v));
    return h(
      'div.cm-setup',
      list.map((e) => {
        const inp = h('input.cm-ini-in', { type: 'number', inputmode: 'numeric', value: e.init ?? '', placeholder: e.kind === 'pc' ? tr('Ini') : `W20${fmtMod(e.mod || 0)}` });
        inp.addEventListener('change', () => setIni(e, inp.value));
        inp.addEventListener('keydown', (ev) => {
          if (ev.key !== 'Enter') return;
          ev.preventDefault();
          setIni(e, inp.value);
          const all = [...content.el.querySelectorAll('.cm-ini-in')];
          const next = all[all.indexOf(inp) + 1];
          if (next) {
            next.focus();
            next.select();
          } else inp.blur();
        });
        return h(
          'div.cm-setup-row',
          { class: [e.kind, e.init == null && e.kind === 'pc' ? 'missing' : ''].join(' ') },
          h('span.cm-name', e.name, h('span.cm-kind', KIND_LABEL[e.kind] || '')),
          e.kind !== 'pc' ? h('button.small', { title: tr('Würfeln (W20{mod})', { mod: fmtMod(e.mod || 0) }), onclick: () => setIni(e, d(20) + (e.mod || 0)) }, icon('d20')) : h('span'),
          inp,
          h('button.small', { title: tr('Aus dem Kampf entfernen'), onclick: () => act((tx) => C.removeCombatant(tx, e.id), { quiet: true }) }, icon('x')),
        );
      }),
    );
  };

  const rollEnemies = () => {
    const ops = C.entries(S())
      .filter((e) => e.kind !== 'pc')
      .map((e) => ({ t: 'set', p: ['initiative', 'entries', e.id, 'init'], v: d(20) + (e.mod || 0) }));
    sync.do(ops);
    content.run();
  };

  const addSection = () => [
    h('div.cm-add', name, ini, hpNew, acNew, h('button', { onclick: addPc, title: tr('Spieler hinzufügen') }, icon('plus'))),
    h('div.row', { style: { marginTop: '8px', gap: '4px' } }, h('button.small', { onclick: addMapTokens }, icon('token'), tr(' Tokens der Karte'))),
  ];

  const settingsSection = (st) => {
    const opts = st.display?.combat || {};
    const setOpt = (k, v) => sync.set(['display', 'combat'], { hpPlayers: 'bloodied', bloodied: 0.25, conditionsPlayers: false, ...opts, [k]: v });
    return h(
      'div.row',
      { style: { gap: '6px' } },
      h('select', { onchange: (ev) => setOpt('hpPlayers', ev.target.value) }, ...Object.entries(PLAYER_HP_MODES).map(([k, l]) => h('option', { value: k, selected: (opts.hpPlayers || 'bloodied') === k }, l))),
      h('select', { title: tr('Ab wann ein Token als „blutend“ gilt'), onchange: (ev) => setOpt('bloodied', Number(ev.target.value)) }, ...[[0.25, tr('Blutend ab 25 %')], [0.5, tr('Blutend ab 50 %')]].map(([v, l]) => h('option', { value: v, selected: (opts.bloodied ?? 0.25) === v }, l))),
      h('label.inline', h('input', { type: 'checkbox', checked: !!opts.conditionsPlayers, onchange: (ev) => setOpt('conditionsPlayers', ev.target.checked) }), tr('Zustände zeigen')),
    );
  };

  const logSection = (cs) => [
    h('div.section-title', { style: { cursor: 'pointer' }, onclick: () => ((showLog = !showLog), content.run()) }, icon(showLog ? 'chevronDown' : 'chevronRight'), tr(' Protokoll')),
    showLog ? h('div.cm-log', (cs.log || []).slice(-40).reverse().map((l) => h('div', h('span.muted', `R${l.round} `), l.text))) : null,
  ];

  /** Umschalter: echte Würfel am Tisch oder digital würfeln. */
  const diceToggle = (st) => {
    const opts = st.display?.combat || {};
    const cur = opts.dice || 'table';
    const set = (v) => sync.set(['display', 'combat'], { hpPlayers: 'bloodied', bloodied: 0.25, conditionsPlayers: false, ...opts, dice: v });
    return h(
      'div.seg.small',
      { title: tr('Wer würfelt für die Gegner?') },
      h('button.small', { class: cur === 'table' ? 'active' : '', onclick: () => set('table') }, icon('d20'), tr(' am Tisch')),
      h('button.small', { class: cur === 'digital' ? 'active' : '', onclick: () => set('digital') }, tr('digital')),
    );
  };

  const content = live(() => {
    const st = S();
    const cs = st.initiative || C.emptyCombat();
    const list = C.order(st);
    const active = cs.activeId ? cs.entries?.[cs.activeId] : null;
    const prompts = Object.values(cs.prompts || {});

    // --- Vorbereitung: Teilnehmer sammeln, Initiative eintragen ---
    if (!cs.started) {
      const missing = list.filter((e) => e.init == null && e.kind === 'pc');
      return [
        h('div.row', h('h3.grow', tr('Kampf vorbereiten')), diceToggle(st)),
        list.length
          ? [
              h('p.small.muted', tr('Initiative eintragen – Enter springt zum Nächsten. Gegner ohne Zahl würfelt der Manager beim Start.')),
              setupList(st),
              h(
                'div.row',
                { style: { gap: '6px', marginTop: '8px' } },
                h('button.small', { onclick: rollEnemies }, icon('d20'), tr(' Gegner würfeln')),
                h('span.grow'),
                h('button.primary', { onclick: () => act((tx) => C.nextTurn(tx)), title: missing.length ? tr('Noch ohne Initiative: {join}', { join: missing.map((e) => e.name).join(', ') }) : '' }, icon('swords'), tr(' Kampf beginnen')),
              ),
              missing.length ? h('p.small', { style: { color: '#e0a030', marginTop: '6px' } }, tr('Noch ohne Initiative: {join}', { join: missing.map((e) => e.name).join(', ') })) : null,
            ]
          : h('p.small.muted', tr('Noch niemand im Kampf. Spieler unten eintragen und die Tokens der Karte hinzufügen – Monster aus der Kartei bringen ihren Statblock mit.')),
        h('div.section-title', tr('Hinzufügen')),
        addSection(),
        list.length ? h('div.row', { style: { marginTop: '8px' } }, h('button.small.danger', { onclick: () => confirm(tr('Kampf leeren? Alle Teilnehmer werden entfernt.')) && (sync.set(['initiative'], C.emptyCombat()), (selectedId = null), (lastRoll = null)) }, tr('Leeren'))) : null,
        h('div.section-title', tr('Anzeige für Spieler')),
        settingsSection(st),
      ];
    }

    // --- Laufender Kampf ---
    return [
      h(
        'div.row.cm-turnbar',
        h('h3.grow', tr('Runde {x}', { x: cs.round || 1 })),
        h('button', { onclick: () => act((tx) => C.prevTurn(tx), { quiet: true }), title: tr('Einen Zug zurück (ohne Effekte)') }, icon('chevronLeft')),
        h('button.primary', { onclick: () => act((tx) => C.nextTurn(tx)) }, tr('Nächster Zug '), icon('chevronRight')),
      ),
      prompts.map(promptCard),
      lastRollBox(st),
      active ? activeCard(st, active) : null,
      h('div.cm-list', list.map((e) => row(st, e, e.id === cs.activeId))),
      h(
        'div.section-title',
        { style: { cursor: 'pointer' }, onclick: () => ((showMore = !showMore), content.run()) },
        icon(showMore ? 'chevronDown' : 'chevronRight'),
        tr(' Hinzufügen · Würfel · Anzeige · Protokoll'),
      ),
      showMore
        ? [
            addSection(),
            h('div.row', { style: { marginTop: '10px', gap: '6px' } }, h('span.small.muted', tr('Würfel für Gegner')), diceToggle(st)),
            h('div', { style: { marginTop: '10px' } }, settingsSection(st)),
            h(
              'div.row',
              { style: { marginTop: '10px', gap: '4px' } },
              h('button.small', { onclick: () => act((tx) => C.endCombat(tx)) }, tr('Kampf beenden')),
              h('button.small.danger', { onclick: () => confirm(tr('Kampf leeren? Alle Teilnehmer und das Protokoll werden entfernt.')) && (sync.set(['initiative'], C.emptyCombat()), (selectedId = null), (lastRoll = null)) }, tr('Leeren')),
            ),
            logSection(cs),
          ]
        : null,
    ];
  });

  // Auswahl auf der Karte hervorheben (anders als der aktive Zug)
  let shown = false;
  const off = tokenSelection.on((ids, source) => {
    if (content.el.isConnected) shown = true;
    else if (shown) return off(); // Panel wurde ersetzt
    if (source !== 'combat' && content.el.isConnected) content.run();
  });

  return { el: content.el, refresh: () => content.run() };
}
