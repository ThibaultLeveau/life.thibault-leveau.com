# Faire évoluer LifeOS

## Capacités de l’assistant

L’[ADR 008](decisions/008-assistant-ia.md) approuve le contrat optionnel `ApplicationDefinition.actions`. Pour exposer une application à l’assistant, créer `apps/<id>/assistant.py` et un `ActionProvider(actions=(...))`. Chaque `ActionDefinition` fournit un nom stable, une description, un modèle d’entrée fermé, un handler, méthode/chemin HTTP correspondant, modèle de sortie, indicateur de mutation et éventuelle confirmation. Les arguments réunissent paramètres de chemin/requête et `payload` typé par les schémas métier existants. Le handler appelle les services du domaine sans `commit` : le dispatcher possède la transaction et le reçu.

Toute route métier doit posséder une capacité ou une exclusion technique explicite testée. Les lots, archives et suppressions exigent un aperçu. Une opération sans version métier doit fournir une précondition suffisante pour détecter les changements depuis cet aperçu. Les règles présentes seulement dans un routeur doivent être extraites dans le service et partagées avec l’API ; ne pas appeler directement les fonctions HTTP ni ajouter un accès inter-applications. Enregistrer le fournisseur dans le manifeste existant, puis tester couverture des routes, parité des sorties, propriétaires, application désactivée, conflits et rollback.

Le manifeste frontend peut fournir un renderer `Snippet` chargé à la demande, appartenant au domaine. Il reçoit un snippet versionné et des callbacks ; le shell injecte les renderers au chat. Les cartes montrent une proposition ou un résultat de reçu serveur, jamais une confirmation inventée par le modèle. Réutiliser les composants/tokens existants, vérifier clavier, FR/EN, thèmes et 320 px. Voir le [guide](assistant.md) et l’[API](assistant-api.md).

## État disponible

LifeOS possède un socle commun, une bibliothèque avec activation par compte et les applications **Tâches**, **Sport**, **Suivi**, **Objectifs OKR** et **Recettes & Liste de courses**. Ménage et plantes restent des pistes futures. L’[ADR 003](decisions/003-applications-lifeos.md) décrit l’organisation approuvée ; les ADR précédents conservent l’historique du socle et de la persistance.

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
├── Settings.tsx       # optionnel, ADR 007
├── api.ts
├── types.ts
├── components/
└── styles.css
```

1. Choisir un identifiant immuable : lettre minuscule suivie de lettres/chiffres/underscores, 50 caractères maximum. Fournir les noms/descriptions français et anglais dans le manifeste backend, selon l’[ADR 004](decisions/004-internationalisation.md). Réserver un chemin HTML unique (hors `/`, `/applications`, `/settings`, `/api`, `/documentation`, `/assets`).
2. Définir les contrats Pydantic, contrôles de propriétaire et services transactionnels. Les schémas refusent les champs inconnus ; le propriétaire vient de `CurrentUser`. Les routeurs committent les mutations après validation. Réutiliser `core.database.Database` et les sessions existantes ; aucune couche générique de dépôt.
3. Définir les tables propres au métier et une migration dans la chaîne globale `migrations/versions/` si nécessaire. Le manifeste importe le routeur, qui charge les modèles de l’application. L’import du registre lors des migrations doit charger toutes les métadonnées ORM. Ne pas modifier une ancienne migration.
4. Fournir `manifest.py` avec une `ApplicationDefinition` et l’importer dans `apps/registry.py`. L’ordre du tuple définit celui du catalogue. Le défaut est désactivé ; toute exception demande une justification de migration. L’assemblage API monte le routeur et lui applique automatiquement le contrôle d’activation. Les nouvelles routes métier utilisent un préfixe propre à l’application pour éviter les collisions ; Tâches garde ses URL historiques.
5. Fournir `manifest.ts` avec le même identifiant et une `Page` chargée via `React.lazy`, puis l’importer dans `apps/registry.ts`. La Page utilise `useSession`, `platform/api.ts`, les composants `shared/ui` et les tokens `--ui-*`. Elle compose `ApplicationSidebar`, `ApplicationTopbar` et `ApplicationFooter` pour conserver la navigation et le footer identiques aux autres applications ; seuls les liens et le contenu métier changent. Voir les règles de design dans `AGENTS.md` et [le frontend](frontend.md#navigation-commune-des-applications). Elle n’implémente ni connexion ni catalogue parallèle. Les noms, descriptions et URL d’ouverture viennent de l’API.
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

## Traductions livrées avec les fonctionnalités

Chaque application fournit ses catalogues FR/EN dans son propre dossier, avec des clés sémantiques et des phrases complètes. Réutiliser le moteur commun, les pluriels i18next et les formats de langue ; ne jamais traduire les textes personnels. Ajouter les erreurs serveur et exemples de planification dans les deux langues et étendre les tests de parité. Voir [Internationalisation](internationalisation.md#organisation-des-traductions).

## Ajouter une source de métriques

L’[ADR 005](decisions/005-integrations-tracking.md) approuve le contrat optionnel `ApplicationDefinition.metrics`. Implémenter `catalogue()`, `options(db,user,filter_id,q,offset,limit)` et `evaluate(db,user,query)` dans `apps/<id>/integrations.py`, puis fournir l’instance dans le manifeste. Le registre existant reste le seul assemblage. `platform/integrations` décrit les contrats et contrôles communs ; il ne connaît pas les modèles métier. Un consommateur utilise le service injecté ou l’API commune, jamais les tables/imports d’une autre application.

Chaque métrique décrit un identifiant stable, son nom et sa description FR/EN, une unité, les agrégations/filtres autorisés et son caractère historique ou actuel. Le fournisseur contrôle tous les propriétaires et borne ses lectures. Documenter les événements, fuseaux, archives, annulations, échantillons manquants et conditions de comparabilité. Les filtres ne doivent pas reconstruire le passé depuis un attribut actuel. Retourner `missing` ou `unavailable` lorsque le résultat n’est pas connu ; seuls les vrais compteurs vides valent zéro.

Étendre les tests de catalogue, propriétaire, source désactivée, bornes temporelles et erreurs, puis le [catalogue livré](integrations.md). Le cadre `shared/ui/ApplicationNavigation` réutilise sidebar/topbar de Sport via des slots ; conserver la connexion et les gardes de navigation dans la Page et injecter les éléments du compte. Aucun import vers `platform` depuis `shared`.

Le client HTTP et les types de métriques réutilisables sont dans `frontend/src/platform/integrations/`. Les composants de configuration et saisie restent propres à Suivi.

## Ajouter la progression d’une application

L’[ADR 006](decisions/006-progression-applications.md) approuve `ApplicationDefinition.progression`. Définir un fournisseur dans `apps/<id>/progression.py` : catalogue de quêtes stables et localisées, dix titres, barème et historique limité au propriétaire. Transformer une première confirmation métier en `Activity` (clé stable, instant UTC, XP, compteurs, dimensions), puis appeler le moteur commun dans la transaction existante. La clé doit survivre aux corrections/réouvertures et identifier une occurrence distincte lorsque le métier le permet. Aucun accès aux tables d’une autre application.

Déclarer le fournisseur dans le manifeste ; le registre demeure l’unique assemblage. Injecter `ProgressionBadge` dans le slot `status` de la topbar partagée. Utiliser `/progression` pour les lectures et réglages ; aucune attribution depuis le navigateur. Documenter unicité, corrections, jours d’activité, rétroactivité, reprise historique et barème. Tester quotas de quêtes/traductions, propriétaire, concurrence, activation, déduplication et restauration. Une modification des frontières ou du contrat exige à nouveau un accord explicite.

## Recettes disponible

**Recettes & Liste de courses** est une application livrée (`recipes`, `/recipes`), désactivée par défaut. Son catalogue bilingue, ses recettes, listes et modèles, son mode magasin et ses fournisseurs Suivi/progression réutilisent les contrats existants. [Guide](recipes.md) et [API](recipes-api.md). Ménage et plantes restent futurs.

## Faire évoluer les documentations

Conserver les huit guides indépendants déclarés dans `mkdocs.yml` : Technique, Général, Life AI, Tâches, Sport, Suivi, Objectifs OKR et Cook & Shop. Ajouter chaque page au bon guide et fournir son homologue dans `docs/en/`, au même chemin relatif. Le hook `scripts/documentation.py` conserve les URL publiques et isole navigation/recherche ; les liens explicites entre guides restent possibles. Actualiser les captures fictives FR/EN avec `make docs-screenshots`, leurs légendes, les contrats et les parcours navigateur. La compilation demeure MkDocs dans l’image existante ; aucun service ni stockage supplémentaire.

## Panneau de réglages

L’[ADR 007](decisions/007-reglages-generaux.md) permet un `Settings.tsx` optionnel dans chaque application, chargé à la demande par son manifeste. Implémenter `SettingsPanelProps` (`onDirty`, `onBusy`), nettoyer ces états au démontage et utiliser les API métier existantes. Ne pas importer la Page complète ni déplacer le métier dans le socle. Le shell fournit noms, activation et calendrier commun. Le lien Réglages ouvre `/settings?application=<id>` ; les réglages contextuels peuvent rester au niveau de leur objet avec un accès explicite depuis le panneau. Tester brouillons, erreurs, conflit, session, activation et navigation FR/EN/mobile.

## Détails des snippets

Un renderer conserve un résumé métier compact et utilise `platform/assistant/components/SnippetDetails` pour les données complètes du reçu (`snippetValue`). Ses libellés et adaptations de valeurs restent dans `apps/<id>/assistant/` ; le socle ne connaît aucun métier. Ne pas tronquer les données dans les helpers de lecture. Les textes longs utilisent `shared/ui/SnippetSummary` et son dépliage accessible. Tester listes longues, dernière ligne, texte au-delà de 1 500 caractères, zéro, booléens, petites décimales, pagination et modes FR/EN/mobile.

## Sources de l’assistant

L’[ADR 009](decisions/009-sources-assistant.md) autorise les sources multimodales et la dictée, désormais dans `apps/life_ai` (ADR 011). Toute extension respecte formats/budgets, propriétaire, CSRF, admission avant I/O, contrôles après traitement et données externes distinctes de la demande. Ajouter les blocs aux trois adaptateurs et les erreurs FR/EN ; ne pas introduire de téléchargement libre dans un outil métier. Les sources doivent survivre à l’historique et être supprimables via l’API. Couvrir parsing hostile, SSRF, idempotence, injection/confirmation, mémoire, compaction, annulation, quotas, migration/restauration et UI mobile/clavier. Un nouveau service, stockage ou élargissement des accès nécessite un nouvel accord explicite.

Import web Recettes livré selon l’[ADR 010](decisions/010-import-web-recettes.md) : navigateur isolé, intervention humaine, extraction IA dans la langue du compte, brouillon relu et provenance persistante. Il ne s’agit plus d’une proposition.

## Préserver le Dashboard et Life AI

Suivre l’[ADR 011](decisions/011-dashboard-life-ai.md) : le Dashboard assemble les cartes à partir du catalogue API ; une nouvelle application apparaît sans second catalogue. Reprendre `ApplicationPageProps` pour une Page. Tout démarrage transmis est transitoire, consommable une seule fois, protégé par les gardes de brouillon et l’idempotence serveur. L’application Life AI suit exactement le cycle d’activation commun. Réutiliser les fournisseurs et `structured.py` dans le socle pour une génération propre à un autre métier, sans importer Life AI. Ajouter les tests de routes imbriquées, de migration et de navigation concernés et documenter le comportement FR/EN avec captures.
