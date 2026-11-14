# Backend

`life_app.main:create_app` assemble FastAPI, la configuration, les connexions, les routes et les fichiers statiques. L'installation `backend/src/` expose aussi la commande `life` ; aucun ajustement manuel de `PYTHONPATH` n'est nécessaire.

`features/tasks/recurrence.py` valide les règles de jours/semaines/mois/années et calcule les dates avec python-dateutil. La recherche saute les phases calendaires anciennes et borne la vérification d’une règle impossible par le cycle grégorien. Les combinaisons impossibles usuelles (31 février, jour incompatible avec un intervalle de sept jours) sont rejetées sans parcourir des millénaires. `scheduling.py` analyse le français et conserve les indices du texte original, y compris accents combinés et emoji. Analyse et aperçu ne modifient pas de tâche ; résolutions, déplacements et éditions de statut partagent la même transition atomique. Voir les [invariants d’occurrence](donnees.md#recurrences-et-occurrences) et les [contrats](api.md#planification-et-recurrences).

| Module | Responsabilité |
| --- | --- |
| `core/config.py`, `core/logging.py` | Paramètres typés, sortie standard et suppression des paramètres de requête des logs d'accès |
| `core/database.py` | Engine PostgreSQL, pool et session SQLAlchemy par requête |
| `features/auth/` | Comptes, sessions, limites de connexion, contrats et contrôles d'accès |
| `features/tasks/` | Modèles relationnels, contrats Pydantic et règles métier |
| `api/v1/` | Traduction HTTP, dépendances et commit explicite des mutations |
| `api/health.py` | Vie du processus et disponibilité base/migrations |
| `web/static.py` | Routes publiques explicites et artefacts autorisés |
| `migrations/` | Historique Alembic inclus dans le package et l'image |
| `cli.py` | Migration, création de compte et réinitialisation du mot de passe |

## Transactions et concurrence

Les accès SQLAlchemy/psycopg synchrones sont utilisés dans les routes FastAPI synchrones. Une requête partage une session SQL et la ferme à sa fin ; un échec annule les mutations non commitées. Le routeur commite après validation des résultats. Le service enregistre la tâche et ses événements dans la même transaction.

Chaque mutation authentifiée verrouille la ligne utilisateur avant de lire les objets modifiables. Cela sérialise les écritures d'un même propriétaire, y compris les déplacements entre espaces. Une tâche exige en plus `expected_version` ; une édition périmée obtient 409 au lieu d'écraser silencieusement un autre changement. Réordonner peut changer la version des autres tâches dont la position évolue.

Les lectures n'ont pas ce verrou. Une liste paginée n'est pas un instantané multi-requêtes ; un client parcourant de très nombreuses pages pendant des modifications doit rafraîchir ses données. Le frontend charge toutes les pages pour rendre la vue personnelle, sans virtualisation.

L'authentification applique les contrôles côté serveur sur toutes les routes métier. Les identifiants de propriétaire ne proviennent jamais d'une entrée cliente. Les références espace/section/statut/étiquette sont vérifiées dans le service et les clés étrangères composites. Voir [Données](donnees.md) et [Sécurité](securite.md).

## Erreurs et contrats

Les schémas interdisent les champs inconnus. Les PATCH distinguent un champ absent de `null` ; seuls `section_id` et `due_date` peuvent être remis à `null` sur une tâche. Les erreurs de validation n'incluent pas la valeur saisie. Les conflits SQL deviennent 409 et les autres erreurs de base 503, sans requête SQL ou valeur personnelle dans la réponse.

Les contraintes de colonnes et les index sont figés dans une migration explicite. Ne pas recréer le schéma avec `create_all` au démarrage. Pour une évolution, générer une nouvelle migration, relire ses effets, tester la transition et documenter la compatibilité avec l'image précédente.

```bash
uv run alembic revision --autogenerate -m "description"
uv run life migrate
make test
```

Ne jamais réécrire une migration déjà publiée. Le fichier `alembic.ini` facilite le développement ; la commande empaquetée localise ses migrations sans dépendre de ce fichier dans le runtime.

## Distribution HTTP

Seuls `/` et `/tasks` servent le shell React. `/tasks?space=<UUID>` ouvre directement un espace autorisé ; un identifiant inconnu revient au premier espace actif. `/assets/`, `/favicon.svg` et `/documentation/` servent leurs artefacts dédiés. Les autres chemins restent 404, y compris une route API inconnue. Aucun répertoire de travail, secret ou sauvegarde n'est exposé.

Les tests combinent artefacts temporaires pour le routage et PostgreSQL réel pour les fonctions privées. Voir [Tests](tests.md) et [Référence API](api.md).
