# Kiosk-Image für den Spieltisch (Raspberry Pi Zero 2 W)

Ein schlankes, **schreibgeschütztes** Raspberry-Pi-OS-Image, das direkt nach dem Start die
Spieltisch-Anzeige im Vollbild zeigt. Gesteuert wird alles aus dem DM-System unter
**Bildschirme → Kiosk-Geräte**.

Geeignet für Raspberry Pi Zero 2 W, 3, 4 und 5 (64-bit). Der Zero 2 W gibt maximal 1080p aus –
für den Spieltisch reicht das, die 1″-Kalibrierung rechnet automatisch richtig.

## Zwei Varianten

| | **Buildroot** (empfohlen für Pi Zero 2 W) | **Raspberry Pi OS Lite** |
| --- | --- | --- |
| Inhalt | nur Kernel, Grafiktreiber, WPE WebKit/cog, NetworkManager, Python für den Agenten | komplettes Debian-System, zusätzlich Chromium |
| Image | `tabletop-forge-kiosk-<version>-buildroot-<datum>.img.xz` | `tabletop-forge-kiosk-<version>-<datum>.img.xz` |
| Start | schreibgeschützt ab dem ersten Start, keine Ersteinrichtung | einmalige Ersteinrichtung mit Neustart |
| Bauen | `build-buildroot.ps1` (WSL auf D:, erster Lauf mehrere Stunden) | `build.ps1` (Docker, ca. 30 min) |
| Geräte | nur Pi Zero 2 W | Pi Zero 2 W, 3, 4, 5 |

Beide verwenden denselben Kiosk-Agenten, dieselbe `kiosk.json` und lassen sich gleich aus dem
DM-System steuern. In der Buildroot-Variante gibt es nur cog als Browser.

## Funktionsweise

| Bereich | Verhalten |
| --- | --- |
| Root-Dateisystem | läuft als **Overlay im RAM** – die SD-Karte wird im Betrieb nie beschrieben, Strom weg ist kein Problem |
| Boot-Partition | **schreibgeschützt** eingehängt; enthält `kiosk.json` mit den Geräte-Einstellungen |
| Einstellungen ändern | der Kiosk-Agent hängt die Boot-Partition kurz **beschreibbar** ein, speichert `kiosk.json` und hängt sie sofort wieder **schreibgeschützt** ein |
| Anzeige | *cog* (WPE WebKit) direkt per DRM/KMS im Vollbild, ohne Desktop – Chromium unter *cage* als Alternative |
| Steuerung | der Agent meldet sich alle 15 s beim Server, übernimmt geänderte Einstellungen und Befehle |
| Startbild | (Buildroot) wenige Sekunden nach dem Einschalten schreibt `kiosk-splash` das Startbild direkt in den Bildspeicher; Startseite, Kiosk-Seite und Ladebildschirm des Tischs sehen genauso aus (Würfel in der Mitte, Text zu allen vier Tischseiten) – bis die Karte oder die Einrichtungs-Anleitung erscheint. Neu erzeugen: `DEJAVU_DIR=<Ordner mit DejaVuSerif*.ttf> node kiosk/splash/make-splash.mjs` |
| Startreihenfolge | (Buildroot) `kiosk-prepare` legt ohne Netzwerk Browser-Einstellungen und Startseite an, der Browser startet parallel zum WLAN-Aufbau |
| Systemabbild | (Buildroot) Root-Dateisystem als **SquashFS (zstd)** – von der SD-Karte muss nur rund ein Drittel gelesen werden; zwei Systemplätze A/B für Updates über das Netz |
| Grafik | (Buildroot) Grafiktreiber fest im Kernel, Grafikchip mit 400 statt 300 MHz (`config.txt`), Schriften-Cache schon im Image |
| Watchdog | (Buildroot) hängt das System, startet der Pi nach 14 s von selbst neu |
| Stromversorgung | der Agent meldet Unterspannung und Temperatur – Warnung im DM-System beim Gerät |
| Anmeldung | (ab Kiosk-Software 1.7) eigener geheimer Geräteschlüssel in `kiosk.json` (`deviceKey`); ist auf dem Server die Anmeldung eingerichtet, zeigt ein neues Gerät einmal einen QR-Code zum Freigeben. Danach holt der Agent nach jedem Start eine Einmal-Anmeldung für den Browser (`/run/kiosk/auth.json`, über die lokale Startseite) |

Was das Gerät anzeigt (Kampagne, Spieltisch oder Spieler-Display), wird **nur auf dem Server**
gespeichert – dafür muss auf dem Pi gar nichts geschrieben werden.

## Einrichtungsmodus (eigener Hotspot)

Findet der Pi sein WLAN oder den Server nicht, öffnet er einen eigenen Hotspot – die Anleitung
erscheint groß auf dem TV:

| Situation | Hotspot nach |
| --- | --- |
| kein WLAN eingetragen | ca. 20 Sekunden |
| WLAN eingetragen, aber nicht verbunden | 90 Sekunden |
| WLAN verbunden, Server nicht erreichbar | 3 Minuten |

1. Mit dem Handy mit dem WLAN **DnD-Kiosk-xxxx** verbinden (Passwort steht auf dem TV).
2. Die Einrichtungsseite öffnet sich automatisch (sonst `http://10.42.0.1` aufrufen).
3. WLAN aus der Liste wählen, Passwort und Server-Adresse eintragen, speichern.

Die Einstellungen werden wie immer kurz beschreibbar → gespeichert → schreibgeschützt gesichert
und beim nächsten Kontakt an den Server gemeldet. Trägt niemand etwas ein, versucht der Pi es nach
5 Minuten erneut mit den bisherigen Daten.

## Sicherung der Einstellungen

Jede Änderung wird nacheinander in `kiosk.json.bak` und `kiosk.json` geschrieben – bei einem
Stromausfall genau im Speichermoment ist immer mindestens eine Datei vollständig. Ist `kiosk.json`
beschädigt, lädt der Agent die Sicherung und repariert die Hauptdatei automatisch.

## Einrichtung

1. **Image flashen:** `dist/tabletop-forge-kiosk-<version>-<datum>.img.xz` mit dem *Raspberry Pi Imager*
   („Eigenes Image verwenden“) oder balenaEtcher auf eine microSD-Karte schreiben.
   Im Imager **keine** Anpassungen (Benutzer/WLAN) setzen – das übernimmt `kiosk.json`.
2. **`kiosk.json` anpassen:** Die Karte erscheint am PC als Laufwerk „bootfs“. Dort `kiosk.json`
   öffnen und eintragen:
   ```json
   {
     "rev": 0,
     "serverUrl": "http://192.168.1.10:3000",
     "hostname": "dnd-tisch",
     "country": "DE",
     "wifi": [{ "ssid": "MEIN-WLAN", "psk": "MEIN-PASSWORT" }],
     "sshKeys": []
   }
   ```
3. **Starten:** Karte in den Pi, HDMI an den TV, Strom an. Der erste Start dauert einige Minuten:
   Dateisystem vergrößern → schreibgeschützten Betrieb aktivieren → automatischer Neustart.
4. **Zuweisen:** Im DM-System unter **Bildschirme → Kiosk-Geräte** erscheint das Gerät. Dort
   Kampagne und Anzeige (Spieltisch / Spieler-Display) wählen – der TV wechselt sofort.

## Im DM-System steuerbar

- Name, Kampagne, Anzeigeart
- **Neu laden** (Seite), **Browser neu starten**, **Gerät neu starten**
- **Einstellungen:** Server-Adresse, Hostname, WLAN-Land und WLAN-Netze. Passwörter werden nur
  übertragen, nie wieder angezeigt; ein leeres Passwortfeld behält das gespeicherte.

## Monitordaten (Kalibrierung pro Gerät)

Unter **Bildschirme → Kiosk-Geräte → Einstellungen → Monitor** lassen sich für jedes Gerät eigene
Monitordaten hinterlegen: Auflösung, Bildformat, Diagonale oder Breite/Höhe in mm, Drehung,
Feinkorrektur und der **HDMI-Ausgabemodus**. Die Werte werden auf dem Gerät in `kiosk.json`
gespeichert (kurz rw → ro); die Spieltisch-Anzeige dieses Geräts rechnet damit die 1″-Felder.

- Ohne eigene Monitordaten gilt die globale TV-Kalibrierung.
- **Testmuster zeigen** blendet auf genau diesem Gerät die 10-Felder-Linie ein; den gemessenen
  Wert eintragen → **Korrektur berechnen** → speichern.
- Ein geänderter HDMI-Modus wird in `cmdline.txt` eingetragen und das Gerät startet einmal neu.
- Meldet sich das Gerät bei einem neu aufgesetzten Server, übernimmt dieser die Monitordaten vom Gerät.
- Vorbelegen beim Bauen: `"monitor": { … }` in `kiosk.local.json` (siehe Beispieldatei).

## Browser: cog oder Chromium

Standard ist **cog** (WPE WebKit): ein schlanker Browser für Embedded-Geräte, der ohne Compositor direkt
auf den Bildschirm zeichnet. Auf dem Pi Zero 2 W (512 MB RAM) startet er deutlich schneller und braucht
nur einen Bruchteil des Speichers von Chromium. Chromium ist weiter im Image und lässt sich pro Gerät
einschalten (**Kiosk-Geräte → Einstellungen → Browser auf dem Gerät**).

Weitere Sparmaßnahmen im Image: Grafikspeicher (CMA) 128 statt 256 MB, Bluetooth und Wartungs-Timer
(apt, man-db, fstrim …) abgeschaltet, Journal nur im RAM, Swap ausschließlich über zram.

## Bild weiß oder flackert? – Grafikbeschleunigung

Der Grafikchip des Pi Zero 2 W und Pi 3 (VideoCore IV) kann nur OpenGL ES 2.0. Aktuelles Chromium
zeichnet damit oft nur eine weiße Fläche. Darum ist die Grafikbeschleunigung im Browser dort
**automatisch aus** (Software-Darstellung), auf Pi 4/5 an. Umstellen lässt sich das
im DM-System (**Kiosk-Geräte → Einstellungen → Grafikbeschleunigung**) oder in `kiosk.json`:

```json
"browser": { "engine": "cog", "gpu": "auto", "flags": "" }
```

`engine`: `cog` · `chromium`. `gpu`: `auto` · `on` · `off` (bei cog: beschleunigtes Canvas).
In `flags` können zusätzliche Schalter (`--…`) für den gewählten Browser stehen.

## Updates über das Netz (Buildroot)

Die SD-Karte hat zwei Systemplätze: Kernel & Co. in `a/` bzw. `b/` auf der Boot-Partition, das
Root-Dateisystem auf Partition 2 bzw. 3. Welcher Platz startet, steht in `config.txt`
(`os_prefix=a/`). Ablauf:

1. Beim Bauen entsteht neben dem Image `dist/tabletop-forge-kiosk-<version>.kup` – ohne private Daten.
2. Im DM-System unter **Bildschirme → Kiosk-Geräte → Kiosk-Updates** hochladen.
3. Beim Gerät **Update installieren**: der Agent lädt das Paket direkt in den freien Platz, prüft die
   Prüfsummen und startet einmalig **zur Probe** ins neue System (`tryboot.txt`).
4. Erreicht das neue System den Server, wird es dauerhaft (`config.txt` umgestellt). Startet es nicht,
   hängt es (Watchdog) oder meldet es sich nicht binnen 10 Minuten (`kiosk-trial-guard`), landet der
   Pi beim Neustart automatisch wieder im bisherigen System – das DM-System zeigt das als Fehler an.

`kiosk.json` (WLAN, Server, Monitordaten) bleibt bei Updates unverändert. Geräte mit älterem Image
(ohne Systemplätze) müssen einmal neu geflasht werden.

## Hotspot-Passwort ohne Bildschirm

Öffnet der Pi seinen Einrichtungs-Hotspot, schreibt er Name und Passwort zusätzlich in
**`kiosk-hotspot.txt`** auf die SD-Karte (Laufwerk „bootfs“ am PC).

## Fehlersuche ohne Bildschirm-Zugriff

Weil das System im RAM läuft, sind Logs nach einem Neustart weg. Für die Fehlersuche:

1. SD-Karte am PC öffnen (Laufwerk „bootfs“) und dort eine leere Datei **`kiosk-debug.txt`** anlegen.
2. Karte zurück in den Pi, starten und einige Minuten laufen lassen.
3. Karte wieder am PC öffnen: In **`kiosk-log.txt`** steht ein ausführliches Protokoll (Dienste,
   Netzwerk, Speicher, Stromversorgung, Grafik, Fehlermeldungen des Browsers). Es wird jede Minute
   aktualisiert – wie immer kurz beschreibbar → schreibgeschützt.
4. Zum Abschalten `kiosk-debug.txt` wieder löschen.

## Wartung

- **SSH** ist ausgeschaltet. Für Wartung öffentliche SSH-Schlüssel in `sshKeys` eintragen –
  dann startet SSH mit Schlüssel-Anmeldung (Benutzer `kiosk`, kein Passwort-Login).
- `sudo kiosk-rw` macht Boot-Partition und das darunterliegende Root-Dateisystem
  (`/media/root-ro`) beschreibbar, `sudo kiosk-ro` schaltet zurück.
- Dauerhafte Änderungen am System: `sudo overlayroot-chroot` oder Overlay abschalten mit
  `sudo raspi-config nonint do_overlayfs 1` (danach Neustart).
- **Buildroot-Variante:** Das Overlay richtet `/sbin/overlay-init` ein. Das Root-Dateisystem ist
  SquashFS und grundsätzlich nur lesbar – Änderungen am System nur per Update-Paket. `kiosk-rw`
  macht dort nur die Boot-Partition beschreibbar.

## Tests

```bash
python kiosk/tests/test_agent.py
python kiosk/tests/test_ota.py       # Update über das Netz (A/B, Probestart, Rückfall)
python kiosk/tests/test_monitor.py   # benötigt laufenden Server (npm start)
```

Prüft Sicherung/Reparatur, die Einrichtungsseite (inkl. Captive-Portal-Weiterleitung) und – wenn
lokal ein Server unter `http://localhost:3000` läuft – den Abgleich lokaler Änderungen.

## Image selbst bauen

### Buildroot-Variante

```powershell
cd kiosk
powershell -ExecutionPolicy Bypass -File .\build-buildroot.ps1
```

Gebaut wird in einer eigenen WSL-Distribution `dnd-buildroot` unter `D:\WSL\dnd-buildroot`
(anderer Ort: Umgebungsvariable `KIOSK_WSL_DIR`). Fehlt sie, legt das Skript sie aus dem
Docker-Image `debian:trixie-slim` an. Quellen, Zwischenstände und Compiler-Cache (rund 30 GB)
liegen darin – nicht auf C:. Der erste Lauf übersetzt WebKit und dauert mehrere Stunden,
spätere Läufe nur wenige Minuten.

| Datei | Zweck |
| --- | --- |
| `buildroot/configs/dnd_kiosk_zero2w_defconfig` | Paketauswahl (Buildroot 2026.02 LTS) |
| `buildroot/board/zero2w/config.txt`, `cmdline.txt` | Firmware- und Kernel-Parameter |
| `buildroot/board/zero2w/overlay/` | Overlay-Init, Browser-, zram- und NetworkManager-Einstellungen |
| `buildroot/board/zero2w/post-build.sh` | Dienste aktivieren, fstab, Rechte |
| `buildroot/board/zero2w/post-image.sh`, `genimage.cfg` | SD-Karten-Image inkl. `kiosk.json`, Systemplätze A/B, Update-Paket `.kup` |
| `buildroot/board/zero2w/linux.fragment` | Kernel: SquashFS, Grafiktreiber fest eingebaut (Änderungen erkennt `build.sh` und baut den Kernel neu) |

Agent, Startseite und Kiosk-Dienste kommen aus `files/rootfs` – gemeinsam mit der
Raspberry-Pi-OS-Variante.

### Raspberry-Pi-OS-Variante

Benötigt Docker (unter Windows Docker Desktop).

### WLAN und Server-Adresse vorbelegen

Damit der Pi ohne Nacharbeit direkt ins WLAN geht, liest der Build die Datei
`kiosk.local.json` (Vorlage: `kiosk.local.example.json`) und legt sie über die Standardwerte:

```json
{
  "serverUrl": "http://192.168.1.10:3000",
  "hostname": "dnd-tisch",
  "country": "DE",
  "wifi": [{ "ssid": "MEIN-WLAN", "psk": "MEIN-WLAN-PASSWORT" }]
}
```

Fehlt die Datei, fragen `build.ps1` bzw. `build.sh` die Werte ab (Passwort verdeckt) und legen sie an.
`kiosk.local.json` steht in `.gitignore` und wird nie eingecheckt. Images mit vorbelegtem WLAN
heißen `…-privat.img.xz` – sie enthalten das WLAN-Passwort und sollten nicht weitergegeben werden.

```powershell
cd kiosk
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

```bash
cd kiosk && ./build.sh
```

Der Build lädt das aktuelle *Raspberry Pi OS Lite (64-bit)*, vergrößert es, installiert per
ARM-Emulation `cog`, `cage`, Chromium, `overlayroot` und `zram-tools`, spielt die Dateien aus
`files/` ein und schreibt das Ergebnis nach `dist/`. Dauer je nach Rechner 20–60 Minuten.

| Pfad | Inhalt |
| --- | --- |
| `files/boot/kiosk.json` | Vorlage der Geräte-Einstellungen |
| `files/rootfs/opt/kiosk/agent.py` | Kiosk-Agent (Python, nur Standardbibliothek) |
| `files/rootfs/opt/kiosk/start.html` | lokale Startseite (wartet auf den Server) |
| `files/rootfs/usr/local/bin/kiosk-browser` | Start von cog bzw. Chromium unter cage |
| `files/rootfs/usr/local/sbin/kiosk-firstboot` | Ersteinrichtung: Overlay + schreibgeschützte Boot-Partition |
| `files/rootfs/etc/systemd/system/` | Dienste `kiosk-setup`, `kiosk-agent`, `kiosk-browser`, `kiosk-firstboot` |
| `build/` | Docker-Build-Umgebung |

## Images weitergeben (Lizenzen)

Die Images enthalten freie Software unter GPL, LGPL und anderen Lizenzen (Linux-Kernel, BusyBox, WPE WebKit, cog …).
**Wer ein fertiges Image weitergibt oder veröffentlicht, muss deren Pflichten erfüllen** – vor allem den Quellcode der
GPL-Komponenten anbieten.

- **Buildroot-Image:** `build.sh` legt automatisch `dist/tabletop-forge-kiosk-<version>-legal-info.tar` neben das Image
  (Buildroot `make legal-info`: Lizenztexte, Quellen und Patches aller Pakete). Dieses Archiv zusammen mit dem Image
  anbieten. Abschalten für reine Testbauten: `KIOSK_LEGAL_INFO=0`.
- **Raspberry-Pi-OS-Image:** Grundlage ist das offizielle Raspberry Pi OS Lite; die Quellen der enthaltenen Pakete stellt
  Raspberry Pi bzw. Debian bereit (<https://archive.raspberrypi.com/debian/>, <https://sources.debian.org/>). Beim
  Weitergeben auf diese Quellen verweisen bzw. sie mit anbieten.
- **Private Daten:** Images mit vorbelegtem WLAN (`kiosk.local.json`, Dateiname endet auf `-privat`) nie weitergeben.
