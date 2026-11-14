#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ -n ${LIFE_TEST_DATABASE_URL:-} ]]; then
  exec uv run pytest "$@"
fi

# A disposable PostgreSQL instance; never use the production database for tests.
test_container="life-tests-$$"
trap 'docker rm -f "$test_container" >/dev/null 2>&1 || true' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker run --rm -d --name "$test_container" \
  -e POSTGRES_USER=life_test -e POSTGRES_PASSWORD=life-tests-only -e POSTGRES_DB=life_test \
  -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
# The initialization server only listens on a Unix socket; tests need the final TCP server.
for attempt in $(seq 1 30); do
  if docker exec "$test_container" pg_isready -h 127.0.0.1 -U life_test -d life_test >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$test_container" pg_isready -h 127.0.0.1 -U life_test -d life_test >/dev/null
test_port=$(docker port "$test_container" 5432/tcp)
test_port=${test_port##*:}
export LIFE_TEST_DATABASE_URL="postgresql+psycopg://life_test:life-tests-only@127.0.0.1:${test_port}/life_test"
uv run pytest "$@"
