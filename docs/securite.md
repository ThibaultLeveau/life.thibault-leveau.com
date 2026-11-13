# Sécurité

## Périmètre

Accueil, shell `/tasks`, documentation, OpenAPI et sondes sont publics. Les espaces, tâches, réglages et événements sont privés : toutes leurs routes vérifient la session et la propriété des ressources. Le serveur ne se fie ni à un bouton masqué ni à un identifiant de propriétaire fourni par le client.

## Comptes et sessions

Le CLI crée les comptes, sans inscription publique ni mot de passe par défaut. Les mots de passe de 12 à 1024 caractères sont hachés avec Argon2id via `argon2-cffi`. La réinitialisation révoque toutes les sessions du compte. Il n'y a pas de MFA, récupération par email ou SSO dans cette version.

Le navigateur reçoit un jeton aléatoire opaque dans un cookie HttpOnly, SameSite=Lax et Secure en production. Seul son hash SHA-256 est enregistré. La durée fixe est configurable (7 jours par défaut). Le jeton CSRF est retourné par l'API de session et conservé en mémoire du client ; il est requis pour toutes les écritures authentifiées. Les origines présentes sont contrôlées, y compris pour la connexion. La déconnexion supprime la session en base.

Les mutations verrouillent le propriétaire puis revérifient la session : une demande en attente ne peut pas utiliser une session révoquée pendant cette attente. Les limites de connexion sont atomiques et partagées en PostgreSQL : 5 tentatives par identifiant et 30 par IP en 15 minutes. Une réussite réinitialise le compteur du compte. Les clés des limites sont hachées ; les lignes expirées sont nettoyées lors des connexions réussies. Le hash d'une IP n'est pas une anonymisation irréversible.

## Données et erreurs

Les schémas rejettent les champs inconnus et bornent tailles, couleurs, priorités et pagination. Les requêtes SQL sont paramétrées. Les clés étrangères composites empêchent les références incohérentes entre espaces. Les descriptions sont affichées comme texte React, sans HTML libre.

Les réponses métier, y compris les erreurs, portent `Cache-Control: no-store`. Les erreurs de validation n'incluent pas les valeurs saisies ; les erreurs SQL ne renvoient pas leurs paramètres. Les logs Uvicorn retirent la query string afin de ne pas conserver le texte recherché. Les corps, mots de passe, cookies et jetons ne sont pas journalisés par le code applicatif. Les logs d'accès peuvent encore contenir IP et UUID de chemins ; protéger aussi les journaux Caddy/Docker.

Le journal de tâches est immuable pour les UPDATE/DELETE ordinaires. Il conserve les noms de contexte nécessaires aux statistiques, mais pas les anciens titres/descriptions. Les archives ne constituent pas un effacement des données ; aucune purge définitive n'est livrée. Voir [Données](donnees.md).

## Infrastructure

Caddy termine TLS. Le port applicatif est interne au réseau proxy ; PostgreSQL utilise un réseau privé distinct, sans port hôte. Le rôle `life` n'est pas superutilisateur et ne peut pas administrer le cluster. Le conteneur web s'exécute sans privilèges, en lecture seule, avec capacités retirées et `no-new-privileges`.

Uvicorn fait confiance aux en-têtes du proxy prévu. Ne pas publier le port applicatif sur Internet ni laisser un membre non fiable rejoindre ce réseau. Le rôle PostgreSQL applicatif possède ses tables pour les migrations ; il n'est pas séparé d'un rôle de migration dans cette version personnelle. L'opérateur Docker et l'administrateur PostgreSQL restent des acteurs de confiance.

Les politiques TLS/en-têtes communs appartiennent au Caddy existant. Toute politique CSP supplémentaire doit être testée avec Swagger et les styles de l'interface. Les dépendances runtime et outils de build sont séparés et leurs versions verrouillées.

## Secrets et incident

`.env`, `.env.production`, cookies, sauvegardes et traces réelles ne doivent jamais être commités ou copiés dans la documentation publique. Une variable `VITE_*` est publique. Les exemples et tests utilisent exclusivement des valeurs synthétiques.

Les dumps contiennent des données privées, hashes de mots de passe et sessions. Protéger leurs permissions, les copies hors serveur et leur rétention. La restauration documentée révoque les sessions avant redémarrage.

En cas de fuite, révoquer les accès concernés, changer les secrets et examiner l'exposition réelle ; effacer un fichier Git ne suffit pas. La commande `life reset-password` remplace le mot de passe personnel et révoque ses sessions. Une rotation PostgreSQL nécessite de changer le rôle existant et l'URL applicative de façon coordonnée. Conserver les preuves utiles et suivre les [sauvegardes](sauvegardes.md) pour restaurer des données.
