# API Assistant

[English reference](en/assistant-api.md) · [Guide utilisateur](assistant.md) · [OpenAPI](https://life.thibault-leveau.com/api/docs)

Toutes les routes utilisent `/api/v1/assistant`. La session commune identifie le propriétaire ; les mutations exigent l’origine autorisée et `X-CSRF-Token`. Les entrées refusent les champs inconnus et ne permettent pas de choisir un propriétaire. Les capacités métier exigent aussi une application active.

## Routes et contrats

| Méthode et chemin relatif | Comportement |
| --- | --- |
| `GET /settings` | `provider`, `model`, `configured`, `token_hint`, `memory_enabled` ; aucun token lisible |
| `PUT /settings` | Mise à jour partielle : `provider` (`openai/anthropic/gemini`), `model`, `api_token`, `memory_enabled` |
| `POST /settings/test` | Appel réseau au fournisseur configuré ; retourne `{ "ok": true }` en cas de succès |
| `GET /capabilities` | Capacités actives, libellé `label` dans la langue du compte, contrats JSON, route HTTP correspondante, écriture et confirmation requise |
| `GET /conversations` | Recherche `q` (160 caractères), `archived=false`, `offset=0`, `limit=30` (1–100) ; `{ items, total }` |
| `POST /conversations` | `{ "title": "" }` facultatif ; titre de 160 caractères maximum ; retourne la conversation (201) |
| `GET /conversations/{id}` | Conversation et messages ; `offset=0`, `limit=100` (1–200), `has_more` |
| `PATCH /conversations/{id}` | `title` non vide et/ou booléen `archived` |
| `DELETE /conversations/{id}` | Suppression (204) ; `forget_memories=false` conserve les souvenirs associés |
| `POST /conversations/{id}/messages` | `{ "content": "…", "request_id": "UUID" }` ; texte et sources ; voir ci-dessous ; flux SSE |
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

## Sources et transcription

| Route | Contrat |
| --- | --- |
| `GET /sources/limits` | Formats, limites de fichiers/images/pages/texte, budget par message, quota configuré et durée des brouillons |
| `POST /sources/files?filename=rapport.pdf` | Corps binaire brut, nom encodé dans la query ; métadonnées de source (201). Pas de multipart ni base64 |
| `POST /sources/web` | JSON `{ "url": "https://example.org/article" }` ; instantané texte ou PDF natif selon le contenu, et métadonnées (201) |
| `GET /sources/{id}` | Métadonnées accessibles au propriétaire uniquement |
| `GET /sources/{id}/content` | Téléchargement authentifié en pièce jointe, `no-store` et `nosniff` ; jamais de HTML actif rendu dans LifeOS. Une source retirée renvoie 410 |
| `DELETE /sources/{id}` | Efface le contenu, conserve la trace si attachée ; 204. Refus 409 pendant une exécution de la conversation |
| `GET /transcription/settings` | `provider`, `model`, `configured`, `token_hint`, `use_chat_provider` effectifs ; `custom_provider`, `custom_model`, `custom_configured`, `custom_token_hint` conservent le profil indépendant lorsque le chat est réutilisé ; jamais le token |
| `PUT /transcription/settings` | Entrée partielle : `provider` OpenAI/Gemini, `model`, `api_token` ou null, `use_chat_provider` |
| `POST /transcription?filename=voice.webm` | Corps audio brut WAV/WebM/OGG/MP3/MP4/M4A, 10 Mio maximum ; `{ "text": "…" }` jusqu’à 12 000 caractères, aucun message créé |

`SendMessage` accepte désormais `source_ids: UUID[]` (défaut `[]`, maximum quatre) et `content` de 0–12 000 caractères ; au moins un texte non vide ou une source est obligatoire. Les sources doivent être prêtes, non expirées, appartenir au compte et ne pas être attachées à un autre message. Leur association au message et l’admission du tour sont atomiques. `request_id` inclut la liste ordonnée des sources dans son empreinte ; rejouer exactement la demande rend les mêmes reçus, même après retrait d’une source. Modifier texte, conversation ou sources avec le même UUID renvoie 409.

Les messages incluent `sources`, liste de métadonnées : `id`, `kind` (`file/web`), `name`, `media_type`, `size_bytes`, `sha256`, `url`, `page_count`, `created_at`, `removed_at`. Pas de binaire ou texte extrait dans la réponse d’historique. Les octets sont disponibles seulement via la route de contenu. Une source retirée ne redevient pas lisible lors d’une relecture d’événements.

Erreurs avant traitement : 401/403 session/CSRF, 404 propriétaire ou référence, 408 téléversement dépassant 30 secondes, 409 source occupée/attachée/expirée ou quota de stockage/nombre, 410 contenu retiré, 413 volume, 422 format/contenu/adresse interdite, 429 imports simultanés/fréquence, 502 fournisseur/lecture distante, 503 chiffrement. La réponse HTTP contient un détail localisé ; les événements SSE du chat gardent leurs codes. Aucun détail brut de fournisseur, adresse réseau interne ou secret n’est exposé.

À insérer dans le bloc `with` du client authentifié de l’exemple précédent :

```python
from pathlib import Path
from uuid import uuid4

source = client.post("/assistant/sources/files", params={"filename": "rapport.pdf"},
                     content=Path("rapport.pdf").read_bytes(),
                     headers={"Content-Type": "application/pdf"})
source.raise_for_status()
page = client.post("/assistant/sources/web", json={"url": "https://example.org/"})
page.raise_for_status()
response = client.post(f"/assistant/conversations/{conversation_id}/messages", json={
    "content": "Résume ces deux sources sans modifier mes données.",
    "source_ids": [source.json()["id"], page.json()["id"]], "request_id": str(uuid4()),
})
response.raise_for_status()  # Inspecter aussi les événements SSE et l’état final.
transcript = client.post("/assistant/transcription", params={"filename": "voice.wav"},
                         content=Path("voice.wav").read_bytes())
transcript.raise_for_status()
print(transcript.json()["text"])  # Relire avant tout envoi au chat.
```

Les champs `custom_provider`, `custom_model`, `custom_configured` et `custom_token_hint` décrivent séparément la configuration indépendante conservée, même lorsque `use_chat_provider=true`. Ils permettent de revenir à celle-ci sans écraser son modèle ni son credential. Aucun secret n’est retourné.

## Import et délégations de Tâches

La capacité `tasks.import_tasks` correspond à `POST /tasks/import`, arguments `{ "payload": { "tasks": [<TaskCreate>, …] } }`. Elle exige toujours un aperçu à confirmer, même avec `propose=false`. L’aperçu contient toutes les tâches et destinations ; il ne persiste aucune création. La confirmation revalide propriétaire, activation et empreinte des métadonnées de destination (espaces, sections, statuts, étiquettes), puis exécute atomiquement les mêmes services que l’API. Un changement de destination depuis l’aperçu entraîne 409. Le reçu évite toute double création lors d’une confirmation répétée ou concurrente.

Chaque appel `delegate_<application>` instancie un spécialiste neuf, y compris plusieurs appels pour la même application. Les dépendances utilisent uniquement les identifiants des résultats confirmés ; les identifiants simulés des aperçus ne sont pas transmis comme objets créés. Les budgets globaux configurables sont partagés ; le plafonnement local est de 24 échanges par spécialiste et 16 pour le coordinateur. Voir [Configuration](configuration.md).
