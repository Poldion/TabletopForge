// Kartenbauer mit Sprachmodell: Räume einrichten und ganze Karten entwerfen lassen. Das Modell liefert nur einen
// groben Bauplan (welche Räume, welche Möbel, wo Wasser und Wald) – gebaut wird nach den Regeln des Kartenbauers
// (mb-plan.js, mb-themes.js). So entsteht auch aus einer ungenauen Antwort eine saubere Karte.
import { api } from './util.js';
import { tr, lang, LANGUAGES } from './i18n.js';
import { CATALOG } from './mb-assets.js';
import { THEMES } from './mb-themes.js';
import { PLAN_BIOMES } from './mb-plan.js';

function parseJson(text) {
  const s = String(text).replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error(tr('Die KI hat keine verwertbare Antwort geliefert – bitte noch einmal versuchen.'));
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    throw new Error(tr('Die KI hat keine verwertbare Antwort geliefert – bitte noch einmal versuchen.'));
  }
}

/** Gegenstände, die in einen Raum gehören: Kennung und Name, nach Kategorie. */
const indoor = () =>
  Object.entries(CATALOG)
    .filter(([, d]) => ['furniture', 'goods', 'dungeon', 'ship'].includes(d.cat) && !d.size)
    .map(([t, d]) => `${t} (${d.label})`)
    .join(', ');
/** Gegenstände fürs Freie und Gebäude von oben (für Übersichtskarten). */
const outdoor = (overview) =>
  Object.entries(CATALOG)
    .filter(([, d]) => (overview ? ['building', 'outdoor'] : ['outdoor', 'nature']).includes(d.cat) && !d.size)
    .map(([t, d]) => `${t} (${d.label})`)
    .join(', ');

const SYSTEM = 'You design top-down maps for tabletop role-playing games by filling in a strict JSON plan. You answer with valid JSON only, no explanations.';

/**
 * Einrichtung für einen Raum entwerfen. size: [Breite, Tiefe] in Feldern. Liefert [{ t, n, at, seats, seatCount }].
 */
export async function aiFurniture(description, size) {
  const user = [
    `Furnish one room for a fantasy role-playing map. The room is ${size[0]} by ${size[1]} squares (one square = 5 feet).`,
    `What the room is: ${description}`,
    '',
    'Choose fitting pieces from this catalogue (use the identifier before the bracket, nothing else):',
    indoor(),
    '',
    'Answer with a JSON object: {"furniture": [{"t": identifier, "n": how many (1-8), "seats": optional identifier of seats placed around a table (stool, chair or bench), "seatCount": seats per table}]}',
    'You only choose WHAT stands in the room and HOW MANY. Where it stands is decided automatically (shelves and beds against walls, barrels and sacks in corners, tables in the middle with their seats around them) – do not list stools or chairs on their own, give them as "seats" of a table.',
    `Keep it believable for the room size: at most ${Math.max(4, Math.round(size[0] * size[1] * 0.45))} pieces in total (not counting seats), 3 to 8 entries. Prefer a few pieces that clearly tell what the room is used for over many random ones; leave open floor for miniatures. Include one light source if it fits.`,
  ].join('\n');
  const r = await api('POST', '/api/ai/text', { json: true, system: SYSTEM, messages: [{ role: 'user', content: user }] });
  const list = parseJson(r.text).furniture;
  if (!Array.isArray(list) || !list.length) throw new Error(tr('Die KI hat keine verwertbare Antwort geliefert – bitte noch einmal versuchen.'));
  return list;
}

/** Bauplan für eine ganze Karte entwerfen (siehe mb-plan.js). hint: { cols, rows } als Wunschgröße. */
export async function aiPlan(description, hint = {}) {
  const language = LANGUAGES[lang] || 'English';
  const user = [
    'Design a map as a JSON plan. All positions and sizes are in grid squares (one square = 5 feet), x to the right, y downwards, origin top left.',
    `What the map should show: ${description}`,
    hint.cols ? `Preferred size: ${hint.cols} by ${hint.rows} squares.` : 'Choose a fitting size: 24x16 for a single building, 30x20 for a small site, up to 44x30 for a large one.',
    '',
    'JSON keys:',
    `"name": short title (${language}),`,
    `"biome": one of ${PLAN_BIOMES.join(', ')} (meadow = grassland and ordinary forest – the default above ground; shire = lush green hills; desert; tundra = snow; magic = glowing enchanted forest, only if the description is explicitly magical; swamp = marsh and bog with murky water; town = paved city ground; dungeon = built rooms in solid rock; cave = natural caverns in rock),`,
    '"scale": "battle" (rooms with furniture, the default) or "overview" (a village or town seen from far above: no rooms, only whole buildings as objects, streets and house areas),',
    '"cols", "rows": map size,',
    `"rooms": [{"id": short unique name, "x", "y", "w", "h", "floor": wood | woodDark | woodLight | stone | cobble | earth, "theme": one of ${Object.keys(THEMES).join(', ')} or null, "furniture": own list instead of a theme – only for rooms no theme fits, "round": true for a round tower room, "timber": true for wooden outer walls, "ruin": true for crumbling walls}],`,
    '"doors": [{"room": id, "side": "n" | "e" | "s" | "w", "pos": 0..1 along that side, "kind": "door" | "secret"}] or {"between": [idA, idB]} for a door in the wall two touching rooms share,',
    '"windows": [{"room": id, "side", "pos"}] (not underground),',
    '"links": [[idA, idB]] – only for biome cave: tunnels between caverns,',
    '"water": [{"points": [[x, y], ...], "width": squares}] – a river is a line across the map, a pond is one point with a large width,',
    '"paths": [{"points": [[x, y], ...], "kind": "path" | "road"}],',
    '"grounds": [{"kind": forest | gravel | ruin | mud | leaves | ash | snow | gloom, "points": [[x, y], ...], "width": squares}] – zones of different ground painted as a broad soft brush along the points (one point = a round patch); they blend softly into the ground around them. forest = dark forest floor under trees, gravel = stony rubble ground, ruin = broken old paving, mud = wet bog, leaves = fallen leaves, ash = burnt ground, snow, gloom = darkens everything inside (an eerie, cursed or shadowy part of the map),',
    '"areas": [{"x", "y", "w", "h", "kind": trees | bushes | rocks | mixed | swamp | ruins | deadwood | graves | houses}] – filled automatically (swamp = gnarled and dead trees, reeds, puddles; ruins = broken wall pieces, column stumps and rubble; deadwood = dead trees, logs, stumps, roots; graves = gravestones; houses only with scale overview),',
    '"objects": [{"t": identifier, "x", "y", "rot": degrees}] – single things OUTDOORS only, never inside a room (things inside rooms go into that room\'s "furniture" or come from its "theme"),',
    `"labels": [{"text": name of a place (${language}), "x", "y"}] – at most 4.`,
    '',
    'Furniture entries look like {"t": identifier, "n": count, "seats": stool | chair | bench, "seatCount": seats per table}. Where a piece stands inside its room is decided automatically – only choose what and how many (about one piece per two squares of floor at most). Indoor identifiers:',
    indoor(),
    '',
    'Identifiers for "objects" outdoors:',
    outdoor(false),
    'For scale overview use these buildings as "objects" instead of rooms:',
    outdoor(true),
    '',
    'Rules:',
    '- Rooms are rectangles at least 3x3 squares, at least 1 square away from the map edge. Rooms of one building must touch along a full edge (no gaps, no overlaps); a wall and a door between them are added where you list a door. Separate buildings keep at least 2 squares distance.',
    '- Every room needs a door. A building needs at least one door to the outside.',
    '- Underground (dungeon): corridors are rooms too, 2 squares wide, touching the rooms they connect. For cave: "rooms" are caverns (no doors, no furniture themes), connect them with "links" and put things in "objects".',
    '- Water, paths and tree areas stay outside the buildings: keep at least 2 squares between a river and any room. Leave open ground for miniatures: tree areas frame the map or form groves, they never cover the whole map.',
    '- "rooms" are only for buildings with walls. Tents, carts, wells, campfires and market stalls are "objects", not rooms.',
    '- Outdoor battle maps: build 2 or 3 zones that blend into each other with "grounds" (for example meadow, forest floor along the tree line, gravel and ruin paving around a ruin, gloom laid right over the eerie point of interest itself, never over empty ground). Give the map one or two points of interest (a ruin, a camp, a shrine, a grave site) with fitting objects around them. Spread cover every 3 to 4 squares (trees, rocks, wall pieces, logs, bushes) but keep open ground for fighting. Paths lead from a map edge to the points of interest.',
    '- An outdoor ruin is ground "ruin" (and "gravel" around it) with objects ruinWall, ruinCorner, ruinArch, pillarBroken, stairsDown, fallenStatue, rubble, or an area "ruins". Use rooms with "ruin": true only for a building whose walls still stand; a ruined room holds no intact furniture (no pews, beds, tables or shelves).',
    '- Prefer a "theme" for ordinary rooms; it keeps the answer short.',
    'Answer with the JSON object only.',
  ].join('\n');
  const r = await api('POST', '/api/ai/text', { json: true, long: true, system: SYSTEM, messages: [{ role: 'user', content: user }] });
  const plan = parseJson(r.text);
  if (!Array.isArray(plan.rooms) && !Array.isArray(plan.objects) && !Array.isArray(plan.areas) && !Array.isArray(plan.grounds)) throw new Error(tr('Die KI hat keine verwertbare Antwort geliefert – bitte noch einmal versuchen.'));
  return plan;
}
