# Contrat Claudy → site web

> Ce document est la source de vérité de l'échange entre **Claudy** (l'application Rails du lieu, `app.les4sources.be`) et **le site web** (Astro statique, ce repo). Le site lit ce JSON **au build**. Il ne parle jamais à Claudy au runtime : ce qui est publié est figé dans `dist/` jusqu'au prochain build. Une fixture conforme vit dans `src/data/claudy.fixture.json` ; les loaders la valident avec Zod (`src/lib/claudy.ts`).

## Pourquoi un contrat

Le site doit rester publiable quel que soit l'état d'avancement de Claudy. Claudy possède aujourd'hui les modèles `Event` (événements) et `Experience` (activités), mais pas encore d'API publique ni de flux de publication. Le site est donc construit contre ce contrat et une fixture ; le jour où Claudy expose les endpoints, il suffit de renseigner `CLAUDY_PUBLIC_API_URL` au build.

## Variables d'environnement (build)

| Variable | Rôle | Défaut |
|---|---|---|
| `CLAUDY_PUBLIC_API_URL` | Base des endpoints publics, ex. `https://app.les4sources.be/api/public/v1` | absent → repli sur la fixture et le contenu migré, journalisé |
| `CLAUDY_FIXTURE` | Fixture locale à utiliser à la place de l'API (tests) — `1` pour la fixture du dépôt, ou un chemin. **Non définie = pas de fixture** : le site se rabat sur le contenu migré, ce qui évite qu'un build ordinaire publie les fiches de démonstration. | *(non définie)* |

## Endpoints (lecture seule, sans authentification)

Tous répondent en `application/json; charset=utf-8`, avec `Cache-Control: public, max-age=300` et un `ETag`. Aucune donnée personnelle. Pagination inutile (quelques centaines d'entrées au plus) : tout est renvoyé d'un bloc.

### `GET /api/public/v1/events`

Paramètres optionnels : `from=YYYY-MM-DD` (défaut : aujourd'hui − 365 j, pour garder les fiches passées), `to=YYYY-MM-DD`.

```json
{
  "generated_at": "2026-09-07T21:00:00Z",
  "events": [
    {
      "id": 812,
      "slug": "pizza-party-septembre-2026",
      "title": "Pizza party de septembre",
      "summary": "Le four à bois est chaud, la terrasse est ouverte, amenez vos ami·es.",
      "description_html": "<p>…</p>",
      "starts_at": "2026-09-12T17:30:00+02:00",
      "ends_at": "2026-09-12T22:00:00+02:00",
      "all_day": false,
      "category": { "slug": "convivialite", "name": "Convivialité", "color": "#C97B3D", "pole": "convivialite" },
      "location": "Les 4 Sources, Yvoir",
      "price_text": "Pizzas à prix libre, boissons au bar",
      "registration_url": "https://…",
      "image": { "url": "https://app.les4sources.be/rails/active_storage/…/pizza.jpg", "alt": "Pizzas sortant du four à bois", "width": 2000, "height": 1333 },
      "published_at": "2026-09-01T10:00:00+02:00",
      "updated_at": "2026-09-05T08:12:00+02:00",
      "path": "/evenements/pizza-party-septembre-2026"
    }
  ]
}
```

Règles :

- **Seuls les événements publiés** (`published_at` non nul, non supprimés) sont renvoyés.
- `slug` est **immuable après publication** ; il est généré depuis le titre + mois/année (`pizza-party-septembre-2026`) et dédoublonné avec un suffixe `-2`, `-3`. Le site le prend tel quel ; `path` est toujours `/evenements/<slug>`.
- `summary` (≤ 200 caractères, texte brut) sert aux cartes, à la meta description et à l'agenda. `description_html` est du HTML assaini (ActionText) rendu tel quel dans la fiche.
- `category.pole` vaut un des sept pôles de la charte : `hebergement`, `convivialite`, `nature`, `artisanat`, `ressourcement`, `vie-collective`, `production`. Le site en tire la couleur et le picto.
- `image` est optionnelle ; si absente, le site utilise le visuel de la catégorie/pôle. Le site **télécharge et optimise l'image au build** (aucun hotlink au runtime), l'URL doit donc être stable et publique pendant le build.
- `all_day: true` → `starts_at`/`ends_at` à minuit heure locale, affichage sans heures.

### `GET /api/public/v1/experiences`

```json
{
  "generated_at": "2026-09-07T21:00:00Z",
  "experiences": [
    {
      "id": 41,
      "slug": "grimpe-encadree-dans-les-arbres",
      "name": "Grimpe encadrée dans les arbres",
      "summary": "Une initiation à la grimpe d'arbre, encadrée, dès 8 ans.",
      "description_html": "<p>…</p>",
      "duration_text": "2 h",
      "duration_minutes": 120,
      "price": { "amount_cents": 2500, "currency": "EUR", "per": "participant" },
      "fixed_price": { "amount_cents": 0, "currency": "EUR" },
      "min_participants": 4,
      "max_participants": 12,
      "carrier": { "name": "Romain" },
      "category": { "slug": "nature", "name": "Nature", "color": "#7A9A7A", "pole": "nature" },
      "image": { "url": "https://…", "alt": "…", "width": 1600, "height": 1067 },
      "availabilities": [
        { "date": "2026-09-20", "starts_at": "14:00", "ends_at": "16:00", "spots_left": 5 }
      ],
      "booking_url": "https://app.les4sources.be/reservation",
      "published_at": "2026-06-01T09:00:00+02:00",
      "updated_at": "2026-09-02T18:40:00+02:00",
      "path": "/catalogue/grimpe-encadree-dans-les-arbres"
    }
  ]
}
```

Règles :

- Seules les activités publiées sont renvoyées ; `slug` immuable après publication ; `path` = `/catalogue/<slug>`.
- `price.per` vaut `participant` ou `group` ; `fixed_price` est le forfait éventuel (0 = pas de forfait). Le site affiche « X € / personne » ou « forfait Y € » selon les valeurs.
- `availabilities` ne contient que les dates à venir (≤ 6 mois) ; vide = « sur demande ».

### `GET /api/public/v1/event_categories`

```json
{ "categories": [ { "slug": "convivialite", "name": "Convivialité", "color": "#C97B3D", "pole": "convivialite" } ] }
```

## Fusion avec le contenu migré (côté site)

Le site conserve les fiches événements et activités migrées depuis l'ancien site (collection `evenements` et `catalogue`, Markdown) pour garantir que les 209 URLs répondent. Au build :

1. Le loader lit Claudy (ou la fixture si `CLAUDY_PUBLIC_API_URL` est absent).
2. Une entrée Claudy dont le `slug` existe aussi dans le contenu migré **remplace** l'entrée migrée (Claudy fait foi).
3. Les entrées migrées sans homologue Claudy restent servies (archives, URLs préservées).
4. Le build imprime une ligne de synthèse : `claudy: source=<api|fixture|none> events=<n> experiences=<n> merged=<n> legacy_only=<n>`.
5. Toute réponse invalide (Zod) est journalisée et ignorée : le build **ne casse jamais** à cause de Claudy.

## Sémantique de publication (côté Claudy, à construire)

- `Event` et `Experience` gagnent `published_at` (datetime, nul = brouillon), `slug` (string, unique, figé à la première publication), `summary` (string ≤ 200), `public_description` (ActionText, distinct des `notes` internes), `location` (string), `image` (ActiveStorage `has_one_attached`).
- `EventCategory` gagne `slug` et `pole` (enum des sept pôles).
- Action **« Dupliquer »** sur un événement : copie titre, résumé, description publique, catégorie, lieu, prix, lien d'inscription, image ; **ne copie pas** les dates ni `published_at` ni `slug`. La copie s'ouvre en édition avec les dates vides.
- Le formulaire d'édition affiche un aperçu de l'URL publique (`/evenements/<slug>`) et un bouton « Publier / Dépublier ».

## Déclencheur de rebuild

À chaque `after_commit` sur un `Event` ou une `Experience` dont `published_at` ou le contenu public change, Claudy enfile un job `WebsiteRebuildJob` qui, avec un délai de regroupement de 2 minutes, appelle `POST ENV["WEBSITE_REBUILD_WEBHOOK_URL"]` (webhook Coolify de l'application, ou `repository_dispatch` GitHub selon l'hébergement retenu). Le site se reconstruit et republie ; latence visée ≤ 5 minutes.

## Vérification du contrat

- Côté site : `bun run claudy:check` valide `src/data/claudy.fixture.json` et, si `CLAUDY_PUBLIC_API_URL` est défini, la réponse réelle, avec le même schéma Zod que le build.
- Côté Claudy : une request spec par endpoint vérifie le schéma (clés, types, absence de PII, en-têtes de cache) et qu'un événement non publié n'apparaît pas.
