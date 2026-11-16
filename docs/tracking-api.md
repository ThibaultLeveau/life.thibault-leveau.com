# API Suivi

L’API `/api/v1/tracking` utilise la session, le CSRF et l’activation `tracking` communs. Les corps exacts et réponses typées figurent dans [OpenAPI](/api/docs). Le propriétaire provient de la session ; aucun identifiant de propriétaire n’est accepté en entrée. Les champs inconnus sont refusés.

| Méthode et chemin après `/api/v1/tracking` | Opération |
| --- | --- |
| `GET /trackers?archived=false` | Suivis actifs dans l’ordre personnel ; `true` liste les archives |
| `POST /trackers` | Créer, réponse 201 |
| `GET /trackers/{id}` | Lire la définition courante |
| `PUT /trackers/{id}` | Remplacer la définition, avec `expected_version` |
| `PUT /trackers/order` | `{ "ids": ["uuid", "…"] }`, ensemble exact des suivis actifs |
| `PUT /trackers/{id}/archive` | `archived` booléen et `expected_version` |
| `GET /settings`, `PUT /settings` | Fuseau du tableau de bord et défaut de création |
| `GET /current?day=YYYY-MM-DD&include_archived=false` | Périodes contenant ce jour ; sans jour, aujourd’hui dans chaque fuseau |
| `GET /calendar?since=…&until=…&tracker_id=…` | Jours quotidiens et occurrences longues séparées |
| `GET /statistics?since=…&until=…&tracker_id=…` | Calendrier, régularité, score moyen, réussites et tendances du suivi choisi |
| `GET /achievements` | XP, niveau, séries et badges calculés |
| `GET /trackers/{id}/entries/{day}` | Occurrence, définition applicable et saisie éventuelle |
| `POST /trackers/{id}/entries/{day}/preview` | Aperçu des sources, sans écriture ; CSRF requis |
| `PUT /trackers/{id}/entries/{day}` | Sauvegarde partielle, brouillon ou confirmation |
| `GET /trackers/{id}/entries/{day}/history?limit=30&offset=0` | Corrections, version décroissante, maximum 100 par page |

`day` sélectionne la période. Pour une semaine, plusieurs jours pointent vers la même saisie, unique par suivi/début de période. Les périodes futures ne peuvent être saisies. Les filtres calendrier acceptent les suivis archivés ; `include_archived=true` permet de retrouver leurs occurrences passées.

## Définitions et valeurs

Une définition contient `name`, `description`, `frequency` (`daily|weekly|monthly|yearly`), `timezone`, `start_date`, `color` hexadécimale et `fields` (1–30). Les limites et fréquences sont détaillées dans le [guide](tracking.md). Fréquence, date de début et fuseau restent immuables après création. Chaque champ possède un `id` stable de 1–60 caractères alphanumériques/underscore/tiret, un `label`, `kind`, `unit`, `required`, `weekdays` (0=lundi, 6=dimanche), bornes, options, objectif, poids et source optionnelle. Le type et l’unité d’un même identifiant ne changent pas ; utiliser un nouvel identifiant pour une autre série.

Les nombres sont finis, entre −10¹² et 10¹², et respectent les bornes du champ. Les booléens sont stricts : `false` n’est pas `0`. `null` efface une réponse ; omettre une clé conserve sa valeur. Les clés inconnues, champs non prévus ce jour et écritures manuelles d’une source automatique sont refusés. Les choix doivent appartenir aux options ; la durée manuelle est exprimée en minutes. Les unités des sources doivent correspondre au catalogue. L’objectif est `{mode,target,upper?,tolerance}` ; `tolerance>0`, poids entre 0 exclu et 10 inclus.

Une saisie initiale utilise `expected_version:0`. Toute correction utilise la version retournée. `complete:false` enregistre un brouillon, y compris la réouverture d’une saisie terminée. `complete:true` valide toutes les réponses obligatoires et au moins une valeur. Le serveur conserve les instantanés automatiques existants sauf `refresh_sources:true`. Chaque succès ajoute une révision immuable ; une erreur annule toute la transaction. Voir le [calcul des scores et XP](tracking.md#lire-le-calendrier).

## Exemple indépendant de l’interface

Créer une session selon l’[API commune](api.md), enregistrer ses cookies dans `cookies.txt` et son jeton dans la variable `CSRF`. Ne jamais enregistrer ces secrets dans le dépôt.

```bash
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -X PUT https://life.thibault-leveau.com/api/v1/applications/tracking \
  -d '{"enabled":true}'

curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  https://life.thibault-leveau.com/api/v1/tracking/trackers \
  -d '{"name":"Mon équilibre","frequency":"daily","timezone":"Europe/Paris","start_date":"2026-11-16","fields":[{"id":"water","label":"Eau bue","unit":"L","weekdays":[0,1,2,3,4,5,6],"goal":{"mode":"at_least","target":2,"tolerance":2}},{"id":"walk","label":"Marcher","kind":"boolean","weekdays":[0,1],"goal":{"mode":"equals","target":true}}]}'

# Remplacer <id> par l’identifiant retourné, et choisir un jour prévu non futur.
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -X PUT 'https://life.thibault-leveau.com/api/v1/tracking/trackers/<id>/entries/2026-11-16' \
  -d '{"expected_version":0,"values":{"water":0,"walk":false},"complete":true}'
```

Cette saisie est complète et vaut 0/10. Corriger avec `expected_version:1`, `water:2` et `walk:true` donne 10/10 ; l’historique conserve les deux versions. Adapter les dates à son propre suivi.

## Erreurs et disponibilité

- `401` : session absente/expirée ; `403` : CSRF/origine invalide ou Suivi désactivé.
- `404` : suivi d’un autre propriétaire, référence inconnue ou aucune occurrence prévue.
- `409` : version périmée, ou source désactivée lors d’une configuration/évaluation.
- `422` : contrat invalide, données requises manquantes, date future, limites de volume/période, changement d’un invariant.

Les évaluations pour une saisie transforment les erreurs de source 404/409/422 en état `unavailable`. Elles ne déconnectent pas le consommateur. Les compteurs vides valent zéro, une moyenne/dernière mesure sans observation vaut `missing`, un état historique non reconstructible vaut `unavailable`. Les réponses n’ont pas de valeur fictive de remplacement.

Toutes les dates de requête sont comprises entre 2000 et 2100 ; calendrier/statistiques acceptent 367 jours inclus. Les sources sont bornées à dix ans et 20 000 observations par requête. Les entrées utilisées dans les calculs ont également une limite de 20 000 : un dépassement produit 422, sans troncature silencieuse. Voir [intégrations](integrations.md), [données](donnees.md#donnees-de-suivi) et [sauvegardes](sauvegardes.md#migration-0009-suivi).
