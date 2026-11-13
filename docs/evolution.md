# Faire évoluer l'application

## État actuel et direction

Le socle livré n'a qu'une page d'accueil et une sonde de santé. Les domaines **tâches**, **sport** et **objectifs** seront ajoutés lorsque leur premier usage sera défini. Les noms présentés ci-dessous constituent une convention d'organisation future, pas des fonctionnalités déjà disponibles.

Ne pas créer de couches vides pour anticiper tous les scénarios. Ajouter un module avec sa première règle métier et ses tests.

La première demande de gestion des tâches est suivie dans l'[issue #3](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/3). Sa [spécification fonctionnelle](taches-specification.md) précise les espaces, les sections, les deux vues et les scénarios de validation. Elle est en préparation : la proposition de persistance et d'authentification attend l'accord explicite de Thibault et n'est pas encore implémentée.

## Organisation par fonctionnalité

Pour les tâches, une évolution pourrait introduire :

```text
backend/src/life_app/
├── api/v1/tasks.py
└── features/tasks/
    ├── schemas.py
    └── service.py

frontend/src/features/tasks/
├── api.ts
├── components/
└── pages/
```

Les schémas décrivent le contrat d'entrée/sortie, le service porte les règles métier et le routeur traduit le résultat en réponse HTTP. Ajouter un dépôt d'accès aux données ou un modèle ORM seulement lorsque la persistance existe.

Le frontend place les appels HTTP et composants spécifiques dans le même domaine. Les composants partagés restent dans `components/` lorsqu'ils servent réellement plusieurs fonctionnalités.

## Procédure pour une fonctionnalité

1. Définir un cas d'usage concret, les données nécessaires et les conditions de réussite.
2. Définir le contrat HTTP, les erreurs et les règles d'autorisation avant le formulaire.
3. Ajouter le modèle de données et sa migration si la fonctionnalité persiste des informations.
4. Implémenter la règle métier et les tests de comportement.
5. Ajouter l'interface avec ses états initial, chargement, vide, erreur et succès.
6. Mettre à jour OpenAPI, la documentation et les exemples de configuration.
7. Vérifier la migration, le retour arrière et la sauvegarde avant publication.

L'ordre peut être adapté à une modification purement visuelle, mais aucune fonctionnalité personnelle ne doit arriver publiquement sans contrôle d'accès serveur.

## Persistance envisagée

PostgreSQL, SQLAlchemy et Alembic sont les choix prévus pour une première base relationnelle. Ils ne sont pas requis et ne sont pas configurés en V1.

Leur introduction nécessitera une décision dédiée sur les modèles, la gestion des connexions, le mode synchrone ou asynchrone, les migrations et les sauvegardes. Une migration devra être une étape explicite du déploiement ; elle ne doit pas être exécutée de manière concurrente au démarrage de chaque worker.

Les tests devront couvrir les contraintes, les transitions de données et la compatibilité avec la version applicative précédente. Un retour à une image précédente ne restaure pas automatiquement une base modifiée : prévoir les migrations compatibles ou une procédure de restauration.

## Authentification envisagée

L'application étant destinée à une utilisation personnelle, définir d'abord le mode de connexion réellement souhaité. Le choix du fournisseur ou du mécanisme de session n'est pas arrêté en V1.

L'authentification doit précéder l'accès aux données privées. Chaque route métier doit ensuite vérifier l'autorisation côté serveur. Ajouter des tests qui prouvent qu'une session absente ou invalide ne permet ni lecture ni modification.

## Navigation et API

Un routeur React devient utile lorsque plusieurs vues réelles doivent être accessibles par URL. Son ajout devra définir les routes servies au chargement direct et conserver les 404 des chemins API et des fichiers manquants. Un fallback général sur l'ensemble du domaine n'est pas acceptable.

Les nouvelles routes métier rejoindront `/api/v1`. Documenter chaque évolution du contrat et éviter de multiplier les services ou versions tant qu'un besoin concret ne le justifie pas.

## Documentation à maintenir

Une fonctionnalité est terminée lorsque son comportement, sa configuration, ses erreurs et son exploitation sont décrits. Ajouter une décision d'architecture pour un choix structurant : stockage, authentification, service externe ou changement du mode de déploiement.

Ne pas réécrire l'ADR initial pour faire croire que ces composants existaient dès le départ. Ajouter une nouvelle décision qui explique le besoin, le choix, les alternatives pertinentes et les conséquences opérationnelles.
