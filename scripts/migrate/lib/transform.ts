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
 */
export function convertCollections(md: string): string {
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

    const title = record?.title ?? linkLabel ?? kind;
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
        ? [record.rawHtml]
        : [`<a class="bookmark" href="${escapeAttr(src)}">${escapeText(title)}</a>`];
  }
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
  body = rewriteLinks(body, opts.deadLinks);
  body = convertCollections(body);
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
