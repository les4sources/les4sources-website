/**
 * Génère une image Open Graph (ratio 1.91:1) à partir d'une image locale, et
 * renvoie son URL absolue AVEC ses dimensions réelles — pour que les balises
 * og:image:width/height émises par SEO.astro soient toujours exactes.
 *
 * On ne dépasse jamais la largeur de la source (pas d'agrandissement flou) : la
 * cible est min(1200, largeur source), la hauteur suit le ratio 1200×630.
 */
import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";

export interface OgImage {
  url: string;
  width: number;
  height: number;
}

export async function ogImage(
  src: ImageMetadata | undefined,
  site: URL,
): Promise<OgImage | undefined> {
  if (!src) return undefined;
  // Plus grande boîte au ratio 1200×630 (1.905:1) que la source peut COUVRIR
  // sans agrandissement — la sortie fait donc exactement width×height et les
  // balises og:image:width/height ne mentent jamais.
  const width = Math.min(1200, src.width, Math.round((src.height * 1200) / 630));
  const height = Math.round((width * 630) / 1200);
  const img = await getImage({ src, width, height, fit: "cover", format: "jpeg" });
  return { url: new URL(img.src, site).href, width, height };
}
