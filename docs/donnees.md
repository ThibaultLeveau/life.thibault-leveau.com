# Données et historique

## Relations

![Relations entre compte, espaces, sections, statuts, tâches et événements.](assets/diagrams/data.svg)

[Source Mermaid](assets/diagrams/data.mmd)

| Table | Données et contraintes |
| --- | --- |
| `users` | UUID, identifiant unique normalisé, hash Argon2, thème |
| `login_sessions` | Hash du cookie opaque, utilisateur, hash CSRF, expiration UTC |
| `login_limits` | Clé hachée du compte ou de l'IP, compteur, expiration |
| `workspaces` | Propriétaire, nom, description, couleur, ordre, dates de création/archivage |
| `sections` | Espace, nom, description, couleur, ordre, visibilité `list/board/both`, archive |
| `task_statuses` | Espace, nom, couleur, ordre et caractère terminé |
| `task_labels` | Étiquettes propres à l'espace ; nom unique dans cet espace, sensible à la casse |
| `tasks` | Espace, section facultative, statut, texte, priorité, échéance, position, version et dates |
| `task_label_links` | Association tâche/étiquette avec espace commun |
| `view_preferences` | Une configuration JSONB validée par espace |
| `task_events` | Journal de cycle de vie immuable avec contexte historique |

Les clés primaires métier sont des UUID. Des clés étrangères composites imposent que la section, le statut et les étiquettes d'une tâche appartiennent au même espace. Une priorité vaut 1 à 4, une position est positive ou nulle, une version strictement positive. Le serveur garantit au moins un statut ouvert et un terminé par espace ; une bascule de type est refusée si le statut est utilisé, archives comprises.

Les descriptions restent du texte, sans HTML interprété. Les échéances sont des `DATE` calendaires ; les dates de création, mise à jour, résolution, archivage et événements sont des instants avec fuseau, émis en UTC. Le navigateur les présente dans son fuseau et transmet sa date locale pour les filtres « aujourd'hui ».

## Résolutions et réouvertures

| Transition | Effet |
| --- | --- |
| Création ouverte | `created`, `completed_at = null` |
| Création directement terminée | `created` puis `completed` |
| Ouvert → terminé | `completed`, nouvelle date de résolution |
| Terminé → ouvert | `reopened`, `completed_at = null`, anciens événements conservés |
| Ouvert → ouvert ou terminé → terminé | Mouvement sans nouvelle résolution ; date de résolution conservée |
| Répétition de `/complete` ou `/reopen` sur l'état voulu | Aucun événement ni changement de version, si `expected_version` est actuel |
| Archivage/restauration individuels | `archived`/`restored`, état de résolution inchangé |

Les événements contiennent `kind`, `occurred_at`, les identifiants tâche/espace/section/statut, `previous_status_id`, `was_completed`, `is_completed` et `context.before/after`. Le contexte conserve noms et identifiants d'espace, section et statut à l'instant du changement ; il ne copie ni titre, ni description de tâche, ni mot de passe.

Le trigger PostgreSQL `immutable_task_events` interdit UPDATE et DELETE sur les lignes du journal. Le compte d'exploitation reste responsable des sauvegardes et de l'administration ; ce journal n'est pas une preuve cryptographique contre un administrateur de base. Les événements de contexte n'ont pas de clé étrangère vers les anciens statuts, afin de survivre à leur retrait. La tâche conserve son UUID après déplacement.

## Ordre et déplacements

La position d'une tâche définit un ordre commun dans son espace, filtré par section et par statut pour chaque vue. Un déplacement indique un espace, une section, un statut et éventuellement `before_id` dans la section cible. Sans `before_id`, il place la tâche à la fin. Les positions concernées sont normalisées, sans changement des dates de résolution des autres tâches.

Entre espaces, les trois références sont mises à jour atomiquement. Les étiquettes sont reprises par nom exact ; une étiquette homonyme existante garde sa couleur, sinon une nouvelle est créée avec la couleur source. L'ancienne association disparaît, la tâche et son journal restent les mêmes.

Retirer un statut utilisé exige un statut de remplacement du même type ouvert/terminé. Les tâches, y compris archivées, sont réaffectées avec événement `moved`, sans résolution fictive. Retirer une étiquette supprime les associations et le filtre correspondant, sans supprimer les tâches.

## Archives et conservation

Les espaces, sections et tâches ne sont pas supprimés définitivement. L'archivage d'un parent masque son contenu sans modifier les dates individuelles. La restauration rend visibles les tâches actives, mais ne réactive pas celles archivées individuellement. Une tâche archivée ne se modifie qu'après restauration de ses parents, puis de la tâche elle-même.

Les modifications des noms, réglages et associations d'étiquettes ne constituent pas un audit exhaustif de toutes les métadonnées. Le journal est destiné au cycle de vie des tâches ; il ne conserve pas chaque ancien texte. Il n'y a pas encore de purge automatique de l'historique. Toute future suppression définitive doit préciser ses effets sur les statistiques et les sauvegardes.

## Exploitation statistique future

Pour compter les résolutions par jour UTC et espace historique :

```sql
SELECT workspace_id, (occurred_at AT TIME ZONE 'UTC')::date AS jour,
       count(*) AS resolutions, count(DISTINCT task_id) AS taches_distinctes
FROM task_events
WHERE kind = 'completed'
GROUP BY workspace_id, jour
ORDER BY jour;
```

Une tâche terminée deux fois après réouverture produit deux résolutions. Pour un délai par cycle, associer chaque résolution à la création ou réouverture précédente de la tâche ; pour un jour local, convertir explicitement vers le fuseau choisi. Les index couvrent la chronologie par tâche, les résolutions par espace et les filtres usuels. Aucun tableau statistique n'est livré à cette étape.
