#!/usr/bin/env bash
# Rebuild real UI screenshots using only disposable synthetic accounts.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

temporary=$(mktemp -d)
capture_db="life-documentation-$$"
capture_pid=''
cleanup() {
  result=$?
  if [[ -n "$capture_pid" ]]; then
    kill "$capture_pid" 2>/dev/null || true
    wait "$capture_pid" 2>/dev/null || true
  fi
  docker rm -fv "$capture_db" >/dev/null 2>&1 || true
  if [[ $result -ne 0 && -f "$temporary/server.log" ]]; then tail -40 "$temporary/server.log" >&2; fi
  rm -rf "$temporary"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

npm --prefix frontend run build
docker run -d --name "$capture_db" \
  -e POSTGRES_USER=postgres -e POSTGRES_DB=life -e POSTGRES_PASSWORD=synthetic-docs-admin \
  -e LIFE_APP_PASSWORD=synthetic-docs-app -p 127.0.0.1::5432 \
  -v "$PWD/infrastructure/postgres/init.sh:/docker-entrypoint-initdb.d/10-life.sh:ro" \
  postgres:17-alpine >/dev/null
for attempt in $(seq 1 40); do
  if docker exec "$capture_db" pg_isready -h 127.0.0.1 -U life -d life >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$capture_db" pg_isready -h 127.0.0.1 -U life -d life >/dev/null
capture_port=$(docker port "$capture_db" 5432/tcp)
export LIFE_DATABASE_URL="postgresql+psycopg://life:synthetic-docs-app@127.0.0.1:${capture_port##*:}/life"
export LIFE_ENVIRONMENT=test
uv run life migrate
for locale in fr en; do
  printf '%s\n' synthetic-documentation-password | uv run life create-user "documentation-$locale" --password-stdin
done
# Uvicorn owns the loopback socket from allocation onward, avoiding a port-selection race.
uv run uvicorn life_app.main:create_app --factory --host 127.0.0.1 --port 0 >"$temporary/server.log" 2>&1 &
capture_pid=$!
for attempt in $(seq 1 40); do
  capture_url=$(sed -n 's/.*Uvicorn running on \(http:\/\/127\.0\.0\.1:[0-9]*\).*/\1/p' "$temporary/server.log")
  if [[ -n "$capture_url" ]] && curl --fail --silent "$capture_url/api/v1/health/ready" >/dev/null; then break; fi
  kill -0 "$capture_pid"
  sleep 1
done
[[ -n "$capture_url" ]]
curl --fail --silent "$capture_url/api/v1/health/ready" >/dev/null
LIFE_DOCS_URL="$capture_url" LIFE_DOCS_STATE_DIR="$temporary" node frontend/scripts/capture-documentation.mjs
