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

Les autres champs utiles : `seoTitle` (titre court si le titre d'affichage dépasse 60 caractères), `ogImage`, `cover` + `coverAlt`, `draft` (retire la page du site), `archived` (garde l'URL mais retire des listings), `pole` (un des sept pôles), `embeds` (iframes fonctionnelles préservées).

## Événements et activités : le contrat Claudy

Les événements et les activités ne se gèrent **pas** dans ce dépôt : ils vivent dans **Claudy**, où l'éditrice les crée, les duplique et les publie. Le site les lit **au build**.

Le contrat complet — endpoints, champs, sémantique de publication, déclencheur de rebuild — est dans **[`docs/CLAUDY.md`](docs/CLAUDY.md)**. Côté site, l'implémentation tient dans `src/lib/claudy.ts` (schémas Zod, chargement, fusion) et `src/lib/data.ts` (point d'entrée unique).

Trois sources possibles, dans l'ordre :

1. `CLAUDY_PUBLIC_API_URL` — l'API publique de Claudy ;
2. `CLAUDY_FIXTURE` (défaut `src/data/claudy.fixture.json`) — la fixture du dépôt ;
3. rien — le site retombe intégralement sur le contenu migré.

Règle de fusion : **un événement Claudy publié l'emporte sur son homologue migré de même slug**, et une fiche migrée sans homologue reste servie (son URL est préservée). Le build imprime une ligne de synthèse :

```
claudy: source=fixture events=3 experiences=2 merged=5 legacy_only=0
```

**Le build ne casse jamais à cause de Claudy** : une API injoignable ou une réponse invalide est journalisée puis ignorée.

## Design

Les jetons de design vivent dans `src/styles/tokens.css`, dans un bloc `@theme`. **Les valeurs actuelles sont provisoires** et seront remplacées par celles du brand system Claude Design. Les composants ne référencent que les noms sémantiques (`bg-teal`, `text-ink-soft`, `font-display`, `text-pole-nature`, `rounded-lg`…), donc la bascule ne touchera que ce fichier.

Les polices (Averia Serif Libre, Be Vietnam Pro) sont auto-hébergées : déposer les fichiers TTF dans `public/fonts/averia-serif-libre/` et `public/fonts/be-vietnam-pro/`, les `@font-face` les attendent déjà.

`src/components/layout/Header.astro` et `Footer.astro` sont **provisoires** : ils seront remplacés par les composants Nav et Footer du design system.

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

**Aucune bascule DNS ne sera faite sans feu vert explicite.**
