# Configuration

## Principes

Le backend charge sa configuration via Pydantic Settings. Les variables du processus ont priorité sur le fichier `.env`. Les noms sont préfixés par `LIFE_` pour éviter les collisions. Le fichier `.env.example` décrit les valeurs de développement ; `.env` reste ignoré par Git.

Exécuter les commandes de développement depuis la racine du dépôt pour charger le fichier `.env` attendu. Les chemins d’artefacts relatifs sont résolus par rapport à la racine du projet. En production, le conteneur utilise des chemins explicites vers ses artefacts.

## Variables applicatives

| Variable | Valeur par défaut | Description |
| --- | --- | --- |
| `LIFE_ENVIRONMENT` | `development` | Environnement parmi `development`, `test`, `production` |
| `LIFE_PUBLIC_BASE_URL` | `http://localhost:8100` | Adresse publique déclarée de l'application ; valeur de production définie dans Compose |
| `LIFE_LOG_LEVEL` | `INFO` | Niveau de journalisation du backend |
| `LIFE_FRONTEND_DIR` | `frontend/dist` | Répertoire du frontend compilé |
| `LIFE_DOCUMENTATION_DIR` | `site` | Répertoire de la documentation compilée |

`LIFE_PUBLIC_BASE_URL` ne crée pas d'enregistrement DNS, ne configure pas Caddy et ne change pas le port d'écoute. Le site documentaire utilise également son URL canonique définie dans `mkdocs.yml`. En cas de changement de domaine, mettre à jour les deux configurations et reconstruire les artefacts.

Les niveaux usuels sont `DEBUG`, `INFO`, `WARNING`, `ERROR` et `CRITICAL`. Garder `INFO` en production ; limiter `DEBUG` à une investigation temporaire.

## Exemple local

```dotenv
LIFE_ENVIRONMENT=development
LIFE_PUBLIC_BASE_URL=http://localhost:5173
LIFE_LOG_LEVEL=INFO
LIFE_FRONTEND_DIR=frontend/dist
LIFE_DOCUMENTATION_DIR=site
```

Une configuration incorrecte, notamment un environnement inconnu ou une URL mal formée, doit échouer à la validation. Lire l'erreur de démarrage plutôt que désactiver la validation.

## Ports et réseau

| Usage | Écoute | Exposition |
| --- | --- | --- |
| Frontend de développement | `127.0.0.1:5173` | Machine de développement |
| Backend de développement | `127.0.0.1:8100` | Machine de développement |
| Documentation de développement | `127.0.0.1:8101` | Machine de développement |
| Backend en conteneur | `0.0.0.0:8000` | Réseau Docker uniquement |
| Caddy public | HTTP/HTTPS | Domaine public |

Le réseau Docker `multisite_proxy` est externe au projet Compose Life. L'alias `life-web` permet à Caddy de joindre le backend sans dépendre du nom généré du conteneur.

## Variables de déploiement

L'image applicative est nommée `local/life:<SHA Git complet>`. Le script de déploiement transmet sa référence à Compose, puis conserve la version courante dans `.deployment/current-image` et la précédente dans `.deployment/previous-image`.

Ces fichiers sont des métadonnées locales d'exploitation, pas des secrets ni des sources. Ils ne sont pas commités. Ne pas les remplacer manuellement pour masquer un déploiement échoué : inspecter d'abord le conteneur et ses journaux.

La variable `LIFE_IMAGE` fournit la référence d’image à Compose. Le script la définit pour chaque opération. Pour une opération courante, utiliser les scripts plutôt que reconstituer à la main leur configuration. En production, Compose fixe `LIFE_PUBLIC_BASE_URL=https://life.thibault-leveau.com`.

## Modifier une valeur

1. Modifier le fichier ou l'environnement qui fournit la valeur.
2. Redémarrer le backend en local, ou recréer le service en production via le déploiement.
3. Vérifier la sonde et le comportement concerné.
4. Mettre à jour `.env.example` et cette page si le contrat de configuration change.

Modifier une variable Python ne reconstruit pas le frontend ou MkDocs. Toute valeur intégrée à leurs fichiers lors de la compilation nécessite une nouvelle image.
