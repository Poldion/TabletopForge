#!/usr/bin/env python3
"""Startbild: schreibt gleich nach dem Einschalten das Motiv aus /opt/kiosk/splash direkt in den Bildspeicher
(/dev/fb0), bis der Browser übernimmt und dieselbe Ansicht als Startseite zeigt.

Die Bilder liegen als Rohdaten (zlib) in drei Größen und für 16 Bit (RGB565, Grafiktreiber) sowie 32 Bit
(BGRA, Firmware-Bildspeicher der ersten Sekunden) vor – erzeugt mit kiosk/splash/make-splash.mjs. Genommen wird
die größte Fassung, die auf den Bildschirm passt.
"""
import fcntl
import os
import struct
import sys
import time
import zlib

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "splash")
FB = "/dev/fb0"
FBIOGET_VSCREENINFO = 0x4600
FBIOGET_FSCREENINFO = 0x4602
BG = (0x0B, 0x0A, 0x08)  # Hintergrund wie start.html


def pixel(bpp, r, g, b):
    if bpp == 32:
        return bytes((b, g, r, 255))
    return struct.pack("<H", ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3))


def screen_info(fd):
    var = fcntl.ioctl(fd, FBIOGET_VSCREENINFO, bytes(160))
    xres, yres, _xv, _yv, _xo, _yo, bpp = struct.unpack_from("<7I", var)
    fix = fcntl.ioctl(fd, FBIOGET_FSCREENINFO, bytes(80))
    # struct fb_fix_screeninfo: char id[16]; unsigned long smem_start; u32 smem_len, type, type_aux,
    # visual; u16 xpanstep, ypanstep, ywrapstep; u32 line_length …
    ptr = struct.calcsize("P")
    off = 16 + ptr + 4 * 4 + 2 * 3
    off += (-off) % 4
    (stride,) = struct.unpack_from("<I", fix, off)
    return xres, yres, bpp, stride


def load(height, bpp):
    """Größtes Motiv, das zur Bildschirmhöhe passt (Dateien splash-<Höhe>-<Bit>.bin)."""
    suffix = f"-{bpp}.bin"
    sizes = sorted((int(n[7 : -len(suffix)]) for n in os.listdir(HERE) if n.startswith("splash-") and n.endswith(suffix)), reverse=True)
    pick = next((s for s in sizes if s <= height), sizes[-1])
    with open(os.path.join(HERE, f"splash-{pick}{suffix}"), "rb") as f:
        raw = f.read()
    if raw[:4] != b"SPL1":
        raise ValueError("unbekanntes Format")
    w, h = struct.unpack_from("<HH", raw, 4)
    return w, h, zlib.decompress(raw[8:])


def draw():
    fd = os.open(FB, os.O_RDWR)
    try:
        xres, yres, bpp, stride = screen_info(fd)
        if bpp not in (16, 32):
            return
        bpx = bpp // 8
        w, h, img = load(yres, bpp)
        bg_row = pixel(bpp, *BG) * xres + bytes(stride - xres * bpx)
        frame = bytearray(bg_row * yres)
        if w <= xres and h <= yres:
            x0 = (xres - w) // 2 * bpx
            y0 = (yres - h) // 2
            row = w * bpx
            for y in range(h):
                o = (y0 + y) * stride + x0
                frame[o : o + row] = img[y * row : (y + 1) * row]
        os.lseek(fd, 0, os.SEEK_SET)
        os.write(fd, frame)
        print(f"[splash] gezeichnet auf {fb_name()} {xres}x{yres}x{bpp}", flush=True)
    finally:
        os.close(fd)


def fb_name():
    try:
        with open("/sys/class/graphics/fb0/name", encoding="ascii") as f:
            return f.read().strip()
    except OSError:
        return None


def main():
    for _ in range(150):
        if os.path.exists(FB):
            break
        time.sleep(0.05)
    else:
        return 0
    # Zuerst in den Bildspeicher der Firmware (steht nach ~1 s bereit) …
    first = fb_name()
    draw()
    if first and first.startswith("vc4"):
        return 0
    # … und noch einmal, sobald der Grafiktreiber (vc4) übernimmt – er setzt Modus und Bild neu
    for _ in range(300):
        time.sleep(0.1)
        name = fb_name()
        if name and name != first and os.path.exists(FB):
            time.sleep(0.3)  # Konsole hat sich auf den neuen Bildspeicher eingerichtet
            draw()
            break
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # Startbild ist Kosmetik – nie den Start aufhalten
        print(f"[splash] {e}", file=sys.stderr)
        sys.exit(0)
