// Beispielkampagne zum Ausprobieren: wird beim ersten Start mit leerem Datenordner angelegt (DEMO_CAMPAIGN=0 schaltet
// das ab, DEMO_CAMPAIGN=en legt sie auf Englisch an). Enthält eine Gruppe, ein Abenteuer mit einer vorbereiteten
// Session (Szenen mit Karte, Begegnung, NSCs und Vorlesetext), Kreaturen mit SRD-5.1-Werten (CC-BY-4.0), Lore und eine
// selbst gezeichnete Karte. Porträts stammen aus der mitgelieferten Bibliothek (orchidrabbit, CC BY 4.0).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORTRAITS = path.join(HERE, '../../public/portraits/orchidrabbit');
const CREDIT = 'orchidrabbit (remy ripple), CC BY 4.0';

const TEXT = {
  de: {
    name: 'Beispiel: Das Flüstern im Nebelmoor',
    description: 'Eine kleine Beispielkampagne zum Ausprobieren – löschen, sobald du deine eigene anlegst.',
    adventure: 'Der vergiftete Brunnen',
    adventureNotes: 'Im Dorf Nebelmoor ist der Brunnen vergiftet. Hinter der Sache steckt ein kleiner Kult, der im Moor eine alte Macht wecken will. Die Gruppe soll herausfinden, wer dahintersteckt.',
    session: 'Session 1 – Ankunft in Nebelmoor',
    map: 'Dorfplatz von Nebelmoor',
    mapNotes: '**Brunnen:** schwarzes, öliges Wasser (SG 12 Medizin: Gift aus Moorkraut).\n\n**Marktstand:** Händlerin Hilde verkauft Kräuter – und weiß mehr, als sie sagt.',
    lore: ['Das Nebelmoor', 'Ort', 'Ein weites, nebliges Moor östlich des Dorfes. Die Alten erzählen von einem versunkenen Tempel und Lichtern, die Reisende in die Irre führen.'],
    party: [['Lyra Morgentau', 'Elfe', 'Waldläuferin', 'elf-3.png', 26, 15, 14], ['Brom Eisenfaust', 'Zwerg', 'Kleriker', 'dwarf-2.png', 27, 18, 13], ['Kael Schattenweg', 'Mensch', 'Schurke', 'human-4.png', 21, 14, 15]],
    npc: ['Hilde Grünwald', 'Kräuterhändlerin', 'Humanoid (Mensch)', 'human-9.png', '**Aussehen:** wettergegerbtes Gesicht, Kräuterbündel am Gürtel\n\n**Persönlichkeit:** freundlich, aber vorsichtig\n\n**Geheimnis:** hat gesehen, wer nachts am Brunnen war – fürchtet sich aber vor dem Kult.'],
    encounter: 'Hinterhalt am Moorpfad',
    scenes: [
      ['Ankunft auf dem Dorfplatz', 'Nebel hängt über dem Dorfplatz von Nebelmoor. Am Brunnen stehen ein paar Dörfler und starren in das dunkle Wasser. Niemand scheint euch zu bemerken – bis eine Frau mit einem Korb voller Kräuter auf euch zukommt.', 'Hilde erzählt vom vergifteten Brunnen. Wer das Wasser untersucht (SG 12 Medizin), erkennt Moorkraut-Gift.', true, false],
      ['Hinterhalt am Moorpfad', 'Der Pfad ins Moor wird schmaler. Plötzlich raschelt es im Schilf – kleine, grinsende Gestalten springen hervor, ein knurrender Wolf an ihrer Seite!', 'Die Goblins wurden vom Kult angeheuert. Einer trägt ein Amulett mit Spinnensymbol (Hinweis auf den Kult).', false, true],
      ['Die Lichter im Moor', 'Zwischen den Nebelschwaden flackern blasse Lichter. Sie scheinen euch zu rufen …', 'Offenes Ende: Folgen die Spieler den Lichtern, führen sie zum versunkenen Tempel (nächste Session).', false, false],
    ],
  },
  en: {
    name: 'Example: Whispers in the Mistmoor',
    description: 'A small example campaign to try things out – delete it once you create your own.',
    adventure: 'The Poisoned Well',
    adventureNotes: 'The well in the village of Mistmoor has been poisoned. Behind it is a small cult that wants to awaken an old power in the moor. The party is to find out who is behind it.',
    session: 'Session 1 – Arriving in Mistmoor',
    map: 'Mistmoor village square',
    mapNotes: '**Well:** black, oily water (DC 12 Medicine: poison made from moor herbs).\n\n**Market stall:** Hilde the herbalist sells herbs – and knows more than she says.',
    lore: ['The Mistmoor', 'Place', 'A wide, misty moor east of the village. The elders tell of a sunken temple and of lights that lead travellers astray.'],
    party: [['Lyra Morningdew', 'Elf', 'Ranger', 'elf-3.png', 26, 15, 14], ['Brom Ironfist', 'Dwarf', 'Cleric', 'dwarf-2.png', 27, 18, 13], ['Kael Shadowway', 'Human', 'Rogue', 'human-4.png', 21, 14, 15]],
    npc: ['Hilde Greenwood', 'Herbalist', 'Humanoid (Human)', 'human-9.png', '**Appearance:** weather-beaten face, bundles of herbs on her belt\n\n**Personality:** friendly but careful\n\n**Secret:** saw who was at the well at night – but fears the cult.'],
    encounter: 'Ambush on the moor path',
    scenes: [
      ['Arrival on the village square', 'Mist hangs over the village square of Mistmoor. A few villagers stand at the well, staring into the dark water. No one seems to notice you – until a woman with a basket full of herbs walks up to you.', 'Hilde tells of the poisoned well. Examining the water (DC 12 Medicine) reveals moor-herb poison.', true, false],
      ['Ambush on the moor path', 'The path into the moor narrows. Suddenly the reeds rustle – small, grinning figures leap out, a snarling wolf at their side!', 'The goblins were hired by the cult. One wears an amulet with a spider symbol (a clue to the cult).', false, true],
      ['The lights in the moor', 'Pale lights flicker between the wisps of mist. They seem to be calling you …', 'Open ending: if the players follow the lights, they lead to the sunken temple (next session).', false, false],
    ],
  },
};

// SRD-5.1-Grundwerte (CC-BY-4.0)
const GOBLIN = { kind: 'monster', name: 'Goblin', type: 'Humanoid (goblinoid)', size: 'Small', alignment: 'neutral evil', ac: '15 (leather armor, shield)', hp: 7, hpFormula: '2d6', speed: '30 ft.', abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, skills: 'Stealth +6', senses: 'darkvision 60 ft., passive Perception 9', languages: 'Common, Goblin', cr: '1/4', traits: '**Nimble Escape.** The goblin can take the Disengage or Hide action as a bonus action on each of its turns.', actions: '**Scimitar.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) slashing damage.\n\n**Shortbow.** *Ranged Weapon Attack:* +4 to hit, range 80/320 ft., one target. *Hit:* 5 (1d6 + 2) piercing damage.', source: 'SRD 5.1 (CC-BY-4.0)' };
const WOLF = { kind: 'monster', name: 'Wolf', type: 'Beast', size: 'Medium', alignment: 'unaligned', ac: '13 (natural armor)', hp: 11, hpFormula: '2d8 + 2', speed: '40 ft.', abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 }, skills: 'Perception +3, Stealth +4', senses: 'passive Perception 13', languages: '', cr: '1/4', traits: '**Keen Hearing and Smell.** The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.\n\n**Pack Tactics.** The wolf has advantage on an attack roll against a creature if at least one of the wolf\'s allies is within 5 feet of the creature and the ally isn\'t incapacitated.', actions: '**Bite.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 7 (2d4 + 2) piercing damage. If the target is a creature, it must succeed on a DC 11 Strength saving throw or be knocked prone.', source: 'SRD 5.1 (CC-BY-4.0)' };
const COMMONER = { ac: '10', hp: 4, hpFormula: '1d8', speed: '30 ft.', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, senses: 'passive Perception 10', languages: 'Common', cr: '0', actions: '**Club.** *Melee Weapon Attack:* +2 to hit, reach 5 ft., one target. *Hit:* 2 (1d4) bludgeoning damage.' };

/** Legt die Beispielkampagne an (einmalig je Datenordner) und liefert ihre ID oder null. */
export function createDemoCampaign(store, setting = process.env.DEMO_CAMPAIGN) {
  if (setting === '0' || setting === 'false') return null;
  const marker = path.join(store.DATA_DIR, '.demo-created');
  if (fs.existsSync(marker) || store.listCampaigns().length) return null;
  const t = TEXT[setting === 'en' ? 'en' : 'de'];
  const st = store.createCampaign(t.name);
  const now = Date.now();
  const id = store.newId;
  const dir = store.uploadsDir(st.id);
  fs.mkdirSync(dir, { recursive: true });
  const ops = [];
  const adv = id();
  /** Datei in die Kampagne kopieren und als Asset eintragen. */
  const asset = (src, name, extra = {}) => {
    const aid = id();
    const file = `${aid}${path.extname(src)}`;
    fs.copyFileSync(src, path.join(dir, file));
    const a = { id: aid, name, file, mime: 'image/png', size: fs.statSync(src).size, kind: 'image', createdAt: now, adventureIds: [adv], ...extra };
    ops.push({ t: 'set', p: ['assets', aid], v: a });
    return aid;
  };
  const portrait = (file, name) => asset(path.join(PORTRAITS, file), `${name} – ${CREDIT}`);

  ops.push({ t: 'set', p: ['description'], v: t.description });
  ops.push({ t: 'set', p: ['adventures', adv], v: { id: adv, name: t.adventure, order: now, notes: t.adventureNotes } });

  // Gruppe
  const party = t.party.map(([name, race, cls, img, hp, ac, passive]) => ({ id: id(), name, race, class: cls, level: 3, hp, ac, passive, portraitAssetId: portrait(img, name) }));
  ops.push({ t: 'set', p: ['party'], v: { members: party } });

  // Karte
  const mapAsset = asset(path.join(HERE, 'dorfplatz.png'), t.map);
  const map = id();
  ops.push({ t: 'set', p: ['maps', map], v: { id: map, name: t.map, kind: 'battle', assetId: mapAsset, createdAt: now, width: 1400, height: 980, grid: { size: 70, offsetX: 0, offsetY: 0, feet: 5, show: true, color: '#000000', opacity: 0.35 }, fog: { enabled: false, ops: [] }, lighting: { enabled: false, ambient: 0.15 }, tokens: {}, lights: {}, aoes: {}, drawings: {}, notes: t.mapNotes, adventureIds: [adv] } });

  // Kreaturen und Begegnung
  const creature = (c) => {
    const cid = id();
    ops.push({ t: 'set', p: ['creatures', cid], v: { role: '', location: '', saves: '', vulnerabilities: '', resistances: '', immunities: '', conditionImmunities: '', bonusActions: '', reactions: '', legendary: '', background: '', traits: '', skills: '', portraitAssetId: null, ...c, id: cid, createdAt: now, adventureIds: [adv] } });
    return cid;
  };
  const goblin = creature({ ...GOBLIN, portraitAssetId: portrait('goblin-2.png', 'Goblin') });
  const wolf = creature(WOLF);
  const [npcName, npcRole, npcType, npcImg, npcBg] = t.npc;
  const hilde = creature({ ...COMMONER, kind: 'npc', name: npcName, role: npcRole, type: npcType, size: 'Medium', alignment: '', background: npcBg, source: '', portraitAssetId: portrait(npcImg, npcName) });
  const enc = id();
  ops.push({ t: 'set', p: ['encounters', enc], v: { id: enc, name: t.encounter, notes: '', items: [{ creatureId: goblin, count: 3 }, { creatureId: wolf, count: 1 }], createdAt: now, adventureIds: [adv] } });

  // Lore
  const lore = id();
  ops.push({ t: 'set', p: ['lore', lore], v: { id: lore, title: t.lore[0], category: t.lore[1], content: t.lore[2], pinned: false, mapIds: [map], createdAt: now, adventureIds: [adv] } });

  // Session mit Szenen – als aktive Session, damit „Spielen“ sofort etwas zeigt
  const sid = id();
  const scenes = {};
  t.scenes.forEach(([title, readAloud, notes, withNpc, withEnc], i) => {
    const scId = id();
    scenes[scId] = { id: scId, order: i + 1, title, status: 'open', readAloud, notes, mapId: map, assetIds: [], encounterId: withEnc ? enc : null, creatureIds: withNpc ? [hilde] : [], loreIds: i === 2 ? [lore] : [] };
  });
  ops.push({ t: 'set', p: ['sessions', sid], v: { id: sid, adventureId: adv, name: t.session, date: '', status: 'planned', order: now, notes: '', liveNotes: '', mapIds: [map], assetIds: [], loreIds: [lore], sketch: {}, scenes } });
  ops.push({ t: 'set', p: ['display', 'sessionId'], v: sid });
  ops.push({ t: 'set', p: ['display', 'table', 'mapId'], v: map });
  store.commit(st.id, ops);
  store.flushAll();
  fs.writeFileSync(marker, new Date().toISOString());
  return st.id;
}
