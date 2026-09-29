/**
 * Typographie française, appliquée au rendu (src/middleware.ts) à tout le
 * texte visible du site — contenu migré, textes de Claudy, gabarits.
 *
 * On ne change aucun mot : seulement les blancs et les signes qui les
 * entourent, selon l'usage français que la charte demande (design/README.md,
 * « Typographic French spacing ») :
 *  - espace fine insécable (U+202F) avant ; ! ? et à l'intérieur des « » ;
 *  - espace insécable (U+00A0) avant : ;
 *  - apostrophe typographique ’ entre deux lettres ;
 *  - guillemets droits ou anglais appariés → « » ;
 *  - un nombre ne quitte pas le mot qui le suit (« 25 personnes », « 4 Sources », « 5 € »).
 *
 * Les URL et adresses e-mail écrites en clair sont laissées intactes.
 */

const NBSP = " ";
const NNBSP = " ";

/** Un mot qui ressemble à une URL, un e-mail ou un chemin ne se touche pas. */
const LOOKS_TECHNICAL = /(?:\/\/|www\.|@|\.[a-z]{2,4}\/|^\/)/i;

function typesetWord(word: string): string {
  if (LOOKS_TECHNICAL.test(word)) return word;
  return (
    word
      // l'école, aujourd'hui, conf' (apostrophe finale d'une abréviation)
      .replace(/(\p{L})['ʼ](?=\p{L}|$)/gu, "$1’")
      // univers! → univers ! ; gestes)! → gestes) !
      .replace(/([\p{L}\p{N})»])([!?;])/gu, `$1${NNBSP}$2`)
      // « Tarif: » → « Tarif : » (jamais « 20:00 » ni « https: »)
      .replace(/(\p{L}):$/u, `$1${NBSP}:`)
      // 5€ → 5 €
      .replace(/(\d)€/g, `$1${NBSP}€`)
      // «Bonjour» → « Bonjour »
      .replace(/«(?=\S)/g, `«${NNBSP}`)
      .replace(/(?<=\S)»/g, `${NNBSP}»`)
  );
}

/** Typographie d'un fragment de texte brut (pas de HTML dedans). */
export function typesetText(text: string): string {
  if (!/\S/.test(text)) return text;

  // Les entités HTML (&amp; &nbsp; &#8217;…) sont mises de côté : leur « ; »
  // n'est pas de la ponctuation.
  const entities: string[] = [];
  let t = text.replace(/&#?\w+;/g, (e) => `\uE000${entities.push(e) - 1}\uE001`);

  // Guillemets anglais ou droits appariés dans le même fragment → « ».
  t = t
    .replace(/[“"]([^“”"\n]{1,200}?)[”"]/g, "«$1»")
    .replace(/‘([^‘’\n]{1,80}?)’/g, "«$1»");

  // Mot par mot, pour épargner URL et e-mails.
  t = t.replace(/[^\s]+/g, typesetWord);

  t = t
    // Espace (normale ou insécable) avant ; ! ? » → fine insécable.
    .replace(/[  ]+([;!?»])/g, `${NNBSP}$1`)
    // Après « → fine insécable.
    .replace(/«[  ]+/g, `«${NNBSP}`)
    // Espace avant : → insécable (pas devant « :// »).
    .replace(/[  ]+:(?!\/\/)/g, `${NBSP}:`)
    // Un nombre reste avec le mot, l'unité ou le symbole qui le suit.
    .replace(/(\d) (?=[\p{L}€%°])/gu, `$1${NBSP}`);

  return t.replace(/\uE000(\d+)\uE001/g, (_, i: string) => entities[Number(i)]!);
}

/** Dans un titre, un mot composé ne se coupe pas à son trait d'union (« tiers-/lieu »). */
const COMPOUND = /\p{L}{1,16}(?:-\p{L}{1,16})+/gu;
const HEADING = new Set(["h1", "h2", "h3", "h4"]);

/** Balises dont le contenu n'est pas du texte courant à typographier. */
const RAW = new Set(["script", "style", "pre", "code", "textarea", "kbd", "samp", "svg", "template"]);

/**
 * Parcourt le HTML d'un document et ne typographie que le texte visible du
 * `<body>` : les balises, leurs attributs et le contenu de RAW restent tels quels.
 */
export function typesetHtml(html: string): string {
  const bodyAt = html.search(/<body[\s>]/i);
  if (bodyAt < 0) return html;
  const head = html.slice(0, bodyAt);
  const parts = html.slice(bodyAt).split(/(<!--[\s\S]*?-->|<[^>]+>)/);

  let skip: string | null = null;
  let depth = 0;
  let heading = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.startsWith("<")) {
      const m = part.match(/^<(\/?)([a-zA-Z][\w-]*)/);
      if (!m) continue; // commentaire, doctype
      const closing = m[1] === "/";
      const name = m[2]!.toLowerCase();
      const selfClosing = part.endsWith("/>");
      if (HEADING.has(name)) heading = Math.max(0, heading + (closing ? -1 : 1));
      if (skip) {
        if (name === skip && !selfClosing) depth += closing ? -1 : 1;
        if (depth === 0) skip = null;
      } else if (!closing && !selfClosing && RAW.has(name)) {
        skip = name;
        depth = 1;
      }
      continue;
    }
    if (skip || part.trim() === "") continue;
    // Astro échappe ' et " en entités : on les remet en caractères le temps du traitement.
    const decoded = part.replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&quot;|&#34;|&#x22;/g, '"');
    const typeset = typesetText(decoded);
    parts[i] = heading > 0 ? typeset.replace(COMPOUND, (w) => `<span class="l4s-nobr">${w}</span>`) : typeset;
  }
  return head + parts.join("");
}
