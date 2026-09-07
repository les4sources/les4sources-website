#!/usr/bin/env bun
/**
 * migration/pages/*.{json,md}  →  src/content/**  +  src/assets/migration/**
 *
 * Déterministe et rejouable : `bun run migrate:content` peut être relancé autant
 * de fois que voulu, il produit exactement le même arbre. Les fichiers qu'il a
 * produits sont listés dans `migration/generated-manifest.json` ; au démarrage il
 * supprime CEUX-LÀ SEULEMENT — jamais un fichier écrit à la main.
 *
 * Le pivot du modèle est `legacyPath` : le chemin exact de l'URL actuelle. Le nom
 * de fichier n'est qu'un rangement, l'URL vient toujours du frontmatter.
 *
 * Options :
 *   --force-images   ré-encode toutes les images même si la cible est à jour
 *   --only <motif>   ne traite que les pages dont le `path` contient le motif
 *                    (mise au point ; n'écrit alors pas le manifeste)
 */
import { readdirSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { stringify } from "yaml";
import { optimiseImage, assetRelPath, humaniseFilename } from "./lib/optimise";
import { transformBody, stripFrontmatter, stripNewsletterBlock } from "./lib/transform";

/* ──────────────────────────── Constantes ──────────────────────────── */

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const PAGES_DIR = join(ROOT, "migration/pages");
const IMAGES_DIR = join(ROOT, "migration/images");
const ASSETS_DIR = join(ROOT, "src/assets/migration");
const CONTENT_DIR = join(ROOT, "src/content");
const MANIFEST = join(ROOT, "migration/generated-manifest.json");
const REDIRECTS = join(ROOT, "public/_redirects");

/**
 * Index de section : ces pages sont coiffées d'une grille vivante qui rend déjà
 * les mêmes fiches. La liste de collection Notion héritée dirait donc deux fois
 * les mêmes titres, juste au-dessus de la grille — on la jette pour ces pages,
 * et pour elles seules.
 */
const SECTION_INDEXES = new Set([
  "/catalogue",
  "/collectif",
  "/projets",
  "/evenements",
  "/agenda",
  "/sejours/hebergements-yvoir",
]);

const SITE_SUFFIX = "Les 4 Sources, tiers-lieu à Yvoir";
const DESC_MIN = 50;
const DESC_MAX = 160;
const TITLE_MAX = 60;

const args = process.argv.slice(2);
const FORCE_IMAGES = args.includes("--force-images");
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;

/** Les 15 URLs du sitemap qui répondent déjà 404 sur le site actuel. */
const DEAD_LINKS: Record<string, string> = {
  "/catalogue/atelier-fabrication-de-pizza": "/catalogue",
  "/catalogue/modle-pour-un-nouvel-atelier": "/catalogue",
  "/catalogue/participation-la-production-du-pain": "/catalogue",
  "/collectif/claire-feyens": "/collectif",
  "/evenements/choeur-meditant-et-energisant-18-decembre-2024": "/evenements",
  "/evenements/chorale-meditant-energisant-20-novembre-2024": "/evenements",
  "/evenements/chur-meditant-energisant-ouvert-a-tous-tes-18-septembre-2024": "/evenements",
  "/evenements/immersion-novembre-2024": "/evenements",
  "/evenements/stage-8-12-ans-yvoir-aout-2025": "/evenements",
  "/evenements/weekend-ressources-fev-2026": "/evenements",
  "/projets/environnement": "/biodiversite",
  "/projets/le-bar-des-4-sources": "/le-bar-des-4-sources",
  "/projets/production-et-transformation": "/projets",
  "/sejours/entre-amis-aux-4-sources": "/sejours/en-famille-aux-4-sources",
  "/teams-buildings": "/un-team-building-aux-4-sources",
};

/** Hôtes qui signent une billetterie / un formulaire d'inscription. */
const REGISTRATION_HOSTS = [
  "billetweb",
  "tranchesdevie",
  "tally.so",
  "punchpass",
  "helloasso",
  "weezevent",
];

type Bucket = "pages" | "evenements" | "catalogue" | "collectif" | "projets" | "hebergements";
const HEBERGEMENTS_BASE = "/sejours/hebergements-yvoir";

/* ──────────────────────────── Types de la source ──────────────────────────── */

interface SourceImage {
  src: string;
  alt?: string;
  role: string;
  localPath: string;
  shared?: boolean;
}

interface SourcePage {
  path: string;
  slug: string;
  title: string;
  h1?: string | null;
  metaDescription?: string | null;
  headerDescription?: string | null;
  coverImage?: { src: string; localPath: string } | null;
  pageIcon?: string | { type: string; localPath: string } | null;
  properties?: Record<string, string>;
  images?: SourceImage[];
  embeds?: { kind: string; src: string; title?: string; rawHtml?: string }[];
  externalLinks?: string[];
  internalLinks?: string[];
  notion?: { id?: string; blockId?: string; parentId?: string; collectionId?: string | null };
}

/* ──────────────────────────── Aides ──────────────────────────── */

const clean = (p: string) => p.replace(/\/+$/, "") || "/";

function bucketOf(path: string): Bucket {
  const p = clean(path);
  if (p.startsWith("/evenements/")) return "evenements";
  if (p.startsWith("/catalogue/")) return "catalogue";
  if (p.startsWith("/collectif/")) return "collectif";
  if (p.startsWith("/projets/")) return "projets";
  if (p.startsWith(`${HEBERGEMENTS_BASE}/`)) return "hebergements";
  return "pages";
}

/** Chemin du .md produit, relatif à `src/content/`. */
function outFileOf(bucket: Bucket, path: string): string {
  const p = clean(path);
  if (bucket === "pages") {
    return p === "/" ? "pages/index.md" : `pages/${p.slice(1).replace(/\//g, "__")}.md`;
  }
  if (bucket === "hebergements") {
    return `hebergements/${p.slice(HEBERGEMENTS_BASE.length + 1)}.md`;
  }
  return `${bucket}/${p.slice(p.lastIndexOf("/") + 1)}.md`;
}

/** `../../assets/migration/` — profondeur calculée depuis l'emplacement du .md. */
function assetPrefixFor(outFile: string): string {
  // outFile est relatif à src/content ; le .md vit donc à src/content/<outFile>.
  const depth = `content/${outFile}`.split("/").length - 1; // dossiers sous src/
  return `${"../".repeat(depth)}assets/migration/`;
}

const EMOJI_HEAD = /^(?:[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}\s]+)/u;

const EMOJI_TAIL = /(?:[\p{Extended_Pictographic}\u200d\ufe0f\u{1F3FB}-\u{1F3FF}\s]+)$/u;

function stripLeadingEmoji(title: string): string {
  return title.replace(EMOJI_HEAD, "").trim() || title.trim();
}

/** « ⚡ COMPLET ! … ⚡ » → « COMPLET ! … » — l'émoji décore, il ne distingue pas. */
function stripEdgeEmoji(title: string): string {
  const out = title.replace(EMOJI_HEAD, "").replace(EMOJI_TAIL, "").trim();
  return out || title.trim();
}

function truncateWords(text: string, max: number, ellipsis = "…"): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - ellipsis.length);
  const cut = slice.lastIndexOf(" ");
  return `${(cut > max * 0.5 ? slice.slice(0, cut) : slice).replace(/[\s,;:.…-]+$/, "")}${ellipsis}`;
}

/** Texte nu d'un Markdown : sert à fabriquer une description depuis le corps. */
function markdownToText(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)(\{[^}]*\})?/g, "$1")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Premier vrai paragraphe du corps (le site pose souvent son chapô en `####`). */
function firstParagraph(md: string): string | undefined {
  for (const block of stripNewsletterBlock(stripFrontmatter(md)).split(/\n\s*\n/)) {
    const line = block.trim();
    if (!line || line.startsWith("<!--") || line.startsWith("![")) continue;
    if (/^[-*]\s/.test(line)) continue; // liste : rarement une bonne description
    const text = markdownToText(line.replace(/^#{1,6}\s+/, "").replace(/^>\s?/gm, ""));
    if (text.length >= 40) return text;
  }
  return undefined;
}

/* ──────────────────────────── Propriétés Notion ──────────────────────────── */

const DROPPED_PROPERTIES = (key: string) => key.startsWith("super:") || key === "Date de création";

function keptProperties(properties: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (DROPPED_PROPERTIES(k)) continue;
    if (v === undefined || v === null || v === "") continue;
    out[k] = String(v);
  }
  return out;
}

type Pole =
  | "hebergement"
  | "convivialite"
  | "nature"
  | "artisanat"
  | "ressourcement"
  | "vie-collective"
  | "production";

/** Thématique Notion → pôle de la charte. Rien à forcer : l'absence est légitime. */
function poleOf(thematique?: string): Pole | undefined {
  const first = (thematique ?? "").split(",")[0]!.trim();
  if (!first) return undefined;
  if (/^Liens et convivialit/i.test(first)) return "convivialite";
  if (/^Artisanat/i.test(first)) return "artisanat";
  if (/^Nature/i.test(first)) return "nature";
  if (/^Ressourcement/i.test(first)) return "ressourcement";
  if (/^Formation/i.test(first)) return "production";
  if (/^Vie collective/i.test(first)) return "vie-collective";
  if (/^(H[ée]bergement|S[ée]jour)/i.test(first)) return "hebergement";
  if (/^(Production|Micro-ferme)/i.test(first)) return "production";
  return undefined;
}

/** « €10.00 » → « 10 € » ; « €6.50 » → « 6,50 € ». Un tarif nul n'est pas un tarif. */
function priceText(tarif?: string): string | undefined {
  if (!tarif) return undefined;
  const n = Number(tarif.replace(/[^\d.,]/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Number.isInteger(n) ? `${n} €` : `${n.toFixed(2).replace(".", ",")} €`;
}

/** Décalage horaire d'Europe/Brussels pour une date civile donnée (« +02:00 »). */
function brusselsOffset(isoDate: string): string {
  const probe = new Date(`${isoDate}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Brussels",
    timeZoneName: "longOffset",
  }).formatToParts(probe);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+01:00";
  return name.replace("GMT", "") || "+01:00";
}

/** `Date` + éventuel `Horaires` → instant ISO (ou date nue si aucune heure). */
function startOf(properties: Record<string, string>): string | undefined {
  const date = properties.Date?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const time = properties.Horaires?.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/);
  if (!time) return date;
  const hours = String(Number(time[1])).padStart(2, "0");
  const minutes = time[2] ?? "00";
  return `${date}T${hours}:${minutes}:00${brusselsOffset(date)}`;
}

function durationOf(properties: Record<string, string>): string | undefined {
  const min = properties["Durée min."]?.trim();
  const max = properties["Durée max."]?.trim();
  if (min && max && min !== max) return `${min} à ${max}`;
  return min ?? max ?? undefined;
}

const intOf = (v?: string): number | undefined => {
  const n = Number.parseInt((v ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
};

/** Lien d'inscription : bouton explicite d'abord, billetterie connue ensuite. */
function registrationUrl(rawMarkdown: string, externalLinks: string[] = []): string | undefined {
  for (const m of rawMarkdown.matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)\{\.button\}/g)) {
    return m[1];
  }
  return externalLinks.find((url) => REGISTRATION_HOSTS.some((h) => hostOf(url).includes(h)));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

/* ──────────────────────────── Index des ids Notion ──────────────────────────── */

/** Id Notion (32 hex sans tirets) → page du site. Rempli avant toute construction. */
const notionPages: Record<string, { path: string; title: string }> = {};

const bareId = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const bare = v.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(bare) ? bare : undefined;
};

/**
 * Super laissait dans le HTML des liens vers l'id Notion brut. Les ids
 * apparaissent avec ou sans tirets selon l'endroit : on indexe la forme nue.
 * `blockId` d'abord — c'est lui que portent les liens de cartes de galerie.
 */
function indexNotionIds(pages: SourcePage[]): void {
  for (const key of ["blockId", "id", "parentId", "collectionId"] as const) {
    for (const page of pages) {
      const id = bareId(page.notion?.[key]);
      if (!id || notionPages[id]) continue;
      notionPages[id] = { path: clean(page.path), title: (page.h1 || page.title || "").trim() };
    }
  }
}

/* ──────────────────────────── Images ──────────────────────────── */

const plannedAssets = new Map<string, string>(); // localPath → chemin relatif d'asset

function planAsset(localPath: string): string {
  const rel = assetRelPath(localPath);
  plannedAssets.set(localPath, rel);
  return rel;
}

async function emitAssets(): Promise<string[]> {
  const written: string[] = [];
  let encoded = 0;
  let skipped = 0;
  for (const [localPath, rel] of plannedAssets) {
    const src = join(IMAGES_DIR, localPath.replace(/^images\//, ""));
    if (!existsSync(src)) {
      console.warn(`⚠ image absente, ignorée : ${localPath}`);
      continue;
    }
    const dest = join(ASSETS_DIR, rel);
    const result = await optimiseImage(src, dest, FORCE_IMAGES);
    if (result.action === "skipped") skipped++;
    else encoded++;
    written.push(relative(ROOT, dest));
  }
  console.log(`  images : ${encoded} (ré)encodées, ${skipped} déjà à jour, ${written.length} au total`);
  return written;
}

/* ──────────────────────────── Fichiers joints ──────────────────────────── */

const FILES_DIR = join(ROOT, "public/files");
/** URL d'origine → chemin servi par le site, pour chaque pièce jointe rapatriée. */
const localFiles: Record<string, string> = {};

/**
 * Rapatrie les pièces jointes (PDF) hébergées chez Super : le site ne doit plus
 * dépendre d'assets.super.so (ISC-13). Idempotent — un fichier déjà là est gardé.
 */
async function fetchAttachments(pages: SourcePage[]): Promise<string[]> {
  const written: string[] = [];
  const seen = new Map<string, string>();
  for (const page of pages) {
    for (const embed of page.embeds ?? []) {
      if (embed.kind !== "file" || seen.has(embed.src)) continue;
      const name = decodeURIComponent(embed.src.split("/").pop() ?? "fichier.pdf").replace(
        /[^\w.-]+/g,
        "-",
      );
      seen.set(embed.src, name);
      const abs = join(FILES_DIR, name);
      mkdirSync(FILES_DIR, { recursive: true });
      if (!existsSync(abs)) {
        const res = await fetch(embed.src);
        if (!res.ok) {
          console.warn(`⚠ pièce jointe injoignable (${res.status}) : ${embed.src}`);
          continue;
        }
        await writeFile(abs, new Uint8Array(await res.arrayBuffer()));
        console.log(`  pièce jointe rapatriée : public/files/${name}`);
      }
      localFiles[embed.src] = `/files/${name}`;
      written.push(relative(ROOT, abs));
    }
  }
  return written;
}

/* ──────────────────────────── Construction d'une page ──────────────────────────── */

interface Built {
  outFile: string;
  bucket: Bucket;
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  /** Candidates de description, dans l'ordre de préférence. */
  descriptionCandidates: DescriptionCandidate[];
  /** Suffixe distinctif en cas de collision (date pour un événement, titre sinon). */
  distinguisher: string;
}

async function buildPage(jsonFile: string, page: SourcePage): Promise<Built> {
  const rawMarkdown = await readFile(join(PAGES_DIR, jsonFile.replace(/\.json$/, ".md")), "utf8");

  const path = clean(page.path);
  const bucket = bucketOf(path);
  const outFile = outFileOf(bucket, path);
  const properties = keptProperties(page.properties);
  const title = (page.h1 || page.title || "").trim();

  const contentImages = (page.images ?? []).filter((i) => i.role === "content");
  const cover = page.coverImage?.localPath;

  const transformed = transformBody(rawMarkdown, {
    assetPrefix: assetPrefixFor(outFile),
    resolveAsset: planAsset,
    altFor: humaniseFilename,
    embeds: page.embeds ?? [],
    deadLinks: DEAD_LINKS,
    files: localFiles,
    notionPages,
    dropCollections: SECTION_INDEXES.has(path),
  });

  const frontmatter: Record<string, unknown> = { title };

  if (title.length > TITLE_MAX) {
    frontmatter.seoTitle = truncateWords(stripLeadingEmoji(title), TITLE_MAX);
  }

  // description : renseignée après coup (unicité globale).
  frontmatter.description = "";
  frontmatter.legacyPath = path;

  if (cover) {
    frontmatter.cover = `${assetPrefixFor(outFile)}${planAsset(cover)}`;
    frontmatter.coverAlt = (page.images ?? []).find((i) => i.role === "cover")?.alt || title;
  }

  if (typeof page.pageIcon === "string" && page.pageIcon.trim()) {
    frontmatter.icon = page.pageIcon.trim(); // les icônes-images sont abandonnées
  }

  if (Object.keys(properties).length) frontmatter.properties = properties;

  if (page.embeds?.length) {
    frontmatter.embeds = page.embeds.map((e) => ({
      kind: e.kind,
      src: e.src,
      ...(e.title ? { title: e.title } : {}),
    }));
  }

  const pole = poleOf(properties["Thématique"]);
  if (pole) frontmatter.pole = pole;

  if (bucket === "evenements") {
    const start = startOf(properties);
    if (start) frontmatter.start = start;
    if (properties["Thématique"]) frontmatter.category = properties["Thématique"];
    const price = priceText(properties.Tarif);
    if (price) frontmatter.priceText = price;
    const url = registrationUrl(rawMarkdown, page.externalLinks);
    if (url) frontmatter.registrationUrl = url;
  }

  if (bucket === "catalogue") {
    const price = priceText(properties.Tarif);
    if (price) frontmatter.priceText = price;
    const duration = durationOf(properties);
    if (duration) frontmatter.duration = duration;
    const min = intOf(properties["Participants min"]);
    const max = intOf(properties["Participants max"]);
    if (min !== undefined) frontmatter.minParticipants = min;
    if (max !== undefined) frontmatter.maxParticipants = max;
    if (/^(Indisponible|Archiv)/i.test(properties.Statut ?? "")) frontmatter.archived = true;
  }

  if (bucket === "collectif") {
    frontmatter.name = title;
    if (properties.Type) frontmatter.role = properties.Type;
    const photo = contentImages[0]?.localPath ?? cover;
    if (photo) frontmatter.photo = `${assetPrefixFor(outFile)}${planAsset(photo)}`;
  }

  if (bucket === "hebergements") {
    const capacity = intOf(
      (path.match(/(\d+)-personnes/) ?? title.match(/(\d+)\s*personnes/))?.[1],
    );
    if (capacity !== undefined) frontmatter.capacity = capacity;
    // Les photos de la galerie Notion ne figurent PAS dans le corps : ce sont
    // celles-là (et elles seules) qui alimentent la galerie, sans doublon.
    const gallery = contentImages
      .filter((i) => !transformed.referencedImages.includes(i.localPath))
      .map((i) => `${assetPrefixFor(outFile)}${planAsset(i.localPath)}`);
    if (gallery.length) frontmatter.gallery = gallery;
  }

  // `generated: true` = la description ne vient PAS du site. Le premier
  // paragraphe compte comme fabriquée : il est déjà dans le corps de la page,
  // le réafficher en chapeau le dirait deux fois. Elle reste écrite dans le
  // frontmatter (le SEO en a besoin), mais aucun gabarit ne l'affiche.
  const descriptionCandidates = [
    { text: page.metaDescription?.trim(), generated: false },
    { text: page.headerDescription?.trim(), generated: false },
    { text: firstParagraph(rawMarkdown), generated: true },
    { text: `${stripLeadingEmoji(title)} — ${SITE_SUFFIX}`, generated: true },
  ].filter((c): c is DescriptionCandidate => Boolean(c.text && c.text.length > 0));

  const distinguisher =
    bucket === "evenements" && properties["Date (fr)"]
      ? properties["Date (fr)"]
      : stripLeadingEmoji(title);

  return { outFile, bucket, path, frontmatter, body: transformed.body, descriptionCandidates, distinguisher };
}

/* ──────────────────────────── Descriptions (50–160, uniques) ──────────────────────────── */

function normaliseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Suffixe long, pour les titres courts (« Événements ») : le suffixe court seul n'atteint pas 50 caractères. */
const SITE_SUFFIX_LONG =
  "Les 4 Sources, tiers-lieu à Yvoir : séjours, salles, activités, événements et bar au Domaine d'Ahinvaux.";
const SITE_SUFFIX_RE = /\s*—\s*Les 4 Sources, tiers-lieu à Yvoir\.?$/i;

function fitDescription(candidate: string, title: string): string {
  let text = normaliseWhitespace(candidate);
  if (text.length > DESC_MAX) text = truncateWords(text, DESC_MAX);
  if (text.length < DESC_MIN) {
    // Jamais deux fois le suffixe : on repart du texte nu, puis suffixe court, sinon long.
    const base = text.replace(/[.\s]+$/, "").replace(SITE_SUFFIX_RE, "");
    const withShort = `${base} — ${SITE_SUFFIX}`;
    const padded = withShort.length >= DESC_MIN ? withShort : `${base} — ${SITE_SUFFIX_LONG}`;
    text = padded.length > DESC_MAX ? truncateWords(padded, DESC_MAX) : padded;
  }
  if (text.length < DESC_MIN) {
    text = normaliseWhitespace(`${title} — ${SITE_SUFFIX_LONG}`);
  }
  return text;
}

/** Une description candidate et son origine : le site, ou la fabrique. */
interface DescriptionCandidate {
  text: string;
  /** Vrai quand le texte ne vient pas du site (premier paragraphe, repli). */
  generated: boolean;
}

function assignDescriptions(pages: Built[]): void {
  const used = new Set<string>();
  for (const page of pages) {
    const title = stripLeadingEmoji(String(page.frontmatter.title));
    let chosen: string | undefined;
    let generated = true;

    for (const candidate of page.descriptionCandidates) {
      const fitted = fitDescription(candidate.text, title);
      if (fitted.length >= DESC_MIN && !used.has(fitted.toLowerCase())) {
        chosen = fitted;
        generated = candidate.generated;
        break;
      }
      if (chosen === undefined) {
        chosen = fitted;
        generated = candidate.generated;
      }
    }

    let text = chosen ?? fitDescription(title, title);
    if (used.has(text.toLowerCase())) {
      // Collision : on distingue par la date (événements) ou le titre.
      const base = truncateWords(text, DESC_MAX - page.distinguisher.length - 3, "");
      text = `${base.replace(/[.\s…]+$/, "")} — ${page.distinguisher}`;
      let n = 2;
      while (used.has(text.toLowerCase())) {
        text = `${base.replace(/[.\s…]+$/, "")} — ${page.distinguisher} (${n++})`;
      }
    }
    used.add(text.toLowerCase());
    page.frontmatter.description = text;
    // Le champ n'est écrit que lorsqu'il vaut `true` : le schéma le défaut à
    // `false`, inutile d'alourdir 150 frontmatters avec l'évidence.
    if (generated) page.frontmatter.generatedDescription = true;
  }
}

/* ──────────────────────────── Titres uniques (≤ 60, ISC-25) ──────────────────────────── */

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « 2025-04-26 » → « 26 avril 2025 ». Rien d'autre n'est accepté : pas de date inventée. */
function frenchDate(iso?: unknown): string | undefined {
  const m = typeof iso === "string" ? iso.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (!m) return undefined;
  return `${Number(m[3])} ${MONTHS_FR[Number(m[2]) - 1]} ${m[1]}`;
}

/** Section du site, dernier recours pour distinguer deux titres identiques. */
function sectionLabel(path: string): string {
  if (path.startsWith("/evenements/")) return "événements";
  if (path.startsWith("/agenda/")) return "agenda";
  if (path.startsWith("/catalogue/")) return "catalogue";
  if (path.startsWith("/collectif/")) return "collectif";
  if (path.startsWith("/projets/")) return "projets";
  if (path.startsWith(`${HEBERGEMENTS_BASE}/`)) return "hébergements";
  if (path.startsWith("/sejours/")) return "séjours";
  if (path.startsWith("/a-propos/")) return "à propos";
  return "Les 4 Sources";
}

/**
 * Ce qui distingue vraiment cette page de ses homonymes :
 *  - un événement, c'est sa date ;
 *  - une sous-page d'hébergement (chambre, photos), c'est le gîte dont elle relève ;
 *  - une fiche du catalogue, c'est sa thématique ;
 *  - une page d'agenda, c'est l'agenda lui-même ;
 *  - à défaut, la section du site.
 */
function distinguisherFor(page: Built, byPath: Map<string, Built>): string {
  const props = (page.frontmatter.properties ?? {}) as Record<string, string>;
  if (page.bucket === "evenements") {
    const date =
      props["Date (fr)"]?.trim() || frenchDate(page.frontmatter.start) || frenchDate(props.Date);
    if (date) return date;
  }
  if (page.bucket === "hebergements") {
    const parent = byPath.get(page.path.slice(0, page.path.lastIndexOf("/")) || "/");
    if (parent) return stripEdgeEmoji(String(parent.frontmatter.title));
  }
  if (page.bucket === "catalogue") {
    const theme = props["Thématique"]?.split(",")[0]?.trim();
    if (theme) return theme;
  }
  return sectionLabel(page.path);
}

/** `base — suffixe`, jamais plus de 60 caractères, coupé sur un mot. */
function joinTitle(base: string, suffix: string): string {
  const full = `${base} — ${suffix}`;
  if (full.length <= TITLE_MAX) return full;
  const room = TITLE_MAX - suffix.length - 3;
  if (room < 12) return truncateWords(full, TITLE_MAX);
  return `${truncateWords(base, room)} — ${suffix}`;
}

/**
 * Deux pages ne peuvent pas partager un `<title>` (ISC-25). Les titres déjà
 * uniques sont laissés intacts ; les homonymes reçoivent un `seoTitle` distingué
 * par ce qui les sépare réellement (date, gîte parent, thématique, section).
 */
function assignTitles(pages: Built[]): void {
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const effective = (p: Built) => String(p.frontmatter.seoTitle ?? p.frontmatter.title);

  const groups = new Map<string, Built[]>();
  for (const page of pages) {
    const key = effective(page);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(page);
  }

  // Les titres déjà uniques sont réservés : un titre distingué ne doit pas tomber dessus.
  const used = new Set<string>();
  for (const [key, group] of groups) if (group.length === 1) used.add(key.toLowerCase());

  for (const group of groups.values()) {
    if (group.length === 1) continue;
    for (const page of group) {
      const base = stripEdgeEmoji(String(page.frontmatter.title));
      const suffix = distinguisherFor(page, byPath);
      let candidate = joinTitle(base, suffix);
      if (used.has(candidate.toLowerCase())) {
        candidate = joinTitle(base, `${suffix}, ${sectionLabel(page.path)}`);
      }
      let n = 2;
      while (used.has(candidate.toLowerCase())) {
        candidate = joinTitle(base, `${suffix} (${n++})`);
      }
      used.add(candidate.toLowerCase());
      page.frontmatter.seoTitle = candidate;
    }
  }
}

/* ──────────────────────────── Manifeste et écriture ──────────────────────────── */

async function readManifest(): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(MANIFEST, "utf8"));
    return Array.isArray(parsed.files) ? (parsed.files as string[]) : [];
  } catch {
    return [];
  }
}

/** Supprime les fichiers d'une exécution précédente qui ne sont plus produits. */
function removeStale(previous: string[], current: Set<string>): number {
  let removed = 0;
  for (const rel of previous) {
    if (current.has(rel)) continue;
    const abs = join(ROOT, rel);
    if (existsSync(abs)) {
      rmSync(abs, { force: true });
      removed++;
    }
  }
  return removed;
}

/** Retire les dossiers devenus vides sous `src/content` et `src/assets/migration`. */
function pruneEmptyDirs(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(join(dir, entry.name));
  }
  if (readdirSync(dir).length === 0 && dir !== CONTENT_DIR && dir !== ASSETS_DIR) {
    rmSync(dir, { recursive: true, force: true });
  }
}

const REDIRECT_BEGIN = "# >>> migration : URLs mortes du sitemap (générées par scripts/migrate/to-content.ts)";
const REDIRECT_END = "# <<< fin des redirections de migration";

/** Réécrit le bloc géré de `public/_redirects` (le reste du fichier est intact). */
async function writeRedirects(): Promise<void> {
  const existing = existsSync(REDIRECTS) ? await readFile(REDIRECTS, "utf8") : "";
  const withoutBlock = existing
    .replace(new RegExp(`${escapeRe(REDIRECT_BEGIN)}[\\s\\S]*?${escapeRe(REDIRECT_END)}\\n?`), "")
    .trimEnd();

  const width = Math.max(...Object.keys(DEAD_LINKS).map((k) => k.length)) + 2;
  const block = [
    REDIRECT_BEGIN,
    "#",
    "# Ces 15 chemins figurent au sitemap du site actuel mais y répondent 404.",
    "# Ils sont redirigés vers leur section plutôt que servis en 404 (ISC-6).",
    "",
    ...Object.entries(DEAD_LINKS).map(([from, to]) => `${from.padEnd(width)}${to.padEnd(40)}301`),
    "",
    REDIRECT_END,
  ].join("\n");

  await writeFile(REDIRECTS, `${withoutBlock}\n\n${block}\n`, "utf8");
  console.log(`  redirections : ${Object.keys(DEAD_LINKS).length} règles dans public/_redirects`);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function serialise(frontmatter: Record<string, unknown>, body: string): string {
  const yaml = stringify(frontmatter, {
    lineWidth: 0, // jamais d'enroulement dur
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    singleQuote: false,
  });
  return `---\n${yaml}---\n\n${body}`;
}

/* ──────────────────────────── Programme ──────────────────────────── */

async function main(): Promise<void> {
  const files = readdirSync(PAGES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    console.error(`Aucune page dans ${PAGES_DIR} — lancer d'abord bun run migrate:extract`);
    process.exit(2);
  }

  console.log(`\nMigration du contenu — ${files.length} pages extraites`);

  const sources: { file: string; page: SourcePage }[] = [];
  for (const file of files) {
    const page: SourcePage = JSON.parse(await readFile(join(PAGES_DIR, file), "utf8"));
    if (ONLY && !page.path.includes(ONLY)) continue;
    sources.push({ file, page });
  }

  indexNotionIds(sources.map((s) => s.page));

  const attachments = await fetchAttachments(sources.map((s) => s.page));

  const built: Built[] = [];
  for (const { file, page } of sources) built.push(await buildPage(file, page));

  // Ordre stable : le tri par chemin rend l'attribution des descriptions déterministe.
  built.sort((a, b) => a.path.localeCompare(b.path));
  assignDescriptions(built);
  assignTitles(built);

  const perBucket: Record<string, number> = {};
  const written: string[] = [];

  for (const page of built) {
    const abs = join(CONTENT_DIR, page.outFile);
    mkdirSync(dirname(abs), { recursive: true });
    await writeFile(abs, serialise(page.frontmatter, page.body), "utf8");
    written.push(relative(ROOT, abs));
    perBucket[page.bucket] = (perBucket[page.bucket] ?? 0) + 1;
  }

  console.log(
    `  collections : ${Object.entries(perBucket)
      .sort()
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  );

  const assets = await emitAssets();
  const current = new Set([...written, ...assets, ...attachments]);

  if (ONLY) {
    console.log("\n(mode --only : ni manifeste ni ménage)\n");
    return;
  }

  const removed = removeStale(await readManifest(), current);
  pruneEmptyDirs(CONTENT_DIR);
  pruneEmptyDirs(ASSETS_DIR);
  if (removed) console.log(`  ménage : ${removed} fichier(s) d'une exécution précédente supprimé(s)`);

  await writeFile(
    MANIFEST,
    `${JSON.stringify(
      {
        note: "Généré par scripts/migrate/to-content.ts — liste les fichiers que le script possède. Ne pas éditer.",
        generatedAt: new Date().toISOString(),
        files: [...current].sort(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeRedirects();
  console.log(`\n✓ ${written.length} fichiers de contenu, ${assets.length} images.\n`);
}

await main();
