#!/bin/bash
# ═════════════════════════════════════════════════════════════════════
# deploy.sh — deploy propre sur le serveur pm2.
# ═════════════════════════════════════════════════════════════════════
#
# À lancer depuis /var/www/serious-job-game sur le serveur:
#   ./scripts/deploy.sh
#
# Ou depuis ta machine locale:
#   ssh root@204.168.217.145 'cd /var/www/serious-job-game && ./scripts/deploy.sh'
#
# Ce script REMPLACE la one-liner:
#   git pull && rm -rf .next && npm run build && pm2 restart serious-job-game
#
# Différences vs la one-liner:
#   1. `npm install` explicite AVANT le build → nouvelles devDeps (vitest,
#      etc.) ne cassent plus le type-check de next build.
#   2. Fail-fast (`set -e`) → si npm install ou build échoue, pm2 ne se
#      restart pas sur un état incohérent.
#   3. `pm2 delete + start` au lieu de `restart` → tue tout process
#      fantôme qui pourrait servir des chunks stale.
#   4. Vérifie BUILD_ID + chunks après build → détecte les builds
#      incomplets avant de restart.
#   5. Smoke test HTTP à la fin.
# ═════════════════════════════════════════════════════════════════════

set -euo pipefail

APP_NAME="serious-job-game"
APP_DIR="/var/www/serious-job-game"

cd "$APP_DIR"

echo "═══ 1/7 · Pull latest ═══"
git pull origin main

echo "═══ 2/7 · npm install (critique: catch les nouvelles deps) ═══"
npm install --no-audit --no-fund 2>&1 | tail -3

echo "═══ 3/7 · Kill pm2 completely ═══"
pm2 delete "$APP_NAME" 2>/dev/null || echo "(no existing process)"

echo "═══ 4/7 · Nuke build cache ═══"
rm -rf .next node_modules/.cache .turbo

echo "═══ 5/7 · Build production ═══"
NEXT_TELEMETRY_DISABLED=1 npm run build 2>&1 | tail -30

echo "═══ 6/7 · Sanity checks ═══"
if [ ! -f .next/BUILD_ID ]; then
  echo "!!! FAIL: BUILD_ID absent → build n'a pas terminé. Aborting."
  exit 1
fi
BUILD_ID=$(cat .next/BUILD_ID)
CHUNK_COUNT=$(ls .next/static/chunks/*.js 2>/dev/null | wc -l)
echo "BUILD_ID: $BUILD_ID"
echo "Chunks émis: $CHUNK_COUNT"
if [ "$CHUNK_COUNT" -lt 10 ]; then
  echo "!!! WARNING: seulement $CHUNK_COUNT chunks — probablement incomplet."
fi

echo "═══ 7/7 · Start pm2 fresh ═══"
pm2 start npm --name "$APP_NAME" -- start
pm2 save

sleep 3

echo "═══ Smoke tests ═══"
HOME_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
HUB_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/founder/hub)
echo "  Home HTTP:       $HOME_CODE"
echo "  Founder hub HTTP: $HUB_CODE"

if [ "$HOME_CODE" != "200" ] || [ "$HUB_CODE" != "200" ]; then
  echo "!!! WARNING: certaines pages ne servent pas 200. Check pm2 logs."
  pm2 logs "$APP_NAME" --lines 20 --nostream
  exit 1
fi

echo "═══ ✅ Deploy OK ═══"
pm2 status | head -10
