# ADR 002 — Tâches persistantes et accès personnel

**Statut :** accepté par Thibault le 13 novembre 2026.

**Accord :** « J'approuve cette architecture. », consigné dans l'[issue #3](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/3#issuecomment-6863108670).

## Contexte

La gestion des espaces, sections et tâches nécessite une persistance, un accès privé et des données historiques exploitables pour de futures statistiques. L'ADR 001 reste le témoignage du socle initial sans stockage.

## Décision

Conserver FastAPI, React/TypeScript, Vite, MkDocs et l'image applicative commune. Ajouter des modules métier `features/tasks` et `features/auth`, les routeurs sous `api/v1` et la gestion des connexions dans `core/database.py`.

Utiliser PostgreSQL 17, SQLAlchemy 2 synchrone et Alembic. PostgreSQL dispose d'un service Compose privé et d'un volume persistant. Une transaction couvre chaque mutation et ses événements. Les tests d'intégration utilisent également PostgreSQL. Les migrations sont une commande explicite ; aucun worker ne modifie le schéma au démarrage.

Utiliser un compte personnel créé par commande, un mot de passe Argon2 et des sessions opaques révocables en base. Le navigateur reçoit un cookie HttpOnly, SameSite=Lax et Secure en production ; les écritures sont protégées par un jeton CSRF et une vérification d'origine. Limiter les tentatives de connexion en base pour partager cette protection entre processus. Ne pas ouvrir d'inscription publique.

Chaque espace appartient à un utilisateur. Les sections et statuts sont distincts : une section produit une liste ou une ligne du kanban ; un statut produit une colonne. Les références sont contraintes dans le même espace. Les mutations d'un propriétaire sont sérialisées pour préserver ordre et transitions ; les versions de tâches permettent de signaler les éditions concurrentes.

Conserver des événements immuables de création, déplacement, résolution, réouverture et archivage, avec dates UTC et identifiants de contexte. Les identifiants restent stables après renommage ; conserver le contexte utile au moment de l'événement sans recopier le contenu des tâches. L'archivage ne vaut pas résolution. Une tâche peut avoir plusieurs résolutions, chacune suivie éventuellement d'une réouverture.

Toutes les actions métier et préférences persistantes sont accessibles par `/api/v1` et décrites dans OpenAPI. Les routes frontend sont explicitement autorisées ; les chemins inconnus restent des erreurs 404. Une bibliothèque de glisser-déposer React peut compléter les commandes de déplacement accessibles, sans changement de framework.

## Alternatives

- SQLite simplifierait l'exploitation, mais PostgreSQL correspond à la direction du projet et permet de tester les contraintes et la concurrence sur le moteur de production.
- Un fournisseur OIDC éviterait la gestion locale des mots de passe, mais ajouterait une dépendance externe et une configuration de compte qui ne sont pas nécessaires à cet usage personnel.
- Un stockage dans le navigateur ne répondrait pas à l'accès API, à la centralisation des données et à leur exploitation statistique.
- Des services séparés pour le frontend et l'API n'apportent pas de bénéfice pour ce périmètre.

## Conséquences

Un service, un volume et des secrets de base sont désormais nécessaires. Les sauvegardes/restaurations PostgreSQL et les migrations font partie de l'exploitation. Un retour à une image antérieure ne restaure pas la base ; les migrations futures doivent préserver la compatibilité ou fournir une procédure de restauration explicite. Les sauvegardes contiennent des données privées et doivent être protégées.

Le déploiement reste manuel et distinct de la fusion. Le compte personnel n'est pas créé avec un mot de passe par défaut en production. Les statistiques ne font pas partie de cette livraison ; le journal et les dates sont conçus pour les rendre possibles.
