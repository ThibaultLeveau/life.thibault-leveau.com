#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ $# -gt 1 || ( $# -eq 1 && $1 != --rollback ) ]]; then
  echo 'Usage: ./scripts/deploy.sh [--rollback]' >&2
  exit 2
fi

if [[ ! -f .env.production ]] || [[ $(<.env.production) == *REPLACE_WITH_* || $(<.env.production) == *life-development-only* ]]; then
  echo 'Configurer .env.production avec les secrets de production, voir docs/deploiement.md.' >&2
  exit 1
fi
compose() { docker compose --env-file .env.production "$@"; }

mkdir -p .deployment
chmod 700 .deployment
exec 9>.deployment/lock
flock -n 9 || { echo 'Un déploiement est déjà en cours.' >&2; exit 1; }
docker network inspect multisite_proxy >/dev/null

current_id=$(LIFE_IMAGE=local/life:probe compose ps --all -q web)
current_image=''
if [[ -n "$current_id" ]]; then
  current_image=$(docker inspect --format '{{.Config.Image}}' "$current_id")
fi

if [[ ${1:-} == --rollback ]]; then
  if [[ ! -s .deployment/previous-image ]]; then
    echo 'Aucune image précédente enregistrée.' >&2
    exit 1
  fi
  target_image=$(<.deployment/previous-image)
  if [[ ! "$target_image" =~ ^local/life:[a-f0-9]{40}$ ]]; then
    echo 'Référence de retour arrière invalide.' >&2
    exit 1
  fi
  docker image inspect "$target_image" >/dev/null
else
  if [[ -n $(git status --porcelain) ]]; then
    echo 'Commitez les modifications avant de publier une image identifiée par son commit.' >&2
    exit 1
  fi
  revision=$(git rev-parse HEAD)
  target_image="local/life:$revision"
  docker build --build-arg "REVISION=$revision" -t "$target_image" .
fi

export LIFE_IMAGE="$target_image"
compose up -d --wait --wait-timeout 120 db
if [[ ${1:-} != --rollback ]]; then
  # A backup also records the empty schema on the first deployment.
  ./scripts/backup.sh
  compose run --rm --no-deps web life migrate
else
  # Never downgrade data automatically; the old image must accept the current schema.
  compose run --rm --no-deps web python -c '
from life_app.main import create_app
from life_app.api.health import ready
app = create_app()
with app.state.sessions() as db:
    ready(db)
'
fi

if ! compose up -d --no-build --wait --wait-timeout 90 web; then
  echo 'La nouvelle version ne devient pas saine.' >&2
  compose logs --tail 60 web >&2
  if [[ -n "$current_image" && "$current_image" != "$target_image" ]]; then
    echo "L’image précédente est $current_image. Vérifier sa compatibilité avec le schéma avant de la relancer." >&2
  fi
  echo 'Aucune restauration ou rétrogradation automatique de la base. Voir docs/sauvegardes.md.' >&2
  exit 1
fi

if [[ -n "$current_image" && "$current_image" != "$target_image" ]]; then
  printf '%s\n' "$current_image" >.deployment/previous-image.tmp
  mv .deployment/previous-image.tmp .deployment/previous-image
fi
printf '%s\n' "$target_image" >.deployment/current-image.tmp
mv .deployment/current-image.tmp .deployment/current-image
printf 'Version déployée : %s\n' "$target_image"
echo 'Vérification publique : ./scripts/smoke-test.sh'
