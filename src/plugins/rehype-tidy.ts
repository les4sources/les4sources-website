/**
 * Ménage du Markdown migré, au rendu — le contenu source reste tel quel :
 *
 *  - titres vides : un titre suivi aussitôt d'un titre de même niveau, ou qui
 *    termine le document, n'annonce plus rien (la base Notion ou le texte qu'il
 *    coiffait n'a pas survécu à la migration) — il est retiré. Un titre qui
 *    porte un lien est un appel à l'action : il reste ;
 *  - grilles tarifaires : Notion exportait un en-tête vide et mettait les vrais
 *    intitulés en première rangée du corps. Cette rangée devient l'en-tête, et
 *    les colonnes de montants sont marquées `is-num` (alignées à droite, chiffres
 *    tabulaires) — le texte, lui, reste aligné à gauche.
 */
import type { Root } from "hast";

interface Node {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

const isEl = (n: Node | undefined, tag?: string | RegExp): n is Node =>
  !!n &&
  n.type === "element" &&
  (tag === undefined || (typeof tag === "string" ? n.tagName === tag : tag.test(n.tagName ?? "")));

const text = (n: Node): string =>
  n.type === "text" ? (n.value ?? "") : (n.children ?? []).map(text).join("");

const contains = (n: Node, tag: string): boolean =>
  (n.children ?? []).some((c) => isEl(c, tag) || contains(c, tag));

const HEADING = /^h[1-6]$/;
const level = (n: Node) => Number(n.tagName![1]);

function dropEmptyHeadings(parent: Node): void {
  const kids = parent.children ?? [];
  for (const child of kids) if (child.children) dropEmptyHeadings(child);
  // Ce qui suit un titre : tout nœud porteur de contenu — élément, HTML brut
  // (iframe, formulaire : ce greffon passe avant rehype-raw), composant MDX,
  // texte non blanc. Seuls les blancs et les commentaires ne comptent pas.
  const elements = kids.filter(
    (k) => k.type !== "comment" && (k.type !== "text" || (k.value ?? "").trim() !== ""),
  );
  const drop = new Set<Node>();
  elements.forEach((el, i) => {
    if (!isEl(el, HEADING) || contains(el, "a")) return;
    const next = elements[i + 1];
    const empty = !next || (isEl(next, HEADING) && level(next) === level(el));
    if (empty) drop.add(el);
  });
  if (drop.size > 0) parent.children = kids.filter((k) => !drop.has(k));
}

const NUMERIC = /^[\s\d.,:/+\-–—€%hx()*]*\d[\s\d.,:/+\-–—€%hx()*]*(?:€|%|h|pers\.?|personnes?|\/\s*\w+)?[\s.]*$/i;
const isNumeric = (s: string) => s.trim() === "" || NUMERIC.test(s.trim());

function addClass(n: Node, name: string): void {
  const props = (n.properties ??= {});
  const current = props.className;
  const list = Array.isArray(current) ? current : current ? [String(current)] : [];
  props.className = [...list, name];
}

function tidyTable(table: Node): void {
  const thead = (table.children ?? []).find((c) => isEl(c, "thead"));
  const tbody = (table.children ?? []).find((c) => isEl(c, "tbody"));
  if (!tbody) return;
  const bodyRows = (tbody.children ?? []).filter((c) => isEl(c, "tr"));

  // En-tête vide + première rangée du corps → cette rangée devient l'en-tête.
  const headRow = thead?.children?.find((c) => isEl(c, "tr"));
  const headEmpty = !headRow || text(headRow).trim() === "";
  if (thead && headEmpty && bodyRows.length > 1) {
    const promoted = bodyRows[0]!;
    for (const cell of promoted.children ?? []) if (isEl(cell, "td")) cell.tagName = "th";
    thead.children = [promoted];
    tbody.children = (tbody.children ?? []).filter((c) => c !== promoted);
    bodyRows.shift();
  }

  // Colonnes dont toutes les cellules du corps sont des montants ou des nombres.
  const cells = (row: Node) => (row.children ?? []).filter((c) => isEl(c, /^t[dh]$/));
  const width = Math.max(0, ...bodyRows.map((r) => cells(r).length));
  const headCells = thead?.children?.find((c) => isEl(c, "tr"));
  for (let col = 1; col < width; col++) {
    const column = bodyRows.map((r) => cells(r)[col]).filter((c): c is Node => !!c);
    if (column.length === 0 || !column.every((c) => isNumeric(text(c)))) continue;
    if (column.every((c) => text(c).trim() === "")) continue;
    column.forEach((c) => addClass(c, "is-num"));
    const th = headCells ? cells(headCells)[col] : undefined;
    if (th) addClass(th, "is-num");
  }
}

function walk(node: Node, fn: (n: Node) => void): void {
  fn(node);
  for (const child of node.children ?? []) walk(child, fn);
}

export default function rehypeTidy() {
  return (tree: Root) => {
    const root = tree as unknown as Node;
    dropEmptyHeadings(root);
    walk(root, (n) => {
      if (isEl(n, "table")) tidyTable(n);
    });
  };
}
