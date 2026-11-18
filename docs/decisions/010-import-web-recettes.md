# ADR 010 — Import web interactif de recettes

**Statut :** accepté par Thibault le 18 novembre 2026.

**Accord :** « J’approuve cette architecture et son implémentation jusqu’au déploiement. », après présentation du besoin, des alternatives et des conséquences, [consigné dans l’issue #98](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/98#issuecomment-6983407201) avant implémentation. Le numéro 009 est réservé à l’évolution multimodale approuvée dans l’issue #89.

## Besoin et décision

L’utilisateur ouvre une URL dans Recettes, intervient si le site demande une vérification humaine, puis importe la page réellement ouverte dans la langue de son compte. Une iframe tierce ne permet ni de lire son DOM ni de partager sa session avec une lecture serveur ; certains sites refusent aussi leur intégration. Ajouter un navigateur Chromium distant isolé et un proxy privé de sortie au déploiement Compose existant. Conserver FastAPI, React, PostgreSQL, les sessions, le catalogue et les fournisseurs IA existants.

Le service navigateur ne reçoit aucun token IA, cookie LifeOS, accès SQL ou montage du dépôt. Il fonctionne sans privilèges avec la sandbox Chromium active. Son réseau interne ne permet aucune sortie directe ; le proxy valide les destinations HTTP/HTTPS publiques, résout et épingle leurs adresses et refuse les réseaux privés/locaux, métadonnées et services du VPS. Les contrôles de navigation et de sous-ressources complètent cette protection. Aucun port navigateur ou proxy n’est publié sur l’hôte.

Le cadre React affiche les images du navigateur et transmet uniquement les interactions autorisées. Les API versionnées de Recettes contrôlent session, CSRF, propriétaire et activation à chaque appel, sans offrir le protocole DevTools au client. Les sessions, cookies et profils restent temporaires, avec quotas, expiration d’inactivité, durée absolue et bail court renouvelé par les requêtes authentifiées. Fermeture, expiration du compte et perte du bail détruisent le contexte. La déconnexion ou désactivation interrompt l’accès immédiatement ; le bail borne le nettoyage lorsque le client ne peut plus envoyer la fermeture.

Le module IA expose une génération structurée interne utilisant le fournisseur, le modèle et le credential chiffré configurés. Les règles et contrats d’extraction appartiennent à `apps/recipes`. Les appels s’effectuent hors transaction SQL, sans outil métier ni mémoire de conversation. Le contenu web est non fiable ; ses instructions n’autorisent jamais de mutation. L’IA prépare un brouillon dans la langue du compte, sans inventer une quantité, une portion ou une conversion incertaine. Les ambiguïtés restent visibles avant confirmation.

L’enregistrement final crée atomiquement les ingrédients privés nécessaires et la recette par les services existants, avec historique/progression. Une migration additive conserve provenance et reçu de rejeu. Les cookies et pages temporaires ne rejoignent jamais les sauvegardes ni les journaux. Le brouillon en cours reste transitoire, comme les autres formulaires ; aucun stockage métier navigateur supplémentaire.

## Alternatives et conséquences

Un import de pages publiques avec collage de texte nécessite moins d’exploitation mais ne conserve pas une vérification faite dans un autre navigateur. Il reste un secours visible. Une extension locale ajoute installation et permissions ; un fournisseur de navigateur hébergé ajoute abonnement et transmission à un tiers. Le navigateur VPS répond au parcours sans nouveau fournisseur payant, avec un coût mémoire/CPU et des mises à jour de sécurité supplémentaires.

Certains sites peuvent refuser un navigateur VPS même avec intervention humaine. Aucun contournement automatique ni garantie universelle. Ne pas désactiver la sandbox pour résoudre un refus ; tester l’isolation sur le VPS avant livraison. Les appels IA utilisent le quota du fournisseur choisi. L’interface conserve le cadre commun, les thèmes FR/EN, le clavier et les protections de brouillon ; la source demeure consultable et attribuée.

Tester le réseau et les sous-ressources, propriétaires/CSRF/activation, quotas/expiration, contenu hostile, extraction/traduction, création atomique/rejeu, migration/restauration et le parcours mobile/clavier. Documenter les images, secrets, plafonds et sondes ; fusionner après CI puis vérifier le déploiement et le SHA de chaque service. Les décisions précédentes restent inchangées ; la disponibilité dépend de la livraison vérifiée.
