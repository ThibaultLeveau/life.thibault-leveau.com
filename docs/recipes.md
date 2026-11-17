# Recettes & Liste de courses

[English guide](en/recipes.md) · [API](recipes-api.md)

Activez **Recettes & Liste de courses** dans la bibliothèque LifeOS, puis ouvrez `/recipes`. L’application partage la connexion, les thèmes, la langue et la navigation des autres applications. Elle démarre désactivée et conserve toutes ses données lors d’une désactivation.

## Votre carnet de recettes

Dans **Mes recettes → Nouvelle recette**, saisissez un nom, le nombre de personnes de référence, les ingrédients avec leur quantité et leur unité, puis les étapes de préparation. Ajoutez chaque ingrédient avant d’enregistrer la recette ; **Annuler** dans le bloc d’ajout efface seulement cet ajout en cours.

Ouvrez une recette et changez **Nombre de personnes** : les quantités sont recalculées depuis la référence, sans modifier celle-ci. Exemple : 125,1 g pour deux personnes donnent 187,65 g pour trois et 375,3 g pour six. L’import utilise exactement le même calcul serveur. Les quantités en pièces peuvent être fractionnaires (par exemple un demi-citron) ; il n’y a pas d’arrondi automatique à la pièce supérieure.

**Modifier** change les quantités de référence et la préparation. Dans cet éditeur, modifier le nombre de personnes indique à combien de personnes correspondent les quantités saisies ; utilisez la consultation pour obtenir une mise à l’échelle. Une recette doit contenir au moins un ingrédient. **Archiver** la range dans les archives ; **Restaurer** la rend à nouveau disponible. L’historique conserve les créations, modifications et changements d’archivage.

## Un catalogue commun, vos ingrédients privés

Le catalogue livré contient **301 ingrédients et articles courants**, avec un nom français et anglais : fruits/légumes, frais, protéines, épicerie, condiments, boissons, surgelés et maison/hygiène. Le nom affiché suit la langue du compte. La recherche accepte les noms dans les deux langues et ignore casse et accents, y compris « oeuf » pour « œuf ».

Dans une recette, une liste ou un modèle, recherchez puis sélectionnez un ingrédient. Choisissez la quantité et l’une des sept unités : **g** (grammes), **mg** (milligrammes), **l** (litres), **ml** (millilitres), **c. à café** (cuillère à café), **c. à soupe** (cuillère à soupe), **u** (pièces/articles). Le catalogue suggère une unité mais vous pouvez en choisir une autre. Vous pouvez saisir directement 250 ml ou 0,5 cuillère à café ; pour 1 kg, saisissez 1 000 g.

Si le nom n’existe pas, **Créer « … » dans mon catalogue** l’ajoute directement, avec l’unité choisie, puis le sélectionne. Cet ingrédient est privé : les autres comptes ne le voient pas. Son nom personnel reste identique dans les deux langues ; aucune traduction automatique n’est appliquée. Un nom exact déjà connu dans l’une des langues réutilise son identité, même si l’appel est répété. La recherche reste une recherche de sous-chaîne, sans rapprochement automatique des synonymes ou des pluriels : sélectionnez l’ingrédient existant pour qu’il se cumule correctement.

## Préparer les courses

Dans **Listes de courses → Nouvelle liste**, donnez un nom à votre liste. Ajoutez des articles à la main ou choisissez **Importer une recette**, la recette et le nombre de personnes. Vous pouvez aussi partir d’une recette avec **Ajouter à une liste**. La recherche et la pagination permettent de retrouver des listes et recettes plus anciennes.

Chaque import **ajoute** les quantités. Deux imports de 200 g du même ingrédient donnent une ligne de 400 g. La même identité et la même unité s’additionnent ; les unités différentes restent séparées, même g/mg et l/ml. Aucune conversion automatique n’est appliquée, y compris pour les cuillères. Relancer volontairement un import ajoute une seconde portion ; en cas de double envoi de la même version, le serveur refuse le second envoi avec un conflit.

Les commandes de préparation permettent de corriger une quantité, retirer un article, renommer, archiver ou restaurer la liste. Une liste terminée est en lecture seule jusqu’à **Rouvrir la liste**. Les articles retirés restent présents dans l’historique de la liste.

## Au magasin

**Au magasin** ouvre une vue avec de grandes lignes tactiles, groupées par rayon, un compteur et les articles déjà achetés à part. Touchez une ligne pour la cocher ou utilisez Tab puis Espace. **Afficher seulement les articles restants** réduit la liste à ce qu’il reste à prendre. Les achats sont enregistrés immédiatement par API et survivent au rechargement.

L’ajout rapide reste disponible au magasin. Si vous avez déjà pris 200 g et ajoutez 50 g, la ligne redevient à prendre pour **50 g**, en rappelant les 200 g déjà achetés et le total de 250 g. Cocher achète tout le complément ; décocher remet la quantité achetée de cette ligne à zéro. Réduire la quantité totale ne conserve jamais un acheté supérieur au nouveau total.

**Terminer les courses** est disponible quand une liste non vide est entièrement cochée. La date de fin est conservée ; rouvrir ne remet pas automatiquement les achats à zéro. **Réutiliser cette liste** crée une nouvelle sortie de courses avec toutes les cases vierges.

Une connexion réseau est nécessaire. Une erreur ne présente jamais un achat comme enregistré ; réessayez dans le contenu concerné. Si un autre appareil a changé la liste, **Recharger cet élément** récupère sa dernière version. Il n’y a pas de mode hors ligne ni de synchronisation en temps réel.

## Modèles et anciennes listes

Dans **Mes modèles → Nouveau modèle**, composez vos indispensables avec les mêmes ingrédients et imports. Depuis une liste, active ou passée, **Enregistrer comme modèle** crée un modèle indépendant. Depuis un modèle, **Créer une liste** reprend tous ses ingrédients et quantités, sans achats cochés.

**Réutiliser cette liste** fonctionne également sur une ancienne liste, y compris archivée. La copie ne modifie jamais sa source et reste indépendante de ses futures modifications. Les modèles ne portent pas de cases achetées ni de date de fin. Le catalogue d’ingrédients reste commun à vos recettes, modèles et listes.

## Suivi, quêtes et motivation

Le badge commun affiche niveau, titre, série et quêtes proches. Dans **Suivi → Réussites**, choisissez Recettes : **60 quêtes** couvrent recettes enregistrées, listes terminées, couples liste/recette importés, modèles non vides, jours actifs et séries (dix paliers par famille).

| Première action confirmée | XP de base |
| --- | --- |
| Créer une recette avec des ingrédients | 25 |
| Terminer une liste non vide entièrement achetée | 50 |
| Importer une recette dans une liste | 5 par couple liste/recette |
| Préparer un modèle non vide | 15 |

Les corrections, recoches, réouvertures, imports répétés dans la même liste, archives et réactivations ne multiplient pas ces gains. Une nouvelle recette, un nouveau modèle ou une nouvelle liste possède une identité indépendante. Les quêtes ajoutent leurs bonus habituels. Les jours d’utilisation et vacances se règlent dans Suivi, avec le calendrier commun. Le badge fonctionne même si Suivi est désactivé.

Suivi découvre aussi quatre métriques historiques : recettes enregistrées, listes terminées, recettes utilisées pour les courses et modèles préparés. Elles comptent les premières actions, dans la période/fuseau demandés, archives comprises. Désactiver Recettes empêche de nouvelles évaluations et conserve les instantanés déjà enregistrés dans Suivi.

## Limites et conservation

La version livrée accepte 2 000 recettes et 2 000 listes/modèles par compte, 3 000 ingrédients personnels, 200 lignes par recette et 300 couples ingrédient/unité par liste. Les quantités sont positives, jusqu’à 1 000 000 000, avec six décimales ; les portions sont entières de 1 à 1 000. Un calcul hors de ces bornes est refusé, sans import partiel. Les dates sont conservées en UTC. Les contenus personnels ne sont pas traduits.

Il n’y a ni partage de listes, images, prix, nutrition, planification de menus ni suppression définitive des recettes/listes/modèles. Les brouillons sont protégés lors du départ, du changement de langue et de la déconnexion. Toutes les opérations persistantes existent dans l’[API versionnée](recipes-api.md). Voir les [données](donnees.md#donnees-recettes-et-courses) et la [sauvegarde/restauration](sauvegardes.md#migration-0012-recettes-et-courses).

Les préférences sont réunies dans les [réglages généraux](settings.md). Le lien Réglages de l’application ouvre sa section ; fuseau de progression et vacances se trouvent dans Général, jours d’utilisation dans chaque application.
