# API Recettes et courses

Préfixe `/api/v1/recipes`. [Guide utilisateur](recipes.md), [English guide](en/recipes.md), [OpenAPI interactif](https://life.thibault-leveau.com/api/docs).

Toutes les routes exigent session et activation `recipes`. Le propriétaire vient de la session. Les mutations exigent l’origine autorisée et `X-CSRF-Token` ; le verrou propriétaire du socle sérialise les écritures. Les champs inconnus sont refusés. Les lectures sont sans effet de bord et les mutations sont atomiques.

## Catalogue et objets

| Méthode | Route relative | Contrat |
| --- | --- | --- |
| GET | `/ingredients?q=&offset=0&limit=30` | Recherche bilingue normalisée ; pagination 1–100, total |
| POST | `/ingredients` | `{name, unit}` ; crée un ingrédient privé ou réutilise un nom exact connu, réponse 201 |
| GET | `/recipes?archived=false&q=&offset=0&limit=24` | Recettes paginées, limite 100 |
| POST | `/recipes` | `{title, servings, instructions, items}` ; réponse 201 |
| GET | `/recipes/{id}?servings=4` | Recette, quantités recalculées et `base_servings` ; aucune écriture |
| PUT | `/recipes/{id}` | Même entrée que POST + `expected_version` ; remplace la référence |
| PUT | `/recipes/{id}/archive` | `{archived, expected_version}` |
| GET | `/recipes/{id}/history?offset=0&limit=30` | Événements et instantanés immuables, limite 100 |
| GET | `/lists?kind=list&archived=false&q=&offset=0&limit=24` | Listes ou modèles (`kind=template`), ouverts et terminés, limite 100 |
| POST | `/lists` | `{title, kind, items?}` ; tableau vide autorisé, réponse 201 |
| GET | `/lists/{id}` | Liste/modèle et toutes ses lignes |
| PUT | `/lists/{id}` | `{title, expected_version}` |
| POST | `/lists/{id}/copy` | `{title, kind, expected_version}` ; nouvelle liste/modèle, réponse 201 |
| POST | `/lists/{id}/items` | `{name, quantity?, unit?, expected_version}` ou `{ingredient_id, quantity?, unit?, expected_version}` ; ajoute/cumule |
| PUT | `/lists/{id}/items/{item_id}` | `{quantity, expected_version}` ; remplace la quantité totale |
| DELETE | `/lists/{id}/items/{item_id}` | Corps `{expected_version}` ; retire une ligne, retourne la liste |
| PUT | `/lists/{id}/items/{item_id}/check` | `{checked, expected_version}` ; listes seulement |
| POST | `/lists/{id}/import` | `{recipe_id, recipe_version, servings, expected_version}` |
| PUT | `/lists/{id}/complete` | `{completed, expected_version}` ; listes non archivées seulement |
| PUT | `/lists/{id}/archive` | `{archived, expected_version}` |
| GET | `/lists/{id}/history?offset=0&limit=30` | Historique immuable, limite 100 |

Dans une recette, `items` contient `{ingredient_id: UUID, quantity: decimal, unit: "g"|"mg"|"l"|"ml"|"tsp"|"tbsp"|"u"}`. Les réponses encodent les décimaux en **chaînes**, sans perte de précision. Envoyer de préférence des chaînes décimales à point. Les entrées JSON numériques sont également acceptées, sauf booléens et valeurs non finies. Les sorties ajoutent `id`, `name` localisé, `category`, `position`, `purchased_quantity` et `checked`. Les noms personnels restent intacts. La fiche ingrédient fournit aussi `name_fr`, `name_en`, `builtin` et l’unité suggérée.

`mg` désigne les milligrammes, `ml` les millilitres, `tsp` les cuillères à café et `tbsp` les cuillères à soupe. Ces identifiants API restent identiques en FR/EN. Exemple de ligne : `{"ingredient_id":"<UUID>","quantity":"0.5","unit":"tsp"}`. Les unités différentes ne sont jamais converties ni cumulées entre elles, même g/mg et l/ml.

Les recettes fournissent leurs dates, `version`, `servings` affiché, `base_servings`, préparation et ingrédients. Les listes ajoutent `kind`, `completed_at`, `archived_at`. Un modèle n’a pas de date de fin. Les résultats de recherche sont `{items, total, offset, limit}`. L’ordre est stable ; les objets sont triés par dernière modification puis identifiant.

Pour les listes et modèles, chaque entrée `items` et `POST /lists/{id}/items` acceptent **exactement un** des champs `ingredient_id` (UUID accessible) ou `name` (article libre, 1–120 caractères après retrait des espaces de bord). L’autre champ peut être omis ou nul. `quantity` vaut `"1"` et `unit` vaut `"u"` par défaut. Exemple minimal : `{"name":"Piles AA","expected_version":1}`. Les sorties libres ont `ingredient_id: null`, le nom personnel et `category: "other"`. Aucun ingrédient n’est créé. Les noms normalisés vides ou dépassant 240 caractères, les deux identités simultanées et l’absence d’identité sont refusés avec **422**.

Les articles libres se cumulent par `(nom normalisé, unit)`, indépendamment des ingrédients du catalogue, même homonymes. La normalisation ignore casse, accents, espaces répétés et ligatures œ/æ ; le premier libellé reste affiché. Copies, achats, événements et désactivation préservent ces noms. Les capacités assistant `create_list` et `add_item` utilisent le même contrat.

### Ajouter un achat sans catalogue

```bash
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"name":"Piles AA","quantity":"4","unit":"u","expected_version":1}' \
  'https://life.thibault-leveau.com/api/v1/recipes/lists/<UUID liste>/items'
```

Utiliser la version courante de la liste ; la réponse fournit la version à employer pour la mutation suivante. Une création de liste avec `{"title":"Maison","items":[{"name":"Lessive"},{"name":"Piles AA","quantity":"4"}]}` fonctionne également sans appel au catalogue.

## Calculs et cycle de vie

Le serveur additionne par `(ingredient_id, unit)` et calcule `quantité × portions demandées / portions de référence`, arrondi à six décimales, demi vers le haut. Chaque quantité finale doit rester entre 0,000001 et 1 000 000 000. Toute erreur annule la transaction entière. Un ajout conserve la quantité déjà achetée ; `checked` signifie que l’acheté égale le total. Cocher affecte l’acheté au total, décocher à zéro. Modifier le total plafonne l’acheté à ce total.

Une recette accepte 1–200 lignes et 1–1 000 portions entières. Une liste accepte 0–300 couples article/unité. Les doublons de recette sont cumulés à l’enregistrement. Titres : 1–160 caractères ; préparation : 20 000 ; noms d’ingrédient ou d’article libre : 1–120. Quotas par propriétaire : 2 000 recettes, 2 000 listes/modèles et 3 000 ingrédients personnels.

Terminer exige une liste non vide entièrement achetée. Réouvrir préserve les achats. Les dates de fins précédentes restent dans les événements. Les archives bloquent les modifications ordinaires ; la copie d’une source terminée ou archivée reste possible et vide toujours l’acheté, la fin et l’archive. La copie prend la version exacte demandée et n’entretient aucun lien mutable avec sa source. Aucun DELETE de recette/liste/modèle n’est exposé.

Les mutations exigent `expected_version` entier strict ≥ 1 ; chaque changement incrémente la version. Un import exige aussi `recipe_version`, afin de refuser une recette modifiée depuis sa sélection. Les répétitions déjà dans l’état d’archivage/fin demandé sont idempotentes à version correcte. Pour importer deux fois volontairement, utiliser la nouvelle version renvoyée après le premier import.

## Exemple indépendant de l’interface

Après une [connexion API](api.md#session-et-protections), conserver le cookie dans `cookies.txt` et le jeton CSRF en mémoire dans `CSRF`. Les identifiants ci-dessous proviennent des réponses et doivent être remplacés par ceux de votre compte.

```bash
curl -b cookies.txt 'https://life.thibault-leveau.com/api/v1/recipes/ingredients?q=riz'

curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"name":"Mon mélange maison","unit":"g"}' \
  https://life.thibault-leveau.com/api/v1/recipes/ingredients

curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"title":"Risotto","servings":2,"instructions":"Faire cuire doucement.","items":[{"ingredient_id":"<UUID ingrédient>","quantity":"150","unit":"g"}]}' \
  https://life.thibault-leveau.com/api/v1/recipes/recipes

curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"title":"Samedi","kind":"list"}' \
  https://life.thibault-leveau.com/api/v1/recipes/lists

curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"recipe_id":"<UUID recette>","recipe_version":1,"servings":6,"expected_version":1}' \
  'https://life.thibault-leveau.com/api/v1/recipes/lists/<UUID liste>/import'
```

Le dernier appel ajoute 450 g. Cocher utilise `PUT /lists/{id}/items/{item_id}/check` avec `{"checked":true,"expected_version":2}`. Après la réponse, utiliser sa version pour terminer ou copier la liste.

## Erreurs, historique et intégrations

- **401** : session absente ou expirée.
- **403** : application désactivée (en-tête `X-Life-Application-Disabled: recipes`), origine ou CSRF invalide.
- **404** : objet ou ingrédient privé inaccessible ; aucun indice sur le propriétaire.
- **409** : version concurrente ou objet en lecture seule. Recharger avant de confirmer une nouvelle mutation.
- **422** : champ inconnu/invalide, quota, calcul hors borne, tentative de cocher un modèle ou de terminer une liste incomplète.

Les messages métier suivent la langue du compte. Les événements conservent le propriétaire, l’objet, le type, l’instant UTC et l’instantané de la version concernée ; ils ne sont ni modifiables ni supprimables. Les noms fournis dans ces instantanés gardent la langue du moment de l’événement, tandis que la fiche courante suit la langue du compte.

Le fournisseur de métriques expose `recipes`, `lists`, `imports`, `templates` via `/api/v1/integrations` : agrégation `count`, aucun filtre, bornes UTC issues de la période/fuseau. Il compte les événements de première confirmation, identifiés par une clé unique ; archives et réouvertures ne changent pas le passé. Le fournisseur de progression attribue les XP dans la même transaction, avec 60 quêtes et dix titres. Les détails, barèmes et limites sont dans le [guide](recipes.md#suivi-quetes-et-motivation) et les [contrats communs](api.md#progression-par-application).
