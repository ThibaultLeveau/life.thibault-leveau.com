# Gestion des tâches — spécification

**État :** préparation de la fonctionnalité, architecture en attente d'accord.

**Suivi :** [issue GitHub #3](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/3).

Cette page décrit le résultat attendu et les scénarios de validation. Elle ne décrit pas une fonctionnalité déjà disponible. Le socle actuel reste celui de l'[architecture](architecture.md) et de l'[ADR 001](decisions/001-architecture-initiale.md). La proposition de stockage et d'authentification figure dans l'issue ; elle doit recevoir l'accord explicite de Thibault avant son implémentation.

## Organisation et vocabulaire

Un **espace** regroupe des tâches autour d'un contexte personnel ou professionnel. Il possède un nom, une description, une couleur, un ordre, des sections et des statuts configurables. Il est accessible à son propriétaire authentifié.

Une **section** regroupe des tâches dans un espace. Elle possède un nom, une description, une couleur, un ordre et une visibilité : liste, kanban ou les deux. En liste, chaque section forme une liste à cocher. En kanban, chaque section forme une ligne traversant les colonnes de statut. La visibilité ne modifie ni les tâches ni leur état de résolution.

Un **statut** appartient à un espace et correspond à une colonne du kanban. Son nom, sa couleur, son ordre et son caractère ouvert ou terminé sont configurables. Un espace conserve au moins un statut ouvert et un statut terminé. Des valeurs initiales « À faire », « En cours » et « Terminé » permettent de commencer immédiatement.

Une **tâche** appartient à un espace, éventuellement à une section de cet espace, et à un statut du même espace. Elle possède un titre, une description, une priorité, une échéance facultative, des étiquettes, un ordre manuel et des dates de cycle de vie. Une zone « Sans section » permet de créer une tâche avant de l'organiser.

### Exemple des deux vues

Dans l'espace « Personnel », les sections « Maison » et « Administratif » produisent deux listes à cocher. En kanban, les mêmes données se présentent ainsi :

| Section / statut | À faire | En cours | Terminé |
| --- | --- | --- | --- |
| Maison | Réparer la lampe | Ranger le bureau | Installer l'étagère |
| Administratif | Classer les factures | Renouveler un abonnement | Envoyer le dossier |

Déplacer « Réparer la lampe » dans la colonne « Terminé » résout la tâche ; la case correspondante devient cochée en liste. Changer seulement de ligne change sa section sans modifier son état de résolution.

## Interface attendue

La référence visuelle est Todoist : navigation latérale compacte, nom de l'espace en tête de page, création rapide, séparateurs discrets, cases à cocher circulaires, cartes de kanban lisibles, actions contextuelles et panneau de détails. Conserver l'identité Life et les ressources locales du projet.

La documentation officielle de Todoist décrit les [sections en liste](https://www.todoist.com/help/todoist/features/introduction-to-sections-rOrK0aEn) et les [cartes du tableau](https://www.todoist.com/help/todoist/features/use-the-board-layout-in-todoist-AiAVsyEI). Pour Life, appliquer la demande spécifique : les sections constituent les lignes du kanban, tandis que les statuts constituent les colonnes.

Les parcours doivent couvrir :

- Création et sélection d'un espace depuis la navigation ; gestion de ses propriétés et de ses archives.
- Bascule liste/kanban, recherche et réglages d'affichage accessibles dans l'en-tête.
- Ajout rapide d'une tâche dans une section ou une cellule précise, puis édition de tous ses champs.
- Création, édition, ordre et visibilité des sections ; configuration des statuts.
- Cases à cocher et actions explicites pour terminer ou rouvrir une tâche.
- Glisser-déposer entre cellules et réordonnancement dans une cellule ; commandes de déplacement équivalentes utilisables au clavier et au tactile.
- Retour clair après chaque action, signalement d'un échec d'enregistrement et conservation du contenu saisi lorsque l'opération échoue.

Les thèmes **clair**, **sombre** et **système** doivent couvrir l'ensemble de l'interface, formulaires et menus compris. Le choix est conservé après rechargement. Les contrastes, le focus clavier, les noms accessibles, la fermeture des dialogues et le retour du focus doivent être vérifiés.

Sur mobile, la navigation se replie et le kanban peut défiler horizontalement dans sa propre zone. Les actions essentielles restent accessibles sans survol ni glisser-déposer obligatoire. Prévoir les états chargement, aucun espace, espace vide, filtre sans résultat, erreur réseau et session expirée.

## Configuration à livrer

« Configurable » couvre les réglages suivants, accessibles dans l'interface et par API. Leur persistance doit être vérifiée après rechargement et nouvelle connexion.

| Portée | Réglages |
| --- | --- |
| Utilisateur | Thème clair/sombre/système |
| Espaces | Noms, descriptions, couleurs, ordre, archivage/restauration |
| Sections | Noms, descriptions, couleurs, ordre, visibilité liste/kanban/les deux, archivage/restauration |
| Statuts | Noms, couleurs, ordre, caractère ouvert/terminé, création et suppression avec réaffectation explicite si nécessaire |
| Tâches | Titre, description, section, espace, statut, priorité, échéance, étiquettes, ordre manuel |
| Vue d'un espace | Liste/kanban, densité, affichage des tâches terminées, recherche, filtres et tri |

Les filtres portent au minimum sur le statut, la priorité, les étiquettes et l'échéance. La recherche porte sur le titre et la description. Proposer le tri manuel, par priorité et par échéance. Un tri automatique ne doit pas être silencieusement remplacé par un déplacement manuel : l'interface doit indiquer comment revenir à l'ordre manuel.

Les préférences d'affichage ne changent jamais les dates de résolution ou les relations métier. Les données absentes d'une vue restent consultables via l'API et les réglages adaptés.

## Cycle de vie et statistiques futures

La livraison prépare les données nécessaires aux statistiques ; les tableaux de bord statistiques seront développés ultérieurement.

| Action | Résultat attendu |
| --- | --- |
| Créer une tâche | Dates de création/mise à jour et événement de création |
| Passer d'un statut ouvert à un statut terminé | Date de résolution et un événement de résolution |
| Passer d'un statut terminé à un statut ouvert | Tâche rouverte et événement de réouverture ; les résolutions antérieures restent consultables |
| Passer entre deux statuts ouverts ou deux statuts terminés | Changement de statut sans nouvelle résolution ni réouverture |
| Répéter une action déjà appliquée | Aucun double événement de résolution |
| Déplacer ou renommer | Historique conservé et rattachements cohérents |
| Archiver puis restaurer | Données conservées ; aucune résolution fictive |

Conserver les horodatages en UTC et distinguer les échéances calendaires des instants de cycle de vie. Le journal doit permettre de retrouver les résolutions successives, les réouvertures et le contexte espace/section/statut au moment de l'événement, même après un déplacement ou un renommage. Ne pas recopier inutilement le texte privé des tâches dans les événements ou les journaux techniques.

Les changements de données et leurs événements doivent être enregistrés dans la même transaction. Une erreur ne doit laisser ni mouvement partiel ni événement sans modification correspondante. Les modifications simultanées doivent être traitées explicitement pour éviter les pertes silencieuses et les doublons de résolution.

L'archivage d'un espace ou d'une section masque son contenu dans les vues actives sans terminer artificiellement les tâches. La restauration rétablit l'accès aux données en conservant les tâches qui étaient déjà archivées individuellement. Toute suppression définitive future devra définir son effet sur l'historique et les sauvegardes.

Changer le caractère ouvert/terminé d'un statut utilisé ne doit pas réinterpréter silencieusement le passé. La solution devra soit refuser cette modification avec une action de réaffectation explicite, soit enregistrer individuellement les transitions concernées. La règle retenue sera décrite dans le contrat livré.

## Contrat API à réaliser

Les routes suivantes constituent un contrat proposé ; elles n'existent pas encore. Leur forme définitive, leurs schémas et leurs exemples seront publiés dans la [référence API](api.md) et OpenAPI au fil de l'implémentation.

| Ressource sous `/api/v1` | Opérations requises |
| --- | --- |
| `/auth/session` | Connexion, consultation de la session et déconnexion |
| `/preferences` | Lecture et modification des préférences utilisateur |
| `/workspaces` | Liste, création, lecture, modification, ordre et archivage/restauration |
| `/workspaces/{id}/sections` | Liste, création, modification, ordre, visibilité et archivage/restauration |
| `/workspaces/{id}/statuses` | Liste, création, modification, ordre et retrait avec réaffectation |
| `/workspaces/{id}/labels` | Gestion des étiquettes et de leur utilisation |
| `/workspaces/{id}/view` | Lecture et modification des préférences de vue |
| `/tasks` | Liste filtrée/paginée, création, lecture et modification des tâches |
| `/tasks/{id}/move` | Déplacement et positionnement atomiques |
| `/tasks/{id}/complete` et `/tasks/{id}/reopen` | Transitions explicites utilisées par les cases à cocher |
| `/tasks/{id}/events` | Consultation paginée de l'historique de cycle de vie |

L'archivage et la restauration peuvent utiliser un champ dédié dans les opérations de modification. Les opérations d'ordre doivent préciser les éléments affectés et empêcher toute référence à une ressource d'un autre propriétaire. Un déplacement entre espaces exige un statut et une section compatibles avec la destination ; le traitement des étiquettes doit être documenté.

Chaque route métier doit contrôler l'authentification et la propriété des ressources côté serveur. Une requête visant un identifiant privé d'un autre propriétaire ne doit pas révéler son contenu. Ne pas se fier à un identifiant de propriétaire envoyé par le navigateur.

Décrire les erreurs de validation (**422**), l'absence de session valide (**401**), le refus d'une protection de requête (**403**), la ressource absente ou inaccessible (**404**), les conflits de données (**409**) et la limitation de tentatives (**429**) là où elles s'appliquent. Les erreurs ne doivent exposer ni secret ni détail de connexion à la base.

Les exemples HTTP devront permettre à un client indépendant de se connecter, créer un espace et une tâche, déplacer la tâche, la terminer, la rouvrir, consulter ses événements et se déconnecter. Les routes absentes doivent continuer à renvoyer de vraies erreurs 404.

## Scénarios de recette

La présence de fichiers ou de routes ne suffit pas : vérifier le résultat de chaque parcours sur des données synthétiques.

| Scénario | Preuve attendue |
| --- | --- |
| Créer deux espaces et plusieurs sections | Lecture API et affichage après rechargement ; noms, couleurs et ordre conservés |
| Configurer une section pour chaque visibilité | Présence uniquement dans les vues sélectionnées, aucune perte de tâche |
| Cocher, décocher puis recocher une tâche | État cohérent dans les deux vues ; deux résolutions et une réouverture dans l'historique |
| Glisser une carte entre colonnes et lignes | Statut, section et ordre persistés ; même résultat par commande accessible |
| Déplacer entre espaces | Aucune référence de section/statut/étiquette incompatible ; historique conservé |
| Réordonner et configurer les statuts | Colonnes conformes après rechargement ; au moins un statut ouvert et un terminé |
| Archiver/restaurer un espace, une section, une tâche | Résolutions inchangées ; archives individuelles préservées |
| Rechercher, filtrer, trier et changer de densité | Résultats conformes et préférences persistées |
| Basculer clair/sombre/système | Interface et formulaires lisibles à 320/375 px et sur ordinateur, y compris au clavier |
| Refuser une session absente, expirée ou révoquée | Aucune lecture ni écriture métier autorisée |
| Présenter une ressource d'un autre propriétaire | Accès et mutations refusés, aucune fuite dans les réponses |
| Échouer ou réessayer une mutation | Pas de données partielles, pas de résolution dupliquée, erreur utilisable dans l'interface |
| Migrer une base vide et restaurer une sauvegarde | Schéma, contraintes et données synthétiques retrouvés sur PostgreSQL si la proposition est validée |
| Utiliser uniquement un client HTTP | Toutes les opérations métier de l'interface disponibles sans accès direct à la base |

Exécuter `make check`, `make test` et `make build`, ainsi que les tests comportementaux pertinents, avant la PR. Le changement de packaging impose également la construction Docker et les tests HTTP du conteneur lorsque l'environnement le permet. Documenter les résultats réels, réaliser une revue du diff complet et attendre la CI du dernier commit avant fusion.

## Documentation de livraison

Après l'accord d'architecture, ajouter un ADR dédié sans modifier l'ADR initial. Mettre à jour le README, l'architecture, l'évolution, la configuration et les guides backend/frontend. Décrire les modèles, contraintes, événements, sessions, erreurs et limites du système livré.

La documentation d'exploitation devra couvrir la création du compte personnel, les secrets de configuration, les migrations explicites, les sauvegardes et la restauration, ainsi que le retour arrière après évolution du schéma. Aucun secret réel ni exemple tiré des tâches personnelles ne doit être commité.

À la livraison, remplacer les éléments proposés par le contrat réellement vérifié et publier un guide utilisateur pour les espaces, sections, tâches, vues et réglages. La fusion de la PR et la mise en production restent deux opérations distinctes ; suivre le [guide de déploiement](deploiement.md) lorsqu'une publication est demandée.
