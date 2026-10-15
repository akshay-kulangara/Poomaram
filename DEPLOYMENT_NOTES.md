# Deployment reconciliation notes

This repository was normalized from the application ZIP and the schema exported from the working deployment.

Changes incorporated:

- Backend DB configuration uses `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` environment variables.
- Backend Telegram notifier URL uses `TELEGRAM_NOTIFIER_URL`, defaulting to `http://127.0.0.1:3001`.
- Telegram bot token and chat ID are environment-only; no real token is stored in source.
- Telegram notifier is bound to `127.0.0.1:3001` by Compose.
- Nginx proxies `/api/` to the backend and `/uploads/` to the backend.
- MySQL is bound to `127.0.0.1:3306`.
- The production database schema is included as `database/schema.sql`.
- Buildx and standalone Docker Compose installation are handled by deployment scripts.
- PM2 is used to run the backend persistently.
