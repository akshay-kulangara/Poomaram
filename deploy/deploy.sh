#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/roommates/app

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo ./deploy/deploy.sh"
  exit 1
fi

REAL_USER="${SUDO_USER:-ec2-user}"
REAL_HOME="$(getent passwd "$REAL_USER" | cut -d: -f6)"

echo "==> Installing base software"
apt=false
if command -v dnf >/dev/null 2>&1; then
  dnf update -y
  dnf install -y docker nginx git curl nodejs npm
else
  echo "This deployment script is intended for Amazon Linux 2023 (dnf)."
  exit 1
fi
systemctl enable --now docker nginx
usermod -aG docker "$REAL_USER" || true
npm install -g pm2

mkdir -p "$APP_DIR"
cp -a "$REPO_DIR/frontend" "$APP_DIR/"
cp -a "$REPO_DIR/backend" "$APP_DIR/"
cp -a "$REPO_DIR/telegram-notifier" "$APP_DIR/"
cp -a "$REPO_DIR/database" "$APP_DIR/"
cp -a "$REPO_DIR/nginx" "$APP_DIR/"
chown -R "$REAL_USER:$REAL_USER" "$APP_DIR"

# Buildx
mkdir -p /usr/local/lib/docker/cli-plugins
if ! docker buildx version >/dev/null 2>&1; then
  curl -fsSL https://github.com/docker/buildx/releases/download/v0.17.1/buildx-v0.17.1.linux-amd64 -o /usr/local/lib/docker/cli-plugins/docker-buildx
  chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx
fi
# Standalone Compose
if ! command -v docker-compose >/dev/null 2>&1; then
  curl -fsSL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi

# Secrets
read -r -s -p "MySQL root password: " DB_PASSWORD; echo
read -r -s -p "Session secret: " SESSION_SECRET; echo
read -r -s -p "Telegram bot token: " TELEGRAM_BOT_TOKEN; echo
read -r -p "Telegram chat ID: " TELEGRAM_CHAT_ID; echo

cat > "$APP_DIR/backend/.env" <<ENV
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=$DB_PASSWORD
DB_NAME=taskdb
PORT=3000
SESSION_SECRET=$SESSION_SECRET
TELEGRAM_NOTIFIER_URL=http://127.0.0.1:3001
ENABLE_TELEGRAM=true
ENV
cat > "$APP_DIR/telegram-notifier/.env" <<ENV
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID
PORT=3001
HOST=0.0.0.0
ENV
chown "$REAL_USER:$REAL_USER" "$APP_DIR/backend/.env" "$APP_DIR/telegram-notifier/.env"
chmod 600 "$APP_DIR/backend/.env" "$APP_DIR/telegram-notifier/.env"

# MySQL
if ! docker ps -a --format '{{.Names}}' | grep -qx roommates-mysql; then
  docker run -d --name roommates-mysql --restart unless-stopped \
    -e MYSQL_ROOT_PASSWORD="$DB_PASSWORD" \
    -v roommates_mysql:/var/lib/mysql \
    -p 127.0.0.1:3306:3306 mysql:8
fi
for i in {1..60}; do
  if docker exec roommates-mysql mysqladmin ping -u root -p"$DB_PASSWORD" --silent >/dev/null 2>&1; then break; fi
  sleep 2
done
docker exec roommates-mysql mysql -u root -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS taskdb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
docker exec -i roommates-mysql mysql -u root -p"$DB_PASSWORD" taskdb < "$APP_DIR/database/schema.sql"

# Backend
cd "$APP_DIR/backend"
su - "$REAL_USER" -c "cd '$APP_DIR/backend' && npm install --omit=dev"
su - "$REAL_USER" -c "set -a; source '$APP_DIR/backend/.env'; set +a; pm2 delete roommates-backend >/dev/null 2>&1 || true; pm2 start server.js --name roommates-backend --cwd '$APP_DIR/backend'; pm2 save"
su - "$REAL_USER" -c "pm2 startup systemd -u '$REAL_USER' --hp '$REAL_HOME'" | tail -n 1 | bash || true
su - "$REAL_USER" -c "pm2 save"

# Telegram notifier
cd "$APP_DIR/telegram-notifier"
su - "$REAL_USER" -c "cd '$APP_DIR/telegram-notifier' && docker-compose build && docker-compose up -d"

# Nginx
cp "$APP_DIR/nginx/roommates.conf" /etc/nginx/conf.d/roommates.conf
nginx -t
systemctl enable --now nginx
systemctl reload nginx

cat <<MSG

============================================
Roommates deployment completed.
============================================
Frontend:  http://SERVER_IP/
Backend:   127.0.0.1:3000
Telegram:  127.0.0.1:3001
MySQL:     127.0.0.1:3306

Check:
  docker ps
  pm2 status
  systemctl status nginx --no-pager
  curl http://127.0.0.1:3001/health
  curl -I http://127.0.0.1
============================================
MSG
