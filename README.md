# Roommates — Cloneable Deployment

This repository is the reproducible deployment version of the Roommates application. It combines the application source with the database schema captured from the working Amazon Linux 2023 deployment and the deployment changes made during setup.

## Architecture

```text
Internet
   |
   v
Nginx :80
   |-- static frontend
   |-- /api/* -> Node.js/PM2 :3000
   `-- /uploads/* -> Node.js/PM2 :3000
                         |
                         +--> MySQL 8 Docker :3306 (localhost only)
                         `--> Telegram notifier Docker :3001 (localhost only)
```

## Repository layout

- `frontend/` — static HTML/CSS/JS/images
- `backend/` — Express application
- `telegram-notifier/` — Telegram notification microservice
- `database/schema.sql` — schema-only dump from the working `taskdb`
- `nginx/roommates.conf` — reverse-proxy/static configuration
- `deploy/deploy.sh` — one-command Amazon Linux 2023 deployment

## Fresh Amazon Linux 2023 deployment

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/roommates.git
cd roommates
sudo ./deploy/deploy.sh
```

The script prompts for:

1. MySQL root password
2. Session secret
3. Telegram bot token
4. Telegram chat ID

Secrets are written only to protected `.env` files and are ignored by Git.

## Manual verification

```bash
docker ps
pm2 status
sudo systemctl status nginx --no-pager
curl http://127.0.0.1:3001/health
curl -I http://127.0.0.1
```

## Important security rules

- Never commit `.env` files.
- Never commit Telegram bot tokens.
- Never commit production passwords or session secrets.
- Keep ports 3000, 3001 and 3306 private.
- Recommended AWS Security Group: 22 from an administrator IP, 80 public, 443 public.

## Database

`database/schema.sql` contains the table definitions only. It does not contain the current production rows/users/expenses/tasks.

The schema includes the application's tables such as `users`, `roommates`, `tasks`, `assignments`, `activities`, expense tables, `settlements`, and `waste_bin_entries`.

To create a data backup from a running server:

```bash
docker exec roommates-mysql mysqldump -u root -p taskdb > taskdb-backup.sql
```

Do not commit that backup to GitHub.

## Existing-server deployment

The deployment script is intended for a fresh Amazon Linux 2023 server. If you are deploying over an existing installation, back up the database first and review existing Docker/PM2/Nginx configuration before running it.

## HTTPS

After DNS points to the server, add TLS using Certbot/Let's Encrypt and change the Nginx configuration to redirect HTTP to HTTPS. The backend session cookie can then be configured with `secure: true`.
