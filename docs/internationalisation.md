# Français et anglais

LifeOS, Tâches et Sport sont disponibles en français et en anglais. Le sélecteur **Langue / Language**, dans le menu du compte, change la langue de toutes les applications. Sur mobile, ouvrir la navigation pour le retrouver. Le choix appartient au compte, reste après reconnexion et se retrouve sur les autres appareils au chargement de la session. Il est indépendant du thème. Les comptes existants restent en français.

Avant connexion, la langue du navigateur choisit français ou anglais, avec repli français si aucune n’est prise en charge. Le formulaire permet de la changer pour cette connexion ; une connexion réussie applique ensuite la préférence enregistrée du compte. La déconnexion revient à la langue du navigateur.

## Ce qui change

Navigation, formulaires, aides, libellés accessibles, erreurs, types d’exercice, unités textuelles, dates et descriptions des récurrences suivent la langue choisie. Les dates et nombres utilisent les conventions `fr-FR` ou `en-GB`, dans le fuseau du navigateur pour les instants. Les unités physiques restent métriques. Les dates numériques saisies en langage naturel restent **jour/mois/année**, y compris en anglais ; les dates ISO `YYYY-MM-DD` sont également acceptées.

Les **680 exercices par défaut** de Sport ont un nom, des notes, des alias, un groupe musculaire et un matériel localisés. Ils portent le badge **Par défaut / Default**. La recherche textuelle s’effectue dans la langue active. Les programmes, entraînements et statistiques présentent le nom courant de ces mêmes exercices ; leurs identifiants, résultats, scores et dates ne changent pas.

Les exercices **Personnels / Personal** ne sont jamais traduits automatiquement, même si leur nom est identique à un exercice fourni. **Personnaliser / Customize** crée une copie personnelle dans la langue affichée au moment de la copie. Les titres, notes, noms d’espaces, statuts personnalisables et autres textes saisis restent exactement ceux de l’utilisateur. Les nouveaux espaces créent leurs trois statuts dans la langue active ; les statuts déjà enregistrés restent inchangés.

Un changement de langue recharge les données affichées et réinitialise les formulaires temporaires. Les brouillons modifiés de programme et de séries Sport demandent confirmation avant cette sortie, comme lors d’un changement d’onglet. Les séries enregistrées et l’entraînement actif restent disponibles. Les réponses lancées dans l’ancienne langue sont ignorées ; aucune donnée métier n’est stockée dans le navigateur.

## API indépendante de l’interface

`GET /api/v1/preferences` et les réponses de session exposent `{ "theme": "system", "locale": "fr" }`. `PUT /api/v1/preferences` accepte `theme`, `locale` ou les deux ; les champs omis sont conservés. `locale` accepte uniquement `fr` et `en` (autres valeurs, `null` et champs inconnus : 422). Session, propriétaire, origine et CSRF restent obligatoires pour écrire.

```bash
# cookie.txt et CSRF proviennent de POST /api/v1/auth/session.
curl --fail --cookie cookie.txt -X PUT \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  --data '{"locale":"en"}' \
  https://life.thibault-leveau.com/api/v1/preferences
curl --fail --cookie cookie.txt \
  'https://life.thibault-leveau.com/api/v1/sport/exercises?q=bench%20press'
```

Les requêtes authentifiées utilisent la préférence du compte, même si `Accept-Language` demande autre chose. Avant authentification, cet en-tête accepte les variantes régionales et pondérations HTTP, par exemple `en-GB,en;q=0.9,fr;q=0.5`. Les réponses privées portent `Content-Language`, `Vary: Accept-Language, Cookie` et `Cache-Control: no-store`. Une session inconnue ou expirée utilise la langue négociée.

Les erreurs HTTP exposent un `detail` traduit et un `code` stable, par exemple `apps.tasks.workspace_not_found`. Une erreur de validation de structure (422) contient une liste `detail` avec `loc`, `type`, `code` et `msg` localisé, sans recopier les valeurs soumises. Un refus métier 422 peut utiliser la forme `{detail, code}`. Les clients ne doivent pas analyser la prose pour piloter leur comportement ; les statuts HTTP et l’en-tête de désactivation conservent leur contrat. Les dates, identifiants, enums, RRULE, champs JSON et nombres de l’API restent indépendants de la langue.

## Organisation des traductions

L’[ADR 004](decisions/004-internationalisation.md) conserve le monolithe modulaire. Les ressources sont livrées avec le code et ne nécessitent ni service distant ni variable d’environnement supplémentaire.

| Emplacement | Responsabilité |
| --- | --- |
| `frontend/src/platform/i18n/` | Initialisation i18next/react-i18next et langue de session |
| `frontend/src/shared/locales/{fr,en}.json` | Shell, compte et composants communs ; espace de noms `common` |
| `frontend/src/apps/<id>/locales/{fr,en}.json` | Textes métier, chargés avec la Page ; espace de noms de l’application |
| `backend/src/life_app/core/i18n.py` | Contexte de requête, négociation et chargement des messages |
| `core/locales/`, `platform/*/locales/`, `apps/<id>/locales/` | Messages serveur propres à chaque responsabilité |
| `apps/sport/catalogue.json` | Identifiants stables, type, codes de muscle/matériel et `builtin` |
| `apps/sport/locales/exercises.{fr,en}.json` | Textes des 680 exercices, muscles et matériels, indexés par identifiant |

Les clés sont sémantiques et stables. Écrire une phrase complète avec paramètres nommés, et utiliser les variantes i18next `_one` / `_other` pour les comptes. Ne pas concaténer des fragments dont l’ordre dépend de la langue. Les paramètres React sont rendus comme texte, jamais comme HTML. Le manifeste backend fournit les noms/descriptions FR/EN de l’application ; le frontend ne recrée pas de catalogue parallèle.

Une nouvelle chaîne doit être livrée dans les deux langues et dans le domaine qui la possède. Les tests contrôlent clés, paramètres et pluriels, les 680 identifiants et les parcours réels. Ajouter une langue au-delà de ces deux valeurs nécessite une évolution explicite des contrats et de la contrainte SQL.

## Données et exploitation

`0008_locale`, après `0007_hyrox`, ajoute `users.locale`, non nul, défaut `fr`, avec CHECK `fr/en`. Aucun texte métier ni instantané existant n’est réécrit. La localisation des exercices est une projection de réponse à partir de leur identifiant ; les instantanés historiques restent intacts. Une désactivation/réactivation préserve langue et données.

Le dump sauvegarde la préférence ; les catalogues restent dans l’image versionnée, à conserver avec le dump. Le downgrade refuse dès qu’un compte utilise `en`, pour éviter une perte silencieuse. Suivre les [sauvegardes](sauvegardes.md#migration-0008-langue-du-compte) et le [déploiement](deploiement.md#livraison-francaisanglais). Les guides utilisateur existent aussi en anglais ; la documentation technique et d’exploitation reste rédigée en français.
