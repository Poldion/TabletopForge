// Kampf-Logik: Initiative, Züge, Schaden/Heilung, Zustände, Konzentration, Todesrettungswürfe.
// Alles läuft über eine Transaktion (tx): Änderungen werden auf einer Arbeitskopie ausgeführt und als Ops
// gesammelt, die die Oberfläche dann in einem Rutsch synchronisiert. Kein DOM – testbar mit node --test.
import { applyOps } from '../../shared/ops.js';
import {
  CONDITIONS, DAMAGE_TYPES, ABILITY_NAMES, adjustDamage, concentrationDc, d, d20, fmtMod, saveBonuses, defensesOf,
  conditionImmunities, parseActions, legendaryActions, legendaryResistance, regeneration, initiativeBonus, autoFailsSave, isIncapacitated,
} from './rules5e.js';
import { tr } from './i18n.js';

const LOG_MAX = 80;
const I = ['initiative'];

/** Leerer Kampfzustand. */
export const emptyCombat = () => ({ round: 1, activeId: null, started: false, entries: {}, prompts: {}, log: [] });

// --- Transaktion -----------------------------------------------------------------------

/**
 * Arbeitskopie von Initiative und Tokens. tx.ops: gesammelte Ops, tx.notes: Meldungen für die Oberfläche.
 * Kreaturen werden nur gelesen (keine Kopie).
 */
export function begin(state, { now = Date.now(), uid = defaultUid } = {}) {
  const maps = {};
  for (const [id, m] of Object.entries(state.maps || {})) maps[id] = { tokens: structuredClone(m.tokens || {}) };
  const work = { initiative: { ...emptyCombat(), ...structuredClone(state.initiative || {}) }, maps, creatures: state.creatures || {} };
  const tx = { s: work, ops: [], notes: [], now, uid };
  // Ältere Einträge (vor dem Kampf-Manager) um die nötigen Unterobjekte ergänzen – als Ops, damit auch der
  // Server sie hat und spätere Änderungen darin nicht ins Leere laufen
  if (!state.initiative?.prompts) set(tx, [...I, 'prompts'], {});
  if (!Array.isArray(state.initiative?.log)) set(tx, [...I, 'log'], []);
  for (const e of Object.values(work.initiative.entries || {})) {
    for (const [k, v] of [['conditions', {}], ['death', { s: 0, f: 0 }], ['recharge', {}], ['perDay', {}]]) {
      if (e[k] == null || typeof e[k] !== 'object') set(tx, E(e.id, k), v);
    }
  }
  return tx;
}

let counter = 0;
const defaultUid = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function op(tx, o) {
  applyOps(tx.s, [o]);
  tx.ops.push(o);
}
const set = (tx, p, v) => op(tx, { t: 'set', p, v });
const del = (tx, p) => op(tx, { t: 'del', p });
const E = (id, ...k) => [...I, 'entries', id, ...k];

export function log(tx, text) {
  const entry = { at: tx.now, round: tx.s.initiative.round || 1, text };
  op(tx, { t: 'push', p: [...I, 'log'], v: entry });
  tx.notes.push(text);
}

// --- Lesen ------------------------------------------------------------------------------

export const entries = (st) => Object.values(st.initiative?.entries || {});

/** Reihenfolge: Initiative, dann GE-Bonus, dann Name. */
export function order(st) {
  return entries(st).sort((a, b) => (b.init ?? -99) - (a.init ?? -99) || (b.mod ?? 0) - (a.mod ?? 0) || String(a.name).localeCompare(String(b.name)));
}

/** Token eines Eintrags (auf irgendeiner Karte). */
export function tokenOf(st, e) {
  if (!e?.tokenId) return null;
  for (const [mapId, m] of Object.entries(st.maps || {})) {
    const t = m.tokens?.[e.tokenId];
    if (t) return { mapId, token: t };
  }
  return null;
}

/** Trefferpunkte – das Token ist maßgeblich (bleibt über Kämpfe hinweg erhalten). */
export function hpOf(st, e) {
  const t = tokenOf(st, e)?.token;
  const hp = t ? t.hp ?? e.hp : e.hp;
  const maxHp = t ? t.maxHp ?? e.maxHp : e.maxHp;
  return { hp: hp ?? maxHp ?? null, maxHp: maxHp ?? null, temp: e.tempHp || 0 };
}

export const creatureOf = (st, e) => (e?.creatureId ? st.creatures?.[e.creatureId] || null : null);
const isPc = (e) => e.kind === 'pc';
const alive = (e) => !e.dead;

// --- Schreiben: TP, Tod -----------------------------------------------------------------

function writeHp(tx, e, hp) {
  set(tx, E(e.id, 'hp'), hp);
  const t = tokenOf(tx.s, e);
  if (t) set(tx, ['maps', t.mapId, 'tokens', e.tokenId, 'hp'], hp);
}

function writeTemp(tx, e, temp) {
  set(tx, E(e.id, 'tempHp'), temp);
  const t = tokenOf(tx.s, e);
  if (t) set(tx, ['maps', t.mapId, 'tokens', e.tokenId, 'tempHp'], temp);
}

function setDead(tx, e, dead) {
  set(tx, E(e.id, 'dead'), dead);
  const t = tokenOf(tx.s, e);
  if (t) set(tx, ['maps', t.mapId, 'tokens', e.tokenId, 'dead'], dead);
  if (dead) {
    endConcentration(tx, e, null);
    for (const [pid, p] of Object.entries(tx.s.initiative.prompts)) if (p.entryId === e.id) del(tx, [...I, 'prompts', pid]);
  }
}

function prompt(tx, p) {
  const id = tx.uid();
  set(tx, [...I, 'prompts', id], { id, ...p });
}

// --- Teilnehmer --------------------------------------------------------------------------

/** Eintrag aus Kreatur/Token anlegen. Monster würfeln ihre Initiative sofort. */
export function addCombatant(tx, { name, kind = 'enemy', tokenId = null, creatureId = null, hp = null, maxHp = null, ac = null, init = null, rollInit = true } = {}) {
  const c = creatureId ? tx.s.creatures[creatureId] : null;
  const mod = c ? initiativeBonus(c) : 0;
  let ini = init;
  if (ini == null && rollInit && kind !== 'pc') ini = d(20) + mod;
  const id = tx.uid();
  const e = {
    id, name: name || c?.name || '?', kind, tokenId, creatureId,
    init: ini, mod,
    hp: hp ?? c?.hp ?? null, maxHp: maxHp ?? c?.hp ?? hp ?? null, tempHp: 0,
    ac: ac ?? (parseInt(c?.ac, 10) || null),
    conditions: {}, concentration: null, death: { s: 0, f: 0 }, stable: false, dead: false,
    reactionUsed: false,
    legendary: c && legendaryActions(c) ? { max: legendaryActions(c), used: 0 } : null,
    lr: c && legendaryResistance(c) ? { max: legendaryResistance(c), used: 0 } : null,
    recharge: {}, perDay: {}, regenBlocked: false,
  };
  set(tx, E(id), e);
  if (ini != null && kind !== 'pc') log(tx, `${e.name} würfelt Initiative: ${ini - mod} ${fmtMod(mod)} = ${ini}`);
  return id;
}

export function removeCombatant(tx, id) {
  for (const [pid, p] of Object.entries(tx.s.initiative.prompts)) if (p.entryId === id) del(tx, [...I, 'prompts', pid]);
  if (tx.s.initiative.activeId === id) set(tx, [...I, 'activeId'], null);
  del(tx, E(id));
}

// --- Kampfablauf ---------------------------------------------------------------------------

export function startCombat(tx) {
  const st = tx.s;
  for (const e of entries(st)) {
    if (e.init == null && !isPc(e)) {
      const r = d(20);
      set(tx, E(e.id, 'init'), r + (e.mod || 0));
      log(tx, `${e.name} würfelt Initiative: ${r} ${fmtMod(e.mod || 0)} = ${r + (e.mod || 0)}`);
    }
  }
  const missing = entries(st).filter((e) => e.init == null).map((e) => e.name);
  if (missing.length) tx.notes.push(`Initiative fehlt noch: ${missing.join(', ')}`);
  const first = order(st).find(alive);
  set(tx, [...I, 'started'], true);
  set(tx, [...I, 'round'], 1);
  set(tx, [...I, 'activeId'], first?.id || null);
  log(tx, '⚔ Kampf beginnt – Runde 1');
  if (first) startOfTurn(tx, first);
}

export function endCombat(tx) {
  set(tx, [...I, 'started'], false);
  set(tx, [...I, 'activeId'], null);
  set(tx, [...I, 'round'], 1);
  set(tx, [...I, 'prompts'], {});
  for (const e of entries(tx.s)) {
    set(tx, E(e.id, 'reactionUsed'), false);
    if (e.legendary) set(tx, E(e.id, 'legendary', 'used'), 0);
  }
  log(tx, 'Kampf beendet');
}

/** Nächster Zug: Ende des aktuellen Zugs auswerten, nächsten Lebenden aktivieren, Zugbeginn auswerten. */
export function nextTurn(tx) {
  const st = tx.s;
  if (!st.initiative.started || !st.initiative.activeId) return startCombat(tx);
  const list = order(st);
  const cur = st.initiative.entries[st.initiative.activeId];
  if (cur) endOfTurn(tx, cur);
  let idx = list.findIndex((e) => e.id === st.initiative.activeId);
  let round = st.initiative.round || 1;
  for (let i = 0; i < list.length; i++) {
    idx++;
    if (idx >= list.length) {
      idx = 0;
      round++;
      set(tx, [...I, 'round'], round);
      log(tx, `— Runde ${round} —`);
    }
    const e = st.initiative.entries[list[idx].id];
    if (alive(e)) {
      set(tx, [...I, 'activeId'], e.id);
      startOfTurn(tx, e);
      break;
    }
  }
  trimLog(tx);
}

/** Einen Zug zurück (ohne Effekte erneut auszuwerten – zum Korrigieren). */
export function prevTurn(tx) {
  const st = tx.s;
  const list = order(st).filter(alive);
  if (!list.length) return;
  let idx = list.findIndex((e) => e.id === st.initiative.activeId);
  let round = st.initiative.round || 1;
  idx--;
  if (idx < 0) {
    idx = list.length - 1;
    round = Math.max(1, round - 1);
    set(tx, [...I, 'round'], round);
  }
  set(tx, [...I, 'activeId'], list[idx].id);
}

function trimLog(tx) {
  const l = tx.s.initiative.log;
  if (l.length > LOG_MAX) set(tx, [...I, 'log'], l.slice(-LOG_MAX));
}

function startOfTurn(tx, e) {
  const c = creatureOf(tx.s, e);
  log(tx, `▶ ${e.name} ist am Zug`);
  if (e.reactionUsed) set(tx, E(e.id, 'reactionUsed'), false);
  if (e.legendary?.used) set(tx, E(e.id, 'legendary', 'used'), 0);
  tickConditions(tx, e, 'start');
  // Aufladung (z.B. Odemwaffe 5–6): verbrauchte Fähigkeiten zu Zugbeginn neu würfeln
  if (c) {
    for (const a of parseActions(c).filter((x) => x.recharge)) {
      if (e.recharge?.[a.name] !== false) continue;
      const r = d(6);
      const ok = r >= a.recharge;
      set(tx, E(e.id, 'recharge', a.name), ok);
      log(tx, `${e.name}: ${a.name} aufladen – W6: ${r} → ${ok ? 'wieder bereit' : 'noch nicht bereit'}`);
    }
    const regen = regeneration(c);
    const { hp, maxHp } = hpOf(tx.s, e);
    if (regen && hp != null && hp > 0 && hp < maxHp) {
      if (e.regenBlocked) log(tx, `${e.name}: Regeneration wirkt diesen Zug nicht`);
      else {
        writeHp(tx, e, Math.min(maxHp, hp + regen.amount));
        log(tx, `${e.name} regeneriert ${Math.min(regen.amount, maxHp - hp)} TP`);
      }
    }
    if (e.regenBlocked) set(tx, E(e.id, 'regenBlocked'), false);
  }
  const { hp } = hpOf(tx.s, e);
  if (isPc(e) && hp === 0 && !e.stable && !e.dead) {
    prompt(tx, { type: 'deathSave', entryId: e.id, text: tr('{name}: Todesrettungswurf (W20 – ab 10 Erfolg, 20 = 1 TP, 1 = zwei Fehlschläge)', { name: e.name }) });
  }
}

function endOfTurn(tx, e) {
  // Rettungswürfe „am Ende jedes seiner Züge“
  for (const [key, cond] of Object.entries(e.conditions || {})) {
    if (!cond.save) continue;
    const { ability, dc } = cond.save;
    const label = tr('{x}: {x2}-Rettungswurf SG {dc}', { x: CONDITIONS[key]?.name || key, x2: ABILITY_NAMES[ability], dc });
    if (isPc(e)) {
      prompt(tx, { type: 'save', entryId: e.id, cond: key, dc, ability, text: tr('{name} – {label} (Ende des Zuges)', { name: e.name, label }) });
    } else {
      const res = rollSave(tx, e, ability, dc);
      log(tx, `${e.name} – ${label}: ${res.text}`);
      if (res.success) removeCondition(tx, e.id, key, true);
    }
  }
  tickConditions(tx, e, 'end');
}

/** Dauer in Runden herunterzählen; Ablauf am Anfang oder Ende des eigenen Zuges. */
function tickConditions(tx, e, when) {
  const cur = tx.s.initiative.entries[e.id];
  for (const [key, cond] of Object.entries(cur?.conditions || {})) {
    if (cond.rounds == null || (cond.ends || 'end') !== when) continue;
    const left = cond.rounds - 1;
    if (left <= 0) {
      removeCondition(tx, e.id, key, true);
      log(tx, `${e.name}: ${CONDITIONS[key]?.name || key} endet`);
    } else {
      set(tx, E(e.id, 'conditions', key, 'rounds'), left);
    }
  }
}

// --- Würfe ---------------------------------------------------------------------------------

/** Rettungswurf einer Kreatur (Bonus aus dem Statblock, automatisches Scheitern bei Lähmung u.ä.). */
export function rollSave(tx, e, ability, dc) {
  if (autoFailsSave(e.conditions, ability)) return { success: false, text: tr('scheitert automatisch (Zustand)') };
  const c = creatureOf(tx.s, e);
  const bonus = c ? saveBonuses(c)[ability] : 0;
  const r = d20(bonus);
  const success = r.nat === 20 || (r.nat !== 1 && r.total >= dc);
  return { success, total: r.total, text: `W20 ${r.nat} ${fmtMod(bonus)} = ${r.total} → ${success ? 'geschafft' : 'misslungen'}` };
}

// --- Schaden & Heilung -------------------------------------------------------------------

/**
 * Schaden mit allen Regeln: Resistenz/Anfälligkeit/Immunität, temporäre TP, Konzentration, 0 TP
 * (Monster sterben; Spieler werden bewusstlos, Massivschaden tötet sofort, Schaden bei 0 TP = Fehlschlag).
 */
export function damage(tx, id, amount, type = null, { magical = false, crit = false } = {}) {
  const e = tx.s.initiative.entries[id];
  if (!e) return;
  const c = creatureOf(tx.s, e);
  const defenses = c ? defensesOf(c) : e.defenses || {};
  const adj = adjustDamage(amount, type, defenses, { magical, petrified: !!e.conditions?.petrified });
  const typeName = type ? DAMAGE_TYPES[type]?.name : '';
  let rest = adj.amount;
  const { hp: hpBefore, maxHp, temp } = hpOf(tx.s, e);
  let absorbed = 0;
  if (temp > 0 && rest > 0) {
    absorbed = Math.min(temp, rest);
    rest -= absorbed;
    writeTemp(tx, e, temp - absorbed);
  }
  const hp0 = hpBefore ?? 0;
  const hpAfter = Math.max(0, hp0 - rest);
  if (hpBefore != null) writeHp(tx, e, hpAfter);
  const parts = [tr('{name} erleidet {amount}{x}-Schaden', { name: e.name, amount: adj.amount, x: typeName ? ` ${typeName}` : '' })];
  if (adj.note) parts.push(`(${adj.note}${adj.amount !== Number(amount) ? `, statt ${amount}` : ''})`);
  if (absorbed) parts.push(`– ${absorbed} von temporären TP abgefangen`);
  if (hpBefore != null) parts.push(`→ ${hpAfter}/${maxHp ?? '?'} TP`);
  log(tx, parts.join(' '));

  const regen = c && regeneration(c);
  if (regen && type && regen.blockedBy.includes(type)) set(tx, E(id, 'regenBlocked'), true);

  // Konzentration
  if (adj.amount > 0 && e.concentration && hpAfter > 0) {
    const dc = concentrationDc(adj.amount);
    if (isPc(e)) prompt(tx, { type: 'concentration', entryId: id, dc, ability: 'con', text: tr('{name}: Konzentration auf „{concentration}“ halten – KO-Rettungswurf SG {dc}', { name: e.name, concentration: e.concentration, dc }) });
    else {
      const res = rollSave(tx, e, 'con', dc);
      log(tx, `${e.name} – Konzentration (SG ${dc}): ${res.text}`);
      if (!res.success) endConcentration(tx, e, 'verloren');
    }
  }

  if (hpBefore == null || hpAfter > 0 || rest <= 0) return;
  if (!isPc(e)) {
    if (!e.dead) {
      setDead(tx, e, true);
      log(tx, `☠ ${e.name} ist besiegt`);
    }
    return;
  }
  // Spielercharakter bei 0 TP
  const overflow = hp0 > 0 ? rest - hp0 : rest;
  if (maxHp && overflow >= maxHp) {
    setDead(tx, e, true);
    log(tx, `☠ ${e.name} stirbt sofort (Massivschaden: ${overflow} ≥ ${maxHp} TP-Maximum)`);
    return;
  }
  if (hp0 > 0) {
    endConcentration(tx, e, 'bewusstlos');
    addCondition(tx, id, 'unconscious', { silent: true });
    addCondition(tx, id, 'prone', { silent: true });
    set(tx, E(id, 'death'), { s: 0, f: 0 });
    set(tx, E(id, 'stable'), false);
    log(tx, `${e.name} geht zu Boden – bewusstlos, Todesrettungswürfe ab dem nächsten Zug`);
  } else {
    const fails = (e.death?.f || 0) + (crit ? 2 : 1);
    set(tx, E(id, 'stable'), false);
    setDeathFails(tx, e, fails, crit ? tr('kritischer Treffer bei 0 TP: zwei Fehlschläge') : tr('Schaden bei 0 TP: ein Fehlschlag'));
  }
}

function setDeathFails(tx, e, fails, why) {
  set(tx, E(e.id, 'death', 'f'), Math.min(3, fails));
  log(tx, `${e.name}: ${why} (${Math.min(3, fails)}/3)`);
  if (fails >= 3) {
    setDead(tx, e, true);
    log(tx, `☠ ${e.name} ist tot`);
  }
}

export function heal(tx, id, amount) {
  const e = tx.s.initiative.entries[id];
  if (!e) return;
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  const { hp, maxHp } = hpOf(tx.s, e);
  if (e.dead && isPc(e)) {
    log(tx, `${e.name} ist tot – Heilung wirkt nicht (nur Wiederbelebung)`);
    return;
  }
  const before = hp ?? 0;
  const after = maxHp != null ? Math.min(maxHp, before + n) : before + n;
  writeHp(tx, e, after);
  if (e.dead) setDead(tx, e, false);
  log(tx, `${e.name} wird um ${after - before} TP geheilt → ${after}/${maxHp ?? '?'} TP`);
  if (before === 0 && after > 0 && isPc(e)) {
    removeCondition(tx, id, 'unconscious', true);
    set(tx, E(id, 'death'), { s: 0, f: 0 });
    set(tx, E(id, 'stable'), false);
    for (const [pid, p] of Object.entries(tx.s.initiative.prompts)) if (p.entryId === id && p.type === 'deathSave') del(tx, [...I, 'prompts', pid]);
    log(tx, `${e.name} ist wieder bei Bewusstsein (liegt noch am Boden)`);
  }
}

/** Temporäre TP stapeln sich nicht – der höhere Wert gilt. */
export function setTempHp(tx, id, amount) {
  const e = tx.s.initiative.entries[id];
  if (!e) return;
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  const cur = e.tempHp || 0;
  if (n <= cur) {
    log(tx, `${e.name} behält ${cur} temporäre TP (stapeln sich nicht, ${n} ist nicht mehr)`);
    return;
  }
  writeTemp(tx, e, n);
  log(tx, `${e.name} erhält ${n} temporäre TP`);
}

/** TP direkt setzen (Korrektur) – ohne Regelauswertung. */
export function setHp(tx, id, hp) {
  const e = tx.s.initiative.entries[id];
  if (!e) return;
  writeHp(tx, e, hp);
}

// --- Todesrettungswürfe ----------------------------------------------------------------

/** nat: Ergebnis des W20 (ohne Modifikator). */
export function deathSave(tx, id, nat) {
  const e = tx.s.initiative.entries[id];
  if (!e || e.dead) return;
  const death = { s: e.death?.s || 0, f: e.death?.f || 0 };
  if (nat === 20) {
    writeHp(tx, e, 1);
    removeCondition(tx, id, 'unconscious', true);
    set(tx, E(id, 'death'), { s: 0, f: 0 });
    log(tx, `${e.name}: Todesrettungswurf 20 – kommt mit 1 TP zu sich!`);
    return;
  }
  if (nat === 1) return setDeathFails(tx, e, death.f + 2, tr('Todesrettungswurf 1 – zwei Fehlschläge'));
  if (nat < 10) return setDeathFails(tx, e, death.f + 1, tr('Todesrettungswurf {nat} – Fehlschlag', { nat }));
  const s = death.s + 1;
  set(tx, E(id, 'death', 's'), Math.min(3, s));
  log(tx, `${e.name}: Todesrettungswurf ${nat} – Erfolg (${Math.min(3, s)}/3)`);
  if (s >= 3) {
    set(tx, E(id, 'stable'), true);
    log(tx, `${e.name} ist stabil (bewusstlos, 0 TP)`);
  }
}

export function stabilize(tx, id) {
  const e = tx.s.initiative.entries[id];
  if (!e) return;
  set(tx, E(id, 'stable'), true);
  set(tx, E(id, 'death'), { s: 0, f: 0 });
  for (const [pid, p] of Object.entries(tx.s.initiative.prompts)) if (p.entryId === id && p.type === 'deathSave') del(tx, [...I, 'prompts', pid]);
  log(tx, `${e.name} wurde stabilisiert`);
}

// --- Zustände & Konzentration ------------------------------------------------------------

/**
 * Zustand hinzufügen. opts: rounds (null = bis aufgehoben), ends ('start' | 'end' des eigenen Zuges),
 * save ({ ability, dc } – Rettungswurf am Ende jedes Zuges), level (Erschöpfung), note.
 */
export function addCondition(tx, id, key, { rounds = null, ends = 'end', save = null, level = null, note = '', silent = false } = {}) {
  const e = tx.s.initiative.entries[id];
  if (!e || !CONDITIONS[key]) return;
  const c = creatureOf(tx.s, e);
  if (c && conditionImmunities(c).includes(key)) {
    log(tx, `${e.name} ist immun gegen „${CONDITIONS[key].name}“`);
    return;
  }
  const cond = { rounds: rounds ?? null, ends, save: save || null, note: note || '' };
  if (key === 'exhaustion') cond.level = Math.max(1, Math.min(6, level || (e.conditions?.exhaustion?.level || 0) + 1));
  set(tx, E(id, 'conditions', key), cond);
  if (!silent) {
    const extra = [cond.level ? tr('Stufe {level}', { level: cond.level }) : '', rounds ? tr('{rounds} Runde{x}', { rounds, x: rounds === 1 ? '' : 'n' }) : '', save ? tr('RW {x} SG {dc} am Zugende', { x: ABILITY_NAMES[save.ability], dc: save.dc }) : ''].filter(Boolean).join(', ');
    log(tx, `${e.name}: ${CONDITIONS[key].name}${extra ? ` (${extra})` : ''}`);
  }
  if (key === 'exhaustion' && cond.level >= 6) {
    setDead(tx, e, true);
    log(tx, `☠ ${e.name} stirbt an Erschöpfung (Stufe 6)`);
  }
  if (CONDITIONS[key].incap && tx.s.initiative.entries[id].concentration) endConcentration(tx, tx.s.initiative.entries[id], tr('kampfunfähig'));
}

export function removeCondition(tx, id, key, silent = false) {
  const e = tx.s.initiative.entries[id];
  if (!e?.conditions?.[key]) return;
  del(tx, E(id, 'conditions', key));
  if (!silent) log(tx, `${e.name}: ${CONDITIONS[key]?.name || key} aufgehoben`);
}

export function setConcentration(tx, id, spell) {
  const e = tx.s.initiative.entries[id];
  if (!e) return;
  if (!spell) return endConcentration(tx, e, 'beendet');
  if (isIncapacitated(e.conditions)) {
    log(tx, `${e.name} ist kampfunfähig und kann sich nicht konzentrieren`);
    return;
  }
  if (e.concentration) log(tx, `${e.name} beendet die Konzentration auf „${e.concentration}“`);
  set(tx, E(id, 'concentration'), spell);
  log(tx, `${e.name} konzentriert sich auf „${spell}“`);
}

function endConcentration(tx, e, why) {
  const cur = tx.s.initiative.entries[e.id];
  if (!cur?.concentration) return;
  const spell = cur.concentration;
  set(tx, E(e.id, 'concentration'), null);
  if (why) log(tx, `${e.name}: Konzentration auf „${spell}“ ${why === 'beendet' ? 'beendet' : `endet (${why})`}`);
}

// --- Abfragen (Würfe der Spieler) ---------------------------------------------------------

/** Abfrage auflösen: outcome 'success' | 'fail' | Zahl (W20 bei Todesrettungswurf). */
export function resolvePrompt(tx, pid, outcome) {
  const p = tx.s.initiative.prompts[pid];
  if (!p) return;
  del(tx, [...I, 'prompts', pid]);
  const e = tx.s.initiative.entries[p.entryId];
  if (!e) return;
  if (p.type === 'deathSave') {
    const nat = typeof outcome === 'number' ? outcome : outcome === 'success' ? 10 : 9;
    return deathSave(tx, e.id, nat);
  }
  if (p.type === 'concentration') {
    if (outcome === 'success') log(tx, `${e.name} hält die Konzentration (SG ${p.dc})`);
    else endConcentration(tx, e, tr('Rettungswurf SG {dc} misslungen', { dc: p.dc }));
    return;
  }
  if (p.type === 'save') {
    if (outcome === 'success') {
      removeCondition(tx, e.id, p.cond, true);
      log(tx, `${e.name} schafft den Rettungswurf – ${CONDITIONS[p.cond]?.name || p.cond} endet`);
    } else {
      log(tx, `${e.name} scheitert – ${CONDITIONS[p.cond]?.name || p.cond} bleibt`);
    }
  }
}

// --- Ressourcen ----------------------------------------------------------------------------

export function toggleReaction(tx, id) {
  const e = tx.s.initiative.entries[id];
  if (!e) return;
  const used = !e.reactionUsed;
  set(tx, E(id, 'reactionUsed'), used);
  if (used) log(tx, `${e.name} nutzt seine Reaktion`);
}

export function useLegendary(tx, id, delta = 1) {
  const e = tx.s.initiative.entries[id];
  if (!e?.legendary) return;
  const used = Math.max(0, Math.min(e.legendary.max, e.legendary.used + delta));
  set(tx, E(id, 'legendary', 'used'), used);
  if (delta > 0) log(tx, `${e.name}: legendäre Aktion (${e.legendary.max - used} übrig)`);
}

export function useLegendaryResistance(tx, id) {
  const e = tx.s.initiative.entries[id];
  if (!e?.lr || e.lr.used >= e.lr.max) return;
  const used = e.lr.used + 1;
  set(tx, E(id, 'lr', 'used'), used);
  log(tx, `${e.name} nutzt Legendäre Resistenz und schafft den Rettungswurf (${e.lr.max - used} übrig)`);
}

/** Aufladbare Fähigkeit benutzen (ist dann bis zum erfolgreichen W6 zu Zugbeginn verbraucht). */
export function useRecharge(tx, id, name) {
  const e = tx.s.initiative.entries[id];
  if (!e) return;
  set(tx, E(id, 'recharge', name), false);
  log(tx, `${e.name} setzt ${name} ein – lädt sich zu Zugbeginn wieder auf`);
}

export function usePerDay(tx, id, name, max) {
  const e = tx.s.initiative.entries[id];
  if (!e) return;
  const used = Math.min(max, (e.perDay?.[name] || 0) + 1);
  set(tx, E(id, 'perDay', name), used);
  log(tx, `${e.name} setzt ${name} ein (${max - used}/${max} übrig)`);
}

/** Hinweise zum Zug einer Kreatur (für die Anzeige, nicht gespeichert). */
export function turnHints(st, e) {
  const hints = [];
  const { hp } = hpOf(st, e);
  if (isIncapacitated(e.conditions)) hints.push('Kampfunfähig – keine Aktionen, keine Reaktionen');
  if (e.conditions?.prone) hints.push('Liegt am Boden – Aufstehen kostet die halbe Bewegungsrate');
  if (e.conditions?.grappled || e.conditions?.restrained) hints.push('Bewegungsrate 0');
  if (e.concentration) hints.push(`Konzentriert sich auf „${e.concentration}“`);
  if (isPc(e) && hp === 0 && !e.dead) hints.push(e.stable ? 'Stabil, bewusstlos' : `Todesrettungswürfe: ${e.death?.s || 0} Erfolge, ${e.death?.f || 0} Fehlschläge`);
  return hints;
}
