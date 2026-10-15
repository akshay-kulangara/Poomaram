#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/opt/roommates/app
cd "$APP_DIR/backend"

npm install --omit=dev

set -a
source .env
set +a

pm2 delete roommates-backend >/dev/null 2>&1 || true
pm2 start server.js --name roommates-backend --cwd "$APP_DIR/backend"
pm install -g pm2 >/dev/null 2>&1 || true
pm2 save
sudo env PATH="$PATH:/usr/local/bin" pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1 | sudo bash || true
pm2 save
