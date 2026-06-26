#!/bin/bash
set -e
gtk-update-icon-cache /usr/share/icons/hicolor || true
update-desktop-database /usr/share/applications || true
