# Startskript des Spieltisch-Kiosks (Orange Pi Zero 2W) – wird zu boot.scr übersetzt (post-image.sh).
#
# Zwei Systemplätze a/ und b/ auf der Boot-Partition (Kernel, Gerätebaum, cmdline.txt), Root-Dateisystem auf
# Partition 2 (a) bzw. 3 (b). Welcher Platz startet, steht in kiosk-boot.txt:
#   slot=a            → Platz a starten
#   trial=b           → einmalig Platz b zur Probe; der Eintrag wird hier sofort gelöscht. Bestätigt der
#                       Kiosk-Agent das neue System nicht, landet der nächste Neustart wieder in „slot“.
# Gegenstück auf dem Gerät: /opt/kiosk/ota.py (UBOOT_STATE, UBOOT_TRIAL_ARG).

setenv slot a
setenv trial
setenv bootslot
setenv kiosktrial
# Puffer: Hinter ${scriptaddr} läuft gerade dieses Skript – Dateien daher nach ${ramdisk_addr_r} laden
if load mmc 0:1 ${ramdisk_addr_r} kiosk-boot.txt; then
	env import -t ${ramdisk_addr_r} ${filesize} slot trial
fi

if test -n "${trial}"; then
	echo "Kiosk: Probestart von Platz ${trial}"
	setenv bootslot ${trial}
	setenv kiosktrial kiosk.trial=1
	# Probestart nur einmal: kiosk-boot.txt wieder nur mit dem festen Platz schreiben
	setenv trial
	env export -t ${ramdisk_addr_r} slot
	fatwrite mmc 0:1 ${ramdisk_addr_r} kiosk-boot.txt ${filesize}
else
	setenv bootslot ${slot}
fi
echo "Kiosk: starte Platz ${bootslot}"

# Kernel-Kommandozeile des Platzes (Datei im Format „bootargs=…“, der Agent ergänzt dort z.B. den HDMI-Modus)
setenv bootargs
if load mmc 0:1 ${ramdisk_addr_r} ${bootslot}/cmdline.txt; then
	env import -t ${ramdisk_addr_r} ${filesize} bootargs
fi
setenv bootargs "${bootargs} ${kiosktrial}"

if load mmc 0:1 ${kernel_addr_r} ${bootslot}/Image && load mmc 0:1 ${fdt_addr_r} ${bootslot}/sun50i-h618-orangepi-zero2w.dtb; then
	booti ${kernel_addr_r} - ${fdt_addr_r}
fi

# Platz unvollständig (sollte nicht vorkommen): den anderen versuchen
if test "${bootslot}" = "a"; then setenv bootslot b; else setenv bootslot a; fi
echo "Kiosk: Start fehlgeschlagen – versuche Platz ${bootslot}"
setenv bootargs
if load mmc 0:1 ${ramdisk_addr_r} ${bootslot}/cmdline.txt; then
	env import -t ${ramdisk_addr_r} ${filesize} bootargs
fi
load mmc 0:1 ${kernel_addr_r} ${bootslot}/Image && load mmc 0:1 ${fdt_addr_r} ${bootslot}/sun50i-h618-orangepi-zero2w.dtb && booti ${kernel_addr_r} - ${fdt_addr_r}
