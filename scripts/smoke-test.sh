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
get('/sport')
get('/tracking')
get('/okr')
get('/recipes')
get('/api/v1/recipes/ingredients', 401)
get('/api/v1/recipes/recipes', 401)
get('/api/v1/recipes/lists', 401)
get('/documentation/recipes/')
get('/documentation/en/recipes/')
get('/documentation/recipes-api/')
get('/api/v1/okr/objectives', 401)
get('/documentation/okr/')
get('/documentation/okr-api/')
get('/documentation/en/okr/')
get('/api/v1/progression', 401)
get('/api/v1/progression/settings', 401)
get('/api/v1/progression/tasks/quests', 401)
get('/documentation/progression/')
get('/documentation/en/progression/')
get('/api/v1/tracking/current', 401)
get('/api/v1/integrations', 401)
get('/documentation/tracking/')
get('/documentation/tracking-api/')
get('/documentation/integrations/')
get('/documentation/en/tracking/')
get('/api/v1/sport/kinds', 401)
get('/documentation/sport/')
get('/documentation/sport-api/')
get('/documentation/en/')
get('/documentation/en/applications/')
get('/documentation/en/taches/')
get('/documentation/en/sport/')
get('/applications')
get('/settings')
get('/settings?application=sport')
get('/documentation/settings/')
get('/documentation/en/settings/')
for path in ('settings', 'capabilities', 'conversations', 'memories'):
    get(f'/api/v1/assistant/{path}', 401)
for locale in ('', 'en/'):
    for path in ('assistant', 'assistant-api', 'decisions/008-assistant-ia'):
        get(f'/documentation/{locale}{path}/')
get('/api/v1/applications', 401)
get('/api/v1/health/ready')
get('/api/v1/tasks', 401)
get('/api/v1/agenda/view', 401)
get('/api/v1/agenda/tasks', 401)
get('/api/docs')
body, _ = get('/api/openapi.json')
schema_paths = json.loads(body)['paths']
for path in ('/api/v1/recipes/ingredients', '/api/v1/recipes/recipes', '/api/v1/recipes/lists/{id}/import', '/api/v1/okr/objectives', '/api/v1/okr/achievements', '/api/v1/okr/settings', '/api/v1/health', '/api/v1/agenda/view', '/api/v1/agenda/tasks', '/api/v1/applications', '/api/v1/applications/{application_id}', '/api/v1/sport/statistics', '/api/v1/sport/sessions', '/api/v1/tracking/calendar', '/api/v1/tracking/trackers', '/api/v1/integrations/evaluate', '/api/v1/progression', '/api/v1/progression/settings', '/api/v1/progression/{application_id}/history', '/api/v1/progression/{application_id}/quests'):
    assert path in schema_paths, f'Schéma OpenAPI incomplet : {path}'
for path, methods in {
    'settings': ('get', 'put'),
    'settings/test': ('post',),
    'capabilities': ('get',),
    'conversations': ('get', 'post'),
    'conversations/{id}': ('get', 'patch', 'delete'),
    'conversations/{id}/messages': ('post',),
    'runs/{id}/events': ('get',),
    'runs/{id}/cancel': ('post',),
    'operations/{id}/confirm': ('post',),
    'memories': ('get', 'post', 'delete'),
    'memories/{id}': ('patch', 'delete'),
}.items():
    route = f'/api/v1/assistant/{path}'
    assert route in schema_paths, f'Schéma OpenAPI incomplet : {route}'
    for method in methods:
        assert method in schema_paths[route], f'Schéma OpenAPI incomplet : {method.upper()} {route}'
get('/favicon.svg')
get('/documentation/')
body, _ = get('/documentation/search/search_index.json')
assert json.loads(body).get('docs'), 'Index de recherche MkDocs vide'
for path in ('/absent', '/api/absent', '/assets/absent.js', '/documentation/absent/'):
    get(path, 404)
print('Tous les contrôles HTTP ont réussi.')
PY
