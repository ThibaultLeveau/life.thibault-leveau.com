# Intégrations de données entre applications

Disponible : Tâches et Sport publient leurs métriques ; Suivi les consomme. Le [contrat approuvé](decisions/005-integrations-tracking.md) conserve les fournisseurs dans chaque métier et assemble leurs manifestes dans le registre existant. Aucun import de métier entre applications, SQL arbitraire, script distant, collecte de temps d’écran ou service analytique supplémentaire.

## API commune

| Route sous `/api/v1` | Contrat |
| --- | --- |
| `GET /integrations` | Sources, activation, noms/descriptions localisés, unités, filtres et agrégations autorisés |
| `GET /integrations/{application_id}/options/{filter_id}?q=…&offset=0&limit=30` | Options privées recherchables et paginées ; maximum 100, recherche de nom ou identifiant exact |
| `POST /integrations/evaluate` | Requête et résultat avec valeur, état, unité, date d’observation et taille de l’échantillon |

Session obligatoire sur toutes les routes ; CSRF pour l’évaluation POST. Une source désactivée retourne 409 pour ses options/évaluations. Une référence étrangère ou inconnue retourne 404 ; métrique/filtre/agrégation incompatible ou volume excessif retourne 422. Le catalogue contient uniquement les métadonnées, pas les valeurs privées.

```json
{
  "application_id": "tasks",
  "metric_id": "completed",
  "aggregation": "count",
  "filters": {"due_state": "late"},
  "since": "2026-11-01",
  "until": "2026-11-30",
  "timezone": "Europe/Paris"
}
```

```bash
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  https://life.thibault-leveau.com/api/v1/integrations/evaluate \
  -d '{"application_id":"sport","metric_id":"completed","aggregation":"count","filters":{},"since":"2026-11-01","until":"2026-11-30","timezone":"Europe/Paris"}'
```

Les dates locales sont inclusives ; les événements utilisent l’intervalle UTC semi-ouvert entre minuit du premier jour et minuit après le dernier. Les journées de 23/25 heures sont prises en charge. Dates entre 2000 et 2100, fenêtre de 3 660 jours d’écart maximum, au plus huit filtres, 20 000 observations avant agrégation. `count`/`sum` vides valent zéro ; `average|min|max|latest` sans valeur et `change` avec moins de deux mesures valent `missing`. Un résultat impossible à reconstruire vaut `unavailable`. `sample_count` dépend des observations du calcul, et ne constitue pas un décompte de visites.

Dans un champ Suivi, `source` reprend `application_id`, `metric_id`, `aggregation`, `filters` et ajoute `period: tracking|daily|weekly|monthly|yearly`. Le serveur déduit les bornes autour du jour choisi. Dans une saisie longue, une source quotidienne concerne le jour de saisie sélectionné ; utiliser `tracking` pour l’ensemble de la période. Les instantanés conservent ces bornes explicitement. Choisir un nombre minimum négatif pour suivre une variation corporelle éventuellement négative.

## Règles de Tâches

Les événements sont évalués dans leur contexte historique (espace, section, statut, récurrence et échéance). Une résolution annulée ne compte plus dans un nouvel aperçu ; une réouverture conserve la résolution antérieure. `completed` compte les occurrences, `completed_distinct` les tâches distinctes. Les résolutions récurrentes peuvent donc contribuer plusieurs fois. Les archives actuelles ne retirent pas les événements historiques.

`rescheduled` compte les changements **manuels** d’échéance, y compris suppression ou première attribution après création. Le déplacement automatique d’une récurrence et l’annulation d’une résolution en sont exclus. `rescheduled_tasks` déduplique les tâches. `reports_more_than` exige strictement plus de N changements dans la période et les autres filtres sélectionnés ; il ne compte pas les reports antérieurs à cette fenêtre.

`late_days` compare le jour local de résolution à l’échéance historique (minimum zéro). `resolution_days` mesure le délai création → résolution, en jours de 24 heures ; pour une récurrence il part de la création de la tâche, pas d’un début de cycle inconnu. `on_time_rate` est le pourcentage de résolutions à l’heure parmi celles ayant une échéance. Ces trois mesures utilisent les résolutions non annulées. Les filtres `due_state=late|on_time|undated` se fondent sur l’échéance de l’événement.

Les métriques `current` décrivent les tâches actuelles : elles ne s’évaluent que sur une période contenant aujourd’hui. Les archives d’une tâche, section ou espace sont exclues sauf pour `archived_current`. `due` compte les tâches ouvertes dont l’échéance courante tombe dans la fenêtre. Les filtres de priorité et étiquette ne sont proposés que pour ces états actuels, car leur historique complet n’est pas disponible.

Les options incluent les références archivées pour permettre les analyses passées ; elles n’incluent jamais celles d’un autre propriétaire.

## Règles de Sport

Les métriques de séances terminées utilisent `finished_at`. `started` compte tous les démarrages ; `completion_rate` prend les séances démarrées dans la fenêtre et rapporte celles terminées au moment du calcul. Les filtres exercice/type sélectionnent les séances contenant ces entrées et leurs séries ; ils ne découpent pas le temps global d’une séance.

Les valeurs des séries viennent des instantanés terminés. Les séries non effectuées (`skipped: true`), ajoutées à zéro lors de la clôture d’une séance incomplète, sont exclues du nombre de séries réalisées et des agrégations de mesures. La séance clôturée compte toujours comme terminée ; une séance sans série effectuée donne zéro série et aucune moyenne de charge. `elapsed_seconds` est le temps total début → fin, repos inclus ; `duration_seconds` est la durée effectivement renseignée dans les séries. Le volume est poids × répétitions ; aucune charge n’est inventée pour les exercices au poids du corps. La vitesse est distance/durée des séries fournissant les deux valeurs, par séance, puis agrégation des vitesses. Les exercices sans mesure concernée sont ignorés.

Les scores ne s’agrègent que si les séances appartiennent au même programme, à la même signature et à la même racine de référence de score (les familles v1/v2 restent séparées) ; sinon le résultat est indisponible et invite à réduire les filtres/périodes. Les programmes archivés et leurs séances restent analysables. Les mensurations archivées sont exclues des nouveaux calculs. `change` est dernière moins première mesure de la fenêtre ; aucun point absent n’est remplacé par zéro.

## Catalogue livré

Les identifiants et unités sont stables ; les noms, descriptions et filtres sont localisés. La réponse de découverte est l’autorité pour construire une interface : ne pas recopier ce catalogue côté client.

### Tâches

| Identifiant | Mesure | Unité | Calculs | Filtres |
| --- | --- | --- | --- | --- |
| `archived` | Archivages de tâches | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `archived_current` | Tâches archivées maintenant (état actuel) | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `label_id`, `priority` |
| `closed` | Tâches terminées maintenant (état actuel) | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `label_id`, `priority` |
| `completed` | Tâches terminées | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `completed_distinct` | Tâches distinctes résolues | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `completion_undone` | Résolutions annulées | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `created` | Tâches créées | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `due` | Tâches ouvertes à échéance (état actuel) | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `label_id`, `priority` |
| `late_days` | Retard à la résolution | d | `average`, `sum`, `min`, `max` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `moved` | Déplacements de tâches | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `on_time_rate` | Résolutions à l’heure | % | `average` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `open` | Tâches ouvertes maintenant (état actuel) | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `label_id`, `priority` |
| `overdue` | Tâches en retard maintenant (état actuel) | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `label_id`, `priority` |
| `recurring` | Tâches récurrentes actives (état actuel) | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `label_id`, `priority` |
| `reopened` | Tâches réouvertes | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `rescheduled` | Replanifications manuelles | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state`, `reports_more_than` |
| `rescheduled_tasks` | Tâches replanifiées | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state`, `reports_more_than` |
| `resolution_days` | Délai création–résolution | d | `average`, `sum`, `min`, `max` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `restored` | Restaurations de tâches | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |

### Sport

| Identifiant | Mesure | Unité | Calculs | Filtres |
| --- | --- | --- | --- | --- |
| `assistance_kg` | Assistance utilisée | kg | `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `calories` | Calories saisies | kcal | `sum`, `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `cancelled` | Entraînements abandonnés | — | `count` | `workout_id`, `exercise_id`, `kind` |
| `completed` | Entraînements terminés | — | `count` | `workout_id`, `exercise_id`, `kind` |
| `completion_rate` | Taux de séances terminées | % | `average` | `workout_id`, `exercise_id`, `kind` |
| `distance_m` | Distance parcourue | m | `sum`, `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `duration_seconds` | Durée d’effort saisie | s | `sum`, `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `elapsed_seconds` | Durée des entraînements | s | `sum`, `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `measurements` | Relevés de mensurations | — | `count` | — |
| `programs` | Programmes pratiqués | — | `count` | `workout_id`, `exercise_id`, `kind` |
| `reps` | Répétitions réalisées | — | `sum`, `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `score` | Indice de progression Sport | % | `average`, `min`, `max`, `latest` | `workout_id` |
| `sets` | Séries réalisées | — | `count` | `workout_id`, `exercise_id`, `kind` |
| `speed` | Vitesse moyenne par séance | m/s | `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `started` | Entraînements démarrés | — | `count` | `workout_id`, `exercise_id`, `kind` |
| `training_days` | Jours d’entraînement | — | `count` | `workout_id`, `exercise_id`, `kind` |
| `volume_kg` | Volume soulevé | kg | `sum`, `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `weight_kg` | Charges utilisées | kg | `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `body_weight_kg` | Poids corporel | kg | `latest`, `average`, `min`, `max`, `change` | — |
| `body_body_fat_pct` | Masse grasse | % | `latest`, `average`, `min`, `max`, `change` | — |
| `body_neck_cm` | Tour de cou | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_shoulders_cm` | Tour d’épaules | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_chest_cm` | Tour de poitrine | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_waist_cm` | Tour de taille | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_hips_cm` | Tour de hanches | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_arm_left_cm` | Bras gauche | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_arm_right_cm` | Bras droit | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_thigh_left_cm` | Cuisse gauche | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_thigh_right_cm` | Cuisse droite | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_calf_left_cm` | Mollet gauche | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_calf_right_cm` | Mollet droit | cm | `latest`, `average`, `min`, `max`, `change` | — |

## Fournisseur Objectifs OKR

L’application `okr` fournit `completed`, `key_results` et `check_ins`, uniquement en agrégation `count`. Les options `objective_id` restent limitées au propriétaire, archives comprises ; `domain` et `horizon` sont des filtres de sélection. Les deux premières métriques comptent les premières réussites distinctes, identifiées avant les bornes temporelles ; les corrections ne déplacent pas un premier succès vers une période ultérieure. `check_ins` compte les confirmations explicites, y compris corrections, et exclut l’édition du formulaire. Domaine et horizon proviennent des instantanés immuables. Un compteur vide est zéro ; aucun état courant n’est projeté dans le passé. Désactiver la source bloque les nouvelles lectures sans effacer les valeurs déjà confirmées dans Suivi. [Exemples API](okr-api.md#metriques-et-progression).

## Source Recettes et courses

`recipes` fournit `recipes` (recettes créées), `lists` (listes terminées), `imports` (couples liste/recette importés) et `templates` (modèles devenus non vides). Ces quatre métriques historiques acceptent uniquement `count`, sans filtres. Elles comptent les premières confirmations dans la période/fuseau demandés, archives comprises. Une réouverture ou correction ne compte pas une seconde fois. Zéro correspond à l’absence d’événement, source désactivée à une indisponibilité ; les instantanés Suivi restent préservés. [Guide](recipes.md#suivi-quetes-et-motivation).
