#!/bin/sh
# Nach dem Zusammenstellen des Root-Dateisystems (vor dem Packen): Kiosk-spezifische Anpassungen.
set -eu
T="$TARGET_DIR"
UNITS=/usr/lib/systemd/system

# Einhängepunkte für Overlay, Original-Root und Boot-Partition
mkdir -p "$T/media/overlay" "$T/media/root-ro" "$T/boot/firmware"

# fstab: Boot-Partition schreibgeschützt; für / keine Zeile – das Overlay ist bereits beschreibbar
cat > "$T/etc/fstab" <<'EOF'
/dev/mmcblk0p1  /boot/firmware  vfat  ro,noatime,fmask=0022,dmask=0022  0  0
EOF

# Ausführbare Dateien (Rechte gehen beim Kopieren aus Windows-Ordnern teils verloren)
chmod 755 "$T/usr/bin/overlay-init" "$T/usr/local/bin/kiosk-browser" "$T"/usr/local/sbin/kiosk-* "$T/opt/kiosk/agent.py" "$T/opt/kiosk/startpage_server.py" "$T/opt/kiosk/splash.py"

# Raspberry-Pi-OS-spezifische Ersteinrichtung entfällt: Schreibschutz ist hier von Anfang an aktiv
rm -f "$T/etc/systemd/system/kiosk-firstboot.service" "$T/usr/local/sbin/kiosk-firstboot" "$T/etc/pam.d/kiosk"
touch "$T/etc/kiosk-firstboot-done"

# Dienste aktivieren
enable() { # enable <unit> <target>
  mkdir -p "$T/etc/systemd/system/$2.wants"
  ln -sf "/etc/systemd/system/$1" "$T/etc/systemd/system/$2.wants/$1"
}
enable kiosk-prepare.service multi-user.target
enable kiosk-setup.service multi-user.target
enable kiosk-agent.service multi-user.target
enable kiosk-browser.service multi-user.target
enable kiosk-startpage.service multi-user.target
enable kiosk-zram.service swap.target
enable kiosk-diag.timer timers.target
enable kiosk-splash.service sysinit.target
enable kiosk-trial-guard.service multi-user.target


# dnsmasq startet der NetworkManager selbst (nur im Hotspot-Modus) – kein eigener Dienst
ln -sf /dev/null "$T/etc/systemd/system/dnsmasq.service"
# Keine Anmelde-Konsole auf dem Bildschirm
ln -sf /dev/null "$T/etc/systemd/system/getty@tty1.service"

# Schriften-Cache schon beim Bauen anlegen – sonst durchsucht der Browser bei jedem Start alle Schriften
# (der Cache-Ordner ist auf dem schreibgeschützten System sonst immer leer)
if [ -x "$HOST_DIR/bin/fc-cache" ]; then
  "$HOST_DIR/bin/fc-cache" -s -f -y "$T"
  # fc-cache schreibt in den Cache-Ordner des Build-Rechners (unterhalb des Images) – an den Platz verschieben,
  # an dem fontconfig auf dem Gerät sucht
  STRAY="$T$HOST_DIR/var/cache/fontconfig"
  if [ -d "$STRAY" ]; then
    mkdir -p "$T/var/cache/fontconfig"
    mv "$STRAY"/* "$T/var/cache/fontconfig/"
    rmdir -p --ignore-fail-on-non-empty "$STRAY"
    echo ">> Schriften-Cache angelegt: $(ls "$T/var/cache/fontconfig" | wc -l) Dateien"
  fi
fi

# Kiosk-Benutzer: Heimatverzeichnis
mkdir -p "$T/home/kiosk"

# Versionsnummer für Diagnose und Server-Anzeige
[ -n "${KIOSK_VERSION:-}" ] && echo "$KIOSK_VERSION" > "$T/opt/kiosk/VERSION"
exit 0
