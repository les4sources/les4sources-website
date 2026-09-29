// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";
import rehypeColumns from "./src/plugins/rehype-columns.ts";
import rehypeA11y from "./src/plugins/rehype-a11y.ts";
import rehypeYoutube from "./src/plugins/rehype-youtube.ts";
import rehypeTidy from "./src/plugins/rehype-tidy.ts";
import remarkDropCover from "./src/plugins/remark-drop-cover.ts";

// Origine canonique de production. Surcharge possible avec la variable SITE.
// Canonique = www (l'apex les4sources.be redirige en 301 vers www — cf deploy/nginx.conf).
const SITE = process.env.SITE ?? "https://www.les4sources.be";

// https://astro.build/config
export default defineConfig({
  site: SITE,
  output: "static",
  trailingSlash: "never",

  // PAS de bloc i18n : le site est monolingue FR et les URLs sont celles du site
  // actuel, sans préfixe de langue (/sejours/tarifs, pas /fr/sejours/tarifs).
  // Les URLs sont un contrat : cf. migration/urls.txt et le champ `legacyPath`.

  integrations: [
    // Aucun filtre : les 209 URLs du site actuel doivent toutes être dans le sitemap.
    // Les pages `noindex` sont exclues automatiquement par l'intégration.
    sitemap(),
    mdx(),
  ],

  markdown: {
    // Les marqueurs `<!-- columns -->` du contenu migré deviennent une grille.
    // Le greffon tourne avant `rehype-raw` : il voit encore les commentaires
    // comme des nœuds bruts, exactement ce dont il a besoin.
    // Les vidéos YouTube deviennent une vignette locale, l'iframe n'arrive qu'au clic.
    // Titres vides et grilles tarifaires migrées remis d'aplomb (src/plugins/rehype-tidy.ts).
    // La photo de couverture n'est pas répétée dans le corps (src/plugins/remark-drop-cover.ts).
    remarkPlugins: [remarkDropCover],
    rehypePlugins: [rehypeColumns, rehypeTidy, rehypeA11y, rehypeYoutube],
  },

  image: {
    // Aucun hotlink externe (ISC-8, ISC-13) : les seules images distantes sont
    // celles publiées dans Claudy, téléchargées et converties AU BUILD en
    // fichiers locaux (src/lib/remote-image.ts, contrat docs/CLAUDY.md).
    domains: ["app.les4sources.be"],
    remotePatterns: [],
  },

  vite: {
    // Cast : bun installe deux copies identiques de vite (racine + astro/node_modules),
    // TypeScript les voit comme deux modules distincts et rejette le type du plugin.
    plugins: [/** @type {any} */ (tailwindcss())],
  },
});
