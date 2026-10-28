"""Monitordaten: DM → Server → Agent (kiosk.json) → Anzeige, und Gerät → neuer Server.

Benötigt einen lokal laufenden Server unter http://localhost:3000 (npm start).
Aufruf aus dem Projektordner:  python kiosk/tests/test_monitor.py
"""
import importlib.util
import json
import os
import sys
import tempfile
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
KDIR = os.path.join(ROOT, "kiosk", "files", "rootfs", "opt", "kiosk")
sys.path.insert(0, KDIR)
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("agent", os.path.join(KDIR, "agent.py"))
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)
if not hasattr(os, "sync"):
    os.sync = lambda: None
tmp = tempfile.mkdtemp()
agent.CONFIG = os.path.join(tmp, "kiosk.json")
agent.BACKUP = agent.CONFIG + ".bak"
agent.CMDLINE = os.path.join(tmp, "cmdline.txt")
agent.RUN = tmp
agent.ip_address = lambda: "127.0.0.1"
with open(agent.CMDLINE, "w") as f:
    f.write("console=tty1 root=PARTUUID=x-02 rootwait quiet\n")
calls = []
agent.sh = lambda *a, **k: calls.append(a) or ""
agent.device_id = lambda: "pi-mon00001"
agent.current_ssid = lambda: "Test"
BASE = "http://localhost:3000"
results = []
ok = lambda c, m: print(("  OK   " if c else "  FEHLER ") + m) or results.append(c)


def api(method, path, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers={"content-type": "application/json"}, method=method)
    with urllib.request.urlopen(req) as r:
        return json.load(r) if r.status != 204 else None


try:
    urllib.request.urlopen(BASE + "/api/version", timeout=2)
except OSError:
    print("Übersprungen – kein lokaler Server unter " + BASE)
    sys.exit(0)

cfg = {**agent.DEFAULTS, "serverUrl": BASE, "wifi": [{"ssid": "Test", "psk": "testtest1"}]}
agent.write_config(cfg)
agent.heartbeat(cfg)
info = api("GET", "/api/kiosks/pi-mon00001/display")
ok(info["calibration"] is None, "ohne eigene Monitordaten gilt die globale Kalibrierung")

# DM trägt Monitordaten ein (43″, Full HD, gedreht, HDMI 1080p60)
monitor = {"resW": 1920, "resH": 1080, "aspectW": 16, "aspectH": 9, "sizeMode": "diagonal", "diagonalIn": 43, "fineTune": 1.02, "rotation": 180, "output": "1920x1080@60"}
api("PUT", "/api/kiosks/pi-mon00001", {"desired": {"monitor": monitor}})
res = agent.heartbeat(cfg)
ok(res["desired"] and res["desired"]["monitor"]["diagonalIn"] == 43, "Agent erhält die Monitordaten")
new = agent.merge_desired(cfg, res["desired"])
agent.write_config(new)
agent.apply_new_config(cfg, new)
saved = json.load(open(agent.CONFIG, encoding="utf-8"))
ok(saved["monitor"]["resW"] == 1920 and saved["monitor"]["rotation"] == 180, "Monitordaten in kiosk.json auf dem Gerät gespeichert")
ok(json.load(open(agent.BACKUP, encoding="utf-8"))["monitor"]["diagonalIn"] == 43, "… und in der Sicherung")
ok("video=HDMI-A-1:1920x1080@60" in open(agent.CMDLINE).read(), "HDMI-Modus in cmdline.txt eingetragen")
ok(("systemctl", "reboot") in calls, "Gerät startet für den HDMI-Modus neu")
ok(sum(1 for c in calls if c[:3] == ("mount", "-o", "remount,ro")) >= 2, "Boot-Partition jedes Mal wieder schreibgeschützt")
cfg = new
agent.heartbeat(cfg)
info = api("GET", "/api/kiosks/pi-mon00001/display")
ok(info["calibration"]["diagonalIn"] == 43 and info["calibration"]["fineTune"] == 1.02, "Anzeige des Geräts bekommt seine eigene Kalibrierung")

# HDMI wieder automatisch → Eintrag verschwindet
calls.clear()
auto = dict(cfg, monitor=dict(cfg["monitor"], output="auto"))
agent.apply_new_config(cfg, auto)
ok("video=" not in open(agent.CMDLINE).read(), "HDMI „Automatisch“ entfernt den Eintrag wieder")

# Testmuster auf dem Gerät
api("PUT", "/api/kiosks/pi-mon00001", {"display": {"campaignId": None, "mode": "calibrate"}})
ok(api("GET", "/api/kiosks/pi-mon00001/display")["display"]["mode"] == "calibrate", "Testmuster lässt sich zuweisen")

# Neuer Server: Gerät meldet sich mit seinen Monitordaten → werden übernommen
api("DELETE", "/api/kiosks/pi-mon00001")
agent.heartbeat(cfg)
info = api("GET", "/api/kiosks/pi-mon00001/display")
ok(info["calibration"] and info["calibration"]["diagonalIn"] == 43, "neu aufgesetzter Server übernimmt die Monitordaten vom Gerät")

# Ungültige Werte werden abgefangen
api("PUT", "/api/kiosks/pi-mon00001", {"desired": {"monitor": {"resW": "abc", "diagonalIn": -5, "output": "rm -rf"}}})
k = next(x for x in api("GET", "/api/kiosks") if x["id"] == "pi-mon00001")
ok(k["desired"]["monitor"]["output"] == "auto" and k["desired"]["monitor"]["resW"] >= 320, "ungültige Monitordaten werden bereinigt")

api("DELETE", "/api/kiosks/pi-mon00001")
print(f"\n{sum(results)}/{len(results)} Prüfungen bestanden")
sys.exit(0 if all(results) else 1)
