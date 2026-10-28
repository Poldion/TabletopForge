# Kiosk image for the game table (Raspberry Pi Zero 2 W)

🇬🇧 English · 🇩🇪 [Deutsch](README.md)

A lean, **read-only** Raspberry Pi OS image that shows the game table display in full screen right after booting.
Everything is controlled from the game master app under **Screens → Kiosk devices**.

Suitable for Raspberry Pi Zero 2 W, 3, 4 and 5 (64-bit). The Zero 2 W outputs at most 1080p – enough for the game
table, and the 1″ calibration calculates correctly by itself.

## Two variants

| | **Buildroot** (recommended for Pi Zero 2 W) | **Raspberry Pi OS Lite** |
| --- | --- | --- |
| Contents | only kernel, graphics driver, WPE WebKit/cog, NetworkManager, Python for the agent | complete Debian system, plus Chromium |
| Image | `tabletop-forge-kiosk-<version>-buildroot-<date>.img.xz` | `tabletop-forge-kiosk-<version>-<date>.img.xz` |
| Start | read-only from the first boot, no initial setup | one-time initial setup with a reboot |
| Build | `build-buildroot.ps1` (WSL on D:, first run several hours) | `build.ps1` (Docker, about 30 min) |
| Devices | Pi Zero 2 W only | Pi Zero 2 W, 3, 4, 5 |

Both use the same kiosk agent and the same `kiosk.json` and are controlled the same way from the game master app.
The Buildroot variant only has cog as its browser.

## How it works

| Area | Behaviour |
| --- | --- |
| Root file system | runs as an **overlay in RAM** – the SD card is never written during operation, a power cut is no problem |
| Boot partition | mounted **read-only**; holds `kiosk.json` with the device settings |
| Changing settings | the kiosk agent briefly remounts the boot partition **writable**, saves `kiosk.json` and immediately mounts it **read-only** again |
| Display | *cog* (WPE WebKit) directly via DRM/KMS in full screen, without a desktop – Chromium under *cage* as an alternative |
| Control | the agent checks in with the server every 15 s and applies changed settings and commands |
| Boot image | (Buildroot) a few seconds after power-on `kiosk-splash` writes the boot image straight into the frame buffer; start page, kiosk page and the table's loading screen look the same (dice in the middle, text facing all four sides of the table) – until the map or the setup instructions appear. Regenerate: `DEJAVU_DIR=<folder with DejaVuSerif*.ttf> node kiosk/splash/make-splash.mjs` |
| Boot order | (Buildroot) `kiosk-prepare` creates browser settings and start page without network, the browser starts in parallel with Wi-Fi |
| System image | (Buildroot) root file system as **SquashFS (zstd)** – only about a third has to be read from the SD card; two system slots A/B for updates over the network |
| Graphics | (Buildroot) graphics driver built into the kernel, graphics chip at 400 instead of 300 MHz (`config.txt`), font cache already in the image |
| Watchdog | (Buildroot) if the system hangs, the Pi restarts by itself after 14 s |
| Power supply | the agent reports undervoltage and temperature – warning in the game master app at the device |
| Sign-in | (from kiosk software 1.7) own secret device key in `kiosk.json` (`deviceKey`); if sign-in is set up on the server, a new device shows a QR code for approval once. After that the agent fetches a one-time sign-in for the browser on every start (`/run/kiosk/auth.json`, via the local start page) |

What the device shows (campaign, game table or player display) is stored **only on the server** – nothing has to be
written on the Pi for that.

## Setup mode (own hotspot)

If the Pi cannot find its Wi-Fi or the server, it opens its own hotspot – the instructions appear large on the TV:

| Situation | Hotspot after |
| --- | --- |
| no Wi-Fi entered | about 20 seconds |
| Wi-Fi entered but not connected | 90 seconds |
| Wi-Fi connected, server not reachable | 3 minutes |

1. Connect your phone to the Wi-Fi **DnD-Kiosk-xxxx** (the password is shown on the TV).
2. The setup page opens automatically (otherwise open `http://10.42.0.1`).
3. Choose the Wi-Fi from the list, enter password and server address, save.

As always, the settings are saved briefly writable → stored → read-only and reported to the server at the next
contact. If nobody enters anything, the Pi tries again with the previous data after 5 minutes.

## Backup of the settings

Every change is written to `kiosk.json.bak` and then `kiosk.json` – if the power fails exactly while saving, at least
one file is always complete. If `kiosk.json` is damaged, the agent loads the backup and repairs the main file
automatically.

## Setup

1. **Flash the image:** write `dist/tabletop-forge-kiosk-<version>-<date>.img.xz` to a microSD card with the
   *Raspberry Pi Imager* (“Use custom”) or balenaEtcher. Do **not** set any customisation (user/Wi-Fi) in the
   Imager – `kiosk.json` takes care of that.
2. **Adjust `kiosk.json`:** the card shows up on the PC as the drive “bootfs”. Open `kiosk.json` there and enter:
   ```json
   {
     "rev": 0,
     "serverUrl": "http://192.168.1.10:3000",
     "hostname": "dnd-table",
     "country": "DE",
     "wifi": [{ "ssid": "MY-WIFI", "psk": "MY-PASSWORD" }],
     "sshKeys": []
   }
   ```
3. **Start:** card into the Pi, HDMI to the TV, power on. The first start takes a few minutes: grow the file system →
   enable read-only operation → automatic reboot.
4. **Assign:** the device appears in the game master app under **Screens → Kiosk devices**. Choose campaign and display
   (game table / player display) there – the TV switches immediately.

## Controllable from the game master app

- Name, campaign, display type
- **Reload** (page), **restart browser**, **restart device**
- **Settings:** server address, host name, Wi-Fi country and Wi-Fi networks. Passwords are only transmitted, never shown
  again; an empty password field keeps the stored one.

## Monitor data (calibration per device)

Under **Screens → Kiosk devices → Settings → Monitor** you can store individual monitor data for each device:
resolution, aspect ratio, diagonal or width/height in mm, rotation, fine correction and the **HDMI output mode**. The
values are stored on the device in `kiosk.json` (briefly rw → ro); the game table display of this device uses them to
calculate the 1″ squares.

- Without its own monitor data the global TV calibration applies.
- **Show test pattern** displays the 10-square line on exactly this device; enter the measured value → **Calculate
  correction** → save.
- A changed HDMI mode is written to `cmdline.txt` and the device reboots once.
- If the device checks in with a newly set up server, the server takes over the monitor data from the device.
- Preset while building: `"monitor": { … }` in `kiosk.local.json` (see the example file).

## Browser: cog or Chromium

The default is **cog** (WPE WebKit): a lean browser for embedded devices that draws directly on the screen without a
compositor. On the Pi Zero 2 W (512 MB RAM) it starts much faster and needs only a fraction of Chromium's memory.
Chromium is still in the image and can be switched on per device (**Kiosk devices → Settings → Browser on the device**).

Further savings in the image: graphics memory (CMA) 128 instead of 256 MB, Bluetooth and maintenance timers (apt,
man-db, fstrim …) switched off, journal in RAM only, swap via zram only.

## White or flickering picture? – Graphics acceleration

The graphics chip of the Pi Zero 2 W and Pi 3 (VideoCore IV) only supports OpenGL ES 2.0. Current Chromium often draws
just a white area with it. That is why graphics acceleration in the browser is **automatically off** there (software
rendering) and on for Pi 4/5. It can be changed in the game master app (**Kiosk devices → Settings → Graphics
acceleration**) or in `kiosk.json`:

```json
"browser": { "engine": "cog", "gpu": "auto", "flags": "" }
```

`engine`: `cog` · `chromium`. `gpu`: `auto` · `on` · `off` (with cog: accelerated canvas).
`flags` can hold additional switches (`--…`) for the chosen browser.

## Updates over the network (Buildroot)

The SD card has two system slots: kernel etc. in `a/` and `b/` on the boot partition, the root file system on
partition 2 and 3. Which slot boots is set in `config.txt` (`os_prefix=a/`). Process:

1. The build creates `dist/tabletop-forge-kiosk-<version>.kup` next to the image – without private data.
2. Upload it in the game master app under **Screens → Kiosk devices → Kiosk updates**.
3. At the device, **install update**: the agent downloads the package straight into the free slot, checks the
   checksums and boots once **on trial** into the new system (`tryboot.txt`).
4. If the new system reaches the server, it becomes permanent (`config.txt` switched). If it does not start, hangs
   (watchdog) or does not check in within 10 minutes (`kiosk-trial-guard`), the Pi automatically falls back to the
   previous system on restart – the game master app shows this as an error.

`kiosk.json` (Wi-Fi, server, monitor data) stays unchanged during updates. Devices with an older image (without
system slots) have to be flashed once more.

## Hotspot password without a screen

When the Pi opens its setup hotspot, it also writes name and password to **`kiosk-hotspot.txt`** on the SD card (drive
“bootfs” on the PC).

## Troubleshooting without screen access

Because the system runs in RAM, logs are gone after a restart. For troubleshooting:

1. Open the SD card on the PC (drive “bootfs”) and create an empty file **`kiosk-debug.txt`** there.
2. Put the card back into the Pi, start it and let it run for a few minutes.
3. Open the card on the PC again: **`kiosk-log.txt`** contains a detailed log (services, network, memory, power supply,
   graphics, browser error messages). It is updated every minute – as always briefly writable → read-only.
4. To switch it off, delete `kiosk-debug.txt` again.

## Maintenance

- **SSH** is switched off. For maintenance enter public SSH keys in `sshKeys` – then SSH starts with key login (user
  `kiosk`, no password login).
- `sudo kiosk-rw` makes the boot partition and the underlying root file system (`/media/root-ro`) writable,
  `sudo kiosk-ro` switches back.
- Permanent changes to the system: `sudo overlayroot-chroot`, or switch the overlay off with
  `sudo raspi-config nonint do_overlayfs 1` (then reboot).
- **Buildroot variant:** the overlay is set up by `/sbin/overlay-init`. The root file system is SquashFS and always
  read-only – changes to the system only via an update package. There `kiosk-rw` only makes the boot partition writable.

## Tests

```bash
python kiosk/tests/test_agent.py
python kiosk/tests/test_ota.py       # update over the network (A/B, trial boot, fallback)
python kiosk/tests/test_monitor.py   # needs a running server (npm start)
```

Checks backup/repair, the setup page (including captive portal redirect) and – if a server runs locally at
`http://localhost:3000` – the synchronisation of local changes.

## Building the image yourself

### Buildroot variant

```powershell
cd kiosk
powershell -ExecutionPolicy Bypass -File .\build-buildroot.ps1
```

The build runs in its own WSL distribution `dnd-buildroot` under `D:\WSL\dnd-buildroot` (another location: environment
variable `KIOSK_WSL_DIR`). If it is missing, the script creates it from the Docker image `debian:trixie-slim`. Sources,
intermediate results and compiler cache (around 30 GB) live there – not on C:. The first run compiles WebKit and takes
several hours, later runs only a few minutes.

| File | Purpose |
| --- | --- |
| `buildroot/configs/dnd_kiosk_zero2w_defconfig` | package selection (Buildroot 2026.02 LTS) |
| `buildroot/board/zero2w/config.txt`, `cmdline.txt` | firmware and kernel parameters |
| `buildroot/board/zero2w/overlay/` | overlay init, browser, zram and NetworkManager settings |
| `buildroot/board/zero2w/post-build.sh` | enable services, fstab, permissions |
| `buildroot/board/zero2w/post-image.sh`, `genimage.cfg` | SD card image incl. `kiosk.json`, system slots A/B, update package `.kup` |
| `buildroot/board/zero2w/linux.fragment` | kernel: SquashFS, graphics driver built in (`build.sh` detects changes and rebuilds the kernel) |

Agent, start page and kiosk services come from `files/rootfs` – shared with the Raspberry Pi OS variant.

### Raspberry Pi OS variant

Needs Docker (on Windows: Docker Desktop).

### Presetting Wi-Fi and server address

So that the Pi joins the Wi-Fi without further work, the build reads the file `kiosk.local.json` (template:
`kiosk.local.example.json`) and lays it over the defaults:

```json
{
  "serverUrl": "http://192.168.1.10:3000",
  "hostname": "dnd-table",
  "country": "DE",
  "wifi": [{ "ssid": "MY-WIFI", "psk": "MY-WIFI-PASSWORD" }]
}
```

If the file is missing, `build.ps1` or `build.sh` asks for the values (password hidden) and creates it.
`kiosk.local.json` is in `.gitignore` and never checked in. Images with a preset Wi-Fi are called `…-privat.img.xz` –
they contain the Wi-Fi password and should not be passed on.

```powershell
cd kiosk
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

```bash
cd kiosk && ./build.sh
```

The build downloads the current *Raspberry Pi OS Lite (64-bit)*, enlarges it, installs `cog`, `cage`, Chromium,
`overlayroot` and `zram-tools` via ARM emulation, adds the files from `files/` and writes the result to `dist/`.
Duration 20–60 minutes depending on the machine.

| Path | Contents |
| --- | --- |
| `files/boot/kiosk.json` | template of the device settings |
| `files/rootfs/opt/kiosk/agent.py` | kiosk agent (Python, standard library only) |
| `files/rootfs/opt/kiosk/start.html` | local start page (waits for the server) |
| `files/rootfs/usr/local/bin/kiosk-browser` | starts cog or Chromium under cage |
| `files/rootfs/usr/local/sbin/kiosk-firstboot` | initial setup: overlay + read-only boot partition |
| `files/rootfs/etc/systemd/system/` | services `kiosk-setup`, `kiosk-agent`, `kiosk-browser`, `kiosk-firstboot` |
| `build/` | Docker build environment |

## Passing on images (licenses)

The images contain free software under GPL, LGPL and other licenses (Linux kernel, BusyBox, WPE WebKit, cog …).
**Anyone who passes on or publishes a finished image must fulfil their obligations** – above all offer the source code
of the GPL components.

- **Buildroot image:** `build.sh` automatically puts `dist/tabletop-forge-kiosk-<version>-legal-info.tar` next to the
  image (Buildroot `make legal-info`: license texts, sources and patches of all packages). Offer this archive together
  with the image. Switch it off for pure test builds: `KIOSK_LEGAL_INFO=0`.
- **Raspberry Pi OS image:** based on the official Raspberry Pi OS Lite; the sources of the included packages are
  provided by Raspberry Pi and Debian (<https://archive.raspberrypi.com/debian/>, <https://sources.debian.org/>). When
  passing it on, refer to these sources or offer them as well.
- **Private data:** never pass on images with a preset Wi-Fi (`kiosk.local.json`, file name ends in `-privat`).
