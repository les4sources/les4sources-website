// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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

/**
 * Retire du sitemap les pages qui se déclarent `noindex` : un sitemap qui
 * propose une page que la page elle-même refuse d'indexer envoie deux signaux
 * contraires aux moteurs. Tourne après @astrojs/sitemap, sur dist/.
 * @returns {import("astro").AstroIntegration}
 */
function sitemapWithoutNoindex() {
  return {
    name: "l4s-sitemap-noindex",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const root = fileURLToPath(dir);
        const file = `${root}sitemap-0.xml`;
        const xml = await readFile(file, "utf8").catch(() => "");
        if (!xml) return;
        const entries = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
        let out = xml;
        for (const entry of entries) {
          const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
          if (!loc) continue;
          const path = new URL(loc).pathname.replace(/\/$/, "");
          const html = await readFile(`${root}${path.slice(1)}${path ? "/" : ""}index.html`, "utf8").catch(() => "");
          if (/<meta name="robots" content="[^"]*noindex/.test(html)) out = out.replace(entry, "");
        }
        await writeFile(file, out);
        // L'ancien site (Super) publiait son sitemap à /sitemap.xml, et la Search
        // Console le connaît sous cette adresse : on y sert l'index, sitemap valide.
        await copyFile(`${root}sitemap-index.xml`, `${root}sitemap.xml`).catch(() => {});
      },
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: SITE,
  output: "static",
  trailingSlash: "never",

  // PAS de bloc i18n : le site est monolingue FR et les URLs sont celles du site
  // actuel, sans préfixe de langue (/sejours/tarifs, pas /fr/sejours/tarifs).
  // Les URLs sont un contrat : cf. migration/urls.txt et le champ `legacyPath`.

  integrations: [
    // Toutes les URLs du site actuel sont dans le sitemap, sauf les pages
    // `noindex` (événements annulés, fiches retirées) : l'intégration ne les
    // exclut pas d'elle-même, c'est le rôle de l'étape suivante.
    sitemap(),
    sitemapWithoutNoindex(),
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
