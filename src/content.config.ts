import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Modèle de contenu. Une collection par section du site actuel ; l'id d'une
 * entrée est son chemin de fichier, donc les chemins imbriqués fonctionnent
 * (ex. `hebergements/la-hulotte-gite-16-personnes/chambre-mlisse.md`).
 *
 * Le champ pivot est `legacyPath` : le chemin EXACT de l'URL actuelle. C'est lui
 * qui produit la route, jamais le nom de fichier — ainsi la migration peut
 * organiser les fichiers comme elle veut sans jamais casser une URL.
 */

const POLES = [
  "hebergement",
  "convivialite",
  "nature",
  "artisanat",
  "ressourcement",
  "vie-collective",
  "production",
] as const;

/** Embed fonctionnel préservé depuis le site actuel (iframe Claudy, Tally, carte, vidéo). */
const embed = z.object({
  kind: z.string(),
  src: z.string(),
  title: z.string().optional(),
});

/** Champs communs à toutes les collections. */
const sharedFields = {
  title: z.string(),
  /** <title> alternatif quand le titre d'affichage dépasse 60 caractères. */
  seoTitle: z.string().optional(),
  description: z.string(),
  /** URL absolue ou /-rooted ; à défaut, l'image OG par défaut du site. */
  ogImage: z.string().optional(),
  noindex: z.boolean().default(false),
  draft: z.boolean().default(false),
  /** Page conservée (URL préservée) mais retirée des listings. */
  archived: z.boolean().default(false),
  /** OBLIGATOIRE — chemin exact de l'URL d'origine, ex. "/sejours/tarifs". */
  legacyPath: z.string(),
  coverAlt: z.string().optional(),
  /** Émoji éventuel repris du site actuel. */
  icon: z.string().optional(),
  /** Paires clé/valeur libres extraites des propriétés Notion. */
  properties: z.record(z.string(), z.string()).default({}),
  order: z.number().default(0),
  pole: z.enum(POLES).optional(),
  embeds: z.array(embed).default([]),
};

/** 1. Pages éditoriales (accueil, à propos, séjours hors hébergement, bar, coworking…). */
const pages = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/pages" }),
  schema: ({ image }) => z.object({ ...sharedFields, cover: image().optional() }),
});

/** 2. Événements — fusionnés au build avec les événements publiés dans Claudy. */
const evenements = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/evenements" }),
  schema: ({ image }) =>
    z.object({
      ...sharedFields,
      cover: image().optional(),
      start: z.coerce.date().optional(),
      end: z.coerce.date().optional(),
      location: z.string().optional(),
      registrationUrl: z.string().optional(),
      priceText: z.string().optional(),
      category: z.string().optional(),
    }),
});

/** 3. Catalogue d'activités — fusionné au build avec les `Experience` de Claudy. */
const catalogue = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/catalogue" }),
  schema: ({ image }) =>
    z.object({
      ...sharedFields,
      cover: image().optional(),
      priceText: z.string().optional(),
      duration: z.string().optional(),
      minParticipants: z.number().optional(),
      maxParticipants: z.number().optional(),
    }),
});

/** 4. Le collectif (fiches des membres). */
const collectif = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/collectif" }),
  schema: ({ image }) =>
    z.object({
      ...sharedFields,
      cover: image().optional(),
      name: z.string(),
      role: z.string().optional(),
      photo: image().optional(),
    }),
});

/** 5. Les projets du lieu (Semisto, Claudy, la ferronnerie…). */
const projets = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projets" }),
  schema: ({ image }) => z.object({ ...sharedFields, cover: image().optional() }),
});

/** 6. Hébergements — arborescence imbriquée sous /sejours/hebergements-yvoir/... */
const hebergements = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/hebergements" }),
  schema: ({ image }) =>
    z.object({
      ...sharedFields,
      cover: image().optional(),
      capacity: z.number().optional(),
      gallery: z.array(image()).default([]),
    }),
});

export const collections = { pages, evenements, catalogue, collectif, projets, hebergements };
