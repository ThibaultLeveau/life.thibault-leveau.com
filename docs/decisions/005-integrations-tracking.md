# ADR 005 — Intégrations de métriques et suivi personnel

**Statut :** accepté par Thibault le 16 novembre 2026.

**Accord :** « Oui, j’approuve cette architecture et tu peux l’implémenter. », consigné dans l’[issue #46](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/46#issuecomment-6915969194), après la proposition détaillée et avant implémentation.

## Décision

Conserver le monolithe FastAPI/React, PostgreSQL, les sessions, les transactions et le déploiement VPS. Ajouter `tracking` selon l’ADR 003, désactivé par défaut. Le suivi possède ses définitions versionnées, saisies par période, instantanés de sources et historique de corrections.

Étendre le manifeste backend avec un fournisseur optionnel de métriques. `platform/integrations` définit les contrats neutres, la validation des périodes, l’API de découverte et les contrôles d’activation. Chaque application implémente son fournisseur dans son propre dossier. Le registre existant reste l’unique assemblage ; aucun domaine n’importe un autre domaine. Le suivi reçoit les fournisseurs par injection et ne lit jamais leurs tables directement.

Les fournisseurs décrivent des métriques localisées, unités et filtres autorisés, fournissent des options recherchables, et évaluent une requête bornée pour le propriétaire authentifié. Le serveur vérifie l’activation de la source et la propriété des filtres à chaque lecture. Indisponible, absence de mesure et zéro sont distincts. Aucun SQL arbitraire, code externe, service, ordonnanceur ou bus de messages n’est introduit.

La saisie confirmée conserve valeur et provenance. Les aperçus sont recalculés à la demande ; actualiser une saisie est une correction explicite et historisée. Désactiver une source bloque ses nouvelles lectures, sans effacer les instantanés déjà enregistrés. Les corrections ne multiplient pas les points. Les périodes utilisent un fuseau IANA explicite ; les bornes locales sont converties en UTC.

Réutiliser le cadre visuel commun Sport dans `shared/ui`, sans dépendance à `platform` ni à une application. Titres, navigation et menu du compte arrivent par propriétés. Les comportements métier et les gardes de navigation restent dans les Pages. La PR #44 a livré `ApplicationSidebar`, `ApplicationTopbar` et le footer commun pendant l’implémentation de Suivi : ces composants existants sont réutilisés directement, conformément au même objectif approuvé, sans second cadre concurrent.

## Alternatives

Les imports directs entre métiers enfreignent les frontières et rendent chaque ajout dépendant des consommateurs. L’agrégation dans le navigateur duplique les règles et ne fournit pas la parité API. Un service analytique ou un bus impose synchronisation et exploitation supplémentaires. Les fournisseurs injectés permettent une extension explicite, testable et locale au métier.

## Conséquences

Le contrat des manifestes et ses tests de frontières évoluent. Les métriques d’activité exploitent seulement les événements et mesures réellement enregistrés ; aucun temps d’écran n’est déduit. Les champs historiques absents ne sont pas reconstruits à partir des valeurs actuelles. Les requêtes et options sont bornées. Les données Tracking suivent une migration additive globale, la sauvegarde PostgreSQL et les mêmes règles de propriétaire/CSRF/version que les autres applications. La documentation des fournisseurs et des métriques fait partie de chaque évolution.

Les ADR précédents restent inchangés.
