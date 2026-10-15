#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/roommates/app
ENV_FILE="$APP_DIR/backend/.env"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD must be set}"

if docker ps -a --format '{{.Names}}' | grep -qx roommates-mysql; then
  echo "==> MySQL container already exists; leaving it unchanged"
else
  echo "==> Creating MySQL container"
  docker run -d \
    --name roommates-mysql \
    --restart unless-stopped \
    -e MYSQL_ROOT_PASSWORD="$DB_PASSWORD" \
    -v roommates_mysql:/var/lib/mysql \
    -p 127.0.0.1:3306:3306 \
    mysql:8
fi

echo "==> Waiting for MySQL"
for i in {1..60}; do
  if docker exec roommates-mysql mysqladmin ping -u root -p"$DB_PASSWORD" --silent >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker exec roommates-mysql mysqladmin ping -u root -p"$DB_PASSWORD" --silent

echo "==> Creating taskdb if needed"
docker exec roommates-mysql mysql -u root -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS taskdb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "==> Importing schema"
docker exec -i roommates-mysql mysql -u root -p"$DB_PASSWORD" taskdb < "$APP_DIR/database/schema.sql"

echo "==> Tables"
docker exec roommates-mysql mysql -u root -p"$DB_PASSWORD" taskdb -e "SHOW TABLES;"
