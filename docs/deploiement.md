# Déploiement

## Principe

Life est publié sur un VPS Hostinger déjà équipé de Docker et Caddy. La livraison utilise un projet Compose dédié `life`, sur le réseau externe `multisite_proxy`. Aucun port applicatif supplémentaire n'est ouvert sur l'hôte.

Le script de livraison construit l'image à partir d'un commit Git propre, démarre le service et conserve la référence de l'image précédente. DNS et Caddy sont configurés une première fois, puis les livraisons courantes ne modifient que Life.

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

## 2. Démarrer Life

```bash
./scripts/deploy.sh
```

Le script associe le SHA complet du commit à `local/life:<SHA>`, construit l'image, puis met à jour le service `web` du projet Compose `life`. Il conserve l'état local dans :

```text
.deployment/current-image
.deployment/previous-image
```

Le script attend que le service devienne sain, avec un délai maximal de 90 secondes. En cas d’échec, il affiche les journaux et tente de remettre l’image précédente en service lorsqu’une autre version était déjà active. Un verrou local empêche deux livraisons simultanées. Les références sont enregistrées seulement après réussite.

L'image précédente doit rester disponible sur le serveur pour un retour arrière. Éviter un nettoyage global des images avant la fin de la période d'observation.

Le service utilise le port interne `8000` et l'alias réseau `life-web`. Son processus s'exécute sans privilèges administrateur et dispose d'une sonde de santé. Consulter le service sans dépendre de son nom de conteneur généré :

```bash
docker ps --filter label=com.docker.compose.project=life
```

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

Contrôler dans un navigateur l'accueil, le lien Documentation, une page documentaire interne, la recherche et les ressources locales. Vérifier aussi que les sites déjà servis par Caddy répondent comme avant la modification du proxy.

## Livraisons suivantes

1. Préparer et tester le nouveau commit.
2. Lancer `./scripts/deploy.sh` depuis le dossier propre sur le VPS.
3. Exécuter le smoke test public et consulter les journaux.
4. Garder l'image précédente le temps de valider la livraison.

Les paramètres DNS et le bloc Caddy restent stables tant que le domaine, le réseau et l'alias ne changent pas. GitHub Actions vérifie les commits ; il ne déploie pas automatiquement.

## Retour à la version précédente

```bash
./scripts/deploy.sh --rollback
./scripts/smoke-test.sh https://life.thibault-leveau.com
```

Le retour arrière utilise la référence enregistrée dans `.deployment/previous-image`. Il ne reconstruit pas l'image et ne modifie ni Git, ni le DNS, ni Caddy. Il nécessite qu'une livraison précédente ait été enregistrée et que l'image existe toujours localement. Il conserve aussi le fichier `compose.yaml` courant : si une livraison change sa configuration de manière incompatible, restaurer la configuration correspondante depuis Git avant de revenir à l'ancienne image.

S'il n'existe aucune version précédente, corriger la version courante et publier un nouveau commit. Ne pas choisir au hasard une image non identifiée. Pour un incident survenu immédiatement après une modification de Caddy, restaurer aussi la sauvegarde du proxy, valider, puis recharger.
