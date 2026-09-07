# CLAUDE.md

Consignes pour Claude Code quand il travaille dans ce dépôt.

## Projet

Site statique Astro du tiers-lieu **Les 4 Sources** (Yvoir, Belgique). Il remplace le site Super.so/Notion actuel **à URLs identiques**, habillé du brand system Claude Design, avec les événements et les activités pilotés depuis **Claudy** (`~/code/claudy`, prod `app.les4sources.be`).

Stack : Astro 6 statique · Tailwind v4 (`@theme`) · Content Collections + Zod · bun · TypeScript · Docker bun→nginx.

Contexte long : `ISA.md` (ce qu'il faut atteindre), `docs/CLAUDY.md` (contrat avec Claudy), `README.md` (mode d'emploi), `migration/urls.txt` (les 209 URLs).

## Outillage — non négociable

- **bun uniquement.** `bun install`, `bun add`, `bun run`, `bunx`. Jamais `npm`, `npx`, `yarn`, `pnpm`.
- **TypeScript uniquement.** Jamais de Python, jamais de JavaScript non typé (hors `astro.config.mjs`, qui reste en JS commenté `@ts-check`).
- **Markdown, pas HTML**, pour tout ce que Markdown sait exprimer.

## Les URLs sont un contrat

- La route d'une page vient de son champ **`legacyPath`**, jamais de son nom de fichier.
- **Ne jamais renommer un `legacyPath` publié.** Une URL qui change se traite par une règle 301 dans `public/_redirects`, jamais en éditant le champ.
- Toute page dont l'URL figure dans `migration/urls.txt` doit répondre à l'identique. `seo:check` affiche le score de parité à chaque exécution.
- Pas de préfixe de langue : le site est monolingue FR. `/sejours/tarifs`, jamais `/fr/sejours/tarifs`.

## Design — les jetons sont la seule porte

- Toutes les couleurs, polices, rayons et échelles vivent dans `src/styles/tokens.css` (bloc `@theme`).
- **Aucun composant ne code une valeur en dur.** On écrit `bg-teal`, `text-ink-soft`, `font-display`, `text-pole-nature`, `rounded-lg` — jamais `#0B3D3A`, jamais `bg-[#...]`.
- Les valeurs actuelles des jetons sont **provisoires** (le brand system Claude Design les remplacera) ; les **noms**, eux, sont stables. C'est ce qui permet de changer d'habit sans toucher un composant.
- `Header.astro` et `Footer.astro` sont provisoires et seront remplacés par les composants Nav/Footer du design system : les garder simples.
- Polices auto-hébergées dans `public/fonts/`. **Aucune requête vers un CDN de polices.**

## SEO / GEO

- Chaque page : `<title>` ≤ 60 caractères, `description` de 50 à 160 caractères, **uniques** sur tout le site.
- Un seul `<h1>` par page (il vit dans `PageHero`).
- `alt` obligatoire sur chaque image. Canonical sur chaque page.
- JSON-LD : `Organization` + `LodgingBusiness` partout (via `BaseLayout`), `Event` sur les fiches événement, `BreadcrumbList` sur les pages profondes, `FAQPage` là où le contenu s'y prête. Les constructeurs sont dans `src/lib/seo.ts` — ne pas écrire de JSON-LD à la main.
- Données NAP (nom, téléphone, localité) : source unique `src/lib/site.ts`. **Une donnée inconnue vaut `undefined` et n'est pas émise** — jamais une valeur plausible inventée.

## Images et ressources

- **Aucun hotlink.** Toute image de contenu est locale et passe par `astro:assets`. `dist/` ne doit contenir aucune URL `images.spr.so`, `super.so` ou `notion.site` — `seo:check` échoue sinon.
- Seuls les **embeds fonctionnels** restent externes : iframe du calendrier Claudy, formulaires Tally, cartes, vidéos. Ils se déclarent dans le champ `embeds` du frontmatter.

## Contenu

- **Rien d'inventé.** Chaque texte vient de la migration ou de Claudy. Pas de `lorem`, pas de `placeholder`, pas de faux témoignage, pas de fausse adresse — `seo:check` échoue sur ces marqueurs.
- Une page vide vaut mieux qu'une page remplie de texte plausible.

## Claudy

- Le contrat est `docs/CLAUDY.md`. L'implémentation côté site est `src/lib/claudy.ts` (schémas Zod + fusion) et `src/lib/data.ts` (point d'entrée unique, mémoïsé).
- **Le build ne casse jamais à cause de Claudy** : erreur réseau ou schéma invalide → journalisé, ignoré, repli sur la fixture puis sur le contenu migré.
- Toute évolution côté Claudy passe par une PR ou une issue nocturne sur `~/code/claudy` — jamais depuis ce dépôt.

## Sécurité

- **Aucun secret dans le dépôt.** Clés et URLs d'API en variables d'environnement (`CLAUDY_PUBLIC_API_URL`, `SITE`). `.env` est ignoré par git.
- Ne jamais commiter de données d'exploitation (réservations, clients, e-mails).

## Avant de merger

`bun run verify` doit passer (exit 0) : `astro check && astro build && bun run seo:check && bun run claudy:check`.

Pour toute vérification visuelle d'une page, ouvrir la page dans un navigateur (skill `agent-browser`). « `curl` renvoie 200 » n'est pas une vérification.

## Zones à ne pas toucher sans y être invité

- `scripts/migrate/` et `migration/` — outillage de migration, chantier distinct.
- `ISA.md` et `docs/` — contrats, mis à jour délibérément.
