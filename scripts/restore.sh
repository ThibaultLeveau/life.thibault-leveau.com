#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ $# -ne 2 || $1 != --confirm-data-replacement || ! -s $2 ]]; then
  echo 'Usage: ./scripts/restore.sh --confirm-data-replacement backups/FILE.dump' >&2
  echo 'Arrête Life et remplace la base par une sauvegarde de confiance. Voir docs/sauvegardes.md.' >&2
  exit 2
fi
umask 077
mkdir -p .deployment
exec 9>.deployment/lock
flock -n 9 || { echo 'Une opération de déploiement ou de restauration est en cours.' >&2; exit 1; }
export LIFE_IMAGE=${LIFE_IMAGE:-local/life:restore}
docker compose --env-file .env.production exec -T db pg_restore --list <"$2" >/dev/null
temporary=$(mktemp)
trap 'rm -f "$temporary"' EXIT
cat scripts/restore-prefix.sql >"$temporary"
docker compose --env-file .env.production exec -T db \
  pg_restore --file=- --clean --if-exists --no-owner --no-privileges <"$2" >>"$temporary"
cat scripts/restore-suffix.sql >>"$temporary"
./scripts/backup.sh
docker compose --env-file .env.production stop web
docker compose --env-file .env.production exec -T db \
  psql --username life --dbname life --single-transaction --set ON_ERROR_STOP=1 <"$temporary"
echo 'Base restaurée. Life reste arrêté : sélectionner une image compatible avant de le redémarrer.'
