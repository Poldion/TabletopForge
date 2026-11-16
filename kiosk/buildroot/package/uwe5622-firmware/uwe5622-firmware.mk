################################################################################
#
# uwe5622-firmware – WLAN-Firmware für den Orange Pi Zero 2W (aus github.com/armbian/firmware)
#
################################################################################

UWE5622_FIRMWARE_VERSION = bf5f7a802b8e1998e6bf95daed5ea965441af83d
UWE5622_FIRMWARE_SITE = https://github.com/armbian/firmware/raw/$(UWE5622_FIRMWARE_VERSION)/uwe5622
UWE5622_FIRMWARE_SOURCE = wcnmodem.bin
UWE5622_FIRMWARE_EXTRA_DOWNLOADS = wifi_2355b001_1ant.ini
UWE5622_FIRMWARE_LICENSE = PROPRIETARY
UWE5622_FIRMWARE_REDISTRIBUTE = YES

define UWE5622_FIRMWARE_EXTRACT_CMDS
	cp $(UWE5622_FIRMWARE_DL_DIR)/wcnmodem.bin $(UWE5622_FIRMWARE_DL_DIR)/wifi_2355b001_1ant.ini $(@D)/
endef

define UWE5622_FIRMWARE_INSTALL_TARGET_CMDS
	$(INSTALL) -D -m 0644 $(@D)/wcnmodem.bin $(TARGET_DIR)/lib/firmware/uwe5622/wcnmodem.bin
	$(INSTALL) -D -m 0644 $(@D)/wifi_2355b001_1ant.ini $(TARGET_DIR)/lib/firmware/uwe5622/wifi_2355b001_1ant.ini
	ln -sf uwe5622/wifi_2355b001_1ant.ini $(TARGET_DIR)/lib/firmware/wifi_2355b001_1ant.ini
endef

$(eval $(generic-package))
