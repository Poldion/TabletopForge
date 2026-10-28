#!/bin/bash
# Läuft im Chroot des Pi-Images (ARM64 via Emulation).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
BROWSER=chromium
apt-cache show chromium >/dev/null 2>&1 || BROWSER=chromium-browser
# cog (WPE WebKit) ist der Standard-Browser; Chromium unter cage bleibt als Alternative einstellbar.
# libgles2/libegl: WebKit lädt sie zur Laufzeit – ohne sie startet der Web-Prozess nicht.
apt-get install -y --no-install-recommends \
  cog libgles2 libegl1 libegl-mesa0 libgl1-mesa-dri cage "$BROWSER" fonts-dejavu-core overlayroot zram-tools iw rfkill network-manager dnsmasq-base python3 ca-certificates

# Kiosk-Benutzer: vorhandenen Erstbenutzer (UID 1000) umbenennen oder neu anlegen
FIRST=$(getent passwd 1000 | cut -d: -f1 || true)
if [ -n "$FIRST" ] && [ "$FIRST" != "kiosk" ]; then
  usermod -l kiosk -d /home/kiosk -m "$FIRST"
  getent group "$FIRST" >/dev/null && groupmod -n kiosk "$FIRST"
elif [ -z "$FIRST" ]; then
  useradd -m -u 1000 -s /bin/bash kiosk
fi
for g in video render input audio netdev sudo; do getent group "$g" >/dev/null && usermod -aG "$g" kiosk; done
usermod -s /bin/bash kiosk
passwd -l kiosk
echo 'kiosk ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/010_kiosk-nopasswd
chmod 440 /etc/sudoers.d/010_kiosk-nopasswd

# Einrichtungsassistent für den ersten Benutzer abschalten (Benutzer existiert bereits)
systemctl disable userconfig.service 2>/dev/null || true
systemctl mask userconfig.service 2>/dev/null || true

# cloud-init abschalten: WLAN, Hostname und Benutzer verwaltet der Kiosk-Agent selbst
mkdir -p /etc/cloud
touch /etc/cloud/cloud-init.disabled

# Keine SSH-Hostschlüssel im Image – sie werden bei der Ersteinrichtung pro Gerät erzeugt
rm -f /etc/ssh/ssh_host_*

# Dienste
systemctl enable NetworkManager.service
systemctl enable kiosk-setup.service kiosk-agent.service kiosk-browser.service kiosk-startpage.service kiosk-firstboot.service kiosk-diag.timer
systemctl disable ssh.service 2>/dev/null || true
systemctl disable getty@tty1.service 2>/dev/null || true
systemctl set-default graphical.target

# zram statt Swap-Datei (Swap-Datei würde ins RAM-Overlay schreiben)
printf 'ALGO=zstd\nPERCENT=50\nPRIORITY=100\n' > /etc/default/zramswap
# Swap-Mechanik von Raspberry Pi OS abschalten – sie scheitert auf dem schreibgeschützten System
# und konkurriert mit zramswap. (systemd-remount-fs NICHT abschalten: beim ersten Start macht es
# das Root-Dateisystem beschreibbar, sonst scheitert die Ersteinrichtung.)
for u in rpi-resize-swap-file.service rpi-setup-loop@var-swap.service systemd-zram-setup@zram0.service \
         dev-zram0.swap dphys-swapfile.service; do
  systemctl mask "$u" 2>/dev/null || true
done

# Ballast abschalten: spart RAM und SD-Zugriffe auf dem Pi Zero 2 W
for u in bluetooth.service hciuart.service ModemManager.service avahi-daemon.service avahi-daemon.socket \
         triggerhappy.service triggerhappy.socket apt-daily.timer apt-daily-upgrade.timer man-db.timer \
         e2scrub_all.timer e2scrub_reap.service fstrim.timer dpkg-db-backup.timer logrotate.timer \
         rpi-eeprom-update.service glamor-test.service rp1-test.service NetworkManager-wait-online.service; do
  systemctl disable "$u" 2>/dev/null || true
  systemctl mask "$u" 2>/dev/null || true
done
# logind legt dieses Verzeichnis sonst beim Start an – vorab anlegen, falls / noch schreibgeschützt ist
mkdir -p /var/lib/systemd/linger
# Journal nur im RAM und klein halten
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nStorage=volatile\nRuntimeMaxUse=16M\n' > /etc/systemd/journald.conf.d/kiosk.conf

apt-get clean
rm -rf /var/lib/apt/lists/* /var/cache/apt/*.bin
echo ">> Chroot-Einrichtung abgeschlossen (cog $(dpkg-query -W -f='${Version}' cog), $BROWSER)"
