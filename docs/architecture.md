# Architecture

## Vue d'ensemble

Life conserve le monorepo FastAPI / React / MkDocs. Un processus Uvicorn sert l'API, le frontend compilé et la documentation. PostgreSQL 17 est le seul service de données ajouté, conformément à l'[ADR 002](decisions/002-gestion-taches.md).

![Flux de production : navigateur, Caddy, application puis PostgreSQL privé.](assets/diagrams/production.svg)

[Source Mermaid](assets/diagrams/production.mmd)

Caddy termine TLS et transmet à `life-web:8000` sur `multisite_proxy`. Le service web rejoint aussi le réseau Compose interne `database`. PostgreSQL ne rejoint pas le réseau du proxy, ne publie aucun port hôte et conserve ses données dans `postgres_data`. Le rôle applicatif est propriétaire de sa base, sans droits d'administration du cluster.

En développement, Vite, FastAPI et MkDocs disposent de serveurs distincts ; le proxy Vite maintient une origine unique. `compose.dev.yaml` fournit un PostgreSQL local indépendant de la production.

## Responsabilités

| Dossier | Responsabilité |
| --- | --- |
| `core/` | Paramètres, journalisation, engine et sessions SQL |
| `features/auth/` | Contrats, modèles et services de connexion/autorisation |
| `features/tasks/` | Contrats, modèles, ordre, transitions et événements des tâches |
| `api/v1/` | Routes JSON, dépendances et frontières de transaction |
| `web/` | Distribution contrôlée des fichiers statiques |
| `migrations/` | Évolutions du schéma figées et versionnées |
| `frontend/src/app/` | Sélection du shell accueil ou tâches |
| `frontend/src/features/tasks/` | Composants métier, états d'interface et client HTTP |
| `frontend/src/components/layout/` | Navigation commune de l'accueil |
| `frontend/src/styles/` | Tokens et styles globaux |
| `docs/` | Documentation publique, sans données personnelles |
| `infrastructure/` | Intégration Caddy et initialisation du rôle PostgreSQL |
| `scripts/` | Tests, publication, sauvegarde et restauration explicites |

Les services métier utilisent SQLAlchemy directement : aucune couche générique de dépôt, file de messages ou microservice supplémentaire. Une session SQL est partagée par les dépendances d'une requête. Les mutations d'un propriétaire sont sérialisées et les tâches utilisent un numéro de version. Voir [Backend](backend.md) et [Données](donnees.md).

## Flux métier

1. Le navigateur ouvre une session via l'API et reçoit un cookie opaque HttpOnly.
2. Les lectures vérifient la session et le propriétaire. Les écritures vérifient aussi l'origine et le jeton CSRF.
3. Le routeur appelle le service : validation, mutation et événements dans la même transaction PostgreSQL.
4. L'interface recharge les données enregistrées. Les préférences de vue et de thème passent par la même API.

React ne conserve pas de base métier parallèle dans localStorage. Les champs en cours de saisie et l'état des dialogues restent transitoires. Les mutations de tâche exigent `expected_version` et retournent un conflit 409 si une autre écriture a changé la tâche.

## HTTP et compilation

`/` et `/tasks` sont les seules routes HTML React. Les assets sont sous `/assets/`, l'API sous `/api/v1`, Swagger sous `/api/docs` et MkDocs sous `/documentation/`. Tout chemin inconnu reste 404. Le frontend utilise des URL API relatives, sans service réseau distinct pour le rendu.

![Construction multi-étapes : frontend et documentation compilés rejoignent le runtime Python.](assets/diagrams/build.svg)

[Source Mermaid de la construction](assets/diagrams/build.mmd)

Le runtime contient les dépendances Python applicatives, le CLI, les migrations et les fichiers compilés. Node, Vite, Playwright et MkDocs ne tournent pas en production. L'utilisateur runtime n'est pas privilégié et son système de fichiers est en lecture seule.

Les verrous uv/npm sont versionnés. Les images portent le SHA complet des sources ; les tags des images de base peuvent néanmoins évoluer entre deux reconstructions. Conserver l'image publiée et sa sauvegarde de données. Une image précédente n'annule jamais une migration.

## Limites choisies

L'application reste personnelle : pas de partage d'espaces, inscription publique, SSO, synchronisation temps réel, pièces jointes, récurrences ou tableau statistique. Le modèle conserve les événements nécessaires aux statistiques futures. La recherche est une recherche SQL de sous-chaîne, et le frontend charge toutes les tâches de la vue : des volumes importants nécessiteront pagination visuelle/indexation après mesure.

L'[ADR initial](decisions/001-architecture-initiale.md) reste inchangé. Toute évolution structurante suit les règles d'accord explicite du dépôt.
