# Architecture

## Vue d'ensemble

L’[ADR 011](decisions/011-dashboard-life-ai.md), approuvé dans l’issue #104, sépare le Dashboard `/` et l’application activable Life AI `/ai`. `apps/life_ai` possède conversations, historique, mémoire, sources, dictée, orchestration et reçus. `platform/assistant` conserve les contrats de capacités/snippets, capacités LifeOS, fournisseurs, chiffrement, configuration commune et génération structurée utilisée par Recettes. PostgreSQL et les tables historiques restent inchangés ; aucun service, framework ou stockage supplémentaire.

Le coordinateur appelle seulement les spécialistes utiles : cinq spécialistes métier et un spécialiste `lifeos` pour le socle. Les manifestes exposent 119 capacités métier ; `platform/assistant/common.py` fournit 11 capacités de bibliothèque/activation, préférences, progression et intégrations. Chaque application exposant des capacités possède `assistant.py` et fournit `ActionProvider` via son manifeste ; les capacités réutilisent schémas, propriétaires, versions, événements et progression du métier. Le socle découvre les contrats injectés sans importer les applications. Les snippets utilisent des renderers React métier chargés par le registre frontend, avec données structurées versionnées et aucun code généré exécuté.

La requête de message libère son verrou propriétaire avant l’appel fournisseur. Chaque action ouvre une transaction courte, revalide session/activation/version et enregistre mutation et reçu ensemble. Les aperçus simulent l’action dans un savepoint annulé ; la confirmation exécute la proposition validée, sous contrôle de version. Les historiques de conversation, résumés et souvenirs sont distincts. Voir [API Assistant](assistant-api.md), [données](donnees.md#assistant-ia) et [configuration](configuration.md).

Life conserve le monorepo FastAPI / React / MkDocs. Un processus Uvicorn sert l'API, le frontend compilé et la documentation. PostgreSQL 17 est le seul service de données ajouté, conformément à l'[ADR 002](decisions/002-gestion-taches.md).

![Flux de production : navigateur, Caddy, application puis PostgreSQL privé.](assets/diagrams/production.svg)

[Source Mermaid](assets/diagrams/production.mmd)

Caddy termine TLS et transmet à `life-web:8000` sur `multisite_proxy`. Le service web rejoint aussi le réseau Compose interne `database`. PostgreSQL ne rejoint pas le réseau du proxy, ne publie aucun port hôte et conserve ses données dans `postgres_data`. Le rôle applicatif est propriétaire de sa base, sans droits d'administration du cluster.

Seul `web` rejoint également le bridge Compose `egress` (`life_egress` en production), non interne, pour résoudre les hôtes des fournisseurs et établir les connexions HTTPS sortantes de l’assistant. `database` et le réseau existant `multisite_proxy` restent internes ; aucun port hôte ni service supplémentaire n’est ajouté. Les hôtes des fournisseurs sont fixés par les adaptateurs applicatifs ; le lecteur de pages publiques de l’ADR 009 contrôle séparément ses destinations ; le bridge ne constitue pas un filtre réseau par domaine.

En développement, Vite, FastAPI et MkDocs disposent de serveurs distincts ; le proxy Vite maintient une origine unique. `compose.dev.yaml` fournit un PostgreSQL local indépendant de la production.

L’organisation par application suit l’[ADR 003](decisions/003-applications-lifeos.md). Les registres explicites assemblent les applications ; le socle ne dépend pas de leurs métiers.

## Responsabilités

| Dossier | Responsabilité |
| --- | --- |
| `core/` | Paramètres, journalisation, engine et sessions SQL |
| `platform/auth/` | Contrats, modèles et services de connexion/autorisation |
| `apps/<id>/` | Manifeste, routes, contrats, modèles et services propres à chaque application |
| `apps/registry.py` | Assemblage explicite des applications disponibles |
| `platform/applications/` | Contrat de manifeste, catalogue, activations et garde d’accès |
| `api/router.py` | Préfixe `/api/v1`, routes du socle et garde d’activation sur chaque routeur métier |
| `web/` | Distribution contrôlée des fichiers statiques |
| `migrations/` | Évolutions du schéma figées et versionnées |
| `frontend/src/app/` | Session commune, routage explicite et chargement des applications activées |
| `frontend/src/apps/<id>/` | Page, composants, types, styles et API propres au métier |
| `frontend/src/components/layout/` | Navigation commune de l'accueil |
| `frontend/src/platform/` | Session, thème, transport HTTP/CSRF et bibliothèque |
| `frontend/src/shared/` | Icônes, dialogues accessibles et styles réutilisables |
| `frontend/src/styles/` | Tokens et styles globaux |
| `docs/` | Documentation publique, sans données personnelles |
| `infrastructure/` | Intégration Caddy et initialisation du rôle PostgreSQL |
| `scripts/` | Tests, publication, sauvegarde et restauration explicites |

Les services métier utilisent SQLAlchemy directement : aucune couche générique de dépôt, file de messages ou microservice supplémentaire. Une session SQL est partagée par les dépendances d'une requête. Les mutations d'un propriétaire sont sérialisées et les tâches utilisent un numéro de version. Voir [Backend](backend.md) et [Données](donnees.md).

## Flux métier

1. Le navigateur ouvre une session via l'API et reçoit un cookie opaque HttpOnly.
2. Les lectures vérifient la session, l’activation de l’application et le propriétaire. Les écritures vérifient aussi l'origine et le jeton CSRF.
3. Le routeur appelle le service : validation, mutation et événements dans la même transaction PostgreSQL.
4. Tâches affiche immédiatement les intentions transitoires en mémoire et les enregistre en arrière-plan via les API existantes. Les réponses serveur confirment ou rétablissent les valeurs ; les effets indirects déclenchent une réconciliation. Les préférences de vue, de thème et de langue passent toujours par l’API.

React ne conserve pas de base métier parallèle dans localStorage. Les champs en cours de saisie et l'état des dialogues restent transitoires. Les mutations de tâche exigent `expected_version` et retournent un conflit 409 si une autre écriture a changé la tâche.

## HTTP et compilation

`/` (accueil), `/applications` (bibliothèque), `/settings` (réglages) et les chemins des manifestes (`/tasks`, `/sport`, `/tracking`, `/okr`, `/recipes` et `/ai`) sont les seules routes HTML React. Les assets sont sous `/assets/`, l'API sous `/api/v1`, Swagger sous `/api/docs` et MkDocs sous `/documentation/`. Tout chemin inconnu reste 404. Le frontend utilise des URL API relatives, sans service réseau distinct pour le rendu.

![Construction multi-étapes : frontend et documentation compilés rejoignent le runtime Python.](assets/diagrams/build.svg)

[Source Mermaid de la construction](assets/diagrams/build.mmd)

Le runtime contient les dépendances Python applicatives, le CLI, les migrations et les fichiers compilés. Node, Vite, Playwright et MkDocs ne tournent pas en production. L'utilisateur runtime n'est pas privilégié et son système de fichiers est en lecture seule.

Les verrous uv/npm sont versionnés. Les images portent le SHA complet des sources ; les tags des images de base peuvent néanmoins évoluer entre deux reconstructions. Conserver l'image publiée et sa sauvegarde de données. Une image précédente n'annule jamais une migration.

## Limites choisies

L'application reste personnelle : pas de partage d'espaces, inscription publique, SSO, synchronisation temps réel ou synchronisation hors ligne. Sport fournit ses statistiques internes ; Suivi exploite les événements de Tâches et les résultats Sport via des fournisseurs de métriques injectés. Aucun temps d’écran n’est collecté. La recherche est une recherche SQL de sous-chaîne, et le frontend charge toutes les tâches de la vue : des volumes importants nécessiteront pagination visuelle/indexation après mesure.

Les récurrences restent dans `apps/tasks` : `recurrence.py` valide et calcule les dates calendaires avec python-dateutil ; `scheduling.py` analyse les expressions françaises ou anglaises selon le compte. La résolution avance la tâche dans la transaction existante, sans ordonnanceur ni service supplémentaire. Le frontend demande l’analyse et l’aperçu à l’API et ne conserve que le brouillon transitoire.

L’analyse française délègue son vocabulaire et ses nombres à `scheduling_language.py`, puis la lecture et la combinaison des clauses à `scheduling_grammar.py`. Ce sont des helpers internes au même module tâches. Ils compilent vers le contrat `Recurrence` existant ; ni nouveau format persistant, ni dépendance, ni service d’interprétation externe.

L'[ADR initial](decisions/001-architecture-initiale.md) reste inchangé. Toute évolution structurante suit les règles d'accord explicite du dépôt.

## Activation et frontières

Le registre backend est injecté par la composition dans `app.state.applications`. Les services du socle reçoivent ces définitions et n’importent pas les applications. Le registre frontend associe les mêmes identifiants à leurs Pages chargées à la demande ; noms, descriptions, chemins et états viennent de l’API. Aucun import métier entre applications.

`platform/auth/SessionProvider` possède la session et le thème. `platform/applications/ApplicationProvider` charge les activations et les rafraîchit au retour au premier plan. Le shell démonte une Page sur désactivation, expiration ou déconnexion. Le garde serveur appliqué par `api/router.py` reste l’autorité, y compris pour les appels directs. Les composants partagés ne nécessitent pas le chargement du CSS Tâches.

Voir les [contrats et invariants](donnees.md#activations-des-applications), l’[API](api.md#bibliotheque-et-activation) et la [procédure d’ajout](evolution.md).

## Internationalisation approuvée

L’[ADR 004](decisions/004-internationalisation.md) ajoute la langue au compte et i18next/react-i18next au frontend. `platform/i18n/` initialise le moteur ; `shared/locales` possède les textes communs et chaque application ses ressources. `core/i18n.py` fournit le contexte serveur sans importer de métier ; les domaines chargent leurs propres messages. Les métadonnées localisées restent dans les manifestes backend. Le catalogue Sport sépare identifiants et textes, et localise les réponses sans réécrire les instantanés. L’adaptateur `scheduling_english.py` rejoint la grammaire existante. Voir les [contrats et frontières détaillés](internationalisation.md).

## Intégrations et Suivi

L’[ADR 005](decisions/005-integrations-tracking.md), approuvé le 16 novembre 2026, étend le manifeste avec `metrics` optionnel. `platform/integrations/` porte les contrats neutres, périodes, découverte, validation et contrôle d’activation ; les implémentations restent dans `apps/tasks/integrations.py` et `apps/sport/integrations.py`. Le registre injecté dans `app.state.applications` est le seul assemblage. Aucun domaine ne lit les tables d’un autre. Les options privées et évaluations exigent source active et propriétaire ; le catalogue ne contient que des métadonnées publiques au compte connecté.

`apps/tracking` possède définitions, révisions, périodes, valeurs, instantanés et historique. Son service calcule scores, XP et calendrier à partir de ces données. Les sources enregistrées sont des instantanés explicitement actualisables ; aucun calcul en arrière-plan ni service supplémentaire. La migration globale `0009_tracking` ajoute cinq tables et protège les historiques contre les modifications/suppressions.

Tâches, Sport et Suivi composent `shared/ui/ApplicationNavigation` avec leurs navigation, menu du compte et actions. Ce composant ne dépend d’aucune application ou service de session. Les requêtes Suivi utilisent le transport commun et `platform/useApiResource` pour annuler/ignorer les lectures obsolètes. Voir [intégrations](integrations.md), [modèle](donnees.md#donnees-de-suivi) et [API](tracking-api.md).

Le client HTTP et les types de métriques réutilisables sont dans `frontend/src/platform/integrations/`. Les composants de configuration et saisie restent propres à Suivi.

## Progression commune

L’[ADR 006](decisions/006-progression-applications.md), approuvé le 16 novembre 2026 dans l’issue #58, ajoute `platform/progression` : moteur partagé de niveaux/séries, préférences et journal PostgreSQL. Le manifeste porte un fournisseur optionnel `progression` ; chaque application possède son catalogue et transforme uniquement ses propres données en activités. Le registre reste le seul assemblage. Les confirmations enregistrent leurs faits et gains dans la transaction métier, sans effet de bord sur les lectures HTTP. La reprise historique est une commande explicite pour un compte nommé.

Le frontend `platform/progression` fournit le client API, les réglages et le badge injecté par les Pages dans le slot neutre `status` d’`ApplicationTopbar`. `shared` ne dépend toujours ni du socle ni des applications. Suivi possède la composition du mur et du journal ; le badge des autres applications fonctionne indépendamment de son activation. La progression conserve propriétaire, CSRF, contrôles d’activation et protection des réponses obsolètes. Les jours d’utilisation configurables par application étendent les préférences JSONB et le calcul du module existant ; ils ne changent ni le contrat de fournisseur ni les frontières des applications. Voir [contrats](api.md#progression-par-application), [données](donnees.md#donnees-de-progression) et [guide](progression.md).

## Objectifs OKR

`apps/okr` ajoute un métier selon l’ADR 003 : objectifs, résultats clés et historique trimestriel. Ses fournisseurs `integrations.py` et `progression.py` suivent les ADR 005/006 existants. Les deux registres sont les seuls assemblages ; aucune modification des frontières ni nouvelle infrastructure. La migration additive `0011_okr` ajoute trois tables. Les valeurs de résultats clés et les instantanés restent JSONB dans PostgreSQL ; seuls les brouillons sont transitoires dans React. Voir [guide](okr.md), [API](okr-api.md) et [données](donnees.md#donnees-okr).

## Recettes et courses

`apps/recipes` suit les ADR 003–006 sans nouveau contrat transversal : manifeste, métier, fournisseur de métriques et fournisseur de progression, assemblés par les deux registres existants. La migration additive `0012_recipes` crée six tables : ingrédients globaux/personnels, recettes et lignes, listes/modèles et lignes, événements. Le catalogue bilingue de 301 ingrédients est figé dans les données de migration. PostgreSQL stocke les quantités en `NUMERIC(18,6)` ; les calculs du service utilisent `Decimal`. Aucun stockage métier navigateur. L’import web utilise les services privés et le fournisseur IA définis par l’[ADR 010](decisions/010-import-web-recettes.md), sans modifier les frontières métier. [Guide](recipes.md), [API](recipes-api.md).

Les lignes de courses et modèles acceptent aussi des articles libres depuis `0017_shopping_free_items`, avec nom personnel et référence catalogue facultative. Cette évolution reste dans les modèles, schémas et services de `apps/recipes`, sans nouveau stockage ni changement de contrat transversal ; les recettes conservent des ingrédients structurés.

## Documentations séparées

Les huit guides FR/EN partagent la compilation MkDocs et le service statique existants. `mkdocs.yml` associe les pages à leur guide ; le hook `scripts/documentation.py` fournit un menu, des liens précédent/suivant et un index de recherche propres au guide et à sa langue. Le lien de traduction cible la même page ; l’annuaire est accessible explicitement. Les sources et URL existantes restent stables, les traductions techniques suivent `docs/en/`. Aucun changement de service, de stockage ou de frontière métier.

## Réglages généraux

L’[ADR 007](decisions/007-reglages-generaux.md), approuvé dans l’issue #76, étend le manifeste frontend avec un panneau `Settings` optionnel. Le shell compose `/settings` à partir du registre existant et du catalogue serveur. Les formulaires métier restent dans leurs applications, les préférences communes dans leurs modules actuels. Les panneaux signalent brouillons/écritures et ne sont montés que pour les applications activées. Aucune table, API ni infrastructure supplémentaire. [Guide](settings.md).

## Sources multimodales et dictée

L’[ADR 009](decisions/009-sources-assistant.md), approuvé dans l’issue #89, a introduit les sources désormais dans `apps/life_ai` : sources privées PostgreSQL, blocs fournisseur typés, extraction bornée et transcription transitoire. Aucun nouveau service, stockage objet ou base vectorielle. Le lecteur web ajoute uniquement des connexions HTTP/HTTPS vers des pages publiques explicitement importées ; validation DNS/IP et redirections, connexion à l’adresse publique vérifiée et nom TLS conservé. Les adaptateurs IA gardent leurs hôtes fixes.

PDF/images/XML et pages sont traités dans des processus jetables limités en CPU, mémoire et durée ; aucun HTML externe exécuté. L’admission réserve le quota avant lecture, hors transaction pendant l’I/O, puis revalide session et propriétaire. La demande directe reste séparée des sources : le marquage `external_context` force les aperçus de mutation et désactive la mémoire automatique, y compris dans les suivis. Aucun résumé externe persistant ; contexte récent et lectures de sources par identifiant restent bornés. Voir [données](donnees.md), [API](assistant-api.md) et [sauvegardes](sauvegardes.md#migration-0016-sources-et-dictee).

L’[ADR 010](decisions/010-import-web-recettes.md) ajoute le navigateur et le proxy privés d’import Recettes. Les règles métier restent dans `apps/recipes`, la génération structurée réutilisable dans `platform/assistant/structured.py`. Les réseaux internes, les sessions éphémères et la sauvegarde atomique bornent cette évolution approuvée.

## Dashboard et activation Life AI

Le shell fournit `ApplicationPageProps` : modules du registre, démarrage optionnel (`id`, `applicationId`, `text`) et callback de consommation. `platform/navigation.ts` centralise les changements d’URL dans le même document et les gardes de retour ; `history.state` ne contient qu’une position. Une session/langue remplacée démonte aussi l’intention. Les anciens liens `/?conversation=…` sont redirigés. Les routes de Life AI, y compris les sous-routeurs sources/dictée, passent par le contrôle central et revalident les traitements longs. La migration `0019_life_ai` active les comptes présents et respecte toute préférence explicite ; nouveaux comptes désactivés par défaut. Les contrats optionnels de progression/capacités restent absents pour les contrôles de conversation, sans badge ou quêtes artificiels.
