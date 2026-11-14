# ADR 003 — Applications LifeOS et bibliothèque personnelle

**Statut :** accepté par Thibault le 14 novembre 2026.

**Accord :** « J’accepte », en réponse à la proposition de l’[issue #18](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/18#issuecomment-6881146945), avant implémentation.

## Contexte

LifeOS accueille plusieurs applications personnelles suivant les mêmes conventions, chacune isolant son métier. La connexion et le transport HTTP liés à Tâches deviennent communs. L’utilisateur choisit ses applications dans une bibliothèque ; l’accueil présente ses applications activées.

## Décision

Conserver FastAPI, React/TypeScript/Vite, PostgreSQL, SQLAlchemy/Alembic, MkDocs et l’image Docker commune. Isoler chaque application dans `backend/src/life_app/apps/<id>/` et `frontend/src/apps/<id>/`. Chaque backend fournit manifeste, routeur, modèles, schémas et service ; chaque frontend fournit manifeste, `Page.tsx`, API métier, types, composants et styles. Des helpers internes complètent cette structure selon les besoins métier.

Le socle `platform/` porte l’authentification et la bibliothèque. `core/` reste l’infrastructure backend ; `shared/` porte les composants et styles réutilisables frontend. Les registres explicites sont les points d’assemblage. Le socle ne dépend d’aucun métier ; une application n’importe pas une autre application. Les migrations restent globales, ordonnées et immuables.

Le manifeste backend est la source des métadonnées, routes publiques et valeurs d’activation par défaut. L’assemblage API applique automatiquement la session et le garde d’activation à toutes les routes métier. Le registre frontend associe les identifiants aux composants, chargés à la demande. Le shell gère session, bibliothèque et accès aux applications.

La migration `0005_applications` ajoute les préférences `(user_id, application_id, enabled, updated_at)`. Une préférence absente utilise le défaut du manifeste : Tâches est activée pour préserver l’existant ; une nouvelle application est désactivée par défaut. GET `/api/v1/applications` et PUT `/api/v1/applications/{id}` exposent le catalogue et le réglage avec les protections existantes.

Désactiver retire l’application de l’accueil et refuse ses routes métier avec 403. L’accès HTML direct présente un lien vers la bibliothèque. Les données, archives, récurrences, dates et événements restent intacts ; la réactivation rend leur accès. Les URL tâches existantes sont préservées et les chemins inconnus restent 404.

## Alternatives

Un simple catalogue sans extraction laisse le couplage à Tâches et ne répond pas au besoin de structure commune. Des services, dépôts séparés ou plugins dynamiques augmenteraient les coûts d’authentification, versions et exploitation sans besoin actuel. Le monolithe modulaire permet d’isoler le métier et de mutualiser les conventions.

## Conséquences

Les imports et tests évoluent avec les dossiers ; les contrats HTTP tâches restent stables. Le registre explicite exige une livraison pour ajouter une application. Sport, OKR, ménage et plantes restent futurs, sans applications factices activables. Les nouvelles applications réutilisent le même socle et doivent respecter les contrats documentés dans AGENTS.md et le guide d’évolution.

La migration est additive et nécessite la sauvegarde habituelle. L’ancienne image ignore les activations et sa sonde refuse la nouvelle révision : terminer avec la nouvelle image ; ne pas revenir à une image qui contournerait les désactivations. Le downgrade refuse de perdre des préférences existantes. L’exploitation conserve les services, secrets et procédures existants. Les ADR 001 et 002 gardent leur contenu historique.
