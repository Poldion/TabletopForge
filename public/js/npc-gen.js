// NSC-Generator: würfelt Volk, Name, Beruf, Aussehen, Persönlichkeit, Ideale, Makel, Geheimnisse …
// Alle Listen sind eigene Zusammenstellungen und funktionieren ohne Internet. Deutsch hier, Englisch in npc-gen-en.js –
// gewürfelt wird in der Sprache des Geräts.
import { lang } from './i18n.js';
import { EN } from './npc-gen-en.js';

const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];

const PEOPLES_DE = {
  human: 'Mensch',
  elf: 'Elf',
  dwarf: 'Zwerg',
  halfling: 'Halbling',
  gnome: 'Gnom',
  halfelf: 'Halbelf',
  halforc: 'Halbork',
  tiefling: 'Tiefling',
  dragonborn: 'Drachenblütiger',
};

// Gewichtung: Menschen sind in den meisten Welten am häufigsten
const PEOPLE_WEIGHTS = { human: 10, elf: 3, dwarf: 3, halfling: 3, gnome: 2, halfelf: 2, halforc: 2, tiefling: 1, dragonborn: 1 };

const NAMES_DE = {
  human: {
    m: ['Alrik', 'Bertram', 'Konrad', 'Dietrich', 'Emmerich', 'Falko', 'Gerold', 'Hagen', 'Ingolf', 'Jasper', 'Kasimir', 'Lorenz', 'Matthis', 'Notker', 'Oswin', 'Ruprecht', 'Severin', 'Tankred', 'Ulrich', 'Wendel', 'Benedikt', 'Gregor', 'Anselm', 'Leopold'],
    w: ['Adelheid', 'Brunhild', 'Cordula', 'Dorothea', 'Edda', 'Friederike', 'Gisela', 'Hedwig', 'Irmgard', 'Jorinde', 'Kunigunde', 'Lioba', 'Mechthild', 'Notburga', 'Ottilie', 'Roswitha', 'Sieglinde', 'Theda', 'Ursel', 'Walburga', 'Agnes', 'Elsbeth', 'Margarethe', 'Rosalind'],
    last: ['Ackermann', 'Brenner', 'Eisenhut', 'Faßbinder', 'Grünwald', 'Hollerbusch', 'Kesselring', 'Lindner', 'Mühlbach', 'Rabenstein', 'Schwarzdorn', 'Sturmfels', 'Tannhäuser', 'Weidenau', 'Wolfsberg', 'Zinngießer', 'vom Hag', 'Steinbrück', 'Krähenfeld', 'Rotbart'],
  },
  elf: {
    m: ['Aerindel', 'Calithor', 'Elvarion', 'Faelor', 'Galirien', 'Ithrandel', 'Lorvaen', 'Miraethis', 'Nythandor', 'Sylvereth', 'Thaeriel', 'Valandir', 'Erevan', 'Ilvarion'],
    w: ['Aeloria', 'Belisandre', 'Caelithra', 'Elanwyn', 'Faeloria', 'Isilwen', 'Lirael', 'Miraveth', 'Nimrielle', 'Seraphiel', 'Thalyssa', 'Ylvana', 'Arwenna', 'Valindra'],
    last: ['Mondlaub', 'Silberquell', 'Sternenwind', 'Nachtigall', 'Tauglanz', 'Dämmerblatt', 'Weidenruf', 'Lichtfeder', 'Nebelhain', 'Eichengrün'],
  },
  dwarf: {
    m: ['Balgrim', 'Dorgan', 'Durnik', 'Gimrik', 'Hargrom', 'Kildrak', 'Morgrim', 'Rognar', 'Thorbald', 'Torvik', 'Brunvald', 'Bromdur', 'Grundar', 'Ulfgar'],
    w: ['Ambra', 'Bergrun', 'Dagrun', 'Eldrun', 'Gunhild', 'Helga', 'Kathrun', 'Marwen', 'Ragna', 'Thordis', 'Velgrid', 'Brunna', 'Dísa', 'Helja'],
    last: ['Eisenfaust', 'Steinbart', 'Hammerschlag', 'Goldader', 'Feuerherz', 'Tiefgrund', 'Ambossbrecher', 'Granitschild', 'Erzhauer', 'Kupferkessel'],
  },
  halfling: {
    m: ['Bodo', 'Bilbert', 'Fosco', 'Gerbold', 'Hamfried', 'Lotho', 'Odo', 'Pimbo', 'Rufus', 'Tobold', 'Wendo', 'Fredegar'],
    w: ['Bree', 'Dalli', 'Daisy', 'Elfie', 'Hilde', 'Linnie', 'Mabel', 'Nelly', 'Pansy', 'Rosie', 'Tilda', 'Wilma'],
    last: ['Apfelbaum', 'Brombeer', 'Grünhügel', 'Honigtopf', 'Kesselflick', 'Krautwickel', 'Pfeifenkraut', 'Teeblatt', 'Unterberg', 'Wiesenrain'],
  },
  gnome: {
    m: ['Bimbel', 'Dorrik', 'Fizzwick', 'Gnurb', 'Klickerling', 'Nobbel', 'Pimwick', 'Quorbel', 'Tink', 'Wibbelt', 'Zappo', 'Fennick'],
    w: ['Bellawick', 'Dibbi', 'Fianna', 'Glimmie', 'Lissel', 'Nim', 'Pippa', 'Quilla', 'Tibbi', 'Wizzy', 'Zinni', 'Mirri'],
    last: ['Zahnradwerk', 'Funkelstein', 'Federkiel', 'Kurbelmeyer', 'Glitzerkopf', 'Tüftelmann', 'Schraubenzieher', 'Messingspitz'],
  },
  halfelf: {
    m: ['Aldric', 'Caelan', 'Davor', 'Elian', 'Joren', 'Lucan', 'Rhys', 'Soren', 'Tarion', 'Varis'],
    w: ['Arlena', 'Celia', 'Elowen', 'Isolde', 'Liora', 'Maelis', 'Rowena', 'Selene', 'Talia', 'Viviane'],
    last: ['Dämmerweg', 'Silberbach', 'Weidenau', 'Morgentau', 'Lindgard', 'Falkenhorst'],
  },
  halforc: {
    m: ['Brakk', 'Durgash', 'Gorzag', 'Hruk', 'Kargul', 'Mog', 'Rugnar', 'Skarn', 'Thrak', 'Urzog', 'Grashnak', 'Zorg'],
    w: ['Bagra', 'Durza', 'Grisha', 'Hagra', 'Kesha', 'Morna', 'Ruga', 'Shazra', 'Tola', 'Urka', 'Vashka', 'Zogra'],
    last: ['Eisenzahn', 'Knochenbrecher', 'Blutfels', 'Narbenhand', 'Schädelspalter', '(ohne Familiennamen)'],
  },
  tiefling: {
    m: ['Azrael', 'Belkor', 'Caeryx', 'Dravos', 'Ezekar', 'Malzar', 'Nerox', 'Ryxas', 'Sarvon', 'Zephyrion'],
    w: ['Azura', 'Belyth', 'Cyrene', 'Lilith', 'Morvenna', 'Nyxara', 'Seraxa', 'Thessia', 'Vexa', 'Zariel'],
    last: ['Hoffnung', 'Sehnsucht', 'Ehrfurcht', 'Kummer', 'Zuversicht', 'Glut', 'Asche', 'Wanderer'],
  },
  dragonborn: {
    m: ['Arvash', 'Bharzul', 'Drakthar', 'Ghorvan', 'Kaldrex', 'Murrak', 'Rhazgor', 'Sarkhan', 'Torvash', 'Vyrkhan'],
    w: ['Askra', 'Dravina', 'Ishvara', 'Kethra', 'Myrrha', 'Nyrrish', 'Sazra', 'Thyra', 'Vashira', 'Zyrra'],
    last: ['vom Glutclan', 'vom Sturmclan', 'vom Schuppenclan', 'vom Aschenclan', 'vom Klingenclan', 'vom Donnerclan'],
  },
};

// Beruf → passende Werte-Vorlage aus dem SRD (Open5e-Slug)
const ROLES_DE = [
  ['Wirt / Wirtin', 'commoner'],
  ['Schankmagd / Schankknecht', 'commoner'],
  ['Schmied / Schmiedin', 'commoner'],
  ['Händler / Händlerin', 'commoner'],
  ['Bauer / Bäuerin', 'commoner'],
  ['Fischer / Fischerin', 'commoner'],
  ['Müller / Müllerin', 'commoner'],
  ['Bäcker / Bäckerin', 'commoner'],
  ['Stallbursche / Stallmagd', 'commoner'],
  ['Kräuterkundige(r)', 'commoner'],
  ['Heiler / Heilerin', 'acolyte'],
  ['Schreiber / Schreiberin', 'commoner'],
  ['Gelehrte(r)', 'commoner'],
  ['Bettler / Bettlerin', 'commoner'],
  ['Barde / Bardin', 'commoner'],
  ['Stadtwache', 'guard'],
  ['Hauptmann der Wache', 'veteran'],
  ['Söldner / Söldnerin', 'thug'],
  ['Kopfgeldjäger(in)', 'veteran'],
  ['Ritter / Ritterin', 'knight'],
  ['Adelige(r)', 'noble'],
  ['Höfling', 'noble'],
  ['Priester / Priesterin', 'priest'],
  ['Akolyth(in)', 'acolyte'],
  ['Kultist(in)', 'cultist'],
  ['Magier / Magierin', 'mage'],
  ['Druide / Druidin', 'druid'],
  ['Jäger / Jägerin', 'scout'],
  ['Kundschafter(in)', 'scout'],
  ['Dieb / Diebin', 'spy'],
  ['Schmuggler(in)', 'bandit'],
  ['Wegelagerer / Wegelagerin', 'bandit'],
  ['Bandenchef(in)', 'bandit-captain'],
  ['Spion / Spionin', 'spy'],
  ['Schläger / Schlägerin', 'thug'],
  ['Gladiator(in)', 'gladiator'],
  ['Berserker(in)', 'berserker'],
  ['Assassine', 'assassin'],
  ['Kapitän / Kapitänin', 'veteran'],
  ['Matrose', 'commoner'],
  ['Totengräber(in)', 'commoner'],
  ['Alchemist(in)', 'commoner'],
  ['Wahrsager(in)', 'commoner'],
];

const STAT_TEMPLATES_DE = {
  commoner: 'Gemeiner Bürger (HG 0)',
  acolyte: 'Akolyth (HG 1/4)',
  bandit: 'Bandit (HG 1/8)',
  cultist: 'Kultist (HG 1/8)',
  guard: 'Wache (HG 1/8)',
  noble: 'Adeliger (HG 1/8)',
  scout: 'Späher (HG 1/2)',
  thug: 'Schläger (HG 1/2)',
  spy: 'Spion (HG 1)',
  'bandit-captain': 'Banditenhauptmann (HG 2)',
  berserker: 'Berserker (HG 2)',
  druid: 'Druide (HG 2)',
  priest: 'Priester (HG 2)',
  knight: 'Ritter (HG 3)',
  veteran: 'Veteran (HG 3)',
  gladiator: 'Gladiator (HG 5)',
  mage: 'Magier (HG 6)',
  assassin: 'Assassine (HG 8)',
  archmage: 'Erzmagier (HG 12)',
};

const AGES_DE = ['jung', 'jung', 'in den besten Jahren', 'in den besten Jahren', 'mittleren Alters', 'älter', 'alt', 'uralt'];

const APPEARANCE_DE = [
  'Narbe quer über die Wange',
  'auffällig gepflegter Bart / kunstvoll geflochtenes Haar',
  'fehlender Schneidezahn',
  'buschige Augenbrauen, stechender Blick',
  'trägt stets einen viel zu großen Hut',
  'Sommersprossen und rote Locken',
  'auffällige Tätowierung am Hals',
  'hinkt leicht, stützt sich auf einen Stock',
  'ungewöhnlich groß und schlaksig',
  'klein und stämmig, kräftige Hände',
  'zwei verschiedenfarbige Augen',
  'abgewetzte, aber sorgfältig geflickte Kleidung',
  'protziger Schmuck an jedem Finger',
  'riecht nach Rauch und Kräutern',
  'Glatze mit einer alten Brandnarbe',
  'trägt eine Augenklappe',
  'tintenbefleckte Finger',
  'auffallend schöne Erscheinung',
  'wettergegerbtes Gesicht',
  'zitternde Hände',
  'trägt ein Amulett, das ständig berührt wird',
  'sehr blass, dunkle Augenringe',
  'Ohrring aus einem Tierzahn',
  'auffällig bunte Kleidung',
];

const PERSONALITY_DE = [
  'herzlich und redselig',
  'misstrauisch gegenüber Fremden',
  'übertrieben höflich',
  'grummelig, aber im Kern gutmütig',
  'nervös und schreckhaft',
  'prahlerisch',
  'trockener Humor',
  'neugierig, stellt ständig Fragen',
  'wortkarg und direkt',
  'abergläubisch',
  'gierig, wittert überall ein Geschäft',
  'fromm und belehrend',
  'verträumt, mit dem Kopf in den Wolken',
  'hilfsbereit bis zur Selbstaufgabe',
  'arrogant und herablassend',
  'zynisch, hat alles schon gesehen',
  'fröhlich und optimistisch',
  'melancholisch',
  'pedantisch und genau',
  'impulsiv und hitzköpfig',
];

const QUIRKS_DE = [
  'beendet jeden Satz mit einer Frage',
  'zählt ständig Münzen',
  'spricht von sich in der dritten Person',
  'summt bei der Arbeit alte Lieder',
  'kaut immer auf irgendetwas herum',
  'nennt alle „Liebchen“ bzw. „Freundchen“',
  'zitiert ständig Sprichwörter – meist falsch',
  'flüstert, wenn es um Geld geht',
  'lacht an unpassenden Stellen',
  'hat für alles ein Gerücht parat',
  'erzählt ungefragt von den eigenen Enkeln',
  'misstraut Magie und spuckt aus, wenn sie erwähnt wird',
  'streichelt beim Reden eine Katze, die nicht da ist',
  'verwechselt ständig Namen',
  'trommelt mit den Fingern',
  'macht sich Notizen über alle Gesprächspartner',
];

const VOICES_DE = ['tiefe, brummige Stimme', 'hohe, schnelle Stimme', 'rauchige Stimme', 'singender Tonfall', 'starker ländlicher Dialekt', 'näselnd', 'leise, kaum hörbar', 'laut und dröhnend', 'stottert bei Aufregung', 'langsam und bedächtig', 'fremder Akzent', 'heiser'];

const IDEALS_DE = ['Familie geht über alles.', 'Ordnung und Gesetz halten die Welt zusammen.', 'Freiheit – niemand soll über andere herrschen.', 'Gold öffnet jede Tür.', 'Wissen ist der größte Schatz.', 'Ehre und Wort sind heilig.', 'Die Götter lenken alles.', 'Jeder ist sich selbst der Nächste.', 'Die Natur muss geschützt werden.', 'Wer stark ist, beschützt die Schwachen.', 'Tradition bewahrt uns vor dem Untergang.', 'Veränderung ist unvermeidlich – und gut.'];

const BONDS_DE = ['schuldet einem gefährlichen Mann viel Geld', 'sucht ein verschwundenes Geschwister', 'hütet ein Familienerbstück', 'ist heimlich in jemanden aus dem Dorf verliebt', 'verdankt einem Abenteurer das Leben', 'ist dem örtlichen Tempel tief verbunden', 'will das Geschäft der Eltern retten', 'kümmert sich um ein Waisenkind', 'ist einer Gilde zur Treue verpflichtet', 'hat einem Sterbenden ein Versprechen gegeben'];

const FLAWS_DE = ['kann Geheimnisse nicht für sich behalten', 'trinkt zu viel', 'ist spielsüchtig', 'feige, wenn es ernst wird', 'nachtragend', 'leichtgläubig', 'jähzornig', 'gierig', 'eifersüchtig', 'lügt aus Gewohnheit', 'hochmütig gegenüber Fremden', 'vertraut niemandem'];

const SECRETS_DE = [
  'arbeitet heimlich für die Diebesgilde',
  'ist der Spitzel eines Adelshauses',
  'hat vor Jahren jemanden getötet und versteckt sich',
  'besitzt eine Karte zu einem vergessenen Grab',
  'ist in Wahrheit von adeliger Herkunft',
  'betet heimlich zu einer verbotenen Gottheit',
  'weiß, wer hinter den jüngsten Morden steckt',
  'schmuggelt verbotene Waren im Keller',
  'ist von einem Fluch betroffen, der nachts wirkt',
  'plant, die Stadt bald heimlich zu verlassen',
  'erpresst den Bürgermeister',
  'ist ein verkleideter Gestaltwandler',
  'hat nichts zu verbergen – wirkt aber so',
  'hat einen Pakt mit einem Feenwesen geschlossen',
];

const MOTIVATIONS_DE = ['will reich werden', 'sucht Rache', 'will Anerkennung', 'sucht Abenteuer, traut sich aber nicht', 'will einfach in Ruhe gelassen werden', 'sucht einen Heiler für ein krankes Familienmitglied', 'will die Stadt beschützen', 'sucht verlorenes Wissen', 'will einen Rivalen ausstechen', 'sucht Vergebung'];

const GENDERS_DE = { m: 'männlich', w: 'weiblich', d: 'divers' };

const DE = {
  PEOPLES: PEOPLES_DE, NAMES: NAMES_DE, ROLES: ROLES_DE, STAT_TEMPLATES: STAT_TEMPLATES_DE, AGES: AGES_DE,
  APPEARANCE: APPEARANCE_DE, PERSONALITY: PERSONALITY_DE, QUIRKS: QUIRKS_DE, VOICES: VOICES_DE, IDEALS: IDEALS_DE,
  BONDS: BONDS_DE, FLAWS: FLAWS_DE, SECRETS: SECRETS_DE, MOTIVATIONS: MOTIVATIONS_DE, GENDERS: GENDERS_DE,
};
const T = lang === 'en' ? EN : DE;

export const PEOPLES = T.PEOPLES;
export const ROLES = T.ROLES;
export const STAT_TEMPLATES = T.STAT_TEMPLATES;
export const GENDERS = T.GENDERS;
/** Bezeichnungen der Völker und Geschlechter in allen Sprachen – um NSCs aus beiden Sprachen wiederzuerkennen. */
export const PEOPLE_LABELS_ALL = Object.fromEntries(Object.keys(PEOPLES_DE).map((k) => [k, [PEOPLES_DE[k], EN.PEOPLES[k]]]));
export const GENDER_LABELS_ALL = Object.fromEntries(Object.keys(GENDERS_DE).map((k) => [k, [GENDERS_DE[k], EN.GENDERS[k]]]));

function weightedPeople(rnd) {
  const total = Object.values(PEOPLE_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (const [k, w] of Object.entries(PEOPLE_WEIGHTS)) {
    r -= w;
    if (r <= 0) return k;
  }
  return 'human';
}

/** Einzelne Eigenschaften neu würfeln. */
export const ROLLERS = {
  people: (n, rnd) => weightedPeople(rnd),
  gender: (n, rnd) => pick(['m', 'w', 'm', 'w', 'd'], rnd),
  firstName: (n, rnd) => {
    const list = T.NAMES[n.people] || T.NAMES.human;
    return pick(n.gender === 'd' ? [...list.m, ...list.w] : list[n.gender] || list.m, rnd);
  },
  lastName: (n, rnd) => pick((T.NAMES[n.people] || T.NAMES.human).last, rnd),
  age: (n, rnd) => pick(T.AGES, rnd),
  role: (n, rnd) => pick(T.ROLES, rnd)[0],
  appearance: (n, rnd) => pick(T.APPEARANCE, rnd),
  personality: (n, rnd) => pick(T.PERSONALITY, rnd),
  quirk: (n, rnd) => pick(T.QUIRKS, rnd),
  voice: (n, rnd) => pick(T.VOICES, rnd),
  ideal: (n, rnd) => pick(T.IDEALS, rnd),
  bond: (n, rnd) => pick(T.BONDS, rnd),
  flaw: (n, rnd) => pick(T.FLAWS, rnd),
  secret: (n, rnd) => pick(T.SECRETS, rnd),
  motivation: (n, rnd) => pick(T.MOTIVATIONS, rnd),
};

const FIELD_LABELS_DE = {
  people: 'Volk',
  gender: 'Geschlecht',
  firstName: 'Vorname',
  lastName: 'Familienname',
  age: 'Alter',
  role: 'Beruf / Rolle',
  appearance: 'Aussehen',
  personality: 'Persönlichkeit',
  quirk: 'Eigenheit',
  voice: 'Stimme',
  ideal: 'Ideal',
  bond: 'Bindung',
  flaw: 'Makel',
  secret: 'Geheimnis',
  motivation: 'Motivation',
};
export const FIELD_LABELS = lang === 'en' ? EN.FIELD_LABELS : FIELD_LABELS_DE;

/** Würfelt einen kompletten NSC. Vorgaben (z.B. { people: 'dwarf' }) werden übernommen. */
export function generateNpc(fixed = {}, rnd = Math.random) {
  const n = { ...fixed };
  for (const key of Object.keys(ROLLERS)) {
    if (n[key] == null || n[key] === '') n[key] = ROLLERS[key](n, rnd);
  }
  n.template = templateForRole(n.role);
  return n;
}

export function templateForRole(role) {
  // Rollen beider Sprachen kennen (NSC auf Deutsch angelegt, später auf Englisch geöffnet – und umgekehrt)
  return [...ROLES_DE, ...EN.ROLES].find(([r]) => r === role)?.[1] || 'commoner';
}

export const npcName = (n) => `${n.firstName}${n.lastName && !n.lastName.startsWith('(') ? ` ${n.lastName}` : ''}`;

/** Hintergrundtext (Markdown) für die Kartei. */
export function npcBackground(n) {
  const L = FIELD_LABELS;
  return [
    `**${L.people}:** ${PEOPLES[n.people] || n.people} · **${L.gender}:** ${GENDERS[n.gender] || n.gender} · **${L.age}:** ${n.age}`,
    `**${L.appearance}:** ${n.appearance}`,
    `**${L.personality}:** ${n.personality}`,
    `**${L.quirk}:** ${n.quirk}`,
    `**${L.voice}:** ${n.voice}`,
    `**${L.ideal}:** ${n.ideal}`,
    `**${L.bond}:** ${n.bond}`,
    `**${L.flaw}:** ${n.flaw}`,
    `**${L.motivation}:** ${n.motivation}`,
    `**${L.secret}:** ${n.secret}`,
  ].join('\n\n');
}
