# Faire évoluer LifeOS

## État disponible

LifeOS possède un socle commun, une bibliothèque avec activation par compte et une première application **Tâches**. Sport, objectifs OKR, ménage et plantes restent des pistes futures. L’[ADR 003](decisions/003-applications-lifeos.md) décrit l’organisation approuvée ; les ADR précédents conservent l’historique du socle et de la persistance.

Toutes les applications suivent les mêmes conventions et isolent leur métier. Les dossiers ne sont pas des copies de Tâches : ils réutilisent connexion, transport API, activation, thème et composants accessibles du socle.

## Ajouter une application

Créer une issue détaillée puis une branche depuis `main` à jour. Une application respectant le contrat ci-dessous reste dans l’architecture approuvée ; un nouveau service, stockage, framework, mode de déploiement ou changement de frontières demande un nouvel accord explicite.

```text
backend/src/life_app/apps/<id>/
├── __init__.py
├── manifest.py
├── router.py
├── models.py
├── schemas.py
└── service.py
frontend/src/apps/<id>/
├── manifest.ts
├── Page.tsx
├── api.ts
├── types.ts
├── components/
└── styles.css
```

1. Choisir un identifiant immuable : lettre minuscule suivie de lettres/chiffres/underscores, 50 caractères maximum. Garder les libellés français dans le manifeste backend. Réserver un chemin HTML unique (hors `/`, `/applications`, `/api`, `/documentation`, `/assets`).
2. Définir les contrats Pydantic, contrôles de propriétaire et services transactionnels. Les schémas refusent les champs inconnus ; le propriétaire vient de `CurrentUser`. Les routeurs committent les mutations après validation. Réutiliser `core.database.Database` et les sessions existantes ; aucune couche générique de dépôt.
3. Définir les tables propres au métier et une migration dans la chaîne globale `migrations/versions/` si nécessaire. Le manifeste importe le routeur, qui charge les modèles de l’application. L’import du registre lors des migrations doit charger toutes les métadonnées ORM. Ne pas modifier une ancienne migration.
4. Fournir `manifest.py` avec une `ApplicationDefinition` et l’importer dans `apps/registry.py`. L’ordre du tuple définit celui du catalogue. Le défaut est désactivé ; toute exception demande une justification de migration. L’assemblage API monte le routeur et lui applique automatiquement le contrôle d’activation. Les nouvelles routes métier utilisent un préfixe propre à l’application pour éviter les collisions ; Tâches garde ses URL historiques.
5. Fournir `manifest.ts` avec le même identifiant et une `Page` chargée via `React.lazy`, puis l’importer dans `apps/registry.ts`. La Page utilise `useSession`, `AccountMenu`, `platform/api.ts`, les composants `shared/ui` et les tokens `--ui-*`. Elle n’implémente ni connexion ni catalogue parallèle. Les noms, descriptions et URL d’ouverture viennent de l’API.
6. Garder les helpers et styles métier dans le dossier de l’application. Les données de formulaire restent transitoires ; toute opération et préférence persistante possède son accès API. Le socle ne dépend pas du métier ; aucune application n’importe une autre application.
7. Ajouter des tests HTTP avec PostgreSQL, des tests navigateur et le guide utilisateur. Le test de contrat vérifie les manifestes et frontières ; le test des routes désactivées doit couvrir tous les routeurs enregistrés. Vérifier isolation propriétaires, erreurs, clavier/mobile, migration, sauvegarde/restauration et préservation après bascule.
8. Exécuter `make check`, `make test`, `make build`, construire/tester l’image, relire le diff et ouvrir une PR liée à l’issue. Consigner la revue, attendre la CI du dernier commit, fusionner puis déployer le dernier `main` sur le VPS selon [le guide](deploiement.md). Vérifier SHA, HTTPS, sondes et parcours avant de conclure.

Exemple de manifeste backend (illustration, pas une application livrée) :

```python
from life_app.platform.applications.definition import ApplicationDefinition
from life_app.apps.example.router import router

application = ApplicationDefinition(
    id="example", name="Exemple", description="Description de l’application.",
    path="/example", icon="grid", router=router,
)
```

Exemple frontend :

```typescript
import { lazy } from "react";
import type { ApplicationModule } from "../../platform/applications/definition";

export const application: ApplicationModule = {
  id: "example",
  Page: lazy(() => import("./Page").then(({ Page }) => ({ default: Page }))),
};
```

## Cycle de vie et migrations

La bibliothèque conserve uniquement les activations personnelles. Désactiver ne supprime, ne résout et n’archive aucune donnée ; réactiver rend les mêmes objets. Une application retirée du code ne doit pas entraîner de suppression silencieuse de ses préférences ou tables. Documenter séparément toute procédure de retrait définitif.

Créer une nouvelle migration pour chaque changement du schéma livré. Tester contraintes, aller/retour, compatibilité avec l’image précédente et restauration sur données synthétiques. La migration reste une commande explicite de publication. Une image précédente n’annule jamais le schéma.

Pour Tâches, préserver les événements `completed`, `reopened`, `rescheduled` et `completion_undone`, leurs instants UTC et contexte historique. Les futures statistiques doivent distinguer résolutions, tâches distinctes et délais par cycle ; l’archivage et la désactivation ne sont pas des résolutions. Voir [les invariants](donnees.md).
