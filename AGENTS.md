# Consignes obligatoires pour les agents

Ces règles s'appliquent à l'ensemble du dépôt et à chaque requête concernant le projet, y compris les modifications de documentation et de ces consignes.

## Respect de l'architecture

- Lire `README.md`, `docs/architecture.md`, `docs/evolution.md` et les décisions pertinentes dans `docs/decisions/` avant de modifier le projet.
- Respecter obligatoirement l'architecture, les responsabilités des dossiers, les conventions et les contrats existants. S'appuyer sur les composants et outils déjà en place.
- Si une requête nécessite une évolution architecturale (nouvelle couche, réorganisation des responsabilités, stockage, authentification, service, framework ou mode de déploiement), présenter à Thibault le besoin, la proposition, les alternatives et les conséquences, puis demander son accord explicite **avant de l'implémenter**. Une piste décrite dans `docs/evolution.md` ne vaut pas autorisation.
- Consigner l'accord dans l'issue. Après accord, documenter la décision dans `docs/decisions/` et actualiser la documentation concernée, sans réécrire l'historique des décisions.

## Applications LifeOS : structure et frontières obligatoires

L'[ADR 003](docs/decisions/003-applications-lifeos.md) définit le socle modulaire approuvé. Toutes les applications suivent **la même structure**, dans des dossiers distincts. Identifiants stables en anglais (`tasks`, puis les identifiants des futures applications) ; libellés utilisateur en français.

```text
backend/src/life_app/apps/<id>/
  __init__.py
  manifest.py        # ApplicationDefinition : identité, route, défaut, routeur
  router.py          # HTTP, dépendances, transactions et réponses
  models.py          # tables propres au métier
  schemas.py         # contrats et validation
  service.py         # règles métier
frontend/src/apps/<id>/
  manifest.ts        # ApplicationModule : identifiant et Page chargée à la demande
  Page.tsx           # assemblage de l'interface métier
  api.ts             # client métier utilisant le transport commun
  types.ts           # contrats du métier
  components/        # composants propres à l'application
  styles.css         # styles propres à l'application
```

- Les helpers propres à un métier restent dans son dossier. Ne pas dupliquer une application pour en construire une autre : reproduire la structure et les contrats, réutiliser le socle et écrire uniquement le métier concerné. Sport, OKR, ménage et plantes sont futurs tant qu'ils ne sont pas implémentés.
- Aucune application n'importe le métier d'une autre. Le backend `core/` contient l'infrastructure, `platform/` la connexion et la bibliothèque ; le frontend `platform/` contient session, transport HTTP/CSRF et bibliothèque, `shared/` les composants et styles communs. Ces dossiers ne dépendent d'aucune application.
- Les seuls assemblages des applications sont les registres explicites `apps/registry.py` et `apps/registry.ts`. Le manifeste backend est la source des métadonnées et chemins. Le frontend associe seulement un identifiant à sa Page. Aucun catalogue utilisateur parallèle, chargement dynamique de code externe ou stockage métier dans le navigateur.
- Enregistrer chaque nouvelle application dans les deux registres et suivre [le guide d'évolution](docs/evolution.md). L'assemblage central applique automatiquement le contrôle d'activation à **tout** son routeur. Ne jamais monter une route métier hors de ce contrôle ni recopier la connexion dans une Page.
- Toute application utilise les sessions, CSRF, contrôles de propriétaire, transactions, thème, composants accessibles et tokens existants. Le shell monte la Page uniquement après connexion et activation ; déconnexion et expiration démontent ses données privées. Les réponses obsolètes doivent être annulées ou ignorées.
- Une application est désactivée par défaut, sauf exception documentée de migration (Tâches). Une désactivation conserve données, dates, préférences et historique ; elle n'est ni un archivage ni une suppression. Les activations personnelles passent exclusivement par l'API commune.
- Les migrations restent dans `migrations/versions/`, en une chaîne globale ; ne pas déplacer ni réécrire celles déjà publiées. Chaque application documente données, erreurs, contraintes, cycle de vie et sauvegarde/restauration.
- Étendre les tests de frontières et de contrat (`test_architecture.py`), les tests HTTP de toutes les routes désactivées et les parcours navigateur lors de l'ajout d'une application. Prouver la parité API/interface, l'isolation des propriétaires, les états vide/erreur, les formats mobile et clavier et la préservation après désactivation/réactivation.

Ajouter une application respectant ce contrat ne nécessite pas de nouvelle décision architecturale. Toute modification des frontières, du contrat commun ou du socle suit la règle d'accord explicite ci-dessus.

## Fonctionnalités accessibles par API et documentées

- Toute opération métier proposée par l'interface doit être accessible par l'API versionnée, y compris les réglages persistants, les déplacements, le réordonnancement, l'archivage et la restauration. Le frontend utilise cette API ; il ne constitue pas un stockage métier parallèle.
- Définir et maintenir les contrats d'entrée/sortie, les erreurs, les contrôles d'accès et les règles de validation côté serveur. Tenir OpenAPI à jour et fournir des exemples d'utilisation indépendants de l'interface.
- Documenter dans la même branche le comportement utilisateur livré, les paramètres configurables, le modèle de données, les limites et les procédures d'exploitation affectées. Distinguer explicitement une proposition d'une fonctionnalité disponible.
- Pour des données persistantes, documenter et tester les contraintes, les transitions de cycle de vie, les migrations et les procédures de sauvegarde/restauration concernées. Pour les tâches, préserver les dates et l'historique nécessaires aux futures statistiques de résolution, notamment lors des réouvertures et archivages.
- Vérifier la parité entre l'API et les parcours de l'interface avec des tests de comportement pertinents. Une fonctionnalité n'est pas terminée si son accès API, sa documentation ou ses validations restent incomplets.

## Workflow obligatoire pour chaque requête

1. **Créer une issue GitHub avant toute modification.** Détailler la demande, le contexte, le périmètre, les critères d'acceptation, la solution envisagée et les validations prévues. La tenir à jour avec les décisions, résultats et éventuels blocages. Les échanges de suivi d'une même requête restent dans son issue.
2. **Créer ensuite une branche dédiée** depuis `main` à jour, avec un nom incluant le numéro de l'issue, par exemple `feat/12-suivi-taches`, `fix/13-route-api` ou `docs/14-consignes`. Ne jamais travailler ni pousser directement sur `main`.
3. **Implémenter la demande** dans cette branche en respectant l'architecture et le périmètre de l'issue. Mettre à jour la documentation avec le comportement livré.
4. **Tester avant d'ouvrir la pull request.** Exécuter les contrôles ci-dessous et les tests pertinents pour le changement. Ajouter ou adapter les tests de comportement nécessaires, corriger les échecs et consigner les commandes et résultats. Ne jamais présenter un contrôle non exécuté comme réussi.
5. **Ouvrir une pull request GitHub** (équivalent d'une merge request) vers `main`, liée à l'issue avec `Closes #<numéro>`. Décrire le problème, la modification, les validations effectuées et les limites ou risques éventuels.
6. **Effectuer une code review avant la fusion.** Relire le diff complet : conformité à la demande et à l'architecture, correction, régressions, sécurité, tests et documentation. Consigner les constats et leur résolution dans la PR, en précisant s'il s'agit d'une auto-revue ou d'une revue indépendante. Corriger les problèmes relevés, relancer les validations affectées et revoir tout nouveau changement.
7. **Fusionner après validation.** Attendre la réussite de tous les contrôles CI sur le dernier commit et la résolution des remarques de revue. Respecter les protections de branche et les approbations exigées par GitHub, sans les contourner. Fusionner la PR, vérifier la clôture de l'issue et remettre le dépôt local sur `main` à jour. Si un blocage empêche la fusion, le signaler explicitement.
8. **Déployer sur le VPS à la fin de chaque changement**, y compris une modification de documentation ou de ces consignes. Après la fusion, publier le dernier `main` validé en suivant `docs/deploiement.md`, avec les sauvegardes et migrations nécessaires. Cette étape fait partie de la demande et ne nécessite pas une nouvelle demande de déploiement. Vérifier la version réellement exécutée, les sondes, les routes HTTPS publiques et les parcours affectés ; consigner le commit publié et les résultats dans l'issue. Ne pas déclarer le travail terminé avant ces vérifications. Si un blocage empêche le déploiement, le signaler explicitement et le consigner dans l'issue.

## Vérifications du projet

Depuis la racine du dépôt :

```bash
make check        # Ruff, format Python, TypeScript et syntaxe des scripts shell
make test         # Tests Python et contrats HTTP
make build        # Compilation du frontend et de la documentation en mode strict
```

La CI complète ces contrôles par la construction de l'image Docker et les tests HTTP du conteneur. Pour un changement de packaging ou de déploiement, vérifier également l'image et ses routes localement lorsque l'environnement le permet.

La fusion et la mise en production sont deux opérations successives obligatoires : la fusion GitHub ne publie pas le site ; l'agent exécute ensuite le déploiement sur le VPS selon `docs/deploiement.md`.
