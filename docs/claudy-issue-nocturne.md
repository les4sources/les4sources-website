# Issue Claudy (brouillon) — API publique, publication et duplication des événements

> Brouillon complet prêt à être posé sur `les4sources/claudy` avec le label `agent:ready` (ou traité directement). Rédigé le 2026-09-07 à partir de `docs/CLAUDY.md`.

## Contexte / problème

Le nouveau site web des 4 Sources (repo `les4sources/les4sources-website`, Astro statique) doit afficher les événements et les activités **gérés dans Claudy** : l'éditrice du site crée ou duplique un événement dans Claudy, le publie, et le site le reprend au build. Aujourd'hui Claudy possède les modèles `Event` (`app/models/event.rb`) et `Experience` (`app/models/experience.rb`) mais :

- aucune API publique n'existe (seule l'API agent privée `api/v1`, bearer `AGENT_API_TOKEN`, sans routes événements/activités) ;
- aucun champ de publication (`published_at`, `slug`, résumé et description publics, lieu, image) ;
- aucune action « Dupliquer » sur un événement (elle existe pour les séjours : `Stays::DuplicateService`) ;
- aucun déclencheur de reconstruction du site.

Le contrat complet, écrit côté site, est la référence : `https://github.com/les4sources/les4sources-website/blob/build/astro-v1/docs/CLAUDY.md` (copie intégrale ci-dessous dans la section « Contrat »). L'ISA de Claudy prévoit déjà cette feature (`PublicApi`, namespace `api/public`, lecture seule, sans auth, cacheable — `ISA.md` lignes 55 et 363-371).

## Critères d'acceptation

### Modèle et publication
- [ ] `events` gagne `published_at:datetime` (nul = brouillon), `slug:string` (index unique), `summary:string` (≤ 200), `location:string`, `registration_url` reste `url` ; `Event` gagne `has_rich_text :public_description` (distinct des `notes` internes) et `has_one_attached :image`.
- [ ] `experiences` gagne `published_at:datetime`, `slug:string` (index unique) ; la photo publique reste `photo` (CarrierWave) exposée par une URL absolue stable.
- [ ] `event_categories` gagne `slug:string` (index unique) et `pole:string` (valeurs : `hebergement`, `convivialite`, `nature`, `artisanat`, `ressourcement`, `vie-collective`, `production`) ; `color` devient un hex `#RRGGBB` (migration de données : les noms Tailwind existants sont convertis, valeur par défaut `#0B3D3A`).
- [ ] Le `slug` d'un événement est généré à la première publication depuis le titre + mois/année en français (`pizza-party-septembre-2026`), dédoublonné par suffixe `-2`, `-3`, et **jamais modifié ensuite** (validation : immuable si `published_at` non nul).
- [ ] Le `slug` d'une activité est généré depuis son nom à la première publication, mêmes règles.
- [ ] Un événement ou une activité soft-deleted n'est jamais exposé.

### Admin
- [ ] Le formulaire d'un événement (`app/views/events/_form.html.slim`) propose : résumé public, description publique (ActionText), lieu, image, et un bouton « Publier » / « Dépublier » ; l'URL publique `/evenements/<slug>` est affichée quand l'événement est publié.
- [ ] Une action « Dupliquer » (bouton sur `events/show` et `events/edit`, route `post :duplicate, on: :member`) crée une copie **non publiée** avec titre, résumé, description publique, catégorie, lieu, lien d'inscription et image, **sans** dates ni slug, et redirige vers son formulaire d'édition.
- [ ] Le formulaire d'une activité propose « Publier » / « Dépublier » et affiche l'URL publique `/catalogue/<slug>`.
- [ ] L'index des événements affiche l'état (brouillon / publié) et permet de filtrer.

### API publique
- [ ] Namespace `namespace :api { namespace :public { namespace :v1 } }` monté en `/api/public/v1`, **sans authentification**, `GET` uniquement, `skip_forgery_protection`, `layout false`, format JSON forcé.
- [ ] `GET /api/public/v1/events?from=&to=` renvoie exactement la forme documentée dans le contrat (clés `generated_at`, `events[]` avec `id, slug, title, summary, description_html, starts_at, ends_at, all_day, category{slug,name,color,pole}, location, price_text, registration_url, image{url,alt,width,height}|null, published_at, updated_at, path`) ; seuls les événements publiés, non supprimés ; `from` par défaut = aujourd'hui − 365 jours.
- [ ] `GET /api/public/v1/experiences` renvoie la forme documentée (`experiences[]` avec `id, slug, name, summary, description_html, duration_text, duration_minutes, price{amount_cents,currency,per}, fixed_price{amount_cents,currency}, min_participants, max_participants, carrier{name}|null, category|null, image|null, availabilities[{date,starts_at,ends_at,spots_left}], booking_url, published_at, updated_at, path`) ; `availabilities` limité aux dates à venir ≤ 6 mois.
- [ ] `GET /api/public/v1/event_categories` renvoie `categories[]` avec `slug, name, color, pole`.
- [ ] Les trois réponses portent `Cache-Control: public, max-age=300` et un `ETag` ; aucune donnée personnelle (pas d'e-mail, pas de téléphone, pas de nom de participant ; le porteur d'activité n'expose que son prénom).
- [ ] `description_html` est le rendu ActionText assaini (`to_s` du rich text), sans balises `<script>`, avec les images ActionText en URLs absolues.
- [ ] `image.url` est une URL absolue stable (`rails_public_blob_url` / `url_for` avec `default_url_options` de prod) ; `width`/`height` proviennent des métadonnées ActiveStorage (`analyze`), `alt` = titre.

### Reconstruction du site
- [ ] `after_commit` sur `Event` et `Experience` (création, changement de `published_at` ou d'un champ public, destruction) enfile `WebsiteRebuildJob` ; le job attend 2 minutes de regroupement (un seul appel par fenêtre) puis fait `POST ENV["WEBSITE_REBUILD_WEBHOOK_URL"]` ; si la variable est absente, le job journalise et ne fait rien (pas d'erreur).
- [ ] Le webhook n'est jamais appelé depuis les specs ni en dev (garde sur `Rails.env.production?` ou variable explicite).

## Périmètre

**In :** migrations, modèles, validations, services de publication et de duplication, formulaires et boutons admin, namespace `api/public/v1` et ses trois endpoints, job de reconstruction, specs.

**Out :** billetterie ou inscription en ligne (reste `url` externe), récurrence automatique (la duplication suffit), gestion des organisateurs/frais (épic #245), tarifs porteurs (épic #244), déplacement de l'entrée « Événements » hors de Paramètres, toute modification du site web lui-même, toute écriture via l'API publique.

## Zones de code concernées

- `db/migrate/` (nouvelles migrations), `db/schema.rb`
- `app/models/event.rb`, `app/models/event_category.rb`, `app/models/experience.rb`, `app/models/experience_availability.rb`
- `app/services/events/create_service.rb`, `app/services/events/update_service.rb`, nouveaux `app/services/events/publish_service.rb`, `app/services/events/duplicate_service.rb` (modèle : `app/services/stays/duplicate_service.rb`), `app/services/experiences/publish_service.rb`
- `app/controllers/events_controller.rb`, `app/controllers/experiences_controller.rb`, `app/views/events/{_form,show,edit,index}.html.slim`, `app/views/experiences/_form.html.slim`
- `config/routes.rb` (nouveau namespace `api/public/v1` à côté de `api/v1`)
- nouveaux `app/controllers/api/public/v1/base_controller.rb`, `events_controller.rb`, `experiences_controller.rb`, `event_categories_controller.rb` et leurs jbuilder `app/views/api/public/v1/**` (modèle : `app/views/api/v1/spaces/_space.json.jbuilder`, partial money `api/v1/shared/money`)
- `app/jobs/website_rebuild_job.rb`
- `app/decorators/event_decorator.rb` (couleur hex au lieu de `bg-#{color}-300`)
- `config/locales/fr.yml` (libellés publier/dépublier/dupliquer)
- `config/initializers/content_security_policy.rb` (déjà `frame_ancestors` les4sources.be — vérifier qu'aucune règle ne bloque les images servies)

## Stratégie de test

- Request specs `spec/requests/api/public/v1/{events,experiences,event_categories}_spec.rb` : schéma exact (clés et types), en-têtes de cache, un événement non publié ou soft-deleted n'apparaît pas, `from`/`to` filtrent, aucune clé de PII, `description_html` sans `<script>`.
- Model specs : génération et immuabilité du slug (publié → tentative de changement rejetée), dédoublonnage `-2`, validation `pole`, conversion de couleur.
- Service specs : `DuplicateService` copie les bons champs et pas les dates/slug/`published_at` ; `PublishService` pose `published_at` et le slug une seule fois.
- Job spec : `WebsiteRebuildJob` regroupe (deux enfilements dans la fenêtre = un seul POST), n'appelle rien sans `WEBSITE_REBUILD_WEBHOOK_URL`.
- System/feature spec minimale : dupliquer un événement depuis l'admin ouvre le formulaire de la copie avec dates vides.
- `bundle exec rspec` vert ; `rails db:migrate` puis `rails db:rollback` propres.

## Definition of Done

- [ ] Toutes les cases ci-dessus cochées, specs vertes, migrations réversibles.
- [ ] `curl -s https://app.les4sources.be/api/public/v1/events | jq` (après déploiement) renvoie la forme du contrat — ou, avant déploiement, la request spec le prouve.
- [ ] Le script `bun run claudy:check` du repo `les4sources-website`, lancé avec `CLAUDY_PUBLIC_API_URL=http://localhost:3000/api/public/v1` contre l'instance de dev, passe (schéma Zod du site = contrat).
- [ ] Aucune donnée personnelle dans les réponses (revue manuelle d'un échantillon).
- [ ] PR ouverte vers `main` de `les4sources/claudy` avec un récapitulatif des endpoints et des champs ajoutés.
