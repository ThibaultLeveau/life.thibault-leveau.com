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

L'attente vérifie l'écoute TCP sur `127.0.0.1` : le serveur temporaire d'initialisation peut répondre sur son socket Unix avant que PostgreSQL accepte les connexions des tests.

```bash
LIFE_TEST_DATABASE_URL=postgresql+psycopg://user:password@127.0.0.1:5432/test make test
```

La suite vérifie notamment :

- Routage explicite, fichiers absents, HEAD, traversal et OpenAPI.
- Migration initiale aller/retour et comparaison du schéma aux modèles ORM.
- Création, édition atomique, ordre, filtres, pagination et préférences.
- Hiérarchie des espaces, cycles et propriétaires, archives/restaurations, concurrence rattachement/rattachement et création/archivage, migration 0002 aller/retour avec données et historique conservés.
- Agenda global : bornes inclusives, retards, archives, accès par compte, pagination, année bissextile et changement d’année ; migration additive sur tâches/historique existants.
- Résolutions/réouvertures, idempotence, déplacements entre espaces et snapshots historiques.
- Récurrences : reconnaissance française et texte littéral, plusieurs jours, positions mensuelles, exclusions, années bissextiles, fins de mois, fuseaux et bornes ; parité analyse/aperçu/création ; résolution, annulation compensatrice, fin de série, archives et conflits de version ; contraintes et migration additive 0004.
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

Le smoke test vérifie routes publiques, disponibilité de la base, absence d'accès anonyme aux tâches, bundles, recherche MkDocs et vraies 404. Playwright exerce les formulaires de configuration, le cycle complet d'une tâche, le glisser-déposer entre lignes/colonnes, l'ordre en liste, les thèmes persistants, le mobile 320/375 px, le clavier, le déplacement inter-espaces et un conflit d'édition simulé. La création de sous-espaces, le déplacement d'un sous-arbre, le retour à la racine, l'ordre des frères, la navigation mobile et la restauration parents avant enfants sont également couverts, avec vérification par API et après rechargement. L’agenda est vérifié sur plusieurs espaces : périodes, réglages conservés, actions et parité API, dates liste/kanban, passage à minuit local, changement d’heure et erreurs de sauvegarde. Des captures couvrent aussi ses thèmes et formats mobiles. Les couleurs calculées du thème sombre sont contrôlées sur le bundle compilé.

Enfin, le script restaure un dump dans une seconde base, compare les événements et les liens parent-enfant, vérifie la révocation des sessions, les objets retirés et l'annulation sur erreur, puis revérifie migrations/immutabilité. Le nettoyage retire uniquement les ressources créées par ce script, sans toucher aux projets de développement ou de production.

`scheduling.spec.ts` vérifie la reconnaissance en direct dans l’éditeur et l’ajout rapide, l’enregistrement immédiat, le refus de reconnaissance, la personnalisation mensuelle avec exceptions, la persistance API, la résolution/annulation et le calendrier au clavier sur mobile dans les deux thèmes. Les captures et mesures de débordement portent sur le bundle compilé.

`test_scheduling_grammar.py` couvre les familles de nombres/ordinaux, les listes/plages, les alternances, les positions, les bornes et exceptions, les 120 permutations de cinq clauses indépendantes, les cadences hebdomadaires dans les deux ordres, les préfixes de saisie et les faux positifs. Un corpus déterministe de vocabulaire malformé vérifie l’absence d’erreur interne. Les tests HTTP comparent analyse/aperçu/création/résolution/annulation et contrôlent les diagnostics, la taille d’entrée et le CSRF. Les parcours navigateur ajoutent les compositions écrites en lettres, la sauvegarde immédiate d’une expression incomplète, le choix littéral, les exemples du planificateur et leur affichage mobile.

Pour cibler une autre image locale :

```bash
LIFE_TEST_IMAGE=local/life:ma-validation make test-container
```

Pour rejouer un fichier de parcours navigateur sur un serveur **de test** existant :

```bash
LIFE_E2E_URL=http://127.0.0.1:8100 \
LIFE_E2E_USERNAME=compte-test LIFE_E2E_PASSWORD=mot-de-passe-synthetique \
npm --prefix frontend run test:e2e -- mobile-comfort.spec.ts
```

Ces scénarios créent de vraies données dans le serveur choisi ; ils ne doivent pas cibler la production. Pour la suite complète, préférer `make test-container` : il réinitialise les compteurs de connexion de sa base jetable entre fichiers, sans désactiver la limite de 30 connexions par adresse sur 15 minutes. `make test-ui` ne réinitialise pas un serveur fourni. Les captures et traces restent sous `frontend/test-results/`, ignoré par Git, avec un sous-dossier par fichier lors du test de conteneur. Une trace peut contenir cookies et données : seuls les résultats synthétiques sont téléversés en CI en cas d'échec, avec rétention de 7 jours.

## CI et revue

GitHub Actions exécute les contrôles, les tests Python, les compilations, la construction de l'image puis `make test-container`. Aucune publication du site n'est déclenchée. Attendre les contrôles sur le dernier commit avant fusion, consigner la revue complète et résoudre ses constats.

Les résultats exacts de la livraison sont consignés dans l'issue et la PR. Les essais automatiques Chromium ne remplacent pas une recette sur tous les navigateurs/téléphones physiques ; vérifier les navigateurs ciblés lors des évolutions de compatibilité.

`mobile-comfort.spec.ts` vérifie la continuité des longues listes, du tableau et de l’agenda après résolution/réouverture, les lectures lentes et en échec, les filtres et récurrences, ainsi que les tailles calculées des champs à 320/375 px dans les deux thèmes. Un visual viewport simulé rétrécit sans changer la hauteur de mise en page : ajout rapide, description, dialogue, déplacement natif, défilement manuel et zoom volontaire sont contrôlés. Cette simulation teste l’intégration, pas l’apparition d’un vrai clavier ni le zoom automatique d’un iPhone physique. Les parcours ordinateur vérifient aussi les tailles originales et le focus clavier.

Les tests de duplication et de lots vérifient l’indépendance des historiques, les séries résolues en avance, les statuts ouverts/terminés, les étiquettes inter-espaces, l’ordre, les archives/restaurations, les droits/CSRF et le rollback intégral après conflit ou calendrier invalide. `task-actions.spec.ts` exerce les menus (trois points/clic droit/clavier), le rectangle en liste et tableau, l’agenda, les actions groupées et leurs conflits, ainsi que de vrais événements tactiles Chromium (défilement et appui long) sur une page compilée. Les captures et mesures contrôlent la sélection et les menus mobiles dans les deux thèmes.

## Applications et bibliothèque

`test_architecture.py` vérifie structure commune, identifiants et chemins uniques, correspondance des manifestes et frontières d’imports backend/frontend. `test_applications.py` vérifie défauts, idempotence, compte propriétaire, CSRF, booléens stricts, contraintes SQL, migration et conservation des tâches/événements/préférences. Il parcourt toutes les routes métier enregistrées pour prouver le refus après désactivation.

Les parcours `applications.spec.ts` couvrent connexion depuis l’accueil, bibliothèque au clavier, persistance après rechargement, accueil vide, accès direct désactivé, réactivation avec tâche/historique conservés, thème commun, mobile à 320 px, erreurs réseau, changements externes au retour au premier plan et expiration de session. Les parcours Tâches existants restent exécutés après extraction du socle. Le test du conteneur inclut les activations dans la restauration transactionnelle. Il exécute chaque fichier navigateur comme une phase de recette distincte, puis la restauration ; les compteurs de connexion de sa seule base jetable sont réinitialisés entre les phases pour permettre l’ajout de scénarios. La limite applicative de production reste inchangée.

## Sport

`test_sport.py` couvre le catalogue et les dix types, validation des mesures, propriétaire/CSRF, snapshots, conflits de versions, cycle des séries et repos, scores comparables, mensurations/archives, désactivation, contraintes SQL et migration aller/retour avec refus de perte. Les tests de contrat et de routes désactivées parcourent aussi le manifeste Sport. `sport.spec.ts` vérifie les parcours réels API/interface, mobile/clavier, erreurs, statistiques et reprise. La recette conteneur compare le contenu des cinq tables Sport après restauration isolée.
