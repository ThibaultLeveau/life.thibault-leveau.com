# ADR 009 — Sources multimodales, dictée et lecture web

**Statut :** accepté par Thibault le 18 novembre 2026.

**Accord :** « J’approuve cette architecture et son implémentation jusqu’au déploiement. », après présentation du besoin, de la proposition, des alternatives et des conséquences, [consigné dans l’issue #89](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/89#issuecomment-6980304252) avant implémentation.

## Décision

Étendre `platform/assistant` dans le monolithe FastAPI/React/PostgreSQL. Conserver les fournisseurs, sessions, CSRF, frontières et déploiement existants. Ajouter des sources privées (documents, images, instantanés de pages publiques) avec métadonnées, empreinte et contenu borné en PostgreSQL, liées à leur message. Les imports non envoyés expirent ; leur admission réserve un quota sous verrou propriétaire avant toute opération coûteuse. La suppression d’une source efface son contenu et conserve une trace ; la suppression de conversation supprime ses sources. Aucun stockage navigateur persistant.

Séparer strictement le texte direct de l’utilisateur des contenus externes. Les adaptateurs convertissent des blocs internes en images/PDF natifs OpenAI Responses, Anthropic Messages ou Gemini generateContent. Les autres documents pris en charge fournissent du texte extrait. Les sources sont sélectionnées avec un budget explicite ; les anciennes restent accessibles par référence, sans concaténer tous les binaires à l’historique. Ni les journaux, ni les événements, ni les résumés ne conservent leurs binaires. Une conversation contenant des sources impose côté serveur la confirmation de toutes les mutations proposées et désactive l’extraction automatique de souvenirs ; ce marquage reste après retrait d’une source. Les souvenirs se gèrent toujours explicitement par leur API/interface dédiée.

La lecture web accepte uniquement des URL explicitement importées. Le lecteur vérifie protocole, port, absence de credentials, adresses DNS publiques et chaque redirection, puis établit la connexion à une adresse validée avec le nom TLS d’origine. Aucun cookie, proxy hérité, JavaScript, crawling ou accès à un compte tiers. Extraction et téléchargement s’exécutent dans des processus jetables bornés en mémoire/CPU/durée ; aucune nouvelle infrastructure.

La dictée utilise le microphone HTTPS, puis une transcription serveur OpenAI ou Gemini. Réutiliser le fournisseur de chat compatible ou configurer un credential indépendant, chiffré par le trousseau existant. L’audio n’est jamais enregistré en base ; le texte reste un brouillon à relire avant envoi. Limiter taille, durée de capture, concurrence, fréquence et sortie fournisseur. Aucune sélection silencieuse d’un autre fournisseur.

## Alternatives et conséquences

Les sources éphémères seules rendent l’historique incomplet. Un stockage objet, une base vectorielle, un OCR local permanent ou un navigateur distant ajoutent exploitation et secrets sans nécessité démontrée. La reconnaissance vocale exclusive du navigateur a une compatibilité variable et peut dépendre de son propre service distant. Les outils web propres aux fournisseurs ne donnent pas un contrat uniforme.

La migration additive `0016_assistant_sources` ajoute sources, configuration de transcription et marqueur de conversation externe. Les quotas bornent les sauvegardes ; les bibliothèques PDF/image/XML sont verrouillées. Les sources sélectionnées et l’audio sont transmis au fournisseur configuré et consomment son quota. Les pages connectées, protégées ou nécessitant JavaScript ne sont pas garanties. Documenter extraction textuelle bureautique, formats/limites, cycle de vie et restauration ; tester SSRF, fichiers hostiles, injections, propriétaires, annulation et parité API/UI. L’ADR 008 conserve sa valeur historique ; cette décision autorise précisément ces extensions.
