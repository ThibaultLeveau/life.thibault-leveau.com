# Sport

Sport est disponible dans la [bibliothèque LifeOS](applications.md). Activez **Sport**, puis ouvrez l’application. Elle partage la connexion, le thème et les commandes accessibles de LifeOS. Sa navigation latérale reprend l’organisation de Tâches ; sur mobile, le bouton de navigation ouvre les mêmes onglets.

## Exercices prêts à utiliser

Le catalogue fournit **680 exercices en français**, couvrant musculation, poids du corps, cardio, gymnastique, portés, mobilité, étirements et mouvements chronométrés. Recherchez par nom, muscle ou matériel, avec ou sans accents, puis filtrez par type. Il n’y a aucun import à effectuer ni compte externe à connecter.

**Nouvel exercice** crée votre propre mouvement. **Personnaliser** copie les caractéristiques d’un exercice fourni dans un exercice personnel : vous pouvez changer son nom, son type, son matériel et ses notes. Le catalogue commun reste stable. Les exercices personnels se modifient et s’archivent ; l’affichage des archives permet de les restaurer.

| Type | Mesures par série | Exemples |
| --- | --- | --- |
| Charge et répétitions | kg et répétitions | Développé couché, squat, soulevé de terre |
| Poids du corps / répétitions | répétitions | Pompes, burpees, tractions |
| Répétitions avec assistance | assistance en kg et répétitions | Tractions, dips sur machine assistée |
| Maintien / durée | secondes | Planche, chaise, étirement |
| Distance et durée | mètres et secondes | Course sur tapis, vélo, natation, rameur |
| Charge et distance | kg et mètres | Farmer carry, traîneau, marche lestée |
| Charge et durée | kg et secondes | Maintien du fermier, planche lestée |
| Répétitions chronométrées | répétitions et secondes | Burpees chronométrés, corde à sauter |
| Distance seule | mètres | Saut en longueur, marche sur les mains |
| Énergie machine et durée | kcal affichées et secondes | Air bike, rameur, SkiErg |

Les types décrivent des **mesures**, pas une liste fermée de sports. Un même mouvement peut avoir plusieurs variantes de saisie. Les calories sont celles affichées par la machine : aucune estimation physiologique n’est calculée. Les champs inadaptés à un type sont refusés par le serveur. Utiliser la **charge totale**, barre comprise et deux haltères additionnés ; noter l’assistance affichée pour une machine assistée. Pour un élastique sans assistance chiffrable, choisir le type répétitions et préciser la résistance dans les notes.

## Préparer et lancer une séance

Dans **Séances**, choisir **Nouvelle séance**, donner un nom, ajouter des exercices et indiquer leur nombre de séries. Les cibles par série sont facultatives. Les flèches changent l’ordre ; la croix retire un exercice du brouillon. Une séance accepte jusqu’à 50 exercices et 300 séries au total, avec 1 à 30 séries par exercice.

**Lancer la séance** démarre un entraînement avec un instantané des exercices, types et cibles. Un compte ne peut avoir qu’un entraînement actif. **Reprendre** ou l’onglet **Entraînement** ramène aux séries. Le brouillon d’un formulaire n’est enregistré qu’à sa validation.

1. Ouvrir une série, saisir le résultat réellement effectué et choisir **Valider la série**.
2. Le repos démarre automatiquement. Sa durée se règle dans **Réglages**, entre 0 et 3 600 secondes ; le défaut est 90 secondes. Une nouvelle durée concerne la prochaine validation, sans modifier un repos en cours.
3. Le compte à rebours utilise une échéance serveur et reste correct après rechargement ou retour du navigateur en arrière-plan. **Passer le repos** l’arrête. Il n’y a pas de notification système ni d’alarme sonore.
4. Une série validée peut être corrigée sans relancer le repos ni changer sa date de validation. **Annuler la validation** retire son résultat et arrête le repos. Les valeurs de la série précédente servent de proposition pour la suivante.
5. Après toutes les séries, **Terminer l’entraînement** enregistre les résultats et calcule le score. Les notes accueillent le ressenti. **Abandonner** conserve les séries dans l’historique, sans statistiques ni score.

Une session terminée ou abandonnée est conservée et ne se modifie plus. Modifier ou archiver la séance d’origine ne change pas les sessions existantes. Avant un nouveau lancement, les exercices personnels doivent être actifs ; si leur type a changé, adapter les objectifs de la séance. Le bouton **Actualiser l’entraînement** permet de retrouver la version serveur après une modification depuis un autre appareil. Une version obsolète produit un conflit explicite, sans écraser les données.

## Mensurations

Dans **Mensurations**, ajouter un relevé daté : poids, masse grasse, cou, épaules, poitrine, taille, hanches, bras, cuisses et mollets gauche/droit. Un seul champ suffit. Un compte conserve un relevé actif par date ; les dates futures sont refusées selon le jour UTC du serveur. Modifier le relevé pour le compléter ou corriger une saisie. L’archivage retire le relevé des graphiques et reste réversible. Une restauration est refusée si un autre relevé actif utilise déjà cette date.

## Statistiques et score

**Statistiques** présente les sessions terminées, le nombre de séries, le volume réellement soulevé (kg × répétitions) et la distance totale. Choisir la période, une mensuration, un exercice et une famille de séances comparables. Les graphiques proposent aussi un tableau de valeurs, utilisable au clavier et par lecteur d’écran. L’axe horizontal suit les observations dans leur ordre chronologique ; leur espacement n’exprime pas une durée. La période est inclusive et utilise les dates UTC des entraînements, sur un an par défaut et dix ans au maximum.

Le score est un indicateur descriptif, **pas une note de santé ou de technique**. La première session terminée d’une séance vaut **100**. Les suivantes calculent, pour chaque exercice, le rapport entre la performance actuelle et la référence, puis la moyenne de ces rapports × 100. Chaque exercice a le même poids. Par exemple, 120 et 80 représentent une progression ou une baisse moyenne de 20 % selon ces mesures.

| Type | Performance comparée |
| --- | --- |
| Charge et répétitions | somme de `(charge + 1) × répétitions` |
| Répétitions | somme des répétitions |
| Assistance | somme de `répétitions / (assistance + 1)` |
| Durée | durée totale |
| Distance et durée | distance totale / durée totale (m/s) |
| Charge et distance | somme de `(charge + 1) × distance` |
| Charge et durée | somme de `(charge + 1) × durée` |
| Répétitions chronométrées | répétitions totales / durée totale × 60 |
| Distance seule | distance totale |
| Énergie et durée | énergie affichée totale / durée totale × 60 |

Le `+ 1` permet de comparer les charges ou assistances nulles ; ces valeurs sont des points de comparaison, distincts du volume réel en kg. Une vitesse supérieure sur une distance plus courte peut augmenter le score cardio : consulter aussi les distances. Une durée d’étirement plus longue ne signifie pas un meilleur exercice pour la santé.

Une référence n’est partagée que par les sessions d’une même séance, avec les mêmes identifiants d’exercices, types, ordre et nombres de séries. Changer les cibles ne change pas la famille. Changer la structure crée une autre référence. Les scores et leurs métriques sont enregistrés à la fin et ne sont pas recalculés rétroactivement. Aucun score n’est attribué à une session abandonnée.

## Conservation et limites

Désactiver Sport conserve séances, exercices personnels, séries, échéances de repos, historique, réglages et mensurations. Réactiver restitue ces données ; un repos écoulé apparaît terminé. L’archivage est réversible et aucune suppression définitive n’est proposée. Les données restent privées au compte.

Le catalogue est embarqué, sans images, vidéos, coaching ou requête réseau externe. Les données métier passent exclusivement par l’API ; pas de stockage métier dans le navigateur, de mode hors ligne ou de synchronisation instantanée entre appareils. Les listes d’exercices et de sessions sont paginées ; séances et mensurations sont chargées intégralement. La statistique sur dix ans peut être volumineuse pour un très grand historique.

## Catalogue et provenance

Le catalogue français est une sélection éditoriale versionnée dans `apps/sport/catalogue.json`, constituée à partir de la nomenclature courante des mouvements et de la consultation du [jeu public free-exercise-db](https://github.com/yuhonas/free-exercise-db) le 14 novembre 2026 ([licence Unlicense](https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md)). Il comporte des variantes nommées pour le matériel, la prise, l’unilatéral, les sports d’endurance et les types de mesure. Il ne prétend pas recenser tous les exercices possibles. Les textes d’instructions et images de ce jeu ne sont pas importés. Les noms et la classification français sont propres à cette livraison ; le catalogue consulté ne définit pas notre formule de score.

Les identifiants `builtin-…` de cette version sont stables ; toute correction de libellé doit préserver l’identifiant. Les exercices personnels utilisent des UUID. Ajouter un exercice au catalogue demande une livraison, sans migration des données privées. Voir l’[API Sport](sport-api.md), le [modèle de données](donnees.md#sport) et les [sauvegardes](sauvegardes.md#migration-0006-sport).
