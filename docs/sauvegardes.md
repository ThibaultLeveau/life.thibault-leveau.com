# Sauvegardes, migrations et restauration

## Sauvegarder

Depuis la racine du dépôt sur le serveur, avec `.env.production` configuré et PostgreSQL démarré :

```bash
./scripts/backup.sh
```

Le script utilise `pg_dump` au format custom PostgreSQL, sans propriétaires ni ACL. Le dump est cohérent même pendant les écritures. Il est écrit dans un fichier temporaire protégé, vérifié avec `pg_restore --list`, puis renommé dans `backups/life-<date UTC>-<pid>.dump`. Les permissions sont 700 sur le dossier et 600 sur le fichier. Une erreur ne publie pas de sauvegarde partielle.

Conserver avec la sauvegarde le SHA de l'image, la révision Alembic et la date. Les secrets de `.env.production` et l'image Docker ne font pas partie du dump. Le volume n'est pas une sauvegarde ; une copie sur le même VPS ne protège pas d'une perte du serveur. Copier régulièrement les dumps vers un stockage distinct, chiffré et accessible uniquement à l'opérateur.

Le déploiement crée une sauvegarde avant chaque migration, y compris un dump vide à la première activation. Aucun calendrier ni purge automatique n'est installé. Pour l'usage courant, prévoir des sauvegardes quotidiennes et avant toute opération de données ; choisir la rétention selon la perte de données acceptable, puis vérifier les restaurations régulièrement.

## Tester une restauration sans toucher à Life

Les commandes de `make test-container` créent une base isolée `life_restored` dans un PostgreSQL jetable. Elles génèrent le SQL du dump sans propriétaires/ACL, puis restaurent avec `psql --single-transaction --set ON_ERROR_STOP=1`, comme le script d'exploitation. Elles vérifient les préférences d’agenda, les événements, la suppression des objets absents du dump, la révocation des sessions, l'annulation complète en cas d'erreur, la migration et le trigger d'immuabilité. Elles n'utilisent aucune donnée réelle.

Pour une sauvegarde réelle, préparer un PostgreSQL **séparé**, sur la même version majeure, avec un rôle `life` propriétaire d'une base vide. Restaurer une copie de confiance et vérifier comptes, espaces, tâches, dates, événements et contraintes. Ne pas afficher leurs contenus dans des journaux publics. Un simple `pg_restore --list` confirme le format, pas la restauration complète.

## Restaurer la production

Cette opération remplace les données actuelles et rend Life indisponible. Identifier le dump, son commit et sa révision avant de commencer. Les changements postérieurs à la sauvegarde seront perdus dans la base restaurée ; le script sauvegarde d'abord l'état actuel pour permettre une récupération.

```bash
./scripts/restore.sh --confirm-data-replacement backups/life-DATE-PID.dump
```

Le script prend le même verrou que le déploiement, valide le format du dump, sauvegarde la base actuelle, arrête uniquement le service web Life puis remplace tout le schéma applicatif `public` dans une transaction. Les objets ajoutés après la sauvegarde sont également retirés ; le SQL temporaire est protégé puis supprimé. Il supprime les sessions restaurées pour éviter de réactiver un ancien cookie révoqué. En cas d'échec, le processus s'arrête et Life reste arrêté ; inspecter l'erreur avant toute reprise.

Après restauration :

1. Choisir l'image compatible avec la révision restaurée ; ne pas lancer une image au hasard.
2. Si un passage à une nouvelle révision est voulu, lire sa migration puis appliquer `life migrate` explicitement.
3. Redémarrer le service web, vérifier `/api/v1/health/ready` et le smoke test public.
4. Se reconnecter, comparer quelques données et leur historique, puis consigner l'incident.

Exemple avec une image connue compatible :

```bash
export LIFE_IMAGE=local/life:SHA_COMPLET_VERIFIE
docker compose --env-file .env.production up -d --no-build --wait web
./scripts/smoke-test.sh https://life.thibault-leveau.com
```

Ne jamais utiliser `docker compose down --volumes` pour une restauration. Ne pas supprimer le volume ou le dump de secours avant d'avoir validé la reprise.

## Migrations

```bash
uv run life migrate
# En production, avec LIFE_IMAGE défini :
docker compose --env-file .env.production run --rm --no-deps web life migrate
```

Alembic applique les migrations jusqu'à `head`. Elles font partie de l'image, restent explicites et ne sont pas exécutées par chaque worker. La migration initiale crée le schéma et les protections du journal ; elle ne crée aucun compte.

La migration initiale possède un `downgrade` pour les tests, qui **supprime toutes les tables métier**. Ce n'est pas une procédure de récupération de production. Pour une future évolution, tester le changement sur une copie et documenter sa compatibilité. Privilégier la correction en avant ou la restauration d'un dump connu.

La migration `0003_agenda` crée la table de préférences d’agenda, sans modifier les tâches, les événements ou les comptes existants. Elle est additive : l’ancienne application peut continuer à écrire ses tables pendant la migration, mais sa sonde de version ne reconnaît pas la nouvelle révision ; terminer le déploiement avec la nouvelle image. Sauvegarder avant migration, comme le fait `deploy.sh`.

Son aller/retour est testé avec tâches, échéances et résolutions existantes : le downgrade retire uniquement les préférences d’agenda, puis l’upgrade rétablit les valeurs par défaut. Ce downgrade perd les réglages et n’est pas un retour arrière automatique de production ; privilégier une correction en avant ou restaurer le dump compatible. Après restauration, vérifier aussi la période personnalisée et les options d’agenda, en plus des dates et événements.

Le retour à une image précédente ne restaure aucune donnée. `deploy.sh --rollback` vérifie que l'image reconnaît exactement la révision courante ; il s'arrête si elle ne la reconnaît pas. Un retour au socle antérieur à PostgreSQL nécessite une procédure spécifique à cette ancienne version ; les données doivent rester sauvegardées et le volume conservé.

## Migration 0002 : parents des espaces

`0002` ajoute seulement la relation nullable `parent_id`, son index et ses contraintes. Les données existantes deviennent des racines ; tâches, résolutions, événements et archives sont conservés. Sauvegarder avant migration comme le fait `deploy.sh`. Aucun nouveau secret, volume ou paramètre n'est requis.

Les écritures de l'ancienne image restent compatibles pendant l'ajout (elles ne renseignent pas le parent). La DDL peut brièvement verrouiller la table. Sa sonde de disponibilité détectera toutefois la différence de révision jusqu'au démarrage de la nouvelle image : ne pas considérer cela comme une migration sans interruption garantie. Après création d'une hiérarchie, ne pas réutiliser une ancienne image qui ignore ses règles d'archive ; le rollback automatique refuse la révision inconnue.

Le downgrade `0002 → 0001`, réservé aux tests ou à une intervention préparée hors service, conserve espaces et tâches mais **supprime tous les liens parent-enfant**. Le réupgrade les laisse à la racine. Préférer une correction en avant ; pour un retour complet, restaurer la sauvegarde avec l'image compatible selon la procédure ci-dessus.

Les dumps comprennent `parent_id` et les contraintes. Le test de restauration isolée compare les couples espace/parent avant et après restauration, en plus des événements et des sessions révoquées. Sur une copie réelle, vérifier également l'arbre, les enfants archivés, la navigation et les refus de cycles/rattachements inter-comptes, sans exposer les données dans les journaux.

## Migration 0004 : récurrences

`0004_recurrence` ajoute `tasks.recurrence` (JSONB nullable), `tasks.recurrence_completed` (entier, défaut 0), deux contraintes et les types d’événements `rescheduled`/`completion_undone`. Aucun texte, date ou événement existant n’est réécrit. La migration est additive pour l’ancienne image pendant la publication, mais sa sonde détecte la nouvelle révision ; terminer avec la nouvelle image avant d’utiliser les séries. La DDL prend brièvement des verrous. Aucune nouvelle variable de configuration ni service n’est nécessaire.

Sauvegarder avant migration via `deploy.sh`. Après publication, vérifier l’analyse, l’aperçu, la création puis la résolution d’une série sur des données de recette isolées. Les données antérieures doivent garder leurs dates, statuts et historiques.

L’aller/retour est possible tant qu’aucune récurrence ni nouveau type d’événement n’existe. Le downgrade refuse explicitement de perdre ces données après utilisation. Ne pas le contourner ni supprimer des événements : privilégier une correction en avant ou restaurer un dump antérieur avec l’image compatible selon la procédure de cette page. Le rollback d’image refuse la révision inconnue.

Les dumps contiennent les définitions complètes, ancres, fuseaux, exceptions, compteurs, dates courantes et tous les événements. Le test du conteneur compare les données de récurrence avant/après restauration, en plus de l’historique immuable et des préférences. Sur une copie de sauvegarde réelle, vérifier également la prochaine date calculée et une série finie ; ne pas lancer ces essais sur les données actives.
