# Démarrage

## Installer

Prérequis : Git, [uv](https://docs.astral.sh/uv/getting-started/installation/), Python 3.13, Node.js 24/npm, Make et Bash. Docker Engine avec Compose v2 fournit PostgreSQL en local et permet les tests du conteneur. Sous Windows, utiliser WSL.

```bash
git clone https://github.com/ThibaultLeveau/life.thibault-leveau.com.git
cd life.thibault-leveau.com
make install
cp .env.example .env
make dev-db
make migrate
uv run life create-user thibault
```

`make install` installe les versions verrouillées Python, documentation et frontend. `make dev-db` utilise le projet Compose séparé `life-development`, un volume persistant et le port local `8102`. Le mot de passe PostgreSQL de l'exemple est réservé au développement. La commande de création du compte demande et confirme un mot de passe de 12 à 1024 caractères.

Si PostgreSQL est déjà disponible, configurer `LIFE_DATABASE_URL` puis exécuter la migration ; Docker n'est alors pas nécessaire au développement. Ne jamais pointer l'environnement de développement ou les tests vers la base de production.

## Démarrer

Dans trois terminaux à la racine du dépôt :

```bash
make dev-backend
make dev-frontend
make dev-docs
```

| Adresse | Usage |
| --- | --- |
| `http://localhost:5173/tasks` | Interface avec rechargement à chaud |
| `http://127.0.0.1:8100/api/docs` | OpenAPI interactif |
| `http://127.0.0.1:8101/documentation/` | Documentation en cours d'édition |

Vite conserve une seule origine : `/api` est transmis à FastAPI et `/documentation` à MkDocs. Ouvrir **localhost:5173**, conformément à `LIFE_PUBLIC_BASE_URL`. Pour utiliser une autre origine, ajuster cette variable puis redémarrer FastAPI ; sinon les écritures sont refusées avec 403.

Sans compilation, les routes statiques `/` et `/tasks` du backend peuvent renvoyer 503 ; utiliser Vite ou lancer `make build`. L'API et sa sonde de disponibilité fonctionnent indépendamment des fichiers frontend.

```bash
curl --fail http://127.0.0.1:8100/api/v1/health/ready
```

## Compte et données locales

```bash
uv run life reset-password thibault
```

Le changement de mot de passe révoque toutes les sessions du compte. Il n'y a pas d'inscription publique. Créer les données depuis l'interface ou les [exemples API](api.md), sans données de démonstration imposées au premier lancement.

```bash
docker compose -f compose.dev.yaml stop db
```

Cette commande conserve le volume. `down --volumes` efface les données de développement ; l'utiliser seulement pour repartir volontairement d'une base vide, puis relancer migrations et création du compte.

## Valider

Suivre les [tests](tests.md) avant une PR. Les commandes de publication et les secrets de production sont distincts, décrits dans [Déploiement](deploiement.md).
