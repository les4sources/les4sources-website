// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";

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

  image: {
    // Optimisation locale uniquement — aucun hotlink externe (ISC-8, ISC-13).
    domains: [],
    remotePatterns: [],
  },

  vite: {
    // Cast : bun installe deux copies identiques de vite (racine + astro/node_modules),
    // TypeScript les voit comme deux modules distincts et rejette le type du plugin.
    plugins: [/** @type {any} */ (tailwindcss())],
  },
});
