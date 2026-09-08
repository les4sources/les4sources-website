/**
 * `<!-- columns -->` → une vraie grille responsive.
 *
 * Le contenu migré porte des marqueurs en commentaires HTML, hérités de Notion :
 *
 *     <!-- columns -->
 *     <!-- column width="50%" -->
 *     …markdown…
 *     <!-- column width="50%" -->
 *     …markdown…
 *     <!-- /columns -->
 *
 * Ce greffon les remplace par `div.columns > div.column`, la largeur déclarée
 * devenant une `flex-basis` en ligne (`--col-w`) appliquée à partir de 768 px —
 * en dessous, les colonnes s'empilent. Cf. `src/components/ui/Prose.astro`.
 *
 * Règles de sûreté :
 *  - un marqueur inconnu ou un commentaire ordinaire n'est jamais touché ;
 *  - un `/columns` orphelin est simplement retiré (c'était un commentaire, donc
 *    invisible : rien ne change à l'écran) ;
 *  - un `columns` jamais refermé enveloppe le reste du bloc — aucun contenu
 *    n'est perdu dans aucun des cas, ce que vérifie `scripts/verify/parity.ts`.
 */
import type { Element, Root, RootContent } from "hast";

type Marker =
  | { kind: "open" }
  | { kind: "column"; width?: string }
  | { kind: "close" };

interface MarkerItem {
  marker: Marker;
}

const isMarkerItem = (item: unknown): item is MarkerItem =>
  typeof item === "object" && item !== null && "marker" in item;

/** Largeur acceptée telle quelle : uniquement un pourcentage ou des pixels. */
function sanitizeWidth(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  return /^\d+(\.\d+)?(%|px|rem|fr)$/.test(value) ? value : undefined;
}

/**
 * Lit un nœud brut (commentaire HTML) et rend la liste des marqueurs qu'il
 * contient — ou `null` si ce n'est pas EXCLUSIVEMENT des marqueurs de colonnes.
 */
function parseMarkers(value: string): Marker[] | null {
  const source = value.trim();
  if (!source.startsWith("<!--")) return null;

  const found: Marker[] = [];
  const re = /<!--([\s\S]*?)-->/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(source)) !== null) {
    // Du texte entre deux commentaires : ce bloc n'est pas qu'un marqueur.
    if (source.slice(cursor, match.index).trim() !== "") return null;
    const body = match[1].trim();

    if (body === "columns") found.push({ kind: "open" });
    else if (body === "/columns" || body === "/ columns") found.push({ kind: "close" });
    else if (/^column\b/.test(body)) {
      const width = /width\s*=\s*"([^"]*)"/.exec(body)?.[1];
      found.push({ kind: "column", width: sanitizeWidth(width) });
    } else return null; // commentaire ordinaire : on n'y touche pas.

    cursor = match.index + match[0].length;
  }

  if (source.slice(cursor).trim() !== "") return null;
  return found.length > 0 ? found : null;
}

/** Marqueurs portés par un nœud brut ou un commentaire. */
function markersOfNode(node: RootContent): Marker[] | null {
  if (node.type === "raw") return parseMarkers(node.value);
  if (node.type === "comment") return parseMarkers(`<!--${node.value}-->`);
  return null;
}

/**
 * Aplatit les marqueurs : un `<!-- /columns -->` collé à une image se retrouve
 * DANS le paragraphe. On l'en sort avant de regrouper.
 */
function flatten(children: RootContent[]): (RootContent | MarkerItem)[] {
  const flat: (RootContent | MarkerItem)[] = [];

  for (const node of children) {
    const own = markersOfNode(node);
    if (own) {
      for (const marker of own) flat.push({ marker });
      continue;
    }

    if (node.type === "element" && Array.isArray(node.children) && node.children.length > 0) {
      const before: Marker[] = [];
      const after: Marker[] = [];
      const kept: Element["children"] = [];

      for (const child of node.children) {
        const inner = markersOfNode(child as RootContent);
        if (inner) {
          for (const marker of inner) (kept.length === 0 ? before : after).push(marker);
          continue;
        }
        kept.push(child);
      }

      if (before.length > 0 || after.length > 0) {
        for (const marker of before) flat.push({ marker });
        // Un paragraphe qui ne contenait que des marqueurs (et des blancs) disparaît.
        const meaningful = kept.some(
          (c) => c.type !== "text" || c.value.trim() !== "",
        );
        if (meaningful) flat.push({ ...node, children: kept } as RootContent);
        for (const marker of after) flat.push({ marker });
        continue;
      }
    }

    flat.push(node);
  }

  return flat;
}

function columnElement(width: string | undefined, children: RootContent[]): Element {
  return {
    type: "element",
    tagName: "div",
    properties: {
      className: ["column"],
      ...(width ? { style: `--col-w:${width}` } : {}),
    },
    children: children as Element["children"],
  };
}

export default function rehypeColumns() {
  return (tree: Root): void => {
    const flat = flatten(tree.children);
    // Aucun marqueur : l'arbre est rendu tel quel, sans allocation inutile.
    if (!flat.some((item) => isMarkerItem(item))) return;

    const out: RootContent[] = [];
    let i = 0;

    while (i < flat.length) {
      const item = flat[i];

      if (!isMarkerItem(item)) {
        out.push(item);
        i += 1;
        continue;
      }

      if (item.marker.kind !== "open") {
        // `column` ou `/columns` orphelin : le marqueur était invisible, il le reste.
        i += 1;
        continue;
      }

      i += 1;
      const columns: { width?: string; children: RootContent[] }[] = [];
      let current: { width?: string; children: RootContent[] } | null = null;

      while (i < flat.length) {
        const inner = flat[i];
        if (isMarkerItem(inner)) {
          if (inner.marker.kind === "close") {
            i += 1;
            break;
          }
          if (inner.marker.kind === "column") {
            current = { width: inner.marker.width, children: [] };
            columns.push(current);
            i += 1;
            continue;
          }
          i += 1; // `columns` imbriqué : ignoré, le contenu reste dans la colonne courante.
          continue;
        }
        if (!current) {
          current = { children: [] };
          columns.push(current);
        }
        current.children.push(inner);
        i += 1;
      }

      const filled = columns.filter((c) => c.children.length > 0);
      if (filled.length === 0) continue;
      if (filled.length === 1) {
        // Une seule colonne : pas la peine d'une grille, le contenu suffit.
        out.push(...filled[0].children);
        continue;
      }

      out.push({
        type: "element",
        tagName: "div",
        properties: { className: ["columns"] },
        children: filled.map((c) => columnElement(c.width, c.children)),
      } as RootContent);
    }

    tree.children = out;
  };
}
