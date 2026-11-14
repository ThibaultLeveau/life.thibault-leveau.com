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

Appliquer `0006_sport` via le script habituel, après sauvegarde. La migration est additive ; aucun secret ni service supplémentaire. Vérifier `/sport`, `/documentation/sport/`, `/documentation/sport-api/`, OpenAPI et les sondes. Sport apparaît désactivée par défaut dans la bibliothèque. Sur un compte de recette isolé : activer, rechercher le catalogue, créer une séance, valider une série avec repos, recharger, terminer, relever une mensuration, consulter score/statistiques, désactiver/réactiver et vérifier la conservation. Comparer l’image réellement exécutée au SHA fusionné et consigner les résultats dans l’issue.
