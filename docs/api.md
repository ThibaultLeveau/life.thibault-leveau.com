# Référence API

Toutes les fonctions métier de l'interface passent par `/api/v1`. Les schémas exacts, champs requis et réponses sont disponibles dans [OpenAPI](https://life.thibault-leveau.com/api/openapi.json) et [Swagger UI](https://life.thibault-leveau.com/api/docs), pour le commit effectivement déployé. Les routes privées exigent une session ; aucune inscription publique n'est disponible.

## Session et protections

| Méthode et chemin sous `/api/v1` | Contrat |
| --- | --- |
| `POST /auth/session` | `{username,password}` → session 200 + cookie `life_session` |
| `GET /auth/session` | Session actuelle, expiration, thème et `csrf_token` |
| `DELETE /auth/session` | Révocation et suppression du cookie, 204 |
| `GET /preferences` | `{theme}` |
| `PUT /preferences` | `{theme: "system" | "light" | "dark"}` → préférences |

Le cookie est HttpOnly, SameSite=Lax et Secure en production. Le mot de passe n'est jamais renvoyé. L'identifiant est normalisé en minuscules par `casefold` et sans espaces extérieurs ; le mot de passe reste exact. Une session expire après `LIFE_SESSION_HOURS` (168 heures par défaut), sans prolongation automatique.

Après connexion, conserver le cookie et envoyer **`X-CSRF-Token`** pour toute mutation, y compris déconnexion et préférences. `GET /auth/session` permet de retrouver ce jeton après rechargement. Les navigateurs doivent utiliser l'origine configurée. Un client HTTP sans en-tête `Origin` reste autorisé avec cookie et jeton CSRF ; si `Origin` est présent, il est vérifié aussi à la connexion.

Swagger montre les contrats, mais le navigateur ne peut pas définir lui-même un en-tête Cookie arbitraire : utiliser la session obtenue sur la même origine et renseigner `X-CSRF-Token` dans l'opération. L'exemple Python ci-dessous couvre un client indépendant.

## Espaces et configuration

Dans les chemins ci-dessous, `{w}`, `{s}`, `{c}` et `{l}` sont des UUID d'espace, section, statut et étiquette.

| Méthode et chemin | Opération / réponse |
| --- | --- |
| `GET /workspaces?archived=false` | Liste ordonnée des espaces actifs ; `true` donne les archives |
| `POST /workspaces` | `{name,description?,color?,parent_id?}` → espace, 201, trois statuts initiaux |
| `GET /workspaces/{w}` | Espace autorisé, même archivé |
| `PATCH /workspaces/{w}` | Nom, description, couleur, `parent_id`, `archived` → espace |
| `PUT /workspaces/order` | `{ids:[...]}` ordre complet, archives incluses, 204 |
| `GET /workspaces/{w}/sections?archived=false` | Sections ordonnées ; archives séparées via `true` |
| `POST /workspaces/{w}/sections` | Nom, description, couleur, `visibility` → section, 201 |
| `PATCH /workspaces/{w}/sections/{s}` | Propriétés, visibilité, `archived` → section |
| `PUT /workspaces/{w}/sections/order` | Ordre complet des sections, archives incluses, 204 |
| `GET /workspaces/{w}/statuses` | Statuts ordonnés |
| `POST /workspaces/{w}/statuses` | `{name,color?,is_completed?}` → statut, 201 |
| `PATCH /workspaces/{w}/statuses/{c}` | Nom, couleur, type → statut |
| `PUT /workspaces/{w}/statuses/order` | Ordre complet, 204 |
| `DELETE /workspaces/{w}/statuses/{c}?replacement_id=...` | Retrait et réaffectation éventuelle, 204 |
| `GET /workspaces/{w}/labels` | Étiquettes triées par nom |
| `POST /workspaces/{w}/labels` | `{name,color?}` → étiquette, 201 |
| `PUT /workspaces/{w}/labels/{l}` | Remplacement du nom/couleur → étiquette |
| `DELETE /workspaces/{w}/labels/{l}` | Suppression des associations et du filtre concerné, 204 |
| `GET /workspaces/{w}/view` | Configuration de vue |
| `PUT /workspaces/{w}/view` | Remplacement de la configuration ; champs omis remis au défaut |

Les noms d'espace et section ont 1 à 120 caractères, les statuts 1 à 80, les étiquettes 1 à 50 ; les descriptions au plus 20 000. Les couleurs suivent `#RRGGBB`. `visibility` vaut `list`, `board` ou `both`. Les tableaux `ids` doivent contenir exactement tous les éléments concernés une seule fois, sinon 409 (limite 10 000 identifiants).

Les espaces, sections et tâches s'archivent via PATCH `{archived:true}` et se restaurent via `{archived:false}`. Ils n'ont pas de DELETE définitif. Les tâches d'un parent archivé ne sont plus modifiables ; restaurer d'abord le parent. Renommer un parent ne modifie pas les événements historiques.

Un espace conserve au moins un statut ouvert et un terminé. Changer `is_completed` sur un statut utilisé est refusé. Le retrait d'un statut utilisé exige `replacement_id` appartenant au même espace et du même type, archives comprises. Il conserve les dates de résolution.

### Hiérarchie des espaces

Chaque réponse espace inclut `parent_id` (UUID ou null). À la création, son omission ou null crée une racine. Dans PATCH, l'omission le conserve, null détache l'espace et un UUID le rattache à ce parent. Le parent doit être actif et appartenir au compte connecté : 404 s'il est absent ou étranger, 409 s'il est archivé. Un UUID mal formé renvoie 422. Un espace ne peut devenir son propre parent ni un descendant de lui-même (409), même avec des écritures simultanées.

GET reste une liste plate triée par `position` puis UUID : reconstruire l'arbre avec `parent_id`. L'ordre global de `PUT /workspaces/order` reste inchangé et contient toutes les archives ; il définit l'ordre relatif dans chaque groupe de frères. Réordonner ne change jamais les parents. Un déplacement conserve la position de l'espace ; ses descendants le suivent, sans déplacer leurs tâches. Les requêtes de tâches filtrées par espace n'incluent pas celles de ses descendants.

Archiver un espace ayant un enfant actif renvoie 409 : archiver ou déplacer les enfants d'abord. Restaurer un enfant sous un parent archivé renvoie 409. Une restauration peut être combinée avec `parent_id:null` ou un autre parent actif. Aucune cascade ne change les archives individuelles ou les événements des tâches. Les règles de session, propriétaire, origine et CSRF s'appliquent à toutes ces mutations.

### Préférences de vue

```json
{
  "layout": "board",
  "density": "comfortable",
  "show_completed": true,
  "search": "",
  "sort": "manual",
  "status_id": null,
  "priority": null,
  "label_id": null,
  "due": "all"
}
```

Valeurs : `layout` list/board, `density` comfortable/compact, `sort` manual/priority/due_date, `due` all/overdue/today/upcoming/none. La priorité optionnelle vaut 1 à 4, la recherche au plus 500 caractères. Statut et étiquette référencés doivent appartenir à l'espace. Le défaut de disposition est `list`, les autres défauts figurent dans cet exemple. Ces réglages ne changent jamais le cycle de vie.

## Agenda global

| Méthode et chemin | Contrat |
| --- | --- |
| `GET /agenda/view` | Préférences du compte, ou valeurs par défaut |
| `PUT /agenda/view` | Remplacement des préférences ; champs omis remis au défaut |
| `GET /agenda/tasks?today=2026-12-31&offset=0&limit=200` | Tâches de tous les espaces actifs selon les préférences enregistrées |

```json
{"period":"today","custom_days":14,"include_overdue":true,"show_completed":false}
```

`period` accepte `today`, `tomorrow`, `week`, `custom`. `custom_days` est un entier entre 1 et 90, conservé aussi dans les autres périodes. `week` couvre aujourd’hui et les six jours suivants ; `custom` couvre `custom_days` jours dès aujourd’hui. `tomorrow` couvre uniquement le lendemain. Les bornes sont inclusives. `include_overdue` ajoute les échéances antérieures à `today` seulement si la tâche est ouverte. `show_completed` inclut les tâches terminées dans la période. Le tri est échéance croissante, puis position et UUID pour un ordre stable.

La réponse contient `items`, `total`, `offset`, `limit`, ainsi que `today`, `start_date` et `end_date` (`YYYY-MM-DD`). Les champs de chaque tâche sont ceux de `/tasks`. `offset` est positif ou nul ; `limit` vaut 1 à 200 (100 par défaut). `today` est la date locale du client ; son omission utilise la date du serveur. Une période dépassant l’année 9999 retourne 422, comme une date, un réglage ou une pagination invalide.

La requête exclut les tâches sans échéance, les archives directes et les tâches dans une section/espace archivé. Elle ignore la visibilité liste/tableau des sections. Aucun identifiant de propriétaire n’est accepté : chaque lecture/écriture utilise le compte de la session, avec 401 sans session et 403 sans CSRF ou avec origine invalide pour PUT. Le réglage ne modifie ni dates, ni versions, ni événements de tâches. Les actions sur ces résultats utilisent les routes `/tasks/{id}` existantes.

Exemple indépendant de l’interface, après obtention du cookie et du jeton CSRF (voir l’exemple de connexion plus bas) :

```python
# client = httpx.Client authentifié, base_url se termine par /api/v1,
# client.headers contient X-CSRF-Token, comme dans l’exemple complet ci-dessous.
response = client.put("/agenda/view", json={
    "period": "custom", "custom_days": 10,
    "include_overdue": True, "show_completed": False,
})
response.raise_for_status()
response = client.get("/agenda/tasks", params={
    "today": "2026-12-31", "offset": 0, "limit": 200,
})
response.raise_for_status()
agenda = response.json()
# Continuer avec offset += len(agenda["items"]) jusqu’au total.
```

## Tâches

| Méthode et chemin | Contrat |
| --- | --- |
| `GET /tasks` | Liste filtrée et paginée |
| `POST /tasks` | Création → tâche, 201 |
| `GET /tasks/{id}` | Tâche autorisée, même archivée |
| `PATCH /tasks/{id}` | Édition atomique, archivage ou restauration → tâche |
| `POST /tasks/{id}/move` | Déplacement et ordre atomiques → tâche |
| `POST /tasks/{id}/complete` | Terminer → tâche |
| `POST /tasks/{id}/reopen` | Rouvrir → tâche |
| `GET /tasks/{id}/events` | Historique paginé, ordre chronologique |

Création : `workspace_id` et `title` requis (1 à 500 caractères), `section_id` facultatif, `status_id` facultatif (premier statut ouvert par défaut), `description`, `priority` (4 par défaut), `due_date` (`YYYY-MM-DD` ou null) et `label_ids` (100 maximum, sans doublon). Les références doivent appartenir au même espace.

Une réponse tâche contient également UUID, position, version, dates `created_at`, `updated_at`, `completed_at` et `archived_at`. Les dates d'instant sont en UTC. Toutes les modifications de tâche exigent **`expected_version`** égal à la dernière version lue. Une réponse 409 demande une relecture et une décision du client, jamais un écrasement automatique.

PATCH accepte les champs de création sauf `workspace_id`, ainsi que `archived`. Les champs omis sont inchangés ; `section_id:null` enlève la section et `due_date:null` enlève l'échéance. Pour restaurer une tâche archivée, envoyer uniquement `expected_version` et `archived:false` après avoir restauré ses parents.

Déplacement :

```json
{
  "expected_version": 3,
  "workspace_id": "UUID-espace-destination",
  "section_id": null,
  "status_id": "UUID-statut-destination",
  "before_id": null
}
```

`before_id` est une tâche active de la section cible ; null ajoute en fin d'espace, donc en fin de sa liste/cellule. Le serveur n'impose pas que la tâche de repère ait le même statut, l'ordre étant commun à l'espace. Les étiquettes sont reprises par nom exact entre espaces, avec conservation de l'étiquette cible si elle existe déjà.

Terminer/rouvrir reçoit `{expected_version:...}` et utilise le premier statut compatible de l'ordre. Répéter l'action sur l'état déjà demandé ne crée pas de résolution supplémentaire ; une version périmée reste un conflit.

### Filtres et pagination

`GET /tasks` accepte `workspace_id`, `section_id`, `status_id`, `priority`, `label_id`, `search`, `completed`, `archived`, `due`, `today`, `sort`, `offset` et `limit`. Sans filtre d'espace, le résultat couvre les espaces du propriétaire. Un filtre pointant sur une ressource étrangère renvoie une liste vide sans révéler ses données.

- `archived=false` exclut les archives individuelles et celles des parents ; `true` sélectionne ces archives effectives.
- `search` cherche une sous-chaîne insensible à la casse dans titre/description ; `%` et `_` sont littéraux.
- `overdue` exclut les tâches terminées ; today/upcoming filtrent la date sans changer le filtre de résolution.
- `today=YYYY-MM-DD` fournit la date locale du client ; sans cette valeur, le serveur utilise sa date courante.
- `sort=manual` utilise la position ; priority place P1 en premier ; due_date place les échéances absentes à la fin.
- `limit` vaut 100 par défaut, entre 1 et 200 ; `offset` commence à 0.

Les tâches et événements retournent `{items,total,offset,limit}`. L'historique utilise les mêmes bornes de pagination. Les événements exposent le contexte de la transition, sans recopier le titre ou la description de la tâche. Voir [Données](donnees.md).

## Planification et récurrences

Ces routes utilisent la même session, le même jeton CSRF et le même contrôle d’origine que les mutations. L’analyse et l’aperçu n’enregistrent aucune tâche et ne journalisent pas le texte soumis.

| Route | Entrée | Sortie |
| --- | --- | --- |
| `POST /api/v1/scheduling/parse` | `text` (1000 caractères max), `today` (date locale), `timezone` (IANA, défaut Europe/Paris) | `title` nettoyé, `matched_text`, indices Unicode `start/end`, `due_date`, `recurrence`, `label`, `dates` |
| `POST /api/v1/scheduling/preview` | `recurrence`, `after` inclusif facultatif, `limit` 1–12 (6 par défaut), `completed` 0–10000 | `label`, `dates`, `explanation` |
| `POST /api/v1/tasks/{id}/undo-complete` | `expected_version` | Tâche restaurée avant sa dernière résolution |

Sans correspondance, l’analyse retourne le texte intact, `matched_text:null` et aucune date. Une date seule peut laisser un titre vide : le client doit demander un titre avant de créer la tâche. Les indices sont des points de code Unicode Python, pas des unités UTF-16 JavaScript. Une erreur de syntaxe de règle, une date impossible, un fuseau inconnu, un aperçu vide ou une échéance récurrente absente donne 422. Sans session : 401 ; sans CSRF/origine valide : 403. Les tâches d’un autre propriétaire restent 404.

`TaskCreate`, `TaskPatch` et `TaskOutput` acceptent/exposent `recurrence`, objet nullable :

| Champ | Contrat |
| --- | --- |
| `rrule` | Jusqu’à 512 caractères. `FREQ=DAILY/WEEKLY/MONTHLY/YEARLY`, `INTERVAL` 1–1000 ; sélections `BYDAY`, `BYMONTHDAY`, `BYMONTH`, `BYSETPOS`, `BYYEARDAY`, `BYWEEKNO`, `WKST` validées selon la fréquence. Pas de DTSTART, COUNT, UNTIL, RDATE ni fréquence horaire dans cette chaîne. |
| `start_date` | Ancre calendaire obligatoire ; lundi est le début de semaine par défaut. |
| `timezone` | Fuseau IANA, Europe/Paris par défaut. Le navigateur fournit le sien. |
| `mode` | `scheduled` (défaut) ou `completion`. Ce dernier accepte uniquement FREQ/INTERVAL. |
| `end_date` | Fin incluse ou null. Doit suivre le début. |
| `max_occurrences` | 1–10000 résolutions, première comprise, ou null. Mutuellement exclusif avec end_date. |
| `excluded_dates` | Jusqu’à 366 dates, dédupliquées et ordonnées. |

Une création sans date explicite prend la première occurrence à partir de l’ancre. Une date explicite peut reporter l’occurrence hors du calendrier régulier, mais doit rester dans les bornes et hors des exclusions. Une création récurrente exige un statut ouvert. `recurrence_completed`, en lecture seule, compte les résolutions de la définition courante. Modifier la règle remet ce compteur à zéro ; modifier uniquement la date conserve règle, ancre et compteur. `recurrence:null` enlève la répétition ; pour retirer aussi la date envoyer `due_date:null` dans le même PATCH. Une règle omise reste inchangée.

Les titres envoyés directement à `/tasks` restent littéraux : l’analyse est explicite et ne change pas silencieusement un client API existant. Exemple autonome avec cookie et jeton acquis selon la section Session :

```bash
curl --fail -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  https://life.thibault-leveau.com/api/v1/scheduling/parse \
  -d '{"text":"Courir tous les lundis et jeudis","today":"2026-11-14","timezone":"Europe/Paris"}'

curl --fail -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  https://life.thibault-leveau.com/api/v1/scheduling/preview \
  -d '{"recurrence":{"rrule":"FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1","start_date":"2026-11-14","timezone":"Europe/Paris","max_occurrences":6}}'
```

Créer ensuite la tâche avec `workspace_id`, `title`, `due_date` et `recurrence` retournés par l’analyse, ou avec une règle construite directement. Toutes les résolutions passent par les mêmes transitions, y compris PATCH du statut et `/move`. Pour une récurrence, `/complete` avance l’occurrence dans une transaction et incrémente la version une seule fois : rejouer l’ancienne version donne 409. Une nouvelle requête avec la nouvelle version résout volontairement l’occurrence suivante. La répétition sur une série déjà terminée reste sans effet avec sa version courante.

`scheduled` prend la première date strictement après `max(due_date, jour local de résolution)` ; `completion` prend la prochaine date de l’intervalle ancré sur le jour de résolution. Dates inexistantes/exclues sautées, maximum atteint ou calendrier épuisé : la tâche reste terminée. L’aperçu du mode completion est indicatif. `/undo-complete` restaure le statut ouvert, la date et le compteur précédents, en ajoutant un événement compensateur ; une modification intermédiaire ou une version périmée donne 409. `/reopen` reste une réouverture du dernier état terminé, sans effacer sa résolution historique.

## Exemple autonome Python

Après création du compte et migration, exécuter depuis la racine du dépôt avec `uv run python`, ou dans un environnement doté de `httpx`. Le mot de passe est saisi sans être écrit dans l'historique du shell. Remplacer l'origine par HTTPS pour la production.

```python
import getpass
import httpx

with httpx.Client(base_url="http://127.0.0.1:8100/api/v1", timeout=20) as client:
    def call(method, path, **kwargs):
        response = client.request(method, path, **kwargs)
        response.raise_for_status()
        return None if response.status_code == 204 else response.json()

    session = call("POST", "/auth/session", json={
        "username": input("Identifiant : "), "password": getpass.getpass(),
    })
    client.headers["X-CSRF-Token"] = session["csrf_token"]
    space = call("POST", "/workspaces", json={"name": "Exemple API"})
    child = call("POST", "/workspaces", json={
        "name": "Sous-projet", "parent_id": space["id"],
    })
    call("PATCH", f"/workspaces/{child['id']}", json={"parent_id": None})
    call("PATCH", f"/workspaces/{child['id']}", json={"parent_id": space["id"]})
    # Archiver les enfants avant leur parent, puis restaurer dans l'ordre inverse.
    call("PATCH", f"/workspaces/{child['id']}", json={"archived": True})
    call("PATCH", f"/workspaces/{space['id']}", json={"archived": True})
    call("PATCH", f"/workspaces/{space['id']}", json={"archived": False})
    call("PATCH", f"/workspaces/{child['id']}", json={"archived": False})
    section = call("POST", f"/workspaces/{space['id']}/sections", json={
        "name": "À préparer", "visibility": "both",
    })
    statuses = call("GET", f"/workspaces/{space['id']}/statuses")
    task = call("POST", "/tasks", json={
        "workspace_id": space["id"], "title": "Vérifier le parcours API",
    })
    task = call("POST", f"/tasks/{task['id']}/move", json={
        "expected_version": task["version"], "workspace_id": space["id"],
        "section_id": section["id"], "status_id": statuses[1]["id"],
    })
    for action in ("complete", "reopen", "complete"):
        task = call("POST", f"/tasks/{task['id']}/{action}", json={
            "expected_version": task["version"],
        })
    events = call("GET", f"/tasks/{task['id']}/events")
    print([event["kind"] for event in events["items"]])
    call("PUT", "/preferences", json={"theme": "dark"})
    call("DELETE", "/auth/session")
```

Cet exemple crée de vraies données dans la base choisie. Les archiver ensuite depuis l'interface si elles ne servent plus. Les cookies, mots de passe et jetons ne doivent pas être enregistrés dans un exemple ou une capture publique.

## Erreurs

| Code | Signification |
| --- | --- |
| 401 | Session absente, expirée/révoquée, ou identifiants incorrects |
| 403 | Origine ou jeton CSRF refusé |
| 404 | Ressource absente ou appartenant à un autre compte |
| 409 | Version périmée, parent archivé, contrainte, doublon ou configuration incohérente |
| 422 | Entrée invalide, champ inconnu, référence de forme invalide |
| 429 | Plus de 5 tentatives par identifiant ou 30 par IP en 15 minutes ; `Retry-After: 900` |
| 503 | Base absente/indisponible ou migration manquante pour la sonde de disponibilité |

Les réponses privées portent `Cache-Control: no-store`, erreurs comprises. Une connexion réussie efface le compteur de l'identifiant ; les connexions réussies comptent toujours dans la limite IP. Les erreurs ne renvoient ni mot de passe ni paramètres SQL.

## Routes publiques

`GET /api/v1/health` retourne `{"status":"ok"}` si le processus répond. `GET /api/v1/health/ready` vérifie la connexion PostgreSQL et la révision Alembic attendue : 200 ou 503, sans détail de connexion. Docker utilise cette seconde sonde.

`/`, `/tasks`, `/favicon.svg`, `/assets/...`, `/documentation/...`, `/api/docs` et `/api/openapi.json` sont publics. Le shell `/tasks` ne contient aucune donnée privée. Un chemin inconnu reste 404, sans fallback HTML. `/documentation` redirige vers `/documentation/`.
