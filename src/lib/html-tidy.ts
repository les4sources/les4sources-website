/**
 * Retouches du HTML final d'une page (src/middleware.ts), là où seul le rendu
 * sait ce qui s'affiche réellement.
 */

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&[#\w]+;/g, " ")
    .replace(/[\s  ]+/g, " ")
    .replace(/[\s.…!?:;]+$/, "")
    .trim()
    .toLowerCase();

/**
 * Le chapeau d'une page (`data-l4s-lead`, posé par PageHero) reprend souvent
 * mot pour mot le premier paragraphe du texte migré : la page dit alors deux
 * fois la même chose, l'une sous l'autre. Quand le premier paragraphe du corps
 * (`.prose-4s`) est identique au chapeau affiché, il est retiré — le chapeau
 * le porte déjà, rien ne se perd.
 */
export function dedupeLead(html: string): string {
  const lead = html.match(/<p[^>]*data-l4s-lead[^>]*>([\s\S]*?)<\/p>/);
  if (!lead) return html;
  const leadText = plain(lead[1]!);
  if (leadText.length < 20) return html;

  const proseAt = html.search(/<div[^>]*class="[^"]*\bprose-4s\b/);
  if (proseAt < 0) return html;
  const openEnd = html.indexOf(">", proseAt) + 1;
  const first = /<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g;
  first.lastIndex = openEnd;
  const m = first.exec(html);
  if (!m) return html;
  // Le paragraphe doit ouvrir le texte : rien de lisible avant lui.
  if (plain(html.slice(openEnd, m.index)) !== "") return html;
  if (plain(m[1]!) !== leadText) return html;
  return html.slice(0, m.index) + html.slice(m.index + m[0].length);
}
