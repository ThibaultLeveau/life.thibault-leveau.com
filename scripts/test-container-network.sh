#!/usr/bin/env bash
# Check the production Compose network wiring without Internet or a database.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
image=${LIFE_TEST_IMAGE:-local/life:$(git rev-parse HEAD)}
project="life-network-check-$$-$RANDOM"
database="${project}_database"
egress="${project}_egress"
proxy="$project-proxy"
web="$project-web"
endpoint="$project-endpoint"
temporary=$(mktemp -d)
compose_started=false
compose() {
  LIFE_IMAGE="$image" \
    LIFE_POSTGRES_ADMIN_PASSWORD=synthetic-network-admin-password \
    LIFE_POSTGRES_PASSWORD=synthetic-network-application-password \
    LIFE_DATABASE_URL=postgresql+psycopg://life:synthetic-network-application-password@db:5432/life \
    LIFE_SESSION_HOURS=168 LIFE_ASSISTANT_ENCRYPTION_KEYS= LIFE_ASSISTANT_TIMEOUT_SECONDS=180 \
    docker compose --env-file /dev/null -p "$project" \
      -f compose.yaml -f "$temporary/override.yaml" "$@"
}
cleanup() {
  result=$?
  if [[ $result -ne 0 ]]; then docker logs --tail 20 "$endpoint" 2>/dev/null || true; fi
  docker rm -f "$endpoint" "$web" >/dev/null 2>&1 || true
  if "$compose_started"; then compose down --volumes --remove-orphans >/dev/null 2>&1 || true; fi
  docker network rm "$proxy" >/dev/null 2>&1 || true
  rm -rf "$temporary"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cat >"$temporary/override.yaml" <<YAML
networks:
  proxy:
    name: $proxy
YAML
compose config --format json >"$temporary/compose.json"
python3 - "$temporary/compose.json" "$database" "$proxy" "$egress" <<'PY'
import json
import sys

config = json.load(open(sys.argv[1]))
services, networks = config['services'], config['networks']
assert set(services['db']['networks']) == {'database'}
assert set(services['web']['networks']) == {'database', 'proxy', 'egress'}
assert all(not services[name].get('ports') for name in ('db', 'web'))
assert networks['database'].get('internal') is True
assert not networks['database'].get('external', False)
assert networks['proxy'].get('external') is True
assert networks['egress'].get('driver', 'bridge') == 'bridge'
assert not networks['egress'].get('internal', False)
assert not networks['egress'].get('external', False)
for name, expected in zip(('database', 'proxy', 'egress'), sys.argv[2:], strict=True):
    assert networks[name]['name'] == expected, 'Network must belong to this disposable test'
PY
docker network create --internal "$proxy" >/dev/null
compose_started=true
compose run --detach --no-deps --use-aliases --pull never --name "$web" \
  web python -c 'import time; time.sleep(300)' >/dev/null
docker run -d --pull never --name "$endpoint" --network "$egress" --network-alias provider.test \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true --no-healthcheck \
  "$image" python -c '
from http.server import BaseHTTPRequestHandler, HTTPServer
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"life-egress-ok\n"
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *_):
        pass
HTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
' >/dev/null
docker inspect "$web" >"$temporary/web.json"
docker network inspect "$database" "$proxy" "$egress" >"$temporary/networks.json"
gateway=$(python3 - "$temporary" "$database" "$proxy" "$egress" <<'PY'
import json
import sys
from pathlib import Path

directory = Path(sys.argv[1])
web = json.loads((directory / 'web.json').read_text())[0]
networks = {item['Name']: item for item in json.loads((directory / 'networks.json').read_text())}
database, proxy, egress = sys.argv[2:]
assert set(web['NetworkSettings']['Networks']) == {database, proxy, egress}
assert not web['HostConfig']['PortBindings']
assert networks[database]['Internal'] and networks[proxy]['Internal']
assert networks[egress]['Driver'] == 'bridge' and not networks[egress]['Internal']
gateway = web['NetworkSettings']['Networks'][egress]['Gateway']
assert gateway
print(gateway)
PY
)
docker exec -i "$web" python - "$gateway" <<'PY'
import socket
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

routes = [line.split() for line in Path('/proc/net/route').read_text().splitlines()[1:]]
gateways = [socket.inet_ntoa(struct.pack('<I', int(row[2], 16)))
            for row in routes if row[1] == '00000000' and int(row[3], 16) & 2]
assert gateways == [sys.argv[1]], f'Unexpected default route: {gateways}'
client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
for attempt in range(30):
    try:
        socket.getaddrinfo('provider.test', 8080, type=socket.SOCK_STREAM)
        with client.open('http://provider.test:8080/', timeout=2) as response:
            assert response.status == 200 and response.read() == b'life-egress-ok\n'
        break
    except (OSError, urllib.error.URLError):
        if attempt == 29:
            raise
        time.sleep(0.2)
PY
echo 'Réseaux Compose, isolation PostgreSQL, DNS local, HTTP et route sortante vérifiés.'
