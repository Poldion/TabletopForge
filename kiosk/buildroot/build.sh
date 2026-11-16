#!/bin/bash
# Baut das schlanke Kiosk-Image (Buildroot) – läuft in der WSL-Distribution „dnd-buildroot“ auf D:.
# Aufruf unter Windows: kiosk\build-buildroot.ps1 [zero2w|opizero2w]
#   (oder direkt: wsl -d dnd-buildroot bash <pfad>/build.sh [zero2w|opizero2w])
#   zero2w     Raspberry Pi Zero 2 W (Standard)
#   opizero2w  Orange Pi Zero 2W – braucht vorher die Armbian-Kernelpakete (siehe unten, KIOSK_ARMBIAN_DEBS)
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
BOARD="${1:-zero2w}"
case "$BOARD" in
  zero2w) OUT="$WORK/out"; PREFIX="tabletop-forge-kiosk" ;;
  opizero2w) OUT="$WORK/out-opizero2w"; PREFIX="tabletop-forge-kiosk-orangepi-zero2w" ;;
  *) echo "!! Unbekanntes Gerät: $BOARD (zero2w oder opizero2w)"; exit 1 ;;
esac
# Version aus package.json – für Testpakete vorgebbar: KIOSK_VERSION_OVERRIDE=0.53.1-test1 build.sh opizero2w
VERSION="${KIOSK_VERSION_OVERRIDE:-$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$REPO/package.json" | head -1)}"
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
rsync -a --delete --chmod=D755,F644 "$HERE/" "$EXT/" --exclude build.sh --exclude armbian-debs
rsync -a --delete --chmod=D755,F644 "$KIOSK/files/rootfs/" "$EXT/rootfs-common/"
mkdir -p "$EXT/kiosk-files/boot"
cp "$KIOSK/files/boot/kiosk.json" "$EXT/kiosk-files/boot/kiosk.json"
rm -f "$EXT/kiosk-files/kiosk.local.json"
[ -f "$KIOSK/kiosk.local.json" ] && cp "$KIOSK/kiosk.local.json" "$EXT/kiosk-files/kiosk.local.json"
chmod 755 "$EXT"/board/*/post-build.sh "$EXT"/board/*/post-image.sh

if [ "$BOARD" = opizero2w ]; then
  # Kernel aus Armbian (HDMI, Panfrost, WLAN-Treiber): Pakete aus Armbians compile.sh, gebaut als root in
  # dieser WSL (festgelegter Armbian-Stand, siehe README):
  #   cd ~/dnd-kiosk/armbian && sudo ./compile.sh kernel BOARD=orangepizero2w BRANCH=current \
  #     KERNEL_CONFIGURE=no NO_HOST_RELEASE_CHECK=yes
  DEBS="${KIOSK_ARMBIAN_DEBS:-$WORK/armbian/output/debs}"
  if ! ls "$DEBS"/linux-image-current-sunxi64_*.deb "$DEBS"/linux-dtb-current-sunxi64_*.deb >/dev/null 2>&1; then
    echo "!! Armbian-Kernelpakete fehlen in $DEBS – erst Armbians compile.sh ausführen (siehe Kommentar)"
    exit 1
  fi
  rm -rf "$EXT/armbian-debs"
  mkdir -p "$EXT/armbian-debs"
  cp "$(ls -t "$DEBS"/linux-image-current-sunxi64_*.deb | head -1)" "$(ls -t "$DEBS"/linux-dtb-current-sunxi64_*.deb | head -1)" "$EXT/armbian-debs/"
  echo ">> Armbian-Kernel: $(ls "$EXT/armbian-debs" | sed -n 's/.*__\([0-9.]*\)-.*/\1/p' | sort -u | tr '\n' ' ')"
fi

make -C "$BR" O="$OUT" BR2_EXTERNAL="$EXT" "dnd_kiosk_${BOARD}_defconfig" >/dev/null
# Buildroot verwirft Optionen stillschweigend, wenn eine Voraussetzung fehlt (z.B. Panfrost ohne LLVM → kein EGL →
# kein WebKit) – dann lieber gleich abbrechen als ein Image ohne Browser bauen
NEEDED="WPEWEBKIT COG MESA3D_GBM MESA3D_OPENGL_EGL NETWORK_MANAGER PYTHON3"
[ "$BOARD" = opizero2w ] && NEEDED="$NEEDED CAGE SEATD_DAEMON MESA3D_GALLIUM_DRIVER_PANFROST ARMBIAN_KERNEL UWE5622_FIRMWARE XKEYBOARD_CONFIG CAIRO"
for opt in $NEEDED; do
  grep -q "^BR2_PACKAGE_${opt}=y" "$OUT/.config" || { echo "!! Option BR2_PACKAGE_${opt} ist nicht aktiv (Voraussetzung fehlt?)"; exit 1; }
done
# Parallele Jobs nach Arbeitsspeicher begrenzen: einzelne WebKit-Dateien brauchen beim Übersetzen
# bis zu 3 GB – zu viele gleichzeitig und der Compiler wird abgebrochen
MEM_GB=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 / 1024 ))
JOBS=${KIOSK_JOBS:-$(( MEM_GB / 3 ))}
[ "$JOBS" -lt 1 ] && JOBS=1
[ "$JOBS" -gt "$(nproc)" ] && JOBS=$(nproc)
echo ">> Baue Image $VERSION mit $JOBS parallelen Jobs (Protokoll: $OUT/build.log)"
[ -f "$OUT/build.log" ] && mv "$OUT/build.log" "$OUT/build.log.vorher"
start=$(date +%s)
if [ "$BOARD" = zero2w ]; then
  # config.txt/cmdline.txt stecken im Firmware-Paket – ohne Neubau würden Änderungen daran ignoriert
  make -C "$BR" O="$OUT" rpi-firmware-dirclean >/dev/null 2>&1 || true
  # Geänderte Kernel-Konfiguration (linux.fragment) erkennt Buildroot nicht von selbst – dann Kernel neu bauen
  FRAG_SUM="$(sha256sum "$EXT/board/zero2w/linux.fragment" | cut -d' ' -f1)"
  if [ "$(cat "$OUT/.linux-fragment.sha256" 2>/dev/null)" != "$FRAG_SUM" ]; then
    echo ">> Kernel-Konfiguration geändert – Kernel wird neu gebaut"
    make -C "$BR" O="$OUT" linux-dirclean >/dev/null 2>&1 || true
    echo "$FRAG_SUM" > "$OUT/.linux-fragment.sha256"
  fi
else
  # Kernelpakete können sich geändert haben (lokale Quelle) – immer frisch übernehmen
  make -C "$BR" O="$OUT" armbian-kernel-dirclean >/dev/null 2>&1 || true
fi
# fc-cache des Build-Rechners (gleiche fontconfig-Version) legt in post-build.sh den Schriften-Cache an
make -C "$BR" O="$OUT" host-fontconfig >> "$OUT/build.log" 2>&1 || echo "!! host-fontconfig nicht gebaut – kein Schriften-Cache"
if ! make -C "$BR" O="$OUT" BR2_JLEVEL="$JOBS" > "$OUT/build.log" 2>&1; then
  tail -60 "$OUT/build.log"
  echo "!! Build fehlgeschlagen – vollständiges Protokoll: $OUT/build.log"
  exit 1
fi
echo ">> Fertig nach $(( ($(date +%s) - start) / 60 )) Minuten"

NAME="${PREFIX}-${VERSION}-buildroot-$(date +%Y%m%d)"
[ -f "$EXT/kiosk-files/kiosk.local.json" ] && NAME="${NAME}-privat"
DIST="$KIOSK/dist"
mkdir -p "$DIST"
echo ">> Komprimiere nach $DIST/$NAME.img.xz"
xz -T0 -6 -c "$OUT/images/sdcard.img" > "$WORK/$NAME.img.xz"
(cd "$WORK" && sha256sum "$NAME.img.xz" > "$NAME.img.xz.sha256")
cp "$WORK/$NAME.img.xz" "$WORK/$NAME.img.xz.sha256" "$DIST/"
# Update-Paket für die Verteilung über den Server (ohne private Daten – auch für weitergegebene Geräte)
cp "$OUT/images/kiosk-update.kup" "$DIST/${PREFIX}-${VERSION}.kup"
rm -f "$WORK/$NAME.img.xz" "$WORK/$NAME.img.xz.sha256"
ls -lh "$OUT/images/sdcard.img" "$DIST/$NAME.img.xz" "$DIST/${PREFIX}-${VERSION}.kup"

# Lizenzpflichten: Wer das Image weitergibt, muss u.a. den Quellcode der GPL-Komponenten anbieten. Buildroot sammelt
# Lizenztexte, Quellen und Patches aller Pakete in legal-info/ – als Archiv neben das Image legen.
# Abschalten (z.B. für schnelle Testbauten, die nicht weitergegeben werden): KIOSK_LEGAL_INFO=0
if [ "${KIOSK_LEGAL_INFO:-1}" != 0 ]; then
  echo ">> Sammle Lizenzen und Quellen (make legal-info) – beim ersten Mal dauert das"
  rm -rf "$OUT/legal-info"
  if make -C "$BR" O="$OUT" legal-info >> "$OUT/build.log" 2>&1; then
    LEGAL="${PREFIX}-${VERSION}-legal-info.tar"
    tar -C "$OUT" -cf "$WORK/$LEGAL" legal-info
    mv "$WORK/$LEGAL" "$DIST/$LEGAL"
    ls -lh "$DIST/$LEGAL"
  else
    echo "!! make legal-info fehlgeschlagen – vor einer Weitergabe des Images nachholen (Protokoll: $OUT/build.log)"
  fi
fi
