# ADR 004 — LifeOS en français et en anglais

**Statut :** accepté par Thibault le 16 novembre 2026.

**Accord :** « J’accepte », consigné dans l’[issue #35](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/35#issuecomment-6909755926) avant implémentation.

## Décision

Conserver le monolithe modulaire et ses frontières. Ajouter une préférence de compte `locale` (`fr` ou `en`) à PostgreSQL, à la session et à l’API commune. Les comptes existants restent en français. Les écritures partielles des préférences conservent les autres réglages.

Utiliser i18next/react-i18next et des catalogues JSON versionnés à clés stables pour l’interface. Chaque application possède ses traductions métier ; les composants partagés ne dépendent pas de `platform/`. Les traductions serveur suivent les mêmes frontières. Le manifeste backend reste l’autorité pour les métadonnées localisées de bibliothèque. La langue authentifiée vient du compte ; avant connexion, `Accept-Language` permet de choisir une langue, avec repli français.

Conserver les 680 exercices fournis dans le catalogue versionné, avec leurs identifiants et leur indicateur `builtin`. Leurs textes français/anglais sont séparés des données indépendantes de la langue. La localisation des programmes, entraînements et métriques intervient au rendu et ne modifie pas leurs instantanés persistés. Les contenus personnels ne sont jamais traduits par correspondance de nom ni envoyés à un service de traduction.

Les formats de dates et de nombres, les aides, messages et récurrences suivent la langue choisie. L’analyse anglaise des dates utilise le même contrat de récurrence que l’analyse française. Une bascule de langue invalide les lectures de l’ancienne langue ; la déconnexion démonte les données privées.

## Alternatives

Des traductions intégralement en SQL seraient utiles pour une édition en ligne, absente du besoin actuel. Des catalogues livrés avec le code permettent de revoir et tester les traductions avec chaque fonctionnalité. Un moteur maison imposerait d’entretenir pluriels, interpolation et intégration React. Une traduction distante à l’exécution introduirait une dépendance externe et des résultats variables.

## Conséquences

Ajouter deux dépendances frontend verrouillées et une migration additive dans la chaîne globale. Maintenir la complétude FR/EN par des tests et couvrir API/interface, contenus personnels, historiques, propriétaires et sauvegarde/restauration. Les nouvelles applications fournissent leurs deux langues. Aucun nouveau service, stockage autonome ou mode de déploiement. Les ADR précédents conservent leur valeur historique.
