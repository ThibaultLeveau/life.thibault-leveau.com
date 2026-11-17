# Finition Sport — suivi des 39 améliorations

Cette livraison met en œuvre les suites de la [revue du 17 novembre 2026](revue-sport-2026-11-17.md), autorisées dans l’[issue #74](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/74). Les réglages Sport s’intègrent au panneau `/settings?application=sport` de l’ADR 007, avec les gardes communes de brouillon et d’écriture. Les guides [Sport](sport.md), [Sport en anglais](en/sport.md) et [API](sport-api.md) décrivent les contrats livrés. L’audit original conserve ses constats et ses mesures historiques.

| Point | Comportement livré | Vérification principale |
| --- | --- | --- |
| 01 | Protection des brouillons d’exercice, relevé, réglages et notes de fin | Fermeture refusée, navigation, langue et déconnexion |
| 02 | Fermeture bloquée pendant une écriture ; résultat réconcilié | Réponse retardée, Échap, un seul objet créé |
| 03 | Champs de série en lecture seule pendant sauvegarde ; pagination garde le focus | Entrée, correction, annulation, pages au clavier |
| 04 | Comparaison des versions, reprise explicite et copie de brouillon | Conflit réel par second client et vérification API |
| 05 | Accent clair commun plus contrasté | Matrice commune et analyses de contraste |
| 06 | Liste/grille par rubrique et par format, préférences API partielles | Rechargement, changement de largeur, conservation du repos |
| 07 | Trois exercices d’aperçu au maximum ; détail complet ; rangées indépendantes | Programmes de 1/4/12/50 exercices, noms longs |
| 08 | Filtres, pages et sélections dans l’URL ; position conservée au retour | Changement de rubrique, retour navigateur et rechargement |
| 09 | Recherche après 250 ms sans frappe ; résultats précédents maintenus | Frappe rapide, réponse différée et réponses obsolètes |
| 10 | Comparaison des valeurs normalisées avec l’origine du brouillon | 40 → 41 → 40 ne bloque plus la fin |
| 11 | Date UTC fournie par le serveur dans les réglages | Contrat UTC et formulaire hors fuseau serveur |
| 12 | Validation locale et erreurs de champs, focus au premier champ invalide | Nom blanc, limites, champs imbriqués et erreurs serveur |
| 13 | Recherche, tri, dernière séance et duplication de programmes | Contrats propriétaires et copie sans historique |
| 14 | Catalogue paginé et sélection conservée entre pages ; ajout individuel ou multiple | Ajouts, filtres, limites et répétition explicite |
| 15 | Éditeur compact, actions persistantes, déplacement direct | Mobile, clavier réduit, ordre sauvegardé par API |
| 16 | Annulation immédiate d’archive ; programmes concernés par un exercice | Archive/restauration, erreur, préservation du brouillon |
| 17 | Origine, muscle et matériel ; facettes indépendantes de la page | Exercices personnels et catalogue complet |
| 18 | Copie personnelle explicite, fiche et ajout au programme | Création distincte et ajout en brouillon |
| 19 | Prochaine série, sommaire et repli par exercice | Focus de destination, série attendue, valeurs conservées |
| 20 | Notes de préparation figées dans la séance | Modification ultérieure du programme sans effet historique |
| 21 | Repos prêt compact, reprise depuis les autres rubriques | Hauteur, défilement, clavier et retour à la séance |
| 22 | Préréglages et ±15 s persistants | Échéance serveur, version, refus de repos terminé |
| 23 | Bilan, séries réalisées/omises, métriques et XP enregistrés | Réponse de clôture et total de progression réel |
| 24 | Historique filtré côté API et regroupé par mois | Recherche, programme, état, dates et pagination |
| 25 | URL de détail, voisins filtrés, dates compactes et score prioritaire | Accès direct, retour navigateur, immuabilité |
| 26 | Saisie rapide et section de mensurations complémentaires | Modification du poids sans effacer les tours repliés |
| 27 | Vue compacte et écarts neutres ; accès au graphique | Valeur précédente disponible et exclusion des archives |
| 28 | Périodes usuelles, validation et derniers résultats conservés | Période inversée, URL et bouton d’application |
| 29 | Abscisses proportionnelles aux dates/heures | Relevés proches puis éloignés, séances du même jour |
| 30 | Points accessibles au toucher/clavier, résumé et tableau | Flèches, Début/Fin, Échap, cible tactile |
| 31 | Métriques avec unités, occurrences distinctes, référence datée | Contrats statistiques et sélection explicite |
| 32 | Appels à l’action adaptés aux états vides | Créer, choisir, élargir la période, effacer les filtres |
| 33 | Rubrique prioritaire dans le fil d’Ariane ; badge compact | 320 px, titres longs, libellés accessibles complets |
| 34 | Menu commun en paysage tactile peu haut | Portrait/paysage, focus, footer et fond inerte |
| 35 | Métadonnées relevées, champs tactiles à 16 px, commandes de 44 px | Dimensions, contenus longs, thèmes et largeur étroite |
| 36 | Icônes cohérentes pour Sport, force, durée, distance et mensurations | Noms accessibles et hiérarchie indépendante de la couleur |
| 37 | Contexte explicite automatique/classique/HYROX et bandeaux compacts | Contexte API, snapshots, renommage et date conservée |
| 38 | Transitions de couleur 140 ms, ouverture/ajout 160 ms, confirmation/bilan 180 ms | Préférence de réduction des mouvements et focus immédiat |
| 39 | Repos vide distinct de zéro ; aide et préréglages | Validation, abandon et persistance API |

## Choix et limites

La bascule liste/grille reste immédiate : aucune animation de déplacement des lignes ne retarde les commandes ni ne déplace leur cible. Les ajouts et confirmations utilisent des mouvements courts ; les suppressions attendent le succès serveur et affichent une annulation d’archive. La réduction des mouvements désactive animations et transitions dans le contenu Sport.

Le point 22 conditionne le son et la vibration à une validation sur appareil réel. Ils ne sont pas activés dans cette livraison et aucune alarme en arrière-plan n’est promise. Pour le point 39, une saisie min:s a été étudiée : elle ajouterait un second format de saisie et des ambiguïtés sur les valeurs existantes. Les durées conservent donc des secondes explicites et leurs bornes API ; aucune conversion implicite n’est introduite.

Les essais automatiques utilisent des comptes et bases synthétiques. L’émulation tactile, le viewport réduit et WebKit ne remplacent pas un iPhone ou un Android physique. Lecteurs d’écran natifs, verrouillage d’écran, soleil et matériel peu puissant restent hors de cette recette. Les résultats exécutés, les corrections, le commit publié et les vérifications de production sont consignés dans l’issue et la pull request.

## Données et exploitation

La migration additive `0014_sport_ux` conserve les données antérieures. Les six préférences sont stockées dans les réglages Sport ; contexte et notes de préparation suivent le cycle de vie des séances. Les filtres restent des paramètres de lecture, les brouillons restent en mémoire. Voir [modèle de données](donnees.md#migration-0014-finition-sport) et [sauvegarde/restauration](sauvegardes.md#migration-0014-finition-sport).

## Correction de densité mobile

Une seconde vérification après le signalement « trop d’éléments avant la liste » a mesuré le contenu réellement visible, au-delà des seuls débordements. La comparaison utilise le même compte fictif, des programmes de 1 à 12 exercices, des relevés de 12 mesures et un écran de **390 × 664 px**. La référence est le commit `db50d4f`.

| Premier contenu utile | Position avant | Position après |
| --- | ---: | ---: |
| Ligne de programme | 495 px | 237 px |
| Exercice du catalogue | 596 px | 259 px |
| Relevé | 436 px | 231 px |
| Séance de l’historique | 451 px | 201 px |
| Carte du premier graphique | 809 px | 370 px |
| Premier exercice de l’éditeur | 730 px | 362 px |
| Première série à saisir | 723 px | 267 px |

Les listes initiales montrent quatre programmes, quatre exercices ou trois relevés complets sur ce format ; les lignes de programme passent d’environ 281 à 83 px. À 320 × 568, les parcours exigent au moins deux lignes complètes. Les contrôles de 44 px et champs de 16 px sont conservés. Le détail complet reste accessible depuis le titre ou la date, et les commandes secondaires depuis Actions ou Filtres. Les préférences mobiles couvrent également le paysage tactile jusqu’à 1 024 × 500 px.

Les captures et scénarios couvrent listes/grilles, filtres ouverts, menus d’actions, création/édition, catalogue d’ajout, séance vide/active, historique/détail, relevés/formulaire, statistiques et réglages. Les mesures portent sur des données synthétiques et des viewports émulés ; la hauteur effective sur un appareil dépend aussi des barres du navigateur et du clavier. Voir les [critères de tests](tests.md#densite-mobile-sport) et les [parcours mobiles](sport.md#lire-et-agir-sur-telephone).

Cette correction ne modifie ni les tables, ni les versions de schéma, ni les règles API. Le déploiement conserve la migration `0014_sport_ux` et suit les sauvegardes habituelles.
