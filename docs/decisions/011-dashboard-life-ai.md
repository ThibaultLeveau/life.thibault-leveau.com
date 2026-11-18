# ADR 011 — Dashboard et application Life AI

**Statut :** accepté par Thibault le 18 novembre 2026.

**Accord :** « J’approuve cette architecture et son implémentation jusqu’au déploiement. », après présentation du besoin, de la proposition, de l’alternative et des conséquences, [consigné dans l’issue #104](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/104#issuecomment-6990156465) avant implémentation.

## Décision

L’accueil `/` devient un Dashboard : applications personnelles activées dans un carrousel sur une seule ligne et carte de démarrage d’une conversation. Le chat devient **Life AI**, application `life_ai` sur `/ai`, enregistrée dans les deux registres avec les mêmes frontières, navigation et contrôles d’activation que les autres applications. Les anciens liens `/?conversation=…` rejoignent `/ai?conversation=…`.

`apps/life_ai` possède les conversations, messages, exécutions, reçus, mémoire, sources, dictée et leur interface. Ses routes conservent les URL `/api/v1/assistant/*` et passent exclusivement par le garde central. Les opérations longues recontrôlent aussi l’activation sous verrou propriétaire avant de poursuivre ou d’enregistrer une réponse externe. La désactivation conserve toutes les données et interdit les nouveaux accès, y compris les confirmations d’actions.

`platform/assistant` conserve les contrats de capacités et snippets, les capacités LifeOS, adaptateurs fournisseurs, chiffrement, configuration fournisseur et génération structurée réutilisée par Recettes. La configuration commune est accessible par `/api/v1/assistant/provider-settings` et dans les réglages généraux, indépendamment de Life AI. Les anciennes routes de réglages du chat restent disponibles dans Life AI. La table `assistant_settings` conserve ses colonnes historiques de mémoire pour compatibilité ; seul le service Life AI en applique le cycle de vie. Aucun import du socle vers l’application ni import entre applications.

Le shell fournit aux Pages les modules du registre et un démarrage optionnel à usage unique. Le texte saisi reste transitoire en mémoire React pendant la navigation vers Life AI, sans URL, `history.state`, localStorage ou sessionStorage contenant le message. Life AI préremplit le brouillon et déclenche un envoi lorsque ses réglages sont prêts. La consommation du démarrage et l’identifiant de requête évitent une réémission au retour ou au rechargement. Une configuration absente ou un rejet conserve le brouillon ; une réponse réseau incertaine demande de consulter l’historique avant toute nouvelle tentative. Les gardes de brouillon et de requête s’appliquent aussi au retour navigateur.

La migration additive `0020_life_ai` active Life AI pour les comptes déjà présents, sans écraser une préférence explicite. Les nouveaux comptes ont le défaut désactivé du manifeste. Aucun déplacement ni renommage de table, ni réécriture de migration publiée. Le downgrade refuse un compte ayant désactivé Life AI, car une ancienne image ignore ce garde.

Life AI ne produit pas de points ou quêtes artificiels pour l’envoi de messages. Les contrats de progression et de capacités restent optionnels ; ses opérations de contrôle de conversation, sources, mémoire et fournisseur ne deviennent pas des outils récursifs du modèle. Les applications opérées par l’assistant conservent leurs propres règles de progression.

## Alternatives et conséquences

Une simple route supplémentaire dans le socle isolerait l’écran mais conserverait l’assistant hors du cycle d’activation des applications. Une copie du moteur pour Life AI dupliquerait fournisseurs, secrets et logique utilisée par Recettes. La séparation retenue garde un moteur partagé et un domaine de conversation autonome.

Conserver FastAPI, React, PostgreSQL, les sessions, le transport, MkDocs, Docker et le déploiement VPS. Aucun service, framework, secret, dépendance ou stockage supplémentaire. Étendre contrats de Pages, tests de frontières, activation pendant un tour, migration/restauration, navigation et démarrage unique. Livrer guides et captures FR/EN, AGENTS.md et procédures dans la même branche. Les ADR 008 et 009 conservent leur valeur historique.
