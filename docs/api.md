# Référence API

## Adresses

L'origine de production est `https://life.thibault-leveau.com`. En développement, les chemins `/api` sont accessibles via le backend sur le port `8100` ou via le proxy Vite sur `5173`. Vite sert les sources de l’interface ; le backend ne sert l’accueil et les assets qu’après compilation. MkDocs fournit l’aperçu documentaire sur `8101`, également accessible par le proxy Vite sous `/documentation/`.

| Méthode | Chemin | Réponse |
| --- | --- | --- |
| GET | `/` | Page d'accueil HTML |
| GET | `/favicon.svg` | Favicon SVG |
| GET | `/assets/{fichier}` | Ressource frontend compilée existante |
| GET | `/api/v1/health` | Sonde JSON |
| GET | `/api/docs` | Documentation interactive Swagger UI |
| GET | `/api/openapi.json` | Schéma OpenAPI |
| GET | `/documentation/` | Accueil MkDocs |
| GET | `/documentation/{chemin}` | Page ou ressource documentaire existante |

L'interface Swagger permet d'examiner le contrat courant ; le schéma OpenAPI est généré à partir des routes et modèles du backend. Les routes statiques ne constituent pas des opérations métier et peuvent ne pas apparaître dans ce schéma.

## Sonde de santé

```bash
curl --fail --silent --show-error   https://life.thibault-leveau.com/api/v1/health
```

Réponse attendue : statut **200**, type `application/json` et corps :

```json
{"status":"ok"}
```

La sonde vérifie que le processus répond. Elle ne teste aucun service tiers et ne promet pas la disponibilité d'une base de données : il n'y en a pas en V1. Docker l'utilise pour évaluer la santé du conteneur ; elle est également utile aux vérifications après publication.

## Erreurs et redirections

Un chemin inconnu renvoie **404**, notamment :

```text
/api/v1/inconnu
/assets/fichier-absent.js
/documentation/page-absente/
/une-page-absente
```

Le serveur ne renvoie pas `index.html` pour masquer une ressource manquante. Le corps d'une erreur statique peut être différent de celui d'une erreur API ; s'appuyer d'abord sur le code HTTP.

`/documentation` est redirigé vers `/documentation/` afin que les chemins relatifs fonctionnent. Caddy redirige également les accès HTTP publics vers HTTPS. Un client de contrôle qui inspecte le résultat final doit suivre les redirections.

## Authentification et données

Ces chemins sont publics. La V1 ne comporte ni session, ni route d'écriture métier, ni jeton utilisateur. Ne pas utiliser ce périmètre public pour exposer des tâches ou des données de santé lors des prochaines versions sans avoir mis en place l'authentification et l'autorisation.

## Versionnement

Les routes métier à venir rejoindront `/api/v1`. Le segment de version représente un contrat HTTP, pas la version de l'image Docker. Une modification incompatible d'un contrat déjà consommé nécessite une stratégie explicite de migration ; ne pas changer silencieusement la forme d'une réponse.

Le frontend utilisera des URL relatives à l'origine. La V1 n'a pas besoin d'une politique CORS générale, puisque le navigateur utilise le proxy Vite en développement et une origine unique en production.
