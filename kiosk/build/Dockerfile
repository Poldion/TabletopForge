# Build-Umgebung für das Kiosk-Image (läuft privilegiert, braucht Loop-Geräte und ARM-Emulation)
FROM debian:trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils parted fdisk e2fsprogs dosfstools util-linux qemu-user-static jq \
 && rm -rf /var/lib/apt/lists/*
COPY customize.sh inside-chroot.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/customize.sh /usr/local/bin/inside-chroot.sh
ENTRYPOINT ["/usr/local/bin/customize.sh"]
