#!/bin/sh
# Orange Pi Zero 2W: gemeinsame Kiosk-Anpassungen (wie beim Pi) plus das Gerätespezifische.
set -eu
T="$TARGET_DIR"
"$BR2_EXTERNAL_DND_KIOSK_PATH/board/zero2w/post-build.sh" "$@"

# seatd vergibt Bildschirm und Eingabegeräte an cage
mkdir -p "$T/etc/systemd/system/multi-user.target.wants"
ln -sf /etc/systemd/system/seatd.service "$T/etc/systemd/system/multi-user.target.wants/seatd.service"

# clang/OpenCL braucht Mesa nur beim Bauen (Panfrost-Shader vorübersetzen) – zur Laufzeit lädt es nur LLVM.
# Entfernen spart rund 100 MB im System; danach prüfen, dass kein Programm sie noch verlangt.
rm -rf "$T"/usr/lib/libclang* "$T"/usr/lib/libLLVMSPIRVLib* "$T"/usr/lib/libMesaOpenCL* "$T"/usr/lib/libRusticlOpenCL* \
       "$T"/usr/lib/libOpenCL* "$T"/etc/OpenCL "$T"/usr/lib/clang "$T"/usr/share/clc "$T"/usr/bin/clang* "$T"/usr/bin/llvm-*
READELF="${TARGET_CROSS:-aarch64-buildroot-linux-gnu-}readelf"
MISSING=""
for f in $(find "$T/usr" "$T/lib" -type f \( -name '*.so*' -o -perm -u+x \) 2>/dev/null); do
  if "$READELF" -d "$f" 2>/dev/null | grep -qE 'NEEDED.*\[lib(clang|LLVMSPIRVLib|MesaOpenCL|RusticlOpenCL|OpenCL)'; then
    MISSING="$MISSING ${f#"$T"}"
  fi
done
[ -z "$MISSING" ] || { echo "!! Entfernte Bibliotheken werden noch gebraucht von:$MISSING"; exit 1; }

# Kernel-Module des Armbian-Kernels ausdünnen: nur, was dieses Gerät braucht (spart Platz im System und RAM
# beim Laden). Abhängigkeiten werden über modules.dep mitgenommen.
for MODDIR in "$T"/lib/modules/*; do
  [ -d "$MODDIR" ] || continue
  KVER="$(basename "$MODDIR")"
  KEEP="overlay zram panfrost gpu_sched drm_shmem_helper display_connector dw_hdmi_cec dw_hdmi_i2s_audio
        snd_soc_hdmi_codec sprdwl_ng uwe5622_bsp_sdio cfg80211 rfkill sun50i_h6_prcm_ppu sun8i_ce sunxi
        sunxi_addr phy_generic musb_hdrc"
  LIST="$(mktemp)"
  for m in $KEEP; do
    # Modulpfad und alle Abhängigkeiten aus modules.dep
    awk -v m="$m" -F: '{ n=$1; sub(/.*\//, "", n); sub(/\.ko.*/, "", n); gsub(/-/, "_", n);
                        if (n == m) { print $1; c=split($2, d, " "); for (i=1; i<=c; i++) print d[i] } }' \
      "$MODDIR/modules.dep" >> "$LIST"
  done
  sort -u "$LIST" -o "$LIST"
  echo ">> Behalte $(wc -l < "$LIST") von $(find "$MODDIR/kernel" -name '*.ko*' | wc -l) Kernel-Modulen"
  find "$MODDIR/kernel" -name '*.ko*' | while read -r f; do
    grep -qxF "${f#"$MODDIR/"}" "$LIST" || rm -f "$f"
  done
  find "$MODDIR/kernel" -type d -empty -delete
  rm -f "$LIST"
  "$HOST_DIR/sbin/depmod" -b "$T" "$KVER" 2>/dev/null || depmod -b "$T" "$KVER"
done
exit 0
