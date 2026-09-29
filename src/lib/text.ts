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
  return spaceAfterLeadingEmoji(emojiFirst(base.replace(/\s+/g, " ").trim()));
}

const TRAILING_EMOJI = new RegExp(`\\s*(${PICTO}+)$`, "u");
const HAS_LEADING_EMOJI = new RegExp(`^${PICTO}`, "u");

/**
 * « Initiation à la soudure à l'arc ⚡ » → « ⚡ Initiation à la soudure à l'arc » :
 * la charte place l'emoji d'un nom d'événement EN TÊTE (design/README.md).
 * Un titre qui en porte déjà un en tête garde sa fin intacte.
 */
export function emojiFirst(value: string): string {
  if (HAS_LEADING_EMOJI.test(value)) return value;
  const m = value.match(TRAILING_EMOJI);
  if (!m || m.index === undefined || m.index === 0) return value;
  return `${m[1]} ${value.slice(0, m.index).trim()}`;
}

const SITE_SUFFIX = /\s*—\s*Les 4 Sources, tiers-lieu à Yvoir\.?$/i;

/**
 * Ce qu'une description peut montrer comme accroche (carte, chapeau).
 *
 * Une description fabriquée pour le SEO (`generatedDescription`) ne s'affiche
 * jamais. La migration a aussi complété des descriptions trop courtes du
 * suffixe du site (« Atelier cuisine — Les 4 Sources, tiers-lieu à Yvoir ») :
 * le suffixe tombe, et ce qui reste ne s'affiche que s'il fait une vraie
 * phrase — pas un titre répété, pas une date criée en capitales.
 */
export function displayDescription(
  description: string | undefined,
  generated?: boolean,
): string | undefined {
  if (!description || generated) return undefined;
  // Une description coupée (« … ») est un extrait pour le référencement : un
  // chapeau qui s'arrête au milieu d'une phrase ne s'affiche pas.
  if (/(?:…|\.\.\.)\s*$/.test(description)) return undefined;
  if (!SITE_SUFFIX.test(description)) return description;
  const rest = description.replace(SITE_SUFFIX, "").trim();
  const shouting = rest === rest.toUpperCase() && /[A-Z]/.test(rest);
  if (rest.length < 25 || shouting || /^[→:\-]/.test(rest) || /:$/.test(rest)) return undefined;
  return rest;
}

/**
 * Description `<meta>` d'une fiche venue de Claudy : 50 à 160 caractères,
 * unique sur le site (seo:check).
 *
 * Deux réalités de l'édition dans Claudy : un résumé peut être court
 * (« Plonge au cœur de notre projet collectif ! »), et une série d'événements
 * dupliqués partage le même résumé d'une date à l'autre. D'où la précision
 * (la date d'un événement) ajoutée après le résumé, le suffixe du site pour un
 * texte trop court — comme l'a fait la migration — et une coupe propre au mot
 * quand c'est trop long. Aucun fait n'est ajouté qui ne soit déjà sur la fiche.
 */
export function seoDescription(text: string | undefined, precision?: string): string {
  const MAX = 160;
  const tail = precision ? ` — ${precision}` : "";
  let base = (text ?? "").replace(/\s+/g, " ").trim();
  if (base.length + tail.length > MAX) {
    const room = MAX - tail.length - 1;
    const cut = base.slice(0, room);
    base = `${cut.slice(0, Math.max(cut.lastIndexOf(" "), room - 20)).replace(/[\s,;:.!?—–-]+$/, "")}…`;
  }
  let out = `${base}${tail}`.replace(/^ — /, "");
  const suffix = " — Les 4 Sources, tiers-lieu à Yvoir";
  if (out.length < 50 && out.length + suffix.length <= MAX) out += suffix;
  return out;
}
