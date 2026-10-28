# Third-party software, data and images

The code of this repository is licensed under the [MIT License](LICENSE).

## Game rules (SRD 5.1)

This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and
available at <https://dnd.wizards.com/resources/systems-reference-document>. The SRD 5.1 is licensed under the
Creative Commons Attribution 4.0 International License available at
<https://creativecommons.org/licenses/by/4.0/legalcode>.

This covers the short summaries of conditions, damage types and combat rules (`public/js/rules5e.js`), the stat
templates of the NPC generator and the monster names (`public/js/monster-names-de.js`). These texts were shortened,
reworded and translated into German.

The example campaign (`server/demo/demo.js`) contains the statistics of the Goblin, Wolf and Commoner from the SRD 5.1
in their original English wording.

**Trademarks:** Dungeons & Dragons and D&D are trademarks of Wizards of the Coast LLC. Tabletop Forge is an unofficial
fan project, not affiliated with, endorsed, sponsored or approved by Wizards of the Coast.

## Monster database (Open5e, at runtime)

The monster search queries [api.open5e.com](https://open5e.com) at runtime. No Open5e data is bundled. Imported monsters
are licensed under the license of their source. Open5e states it per entry, and the app stores the source in the
creature's `source` field – e.g. SRD 5.1 (CC BY 4.0) or "Tome of Beasts 2023" by Kobold Press (ORC License or
OGL 1.0a). Anyone who redistributes imported data must observe these licenses.

## Images

| Images | Author | License |
|---|---|---|
| `public/portraits/orchidrabbit/` – "Fantasy Character Portraits vol.1" (<https://orchidrabbit.itch.io/portraitsvol1>) | orchidrabbit (remy ripple) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), unmodified, only renamed ([license text](public/portraits/orchidrabbit/LICENSE.txt)) |
| `public/favicon.svg`, splash images under `kiosk/` (made with `kiosk/splash/make-splash.mjs`, text set in DejaVu Sans – Bitstream Vera license) | own work | MIT |
| `server/demo/dorfplatz.png` – map of the example campaign (made with `server/demo/make-map.mjs`) | own work | MIT |
| `docs/bilder/tabletopforge.png` – screenshot of the example campaign | own work | MIT |

## Runtime software

| Component | License | Purpose |
|---|---|---|
| [Express](https://github.com/expressjs/express) | MIT | Web server |
| [Socket.IO](https://github.com/socketio/socket.io) | MIT | Real-time sync |
| [Multer](https://github.com/expressjs/multer) | MIT | Uploads |
| [sharp](https://github.com/lovell/sharp) | Apache-2.0 | Image processing |
| [libvips](https://github.com/libvips/libvips) (via sharp, prebuilt) | LGPL-3.0-or-later | Image processing; dynamically linked, unmodified |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | MIT | QR codes for pairing displays |

All other npm dependencies use permissive licenses (MIT, ISC, BSD-3-Clause, Apache-2.0).

## Kiosk image (`kiosk/`)

When building, the scripts download Raspberry Pi OS Lite or Buildroot with the Linux kernel, WPE WebKit/cog, Chromium
and other packages from their official sources. Most of them are licensed under the GPL, LGPL and other free licenses.
This repository only contains the build scripts. **Anyone who publishes finished images must meet the obligations of
these licenses**, e.g. offer the source code of the GPL components. The Buildroot build script creates an archive for
this automatically with `make legal-info` (`kiosk/dist/…-legal-info.tar`, see [kiosk/README.md](kiosk/README.md)).
