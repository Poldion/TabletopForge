"""Einrichtungsmodus: eigener WLAN-Hotspot mit Einrichtungsseite (Captive Portal).

Findet der Kiosk sein WLAN oder den Server nicht, öffnet er einen Hotspot. Wer sich mit dem
Handy verbindet, bekommt die Einrichtungsseite angezeigt (alle DNS-Anfragen zeigen auf den Pi)
und kann WLAN und Server-Adresse eintragen.
"""
import html
import subprocess
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AP_CONNECTION = "kiosk-setup-ap"
AP_ADDRESS = "10.42.0.1"


def _nmcli(*args):
    try:
        r = subprocess.run(["nmcli", *args], capture_output=True, text=True, timeout=60)
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except Exception as exc:  # noqa: BLE001
        return 1, "", str(exc)


def ap_credentials(device_id):
    """Name und Passwort des Hotspots – aus der Geräte-ID abgeleitet und auf dem TV angezeigt."""
    suffix = device_id.replace("pi-", "")[-4:].upper()
    return f"DnD-Kiosk-{suffix}", f"dnd-{device_id.replace('pi-', '')[-8:]}"


def scan_networks():
    """Erreichbare WLANs (vor dem Start des Hotspots scannen – danach ist die Funkschnittstelle belegt)."""
    code, out, _ = _nmcli("-t", "-f", "SSID,SIGNAL,SECURITY", "dev", "wifi", "list", "--rescan", "yes")
    best = {}
    for line in out.splitlines():
        # nmcli maskiert Doppelpunkte in Feldern mit „\\:“
        parts = line.replace("\\:", "\x00").split(":")
        if len(parts) < 3:
            continue
        ssid = parts[0].replace("\x00", ":")
        if not ssid:
            continue
        signal = int(parts[1] or 0)
        if signal > best.get(ssid, {}).get("signal", -1):
            best[ssid] = {"ssid": ssid, "signal": signal, "secure": bool(parts[2].strip())}
    return sorted(best.values(), key=lambda n: -n["signal"])


def start_ap(ssid, password):
    _nmcli("connection", "delete", AP_CONNECTION)
    code, _, err = _nmcli(
        "connection", "add", "type", "wifi", "ifname", "wlan0", "con-name", AP_CONNECTION,
        "autoconnect", "no", "ssid", ssid, "mode", "ap", "802-11-wireless.band", "bg",
        "ipv4.method", "shared", "ipv4.addresses", f"{AP_ADDRESS}/24", "ipv6.method", "disabled",
        "wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", password,
    )
    if code != 0:
        raise RuntimeError(f"Hotspot konnte nicht angelegt werden: {err}")
    code, _, err = _nmcli("connection", "up", AP_CONNECTION)
    if code != 0:
        raise RuntimeError(f"Hotspot konnte nicht gestartet werden: {err}")


def stop_ap():
    _nmcli("connection", "down", AP_CONNECTION)
    _nmcli("connection", "delete", AP_CONNECTION)


# --- Einrichtungsseite -----------------------------------------------------------------

PAGE = """<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spieltisch einrichten</title>
<style>
body{{margin:0;font-family:sans-serif;background:#15130f;color:#ece4d4}}
main{{max-width:480px;margin:0 auto;padding:20px}}
h1{{font-family:Georgia,serif;color:#c9a24a;font-size:26px}}
label{{display:block;margin:14px 0 4px;color:#a79c86;font-size:14px}}
input,select{{width:100%;box-sizing:border-box;font-size:17px;padding:12px;border-radius:8px;border:1px solid #4a4233;background:#1e1b16;color:#ece4d4}}
button{{margin-top:20px;width:100%;font-size:18px;padding:14px;border:0;border-radius:8px;background:#c9a24a;color:#1b160c;font-weight:bold}}
.note{{font-size:13px;color:#a79c86;margin-top:16px}}
.ok{{background:#2f4d33;padding:14px;border-radius:8px}}
</style></head><body><main>
<h1>Spieltisch einrichten</h1>
{body}
</main></body></html>"""


def render_form(cfg, networks, device_id, message=""):
    current = (cfg.get("wifi") or [{}])[0].get("ssid", "")
    options = "".join(
        f'<option value="{html.escape(n["ssid"], quote=True)}"{" selected" if n["ssid"] == current else ""}>'
        f'{html.escape(n["ssid"])} ({n["signal"]} %{"" if n["secure"] else ", offen"})</option>'
        for n in networks
    )
    known = {n["ssid"] for n in networks}
    if current and current not in known:
        options = f'<option value="{html.escape(current, quote=True)}" selected>{html.escape(current)} (gespeichert, nicht in Reichweite)</option>' + options
    body = f"""
{f'<p class="ok">{html.escape(message)}</p>' if message else ''}
<p>Gerät <b>{html.escape(device_id)}</b> – trage das WLAN und die Adresse des D&amp;D-Servers ein.</p>
<form method="post" action="/save">
<label>WLAN</label>
<select name="ssid_select" onchange="document.getElementById('ssid').value=this.value">
<option value="">– aus der Liste wählen –</option>{options}</select>
<label>WLAN-Name (SSID)</label>
<input id="ssid" name="ssid" value="{html.escape(current, quote=True)}" autocapitalize="none" autocomplete="off" required>
<label>WLAN-Passwort (leer lassen = gespeichertes behalten)</label>
<input name="psk" type="password" autocomplete="new-password">
<label>Server-Adresse</label>
<input name="serverUrl" value="{html.escape(cfg.get('serverUrl', ''), quote=True)}" placeholder="http://192.168.x.x:4300" autocapitalize="none" required>
<label>Gerätename (Hostname)</label>
<input name="hostname" value="{html.escape(cfg.get('hostname', ''), quote=True)}" autocapitalize="none">
<button type="submit">Speichern &amp; verbinden</button>
</form>
<p class="note">Nach dem Speichern beendet der Spieltisch den Einrichtungsmodus und verbindet sich mit dem gewählten WLAN.
Die Einstellungen werden schreibgeschützt auf der SD-Karte gesichert.</p>"""
    return PAGE.format(body=body)


def apply_form(cfg, form):
    """Formulardaten in eine neue Konfiguration übernehmen (gewähltes WLAN wird bevorzugt)."""
    ssid = (form.get("ssid") or form.get("ssid_select") or "").strip()[:64]
    psk = (form.get("psk") or "")[:64]
    server = (form.get("serverUrl") or "").strip().rstrip("/")[:200]
    if not ssid or not server:
        raise ValueError("WLAN-Name und Server-Adresse sind erforderlich.")
    if not server.startswith(("http://", "https://")):
        server = "http://" + server
    if psk and len(psk) < 8:
        raise ValueError("WLAN-Passwörter haben mindestens 8 Zeichen.")
    old = cfg.get("wifi", [])
    prev = next((w for w in old if w.get("ssid") == ssid), {})
    entry = {"ssid": ssid}
    if psk or prev.get("psk"):
        entry["psk"] = psk or prev["psk"]
    wifi = [entry] + [w for w in old if w.get("ssid") != ssid]
    new = dict(cfg)
    new.update({
        "serverUrl": server,
        "hostname": (form.get("hostname") or cfg.get("hostname", "")).strip().lower()[:40],
        "wifi": wifi,
        # Lokale Änderung: wird beim nächsten Kontakt an den Server gemeldet und dort übernommen
        "localChange": True,
    })
    return new


class Portal:
    """Kleiner Webserver für den Einrichtungsmodus. on_save(cfg) wird mit der neuen Konfiguration aufgerufen."""

    def __init__(self, get_config, networks, device_id, on_save, port=80, host="0.0.0.0"):
        portal = self
        self.get_config = get_config
        self.networks = networks
        self.device_id = device_id
        self.on_save = on_save
        self.saved = threading.Event()
        self.lock = threading.Lock()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):  # ruhig bleiben
                pass

            def _send(self, code, body, content_type="text/html; charset=utf-8", headers=None):
                data = body.encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                for k, v in (headers or {}).items():
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                # Alle fremden Adressen (Captive-Portal-Erkennung von Android/iOS) zur Einrichtungsseite umleiten
                host = (self.headers.get("Host") or "").split(":")[0]
                if host not in ("", AP_ADDRESS, "localhost", "127.0.0.1") or self.path not in ("/", "/index.html"):
                    return self._send(302, "", headers={"Location": f"http://{AP_ADDRESS}/"})
                self._send(200, render_form(portal.get_config(), portal.networks, portal.device_id))

            def do_POST(self):
                if self.path != "/save":
                    return self._send(404, "Nicht gefunden", "text/plain; charset=utf-8")
                if portal.saved.is_set():
                    # Doppelt abgeschickt (z.B. Handy sendet erneut) – bereits gespeichert
                    return self._send(200, PAGE.format(body='<p class="ok">Bereits gespeichert – diese Seite kannst du schließen.</p>'))
                length = min(int(self.headers.get("Content-Length") or 0), 16384)
                form = {k: v[0] for k, v in urllib.parse.parse_qs(self.rfile.read(length).decode("utf-8")).items()}
                try:
                    new = apply_form(portal.get_config(), form)
                except ValueError as exc:
                    return self._send(400, render_form(portal.get_config(), portal.networks, portal.device_id, f"Fehler: {exc}"))
                with portal.lock:
                    if portal.saved.is_set():
                        return self._send(200, PAGE.format(body='<p class="ok">Bereits gespeichert.</p>'))
                    portal.on_save(new)
                    portal.saved.set()
                self._send(200, PAGE.format(body='<p class="ok">Gespeichert. Der Spieltisch verbindet sich jetzt mit '
                                            f'<b>{html.escape(new["wifi"][0]["ssid"])}</b> – diese Seite kannst du schließen.</p>'))

        self.server = ThreadingHTTPServer((host, port), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def start(self):
        self.thread.start()
        return self

    def stop(self):
        self.server.shutdown()
        self.server.server_close()

