# API Sport

Les programmes sont les modèles réutilisables (`Workout`), et les entraînements sont leurs exécutions (`Training`). Les identifiants techniques `/workouts`, `workout_id` et les contrats JSON restent stables. La création et la modification en page utilisent les mêmes POST/PUT. La migration additive `0014_sport_ux` ajoute les préférences et le contexte de préparation sans convertir les résultats existants.

Toutes les routes sont sous `/api/v1/sport`, avec session, propriétaire et activation Sport obligatoires. Les mutations utilisent l’origine autorisée et `X-CSRF-Token`, comme les [autres API](api.md). OpenAPI décrit les champs, bornes et réponses à `/api/docs`.

| Méthode | Route | Opération |
| --- | --- | --- |
| GET | `/kinds` | Types, champs, unités, limites et formules |
| GET | `/exercises` | Catalogue + personnels ; `q`, `kind`, `muscle`, `equipment`, `origin=all/personal/builtin`, `archived`, `offset`, `limit` (1–1000) |
| GET | `/exercises/filters` | Facettes complètes `muscles` / `equipment` (`{value,label}`), indépendantes de la pagination ; `origin`, `archived` |
| GET | `/exercises/{id}` | Exercice fourni ou personnel, même archivé |
| POST | `/exercises` | Créer un exercice personnel |
| PUT | `/exercises/{uuid}` | Remplacer l’exercice personnel avec `expected_version` |
| PUT | `/exercises/{uuid}/archive` | `{expected_version, archived}` ; restauration avec `false` |
| GET / PUT | `/settings` | Repos, préférences de vue et version ; écriture partielle décrite ci-dessous |
| GET | `/workouts` | `archived`, recherche `q`, `sort=updated/name/recent`, `exercise_id` |
| GET | `/workouts/{uuid}` | Programme, même archivé |
| POST | `/workouts` | Créer nom, notes et liste ordonnée `entries` |
| PUT | `/workouts/{uuid}` | Remplacer le programme et son ordre, avec `expected_version` |
| PUT | `/workouts/{uuid}/archive` | Archiver/restaurer sans changer les sessions |
| POST | `/workouts/{uuid}/duplicate` | `{expected_version, name}` ; nouvelle copie active, version 1, sans séances |
| POST | `/sessions` | Démarrer `{workout_id, expected_version}` (version du programme), avec propositions issues des résultats antérieurs |
| GET | `/sessions` | Historique paginé (`offset`, `limit` 1–100), `q`, `workout_id`, `status=active/completed/cancelled`, `since`, `until` |
| GET | `/sessions/active` | Session active ou `null` |
| GET | `/sessions/{uuid}` | Instantané, séries, dates, score et référence |
| GET | `/sessions/{uuid}/navigation` | `{newer_id, older_id}`, voisins du même propriétaire respectant les filtres d’historique |
| PUT | `/sessions/{uuid}/sets/{entry}/{set}` | Valider/corriger `{expected_version, values}` |
| DELETE | `/sessions/{uuid}/sets/{entry}/{set}` | Annuler une série avec corps `{expected_version}` |
| PUT | `/sessions/{uuid}/rest` | Passer avec `{expected_version}` ; ajuster avec `adjustment_seconds: -15` ou `15` |
| PUT | `/sessions/{uuid}/finish` | `{expected_version, outcome: completed/cancelled, notes}` |
| GET | `/measurements` | Relevés actifs, ou `archived=true` |
| GET | `/measurements/{uuid}` | Relevé du propriétaire, même archivé |
| POST | `/measurements` | Relevé daté, au moins une mesure |
| PUT | `/measurements/{uuid}` | Remplacer le relevé avec `expected_version` |
| PUT | `/measurements/{uuid}/archive` | Archiver/restaurer |
| GET | `/statistics` | `since` / `until` inclusifs, un an par défaut et dix ans maximum ; `exercise_id`, `workout_id`, `baseline_id` |

Les entrées de programme sont `{exercise_id, sets, target}`. Les objectifs sont facultatifs, mais les mesures d’une série validée doivent toutes être présentes et conformes au type de `/kinds`. Les indices des exercices et séries commencent à **0**. Les identifiants des exercices fournis sont des chaînes stables, ceux des objets privés sont des UUID. L’ordre des `entries` est l’ordre du programme ; conserver les noms/types retournés uniquement pour affichage, les entrées d’écriture n’acceptent que les trois champs ci-dessus.

Chaque entrée d’entraînement expose aussi `suggested_values`, une liste indexée à partir de 0 : `[{"weight_kg":40,"reps":12,...}, {"weight_kg":42.5,"reps":8,...}]`. Les autres mesures de `Values` valent `null`. Une position `null` signifie qu’aucune série antérieure correspondante n’a été enregistrée ; les instantanés créés avant cette fonctionnalité renvoient une liste vide. Ces propositions sont réservées aux réponses d’entraînement : ne pas les envoyer dans les entrées de programme ni les confondre avec `sets`.

Au démarrage, le serveur cherche les derniers résultats conservés de chaque série du même compte/programme/exercice/type, du plus récent entraînement terminé ou abandonné au plus ancien. Des exercices réordonnés restent reconnus ; les doublons sont associés par rang d’occurrence. Une série annulée, absente ou marquée `skipped: true` ne remplace pas une valeur plus ancienne. Les propositions sont figées dans l’instantané ; elles ne modifient ni `target`, ni `sets`, ni score, dates ou repos. Une nouvelle série sans historique peut utiliser côté client la dernière série précédente validée dans l’entraînement courant, puis `target`. Toute validation reste un PUT explicite avec `expected_version` et toutes les mesures requises.

Une session renvoie `server_now` et `rest_until` UTC : le client affiche `max(0, rest_until - server_now - temps écoulé depuis la réponse)`. Une correction de série conserve son `completed_at` et ne relance pas le repos. Les dates et données de l’instantané persistent après modification ou archivage du modèle. Les sessions terminées sont immuables via API ; les résultats, `metrics`, `score` et `baseline_id` restent lisibles. Les [formules et limites du score](sport.md#statistiques-et-score) s’appliquent aussi aux clients indépendants.

Les lectures ne créent ni objets ni copies du catalogue en base. Les écritures sont transactionnelles et sérialisées par propriétaire. Sur un conflit, relire l’objet ; ne pas remplacer aveuglément la version par la dernière sans réconcilier les modifications.

## Terminer une séance incomplète

`PUT /sessions/{uuid}/finish` avec `{"expected_version": 3, "outcome": "completed", "notes": "Fatigue"}` termine aussi une séance sans aucune série validée. Dans la même transaction, le serveur conserve les résultats existants et ajoute chaque couple d’indices manquant avec toutes les mesures de son type à zéro, `skipped: true` et `completed_at` égal à `finished_at`. Les champs non applicables restent `null` dans la réponse. Le repos est arrêté et la version augmente une seule fois. Les anciennes séries et celles validées explicitement renvoient `skipped: false` par défaut.

Le contrat de sortie `SetResultValues` accepte les zéros. Le contrat d’entrée `Values` conserve ses bornes strictes : répétitions, durée, distance et calories positives lors d’une validation manuelle ou d’une cible. `skipped` est un champ de réponse réservé au serveur ; il ne se transmet pas dans un PUT de série. Une série non validée est mise à zéro même si une cible ou une proposition non nulle était affichée.

`completed_sessions` inclut les séances ainsi terminées ; `total_sets` compte uniquement les séries réellement validées. Les mesures à zéro n’augmentent aucun volume ni distance et n’alimentent pas `suggested_values`. Un exercice entièrement omis a une métrique nulle. La référence de score est la première séance de même programme/signature dont chaque exercice a une métrique positive. Sans une telle référence, `score` et `baseline_id` restent `null` si un exercice a une métrique nulle ; avec référence, une séance entièrement omise vaut 0. Les scores antérieurs ne sont pas recalculés. Les graphiques de score excluent les valeurs `null`.

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
    print(result['score'])  # 100 : cet exercice a une performance positive
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

## Préférences d’affichage et concurrence

`GET /settings` renvoie les défauts ci-dessous, sans créer de ligne :

```json
{
  "rest_seconds": 90,
  "workouts_view": "grid", "workouts_mobile_view": "list",
  "exercises_view": "list", "exercises_mobile_view": "list",
  "measurements_view": "grid", "measurements_mobile_view": "list",
  "version": 1, "server_today": "2026-11-17"
}
```

`server_today` est le jour UTC réel lors de la réponse, pas une préférence modifiable. L’interface utilise les clés `_mobile_view` à 800 px et moins, les autres au-delà. Chacun des six champs n’accepte que `list` ou `grid`. `PUT /settings` est **partiel** : les champs absents sont conservés ; `null` est refusé pour les valeurs. Un changement réel incrémente la version ; une écriture identique la conserve. `expected_version` protège les clients modernes ; il reste facultatif pour les anciens clients qui n’écrivent que `rest_seconds`. Une requête de vue ne réinitialise jamais le repos.

```python
settings = request('GET', '/sport/settings')
settings = request('PUT', '/sport/settings', json={
    'expected_version': settings['version'], 'workouts_view': 'list',
})
```

Sur 409, conserver le brouillon, relire et comparer avant de reprendre la nouvelle version. La même règle s’applique aux exercices, programmes, relevés et séances. `detail` d’une erreur de schéma 422 contient les localisations `loc` des champs ; une erreur métier peut conserver un message global.

## Préparation, copie et historique

Un programme reçoit `context: auto/standard/hyrox` (défaut `auto`). Une ancienne écriture qui omet ce champ conserve le contexte existant. `last_used_at` est calculé depuis le dernier démarrage de séance du programme, états terminé/annulé/actif inclus ; il vaut `null` sans séance et ne modifie pas sa version. Le tri `recent` place les programmes jamais utilisés après les autres. La recherche de programmes normalise accents et casse ; tous les termes doivent correspondre au nom.

```python
copy = request('POST', f"/sport/workouts/{workout['id']}/duplicate", json={
    'expected_version': workout['version'], 'name': 'Mon prochain cycle',
})
```

La copie reprend les entrées instantanées, notes, date et contexte ; elle possède un nouvel identifiant, des dates propres, une version 1 et aucun historique. La source peut être archivée ; les exercices archivés restent à restaurer/remplacer avant un démarrage. Les propriétaires restent isolés.

Au démarrage, `preparation_notes` et `context` sont copiés dans la séance et restent indépendants des modifications du programme. Ils n’altèrent ni signature ni score. Les séances anciennes ont des notes de préparation vides : aucune note actuelle n’est présentée comme historique.

Les filtres de séances se combinent. `q` cherche littéralement dans le nom (casse ignorée, `%` et `_` non interprétés). Les dates incluent les deux jours UTC via `started_at` ; une période inversée ou la borne `9999-12-31` est refusée. Les voisins sont ordonnés par démarrage puis identifiant, avec `null` en fin de parcours.

```python
page = request('GET', '/sport/sessions', params={
    'workout_id': workout['id'], 'status': 'completed', 'limit': 30, 'offset': 0,
})
if page['items']:
    neighbors = request('GET', f"/sport/sessions/{page['items'][0]['id']}/navigation",
                        params={'workout_id': workout['id'], 'status': 'completed'})
```

## Repos, bilan et références statistiques

`PUT /sessions/{id}/rest` avec `adjustment_seconds: ±15` déplace l’échéance existante ; il ne touche ni séries ni dates de validation. Un repos déjà terminé retourne 409. L’échéance est bornée à une heure après l’instant serveur ; une réduction à zéro arrête le repos. Omettre l’ajustement (ou envoyer `null`) conserve l’opération historique « passer le repos ». La version attendue est obligatoire.

La réponse de clôture expose `awarded_xp`, les XP de séance réellement enregistrés dans sa transaction, **hors bonus de quêtes**. Une séance annulée/vide rapporte 0. Ce champ vaut `null` lors des lectures ultérieures ; le journal et le total restent disponibles via l’API commune de progression. Il ne s’agit ni d’un score ni d’une estimation de différence de total.

Les statistiques filtrent les séances par exercice, programme ou référence, en plus de la période. Leurs compteurs portent sur les séances ainsi sélectionnées ; les mensurations restent celles de la période. `baselines` donne `{id,name,started_at,exercise_count}` pour les références des séances retenues, même si la référence est hors période. Les occurrences répétées restent des métriques distinctes dans l’ordre des entrées. Aucun regroupement implicite de mesures hétérogènes n’est effectué.
