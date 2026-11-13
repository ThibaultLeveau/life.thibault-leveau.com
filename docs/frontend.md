# Frontend

## Structure

L'interface utilise React et TypeScript. Vite fournit le serveur de développement et compile le site pour la production.

| Emplacement | Responsabilité |
| --- | --- |
| `src/main.tsx` | Monter React dans le document HTML |
| `src/app/App.tsx` | Assembler l'application |
| `src/components/layout/AppLayout.tsx` | Encadrer le contenu de page |
| `src/components/layout/Navbar.tsx` | Afficher la marque et les liens principaux |
| `src/pages/HomePage.tsx` | Afficher l'accueil |
| `src/styles/tokens.css` | Définir couleurs, dimensions et typographie |
| `src/styles/global.css` | Appliquer les styles et l'adaptation aux écrans |
| `public/favicon.svg` | Favicon distribué à la racine |

La V1 ne nécessite ni gestionnaire d'état global ni routeur client. Les liens de navigation sont de véritables liens HTML ; la documentation est une application statique distincte servie par le même backend.

## Ligne graphique

L'accueil se limite à la marque **Life**, aux liens **Accueil** et **Documentation**, et au titre **« Bienvenue, Thibault. »**. Le fond blanc cassé, le texte anthracite et l'accent vert profond sont définis dans les tokens. La police Inter est distribuée avec les ressources de l'application.

Les marges, la largeur maximale et la hiérarchie typographique portent l'interface. Ne pas ajouter de compteurs fictifs, de cartes inactives ou de texte d'explication pour remplir l'écran. Les futurs éléments doivent correspondre à une fonction disponible.

## Accessibilité

Conserver une structure sémantique avec navigation, contenu principal et titre de niveau 1. Le lien actif expose `aria-current` et les liens restent accessibles au clavier. Le focus doit être visible sur les fonds clairs comme sur l'accent vert.

Lors d'une modification, vérifier :

- La lecture et la navigation à 320–375 px de largeur, puis sur ordinateur.
- L'absence de défilement horizontal à 200 % de zoom.
- L'ordre du focus et le lien d'accès direct au contenu lorsqu'il est présent.
- Des noms compréhensibles pour les liens, icônes et boutons.
- Le respect de `prefers-reduced-motion` si une animation est introduite.
- Le contraste du texte et des états interactifs.

Les éléments décoratifs n'ont pas besoin d'être annoncés par les technologies d'assistance.

## Serveur de développement

```bash
make dev-frontend
```

Vite écoute sur `127.0.0.1:5173`. Sa configuration transmet `/api` à FastAPI sur `127.0.0.1:8100` et `/documentation` à MkDocs sur `127.0.0.1:8101`, en conservant les préfixes.

Les appels API futurs doivent utiliser des URL relatives, par exemple `/api/v1/tasks`, afin de fonctionner avec ce proxy puis avec l'origine publique en production. Ne pas inscrire `localhost` dans le code de l'application.

Les variables exposées par Vite et les fichiers frontend sont publics. Aucun secret serveur ne doit utiliser le préfixe `VITE_` ni se retrouver dans `public/`.

## Construction

```bash
npm --prefix frontend ci
npm --prefix frontend run build
```

La sortie se trouve dans `frontend/dist/`. Vite produit des noms d'assets contenant une empreinte pour distinguer les versions. Le backend sert l'index uniquement à `/`, puis les ressources depuis `/assets/` et le favicon depuis `/favicon.svg`.

Ne pas éditer `dist/` : modifier les sources et reconstruire. Les polices étant locales, l'accueil ne dépend pas d'un service de typographie distant.

## Documentation visuelle

MkDocs partage la palette du site via `docs/assets/stylesheets/extra.css`. Le thème ne charge pas de police Google (`font: false`). Les diagrammes Mermaid sont fournis sous forme de SVG déjà rendus, accompagnés de leurs sources `.mmd` ; le navigateur n'a donc pas besoin d'une bibliothèque Mermaid distante.

Pour faire évoluer les diagrammes, voir les instructions de régénération dans [Tests et qualité](tests.md#diagrammes-de-documentation).

## Préparer une fonctionnalité

Créer un dossier `src/features/<fonctionnalite>/` lorsque plusieurs composants et appels HTTP propres à une fonctionnalité apparaissent. Garder les composants réellement transverses dans `components/`. Définir explicitement les états chargement, vide et erreur lorsqu'une API est ajoutée.

La procédure complète et les prérequis liés aux données personnelles figurent dans [Faire évoluer l'application](evolution.md).
