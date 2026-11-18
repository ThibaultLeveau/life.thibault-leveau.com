#!/usr/bin/env bash
# Disposable network with a synthetic public address; no Internet or production data.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
revision=$(git rev-parse HEAD)
browser_image=${LIFE_TEST_BROWSER_IMAGE:-local/life-recipe-browser:$revision}
proxy_image=${LIFE_TEST_RECIPE_EGRESS_IMAGE:-local/life-recipe-egress:$revision}
prefix="life-recipe-check-$$"
network="$prefix-network"
cleanup() {
  result=$?
  if [[ $result -ne 0 ]]; then docker logs --tail 30 "$prefix-browser" 2>/dev/null || true; fi
  docker rm -fv "$prefix-browser" "$prefix-proxy" "$prefix-site" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Globally routable syntax exercises the production admission policy on an internal test network.
docker network create --internal --subnet 93.184.215.0/24 "$network" >/dev/null
docker run -d --name "$prefix-site" --network "$network" --ip 93.184.215.3 \
  -v "$PWD/infrastructure/recipe-browser/test/fixture.py:/tmp/fixture.py:ro" \
  --entrypoint python "$proxy_image" /tmp/fixture.py >/dev/null
docker run -d --name "$prefix-proxy" --network "$network" --network-alias recipe-egress \
  --add-host recipe.test:93.184.215.3 --add-host blocked.test:93.184.215.254 \
  -e LIFE_RECIPE_BLOCKED_HOSTS=blocked.test --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true "$proxy_image" >/dev/null
docker run -d --name "$prefix-browser" --network "$network" --read-only --init \
  --tmpfs /tmp:size=512m --shm-size=256m --cap-drop ALL \
  --security-opt no-new-privileges:true --security-opt seccomp=./infrastructure/recipe-browser/seccomp.json \
  -e LIFE_RECIPE_BROWSER_TOKEN=synthetic-private-browser-test-token-only "$browser_image" >/dev/null
for attempt in $(seq 1 30); do
  if docker exec "$prefix-browser" node -e "fetch('http://127.0.0.1:8090/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$prefix-browser" node --input-type=module < infrastructure/recipe-browser/test/acceptance.mjs
