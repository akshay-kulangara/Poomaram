#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing system packages"
sudo dnf update -y
sudo dnf install -y docker nginx git curl nodejs npm
sudo systemctl enable --now docker
sudo systemctl enable --now nginx
sudo usermod -aG docker "$USER" || true

if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

if ! docker buildx version >/dev/null 2>&1; then
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -fsSL https://github.com/docker/buildx/releases/download/v0.17.1/buildx-v0.17.1.linux-amd64 \
    -o /usr/local/lib/docker/cli-plugins/docker-buildx
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx
fi

if ! command -v docker-compose >/dev/null 2>&1; then
  sudo curl -fsSL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 \
    -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
fi

echo "==> Versions"
docker --version
node --version
npm --version
pm2 --version
docker buildx version
docker-compose version
