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
- **Fog of war:** brush-based or rectangular, stored permanently across sessions.
- **Game table calibration:** resolution, aspect ratio, diagonal or physical dimensions – one grid square on the TV is
  always exactly 1″ × 1″.
- **Encounters:** place enemies/NPCs hidden in advance and reveal them with one tap.
- **Light:** static and flickering light sources, torches on tokens, ambient light.
- **Spell areas:** circle/sphere, cone, cube, line, with the affected squares highlighted.
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
  message (Screens → Game table). Available in German and English.
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
- **Image generator** – the image app (ComfyUI) via its API (`/api/v1/workflows`, `/api/v1/generate`, `/api/v1/jobs`)
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
