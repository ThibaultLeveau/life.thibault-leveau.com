# Utiliser les tâches

## Se connecter et créer un espace

Ouvrir **Tâches** dans la navigation et utiliser le compte créé par l'opérateur. La déconnexion se trouve à côté du profil. Une session expirée demande une nouvelle connexion ; les données déjà enregistrées restent conservées.

Un espace peut représenter Personnel, Travail ou un projet. **Nouvel espace** définit son nom, sa description et sa couleur. Les trois colonnes initiales sont À faire, En cours et Terminé. Les réglages `…` à côté du titre permettent de les adapter. L'icône près de **Mes espaces** permet de réordonner les espaces avec les flèches.

## Sections, listes et lignes

**Ajouter une section** ouvre les réglages des sections. Choisir nom, couleur, description et visibilité :

- **Liste et tableau** : une liste à cocher et une ligne du kanban.
- **Liste uniquement** : une liste, absente du tableau.
- **Tableau uniquement** : une ligne du tableau, absente de la liste.

La zone **Sans section** reste disponible. Une section masquée dans une vue conserve toutes ses tâches. Les flèches dans les réglages changent l'ordre des sections.

| Section / statut | À faire | En cours | Terminé |
| --- | --- | --- | --- |
| Maison | Réparer une lampe | Ranger le bureau | Installer l'étagère |
| Administratif | Classer les factures | Préparer un dossier | Envoyer le formulaire |

Les **colonnes** sont les statuts : changer de ligne change la section ; changer de colonne change le statut. L'onglet Colonnes permet de créer, renommer, colorer et réordonner les statuts. Cocher « Les tâches de cette colonne sont terminées » définit le sens du statut, pas seulement son apparence.

Un espace garde au moins une colonne ouverte et une terminée. Le type d'une colonne utilisée ne peut pas changer : créer la colonne voulue puis déplacer les tâches. Pour retirer une colonne utilisée, choisir un remplacement du même type ; cela préserve les résolutions existantes.

## Créer et modifier une tâche

**Nouvelle tâche** ou **Ajouter une tâche** ouvre l'éditeur. L'ajout rapide dans une liste ou une cellule utilise directement sa section et son statut. Une tâche comporte titre, description, priorité de P1 urgente à P4 sans priorité, échéance facultative et étiquettes.

Cliquer sur le titre ou sur `…` ouvre les détails. Les étiquettes se créent dans les réglages de l'espace puis se sélectionnent dans la tâche. Les noms d'étiquettes sont propres à chaque espace.

Cocher termine la tâche dans le premier statut terminé de l'ordre configuré. Décocher la rouvre dans le premier statut ouvert. Déplacer une carte vers une colonne terminée produit le même effet. **Historique** montre créations, modifications, déplacements, résolutions, réouvertures et archives ; les anciennes résolutions restent présentes.

## Déplacer et ordonner

En **ordre manuel**, saisir la poignée à gauche d'une tâche puis la déposer sur une carte pour la placer avant, ou dans une cellule pour l'ajouter à la fin. Le tableau accepte les déplacements entre colonnes et lignes. La liste permet de changer l'ordre et la section sans changer le statut.

L'action **Déplacer et réordonner** dans les détails propose les mêmes réglages sans glisser-déposer, y compris vers un autre espace. Choisir espace, section, statut et position. Les étiquettes sont reprises dans l'espace cible ; l'historique suit la tâche.

Le clavier permet de parcourir les actions, de fermer un dialogue avec Échap et d'utiliser les flèches dans les onglets de réglages. Une poignée prend la tâche avec Espace, la déplace avec les flèches et la dépose avec Espace ; la commande de déplacement reste l'alternative précise, également sur mobile.

## Affichage et filtres

**Liste / Tableau** change la disposition. **Filtres** sélectionne statut, priorité, étiquette et échéance. La recherche porte sur le titre et la description (`Ctrl+K` ou `⌘K` donne le focus). **Afficher** choisit densité, tâches terminées et tri manuel, priorité ou échéance.

Un tri automatique désactive les poignées ; le message au-dessus des tâches permet de revenir à l'ordre manuel. Les réglages sont conservés par espace, après rechargement et reconnexion. Une recherche active peut masquer une nouvelle tâche qui ne lui correspond pas : effacer les filtres pour tout retrouver.

Le thème, sous la navigation, suit le système ou impose clair/sombre. Il est enregistré dans le compte. Sur mobile, le bouton de menu ouvre les espaces ; le tableau défile horizontalement dans sa zone.

## Archiver et restaurer

Archiver une tâche dans ses détails. L'onglet **Archives** des réglages restaure tâches et sections. Restaurer d'abord une section archivée, puis ses tâches archivées individuellement si nécessaire. Une tâche seulement masquée par l'archive de sa section redevient visible avec celle-ci.

Les réglages de l'espace permettent de l'archiver. **Archives des espaces** dans la navigation permet de le restaurer. Aucune de ces opérations ne termine une tâche ni n'efface son historique.

## Erreurs et limites

Un échec de sauvegarde affiche un message et conserve le formulaire. Si la tâche a changé dans un autre onglet, le serveur refuse l'édition : **Recharger la tâche enregistrée** récupère la version actuelle ; recopier au préalable toute saisie à conserver. Les actions d'ordre ou de déplacement nécessitent également une version actuelle.

La synchronisation entre onglets n'est pas instantanée : recharger pour consulter les changements externes. Aucun mode hors connexion, partage, rappel, récurrence, pièce jointe ou tableau statistique n'est inclus. Toutes les fonctions présentées sont accessibles par [API](api.md).
