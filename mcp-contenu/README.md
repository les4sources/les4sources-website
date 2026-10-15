# MCP « contenu » du site des 4 Sources

Un serveur MCP qui permet de mettre à jour les contenus du site **depuis Claude** (claude.ai, ajouté comme connecteur personnalisé), sans Git ni éditeur de code : modifier une page, en créer une, ajouter une image, corriger les textes des pages composées et les témoignages.

Il tourne sur un Worker Cloudflare (offre gratuite). Le quota Claude utilisé est celui de la personne qui écrit.

## Comment une modification part en ligne

```
Claude ──outil MCP──▶ Worker ──API GitHub──▶ branche `contenu`
                                                │
                       .github/workflows/publication-contenu.yml
                       intègre main · bun run verify (build complet)
                                                │
                          tout passe ? ──oui──▶ push sur `main` ──▶ Hatchbox déploie
                                     └──non──▶ reste sur `contenu`, raison lisible
                                               avec l'outil etat_publication
```

- Le Worker **n'écrit jamais sur `main`** : seulement sur `contenu`. Seul le workflow pousse sur `main`, et seulement après un `bun run verify` vert. Un contenu qui casserait le site n'est jamais publié.
- Avant même d'écrire, le Worker refuse ce qu'il sait que le build refuserait : titre trop long, description hors 50–160 caractères, titre ou description en double, `legacyPath` modifié ou déjà pris, image sans description ou hébergée ailleurs, « lorem ipsum ». Sur une page existante, seuls les défauts **ajoutés** bloquent.
- Fichiers modifiables : `src/content/**/*.md(x)`, `src/data/temoignages.yaml`, et le texte des quatre pages composées (`index.astro`, `agenda.astro`, `sejours/index.astro`, `le-bar-des-4-sources.astro`, par remplacement exact et sans toucher aux balises). Images : `src/assets/images/contenu/`. Rien d'autre.
- Chaque commit est signé du nom de l'éditeur (la clé du secret `EDITEURS`) et du résumé de la modification.

## Outils

| Outil | Rôle |
|---|---|
| `regles_du_site` | Où vit chaque texte, les champs d'en-tête, un exemple de page |
| `lister_pages` | Pages par section et/ou mot-clé |
| `lire_page` | Fichier source d'une page, par adresse ou par chemin |
| `remplacer_texte` | Remplace un passage exact (petites corrections, pages composées, témoignages) |
| `modifier_page` | Réécrit une page Markdown complète |
| `creer_page` | Crée une page dans une section |
| `ajouter_image` | Copie une image (lien https direct, JPEG/PNG/WebP, 10 Mo max) dans le site |
| `etat_publication` | En vérification, en ligne, ou refusé (avec la raison) |
| `abandonner_modifications` | Jette ce qui n'est pas encore en ligne |

## Mise en service (une fois)

Tout se fait depuis ce dossier, avec bun.

1. **Installer et se connecter à Cloudflare** (compte gratuit) :
   ```bash
   cd mcp-contenu
   bun install
   bunx wrangler login
   ```
2. **Créer le stockage des jetons** :
   ```bash
   bunx wrangler kv namespace create OAUTH_KV
   ```
   Recopier l'`id` affiché dans `wrangler.jsonc`, à la place de `A_REMPLACER_PAR_L_ID_DU_NAMESPACE`, et commiter.
3. **Créer le token GitHub** : GitHub → Settings → Developer settings → Fine-grained tokens → *Generate new token*.
   - Resource owner : `les4sources` ; Repository access : *Only select repositories* → `les4sources-website`.
   - Permissions du dépôt : **Contents : Read and write**, **Actions : Read-only** (Metadata suit seul).
   - Expiration : la plus longue possible, et un rappel pour le renouveler.
   - Si l'organisation refuse les tokens à grain fin : Organisation `les4sources` → Settings → Personal access tokens → les autoriser.
   ```bash
   bunx wrangler secret put GITHUB_TOKEN
   ```
4. **Créer le mot de passe de l'éditrice** (12 caractères minimum) :
   ```bash
   openssl rand -base64 18
   bunx wrangler secret put EDITEURS
   # coller : {"E":"<le mot de passe>"}
   ```
   Un mot de passe par personne : `{"E":"…","Michael":"…"}`. Le nom est celui qui signe les commits. Retirer une personne de ce secret lui coupe l'accès immédiatement.
5. **Déployer** :
   ```bash
   bunx wrangler deploy
   ```
   Wrangler affiche l'adresse, du type `https://les4sources-mcp-contenu.<sous-domaine>.workers.dev`.
6. **Ajouter le connecteur dans Claude** (sur le compte de l'éditrice) : claude.ai → Paramètres → Connecteurs → *Ajouter un connecteur personnalisé* → nom « Site des 4 Sources », URL `https://…workers.dev/mcp` → *Se connecter* → saisir le mot de passe → *Autoriser*.
7. **Essayer** : « Liste les pages du site qui parlent de coworking », puis une petite correction, puis « Où en est la publication ? ».

La branche `main` ne doit pas être protégée contre les pushes de GitHub Actions (elle ne l'est pas aujourd'hui) : c'est le workflow qui y publie.

## Développement

```bash
bun test          # validations + serveur MCP contre un faux GitHub
bun run check     # TypeScript
bun run dev       # wrangler dev, avec un .dev.vars (GITHUB_TOKEN, EDITEURS) non commité
```

Le Worker gratuit a droit à 10 ms de CPU par requête ; si les journaux Cloudflare montrent des dépassements (grosse image, par exemple), l'offre Workers Paid (5 $/mois) les lève.
