# Documentation technique

Life est un espace personnel destiné au suivi des tâches, du sport et des objectifs. Cette version pose le socle technique : un accueil, une navigation et une API minimale.

[Ouvrir l'application](https://life.thibault-leveau.com/){ .md-button .md-button--primary }
[Installer le projet](demarrage.md){ .md-button }

## Ce qui est livré

- Une interface React en français, adaptée au mobile, avec la marque Life, l'accueil et l'accès à cette documentation.
- Un backend FastAPI qui expose une sonde de santé et sa référence OpenAPI.
- Une image Docker réunissant l'application, ses ressources locales et la documentation compilée.
- Des dépendances verrouillées, des tests HTTP et des contrôles GitHub Actions.
- Une procédure manuelle de publication sur le VPS Hostinger, avec retour à l'image précédente.

Les tâches, le sport, les objectifs, l'authentification et la persistance ne sont pas encore implémentés. Leur ajout est décrit dans [Faire évoluer l'application](evolution.md).

## Lire selon son besoin

| Besoin | Point d'entrée |
| --- | --- |
| Lancer le projet sur sa machine | [Démarrage](demarrage.md) |
| Comprendre les composants et les flux | [Architecture](architecture.md) |
| Modifier le Python ou le React | [Backend](backend.md), [Frontend](frontend.md) |
| Régler les variables ou consulter les routes | [Configuration](configuration.md), [API](api.md) |
| Vérifier une modification | [Tests et qualité](tests.md) |
| Livrer une version | [Déploiement](deploiement.md) |
| Diagnostiquer une panne | [Exploitation](exploitation.md) |
| Préparer des données personnelles | [Sécurité](securite.md) |

## Repères techniques

| Élément | Choix |
| --- | --- |
| Langage serveur | Python 3.13 |
| Serveur HTTP | FastAPI / Uvicorn |
| Interface | React / TypeScript / Vite |
| Documentation | MkDocs Material |
| Dépendances | uv et npm, avec fichiers de verrouillage |
| Production | Docker Compose, Caddy, VPS Hostinger |
| Domaine | `life.thibault-leveau.com` |

Le dépôt et les fichiers de verrouillage constituent la source de vérité pour les versions exactes. Les décisions de la V1 sont conservées dans [l'ADR initial](decisions/001-architecture-initiale.md).
