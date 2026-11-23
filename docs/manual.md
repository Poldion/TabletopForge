# Tabletop Forge – Manual

🇬🇧 English · 🇩🇪 [Deutsch](handbuch.md)

Self-hosted web application for game masters: prepare campaigns, run sessions and drive a digital game table (a TV
lying flat) and a player display, all from one browser.

## Features

- **Clear interface:** two modes, switchable at the top – **Prepare** and **Play** (map with a map bar, next to it
  Flow · Combat · Creatures · Notes · Lore). The header always shows what is running on the game table and the player
  display. On a phone: navigation at the bottom, lists and details one after the other.
- **Several campaigns**, stored strictly separately, organised into adventures and sessions.
- **Levels instead of one long sidebar:** preparation is organised as **Campaign › Adventure › Session**. A path bar at
  the top shows where you are (adventure and session can be switched right there), the sidebar shows only the pages of
  the current level, with “‹ back” to the level above.
  - **Campaign:** overview (first steps, active session, adventures with progress, party), adventures, party, world
    (all lore), bestiary (all creatures), library (all maps, images and documents, grouped by day/week/month, filter by
    type and adventure), screens, settings.
  - **Adventure:** overview (what it is about, sessions as a timeline, contents), maps, handouts, lore, NPCs & encounters
    – each only what belongs to the adventure. New items (including uploads, AI and BasaltNotes images) end up in it
    automatically; an item can belong to several adventures (“Adventure:” buttons, “+ Add from the campaign”).
  - **Session:** **Flow** as a sequence of scenes (read-aloud text, notes for you, map, handouts, encounter, NPCs, lore;
    sortable, can be ticked off as done; can be suggested by the AI), **Material** (notes and quick picks) and
    **Ready?** (checks scenes, party, map grids, encounter difficulty, connected screens) with “Start session”. Didn't
    finish? **“Move open scenes on”** puts them at the start of the next session (creating it if needed) and marks the
    current one as played. While playing, the adventure of the active session applies.
- **Play by the script:** above the map the **scene bar** of the active session; the **Flow** panel shows the current
  scene with everything you need: “Start scene” (map on the table), read-aloud text to the player display, encounter
  “place hidden & fight”, handouts, NPCs and lore with one tap, notes “What happened?” and “Done & next”.
  **Improvise** (in the bar and in the panel) when the players leave the path: improvised scene after the current one,
  spontaneous NPC (AI or rolled), random encounter, **quick search** (Ctrl+K) across maps, handouts, lore, creatures and
  encounters of the adventure or campaign – with “To the scene”. **End** moves open scenes on if you want and opens the
  **wrap-up**: scenes with notes, notes from play, experience points of the finished encounters, a “Previously on …”
  recap via AI (show it to the players or send it as a session note to BasaltNotes – needs a token with the “Inbox”
  right), prepare the next session.
- **AI creation:** NPCs, monsters and party characters from one sentence (“grumpy dwarf smith, CR 2”) – with a
  rules-compliant stat block or values (HP, AC, passive Perception), background and, if you like, a **portrait and a
  round token** (the token is stored separately as the creature's token image). Also while playing in the Creatures tab
  for spontaneous NPCs.
- **Portraits and tokens** are shown large on the sheet of the creature or character (show to players, optionally
  “In handouts”). They only appear among the handouts if you choose so; in the library they are marked as
  “Portrait”/“Token”. Older campaigns are assigned to adventures once during the update (one adventure: everything goes
  there; several: whatever the sessions linked).
- **Prep mode:** bundle the maps, handouts and lore of a session as quick picks.
- **Maps:** battle, location and travel/world maps; align the grid via columns/rows or by drawing a rectangle.
- **Map builder** (Maps → “Build your own map”): put together maps in a hand-drawn style without an image file.
  - **Templates:** a new map starts empty or from a template – lakeside tavern, crypt, cave, overgrown ruin, riverside
    village, riverside city, hilltop fortress. The template is only the start; everything can be changed afterwards. In the select tool “Save scene”
    stores the map as a file and “Load scene” brings it back – in another campaign, too.
  - **Terrain** is painted with a brush: water (with a sandy rim and shoreline), paths (narrow trails), dirt (soft,
    trodden ground) and elevations – rock plateaus with an edge and a shadow, in up to three levels as terraces.
    “Erase” (or Alt) removes it again.
  - **Rooms** are drawn as rectangles or circles and snap to half squares. Overlapping and adjoining rooms merge into
    one building; the stone wall follows the combined outline by itself (round towers included). Set the **floor** of
    each room with one click: planks (three tones), flagstones, cobblestone, dirt. “Open” gives an area without walls
    (porch, jetty). Interior walls (wood or stone) are drawn from point to point; **doors and windows** are placed with
    a click on a wall.
  - **Objects** from the catalogue (about 150 pieces in the groups furniture, supplies, dungeon, buildings, outdoors,
    nature, ship & harbour, with a **search field** and a “Recently used” row): click, place, rotate with R, mirror
    with F, resize, duplicate (Ctrl+D), roll a different variant, bring to front or send to back (Page Up/Down). The
    arrow keys nudge the selection (Shift for fine steps); Alt+click on an object picks it as the template for the
    next one. Moving a room takes its doors, windows, interior walls and furniture along.
  - **Table frame and extending:** “Table” in the header shows a frame the size of the game table at the pointer, so
    you can see what fits on screen at once. “Extend …” adds five squares on one side of the map; on the left and
    top the content moves along.
  - **Dungeons and caves:** in the “Dungeon” and “Cave” environments the map is solid rock. Rooms and corridors are
    drawn as rooms (they merge like buildings); natural passages and caverns are painted in with the **Cave** terrain
    brush – with a rock rim, the shadow of the wall and rock islands where you leave them standing. The rock wall stops
    light. Trees become giant mushrooms there. The “Dungeon” catalogue has pillars, sarcophagus, altar, throne, cage,
    skeleton, traps (pit, spikes, pressure plate, trapdoor), lever, portcullis, spiral staircase, treasure, crystals,
    stalagmites, a magic circle and more.
  - **Ruins:** a room marked “Ruin” gets crumbling walls with gaps and loose stones, the floor is overgrown in places,
    and light falls through the gaps.
  - **Timber walls:** a room marked “Timber walls” gets sturdy beams and corner posts instead of masonry – for a log
    cabin, barn or hut. Where it adjoins a stone room, the wall changes exactly at the seam.
  - **Overview maps** (scale at the top set to “Overview map”): for villages, towns, castles and regions. Trees, bushes
    and rocks are placed small; the “Buildings” catalogue has houses with thatched, tiled and slate roofs, an L-shaped
    house, barn, church, windmill, round tower, keep, wall tower, gatehouse, stone bridge, fields, a ship and more. The
    bright side of a roof always faces the light when you rotate it. The **Castle wall** wall tool draws town and castle
    walls with battlements and towers at the ends; “Door” on the wall makes a gate. Maps may be up to 80 squares wide
    or high (3600 squares in total at most).
  - **Cities and fortresses:** the terrain brush **Street** paints paved streets and – with a large brush – squares.
    The fill area **Houses** fills a dragged-out area with rows of houses: small town houses in seven roof colours and
    several shapes, fronts facing the lane, neighbours often in the same colour; streets, paths, water and walls stay
    clear. Orientation, density and house size of the quarter can be set afterwards, and every house moved
    individually. With the wall tool you set long **wall runs** point by point: every click is a corner, a click on
    the start closes the ring, double-click, Enter or Esc finishes. Besides the castle wall (with a tower at every
    corner) there is the **palisade**. Closed wall rings carry their battlements on the outside only. A **gate**
    (under door/window) is two squares wide with two leaves and, in a castle wall, two gate towers; during play it
    opens and closes like a door. With a piece of a closed wall ring selected, “Moat around the ring” paints a water
    moat around the outside. Houses from a fill area first line streets and paths; the rows behind run in the same
    direction as their street, and small trees and bushes grow in the yards. New in the “Buildings” catalogue: town house, row of houses, courtyard house,
    town hall, great hall, warehouse, market hall, stable, square tower, large round tower, bastion, drawbridge.
    Paths, dirt and streets now also lie on raised ground – so the castle hill gets its approach road and yard.
    Where a path or street crosses the rock edge, the edge is left out: the way runs up as a ramp.
    Walled yards and cities can be revealed with the Room tool but count as outdoors for “dark indoors only”. Maps
    of 80 × 45 squares with well over a thousand objects stay smooth on a PC; on very large maps a ghost image moves
    while dragging and the map is redrawn on release.
  - **Furnishing rooms:** select a room and choose a theme under “Furnish as” – taproom, kitchen, bedchamber,
    storeroom, smithy, library, chapel, guard room, crypt or prison cell. Fitting furniture is placed with its back to
    the wall, in the corners and in the middle (tables with stools or chairs); doors stay clear and whatever already
    stands in the room is worked around. “Re-roll” arranges it differently, “Dissolve” releases the furniture for
    editing.
  - **Names on the map:** the **Text** tool places names of places (bold lettering) and of quarters or regions
    (large, spaced). Names are not part of the map image: during play the game master clicks a name and shows or
    hides it for the players – so a place appears only once the party knows it.
  - **Several pieces at once:** a frame on free ground or Shift+click selects several items (on a tablet the
    “Multiple” switch). The selection can be dragged together, nudged with the arrow keys, duplicated, deleted and
    copied with Ctrl+C / Ctrl+V – into another map too. Rooms take their doors, interior walls and furniture along.
  - **Placing objects:** many objects come in several variants (bed linen, barrels, trees). The variant changes by
    itself with each placement; to keep one, click it under “Variant”. “Rotation when placing” sets each new piece
    slightly askew, in 90° steps or at any angle, and optionally mirrors it at random – so tables, crates and barrels
    do not look lined up.
  - **Storeys:** above the canvas, “+ Upper floor” adds a storey above the ground floor, “+” further ones on top (up
    to four); “+ Basement” builds downwards (up to three). On an upper floor you build rooms, walls, doors and
    furniture – a tower room, a gallery, an attic. Whatever is not built over below stays visible but darkened – the
    lower, the darker. A basement lies by itself in the rock: cellar, crypt or tunnels; the terrain brush paints cave
    floor there. A dashed outline shows where the storey above lies. Otherwise terrain belongs to the ground floor;
    an empty outermost storey disappears by itself.
    During play the map first shows the ground floor, uncovered. At the bottom of the game master's map view all
    storeys are offered: when the party takes the stairs, you bring in the next one – on the game table too. Each
    storey has its own doors, lights, names, fog and lighting (a cellar starts dark). **Tokens belong to a storey**
    and are only visible there: new tokens stand on the storey shown; in the inspector of a token (or of several
    selected ones) the “storey” choice moves them up or down.
  - **Building with AI** (only with a language model set up under “AI services”): “Furnish with AI …” on a room takes
    a description in your own words (“alchemist's lab after an explosion”) and picks fitting furniture from the
    catalogue. “Design map with AI …” (or “Let the AI design it” for a new map) builds a whole draft from a
    description: rooms with doors and windows, furnishing, water, paths, groups of trees and place names. The AI only
    delivers the plan – it is built by the map builder's rules, and everything can be changed afterwards. Depending
    on the machine a draft takes one to three minutes.
  - **Fill:** drag out an area (circle or rectangle) – it fills itself with trees, bushes, rocks or a mix, but only on
    free ground (not in water, buildings, on paths or cliff edges). The density is adjustable, “Re-roll” distributes
    anew; afterwards every piece can be clicked and moved individually.
  - **Environment** at the top: meadow, desert (palms), tundra (conifers), magic forest, shire, town, dungeon, cave – ground, rock,
    water and trees change with it. Everything casts one shared, hard shadow in a single direction.
  - **Apply map** creates the map image (70 pixels per square, the grid fits right away) – the game table and the
    player display show it like any other map. The scene stays saved and can be edited again in the map builder at any
    time (“Edit in the map builder” on the map). Undo with Ctrl+Z.
  - **Walls stop light:** on built maps light ends at the walls and falls through doors and windows. Fireplace,
    campfire, brazier, lantern, wall torch, candles, street lamp and other glowing things become light sources of the
    map (switch on under Map → “Dynamic lighting”); your own lights are kept when you apply the map again. Dungeons and
    caves start with lighting switched on.
  - **Doors during play:** doors are not baked into the map image. A click by the game master on a door (tool
    “Select”) opens or closes it – on all displays. A closed door blocks light, an open one lets it out. In the panel
    on the right the door can be locked (lock symbol, game master only). The state is kept even when the map is
    changed in the map builder and applied again.
  - **Secret doors** look like wall on the game table; the game master sees them marked with a dashed outline. A
    click opens them: the passage appears and a piece of wall swings aside. After that the door counts as
    discovered – closed again, a fine seam stays visible in the wall (can be switched off on the right). Set them in
    the map builder with the door/window tool.
  - **Reveal room by room:** built maps know their rooms. The fog tool **Room** reveals the whole room you click in
    (walls and door frames included); with Shift it hides the room again. Doors, windows and interior walls separate
    rooms; outdoors keep using the brush or rectangle. With fog switched on, **opening a door** also reveals the rooms
    on both sides (switch off with “Doors reveal” in the bar of the Room tool, where you can also toggle between
    revealing and hiding).
  - **Lighting moods:** under “Fog, light & grid” buttons switch between day, dusk, night and “Underground”. “Dark
    indoors only” keeps the outdoors bright and darkens only rooms and caves – for the cellar below the tavern or a
    cave mouth by day. Daylight then falls into the room through windows that face the outdoors and scatters there:
    the whole room gets brighter, most of all near the window. Which areas count
    as outdoors can be corrected: choose “Yard” in the Room tool and click the area (courtyard, garden) – useful
    above all for imported maps.
  - **Animated map:** on powerful displays (rendering “Smooth” under Screens, e.g. Orange Pi Zero 2W or a PC) the
    trees bend in the wind – the gusts travel across the map as a wave –, waves run to the shore and the water
    glitters, cloud shadows drift across the map and now and then a bird flies past. Weak devices (Pi Zero 2 W) show
    the same map without motion. Can be switched off per map (“Animated” in the map builder). The motion shows on
    the game table and the player display, not in the game master's view.
    Kiosk devices (single-board computers) get a lean version: fewer swaying crowns, no cloud shadows, torches
    without a flickering glow – in return the map runs several times smoother there. The kiosk's resolution has the
    biggest influence on the frame rate: on the Orange Pi Zero 2W the table view with tokens and fog reaches about 27
    frames per second at 1080p, 38 at 1600 × 900 and 57 at 720p (display mode in the kiosk administration; effective
    from the kiosk image of this version).
    On the Orange Pi the kiosk shows at most 30 frames per second (Kiosk devices → Settings → Frame rate, can be set
    to 60): that halves the work of the graphics chip, and the device stays a few degrees cooler.
    If a kiosk device gets too hot (from 87 °C), the animation pauses by itself until it has cooled down – the map
    then stands still, everything else keeps running. The kiosk administration shows the temperature and the heat
    protection.
- **Importing maps with walls:** files in the Universal VTT format (`.dd2vtt`, `.uvtt`, `.df2vtt`), as exported by
  many map makers and map packs, can be uploaded under “New map” like an image. The map image is extracted; grid,
  walls, doors and light sources come along. The game master opens and closes doors with a click, and the Room tool
  reveals enclosed rooms.
- **Fog of war:** brush-based or rectangular, stored permanently across sessions.
- **Game table calibration:** resolution, aspect ratio, diagonal or physical dimensions – one grid square on the TV is
  always exactly 1″ × 1″.
- **Encounters:** place enemies/NPCs hidden in advance and reveal them with one tap.
- **Light:** static and flickering light sources, torches on tokens, ambient light.
- **Spells:** circle/sphere, cone, cube, line. By default an *effect*: it flashes briefly in the chosen colour on the
  table, the player display and the game master view (fireball wave, fanning cone, flaring cube; a line as projectile
  or beam) – six colours or your own. *Mark area* keeps it on the map with the affected squares highlighted (e.g. wall
  of fire); “Play effect” makes it flash again.
- **NPC & monster index:** creatures with a full 5e stat block, background and portrait. Import by copying and pasting a
  stat block (e.g. from D&D Beyond, German or English) or by searching freely licensed 5e data (SRD via open5e.com).
  While playing, place them directly as a token or add them to the initiative (d20 + DEX automatically).
- **NPC generator:** rolls name (matching the people), profession, appearance, personality, quirk, voice, ideal, bond,
  flaw, motivation and secret – each can be rerolled, with matching SRD stats. In play as a “spontaneous NPC” at the
  push of a button. Available in German and English.
- **Monster database:** search also with German names (“Eulenbär”, “roter Drache”), filter by type and challenge rating,
  preview of the stat block before importing.
- **Creature images:** when importing from the monster database, the image is taken over if Open5e has one (all monsters
  from “Tome of Beasts 2023”, only a few in the SRD). For NPCs and monsters there is a **portrait library** (70 images,
  sorted by people and gender) – the NPC generator suggests matching images from it, plus hand-drawn portraits; in the
  index via “Choose portrait”.
- **Encounter planner** (Creatures → Encounters): put together enemies from the index and set up the party with levels;
  the difficulty (trivial to deadly) is calculated following the Dungeon Master's Guide (XP × multiplier for the
  number of enemies, adjusted to the party size, against the party's XP thresholds), plus the XP reward. One click
  places the enemies hidden on the table map and adds them, together with the party, to the combat.
- **Combat manager** (5e rules, SRD): roll initiative, turns with automatic effects at the start/end of a turn
  (conditions with duration and saving throw, reaction, legendary actions, recharge 5–6, regeneration), damage with
  resistance/vulnerability/immunity and temporary HP, concentration checks, 0 HP with death saving throws and massive
  damage, roll attacks and damage right from the stat block and apply them to a target (with a hit check against AC),
  combat log. On the map HP bars above the token and condition markers; players see nothing, only a “bloodied” symbol
  (from 25 % or 50 %) or the bar, as you choose.
- **Break screen:** when the game master blacks out the table, it shows “Short break” with changing sayings or your own
  message (Screens → Game table). Available in German and English. On entry a die drops onto the map and a shock
  wave turns the table black; at the end it sinks into the table and a wave uncovers the map again.
- **Table rendering:** *Smooth* (60 frames/s, the fog follows the brush directly while revealing and fades out softly)
  or *Economical* for weak devices (30 frames/s, fog in steps). *Automatic* (default): kiosk devices depending on their
  hardware – Pi Zero 2 W/Pi 3 economical, Orange Pi and Pi 4/5 smooth –, all other browsers smooth. Switch under
  Screens → Game table, for a single browser also with `?perf=low` or `?perf=high` in the address.
- **LED strips (WLED):** any number of WLED controllers (ESP32/ESP8266), e.g. around the table and on the ceiling. Each
  strip either follows the game – combat glows red, blacking out calms it down, every map can have its own mood
  (tavern, candlelight, campfire, forest, cave, night, thunderstorm, magic, underwater) – or always keeps the same mood,
  for example “reading light” for reading notes. Set up under Screens → LED lighting (name, IP of the device, “Test
  connection”); while playing, the mood of the following strips can also be chosen by hand in the bar below the map.
  The server must be able to reach the devices on the network (fixed IP recommended). The server computes the effects
  itself and streams them live via DDP (UDP port 4048, in WLED under Sync “Receive UDP realtime” – on by default);
  changes are crossfaded smoothly. If the stream does not arrive, each strip can be switched to “WLED effects”.
- **Everything about the map in one place:** the “Map” panel holds the notes, handouts and lore of the open map –
  editable right there, handouts on the player display with one tap.
- **Notes:** map notes, running session notes, campaign notepad, handwritten notepad.
- **Lore:** entries with categories, pinned or linked to maps/sessions – they appear in context.
- **Player display:** handouts, maps, lore entries or read-aloud texts with a smooth crossfade.
- **Tablet & pen:** touch-optimised, pinch zoom, pen pressure, palm rejection (fingers pan, the pen draws).
- **Several devices:** laptop or tablet alone – or both in parallel (layout “companion instance”), everything in sync in
  real time.

## Start with Docker

Ready-made image from Docker Hub (`linux/amd64` and `linux/arm64`), straight from the published Compose file:

```bash
docker compose -f oci://docker.io/poldion/tabletop-forge-compose:latest up -d
```

Or with the `docker-compose.yml` from this repository:

```bash
docker compose up -d
```

Build from source yourself:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

For **TrueNAS SCALE** there is a template for “Install via YAML” in
[`deploy/truenas/docker-compose.yml`](../deploy/truenas/docker-compose.yml) (data in the automatically created app
volume, optionally your own dataset).

Then open `http://<server-ip>:3000` in the browser. All data (campaigns, uploads, calibration) is stored in the volume
`forge-data` under `/data` (in the TrueNAS template `dnd-data` for compatibility reasons). On the first start with an
empty data folder an example campaign is created to try things out (`DEMO_CAMPAIGN=en` for English, `0` turns it off).

## Sign-in and access from the internet

Without an account the app is open to everyone on the network, as before. As soon as the **first account** exists, it
is protected:

- **First account:** open `/login.html` and enter the **setup code** printed in the server log at start (TrueNAS: app →
  Logs; alternatively fixed via the environment variable `SETUP_CODE`). That way nobody else can take over a freshly
  reachable server. The first account is an admin.
- **User management** under “Users & devices” (header, or “Account” in the sidebar): create accounts, role (*Admin* or
  *Game master*), set a password, delete; everyone can change their own password.
- **Displays (game table, player display, kiosk):** a device that is not approved shows a code and a QR code. Scan it
  with your phone, sign in, give it a name, “Approve” – done. The display stays signed in until the approval is revoked
  under “Users & devices” (it then switches back to the QR code immediately). Displays may only read what they need to
  show.
- **Kiosk Pi:** every device has its own secret device key. Once approved via QR code, it signs its browser in by itself
  after every restart; settings such as Wi-Fi passwords are only handed to an approved device with a matching key.
  **Important:** first update kiosks to the current kiosk software and *then* create the first account – older kiosk
  software does not know about sign-in and can no longer load updates afterwards. Kiosks that already run the new
  software when the first account is created count as approved.

Sessions last 30 days (extended with use); passwords and sessions are only stored as hashes (`/data/auth.json`);
repeated failed attempts slow down sign-in.

**Running on the internet:** only behind a reverse proxy with **HTTPS** (e.g. Caddy, Nginx Proxy Manager, Traefik or a
Cloudflare tunnel) – without HTTPS the password and the sign-in cookie travel unencrypted. WebSockets must be passed
through. The server evaluates `X-Forwarded-Proto` and `X-Forwarded-For` from proxies in your own network; otherwise set
the variable `TRUST_PROXY` (Express syntax, e.g. `1` for exactly one proxy in front). If the address in the QR code is
wrong (the proxy does not pass on the host name), set `PUBLIC_URL`, e.g. `https://dnd.example.com`.

Example Caddy:

```
dnd.example.com {
    reverse_proxy 192.168.1.10:3000
}
```

## Language and units

The interface is available in German and English. Each device chooses its language itself (selection in the header, on
the sign-in page and under **Campaign**); without a choice the browser language applies. Game table and player view
follow the campaign's **display language**. Server messages come in the browser's language. The language packs live in
`public/i18n/` (the key is the German text; if a translation is missing, the German text appears).

Distances (ruler, area effects, light, grid size, stat blocks, conditions) are shown per campaign in **metric**
(1.5 m per square) or **imperial** (5 ft per square) – set under **Campaign**, independent of the language. Values are
always stored in feet, so switching does not change any data.

## AI services (optional)

Under **Services** (header, admins only) you can enter a language model, an image generator and BasaltNotes. Whatever
is not active there appears nowhere in the interface.

- **Language model** – any OpenAI-compatible interface (`/v1/chat/completions`), e.g. an Ollama proxy, Ollama itself or a
  cloud service. Address, model (selectable via “Test connection”) and optionally a key. Adds an **AI** button to the
  notes of sessions and maps, to lore entries and to the background of creatures: write out, read-aloud text, ideas,
  bullet points, flesh out an NPC or your own instruction. The suggestion can be edited before taking it over, then
  replace or append.
- **Image generator** – choose a provider: a **public service** with an OpenAI-compatible interface
  (`/v1/images/generations`, `/v1/images/edits` for "token from image") needs no AI of your own – enter the address (e.g.
  `https://api.openai.com`), key and model; each image costs money there and your descriptions are sent to that service.
  Or your own image app (ComfyUI) via its API (`/api/v1/workflows`, `/api/v1/generate`, `/api/v1/jobs`)
  with a key created there (`ig_…`). Adds **AI image** to creatures (token/portrait, also “token from image” from the
  existing portrait), **create map with AI** to the maps and **create image with AI** to the handouts. The matching
  workflow is preselected (token, battle map, location map, illustration). Generation runs in the background; finished
  images end up as a file in the campaign (with workflow and prompt), even if the dialog was closed before.

**Random encounter** (Creatures → Encounters, needs the language model): choose location, type (combat, NPCs,
obstacle) and difficulty – the AI drafts the scene, read-aloud text, enemies from the SRD (preferably from your own
index), NPCs, tactics, twist and loot. The enemies always fit the party: challenge ratings are derived from the level
and size of the party, then the number is brought to the chosen difficulty following the rules of the Dungeon Master's
Guide (with related enemies if needed, e.g. a hobgoblin to goblins; rather a little easier than too hard). With the
image generator a scene image and a battle map are created in the background; both are attached to the encounter and
the active session, and “To the map & into combat” then puts its own map on the table.

Addresses and keys are stored in `data/ai.json` on the server; the interface never sees the keys.

## Party and BasaltNotes

Under **Party** (preparation) you find the player characters of the campaign: name, player, people, class, level, HP,
AC, passive Perception, portrait (upload, from the handouts or via AI) and background. Level and number count for the
difficulty of encounters and random encounters, HP and AC for combat.

**BasaltNotes** (optional, under **Services**: address, API token with read access, vault): characters can be taken over
from the BasaltNotes campaign or linked one by one. The background is then shown from the character note (links open
BasaltNotes, editing happens there), images of the note can be used as a portrait. Each campaign chooses its vault and
BasaltNotes campaign on the campaign page (without a choice, the default vault from the services or the campaign with
the same name); linked characters remember their vault. The token is stored in `data/basalt.json` and never reaches the
interface; images are passed through the server.

### Rules (rulebook from BasaltNotes)

If the game rules (spells, conditions, rules chapters …) are kept as a separate vault in BasaltNotes, enter it under
**Services → BasaltNotes → Rulebook vault**. Then there is a **Rules** tab – as a page on the campaign level and as a
panel while playing:

- **Search:** full-text search in the rulebook with snippets. A hit opens the rule text right in the tab; references to
  other rules stay in the tab, ↗ opens the note in BasaltNotes.
- **Ask the AI:** only if the AI chat is switched on in BasaltNotes under *Settings → Features*. Ask a question (“How does
  the spell Wall of Fire work and how do I use it?”), BasaltNotes picks the matching entries and the language model
  explains them. Each answer lists its sources for further reading; follow-up questions refer to the previous topic,
  **New** starts a new conversation.

Without a rulebook vault the tab does not appear. The token only needs read access to this vault.

## Kiosk device for the game table (Raspberry Pi)

[`kiosk/`](../kiosk/README.en.md) contains a read-only Raspberry Pi image (e.g. Pi Zero 2 W) that starts the game table
display directly. Wi-Fi, server address, campaign and display type are controlled in the game master app under
**Screens → Kiosk devices**.

## Start without Docker

```bash
npm install
npm start
```

Environment variables: `PORT` (default 3000), `DATA_DIR` (default `./data`), `MAX_UPLOAD_MB` (default 200),
`SETUP_CODE` (fixed setup code for the first account), `TRUST_PROXY` and `PUBLIC_URL` (running behind a reverse proxy,
see “Sign-in”).

## Setting up devices

| Device | Address |
| --- | --- |
| Game master incl. preparation (laptop/tablet) | `/dm.html?c=<campaign>` |
| Game master display only (panel only, e.g. second tablet) | `/dm.html?c=<campaign>&layout=panel` |
| Game table (TV lying flat) | `/table.html?c=<campaign>` – optionally `&name=Table` as a label |
| Player display | `/player.html?c=<campaign>` |
| TV calibration | `/settings.html` – test pattern at `/table.html?calibrate=1` |

Every connected table display reports the area it actually shows; the game master view shows a labelled frame for
each. If the frame says “calculated”, no table display is connected.

The links are also on the start page for each campaign. On the displays choose “Full screen” once (the button appears
when the mouse moves).

### Calibrating the game table

1. Under **TV calibration** enter resolution, aspect ratio and diagonal (or width/height of the picture area).
2. Open the test pattern on the TV and measure the 10-square line (target: 25.4 cm).
3. Enter the measured value – the correction factor is calculated and applied right after saving.

### Keyboard shortcuts in the map view

`V` select · `T` TV area · `F` reveal fog · `H` hide fog · `K` token · `L` light · `A` spell area ·
`D` draw · `E` eraser · `M` measure · `P` ping · `Del` delete selection · `Esc` cancel

## Development

```bash
npm run dev   # server with automatic restart
npm test      # unit tests
```

Structure: `server/` (Express, Socket.IO, JSON persistence per campaign), `shared/` (state operations and calibration,
used by server and browser), `public/` (interface without a build step).

## Image credits

The portraits in `public/portraits/orchidrabbit/` come from “Fantasy Character Portraits vol.1” by
**orchidrabbit (remy ripple)**, <https://orchidrabbit.itch.io/portraitsvol1>, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The images are unchanged (only renamed).
