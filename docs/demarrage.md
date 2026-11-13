# Démarrage

## Prérequis

Installer Git, [uv](https://docs.astral.sh/uv/getting-started/installation/), Node.js 24 et npm. `uv` peut télécharger Python 3.13 si cette version n'est pas déjà disponible. Docker Engine et le plugin Compose v2 sont utiles pour vérifier la production, mais ne sont pas requis pour développer l'interface ou l'API.

```bash
git --version
uv --version
node --version
npm --version
```

Les commandes ci-dessous s'exécutent à la racine du dépôt, dans un shell compatible avec les scripts Bash du projet. Sous Windows, utiliser WSL pour les commandes Make et les scripts de déploiement.

## Installer

```bash
git clone https://github.com/ThibaultLeveau/life.thibault-leveau.com.git
cd life.thibault-leveau.com
make install
cp .env.example .env
```

L'installation synchronise l'environnement Python `.venv` avec `uv.lock`, y compris les groupes de développement et de documentation, puis installe le frontend avec `npm ci`. Le fichier `.env` est local et ignoré par Git.

Ne modifier que les paramètres nécessaires. Aucun jeton ni mot de passe n'est requis pour démarrer cette V1.

## Démarrer les trois serveurs

Ouvrir trois terminaux à la racine du dépôt :

```bash
make dev-backend
```

```bash
make dev-frontend
```

```bash
make dev-docs
```

| Service | Adresse | Rôle |
| --- | --- | --- |
| Vite | `http://127.0.0.1:5173` | Interface et rechargement à chaud |
| FastAPI | `http://127.0.0.1:8100/api/docs` | API et documentation interactive |
| MkDocs | `http://127.0.0.1:8101/documentation/` | Aperçu de la documentation |

Ouvrir l'interface sur le port `5173`. Le proxy Vite conserve une seule origine dans le navigateur : les appels `/api` sont transmis au port `8100`, et `/documentation` au port `8101`. Pour ouvrir la documentation depuis la barre de navigation, garder MkDocs actif.

Le backend peut fonctionner sans artefacts frontend. Dans ce cas, sa page d'accueil n'est pas disponible ; l'interface de développement est servie par Vite.

## Construire et vérifier

```bash
make check
make test
make build
```

La construction produit `frontend/dist/` et `site/`. Ces répertoires sont générés et ne doivent pas être commités.

Une fois ces artefacts présents, démarrer le backend permet aussi de consulter le site compilé sur `http://127.0.0.1:8100/` et sa documentation sous `/documentation/`. Cette vérification est utile pour détecter les erreurs masquées par le serveur de développement Vite.

## Commandes utiles

| Commande | Effet |
| --- | --- |
| `make install` | Installer les dépendances verrouillées |
| `make dev-backend` | Démarrer Uvicorn avec rechargement sur `8100` |
| `make dev-frontend` | Démarrer Vite sur `5173` |
| `make dev-docs` | Démarrer MkDocs sur `8101` |
| `make check` | Vérifier le code Python et TypeScript |
| `make test` | Exécuter les tests backend |
| `make build` | Compiler l'interface et la documentation |
| `make docs` | Construire seulement la documentation en mode strict |
| `make docker-build` | Construire l'image Docker |
| `make deploy` | Publier la version courante sur le VPS configuré |
| `make smoke` | Vérifier les routes du site publié |

## Problèmes fréquents

**Le port est occupé.** Arrêter le serveur de développement précédent. Si un port doit changer, ajuster également sa cible dans `frontend/vite.config.ts` ; ne modifier pas les services déjà en production pour libérer un port de développement.

**La documentation ne s'ouvre pas depuis Vite.** Vérifier que `make dev-docs` est actif et que l'URL contient `/documentation/`. Le préfixe doit être conservé dans le proxy.

**Une dépendance paraît manquer.** Relancer `make install` après avoir récupéré une modification des fichiers de verrouillage. Éviter les installations manuelles dans `.venv` qui ne sont pas décrites par `pyproject.toml`.

**Le build strict échoue.** Lire le premier avertissement MkDocs : un fichier absent de la navigation ou un lien local incorrect doit être corrigé dans les sources. Ne pas contourner le contrôle en supprimant `--strict`.
