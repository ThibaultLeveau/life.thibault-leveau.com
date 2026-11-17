# API Sport

Les programmes sont les modèles réutilisables (`Workout`), et les entraînements sont leurs exécutions (`Training`). Les identifiants techniques `/workouts`, `workout_id` et les contrats JSON restent stables. La création et la modification en page utilisent les mêmes POST/PUT ; aucune migration ni conversion de données n’est nécessaire.

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
| GET | `/workouts` | Programmes actifs, ou `archived=true` |
| GET | `/workouts/{uuid}` | Programme, même archivé |
| POST | `/workouts` | Créer nom, notes et liste ordonnée `entries` |
| PUT | `/workouts/{uuid}` | Remplacer le programme et son ordre, avec `expected_version` |
| PUT | `/workouts/{uuid}/archive` | Archiver/restaurer sans changer les sessions |
| POST | `/sessions` | Démarrer `{workout_id, expected_version}` (version du programme), avec propositions issues des résultats antérieurs |
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
| POST | `/scores/backfill` | Réparer uniquement les scores manquants du compte, sans corps ; idempotent |
| GET | `/statistics` | `since` / `until` inclusifs, un an par défaut et dix ans maximum |

Les entrées de programme sont `{exercise_id, sets, target}`. Les objectifs sont facultatifs, mais les mesures d’une série validée doivent toutes être présentes et conformes au type de `/kinds`. Les indices des exercices et séries commencent à **0**. Les identifiants des exercices fournis sont des chaînes stables, ceux des objets privés sont des UUID. L’ordre des `entries` est l’ordre du programme ; conserver les noms/types retournés uniquement pour affichage, les entrées d’écriture n’acceptent que les trois champs ci-dessus.

Chaque entrée d’entraînement expose aussi `suggested_values`, une liste indexée à partir de 0 : `[{"weight_kg":40,"reps":12,...}, {"weight_kg":42.5,"reps":8,...}]`. Les autres mesures de `Values` valent `null`. Une position `null` signifie qu’aucune série antérieure correspondante n’a été enregistrée ; les instantanés créés avant cette fonctionnalité renvoient une liste vide. Ces propositions sont réservées aux réponses d’entraînement : ne pas les envoyer dans les entrées de programme ni les confondre avec `sets`.

Au démarrage, le serveur cherche les derniers résultats conservés de chaque série du même compte/programme/exercice/type, du plus récent entraînement terminé ou abandonné au plus ancien. Des exercices réordonnés restent reconnus ; les doublons sont associés par rang d’occurrence. Une série annulée, absente ou marquée `skipped: true` ne remplace pas une valeur plus ancienne. Les propositions sont figées dans l’instantané ; elles ne modifient ni `target`, ni `sets`, ni score, dates ou repos. Une nouvelle série sans historique peut utiliser côté client la dernière série précédente validée dans l’entraînement courant, puis `target`. Toute validation reste un PUT explicite avec `expected_version` et toutes les mesures requises.

Une session renvoie `server_now` et `rest_until` UTC : le client affiche `max(0, rest_until - server_now - temps écoulé depuis la réponse)`. Une correction de série conserve son `completed_at` et ne relance pas le repos. Les dates et données de l’instantané persistent après modification ou archivage du modèle. Les résultats des sessions terminées sont immuables via API ; la réparation explicite peut seulement enrichir un score manquant. Les résultats, `metrics`, `score` et `baseline_id` restent lisibles. Les [formules et limites du score](sport.md#statistiques-et-score) s’appliquent aussi aux clients indépendants.

Les lectures ne créent ni objets ni copies du catalogue en base. Les écritures sont transactionnelles et sérialisées par propriétaire. Sur un conflit, relire l’objet ; ne pas remplacer aveuglément la version par la dernière sans réconcilier les modifications.

## Terminer une séance incomplète

`PUT /sessions/{uuid}/finish` avec `{"expected_version": 3, "outcome": "completed", "notes": "Fatigue"}` termine aussi une séance sans aucune série validée. Dans la même transaction, le serveur conserve les résultats existants et ajoute chaque couple d’indices manquant avec toutes les mesures de son type à zéro, `skipped: true` et `completed_at` égal à `finished_at`. Les champs non applicables restent `null` dans la réponse. Le repos est arrêté et la version augmente une seule fois. Les anciennes séries et celles validées explicitement renvoient `skipped: false` par défaut.

Le contrat de sortie `SetResultValues` accepte les zéros. Le contrat d’entrée `Values` conserve ses bornes strictes : répétitions, durée, distance et calories positives lors d’une validation manuelle ou d’une cible. `skipped` est un champ de réponse réservé au serveur ; il ne se transmet pas dans un PUT de série. Une série non validée est mise à zéro même si une cible ou une proposition non nulle était affichée.

`completed_sessions` inclut ces séances ; `total_sets` compte uniquement les séries réellement validées. Les séries omises n’augmentent aucun volume/distance et n’alimentent pas les propositions. Toute nouvelle séance terminée reçoit un score v2 numérique, **0** si elle est vide. `score_details` expose version (2), séries prévues/réalisées, `completion_percent`, `difficulty_percent` (null si vide) et `score`. `metrics[].scoring` conserve les références par série (`values`, `sources` : `target`, `history`, `initial`), les compteurs et la somme non arrondie des rapports d’effort. Les métriques brutes restent inchangées. `baseline_id` pointe sur la première séance de la famille v2, même vide ; la première a `baseline_id: null`. La formule et les règles de référence sont détaillées dans le [guide](sport.md#statistiques-et-score). Les anciens scores numériques restent inchangés avec `score_details: null`, dans une famille distincte.

`outcome: "cancelled"` n’ajoute aucune série et conserve son comportement sans score ni statistiques. Les contrôles de session, activation, propriétaire, CSRF et version restent obligatoires. Une répétition du PUT après fin retourne **409**, sans ajouter de résultat ni changer l’historique.

## Exemple complet en Python

Installer `httpx`, définir `LIFE_URL`, `LIFE_USERNAME` et `LIFE_PASSWORD` dans l’environnement privé du client. L’exemple crée volontairement un programme et ses résultats sur le compte connecté.

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
        'name': 'Programme API',
        'entries': [{'exercise_id': exercise['id'], 'sets': 2,
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
    print(result['sets'][1]['values']['reps'])  # 0 : seconde série non validée
    assert result['sets'][1]['skipped'] is True
    print(result['score'])  # Effort réalisé rapporté aux objectifs/références et séries prévues
    print(request('GET', '/sport/statistics')['completed_sessions'])
    next_training = request('POST', '/sport/sessions', json={
        'workout_id': workout['id'], 'expected_version': workout['version'],
    })
    print(next_training['entries'][0]['suggested_values'][0])  # 40 kg, 10 répétitions
    assert next_training['sets'] == []  # encore aucune série validée
```

Mensuration : `POST /sport/measurements` avec `{"measured_on":"2026-11-14","weight_kg":75,"waist_cm":85}` (adapter la date). La réponse contient `id` et `version` pour une correction `PUT` ou un archivage. Les valeurs omises lors d’un remplacement reviennent à `null`, les notes à la chaîne vide.

## Erreurs

- **401** : session absente ou expirée.
- **403** : origine/CSRF incorrect ou Sport désactivée ; dans ce dernier cas, en-tête `X-Life-Application-Disabled: sport`.
- **404** : objet inconnu, indice de série absent ou objet d’un autre compte.
- **409** : version obsolète, session déjà active/terminée, programme ou exercice archivé, date de mensuration déjà utilisée.
- **422** : champ inconnu, type invalide, bornes dépassées, champs incompatibles, mensuration vide/future ou période incorrecte.

Les compteurs et graphiques excluent les abandons et les relevés archivés. Les périodes de sessions utilisent `started_at` UTC, les relevés leur date civile enregistrée. L’accès aux données des autres comptes ne révèle pas leur existence.

## Date de compétition HYROX

`POST /workouts` et `PUT /workouts/{uuid}` acceptent `competition_date`, une date civile ISO `YYYY-MM-DD` ou `null`. Elle est facultative ; les nombres, dates inexistantes, chaînes vides et valeurs avec heure sont refusés avec **422**. Les années vont de 0001 à 9999, dates passées comprises. Un remplacement PUT omettant ce champ le remet à `null`, comme les autres champs facultatifs. Renvoyer la date lue pour la conserver lors d’une modification indépendante.

```json
{
  "name": "HYROX — préparation",
  "competition_date": "2027-04-17",
  "notes": "Préparation de ma prochaine compétition",
  "entries": [{"exercise_id": "builtin-da98dd6929927833d279", "sets": 1,
               "target": {"distance_m": 1000, "duration_seconds": 300}}]
}
```

Résoudre l’identifiant de l’exercice par `GET /exercises?q=course%20sur%20tapis` avant d’envoyer cet exemple. Pour modifier, envoyer le même corps avec `expected_version` ; pour effacer la date, remplacer `competition_date` par `null`. Les protections session, activation, propriétaire, CSRF et conflit **409** restent celles des programmes.

Les réponses des programmes et des séances (actives, historique, statistiques) exposent `competition_date`. Le serveur copie la date au démarrage, sans modifier les séances précédentes. Une ancienne séance renvoie `null`. La date reste indépendante du titre en stockage ; le client affiche l’habillage seulement si le titre contient `hyrox` sans distinction de casse. Le compte à rebours se calcule dans le fuseau local du client à partir de cette date, sans stockage supplémentaire ni nouveau paramètre de session. Un client API peut donc gérer entièrement la même fonctionnalité.

## Catalogue bilingue

`builtin: true` identifie un exercice par défaut ; `false` un exercice personnel. Les réponses exposent aussi `muscle_id` et `equipment_id` (codes stables pour les exercices fournis, `null` pour les personnels), distincts de `muscle_group` et `equipment` destinés à l’affichage. Ces champs de réponse ne s’envoient pas lors d’une création personnelle.

La langue du compte localise les noms, notes, alias, facettes et `/kinds`, ainsi que les noms des exercices fournis dans programmes, entraînements, métriques et statistiques. `q` cherche dans les libellés de cette langue ; les filtres `muscle`/`equipment` acceptent les codes stables, les libellés courants et les anciens libellés français. Les textes personnels, résultats, dates, versions, signatures et scores restent inchangés. Les instantanés ne sont pas réécrits à la lecture. Voir [langue de compte et exemples HTTP](internationalisation.md#api-independante-de-linterface).

## Réparer les scores manquants

`POST /api/v1/sport/scores/backfill`, sans corps, calcule les scores **uniquement** des séances `completed` du compte dont `score` est null. La réponse est `{"updated_sessions": 2}` (nombre variable). L’opération est idempotente : une répétition renvoie zéro. Session, CSRF/origine, activation Sport et verrou du propriétaire s’appliquent. Les références sont reconstruites dans l’ordre fin/id à partir des instantanés conservés, jamais depuis des résultats futurs. Les anciens instantanés sans propositions utilisent objectifs puis calibration initiale.

```bash
curl --fail --request POST "$BASE/api/v1/sport/scores/backfill" \
  --cookie cookies.txt --header "X-CSRF-Token: $CSRF"
```

La transaction ne modifie ni séries, dates, notes, version, score déjà numérique, métrique brute ou progression. Seuls score, référence et détails du calcul des séances réparées sont enregistrés. GET détail/historique/statistiques expose ensuite les mêmes valeurs ; les lectures ne déclenchent jamais de réparation. Sauvegarder avant une reprise de production ; voir [l’exploitation](deploiement.md#livraison-du-score-sport-v2).
