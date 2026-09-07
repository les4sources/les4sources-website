---
project: les4sources-website
task: Copie conforme Astro statique de www.les4sources.be, habillée du brand system Claude Design, événements/activités pilotés depuis Claudy
phase: build
progress: 0/38
mode: algorithm
iteration: 1
started: 2026-09-07T23:30:00+02:00
updated: 2026-09-07T23:45:00+02:00
principal_stated_goal: "Crée une copie conforme Astro statique du site web actuel des 4 Sources (www.les4sources.be) en l'upgradant au brand system créé avec Claude Design, dont je te fournis le prompt complet ci-dessous. Le site web doit avoir une structure et un contenu 100% identique au site actuel, ce qui va nous permettre de switcher rapidement vers le nouveau site, qui évoluera ensuite. La gestion des événéments et des activités doit se faire depuis Claudy, où les bases sont déjà posées. L'éditrice du site web va donc utiliser Claudy pour ajouter/dupliquer des événements et les publier sur le site web. Le site web doit être super génial, agréable à visiter, rapide, optimisé SEO/GEO, prêt à être publié."
---

# ISA — Site web des 4 Sources (Astro)

## Problem

Le site www.les4sources.be tourne sur Super.so + Notion : 209 URLs, images hotlinkées sur le CDN de Super, pas de maîtrise du SEO, une identité visuelle antérieure au brand system 2026, et une gestion des événements récurrents (pizza party, camembert party, soudure à l'arc, low-tech, stages) qui se fait par duplication manuelle de pages Notion, déconnectée de Claudy où le lieu gère déjà son activité. Le collectif ne peut pas basculer tant qu'il n'existe pas une copie fidèle et publiable.

## Vision

Un site statique rapide, fidèle au brand system Claude Design des 4 Sources (Averia Serif Libre + Be Vietnam Pro, palette teal et pôles thématiques, blob panels, pictos), dont la structure et le contenu sont ceux du site actuel au moment de la bascule — on change de moteur et d'habit, pas de fond. Les pages éditoriales vivent en Markdown dans le repo ; les événements et les activités vivent dans Claudy, l'éditrice les crée ou les duplique là, et le site les publie au build. Le visiteur trouve tout de suite ce qu'il cherche (séjour, salle, événement, activité, bar), sur mobile comme sur grand écran, et le référencement existant est intégralement préservé.

## Out of Scope

- Pas de refonte éditoriale : aucun texte réécrit, aucune page ajoutée ou supprimée par rapport au sitemap actuel (hors normalisation technique documentée).
- Pas de multilingue (le site actuel est FR uniquement).
- Pas de réservation en ligne dans le site : les disponibilités restent l'iframe Claudy existante, la réservation reste le funnel Claudy.
- Pas de CMS web (Sveltia) dans cette v1 ; l'édition des pages se fait en Markdown, celle des événements/activités dans Claudy.
- Pas de bascule DNS ni de déploiement en production sans feu vert explicite de Michael (PORTE 3.5).
- Pas d'édition du contenu Notion/Super actuel.
- Le code côté Claudy (API publique, champs de publication, action dupliquer) est un chantier distinct sur le repo `les4sources/claudy` — ce repo-ci n'en dépend qu'à travers le contrat `docs/CLAUDY.md`.

## Principles

- La charte Claude Design (tokens, composants, voix) est la source de vérité visuelle ; le code la sert.
- Le contenu migré est la source de vérité éditoriale ; rien d'inventé, rien de perdu — la parité se prouve par script, pas à l'œil.
- Déterminisme : crawl, extraction, migration et vérifications sont des scripts re-jouables dans le repo.
- Les URLs sont des contrats : chaque path actuel répond à l'identique.
- Zéro dépendance externe au runtime : polices, images, scripts auto-hébergés ; seuls les embeds fonctionnels (Claudy, Tally, cartes, vidéos) restent externes.
- Statique d'abord : tout ce qui peut être résolu au build l'est ; le JS client se limite aux îlots indispensables.
- Contrat avant couplage : le site et Claudy se parlent à travers un JSON documenté et une fixture ; chacun peut avancer sans l'autre.

## Constraints

- Astro (statique) + Tailwind v4 (tokens en `@theme`) + Content Collections Zod, sur la fondation de `~/code/semisto-website` (même auteur, même problème résolu).
- bun uniquement ; TypeScript uniquement.
- Déploiement conteneurisé (Dockerfile bun → nginx) pour rester portable (Coolify, Hatchbox ou autre) — l'hébergement cible n'est pas tranché (UNKNOWN, ne bloque pas).
- Claudy est l'application Rails du lieu (`~/code/claudy`, prod `app.les4sources.be`) ; toute évolution côté Claudy passe par une PR ou une issue nocturne distincte.
- Clés/API en variables d'environnement, jamais dans le repo.

## Goal

Livrer, sur la branche `build/astro-v1` de `les4sources/les4sources-website`, un site Astro statique qui rend les 209 URLs du site actuel avec le même contenu, habillé du brand system Claude Design, dont les événements et les activités sont lus depuis Claudy au build (contrat documenté, fixture, repli sur le contenu migré), qui passe `bun run verify` (types, build, SEO), atteint les scores Lighthouse visés, et s'exécute dans un conteneur nginx prêt à être déployé.

## Criteria

### Fondation
- [ ] ISC-1 : `bun run build` réussit (exit 0).
- [ ] ISC-2 : `astro check` sans erreur de type.
- [ ] ISC-3 : Les tokens du brand system (couleurs, typo, espacements, rayons, ombres) sont exposés en `@theme` Tailwind v4 avec les valeurs exactes de `tokens/*.css` du projet Claude Design.
- [ ] ISC-4 : Averia Serif Libre et Be Vietnam Pro sont auto-hébergées (`@font-face` local, aucune requête vers un CDN de polices).
- [ ] ISC-5 : Logos, logotypes et pictos des pôles du brand system sont dans le repo (SVG) et utilisés par la navigation et le pied de page.

### Parité de structure et de contenu
- [ ] ISC-6 : Les 194 paths du sitemap actuel qui répondent réellement (200) existent dans `dist/` (194/194, script de parité) ; les 15 entrées du sitemap qui renvoient déjà 404 sur le site actuel sont redirigées en 301 vers leur section (`public/_redirects`), jamais servies en 404.
- [ ] ISC-7 : Pour chaque page, le H1 et le texte principal du site actuel se retrouvent dans la nouvelle page (script de parité textuel ≥ 95 % des phrases ; chaque exception listée et justifiée dans le Log).
- [ ] ISC-8 : Toutes les images de contenu sont locales et optimisées ; `dist/` ne contient aucune URL `images.spr.so`.
- [ ] ISC-9 : Les embeds fonctionnels sont préservés : iframe du calendrier de disponibilités Claudy, formulaires Tally, cartes, vidéos — liste issue de `migration/report.md`, chacun retrouvé dans `dist/`.
- [ ] ISC-10 : La navigation principale et le pied de page reproduisent les entrées, l'ordre et les liens du site actuel (`migration/nav.json`).
- [ ] ISC-11 : Les événements passés gardent leur URL mais sont séparés des événements à venir dans les listings (agenda, événements).
- [ ] ISC-12 : Catalogue d'activités, collectif, projets, hébergements et événements sont rendus depuis des collections typées (Zod), pas des pages en dur.
- [ ] ISC-13 : Anti : `dist/` ne contient aucun lien vers `super.so`, `notion.site`, ni aucune image hotlinkée.
- [ ] ISC-14 : Anti : aucun contenu inventé — recherche de `lorem`, `placeholder`, `TODO` dans `dist/` vide ; chaque page provient de la migration ou de Claudy.

### Design
- [ ] ISC-15 : Accueil, Agenda, Bar et Séjours reproduisent les maquettes `ui_kits/website` (sections, hiérarchie, composants), constaté sur captures agent-browser.
- [ ] ISC-16 : Les composants du DS utilisés par le site (Button, Badge, Tag, PoleTag, Highlight, Card, EventCard, BlobPanel, Tabs, Nav, Footer) existent en Astro avec leurs variantes.
- [ ] ISC-17 : Sur mobile 375 px, aucune page clé (accueil, agenda, séjours, tarifs, une fiche événement, une fiche activité, un hébergement) ne déborde horizontalement (`scrollWidth ≤ innerWidth`).
- [ ] ISC-18 : Accessibilité de base : contraste AA sur le texte courant, focus visible, `alt` sur toutes les images, landmarks (`header/nav/main/footer`), un seul H1 par page.
- [ ] ISC-19 : Antecedent (« agréable à visiter ») : hiérarchie typographique du DS, photos locales en grand format, rythme d'espacement du DS, états hover/focus, `prefers-reduced-motion` respecté.

### Claudy — source des événements et activités
- [ ] ISC-20 : Le contrat Claudy → site est écrit (`docs/CLAUDY.md`) : endpoints JSON publics en lecture seule, champs, sémantique de publication, slugs, images, déclencheur de rebuild ; une fixture JSON conforme vit dans le repo (`src/data/claudy.fixture.json`).
- [ ] ISC-21 : Un loader Astro lit les événements et les activités depuis `CLAUDY_PUBLIC_API_URL` au build, valide la réponse (Zod) contre le contrat, et fusionne avec le contenu migré (un événement Claudy publié l'emporte sur son homologue migré de même slug ; les événements migrés sans homologue restent servis).
- [ ] ISC-22 : Si Claudy est indisponible, non configuré ou vide au build, le site retombe sur le contenu migré et le build le journalise (ligne explicite dans la sortie du build) ; le build ne casse jamais pour cette raison.
- [ ] ISC-23 : Test bout-en-bout contre la fixture : un événement présent dans la fixture (via `CLAUDY_PUBLIC_API_URL=file://…` ou un serveur local Bun) apparaît dans `dist/` avec sa fiche, son entrée dans l'agenda et son JSON-LD `Event`. `[DEFERRED-VERIFY]` contre Claudy réel tant que l'API publique n'est pas livrée côté Claudy.
- [ ] ISC-24 : Le rebuild est déclenchable par webhook (Coolify) ou dispatch GitHub ; procédure documentée dans `docs/CLAUDY.md`. `[DEFERRED-VERIFY]` tant que l'hébergement n'est pas tranché.

### SEO / GEO
- [ ] ISC-25 : Chaque page a un `<title>` ≤ 60 caractères et une description 50–160 caractères, uniques (`seo:check` vert).
- [ ] ISC-26 : Canonical, Open Graph, Twitter card, JSON-LD `Organization`/`LocalBusiness` global, `Event` sur les fiches événement, `BreadcrumbList` sur les pages profondes.
- [ ] ISC-27 : `sitemap.xml` et `robots.txt` générés et cohérents avec les 209 URLs.
- [ ] ISC-28 : Image OG par page (hero ou image par défaut de la marque), générée au build.
- [ ] ISC-29 : Normalisations serveur : http→https, apex→www, trailing slash, et 301 pour les anciennes URLs connues hors sitemap (`_redirects` → nginx).
- [ ] ISC-30 : GEO : données NAP cohérentes (adresse, téléphone +32 455 13 61 42, email) sur toutes les pages, blocs FAQ balisés `FAQPage` là où le contenu actuel en contient.

### Performance
- [ ] ISC-31 : Lighthouse mobile sur accueil, agenda, séjours, une fiche événement : Performance ≥ 90, SEO = 100, Accessibilité ≥ 95, Best Practices ≥ 95.
- [ ] ISC-32 : JS client limité aux îlots nécessaires (menu mobile, onglets, lightbox) ; poids total JS de `dist/` ≤ 60 kB gzip hors embeds.
- [ ] ISC-33 : Images en WebP/AVIF avec `width`/`height` et `loading="lazy"` hors hero.

### Publiabilité
- [ ] ISC-34 : Le Dockerfile bun→nginx construit et sert le site (probe : `docker build` + requête HTTP locale, ou `bun run preview` si Docker indisponible, noté au Log).
- [ ] ISC-35 : CI GitHub `verify` (check + build + seo:check) sur chaque PR.
- [ ] ISC-36 : README et CLAUDE.md du repo documentent : éditer une page, gérer un événement/activité dans Claudy, builder, déployer, basculer le DNS.
- [ ] ISC-37 : Anti : aucun secret dans le repo (scan de patterns de tokens vide).
- [ ] ISC-38 : Anti : aucun déploiement en production ni bascule DNS effectué par l'agent ; la branche est poussée et une PR brouillon ouverte.

## Test Strategy

| Claims | Modalité | Sonde | Outil |
|---|---|---|---|
| ISC-1, 2, 25, 35 | commande | `bun run verify` (check + build + seo:check) | Bash |
| ISC-3 | fichier | diff des valeurs entre `tokens/*.css` (design) et `src/styles/global.css` | Bash/Grep |
| ISC-4, 5, 8, 13, 14, 37 | fichier | recherche dans `dist/` et `src/` | Grep |
| ISC-6, 7, 9, 10 | script | `scripts/verify/parity.ts` (209 paths, phrases, embeds, nav) | bun |
| ISC-11, 12, 20, 21, 22 | code + build | lecture des loaders, sortie de build, fixture | Read/Bash |
| ISC-23 | bout-en-bout | fixture servie localement → build → recherche dans `dist/` | Bash |
| ISC-15, 16, 17, 18, 19 | navigateur | agent-browser : captures desktop/mobile, `scrollWidth`, axe | agent-browser |
| ISC-26, 27, 28, 30 | fichier | recherche JSON-LD, `sitemap.xml`, `robots.txt`, `og/` | Grep |
| ISC-29, 34 | HTTP | requêtes HTTP avec en-têtes sur le conteneur/preview | Bash |
| ISC-31, 32, 33 | mesure | Lighthouse CLI sur preview ; taille des JS | Bash |
| ISC-36, 38 | fichier + git | lecture des docs ; `git log`, `gh pr view` | Bash |

## Features

- Fondation Astro (config, Tailwind v4 tokens, layouts, SEO, sitemap, CI, Dockerfile, nginx) | ISC-1..5, 25..29, 34, 35 | dépend du design importé | parallélisable partiellement
- Crawler et extraction du site actuel (`scripts/migrate/`) | ISC-6..10, 13 | — | oui (en cours)
- Migration du contenu en collections + images locales | ISC-6..14, 33 | crawler | oui par section
- Composants du DS et gabarits de pages | ISC-15..19 | design importé | oui par groupe
- Contrat Claudy + fixture + loaders + fusion + repli | ISC-20..24 | découverte Claudy (faite) | oui
- Scripts de vérification (parité, SEO, Lighthouse) | ISC-6, 7, 25, 31 | build | oui
- Documentation et PR brouillon | ISC-36, 38 | tout | non

## Decisions

- 2026-09-07 : **Astro statique** (brief Michael), fondation reprise de `~/code/semisto-website` (Tailwind v4 `@theme`, collections Zod, `<SEO>`, `seo-check`, Dockerfile bun→nginx, CI). Différences assumées : monolingue FR, **pas de préfixe `/fr/`**, URLs strictement identiques à l'actuel (« structure 100 % identique »).
- 2026-09-07 : **Contenu éditorial en Markdown dans le repo**, événements et activités **dans Claudy** (brief). Le crawl du site actuel sert de source initiale pour tout, y compris les événements, jusqu'à ce que Claudy les porte.
- 2026-09-07 : **Hébergement non tranché** — conteneur Docker bun→nginx portable ; question posée à Michael (Coolify comme Semisto, ou autre). Ne bloque pas le build.
- 2026-09-07 : DesignSync exige `/design-login` (action humaine) ; en attendant, tout ce qui ne dépend pas du design avance (crawl, Claudy, ISA, fondation).
- 2026-09-07 : **Mode sombre : clair uniquement.** Le brand system est explicite (« Teal #224246 is the only dark surface… there is no dark theme »), et un site sur fond blanc/papier avec un seul teal est le parti pris de la charte. Le toggle sombre du site Super n'est pas repris ; l'iframe Claudy reste en `color-scheme: light`. À confirmer avec Michael s'il y tient.
- 2026-09-07 : **Import du brand system** — DesignSync ne fonctionne que depuis l'agent principal (test sous-agent : outil absent). Tokens, styles, kits de pages et composants React de référence copiés dans `design/` (source de vérité locale). Assets : logos PNG (teal/blanc) et SVG (mark, logotype, ×3 variantes), 7 pictos de pôles en `currentColor` + variantes couleur/blanc générées par `sed`, une photo (`event-low-tech.jpg`). **Les 10 autres photos du DS dépassent le plafond de 256 Ko de `get_file` et arrivent tronquées** → non utilisées ; les photos du site viennent du crawl (le hero drone du DS est la photo OG du site actuel). Polices : paquets `@fontsource/averia-serif-libre` et `@fontsource/be-vietnam-pro` (woff2, OFL) plutôt que les TTF du DS.
- 2026-09-08 : **Docker absent de cette machine** (`docker` introuvable) → ISC-34 se prouve par revue statique du `Dockerfile`/`deploy/nginx.conf` + `bun run preview` et requêtes HTTP locales ; le `docker build` réel se fera sur l'hébergeur (Coolify construit l'image lui-même). Lighthouse CLI 13.4.1 et Chrome présents → ISC-31 mesurable en local.
- 2026-09-08 : La phrase « 🗞️ Pour être informé·e des prochains événements… » est un **bloc de site** Super présent en bas de presque toutes les pages, pas du contenu de page → rendue par le gabarit (`NewsletterBand`, même texte, bouton vers `/newsletter`) et retirée des corps migrés pour ne pas la doubler. La fixture Claudy est **opt-in** (`CLAUDY_FIXTURE`) : un build ordinaire ne publie jamais les fiches de démonstration (elle écrasait la vraie pizza party de septembre 2026).
- 2026-09-07 : Découverte de contenu par le DS : le pied de page du kit affiche « Fonds d'Ahinvaux 1, 5530 Yvoir », « contact@les4sources.be », « +32 490 46 77 10 (pour les réservations uniquement) » ; le téléphone du lieu dans PROJECTS.md est +32 455 13 61 42. **Les coordonnées NAP sont prises du site actuel crawlé, pas du kit** (parité), et l'écart est signalé à Michael.
- 2026-09-07 : **Découverte Claudy** (agent Explore, très approfondi) : les modèles `Event` (nom, dates, catégorie colorée, notes riches internes, `url` = lien d'inscription externe, `status` libre) et `Experience` (activités : nom, résumé, description riche, durée, prix participant/forfait, min/max, photo CarrierWave, `ExperienceAvailability` datées) existent ; épics #244 (activités) et #245 (événements) ouverts le 2026-09-07. **Manques** : aucune API publique (seule l'API agent privée `api/v1` à bearer token, sans routes événements/activités), aucun champ de publication (`published_at`, slug, image, description publique, lieu), aucune action « dupliquer » sur les événements, pas de récurrence. L'ISA de Claudy prévoit une feature `PublicApi` (namespace `api/public`, lecture seule, sans auth, cacheable) à l'horizon. → **Contrat d'abord** : `docs/CLAUDY.md` + fixture + loader avec repli ; le code Claudy est un chantier distinct (question binaire posée à Michael : traité direct ou issue nocturne `agent:ready`).

## Changelog

- conjectured : le sitemap actuel (209 URLs) décrit la structure réelle du site.
  refuted_by : crawl complet — 15 URLs du sitemap renvoient 404 sur Super (fiches supprimées : 3 activités, 1 membre, 6 événements, 3 projets, `/sejours/entre-amis-aux-4-sources`, `/teams-buildings` — les deux derniers encore liés depuis l'accueil).
  learned : « structure 100 % identique » = 194 pages vivantes + 15 redirections 301 documentées ; les liens internes morts de l'accueil sont réécrits vers leur cible.
  criterion_now : ISC-6 reformulé (194/194 + 15 redirections).
- conjectured : « les bases sont déjà posées » dans Claudy signifiait qu'un flux de publication existait.
  refuted_by : découverte Claudy — modèles présents, mais ni API publique, ni champ de publication, ni duplication.
  learned : le site doit être découplé de Claudy par un contrat + fixture + repli pour rester publiable indépendamment de l'avancement côté Claudy.
  criterion_now : ISC-20 (contrat + fixture), ISC-22 (repli journalisé), ISC-23 marqué `[DEFERRED-VERIFY]` contre Claudy réel.

## Verification

- ISC-3 (2026-09-07 23:50) : boucle `grep` — les 32 valeurs hex de `design/tokens/colors.css` sont toutes présentes dans `src/styles/tokens.css` (`missing=0`) ; échelles typo/espacement/rayons/ombres recopiées à l'identique. Évidence : sortie du probe, 0 manquant.
- ISC-4 (2026-09-07 23:50) : `grep -rl 'fonts.googleapis|fonts.gstatic' dist` → 0 fichier ; `ls dist/_astro/*.woff2` → 23 fichiers (Averia Serif Libre + Be Vietnam Pro via `@fontsource`) ; `bun run build` exit 0 avec ces tokens.
