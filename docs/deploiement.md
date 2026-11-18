# Déploiement

## Livraison de l’assistant IA

Après validation, revue, CI et fusion, publier le `main` propre avec `scripts/deploy.sh`. La sauvegarde précède la migration additive `0015_assistant`. Configurer `LIFE_ASSISTANT_ENCRYPTION_KEYS` dans `.env.production` protégé et sauvegarder ce trousseau séparément avant de permettre l’enregistrement de tokens. Le délai `LIFE_ASSISTANT_TIMEOUT_SECONDS` vaut 180 secondes par défaut. Les dépendances HTTP/chiffrement rejoignent l’image existante ; aucun nouveau service, volume, DNS ou proxy. Vérifier les sorties HTTPS vers les trois fournisseurs et la diffusion progressive derrière Caddy.

Le compte utilisateur configure son fournisseur, modèle et token via les réglages ; ne pas inventer de token, l’inscrire dans un fichier versionné ou l’exposer dans des journaux. Sans credential réel disponible, vérifier l’interface et les erreurs de configuration, puis consigner explicitement l’absence de validation réseau réelle. Les tests avec fournisseurs simulés ne prouvent pas l’accès au compte fournisseur.

Sur un compte synthétique : vérifier accueil et historique FR/EN, enregistrement/masquage/suppression du token, mémoire sourcée puis correction/oubli/désactivation, lecture et mutation dans chacune des cinq applications, aperçu/confirmation/conflit, archivage/restauration de conversation, interruption et rechargement sans double écriture. Vérifier une désactivation et une expiration de session pendant un tour, les applications directes, thèmes, clavier, animations réduites et mobile 320 px. Tester la [restauration et rotation](sauvegardes.md#migration-0015-assistant) sur une base jetable.

Comparer le SHA de l’image réellement exécutée et la révision Alembic, contrôler sondes, `/`, `/settings`, `/applications`, routes des cinq applications, OpenAPI, `/documentation/assistant/`, `/documentation/en/assistant/` et les références API FR/EN en HTTPS. Consigner sauvegarde, SHA, révision et résultats dans l’issue #85 ; ne pas qualifier une étape non exécutée de réussie.

### Sortie HTTPS des fournisseurs

Le réseau `multisite_proxy` existant est interne : son statut `external` dans Compose indique seulement qu’il est géré ailleurs. `compose.yaml` ajoute donc le bridge non interne `egress` au seul service `web`. Compose crée `life_egress` lors du déploiement ; `database` et `multisite_proxy` restent internes, sans port hôte supplémentaire. Une sonde saine ne prouve pas cette sortie réseau.

Après chaque livraison affectant le réseau ou l’image, vérifier les réseaux puis effectuer ces GET sans authentification **depuis le web exécuté**, avec validation TLS :

```bash
export LIFE_IMAGE=$(cat .deployment/current-image)
docker network inspect --format '{{.Name}} internal={{.Internal}}' \
  life_database multisite_proxy life_egress
docker compose --env-file .env.production exec -T web python - <<'PY'
import httpx

with httpx.Client(timeout=15, follow_redirects=False, trust_env=False) as client:
    for url in (
        'https://api.openai.com/v1/models',
        'https://api.anthropic.com/v1/models',
        'https://generativelanguage.googleapis.com/v1beta/models',
    ):
        response = client.get(url)
        print(f'GET {url}: HTTP {response.status_code}')
PY
```

Attendre `internal=true` pour les deux premiers réseaux et `false` pour `life_egress`. Les réponses 401/403 sans token sont normales et attestent la résolution, la connexion et TLS, sans génération payante. Elles ne valident ni credential, ni modèle, ni quota. Si la résolution échoue dans le conteneur mais fonctionne sur l’hôte, vérifier l’attachement à `egress` ; ne pas rendre les réseaux privés publics pour contourner la panne. Les adaptateurs limitent les hôtes dans le code, sans filtrage par domaine au niveau du bridge.

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

### Unités supplémentaires des recettes

Publier le `main` validé avec `scripts/deploy.sh`, sauvegarde puis migration `0013_recipe_units`. Aucune dépendance, variable ni infrastructure supplémentaire. Les anciennes écritures g/l/u restent valides pendant la migration ; respecter la [compatibilité du retour arrière](sauvegardes.md#migration-0013-unites-des-recettes).

Vérifier SHA exécuté, sondes, `/recipes`, OpenAPI et guides FR/EN en HTTPS. Sur un compte synthétique isolé : saisir ml, mg, cuillère à café et cuillère à soupe, recharger, ajuster les portions, importer et cumuler dans une liste, cocher et copier en modèle. Vérifier les libellés FR/EN, clavier et mobile 320 px, ainsi que la séparation des unités différentes. Consigner sauvegarde, révision, SHA et résultats dans l’issue.

## Livraison ergonomie Tâches

Publier le `main` validé par `scripts/deploy.sh`, sauvegarde habituelle incluse. Aucun nouveau service, secret ou migration SQL ; respecter la [compatibilité des préférences d’agenda](sauvegardes.md#filtres-dagenda-et-actions-groupees-taches). Sur un compte synthétique isolé, vérifier recherche multi-espace avec terminées/archives, précédent/suivant, brouillons, menu sélectionné, priorité/statut/étiquettes en lot, clôture/récurrence et restauration. Vérifier le focus mobile à 320 px, les thèmes/langues, les mouvements réduits, les sondes, OpenAPI, guides FR/EN et le SHA réellement exécuté. Consigner sauvegarde, commit et résultats dans l’issue.

## Livraison documentations séparées

Publier le `main` validé avec la procédure habituelle de sauvegarde, construction, migration et publication. Aucune migration de données, variable ni service supplémentaire. Vérifier les deux accueils, les sept documentations en FR/EN, les liens de langue vers la page équivalente, les menus et recherches propres au guide, les captures locales et les liens d’aide existants des applications. Contrôler mobile/clavier, SHA réellement exécuté et sondes publiques ; consigner commit, sauvegarde et résultats dans l’issue.

## Livraison des réglages généraux

Publier le `main` validé avec `scripts/deploy.sh` et sa sauvegarde habituelle. Aucune migration SQL, dépendance, variable ou modification Caddy/DNS. Vérifier le SHA exécuté, les sondes, `/settings`, `/settings?application=sport`, les anciens liens `?tab=settings`, OpenAPI et les guides réglages FR/EN en HTTPS. Sur compte synthétique : menu du nom, chaque section et sauvegarde API, brouillons, expiration, désactivation/réactivation, langues/thèmes et mobile 320 px. Consigner sauvegarde, SHA et preuves dans l’issue #76.


## Livraison de la finition Sport

Publier le `main` validé avec `scripts/deploy.sh`, sauvegarde puis migration additive `0014_sport_ux`. Aucun service, secret ou dépendance supplémentaire. Les préférences liste/grille, le contexte explicite et les notes figées imposent les [contraintes de retour arrière](sauvegardes.md#migration-0014-finition-sport) ; une ancienne image ne reconnaît pas la nouvelle révision.

Sur un compte synthétique isolé : vérifier les vues liste/grille par format, recherche et retour, copie de programme, ajout d’exercices, saisie et reprise d’une série, repos ±15 secondes, bilan, historique, relevés et graphiques, puis les préréglages dans `/settings?application=sport`. Vérifier brouillons, conflits, langue/thème et mobile 320 px ; désactiver/réactiver Sport et contrôler la conservation. Comparer le SHA réellement exécuté, la révision, les sondes, les routes HTTPS Sport/réglages et les guides FR/EN. Consigner sauvegarde, SHA et résultats dans l’issue #74 sans utiliser les données personnelles.

## Livraison du score Sport v2

Après validations, auto-revue, CI et fusion, publier avec `scripts/deploy.sh` et sa sauvegarde habituelle. Aucune migration SQL, dépendance ni variable nouvelle (`0013_recipe_units`). Respecter la [compatibilité des images](sauvegardes.md#score-sport-v2). Sur le compte concerné, exécuter `POST /api/v1/sport/scores/backfill` après publication, noter le nombre de scores réparés et vérifier qu’une deuxième exécution renvoie zéro. Les autres comptes ne doivent pas être modifiés par cette reprise ciblée.

Sur un compte synthétique, vérifier première séance partielle, exercice entièrement omis, séance vide (0), difficulté relative charge/distance/allure, références, historique/statistiques, FR/EN, mobile 320 px et clavier. Vérifier l’API `score_details`, les références figées, les propositions suivantes et la conservation des résultats. Contrôler SHA réellement exécuté, sondes, OpenAPI, `/sport` et guides FR/EN en HTTPS ; consigner sauvegarde, reprise et résultats dans l’issue.
