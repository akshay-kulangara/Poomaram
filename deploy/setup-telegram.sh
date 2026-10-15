#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/opt/roommates/app
cd "$APP_DIR/telegram-notifier"

docker-compose build
docker-compose up -d
docker-compose ps
