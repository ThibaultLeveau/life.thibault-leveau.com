# LifeOS

LifeOS réunit des applications personnelles dans une bibliothèque. Activez celles qui vous sont utiles : l’accueil affiche vos applications activées, avec une connexion et un thème communs. La désactivation conserve les données et se révoque à tout moment. [Guide de la bibliothèque](docs/applications.md).

Un espace personnel pour organiser ses tâches : espaces et sous-espaces, sections, listes à cocher et kanban en glisser-déposer, avec thèmes clair et sombre. Une vue **À venir** réunit les échéances de tous les espaces, avec périodes configurables et dates en langage humain. Les sections forment les listes et les **lignes** du tableau ; les statuts deviennent ses colonnes.

Les titres reconnaissent les dates et récurrences françaises pendant la saisie : « Lire demain », « Courir tous les lundis ». Le planificateur propose un calendrier, des récurrences personnalisées avec aperçu, des exceptions et une fin de série. Chaque résolution conserve son historique et prépare la prochaine occurrence.

Les raccourcis se composent : « tous les mercredis toutes les trois semaines », « les 1er et 21 de chaque mois » ou « un jour sur deux pour cinq fois sauf demain ». Les nombres peuvent s’écrire en lettres. L’aperçu affiche les prochaines dates ; une composition incomplète ou contradictoire est expliquée avant l’enregistrement.

**[Ouvrir Life](https://life.thibault-leveau.com/)** · **[Documentation](https://life.thibault-leveau.com/documentation/)** · **[Référence API](https://life.thibault-leveau.com/api/docs)**

## Architecture

FastAPI / Python 3.13 sert React / TypeScript, l'API et MkDocs depuis une image Docker commune. PostgreSQL 17 conserve les données privées et l'historique des résolutions. SQLAlchemy et Alembic gèrent les transactions et les migrations. Le compte personnel utilise un mot de passe Argon2 et une session sécurisée. Le service web rejoint le Caddy existant ; PostgreSQL reste sur un réseau privé.

| Dossier | Responsabilité |
| --- | --- |
| `backend/src/life_app/core/` | Configuration, connexions et journaux |
| `backend/src/life_app/apps/<id>/` | Manifeste, routes, modèles, contrats et services de chaque application |
| `backend/src/life_app/platform/` | Connexion, bibliothèque et activations personnelles |
| `backend/src/life_app/api/` | API versionnée et sondes |
| `backend/src/life_app/migrations/` | Migrations versionnées incluses dans l'image |
| `frontend/src/apps/<id>/` | Manifeste, page, types, API, composants et styles de chaque application |
| `frontend/src/platform/`, `frontend/src/shared/` | Session, API/CSRF, bibliothèque, composants et styles communs |
| `frontend/src/app/`, `frontend/src/pages/` | Shell, accueil et bibliothèque |
| `backend/tests/`, `frontend/tests/` | Tests HTTP/PostgreSQL et parcours navigateur |
| `docs/` | Guides utilisateur, architecture, API et exploitation |
| `infrastructure/`, `scripts/` | Intégration Caddy/PostgreSQL, publication et sauvegardes |

Voir [l'architecture](docs/architecture.md), l'[ADR des applications](docs/decisions/003-applications-lifeos.md) et le [guide utilisateur](docs/taches.md).

## Démarrage

Prérequis : Git, uv, Python 3.13, Node.js 24/npm et Docker avec Compose v2 (ou un PostgreSQL 17 local configuré).

```bash
make install
cp .env.example .env
make dev-db
make migrate
uv run life create-user thibault
```

La commande demande un mot de passe de 12 caractères minimum. Aucun compte prédéfini n'est livré. Dans trois terminaux :

```bash
make dev-backend   # http://127.0.0.1:8100/api/docs
make dev-frontend  # http://localhost:5173/tasks
make dev-docs      # http://127.0.0.1:8101/documentation/
```

Utiliser l'origine `http://localhost:5173` configurée dans `.env` pour les contrôles CSRF. Vite transmet `/api` au backend et `/documentation` à MkDocs. Les identifiants PostgreSQL de l'exemple servent uniquement au développement.

## Vérifier

```bash
make check        # Ruff, format Python, TypeScript et syntaxe shell
make test         # tests Python/HTTP sur PostgreSQL isolé
make build        # frontend et documentation en mode strict
make docker-build
(cd frontend && npx playwright install --with-deps chromium)
make test-container # image, navigateur et restauration d'une sauvegarde isolée
```

`make test` démarre puis supprime son PostgreSQL de test. Un serveur existant peut être fourni via `LIFE_TEST_DATABASE_URL` : les tests y créent et suppriment uniquement leur schéma aléatoire. Les dépendances sont verrouillées dans `uv.lock` et `frontend/package-lock.json`. La CI exécute ces validations sans déploiement automatique.

## Exploitation

La première activation nécessite les secrets PostgreSQL, la migration et la création du compte. Suivre le [déploiement](docs/deploiement.md), puis les [sauvegardes et restaurations](docs/sauvegardes.md). Après chaque changement fusionné, y compris documentaire, l'agent déploie le dernier `main` validé sur le VPS et vérifie la publication. La fusion GitHub ne publie pas elle-même le site.

Toutes les opérations de l'interface sont accessibles par [API](docs/api.md). L'historique est prêt pour les futures statistiques ; les tableaux de bord statistiques, le sport et les objectifs restent à développer. Les tâches, sections et espaces sont archivables, sans suppression définitive dans cette version.

Les trois points et le clic droit ouvrent les actions de tâche : modifier, dupliquer et supprimer (avec restauration dans les archives). Sélectionner plusieurs tâches par rectangle souris ou appui long mobile permet de les replanifier, déplacer ou supprimer ensemble. La navigation et les commandes s’adaptent aux petits écrans ; voir le [guide des tâches](docs/taches.md#selectionner-plusieurs-taches).
