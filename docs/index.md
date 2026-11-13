# Documentation de Life

Life organise vos tâches dans des espaces et des sections, en liste à cocher ou en tableau kanban. Une section devient une liste ou une ligne du tableau selon sa visibilité ; les colonnes représentent les statuts. Les données restent privées derrière une connexion personnelle.

[Ouvrir les tâches](https://life.thibault-leveau.com/tasks){ .md-button .md-button--primary }
[Guide utilisateur](taches.md){ .md-button }

## Ce que contient cette version

- Espaces, sections, tâches, colonnes et étiquettes configurables, recherche, filtres et ordre manuel.
- Thèmes clair, sombre ou système et préférences conservées en base.
- API complète, accès contrôlés et historique immuable des résolutions/réouvertures.
- PostgreSQL 17, migrations explicites, sauvegardes et restauration documentées.
- Tests HTTP et navigateur sur l'image livrée ; déploiement manuel derrière Caddy.

Les statistiques visuelles, le sport, les objectifs, les récurrences et la collaboration ne font pas partie de cette livraison. La disponibilité sur le domaine dépend du déploiement du commit et de la création du compte.

| Besoin | Guide |
| --- | --- |
| Organiser mes tâches | [Utiliser les tâches](taches.md) |
| Démarrer le projet | [Démarrage](demarrage.md) |
| Comprendre le code et les données | [Architecture](architecture.md), [Modèle de données](donnees.md) |
| Utiliser un client indépendant | [API](api.md) |
| Régler les variables | [Configuration](configuration.md) |
| Vérifier une modification | [Tests](tests.md) |
| Publier ou restaurer | [Déploiement](deploiement.md), [Sauvegardes](sauvegardes.md) |
| Diagnostiquer et protéger | [Exploitation](exploitation.md), [Sécurité](securite.md) |

Les décisions initiales restent dans l'[ADR 001](decisions/001-architecture-initiale.md). L'[ADR 002](decisions/002-gestion-taches.md) consigne l'accord de Thibault pour la persistance et l'authentification.
