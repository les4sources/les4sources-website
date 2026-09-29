/**
 * Une photo déjà montrée en tête de page (`cover`, ou `photo` du portrait en
 * arche des fiches du collectif) n'est pas répétée dans le corps : la migration
 * a souvent gardé l'image de couverture Notion comme premier bloc du texte.
 * Le fichier Markdown reste intact ; seul le rendu la saute.
 */
import type { Root } from "mdast";

interface Node {
  type: string;
  url?: string;
  children?: Node[];
}

interface VFileLike {
  data: { astro?: { frontmatter?: Record<string, unknown> } };
}

const norm = (p: string) => p.trim().replace(/^\.\//, "");

export default function remarkDropCover() {
  return (tree: Root, file: VFileLike) => {
    const fm = file.data.astro?.frontmatter ?? {};
    const shown = [fm.cover, fm.photo].filter((v): v is string => typeof v === "string").map(norm);
    if (shown.length === 0) return;

    const prune = (parent: Node): void => {
      if (!parent.children) return;
      parent.children = parent.children.filter((child) => {
        if (child.type === "image" && child.url && shown.includes(norm(child.url))) return false;
        prune(child);
        // Un paragraphe qui ne contenait que cette image disparaît avec elle.
        return !(child.type === "paragraph" && child.children?.length === 0);
      });
    };
    prune(tree as unknown as Node);
  };
}
