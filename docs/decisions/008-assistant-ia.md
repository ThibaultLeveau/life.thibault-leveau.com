# ADR 008 — Assistant IA, capacités métier et mémoire personnelle

**Statut :** accepté par Thibault le 17 novembre 2026.

**Accord :** « J’approuve cette architecture et son implémentation. », après présentation du besoin, des alternatives et des conséquences, [consigné dans l’issue #85](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/85#issuecomment-6960154089) avant implémentation.

## Décision

Conserver FastAPI, React, PostgreSQL, les sessions, les registres explicites et le déploiement VPS. Ajouter `platform/assistant` au backend et au frontend. L’accueil connecté devient une conversation ; la bibliothèque et les applications restent accessibles directement.

Un coordinateur délègue aux spécialistes des cinq applications et à un agent de mémoire. Leurs outils sont limités côté serveur à leur périmètre. Les contrats et contextes sont chargés selon la demande, avec des bornes d’appels, de taille et de durée ; les agents ne sont pas tous invoqués à chaque tour. Les services métier restent dans leurs applications et partagent leurs règles avec l’API HTTP.

Le manifeste backend expose un fournisseur optionnel de capacités typées, implémenté dans son application. Chaque capacité indique son contrat, sa route correspondante et son caractère lecture/écriture. Le socle reçoit les fournisseurs par injection ; aucun import métier croisé, SQL arbitraire, code généré ou requête HTTP libre n’est offert au modèle. Les actions simples explicitement demandées peuvent être exécutées ; les propositions ambiguës, modifications en lot et actions destructives passent par un aperçu à confirmer.

Les appels aux modèles s’effectuent hors transaction SQL. Chaque action ouvre une transaction courte, verrouille le propriétaire et revalide session, activation, périmètre et versions. Mutation, événements, progression et reçu sont enregistrés ensemble. Une identité persistante de tour/action et une empreinte des arguments empêchent les doubles écritures après perte de réponse. Une interruption n’autorise pas une réexécution implicite ; les succès partiels restent visibles.

PostgreSQL conserve conversations, messages, exécutions/actions, configuration des fournisseurs et souvenirs personnels. Historique, résumés de contexte et mémoire réutilisable sont distincts. La mémoire retient des faits utiles communiqués par l’utilisateur, avec source/date, dédoublonnage et correction. Elle est consultable, modifiable, effaçable et désactivable. Les données sensibles ne sont mémorisées que sur demande explicite ; les secrets ne deviennent pas des souvenirs. L’oubli invalide les résumés concernés et empêche une nouvelle extraction silencieuse depuis les anciennes sources. Supprimer une conversation et oublier ses souvenirs sont des choix explicites.

Des adaptateurs OpenAI Responses, Anthropic et Google Gemini partagent un contrat de messages, outils et flux. Les réglages proposent fournisseur, modèle et token. Les tokens sont chiffrés côté serveur avec un secret d’exploitation indépendant du dump ; les lectures renvoient seulement un état de configuration. Les hôtes sortants sont explicitement autorisés. Le contexte pertinent est transmis au fournisseur choisi et consomme son quota API.

Le manifeste frontend expose un renderer optionnel de snippets chargé à la demande, injecté par le shell comme les panneaux Settings. Chaque métier possède ses composants ; `platform` et `shared` n’importent aucune application. Les snippets sont des données structurées versionnées rendues par React, jamais du HTML/JavaScript exécuté. Aperçu et résultat confirmé sont distincts ; leur statut et leurs références viennent du serveur. Désactiver une application conserve l’historique mais interdit de nouvelles lectures et actions métier.

Le chat réutilise navigation, footer, tokens, traduction et préférences communes. Le transport de streaming conserve CSRF, annulation, expiration et invalidation de session/langue. L’historique reste adressable par paramètre de la route `/`. Les animations sont sobres, désactivables par la préférence système ; clavier, lecteur d’écran, 320 px et clavier mobile font partie de la recette.

## Alternatives

Un seul agent portant tous les outils grossirait le contexte et mélangerait les responsabilités. Un service d’agents, une file ou une base vectorielle ajouterait une exploitation non justifiée à ce stade. Une recherche bornée dans PostgreSQL et des spécialistes chargés à la demande permettent une évolution mesurée. Des mini-applications générées en HTML/JS rendraient les actions moins contrôlables que des snippets typés.

## Conséquences

Étendre les manifestes, les tests de frontières, les contrats API et la chaîne globale de migrations. Ajouter les dépendances de transport/chiffrement nécessaires et un secret VPS dont rotation et sauvegarde indépendante sont documentées. Une perte de clé demande de ressaisir les tokens, sans empêcher l’accès aux applications. Une restauration interrompt les anciennes exécutions et révoque les sessions. Tester propriétaires, activation pendant un tour, concurrence, reçus, interruption, oubli, fournisseurs, snippets et restauration avant publication.

L’expérience de mémoire s’inspire des fonctions visibles de ChatGPT ; cette décision ne prétend pas reproduire son implémentation interne. Les décisions précédentes conservent leur valeur historique. Les fonctionnalités deviennent disponibles uniquement avec leur livraison documentée.
