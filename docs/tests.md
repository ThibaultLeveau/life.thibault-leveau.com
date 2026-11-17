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

Le scénario des réglages crée trois sections par API : il contrôle le nom de la deuxième, la description de la troisième et l’ajout en bas du dialogue. Il simule aussi un retour tardif du défilement après le redimensionnement du clavier, vérifie le champ visible sous l’en-tête, la priorité du défilement tactile, la reprise de saisie et la conservation des brouillons, puis compare la description enregistrée avec l’API. Cette régression échoue sur la version qui ne vérifiait la visibilité qu’au focus et au redimensionnement. Le fichier peut aussi être joué avec WebKit installé (`--browser=webkit`) ; ce moteur automatisé ne remplace pas un essai sur iPhone physique.

Les tests de duplication et de lots vérifient l’indépendance des historiques, les séries résolues en avance, les statuts ouverts/terminés, les étiquettes inter-espaces, l’ordre, les archives/restaurations, les droits/CSRF et le rollback intégral après conflit ou calendrier invalide. `task-actions.spec.ts` exerce les menus (trois points/clic droit/clavier), le rectangle en liste et tableau, l’agenda, les actions groupées et leurs conflits, ainsi que de vrais événements tactiles Chromium (défilement et appui long) sur une page compilée. Les captures et mesures contrôlent la sélection et les menus mobiles dans les deux thèmes.

## Applications et bibliothèque

`test_architecture.py` vérifie structure commune, identifiants et chemins uniques, correspondance des manifestes et frontières d’imports backend/frontend. `test_applications.py` vérifie défauts, idempotence, compte propriétaire, CSRF, booléens stricts, contraintes SQL, migration et conservation des tâches/événements/préférences. Il parcourt toutes les routes métier enregistrées pour prouver le refus après désactivation.

Les parcours `applications.spec.ts` couvrent connexion depuis l’accueil, bibliothèque au clavier, persistance après rechargement, accueil vide, accès direct désactivé, réactivation avec tâche/historique conservés, thème commun, mobile à 320 px, erreurs réseau, changements externes au retour au premier plan et expiration de session. Les parcours Tâches existants restent exécutés après extraction du socle. Le test du conteneur inclut les activations dans la restauration transactionnelle. Il exécute chaque fichier navigateur comme une phase de recette distincte, puis la restauration ; les compteurs de connexion de sa seule base jetable sont réinitialisés entre les phases pour permettre l’ajout de scénarios. La limite applicative de production reste inchangée.

## Sport

`test_sport.py` couvre le catalogue et les dix types, validation des mesures, propriétaire/CSRF, snapshots, conflits de versions, cycle des séries et repos, scores comparables, mensurations/archives, désactivation, contraintes SQL et migration aller/retour avec refus de perte. Les tests de contrat et de routes désactivées parcourent aussi le manifeste Sport. `sport.spec.ts` vérifie les parcours réels API/interface, mobile/clavier, erreurs, statistiques et reprise. La recette conteneur compare le contenu des cinq tables Sport après restauration isolée.

Les tests de reprise Sport couvrent les dix types, valeurs distinctes par série, correction, abandon partiel, annulation, séance vide, anciens instantanés, isolation comptes/programmes, réordonnancement et doublons/types. Les parcours navigateur vérifient les champs directs, validation native et clavier, brouillon voisin préservé, conflit réel suivi d’actualisation, correction sans redémarrage du repos, annulation et prochain entraînement, actualisation tardive ignorée après une écriture et repos conservé entre onglets. La barre de repos et les dernières commandes sont mesurées à 320/375/1440 px dans les deux thèmes, avec défilement tactile et visual viewport réduit. Ce dernier simule un clavier ; aucun essai sur téléphone physique n’est prétendu. La restauration conteneur compare aussi les propositions persistées dans les instantanés Sport.

Les blocs de séries Sport sont contrôlés pour les dix types à 320/375/1440 px, dans les deux thèmes : titre long et séries contenus dans la même carte nommée, champs et bouton principal disposés sans chevauchement, bouton de validation sur la même ligne que les champs, y compris à faible largeur, cibles tactiles, hauteur compacte, états validé/brouillon et correction au clavier persistée par API et après rechargement. Les captures couvrent les cartes et leurs titres.

Les tests HYROX couvrent le format strict de date, le jour intercalaire, l’effacement explicite ou par omission PUT, les dates passées, l’instantané des séances, versions/CSRF/propriétaires et conservation après archivage/désactivation. Ils vérifient l’aller-retour de `0007_hyrox` sur des lignes existantes et le refus de perte pour chacune des colonnes. `sport-hyrox.spec.ts` contrôle la détection immédiate, le logo et la date dans l’éditeur, le catalogue, la liste et la séance à 320/1440 px, clair/sombre, avec saisie clavier, erreur serveur et nouvelle tentative, rechargement et indépendance du programme. Il mesure le contraste des champs et les débordements ; il vérifie le passage de minuit, le changement d’heure, le jour J et la date passée. Les captures permettent une revue visuelle. Les tests conteneur restaurent et comparent aussi les dates enregistrées.

Les cartes de programme Sport sont mesurées à 320/375/1440 px, en français/anglais et dans les deux thèmes : aperçu mobile et hauteurs naturelles réduites, hauteurs bornées et rangées indépendantes sur ordinateur, actions alignées, cibles de 44 px, édition au clavier et démarrage conservé. Le parcours d’archivage vérifie son accès dans l’éditeur existant et les cartes, refus d’abandon du brouillon, erreur réseau, conflit réel de version, archivage/restauration et conservation des exercices, notes et date HYROX via l’API. Les captures portent sur les cartes compilées et utilisent les exercices fournis du catalogue, sans créer d’homonymes personnels susceptibles de changer les recherches des scénarios suivants.

## Français et anglais

`test_i18n.py` couvre préférence et contraintes `fr/en`, session/CSRF/propriétaires, négociation, requêtes concurrentes, catalogues FR/EN et paramètres, les 680 identifiants, les homonymes personnels, instantanés et scores inchangés, désactivation/réactivation et migration `0008_locale`. `test_scheduling_english.py` couvre nombres, dates, cadences, bornes/exceptions, indices Unicode, diagnostics, textes littéraux et exemples de l’aide.

`i18n.spec.ts` utilise l’API réelle et les bundles compilés pour vérifier langue anonyme et de compte, reconnexion, thème, Tâches en anglais, catalogue Sport et données personnelles, programmes/entraînements/historique, réponses obsolètes, brouillons, mobile/clavier et erreurs/expiration. La restauration conteneur compare aussi la langue du compte après un choix anglais persistant.

Les parcours `navigation.spec.ts` comparent le style calculé de la top bar, sidebar, liens actifs et footer entre Tâches, Sport et Suivi à 1440, 1000, 800, 375 et 320 px, en clair/sombre. Ils vérifient aussi les trois thèmes et les deux langues via les préférences API, les liens de documentation ciblés, la bibliothèque, la déconnexion, le confinement du focus, Échap, le fond de fermeture et le passage mobile/bureau.

## Interactions Tâches en arrière-plan

`task-sync.spec.ts` retient explicitement les réponses d’écriture : plusieurs validations, la réouverture et d’autres actions doivent être visibles avant de libérer le réseau. Il compare ensuite les versions et valeurs avec l’API réelle. Les scénarios couvrent erreurs, conflits et conservation du brouillon, création suivie d’une action avant attribution de l’identifiant serveur, agenda, réglages, mobile/clavier et réduction des mouvements. Les parcours existants attendent la confirmation du statut d’enregistrement avant de vérifier la persistance après rechargement ; le rendu optimiste seul ne prouve pas la persistance.

Le changement ne modifie ni tables, migrations, contrats HTTP, récurrences ni journal historique. Les validations PostgreSQL, propriétaire/CSRF, sauvegarde/restauration et désactivation/réactivation restent celles des parcours existants.

`task-drag-input.spec.ts` vérifie les créations successives par Entrée en liste/tableau et FR/EN, le focus avec une écriture retardée, les erreurs de date, le déplacement depuis titres et corps des cartes, les sections/cellules vides, les dépôts inter-espaces sans section et la conservation des dates/historiques par API. Il couvre aussi les dépôts hors cible, Échap et les erreurs de déplacement. Les rectangles de `task-actions.spec.ts` partent désormais du fond ; les scénarios tactiles existants vérifient toujours défilement et appui long.

## Suivi et métriques inter-applications

`test_integrations.py` vérifie fenêtres locales/DST, résolutions nettes et annulations, reports manuels, filtres propriétaires, sources désactivées, agrégations Sport et absence de mesure. `test_tracking.py` vérifie périodes, types stricts, scores/XP, versions, définitions datées, instantanés, archive/réactivation, erreurs et protections SQL. `test_architecture.py` contrôle les fournisseurs optionnels et le cadre partagé ; la suite d’activation couvre automatiquement toutes les routes du nouveau routeur.

`frontend/tests/tracking.spec.ts` exerce les parcours réels API/interface, états vides/erreurs, saisies zéro/Non, corrections, calendrier au clavier et à 320/390/1440 px, mois/année, sources, réglages, archive/restauration et anglais/sombre. La recette conteneur compare les cinq tables Suivi après dump/restauration. Les captures sont des résultats locaux Playwright et ne contiennent que des données synthétiques.


La progression est couverte par `test_progression.py` (barèmes, niveaux, 180 quêtes, concurrence, propriétaires, calendrier/DST, vacances, reprise ciblée, journal immuable et refus de perte), les contrats de `test_architecture.py` et `progression.spec.ts` (badge en direct, dropdown clavier, mur, filtres, réglages, garde des brouillons, erreurs, expiration, FR/EN et thèmes à 320 px). Le test conteneur exerce deux reprises idempotentes du seul compte synthétique et compare les quatre tables après restauration, avec vérification du trigger des récompenses. Les tests de migrations anciennes utilisent une fixture sans nouvelle attribution afin d’isoler leurs propres invariants ; la protection de la migration 0010 est testée séparément avec de vrais gains.

## Objectifs OKR

`test_okr.py` couvre précision progressive, parents, frontière du mois (dont janvier et année bissextile), résultats croissants/décroissants, ordre, concurrence, clôture selon fuseau à une frontière de trimestre, instantanés, réouvertures et récompenses uniques, propriétaires, activation, archives, contraintes et migration aller/retour/refus de perte. Les tests communs parcourent toutes les routes désactivées, manifestes, fournisseurs, traductions et quêtes.

`okr.spec.ts` vérifie API/interface, parcours guidé, kanban, rétrospective, Suivi, brouillons, erreurs, petit écran et clavier. Les parcours de navigation communs incluent OKR. Le test conteneur restaure les trois tables et compare leurs valeurs intégralement, puis vérifie l’immuabilité du journal restauré. La recette de publication emploie un compte isolé sans modifier les données personnelles.

## Recettes et courses

`test_recipes.py` couvre le catalogue FR/EN, ingrédients privés, décimaux/portions, cumul par unité, achats partiels, modèles, copie, archives, conflits, métriques/XP, contraintes SQL et garde de migration. `recipes.spec.ts` exerce les parcours interface/API, les erreurs réseau, les brouillons et le mode magasin sur ordinateur/mobile. Les parcours `navigation.spec.ts` incluent la parité du cadre partagé FR/EN et thèmes. Le test conteneur compare les six tables après restauration et vérifie le journal immuable ; le smoke test couvre routes HTML, API privée, documentation et OpenAPI.

### Score Sport v2

`test_sport_scores.py` couvre les dix types dès la première séance vide/partielle, effort charge/assistance/distance/durée, volume et allure plafonnée, cibles partielles, références figées et champs inconnus, doublons, valeurs extrêmes et réparation propriétaire/CSRF/idempotente sans changement de dates/résultats/récompenses. Les tests Sport existants contrôlent les nouveaux scores et la conservation des propositions. Le parcours navigateur de fin partielle vérifie en FR/EN et bureau/320 px score, complétion, difficulté, références et présence du zéro dans les statistiques ; la restauration conteneur conserve les métriques JSONB complètes.

## Documentation et captures

Chaque page française possède son équivalent anglais et appartient à un seul guide. La compilation stricte valide les liens ; le hook refuse les pages sans guide ni traduction. Les tests navigateur vérifient la navigation et la recherche limitées au guide et à la langue, les liens de traduction, les captures locales, le clavier/mobile et les anciennes URL.

`make docs-screenshots` (ou `scripts/capture-documentation.sh`) compile l’interface, crée PostgreSQL et deux comptes fictifs jetables, lance un serveur de test sur loopback, capture les deux langues, puis supprime ses propres processus et conteneur. Installer Chromium Playwright et ses dépendances au préalable. Ne jamais utiliser les données de production. Le script Node exige une URL loopback explicite et un dossier temporaire pour son état de capture. Les images versionnées dans `docs/assets/screenshots/fr/` et `en/` ne contiennent aucune donnée personnelle réelle. Relire visuellement les captures, leur texte alternatif et leur légende traduits. Les commandes techniques de Swagger restent en anglais dans les deux captures.
## Finition Sport (issue 74)

`test_sport_ux.py` couvre les préférences partielles et versionnées, leur isolation/conservation, les filtres complets, la duplication, les notes/contextes figés, la navigation d’historique, les références statistiques, les XP réels de clôture, le calendrier UTC et la migration 0014 avec refus de perte. `sport-ux.spec.ts` exerce les préférences par format, le débit des recherches, les listes sous latence, la continuité de navigation, les brouillons, la fermeture en cours d’écriture, les conflits et copies, la sélection entre pages, le déplacement direct, le focus des séries, le brouillon normalisé, le repos ajustable et le bilan, les mensurations repliées, les écarts et l’axe temporel au clavier. Ces tests utilisent l’API réelle ; les délais/erreurs sont injectés seulement aux endroits précisés par les scénarios.

Les mesures géométriques des graphiques Sport attendent explicitement le rendu des points après navigation. Une lecture immédiate de la liste SVG peut précéder la réponse API sur le domaine HTTPS, même si le graphique se charge correctement.

### Densité mobile Sport

`sport-mobile.spec.ts` mesure le contenu initial à 320 × 568, 390 × 664 et 430 × 780 en FR/clair et EN/sombre : deux lignes complètes au minimum sur petit téléphone, trois sur les autres formats, recherche/filtres, bascule liste/grille, premier graphique, champs du premier exercice, premières séries et champ de réglage visible. Il contrôle le catalogue mobile sans ouverture automatique du clavier, le retour de focus, les actions de copie/archivage/annulation et déplacement, le relevé complet après aperçu compact, la conservation des valeurs repliées et une sauvegarde à hauteur réduite de 360 px. Le paysage tactile à 844 × 390 conserve les préférences mobiles.

Les anciens parcours Sport ouvrent explicitement les menus et options compacts ; leurs assertions de persistance, conflit, validation et conservation restent applicables. Les contrôles de navigation et réglages partagés vérifient les autres applications. Les captures sont prises avec les animations terminées ; les émulations de navigateur ne constituent pas des essais sur appareils physiques.

## Assistant IA

Les suites `test_assistant*.py` couvrent les routes privées, la mémoire et l’historique, les reçus atomiques, les confirmations et les adaptations des cinq applications. Les tests de contrats comparent les capacités aux routes HTTP et les tests métier vérifient isolation, versions, archives, historique et absence de commit dans les adaptateurs. Le spécialiste `lifeos` expose aussi les opérations communes de bibliothèque, préférences, progression et intégrations.

Les régressions `test_assistant_memory.py` contrôlent les refus explicites FR/EN, les gardes sensibles indépendants du booléen modèle et l’arrêt après correction automatique. `test_assistant_compaction.py` vérifie les groupes de messages entiers, les grands messages découpés, le dernier message réellement couvert et la conservation après interruption.

`test_assistant_migration.py` vérifie la conservation des tables métier pendant la migration 0015, les contraintes SQL, les trois clés d’idempotence et le refus de downgrade pour chacune des sept tables non vides. `test_assistant_key_rotation.py` vérifie rotation/dry-run, erreur de clé sans perte et restauration : réponses interrompues, aperçus invalidés, reçus terminés et souvenirs préservés, sessions révoquées. Le test conteneur compare les sept tables après dump/restauration et déchiffre un token strictement synthétique.

`test_assistant_providers.py` utilise des réponses HTTP simulées pour OpenAI, Anthropic et Gemini. Ces suites ne contactent aucun fournisseur réel et ne prouvent ni l’accès à un compte, ni la disponibilité d’un modèle, ni son comportement avec de vraies demandes. Une validation réelle de fournisseur reste distincte et doit être consignée explicitement ; ne pas la déduire d’un test simulé réussi. Les parcours `assistant.spec.ts` contrôlent l’interface avec données synthétiques. Les résultats des commandes effectivement exécutées appartiennent à l’issue et à la PR de livraison.
