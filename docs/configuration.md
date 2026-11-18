# Configuration

Pydantic Settings charge les variables du processus avant `.env`. Les commandes locales partent de la racine du dépôt. `.env.example` configure le développement ; `.env.production.example` sert de modèle aux secrets Compose. Les fichiers réels et les sauvegardes restent exclus de Git et de l'image.

## Application

| Variable | Défaut | Portée |
| --- | --- | --- |
| `LIFE_ENVIRONMENT` | `development` | `development`, `test`, `production` ; active le cookie Secure en production |
| `LIFE_PUBLIC_BASE_URL` | `http://localhost:8100` | Origine autorisée pour les écritures depuis le navigateur |
| `LIFE_DATABASE_URL` | absente | URL `postgresql+psycopg://utilisateur:motdepasse@hôte:port/base` |
| `LIFE_SESSION_HOURS` | `168` | Durée fixe des sessions, de 1 à 720 heures ; pas de prolongation automatique |
| `LIFE_ASSISTANT_ENCRYPTION_KEYS` | absente | Trousseau de clés Fernet séparées par des virgules ; première clé active pour les tokens IA |
| `LIFE_ASSISTANT_TIMEOUT_SECONDS` | `180` | Durée maximale d’un tour IA, de 10 à 600 secondes |
| `LIFE_LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| `LIFE_FRONTEND_DIR` | `frontend/dist` | Artefacts frontend ; chemin relatif à la racine du dépôt |
| `LIFE_DOCUMENTATION_DIR` | `site` | Artefacts MkDocs ; chemin relatif à la racine du dépôt |

Sans URL de base, la sonde `/health` et les fichiers publics restent utilisables ; les fonctions privées et `/health/ready` répondent 503. La disponibilité de la base est contrôlée par la sonde, sans migration au démarrage. Une URL SQL incompatible est refusée.

Sans trousseau IA valide, l’enregistrement ou la lecture des tokens chiffrés est indisponible ; les applications et sondes restent utilisables. Générer une clé avec `uv run python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'` dans un terminal privé, la placer dans `.env.production` protégé et la sauvegarder séparément des dumps. Ne pas employer une clé d’exemple ni une valeur générée dans un journal public. Les anciennes clés servent au déchiffrement et à la [rotation](sauvegardes.md#migration-0015-assistant).

Le fournisseur, le modèle et le token utilisateur se règlent via l’[API Assistant](assistant-api.md), pas dans des variables frontend. Les adaptateurs utilisent uniquement `api.openai.com`, `api.anthropic.com` et `generativelanguage.googleapis.com` en HTTPS ; aucune URL de fournisseur arbitraire n’est acceptée. Le conteneur `web` rejoint le bridge Compose non interne `egress`, qui fournit la route sortante et permet la résolution DNS de ces hôtes. Ce contrôle des hôtes est applicatif ; le bridge ne filtre pas les domaines.

`LIFE_PUBLIC_BASE_URL` doit être l'origine exacte, sans sous-chemin : `http://localhost:5173` en développement, `https://life.thibault-leveau.com` en production. Elle ne configure ni DNS ni Caddy. Le proxy Vite permet d'éviter CORS ; aucune politique CORS générale n'est ouverte. En développement/test, l'origine du backend lui-même est également acceptée.

## PostgreSQL et Compose

| Variable | Usage |
| --- | --- |
| `LIFE_IMAGE` | Image `local/life:<SHA complet>` fournie par le script de publication |
| `LIFE_POSTGRES_PASSWORD` | Mot de passe du rôle applicatif `life`, non administrateur |
| `LIFE_POSTGRES_ADMIN_PASSWORD` | Mot de passe distinct de l'administrateur PostgreSQL |
| `LIFE_DATABASE_URL` | Connexion applicative avec le même mot de passe que `LIFE_POSTGRES_PASSWORD`, hôte `db`, base `life` |

Copier `.env.production.example` vers `.env.production`, remplacer les marqueurs avec deux mots de passe aléatoires distincts et protéger le fichier (`chmod 600`). Choisir une représentation hexadécimale pour éviter les caractères réservés des URL. Ne pas afficher `docker compose config` sans `--quiet` dans des journaux publics : la sortie contient les secrets interpolés.

Compose crée `life_egress` pour le seul service `web`, sans variable supplémentaire ni port publié. Conserver `database` interne et le réseau externe existant `multisite_proxy` dans son état interne. « Externe » signifie ici que Compose ne gère pas ce réseau ; cela ne lui donne pas une sortie Internet. Avec ces deux réseaux seuls, les sondes peuvent être saines alors que l’assistant ne peut pas joindre son fournisseur. Voir la [vérification depuis le conteneur](deploiement.md#sortie-https-des-fournisseurs).

Le script d'initialisation PostgreSQL crée le rôle `life` propriétaire de sa base, sans droits superutilisateur, création de bases ou création de rôles. Il ne s'exécute que sur un volume vide. Changer le fichier d'environnement ne change pas le mot de passe d'un rôle existant : coordonner une commande d'administration PostgreSQL et la nouvelle URL lors d'une rotation.

| Service | Écoute |
| --- | --- |
| Vite local | `127.0.0.1:5173` |
| FastAPI local | `127.0.0.1:8100` |
| MkDocs local | `127.0.0.1:8101` |
| PostgreSQL local | `127.0.0.1:8102` |
| Application en production | `8000`, réseau Docker `multisite_proxy`, alias `life-web` |
| PostgreSQL en production | `5432`, réseau privé Compose `database`, aucun port hôte |

Les secrets sont des paramètres serveur. Les noms, couleurs, ordres, filtres et thèmes sont des **données métier**, modifiables via l'[API](api.md), jamais via des variables frontend.

Les réglages de la vue **À venir** sont propres au compte : période (jour/demain/semaine/personnalisée), horizon de 1 à 90 jours, inclusion des retards et des tâches terminées. Ils passent par `/api/v1/agenda/view` ; aucun nouveau paramètre d’environnement n’est nécessaire.

## Quota des sources IA et dictée

`LIFE_ASSISTANT_SOURCE_QUOTA_BYTES` borne les fichiers et textes extraits conservés par compte (défaut `209715200`, soit 200 Mio ; plage 20 Mio–2 Gio). La valeur est exposée par `GET /api/v1/assistant/sources/limits`. Les limites de format/message/traitement restent conservatrices dans le module assistant. Une réservation compte 10 Mio avant import ; prévoir cette marge même pour un petit fichier. Réduire le quota ne supprime aucune donnée, mais peut bloquer les nouveaux imports jusqu’à libération d’espace.

Les réglages de dictée sont personnels via `/assistant/transcription/settings`, et ne nécessitent aucun secret serveur supplémentaire : le trousseau `LIFE_ASSISTANT_ENCRYPTION_KEYS` protège aussi le credential distinct éventuel. Réutilisation OpenAI : `gpt-transcribe` ; Gemini : modèle du chat. Choisir explicitement un modèle/token séparé au besoin. Aucun fallback silencieux entre fournisseurs.
