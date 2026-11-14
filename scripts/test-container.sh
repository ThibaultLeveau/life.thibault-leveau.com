#!/usr/bin/env bash
# Exercise the packaged application, real PostgreSQL, browser and a restored dump.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
image=${LIFE_TEST_IMAGE:-local/life:$(git rev-parse HEAD)}
prefix="life-check-$$"
network="$prefix-network"
http_network="$prefix-http"
db="$prefix-db"
web="$prefix-web"
temporary=$(mktemp -d)
cleanup() {
  result=$?
  if [[ $result -ne 0 ]]; then docker logs --tail 80 "$web" 2>/dev/null || true; fi
  docker rm -fv "$web" "$db" >/dev/null 2>&1 || true
  docker network rm "$network" "$http_network" >/dev/null 2>&1 || true
  rm -rf "$temporary"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker network create --internal "$network" >/dev/null
docker network create "$http_network" >/dev/null
docker run -d --name "$db" --network "$network" \
  -e POSTGRES_USER=postgres -e POSTGRES_DB=life -e POSTGRES_PASSWORD=synthetic-admin-password \
  -e LIFE_APP_PASSWORD=synthetic-application-password \
  -v "$PWD/infrastructure/postgres/init.sh:/docker-entrypoint-initdb.d/10-life.sh:ro" \
  postgres:17-alpine >/dev/null
for attempt in $(seq 1 40); do
  if docker exec "$db" pg_isready -h 127.0.0.1 -U life -d life >/dev/null 2>&1; then break; fi
  sleep 1
done
url="postgresql+psycopg://life:synthetic-application-password@$db:5432/life"
run_app() {
  docker run --rm --network "$network" -e LIFE_DATABASE_URL="$url" "$image" "$@"
}
run_app life migrate
printf '%s\n' synthetic-browser-password | docker run --rm -i --network "$network" \
  -e LIFE_DATABASE_URL="$url" "$image" life create-user browser-test --password-stdin
# The test origin is HTTP on loopback; production cookie flags are covered by HTTP tests.
docker create --name "$web" --network "$network" --read-only --tmpfs /tmp:rw,size=16m \
  --cap-drop ALL --security-opt no-new-privileges:true \
  -e LIFE_DATABASE_URL="$url" -e LIFE_ENVIRONMENT=test \
  -p 127.0.0.1::8000 "$image" >/dev/null
docker network connect "$http_network" "$web"
docker start "$web" >/dev/null
port=$(docker inspect --format '{{(index (index .NetworkSettings.Ports "8000/tcp") 0).HostPort}}' "$web")
export LIFE_E2E_URL="http://127.0.0.1:$port"
for attempt in $(seq 1 40); do
  if curl --fail --silent "$LIFE_E2E_URL/api/v1/health/ready" >/dev/null; then break; fi
  sleep 1
done
./scripts/smoke-test.sh "$LIFE_E2E_URL"
LIFE_E2E_USERNAME=browser-test LIFE_E2E_PASSWORD=synthetic-browser-password npm --prefix frontend run test:e2e

# Restore into a separate throwaway database; never destroy the source under test.
echo 'Vérification de la restauration transactionnelle…'
docker exec "$db" pg_dump -U life -d life -Fc --no-owner --no-privileges >"$temporary/life.dump"
docker exec "$db" createdb -U postgres --owner life life_restored
docker exec "$db" psql -U life -d life_restored -c 'CREATE TABLE obsolete_data (id integer)' >/dev/null
cat scripts/restore-prefix.sql >"$temporary/restore.sql"
docker exec -i "$db" pg_restore --file=- --clean --if-exists --no-owner --no-privileges <"$temporary/life.dump" >>"$temporary/restore.sql"
cat scripts/restore-suffix.sql >>"$temporary/restore.sql"
docker exec -i "$db" psql -U life -d life_restored --single-transaction --set ON_ERROR_STOP=1 <"$temporary/restore.sql" >"$temporary/restore.log" 2>&1 || { cat "$temporary/restore.log" >&2; exit 1; }
source_count=$(docker exec "$db" psql -U life -d life -Atc 'SELECT count(*) FROM task_events')
restored_count=$(docker exec "$db" psql -U life -d life_restored -Atc 'SELECT count(*) FROM task_events')
[[ "$source_count" -gt 0 && "$source_count" == "$restored_count" ]]
source_parents=$(docker exec "$db" psql -U life -d life -Atc 'SELECT id, parent_id FROM workspaces WHERE parent_id IS NOT NULL ORDER BY id')
restored_parents=$(docker exec "$db" psql -U life -d life_restored -Atc 'SELECT id, parent_id FROM workspaces WHERE parent_id IS NOT NULL ORDER BY id')
[[ -n "$source_parents" && "$source_parents" == "$restored_parents" ]]

[[ $(docker exec "$db" psql -U life -d life_restored -Atc 'SELECT count(*) FROM login_sessions') == 0 ]]
[[ -z $(docker exec "$db" psql -U life -d life_restored -Atc "SELECT to_regclass('public.obsolete_data')") ]]
docker exec "$db" psql -U life -d life_restored -c 'CREATE TABLE rollback_marker (id integer)' >/dev/null
cp "$temporary/restore.sql" "$temporary/broken-restore.sql"
printf '\nSELECT 1 / 0;\n' >>"$temporary/broken-restore.sql"
if docker exec -i "$db" psql -U life -d life_restored --single-transaction --set ON_ERROR_STOP=1 <"$temporary/broken-restore.sql" >"$temporary/rollback-check" 2>&1; then
  echo 'Une restauration erronée doit échouer.' >&2
  exit 1
fi
[[ $(docker exec "$db" psql -U life -d life_restored -Atc "SELECT to_regclass('public.rollback_marker')") == rollback_marker ]]
[[ $(docker exec "$db" psql -U life -d life_restored -Atc 'SELECT count(*) FROM task_events') == "$source_count" ]]
[[ $(docker exec "$db" psql -U postgres -d life -Atc "SELECT rolsuper FROM pg_roles WHERE rolname = 'life'") == f ]]
url="postgresql+psycopg://life:synthetic-application-password@$db:5432/life_restored"
echo 'Vérification des migrations et de l’immuabilité après restauration…'
run_app life migrate
if docker exec "$db" psql -U life -d life_restored --set ON_ERROR_STOP=1 -c "UPDATE task_events SET kind = 'updated'" >"$temporary/immutable-check" 2>&1; then
  echo 'Le journal restauré doit rester immuable.' >&2
  exit 1
fi
printf 'Image, navigateur, rôle PostgreSQL et restauration vérifiés (%s événements conservés).\n' "$source_count"
