# Frontend

React, TypeScript et Vite conservent l'outillage du socle. `App.tsx` assemble la connexion commune, l’accueil `/`, la bibliothèque `/applications` et les Pages enregistrées, sans routeur supplémentaire ni fallback général. Sans espace indiqué, `/tasks` ouvre l’agenda global (`?view=agenda`). L'espace actif peut être référencé avec `?space=<UUID>` ; les accès sont toujours contrôlés côté serveur.

## Module tâches

`SchedulePicker` réunit le calendrier accessible (`ScheduleCalendar`) et les réglages (`RecurrenceFields`) dans le flux du dialogue. `useScheduleRecognition` interroge `/scheduling/parse` après 180 ms de pause ; les requêtes précédentes sont annulées et seules les réponses correspondant au texte et à la date courants sont présentées. La sauvegarde attend l’analyse la plus récente, même si on valide immédiatement. `ScheduleRecognition` montre le texte détecté et permet de le garder littéral. Le même comportement équipe l’éditeur et l’ajout rapide.

Les règles et dates restent des données API. Les brouillons du planificateur ne sont appliqués qu’après sélection de date ou validation de l’aperçu serveur. Les erreurs conservent la saisie ; Échap referme le planificateur avant le dialogue. Aucun contenu de tâche n’est enregistré dans localStorage.

La détection affiche le libellé et les trois premières dates retournées par le serveur. `status=incomplete/invalid` affiche `diagnostic` et demande une correction ou le choix explicite **Garder le texte** avant sauvegarde, y compris sur validation immédiate et dans l’ajout rapide. Le planificateur montre le même diagnostic. `ScheduleHelp` expose des exemples français ; ses boutons dans le planificateur remplissent seulement le brouillon à interpréter. L’aide est hors de la région `aria-live` pour éviter de la relire à chaque frappe.

| Fichier / composant | Rôle |
| --- | --- |
| `Page.tsx` | Espaces, état de chargement, filtres et assemblage métier ; session du socle |
| `api.ts` | Pagination métier ; transport et CSRF dans `platform/api.ts` |
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

Le client recharge les données après mutation. Les préférences de vue sont écrites dans l'ordre et la recherche attend 300 ms après la saisie. Les requêtes de lecture obsolètes sont annulées lors d'un changement d'espace. Les contrôles de disposition attendent le chargement de la configuration pour éviter qu'une réponse tardive écrase le choix de l'utilisateur.

L’actualisation conserve les lignes et groupes déjà affichés, notamment dans l’agenda : le chargement ne démonte plus la liste et ne ramène plus son défilement en haut. Les commandes de tâche attendent la fin de la lecture pour utiliser les versions actualisées. Une erreur conserve les derniers résultats et propose **Réessayer**. Les filtres et récurrences peuvent toujours retirer ou déplacer une tâche après la réponse serveur ; aucune résolution optimiste ni nouvelle persistance locale n’est introduite.

## Thèmes et accessibilité

Les tokens globaux de l'accueil restent dans `styles/tokens.css`. Les tokens communs `--ui-*` sont définis dans `shared/styles/ui.css` au niveau racine, avec variantes explicites `data-theme=light/dark` et média système ; ce choix évite une transformation partielle de `light-dark()` dans le CSS compilé. Le thème du compte est chargé depuis l'API, sans secret ni donnée métier dans localStorage.

Inter est servi localement. Les icônes sont des SVG décoratifs avec des noms accessibles sur leurs boutons. Les dialogues natifs retiennent le focus, se ferment avec Échap, donnent le focus au premier champ et le rendent au déclencheur. Les onglets acceptent flèches, Début et Fin. Chaque tâche dispose d'une commande de déplacement utilisable sans geste de glisser-déposer.

Le menu se replie sous 800 px. Le kanban défile horizontalement à l'intérieur de sa zone ; la page et les dialogues restent utilisables à 320 px. Les erreurs d'enregistrement et les succès utilisent des annonces accessibles. Une interface vide ne contient pas de fausses tâches de démonstration.

Les tailles des champs utilisent le token `--ui-input-size` : 16 px sous 800 px ou avec un pointeur tactile, y compris les sélecteurs plus spécifiques des réglages. Chaque règle conserve sa taille habituelle sur ordinateur. Le viewport HTML permet toujours le zoom volontaire.

`shared/ui/useMobileFormViewport`, monté une fois par le shell, adapte la hauteur disponible sur écran tactile via `visualViewport.height` et `offsetTop`. Tâches et les dialogues consomment ces mesures CSS ; sans cette API, la hauteur de fenêtre sert de repli. Au focus ou au redimensionnement, un champ masqué défile dans la zone visible, avec des marges pour les en-têtes et commandes. Le défilement ordinaire ne replace pas le champ ; le zoom manuel suspend l’adaptation. Les écouteurs et propriétés CSS sont retirés au démontage. Il ne s’agit pas d’une détection universelle du clavier : un navigateur ou clavier flottant qui n’expose aucun changement de zone visible conserve son comportement natif. Voir [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).

## Contrats et limites

Les données privées proviennent exclusivement de l'API. Un `expected_version` périmé déclenche une erreur explicite ; le formulaire est conservé et propose de recharger. Aucun retry de mutation ne remplace silencieusement la version attendue. La déconnexion/expiration efface les données de session affichables.

Les différences entre dates calendaires sont calculées sur des minuits UTC, sans dépendre de la durée des jours de changement d’heure. Un minuteur jusqu’au prochain minuit local et les événements de focus/visibilité rafraîchissent les libellés et les requêtes. Les échéances sont formatées comme dates locales, sans conversion d'un minuit UTC susceptible de changer de jour. Les événements sont convertis depuis leurs instants UTC vers le fuseau du navigateur.

Pas de mode hors connexion, service worker, synchronisation temps réel ou virtualisation. Le client lit les pages API de 200 tâches jusqu'au total pour une vue personnelle complète. Les tests de navigateur utilisent la compilation de production, afin de vérifier aussi les effets de l'optimisation CSS/JavaScript. Voir [Tests](tests.md).

Les trois vues partagent le menu contextuel et les actions de sélection. Le menu est rendu dans un portail, borné au viewport et refermé au défilement, clic extérieur ou Échap. Il gère focus et navigation au clavier. La sélection souris démarre après 6 px, le maintien tactile après 450 ms et s’annule avant activation au-delà de 10 px de mouvement. Les poignées conservent le glisser-déposer individuel ; un clic simple conserve l’édition. Le rectangle et le défilement aux bords utilisent `requestAnimationFrame` ; le pointeur est suivi jusqu’au relâchement ou à l’annulation, même hors de la zone des tâches.

La barre fixe présente replanification, déplacement, suppression réversible et désélection. `BulkTaskDialog` fige les versions affichées avant soumission à `/tasks/bulk`, conserve les erreurs et propose un rechargement après conflit. Le menu appelle `/duplicate` ou la même suppression groupée pour une seule tâche. Les gestes restent purement locaux ; seules les actions confirmées mutent l’API. Au changement de vue/filtre/période, la sélection est remise à zéro. Le panneau mobile bloque le contenu arrière et contient le focus ; les cibles tactiles, champs sans zoom automatique, marges de sécurité et animations réduites sont pris en compte.

## Socle commun et bibliothèque

`platform/auth/SessionProvider` charge la session, sérialise les écritures de thème et démonte les données privées à la déconnexion/expiration. `AccountMenu` est commun au shell et aux applications. `platform/api.ts` possède le CSRF en mémoire, les erreurs réseau et les événements d’expiration/désactivation. Les réponses d’anciennes sessions ne doivent pas invalider une nouvelle session.

`ApplicationProvider` charge le catalogue et enregistre les activations via l’API. Une lecture en cours est annulée avant une mutation ; une réponse obsolète ne remplace pas un état enregistré. L’accueil filtre `enabled`, la bibliothèque affiche toutes les applications disponibles. État vide, chargement, erreurs et reprise sont explicites. Les chemins inconnus ne sont pas des accueils implicites.

Chaque `manifest.ts` associe seulement l’identifiant à `Page.tsx` via `React.lazy`. Les métadonnées restent celles du serveur. Les tokens communs et boutons/formulaires/dialogues sont dans `shared/styles/ui.css` ; le CSS métier `apps/<id>/styles.css` arrive avec sa Page. Les imports entre applications et ceux du socle vers une application sont vérifiés par les tests de frontières.
