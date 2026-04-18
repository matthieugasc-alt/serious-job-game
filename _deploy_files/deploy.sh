#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# deploy.sh — Build & restart the Serious Game app
#
# Usage:
#   ./deploy.sh              # pull + build + restart
#   ./deploy.sh --build-only # build sans pull (pour les changements locaux)
#
# Prérequis sur le serveur:
#   - Node.js >= 18
#   - npm
#   - pm2 (npm install -g pm2) OU systemd
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="serious-game"
LOG_FILE="$APP_DIR/deploy.log"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$APP_DIR"
log "=== Déploiement démarré ==="

# ── 1. Pull (sauf --build-only) ──
if [[ "${1:-}" != "--build-only" ]]; then
  log "Git pull..."
  git pull origin main 2>&1 | tee -a "$LOG_FILE"
fi

# ── 2. Installer les dépendances si package-lock a changé ──
if git diff HEAD~1 --name-only 2>/dev/null | grep -q "package-lock.json"; then
  log "package-lock.json modifié — npm install..."
  npm ci --production=false 2>&1 | tee -a "$LOG_FILE"
else
  log "Pas de changement de dépendances, skip npm install"
fi

# ── 3. Build ──
log "Build Next.js..."
npm run build 2>&1 | tee -a "$LOG_FILE"

if [ $? -ne 0 ]; then
  log "ERREUR: Build échoué ! L'ancienne version reste en service."
  exit 1
fi

log "Build OK — $(cat .next/BUILD_ID)"

# ── 4. Restart ──
# Tente pm2, sinon systemd, sinon redémarre manuellement
if command -v pm2 &>/dev/null; then
  if pm2 describe "$APP_NAME" &>/dev/null; then
    log "Restart via pm2..."
    pm2 restart "$APP_NAME" 2>&1 | tee -a "$LOG_FILE"
  else
    log "Démarrage pm2 initial..."
    pm2 start npm --name "$APP_NAME" -- start 2>&1 | tee -a "$LOG_FILE"
    pm2 save 2>&1 | tee -a "$LOG_FILE"
  fi
elif systemctl is-active --quiet "$APP_NAME" 2>/dev/null; then
  log "Restart via systemd..."
  sudo systemctl restart "$APP_NAME" 2>&1 | tee -a "$LOG_FILE"
else
  log "Ni pm2 ni systemd détecté."
  log "Arrêt du process Next.js existant..."
  pkill -f "next start" 2>/dev/null || true
  sleep 1
  log "Démarrage next start en arrière-plan..."
  nohup npm start > "$APP_DIR/app.log" 2>&1 &
  log "PID: $!"
fi

log "=== Déploiement terminé ==="
echo ""
echo "Vérification: curl -s -o /dev/null -w '%{http_code}' http://localhost:3000"
