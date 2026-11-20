# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

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
