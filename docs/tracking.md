# Suivi : habitudes et objectifs

[English guide](en/tracking.md)

Activez **Suivi** dans la bibliothèque, puis ouvrez `/tracking`. L’application partage la navigation, le compte, la langue et le thème de Sport. Elle est désactivée par défaut ; la désactiver conserve toutes vos données.

## Composer votre suivi

Dans **Mes suivis → Créer un suivi**, choisissez un nom, un premier jour et une fréquence : quotidien, hebdomadaire (lundi–dimanche), mensuel ou annuel. Le fuseau IANA, par exemple `Europe/Paris`, définit vos journées, même pendant un changement d’heure. Les réglages de l’application définissent le fuseau du tableau de bord et le défaut des nouveaux suivis.

Ajoutez jusqu’à 30 données :

| Type | Exemple | Saisie |
| --- | --- | --- |
| Nombre | Eau bue, pages lues | Valeur décimale et unité libre |
| Oui / Non | Sortir marcher | Deux grandes commandes ; Non est une réponse |
| Durée | Lecture, sommeil | Heures et minutes ; conservation en minutes |
| Échelle | Énergie de 0 à 10 | Boutons si l’intervalle comporte au plus 11 entiers |
| Choix | Humeur | De 2 à 20 choix personnels |
| Note | Ce que je retiens | Texte, jusqu’à 4 000 caractères |

Une donnée peut être facultative. Pour les suivis quotidiens, cochez ses jours : par exemple une marche le lundi et le mardi, et l’eau chaque jour. Les autres fréquences demandent une saisie par période, sans répétition quotidienne des champs. Un jour sans donnée prévue est un jour de repos.

Vous pouvez fixer un objectif : au moins, au plus, entre deux bornes ou exactement. L’écart qui donne 0/10 contrôle la progression du score ; l’importance permet de pondérer chaque objectif. Exemple : au moins 2 litres, écart 2 litres → 0 litre = 0/10, 1 litre = 5/10, 2 litres ou plus = 10/10. Pour Oui/Non et Choix, réussir vaut 10, l’autre réponse vaut 0. Les notes n’ont pas de score.

## Relier Tâches ou Sport

Choisissez **Depuis une application**, puis l’application et une mesure. La recherche porte sur les noms et descriptions. Choisissez la période du suivi ou une journée, semaine, mois ou année autour du jour de saisie. Ajoutez les filtres proposés, cherchez leurs valeurs et calculez un aperçu avant de sélectionner la mesure.

Exemples :

- Tâches terminées cette semaine, dans un espace donné, avec une échéance dépassée lors de la résolution.
- Nombre de changements manuels d’échéance aujourd’hui, pour les tâches reportées plus de trois fois **dans cette période et ces filtres**.
- Entraînements terminés ce mois-ci pour un programme, ou séries d’un exercice particulier.
- Volume soulevé, durée enregistrée, distance, dernière mensuration ou variation entre deux mesures.

Les applications sources doivent être activées. Les filtres restent limités à vos propres espaces, programmes et exercices. Une valeur absente ou une source indisponible n’est pas zéro. Les métriques d’état actuel, comme les tâches actuellement ouvertes, ne reconstituent pas le passé ; elles sont signalées dans le sélecteur.

L’activité mesurée correspond aux actions et résultats enregistrés dans les applications. Le temps d’écran, le nombre de visites et la durée passée dans les pages ne sont pas collectés. Consultez le [catalogue détaillé des intégrations](integrations.md) pour les calculs et limites de chaque mesure.

## Votre moment de suivi

**Aujourd’hui** regroupe les périodes en cours des quatre fréquences. **Commencer** ouvre une saisie guidée, une donnée à la fois. **Enregistrer et continuer** conserve un brouillon ; **Enregistrer et fermer** permet de reprendre plus tard. **Terminer le suivi** exige les réponses obligatoires et au moins une valeur. Zéro et Non sont valides.

Les mesures automatiques sont calculées par le serveur lors de l’enregistrement initial. Une saisie enregistrée garde ses valeurs et sa provenance : une tâche résolue plus tard ne modifie pas silencieusement le résultat. **Actualiser les données automatiques** recalcule les sources à la prochaine sauvegarde. Cette correction apparaît dans l’historique, comme les modifications manuelles. Si la source est indisponible, une donnée obligatoire empêche de terminer ; les anciennes valeurs restent consultables sans actualisation.

Une erreur de sauvegarde conserve le formulaire et affiche le problème. Une modification concurrente provoque un conflit : rechargez la saisie et reportez votre correction. L’interface prévient avant de quitter une saisie modifiée. Aucun brouillon métier n’est stocké dans le navigateur ; déconnexion ou expiration retirent les données privées.

## Lire le calendrier

La vue **Mois** montre simultanément :

- Le résultat sur 10, du rouge au vert en passant par l’ambre.
- La coche et le nombre de suivis terminés : une saisie complète peut avoir **0/10**.
- Les jours sans saisie en pointillés, les saisies partielles et les jours sans suivi prévu.

Choisissez un jour pour voir les réponses et reprendre une saisie passée. Les flèches du clavier naviguent entre les jours ; Début/Fin naviguent dans la semaine. La vue **Année** affiche douze mini-calendriers ; choisir un mois revient à son détail. Le filtre permet de retrouver aussi les suivis archivés. Sur mobile, le détail vient sous la grille et les commandes restent accessibles sans défilement horizontal de la page.

Les suivis hebdomadaires, mensuels et annuels apparaissent dans **Les objectifs au long cours**. Ils ne rendent pas artificiellement tous les jours d’un mois verts. Les couleurs quotidiennes portent sur les suivis quotidiens prévus ce jour-là.

Le score est la moyenne pondérée des objectifs. Sans aucune réponse évaluée, il reste inconnu (`—`). Une réponse obligatoire manquante contribue provisoirement pour zéro ; les objectifs facultatifs sans réponse sont exclus. Un score 10 est réservé aux objectifs effectivement atteints. Le score moyen des statistiques est la moyenne des saisies ayant un score, toutes fréquences confondues ; la régularité rapporte les périodes terminées aux périodes attendues, même encore en cours.

## Progresser et conserver l’historique

Les statistiques montrent vos mesures dans le temps et une table des valeurs. Vous pouvez explorer une mesure de Tâches ou Sport sur la période choisie. Les réussites donnent 10 XP par période terminée, plus jusqu’à 20 XP pour les objectifs, et un niveau tous les 250 XP. Cinq badges récompensent la première saisie, 7, 30, 100 périodes terminées et 10 périodes parfaites. Une correction recalcule les points : enregistrer plusieurs fois ne crée pas de récompenses supplémentaires. La série quotidienne et sa meilleure longueur sont calculées sur les 366 derniers jours ; les jours de repos ne la cassent pas et la journée en cours inachevée attend sa fin.

Les saisies existantes gardent leur définition et leurs objectifs. Les changements s’appliquent aux nouvelles périodes : au plus tôt le jour local de modification, ou à la prochaine période pour un suivi déjà commencé. Pour éviter de mélanger des historiques différents, fréquence, premier jour et fuseau ne se modifient pas ; créez un autre suivi pour les changer. Changer le type ou l’unité d’une donnée crée une nouvelle série de mesures.

**Archiver** retire un suivi des périodes à remplir, sans supprimer ses saisies. **Archives → Restaurer** le réactive. Le calendrier conserve les périodes passées et les périodes longues déjà commencées ; les nouvelles périodes respectent les dates d’archive/restauration. Les suivis actifs se réordonnent avec Monter/Descendre. Jusqu’à 50 suivis peuvent être actifs. Il n’y a pas de suppression définitive dans l’interface ou l’API.

Toutes ces opérations sont accessibles par l’[API versionnée](tracking-api.md). Le calendrier et les tendances acceptent au plus 367 jours par requête ; les séries/entrées lues et les évaluations de métriques sont bornées à 20 000 éléments. Les données et leurs historiques sont inclus dans les [sauvegardes PostgreSQL](sauvegardes.md#migration-0009-suivi).
