# Faire évoluer l'application

## État actuel

Le socle comprend la gestion privée des tâches, PostgreSQL, les sessions personnelles et une API complète. L'[issue #3](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/3), la [spécification](taches-specification.md) et l'[ADR 002](decisions/002-gestion-taches.md) définissent cette première fonctionnalité persistante. Les domaines sport et objectifs restent futurs.

## Organisation par fonctionnalité

```text
backend/src/life_app/
├── api/v1/tasks.py
├── features/tasks/{models,schemas,service}.py
└── migrations/versions/
frontend/src/features/tasks/
├── api.ts
├── types.ts
├── TasksPage.tsx
├── components/
└── tasks.css
```

Réutiliser les sessions SQL, les contrôles d'accès, le routage explicite et les tokens. Les schémas définissent le contrat, les services portent les règles, les routes committent la transaction. Ne pas créer une couche générique sans besoin concret ni déplacer les responsabilités sans accord.

## Procédure

1. Créer une issue détaillée puis une branche depuis `main` à jour.
2. Lire architecture et décisions ; obtenir l'accord de Thibault avant toute nouvelle couche, stockage, service, authentification, framework ou mode de déploiement.
3. Définir les données, les règles, le contrat API et les contrôles d'accès.
4. Ajouter la migration et les tests de comportement concernés.
5. Livrer l'interface avec chargement, vide, erreur et conflit explicites.
6. Mettre à jour OpenAPI, le guide utilisateur, la configuration et l'exploitation.
7. Exécuter les contrôles, ouvrir la PR, consigner la revue, attendre la CI et fusionner selon `AGENTS.md`.

Toute action métier de l'interface doit avoir son équivalent API, y compris un réglage persistant. Ajouter une documentation sans prétendre qu'un contrôle non exécuté a réussi. Fusion et publication restent distinctes.

## Migrations et statistiques futures

Créer une nouvelle migration pour chaque changement du schéma livré, sans réécrire celles déjà publiées. Tester aller/retour sur données synthétiques, contraintes, compatibilité avec l'image précédente et restauration. La migration s'exécute une fois, explicitement au déploiement, jamais au démarrage des workers.

Pour les statistiques, utiliser les événements `completed` et `reopened`, leurs instants UTC et leur contexte historique. `completed_at` seul décrit uniquement l'état actuel. Distinguer nombre de résolutions, nombre de tâches distinctes résolues et délai de résolution par cycle. L'archivage n'est pas une résolution. Les [règles de données](donnees.md) précisent ces invariants.

Une interface de statistiques ne nécessite pas automatiquement un entrepôt séparé. Mesurer les besoins avant de proposer un autre stockage, un ordonnanceur ou une file. Une piste dans cette page ne vaut jamais autorisation d'architecture.
