/**
 * Normalisation des SVG inlinés (`?raw` + `set:html`).
 *
 * Les fichiers `*-current.svg` de `src/assets/brand/` sont déjà en
 * `fill="currentColor"` : la couleur vient donc de la classe `text-*` posée sur
 * l'élément parent, jamais d'un attribut en dur. On retire ici les dimensions
 * embarquées (la taille est une affaire de CSS) et on garantit que le SVG est
 * bien invisible pour les lecteurs d'écran et hors du parcours de tabulation.
 */

const OPENING_SVG = /<svg\b([^>]*)>/i;
const DROPPED_ATTRS = /\s+(width|height|class|aria-hidden|focusable|role|style)\s*=\s*"[^"]*"/gi;

export interface InlineSvgOptions {
  /** Classes posées sur la balise `<svg>` (taille, couleur héritée). */
  class?: string;
}

export function inlineSvg(raw: string, options: InlineSvgOptions = {}): string {
  const className = options.class?.trim();
  return raw.replace(OPENING_SVG, (_match, attrs: string) => {
    const kept = attrs.replace(DROPPED_ATTRS, "");
    const cls = className ? ` class="${className}"` : "";
    return `<svg${kept}${cls} aria-hidden="true" focusable="false">`;
  });
}
