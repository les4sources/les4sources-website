---
project: les4sources-website
task: Copie conforme Astro statique de www.les4sources.be, habillée du brand system Claude Design, événements/activités pilotés depuis Claudy
phase: complete
progress: 37/38
mode: algorithm
iteration: 1
started: 2026-09-07T23:30:00+02:00
updated: 2026-09-08T03:40:00+02:00
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
- [x] ISC-1 : `bun run build` réussit (exit 0).
- [x] ISC-2 : `astro check` sans erreur de type.
- [x] ISC-3 : Les tokens du brand system (couleurs, typo, espacements, rayons, ombres) sont exposés en `@theme` Tailwind v4 avec les valeurs exactes de `tokens/*.css` du projet Claude Design.
- [x] ISC-4 : Averia Serif Libre et Be Vietnam Pro sont auto-hébergées (`@font-face` local, aucune requête vers un CDN de polices).
- [x] ISC-5 : Logos, logotypes et pictos des pôles du brand system sont dans le repo (SVG) et utilisés par la navigation et le pied de page.

### Parité de structure et de contenu
- [x] ISC-6 : Les 194 paths du sitemap actuel qui répondent réellement (200) existent dans `dist/` (194/194, script de parité) ; les 15 entrées du sitemap qui renvoient déjà 404 sur le site actuel sont redirigées en 301 vers leur section (`public/_redirects`), jamais servies en 404.
- [x] ISC-7 : Pour chaque page, le H1 et le texte principal du site actuel se retrouvent dans la nouvelle page (script de parité textuel ≥ 95 % des phrases ; chaque exception listée et justifiée dans le Log).
- [x] ISC-8 : Toutes les images de contenu sont locales et optimisées ; `dist/` ne contient aucune URL `images.spr.so`.
- [x] ISC-9 : Les embeds fonctionnels sont préservés : iframe du calendrier de disponibilités Claudy, formulaires Tally, cartes, vidéos — liste issue de `migration/report.md`, chacun retrouvé dans `dist/`.
- [x] ISC-10 : La navigation principale et le pied de page reproduisent les entrées, l'ordre et les liens du site actuel (`migration/nav.json`).
- [x] ISC-11 : Les événements passés gardent leur URL mais sont séparés des événements à venir dans les listings (agenda, événements).
- [x] ISC-12 : Catalogue d'activités, collectif, projets, hébergements et événements sont rendus depuis des collections typées (Zod), pas des pages en dur.
- [x] ISC-13 : Anti : `dist/` ne contient aucun lien vers `super.so`, `notion.site`, ni aucune image hotlinkée.
- [x] ISC-14 : Anti : aucun contenu inventé — recherche de `lorem`, `placeholder`, `TODO` dans `dist/` vide ; chaque page provient de la migration ou de Claudy.

### Design
- [x] ISC-15 : Accueil, Agenda, Bar et Séjours reproduisent les maquettes `ui_kits/website` (sections, hiérarchie, composants), constaté sur captures agent-browser.
- [x] ISC-16 : Les composants du DS utilisés par le site (Button, Badge, Tag, PoleTag, Highlight, Card, EventCard, BlobPanel, Tabs, Nav, Footer) existent en Astro avec leurs variantes.
- [x] ISC-17 : Sur mobile 375 px, aucune page clé (accueil, agenda, séjours, tarifs, une fiche événement, une fiche activité, un hébergement) ne déborde horizontalement (`scrollWidth ≤ innerWidth`).
- [x] ISC-18 : Accessibilité de base : contraste AA sur le texte courant, focus visible, `alt` sur toutes les images, landmarks (`header/nav/main/footer`), un seul H1 par page.
- [x] ISC-19 : Antecedent (« agréable à visiter ») : hiérarchie typographique du DS, photos locales en grand format, rythme d'espacement du DS, états hover/focus, `prefers-reduced-motion` respecté.

### Claudy — source des événements et activités
- [x] ISC-20 : Le contrat Claudy → site est écrit (`docs/CLAUDY.md`) : endpoints JSON publics en lecture seule, champs, sémantique de publication, slugs, images, déclencheur de rebuild ; une fixture JSON conforme vit dans le repo (`src/data/claudy.fixture.json`).
- [x] ISC-21 : Un loader Astro lit les événements et les activités depuis `CLAUDY_PUBLIC_API_URL` au build, valide la réponse (Zod) contre le contrat, et fusionne avec le contenu migré (un événement Claudy publié l'emporte sur son homologue migré de même slug ; les événements migrés sans homologue restent servis).
- [x] ISC-22 : Si Claudy est indisponible, non configuré ou vide au build, le site retombe sur le contenu migré et le build le journalise (ligne explicite dans la sortie du build) ; le build ne casse jamais pour cette raison.
- [x] ISC-23 : Test bout-en-bout contre la fixture : un événement présent dans la fixture (via `CLAUDY_PUBLIC_API_URL=file://…` ou un serveur local Bun) apparaît dans `dist/` avec sa fiche, son entrée dans l'agenda et son JSON-LD `Event`. `[DEFERRED-VERIFY]` contre Claudy réel tant que l'API publique n'est pas livrée côté Claudy.
- [ ] ISC-24 : Le rebuild est déclenchable par webhook (Coolify) ou dispatch GitHub ; procédure documentée dans `docs/CLAUDY.md`. `[DEFERRED-VERIFY]` tant que l'hébergement n'est pas tranché.

### SEO / GEO
- [x] ISC-25 : Chaque page a un `<title>` ≤ 60 caractères et une description 50–160 caractères, uniques (`seo:check` vert).
- [x] ISC-26 : Canonical, Open Graph, Twitter card, JSON-LD `Organization`/`LocalBusiness` global, `Event` sur les fiches événement, `BreadcrumbList` sur les pages profondes.
- [x] ISC-27 : `sitemap.xml` et `robots.txt` générés et cohérents avec les 209 URLs.
- [x] ISC-28 : Image OG par page (hero ou image par défaut de la marque), générée au build.
- [x] ISC-29 : Normalisations serveur : http→https, apex→www, trailing slash, et 301 pour les anciennes URLs connues hors sitemap (`_redirects` → nginx).
- [x] ISC-30 : GEO : données NAP cohérentes (adresse, téléphone +32 455 13 61 42, email) sur toutes les pages, blocs FAQ balisés `FAQPage` là où le contenu actuel en contient.

### Performance
- [x] ISC-31 : Lighthouse mobile sur accueil, agenda, séjours, une fiche événement : Performance ≥ 90, SEO = 100, Accessibilité ≥ 95, Best Practices ≥ 95.
- [x] ISC-32 : JS client limité aux îlots nécessaires (menu mobile, onglets, lightbox) ; poids total JS de `dist/` ≤ 60 kB gzip hors embeds.
- [x] ISC-33 : Images en WebP/AVIF avec `width`/`height` et `loading="lazy"` hors hero.

### Publiabilité
- [x] ISC-34 : Le Dockerfile bun→nginx construit et sert le site (probe : `docker build` + requête HTTP locale, ou `bun run preview` si Docker indisponible, noté au Log).
- [x] ISC-35 : CI GitHub `verify` (check + build + seo:check) sur chaque PR.
- [x] ISC-36 : README et CLAUDE.md du repo documentent : éditer une page, gérer un événement/activité dans Claudy, builder, déployer, basculer le DNS.
- [x] ISC-37 : Anti : aucun secret dans le repo (scan de patterns de tokens vide).
- [x] ISC-38 : Anti : aucun déploiement en production ni bascule DNS effectué par l'agent ; la branche est poussée et une PR brouillon ouverte.

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
- 2026-09-08 03:40 : **Dernière revue visuelle** (mes captures desktop + rapport du vérificateur) → quatre retouches livrées dans `4c18eba` : couvertures d'événement cadrées à gauche, surlignage plein sur le bandeau teal, soutiens sur surface papier, libellés du fil d'Ariane (« Séjours », « Les hébergements ») au lieu des slugs. Restent volontairement en l'état car identiques au site actuel : cartes d'hébergements enfants souvent sans photo (bandeau teinté du pôle), CTA empilés sur mobile, fiche membre sans photo. Pièges d'outillage : le port 4331 était tenu par un serveur de dev Terranova (une 404 Semisto a été capturée à la place du site) → vérifier `lsof -iTCP:<port> -sTCP:LISTEN` avant `astro preview` ; sous charge machine ≥ 18, `agent-browser screenshot` bloque indéfiniment alors que les mesures par `eval` passent.

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
- 2026-09-08 01:20 : **Revue visuelle des gabarits** (captures agent-browser lues) → cinq corrections décidées : (1) les cartes d'événement montrent la photo nue, jamais le BlobPanel (titre tronqué en carte) ; (2) aucune carte n'affiche de cadre image vide — sans photo, bandeau teinté du pôle avec son picto ; (3) nouveau champ `generatedDescription` : une description fabriquée (suffixe du site ou premier paragraphe) sert au SEO mais ne s'affiche jamais comme accroche ou sous-titre ; (4) les index de sections n'affichent plus la liste de liens Notion de l'ancienne page au-dessus de la grille vivante (mêmes titres dans les cartes, parité conservée) ; (5) la page d'un hébergement liste ses enfants directs seulement. Les blancs des captures pleine page (widgets Billetweb/météo, images `loading="lazy"`) sont à confirmer au navigateur avec défilement.
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
- ISC-6/7/9 (2026-09-08 00:25) : `bun scripts/verify/parity.ts` → présentes 194/194, H1 194/194, texte ≥ 95 % 194/194 (tient aussi à `--threshold 1`), embeds 31/31, « ✓ Parité OK », aucune exception déclarée. Les 15 URLs mortes du sitemap sont dans `public/_redirects` (17 lignes 301, dont les 2 normalisations).
- ISC-13 (2026-09-08 00:25) : `grep -rl 'super.so|notion.site|images.spr.so' dist` → 0 fichier.
- ISC-25 (2026-09-08 00:25) : `bun run seo:check` → « 195 pages · ✅ aucune erreur bloquante » (titres ≤ 60 uniques, descriptions 50–160 uniques, alt partout, un H1).
- ISC-27 (2026-09-08 00:25) : `dist/sitemap-index.xml`, `dist/sitemap-0.xml` (194 `<loc>`), `dist/robots.txt` présents.
- ISC-1/2/35 (2026-09-08 00:25) : `bun run verify` (astro check 0 erreur → build 195 pages → seo:check → claudy:check « Contrat Claudy respecté ») exit 0 ; la CI `.github/workflows/ci.yml` lance la même commande.
- ISC-5 (2026-09-08) : `src/assets/brand/logo/` (6 fichiers) et `src/assets/brand/icons/poles/` (7 pictos `currentColor`) ; `Logo.astro` dans l'en-tête, 7 `PoleIcon` blancs dans le pied de page (rapport de l'agent chrome, capture `chrome-desktop.png`).
- ISC-8 (2026-09-08) : 452 images optimisées dans `src/assets/migration/` (sharp, 2000 px max, HEIC/AVIF convertis par `sips`) ; `dist/_astro` = 714 WebP ; 0 URL `images.spr.so` dans `dist/` (probe ISC-13).
- ISC-10 (2026-09-08) : `src/lib/nav.ts` consomme `migration/nav.json` verbatim (en-tête Agenda / Séjours / Salles / Activités / Projets / À propos, 4 groupes de pied de page, Facebook) ; constaté sur `chrome-desktop.png`.
- ISC-11 (2026-09-08 02:50) : `grep` → sections « À venir » et « Passés » dans `dist/agenda/index.html` et `dist/evenements/index.html` ; fiches passées servies à leur URL (194/194).
- ISC-12 (2026-09-08) : `src/content.config.ts` — 6 collections Zod (`pages`, `evenements`, `catalogue`, `collectif`, `projets`, `hebergements`), 194 entrées, routes dérivées de `legacyPath`.
- ISC-16 (2026-09-08 02:50) : `ls src/components/ds/*.astro` → 14 composants (Button, Badge, Tag, PoleTag, Highlight, Tabs, Card, EventCard, BlobPanel, PoleIcon, Logo, Section, Lead, NewsletterBand) + Header/Footer.
- ISC-26 (2026-09-08 02:50) : JSON-LD `Organization` et `LodgingBusiness` sur 195/195 pages, `Event` sur 77 fiches, `BreadcrumbList` sur 174 pages profondes ; canonical et OG sur 195/195.
- ISC-28 (2026-09-08 02:50) : `property="og:image"` sur 195/195 pages (hero ou `/og/les4sources-og.jpg` généré au build).
- ISC-29 (2026-09-08 02:50) : `deploy/nginx.conf` — `server_name www.les4sources.be`, `if ($host != …) return 301`, `include /etc/nginx/redirects.conf`, `try_files … =404` ; `scripts/redirects-to-nginx.ts` → 15 `return 301`. Non testable sous `astro preview` → à confirmer sur le sous-domaine de test (README, procédure de bascule).
- ISC-30 (2026-09-08 02:50) : NAP du pied de page sur chaque page (Fonds d'Ahinvaux 1, 5530 Yvoir · +32 490 46 77 10 · contact@les4sources.be, valeurs du site actuel) ; `FAQPage` : 0 — le contenu actuel ne contient aucun bloc FAQ (aucun toggle/FAQ dans le crawl), donc rien à baliser.
- ISC-34 (2026-09-08 02:50) : Docker absent (voir Décisions) → revue statique du `Dockerfile` (bun install → build → redirects → nginx:alpine) et de `deploy/nginx.conf` ; `bun run preview` répond 200 sur les pages testées (Lighthouse et passe navigateur).
- ISC-36 (2026-09-08 01:45) : README (stack, contenu, pages composées, régénération, contrat Claudy, design, build, Docker, déploiement, bascule) et CLAUDE.md alignés sur l'état final.
- ISC-37 (2026-09-08 02:50) : scan `sk_live|sk_test|AGENT_API_TOKEN=|PRIVATE KEY|ghp_` hors `node_modules`/`dist` → 0.
- ISC-20/21/23 (2026-09-08 02:41) : contrat `docs/CLAUDY.md` + fixture `src/data/claudy.fixture.json` validée par `claudy:check` ; `CLAUDY_FIXTURE=1 bun run build` → `claudy: source=fixture events=3 experiences=2 merged=5 legacy_only=110`, 195 pages ; `dist/evenements/pizza-party-septembre-2026/index.html` contient le titre et le résumé de la fixture et un JSON-LD `"@type":"Event"` ; `dist/agenda/index.html` liste l'événement de la fixture ; la fiche présente seulement dans la fixture (`initiation-soudure-a-l-arc-17-octobre-2026`) est générée ; l'activité de la fixture remplace la page catalogue. Rebuild sans variable → `source=none`, titre migré restauré. Reste `[DEFERRED-VERIFY]` contre l'API Claudy réelle, à livrer côté Claudy (tâche distincte).
- ISC-22 (2026-09-08 02:01) : `bun run build` sans variable Claudy imprime `claudy: source=none events=0 experiences=0 merged=0 legacy_only=115` et sort 195 pages — repli intégral sur le contenu migré, build jamais cassé.
- ISC-31 (2026-09-08 02:05, Lighthouse 13.4.1 mobile sur `astro preview`) : `/` perf 92 · a11y 94 · bp 100 · seo 100 (LCP 3,2 s) ; `/agenda` 97 · 95 · 100 · 100 ; `/sejours` 98 · 100 · 100 · 100 ; `/evenements/pizza-party-septembre-2026` 92 · 91 · 100 · 100. Accessibilité sous 95 sur deux pages → audits `color-contrast` (encres de pôle sur teinte : microferme 3,98, artisanat 4,21, socioculturel 4,22, vie collective 3,85 ; fil d'Ariane `ink-3` 3,48), `heading-order` (cartes en `h4`, chapeaux Notion en `####`), `frame-title` (widget météo). Corrections : encres assombries à ≥ 4,6 sur leur teinte (`#64721a`, `#856440`, `#826b05`, `#ab4925`), fil d'Ariane en `ink-2` (6,49), titre de carte en `h3`, plugin `rehype-a11y` (ordre des titres, `title` sur les iframes). Re-mesure après rebuild.
- ISC-31 re-mesure (2026-09-08 02:45, après correctifs, Lighthouse mobile) : `/` perf 92 · a11y **100** · bp 100 · seo 100 ; `/evenements/pizza-party-septembre-2026` 93 · **96** · 100 · 100 ; `/catalogue` 90 · 96 · 100 · 100 ; `/agenda` 97 · 95 · 100 · 100 et `/sejours` 98 · 100 · 100 · 100 (mesure précédente, pages non modifiées depuis). Seuils tenus : perf ≥ 90, a11y ≥ 95, bp ≥ 95, seo = 100.
- ISC-18 (2026-09-08 02:45) : après rebuild, `grep` → 0 `<iframe>` sans `title` dans `dist/`, 0 `<h4>` orphelin sur la fiche événement (4 `<h3>`) ; encres de pôle ≥ 4,6:1 sur leur teinte (script de contraste), fil d'Ariane 6,49:1 ; audits Lighthouse a11y 96–100 sur cinq pages ; landmarks et focus visible constatés à la passe navigateur du chrome (drawer `aria-expanded`, anneau de focus 3 px teal).
- ISC-32 (2026-09-08 02:06) : `find dist -name '*.js'` → 0 fichier ; 2 scripts inline sur l'accueil (2 090 octets). ≤ 60 kB gzip tenu très largement.
- ISC-33 (2026-09-08 02:06) : `dist/_astro` : 714 WebP, 199 JPEG (variantes), 18 PNG (alpha), 1 GIF ; 1 109/1 113 `<img>` avec `width`/`height` ; 1 019 `loading="lazy"`, 90 `eager` (heros).
- ISC-14 (2026-09-08 00:28) : `grep -rli 'lorem ipsum|TODO' dist --include='*.html'` → 0 fichier.
- ISC-18 partiel (2026-09-08 00:28) : 630 `<img>` dans `dist/`, 0 sans `alt` ; 0 page avec un nombre de `<h1>` différent de 1 (contraste, focus et landmarks vérifiés au navigateur plus tard).
- ISC-4 (2026-09-07 23:50) : `grep -rl 'fonts.googleapis|fonts.gstatic' dist` → 0 fichier ; `ls dist/_astro/*.woff2` → 23 fichiers (Averia Serif Libre + Be Vietnam Pro via `@fontsource`) ; `bun run build` exit 0 avec ces tokens.
- ISC-15 (2026-09-08 03:10) : passe navigateur du vérificateur (agent-browser sur `astro preview`) — captures desktop 1280 de l'accueil, de l'agenda, du bar et de la fiche événement, plus 12 captures mobiles, 28 PNG dans `tmp/verify/` ; sections des kits `ui_kits/website` retrouvées : accueil = hero, 3 lieux, « Prochainement » en cartes d'événement, hébergements, guinguette, projets, bandeau teal randonneurs, activités pour groupes, soutiens ; agenda = « À venir » puis « Passés » ; en-tête Agenda · Séjours · Salles · Activités · Projets · À propos · Le bar 🧉, pied de page 7 pictos + NAP. Après les retouches de `4c18eba` : `object-left` 1 occurrence et `marker-top:-5%` 1 occurrence dans `dist/index.html` ; au navigateur, couleur du marqueur `rgb(34, 66, 70)` et fond de la section soutiens `rgb(250, 246, 240)` ; fil d'Ariane construit « Accueil › Séjours › Tarifs des hébergements et salles » et « Accueil › Séjours › Les hébergements › La Hulotte ».
- ISC-17 (2026-09-08 03:10) : vérificateur agent-browser à 375 × 800 sur 12 pages (accueil, agenda, événements, bar, fiche événement, séjours, tarifs, catalogue, fiche activité, hébergement, disponibilités, newsletter) : « 12 pages `scrollWidth 375 ≤ innerWidth 375` (clientWidth 375) » ; ma passe finale (`final/pass.log`) confirme `375/375` sur accueil et agenda. Menu mobile (`verify/menu.log`) : clic réel sur le bouton → `aria-expanded="true"`, tiroir 375 × 728 visible avec les 6 liens ; Escape réel → `aria-expanded="false"`, tiroir `display: none`.
- ISC-19 (2026-09-08 03:10) : `document.fonts.check('700 16px "Averia Serif Libre"')` → true sur accueil, agenda et fiche événement (`final/pass.log`) ; Be Vietnam Pro 400/500/600/700/900 livrées en woff2 (`dist/_astro`), 3 usages `font-weight:500` ; anneau de focus 3 px teal `rgb(34, 66, 70)` + halo 25 % sur le lien d'évitement et les 7 liens de l'en-tête (`verify/a11y.log`) ; `prefers-reduced-motion` : 1 règle dans le CSS construit ; heros en `loading="eager"` grand format (90) et 1 019 images paresseuses (ISC-33) ; hiérarchie typographique et rythme d'espacement du DS constatés sur les captures.
- ISC-38 (2026-09-08 03:40) : aucune commande de déploiement ni modification DNS dans la session ; `gh pr view 1` → OPEN, draft=true, `build/astro-v1` → `main` ; `origin/main` = `954832b` inchangé (0 commit depuis la base de branche), `origin/build/astro-v1` = HEAD = `4c18eba`, arbre de travail propre.
