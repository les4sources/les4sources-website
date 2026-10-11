// Service d'images : celui d'Astro (sharp), à une règle près.
//
// Sans `width` explicite, Astro remplit `src` avec la photo à sa taille
// d'origine (2000 à 2400 px, jusqu'à 2 Mo en WebP). Ahrefs la signalait comme
// « image trop lourde », et les robots la chargent même quand le navigateur
// choisit plus petit dans `srcset`. Deux cas :
//   - avec `widths` : `src` devient la plus grande des `widths` qui ne dépasse
//     pas SRC_MAX (à défaut, la plus petite), une variante déjà dans `srcset` ;
//   - sans `widths` (images du Markdown) : la photo est ramenée à SRC_MAX.
// Les attributs `width`/`height` suivent, à proportions identiques : la mise
// en page ne bouge pas.
import type { ImageTransform, LocalImageService } from "astro";
import sharp from "astro/assets/services/sharp";

const SRC_MAX = 1280;

function originalWidth(src: ImageTransform["src"]): number | undefined {
  return typeof src === "object" && "width" in src ? src.width : undefined;
}

const service: LocalImageService = {
  ...sharp,
  validateOptions(options, imageConfig) {
    const widths = [...(options.widths ?? [])].sort((a, b) => a - b);
    let target: number | undefined;
    if (widths.length > 0) {
      target = widths.filter((w) => w <= SRC_MAX).at(-1) ?? widths[0];
    } else if (!options.densities && options.width === originalWidth(options.src)) {
      target = SRC_MAX;
    }
    if (target && options.width && options.width > target) {
      if (options.height) options.height = Math.round((options.height * target) / options.width);
      options.width = target;
    }
    return sharp.validateOptions ? sharp.validateOptions(options, imageConfig) : options;
  },
};

export default service;
