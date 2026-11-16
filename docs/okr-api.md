# API Objectifs OKR

Préfixe `/api/v1/okr`. Session commune, propriétaire authentifié et application `okr` active obligatoires. Toute mutation exige `X-CSRF-Token` et une origine autorisée. Le garde d’activation couvre chaque route automatiquement. [Swagger](https://life.thibault-leveau.com/api/docs) décrit les contrats complets.

## Routes et contrats

| Méthode / route | Contrat |
| --- | --- |
| GET `/objectives?archived=false` | Liste des objectifs actifs ou archivés, ordre persistant ; au plus 5 000 par compte |
| POST `/objectives` | Créer un `ObjectiveInput` ; réponse 201 `ObjectiveOutput` |
| GET `/objectives/{id}` | Lire un objectif, y compris archivé |
| PUT `/objectives/{id}` | Remplacer la définition complète + `expected_version` |
| PUT `/objectives/{id}/move` | `{expected_version, status, position}` : statut et insertion à la position, bornée à la taille de la colonne |
| PUT `/objectives/{id}/key-results/{key_result_id}` | `{expected_version, value, note?}` : confirmer une valeur et une note |
| PUT `/objectives/{id}/archive` | `{expected_version, archived}` : archiver/restaurer sans perte |
| GET `/objectives/{id}/history?offset=0&limit=30` | Instantanés des événements, 1 à 100 par page |
| GET `/achievements?quarter=2026-Q4&offset=0&limit=30` | Trimestre demandé (courant par défaut), trimestres disponibles, total et réalisations avec indicateur `reopened` |
| GET `/settings` | Fuseau, version (0 si implicite), jour et trimestre courants |
| PUT `/settings` | `{expected_version, timezone}` : préférence versionnée |

`ObjectiveInput` contient `title`, `domain` (`personal`/`professional`), `horizon` (`ten_year`/`three_year`/`annual`/`quarterly`), `parent_id` UUID nullable, `why`, `outcome`, `first_action`, `start_date`/`due_date` nullables et `key_results`. Chaque résultat contient `id` UUID (généré si absent), `title`, `start`, `target`, `current`, `unit`. Conservez ses identifiants lors des éditions. Les clés inconnues sont refusées ; le propriétaire, les dates de clôture, le trimestre réel et les XP ne sont jamais acceptés depuis le client.

`ObjectiveOutput` ajoute identifiant, version, statut, position, trimestre prévu/réel, progression en pourcentage et dates UTC de création/modification/clôture/archivage. Le statut est `backlog`, `in_progress` ou `done`. `position` représente l’index d’insertion dans les objectifs actifs du même horizon et statut, sans filtre de domaine ou de trimestre ; les voisins déplacés reçoivent une nouvelle version. Rechargez la liste après un déplacement.

Les [règles progressives et dates d’un mois](okr.md) sont validées côté serveur. Une clôture exige tous les résultats clés atteints ; un objectif terminé doit être rouvert avant édition. La réouverture est un déplacement vers `in_progress` ou `backlog`. Les lectures ne distribuent pas de récompenses. Les événements et récompenses sont transactionnels avec la mutation.

## Exemple autonome

Après connexion par l’[API de session](api.md#session-et-protections), utilisez le fichier de cookies et le jeton CSRF retourné. Les variables ci-dessous désignent uniquement vos paramètres locaux ; ne publiez pas les cookies ou jetons.

```bash
curl --fail-with-body -b cookies.txt \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -X PUT https://life.thibault-leveau.com/api/v1/applications/okr \
  --data '{"enabled":true}'

curl --fail-with-body -b cookies.txt \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  https://life.thibault-leveau.com/api/v1/okr/objectives \
  --data '{"title":"Tester mon offre","domain":"professional","horizon":"quarterly",
    "why":"Construire une activité durable","outcome":"Cinq retours documentés",
    "first_action":"Inviter le premier client","start_date":"2026-11-16","due_date":"2026-12-15",
    "key_results":[{"title":"Entretiens clients","start":0,"current":0,"target":5,"unit":"clients"}]}'
```

Avec `OBJECTIVE_ID`, `KEY_RESULT_ID` et la `VERSION` de la réponse :

```bash
curl --fail-with-body -b cookies.txt \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -X PUT "https://life.thibault-leveau.com/api/v1/okr/objectives/$OBJECTIVE_ID/key-results/$KEY_RESULT_ID" \
  --data "{\"expected_version\":$VERSION,\"value\":5,\"note\":\"Cinq retours obtenus\"}"
```

Reprenez la nouvelle `version` avant le déplacement `{ "expected_version": 2, "status": "done", "position": 0 }` sur `/objectives/{id}/move`. Le trimestre réel est calculé au serveur ; il peut différer du trimestre prévu.

## Métriques et progression

`GET /api/v1/integrations` découvre `okr`. `GET /api/v1/integrations/okr/options/objective_id?q=offre&offset=0&limit=30` recherche uniquement les objectifs du compte, archives comprises. `POST /api/v1/integrations/evaluate` accepte par exemple :

```json
{
  "application_id": "okr", "metric_id": "completed", "aggregation": "count",
  "filters": {"domain":"professional", "horizon":"quarterly"},
  "since":"2026-10-01", "until":"2026-12-31", "timezone":"Europe/Paris"
}
```

Métriques : `completed` (première clôture par objectif), `key_results` (première atteinte par résultat au sein d’un objectif), `check_ins` (confirmations explicites de valeurs, corrections comprises). Seule l’agrégation `count` est permise. Un compteur vide vaut zéro. La première occurrence est identifiée avant les filtres temporels ou de domaine ; une seconde clôture n’est pas une nouvelle première réussite. Le fuseau de la requête détermine les bornes journalières ; les instantanés déterminent domaine/horizon. Une source désactivée retourne 409 et préserve les instantanés Suivi.

Les routes communes `/api/v1/progression/okr`, `/okr/quests` et `/okr/history` exposent niveau, 60 quêtes et journal. Les clés stables des récompenses sont `objective:<uuid>` et `result:<objective_uuid>:<result_uuid>` ; corrections, archives et réouvertures ne les renouvellent pas. La reprise explicite via `life backfill-progression <compte>` lit uniquement les événements de ce propriétaire, avec la même déduplication.

## Erreurs

- **401** : session absente ou expirée.
- **403** : CSRF/origine invalide ou application désactivée (`X-Life-Application-Disabled: okr`).
- **404** : objectif/résultat/filtre inconnu ou appartenant à un autre compte.
- **409** : version obsolète, modification d’un objectif terminé/archivé, changement de domaine/horizon d’un parent ayant des enfants ; source de métriques désactivée.
- **422** : détails manquants, plan supérieur à un mois, cible égale au départ, date/nombre/horizon/domaine invalide, résultats clés non atteints à la clôture, mauvais parent ou limite atteinte.

Les réponses sont localisées selon le compte et non mises en cache. Les données historiques ne sont pas modifiables via l’API ; une correction produit un nouvel événement. Voir [données](donnees.md#donnees-okr) et [restauration](sauvegardes.md#migration-0011-okr).
