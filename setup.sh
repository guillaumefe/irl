#!/usr/bin/env bash
set -e

########################################
# LifePath RPG – Launcher
# 1) Tente Docker / docker-compose
# 2) Si échec → fallback venv + SQLite
########################################

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

VENV_DIR=".venv"
REQ_FILE="requirements.txt"

# --------------------------------------------------
# Helpers d'affichage
# --------------------------------------------------
info()  { echo -e "ℹ️  $*"; }
ok()    { echo -e "✅ $*"; }
warn()  { echo -e "⚠️  $*"; }
err()   { echo -e "❌ $*" >&2; }

# --------------------------------------------------
# 1) TENTATIVE DOCKER
# --------------------------------------------------
try_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    warn "Docker n'est pas installé ou pas dans le PATH."
    return 1
  fi

  # Vérifier que le daemon répond
  if ! docker info >/dev/null 2>&1; then
    warn "Docker est installé mais le daemon ne répond pas (pas lancé / pas de droits?)."
    return 1
  fi

  if [ ! -f "docker-compose.yml" ] && [ ! -f "docker-compose.yaml" ]; then
    warn "Aucun fichier docker-compose.yml trouvé dans $(pwd)."
    return 1
  fi

  # Préférer 'docker compose' s'il existe, sinon 'docker-compose'
  if command -v docker-compose >/dev/null 2>&1; then
    DC="docker-compose"
  else
    DC="docker compose"
  fi

  info "Tentative de lancement avec Docker (${DC} up -d --build)..."
  set +e
  $DC up -d --build
  STATUS=$?
  set -e

  if [ $STATUS -ne 0 ]; then
    err "Le lancement via Docker a échoué (code $STATUS)."
    return 1
  fi

  ok "Stack Docker démarrée. API disponible (probablement) sur http://localhost:8000"
  info "Pour voir les logs :"
  echo "    $DC logs -f"
  return 0
}

# --------------------------------------------------
# 2) FALLBACK LOCAL (venv + SQLite)
# --------------------------------------------------
run_local() {
  info "Passage en mode local (sans Docker)."

  # 2.1 – Détection de Python
  if command -v python3 >/dev/null 2>&1; then
    PYTHON=python3
  elif command -v python >/dev/null 2>&1; then
    PYTHON=python
  else
    err "Python n'est pas installé (python3/python introuvable)."
    exit 1
  fi
  ok "Python détecté : $PYTHON"

  # 2.2 – Création / réutilisation du venv
  if [ ! -d "$VENV_DIR" ]; then
    info "Création de l'environnement virtuel ($VENV_DIR)..."
    $PYTHON -m venv "$VENV_DIR"
  else
    info "Environnement virtuel déjà présent ($VENV_DIR)."
  fi

  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"

  # 2.3 – Installation des dépendances
  if [ -f "$REQ_FILE" ]; then
    info "Installation des dépendances depuis $REQ_FILE..."
    pip install --upgrade pip
    pip install -r "$REQ_FILE"
  else
    warn "$REQ_FILE introuvable, installation d'un set minimal de libs..."
    pip install --upgrade pip
    pip install fastapi "uvicorn[standard]" "SQLAlchemy>=2.0" python-multipart passlib[bcrypt] openai
  fi

  # 2.4 – Variables d'environnement
  export DATABASE_URL="sqlite:///./lifepath.db"
  export LIFEPATH_DEBUG="1"

  if [ -z "$OPENAI_API_KEY" ]; then
    warn "OPENAI_API_KEY n'est pas définie : /api/chat renverra des réponses factices (mode dev)."
  else
    ok "OPENAI_API_KEY détectée (chat IA réel activé)."
  fi

  # 2.5 – Lancement du serveur
  if [ ! -f "server.py" ]; then
    err "server.py introuvable dans $(pwd)."
    exit 1
  fi

  ok "Lancement du backend LifePath en local sur http://localhost:8000"
  info "(Ctrl+C pour arrêter)"
  uvicorn server:app --host 0.0.0.0 --port 8000 --reload
}

# --------------------------------------------------
# MAIN FLOW
# --------------------------------------------------

DOCKER_OK=0

info "=== LifePath RPG – Launcher ==="
info "Dossier projet : $PROJECT_ROOT"

if try_docker; then
  DOCKER_OK=1
else
  warn "Lancement Docker impossible."
fi

if [ $DOCKER_OK -eq 1 ]; then
  ok "Application démarrée via Docker. Aucun fallback nécessaire."
  exit 0
fi

# Fallback : demander confirmation pour le mode local
echo
warn "Docker n'a pas pu être utilisé pour lancer l'application."
read -r -p "Souhaites-tu lancer l'application en mode local (sans Docker) ? [O/n] " ANSWER

ANSWER=${ANSWER:-O}
if [[ "$ANSWER" =~ ^[OoYy]$ ]]; then
  ok "Confirmation reçue : lancement en mode local."
  run_local
else
  warn "Abandon : ni Docker ni mode local n'ont été utilisés."
  exit 0
fi
