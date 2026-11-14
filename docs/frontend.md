# Frontend

React, TypeScript et Vite conservent l'outillage du socle. `App.tsx` sélectionne l'accueil `/` ou les tâches `/tasks`, sans routeur supplémentaire ni fallback général. Sans espace indiqué, `/tasks` ouvre l’agenda global (`?view=agenda`). L'espace actif peut être référencé avec `?space=<UUID>` ; les accès sont toujours contrôlés côté serveur.

## Module tâches

| Fichier / composant | Rôle |
| --- | --- |
| `TasksPage.tsx` | Session, espaces, état de chargement, filtres et assemblage |
| `api.ts` | Requêtes de même origine, CSRF en mémoire, pagination et erreurs |
| `types.ts`, `dates.ts` | Contrats, libellés calendaires et changement de jour local |
| `AgendaView` | Vue globale des échéances, périodes et réglages enregistrés par API |
| `TaskContents` | Contenu et échéance partagés par liste, kanban et agenda |
| `TaskViews` | Listes, lignes/colonnes du tableau, ajouts rapides et glisser-déposer |
| `TaskEditor`, `MoveDialog` | Édition atomique, conflits, historique et déplacement accessible |
| `WorkspaceSettings`, `WorkspaceDialog` | Propriétés, ordre, sections, colonnes, étiquettes et archives |
| `Dialog`, `LoginPanel` | Dialogues natifs, focus et connexion |
| `tasks.css` | Présentation et tokens spécifiques à la fonctionnalité |

`@dnd-kit/core` fournit les capteurs pointeur/clavier et les cibles de dépôt. Le serveur calcule l'ordre final. Un tri automatique désactive les poignées ; la commande de déplacement reste disponible. Les sections sont filtrées selon leur visibilité ; les statuts définissent les colonnes, sans les confondre avec les sections.

Le client recharge les données après mutation. Les préférences de vue sont écrites dans l'ordre et la recherche attend 300 ms après la saisie. Les requêtes de lecture obsolètes sont annulées lors d'un changement d'espace. Les contrôles de disposition attendent le chargement de la configuration pour éviter qu'une réponse tardive écrase le choix de l'utilisateur.

## Thèmes et accessibilité

Les tokens globaux de l'accueil restent dans `styles/tokens.css`. Les tokens des tâches sont définis au niveau racine, avec variantes explicites `data-theme=light/dark` et média système ; ce choix évite une transformation partielle de `light-dark()` dans le CSS compilé. Le thème du compte est chargé depuis l'API, sans secret ni donnée métier dans localStorage.

Inter est servi localement. Les icônes sont des SVG décoratifs avec des noms accessibles sur leurs boutons. Les dialogues natifs retiennent le focus, se ferment avec Échap, donnent le focus au premier champ et le rendent au déclencheur. Les onglets acceptent flèches, Début et Fin. Chaque tâche dispose d'une commande de déplacement utilisable sans geste de glisser-déposer.

Le menu se replie sous 800 px. Le kanban défile horizontalement à l'intérieur de sa zone ; la page et les dialogues restent utilisables à 320 px. Les erreurs d'enregistrement et les succès utilisent des annonces accessibles. Une interface vide ne contient pas de fausses tâches de démonstration.

## Contrats et limites

Les données privées proviennent exclusivement de l'API. Un `expected_version` périmé déclenche une erreur explicite ; le formulaire est conservé et propose de recharger. Aucun retry de mutation ne remplace silencieusement la version attendue. La déconnexion/expiration efface les données de session affichables.

Les différences entre dates calendaires sont calculées sur des minuits UTC, sans dépendre de la durée des jours de changement d’heure. Un minuteur jusqu’au prochain minuit local et les événements de focus/visibilité rafraîchissent les libellés et les requêtes. Les échéances sont formatées comme dates locales, sans conversion d'un minuit UTC susceptible de changer de jour. Les événements sont convertis depuis leurs instants UTC vers le fuseau du navigateur.

Pas de mode hors connexion, service worker, synchronisation temps réel ou virtualisation. Le client lit les pages API de 200 tâches jusqu'au total pour une vue personnelle complète. Les tests de navigateur utilisent la compilation de production, afin de vérifier aussi les effets de l'optimisation CSS/JavaScript. Voir [Tests](tests.md).
