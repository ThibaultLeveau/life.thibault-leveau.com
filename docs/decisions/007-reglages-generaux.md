# ADR 007 — Réglages généraux et panneaux d’application

**Statut :** accepté par Thibault le 17 novembre 2026.

**Accord :** « Approve the unified settings page and contract extension (recommended) », après présentation du besoin, de la proposition, des alternatives et des conséquences, consigné dans l’[issue #76](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/76#issuecomment-6951215061) avant implémentation du contrat.

## Décision

Ajouter `/settings` au shell React et aux routes HTML explicites. La section Général rassemble thème, langue, fuseau de progression et vacances. `/settings?application=<id>` ouvre les préférences métier et les jours d’utilisation de cette application. Les anciennes URL `?tab=settings` rejoignent la nouvelle section.

Étendre `ApplicationModule` avec `Settings?: LazyExoticComponent<ComponentType<SettingsPanelProps>>`. Les callbacks `onDirty` et `onBusy` signalent les brouillons et écritures ; chaque panneau les remet à faux lors de son démontage. Le shell protège navigation, langue et déconnexion, et monte uniquement les panneaux des applications activées. Déconnexion, expiration et désactivation démontent les données privées. Les lectures annulées ou devenues obsolètes restent ignorées.

Les panneaux `apps/<id>/Settings.tsx` conservent leurs formulaires et clients métier dans l’application. Le registre existant est le seul assemblage ; noms, icônes et chemins viennent du catalogue backend. `platform` et `shared` n’importent aucun métier. Recettes n’a pas de formulaire métier global : ses jours d’utilisation sont fournis par la progression commune. Les réglages structurels des espaces Tâches restent contextuels, accessibles depuis leur section.

Réutiliser les API existantes et leurs validations, CSRF, propriétaires et gardes d’activation. Les préférences générales et le calendrier de progression restent disponibles indépendamment de Suivi. Les préférences de progression d’une application désactivée restent configurables par l’API commune ; son panneau métier n’est pas chargé.

## Alternatives

Un annuaire de liens préserverait le contrat mais disperserait les formulaires. Les déplacer dans le socle ou les dupliquer introduirait couplage et divergence. Le composant optionnel permet la composition sans déplacer les responsabilités métier.

## Conséquences

Ajouter un contrat frontend, une route du shell, des tests de navigation/accessibilité et de frontières, et les guides FR/EN. Aucun service, framework, stockage navigateur, dépendance ou schéma SQL supplémentaire. Les sauvegardes et anciennes images restent compatibles avec les données existantes. Les décisions précédentes conservent leur valeur historique.
