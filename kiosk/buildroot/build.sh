#!/bin/bash
# Baut das schlanke Kiosk-Image (Buildroot) – läuft in der WSL-Distribution „dnd-buildroot“ auf D:.
# Aufruf unter Windows: kiosk\build-buildroot.ps1   (oder direkt: wsl -d dnd-buildroot bash <pfad>/build.sh)
#
# Der erste Lauf lädt alle Quellen und übersetzt u.a. WebKit – das dauert mehrere Stunden.
# Folgende Läufe bauen nur Geändertes neu (meist wenige Minuten).
set -euo pipefail
# Windows-Pfade (von WSL angehängt, mit Leerzeichen) mag Buildroot nicht
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
BR_VERSION=2026.02.3
HERE="$(cd "$(dirname "$0")" && pwd)"
KIOSK="$(dirname "$HERE")"
REPO="$(dirname "$KIOSK")"
WORK="${KIOSK_WORK:-$HOME/dnd-kiosk}"
BR="$WORK/buildroot-$BR_VERSION"
EXT="$WORK/external"
OUT="$WORK/out"
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$REPO/package.json" | head -1)"
export KIOSK_VERSION="$VERSION"
export BR2_DL_DIR="$WORK/dl"
export BR2_CCACHE_DIR="$WORK/ccache"

# gawk ist Pflicht: libgpg-error berechnet damit die Größe seines Sperrobjekts – mit mawk kommt
# stillschweigend 0 heraus und jeder Prozess mit libgcrypt (u.a. WebKit) bricht sofort ab
command -v gawk >/dev/null || { echo "!! gawk fehlt (sudo apt-get install gawk)"; exit 1; }

mkdir -p "$WORK" "$BR2_DL_DIR"
if [ ! -d "$BR" ]; then
  echo ">> Lade Buildroot $BR_VERSION"
  git clone -q --depth 1 --branch "$BR_VERSION" https://gitlab.com/buildroot.org/buildroot.git "$BR"
fi

# Konfiguration aus dem Repo in ein Linux-Dateisystem spiegeln (saubere Rechte, keine Windows-Pfade)
echo ">> Übernehme Kiosk-Dateien aus $KIOSK"
rsync -a --delete --chmod=D755,F644 "$HERE/" "$EXT/" --exclude build.sh
rsync -a --delete --chmod=D755,F644 "$KIOSK/files/rootfs/" "$EXT/rootfs-common/"
mkdir -p "$EXT/kiosk-files/boot"
cp "$KIOSK/files/boot/kiosk.json" "$EXT/kiosk-files/boot/kiosk.json"
rm -f "$EXT/kiosk-files/kiosk.local.json"
[ -f "$KIOSK/kiosk.local.json" ] && cp "$KIOSK/kiosk.local.json" "$EXT/kiosk-files/kiosk.local.json"
chmod 755 "$EXT/board/zero2w/post-build.sh" "$EXT/board/zero2w/post-image.sh"

make -C "$BR" O="$OUT" BR2_EXTERNAL="$EXT" dnd_kiosk_zero2w_defconfig >/dev/null
# Parallele Jobs nach Arbeitsspeicher begrenzen: einzelne WebKit-Dateien brauchen beim Übersetzen
# bis zu 3 GB – zu viele gleichzeitig und der Compiler wird abgebrochen
MEM_GB=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 / 1024 ))
JOBS=${KIOSK_JOBS:-$(( MEM_GB / 3 ))}
[ "$JOBS" -lt 1 ] && JOBS=1
[ "$JOBS" -gt "$(nproc)" ] && JOBS=$(nproc)
echo ">> Baue Image $VERSION mit $JOBS parallelen Jobs (Protokoll: $OUT/build.log)"
[ -f "$OUT/build.log" ] && mv "$OUT/build.log" "$OUT/build.log.vorher"
start=$(date +%s)
# config.txt/cmdline.txt stecken im Firmware-Paket – ohne Neubau würden Änderungen daran ignoriert
make -C "$BR" O="$OUT" rpi-firmware-dirclean >/dev/null 2>&1 || true
# Geänderte Kernel-Konfiguration (linux.fragment) erkennt Buildroot nicht von selbst – dann Kernel neu bauen
FRAG_SUM="$(sha256sum "$EXT/board/zero2w/linux.fragment" | cut -d' ' -f1)"
if [ "$(cat "$OUT/.linux-fragment.sha256" 2>/dev/null)" != "$FRAG_SUM" ]; then
  echo ">> Kernel-Konfiguration geändert – Kernel wird neu gebaut"
  make -C "$BR" O="$OUT" linux-dirclean >/dev/null 2>&1 || true
  echo "$FRAG_SUM" > "$OUT/.linux-fragment.sha256"
fi
# fc-cache des Build-Rechners (gleiche fontconfig-Version) legt in post-build.sh den Schriften-Cache an
make -C "$BR" O="$OUT" host-fontconfig >> "$OUT/build.log" 2>&1 || echo "!! host-fontconfig nicht gebaut – kein Schriften-Cache"
if ! make -C "$BR" O="$OUT" BR2_JLEVEL="$JOBS" > "$OUT/build.log" 2>&1; then
  tail -60 "$OUT/build.log"
  echo "!! Build fehlgeschlagen – vollständiges Protokoll: $OUT/build.log"
  exit 1
fi
echo ">> Fertig nach $(( ($(date +%s) - start) / 60 )) Minuten"

NAME="tabletop-forge-kiosk-${VERSION}-buildroot-$(date +%Y%m%d)"
[ -f "$EXT/kiosk-files/kiosk.local.json" ] && NAME="${NAME}-privat"
DIST="$KIOSK/dist"
mkdir -p "$DIST"
echo ">> Komprimiere nach $DIST/$NAME.img.xz"
xz -T0 -6 -c "$OUT/images/sdcard.img" > "$WORK/$NAME.img.xz"
(cd "$WORK" && sha256sum "$NAME.img.xz" > "$NAME.img.xz.sha256")
cp "$WORK/$NAME.img.xz" "$WORK/$NAME.img.xz.sha256" "$DIST/"
# Update-Paket für die Verteilung über den Server (ohne private Daten – auch für weitergegebene Geräte)
cp "$OUT/images/kiosk-update.kup" "$DIST/tabletop-forge-kiosk-${VERSION}.kup"
rm -f "$WORK/$NAME.img.xz" "$WORK/$NAME.img.xz.sha256"
ls -lh "$OUT/images/sdcard.img" "$DIST/$NAME.img.xz" "$DIST/tabletop-forge-kiosk-${VERSION}.kup"

# Lizenzpflichten: Wer das Image weitergibt, muss u.a. den Quellcode der GPL-Komponenten anbieten. Buildroot sammelt
# Lizenztexte, Quellen und Patches aller Pakete in legal-info/ – als Archiv neben das Image legen.
# Abschalten (z.B. für schnelle Testbauten, die nicht weitergegeben werden): KIOSK_LEGAL_INFO=0
if [ "${KIOSK_LEGAL_INFO:-1}" != 0 ]; then
  echo ">> Sammle Lizenzen und Quellen (make legal-info) – beim ersten Mal dauert das"
  rm -rf "$OUT/legal-info"
  if make -C "$BR" O="$OUT" legal-info >> "$OUT/build.log" 2>&1; then
    LEGAL="tabletop-forge-kiosk-${VERSION}-legal-info.tar"
    tar -C "$OUT" -cf "$WORK/$LEGAL" legal-info
    mv "$WORK/$LEGAL" "$DIST/$LEGAL"
    ls -lh "$DIST/$LEGAL"
  else
    echo "!! make legal-info fehlgeschlagen – vor einer Weitergabe des Images nachholen (Protokoll: $OUT/build.log)"
  fi
fi
