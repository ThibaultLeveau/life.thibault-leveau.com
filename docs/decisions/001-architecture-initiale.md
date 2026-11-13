# ADR 001 — Socle initial de Life

**Statut :** accepté pour la V1
**Date :** 13 novembre 2026

## Contexte

Life doit devenir un espace personnel de suivi des tâches, du sport et des objectifs. La première livraison est volontairement limitée à un accueil et une navigation, avec un rendu professionnel et une documentation technique complète.

Le projet doit utiliser Python et FastAPI, être versionné sur GitHub et publié sur le domaine `life.thibault-leveau.com`, en utilisant le VPS Hostinger et le proxy Caddy existants.

## Décision

Conserver backend, frontend, documentation et infrastructure dans un monorepo. Utiliser Python 3.13 avec FastAPI/Uvicorn, React/TypeScript avec Vite et MkDocs Material en français.

Construire les ressources frontend et documentaires dans une image Docker multi-étapes. Le runtime Python sert l'ensemble derrière Caddy. Le projet Compose Life rejoint un réseau externe existant et n'expose aucun port applicatif sur l'hôte.

Verrouiller les dépendances avec uv et npm. Exécuter les tests et les constructions dans GitHub Actions. Publier manuellement une image identifiée par le commit, conserver l'image précédente et prévoir son redéploiement.

Ne pas installer de base de données ni d'authentification pour la seule page publique d'accueil. Ces composants devront être introduits avant le stockage et l'accès aux données personnelles.

## Alternatives examinées

**Pages rendues uniquement côté Python.** Une solution de templates aurait suffi à l'accueil initial. React est retenu pour préparer une interface interactive avec des vues et états métier futurs, au prix d'un outillage Node lors de la compilation.

**Services séparés pour le frontend et l'API.** Cette séparation n'apporte pas de bénéfice opérationnel à cette étape. Une image commune permet une livraison cohérente et une seule origine HTTP.

**Déploiement automatique à chaque push.** Il n'est pas retenu : la CI valide les sources, et la publication reste explicite sur le VPS. Le contrôle du moment de la livraison est conservé.

**Base et comptes dès la V1.** Leur coût de configuration et de maintenance n'est pas justifié par l'accueil. Leur absence est une limite connue, pas une autorisation à publier des données privées sans protection.

## Conséquences

- Une livraison associe la même révision du code, du frontend et de la documentation.
- Toute modification du frontend ou de la documentation demande une nouvelle image.
- Le développement utilise trois serveurs, mais la production n'exécute qu'Uvicorn pour Life.
- Les routes inconnues restent de vraies erreurs 404 ; l'application n'utilise pas de fallback SPA général.
- La documentation est publique et ne doit contenir ni secrets ni données personnelles.
- Le retour arrière est simple tant qu'aucune migration de données n'est introduite.

## Réexamen

Réexaminer cette décision lors de la première fonctionnalité persistante, de l'ajout de plusieurs utilisateurs ou d'un besoin d'exploitation qui justifierait une séparation des services. Consigner le changement dans un nouvel ADR en conservant ce contexte initial.
