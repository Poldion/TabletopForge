#!/usr/bin/env python3
"""Liefert die lokale Startseite (/run/kiosk/start.html) über http://127.0.0.1:8088 aus.

WPE WebKit führt in Seiten, die per file:// geöffnet werden, weder Skripte noch Timer zuverlässig
aus – die Startseite (wartet auf den Server, leitet dann weiter) muss daher über HTTP kommen.
Nur lokal erreichbar; ausgeliefert werden ausschließlich start.html und auth.json (Anmeldestatus vom Agenten).
"""
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

RUN = "/run/kiosk"
PORT = 8088
READY = os.path.join(RUN, "http.ready")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/auth.json":
            # Einmal-Anmeldung für den Browser (vom Agenten geholt); fehlt sie noch → leer
            try:
                with open(os.path.join(RUN, "auth.json"), "rb") as f:
                    data = f.read()
            except OSError:
                data = b"{}"
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if path not in ("/", "/start.html"):
            self.send_error(404)
            return
        try:
            with open(os.path.join(RUN, "start.html"), "rb") as f:
                data = f.read()
        except OSError:
            data = b"<!doctype html><meta charset=utf-8><body style='background:#0b0a08;color:#ccc'>Starte ...<script>setTimeout(()=>location.reload(),1000)</script>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    os.makedirs(RUN, exist_ok=True)
    with open(READY, "w") as f:
        f.write(str(os.getpid()))
    try:
        server.serve_forever()
    finally:
        try:
            os.remove(READY)
        except OSError:
            pass


if __name__ == "__main__":
    main()
