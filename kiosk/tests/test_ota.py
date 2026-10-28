"""Tests für Updates über das Netz (A/B-Systemplätze) – laufen ohne Raspberry Pi.

Aufruf aus dem Projektordner:  python kiosk/tests/test_ota.py
Spielt ein komplettes Update durch: Paket vom (lokalen Test-)Server laden, in Platz B schreiben, Probestart
vorbereiten, Bestätigung bzw. Rückfall auf Platz A – dazu ein beschädigtes Paket.
"""
import contextlib
import hashlib
import http.server
import io
import json
import os
import sys
import tarfile
import tempfile
import threading
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "kiosk", "files", "rootfs", "opt", "kiosk"))
sys.dont_write_bytecode = True
import ota  # noqa: E402

ok = lambda cond, msg: print(("  OK   " if cond else "  FEHLER ") + msg) or cond
results = []
tmp = tempfile.mkdtemp()
boot = os.path.join(tmp, "boot")
os.makedirs(os.path.join(boot, "a"))
with open(os.path.join(boot, "config.txt"), "w") as f:
    f.write("kernel=Image\n\nos_prefix=a/\n\ndtoverlay=vc4-kms-v3d\n")
with open(os.path.join(boot, "a", "cmdline.txt"), "w") as f:
    f.write("root=/dev/mmcblk0p2 rootfstype=squashfs ro quiet video=HDMI-A-1:1600x900@60\n")

# Partition von Platz B als Datei; kein mount, kein Neustart
ota.DISK = os.path.join(tmp, "mmc")
ota._block_size = lambda dev: 4 << 20
ota.CONFIRMED = os.path.join(tmp, "run", "update-confirmed")
reboots = []
ota.subprocess.run = lambda args, **k: reboots.append(args)
ota.time.sleep = lambda s: None
logs = []
inst = ota.Ota(boot, lambda *a: logs.append(" ".join(map(str, a))), contextlib.nullcontext)
slot = {"cur": "a", "trial": False}
inst.current_slot = lambda: slot["cur"]
ota.Ota.trial = staticmethod(lambda: slot["trial"])


def bundle(version, rootfs, corrupt=False, corrupt_boot=False):
    """Update-Paket wie aus post-image.sh."""
    bt = io.BytesIO()
    with tarfile.open(fileobj=bt, mode="w") as t:
        for name, data in (("./Image", b"kernel-" + version.encode()), ("./bcm2710-rpi-zero-2-w.dtb", b"dtb"), ("./overlays/vc4-kms-v3d.dtbo", b"ov")):
            info = tarfile.TarInfo(name)
            info.size = len(data)
            t.addfile(info, io.BytesIO(data))
    boot_tar = bt.getvalue()
    entry = lambda f, d: {"file": f, "size": len(d), "sha256": hashlib.sha256(d).hexdigest()}
    manifest = {"format": 1, "board": "zero2w", "version": version, "boot": entry("boot.tar", boot_tar), "rootfs": entry("rootfs.squashfs", rootfs)}
    if corrupt:
        rootfs = rootfs[:-1] + b"X"
    if corrupt_boot:
        boot_tar = boot_tar.replace(b"kernel-", b"kernel+")
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode="w") as t:
        for name, data in (("manifest.json", json.dumps(manifest).encode()), ("boot.tar", boot_tar), ("rootfs.squashfs", rootfs)):
            info = tarfile.TarInfo(name)
            info.size = len(data)
            t.addfile(info, io.BytesIO(data))
    return out.getvalue()


files = {}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        data = files.get(self.path)
        self.send_response(200 if data else 404)
        self.send_header("Content-Length", str(len(data or b"")))
        self.end_headers()
        self.wfile.write(data or b"")

    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_port}"
rootfs = os.urandom(3 << 20)
files["/u/0.18.0"] = bundle("0.18.0", rootfs)
files["/u/kaputt"] = bundle("0.18.1", rootfs, corrupt=True)
files["/u/kaputt-boot"] = bundle("0.18.2", rootfs, corrupt_boot=True)
read = lambda *p: open(os.path.join(boot, *p), encoding="utf-8").read()

print("1. Update installieren")
inst._install(f"{base}/u/0.18.0", "0.18.0")
results.append(ok(open(os.path.join(boot, "b", "Image"), "rb").read() == b"kernel-0.18.0", "Kernel liegt in Platz b/"))
results.append(ok(os.path.exists(os.path.join(boot, "b", "overlays", "vc4-kms-v3d.dtbo")), "Overlays in b/overlays"))
cmd = read("b", "cmdline.txt")
results.append(ok(f"root={ota.DISK}p3" in cmd and "video=HDMI-A-1:1600x900@60" in cmd, "cmdline.txt: neue Root-Partition, HDMI-Modus übernommen"))
results.append(ok(open(ota.DISK + "p3", "rb").read() == rootfs, "Root-Dateisystem in Partition 3 geschrieben"))
results.append(ok("os_prefix=b/" in read("tryboot.txt") and "dtoverlay=vc4-kms-v3d" in read("tryboot.txt"), "tryboot.txt startet Platz b, sonst wie config.txt"))
results.append(ok("os_prefix=a/" in read("config.txt"), "config.txt bleibt bei Platz a (Rückfall möglich)"))
results.append(ok(reboots and "--reboot-argument=0 tryboot" in reboots[-1], "Neustart zur Probe (tryboot)"))
results.append(ok(not os.path.exists(os.path.join(boot, "b.new")) and not os.path.exists(os.path.join(boot, ".ota-boot.tar")), "keine Zwischendateien übrig"))

print("2. Probestart bestätigen")
slot.update(cur="b", trial=True)
inst.boot_check()
results.append(ok(ota.status["state"] == "trial", "Probestart wird erkannt"))
inst.confirm()
results.append(ok("os_prefix=b/" in read("config.txt") and not os.path.exists(os.path.join(boot, "tryboot.txt")), "config.txt startet jetzt dauerhaft Platz b"))
results.append(ok(ota.status["state"] == "done" and os.path.exists(ota.CONFIRMED), "Update als installiert gemeldet, Wächter bestätigt"))

print("3. Rückfall, wenn das neue System nicht startet")
reboots.clear()
inst._install(f"{base}/u/0.18.0", "0.18.0")  # von b nach a
results.append(ok("os_prefix=a/" in read("tryboot.txt") and f"root={ota.DISK}p2" in read("a", "cmdline.txt"), "zweites Update geht in Platz a"))
slot.update(cur="b", trial=False)  # Firmware hat beim Neustart wieder config.txt (Platz b) genommen
inst.boot_check()
results.append(ok(ota.status["state"] == "error" and "nicht gestartet" in ota.status["message"], "Rückfall wird als Fehler gemeldet"))
results.append(ok(not os.path.exists(os.path.join(boot, "tryboot.txt")) and "os_prefix=b/" in read("config.txt"), "altes System bleibt aktiv, Probestart aufgeräumt"))

print("4. Beschädigtes Paket")
before = read("config.txt")
inst._run(f"{base}/u/kaputt", "0.18.1")
results.append(ok(ota.status["state"] == "error" and "Prüfsumme" in ota.status["message"], "Prüfsummenfehler wird gemeldet"))
results.append(ok(read("config.txt") == before and not os.path.exists(os.path.join(boot, "tryboot.txt")), "kein Probestart, nichts umgestellt"))

inst._run(f"{base}/u/kaputt-boot", "0.18.2")
results.append(ok(ota.status["state"] == "error" and not os.path.exists(os.path.join(boot, "a.new")), "beschädigter Kernel-Teil: Fehler, halber Ordner entfernt"))
results.append(ok(open(os.path.join(boot, "b", "Image"), "rb").read() == b"kernel-0.18.0" and "os_prefix=b/" in read("config.txt"), "laufender Platz und config.txt bleiben unverändert"))

srv.shutdown()

# --- Download mit Aussetzern: abgebrochene und stockende Verbindungen werden fortgesetzt ---------------
print("Download mit Aussetzern")
blob = os.urandom(5 * 1024 * 1024 + 123)
calls = {"n": 0, "ranges": []}


class Flaky(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        calls["n"] += 1
        rng = self.headers.get("Range")
        start = int(rng.split("=")[1].split("-")[0]) if rng else 0
        calls["ranges"].append(start)
        part = blob[start:]
        self.send_response(206 if rng else 200)
        if rng:
            self.send_header("Content-Range", f"bytes {start}-{len(blob) - 1}/{len(blob)}")
        self.send_header("Content-Length", str(len(part)))
        self.end_headers()
        try:
            if calls["n"] == 1:
                self.wfile.write(part[: 1024 * 1024])  # 1. Versuch: Verbindung bricht ab
                return
            if calls["n"] == 2:
                self.wfile.write(part[: 512 * 1024])
                self.wfile.flush()
                time.sleep(1.5)  # 2. Versuch: Verbindung stockt (länger als die Wartezeit)
                return
            self.wfile.write(part)
        except OSError:
            pass

    def log_message(self, *a):
        pass


fsrv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Flaky)
threading.Thread(target=fsrv.serve_forever, daemon=True).start()
ota.READ_TIMEOUT = 0.5
real_sleep = ota.time.sleep
ota.time.sleep = lambda s: None  # keine echten Pausen zwischen den Versuchen
try:
    r = ota._Resumable(f"http://127.0.0.1:{fsrv.server_port}/x", {}, lambda *a: None)
    got = bytearray()
    while True:
        chunk = r.read(64 * 1024)
        if not chunk:
            break
        got += chunk
finally:
    ota.time.sleep = real_sleep
    fsrv.shutdown()
results.append(ok(bytes(got) == blob, f"vollständig und unverändert nach Abbruch und Stocken ({calls['n']} Verbindungen)"))
results.append(ok(calls["ranges"][0] == 0 and all(x > 0 for x in calls["ranges"][1:]), "setzt jeweils beim letzten Byte fort statt von vorn"))
results.append(ok(not ota.busy(), "kein Update als laufend gemeldet"))

print(f"\n{sum(results)}/{len(results)} Prüfungen bestanden")
sys.exit(0 if all(results) else 1)
