# API Sport

Toutes les routes sont sous `/api/v1/sport`, avec session, propriétaire et activation Sport obligatoires. Les mutations utilisent l’origine autorisée et `X-CSRF-Token`, comme les [autres API](api.md). OpenAPI décrit les champs, bornes et réponses à `/api/docs`.

| Méthode | Route | Opération |
| --- | --- | --- |
| GET | `/kinds` | Types, champs, unités, limites et formules |
| GET | `/exercises` | Catalogue + personnels ; `q`, `kind`, `muscle`, `equipment`, `archived`, `offset`, `limit` (1–1000) |
| GET | `/exercises/{id}` | Exercice fourni ou personnel, même archivé |
| POST | `/exercises` | Créer un exercice personnel |
| PUT | `/exercises/{uuid}` | Remplacer l’exercice personnel avec `expected_version` |
| PUT | `/exercises/{uuid}/archive` | `{expected_version, archived}` ; restauration avec `false` |
| GET / PUT | `/settings` | `{rest_seconds}` (0–3600, défaut 90) |
| GET | `/workouts` | Séances actives, ou `archived=true` |
| GET | `/workouts/{uuid}` | Séance, même archivée |
| POST | `/workouts` | Créer nom, notes et liste ordonnée `entries` |
| PUT | `/workouts/{uuid}` | Remplacer la séance et son ordre, avec `expected_version` |
| PUT | `/workouts/{uuid}/archive` | Archiver/restaurer sans changer les sessions |
| POST | `/sessions` | Démarrer `{workout_id, expected_version}` (version de la séance) |
| GET | `/sessions` | Historique paginé (`offset`, `limit` 1–100) |
| GET | `/sessions/active` | Session active ou `null` |
| GET | `/sessions/{uuid}` | Instantané, séries, dates, score et référence |
| PUT | `/sessions/{uuid}/sets/{entry}/{set}` | Valider/corriger `{expected_version, values}` |
| DELETE | `/sessions/{uuid}/sets/{entry}/{set}` | Annuler une série avec corps `{expected_version}` |
| PUT | `/sessions/{uuid}/rest` | Passer le repos avec `{expected_version}` |
| PUT | `/sessions/{uuid}/finish` | `{expected_version, outcome: completed/cancelled, notes}` |
| GET | `/measurements` | Relevés actifs, ou `archived=true` |
| POST | `/measurements` | Relevé daté, au moins une mesure |
| PUT | `/measurements/{uuid}` | Remplacer le relevé avec `expected_version` |
| PUT | `/measurements/{uuid}/archive` | Archiver/restaurer |
| GET | `/statistics` | `since` / `until` inclusifs, un an par défaut et dix ans maximum |

Les entrées de séance sont `{exercise_id, sets, target}`. Les objectifs sont facultatifs, mais les mesures d’une série validée doivent toutes être présentes et conformes au type de `/kinds`. Les indices des exercices et séries commencent à **0**. Les identifiants des exercices fournis sont des chaînes stables, ceux des objets privés sont des UUID. L’ordre des `entries` est l’ordre de la séance ; conserver les noms/types retournés uniquement pour affichage, les entrées d’écriture n’acceptent que les trois champs ci-dessus.

Une session renvoie `server_now` et `rest_until` UTC : le client affiche `max(0, rest_until - server_now - temps écoulé depuis la réponse)`. Une correction de série conserve son `completed_at` et ne relance pas le repos. Les dates et données de l’instantané persistent après modification ou archivage du modèle. Les sessions terminées sont immuables via API ; les résultats, `metrics`, `score` et `baseline_id` restent lisibles. Les [formules et limites du score](sport.md#statistiques-et-score) s’appliquent aussi aux clients indépendants.

Les lectures ne créent ni objets ni copies du catalogue en base. Les écritures sont transactionnelles et sérialisées par propriétaire. Sur un conflit, relire l’objet ; ne pas remplacer aveuglément la version par la dernière sans réconcilier les modifications.

## Exemple complet en Python

Installer `httpx`, définir `LIFE_URL`, `LIFE_USERNAME` et `LIFE_PASSWORD` dans l’environnement privé du client. L’exemple crée volontairement une séance et ses résultats sur le compte connecté.

```python
import os
import httpx

base = os.environ['LIFE_URL'].rstrip('/')
with httpx.Client(base_url=base + '/api/v1', headers={'Origin': base}) as client:
    def request(method, path, **kwargs):
        response = client.request(method, path, **kwargs)
        response.raise_for_status()
        return response.json()

    session = request('POST', '/auth/session', json={
        'username': os.environ['LIFE_USERNAME'],
        'password': os.environ['LIFE_PASSWORD'],
    })
    client.headers['X-CSRF-Token'] = session['csrf_token']
    request('PUT', '/applications/sport', json={'enabled': True})
    request('PUT', '/sport/settings', json={'rest_seconds': 90})
    exercise = request('GET', '/sport/exercises', params={
        'q': 'développé couché à la barre', 'kind': 'weight_reps',
    })['items'][0]
    workout = request('POST', '/sport/workouts', json={
        'name': 'Séance API',
        'entries': [{'exercise_id': exercise['id'], 'sets': 1,
                     'target': {'weight_kg': 40, 'reps': 10}}],
    })
    training = request('POST', '/sport/sessions', json={
        'workout_id': workout['id'], 'expected_version': workout['version'],
    })
    training = request('PUT', f"/sport/sessions/{training['id']}/sets/0/0", json={
        'expected_version': training['version'],
        'values': {'weight_kg': 40, 'reps': 10},
    })
    result = request('PUT', f"/sport/sessions/{training['id']}/finish", json={
        'expected_version': training['version'], 'outcome': 'completed',
        'notes': 'Exemple créé par API',
    })
    print(result['score'])  # 100 pour cette première session de référence
    print(request('GET', '/sport/statistics')['completed_sessions'])
```

Mensuration : `POST /sport/measurements` avec `{"measured_on":"2026-11-14","weight_kg":75,"waist_cm":85}` (adapter la date). La réponse contient `id` et `version` pour une correction `PUT` ou un archivage. Les valeurs omises lors d’un remplacement reviennent à `null`, les notes à la chaîne vide.

## Erreurs

- **401** : session absente ou expirée.
- **403** : origine/CSRF incorrect ou Sport désactivée ; dans ce dernier cas, en-tête `X-Life-Application-Disabled: sport`.
- **404** : objet inconnu, indice de série absent ou objet d’un autre compte.
- **409** : version obsolète, session déjà active/terminée, séance ou exercice archivé, série manquante avant fin, date de mensuration déjà utilisée.
- **422** : champ inconnu, type invalide, bornes dépassées, champs incompatibles, mensuration vide/future ou période incorrecte.

Les compteurs et graphiques excluent les abandons et les relevés archivés. Les périodes de sessions utilisent `started_at` UTC, les relevés leur date civile enregistrée. L’accès aux données des autres comptes ne révèle pas leur existence.
