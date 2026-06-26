APP_NAME := gitdesktop
VERSION := $(shell cat VERSION | tr -d '[:space:]')
BUILD_DIR := build
BIN_DIR := $(BUILD_DIR)/bin
BINARY := $(BIN_DIR)/$(APP_NAME)
LDFLAGS := -X main.version=$(VERSION)
export PATH := $(HOME)/go/bin:$(HOME)/local/bin:$(PATH)

.PHONY: build build-linux deb appimage clean all

build:
	wails build -ldflags "$(LDFLAGS)"

build-linux:
	CGO_ENABLED=1 GOOS=linux GOARCH=amd64 wails build -platform linux/amd64 -ldflags "$(LDFLAGS)"

deb: build-linux
	@echo "Building .deb package..."
	@sed "s/version: .*/version: \"v$(VERSION)\"/" packaging/nfpm.yaml > /tmp/nfpm.yaml
	nfpm package -p deb -f /tmp/nfpm.yaml -t $(BIN_DIR)/$(APP_NAME)_$(VERSION)_amd64.deb
	@rm -f /tmp/nfpm.yaml
	@echo "Output: $(BIN_DIR)/$(APP_NAME)_$(VERSION)_amd64.deb"

appimage: build-linux
	@echo "Building AppImage..."
	@rm -rf AppDir
	@mkdir -p AppDir/usr/bin
	@mkdir -p AppDir/usr/share/applications
	@mkdir -p AppDir/usr/share/icons/hicolor/512x512/apps
	cp $(BINARY) AppDir/usr/bin/$(APP_NAME)
	cp packaging/gitdesktop.desktop AppDir/usr/share/applications/$(APP_NAME).desktop
	cp packaging/icons/gitdesktop.png AppDir/usr/share/icons/hicolor/512x512/apps/$(APP_NAME).png
	cp packaging/gitdesktop.desktop AppDir/$(APP_NAME).desktop
	cp packaging/icons/gitdesktop.png AppDir/$(APP_NAME).png
	@printf '#!/bin/sh\nHERE=$$(dirname "$$0")\nif ! ldconfig -p 2>/dev/null | grep -q libwebkit2gtk-4.1; then\n    zenity --error --text="libwebkit2gtk-4.1-0 is required.\n\nInstall: sudo apt install libwebkit2gtk-4.1-0" 2>/dev/null || echo "ERROR: libwebkit2gtk-4.1-0 is required. Install: sudo apt install libwebkit2gtk-4.1-0"\n    exit 1\nfi\nexport PATH="$$HERE/usr/bin:$$PATH"\nexec "$$HERE/usr/bin/$(APP_NAME)" "$$@"\n' > AppDir/AppRun
	chmod +x AppDir/AppRun
	PATH="$(HOME)/go/bin:$(HOME)/.local/bin:$(PATH)" appimagetool AppDir $(BIN_DIR)/$(APP_NAME)-$(VERSION)-x86_64.AppImage
	@rm -rf AppDir
	@echo "Output: $(BIN_DIR)/$(APP_NAME)-$(VERSION)-x86_64.AppImage"

all: deb appimage

clean:
	rm -rf AppDir $(BIN_DIR)/*.deb $(BIN_DIR)/*.AppImage
