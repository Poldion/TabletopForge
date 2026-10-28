"""Tests für Kiosk-Agent und Einrichtungsmodus – laufen ohne Raspberry Pi.

Aufruf aus dem Projektordner:  python kiosk/tests/test_agent.py
Der Abgleich mit dem Server wird nur geprüft, wenn unter http://localhost:3000 ein Server läuft.
"""
import importlib.util
import json
import os
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
KDIR = os.path.join(ROOT, "kiosk", "files", "rootfs", "opt", "kiosk")
sys.path.insert(0, KDIR)
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("agent", os.path.join(KDIR, "agent.py"))
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)
import setup_ap  # noqa: E402

ok = lambda cond, msg: print(("  OK   " if cond else "  FEHLER ") + msg) or cond
results = []

# --- 1. Backup und Reparatur -----------------------------------------------------------
print("1. Backup")
tmp = tempfile.mkdtemp()
agent.CONFIG = os.path.join(tmp, "kiosk.json")
agent.BACKUP = agent.CONFIG + ".bak"
agent.sh = lambda *a, **k: ""  # kein mount unter Windows
if not hasattr(os, "sync"):
    os.sync = lambda: None  # gibt es nur unter Linux
cfg = {**agent.DEFAULTS, "serverUrl": "http://srv:4300", "wifi": [{"ssid": "Zuhause", "psk": "geheim123"}]}
agent.write_config(cfg)
results.append(ok(os.path.exists(agent.BACKUP) and json.load(open(agent.BACKUP))["serverUrl"] == "http://srv:4300", "Sicherung wird mitgeschrieben"))
with open(agent.CONFIG, "w") as f:
    f.write('{"serverUrl": "http://srv:43')  # Stromausfall mitten im Schreiben
loaded = agent.load_config()
results.append(ok(loaded["serverUrl"] == "http://srv:4300" and loaded["wifi"][0]["psk"] == "geheim123", "beschädigte kiosk.json → Werte aus der Sicherung"))
results.append(ok(json.load(open(agent.CONFIG))["serverUrl"] == "http://srv:4300", "kiosk.json aus der Sicherung repariert"))
os.remove(agent.CONFIG)
os.remove(agent.BACKUP)
results.append(ok(agent.load_config()["serverUrl"] == "", "beide fehlen → Standardwerte, kein Absturz"))

# --- 2. Einrichtungsseite -------------------------------------------------------------
print("2. Einrichtungsseite")
state = {"cfg": dict(cfg)}
saved = []
networks = [{"ssid": "Zuhause", "signal": 80, "secure": True}, {"ssid": "Spielort", "signal": 55, "secure": True}]
portal = setup_ap.Portal(lambda: state["cfg"], networks, "pi-abcd1234", lambda c: (saved.append(c), state.update(cfg=c)), port=8765, host="127.0.0.1").start()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


opener = urllib.request.build_opener(NoRedirect)


def get(path, host="127.0.0.1"):
    req = urllib.request.Request(f"http://127.0.0.1:8765{path}", headers={"Host": host})
    try:
        r = opener.open(req, timeout=5)
        return r.status, r.read().decode(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), e.headers


def post(data):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request("http://127.0.0.1:8765/save", data=body, method="POST")
    try:
        r = urllib.request.urlopen(req, timeout=5)
        return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


code, body, _ = get("/")
results.append(ok(code == 200 and "Spielort (55 %)" in body and 'value="http://srv:4300"' in body, "Formular mit WLAN-Liste und Server-Adresse"))
results.append(ok("geheim123" not in body, "gespeichertes Passwort wird nie angezeigt"))
code, _, headers = get("/generate_204", host="connectivitycheck.gstatic.com")
results.append(ok(code == 302 and headers.get("Location") == "http://10.42.0.1/", "Android-Prüfung → Weiterleitung zur Einrichtung (Captive Portal)"))
code, _, headers = get("/hotspot-detect.html", host="captive.apple.com")
results.append(ok(code == 302, "iOS-Prüfung → Weiterleitung zur Einrichtung"))
code, body = post({"ssid": "Spielort", "psk": "kurz", "serverUrl": "http://srv:4300"})
results.append(ok(code == 400 and "mindestens 8 Zeichen" in body and not saved, "zu kurzes Passwort wird abgelehnt"))
code, body = post({"ssid": "", "psk": "", "serverUrl": ""})
results.append(ok(code == 400 and not saved, "leere Pflichtfelder werden abgelehnt"))
code, body = post({"ssid": "Spielort", "psk": "spielort-pw", "serverUrl": "192.168.1.10:3000", "hostname": "Tisch-2"})
new = saved[-1] if saved else {}
results.append(ok(code == 200 and portal.saved.is_set(), "Speichern beendet den Einrichtungsmodus"))
results.append(ok([w["ssid"] for w in new.get("wifi", [])] == ["Spielort", "Zuhause"], "gewähltes WLAN steht vorn, bisherige bleiben erhalten"))
results.append(ok(new.get("wifi", [{}, {}])[1].get("psk") == "geheim123", "Passwort des alten WLANs bleibt erhalten"))
results.append(ok(new.get("serverUrl") == "http://192.168.1.10:3000" and new.get("hostname") == "tisch-2", "http:// ergänzt, Hostname normalisiert"))
results.append(ok(new.get("localChange") is True, "Änderung wird für den Server markiert"))
n_saved = len(saved)
code, body = post({"ssid": "Zuhause", "psk": "", "serverUrl": "http://srv:4300"})
results.append(ok(code == 200 and len(saved) == n_saved, "doppelt abgeschickt → nur einmal gespeichert"))
again = setup_ap.apply_form(saved[-1], {"ssid": "Zuhause", "psk": "", "serverUrl": "http://srv:4300"})
results.append(ok(again["wifi"][0] == {"ssid": "Zuhause", "psk": "geheim123"}, "leeres Passwortfeld behält das gespeicherte"))
portal.stop()
results.append(ok(setup_ap.ap_credentials("pi-abcd1234") == ("DnD-Kiosk-1234", "dnd-abcd1234"), "Hotspot-Name und -Passwort aus der Geräte-ID"))

# --- 3. Lokale Änderung an den Server melden -------------------------------------------
print("3. Abgleich mit dem Server")
try:
    urllib.request.urlopen("http://localhost:3000/api/version", timeout=2)
except OSError:
    print("  (übersprungen – kein lokaler Server)")
    print(f"\n{sum(results)}/{len(results)} Prüfungen bestanden")
    sys.exit(0 if all(results) else 1)
agent.device_id = lambda: "pi-abcd1234"
agent.current_ssid = lambda: "Spielort"
agent.RUN = tmp
agent.AUTH_STATE = os.path.join(tmp, "auth.json")
# Altes Gerät mit derselben ID aus früheren Läufen entfernen (sonst passt der Schlüssel nicht)
try:
    urllib.request.urlopen(urllib.request.Request("http://localhost:3000/api/kiosks/pi-abcd1234", method="DELETE"))
except urllib.error.HTTPError:
    pass
local = dict(new, serverUrl="http://localhost:3000")
res = agent.heartbeat(local)
key = local.get("deviceKey")
results.append(ok(isinstance(key, str) and len(key) >= 32 and json.load(open(agent.CONFIG)).get("deviceKey") == key, "Geräteschlüssel erzeugt und in kiosk.json gespeichert"))
state = json.load(open(agent.AUTH_STATE))
results.append(ok(state.get("state") in ("open", "ok"), f"Anmeldestatus für die Startseite geschrieben ({state.get('state')})"))
results.append(ok(isinstance(res.get("ack"), int) and res["ack"] >= 1, f"Server bestätigt lokale Änderung (Stand {res.get('ack')})"))
kiosks = json.load(urllib.request.urlopen("http://localhost:3000/api/kiosks"))
k = next(x for x in kiosks if x["id"] == "pi-abcd1234")
results.append(ok([w["ssid"] for w in k["desired"]["wifi"]] == ["Spielort", "Zuhause"] and all(w["hasPsk"] for w in k["desired"]["wifi"]), "Server kennt die neuen Netze (ohne Passwörter)"))
acked = dict(local, rev=res["ack"])
acked.pop("localChange")
res2 = agent.heartbeat(acked)
results.append(ok(res2.get("desired") is None and res2.get("ack") is None, "danach kein erneuter Abgleich nötig"))
try:
    agent.heartbeat(dict(acked, deviceKey="x" * 43))
    results.append(ok(False, "fremder Schlüssel für dieselbe Geräte-ID wird abgelehnt"))
except urllib.error.HTTPError as exc:
    results.append(ok(exc.code == 401, "fremder Schlüssel für dieselbe Geräte-ID wird abgelehnt"))
urllib.request.urlopen(urllib.request.Request("http://localhost:3000/api/kiosks/pi-abcd1234", method="DELETE"))

print(f"\n{sum(results)}/{len(results)} Prüfungen bestanden")
sys.exit(0 if all(results) else 1)
