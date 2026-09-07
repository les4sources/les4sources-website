# Site web des 4 Sources

Site statique du tiers-lieu **Les 4 Sources** (Domaine d'Ahinvaux, Yvoir). Il remplace le site Super.so/Notion actuel en préservant **exactement** ses URLs, et il lit ses événements et ses activités depuis **Claudy**, l'application de gestion du lieu.

## Stack

| Brique | Choix |
|---|---|
| Framework | Astro 6, sortie 100 % statique (`output: "static"`, `trailingSlash: "never"`) |
| Styles | Tailwind v4 via `@tailwindcss/vite`, jetons en `@theme` (`src/styles/tokens.css`) |
| Contenu | Content Collections Astro + Zod (`src/content.config.ts`), Markdown / MDX |
| Données live | Claudy au build (`src/lib/claudy.ts`), avec fixture et repli |
| Images | `astro:assets` + sharp, tout en local (aucun hotlink) |
| Runtime | bun uniquement, TypeScript uniquement |
| Déploiement | conteneur Docker `bun build` → nginx |

Le site est **monolingue français**, sans préfixe de langue : `/sejours/tarifs`, pas `/fr/sejours/tarifs`.

## Développement local

```bash
bun install
bun run dev          # http://localhost:4321
```

Autres commandes :

```bash
bun run build        # génère dist/
bun run preview      # sert dist/ localement
bun run check        # astro check (types)
bun run seo:check    # garde-fou SEO/GEO sur dist/
bun run claudy:check # valide la fixture (et l'API si configurée)
bun run verify       # check + build + seo:check + claudy:check — à passer avant tout merge
```

## Éditer le contenu

Chaque page éditoriale est un fichier Markdown dans `src/content/<collection>/`. Six collections :

| Collection | Contenu | Exemples d'URL |
|---|---|---|
| `pages` | pages éditoriales (accueil, à propos, séjours hors hébergement, bar, coworking, agenda, contact…) | `/`, `/sejours/tarifs`, `/coworking` |
| `evenements` | fiches événement migrées | `/evenements/pizza-party-septembre-2026` |
| `catalogue` | fiches activité migrées | `/catalogue/grimpe-encadree-dans-les-arbres` |
| `collectif` | fiches des membres | `/collectif/michael-hulet` |
| `projets` | projets du lieu | `/projets/semisto` |
| `hebergements` | gîtes et chambres (arborescence imbriquée) | `/sejours/hebergements-yvoir/la-hulotte-gite-16-personnes/chambre-mlisse` |

### Le contrat `legacyPath`

**La route d'une page vient de son champ `legacyPath`, jamais de son nom de fichier.**

```yaml
---
title: Les tarifs
description: "Les tarifs des gîtes, des salles et des séjours aux 4 Sources, à Yvoir."
legacyPath: "/sejours/tarifs"
---
```

`legacyPath` est le chemin **exact** de l'URL du site actuel. Il est obligatoire, et **on ne le renomme jamais** : les 209 URLs listées dans `migration/urls.txt` sont un contrat avec les moteurs de recherche et avec tous les liens déjà partagés. Renommer une page se fait en ajoutant une règle 301 dans `public/_redirects`, jamais en changeant un `legacyPath` publié.

Les autres champs utiles : `seoTitle` (titre court si le titre d'affichage dépasse 60 caractères), `ogImage`, `cover` + `coverAlt`, `draft` (retire la page du site), `archived` (garde l'URL mais retire des listings), `pole` (un des sept pôles), `embeds` (iframes fonctionnelles préservées), `generatedDescription` (vrai quand la description a été fabriquée par la migration : elle sert au SEO mais ne s'affiche jamais comme accroche).

### Pages composées

Quatre pages sont composées en Astro plutôt que rendues depuis leur Markdown, pour reproduire les kits du brand system : l'accueil (`src/pages/index.astro`), l'agenda (`agenda.astro`), le hub séjours (`sejours/index.astro`) et le bar (`le-bar-des-4-sources.astro`). Leur texte est celui du site actuel, copié mot pour mot depuis `src/content/pages/` ; pour le modifier, on édite le fichier `.astro`. Les index de sections (`/evenements`, `/catalogue`, `/collectif`, `/projets`) affichent l'intro de leur page Markdown puis une grille vivante.

### Régénérer depuis le site actuel

Tout le contenu de `src/content/` et `src/assets/migration/` a été produit par `bun run migrate:crawl` → `bun run migrate:extract` → `bun run migrate:content` à partir de www.les4sources.be. Les fichiers générés sont listés dans `migration/generated-manifest.json` ; relancer `migrate:content` les réécrit et ne touche jamais un fichier écrit à la main. Une fois le nouveau site en ligne, l'ancien site n'est plus une source : on édite directement `src/content/`.

## Événements et activités : le contrat Claudy

Les événements et les activités ne se gèrent **pas** dans ce dépôt : ils vivent dans **Claudy**, où l'éditrice les crée, les duplique et les publie. Le site les lit **au build**.

Le contrat complet — endpoints, champs, sémantique de publication, déclencheur de rebuild — est dans **[`docs/CLAUDY.md`](docs/CLAUDY.md)**. Côté site, l'implémentation tient dans `src/lib/claudy.ts` (schémas Zod, chargement, fusion) et `src/lib/data.ts` (point d'entrée unique).

Trois sources possibles, dans l'ordre :

1. `CLAUDY_PUBLIC_API_URL` — l'API publique de Claudy ;
2. `CLAUDY_FIXTURE` — une fixture locale, **uniquement si la variable est définie** (`1` pour `src/data/claudy.fixture.json`, ou un chemin) : c'est une doublure de test, un build ordinaire ne publie jamais ses fiches de démonstration ;
3. rien — le site retombe intégralement sur le contenu migré.

Règle de fusion : **un événement Claudy publié l'emporte sur son homologue migré de même slug**, et une fiche migrée sans homologue reste servie (son URL est préservée). Le build imprime une ligne de synthèse :

```
claudy: source=fixture events=3 experiences=2 merged=5 legacy_only=0
```

**Le build ne casse jamais à cause de Claudy** : une API injoignable ou une réponse invalide est journalisée puis ignorée.

## Design

Le brand system Claude Design des 4 Sources est la source de vérité visuelle. Sa copie de référence vit dans `design/` (règles de marque dans `design/README.md`, jetons dans `design/tokens/`, kits de pages et composants React de référence). Les jetons sont exposés à Tailwind v4 dans `src/styles/tokens.css` (bloc `@theme`) : teal `#224246` sur blanc, les 4 pôles et les 3 familles de pictos avec leurs teintes et encres, Averia Serif Libre pour les titres et le texte courant, Be Vietnam Pro pour l'interface. Les composants ne référencent que ces noms (`bg-teal`, `text-ink-2`, `font-display`, `text-pole-nature`, `rounded-photo`…).

Les composants du design system sont portés en Astro dans `src/components/ds/` (Button, Badge, Tag, PoleTag, Highlight, Tabs, Card, EventCard, BlobPanel, PoleIcon, Logo, Section, Lead, NewsletterBand). `src/components/layout/Header.astro` et `Footer.astro` reproduisent les kits Nav et Footer ; les logos et les sept pictos de pôles sont dans `src/assets/brand/`.

Les polices sont auto-hébergées via les paquets `@fontsource/averia-serif-libre` et `@fontsource/be-vietnam-pro` (woff2, licence OFL) — aucune requête vers un CDN de polices. Le site est clair uniquement : la charte n'a pas de thème sombre.

## Build et vérification

`bun run verify` enchaîne les quatre garde-fous et doit passer avant tout merge :

- `astro check` — types ;
- `astro build` — génération de `dist/` ;
- `seo:check` — titre ≤ 60 caractères, description 50–160, unicité, `alt` sur toutes les images, un seul `<h1>`, canonical, JSON-LD valide, aucun vestige `images.spr.so` / `super.so` / `notion.site`, aucun contenu factice, liens internes ;
- `claudy:check` — conformité de la fixture (et de l'API si `CLAUDY_PUBLIC_API_URL` est défini).

## Docker

```bash
docker build -t les4sources-website .
docker run --rm -p 8080:80 les4sources-website
```

Le `Dockerfile` construit le site avec bun, rejoue `public/_redirects` en configuration nginx (`scripts/redirects-to-nginx.ts`), puis sert `dist/` avec nginx (`deploy/nginx.conf`).

## Déploiement

**L'hébergement n'est pas encore tranché.** L'image Docker est volontairement portable (Coolify, Hatchbox, ou tout hôte capable de faire tourner un conteneur).

Ce qui est déjà décidé :

- origine canonique **`https://www.les4sources.be`** ; l'apex `les4sources.be` part en 301 vers `www` ;
- `http` → `https` est géré par le reverse proxy en amont, pas par le nginx du conteneur ;
- le slash final est normalisé (`/foo/` → `/foo`) ;
- la variable `SITE` surcharge l'origine canonique au build ;
- le rebuild sur publication d'un événement dans Claudy se fera par webhook — cible à définir avec l'hébergement (voir `docs/CLAUDY.md`).

### Bascule depuis Super

1. Déployer l'image sur l'hôte choisi et la brancher sur un sous-domaine de test (par exemple `new.les4sources.be`) avec `SITE=https://www.les4sources.be` au build, pour valider les canoniques.
2. Vérifier sur ce sous-domaine : `bun scripts/verify/parity.ts` contre le build déployé, les 15 redirections 301 (`public/_redirects`), le calendrier Claudy, les formulaires.
3. Basculer les enregistrements DNS de `www.les4sources.be` et de l'apex vers l'hôte ; laisser Super en place quelques jours sans le résilier.
4. Après bascule : soumettre `https://www.les4sources.be/sitemap-index.xml` dans la Search Console, surveiller les 404 dans les journaux nginx pendant deux semaines, puis résilier Super.

**Aucune bascule DNS ne sera faite sans feu vert explicite.**
