/**
 * Accessibilité du Markdown migré (ISC-18) :
 *  - ordre des titres : le premier titre du corps devient un `h2` (le `h1` vit
 *    dans le gabarit) et aucun saut de niveau n'est laissé (h2 → h4 devient h2 → h3),
 *    parce que Notion servait ses « chapeaux » en `####` ;
 *  - tout `<iframe>` sans `title` en reçoit un (les widgets météo/billetterie
 *    hérités du site actuel n'en ont pas).
 */
import type { Root } from "hast";

interface Node {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

function walk(node: Node, fn: (n: Node) => void): void {
  fn(node);
  for (const child of node.children ?? []) walk(child, fn);
}

export default function rehypeA11y() {
  return (tree: Root) => {
    const headings: Node[] = [];
    walk(tree as unknown as Node, (node) => {
      if (node.type !== "element" || !node.tagName) return;
      if (/^h[1-6]$/.test(node.tagName)) headings.push(node);
      if (node.tagName === "iframe") {
        const props = (node.properties ??= {});
        if (!props.title) props.title = "Contenu intégré";
      }
    });

    let previous = 1;
    for (const heading of headings) {
      const original = Number(heading.tagName![1]);
      let level = Math.max(2, original);
      if (level > previous + 1) level = previous + 1;
      heading.tagName = `h${level}`;
      previous = level;
    }
  };
}
