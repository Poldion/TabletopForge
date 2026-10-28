"""Updates über das Netz für die Buildroot-Variante (zwei Systemplätze A/B).

Aufbau der SD-Karte: Boot-Partition mit Firmware, kiosk.json und je einem Ordner a/ und b/ (Kernel, Gerätebaum,
Overlays, cmdline.txt); Root-Dateisystem von Platz A auf Partition 2, von Platz B auf Partition 3. Welcher Platz
startet, steht in config.txt (os_prefix=a/ bzw. b/).

Ablauf eines Updates:
  1. Paket (.kup = tar mit manifest.json, boot.tar, rootfs.squashfs) vom Server laden – direkt beim Laden in den
     freien Platz schreiben und die Prüfsummen bilden (kein Zwischenspeicher nötig).
  2. tryboot.txt = config.txt mit dem neuen Platz; Neustart mit „tryboot“ – die Firmware nimmt tryboot.txt nur
     dieses eine Mal.
  3. Meldet sich das neue System beim Server, wird es dauerhaft (config.txt umgestellt). Startet es nicht oder
     bekommt keinen Kontakt, landet der Pi beim nächsten Neustart (Watchdog bzw. kiosk-trial-guard nach 10 min)
     automatisch wieder im alten System.
"""
import hashlib
import http.client
import json
import os
import re
import shutil
import subprocess
import tarfile
import threading
import time
import urllib.request

DISK = "/dev/mmcblk0"
PARTITION = {"a": 2, "b": 3}
TRYBOOT_FLAG = "/proc/device-tree/chosen/bootloader/tryboot"
CONFIRMED = "/run/kiosk/update-confirmed"
CHUNK = 1 << 20
READ_TIMEOUT = 30  # Sekunden ohne Daten → Verbindung neu aufbauen und fortsetzen
MAX_RETRIES = 40  # so oft darf der Download insgesamt neu ansetzen (mit wachsender Pause, gut 15 Minuten)

# Zustand für die Anzeige im DM-System (wird mit jedem Heartbeat gemeldet)
status = {"state": "idle", "version": "", "progress": 0, "message": ""}
_lock = threading.Lock()
_running = False


def busy():
    """Läuft gerade ein Update? (Dann z.B. nicht in den Einrichtungsmodus wechseln.)"""
    return _running


class Ota:
    def __init__(self, boot, log, boot_rw):
        """boot: Boot-Partition, log: Protokoll-Funktion, boot_rw: Kontextmanager „Boot-Partition beschreibbar“."""
        self.boot = boot
        self.log = log
        self.boot_rw = boot_rw
        self.state_file = os.path.join(boot, "kiosk-update.json")

    # --- Systemplätze -----------------------------------------------------------------

    def supported(self):
        return self.configured_slot() is not None and self.current_slot() is not None

    def current_slot(self):
        """Laufender Platz laut Kernel-Kommandozeile (root=/dev/mmcblk0p2 → a, p3 → b)."""
        try:
            with open("/proc/cmdline", encoding="ascii") as f:
                m = re.search(r"root=/dev/mmcblk0p(\d+)", f.read())
        except OSError:
            return None
        num = int(m.group(1)) if m else 0
        return next((s for s, n in PARTITION.items() if n == num), None)

    def configured_slot(self):
        """Platz, den config.txt dauerhaft startet."""
        try:
            with open(os.path.join(self.boot, "config.txt"), encoding="utf-8") as f:
                m = re.search(r"^os_prefix=([ab])/[ \t]*$", f.read(), re.M)
        except OSError:
            return None
        return m.group(1) if m else None

    @staticmethod
    def trial():
        """Läuft gerade ein Probestart (tryboot)?"""
        try:
            with open(TRYBOOT_FLAG, "rb") as f:
                return f.read()[-1:] == b"\x01"
        except OSError:
            return False

    def _config_for(self, slot):
        with open(os.path.join(self.boot, "config.txt"), encoding="utf-8") as f:
            text = f.read()
        return re.sub(r"^os_prefix=[ab]/[ \t]*$", f"os_prefix={slot}/", text, flags=re.M)

    def _read_state(self):
        try:
            with open(self.state_file, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return None

    # --- Nach dem Start: Probestart erkennen, Rückfall melden ------------------------

    def boot_check(self):
        """Beim Start des Agenten: Ergebnis eines vorherigen Updates feststellen."""
        state = self._read_state()
        if not state or not self.supported():
            return
        cur = self.current_slot()
        if cur == state.get("slot") and self.trial():
            _set("trial", state.get("version", ""), 100, "Neues System läuft zur Probe – wird nach Kontakt zum Server übernommen")
            self.log("Update", state.get("version"), "läuft zur Probe auf Platz", cur)
            return
        if cur == state.get("slot"):
            # Bereits übernommen (z.B. Bestätigung kurz vor einem Neustart) – nur aufräumen
            self._cleanup()
            return
        # Wieder im alten Platz: Das neue System ist nicht (richtig) gestartet
        _set("error", state.get("version", ""), 0, "Das neue System ist nicht gestartet – der Pi läuft weiter mit der bisherigen Version.")
        self.log("Update", state.get("version"), "fehlgeschlagen – zurück auf Platz", cur)
        self._cleanup()

    def confirm(self):
        """Neues System hat den Server erreicht: dauerhaft übernehmen (config.txt)."""
        state = self._read_state()
        cur = self.current_slot()
        if not state or cur != state.get("slot") or not self.trial():
            return
        with self.boot_rw():
            _write(os.path.join(self.boot, "config.txt"), self._config_for(cur))
            for name in ("tryboot.txt", "kiosk-update.json"):
                _remove(os.path.join(self.boot, name))
        os.makedirs(os.path.dirname(CONFIRMED), exist_ok=True)
        open(CONFIRMED, "w").close()
        _set("done", state.get("version", ""), 100, f"Update auf {state.get('version')} installiert")
        self.log("Update", state.get("version"), "übernommen – Platz", cur, "startet jetzt dauerhaft")

    def _cleanup(self):
        with self.boot_rw():
            for name in ("tryboot.txt", "kiosk-update.json", ".ota-boot.tar"):
                _remove(os.path.join(self.boot, name))

    # --- Update installieren ------------------------------------------------------------

    def start(self, url, version, headers=None):
        """Update im Hintergrund laden und installieren (nur eines zugleich). headers: z.B. Geräteschlüssel."""
        global _running
        with _lock:
            if _running:
                return False
            _running = True
        threading.Thread(target=self._run, args=(url, version, headers), daemon=True).start()
        return True

    def _run(self, url, version, headers=None):
        global _running
        try:
            self._install(url, version, headers)
        except Exception as exc:  # noqa: BLE001 – Fehler wird angezeigt, der Agent läuft weiter
            self.log("Update fehlgeschlagen:", exc)
            _set("error", version, 0, f"Update fehlgeschlagen: {exc}")
            try:
                self._cleanup()
            except Exception:  # noqa: BLE001
                pass
        finally:
            with _lock:
                _running = False

    def _install(self, url, version, headers=None):
        if not self.supported():
            raise RuntimeError("Dieses Gerät unterstützt keine Updates über das Netz (bitte einmal neu flashen)")
        cur = self.current_slot()
        target = "b" if cur == "a" else "a"
        dev = f"{DISK}p{PARTITION[target]}"
        dev_size = _block_size(dev)
        _set("download", version, 0, f"Lade Update {version} …")
        self.log("Update", version, "von", url, "→ Platz", target, dev)

        res = _Resumable(url, headers or {}, self.log)
        reader = _Progress(res, res.total, version)
        manifest = None
        got = set()
        new_dir = os.path.join(self.boot, f"{target}.new")
        with tarfile.open(fileobj=reader, mode="r|") as tf:
            for member in tf:
                name = member.name.lstrip("./")
                if name == "manifest.json":
                    manifest = json.load(tf.extractfile(member))
                    if manifest.get("format") != 1 or manifest.get("board") != "zero2w":
                        raise RuntimeError("Paket passt nicht zu diesem Gerät")
                    got.add(name)
                elif name == "boot.tar":
                    if not manifest:
                        raise RuntimeError("Paket unvollständig (manifest.json fehlt am Anfang)")
                    # Direkt beim Laden entpacken und dabei die Prüfsumme bilden – kein Zwischenspeicher auf der
                    # (kleinen) Boot-Partition; bei falscher Prüfsumme wird der halbe Ordner wieder gelöscht
                    with self.boot_rw():
                        # Der Zielplatz wird ohnehin ersetzt – vorher löschen, damit nie drei Kernel gleichzeitig
                        # auf der Boot-Partition liegen
                        shutil.rmtree(os.path.join(self.boot, target), ignore_errors=True)
                        shutil.rmtree(new_dir, ignore_errors=True)
                        hashed = _Hashing(tf.extractfile(member))
                        try:
                            with tarfile.open(fileobj=hashed, mode="r|") as bt:
                                bt.extractall(new_dir, filter="data")
                            hashed.drain()
                            _check(hashed.hexdigest(), hashed.size, manifest["boot"])
                        except Exception:
                            shutil.rmtree(new_dir, ignore_errors=True)
                            raise
                    got.add(name)
                elif name == "rootfs.squashfs":
                    if not manifest:
                        raise RuntimeError("Paket unvollständig (manifest.json fehlt am Anfang)")
                    if member.size > dev_size:
                        raise RuntimeError(f"System zu groß für die Partition ({member.size} > {dev_size} Bytes)")
                    digest = _copy(tf.extractfile(member), dev)
                    _check(digest, member.size, manifest["rootfs"])
                    got.add(name)
        if got != {"manifest.json", "boot.tar", "rootfs.squashfs"}:
            raise RuntimeError("Paket unvollständig")
        new_version = manifest.get("version") or version

        # Platz fertigstellen: Ordner tauschen, cmdline.txt (wie bisher, nur mit neuer Root-Partition), Probestart
        _set("install", new_version, 100, "Installiere …")
        with open(os.path.join(self.boot, cur, "cmdline.txt"), encoding="utf-8") as f:
            cmdline = re.sub(r"\broot=\S+", lambda _m: f"root={dev}", f.read().strip())
        with self.boot_rw():
            final = os.path.join(self.boot, target)
            shutil.rmtree(final, ignore_errors=True)
            os.rename(new_dir, final)
            _write(os.path.join(final, "cmdline.txt"), cmdline + "\n")
            _write(os.path.join(self.boot, "tryboot.txt"), self._config_for(target))
            _write(self.state_file, json.dumps({"version": new_version, "slot": target, "from": cur, "at": int(time.time())}))
        _set("reboot", new_version, 100, "Starte neu ins neue System (zur Probe) …")
        self.log("Update", new_version, "installiert – Neustart zur Probe")
        time.sleep(2)
        subprocess.run(["systemctl", "reboot", "--reboot-argument=0 tryboot"], check=False)


class _Hashing:
    """Datei-Hülle, die beim Lesen SHA-256 und Größe mitzählt."""

    def __init__(self, raw):
        self.raw = raw
        self.hash = hashlib.sha256()
        self.size = 0

    def read(self, n=-1):
        data = self.raw.read(n)
        self.hash.update(data)
        self.size += len(data)
        return data

    def drain(self):
        """Rest lesen (tar-Endblöcke), damit die Prüfsumme die ganze Datei umfasst."""
        while self.read(CHUNK):
            pass

    def hexdigest(self):
        return self.hash.hexdigest()


class _Resumable:
    """Download, der nach Aussetzern dort weitermacht, wo er stehen blieb (HTTP-Range).

    Beim Schreiben aufs System kam es vor, dass die WLAN-Verbindung minutenlang stockte – der Download brach ab und
    das Update war verloren. Jetzt: nach READ_TIMEOUT ohne Daten neu verbinden und ab dem letzten Byte fortsetzen.
    """

    def __init__(self, url, headers, log):
        self.url = url
        self.headers = headers
        self.log = log
        self.pos = 0
        self.total = 0
        self.retries = 0
        self.res = None
        self._open()

    def _open(self):
        h = dict(self.headers)
        if self.pos:
            h["Range"] = f"bytes={self.pos}-"
        res = urllib.request.urlopen(urllib.request.Request(self.url, headers=h), timeout=READ_TIMEOUT)
        if self.pos:
            if res.status != 206:
                res.close()
                raise RuntimeError("Server kann den Download nicht fortsetzen")
        else:
            self.total = int(res.headers.get("Content-Length") or 0)
        self.res = res

    def read(self, n=-1):
        while True:
            try:
                if self.res is None:
                    self._open()
                data = self.res.read(n)
                if not data and self.total and self.pos < self.total:
                    raise ConnectionError("Verbindung vorzeitig beendet")
                self.pos += len(data)
                return data
            except (OSError, http.client.HTTPException, ConnectionError) as exc:
                self.retries += 1
                if self.retries > MAX_RETRIES:
                    raise
                pause = min(30, 2 * self.retries)
                self.log(f"Download stockt bei {self.pos // (1024 * 1024)} MB ({exc}) – setze in {pause} s fort")
                try:
                    if self.res is not None:
                        self.res.close()
                except OSError:
                    pass
                self.res = None
                time.sleep(pause)


class _Progress:
    """Datei-Hülle um die Download-Antwort, die den Fortschritt mitzählt."""

    def __init__(self, raw, total, version):
        self.raw = raw
        self.total = total
        self.done = 0
        self.version = version
        self.last = 0

    def read(self, n=-1):
        data = self.raw.read(n)
        self.done += len(data)
        now = time.time()
        if self.total and now - self.last > 1:
            self.last = now
            _set("download", self.version, int(self.done * 100 / self.total), f"Lade Update {self.version} …")
        return data


def _set(state, version, progress, message):
    status.update({"state": state, "version": version, "progress": progress, "message": message})


SYNC_EVERY = 4 * 1024 * 1024  # so viel höchstens ungeschrieben im Arbeitsspeicher


def _copy(src, path):
    """Strom in eine Datei bzw. ein Blockgerät schreiben; Rückgabe: SHA-256.

    Alle paar MB auf die Karte schreiben und den Zwischenspeicher sofort freigeben: Sonst sammelt der Kernel das
    ganze System (über 100 MB) als „noch zu schreiben“ im Arbeitsspeicher – auf dem Pi Zero (512 MB, Browser mit
    Karte) lief der Speicher voll, das System stand still und der Watchdog startete es neu (Update hing bei ~28 %).
    """
    h = hashlib.sha256()
    with open(path, "r+b" if path.startswith("/dev/") else "wb") as out:
        fd = out.fileno()
        pending = 0
        written = 0
        while True:
            chunk = src.read(CHUNK)
            if not chunk:
                break
            h.update(chunk)
            out.write(chunk)
            pending += len(chunk)
            if pending >= SYNC_EVERY:
                out.flush()
                os.fsync(fd)
                _drop_cache(fd, written, pending)
                written += pending
                pending = 0
                time.sleep(0.1)  # Luft für WLAN und Browser lassen
        out.flush()
        os.fsync(fd)
        _drop_cache(fd, written, pending)
    return h.hexdigest()


def _drop_cache(fd, offset, length):
    """Geschriebene Seiten aus dem Zwischenspeicher werfen (gibt es nur unter Linux)."""
    if length and hasattr(os, "posix_fadvise"):
        try:
            os.posix_fadvise(fd, offset, length, os.POSIX_FADV_DONTNEED)
        except OSError:
            pass


def _check(digest, size, entry):
    if size != entry.get("size") or digest != entry.get("sha256"):
        raise RuntimeError(f"Prüfsumme von {entry.get('file')} stimmt nicht – Download beschädigt")


def _block_size(dev):
    name = os.path.basename(dev)
    with open(f"/sys/class/block/{name}/size", encoding="ascii") as f:
        return int(f.read()) * 512


def _write(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _remove(path):
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
