# ADR 006 — Progression commune par application

**Statut :** accepté par Thibault le 16 novembre 2026.

**Accord :** « Oui, j’approuve cette architecture et son implémentation. », consigné dans l’[issue #58](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/58#issuecomment-6921056171), après présentation du besoin, des alternatives et des conséquences, avant implémentation.

## Décision

Ajouter `platform/progression` au monolithe FastAPI/React existant. Ce module possède le moteur de niveaux, séries et récompenses, les préférences et le journal PostgreSQL. Chaque application garde son fournisseur de progression, ses règles d’activité et son catalogue de quêtes dans son propre dossier. Le manifeste expose un contrat optionnel ; le registre existant reste le seul assemblage. Aucun import métier entre applications.

Les gains proviennent d’actions métier confirmées côté serveur, identifiées de façon stable et enregistrées dans la transaction de l’action. Le journal est append-only et les récompenses uniques par propriétaire, application et source. La reprise des historiques passe par les fournisseurs propres aux applications et une commande explicite de migration des données ; une lecture HTTP ne distribue pas de points. Les archives et désactivations préservent la progression. L’API commune contrôle propriétaire, activation de l’application concernée et CSRF pour les mutations.

Le frontend `platform/progression` utilise la session et le transport existants. Les Pages injectent son badge dans un slot neutre de `shared/ui/ApplicationNavigation`, qui ne dépend toujours ni du socle ni d’une application. Suivi présente le mur de quêtes, les titres, l’historique et les réglages communs via cette API. Tâches et Sport conservent leur progression même si Suivi est désactivé.

Le calendrier de progression utilise un fuseau IANA et conserve les dates des activités. L’exclusion des week-ends est configurable par application ; les vacances sont des intervalles globaux persistants. Un jour neutralisé ne crée aucune activité fictive. Les modifications de préférences sont versionnées pour détecter les écritures concurrentes.

## Alternatives

Conserver le moteur dans Suivi imposerait une dépendance fonctionnelle à son activation et un nouveau contrat transversal d’affichage. Dupliquer le moteur dans chaque métier produirait des comportements divergents et compliquerait les vacances globales. Le module commun maintient des frontières explicites et un seul moteur testable.

## Conséquences

Étendre le contrat des manifestes, les responsabilités de `platform`, la chaîne globale de migrations et les tests de frontières/activation. Documenter barèmes, déduplication, reprise historique et sauvegarde/restauration avec la fonctionnalité. PostgreSQL, sessions, CSRF, transactions, traductions FR/EN, tokens visuels et déploiement VPS restent ceux du projet. Aucun service, framework, ordonnanceur ou stockage externe supplémentaire.

Les ADR précédents restent inchangés.
