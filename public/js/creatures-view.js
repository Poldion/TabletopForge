// Bereich „Kreaturen“: NPC- und Monster-Kartei mit Statblöcken, Hintergrund und Import.
import { h, fill, uid, bindInput, sortBy, byOrder, fileUrl, uploadFiles, api, toast } from './util.js';
import { ABILITIES, SIZES, abilityMod, fmtMod, newCreature, parseStatblock, fromOpen5e, renderStatblock } from './statblock.js';
import { toEnglishQuery, germanName, CREATURE_TYPES, CR_STEPS, crLabel } from './monster-names-de.js';
import { generateNpc, npcName, npcBackground, templateForRole, ROLLERS, FIELD_LABELS, PEOPLES, GENDERS, ROLES, STAT_TEMPLATES, PEOPLE_LABELS_ALL } from './npc-gen.js';
import { icon } from './icons.js';
import { portraitSpec, portraitSvg, svgToPngFile } from './portrait.js';
import { loadLibrary, matchLibrary, matchCreature, RACE_LABELS } from './portrait-library.js';
import * as Combat from './combat.js';
import { ENC_PREFIX, encounterDetail, difficultyChip, evaluateEncounter, newEncounter } from './encounter-view.js';
import { tr } from './i18n.js';
import { ai, aiTextButton, aiImageButton, mergeText } from './ai.js';
import { openRandomEncounter } from './encounter-ai.js';
import { openAiCreator } from './creature-ai.js';
import { figureImages } from './components.js';
import { inScope, adventureChips, addFromCampaign } from './scope-ui.js';
import { t } from './i18n.js';

const KIND = { npc: tr('NSC'), monster: tr('Monster') };

/** Kreatur in den Kampf aufnehmen (Initiative: W20 + GE-Modifikator; Statblock-Daten für die Regeln). */
export function addCreatureToInitiative(sync, c, { tokenId = null, name = null, hp = null, maxHp = null } = {}) {
  const tx = Combat.begin(sync.state);
  Combat.addCombatant(tx, { name: name || c.name, kind: c.kind === 'npc' ? 'npc' : 'enemy', tokenId, creatureId: c.id, hp: hp ?? c.hp ?? null, maxHp: maxHp ?? c.hp ?? null });
  sync.do(tx.ops);
  if (tx.notes.length) toast(tx.notes.at(-1));
}

/** Token-Vorlage aus einer Kreatur. */
export function tokenPreset(c) {
  return {
    name: c.name,
    kind: c.kind === 'npc' ? 'npc' : 'enemy',
    size: { Tiny: 0.5, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4 }[c.size] ?? 1,
    hidden: c.kind !== 'npc',
    numbered: c.kind !== 'npc',
    assetId: c.tokenAssetId || c.portraitAssetId || null, // rundes Token, sonst das Porträt
    creatureId: c.id,
    hp: c.hp ?? null,
    maxHp: c.hp ?? null,
  };
}

/** Kreatur in Kurzform – Kontext für das Sprachmodell (nicht angezeigt). */
function creatureAbout(c) {
  const parts = [c.kind === 'npc' ? 'non-player character' : 'monster', `"${c.name}"`, c.type, c.role && `role: ${c.role}`, c.location && `location: ${c.location}`, c.alignment && `alignment: ${c.alignment}`];
  return `D&D 5e ${parts.filter(Boolean).join(', ')}`;
}

// Angaben aus dem Hintergrund, die man auf einem Bild sieht (Zeilen des NSC-Generators: **Aussehen:** …)
const VISIBLE_FACTS = ['Volk', 'Geschlecht', 'Alter', 'Aussehen', 'Race', 'Gender', 'Age', 'Appearance']; // i18n-ignore – Beschriftungen in den Daten (beide Sprachen)

/** Bildbeschreibung aus einer Kreatur: Art/Volk, Rolle und das Aussehen (sonst der Anfang des Hintergrunds). */
function creaturePrompt(c) {
  const raw = String(c.background || '');
  const facts = [...raw.matchAll(/\*\*([^*:]+):\*\*\s*([^\n·*]+)/g)].filter((m) => VISIBLE_FACTS.includes(m[1].trim())).map((m) => m[2].trim());
  const bg = facts.length ? facts.join(', ') : raw.replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
  // Eigennamen von NSCs sagen dem Bildmodell nichts – bei Monstern ist der Name die Art („Goblin“)
  const head = [c.kind === 'npc' ? '' : c.name, c.type, c.role].filter(Boolean).join(', ');
  return [head, bg].filter(Boolean).join('. ');
}

/** Gemeinsamer Rahmen für große Dialoge. */
function bigDialog(title, ...content) {
  const dlg = h('dialog.modal.big-dialog');
  dlg.append(h('div.row', h('h3.grow', title), h('button.small', { type: 'button', onclick: () => dlg.close(), title: tr('Schließen') }, icon('x'))), ...content);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

function createCreature(sync, c) {
  const id = uid();
  sync.set(['creatures', id], { ...c, id, createdAt: Date.now() });
  return id;
}

/** Dialog zum Importieren: Monster-Datenbank durchsuchen oder Statblock einfügen. */
export function openImportDialog(sync, onCreated) {
  let dlg = null;
  const done = async (c, imageUrl) => {
    const id = createCreature(sync, c);
    dlg.close();
    onCreated?.(id);
    // Bild aus der Datenbank als Porträt/Token-Bild übernehmen (falls vorhanden)
    if (imageUrl) {
      try {
        const asset = await api('POST', `/api/campaigns/${sync.campaignId}/assets/from-url`, { url: imageUrl, name: c.name });
        sync.set(['creatures', id, 'portraitAssetId'], asset.id);
        toast(tr('Bild von „{name}“ übernommen', { name: c.name }));
      } catch (err) {
        toast(tr('Bild nicht übernommen: {message}', { message: err.message }));
      }
    }
  };
  const imageOf = (m) => (m?.img_main ? String(m.img_main).replace(/^http:\/\//, 'https://') : '');

  // --- Datenbank ---
  const q = h('input', { type: 'search', placeholder: tr('Name – auch deutsch, z.B. Eulenbär, Skelett, Drache'), style: { flex: 2, minWidth: '200px' } });
  const type = h('select', ...Object.entries(CREATURE_TYPES).map(([v, l]) => h('option', { value: v }, l)));
  const crOpt = (sel) => [h('option', { value: '' }, '–'), ...CR_STEPS.map((c) => h('option', { value: c, selected: c === sel }, crLabel(c)))];
  const crMin = h('select', { style: { width: '80px' } }, crOpt(''));
  const crMax = h('select', { style: { width: '80px' } }, crOpt(''));
  const source = h('select', h('option', { value: 'srd' }, tr('Nur offizielles SRD')), h('option', { value: 'all' }, tr('Alle freien Quellen')));
  const sort = h('select', h('option', { value: 'name' }, tr('nach Name')), h('option', { value: 'cr' }, tr('nach HG')));
  const hint = h('div.small.muted', { style: { minHeight: '18px' } });
  const results = h('div.list.import-results');
  const preview = h('div.import-preview', h('p.muted.small', tr('Wähle links ein Monster, um den Statblock zu sehen.')));
  const existing = new Set(Object.values(sync.state.creatures || {}).map((c) => c.name.toLowerCase()));
  let page = 0;
  let selected = null;
  let reqId = 0;

  const showPreview = (m) => {
    selected = m;
    const c = fromOpen5e(m);
    const kind = h('select', { style: { width: 'auto' } }, h('option', { value: 'monster', selected: m.type !== 'Humanoid' }, tr('als Monster')), h('option', { value: 'npc', selected: m.type === 'Humanoid' }, tr('als NSC')));
    fill(
      preview,
      h(
        'div.row',
        { style: { marginBottom: '8px' } },
        h('strong.grow', germanName(m.name) ? `${germanName(m.name)} (${m.name})` : m.name),
        kind,
        h('button.primary', { onclick: () => done({ ...c, kind: kind.value }, imageOf(m)) }, icon('download'), imageOf(m) ? tr(' Übernehmen (mit Bild)') : tr(' Übernehmen')),
      ),
      renderStatblock(c, { compact: true, portraitUrl: imageOf(m) }),
    );
    for (const el of results.children) el.classList.toggle('selected', el.dataset.slug === m.slug);
  };

  const load = async (append = false) => {
    const my = ++reqId;
    if (!append) page = 0;
    const term = toEnglishQuery(q.value);
    hint.textContent = term && term.toLowerCase() !== q.value.trim().toLowerCase() ? tr('Gesucht wird nach „{term}“', { term }) : '';
    const params = new URLSearchParams({ q: term, source: source.value, type: type.value, crMin: crMin.value, crMax: crMax.value, sort: sort.value, page });
    if (!append) fill(results, h('p.small.muted', tr('Lade …')));
    try {
      const data = await api('GET', `/api/srd/monsters?${params}`);
      if (my !== reqId) return;
      const rows = data.results.map((m) =>
        h(
          'div.list-item.clickable',
          { dataset: { slug: m.slug }, onclick: () => showPreview(m) },
          h(
            'div.title',
            h('strong', m.name),
            germanName(m.name) ? h('span.muted', ` · ${germanName(m.name)}`) : null,
            existing.has(m.name.toLowerCase()) ? h('span.chip', { style: { marginLeft: '6px' } }, tr('in Kartei')) : null,
            imageOf(m) ? h('span', { title: tr('Mit Bild'), style: { marginLeft: '6px' } }, icon('image', { size: 14 })) : null,
            h('div.small.muted', tr('{size} {type} · HG {crLabel} · {hit_points} TP · RK {armor_class}{x}', { size: m.size, type: m.type, crLabel: crLabel(m.cr), hit_points: m.hit_points, armor_class: m.armor_class, x: source.value === 'all' ? ` · ${m.document__title}` : '' })),
          ),
        ),
      );
      if (!append) fill(results);
      results.querySelector('.load-more')?.remove();
      results.append(...rows);
      if (!results.children.length) results.append(h('p.small.muted', tr('Nichts gefunden. Tipp: Filter lockern oder englischen Namen probieren.')));
      if (data.hasMore) {
        results.append(h('button.load-more', { onclick: () => ((page += 1), load(true)) }, tr('Mehr laden ({x} weitere)', { x: data.count - (page + 1) * 30 })));
      }
      if (!append && rows.length && !selected) showPreview(data.results[0]);
    } catch (err) {
      if (my === reqId) fill(results, h('p.small', { style: { color: 'var(--danger)' } }, err.message));
    }
  };
  let timer;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => load(), 300);
  });
  for (const el of [type, crMin, crMax, source, sort]) el.addEventListener('change', () => load());

  const dbPane = h(
    'div',
    h('div.row', q, type, h('span.small.muted', tr('HG')), crMin, h('span.small.muted', tr('bis')), crMax, source, sort),
    hint,
    h('div.import-grid', results, preview),
    h('p.small.muted', tr('Quelle: open5e.com – frei lizenzierte 5e-Inhalte. „Nur offizielles SRD“ zeigt die Monster aus dem Systems Reference Document; Humanoide wie Wache, Bandit oder Magier eignen sich als NSC-Vorlagen.')),
  );

  // --- Statblock einfügen ---
  const ta = h('textarea', { rows: 16, placeholder: tr('Statblock hier einfügen – z.B. auf D&D Beyond den Statblock markieren, kopieren und hier einfügen. Englisch und Deutsch werden erkannt.') });
  const kind = h('select', { style: { width: 'auto' } }, h('option', { value: 'monster' }, tr('als Monster')), h('option', { value: 'npc' }, tr('als NSC')));
  const pastePane = h(
    'div.hidden',
    ta,
    h('div.row.end', { style: { marginTop: '8px' } }, h('span.small.muted.grow', tr('D&D Beyond bietet keine Schnittstelle für automatische Importe – Kopieren & Einfügen funktioniert mit deinen freigeschalteten Inhalten.')), kind, h('button.primary', {
      onclick: () => {
        if (!ta.value.trim()) return ta.focus();
        done(parseStatblock(ta.value, kind.value));
        toast(tr('Importiert – bitte kurz prüfen und ggf. ergänzen.'));
      },
    }, icon('download'), tr(' Übernehmen'))),
  );

  const tabDb = h('button.active', { type: 'button' }, icon('search'), tr(' Monster-Datenbank'));
  const tabPaste = h('button', { type: 'button' }, icon('clipboard'), tr(' Statblock einfügen'));
  const switchTo = (paste) => {
    tabDb.classList.toggle('active', !paste);
    tabPaste.classList.toggle('active', paste);
    dbPane.classList.toggle('hidden', paste);
    pastePane.classList.toggle('hidden', !paste);
    (paste ? ta : q).focus();
  };
  tabDb.addEventListener('click', () => switchTo(false));
  tabPaste.addEventListener('click', () => switchTo(true));

  dlg = bigDialog(tr('Kreatur importieren'), h('div.tabs', { style: { margin: '8px 0', background: 'transparent' } }, tabDb, tabPaste), dbPane, pastePane);
  q.focus();
  load();
}

const shuffle = (arr) => arr.map((x) => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

/**
 * Gewähltes Porträt in die Kampagne laden und der Kreatur zuweisen.
 * choice: { kind: 'lib', p } (Bild aus der Bibliothek) oder { kind: 'svg', svg } (gezeichnet).
 */
async function setPortrait(sync, creatureId, choice, name) {
  if (!choice) return;
  try {
    let file;
    if (choice.kind === 'lib') {
      const blob = await (await fetch(choice.p.url)).blob();
      // Namensnennung im Dateinamen (CC BY): erscheint so auch in der Bilderliste der Kampagne
      file = new File([blob], `${name || choice.p.label} – ${choice.p.credit}.png`, { type: blob.type || 'image/png' });
    } else {
      try {
        file = await svgToPngFile(choice.svg, `${name || 'portrait'}.png`);
      } catch {
        // Manche Browser (ältere Safari) wandeln SVG nicht in PNG um – dann das SVG selbst speichern
        file = new File([choice.svg], `${name || 'portrait'}.svg`, { type: 'image/svg+xml' });
      }
    }
    const [asset] = await uploadFiles(sync.campaignId, [file]);
    if (asset) sync.set(['creatures', creatureId, 'portraitAssetId'], asset.id);
  } catch (err) {
    toast(tr('Porträt nicht gespeichert: {message}', { message: err.message }));
  }
}

/** Zufälliges Porträt für einen NSC: bevorzugt aus der Bibliothek, sonst gezeichnet. */
async function autoPortrait(n) {
  const lib = matchLibrary(await loadLibrary(), n);
  return lib.length ? { kind: 'lib', p: shuffle(lib)[0] } : { kind: 'svg', svg: portraitSvg(portraitSpec(n)) };
}

/**
 * Auswahl-Raster: passende Bilder aus der Bibliothek, dazu gezeichnete Porträts (bei NSCs).
 * reroll(n, creature) – n: NSC-Merkmale (oder null bei Monstern), race: Bibliothek nach Volk filtern ('' = passend, '*' = alle).
 * chosen() liefert die Auswahl ({ kind, … }) oder null („kein Bild“).
 */
function portraitPicker({ drawn = 4, libMax = 10 } = {}) {
  const el = h('div');
  const grid = h('div.npc-faces');
  const credit = h('p.small.muted', { style: { marginTop: '6px' } });
  el.append(grid, credit);
  let entries = [];
  let chosen = 0;
  const render = () => {
    fill(
      grid,
      entries.map((e, i) =>
        h(
          'button.npc-face',
          { type: 'button', class: i === chosen ? 'active' : '', title: e.kind === 'lib' ? `${RACE_LABELS[e.p.race] || e.p.race} – ${e.p.credit}` : tr('Gezeichnetes Porträt'), onclick: () => ((chosen = i), render()) },
          e.kind === 'lib' ? h('img', { src: e.p.url, alt: '', loading: 'lazy' }) : h('span', { innerHTML: e.svg }),
        ),
      ),
      h('button.npc-face.none', { type: 'button', class: chosen === -1 ? 'active' : '', title: tr('Ohne Bild'), onclick: () => ((chosen = -1), render()) }, tr('kein Bild')),
    );
    const lib = entries.find((e) => e.kind === 'lib');
    credit.textContent = lib ? tr('Bilder aus der Bibliothek: „Fantasy Character Portraits vol.1“ von {credit}', { credit: lib.p.credit }) : '';
  };
  return {
    el,
    async reroll(n, creature = null, race = '') {
      const all = await loadLibrary();
      let lib = race === '*' ? all : race ? all.filter((p) => p.race === race) : n ? matchLibrary(all, n) : matchCreature(all, creature);
      lib = race ? lib : shuffle(lib).slice(0, libMax);
      entries = [...lib.map((p) => ({ kind: 'lib', p })), ...(n && !race ? Array.from({ length: drawn }, () => ({ kind: 'svg', svg: portraitSvg(portraitSpec(n)) })) : [])];
      if (chosen >= entries.length || chosen === -1) chosen = entries.length ? 0 : -1;
      render();
    },
    chosen: () => (chosen >= 0 ? entries[chosen] || null : null),
  };
}

/** NSC-Merkmale (Volk, Geschlecht, Alter, Rolle) aus einer Kreatur der Kartei zurücklesen. */
function npcTraits(c) {
  // NSCs aus dem Generator in beiden Sprachen erkennen („Humanoid (Zwerg)“ / „Humanoid (Dwarf)“, Geschlecht/Gender …)
  const type = String(c.type || '');
  const bg = String(c.background || '');
  const people = Object.entries(PEOPLE_LABELS_ALL).find(([, labels]) => labels.some((l) => type.includes(l)))?.[0] || 'human';
  const g = (bg.match(/\*\*(?:Geschlecht|Gender):\*\*\s*(\S+)/)?.[1] || '').toLowerCase();
  const age = bg.match(/\*\*(?:Alter|Age):\*\*\s*([^\n·]+)/)?.[1]?.trim() || '';
  return { people, gender: g.startsWith('weib') || g.startsWith('female') ? 'w' : g.startsWith('div') ? 'd' : 'm', age, template: templateForRole(c.role) };
}

/** Dialog: Porträt für eine Kreatur wählen – Bibliothek (passend oder nach Volk) und bei NSCs gezeichnete. */
function openPortraitDialog(sync, c) {
  const isNpc = c.kind === 'npc';
  const traits = isNpc ? npcTraits(c) : null;
  const picker = portraitPicker({ drawn: 6 });
  const raceSel = h(
    'select',
    { style: { width: 'auto' } },
    h('option', { value: '' }, isNpc ? tr('Passend zum NSC') : tr('Passend zur Kreatur')),
    h('option', { value: '*' }, tr('Ganze Bibliothek')),
    ...Object.entries(RACE_LABELS).map(([k, l]) => h('option', { value: k }, l)),
  );
  const reroll = () => picker.reroll(traits, c, raceSel.value);
  raceSel.addEventListener('change', reroll);
  reroll();
  const dlg = bigDialog(
    tr('Porträt für {name}', { name: c.name }),
    isNpc ? h('p.small.muted', `${PEOPLES[traits.people]}, ${GENDERS[traits.gender]}${traits.age ? `, ${traits.age}` : ''}${c.role ? `, ${c.role}` : ''}`) : null,
    h('div.row', { style: { margin: '6px 0' } }, raceSel, h('button', { onclick: reroll }, icon('d20'), tr(' Andere'))),
    picker.el,
    h(
      'div.row',
      { style: { marginTop: '10px' } },
      h('span.grow'),
      h('button.primary', {
        onclick: async (e) => {
          const choice = picker.chosen();
          if (!choice) return dlg.close();
          e.currentTarget.disabled = true;
          await setPortrait(sync, c.id, choice, c.name);
          dlg.close();
        },
      }, icon('check'), tr(' Übernehmen')),
    ),
  );
}

/** Erstellt einen NSC aus Generator-Daten, inkl. Werte-Vorlage aus dem SRD (falls erreichbar). */
async function createNpcFromGenerated(sync, n, template, portrait = null) {
  let base = newCreature('npc');
  let source = 'NSC-Generator'; // i18n-ignore – Datenwert (Quelle der Kreatur)
  if (template) {
    try {
      const m = await api('GET', `/api/srd/monster/${encodeURIComponent(template)}`);
      base = { ...fromOpen5e(m), background: '' };
      source = tr('NSC-Generator · Werte: {x} (SRD)', { x: STAT_TEMPLATES[template] || m.name });
    } catch {
      toast(tr('Werte-Vorlage nicht erreichbar – NSC ohne Spielwerte angelegt.'));
    }
  }
  const id = createCreature(sync, {
    ...base,
    kind: 'npc',
    name: npcName(n),
    type: `Humanoid (${PEOPLES[n.people] || n.people})`,
    size: n.people === 'halfling' || n.people === 'gnome' ? 'Small' : 'Medium', // i18n-ignore – Datenwert, keine Anzeige
    role: n.role,
    location: n.location || '',
    background: npcBackground(n),
    source,
  });
  if (portrait) await setPortrait(sync, id, portrait, npcName(n));
  return id;
}

/** Spontan-NSC: würfeln und sofort in der Kartei anlegen. */
export async function quickNpc(sync) {
  const n = generateNpc();
  const id = await createNpcFromGenerated(sync, n, n.template, await autoPortrait(n));
  toast(`${npcName(n)} – ${n.role}`);
  return id;
}

/** Generator-Dialog: würfeln, einzelne Felder neu würfeln oder anpassen, übernehmen. */
export function openNpcGenerator(sync, onCreated) {
  const peopleSel = h('select', h('option', { value: '' }, tr('Volk: zufällig')), ...Object.entries(PEOPLES).map(([v, l]) => h('option', { value: v }, l)));
  const genderSel = h('select', h('option', { value: '' }, tr('Geschlecht: zufällig')), ...Object.entries(GENDERS).map(([v, l]) => h('option', { value: v }, l)));
  const roleSel = h('select', h('option', { value: '' }, tr('Beruf: zufällig')), ...ROLES.map(([r]) => h('option', { value: r }, r)));
  const templateSel = h('select', h('option', { value: '' }, tr('ohne Spielwerte')), ...Object.entries(STAT_TEMPLATES).map(([v, l]) => h('option', { value: v }, l)));
  const fields = h('div.npc-fields');
  const faces = portraitPicker({ drawn: 4, libMax: 8 });
  let n = null;
  let faceKey = '';
  // Neue Gesichter nur, wenn sich Volk, Geschlecht, Alter oder Rolle ändern
  const refreshFaces = (force = false) => {
    const key = [n.people, n.gender, n.age, n.role].join('|');
    if (force || key !== faceKey) faces.reroll({ ...n, template: templateForRole(n.role) });
    faceKey = key;
  };

  const render = () => {
    templateSel.value = n.template || '';
    refreshFaces();
    fill(
      fields,
      Object.entries(FIELD_LABELS).map(([key, label]) => {
        let input;
        if (key === 'people') {
          input = h('select', ...Object.entries(PEOPLES).map(([v, l]) => h('option', { value: v, selected: v === n.people }, l)));
        } else if (key === 'gender') {
          input = h('select', ...Object.entries(GENDERS).map(([v, l]) => h('option', { value: v, selected: v === n.gender }, l)));
        } else {
          input = h('input', { value: n[key] || '' });
        }
        input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
          n[key] = input.value;
          if (key === 'role') n.template = templateForRole(n.role);
          if (key === 'people' || key === 'gender') {
            n.firstName = ROLLERS.firstName(n, Math.random);
            n.lastName = ROLLERS.lastName(n, Math.random);
            render();
          }
          if (key === 'age' || key === 'role') refreshFaces();
        });
        return [
          h('label', label),
          input,
          h('button.small', {
            title: tr('{label} neu würfeln', { label }),
            onclick: () => {
              n[key] = ROLLERS[key](n, Math.random);
              if (key === 'role') n.template = templateForRole(n.role);
              if (key === 'people' || key === 'gender') {
                n.firstName = ROLLERS.firstName(n, Math.random);
                n.lastName = ROLLERS.lastName(n, Math.random);
              }
              render();
            },
          }, icon('d20')),
        ];
      }),
    );
  };
  const roll = () => {
    n = generateNpc({ people: peopleSel.value || undefined, gender: genderSel.value || undefined, role: roleSel.value || undefined });
    render();
  };
  for (const el of [peopleSel, genderSel, roleSel]) el.addEventListener('change', roll);
  templateSel.addEventListener('change', () => (n.template = templateSel.value));

  const dlg = bigDialog(
    tr('NSC-Generator'),
    h('div.row', { style: { margin: '8px 0' } }, peopleSel, genderSel, roleSel, h('button.primary', { onclick: roll }, icon('d20'), tr(' Neu würfeln'))),
    fields,
    h('div.row', { style: { marginTop: '12px' } }, h('strong.grow', tr('Porträt')), h('button.small', { onclick: () => refreshFaces(true) }, icon('d20'), tr(' Andere Gesichter'))),
    faces.el,
    h(
      'div.row',
      { style: { marginTop: '12px' } },
      h('span.small.muted', tr('Spielwerte')),
      h('div.grow', templateSel),
      h('button.primary', {
        onclick: async (e) => {
          e.currentTarget.disabled = true;
          const id = await createNpcFromGenerated(sync, n, templateSel.value, faces.chosen());
          dlg.close();
          onCreated?.(id);
        },
      }, icon('check'), tr(' In die Kartei übernehmen')),
    ),
    h('p.small.muted', tr('Die Spielwerte stammen aus den SRD-Vorlagen (Open5e) und passen sich dem Beruf an – du kannst sie oben frei wählen.')),
  );
  roll();
}

/**
 * @param {{ sync: any, cid: string, go: (r: string) => void, placeCreature?: (c: object) => void }} ctx
 */
export function createCreaturesView({ sync, cid, go, placeCreature }) {
  const S = () => sync.state;
  let filter = 'all';
  const editing = new Set();

  return function view(selectedId) {
    // Encounter-Planer: #creatures/encounters (Übersicht) bzw. #creatures/encounter:<id>
    const encMode = selectedId === 'encounters' || String(selectedId || '').startsWith(ENC_PREFIX);
    if (encMode) filter = 'enc';
    else if (filter === 'enc' && selectedId) filter = 'all';
    const encId = String(selectedId || '').startsWith(ENC_PREFIX) ? selectedId.slice(ENC_PREFIX.length) : null;
    const search = h('input', { type: 'search', placeholder: tr('Suchen …') });
    const listBox = h('div.list');
    const detail = h('section');

    const add = (kind) => {
      const id = uid();
      sync.set(['creatures', id], { ...newCreature(kind), id });
      editing.add(id);
      go(`creatures/${id}`);
    };

    const renderList = () => {
      const q = search.value.trim().toLowerCase();
      if (filter === 'enc') {
        const encs = sortBy(Object.values(S().encounters || {}), (e) => -(e.createdAt || 0)).filter((e) => inScope(e) && (!q || e.name.toLowerCase().includes(q)));
        return fill(
          listBox,
          h('button.primary', { style: { width: '100%', marginBottom: '6px' }, onclick: () => go(`creatures/${ENC_PREFIX}${newEncounter(sync)}`) }, icon('plus'), tr(' Neuer Encounter')),
          ai.text ? h('button', { style: { width: '100%', marginBottom: '6px' }, title: tr('Begegnung von der KI entwerfen lassen – passend zur Stufe der Gruppe'), onclick: () => openRandomEncounter(sync, (id) => go(`creatures/${ENC_PREFIX}${id}`)) }, icon('d20'), tr(' Zufallsbegegnung')) : null,
          encs.length
            ? encs.map((e) => {
                const r = evaluateEncounter(S(), e);
                return h(
                  'div.list-item.clickable',
                  { class: e.id === encId ? 'selected' : '', onclick: () => go(`creatures/${ENC_PREFIX}${e.id}`) },
                  icon('swords', { size: 24 }),
                  h('span.title', e.name, h('div.small.muted', tr('{count} Gegner · {xp} EP', { count: r.count, xp: r.xp }))),
                  difficultyChip(S(), e),
                );
              })
            : h('p.small.muted', tr('Noch keine Encounter. Stelle Gegner aus der Kartei zusammen – die Schwierigkeit für deine Gruppe wird automatisch berechnet.')),
        );
      }
      const all = sortBy(Object.values(S().creatures || {}).filter(inScope), (c) => c.name.toLowerCase());
      const list = all.filter((c) => (filter === 'all' || c.kind === filter) && (!q || `${c.name} ${c.type} ${c.role} ${c.location}`.toLowerCase().includes(q)));
      const from = addFromCampaign(sync, 'creatures', { label: tr('+ Kreatur aus der Kampagne hinzufügen …'), onAdded: (id) => go(`creatures/${id}`) });
      fill(
        listBox,
        from ? h('div', { style: { marginBottom: '8px' } }, from) : null,
        list.length
          ? list.map((c) =>
              h(
                'div.list-item.clickable',
                { class: c.id === selectedId ? 'selected' : '', onclick: () => go(`creatures/${c.id}`) },
                c.portraitAssetId && S().assets[c.portraitAssetId]
                  ? h('img', { src: fileUrl(cid, S().assets[c.portraitAssetId]), style: { width: '32px', height: '32px', objectFit: 'cover', borderRadius: '50%' } })
                  : icon(c.kind === 'npc' ? 'user' : 'skull', { size: 24 }),
                h('span.title', c.name, h('div.small.muted', c.kind === 'npc' ? c.role || tr('NSC') : tr('HG {x} · {x2}', { x: c.cr || '–', x2: c.type || tr('Monster') }))),
              ),
            )
          : h('p.small.muted', all.length ? tr('Keine Treffer.') : tr('Noch keine Kreaturen. Lege oben NSCs oder Monster an oder importiere einen Statblock.')),
      );
    };
    search.addEventListener('input', renderList);

    const filterBar = h(
      'div.row',
      { style: { margin: '8px 0' } },
      ...Object.entries({ all: tr('Alle'), npc: tr('NSCs'), monster: tr('Monster'), enc: tr('Encounter') }).map(([k, l]) =>
        h('button.small', {
          class: filter === k ? 'active' : '',
          onclick: (e) => {
            const wasEnc = filter === 'enc';
            filter = k;
            for (const b of e.currentTarget.parentElement.children) b.classList.toggle('active', b === e.currentTarget);
            if (k === 'enc' && !encMode) return go('creatures/encounters');
            if (wasEnc && k !== 'enc' && encMode) return go('creatures');
            renderList();
          },
        }, k === 'enc' ? [icon('swords'), ` ${l}`] : l),
      ),
    );

    let detailRefresh = null;
    let encView = null;
    const renderDetail = () => {
      if (encId) {
        encView = encounterDetail({ sync, go }, encId);
        detailRefresh = null;
        return fill(detail, encView.el);
      }
      if (selectedId === 'encounters') {
        detailRefresh = null;
        const party = S().party?.members || [];
        return fill(
          detail,
          h(
            'div.muted',
            { style: { padding: '30px', maxWidth: '640px' } },
            h('h2', icon('swords'), tr(' Encounter-Planer')),
            h('p', tr('Stelle Gegner aus deiner Kartei zusammen. Die Schwierigkeit wird nach den Regeln des Spielleiterhandbuchs berechnet: EP der Gegner, mal einem Multiplikator für ihre Anzahl, verglichen mit den EP-Schwellen deiner Gruppe.')),
            h('p', party.length ? tr('Gruppe: {join}', { join: party.map((m) => `${m.name || '?'} (${m.level || 1})`).join(', ') }) : tr('Deine Gruppe (Namen und Stufen) trägst du im ersten Encounter ein – sie gilt dann für alle.')),
            h('button.primary', { onclick: () => go(`creatures/${ENC_PREFIX}${newEncounter(sync)}`) }, icon('plus'), tr(' Neuer Encounter')),
            ai.text ? h('button', { style: { marginLeft: '6px' }, onclick: () => openRandomEncounter(sync, (id) => go(`creatures/${ENC_PREFIX}${id}`)) }, icon('d20'), tr(' Zufallsbegegnung')) : null,
          ),
        );
      }
      const c = S().creatures?.[selectedId];
      if (!c) {
        detailRefresh = null;
        return fill(
          detail,
          h(
            'div.muted',
            { style: { padding: '30px', maxWidth: '640px' } },
            h('h2', icon('skull'), tr(' NSCs & Monster')),
            h('p', tr('Hier sammelst du alle Kreaturen der Kampagne mit Werten, Aktionen und Hintergrund.')),
            h('p', tr('Beim Spielen findest du sie im Tab „Kreaturen“ neben der Karte: von dort setzt du sie als Token auf die Karte oder nimmst sie in die Initiative.')),
          ),
        );
      }
      const isEdit = editing.has(c.id);
      const portrait = c.portraitAssetId && S().assets[c.portraitAssetId] ? fileUrl(cid, S().assets[c.portraitAssetId]) : '';
      const actions = h(
        'div.row',
        { style: { marginBottom: '12px' } },
        h('h2.grow', { style: { margin: 0 } }, c.name, ' ', h('span.chip', KIND[c.kind] || '')),
        h('button', { class: isEdit ? 'primary' : '', onclick: () => (isEdit ? editing.delete(c.id) : editing.add(c.id), renderDetail()) }, isEdit ? [icon('check'), tr(' Fertig')] : [icon('edit'), tr(' Bearbeiten')]),
        placeCreature ? h('button', { onclick: () => placeCreature(c) }, icon('token'), tr(' Auf Karte setzen')) : null,
        h('button', { onclick: () => addCreatureToInitiative(sync, c) }, icon('swords'), tr(' Initiative')),
        portrait ? h('button', { onclick: () => (sync.merge(['display', 'player'], { mode: 'image', assetId: c.portraitAssetId, caption: c.name }), toast(tr('Porträt auf dem Spieler-Display'))) }, icon('image'), tr(' Spielern zeigen')) : null,
        h('button', {
          title: tr('Kopie anlegen'),
          onclick: () => {
            const id = uid();
            sync.set(['creatures', id], { ...structuredClone(c), id, name: `${c.name} (Kopie)`, createdAt: Date.now() });
            go(`creatures/${id}`);
          },
        }, icon('copy')),
        h('button.danger', {
          onclick: () => {
            if (!confirm(tr('„{name}“ löschen?', { name: c.name }))) return;
            sync.del(['creatures', c.id]);
            go('creatures');
          },
        }, tr('Löschen')),
      );
      if (!isEdit) {
        detailRefresh = null;
        const images = figureImages(sync, cid, [[tr('Porträt'), c.portraitAssetId], [tr('Token'), c.tokenAssetId]], c.name);
        return fill(detail, h('div', { style: { maxWidth: '760px' } }, actions, adventureChips(sync, 'creatures', c.id), images, renderStatblock(c, { portraitUrl: images ? '' : portrait }), c.source ? h('p.small.muted', tr('Quelle: {source}', { source: c.source })) : null));
      }

      // Bearbeitungsformular
      const P = (...k) => ['creatures', c.id, ...k];
      const C = () => S().creatures?.[c.id] || {};
      const refreshers = [];
      const inp = (key, attrs = {}, parse = (v) => v) => {
        const el = h(attrs.rows ? 'textarea' : 'input', attrs);
        refreshers.push(bindInput(el, () => C()[key], (v) => sync.set(P(key), parse(v)), { debounceMs: 250 }));
        return el;
      };
      const sel = (key, options) => {
        const el = h('select', ...Object.entries(options).map(([v, l]) => h('option', { value: v }, l)));
        refreshers.push(bindInput(el, () => C()[key], (v) => sync.set(P(key), v), { debounceMs: 0, event: 'change' }));
        return el;
      };
      const f = (label, el) => h('div', h('label', label), el);
      const md = (key, label, rows, placeholder) => f(label, inp(key, { rows, placeholder }));
      const abilityInputs = ABILITIES.map(([k, en, de]) => {
        const el = h('input', { type: 'number', min: 1, max: 30, style: { textAlign: 'center' } });
        refreshers.push(bindInput(el, () => C().abilities?.[k], (v) => sync.set(P('abilities', k), Number(v) || 10), { debounceMs: 250 }));
        return h('div', h('label', { style: { textAlign: 'center' } }, `${de} / ${en}`), el);
      });
      const portraitSel = h('select', h('option', { value: '' }, tr('– kein Porträt –')), ...byOrder(S().assets).filter((a) => a.kind === 'image').map((a) => h('option', { value: a.id }, a.name)));
      refreshers.push(bindInput(portraitSel, () => C().portraitAssetId || '', (v) => sync.set(P('portraitAssetId'), v || null), { debounceMs: 0, event: 'change' }));
      const upload = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
      upload.addEventListener('change', async () => {
        const [a] = await uploadFiles(cid, [...upload.files]);
        if (a) sync.set(P('portraitAssetId'), a.id);
        renderDetail();
      });
      // Eigenes rundes Token für die Karte (z.B. von der KI); ohne nimmt die Karte das Porträt
      const tokenSel = h('select', h('option', { value: '' }, tr('– wie das Porträt –')), ...byOrder(S().assets).filter((a) => a.kind === 'image').map((a) => h('option', { value: a.id }, a.name)));
      refreshers.push(bindInput(tokenSel, () => C().tokenAssetId || '', (v) => sync.set(P('tokenAssetId'), v || null), { debounceMs: 0, event: 'change' }));
      const isNpc = c.kind === 'npc';
      detailRefresh = () => refreshers.forEach((r) => r());
      fill(
        detail,
        h(
          'div',
          { style: { maxWidth: '900px' } },
          actions,
          adventureChips(sync, 'creatures', c.id),
          h('div.grid3', f(tr('Art'), sel('kind', KIND)), f(tr('Name'), inp('name')), f(tr('Größe'), sel('size', Object.fromEntries(Object.keys(SIZES).map((s) => [s, s]))))),
          h('div.grid3', f(tr('Typ'), inp('type', { placeholder: tr('z.B. Humanoid (Elf)') })), f(tr('Gesinnung'), inp('alignment')), f(tr('Herausforderung (HG)'), inp('cr', { placeholder: 'z.B. 1/4' }))),
          isNpc ? h('div.grid2', f(tr('Rolle / Beruf'), inp('role', { placeholder: tr('z.B. Wirt der Blauen Sau') })), f(tr('Ort'), inp('location', { placeholder: tr('z.B. Barovia, Taverne') }))) : null,
          h('div.grid3', f(tr('Rüstungsklasse'), inp('ac', { placeholder: tr('z.B. 15 (Lederrüstung)') })), f(tr('Trefferpunkte'), inp('hp', { type: 'number', min: 1 }, (v) => Number(v) || 1)), f(tr('TP-Formel'), inp('hpFormula', { placeholder: 'z.B. 2d6' }))),
          f(tr('Bewegungsrate'), inp('speed')),
          h('div.section-title', tr('Attribute')),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' } }, abilityInputs),
          h('div.section-title', tr('Details')),
          h('div.grid2', f(tr('Rettungswürfe'), inp('saves')), f(tr('Fertigkeiten'), inp('skills'))),
          h('div.grid2', f(tr('Resistenzen'), inp('resistances')), f(tr('Immunitäten'), inp('immunities'))),
          h('div.grid2', f(tr('Anfälligkeiten'), inp('vulnerabilities')), f(tr('Zustandsimmunitäten'), inp('conditionImmunities'))),
          h('div.grid2', f(tr('Sinne'), inp('senses')), f(tr('Sprachen'), inp('languages'))),
          h('div.section-title', tr('Fähigkeiten')),
          h('p.small.muted', tr('Format: **Name.** Beschreibung – jede Fähigkeit als eigener Absatz.')),
          md('traits', tr('Merkmale'), 4),
          md('actions', tr('Aktionen'), 6),
          md('bonusActions', tr('Bonusaktionen'), 2),
          md('reactions', tr('Reaktionen'), 2),
          md('legendary', tr('Legendäre Aktionen'), 3),
          h(
            'div.row',
            h('div.section-title.grow', tr('Hintergrund')),
            aiTextButton(() => ({
              title: tr('{name} mit KI ausarbeiten', { name: C().name }),
              about: creatureAbout(C()),
              current: () => C().background,
              apply: (text, mode) => sync.set(P('background'), mergeText(C().background, text, mode)),
              tasks: isNpc ? ['npc', 'expand', 'ideas', 'summary'] : ['expand', 'ideas', 'summary'],
            })),
          ),
          md('background', isNpc ? tr('Persönlichkeit, Aussehen, Ziele, Geheimnisse') : tr('Hintergrund, Taktik, Notizen'), 6),
          h('div.section-title', tr('Porträt / Token-Bild')),
          figureImages(sync, cid, [[tr('Porträt'), C().portraitAssetId], [tr('Token'), C().tokenAssetId]], C().name),
          h('div.row', { style: { marginBottom: '6px' } }, h('span.small.muted', tr('Token auf der Karte:')), h('div.grow', tokenSel)),
          h('div.row', h('div.grow', portraitSel), upload, h('button', { onclick: () => upload.click() }, icon('upload'), tr(' Bild hochladen')), h('button', { onclick: () => openPortraitDialog(sync, C()), title: tr('Porträt aus der Bibliothek wählen oder (bei NSCs) zeichnen lassen') }, icon('user'), tr(' Porträt wählen')),
            aiImageButton(() => ({ sync, cid, purpose: 'token', prompt: creaturePrompt(C()), name: C().name, sourceAssetId: C().portraitAssetId, onDone: (a) => (sync.set(P('portraitAssetId'), a.id), renderDetail()) })),
          ),
        ),
      );
    };

    const el = h(
      'div.split',
      h(
        'aside',
        h('div.row', h('button.primary.grow', { onclick: () => add('npc') }, icon('plus'), tr(' NSC')), h('button.primary.grow', { onclick: () => add('monster') }, icon('plus'), tr(' Monster'))),
        h('button', { style: { width: '100%', marginTop: '6px' }, onclick: () => openImportDialog(sync, (id) => go(`creatures/${id}`)) }, icon('download'), tr(' Monster importieren')),
        h('button', { style: { width: '100%', marginTop: '6px' }, onclick: () => openNpcGenerator(sync, (id) => go(`creatures/${id}`)) }, icon('d20'), tr(' NSC-Generator')),
        ai.text ? h('button', { style: { width: '100%', marginTop: '6px' }, title: tr('NSC oder Monster aus einer Beschreibung – mit Werten, Porträt und Token'), onclick: () => openAiCreator(sync, { mode: 'npc', onCreated: (id) => go(`creatures/${id}`) }) }, icon('sparkles'), tr(' Mit KI erstellen')) : null,
        h('div', { style: { marginTop: '10px' } }, search),
        filterBar,
        listBox,
      ),
      detail,
    );
    renderList();
    renderDetail();
    return {
      el,
      refresh(changed) {
        if (filter === 'enc' || encMode) {
          if (['encounters', 'party', 'creatures', '*'].some((k) => changed.has(k))) renderList();
          if (encId && !S().encounters?.[encId]) return go('creatures/encounters');
          return encView?.refresh(changed);
        }
        if (!(changed.has('creatures') || changed.has('assets') || changed.has('*'))) return;
        renderList();
        if (selectedId && !S().creatures?.[selectedId]) return go('creatures');
        if (detailRefresh) detailRefresh();
        else renderDetail();
      },
    };
  };
}
