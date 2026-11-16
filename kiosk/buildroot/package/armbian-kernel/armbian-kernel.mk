################################################################################
#
# armbian-kernel – Kernel aus selbst gebauten Armbian-Paketen (linux-image-*, linux-dtb-*)
#
################################################################################

ARMBIAN_KERNEL_VERSION = local
ARMBIAN_KERNEL_SITE = $(BR2_EXTERNAL_DND_KIOSK_PATH)/armbian-debs
ARMBIAN_KERNEL_SITE_METHOD = local
ARMBIAN_KERNEL_LICENSE = GPL-2.0
ARMBIAN_KERNEL_INSTALL_IMAGES = YES
ARMBIAN_KERNEL_DTB = sun50i-h618-orangepi-zero2w.dtb

# .deb ohne dpkg entpacken: ar-Archiv mit data.tar.*
define ARMBIAN_KERNEL_BUILD_CMDS
	rm -rf $(@D)/root $(@D)/x
	mkdir -p $(@D)/root
	for deb in $(@D)/linux-image-*.deb $(@D)/linux-dtb-*.deb; do \
		test -f "$$deb" || { echo "armbian-kernel: Paket fehlt in armbian-debs/"; exit 1; }; \
		mkdir -p $(@D)/x && (cd $(@D)/x && $(TARGET_AR) x "$$deb" && tar -C $(@D)/root -xf data.tar.*) || exit 1; \
		rm -rf $(@D)/x; \
	done
endef

# Module liegen je nach Armbian-Stand unter /lib/modules oder /usr/lib/modules
define ARMBIAN_KERNEL_INSTALL_TARGET_CMDS
	mkdir -p $(TARGET_DIR)/lib/modules
	for d in $(@D)/root/lib/modules $(@D)/root/usr/lib/modules; do \
		test -d $$d && cp -a $$d/. $(TARGET_DIR)/lib/modules/; \
	done; true
	rm -f $(TARGET_DIR)/lib/modules/*/build $(TARGET_DIR)/lib/modules/*/source
endef

define ARMBIAN_KERNEL_INSTALL_IMAGES_CMDS
	cp $$(ls $(@D)/root/boot/vmlinuz-* | head -1) $(BINARIES_DIR)/Image
	cp $$(find $(@D)/root -name $(ARMBIAN_KERNEL_DTB) | head -1) $(BINARIES_DIR)/$(ARMBIAN_KERNEL_DTB)
endef

$(eval $(generic-package))
