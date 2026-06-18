#!/usr/bin/env bash
# Eenmalige update: code ophalen, opnieuw bouwen, service herstarten.
set -euo pipefail

cd "${HOME}/payli-outreach1"

git pull --ff-only
npm ci --no-audit --no-fund
npm run db:push
npm run build

sudo systemctl restart payli-outreach.service
sleep 2
sudo systemctl status payli-outreach.service --no-pager | head -8 || true
