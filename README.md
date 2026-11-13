# Life

Le point de départ d'un espace personnel pour suivre ses tâches, son sport et ses objectifs. Cette première version propose un accueil sobre, une navigation et une documentation technique complète.

**[Ouvrir Life](https://life.thibault-leveau.com/)** · **[Documentation](https://life.thibault-leveau.com/documentation/)** · **[Référence API](https://life.thibault-leveau.com/api/docs)**

## Architecture

Python 3.13, FastAPI et Uvicorn servent une application React / TypeScript construite avec Vite, ainsi que la documentation MkDocs Material. Un seul conteneur tourne en production, derrière le Caddy du VPS Hostinger. La V1 ne stocke aucune donnée métier et n'a ni base de données ni authentification.

| Dossier | Responsabilité |
| --- | --- |
| `backend/src/life_app/` | Application FastAPI, configuration, API et fichiers statiques |
| `backend/tests/` | Tests du contrat HTTP et de la configuration |
| `frontend/` | Interface React, styles, ressources locales et compilation Vite |
| `docs/` | Documentation en français et diagrammes d'architecture |
| `infrastructure/caddy/` | Configuration du domaine dans le proxy existant |
| `scripts/` | Déploiement manuel, retour arrière et vérification HTTP |
| `.github/workflows/` | Contrôles continus, sans déploiement automatique |

Le détail des flux et des responsabilités se trouve dans [l'architecture](docs/architecture.md).

## Démarrage

Prérequis : Git, [uv](https://docs.astral.sh/uv/getting-started/installation/), Python 3.13, Node.js 24 et npm. Docker avec Compose v2 est nécessaire uniquement pour construire ou exécuter le conteneur.

```bash
git clone https://github.com/ThibaultLeveau/life.thibault-leveau.com.git
cd life.thibault-leveau.com
make install
cp .env.example .env
```

Ouvrir trois terminaux à la racine du dépôt :

```bash
make dev-backend   # http://127.0.0.1:8100/api/docs
make dev-frontend  # http://127.0.0.1:5173
make dev-docs      # http://127.0.0.1:8101/documentation/
```

Vite transmet `/api` au backend et `/documentation` à MkDocs. La configuration d'exemple suffit pour le développement ; aucun secret n'est requis.

## Vérifier et construire

```bash
make check        # Ruff et TypeScript
make test         # tests Python
make build        # frontend et documentation en mode strict
make docker-build # image de production
```

Les dépendances exactes sont verrouillées dans `uv.lock` et `frontend/package-lock.json`. La CI exécute les vérifications sur GitHub, construit l’image Docker et contrôle ses routes dans un conteneur, sans publier le site.

## Publier

Sur le VPS, depuis un commit validé et un répertoire de travail propre :

```bash
./scripts/deploy.sh
./scripts/smoke-test.sh https://life.thibault-leveau.com
```

Le script utilise le réseau Docker externe `multisite_proxy`, l'alias `life-web` et le port interne `8000`. Il ne modifie pas le DNS ni la configuration Caddy. Leur mise en place initiale, les vérifications HTTPS et le retour arrière sont décrits dans le [guide de déploiement](docs/deploiement.md).

```bash
./scripts/deploy.sh --rollback
```

## Repères

- [Configuration et variables d'environnement](docs/configuration.md)
- [Routes et contrats HTTP](docs/api.md)
- [Tests et qualité](docs/tests.md)
- [Journaux, diagnostic et exploitation](docs/exploitation.md)
- [Sécurité et limites de la V1](docs/securite.md)
- [Ajouter les premières fonctionnalités](docs/evolution.md)

La documentation fait partie de l'image : une version de l'application est toujours publiée avec la documentation issue du même commit.
