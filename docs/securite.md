# Sécurité

## Périmètre de la V1

Life est actuellement public et ne comporte aucun compte utilisateur, aucune écriture métier ni stockage personnel. L'accueil, l'API de santé, OpenAPI, Swagger UI et cette documentation sont accessibles sans authentification.

Ce périmètre suffit à l'accueil initial. Il ne convient pas encore à l'enregistrement de tâches privées, de séances de sport détaillées ou de données liées à la santé.

## Mesures en place

- HTTPS est terminé par Caddy, qui gère également la redirection depuis HTTP.
- Le conteneur utilise un utilisateur non privilégié, un système de fichiers en lecture seule et un répertoire temporaire limité.
- Compose retire les capacités Linux et interdit l’acquisition de nouveaux privilèges.
- Le port `8000` reste interne au réseau Docker ; seul Caddy expose le site publiquement.
- Les fichiers statiques servis sont limités aux artefacts prévus.
- Les paramètres sont validés au démarrage.
- Les dépendances sont verrouillées et les sources vérifiées par la CI.

Ces mesures réduisent des risques courants ; elles ne remplacent ni l'entretien du VPS ni la revue des futures fonctions métier.

## Secrets et contenu public

Ne commiter aucun `.env`, jeton GitHub, clé SSH, identifiant Hostinger, clé privée TLS ou sauvegarde contenant des données réelles. Le fichier `.env.example` doit rester utilisable avec des valeurs non sensibles.

Tout le contenu de `docs/`, `frontend/public/` et des bundles JavaScript est public une fois publié. Une variable `VITE_*` est intégrée au navigateur et ne constitue jamais un secret. Ne pas publier de captures d'écran, journaux ou exemples contenant des données personnelles.

Cette documentation décrit seulement les ressources nécessaires à Life ; elle ne doit pas devenir un inventaire des autres services du VPS.

## Proxy et réseau

L'application fait confiance à la chaîne de déploiement prévue : Caddy est son point d'entrée public et partage son réseau Docker. Ne pas publier le port de l'application sur Internet pour contourner le proxy. Une évolution des réglages de confiance des en-têtes proxy doit tenir compte des autres membres du réseau.

Les réglages HTTPS et les en-têtes communs sont administrés dans Caddy. Vérifier leurs effets sur le site et Swagger UI avant d'ajouter une politique de contenu restrictive ; une règle non testée peut empêcher le chargement des scripts nécessaires.

## Dépendances

Les mises à jour passent par les outils du projet, avec modification des fichiers de verrouillage. Exécuter les tests et les builds après une mise à jour. Examiner les alertes de sécurité du dépôt et prioriser celles qui concernent effectivement le runtime exposé.

Le build multi-étapes évite d'exécuter Vite et MkDocs en production. Les outils de documentation et de développement ne doivent pas être réintroduits comme serveurs accessibles publiquement.

## Avant d'ajouter des données personnelles

La première fonctionnalité persistante doit inclure une décision sur l'authentification, des contrôles d'autorisation côté serveur, la protection des sessions et une politique de sauvegarde/restauration. Masquer un bouton ou une page React ne protège pas une route API.

Prévoir également :

- Validation des entrées et filtrage des champs modifiables.
- Isolation des données de l'utilisateur dans chaque requête métier.
- Cookies sécurisés et protection CSRF si l'authentification repose sur des cookies.
- Règles de conservation et de suppression des données.
- Absence de données sensibles dans les logs, erreurs et exemples de documentation.
- Tests des accès non authentifiés et des accès à des données non autorisées.

L'architecture cible est présentée dans [Faire évoluer l'application](evolution.md), mais ces composants ne sont pas installés en V1.

## Incident

En cas de fuite de secret, révoquer puis remplacer le secret auprès de son fournisseur ; supprimer une ligne Git ne suffit pas. Examiner l'exposition réelle et l'historique du dépôt. En cas de régression de l'application, conserver les preuves utiles puis utiliser le retour arrière documenté.
