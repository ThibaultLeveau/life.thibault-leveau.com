# Déploiement

## Principe

Le déploiement sur le VPS termine chaque changement, y compris documentaire ou portant sur `AGENTS.md`. Après la revue, la réussite de la CI et la fusion, l'agent publie le dernier `main` validé sans attendre une nouvelle demande. Il vérifie la version exécutée et les routes publiques, puis consigne les résultats dans l'issue. Un blocage de production doit être signalé explicitement ; une fusion seule ne termine pas la livraison.

Life est publié sur un VPS Hostinger déjà équipé de Docker et Caddy. La livraison utilise un projet Compose dédié `life`, sur le réseau externe `multisite_proxy`. Aucun port applicatif supplémentaire n'est ouvert sur l'hôte.

Le script construit l'image depuis un commit propre, démarre PostgreSQL, sauvegarde, migre explicitement puis démarre le service web. Il conserve la référence de l'image précédente ; revenir à cette image ne restaure pas les données. DNS et Caddy sont configurés une première fois, puis les livraisons courantes ne modifient que Life.

## Prérequis sur le serveur

- Accès au dépôt et au dossier de travail.
- Docker Engine avec Compose v2 et droits pour lancer les commandes Docker.
- Réseau externe `multisite_proxy` existant et accessible au Caddy installé.
- Configuration Caddy lisible et rechargeable par l'opérateur.
- Accès à la zone DNS `thibault-leveau.com` via Hostinger pour la première publication.

```bash
docker version
docker compose version
docker network inspect multisite_proxy
git remote -v
git status --short
```

Ne pas recréer un réseau portant le même nom sans comprendre son utilisation. Caddy doit joindre le même réseau Docker que le service Life.

## 1. Préparer la version

Récupérer le commit à publier, installer ses dépendances et exécuter les contrôles :

```bash
make install
make check
make test
make build
git status --short
git rev-parse HEAD
```

Le répertoire de travail doit être propre. Les fichiers non suivis faisant partie de l'application doivent être ajoutés et commités avant la livraison. Les fichiers ignorés de développement ou d'exploitation ne font pas partie du commit.

## 2. Configurer et démarrer Life

À la première activation des tâches :

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Remplacer les marqueurs par deux secrets PostgreSQL aléatoires distincts. Le mot de passe applicatif doit être identique dans `LIFE_POSTGRES_PASSWORD` et l'URL `LIFE_DATABASE_URL`. Le rôle applicatif est `life`, l'hôte `db`, la base `life`. Le mot de passe administrateur ne doit pas être utilisé par l'application. Voir [Configuration](configuration.md). Aucun secret ne doit être commité.

```bash
./scripts/deploy.sh
```

Sous un verrou local, le script :

1. Construit `local/life:<SHA complet>` depuis le répertoire propre.
2. Démarre le PostgreSQL privé et attend sa disponibilité (120 secondes maximum).
3. Crée un dump protégé dans `backups/`, même lors de la première installation.
4. Exécute `life migrate` avec la nouvelle image, dans un conteneur ponctuel.
5. Recrée le service web et attend sa sonde `/api/v1/health/ready` (90 secondes maximum).
6. Enregistre `.deployment/current-image` et, si applicable, `.deployment/previous-image` après réussite.

En cas d'échec, il s'arrête, affiche les journaux concernés et conserve les données et sauvegardes. Il ne rétrograde pas automatiquement la base ni ne relance aveuglément une image ancienne après migration. Diagnostiquer puis appliquer la [procédure de récupération](sauvegardes.md). Les migrations futures doivent documenter si l'ancienne application peut continuer à écrire pendant leur exécution ; prévoir une fenêtre d'arrêt pour un changement incompatible.

Créer ensuite le compte personnel, sans mot de passe dans la ligne de commande :

```bash
export LIFE_IMAGE=$(cat .deployment/current-image)
docker compose --env-file .env.production exec web life create-user thibault
```

Le CLI demande un mot de passe d'au moins 12 caractères et sa confirmation. Aucun compte par défaut n'est créé par la migration. Vérifier la connexion et un cycle création/résolution/réouverture sur `/tasks`.

Le volume `postgres_data` persiste indépendamment de l'image. PostgreSQL n'expose aucun port hôte ; le service web utilise l'alias `life-web` sur le réseau du proxy. Ne jamais employer `down --volumes` pour une livraison ou un retour arrière.

```bash
docker compose --env-file .env.production ps
```

Conserver l'image précédente et les sauvegardes nécessaires. La CI valide l'image mais ne déploie pas le site. La fusion de la PR n'exécute aucune de ces étapes de production.

## 3. Intégrer Caddy

Le fichier `infrastructure/caddy/life.caddy` contient le bloc à intégrer à la configuration existante :

```caddyfile
life.thibault-leveau.com {
    import common
    reverse_proxy life-web:8000
}
```

Le snippet `common` appartient au Caddy existant. Vérifier sa présence et son rôle avant d'utiliser cet import. Ne pas remplacer la configuration complète du proxy par ce seul bloc.

Avant la modification, sauvegarder le fichier actif avec son horodatage. Ajouter le bloc Life, valider la configuration complète, puis recharger Caddy sans arrêter les autres sites. Dans un déploiement Caddy conteneurisé, les commandes prennent la forme suivante ; remplacer les valeurs entre chevrons par celles du serveur :

```bash
docker exec <conteneur-caddy> caddy validate   --config <chemin-Caddyfile-dans-le-conteneur> --adapter caddyfile

docker exec <conteneur-caddy> caddy reload   --config <chemin-Caddyfile-dans-le-conteneur> --adapter caddyfile
```

Une validation réussie vérifie la configuration, mais pas l'accessibilité de l'amont. Vérifier également que Caddy résout `life-web` et reçoit une réponse sur le port `8000`.

## 4. Déclarer le DNS chez Hostinger

Relire la zone DNS courante et le dernier instantané disponible avant de faire une modification. Rechercher les enregistrements `A`, `AAAA` et `CNAME` qui concernent déjà `life`, afin d'éviter un conflit.

Créer ou ajuster uniquement l'enregistrement nécessaire :

| Type | Nom | Cible | TTL |
| --- | --- | --- | --- |
| A | `life` | `168.231.82.6` | 300 secondes |

Préserver les autres enregistrements, notamment les MX, TXT et les entrées de vérification. Il n'est pas nécessaire de changer les serveurs de noms ni d'acheter un nouvel hébergement.

Un enregistrement AAAA existant et incohérent peut orienter les clients IPv6 vers un autre serveur. Le vérifier explicitement ; ne pas ajouter d'IPv6 sans avoir validé l'adresse et l'accessibilité du VPS.

## 5. Vérifier HTTPS et la publication

Caddy gère le certificat pour le domaine. La résolution DNS et l'accès public aux ports HTTP/HTTPS doivent fonctionner pour la validation du domaine.

```bash
dig +short A life.thibault-leveau.com
dig +short AAAA life.thibault-leveau.com
curl --head http://life.thibault-leveau.com/
curl --head https://life.thibault-leveau.com/
./scripts/smoke-test.sh https://life.thibault-leveau.com
```

Si `dig` n'est pas installé, consulter la zone et utiliser un résolveur DNS disponible sur le poste. Une mise à jour DNS peut mettre du temps à être vue selon les caches déjà présents ; le TTL de 300 secondes ne force pas l'expiration des anciennes réponses.

Contrôler dans un navigateur l'accueil, la connexion aux tâches, les deux vues, le thème, l'historique, la documentation et ses ressources locales. Vérifier aussi que les sites déjà servis par Caddy répondent comme avant la modification du proxy.

## Livraisons suivantes

Pour la livraison des récurrences, appliquer la migration `0004_recurrence` incluse dans l’image. Elle préserve les tâches et historiques existants ; le retour à une image antérieure exige un schéma compatible. Voir les [contraintes de retour arrière](sauvegardes.md#migration-0004-recurrences). Vérifier les routes authentifiées `/api/v1/scheduling/parse` et `/preview`, ainsi que le calendrier et la saisie naturelle sur le frontend publié.

L’extension de la grammaire française conserve la révision `0004_recurrence` : aucune migration ni variable supplémentaire. Suivre la même publication avec sauvegarde. Vérifier en HTTPS une composition avec nombres en lettres dans le titre et le planificateur, ses prochaines dates et un diagnostic de saisie incomplète, sur un compte de recette isolé. Vérifier aussi que les tâches et événements antérieurs restent inchangés.

1. Préparer et tester le nouveau commit, faire la revue, attendre la CI et fusionner la PR ; revenir sur `main` à jour et propre.
2. Lancer `./scripts/deploy.sh` depuis le dossier propre sur le VPS.
3. Exécuter le smoke test public et consulter les journaux.
4. Garder l'image précédente le temps de valider la livraison.
5. Vérifier que l'image exécutée correspond au commit publié, contrôler les parcours affectés et consigner les résultats dans l'issue.

Les paramètres DNS et le bloc Caddy restent stables tant que le domaine, le réseau et l'alias ne changent pas. GitHub Actions vérifie les commits ; il ne déploie pas automatiquement.

## Retour à la version précédente

```bash
./scripts/deploy.sh --rollback
./scripts/smoke-test.sh https://life.thibault-leveau.com
```

Le retour arrière utilise `.deployment/previous-image` sans reconstruire. L'image doit être disponible et reconnaître exactement la révision Alembic actuelle ; le script teste cette compatibilité avant de la démarrer. Il ne modifie ni données, ni Git, ni DNS, ni Caddy.

Si le schéma a changé, le script refuse de prétendre qu'un simple changement d'image suffit. Suivre [Sauvegardes et restauration](sauvegardes.md) pour choisir une correction en avant ou restaurer un dump puis une image compatible. Le socle antérieur à PostgreSQL ne possède pas la sonde de compatibilité : son retour exige de reprendre sa configuration documentée, en conservant la sauvegarde et le volume actuel.

La configuration Compose utilisée reste celle du checkout courant. Si elle a changé de façon incompatible, préparer un checkout de la version cible et examiner ses différences avant toute opération. Ne pas supprimer des volumes ou modifier les autres services du VPS pour tenter un retour arrière.

La livraison des menus et sélections multiples conserve `0004_recurrence`, les variables et les services existants. La sauvegarde de publication habituelle reste requise. Vérifier sur un compte de recette isolé les routes authentifiées `POST /tasks/{id}/duplicate` et `POST /tasks/bulk`, le menu des trois points/clic droit, le rectangle souris et l’appui long mobile. La suppression utilise les archives existantes ; vérifier leur restauration et la conservation des historiques. L’image précédente reste compatible avec le même schéma.

## Livraison de la bibliothèque LifeOS

Appliquer `0005_applications` par le script de publication habituel, après sauvegarde. Le code est réorganisé en applications ; les routes historiques et tables métier sont conservées. Les activations sont une nouvelle table ; l’image antérieure ne reconnaît pas la révision et ignore le contrôle d’activation. Voir les [contraintes de récupération](sauvegardes.md#migration-0005-applications).

Après publication, comparer le SHA de l’image exécutée avec `main`, vérifier les deux sondes, `/`, `/applications`, `/tasks`, OpenAPI et documentation en HTTPS. Sur un compte de recette isolé, contrôler connexion commune, accueil actif, désactivation, accueil vide, refus API/direct, réactivation avec données/historique retrouvés, thème et mobile. Vérifier que les données personnelles existantes n’ont pas changé. Consigner commit, sauvegarde et résultats dans l’issue. La fusion GitHub seule ne termine pas la livraison.

### Livraison Sport

Appliquer `0006_sport` via le script habituel, après sauvegarde. La migration est additive ; aucun secret ni service supplémentaire. Vérifier `/sport`, `/documentation/sport/`, `/documentation/sport-api/`, OpenAPI et les sondes. Sport apparaît désactivée par défaut dans la bibliothèque. Sur un compte de recette isolé : activer, rechercher le catalogue, créer un programme, valider une série avec repos, recharger, terminer, relever une mensuration, consulter score/statistiques, désactiver/réactiver et vérifier la conservation. Comparer l’image réellement exécutée au SHA fusionné et consigner les résultats dans l’issue.

### Pages de programmes Sport

Le renommage en programmes et les pages de création/modification conservent `0006_sport`, les routes API et les tables. Publier avec la sauvegarde habituelle ; aucune migration nouvelle ni variable supplémentaire. Vérifier sur mobile et ordinateur `/sport?tab=workouts&program=new`, la création, la modification via `program=<uuid>`, le retour, les onglets, les erreurs et la conservation des programmes/entraînements existants. L’image précédente reste compatible avec les données.

### Saisie directe et reprise des séries Sport

Publier avec la sauvegarde habituelle ; aucun secret, service ni migration SQL supplémentaire (`0006_sport`). Les nouvelles propositions sont conservées dans les instantanés JSONB : respecter la [compatibilité de retour arrière](sauvegardes.md#propositions-de-series-sport), qui ne se déduit pas de la seule révision Alembic.

Sur un compte de recette isolé, saisir deux séries de charges/répétitions différentes directement, vérifier correction et annulation, défilement avec compteur fixe, puis terminer et relancer le programme. Vérifier les valeurs proposées et leur conservation après rechargement, avec aucune série déjà validée. Contrôler le petit écran, les thèmes, le clavier, l’accès aux dernières commandes et les erreurs/conflits. Comparer SHA exécuté, sondes, `/sport`, OpenAPI et documentation en HTTPS ; consigner sauvegarde et résultats dans l’issue.

### Branding HYROX Sport

Publier avec la sauvegarde habituelle puis la migration additive `0007_hyrox`. Aucun service ou secret supplémentaire ; consulter les [contraintes de retour arrière](sauvegardes.md#migration-0007-hyrox). Les programmes et séances existants reçoivent une date nulle, sans réécriture des données.

Sur le compte de recette isolé, créer un programme contenant « Hyrox », choisir la date, ajouter un exercice, enregistrer et démarrer une séance. Vérifier logo et compteur dans la liste, l’éditeur/catalogue et la séance, les champs en mobile et thèmes clair/sombre, la persistance après rechargement et l’indépendance de la date de séance après modification du programme. Vérifier le SHA de l’image exécutée, les sondes et les routes HTTPS Sport, OpenAPI et documentation ; consigner sauvegarde, révision et résultats dans l’issue.

## Livraison français/anglais

Publier le `main` validé avec la procédure habituelle : sauvegarde, migration additive `0008_locale`, nouvelle image et vérification du SHA réellement exécuté. Aucune nouvelle variable, secret, base ou service. Les comptes existants restent en français et leurs contenus ne sont pas transformés. Le downgrade refuse la perte des préférences anglaises ; voir [sauvegarde et compatibilité](sauvegardes.md#migration-0008-langue-du-compte).

Sur le compte synthétique isolé, vérifier le sélecteur Langue/Language, sa persistance et l’indépendance du thème, Tâches et Sport, les noms fournis traduits et les noms personnels conservés. Contrôler aussi `/documentation/en/`, `/documentation/en/taches/` et `/documentation/en/sport/`, ainsi que les sondes et routes publiques habituelles. Consigner résultats et SHA dans l’issue.

## Livraison Suivi et intégrations

Publier le `main` validé par le script habituel, avec sauvegarde préalable et migration additive `0009_tracking`. Aucun service, secret, variable ou changement Caddy/DNS supplémentaire. Voir [compatibilité et restauration](sauvegardes.md#migration-0009-suivi).

Vérifier le SHA réellement exécuté, les sondes, `/tracking`, les guides FR/EN, l’API et le catalogue d’intégrations en HTTPS. Sur un compte de recette isolé : activation, suivi quotidien avec 0/Non, saisie et correction, score 0/10 puis 10/10, filtre Tâches/Sport, instantané préservé quand la source est désactivée, calendrier mobile/ordinateur, archive/restauration et désactivation/réactivation. Vérifier la navigation commune dans Sport et Suivi. Consigner sauvegarde, migration, SHA et résultats dans l’issue. Ne pas utiliser les données personnelles pour les essais.

### Fin de séance Sport incomplète

Publier avec la sauvegarde habituelle, sans nouvelle migration SQL ni variable (révision `0008_locale`). Les résultats JSONB à zéro et le marqueur `skipped` imposent de respecter la [compatibilité de retour arrière](sauvegardes.md#fin-de-seance-sport-incomplete).

Sur un compte synthétique isolé, démarrer plusieurs séries, en valider une puis terminer. Vérifier la confirmation FR/EN, le maintien des saisies en cours, les séries restantes à zéro dans l’historique, les dates préservées, le repos arrêté et le compteur de séries réellement effectuées. Recharger puis relancer le programme : les zéros automatiques ne doivent pas remplacer les derniers résultats proposés. Terminer également une séance sans série validée et contrôler l’absence d’erreur de score, en mobile à 320 px et au clavier. Contrôler le SHA exécuté, les sondes, `/sport`, OpenAPI et les guides français/anglais en HTTPS, puis consigner sauvegarde et résultats dans l’issue.

## Livraison de la progression

Après tests, auto-revue et CI sur le dernier commit, fusionner puis publier le `main` validé avec `./scripts/deploy.sh`. La sauvegarde précède la migration additive `0010_progression`. Aucun service, secret ou changement DNS/Caddy. Le nouveau code commence immédiatement à attribuer les premières confirmations ; les points historiques nécessitent une reprise explicite ciblée.

Quand la nouvelle image est saine et que l’ancien processus web est arrêté, préparer la reprise du **compte nommé** concerné. Utiliser l’image réellement publiée et la configuration existante ; les commandes ci-dessous ne sont pas ajoutées automatiquement au script de déploiement :

```bash
export LIFE_IMAGE=$(cat .deployment/current-image)
docker compose --env-file .env.production run --rm --no-deps web \
  life backfill-progression thibault --dry-run
# Après examen du périmètre et de l’aperçu, reprendre ce compte uniquement.
docker compose --env-file .env.production run --rm --no-deps web \
  life backfill-progression thibault
```

Adapter le nom à un compte explicitement concerné ; ne pas effectuer de reprise automatique de tous les utilisateurs. L’aperçu affiche seulement les nombres d’activités et leurs XP de base par application. Les bonus de quêtes sont évalués à l’écriture. Chaque compte est verrouillé pendant sa transaction ; les actions simultanées attendent, puis retrouvent des clés déjà dédupliquées. Un échec annule toute sa reprise, et une relance après succès ne duplique rien. Consigner le compte, l’aperçu agrégé et le résultat, sans données métier privées.

Vérifier le SHA réellement exécuté, les sondes, `/tasks`, `/sport`, `/tracking`, OpenAPI, guides FR/EN et API de progression en HTTPS. Sur un compte synthétique isolé : confirmation et réouverture sans double gain, séance avec série puis annulation sans gain, correction de suivi, 60 quêtes par application, niveau/titre/série en topbar, quêtes proches, filtres et journal, week-ends/vacances, clavier/Échap, mobile 320 px et thèmes/langues. Vérifier la conservation après désactivation/réactivation et l’indépendance de Tâches/Sport vis-à-vis de Suivi. Consigner sauvegarde, migration, SHA et résultats dans l’issue. Voir les [limites de retour arrière](sauvegardes.md#migration-0010-progression).

## Livraison Objectifs OKR

Après validations, revue, CI et fusion, publier le `main` propre avec `./scripts/deploy.sh`. La sauvegarde précède la migration additive `0011_okr`. Aucun service, secret, dépendance ou changement Caddy/DNS supplémentaire. La nouvelle application apparaît désactivée par défaut ; les fournisseurs de métriques et progression sont assemblés par le registre existant. Voir [sauvegarde et compatibilité](sauvegardes.md#migration-0011-okr).

Vérifier SHA exécuté, révision, sondes, `/okr`, `/documentation/okr/`, `/documentation/en/okr/`, `/documentation/okr-api/` et OpenAPI en HTTPS. Sur un compte synthétique isolé : activation, quatre horizons liés, plan trimestriel d’un mois, progression de résultats, kanban et ordre, clôture/réouverture sans double XP, rétrospective, source Suivi, 60 quêtes, archives/restauration, désactivation/réactivation, langues/thèmes et mobile/clavier. Consigner sauvegarde, SHA et résultats dans l’issue ; la fusion seule ne termine pas la livraison.

## Livraison des jours d’utilisation par application

Publier le `main` validé par `./scripts/deploy.sh`, avec la sauvegarde habituelle. La révision reste `0011_okr` ; aucun nouveau service, secret, dépendance ou migration SQL. Les réglages existants sont conservés. Le nouveau champ JSON demande de respecter la [compatibilité des anciennes images](sauvegardes.md#calendriers-de-progression-par-application), même sans changement de révision SQL.

Sur un compte synthétique isolé, sélectionner dimanche uniquement pour Suivi, lundi/mercredi/vendredi pour Sport et lundi–vendredi pour Tâches. Enregistrer et recharger ; vérifier la parité avec `GET /api/v1/progression/settings`, les jours résolus et la pause dans les résumés, les vacances, le rappel dans le badge, le clavier, le brouillon, les langues/thèmes et le mobile 320 px. Désactiver/réactiver une application et contrôler ses préférences et gains. Vérifier SHA réellement exécuté, sondes, routes applicatives, OpenAPI et guides FR/EN en HTTPS ; consigner sauvegarde, SHA et résultats dans l’issue sans toucher aux calendriers personnels.

## Livraison Recettes et courses

Après contrôles, revue, CI et fusion, publier le `main` propre avec `scripts/deploy.sh`. La sauvegarde précède `0012_recipes`, migration additive qui livre aussi 301 ingrédients FR/EN. Aucun service, secret, dépendance ou changement DNS/Caddy. Respecter la [compatibilité des images et restauration](sauvegardes.md#migration-0012-recettes-et-courses).

Vérifier SHA exécuté, révision, sondes, `/recipes`, guides FR/EN, API et OpenAPI en HTTPS. Sur un compte synthétique isolé : activation, recherche bilingue et ajout personnel, recette pour deux puis calcul pour six, import/cumul, achat partiel et complément, liste terminée et modèle, copie vierge, 60 quêtes et métriques Suivi, archives/restauration et désactivation/réactivation. Contrôler clavier, mobile 320 px, thèmes/langues et protection des brouillons. Consigner sauvegarde, SHA et résultats dans l’issue ; aucune donnée personnelle réelle ne sert aux essais.
