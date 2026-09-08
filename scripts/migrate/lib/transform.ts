/**
 * Transformations du Markdown extrait (`migration/pages/*.md`) vers le Markdown
 * que rendent les collections Astro.
 *
 * Principe directeur : ne RIEN retirer du texte. Chaque phrase de la source doit
 * survivre, c'est ce que mesure `scripts/verify/parity.ts`. On ne fait que
 * remplacer des marqueurs techniques (commentaires d'embed, listes de collection
 * Notion, chemins d'images) par du balisage que le site sait rendre.
 */

export interface EmbedRecord {
  kind: string;
  src: string;
  title?: string;
  rawHtml?: string;
}

export interface TransformOptions {
  /** Préfixe des images, relatif au fichier .md produit (ex. `../../assets/migration/`). */
  assetPrefix: string;
  /** `images/foo/bar.jpg` → chemin d'asset (extension possiblement changée). */
  resolveAsset: (localPath: string) => string;
  /** Alt de secours pour une image sans alt utile. */
  altFor: (localPath: string) => string;
  /** Embeds de la page, indexés par `src` (le JSON porte le `rawHtml`). */
  embeds: EmbedRecord[];
  /** Redirections des URLs mortes : `/ancienne` → `/cible`. */
  deadLinks: Record<string, string>;
  /** URL de fichier joint (PDF…) → chemin local servi par le site. */
  files: Record<string, string>;
  /** Id Notion (32 hex, sans tirets) → page du site. Sert aux liens `/<32-hex>`. */
  notionPages: Record<string, { path: string; title: string }>;
  /** Index de section : la grille vivante rend déjà ces titres, on jette la liste Notion. */
  dropCollections?: boolean;
}

export interface TransformResult {
  body: string;
  /** Vrai si un formulaire Tally a été inséré (le script Tally va avec). */
  usesTally: boolean;
  /** Chemins locaux des images effectivement référencées dans le corps. */
  referencedImages: string[];
}

/** Retire le frontmatter YAML de tête produit par l'extracteur. */
export function stripFrontmatter(md: string): string {
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? md.slice(m[0].length) : md;
}

/* ──────────────────── 0. Bloc newsletter (bloc de site) ──────────────────── */

/**
 * « 🗞️ Pour être informé·e des prochains événements aux 4 Sources, inscris-toi à
 * notre newsletter mensuelle. » n'est PAS du contenu de page : c'est un bloc que
 * Super répétait en pied de presque toutes les pages. Le gabarit le rend
 * désormais une fois pour toutes (`NewsletterBand` dans BaseLayout), donc on le
 * retire des corps migrés — sinon la phrase apparaîtrait deux fois.
 */
export function stripNewsletterBlock(md: string): string {
  const kept = md.split("\n").filter((line) => {
    const text = line.replace(/^\s*(?:>\s*)*/, "").replace(/[*_`]+/g, "").trim();
    return !(/newsletter mensuelle/i.test(text) && /pour [êe]tre inform/i.test(text));
  });
  // Un `>` orphelin resterait si le bloc était le seul contenu de sa citation.
  return kept.filter((line, i) => !(/^\s*>\s*$/.test(line) && isBlankAround(kept, i))).join("\n");
}

function isBlankAround(lines: string[], i: number): boolean {
  const before = lines[i - 1]?.trim() ?? "";
  const after = lines[i + 1]?.trim() ?? "";
  return !before.startsWith(">") && !after.startsWith(">");
}

/* ───────────────── 0 bis. Liens Notion bruts (`/<32-hex>`) ───────────────── */

const NOTION_LINK = /\[([^\]]*)\]\(\/([0-9a-f]{32})\)/gi;

/**
 * Super laissait passer des liens vers l'id Notion brut (`/3c20d1493317…`).
 * Ils sont résolus vers le `legacyPath` de la page correspondante ; quand aucune
 * page ne porte cet id (carte de galerie supprimée), le lien disparaît et seul
 * son texte survit — un lien mort est pire qu'un lien absent.
 */
export function resolveNotionLinks(
  md: string,
  pages: Record<string, { path: string; title: string }>,
): string {
  const resolved = md.replace(NOTION_LINK, (_all, label: string, id: string) => {
    const hit = pages[id.toLowerCase()];
    if (!hit) return label;
    // Les cartes de galerie Notion n'ont pas de libellé : le titre de la cible en tient lieu.
    return `[${(label.trim() || hit.title).replace(/[[\]]/g, "")}](${hit.path})`;
  });
  // Un item de liste dont le lien était tout le contenu ne doit pas rester vide.
  return resolved
    .split("\n")
    .filter((line) => !/^\s*(?:>\s*)*[-*+]\s*$/.test(line))
    .join("\n");
}

/* ────────────────── 0 ter. Marqueurs de gras accolés ────────────────── */

/**
 * Turndown accole les runs de gras voisins (`**A****B**`), ce qui laisse quatre
 * astérisques littérales dans la page rendue. Les fusionner rend le gras unique
 * et fait disparaître le `****` visible.
 */
export function tidyEmphasis(md: string): string {
  return md.replace(/\*{4}/g, "");
}

/* ─────────────────────────── 7. Liens ─────────────────────────── */

const SITE_HOSTS = ["https://www.les4sources.be", "http://www.les4sources.be", "https://les4sources.be"];

/**
 * Liens absolus vers le site actuel → racine-relatifs, et URLs mortes → cible 301.
 * Opère sur les cibles Markdown `](url)` et sur les `href="url"` du HTML inline.
 */
export function rewriteLinks(md: string, deadLinks: Record<string, string>): string {
  const fix = (url: string): string => {
    let out = url;
    for (const host of SITE_HOSTS) {
      if (out.startsWith(host)) out = out.slice(host.length) || "/";
    }
    if (!out.startsWith("/")) return out;
    const [pathPart, tail] = splitPath(out);
    const target = deadLinks[pathPart.replace(/\/+$/, "") || "/"];
    return target ? target + tail : out;
  };

  return md
    .replace(/\]\(([^)\s]+)([^)]*)\)/g, (_all, url: string, rest: string) => `](${fix(url)}${rest})`)
    .replace(/href="([^"]+)"/g, (_all, url: string) => `href="${fix(url)}"`);
}

function splitPath(url: string): [string, string] {
  const i = url.search(/[?#]/);
  return i === -1 ? [url, ""] : [url.slice(0, i), url.slice(i)];
}

/* ────────────────────── 4. Collections Notion ────────────────────── */

const COLLECTION_OPEN = /^(>\s?)?<!--\s*collection(?:\s+"([^"]*)")?[^>]*-->\s*$/;
const COLLECTION_CLOSE = /^(>\s?)?<!--\s*\/collection\s*-->\s*$/;

/**
 * Les blocs de collection (galeries Notion) deviennent une liste Markdown simple.
 * Le titre de la collection est rappelé en gras, sauf s'il redit le titre juste
 * au-dessus (l'extracteur pose souvent la collection sous son propre H2).
 *
 * `drop` les supprime purement et simplement : sur un index de section, la
 * grille vivante rend déjà les mêmes titres, et la liste Notion les redirait
 * une seconde fois juste au-dessus. Partout ailleurs la liste est conservée —
 * c'est le seul chemin vers ces pages.
 */
export function convertCollections(md: string, drop = false): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const open = lines[i]!.match(COLLECTION_OPEN);
    if (!open) {
      out.push(lines[i]!);
      i++;
      continue;
    }

    const title = open[2];
    const items: string[] = [];
    i++;
    while (i < lines.length && !COLLECTION_CLOSE.test(lines[i]!)) {
      const stripped = lines[i]!.replace(/^>\s?/, "");
      if (stripped.trim() !== "") items.push(stripped);
      i++;
    }
    i++; // consomme la fermeture

    if (drop) {
      if (out.length && out[out.length - 1]!.trim() !== "") out.push("");
      continue;
    }

    const previous = [...out].reverse().find((l) => l.trim() !== "") ?? "";
    const alreadyTitled =
      !title || (/^#{1,6}\s/.test(previous) && normalise(previous).includes(normalise(title)));

    if (out.length && out[out.length - 1]!.trim() !== "") out.push("");
    if (!alreadyTitled) {
      out.push(`**${title}**`, "");
    }
    out.push(...items, "");
  }

  return out.join("\n");
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* ──────────────────────────── 3. Embeds ──────────────────────────── */

const EMBED_LINE = /^<!--\s*embed:([a-z]+)\s+src="([^"]+)"\s*-->\s*$/;

const YOUTUBE_WATCH = /^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]+)(.*)$/;
const YOUTUBE_SHORT = /^https?:\/\/youtu\.be\/([\w-]+)(.*)$/;
const TALLY_ANY = /tally\.so\/(?:embed|r)\/([\w-]+)/;

function iframeUrl(kind: string, src: string): string {
  const watch = src.match(YOUTUBE_WATCH) ?? src.match(YOUTUBE_SHORT);
  if (watch) return `https://www.youtube.com/embed/${watch[1]}${watch[2]?.replace(/^\?/, "?") ?? ""}`;
  if (kind === "tally") {
    const id = src.match(TALLY_ANY)?.[1];
    if (id)
      return `https://tally.so/embed/${id}?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1`;
  }
  return src;
}

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Remplace `<!-- embed:kind src="…" -->` (et le lien nu que l'extracteur a posé
 * juste dessous) par un balisage réel. Le `src` reste littéralement présent dans
 * la page : c'est ce que vérifie le script de parité.
 */
export function convertEmbeds(
  md: string,
  embeds: EmbedRecord[],
  files: Record<string, string> = {},
): { body: string; usesTally: boolean } {
  const bySrc = new Map(embeds.map((e) => [e.src, e]));
  const lines = md.split("\n");
  const out: string[] = [];
  let usesTally = false;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(EMBED_LINE);
    if (!m) {
      out.push(lines[i]!);
      continue;
    }

    const [, kind, rawSrc] = m as unknown as [string, string, string];
    const src = decodeEntities(rawSrc);
    const record = bySrc.get(src);

    // L'extracteur ajoute systématiquement un lien nu pointant sur le même src :
    // il est remplacé par le vrai balisage, pas dupliqué.
    let j = i + 1;
    while (j < lines.length && lines[j]!.trim() === "") j++;
    const linkMatch = lines[j]?.match(/^\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
    let linkLabel: string | undefined;
    if (linkMatch && decodeEntities(linkMatch[2]!) === src) {
      linkLabel = linkMatch[1];
      i = j;
    }

    // Pour une pièce jointe, le libellé du lien porte le poids du fichier
    // (« … .pdf (19369.0KB) ») : c'est lui le texte de la page, pas le titre nu.
    const title =
      kind === "file"
        ? (linkLabel ?? record?.title ?? kind)
        : (record?.title ?? linkLabel ?? kind);
    out.push("", ...renderEmbed(kind, src, title, record, files), "");
    if (kind === "tally") usesTally = true;
  }

  return { body: out.join("\n"), usesTally };
}

function renderEmbed(
  kind: string,
  src: string,
  title: string,
  record: EmbedRecord | undefined,
  files: Record<string, string>,
): string[] {
  switch (kind) {
    case "iframe":
    case "map":
    case "video":
    case "tally": {
      const url = iframeUrl(kind, src);
      return [
        `<iframe src="${escapeAttr(url)}" title="${escapeAttr(title)}" loading="lazy" allowfullscreen class="embed embed-${kind}"></iframe>`,
      ];
    }
    case "bookmark": {
      const label = record?.title && record.title !== title ? `${title} — ${record.title}` : title;
      return [`<a class="bookmark" href="${escapeAttr(src)}">${escapeText(label)}</a>`];
    }
    case "file": {
      // Le fichier est réhébergé : aucune URL du CDN de Super ne survit (ISC-13).
      const href = files[src] ?? src;
      return [`<a class="file-download" href="${escapeAttr(href)}" download>${escapeText(title)}</a>`];
    }
    default:
      // `super-embed` (boutons Billetweb, widget météo) : le HTML d'origine fait foi.
      return record?.rawHtml
        ? [withIframeTitles(record.rawHtml)]
        : [`<a class="bookmark" href="${escapeAttr(src)}">${escapeText(title)}</a>`];
  }
}

/** Un `<iframe>` sans `title` est une erreur d'accessibilité : on en pose un (ISC-18). */
function withIframeTitles(html: string): string {
  return html.replace(/<iframe(?![^>]*\btitle=)/gi, '<iframe title="Contenu intégré"');
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Script Tally, une seule fois par page, à la fin du corps. */
export const TALLY_SCRIPT =
  '<script src="https://tally.so/widgets/embed.js" defer></script>';

/* ──────────────────────────── 2. Boutons ──────────────────────────── */

export function convertButtons(md: string): string {
  return md.replace(
    /\[([^\]]*)\]\(([^)\s]+)\)\{\.button\}/g,
    (_all, label: string, href: string) =>
      `<a class="button" href="${escapeAttr(href)}">${escapeText(label.trim())}</a>`,
  );
}

/* ──────────────────────────── 1. Images ──────────────────────────── */

const GENERIC_ALTS = new Set(["", "image", "img", "photo", "untitled"]);

export function rewriteImages(
  md: string,
  opts: Pick<TransformOptions, "assetPrefix" | "resolveAsset" | "altFor">,
): { body: string; referenced: string[] } {
  const referenced: string[] = [];
  const body = md.replace(
    /!\[([^\]]*)\]\((images\/[^)\s]+)\)/g,
    (_all, alt: string, localPath: string) => {
      referenced.push(localPath);
      const rel = opts.resolveAsset(localPath);
      const label = GENERIC_ALTS.has(alt.trim().toLowerCase()) ? opts.altFor(localPath) : alt;
      return `![${label.replace(/[[\]]/g, "")}](${opts.assetPrefix}${rel})`;
    },
  );
  return { body, referenced };
}

/* ──────────────────────────── Orchestration ──────────────────────────── */

export function transformBody(rawMarkdown: string, opts: TransformOptions): TransformResult {
  let body = stripFrontmatter(rawMarkdown);
  body = stripNewsletterBlock(body);
  body = tidyEmphasis(body);
  body = rewriteLinks(body, opts.deadLinks);
  body = resolveNotionLinks(body, opts.notionPages);
  body = convertCollections(body, opts.dropCollections ?? false);
  const embedded = convertEmbeds(body, opts.embeds, opts.files);
  body = embedded.body;
  body = convertButtons(body);
  const imaged = rewriteImages(body, opts);
  body = imaged.body;

  if (embedded.usesTally) body = `${body.trimEnd()}\n\n${TALLY_SCRIPT}\n`;

  // Normalise les enchaînements de lignes vides laissés par les remplacements.
  body = body.replace(/\n{3,}/g, "\n\n").trim();

  return { body: `${body}\n`, usesTally: embedded.usesTally, referencedImages: imaged.referenced };
}
