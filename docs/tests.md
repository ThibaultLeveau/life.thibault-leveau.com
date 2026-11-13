# Tests et qualité

## Vérification avant livraison

```bash
make install
make check
make test
make build
```

`make check` vérifie le Python avec Ruff et les types TypeScript. `make test` exécute les tests backend. `make build` compile Vite puis MkDocs en mode strict. Ces contrôles doivent réussir avant la création d'une image livrable.

Les outils sont installés depuis les fichiers de verrouillage. Une mise à jour de dépendance doit inclure le manifeste, le verrou correspondant et les résultats des contrôles pertinents.

## Contrats couverts

| Zone | Comportement à vérifier |
| --- | --- |
| Santé | Statut 200 et réponse JSON `{"status":"ok"}` |
| Configuration | Paramètres par défaut, remplacement par environnement, rejet des valeurs invalides |
| Routes API | Schéma OpenAPI et documentation accessibles |
| Frontend statique | Accueil et fichiers existants correctement distribués |
| Erreurs | Vraies réponses 404 pour API, asset et page inconnus |
| Documentation | Pages et ressources servies sous `/documentation/` |
| Production | Présence des artefacts attendus dans l'image |

Les tests HTTP utilisent des fichiers temporaires pour isoler les règles de routage. Ils ne prétendent pas valider le rendu visuel du vrai build React. La vérification de l'image et l'inspection navigateur complètent ces tests.

## Vérification visuelle et clavier

Contrôler l'accueil à 375 px puis à une largeur d'ordinateur, et compléter à 320 px si la navigation change. Vérifier le titre, l'alignement de la barre de navigation, les marges, les retours à la ligne et l'absence de débordement horizontal.

Utiliser Tab et Entrée pour parcourir les liens. Le focus doit rester visible et le lien vers la documentation doit ouvrir une page fonctionnelle. Examiner l'interface à 200 % de zoom et avec la préférence de réduction des animations.

Sur la documentation, ouvrir une page interne, utiliser la recherche avec « déploiement » puis un terme anglais comme « health », et copier un bloc de commande. La recherche doit retrouver les pages dans le sous-chemin `/documentation/`.

## Documentation stricte

```bash
uv run --group docs mkdocs build --strict
```

Toute page ajoutée doit être intégrée à `nav` dans `mkdocs.yml`, et les liens locaux doivent viser un fichier existant. Les exemples de configuration doivent rester cohérents avec le code et `.env.example`.

La vérification stricte détecte les erreurs signalées par MkDocs ; elle ne vérifie pas la disponibilité de tous les liens externes ni l'exactitude opérationnelle d'une commande. Vérifier manuellement ces points lors d'une modification du déploiement.

## Diagrammes de documentation

Les diagrammes sont écrits en Mermaid dans `docs/assets/diagrams/*.mmd`, puis rendus en SVG à côté des sources. MkDocs distribue les SVG sans JavaScript Mermaid dans le navigateur. Modifier ensemble la source et son rendu.

Une commande de régénération, depuis la racine du dépôt :

```bash
npx --yes --package @mermaid-js/mermaid-cli@11.12.0 mmdc   --input docs/assets/diagrams/production.mmd   --output docs/assets/diagrams/production.svg   --backgroundColor transparent

npx --yes --package @mermaid-js/mermaid-cli@11.12.0 mmdc   --input docs/assets/diagrams/build.mmd   --output docs/assets/diagrams/build.svg   --backgroundColor transparent
```

Mermaid CLI utilise Chromium via Puppeteer. Cette dépendance est nécessaire seulement pour modifier un diagramme ; elle ne fait partie ni de l'image de production ni du build MkDocs. Utiliser la version indiquée et vérifier le SVG généré avant de le commiter.

## Image et site publié

Construire puis lancer l’image localement sur un port réservé au test :

```bash
make docker-build
docker run -d --name life-preview --read-only \
  --tmpfs /tmp:rw,size=16m --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -p 127.0.0.1:18100:8000 "local/life:$(git rev-parse HEAD)"

for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:18100/api/v1/health >/dev/null; then break; fi
  sleep 2
done
./scripts/smoke-test.sh http://127.0.0.1:18100
docker rm -f life-preview
```

Si un contrôle échoue, lire `docker logs life-preview` avant de supprimer le conteneur. Le port de test n’est lié qu’à l’interface locale ; cette commande ne modifie pas le service public.

Après la livraison, vérifier séparément le domaine public :

```bash
./scripts/smoke-test.sh https://life.thibault-leveau.com
```

Le script HTTP accepte une origine comme argument. Un test public vérifie la version réellement publiée, pas une image construite localement mais non démarrée.

Après déploiement, contrôler également le statut Docker, le certificat TLS et les journaux. Une réponse saine du backend ne remplace pas la vérification de la page, de ses ressources et de la documentation.

## Intégration continue

GitHub Actions effectue les contrôles Python, les tests, la validation TypeScript et les constructions frontend/documentation. Il construit aussi l’image Docker et exécute le smoke test sur un conteneur démarré avec les protections du runtime. Le workflow utilise Python 3.13 et Node.js 24. Il ne modifie ni le DNS, ni Caddy, ni les conteneurs du VPS.

Un workflow réussi autorise la revue d'une livraison ; la publication reste une commande explicite exécutée sur le serveur, selon le [guide de déploiement](deploiement.md).
