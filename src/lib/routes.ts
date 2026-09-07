/**
 * Routes réservées par des fichiers de page dédiés.
 *
 * La route attrape-tout `src/pages/[...slug].astro` sert la collection `pages`.
 * Elle doit exclure tout chemin déjà produit par une autre route, sinon Astro
 * génère deux fois la même URL. Cette liste est l'unique endroit où cette
 * exclusion est décrite — index et attrape-tout la lisent tous les deux.
 */

/** Chemins exacts servis par un fichier dédié. */
const EXACT = new Set(["/", "/agenda", "/evenements", "/catalogue", "/collectif", "/projets", "/404"]);

/** Préfixes servis par une route dynamique dédiée. */
const PREFIXES = [
  "/evenements/",
  "/catalogue/",
  "/collectif/",
  "/projets/",
  "/sejours/hebergements-yvoir/",
];

export function isReservedPath(path: string): boolean {
  const clean = path.replace(/\/+$/, "") || "/";
  return EXACT.has(clean) || PREFIXES.some((p) => clean.startsWith(p));
}
