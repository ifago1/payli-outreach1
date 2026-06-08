#!/usr/bin/env bash
# Productie-installatie voor payli-outreach op Ubuntu.
# Voer dit één keer uit als ubuntu-gebruiker in ~/payli-outreach1.
set -euo pipefail

REPO_DIR="${HOME}/payli-outreach1"
SERVICE_NAME="payli-outreach"

cd "${REPO_DIR}"

echo "==> Latest code ophalen"
git pull --ff-only

echo "==> Dependencies installeren"
npm ci --no-audit --no-fund

echo "==> Database schema synchroniseren"
npm run db:push

echo "==> Productie-build"
npm run build

echo "==> systemd service installeren"
sudo install -m 644 deploy/payli-outreach.service "/etc/systemd/system/${SERVICE_NAME}.service"
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}.service"
sudo systemctl restart "${SERVICE_NAME}.service"

echo "==> Status"
sleep 2
sudo systemctl status "${SERVICE_NAME}.service" --no-pager | head -12 || true

echo
echo "Klaar. Logs volgen: sudo journalctl -u ${SERVICE_NAME} -f"
