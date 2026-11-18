# Recipes and shopping API

Prefix `/api/v1/recipes`. [User guide](recipes.md), [interactive OpenAPI](https://life.thibault-leveau.com/api/docs).

All routes require session and recipes activation. Owner comes from session. Mutations require allowed origin and CSRF; the shared owner lock serializes writes. Unknown fields are rejected. Reads have no side effects; mutations are atomic.

## Catalogue and objects {#catalogue-et-objets}

| Method | Relative path | Contract |
| --- | --- | --- |
| GET | `/ingredients?q=&offset=0&limit=30` | Normalized bilingual search, limit 1–100, total |
| POST | `/ingredients` | `{name,unit}`; private ingredient or exact-name reuse, 201 |
| GET | `/recipes?archived=false&q=&offset=0&limit=24` | Paginated recipes, max 100 |
| POST | `/recipes` | `{title,servings,instructions,items}` → 201 |
| GET | `/recipes/{id}?servings=4` | Scaled recipe and base_servings; no write |
| PUT | `/recipes/{id}` | POST input plus expected_version, replace reference recipe |
| PUT | `/recipes/{id}/archive` | `{archived,expected_version}` |
| GET | `/recipes/{id}/history?offset=0&limit=30` | Immutable events/snapshots, max 100 |
| GET | `/lists?kind=list&archived=false&q=&offset=0&limit=24` | Open/completed lists or kind=template, max 100 |
| POST | `/lists` | `{title,kind,items?}`, empty allowed → 201 |
| GET | `/lists/{id}` | List/template and all items |
| PUT | `/lists/{id}` | `{title,expected_version}` |
| POST | `/lists/{id}/copy` | `{title,kind,expected_version}` → new object, 201 |
| POST | `/lists/{id}/items` | `{name,quantity?,unit?,expected_version}` or `{ingredient_id,quantity?,unit?,expected_version}`, add/combine |
| PUT | `/lists/{id}/items/{item_id}` | `{quantity,expected_version}`, replace total |
| DELETE | `/lists/{id}/items/{item_id}` | Body `{expected_version}`, return list |
| PUT | `/lists/{id}/items/{item_id}/check` | `{checked,expected_version}`, lists only |
| POST | `/lists/{id}/import` | `{recipe_id,recipe_version,servings,expected_version}` |
| PUT | `/lists/{id}/complete` | `{completed,expected_version}`, unarchived lists only |
| PUT | `/lists/{id}/archive` | `{archived,expected_version}` |
| GET | `/lists/{id}/history?offset=0&limit=30` | Immutable history, max 100 |

Recipe items contain ingredient UUID, decimal quantity and unit g/mg/l/ml/tsp/tbsp/u. Responses encode decimals as **strings** without precision loss. Prefer decimal strings with a dot; numeric JSON is also accepted except booleans/non-finite values. Outputs add ID, localized name, category, position, purchased_quantity and checked. Personal names remain intact. Ingredients also expose name_fr, name_en, builtin and suggested unit.

mg = milligrams, ml = millilitres, tsp = teaspoons, tbsp = tablespoons. API unit identifiers are language-independent. Example: `{"ingredient_id":"<UUID>","quantity":"0.5","unit":"tsp"}`. Different units never convert/combine, including g/mg or l/ml.

Recipes include dates, version, displayed servings, base_servings, method and ingredients. Lists add kind/completed_at/archived_at; templates have no completion date. Search returns `{items,total,offset,limit}`. Objects sort stably by last update then identifier.

For lists and templates, each `items` entry and `POST /lists/{id}/items` accept **exactly one** of `ingredient_id` (accessible UUID) or `name` (free item, 1–120 characters after trimming). The other field may be absent or null. Defaults are `quantity: "1"` and `unit: "u"`. Minimal example: `{"name":"AA batteries","expected_version":1}`. Free outputs have `ingredient_id: null`, the personal name and `category: "other"`. No ingredient is created. Empty or oversized normalized names (over 240 characters), both identities or neither identity return **422**.

Free items combine by `(normalized name, unit)`, separately from catalogue ingredients even with the same name. Normalization ignores case, accents, repeated whitespace and œ/æ ligatures; the first spelling is retained. Copies, purchases, history and activation changes preserve free names. Assistant capabilities `create_list` and `add_item` use this same contract.

### Add a purchase without the catalogue

```bash
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"name":"AA batteries","quantity":"4","unit":"u","expected_version":1}' \
  'https://life.thibault-leveau.com/api/v1/recipes/lists/<list UUID>/items'
```

Use the current list version and the returned version for your next mutation. Creating a list with `{"title":"Home","items":[{"name":"Detergent"},{"name":"AA batteries","quantity":"4"}]}` also works without catalogue requests.

## Calculations and lifecycle {#calculs-et-cycle-de-vie}

The server combines by `(ingredient_id,unit)` and scales quantity × requested servings / reference servings, rounded half-up to six decimals. Final quantities must remain 0.000001–1,000,000,000. Errors roll back the entire transaction. Additions preserve purchased amounts; checked means purchased equals total. Checking sets purchased to total; unchecking sets zero. Editing total caps purchased at that total.

Recipes accept 1–200 lines and 1–1,000 integer servings; lists accept 0–300 item/unit pairs. Recipe duplicates combine on save. Title length 1–160; method at most 20,000; ingredient or free item name 1–120. Per-owner limits: 2,000 recipes, 2,000 lists/templates, 3,000 personal ingredients.

Completion requires a non-empty fully purchased list. Reopening preserves purchases; previous finish dates remain in events. Archives block ordinary edits. Copies of completed/archived sources are allowed and reset purchases/completion/archive. Copying uses the exact requested source version and creates no mutable link. No recipe/list/template DELETE is exposed.

Mutations require strict integer expected_version ≥1 and increment it. Imports additionally require recipe_version to reject changes since selection. Repeating the requested archive/completion state is idempotent with a correct version. Deliberate repeated import uses the newly returned version.

## Standalone example {#exemple-independant-de-linterface}

After [API sign-in](api.md#session-et-protections), retain cookies in `cookies.txt` and CSRF privately in memory. Replace placeholder identifiers with response values from your account.

```bash
curl -b cookies.txt 'https://life.thibault-leveau.com/api/v1/recipes/ingredients?q=riz'

curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"name":"My homemade mix","unit":"g"}' \
  https://life.thibault-leveau.com/api/v1/recipes/ingredients

curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"title":"Risotto","servings":2,"instructions":"Simmer gently.","items":[{"ingredient_id":"<ingredient UUID>","quantity":"150","unit":"g"}]}' \
  https://life.thibault-leveau.com/api/v1/recipes/recipes

curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"title":"Samedi","kind":"list"}' \
  https://life.thibault-leveau.com/api/v1/recipes/lists

curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"recipe_id":"<UUID recette>","recipe_version":1,"servings":6,"expected_version":1}' \
  'https://life.thibault-leveau.com/api/v1/recipes/lists/<UUID liste>/import'
```

The last request adds 450 g. Check with PUT `/lists/{id}/items/{item_id}/check` and `{"checked":true,"expected_version":2}`. Use its returned version before completing/copying.

## Errors, history and integrations {#erreurs-historique-et-integrations}

- 401: missing/expired session.
- 403: disabled app (`X-Life-Application-Disabled: recipes`), invalid origin/CSRF.
- 404: inaccessible object/private ingredient; owner details are not exposed.
- 409: concurrent version or read-only object; reload before confirming another write.
- 422: unknown/invalid fields, quota, out-of-range calculation, checking a template or completing an incomplete list.

Business messages use account language. Immutable events retain owner, object, kind, UTC instant and version snapshot. Supplied names in snapshots retain event-time language; current objects follow account language.

The metrics provider exposes recipes/lists/imports/templates through `/api/v1/integrations`, count only, no filters, UTC bounds derived from requested period/timezone. Unique first-confirmation events drive counts; archives/reopening do not rewrite history. Progression awards XP in the same transaction, with 60 quests and ten titles. See [scales/limits](recipes.md#tracking-and-rewards) and [shared contracts](api.md#progression-par-application).
