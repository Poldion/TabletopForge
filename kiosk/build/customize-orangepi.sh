#!/bin/bash
# Erstellt das Kiosk-Image für den Orange Pi Zero 2W aus dem offiziellen Armbian (Debian Trixie, minimal).
# Erwartet: /kiosk (Projektordner kiosk/, nur lesend), /work (Arbeitsbereich), /out (Ausgabe)
#
# Aufbau der Karte (Armbian hat nur eine ext4-Partition, die Windows nicht lesen kann):
#   Partition 1  ext4  System (feste Größe, läuft schreibgeschützt mit RAM-Overlay)
#   Partition 2  FAT   „KIOSK“ → /boot/firmware: kiosk.json, cmdline.txt (HDMI-Modus), Diagnose –
#                      wie die Boot-Partition beim Raspberry Pi, am PC bearbeitbar
set -euo pipefail

BASE_URL=${BASE_IMAGE_URL:-https://dl.armbian.com/orangepizero2w/Trixie_current_minimal}
EXTRA_MB=${EXTRA_MB:-2560}
FAT_MB=${FAT_MB:-128}
VERSION=${KIOSK_VERSION:-dev}
WORK=/work
ROOT=$WORK/mnt-opi
IMG=$WORK/kiosk-opi.img
BASE=$WORK/armbian-opizero2w.img
LOOPS=()

cleanup() {
  set +e
  for d in boot/firmware dev/pts dev sys proc; do mountpoint -q "$ROOT/$d" && umount -l "$ROOT/$d"; done
  mountpoint -q "$ROOT" && umount -l "$ROOT"
  for l in "${LOOPS[@]}"; do losetup -d "$l"; done
}
trap cleanup EXIT

mkdir -p "$WORK" /out "$ROOT"
cd "$WORK"

# 1. Basis-Image laden (wird im Arbeitsbereich zwischengespeichert)
if [ ! -f "$BASE" ]; then
  echo ">> Lade Armbian: $BASE_URL"
  curl -fsIL "$BASE_URL" | grep -i '^location:' | head -1 | tr -d '\r' > armbian-opizero2w.source || true
  curl -fL --retry 3 -o armbian.img.xz "$BASE_URL"
  xz -d -T0 armbian.img.xz
  mv armbian.img "$BASE"
fi
echo ">> Basis: $(cat armbian-opizero2w.source 2>/dev/null || echo "$BASE_URL")"

# 2. Kopie vergrößern: Systempartition fest erweitern, dahinter die FAT-Partition
cp --sparse=always "$BASE" "$IMG"
truncate -s +"$((EXTRA_MB + FAT_MB))M" "$IMG"
SECTORS=$(( $(stat -c %s "$IMG") / 512 ))
FAT_SECTORS=$((FAT_MB * 2048))
P1_END=$((SECTORS - FAT_SECTORS - 1))
parted -s "$IMG" unit s resizepart 1 "$P1_END" mkpart primary fat32 "$((P1_END + 1))" "$((SECTORS - 1))"
parted -s "$IMG" unit s print

part() { partx -g -o START,SECTORS -n "$1" "$IMG" | awk '{print $1, $2}'; }
read -r P1_START P1_SIZE < <(part 1)
read -r P2_START P2_SIZE < <(part 2)
LOOP_ROOT=$(losetup -f --show -o $((P1_START * 512)) --sizelimit $((P1_SIZE * 512)) "$IMG"); LOOPS+=("$LOOP_ROOT")
LOOP_FAT=$(losetup -f --show -o $((P2_START * 512)) --sizelimit $((P2_SIZE * 512)) "$IMG"); LOOPS+=("$LOOP_FAT")
e2fsck -fy "$LOOP_ROOT" || true
resize2fs "$LOOP_ROOT"
mkfs.vfat -F 32 -n KIOSK "$LOOP_FAT" >/dev/null

# 3. Einhängen und Chroot vorbereiten
mount "$LOOP_ROOT" "$ROOT"
mkdir -p "$ROOT/boot/firmware"
mount "$LOOP_FAT" "$ROOT/boot/firmware"
for d in proc sys dev dev/pts; do mount --bind "/$d" "$ROOT/$d"; done
RESOLV_LINK=$(readlink "$ROOT/etc/resolv.conf" || true)
rm -f "$ROOT/etc/resolv.conf"; cp /etc/resolv.conf "$ROOT/etc/resolv.conf"
printf '#!/bin/sh\nexit 101\n' > "$ROOT/usr/sbin/policy-rc.d"; chmod +x "$ROOT/usr/sbin/policy-rc.d"

# 4. Kiosk-Dateien einspielen
cp -r /kiosk/files/rootfs/. "$ROOT/"
(cd /kiosk/files/rootfs && find . -type f) | while read -r f; do chmod 644 "$ROOT/$f"; done
(cd /kiosk/files/rootfs && find . -type d) | while read -r d; do [ "$d" = "." ] || chmod 755 "$ROOT/$d"; done
chmod 755 "$ROOT/opt/kiosk/agent.py" "$ROOT/usr/local/bin/kiosk-browser" "$ROOT"/usr/local/sbin/kiosk-*
find "$ROOT/opt/kiosk" -name __pycache__ -prune -exec rm -rf {} +
install -D -m 755 /kiosk/build/armbian/kiosk-overlay "$ROOT/etc/initramfs-tools/scripts/local-bottom/kiosk-overlay"
if [ -f /kiosk/kiosk.local.json ]; then
  echo ">> Übernehme private Voreinstellungen aus kiosk.local.json"
  jq -s '.[0] * .[1]' /kiosk/files/boot/kiosk.json /kiosk/kiosk.local.json > "$ROOT/boot/firmware/kiosk.json"
  PRIVATE=1
else
  cp /kiosk/files/boot/kiosk.json "$ROOT/boot/firmware/kiosk.json"
  PRIVATE=0
fi
jq '{serverUrl, hostname, country, wifi: [.wifi[]? | {ssid}]}' "$ROOT/boot/firmware/kiosk.json"
cp "$ROOT/boot/firmware/kiosk.json" "$ROOT/boot/firmware/kiosk.json.bak"
# Zusätzliche Kernel-Optionen; der Agent trägt hier den HDMI-Modus ein (video=HDMI-A-1:…), U-Boot liest sie
: > "$ROOT/boot/firmware/cmdline.txt"
echo "$VERSION" > "$ROOT/opt/kiosk/VERSION"
echo "LABEL=KIOSK /boot/firmware vfat defaults,nofail,noatime,umask=022 0 2" >> "$ROOT/etc/fstab"

# 5. Pakete und Systemeinstellungen im Chroot (ARM-Emulation)
cp /usr/local/bin/inside-chroot.sh "$ROOT/tmp/inside-chroot.sh"
chroot "$ROOT" /bin/bash /tmp/inside-chroot.sh
rm -f "$ROOT/tmp/inside-chroot.sh" "$ROOT/usr/sbin/policy-rc.d"

# 6. Boot: ruhiger Start auf dem Bildschirm (Kernel-Meldungen nur seriell), HDMI-Modus aus cmdline.txt
ENV="$ROOT/boot/armbianEnv.txt"
setenv_line() { grep -q "^$1=" "$ENV" && sed -i "s|^$1=.*|$1=$2|" "$ENV" || echo "$1=$2" >> "$ENV"; }
setenv_line console serial
setenv_line verbosity 1
setenv_line bootlogo false
setenv_line extraargs "quiet loglevel=3 logo.nologo vt.global_cursor_default=0"
cat "$ENV"
CMD="$ROOT/boot/boot.cmd"
if ! grep -q 'Tabletop Forge' "$CMD"; then
  # Direkt nach dem Einlesen von armbianEnv.txt: video=… aus cmdline.txt auf Partition 2
  awk '
    { print }
    /env import -t \$\{load_addr\} \$\{filesize\}/ && !done { getline; print
      print ""
      print "# Tabletop Forge: HDMI-Modus aus cmdline.txt der Kiosk-Partition (Partition 2)"
      print "setenv video \"\""
      print "if test -e ${devtype} ${devnum}:2 cmdline.txt; then"
      print "\tload ${devtype} ${devnum}:2 ${load_addr} cmdline.txt"
      print "\tif test \"${filesize}\" != \"0\"; then env import -t ${load_addr} ${filesize} video; fi"
      print "fi"
      print "if test -n \"${video}\"; then setenv extraargs \"${extraargs} video=${video}\"; fi"
      done = 1 }
  ' "$CMD" > "$CMD.new"
  mv "$CMD.new" "$CMD"
fi
grep -n -A8 'Tabletop Forge' "$CMD"
mkimage -C none -A arm -T script -d "$CMD" "$ROOT/boot/boot.scr" >/dev/null

rm -f "$ROOT/etc/resolv.conf"
if [ -n "$RESOLV_LINK" ]; then ln -s "$RESOLV_LINK" "$ROOT/etc/resolv.conf"; fi
df -h "$ROOT" "$ROOT/boot/firmware"
sync
cleanup
trap - EXIT

# 7. Komprimieren
NAME="tabletop-forge-kiosk-orangepi-zero2w-${VERSION}-$(date +%Y%m%d)"
[ "$PRIVATE" = 1 ] && NAME="${NAME}-privat"
echo ">> Komprimiere nach /out/$NAME.img.xz"
xz -T0 -6 -c "$IMG" > "/out/$NAME.img.xz"
sha256sum "/out/$NAME.img.xz" | sed 's#/out/##' > "/out/$NAME.img.xz.sha256"
rm -f "$IMG"
ls -lh /out
