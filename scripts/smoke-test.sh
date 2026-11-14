#!/usr/bin/env bash
set -Eeuo pipefail
python3 - "${1:-https://life.thibault-leveau.com}" <<'PY'
import json
import sys
from html.parser import HTMLParser
from urllib.error import HTTPError
from urllib.request import urlopen

base = sys.argv[1].rstrip('/')

def get(path, expected=200):
    try:
        with urlopen(base + path, timeout=15) as response:
            status, body, headers = response.status, response.read(), response.headers
    except HTTPError as error:
        status, body, headers = error.code, error.read(), error.headers
    if status != expected:
        raise SystemExit(f'FAIL {path}: HTTP {status}, attendu {expected}')
    print(f'OK {status} {path}')
    return body, headers

class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        candidate = values.get('src') if tag == 'script' else values.get('href') if tag == 'link' else None
        if candidate and candidate.startswith('/assets/'):
            self.paths.append(candidate)

body, headers = get('/')
assert 'text/html' in headers['Content-Type'], 'Accueil non HTML'
assets = Assets()
assets.feed(body.decode())
assert assets.paths, 'Aucun bundle frontend dans la page'
for path in assets.paths:
    body, headers = get(path)
    assert body and 'text/html' not in headers['Content-Type'], f'Bundle invalide : {path}'
body, _ = get('/api/v1/health')
assert json.loads(body) == {'status': 'ok'}, 'Réponse de santé inattendue'
get('/tasks')
get('/applications')
get('/api/v1/applications', 401)
get('/api/v1/health/ready')
get('/api/v1/tasks', 401)
get('/api/v1/agenda/view', 401)
get('/api/v1/agenda/tasks', 401)
get('/api/docs')
body, _ = get('/api/openapi.json')
for path in ('/api/v1/health', '/api/v1/agenda/view', '/api/v1/agenda/tasks', '/api/v1/applications', '/api/v1/applications/{application_id}'):
    assert path in json.loads(body)['paths'], f'Schéma OpenAPI incomplet : {path}'
get('/favicon.svg')
get('/documentation/')
body, _ = get('/documentation/search/search_index.json')
assert json.loads(body).get('docs'), 'Index de recherche MkDocs vide'
for path in ('/absent', '/api/absent', '/assets/absent.js', '/documentation/absent/'):
    get(path, 404)
print('Tous les contrôles HTTP ont réussi.')
PY
