#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
umask 077
mkdir -p backups
chmod 700 backups
export LIFE_IMAGE=${LIFE_IMAGE:-local/life:backup}
dump="backups/life-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
temporary=$(mktemp backups/.dump-XXXXXX)
trap 'rm -f "$temporary"' EXIT
docker compose --env-file .env.production exec -T db \
  pg_dump --username life --dbname life --format custom --no-owner --no-privileges >"$temporary"
test -s "$temporary"
docker compose --env-file .env.production exec -T db pg_restore --list <"$temporary" >/dev/null
mv "$temporary" "$dump"
printf '%s\n' "$dump"
