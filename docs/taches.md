# Utiliser les tâches

## Se connecter et créer un espace

Ouvrir **Tâches** dans la navigation et utiliser le compte créé par l'opérateur. La page de connexion présente les champs **Identifiant** et **Mot de passe**, puis le bouton **Se connecter**. Les erreurs s’affichent dans le formulaire. La déconnexion se trouve à côté du profil. Une session expirée demande une nouvelle connexion ; les données déjà enregistrées restent conservées.

Un espace peut représenter Personnel, Travail ou un projet. **Nouvel espace** définit son nom, sa description, sa couleur et, si souhaité, son **Espace parent**. Les trois colonnes initiales sont À faire, En cours et Terminé. Les réglages `…` à côté du titre permettent de les adapter. L'icône près de **Mes espaces** permet de réordonner les espaces ayant le même parent avec les flèches.

## Espaces parents et sous-espaces

Créer par exemple **Personnel → Voyages → Japon** en choisissant le parent dans **Nouvel espace**. La navigation affiche les enfants sous leur parent ; le chemin complet apparaît en haut de la page et dans les choix d'espace, y compris pour déplacer une tâche.

Pour déplacer un espace existant, ouvrir **Configurer l’espace → Espace**, choisir **Espace parent** puis **Enregistrer**. Choisir **Aucun — à la racine** pour le détacher. Ses sous-espaces le suivent. L'espace lui-même et ses descendants ne sont pas proposés comme parents, et le serveur refuse aussi ces cycles.

Chaque espace conserve ses propres tâches, sections, colonnes, étiquettes et préférences. Ouvrir un parent n'agrège pas les tâches de ses descendants. Le rattachement ne déplace pas les tâches et ne change ni leurs dates, ni leur historique. Plusieurs niveaux sont possibles sans limite métier de profondeur ; le retrait visuel est plafonné sur les arbres très profonds, avec le chemin complet toujours disponible.

## Voir les tâches du jour et les prochaines

**À venir**, dans la navigation, rassemble les échéances de tous les espaces actifs. C’est la vue ouverte par défaut sur `/tasks` ; un lien `?space=…` ouvre toujours l’espace indiqué. Les tâches sont regroupées par date, par ordre chronologique, avec le chemin complet de leur espace (parents inclus) et le nom de leur section. La visibilité liste/tableau d’une section ne masque rien dans cet agenda.

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

## Dates et récurrences

Dans le titre de l’éditeur **et dans l’ajout rapide**, écrire par exemple :

| Saisie | Résultat |
| --- | --- |
| `Acheter du pain demain` | « Acheter du pain », échéance demain |
| `Appeler Léa après-demain` | Échéance dans deux jours |
| `Préparer le voyage 25 décembre` | Prochain 25 décembre |
| `Courir tous les lundis et jeudis` | Deux jours choisis chaque semaine |
| `Arroser tous les 3 jours après résolution` | Un délai de trois jours après chaque résolution |
| `Budget tous les 15 du mois` | Le 15 de chaque mois |
| `Bilan chaque dernier vendredi du mois` | Le dernier vendredi mensuel |
| `Lire tous les jours à partir de demain pour 5 fois` | Cinq résolutions à partir de demain |

La détection apparaît sous le titre avant l’enregistrement et met à jour le bouton d’échéance. Les mots reconnus sont retirés du titre seulement à la sauvegarde. Le bouton **Garder ces mots dans le titre** désactive cette interprétation pour la saisie actuelle ; modifier le texte relance la reconnaissance. On peut aussi entourer une expression de guillemets doubles ou français (`Lire « demain »`). Ouvrir une tâche existante ne réinterprète pas son titre tant qu’on ne le modifie pas.

### Composer les raccourcis français

Combiner **un rythme**, **une sélection de jours**, puis éventuellement **un début**, **une fin** et **des exceptions**. Les clauses peuvent changer d’ordre : `tous les mercredis toutes les trois semaines` et `toutes les trois semaines le mercredi` produisent les mêmes dates. Regrouper les clauses dans une expression continue, avant ou après le reste du titre. Les mots métier et les numéros de dossier restent dans le titre.

Les nombres acceptent les chiffres ou les lettres, avec espaces ou traits d’union : `deux`, `vingt et un`, `vingt-et-une`, `soixante-douze`, `quatre-vingt-dix-neuf`, `deux cent vingt et un`, `mille`. Les variantes `septante`, `huitante`, `octante` et `nonante` sont aussi reconnues. Les mêmes nombres servent aux intervalles, jours du mois, durées et nombres de résolutions ; les limites de chaque réglage restent appliquées. Accents, majuscules, espaces insécables et apostrophes typographiques sont acceptés.

| Élément | Exemples combinables |
| --- | --- |
| Intervalle | `tous les deux jours`, `toutes les deux semaines`, `tous les mois`, `tous les trois ans` |
| Alternance | `un jour sur deux`, `une semaine sur trois`, `un mercredi sur trois` |
| Périodes usuelles | `chaque trimestre`, `tous les deux semestres`, `toutes les quinzaines`, `mensuellement`, `annuellement` |
| Jours hebdomadaires | `tous les lundis et jeudis`, `du lundi au vendredi`, `du vendredi au lundi`, `les week-ends` |
| Jours du mois | `tous les 21 du mois`, `les 1er et 21 de chaque mois`, `tous les mois du 1 au 5` |
| Positions | `le premier et le troisième mardi de chaque trimestre`, `le premier lundi et le dernier vendredi de chaque mois`, `chaque avant-dernier dimanche du mois` |
| Groupes de positions | `les deux derniers jours du mois`, `le dernier jour ouvré de chaque mois`, `les deux derniers jours ouvrés du mois` |
| Début ou fin de période | `chaque fin de mois`, `tous les débuts d’année`, `chaque début de semaine` (lundi), `chaque fin de semaine` (dimanche) |
| Mois et année | `les premiers lundis de janvier et juillet chaque année`, `tous les 1 et 15 janvier et juillet`, `tous les mois pairs le quinze`, `chaque centième jour de l’année` |
| Semaines ISO | `les semaines impaires le mercredi`, `les semaines numéros 2 et 10 le lundi` ; la parité suit le numéro ISO, y compris autour du nouvel an |
| Début | `à partir de demain`, `dès lundi`, `à compter du 21 janvier 2027` |
| Fin | `jusqu’au 31 décembre 2027`, `pour cinq fois`, `pendant trois mois`, `du 1 janvier 2027 au 31 mars 2027` |
| Exceptions | `sauf le week-end`, `sauf les lundis`, `sauf en août`, `sauf le 25 décembre`, `sauf du 24/12/2027 au 31/12/2027` |
| Délai après résolution | `tous les trois jours après résolution`, `un mois sur deux après chaque réalisation` |

`Deux fois par semaine` nécessite des jours explicites : `deux fois par semaine le lundi et le jeudi`. Le nombre doit correspondre à la sélection. De même, `deux fois par mois les 1er et 21` ou `deux fois par an les 1er janvier et 1er juillet`. `Une fois toutes les trois semaines le mercredi` définit un rythme, pas une série limitée à une résolution. Les dates inexistantes et exclusions peuvent réduire le nombre effectif d’occurrences dans une période ; l’aperçu le montre.

Exemple complet : `Préparer le bilan tous les mercredis toutes les trois semaines à partir du 1 janvier 2027 pour quatre fois sauf le 27 janvier 2027` donne les 6 janvier, 17 février, 10 mars et 31 mars. Sans début explicite, la date locale du navigateur sert de borne initiale. Lorsqu’un intervalle est associé à des jours précis, la première date compatible fixe la phase : un mercredi toutes les trois semaines commence au prochain mercredi du calendrier, puis avance de trois semaines. Les exceptions ne déplacent pas cette phase. Par exemple, `tous les trois jours sauf le week-end` retire les samedis et dimanches du rythme initial sans repartir du lundi suivant. Une date annuelle ne devient pas mensuelle lorsqu’on exclut un mois.

Les jours et mois exclus filtrent les candidats avant les positions : `le dernier jour ouvré du mois sauf les vendredis` retient le dernier jour du lundi au jeudi. Les **dates** exclues sont retirées après le choix des positions : exclure la date du dernier jour ouvré supprime cette occurrence sans la remplacer par la veille.

Une durée de trois mois court depuis le début demandé jusqu’à la veille de cette date trois mois plus tard ; une fin écrite avec `jusqu’au` est incluse. Les dates sans année désignent leur prochaine occurrence à partir du début pour les fins et exceptions. Une fin par durée/date ne se combine pas avec une fin par nombre de résolutions. Le compteur porte toujours sur les résolutions, pas sur les retards sautés.

La détection montre les trois prochaines dates. **Les raccourcis en français** ouvre l’aide dans le titre et le planificateur ; dans ce dernier, cliquer un exemple le place dans le champ à interpréter. L’analyse et l’aperçu passent par le serveur, comme les réglages manuels.

Pendant une saisie comme `tous les mercredis toutes les trois`, aucune partie du calendrier n’est appliquée. Une explication demande de compléter le rythme. Deux intervalles contradictoires, une sélection entièrement exclue ou une date impossible sont également expliqués. Corriger la saisie, choisir le calendrier manuellement ou cliquer **Garder le texte** pour enregistrer les mots tels quels. Un texte ordinaire comme `Acheter les trois pommes` reste littéral.

Une tâche conserve une seule règle calendaire. Des calendriers indépendants tels que `tous les 1er janvier et 15 juillet` ne sont pas transformés en quatre dates par croisement : l’analyse demande des tâches distinctes. Mélanger des jours avec et sans position (`les lundis et le dernier vendredi du mois`), ou une position dans l’année avec un mois exclu (`le premier lundi de chaque année sauf en août`), demande également des calendriers distincts ou une sélection plus précise. Même refus explicite pour `deux jours sur trois`, un intervalle comptant les seuls jours ouvrés, les heures/minutes, les jours fériés automatiques ou les expressions ambiguës telles que `bimensuel`. Ces cas n’appliquent jamais silencieusement une règle plus simple. Les répétitions calendaires usuelles et leurs compositions ci-dessus restent disponibles sans service d’IA.

### Utiliser le planificateur

Le planificateur **Échéance et récurrence** propose :

- **Date** : aujourd’hui, demain, lundi prochain, calendrier ou saisie `25/12/2026`/`2026-12-25`. Les flèches parcourent les jours, Début/Fin la semaine, Page précédente/suivante le mois et Entrée choisit le jour. Échap referme d’abord le calendrier et rend le focus au bouton.
- **Répéter** : intervalle de 1 à 1000 jours, semaines, mois ou années ; plusieurs jours hebdomadaires ; un ou plusieurs jours du mois (par exemple `1,15,-1`) ; premier, deuxième, dernier ou avant-dernier jour de semaine ; dernier jour ouvré (lundi–vendredi) ; plusieurs mois annuels.
- **Fin** : jamais, une date incluse ou un nombre de résolutions incluant la première. Les occurrences sautées pour retard ou exclusion ne comptent pas comme résolues.
- **Exceptions et réglages avancés** : dates exclues, fuseau horaire et règle calendaire RRULE pour des combinaisons plus spécifiques (positions, semaines ou jours de l’année). Un aperçu serveur vérifie les réglages avant **Appliquer la récurrence**.

Choisir une date ou appliquer la règle, puis enregistrer la tâche. Tant que le planificateur est ouvert, le bouton de sauvegarde attend cette sélection ; recliquer son bouton le referme en abandonnant les changements non appliqués. **Ne plus répéter** conserve la date en cours ; **Sans échéance ni récurrence** retire les deux. Une série exige toujours une échéance.

**Calendrier fixe** conserve son ancre : terminer une tâche en retard prépare la première date du calendrier strictement après l’échéance et le jour local de résolution. Les retards intermédiaires ne génèrent pas de fausses résolutions. **Après résolution** calcule le prochain délai depuis le jour où la tâche est effectivement terminée ; ce mode utilise un simple intervalle, sans jours de semaine imposés. Son aperçu suppose les résolutions aux dates prévues et reste indicatif. Le fuseau initial est celui du navigateur ; le changer dans les réglages permet de garder un calendrier stable en voyage.

Les dates inexistantes sont sautées : le 31 mensuel passe de janvier à mars, le 29 février annuel attend une année bissextile. Utiliser **dernier jour** (`-1`) pour couvrir tous les mois. Dans les raccourcis, **jours ouvrés** sélectionne lundi–vendredi et **jours ouvrables** lundi–samedi ; les week-ends sélectionnent samedi–dimanche. Ces sélections n’intègrent pas automatiquement les jours fériés ni les horaires d’une entreprise ; ajouter les dates d’exception. Voir la [distinction usuelle des termes](https://www.service-public.gouv.fr/particuliers/vosdroits/F35697). Les règles déjà enregistrées conservent leurs jours sans réinterprétation.

Cocher une tâche récurrente résout son occurrence et la remet dans son statut ouvert avec sa prochaine date. Changer son statut ou la déplacer dans une colonne terminée produit le même résultat. La dernière occurrence reste terminée. Le message confirme la prochaine date et **Annuler la résolution** restaure la date précédente tant qu’aucune nouvelle modification n’est intervenue. L’historique conserve la résolution et son annulation, sans effacer de données.

Modifier uniquement la date reporte l’occurrence en cours en conservant l’ancre. Modifier la règle recommence son compteur de résolutions, en conservant tous les événements passés. Une règle réappliquée à l’identique conserve la date en cours. Archiver/restaurer conserve règle, compteur, date et historique ; rien ne s’exécute en arrière-plan. Les listes, le kanban et l’agenda présentent l’occurrence courante, pas une copie de toutes les dates futures.

La reconnaissance est déterministe et française, sans appel à un service d’IA : une expression inconnue reste du texte. Les échéances restent des jours calendaires : les répétitions à l’heure/minute, notifications et calendriers de jours fériés ne font pas partie de cette fonction.

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

La synchronisation entre onglets n'est pas instantanée : recharger pour consulter les changements externes. Aucun mode hors connexion, partage, rappel, pièce jointe ou tableau statistique n'est inclus. Toutes les fonctions présentées sont accessibles par [API](api.md).
