#!/bin/bash
# Läuft im Chroot des Images (ARM64 via Emulation): Raspberry Pi OS oder Armbian (Orange Pi Zero 2W).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
ARMBIAN=0
[ -f /etc/armbian-release ] && ARMBIAN=1

if [ "$ARMBIAN" = 1 ]; then
  # Mesa aus Debian, nicht die Entwicklerfassung aus dem Armbian-Paketlager (27.0-git): Dieser fehlt
  # EGL_WL_bind_wayland_display, das WPE WebKit (WPEBackend-fdo) braucht – cog stürzt sonst nach dem
  # ersten Bild ab (SEGV in libwayland-server). Debians Mesa 25.0 kann den Mali-G31 (Panfrost) genauso.
  cat > /etc/apt/preferences.d/kiosk-mesa <<'PIN'
Package: libgl1-mesa-dri libegl-mesa0 libgbm1 libglx-mesa0 mesa-libgallium mesa-vulkan-drivers mesa-va-drivers mesa-vdpau-drivers libosmesa6 libxatracker2 libd3dadapter9-mesa
Pin: origin beta.armbian.com
Pin-Priority: -1

Package: libgl1-mesa-dri libegl-mesa0 libgbm1 libglx-mesa0 mesa-libgallium mesa-vulkan-drivers mesa-va-drivers mesa-vdpau-drivers libosmesa6 libxatracker2 libd3dadapter9-mesa
Pin: origin apt.armbian.com
Pin-Priority: -1
PIN
fi
apt-get update
BROWSER=chromium
apt-cache show chromium >/dev/null 2>&1 || BROWSER=chromium-browser
# cog (WPE WebKit) ist der Standard-Browser; Chromium unter cage bleibt als Alternative einstellbar.
# libgles2/libegl: WebKit lädt sie zur Laufzeit – ohne sie startet der Web-Prozess nicht.
if [ "$ARMBIAN" = 1 ]; then
  # Armbian: Overlay kommt aus dem eigenen initramfs-Skript (kiosk-overlay), zram aus armbian-zram-config
  EXTRA_PKGS="initramfs-tools u-boot-tools"
else
  EXTRA_PKGS="overlayroot zram-tools"
fi
# shellcheck disable=SC2086
apt-get install -y --no-install-recommends \
  cog libgles2 libegl1 libegl-mesa0 libgl1-mesa-dri cage "$BROWSER" fonts-dejavu-core iw rfkill network-manager dnsmasq-base python3 ca-certificates $EXTRA_PKGS

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

if [ "$ARMBIAN" = 1 ]; then
  # Netzwerk: NetworkManager statt systemd-networkd/netplan (der Agent richtet WLAN und Hotspot per nmcli ein)
  rm -f /etc/netplan/*.yaml
  for u in systemd-networkd.service systemd-networkd.socket systemd-networkd-wait-online.service; do
    systemctl disable "$u" 2>/dev/null || true
    systemctl mask "$u" 2>/dev/null || true
  done
  # wpa_supplicant nur nicht selbst starten – NetworkManager startet ihn über D-Bus (gesperrt = kein WLAN)
  systemctl disable wpa_supplicant.service 2>/dev/null || true
  # Armbian-Ersteinrichtung: keine Abfrage von Root-Passwort und Benutzer, Größe der Systempartition bleibt fest
  # (dahinter liegt die FAT-Partition), Log-Ordner nicht zusätzlich im RAM spiegeln (ganzes System läuft im RAM)
  rm -f /root/.not_logged_in_yet
  passwd -l root
  for u in armbian-resize-filesystem.service armbian-ramlog.service armbian-led-state.service \
           aw859a-bluetooth.service rsyslog.service cron.service; do
    systemctl disable "$u" 2>/dev/null || true
    systemctl mask "$u" 2>/dev/null || true
  done
  # zram als Auslagerung (armbian-zram-config): zstd, halber Arbeitsspeicher
  if [ -f /etc/default/armbian-zram-config ]; then
    sed -i -E 's/^#? *ENABLED=.*/ENABLED=true/; s/^#? *ZRAM_PERCENTAGE=.*/ZRAM_PERCENTAGE=50/; s/^#? *SWAP_ALGORITHM=.*/SWAP_ALGORITHM=zstd/' /etc/default/armbian-zram-config
  fi
  # initramfs mit dem Overlay-Skript und dem overlay-Modul neu bauen (Armbian erzeugt daraus /boot/uInitrd)
  # bubblewrap (WebKit-Sandbox) darf keine Datei-Capabilities haben – sonst bricht es ohne setuid ab
  if command -v bwrap >/dev/null && command -v getcap >/dev/null; then
    echo ">> bwrap: $(ls -l "$(command -v bwrap)") $(getcap "$(command -v bwrap)")"
    [ -n "$(getcap "$(command -v bwrap)")" ] && setcap -r "$(command -v bwrap)"
  fi
  grep -qx overlay /etc/initramfs-tools/modules || echo overlay >> /etc/initramfs-tools/modules
  update-initramfs -u -k all
  lsinitramfs /boot/initrd.img-* | grep -E 'kiosk-overlay|/overlay\.ko' || { echo "Overlay fehlt im initramfs"; exit 1; }
fi

# Unsichtbarer Mauszeiger für cage/cog (beide laden das Zeigerthema „default“) – z.B. Pi 4/5, Orange Pi
CUR=/usr/share/icons/kiosk-hidden/cursors
if [ -f "$CUR/default" ]; then
  for n in left_ptr arrow top_left_arrow pointer hand1 hand2 text xterm watch wait progress grab grabbing crosshair \
           move all-scroll not-allowed col-resize row-resize ew-resize ns-resize nesw-resize nwse-resize; do
    ln -sf default "$CUR/$n"
  done
  rm -rf /usr/share/icons/default
  ln -sfn kiosk-hidden /usr/share/icons/default
fi

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
# Kernel-Pakete nicht automatisch erneuern (Overlay im RAM, ein neuer Kernel bräuchte ein neues initramfs)
[ "$ARMBIAN" = 1 ] && apt-mark hold linux-image-current-sunxi64 linux-dtb-current-sunxi64 2>/dev/null || true
if [ "$ARMBIAN" = 1 ] && dpkg-query -W -f='${Version}\n' libegl-mesa0 | grep -q armbian; then
  echo "Mesa stammt noch aus dem Armbian-Paketlager"; exit 1
fi
echo ">> Mesa $(dpkg-query -W -f='${Version}' libegl-mesa0)"
echo ">> Chroot-Einrichtung abgeschlossen (cog $(dpkg-query -W -f='${Version}' cog), $BROWSER)"
