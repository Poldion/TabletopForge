# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.62.0] – 2026-11-28

### Added

- **Rules page for players.** Players open `/regeln` on their phone, enter a four-digit code the game master hands
  out, and can then search the rulebook, read rules and ask the AI rules questions – nothing else in the app. The code
  is shown in the game master's header bar (“Rules: 1234”); a click opens the QR code, the address, “New code”, how
  often the code changes (daily at 5 am, weekly on Mondays at 5 am, or only manually) and an on/off switch. Every new
  code logs all guests out, so nobody keeps access after leaving the table. Wrong codes are throttled like passwords,
  and each guest can ask at most 20 questions per 10 minutes. Needs the rulebook vault in BasaltNotes.

## [0.61.0] – 2026-11-26

### Added

- **Ground zones in the map builder.** The new terrain brush “Ground” lays forest floor, gravel, ruined paving
  (broken slabs with gaps and rubble), mud, leaves, ash or snow over the map; each blends into its surroundings with a
  ragged, soft edge. “Gloomy” darkens and desaturates everything inside, trees and objects included – for cursed or
  eerie parts of a map.
- **Swamp.** New environment with murky water and olive ground, and a fill area “Swamp” with gnarled and dead trees,
  reeds, puddles and lily pads on the water.
- **Things for outdoor maps:** ruined wall, ruined wall corner, ruined archway, stairs down, toppled statue, roots,
  deadwood, leaf pile, moss and pebbles; fill areas “Ruin”, “Deadwood” and “Graves”.
- **The AI builds outdoor battle maps.** Drafts can contain ground zones and the new fill areas; the instructions
  explain zones with soft transitions, a point of interest, cover every few squares and open ground. Fill areas bring
  their ground along (a ruin lies on gravel and old paving, a swamp on mud), tree borders get dark forest floor, and
  paths swing gently instead of running ruler-straight. A gloomy zone the model places on empty ground moves over the
  eerie point of interest (ruin, graves, stairs down), ruined rooms hold no intact furniture (only stone pieces,
  rubble and moss), and large stretches of open ground without any cover get small groups of bushes, rocks or deadwood.
  Ground zones fade out over several squares, with pebbles, leaves and moss scattered into the transition.

### Removed

- **Maps from the image generator.** The button “Generate map with AI” on the maps page and the option “Generate battle
  map” in the random encounter are gone: the pictures did not work as maps (no grid alignment, no walls, unusable
  layouts). Maps are made in the map builder, which can also draft them with the language model. Scene pictures,
  tokens and handouts still come from the image generator.

### Changed

- **Building with AI places furniture more sensibly.** The language model now only chooses what stands in a room and
  how many pieces; where each piece goes follows fixed rules per item: shelves, beds, bars and fireplaces against a
  wall, barrels, sacks and crates in the corners, rugs on the floor. Stools and chairs listed on their own move to a
  table, and tables without seats get the usual ones. Several equal pieces in the middle of a room (tables, pews,
  crates) stand in rows with aisles and share one orientation; a single piece goes to the middle or onto the rug. The
  number of pieces is capped by the room size. Objects the model places inside a room become part of that room's
  furnishing, beds or shelves out in the open are dropped, and loose objects keep some distance from outer walls.
  Outdoor things (wells, carts) are no longer offered for rooms. Wall pieces spread over all walls instead of
  crowding one, tall ones (shelves, wardrobes, fireplaces) keep windows free, and the widest go first so a bar still
  finds its wall. A theme named together with a few extra pieces keeps the theme and adds the pieces.
- **AI map drafts are tidied before they are built.** Overlapping rooms are trimmed, gaps of one square between rooms
  are closed so they share a wall, rivers run on to the map edge instead of ending as ponds, bridges snap across the
  water with a path leading over them, paths end at a door, another path, an object or the map edge (a path that hits
  an outer wall gets a door there), four or more standing stones form a circle, and map edges without vegetation get
  a loose border of trees (rocks in the desert). Rivers meander in wide, smooth bends instead of running almost
  straight; bends never get tighter than the river is wide, and paths ending at the water stop at the bank. A forest the model spreads over the whole map becomes a ring
  around a clearing, bridges without water nearby are dropped, nothing blocks the space in front of an outer door,
  and objects placed in the solid rock of a dungeon move into the nearest room.
- **The bar leaves room for the innkeeper.** It stands one square away from the wall, on the side towards the
  kitchen where possible, with nothing placed behind it and its bar stools in a row in front. Tables no longer go on
  top of a staircase, trapdoor or glyph – only onto rugs.

## [0.60.1] – 2026-11-23

### Fixed

- Heat protection for kiosk devices: once triggered, it never released on a device that is already warm when idle –
  the animated map stayed paused for good. The animation only accounts for a few degrees (Orange Pi Zero 2W in a
  case: 78–79 °C with the map at rest, 82–83 °C animated at 30 frames per second), so the thresholds now sit closer
  together: pause from 87 °C, release at 82 °C (before: 85 and 75 °C). The warning in the kiosk administration names
  the temperature at which the map resumes.

## [0.60.0] – 2026-11-23

### Added

- **Heat protection for kiosk devices.** Some single-board computers (Orange Pi Zero 2W) do not throttle on their own
  and only switch off hard at 100 °C. The heat comes mostly from the graphics chip drawing the animated map, so the
  protection starts there: from 85 °C (two readings in a row) the table display pauses the animation of the map
  until the device has cooled down by 10 degrees. As a last resort the device also limits its processor clock from
  90 °C (kiosk image of this version). The kiosk administration shows the temperature and when the protection is
  active; the reported temperature is now that of the warmest sensor.
- **Frame rate limit for kiosk devices** (Kiosk devices → Settings → Frame rate; kiosk image of this version). As long
  as something moves, the browser recomposes the whole picture 60 times per second – on a single-board computer that
  is what keeps the graphics chip busy and hot. The Orange Pi now shows at most 30 frames per second unless set to
  60: half the work for the graphics chip, and the animated map keeps running instead of pausing when hot (Orange Pi
  Zero 2W, table view at 720p: 80–81 instead of 83–84 °C).

## [0.59.0] – 2026-11-23

### Added

- **Storeys** in the map builder: build up to four upper floors (tower room, gallery, attic) and up to three
  basements (cellar, crypt, tunnels in the rock) on one map. During play the map shows the ground floor uncovered;
  the game master picks a storey from a switch when the party takes the stairs. On an upper floor, what lies below
  shows through darkened. Each storey has its own doors, lights, names, fog and lighting, and tokens belong to a
  storey – they are only visible there and can be moved up or down in the inspector.
- **Building with AI** (with a language model configured): furnish a room from a description in your own words, or
  have a whole map drafted – rooms with doors and windows, furnishing, water, paths, trees and place names. The model
  delivers a plan; the map builder builds it by its own rules.
- **Placement options** for objects: keep one variant or change it with every placement, pick a variant from a strip
  of previews, rotate each new piece slightly, in 90° steps or freely, and mirror it at random.

### Changed

- **Much smoother table display on kiosk devices.** On single-board computers every full-screen layer the browser
  stacks over the map costs time in each frame. The table display now keeps the map image out of the layer stack,
  puts tokens, darkness and fog on a single layer that disappears when empty, and uses a lean version of the animated
  map. Measured on an Orange Pi Zero 2W with tokens, fog and lighting: 7 → 27 frames per second at 1080p, 16 → 57
  at 720p.
- **Kiosk image (Orange Pi):** the configured display mode now takes effect under the kiosk compositor – before, the
  screen always ran at its preferred mode (1080p). Needs the kiosk image of this version.
- Animated maps: the trees now bend in gusts of wind that travel across the map.
- Daylight through windows scatters in the room: with “dark indoors only” a room with windows is lit softly from
  the windows instead of showing a sharp cone of light (apply the map once more for existing maps).
- Trees in built maps cast a longer shadow.

## [0.58.0] – 2026-11-22

### Added

- **Furnish rooms with one click** in the map builder: choose a theme (taproom, kitchen, bedchamber, storeroom, smithy,
  library, chapel, guard room, crypt, prison cell) and the room is furnished – wall pieces with their backs to the
  wall, tables with stools, doors kept clear. Re-roll or dissolve at any time.
- **Names on the map:** a text tool for places and quarters. Names are drawn during play instead of being baked into
  the image, so the game master can show or hide each one for the players.
- **Selecting several items** in the map builder: frame or Shift+click, move together, duplicate, copy and paste –
  also into another map.
- **Gates:** a two-square opening with two leaves; in a castle wall it gets two gate towers. Opens and closes during
  play like a door. A closed wall ring can be given a moat with one click.
- **Universal VTT import:** `.dd2vtt`, `.uvtt` and `.df2vtt` files can be uploaded as maps – the image is extracted,
  and grid, walls, doors and lights come along. Doors can be opened and closed, rooms revealed with the Room tool.
- **Timber walls** for rooms in the map builder (log cabin, barn, hut): beams and corner posts instead of masonry.
- **Daylight through windows:** with “dark indoors only”, light falls into rooms through windows that face the
  outdoors (maps from the map builder; apply the map once more to get it on existing maps).
- **Ramps:** where a path or street crosses the edge of raised ground, the rock edge is left out and the way runs up.
- **Marking yards:** the Room tool has a “Yard” mode – a clicked area counts as under open sky and stays bright with
  “dark indoors only”. Handy for imported maps.
- Names on the map come in a fourth, very large size for overview maps.

### Changed

- House quarters now line streets and paths first (fronts facing the street); the rows behind run in the same
  direction as their street, and they keep clear of placed buildings. Gaps are filled more densely, and small trees
  and bushes grow in the yards where no house fits. Erased stretches of a street no longer attract houses.
- Closed castle wall rings carry battlements on the outside only, with a parapet towards the yard.
- Tall buildings cast their shadow onto the roofs of lower neighbours.
- A secret door stays recognisable as a fine seam once it has been opened (can be switched off per door).
- Calmer paved ground in the town environment. Cast shadows are now neutral instead of slightly violet.
- Pasting a copied group keeps all of it inside the map; in a group, doors and windows move only together with
  their wall.

## [0.57.0] – 2026-11-20

### Added

- **Map builder** (Maps → “Build your own map”): put together maps in a hand-drawn style without an image file.
  Paint terrain with a brush (water with a sandy rim, paths, dirt, rock plateaus in up to three levels), draw rooms as
  rectangles or circles – overlapping and adjoining rooms merge into one building with a stone wall around the combined
  outline –, set the floor of each room with one click, add interior walls, doors and windows, and place objects from a
  searchable catalogue of about 150 pieces (furniture, supplies, dungeon, buildings, outdoors, nature, ship & harbour).
  Arrow keys nudge the selection, F mirrors, Alt+click picks an object as the template, a “Recently used” row speeds up
  furnishing; moving a room takes its doors, windows, interior walls and furniture along. A table frame shows what fits
  on the game table at once, and “Extend …” adds squares on any side of the map.
- **Fill areas:** drag out a circle or rectangle and it fills itself with trees, bushes, rocks or a mix – only on free
  ground. Every piece can be moved individually afterwards; re-roll or change the density at any time.
- **Eight environments** for built maps: meadow, desert (palms), tundra (conifers), magic forest, shire, town, dungeon
  and cave. Ground, rock, water and trees change with the environment.
- **Dungeons, caves and ruins:** in the dungeon and cave environments the map is solid rock – draw rooms and corridors,
  or paint natural caverns with the cave brush (rock rim, wall shadow, rock islands). Rooms can be marked as ruins:
  crumbling walls with gaps and rubble, overgrown floors. A dungeon catalogue adds pillars, sarcophagi, traps, treasure,
  crystals, a magic circle and more.
- **Overview maps** for villages, towns and castles: an overview scale places trees small, and a buildings catalogue adds
  roofed houses (the bright side of the roof follows the light when rotated), church, windmill, towers, keep, gatehouse,
  bridge, fields and a ship. A castle wall tool draws walls with battlements and towers. Maps can be up to 80 squares
  wide or high.
- **Cities and fortresses:** a “Houses” fill area fills a dragged-out area with rows of small town houses (seven roof
  colours, several roof shapes, fronts facing the lane), a “Street” terrain brush paints paved streets and squares,
  long wall runs are set point by point, and a palisade joins the castle wall (now broader, with larger corner
  towers). New buildings: town house, row of houses, courtyard house, town hall, great hall, warehouse, market hall,
  stable, square tower, large round tower, bastion, drawbridge. Templates “Riverside city” (80 × 45 squares) and
  “Hilltop fortress” (60 × 40). Paths, dirt and streets are now drawn on raised ground as well. Shadows follow the
  height of buildings. Large maps load and redraw much faster; as a side effect trees, bushes and rocks of existing
  built maps may get a slightly different shape the next time the map is applied.
- **Walls stop light:** on built maps light ends at walls and falls through doors and windows. Fireplaces, campfires,
  braziers, lanterns, wall torches, candles and street lamps become light sources of the map.
- **Doors open and close during play:** on built maps the game master clicks a door to open or close it on all
  displays; a closed door blocks light. Doors can be locked. **Secret doors** look like wall on the table until the
  game master opens them.
- **Reveal fog room by room:** built maps know their rooms – the new fog tool “Room” reveals a whole room with one
  click (Shift or the toggle in its bar hides it again). Opening a door reveals the rooms on both sides.
- **Templates and scene files:** start a built map from a template (lakeside tavern, crypt, cave, overgrown ruin,
  riverside village, riverside city, hilltop fortress) and save or load a scene as a file.
- **Lighting moods:** day, dusk, night and underground with one click; “dark indoors only” keeps the outdoors bright
  and darkens only rooms and caves of a built map. Dungeons and caves start with lighting switched on.
- **Animated maps** on powerful displays: swaying trees, waves and glitter on the water, drifting cloud shadows and
  the occasional bird. Weak devices show the same map without motion; can be switched off per map.

### Fixed

- Keyboard shortcuts of the map view (Delete, tool keys) only act while the map is visible.

## [0.56.0] – 2026-11-16

### Added

- **Spell effects:** the spell tool now plays a short animation in the chosen colour on the game table, the player
  display and other game master devices – a fireball wave with flash, shock ring and sparks; a cone that fans out with
  ripples; a cube that flares up; a line as a flying projectile (fire arrow) or a flashing beam (lightning bolt).
  Red looks like fire, blue like water or ice. Six preset colours plus a free colour choice.
- *Mark area* keeps the previous behaviour (area stays on the map with the affected squares highlighted, e.g. wall of
  fire); a marked area can play its effect again from its info box.

## [0.55.0] – 2026-11-16

### Added

- Break screen with an entrance and an exit: a die drops onto the still visible map and a shock wave turns the table
  black from the point of impact; when the break ends, the die sinks into the table and a wave uncovers the map from the
  inside out. Only transforms and opacity (plus a half-resolution canvas for the exit wave), so weak devices keep up.

### Changed

- Soft fog edge: from fully transparent to fully opaque over 1½ grid cells (was about half a cell).

### Fixed

- Game table and player display now follow the game master's language when the campaign has no display language of its
  own ("same as the game master"); before, they fell back to the browser language of the device – English on the kiosk.

## [0.54.0] – 2026-11-16

### Added

- Kiosk for the **Orange Pi Zero 2W** (Allwinner H618, Mali-G31): lean Buildroot image with updates over the network
  (system slots A/B, trial start via U-Boot), built with `build-buildroot.ps1 opizero2w`. The browser (WPE WebKit/cog)
  runs in the Wayland kiosk cage; on the 1 GB board about 700 MB stay free for maps and effects. An Armbian-based
  image (`build.ps1 orangepi`) is available for trying things out.
- Game table **rendering** under Screens → Game table: *Smooth* (60 frames/s, the fog follows the brush while
  revealing and fades out softly) or *Economical* for weak devices. *Automatic* (default) picks it per kiosk device
  from its hardware (Pi Zero 2 W/Pi 3 economical, Orange Pi and Pi 4/5 smooth); other browsers run smooth.
  `?perf=low|high` in the address overrides it for a single browser.
- Kiosk devices report their board and system (Buildroot, Raspberry Pi OS, Armbian); the device list shows it and
  update packages are only offered to – and accepted for – the board they were built for.

### Changed

- Revealing fog redraws only the fog layer and, on capable devices, only the area of the new brush strokes.
- Kiosk: if display output and graphics chip are separate devices (Orange Pi, Pi 4/5), cog runs inside cage
  instead of directly on the screen; the mouse pointer is hidden.

### Fixed

- `kiosk/build.ps1` lost its path separators and could not run.

## [0.53.0] – 2026-10-30

### Added

- Image generator: besides your own image app, any public service with an OpenAI-compatible image API can now be
  connected (address, key, model), so no self-hosted AI is needed. Tokens, battle maps, location maps and illustrations
  work out of the box; "token from image" needs a service with image editing.

## [0.52.1] – 2026-10-29

### Added

- English versions of the manual (`docs/manual.md`) and the kiosk guide (`kiosk/README.en.md`); the English README
  links to them, every manual has a language switch at the top.

## [0.52.0] – 2026-10-28

### Added

- Optional **Rules** tab: set a rulebook vault in BasaltNotes under Services. Full-text search with snippets and the
  rule text right in the tab; if BasaltNotes' AI chat is switched on, ask questions about the rules and get an
  explanation with sources. Available as a campaign page and as a panel while playing.

## [0.51.1] – 2026-10-28

### Added

Initial public release.

- Campaigns organised into adventures and sessions, with a library for maps and images
- Session preparation with scenes, read-aloud text, a "Ready?" check, script-guided play with improvisation tools and
  a wrap-up with recap
- Digital game table on a TV lying flat with an exactly calibrated 1″ grid, fog of war, light, spell areas and ruler
- Player display for handouts, maps, lore and read-aloud text
- Creature index with 5e stat blocks, Open5e import, NPC generator, encounter planner and combat manager
- Optional AI services (OpenAI-compatible language model, ImageGen), BasaltNotes integration and WLED lighting
- Read-only Raspberry Pi kiosk image for the game table
- Accounts with admin and GM roles, displays paired by QR code
- English and German interface, metric or imperial units per campaign
- Example campaign on first start

## 0.1.0 – 0.51.0

Development before the public release.

[0.53.0]: https://github.com/Poldion/TabletopForge/releases/tag/v0.53.0
[0.52.0]: https://github.com/Poldion/TabletopForge/releases/tag/v0.52.0
[0.51.1]: https://github.com/Poldion/TabletopForge/releases/tag/v0.51.1
