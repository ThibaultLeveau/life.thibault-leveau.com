# API Assistant

[English reference](en/assistant-api.md) · [Guide utilisateur](assistant.md) · [OpenAPI](https://life.thibault-leveau.com/api/docs)

Toutes les routes utilisent `/api/v1/assistant`. La session commune identifie le propriétaire ; les mutations exigent l’origine autorisée et `X-CSRF-Token`. Les entrées refusent les champs inconnus et ne permettent pas de choisir un propriétaire. Les capacités métier exigent aussi une application active.

## Routes et contrats

| Méthode et chemin relatif | Comportement |
| --- | --- |
| `GET /settings` | `provider`, `model`, `configured`, `token_hint`, `memory_enabled` ; aucun token lisible |
| `PUT /settings` | Mise à jour partielle : `provider` (`openai/anthropic/gemini`), `model`, `api_token`, `memory_enabled` |
| `POST /settings/test` | Appel réseau au fournisseur configuré ; retourne `{ "ok": true }` en cas de succès |
| `GET /capabilities` | Capacités actives, contrats JSON, route HTTP correspondante, écriture et confirmation requise |
| `GET /conversations` | Recherche `q` (160 caractères), `archived=false`, `offset=0`, `limit=30` (1–100) ; `{ items, total }` |
| `POST /conversations` | `{ "title": "" }` facultatif ; titre de 160 caractères maximum ; retourne la conversation (201) |
| `GET /conversations/{id}` | Conversation et messages ; `offset=0`, `limit=100` (1–200), `has_more` |
| `PATCH /conversations/{id}` | `title` non vide et/ou booléen `archived` |
| `DELETE /conversations/{id}` | Suppression (204) ; `forget_memories=false` conserve les souvenirs associés |
| `POST /conversations/{id}/messages` | `{ "content": "…", "request_id": "UUID" }` ; contenu de 1–12 000 caractères ; flux SSE |
| `GET /runs/{id}/events` | Relecture des événements persistés après `after=0` ; aucun lancement d’action |
| `POST /runs/{id}/cancel` | Demande l’arrêt des étapes suivantes ; `{ "ok": true }` |
| `POST /operations/{id}/confirm` | Confirme l’opération enregistrée ; retourne état, résultat et snippet |
| `GET /memories` | `offset=0`, `limit=100` (1–500) ; `{ items, total }` |
| `POST /memories` | `{ "content": "…", "category": "personal" }` ; crée un souvenir (201) |
| `PATCH /memories/{id}` | Remplace `content` et éventuellement `category` |
| `DELETE /memories/{id}` | Oublie un souvenir (204) |
| `DELETE /memories` | Oublie tous les souvenirs (204) |

Omettre `api_token` conserve la valeur existante ; `null` la supprime ; une chaîne doit contenir 10 à 4 096 caractères. Changer de fournisseur efface l’ancien token et le modèle. `model` accepte lettres, chiffres, point, tiret, souligné et deux-points, jusqu’à 120 caractères. Les souvenirs acceptent 1–1 000 caractères et une catégorie de 1–40 caractères ; le compte peut en conserver 500. Les motifs connus de secrets sont refusés, sans constituer une détection exhaustive.

Les sources, dates et identifiants des souvenirs sont attribués côté serveur. Les messages portent `role`, `content`, `status`, `snippets`, `run_id` et leur date. Les états de réponse sont `running`, `complete`, `interrupted`, `failed`. Les conversations supprimées entraînent la suppression de leurs messages, exécutions, événements et opérations ; l’option d’oubli contrôle séparément les souvenirs.

## Streaming et idempotence

Le POST renvoie `text/event-stream`. Chaque événement est un objet JSON dans une ligne `data:`, suivi d’une ligne vide, avec `type`, `run_id` et `sequence`. Types : `status` (texte de progression), `delta` (texte partiel), `message` (message et snippets à réconcilier), `error` (code), `done` (fin). Réconcilier les messages et cartes par identifiant plutôt que de les ajouter à nouveau.

Conserver `request_id` pour une même intention d’envoi. Répéter le même UUID, la même conversation et le même texte relit les événements sans réexécuter les outils. Réutiliser l’UUID avec un autre contenu ou une autre conversation renvoie 409. Une nouvelle demande utilise un nouvel UUID. La relecture est un instantané des événements déjà persistés, pas une relance du modèle.

Les opérations ont un reçu persistant `(run_id, step)` et une empreinte des arguments normalisés. Mutation métier, historique, progression et reçu sont atomiques. Répéter une confirmation réussie rend son reçu sans répéter la mutation. Les aperçus expirent après 24 heures ; une version métier différente refuse la confirmation. Un arrêt n’annule pas les mutations déjà commitées.

Les erreurs avant ouverture du flux utilisent les réponses HTTP habituelles. Après son ouverture, consulter les événements `error` et l’état final du message ; un statut HTTP 200 n’implique pas la réussite de toutes les actions. Exemples : 401 session, 403 application désactivée, 404 référence absente/inaccessible, 409 conflit/version/configuration manquante/tour déjà actif, 422 validation, 502 fournisseur et 503 chiffrement indisponible. Les codes sont stables ; les détails bruts du fournisseur ne sont pas exposés.

## Exemple indépendant du navigateur

Cet exemple utilise un compte de recette dont fournisseur, modèle et token sont déjà configurés. `httpx` est fourni par l’environnement de développement. Il crée réellement une conversation et effectue un appel facturable au fournisseur ; le texte demande une lecture uniquement.

```python
import getpass
import json
from uuid import uuid4

import httpx

with httpx.Client(base_url="http://127.0.0.1:8100/api/v1", timeout=240) as client:
    login = client.post("/auth/session", json={
        "username": input("Compte de recette : "), "password": getpass.getpass(),
    })
    login.raise_for_status()
    client.headers["X-CSRF-Token"] = login.json()["csrf_token"]
    created = client.post("/assistant/conversations", json={"title": "Lecture de recette"})
    created.raise_for_status()
    conversation_id = created.json()["id"]
    request_id = str(uuid4())  # Conserver cet UUID pour relire ce même envoi.
    with client.stream("POST", f"/assistant/conversations/{conversation_id}/messages", json={
        "content": "Liste mes applications activées sans rien modifier.",
        "request_id": request_id,
    }) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if line.startswith("data: "):
                event = json.loads(line[6:])
                if event["type"] == "delta":
                    print(event["text"], end="", flush=True)
                elif event["type"] == "error":
                    print("\nErreur :", event["code"])
    result = client.get(f"/assistant/conversations/{conversation_id}")
    result.raise_for_status()
    print("\nÉtat :", result.json()["messages"][-1]["status"])
```

Utiliser HTTPS en production. Les routes métier d’origine restent l’API de référence pour les objets, indépendamment de toute génération IA. Voir [contrats des applications](evolution.md), [données](donnees.md) et [restauration](sauvegardes.md#migration-0015-assistant).
