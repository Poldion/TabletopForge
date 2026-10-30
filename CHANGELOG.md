# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

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
