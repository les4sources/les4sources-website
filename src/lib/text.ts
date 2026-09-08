/**
 * Nettoyages de chaînes pour ce qui s'affiche en carte ou en `<title>`.
 *
 * Les titres d'événements viennent de l'éditrice (Claudy ou Notion migré) et
 * portent des emoji et la mention « COMPLET ! ». Sur une carte, le badge et
 * l'emoji de tête suffisent ; dans un `<title>`, l'emoji ne sert à rien.
 */

const PICTO =
  "(?:\\p{Extended_Pictographic}|\\p{Emoji_Modifier}|\\u200d|\\ufe0f|\\u20e3|[\\u{1F1E6}-\\u{1F1FF}])";

const ANY_EMOJI = new RegExp(PICTO, "gu");
// L'emoji de tête doit être suivi d'un vrai caractère : ni une espace (déjà
// correct), ni un composant d'emoji (sélecteur de variante, modificateur).
const LEADING_EMOJI = new RegExp(`^(${PICTO}+)(?!\\s)(?!${PICTO})`, "u");

/** Retire tous les emoji, en refermant les espaces laissés. */
export function stripEmoji(value: string): string {
  return value.replace(ANY_EMOJI, " ").replace(/\s+/g, " ").trim();
}

/** « 🍕Pizza Party » → « 🍕 Pizza Party » : un espace suit toujours l'emoji de tête. */
export function spaceAfterLeadingEmoji(value: string): string {
  const m = value.match(LEADING_EMOJI);
  return m ? `${m[1]} ${value.slice(m[1].length)}` : value;
}

/**
 * Retire la mention « COMPLET ! » ou « (COMPLET) » — en capitales, telle que
 * l'éditrice l'écrit (design/README.md) — le badge de la carte la porte déjà.
 */
export function stripSoldOut(value: string): string {
  return value
    .replace(/\(?\bCOMPLET\b\)?\s*!?/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\s*[:\-–—·]\s*/, "")
    .trim();
}

/** Titre tel qu'une carte l'affiche : sans « COMPLET ! », emoji de tête espacé. */
export function cardTitle(value: string, soldOut: boolean): string {
  const base = soldOut ? stripSoldOut(value) : value;
  return spaceAfterLeadingEmoji(base.replace(/\s+/g, " ").trim());
}
