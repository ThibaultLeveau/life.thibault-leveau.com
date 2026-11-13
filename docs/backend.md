# Backend

## Point d'entrée

`life_app.main:create_app` est la factory FastAPI. Elle construit l'application, charge les paramètres validés, configure la journalisation, ajoute les routes de l'API et enregistre les fichiers statiques.

```bash
uv run uvicorn life_app.main:create_app --factory --reload --host 127.0.0.1 --port 8100
```

L'installation du package utilise l'organisation `backend/src/`. Il n'est donc pas nécessaire de modifier `PYTHONPATH` à chaque commande. Exécuter les commandes via `uv run` garantit l'utilisation de l'environnement du projet.

## Organisation

| Module | Rôle |
| --- | --- |
| `main.py` | Assembler l'application, sans logique métier |
| `core/config.py` | Charger et valider les variables `LIFE_*` |
| `core/logging.py` | Configurer le niveau et la sortie des journaux |
| `api/router.py` | Regrouper les routes versionnées |
| `api/health.py` | Fournir la sonde de santé |
| `web/static.py` | Servir les artefacts frontend et MkDocs |

Le préfixe de version est `/api/v1`. L'OpenAPI et Swagger UI ont leurs propres adresses sous `/api`, détaillées dans [la référence API](api.md).

## Configuration et démarrage

Les paramètres sont gérés par Pydantic Settings. Une valeur invalide doit provoquer un échec visible au démarrage, plutôt qu'une correction silencieuse. Les environnements acceptés sont `development`, `test` et `production`.

En développement, les artefacts statiques peuvent ne pas encore exister : l'API reste utilisable et Vite sert l'interface. Tant que l’index frontend n’est pas construit, `/` sur le backend renvoie 503. En production, les répertoires compilés font partie de l'image et doivent être présents. Les [tests](tests.md) couvrent ce contrat.

Toutes les variables documentées et leur portée sont recensées dans [Configuration](configuration.md).

## Distribution statique

Le code ne monte pas tout le répertoire de travail comme un site public. Seuls les fichiers de production nécessaires sont servis : l'index d'accueil, les ressources compilées, le favicon et le site MkDocs.

Points à conserver lors d'une modification :

- Une route JSON inconnue retourne 404.
- Un asset manquant retourne 404, pas `index.html`.
- Les chemins relatifs ne permettent pas de sortir du répertoire servi.
- Le préfixe `/documentation/` fonctionne pour les pages, les styles et l'index de recherche.
- Les URL de l'application et de l'API restent indépendantes du serveur Vite.

N'ajouter un fallback SPA que lorsqu'une vraie navigation côté client l'exige, avec une liste de routes ou une stratégie explicite qui préserve ces règles.

## Ajouter un endpoint

Créer un module sous `api/`, définir un `APIRouter`, puis l'enregistrer dans le routeur central. Utiliser un modèle Pydantic pour les entrées et sorties qui ont une structure métier. Un endpoint appelle une couche de service dès qu'il orchestre une règle métier ou un accès aux données ; il ne doit pas accumuler cette logique dans `main.py`.

Conventions :

- Verbes HTTP conformes à l'action : lecture via GET, création via POST, modification via PATCH ou PUT, suppression via DELETE.
- Noms de ressources cohérents, pluriels lorsque la route représente une collection.
- Réponses et codes d'erreur décrits dans OpenAPI.
- Pas de secret, jeton ou valeur personnelle dans les messages d'erreur et les logs.
- Une opération bloquante n'est pas rendue non bloquante par le seul mot-clé `async` ; choisir des bibliothèques adaptées avant d'introduire des entrées/sorties asynchrones.

Les modules métier futurs sont décrits dans [Faire évoluer l'application](evolution.md).

## Tests

Les tests utilisent pytest et le client HTTP de FastAPI/Starlette. Ils créent des artefacts temporaires pour vérifier le routage sans nécessiter de compilation npm pendant chaque test.

```bash
uv run pytest backend/tests
uv run ruff check backend
uv run ruff format --check backend
```

Les tests unitaires ne remplacent pas la vérification de l'image construite : celle-ci confirme que les vrais fichiers et les chemins de production sont correctement assemblés.

## Références

- [FastAPI : applications plus importantes](https://fastapi.tiangolo.com/tutorial/bigger-applications/)
- [FastAPI : déploiement avec Docker](https://fastapi.tiangolo.com/deployment/docker/)
- [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
