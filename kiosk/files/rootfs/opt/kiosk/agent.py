#!/usr/bin/env python3
"""Kiosk-Agent für den Spieltisch (Raspberry Pi).

Das Root-Dateisystem läuft schreibgeschützt (Overlay im RAM). Dauerhafte Einstellungen liegen
in kiosk.json auf der Boot-Partition, die ebenfalls schreibgeschützt eingehängt ist. Für
Änderungen wird sie kurz beschreibbar gemacht, gespeichert und sofort wieder schreibgeschützt.

  agent.py prepare – ganz früh beim Start (ohne Netzwerk): Browser-Einstellungen und Startseite erzeugen,
                     damit der Browser schon parallel zum WLAN-Aufbau starten kann
  agent.py setup   – beim Start: WLAN, Land, Hostname, SSH-Schlüssel anwenden, Startseite erzeugen
  agent.py run     – Dauerbetrieb: beim Server melden, Änderungen, Befehle und Updates übernehmen;
                     ohne WLAN oder Server öffnet sich ein Einrichtungs-Hotspot
"""
import glob
import html
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ota  # noqa: E402
import setup_ap  # noqa: E402

VERSION = "1.7.1"
BOOT = "/boot/firmware" if os.path.isdir("/boot/firmware") else "/boot"
CONFIG = os.path.join(BOOT, "kiosk.json")
BACKUP = CONFIG + ".bak"
RUN = "/run/kiosk"
HERE = os.path.dirname(os.path.abspath(__file__))
INTERVAL = 15  # Sekunden zwischen zwei Meldungen beim Server
POLL = 5
NO_WIFI_SETUP_AFTER = 20  # kein WLAN eingetragen → Einrichtungsmodus nach 20 s
NO_NET_SETUP_AFTER = 90  # WLAN eingetragen, aber keine Verbindung → nach 90 s
SERVER_SETUP_AFTER = 180  # Server 3 Minuten nicht erreichbar → Einrichtungsmodus anbieten
AP_DURATION = 300  # Einrichtungsmodus bleibt 5 Minuten offen, dann neuer Verbindungsversuch
# monitor: Monitordaten für die 1″-Kalibrierung (Auflösung, Größe, Drehung, HDMI-Modus) – None = globale Werte
# browser: Engine ("cog" = WPE WebKit, schlank | "chromium"), Grafikbeschleunigung ("auto" | "on" | "off")
# und optionale Zusatz-Flags
DEFAULTS = {
    "rev": 0,
    "serverUrl": "",
    "hostname": "",
    "country": "DE",
    "wifi": [],
    "sshKeys": [],
    "monitor": None,
    "browser": {"engine": "cog", "gpu": "auto", "flags": ""},
}
HOTSPOT_INFO = os.path.join(BOOT, "kiosk-hotspot.txt")
# Anmeldung am Server: die lokale Startseite liest hieraus, ob und wie sich der Browser anmeldet
AUTH_STATE = os.path.join(RUN, "auth.json")
CMDLINE = os.path.join(BOOT, "cmdline.txt")
HDMI_CONNECTOR = "HDMI-A-1"


def log(*args):
    print("[kiosk]", *args, flush=True)


def sh(*cmd, check=False):
    """Befehl ausführen, Ausgabe zurückgeben (Fehler werden protokolliert, nicht geworfen)."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if r.returncode != 0 and check:
            log("Fehler:", " ".join(cmd), r.stderr.strip())
        return r.stdout.strip()
    except Exception as exc:  # noqa: BLE001 – Agent soll weiterlaufen
        log("Fehler:", " ".join(cmd), exc)
        return ""


# --- Konfiguration --------------------------------------------------------------------

def _read_json(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("kein JSON-Objekt")
    return data


def load_config():
    """kiosk.json laden; ist sie beschädigt, die Sicherung kiosk.json.bak nehmen und reparieren."""
    try:
        cfg = _read_json(CONFIG)
    except (OSError, ValueError) as exc:
        try:
            cfg = _read_json(BACKUP)
            log("kiosk.json nicht lesbar (", exc, ") – nutze Sicherung kiosk.json.bak")
            try:
                write_config({**DEFAULTS, **cfg})
            except OSError as werr:
                log("Reparatur fehlgeschlagen:", werr)
        except (OSError, ValueError) as bexc:
            log("kiosk.json und Sicherung nicht lesbar, nutze Standardwerte:", exc, bexc)
            cfg = {}
    return {**DEFAULTS, **cfg}


def _write_file(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    os.sync()


_boot_lock = threading.Lock()


def _remount_ro():
    # Direkt nach dem Schreiben meldet der Kernel manchmal noch „busy“ – kurz warten und erneut versuchen
    err = ""
    for _ in range(10):
        try:
            r = subprocess.run(["mount", "-o", "remount,ro", BOOT], capture_output=True, text=True, timeout=30)
        except (OSError, subprocess.SubprocessError) as exc:
            err = str(exc)
            break
        if r.returncode == 0:
            return
        err = r.stderr.strip()
        time.sleep(0.5)
    log("Fehler: Boot-Partition bleibt beschreibbar:", err)


@contextmanager
def boot_rw():
    """Boot-Partition beschreibbar, solange der Block läuft – danach sofort wieder schreibgeschützt (nur ein Schreiber zugleich)."""
    with _boot_lock:
        sh("mount", "-o", "remount,rw", BOOT, check=True)
        try:
            yield
        finally:
            os.sync()
            _remount_ro()


def boot_write(path_data):
    """Boot-Partition kurz beschreibbar machen, Dateien schreiben, wieder schreibgeschützt."""
    with boot_rw():
        for path, data in path_data:
            _write_file(path, data)


# Updates über das Netz (Buildroot-Variante mit Systemplätzen A/B)
OTA = ota.Ota(BOOT, log, boot_rw)


def write_config(cfg):
    """Sicherung und kiosk.json schreiben.

    Erst die Sicherung, dann die Hauptdatei: Bei Stromausfall ist immer mindestens eine vollständig.
    """
    data = json.dumps(cfg, indent=2, ensure_ascii=False)
    boot_write([(BACKUP, data), (CONFIG, data)])
    log("kiosk.json gespeichert (Stand", cfg.get("rev"), ")")


def restart_browser():
    """Browser neu starten, ohne auf das Beenden zu warten (der Agent bleibt reaktionsfähig)."""
    sh("systemctl", "--no-block", "restart", "kiosk-browser")


# --- Geräteinformationen ----------------------------------------------------------------

def device_id():
    try:
        with open("/proc/cpuinfo", encoding="utf-8") as f:
            for line in f:
                if line.lower().startswith("serial"):
                    return "pi-" + line.split(":")[1].strip()[-8:].lower()
    except OSError:
        pass
    try:
        with open("/etc/machine-id", encoding="utf-8") as f:
            return "pi-" + f.read().strip()[:8]
    except OSError:
        return "pi-" + socket.gethostname()[:8]


def model():
    try:
        with open("/proc/device-tree/model", encoding="utf-8") as f:
            return f.read().strip("\x00\n ")
    except OSError:
        return ""


def ip_address():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return ""


def current_ssid():
    out = sh("nmcli", "-t", "-f", "ACTIVE,SSID", "dev", "wifi")
    for line in out.splitlines():
        if line.startswith("yes:"):
            return line[4:]
    return ""


def system_version():
    try:
        with open(os.path.join(HERE, "VERSION"), encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


_undervoltage_seen = False


def power_state():
    """Unterspannung (jetzt / seit dem Start) und Temperatur – z.B. zu schwaches Netzteil am TV-USB-Anschluss."""
    global _undervoltage_seen
    now = None
    for hw in glob.glob("/sys/class/hwmon/hwmon*"):
        try:
            with open(os.path.join(hw, "name"), encoding="ascii") as f:
                if f.read().strip() != "rpi_volt":
                    continue
            with open(os.path.join(hw, "in0_lcrit_alarm"), encoding="ascii") as f:
                now = f.read().strip() == "1"
        except OSError:
            continue
    if now:
        _undervoltage_seen = True
    temp = None
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", encoding="ascii") as f:
            temp = round(int(f.read()) / 1000, 1)
    except (OSError, ValueError):
        pass
    return {"undervoltage": now, "undervoltageSeen": _undervoltage_seen, "temp": temp}


def uptime():
    try:
        with open("/proc/uptime", encoding="utf-8") as f:
            return int(float(f.read().split()[0]))
    except OSError:
        return 0


# --- Anwenden ---------------------------------------------------------------------------

def apply_country(cfg):
    country = (cfg.get("country") or "DE").upper()[:2]
    sh("iw", "reg", "set", country)
    sh("rfkill", "unblock", "wifi")
    sh("nmcli", "radio", "wifi", "on")


def apply_wifi(cfg):
    """WLAN-Verbindungen im NetworkManager anlegen (liegen im RAM-Overlay, werden bei jedem Start neu erzeugt)."""
    wanted = [w for w in cfg.get("wifi", []) if w.get("ssid")]
    names = {f"kiosk-{i}" for i in range(len(wanted))}
    existing = sh("nmcli", "-t", "-f", "NAME", "connection", "show").splitlines()
    for name in existing:
        if name.startswith("kiosk-") and name not in names:
            sh("nmcli", "connection", "delete", name)
    for i, w in enumerate(wanted):
        name = f"kiosk-{i}"
        sh("nmcli", "connection", "delete", name)
        args = ["nmcli", "connection", "add", "type", "wifi", "con-name", name, "ssid", w["ssid"],
                "connection.autoconnect", "yes", "connection.autoconnect-priority", str(100 - i)]
        if w.get("psk"):
            args += ["wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", w["psk"]]
        sh(*args, check=True)
    if wanted:
        log("WLAN-Netze eingerichtet:", ", ".join(w["ssid"] for w in wanted))


def apply_hostname(cfg):
    name = (cfg.get("hostname") or "").strip()
    if not name or name == socket.gethostname():
        return
    sh("hostnamectl", "set-hostname", name, check=True)
    try:
        with open("/etc/hosts", encoding="utf-8") as f:
            lines = [l for l in f.read().splitlines() if not l.startswith("127.0.1.1")]
        lines.append(f"127.0.1.1\t{name}")
        with open("/etc/hosts", "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except OSError as exc:
        log("hosts nicht aktualisiert:", exc)


def ssh_unit():
    """Name des SSH-Dienstes: „ssh“ bei Raspberry Pi OS/Debian, „sshd“ bei Buildroot."""
    for d in ("/etc/systemd/system", "/usr/lib/systemd/system", "/lib/systemd/system"):
        if os.path.exists(os.path.join(d, "ssh.service")):
            return "ssh"
    return "sshd"


def apply_ssh(cfg):
    """SSH nur mit hinterlegten Schlüsseln (kein Passwort-Login)."""
    keys = [k.strip() for k in cfg.get("sshKeys", []) if k.strip()]
    if not keys:
        sh("systemctl", "stop", ssh_unit())
        return
    home = "/home/kiosk/.ssh"
    os.makedirs(home, exist_ok=True)
    with open(os.path.join(home, "authorized_keys"), "w", encoding="utf-8") as f:
        f.write("\n".join(keys) + "\n")
    sh("chown", "-R", "kiosk:kiosk", home)
    os.chmod(home, 0o700)
    if not shutil.which("sudo"):
        # Ohne sudo (Buildroot-Variante) ist Wartung nur als root möglich – ebenfalls nur per Schlüssel
        os.makedirs("/root/.ssh", mode=0o700, exist_ok=True)
        with open("/root/.ssh/authorized_keys", "w", encoding="utf-8") as f:
            f.write("\n".join(keys) + "\n")
    sh("ssh-keygen", "-A")
    sh("systemctl", "start", ssh_unit())


def write_start_page(cfg, status="", setup=None, early=False):
    """Lokale Startseite: wartet auf den Server und leitet dann zur Kiosk-Seite weiter.

    Im Einrichtungsmodus (setup = (ssid, passwort)) zeigt sie groß, wie man sich verbindet.
    """
    os.makedirs(RUN, exist_ok=True)
    with open(os.path.join(HERE, "start.html"), encoding="utf-8") as f:
        template = f.read()
    values = {
        "SERVER": "" if setup else cfg.get("serverUrl", "").rstrip("/"),
        "ID": device_id(),
        "IP": ip_address() or "–",
        "HOST": socket.gethostname(),
        "SSID": ("" if early else current_ssid()) or "–",  # früh läuft der NetworkManager noch nicht
        "STATUS": status,
    }
    for key, value in values.items():
        template = template.replace("{{" + key + "}}", html.escape(value, quote=True))
    block = ""
    if setup:
        ap_ssid, ap_psk = (html.escape(v) for v in setup)
        block = (
            '<div class="setup"><h2>Einrichtungsmodus</h2>'
            f"<p>1. Mit dem Handy mit dem WLAN <b>{ap_ssid}</b> verbinden<br>Passwort: <b>{ap_psk}</b></p>"
            f"<p>2. Die Einrichtungsseite öffnet sich automatisch – sonst <b>http://{setup_ap.AP_ADDRESS}</b> aufrufen</p>"
            "<p>3. WLAN und Server-Adresse eintragen und speichern</p></div>"
        )
    template = template.replace("{{SETUP}}", block)
    with open(os.path.join(RUN, "start.html"), "w", encoding="utf-8") as f:
        f.write(template)


def legacy_gpu():
    """VideoCore IV (Pi Zero 2 W, Pi 3, Pi 2/1): nur OpenGL ES 2.0 – Chromium besser ohne GPU."""
    try:
        with open("/proc/device-tree/compatible", "rb") as f:
            compatible = f.read().decode(errors="ignore")
    except OSError:
        return False
    return any(soc in compatible for soc in ("bcm2835", "bcm2836", "bcm2837"))


def browser_engines():
    """Auf dem Gerät vorhandene Browser (die Buildroot-Variante hat nur cog)."""
    found = []
    if shutil.which("cog"):
        found.append("cog")
    if shutil.which("chromium") or shutil.which("chromium-browser"):
        found.append("chromium")
    return found


def browser_settings(cfg):
    b = cfg.get("browser") or {}
    engine = b.get("engine") if b.get("engine") in ("cog", "chromium") else "cog"
    available = browser_engines()
    if available and engine not in available:
        # Gewählter Browser fehlt auf diesem Gerät – sonst bliebe der Bildschirm schwarz
        engine = available[0]
    gpu = b.get("gpu", "auto")
    if gpu not in ("on", "off"):
        # Chromium zeichnet auf dem VideoCore IV mit GPU oft nur weiß; cog/WebKit kommt damit gut zurecht
        gpu = "off" if engine == "chromium" and legacy_gpu() else "on"
    # Nur harmlose Zeichen in Zusatz-Flags zulassen (die Datei wird von einem Shell-Skript gelesen)
    flags = "".join(ch for ch in str(b.get("flags", "")) if ch.isalnum() or ch in " -_=,.:/")[:500]
    # Nur echte Schalter (--…) – alles andere würde Chromium als zusätzliche Adresse öffnen
    flags = " ".join(t for t in flags.split() if t.startswith("--"))
    return engine, gpu, flags, display_mode(cfg)


def display_mode(cfg):
    """Bildschirmmodus für den Browser. „auto“ heißt auf dem VideoCore IV (Pi Zero 2 W / Pi 3) 1280×720:
    In 1080p schafft der Grafikchip nur knapp 20 Bilder/s, in 720p flüssige 30 (der TV skaliert hoch,
    die 1″-Kalibrierung rechnet die Auflösung automatisch mit ein)."""
    mode = output_mode(cfg)
    if mode != "auto":
        return mode
    return "1280x720@60" if legacy_gpu() else ""


def write_browser_env(cfg):
    engine, gpu, flags, mode = browser_settings(cfg)
    os.makedirs(RUN, exist_ok=True)
    with open(os.path.join(RUN, "browser.env"), "w", encoding="utf-8") as f:
        f.write(f'KIOSK_ENGINE={engine}\nKIOSK_GPU={gpu}\nKIOSK_MODE="{mode}"\nKIOSK_EXTRA_FLAGS="{flags}"\n')
    return f"{engine}, GPU {gpu}, Modus {mode or 'TV-Vorgabe'}"


def prepare():
    """Ohne Netzwerk: Browser-Einstellungen und Startseite – der Browser braucht sonst nichts zum Starten."""
    cfg = load_config()
    write_browser_env(cfg)
    write_start_page(cfg, early=True)


def setup():
    cfg = load_config()
    apply_country(cfg)
    apply_wifi(cfg)
    apply_hostname(cfg)
    apply_ssh(cfg)
    log("Browser:", write_browser_env(cfg))
    write_start_page(cfg)
    if apply_output_mode(cfg):
        # HDMI-Modus wurde z.B. am PC in kiosk.json geändert – einmal neu starten
        log("Neustart für den neuen HDMI-Modus")
        sh("systemctl", "reboot")
        return
    log("Einrichtung abgeschlossen, Gerät", device_id())


# --- Dauerbetrieb -----------------------------------------------------------------------

def public_config(cfg):
    return {
        "serverUrl": cfg.get("serverUrl", ""),
        "hostname": cfg.get("hostname", ""),
        "country": cfg.get("country", "DE"),
        "wifi": [{"ssid": w.get("ssid", "")} for w in cfg.get("wifi", [])],
        "monitor": cfg.get("monitor"),
        "browser": cfg.get("browser") or DEFAULTS["browser"],
    }


def device_key(cfg):
    """Geheimer Geräteschlüssel (einmal erzeugt, bleibt in kiosk.json). Damit erkennt der Server dieses Gerät;
    ohne ihn bekommt niemand Einstellungen wie WLAN-Passwörter, der nur die Geräte-ID kennt."""
    key = cfg.get("deviceKey")
    if isinstance(key, str) and len(key) >= 32:
        return key
    key = secrets.token_urlsafe(32)
    cfg["deviceKey"] = key
    write_config(cfg)
    log("Neuer Geräteschlüssel erzeugt")
    return key


def auth_headers(cfg):
    return {"x-kiosk-id": device_id(), "x-kiosk-key": device_key(cfg)}


def write_auth_state(state, token=None):
    """Für die Startseite: "ok" (mit Einmal-Anmeldung für den Browser), "pair" (QR-Code zeigen), "open"
    (Server ohne Anmeldung) oder "denied" (Schlüssel passt nicht)."""
    os.makedirs(RUN, exist_ok=True)
    data = {"state": state, "token": token, "time": int(time.time())}
    tmp = AUTH_STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, AUTH_STATE)


def heartbeat(cfg):
    url = cfg["serverUrl"].rstrip("/") + "/api/kiosks/heartbeat"
    body = {
        "id": device_id(),
        "hostname": socket.gethostname(),
        "ip": ip_address(),
        "model": model(),
        "engines": browser_engines(),
        "agent": VERSION,
        "ssid": current_ssid(),
        "serverUrl": cfg["serverUrl"],
        "uptime": uptime(),
        "rev": int(cfg.get("rev", 0)),
        "config": public_config(cfg),
        "localChange": bool(cfg.get("localChange")),
        "system": system_version(),
        "slot": OTA.current_slot() if OTA.supported() else None,
        "update": dict(ota.status),
        "power": power_state(),
    }
    headers = {"content-type": "application/json", **auth_headers(cfg)}
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=10) as res:
        result = json.load(res)
    if result.get("browserToken"):
        write_auth_state("ok", result["browserToken"])
    elif result.get("pairing"):
        write_auth_state("pair")
    else:
        write_auth_state("open")
    return result


def merge_desired(cfg, desired):
    """Gewünschte Einstellungen übernehmen; leere Passwörter behalten das bisherige."""
    old_psk = {w.get("ssid"): w.get("psk") for w in cfg.get("wifi", [])}
    wifi = []
    for w in desired.get("wifi", []):
        psk = w.get("psk") or old_psk.get(w.get("ssid"))
        entry = {"ssid": w.get("ssid", "")}
        if psk:
            entry["psk"] = psk
        wifi.append(entry)
    new = dict(cfg)
    new.update({
        "rev": int(desired.get("rev", cfg.get("rev", 0))),
        "serverUrl": desired.get("serverUrl") or cfg.get("serverUrl", ""),
        "hostname": desired.get("hostname", cfg.get("hostname", "")),
        "country": desired.get("country") or cfg.get("country", "DE"),
        "wifi": wifi,
        "monitor": desired.get("monitor", cfg.get("monitor")),
        "browser": desired.get("browser") or cfg.get("browser") or DEFAULTS["browser"],
    })
    return new


def has_connection():
    """Besteht eine Netzwerkverbindung (WLAN oder Kabel), die nicht der eigene Hotspot ist?"""
    out = sh("nmcli", "-t", "-f", "NAME,TYPE,DEVICE", "connection", "show", "--active")
    for line in out.splitlines():
        name, _, rest = line.partition(":")
        if name == setup_ap.AP_CONNECTION or "loopback" in rest:
            continue
        if "wireless" in rest or "ethernet" in rest:
            return True
    return False


def output_mode(cfg):
    return ((cfg.get("monitor") or {}).get("output") or "auto").strip()


def cmdline_files():
    """cmdline.txt aller Systemplätze (a/, b/) bzw. die eine im Hauptordner der Boot-Partition."""
    slots = [os.path.join(BOOT, s, "cmdline.txt") for s in ("a", "b")]
    return [p for p in slots if os.path.isfile(p)] or [CMDLINE]


def apply_output_mode(cfg):
    """HDMI-Modus in cmdline.txt eintragen (kurz rw → schreiben → ro). Rückgabe: True bei Änderung."""
    mode = output_mode(cfg)
    changes = []
    for path in cmdline_files():
        try:
            with open(path, encoding="utf-8") as f:
                line = f.read().strip()
        except OSError as exc:
            log("cmdline.txt nicht lesbar:", exc)
            continue
        parts = [p for p in line.split() if not p.startswith(f"video={HDMI_CONNECTOR}:")]
        if mode != "auto":
            parts.append(f"video={HDMI_CONNECTOR}:{mode}")
        new_line = " ".join(parts)
        if new_line != line:
            changes.append((path, new_line + "\n"))
    if not changes:
        return False
    boot_write(changes)
    log("HDMI-Modus gesetzt:", mode)
    return True


def apply_new_config(old, new):
    """Geänderte Einstellungen anwenden (WLAN, Land, Hostname, Startseite, ggf. Browser)."""
    if new.get("wifi") != old.get("wifi") or new.get("country") != old.get("country"):
        apply_country(new)
        apply_wifi(new)
    if new.get("hostname") != old.get("hostname"):
        apply_hostname(new)
    write_start_page(new)
    if output_mode(new) != output_mode(old) and apply_output_mode(new):
        # Ein neuer HDMI-Modus wirkt erst nach einem Neustart
        log("Neustart für den neuen HDMI-Modus")
        sh("systemctl", "reboot")
        return
    if new.get("serverUrl") != old.get("serverUrl") or browser_settings(new) != browser_settings(old):
        write_browser_env(new)
        restart_browser()


def write_hotspot_info(ap_ssid, ap_psk, reason):
    """Zugangsdaten als Textdatei auf die Boot-Partition – lesbar am PC, auch ohne Bildschirm."""
    text = (
        "Einrichtungsmodus des Spieltischs (Tabletop Forge)\r\n\r\n"
        f"Grund:        {reason}\r\n"
        f"WLAN-Name:    {ap_ssid}\r\n"
        f"Passwort:     {ap_psk}\r\n"
        f"Einrichtung:  http://{setup_ap.AP_ADDRESS}\r\n\r\n"
        "Mit dem Handy verbinden – die Einrichtungsseite öffnet sich automatisch.\r\n"
    )
    try:
        with open(HOTSPOT_INFO, encoding="utf-8") as f:
            if f.read() == text:
                return
    except OSError:
        pass
    try:
        boot_write([(HOTSPOT_INFO, text)])
    except OSError as exc:
        log("Hotspot-Info nicht gespeichert:", exc)


def setup_mode(cfg, reason):
    """Hotspot mit Einrichtungsseite öffnen, bis gespeichert wird oder die Zeit abläuft.

    Rückgabe: True, wenn neue Einstellungen gespeichert wurden.
    """
    ap_ssid, ap_psk = setup_ap.ap_credentials(device_id())
    log("Einrichtungsmodus:", reason, "– Hotspot", ap_ssid)
    networks = setup_ap.scan_networks()
    state = {"cfg": cfg}

    def on_save(new):
        write_config(new)
        state["cfg"] = new

    try:
        setup_ap.start_ap(ap_ssid, ap_psk)
    except RuntimeError as exc:
        log(exc)
        return False
    portal = setup_ap.Portal(lambda: state["cfg"], networks, device_id(), on_save).start()
    write_hotspot_info(ap_ssid, ap_psk, reason)
    write_start_page(cfg, reason, setup=(ap_ssid, ap_psk))
    restart_browser()
    saved = False
    try:
        saved = portal.saved.wait(timeout=AP_DURATION)
        if saved:
            time.sleep(3)  # Bestätigungsseite noch ausliefern
    finally:
        portal.stop()
        setup_ap.stop_ap()
    if saved:
        log("Einstellungen über den Einrichtungsmodus gespeichert")
        apply_new_config(cfg, state["cfg"])
    else:
        # Niemand hat etwas eingetragen: mit den bisherigen Daten erneut versuchen
        apply_wifi(cfg)
    write_start_page(state["cfg"], "Verbinde …")
    restart_browser()
    return saved


def run():
    OTA.boot_check()
    started = time.time()
    no_net_since = None
    offline_since = None
    last_beat = 0
    while True:
        cfg = load_config()
        now = time.time()

        # 1. Netzwerk: ohne WLAN-Einträge bald, sonst nach einer Wartezeit in den Einrichtungsmodus
        if has_connection():
            no_net_since = None
        else:
            no_net_since = no_net_since or now
            limit = NO_NET_SETUP_AFTER if cfg.get("wifi") else NO_WIFI_SETUP_AFTER
            if now - no_net_since > limit and now - started > NO_WIFI_SETUP_AFTER and not ota.busy():
                setup_mode(cfg, "Kein WLAN verbunden." if cfg.get("wifi") else "Noch kein WLAN eingerichtet.")
                no_net_since = offline_since = None
                started = time.time()
                continue
            write_start_page(cfg, "Suche WLAN …")
            time.sleep(POLL)
            continue

        # 2. Server: regelmäßig melden; ist er lange nicht erreichbar, Einrichtungsmodus anbieten
        if not cfg.get("serverUrl"):
            setup_mode(cfg, "Keine Server-Adresse eingetragen.")
            continue
        if now - last_beat >= INTERVAL:
            last_beat = now
            try:
                res = heartbeat(cfg)
                if offline_since and now - offline_since > 30:
                    # Server war länger weg: Browser neu starten, damit keine Fehlerseite stehen bleibt
                    log("Server wieder erreichbar – Browser wird neu gestartet")
                    restart_browser()
                offline_since = None
                if OTA.trial():
                    # Neues System nach einem Update hat den Server erreicht → dauerhaft übernehmen
                    OTA.confirm()
                if res.get("ack") is not None and cfg.get("localChange"):
                    # Server hat die am Gerät geänderten Einstellungen übernommen
                    acked = dict(cfg, rev=int(res["ack"]))
                    acked.pop("localChange", None)
                    write_config(acked)
                    cfg = acked
                desired = res.get("desired")
                if desired and not cfg.get("localChange"):
                    new = merge_desired(cfg, desired)
                    write_config(new)
                    apply_new_config(cfg, new)
                for cmd in res.get("commands", []):
                    log("Befehl:", cmd)
                    if cmd == "reboot":
                        sh("systemctl", "reboot")
                    elif cmd == "restart-browser":
                        restart_browser()
                    elif cmd.startswith("update:"):
                        version = cmd.split(":", 1)[1]
                        if version == system_version() and not OTA.trial():
                            # Doppelt angestoßen (z.B. zweimal geklickt): dasselbe System nicht noch einmal schreiben
                            log("Update", version, "läuft bereits – übersprungen")
                            continue
                        url = f"{cfg['serverUrl'].rstrip('/')}/api/kiosk-updates/{urllib.parse.quote(version)}/download"
                        if not OTA.start(url, version, headers=auth_headers(cfg)):
                            log("Update läuft bereits")
            except urllib.error.HTTPError as exc:
                # Server erreichbar, lehnt das Gerät aber ab (Schlüssel passt nicht / Software zu alt) –
                # kein Einrichtungsmodus, sondern Hinweis auf der Startseite
                offline_since = None
                try:
                    reason = json.load(exc).get("error") or str(exc)
                except (ValueError, OSError):
                    reason = str(exc)
                log("Server lehnt das Gerät ab:", reason)
                write_auth_state("denied")
                write_start_page(cfg, f"Server lehnt das Gerät ab: {reason}")
            except (urllib.error.URLError, OSError, ValueError) as exc:
                if offline_since is None:
                    offline_since = now
                    log("Server nicht erreichbar:", exc)
                write_start_page(cfg, f"Server nicht erreichbar ({cfg['serverUrl']}).")
                if now - offline_since > SERVER_SETUP_AFTER and not ota.busy():
                    # (während eines Updates nicht: der Hotspot würde den laufenden Download abbrechen)
                    setup_mode(cfg, f"Server {cfg['serverUrl']} nicht erreichbar.")
                    offline_since = None
                    started = time.time()
                    continue
        time.sleep(POLL)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "run"
    if mode == "prepare":
        prepare()
    elif mode == "setup":
        setup()
    elif mode == "run":
        run()
    elif mode == "id":
        print(device_id())
    else:
        print(__doc__)
        sys.exit(1)
