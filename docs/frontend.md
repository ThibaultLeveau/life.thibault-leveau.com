# Frontend

React, TypeScript et Vite conservent l'outillage du socle. `App.tsx` assemble la connexion commune, l’accueil `/`, la bibliothèque `/applications` et les Pages enregistrées, sans routeur supplémentaire ni fallback général. Sans espace indiqué, `/tasks` ouvre l’agenda global (`?view=agenda`). L'espace actif peut être référencé avec `?space=<UUID>` ; les accès sont toujours contrôlés côté serveur.

## Navigation commune des applications

Tâches et Sport composent la même `ApplicationSidebar` et la même `ApplicationTopbar` depuis `shared/ui/ApplicationNavigation.tsx`. Le fichier `shared/styles/navigation.css` possède leurs styles : largeur de sidebar de 252 px sur bureau, barre supérieure de 66 px (64 px sur mobile), mêmes liens et états visuels. Les applications fournissent leur nom, icône, fil d’Ariane et liens métier, sans surcharger cet habillage.

`platform/auth/ApplicationFooter` assemble dans cet ordre la bibliothèque, la documentation courante localisée, le thème, la langue et le compte/déconnexion via `AccountMenu`. Les préférences restent dans l’API commune ; les gardes de brouillon Sport et l’attente des écritures Tâches en arrière-plan sont conservées. Les archives des espaces sont parmi les liens métier. Le prénom et le rechargement global ne figurent plus dans la top bar ; les commandes de récupération après erreur restent dans le contenu métier.

À 800 px et moins, une même sidebar coulissante remplace la navigation de bureau. Elle prend le rôle de dialogue modal, rend le contenu inerte, place le focus sur la fermeture et confine Tab/Maj+Tab. Échap ou le fond la ferment ; le focus revient au déclencheur sauf si une action l’a déjà placé dans le contenu ou un dialogue. Un passage au bureau libère le contenu et le verrouillage du défilement. Les contrôles mesurent au moins 44 px et les animations respectent la réduction des mouvements.

## Module tâches

`SchedulePicker` réunit le calendrier accessible (`ScheduleCalendar`) et les réglages (`RecurrenceFields`) dans le flux du dialogue. `useScheduleRecognition` interroge `/scheduling/parse` après 180 ms de pause ; les requêtes précédentes sont annulées et seules les réponses correspondant au texte et à la date courants sont présentées. La sauvegarde attend l’analyse la plus récente, même si on valide immédiatement. `ScheduleRecognition` montre le texte détecté et permet de le garder littéral. Le même comportement équipe l’éditeur et l’ajout rapide.

Les règles et dates restent des données API. Les brouillons du planificateur ne sont appliqués qu’après sélection de date ou validation de l’aperçu serveur. Les erreurs conservent la saisie ; Échap referme le planificateur avant le dialogue. Aucun contenu de tâche n’est enregistré dans localStorage.

La détection affiche le libellé et les trois premières dates retournées par le serveur. `status=incomplete/invalid` affiche `diagnostic` et demande une correction ou le choix explicite **Garder le texte** avant sauvegarde, y compris sur validation immédiate et dans l’ajout rapide. Le planificateur montre le même diagnostic. `ScheduleHelp` expose des exemples français ou anglais selon la langue ; ses boutons dans le planificateur remplissent seulement le brouillon à interpréter. L’aide est hors de la région `aria-live` pour éviter de la relire à chaque frappe.

| Fichier / composant | Rôle |
| --- | --- |
| `Page.tsx` | Espaces, état de chargement, filtres et assemblage métier ; session du socle |
| `api.ts` | Pagination métier ; transport et CSRF dans `platform/api.ts` |
| `useTaskSync.tsx`, `optimistic.ts` | Intentions transitoires, rendu immédiat, écritures ordonnées, versions, réconciliation et erreurs |
| `types.ts`, `dates.ts` | Contrats, libellés calendaires et changement de jour local |
| `AgendaView` | Vue globale des échéances, périodes et réglages enregistrés par API |
| `TaskContents` | Contenu et échéance partagés par liste, kanban et agenda |
| `TaskViews` | Listes, lignes/colonnes du tableau, ajouts rapides et glisser-déposer |
| `TaskActions`, `TaskMenu`, `BulkTaskDialog` | Menu partagé, sélection transitoire, confirmation et opérations API groupées |
| `useTaskSelection` | Rectangle souris, défilement aux bords et appui long tactile annulé par le défilement |
| `TaskEditor`, `MoveDialog` | Édition atomique, conflits, historique et déplacement accessible |
| `WorkspaceSettings`, `WorkspaceDialog` | Propriétés, ordre, sections, colonnes, étiquettes et archives |
| `shared/ui/Dialog`, `platform/auth/LoginPanel` | Dialogue partagé et connexion commune |
| `styles.css` | Présentation métier utilisant les tokens communs |

`@dnd-kit/core` fournit les capteurs pointeur/clavier et les cibles de dépôt. Le serveur calcule l'ordre final. Un tri automatique désactive les poignées ; la commande de déplacement reste disponible. Les sections sont filtrées selon leur visibilité ; les statuts définissent les colonnes, sans les confondre avec les sections.

`useTaskSync` conserve, uniquement pendant le montage de Tâches, un instantané confirmé par l’API et les intentions d’écriture en attente. `optimistic` applique ces intentions pour afficher immédiatement créations, modifications, résolutions, déplacements, suppressions/restaurations, ordre et réglages. Les listes et l’agenda restent montés et disponibles pendant l’enregistrement. La validation joue une animation de 420 ms, supprimée avec `prefers-reduced-motion`.

Les écritures sont envoyées dans l’ordre. Les réponses remplacent les valeurs provisoires, notamment les identifiants de création et les dates de récurrence calculées exclusivement par le serveur. Une action sur une tâche qui vient d’être créée attend son identifiant serveur en arrière-plan. Les versions reçues de nos propres écritures alimentent les actions suivantes ; un conflit externe reste une erreur, sans réessai automatique. Les déplacements et modifications de structure relisent les données concernées par leurs effets indirects avant l’écriture suivante.

Les vues utilisent les tâches chargées par pages de 200 pour filtrer et trier immédiatement en mémoire, avec les mêmes bornes que l’API. Les métadonnées des espaces visités sont conservées pendant le montage ; le chargement initial et les réconciliations limitent leurs lectures à deux espaces simultanément. La recherche conserve sa temporisation de 300 ms ; les préférences passent toujours par les API existantes. Une lecture commencée avant une nouvelle intention ne peut pas effacer celle-ci.

Une erreur retire l’effet provisoire de l’action et annule seulement les intentions qui en dépendent. Les actions indépendantes continuent. Le message reste visible sur la page, même si le dialogue a été fermé ; **Reprendre la saisie** restitue un brouillon de tâche sans l’envoyer automatiquement. Vérifier les valeurs actuelles après un conflit. Le réseau peut avoir transmis une écriture dont la réponse s’est perdue : recharger pour vérifier son résultat avant de la renouveler.

Le statut discret indique les enregistrements en attente et le dernier succès confirmé. Un avertissement natif signale une fermeture/recharge avec des écritures en attente. Le menu de compte attend leur fin avant un changement explicite de session/langue. Déconnexion, expiration ou désactivation démontent les données privées et annulent les requêtes et intentions restantes. Aucun stockage navigateur, worker, service, nouvelle dépendance ou migration n’est ajouté.

## Thèmes et accessibilité

Les tokens globaux de l'accueil restent dans `styles/tokens.css`. Les tokens communs `--ui-*` sont définis dans `shared/styles/ui.css` au niveau racine, avec variantes explicites `data-theme=light/dark` et média système ; ce choix évite une transformation partielle de `light-dark()` dans le CSS compilé. Le thème du compte est chargé depuis l'API, sans secret ni donnée métier dans localStorage.

Inter est servi localement. Les icônes sont des SVG décoratifs avec des noms accessibles sur leurs boutons. Les dialogues natifs retiennent le focus, se ferment avec Échap, donnent le focus au premier champ et le rendent au déclencheur. Les onglets acceptent flèches, Début et Fin. Chaque tâche dispose d'une commande de déplacement utilisable sans geste de glisser-déposer.

Le menu se replie sous 800 px. Le kanban défile horizontalement à l'intérieur de sa zone ; la page et les dialogues restent utilisables à 320 px. Les erreurs d'enregistrement et les succès utilisent des annonces accessibles. Une interface vide ne contient pas de fausses tâches de démonstration.

Les tailles des champs utilisent le token `--ui-input-size` : 16 px sous 800 px ou avec un pointeur tactile, y compris les sélecteurs plus spécifiques des réglages. Chaque règle conserve sa taille habituelle sur ordinateur. Le viewport HTML permet toujours le zoom volontaire.

`shared/ui/useMobileFormViewport`, monté une fois par le shell, adapte la hauteur disponible sur écran tactile via `visualViewport.height` et `offsetTop`. Tâches et les dialogues consomment ces mesures CSS ; sans cette API, la hauteur de fenêtre sert de repli. Le focus et la saisie déclenchent le suivi du champ : sa visibilité est vérifiée après redimensionnement, déplacement du viewport et défilement natif tardif du dialogue. Dans un dialogue long, seul son `scrollTop` est ajusté entre l’en-tête et les commandes, sans propager un nouveau déplacement à la page. Cela couvre aussi les sections suivantes et le formulaire d’ajout des réglages.

Un geste tactile de défilement, la molette ou un appui ailleurs suspend ce suivi jusqu’à la prochaine saisie ou prise de focus ; toucher à nouveau le champ actif permet de rouvrir le clavier. Le zoom manuel suspend l’adaptation. Les écouteurs et propriétés CSS sont retirés au démontage. Il ne s’agit pas d’une détection universelle du clavier : un navigateur ou clavier flottant qui n’expose aucun changement de zone visible conserve son comportement natif. Voir [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).

## Contrats et limites

Les données privées proviennent exclusivement de l'API. Un `expected_version` périmé déclenche une erreur explicite ; le brouillon de tâche reste disponible via **Reprendre la saisie** et les données sont réconciliées avec l’API. Aucun retry de mutation ne remplace silencieusement la version attendue. La déconnexion/expiration efface les données de session affichables.

L’édition transmet uniquement les champs modifiés : une validation déjà en attente peut ainsi avancer une récurrence sans qu’une modification de titre ne rétablisse l’ancienne date. L’animation garde la cible cliquable immobile (halo et coche animés). Le compteur d’enregistrements possède son propre état React, même quand une erreur de relecture conserve exactement le même instantané. Les identifiants React restent stables lors de la confirmation d’une création, afin de préserver le focus et la saisie suivante.

Les différences entre dates calendaires sont calculées sur des minuits UTC, sans dépendre de la durée des jours de changement d’heure. Un minuteur jusqu’au prochain minuit local et les événements de focus/visibilité rafraîchissent les libellés et les requêtes. Les échéances sont formatées comme dates locales, sans conversion d'un minuit UTC susceptible de changer de jour. Les événements sont convertis depuis leurs instants UTC vers le fuseau du navigateur.

Pas de mode hors connexion, service worker, synchronisation temps réel ou virtualisation. Le client lit les pages API de 200 tâches jusqu'au total pour une vue personnelle complète. Les tests de navigateur utilisent la compilation de production, afin de vérifier aussi les effets de l'optimisation CSS/JavaScript. Voir [Tests](tests.md).

Les trois vues partagent le menu contextuel et les actions de sélection. Le menu est rendu dans un portail, borné au viewport et refermé au défilement, clic extérieur ou Échap. Il gère focus et navigation au clavier. La sélection souris démarre après 6 px, le maintien tactile après 450 ms et s’annule avant activation au-delà de 10 px de mouvement. Les poignées conservent le glisser-déposer individuel ; un clic simple conserve l’édition. Le rectangle et le défilement aux bords utilisent `requestAnimationFrame` ; le pointeur est suivi jusqu’au relâchement ou à l’annulation, même hors de la zone des tâches.

La barre fixe présente replanification, déplacement, suppression réversible et désélection. `BulkTaskDialog` transmet les versions affichées à `/tasks/bulk` et se ferme dès la confirmation. La synchronisation conserve les erreurs, réconcilie le lot entier après conflit et laisse continuer les autres actions. Le menu appelle `/duplicate` ou la même suppression groupée pour une seule tâche. Les gestes restent purement locaux ; seules les actions confirmées mutent l’API. La sélection est limitée aux tâches encore visibles et est remise à zéro après soumission ou changement d’espace. Le panneau mobile bloque le contenu arrière et contient le focus ; les cibles tactiles, champs sans zoom automatique, marges de sécurité et animations réduites sont pris en compte.

## Socle commun et bibliothèque

`platform/auth/SessionProvider` charge la session, sérialise les écritures partielles de thème et de langue et démonte les données privées à la déconnexion/expiration. `AccountMenu` est commun au shell et aux applications. `platform/api.ts` possède le CSRF en mémoire, les erreurs réseau et les événements d’expiration/désactivation. Les réponses d’anciennes sessions ne doivent pas invalider une nouvelle session.

`ApplicationProvider` charge le catalogue et enregistre les activations via l’API. Une lecture en cours est annulée avant une mutation ; une réponse obsolète ne remplace pas un état enregistré. L’accueil filtre `enabled`, la bibliothèque affiche toutes les applications disponibles. État vide, chargement, erreurs et reprise sont explicites. Les chemins inconnus ne sont pas des accueils implicites.

Chaque `manifest.ts` associe seulement l’identifiant à `Page.tsx` via `React.lazy`. Les métadonnées restent celles du serveur. Les tokens communs et boutons/formulaires/dialogues sont dans `shared/styles/ui.css` ; le CSS métier `apps/<id>/styles.css` arrive avec sa Page. Les imports entre applications et ceux du socle vers une application sont vérifiés par les tests de frontières.

## Langue de session

`platform/i18n/` initialise i18next avant le rendu. Les helpers typés `tr` utilisent les ressources JSON de `shared/` ou de leur application ; les ressources métier arrivent avec la Page chargée à la demande. Les formats de dates et nombres passent par `formatLocale()`. Les chaînes interpolées sont du texte React, sans HTML dynamique.

`SessionProvider` applique `locale` retournée par le serveur, met à jour `html.lang` et remonte l’arbre privé lors d’une bascule. Le transport associe chaque requête à une génération de session/langue et ignore toute réponse devenue obsolète, même après un aller-retour FR → EN → FR. Les préférences sont écrites en série et ne remettent pas les autres champs au défaut. `AccountMenu.beforeSessionChange` attend les écritures Tâches ou consulte la protection des brouillons Sport avant langue/déconnexion. Les formulaires non enregistrés restent transitoires. Voir [Internationalisation](internationalisation.md).
