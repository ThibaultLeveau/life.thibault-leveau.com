# Tests et qualité

## Contrôles obligatoires

Depuis la racine :

```bash
make install
make check
make test
make build
```

`make check` exécute Ruff, le contrôle de format Python, TypeScript (interface et tests navigateur) et la syntaxe de chaque script shell. `make build` compile Vite et MkDocs en mode strict. Les dépendances exactes sont verrouillées.

## Python et PostgreSQL

`make test` démarre un PostgreSQL 17 jetable sur une adresse locale, attend sa disponibilité, exécute pytest puis supprime le conteneur et ses volumes anonymes. Avec `LIFE_TEST_DATABASE_URL`, il utilise ce serveur et crée un schéma aléatoire, supprimé à la fin. Les tests métier ne sont pas ignorés si la base manque : utiliser le script ou fournir un serveur de test. Ne pas utiliser la production.

```bash
LIFE_TEST_DATABASE_URL=postgresql+psycopg://user:password@127.0.0.1:5432/test make test
```

La suite vérifie notamment :

- Routage explicite, fichiers absents, HEAD, traversal et OpenAPI.
- Migration initiale aller/retour et comparaison du schéma aux modèles ORM.
- Création, édition atomique, ordre, filtres, pagination et préférences.
- Résolutions/réouvertures, idempotence, déplacements entre espaces et snapshots historiques.
- Archives parentes/individuelles et configuration des statuts sans fausse résolution.
- Contraintes de base, rollback après erreur et immuabilité des événements.
- Conflits de version et deux résolutions concurrentes, dont une seule est acceptée.
- Sessions, CSRF, origine, isolation des comptes, limite de connexion, expiration, cookie Secure et réinitialisation du mot de passe.
- Absence de valeurs privées dans les logs de recherche et les erreurs de validation.

Les tests de routage fabriquent de petits artefacts ; ils ne remplacent pas le contrôle de l'image réelle.

## Image, navigateur et sauvegarde

```bash
make docker-build
(cd frontend && npx playwright install --with-deps chromium)
make test-container
```

Le script crée un réseau privé, un PostgreSQL et un conteneur applicatif jetables. Il utilise l'image du SHA courant, le rôle applicatif non administrateur, les migrations empaquetées et un compte synthétique. Le port HTTP est choisi dynamiquement sur 127.0.0.1. Le runtime est en lecture seule, avec les mêmes restrictions de capacités que la production. Pour le navigateur local HTTP, seul l'environnement est réglé sur `test` ; le cookie Secure de production est vérifié dans les tests HTTP.

Le smoke test vérifie routes publiques, disponibilité de la base, absence d'accès anonyme aux tâches, bundles, recherche MkDocs et vraies 404. Playwright exerce les formulaires de configuration, le cycle complet d'une tâche, le glisser-déposer entre lignes/colonnes, l'ordre en liste, les thèmes persistants, le mobile 320/375 px, le clavier, le déplacement inter-espaces et un conflit d'édition simulé. Les couleurs calculées du thème sombre sont contrôlées sur le bundle compilé.

Enfin, le script restaure un dump dans une seconde base, compare les événements, vérifie la révocation des sessions, les objets retirés et l'annulation sur erreur, puis revérifie migrations/immutabilité. Le nettoyage retire uniquement les ressources créées par ce script, sans toucher aux projets de développement ou de production.

Pour cibler une autre image locale :

```bash
LIFE_TEST_IMAGE=local/life:ma-validation make test-container
```

Pour rejouer uniquement le navigateur sur un serveur **de test** existant :

```bash
LIFE_E2E_URL=http://127.0.0.1:8100 \
LIFE_E2E_USERNAME=compte-test LIFE_E2E_PASSWORD=mot-de-passe-synthetique make test-ui
```

Ces scénarios créent de vraies données dans le serveur choisi ; ils ne doivent pas cibler la production. Les captures et traces restent sous `frontend/test-results/`, ignoré par Git. Une trace peut contenir cookies et données : seuls les résultats synthétiques sont téléversés en CI en cas d'échec, avec rétention de 7 jours.

## CI et revue

GitHub Actions exécute les contrôles, les tests Python, les compilations, la construction de l'image puis `make test-container`. Aucune publication du site n'est déclenchée. Attendre les contrôles sur le dernier commit avant fusion, consigner la revue complète et résoudre ses constats.

Les résultats exacts de la livraison sont consignés dans l'issue et la PR. Les essais automatiques Chromium ne remplacent pas une recette sur tous les navigateurs/téléphones physiques ; vérifier les navigateurs ciblés lors des évolutions de compatibilité.
