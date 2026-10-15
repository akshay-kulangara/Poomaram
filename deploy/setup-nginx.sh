#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/opt/roommates/app
sudo cp "$APP_DIR/nginx/roommates.conf" /etc/nginx/conf.d/roommates.conf
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
