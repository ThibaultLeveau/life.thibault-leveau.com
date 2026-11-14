# Utiliser les tâches

## Se connecter et créer un espace

Ouvrir **Tâches** dans la navigation et utiliser le compte créé par l'opérateur. La page de connexion présente les champs **Identifiant** et **Mot de passe**, puis le bouton **Se connecter**. Les erreurs s’affichent dans le formulaire. La déconnexion se trouve à côté du profil. Une session expirée demande une nouvelle connexion ; les données déjà enregistrées restent conservées.

Un espace peut représenter Personnel, Travail ou un projet. **Nouvel espace** définit son nom, sa description, sa couleur et, si souhaité, son **Espace parent**. Les trois colonnes initiales sont À faire, En cours et Terminé. Les réglages `…` à côté du titre permettent de les adapter. L'icône près de **Mes espaces** permet de réordonner les espaces ayant le même parent avec les flèches.

## Espaces parents et sous-espaces

Créer par exemple **Personnel → Voyages → Japon** en choisissant le parent dans **Nouvel espace**. La navigation affiche les enfants sous leur parent ; le chemin complet apparaît en haut de la page et dans les choix d'espace, y compris pour déplacer une tâche.

Pour déplacer un espace existant, ouvrir **Configurer l’espace → Espace**, choisir **Espace parent** puis **Enregistrer**. Choisir **Aucun — à la racine** pour le détacher. Ses sous-espaces le suivent. L'espace lui-même et ses descendants ne sont pas proposés comme parents, et le serveur refuse aussi ces cycles.

Chaque espace conserve ses propres tâches, sections, colonnes, étiquettes et préférences. Ouvrir un parent n'agrège pas les tâches de ses descendants. Le rattachement ne déplace pas les tâches et ne change ni leurs dates, ni leur historique. Plusieurs niveaux sont possibles sans limite métier de profondeur ; le retrait visuel est plafonné sur les arbres très profonds, avec le chemin complet toujours disponible.

## Voir les tâches du jour et les prochaines

**À venir**, dans la navigation, rassemble les échéances de tous les espaces actifs. C’est la vue ouverte par défaut sur `/tasks` ; un lien `?space=…` ouvre toujours l’espace indiqué. Les tâches sont regroupées par date, par ordre chronologique, avec le nom de leur espace et de leur section. La visibilité liste/tableau d’une section ne masque rien dans cet agenda.

- **Aujourd’hui** : tâches datées du jour local.
- **Demain** : tâches du lendemain.
- **Semaine** : aujourd’hui et les six jours suivants, même à cheval sur deux semaines civiles.
- **Personnalisé** : de 1 à 90 jours dès aujourd’hui ; saisir **Nombre de jours**, puis **Appliquer** (14 par défaut).

**Inclure les retards**, activé par défaut, ajoute un groupe séparé avec les tâches non terminées antérieures à aujourd’hui, quelle que soit la période. **Afficher les tâches terminées**, désactivé par défaut, montre les tâches terminées dont l’échéance appartient à la période ; les anciennes tâches terminées ne deviennent jamais des retards. La période, l’horizon et ces deux options sont enregistrés dans le compte, après rechargement et reconnexion.

Cliquer sur une tâche ouvre ses détails pour modifier sa date, consulter son historique, la déplacer ou l’archiver. La case permet de terminer ou rouvrir ; la liste se recharge ensuite. Le nom d’espace sur une tâche ramène à cet espace. Les tâches sans échéance et celles archivées (ou dans une section/espace archivé) sont exclues ; elles restent accessibles dans leurs espaces et archives.

Les dates utilisent le calendrier et le fuseau du navigateur. Une page ouverte se met à jour au passage à minuit et au retour dans l’onglet. Aucun rappel ou horaire n’est créé.

### Dates sur les tickets

Les listes, le kanban et l’agenda partagent le même affichage : **Hier**, **Aujourd’hui**, **Demain**, **Après-demain**, puis le nom du jour du troisième au sixième jour, ou une date courte. Une date courte affiche aussi l’année si elle diffère de celle du jour courant. Survoler la date donne sa forme complète, aussi annoncée aux lecteurs d’écran.

| Échéance d’une tâche ouverte | Couleur |
| --- | --- |
| Passée | Rouge et mention « En retard » |
| Aujourd’hui | Vert |
| Demain | Ocre |
| Dans 2 à 6 jours | Violet |
| Plus lointaine | Neutre |

Les tâches terminées gardent une date neutre, sans alerte de retard. Les couleurs s’adaptent aux thèmes clair et sombre ; le sens ne repose pas uniquement sur la couleur.

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

Avant d'archiver un espace parent, archiver ou déplacer ses sous-espaces actifs. L'archivage n'est pas automatique en cascade. Dans **Archives des espaces**, restaurer d'abord le parent, puis les enfants souhaités : le bouton d'un enfant reste désactivé tant que son parent est archivé. Un nouvel espace ou un déplacement ne peut pas cibler un parent archivé.

## Erreurs et limites

Un échec de sauvegarde affiche un message et conserve le formulaire. Si la tâche a changé dans un autre onglet, le serveur refuse l'édition : **Recharger la tâche enregistrée** récupère la version actuelle ; recopier au préalable toute saisie à conserver. Les actions d'ordre ou de déplacement nécessitent également une version actuelle.

La synchronisation entre onglets n'est pas instantanée : recharger pour consulter les changements externes. Aucun mode hors connexion, partage, rappel, récurrence, pièce jointe ou tableau statistique n'est inclus. Toutes les fonctions présentées sont accessibles par [API](api.md).
