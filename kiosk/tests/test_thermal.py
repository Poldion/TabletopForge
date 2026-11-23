"""Tests für den Hitzeschutz des Kiosk-Agenten – laufen ohne Gerät, mit nachgebauten Systemdateien.

Aufruf aus dem Projektordner:  python kiosk/tests/test_thermal.py
"""
import importlib.util
import os
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
KDIR = os.path.join(ROOT, "kiosk", "files", "rootfs", "opt", "kiosk")
sys.path.insert(0, KDIR)
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("agent", os.path.join(KDIR, "agent.py"))
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)

results = []


def ok(cond, msg):
    print(("  OK   " if cond else "  FEHLER ") + msg)
    results.append(bool(cond))
    return cond


tmp = tempfile.mkdtemp()
zones = [os.path.join(tmp, f"thermal_zone{i}") for i in range(3)]
for z in zones:
    os.makedirs(z)
pol = os.path.join(tmp, "policy0")
os.makedirs(pol)
agent.THERMAL_ZONES = os.path.join(tmp, "thermal_zone*", "temp")
agent.CPUFREQ = os.path.join(tmp, "policy*")
agent.log = lambda *a: None


def put(path, value):
    with open(path, "w", encoding="ascii") as f:
        f.write(str(value))


def temps(*values):
    for z, v in zip(zones, values):
        put(os.path.join(z, "temp"), int(v * 1000))


def cap():
    with open(os.path.join(pol, "scaling_max_freq"), encoding="ascii") as f:
        return int(f.read())


put(os.path.join(pol, "cpuinfo_max_freq"), 1416000)
put(os.path.join(pol, "cpuinfo_min_freq"), 480000)
put(os.path.join(pol, "scaling_max_freq"), 1416000)

print("1. Temperatur: der wärmste Fühler zählt")
temps(61, 74.5, 66)
ok(agent.max_temp() == 74.5, "höchster von drei Fühlern")
put(os.path.join(zones[0], "temp"), "kaputt")
ok(agent.max_temp() == 74.5, "ein unlesbarer Fühler stört nicht")
ok(agent.power_state()["temp"] == 74.5 and agent.power_state()["throttle"] == 0, "Meldung an den Server: Temperatur und Stufe")

print("2. Stufen mit Abstand beim Zurückschalten")
L = agent.thermal_level
ok(L(70, 0) == 0 and L(89.9, 0) == 0, "unter 90 °C frei")
ok(L(90, 0) == 1 and L(93, 0) == 1, "ab 90 °C Stufe 1")
ok(L(94, 0) == 2 and L(99, 1) == 2, "ab 94 °C Stufe 2")
ok(L(88, 1) == 1 and L(83, 1) == 1, "Stufe 1 bleibt, bis es 8 Grad kühler ist")
ok(L(82, 1) == 0, "bei 82 °C wieder frei")
ok(L(90, 2) == 2 and L(86, 2) == 1 and L(80, 2) == 0, "von Stufe 2 schrittweise zurück")
ok(L(None, 1) == 1, "ohne Messwert ändert sich nichts")

print("3. Prozessortakt wird begrenzt und wieder freigegeben")
temps(70, 72, 71)
ok(agent.thermal_guard() == 0 and cap() == 1416000, "kühl: voller Takt")
temps(88, 91, 89)
ok(agent.thermal_guard() == 1 and cap() == int(1416000 * 0.72), "ab 90 °C auf 72 % begrenzt")
temps(95, 96, 93)
ok(agent.thermal_guard() == 2 and cap() == 480000, "ab 94 °C auf den kleinsten Takt")
temps(88, 89, 87)
ok(agent.thermal_guard() == 2, "noch zu warm: bleibt")
temps(85, 86, 84)
ok(agent.thermal_guard() == 1 and cap() == int(1416000 * 0.72), "abgekühlt: eine Stufe zurück")
temps(80, 81, 79)
ok(agent.thermal_guard() == 0 and cap() == 1416000, "wieder frei")
ok(agent.power_state()["throttle"] == 0, "Stufe in der Meldung")

print()
print("ALLES OK" if all(results) else f"{results.count(False)} FEHLER")
sys.exit(0 if all(results) else 1)
