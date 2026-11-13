# Consignes obligatoires pour les agents

Ces règles s'appliquent à l'ensemble du dépôt et à chaque requête concernant le projet, y compris les modifications de documentation et de ces consignes.

## Respect de l'architecture

- Lire `README.md`, `docs/architecture.md`, `docs/evolution.md` et les décisions pertinentes dans `docs/decisions/` avant de modifier le projet.
- Respecter obligatoirement l'architecture, les responsabilités des dossiers, les conventions et les contrats existants. S'appuyer sur les composants et outils déjà en place.
- Si une requête nécessite une évolution architecturale (nouvelle couche, réorganisation des responsabilités, stockage, authentification, service, framework ou mode de déploiement), présenter à Thibault le besoin, la proposition, les alternatives et les conséquences, puis demander son accord explicite **avant de l'implémenter**. Une piste décrite dans `docs/evolution.md` ne vaut pas autorisation.
- Consigner l'accord dans l'issue. Après accord, documenter la décision dans `docs/decisions/` et actualiser la documentation concernée, sans réécrire l'historique des décisions.

## Workflow obligatoire pour chaque requête

1. **Créer une issue GitHub avant toute modification.** Détailler la demande, le contexte, le périmètre, les critères d'acceptation, la solution envisagée et les validations prévues. La tenir à jour avec les décisions, résultats et éventuels blocages. Les échanges de suivi d'une même requête restent dans son issue.
2. **Créer ensuite une branche dédiée** depuis `main` à jour, avec un nom incluant le numéro de l'issue, par exemple `feat/12-suivi-taches`, `fix/13-route-api` ou `docs/14-consignes`. Ne jamais travailler ni pousser directement sur `main`.
3. **Implémenter la demande** dans cette branche en respectant l'architecture et le périmètre de l'issue. Mettre à jour la documentation avec le comportement livré.
4. **Tester avant d'ouvrir la pull request.** Exécuter les contrôles ci-dessous et les tests pertinents pour le changement. Ajouter ou adapter les tests de comportement nécessaires, corriger les échecs et consigner les commandes et résultats. Ne jamais présenter un contrôle non exécuté comme réussi.
5. **Ouvrir une pull request GitHub** (équivalent d'une merge request) vers `main`, liée à l'issue avec `Closes #<numéro>`. Décrire le problème, la modification, les validations effectuées et les limites ou risques éventuels.
6. **Effectuer une code review avant la fusion.** Relire le diff complet : conformité à la demande et à l'architecture, correction, régressions, sécurité, tests et documentation. Consigner les constats et leur résolution dans la PR, en précisant s'il s'agit d'une auto-revue ou d'une revue indépendante. Corriger les problèmes relevés, relancer les validations affectées et revoir tout nouveau changement.
7. **Fusionner après validation.** Attendre la réussite de tous les contrôles CI sur le dernier commit et la résolution des remarques de revue. Respecter les protections de branche et les approbations exigées par GitHub, sans les contourner. Fusionner la PR, vérifier la clôture de l'issue et remettre le dépôt local sur `main` à jour. Si un blocage empêche la fusion, le signaler explicitement.

## Vérifications du projet

Depuis la racine du dépôt :

```bash
make check        # Ruff, format Python, TypeScript et syntaxe des scripts shell
make test         # Tests Python et contrats HTTP
make build        # Compilation du frontend et de la documentation en mode strict
```

La CI complète ces contrôles par la construction de l'image Docker et les tests HTTP du conteneur. Pour un changement de packaging ou de déploiement, vérifier également l'image et ses routes localement lorsque l'environnement le permet.

La fusion et la mise en production sont deux opérations distinctes : le déploiement suit `docs/deploiement.md` lorsqu'il est demandé.
