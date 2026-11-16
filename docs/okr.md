# Objectifs OKR

Activez **Objectifs OKR** dans la [bibliothèque](applications.md), puis ouvrez `/okr`. L’application relie votre vision à vos actions personnelles et professionnelles. Vos textes restent dans leur langue d’origine ; l’interface et les aides existent en français et en anglais.

## Choisir un cap, puis le préciser

**Votre cap** présente quatre horizons. Le formulaire demande progressivement plus de précision :

| Horizon | Informations nécessaires |
| --- | --- |
| 10 ans | Un titre ; vous pouvez garder une direction encore vague |
| 3 ans | Un titre et la raison pour laquelle cet objectif compte |
| Annuel | Les éléments précédents et le résultat concret attendu |
| Trimestriel | Les éléments précédents, une première action, deux dates et au moins un résultat clé |

Le domaine est **Personnel** ou **Professionnel**. Le rattachement est facultatif, au même domaine et à l’horizon immédiatement supérieur : 10 ans → 3 ans → annuel → trimestriel. Un parent archivé reste visible dans les liens existants ; restaurez-le avant de créer un nouveau lien. Un objectif ayant des enfants ne peut changer de domaine ou d’horizon avant leur déplacement.

Exemple : « Vivre de mon activité » → « Construire une activité indépendante durable » → « Valider mon offre » → « Tester mon offre auprès de 5 clients ».

L’objectif trimestriel représente une avancée **réalisable en un mois maximum**, pas un chantier de trois mois. Du 16 novembre, la date limite est le 15 décembre inclus. Pour un départ le 31 janvier, le mois suivant est ajusté à son dernier jour, puis diminué d’un jour : le 27 février, ou le 28 février d’une année bissextile. Des actions plus courtes sont possibles. Le trimestre prévu est celui de la date de début ; un plan peut franchir une frontière trimestrielle. Les autres horizons acceptent des dates facultatives, fournies par paire.

## Mesurer avec les résultats clés

Ajoutez jusqu’à 12 résultats clés par objectif : titre, départ, cible, valeur actuelle et unité facultative. Une cible doit être différente du départ. Une cible plus basse suit une réduction, par exemple de 10 à 2 heures. Un résultat binaire s’exprime avec départ 0 et cible 1.

La progression d’un résultat est `(actuel − départ) / (cible − départ)`, bornée entre 0 et 100 %. La progression d’un objectif est la moyenne à poids égaux de ses résultats. Un objectif sans résultat clé reste à 0 % jusqu’à sa clôture explicite ; cela convient à une vision de long terme.

Ouvrez une carte, choisissez **Mettre à jour**, saisissez la valeur et, si utile, ce que vous avez appris. Les valeurs précédentes, cibles et notes restent consultables dans **Historique**. Les résultats clés peuvent aussi être ajoutés, modifiés ou retirés dans le formulaire tant que l’objectif est ouvert ; les instantanés antérieurs restent intacts. L’atteinte de 100 % ne clôture jamais l’objectif automatiquement.

## Avancer dans le kanban

**Ce trimestre** affiche les objectifs trimestriels : **À préparer**, **En cours**, **Terminé**. Filtrez par domaine et trimestre. Les objectifs encore ouverts des trimestres précédents sont reportés avec leur trimestre d’origine ; les objectifs futurs attendent le trimestre choisi. Les cartes terminées apparaissent dans leur trimestre réel de réalisation.

Déplacez la poignée d’une carte vers une colonne ou avant une autre carte. Les commandes de statut et les flèches monter/descendre offrent le même fonctionnement au clavier et sur mobile. L’ordre est enregistré par horizon et statut, commun aux domaines et trimestres ; les filtres ne créent pas un ordre indépendant. Sur un écran étroit, les colonnes s’empilent pour rester lisibles.

**Terminer l’objectif** exige que chaque résultat clé soit atteint. La clôture de tout horizon, personnel ou professionnel, rejoint le trimestre en cours calculé par le serveur dans le fuseau des réglages OKR. La date prévue ne décide pas du trimestre de réalisation.

## Célébrer les trimestres accomplis

**Réalisations** permet de choisir le trimestre courant ou un trimestre ayant des réalisations. Chaque clôture conserve son titre, son domaine, son horizon, son résultat attendu et ses résultats clés tels qu’ils étaient à cet instant. Une modification ultérieure ne réécrit pas ces souvenirs.

Rouvrez un objectif terminé pour le retravailler. Sa réalisation précédente reste visible avec **Rouvert depuis**. Une nouvelle clôture produit un nouvel instantané dans son trimestre réel ; elle ne rapporte pas une seconde récompense pour le même objectif. Les compteurs historiques de Suivi comptent uniquement la première réussite par identifiant.

**Archiver** met un objectif de côté sans le terminer. Les dates, liens, valeurs, historique et gains sont conservés. **Archives** permet de le restaurer. Désactiver OKR dans la bibliothèque conserve également toutes les données ; la réactivation les restitue. Il n’y a pas de suppression définitive.

## Suivi, quêtes et motivation

OKR fournit à [Suivi](tracking.md) trois métriques : objectifs accomplis, résultats clés atteints et points de suivi. Dans un champ numérique de Suivi, choisissez la source **Objectifs OKR**, puis la métrique et éventuellement le domaine, l’horizon ou un objectif. Les filtres de domaine/horizon utilisent l’instantané au moment de l’événement. Les archives ne suppriment pas les faits historiques. Les sources désactivées refusent les nouvelles évaluations ; les valeurs déjà confirmées dans Suivi restent conservées.

La [progression commune](progression.md) ajoute **60 quêtes** OKR, dix titres et les niveaux jusqu’à 100. Une première clôture rapporte **100 XP** ; la première atteinte d’un résultat clé rapporte **15 XP**, même si elle intervient dans le formulaire. Les familles de quêtes portent sur les objectifs accomplis, résultats clés, objectifs personnels, objectifs professionnels, jours actifs et séries. Les jours actifs sont les jours de premières réussites, pas ceux de simples modifications. Les corrections et réouvertures ne multiplient pas les XP et n’annulent pas les gains acquis.

Le badge de progression fonctionne même sans Suivi. Si Suivi est actif, le lien **Mes quêtes dans Suivi** ouvre directement les quêtes OKR. Les jours d’utilisation, vacances et fuseau des séries relèvent des réglages de progression communs ; le fuseau OKR ne règle que les jours et trimestres métier. Aucun service automatique ni IA externe ne traite vos objectifs : les aides sont guidées et les quêtes sont calculées à partir de vos actions confirmées.

## Réglages, limites et erreurs

Le fuseau par défaut est `Europe/Paris`, modifiable dans **Réglages**. Les réalisations déjà enregistrées gardent leur trimestre. Les sélections de domaine, d’horizon et de trimestre sont des vues temporaires, sans stockage métier dans le navigateur. Le menu de compte conserve langue et thème par API. Les brouillons sont protégés lors de la navigation, d’un changement de langue ou d’une déconnexion.

Limites : 5 000 objectifs par compte, archives comprises ; 12 résultats clés par objectif ; titres de 200 caractères ; nombres finis de −10¹² à 10¹² ; dates entre 2000 et 2100. Historique et réalisations sont paginés par 30. Une écriture concurrente produit un conflit : rechargez l’objectif avant de réappliquer vos modifications. Les erreurs réseau affichent une reprise dans le contenu concerné.

Toutes ces opérations disposent d’une [API versionnée](okr-api.md), avec les mêmes règles et contrôles de propriétaire.
