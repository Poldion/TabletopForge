import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { applyOps } from '../shared/ops.js';
import { mergeSettings } from '../shared/calibration.js';
import { migrateScopes } from '../shared/scope.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const CAMPAIGNS_DIR = path.join(DATA_DIR, 'campaigns');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SAVE_DELAY = 400;

fs.mkdirSync(CAMPAIGNS_DIR, { recursive: true });

export const newId = () => randomUUID().replace(/-/g, '').slice(0, 12);

const cache = new Map(); // campaignId -> state
const timers = new Map(); // campaignId -> timeout

const isId = (id) => typeof id === 'string' && /^[a-z0-9]{6,32}$/i.test(id);

export const campaignDir = (id) => path.join(CAMPAIGNS_DIR, id);
export const uploadsDir = (id) => path.join(campaignDir(id), 'uploads');

function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function defaultCampaign(name) {
  return {
    id: newId(),
    name: name || 'Neue Kampagne',
    description: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    adventures: {},
    sessions: {},
    assets: {},
    maps: {},
    lore: {},
    creatures: {},
    // Encounter-Planer: Zusammenstellungen aus der Kreaturen-Kartei; Gruppe für die Schwierigkeitsberechnung
    encounters: {},
    party: { members: [] },
    notepad: '',
    notepadSketch: {},
    initiative: { round: 1, activeId: null, entries: {} },
    display: {
      sessionId: null,
      table: { mapId: null, cx: 0, cy: 0, zoom: 1, fit: false, blackout: false, views: {} },
      player: { mode: 'blank', assetId: null, mapId: null, loreId: null, text: '', caption: '' },
    },
  };
}

/** Ergänzt fehlende Felder älterer Speicherstände. */
function migrate(state) {
  const base = defaultCampaign(state.name);
  for (const key of Object.keys(base)) {
    if (state[key] === undefined) state[key] = base[key];
  }
  state.display.table = { ...base.display.table, ...state.display.table };
  // Gemeldete Ausschnitte gelten nur für aktuell verbundene Tischanzeigen
  state.display.table.views = {};
  delete state.display.table.viewCells;
  state.display.player = { ...base.display.player, ...state.display.player };
  return state;
}

export function listCampaigns() {
  const out = [];
  for (const id of fs.readdirSync(CAMPAIGNS_DIR)) {
    const st = getCampaign(id);
    if (st) {
      out.push({
        id: st.id,
        name: st.name,
        description: st.description,
        updatedAt: st.updatedAt,
        sessions: Object.keys(st.sessions).length,
        maps: Object.keys(st.maps).length,
      });
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getCampaign(id) {
  if (!isId(id)) return null;
  if (cache.has(id)) return cache.get(id);
  const file = path.join(campaignDir(id), 'campaign.json');
  if (!fs.existsSync(file)) return null;
  try {
    const st = migrate(JSON.parse(fs.readFileSync(file, 'utf8')));
    cache.set(id, st);
    // Einmalige Zuordnung zu Abenteuern (ältere Speicherstände) – gleich sichern
    if (migrateScopes(st)) scheduleSave(id);
    return st;
  } catch (err) {
    console.error(`Kampagne ${id} konnte nicht gelesen werden:`, err.message);
    return null;
  }
}

export function createCampaign(name) {
  const st = defaultCampaign(name);
  st.scopeVersion = 1; // neue Kampagne: nichts Bestehendes Abenteuern zuzuordnen
  fs.mkdirSync(uploadsDir(st.id), { recursive: true });
  cache.set(st.id, st);
  saveNow(st.id);
  return st;
}

export function deleteCampaign(id) {
  if (!getCampaign(id)) return false;
  clearTimeout(timers.get(id));
  timers.delete(id);
  cache.delete(id);
  fs.rmSync(campaignDir(id), { recursive: true, force: true });
  return true;
}

/** Wendet Ops an und plant das Speichern. */
export function commit(id, ops) {
  const st = getCampaign(id);
  if (!st) return false;
  const changed = applyOps(st, ops);
  if (changed) {
    st.updatedAt = Date.now();
    scheduleSave(id);
  }
  return changed;
}

function scheduleSave(id) {
  if (timers.has(id)) return;
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      saveNow(id);
    }, SAVE_DELAY),
  );
}

function saveNow(id) {
  const st = cache.get(id);
  if (!st) return;
  fs.mkdirSync(uploadsDir(id), { recursive: true });
  writeAtomic(path.join(campaignDir(id), 'campaign.json'), JSON.stringify(st));
}

export function flushAll() {
  for (const [id, t] of timers) {
    clearTimeout(t);
    saveNow(id);
  }
  timers.clear();
}

let settings = null;

export function getSettings() {
  if (!settings) {
    let saved = null;
    try {
      saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch {
      /* noch keine Einstellungen gespeichert */
    }
    settings = mergeSettings(saved);
  }
  return settings;
}

export function saveSettings(next) {
  settings = mergeSettings(next);
  writeAtomic(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  return settings;
}
