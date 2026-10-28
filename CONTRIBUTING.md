# Contributing

Thanks for your interest in Tabletop Forge! Bug reports, ideas, translations and pull requests are welcome.

When reporting a bug, describe what you did, what you expected and what happened. Helpful: the version (shown at
`/api/version`), browser, device (laptop, tablet, kiosk) and a screenshot if possible.

## Development setup

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev   # server with automatic restart, http://localhost:3000
```

Data is stored in `./data` (ignored by Git). Start with `DATA_DIR=/somewhere/else` to get an empty folder – the
example campaign is then created as well (`DEMO_CAMPAIGN=en` for English).

| Folder | Contents |
|---|---|
| `server/` | Express, Socket.IO, one JSON store per campaign, connections to AI services, BasaltNotes and WLED |
| `shared/` | Code for server and browser: state operations (`ops.js`), calibration, adventure scopes |
| `public/` | User interface – plain JavaScript ES modules, **no build step** |
| `kiosk/` | Build scripts for the Raspberry Pi image of the game table |
| `test/` | Unit tests |

Changes to a campaign's state are always operations (`set`, `del`, …) applied through `shared/ops.js`. The server
applies them, saves them and sends them to all connected devices.

## Tests

```bash
npm test      # unit tests with node:test, no extra dependencies
```

The CI runs the same tests on Node.js 20, 22 and 24 and builds the Docker image for amd64 and arm64. Please add a test
in `test/` for new logic where possible.

## Guidelines

- Modern JavaScript modules, no additional frameworks or build tools.
- Two-space indentation, single quotes, semicolons, lines up to about 120 characters.
- Code comments are in German; keep them short and explain the *why*. English comments in contributions are fine.
- New dependencies only with a good reason and a free license – add them to `THIRD_PARTY_NOTICES.md`.
- Small, self-contained commits with a meaningful message (English or German).
- No private data in code, tests or screenshots: no real IP addresses, API keys, Wi-Fi credentials or campaign files.
  Use invented demo data.
- Only contribute your own work or material under a suitable free license. Rules content only from the SRD
  (CC BY 4.0) – no protected text from rulebooks. Contributions are released under the [MIT License](LICENSE).

## Translations

The source language of the interface is **German**. Every visible string is written as `tr('German text')` in the
code or as `data-t="…"` in the HTML pages. Translations live in language packs under `public/i18n/<lang>.js` – an
object mapping *German text → translation*:

```js
export default {
  "Kampf beginnen": "Start combat",
  "Runde {n}": "Round {n}",
};
```

- **Placeholders** in curly braces (`{n}`, `{name}`) must be kept in the translation.
- `npm test` checks that **every** `tr()` and `data-t` text has an entry in the English pack and that no unknown
  placeholders are used. When you add a new text, add the English version right away.
- Longer content such as the NPC generator lists (`public/js/npc-gen-en.js`) and the fun facts and pause quotes
  (`public/js/funfacts.js`) have their own English versions.
- **New language:** create `public/i18n/<code>.js` (e.g. `fr.js`) and register it in `LANGUAGES` and `PACKS` in
  `public/js/i18n.js` and in `PACKS` in `server/i18n.js`. Missing entries simply stay German – an incomplete
  translation is a good start.

## Deutsch

Beiträge, Fehlerberichte und Pull Requests auf Deutsch sind genauso willkommen. Die Oberfläche ist im Code deutsch
geschrieben, und das Handbuch unter `docs/` sowie die Kiosk-Anleitung gibt es bisher nur auf Deutsch.
