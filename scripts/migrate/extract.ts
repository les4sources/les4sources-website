/**
 * extract.ts — turn the raw Super.so HTML captured by crawl.ts into
 * structured JSON + Markdown + downloaded images, plus nav.json and report.md.
 *
 * Usage: bun scripts/migrate/extract.ts [--no-images] [--only <slug>[,<slug>…]]
 */
import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { Element } from "domhandler";
import { mkdir, readFile, writeFile, stat, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { BASE_URL, CRAWL_DIR, MIGRATION_DIR, RAW_DIR, pathToSlug } from "./lib/common.ts";
import { parseFlightProps, resolveProperties, richTextToPlain, type BlockRecord, type FlightProps, type PropertySortEntry, type ResolvedProperty } from "./lib/flight.ts";
import { basenameFromUrl, downloadToCache, isSkippableImage, largestFromSrcset, normaliseImageUrl, placeImage, urlHash, type CachedImage } from "./lib/images.ts";
import { cleanContentRoot, collectEmbeds, decodeCfEmails, htmlToMarkdown, type Embed } from "./lib/markdown.ts";

const NO_IMAGES = process.argv.includes("--no-images");
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx > 0 ? new Set(process.argv[onlyIdx + 1].split(",")) : null;
const IMAGE_CONCURRENCY = 8;

const PAGES_DIR = resolve(MIGRATION_DIR, "pages");
const IMAGES_DIR = resolve(MIGRATION_DIR, "images");
const IMAGE_CACHE = resolve(CRAWL_DIR, "images");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Breadcrumb {
  label: string;
  href: string;
  icon?: string;
}

interface CollectionItem {
  title: string;
  href: string;
  icon?: string | null;
  cover?: string | null;
  coverLocalPath?: string | null;
  group?: string;
  props: string[];
  properties?: Record<string, string>;
}

interface Collection {
  id: string | null;
  title: string | null;
  source: { id: string; uri: string | null; title: string | null } | null;
  view: string | null;
  views: string[];
  layout: string;
  grouped: boolean;
  items: CollectionItem[];
}

interface ImageRef {
  src: string;
  alt: string;
  role: "content" | "cover" | "icon" | "og";
  localPath: string | null;
  shared?: boolean;
  bytes?: number;
  error?: string;
}

interface PageDraft {
  path: string;
  slug: string;
  rootIsCollection: boolean;
  title: string;
  metaDescription: string | null;
  ogImage: string | null;
  ogTitle: string | null;
  ogUrl: string | null;
  canonical: string | null;
  h1: string | null;
  headerDescription: string | null;
  coverImage: { src: string; localPath: string | null } | null;
  pageIcon: string | { type: "image"; src: string; localPath: string | null } | null;
  properties: Record<string, string>;
  propertySchema: { id: string; name: string; type: string; visibility?: string }[];
  notion: Record<string, unknown> | null;
  breadcrumbs: Breadcrumb[];
  contentHtml: string;
  images: ImageRef[];
  embeds: Embed[];
  internalLinks: string[];
  externalLinks: string[];
  collections: Collection[];
  wordCount: number;
  fetchedAt: string;
  // transient
  _flight: FlightProps | null;
  _record: BlockRecord | null;
  _imageFallback: Map<string, string>;
  _blockClasses: Map<string, number>;
  _text: string;
  _navDom?: unknown;
  _footerDom?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function text($el: Cheerio<any>): string {
  return $el.text().replace(/\s+/g, " ").trim();
}

function iconUrl(icon: string | null | undefined): string | null {
  if (!icon) return null;
  if (icon.startsWith("http")) return icon;
  if (icon.startsWith("/icons/")) return "https://app.notion.com" + icon;
  return null;
}

function isoOrNull(ms: unknown): string | null {
  return typeof ms === "number" ? new Date(ms).toISOString() : null;
}

function classifyLink(href: string | undefined): { kind: "internal" | "external" | "skip"; value: string } {
  if (!href) return { kind: "skip", value: "" };
  const h = href.trim();
  if (!h || h.startsWith("#") || h.startsWith("javascript:")) return { kind: "skip", value: "" };
  if (/^(mailto|tel):/i.test(h)) return { kind: "external", value: h };
  if (h.startsWith("/")) {
    if (h.startsWith("/cdn-cgi/")) return { kind: "skip", value: "" };
    return { kind: "internal", value: h.split("#")[0].split("?")[0] || "/" };
  }
  try {
    const u = new URL(h);
    if (/(^|\.)les4sources\.be$/.test(u.hostname) && !/^(app|tranchesdevie)\./.test(u.hostname)) {
      return { kind: "internal", value: u.pathname.replace(/\/$/, "") || "/" };
    }
    return { kind: "external", value: h };
  } catch {
    return { kind: "skip", value: "" };
  }
}

function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  if (/^[A-Za-z0-9 _.,'’()€:!?\-\/]+$/.test(s) && !/^[\-?:!&*%@`'"|>{}\[\],#]/.test(s) && !/:\s/.test(s) && !/^(true|false|null|yes|no|~)$/i.test(s) && !/^\d/.test(s)) return s;
  return JSON.stringify(s);
}

function toYaml(obj: Record<string, unknown>, indent = 0): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = /^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const entries = Object.keys(v as object);
      if (!entries.length) lines.push(`${pad}${key}: {}`);
      else {
        lines.push(`${pad}${key}:`);
        lines.push(toYaml(v as Record<string, unknown>, indent + 1));
      }
    } else if (Array.isArray(v)) {
      if (!v.length) lines.push(`${pad}${key}: []`);
      else {
        lines.push(`${pad}${key}:`);
        for (const item of v) {
          if (item && typeof item === "object") lines.push(`${pad}  -`, toYaml(item as Record<string, unknown>, indent + 2));
          else lines.push(`${pad}  - ${yamlScalar(item)}`);
        }
      }
    } else lines.push(`${pad}${key}: ${yamlScalar(v)}`);
  }
  return lines.join("\n");
}

async function runPool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

// ---------------------------------------------------------------------------
// Pass A — parse one raw page into a draft
// ---------------------------------------------------------------------------

function parsePage(path: string, slug: string, html: string, fetchedAt: string): PageDraft {
  const $ = load(html);
  decodeCfEmails($);
  const flight = parseFlightProps($);
  const block = flight?.records.block ?? {};
  const record: BlockRecord | null = (flight && (block[flight.pageId] ?? Object.values(block).find((b) => b?.uri === path) ?? null)) || null;

  const head = $("head");
  const meta = (sel: string) => head.find(sel).attr("content")?.trim() || null;
  const title = text(head.find("title").first());
  const $main = $("main.super-content").first();
  const $header = $main.find(".notion-header").first();
  const $rootOrig = $main.find("article.notion-root").first();

  // --- header: h1, icon, cover, description
  const h1 = text($header.find("h1.notion-header__title").first()) || null;
  const headerDescription = text($header.find(".notion-header__description").first()) || null;
  let pageIcon: PageDraft["pageIcon"] = null;
  const recIcon = record?.icon ?? null;
  if (recIcon) pageIcon = iconUrl(recIcon) ? { type: "image", src: iconUrl(recIcon)!, localPath: null } : recIcon;
  else {
    const $iconImg = $header.find("img.notion-header__icon").first();
    const iconText = text($header.find(".notion-header__icon-wrapper").first());
    if ($iconImg.length) {
      const src = normaliseImageUrl(largestFromSrcset($iconImg.attr("srcset") ?? $iconImg.attr("srcSet")) ?? $iconImg.attr("src"));
      if (src) pageIcon = { type: "image", src, localPath: null };
    } else if (iconText) pageIcon = iconText;
  }
  const imageFallback = new Map<string, string>();
  let coverSrc: string | null = normaliseImageUrl(record?.cover ?? null);
  const $coverImg = $header.find("img.notion-header__cover-image").first();
  if ($coverImg.length) {
    const candidate = largestFromSrcset($coverImg.attr("srcset") ?? $coverImg.attr("srcSet")) ?? $coverImg.attr("src") ?? "";
    const norm = normaliseImageUrl(candidate);
    if (!coverSrc && norm) coverSrc = norm;
    if (norm && candidate) imageFallback.set(norm, candidate.startsWith("/") ? BASE_URL + candidate : candidate);
  }

  // --- breadcrumbs (from original root before cleaning)
  const breadcrumbs: Breadcrumb[] = [];
  $rootOrig.find(".notion-breadcrumb .notion-breadcrumb__item").each((_, el) => {
    const $el = $(el);
    const icon = text($el.children("div").not(".notion-breadcrumb__title").first());
    breadcrumbs.push({ label: text($el.find(".notion-breadcrumb__title")), href: $el.attr("href") ?? "", ...(icon ? { icon } : {}) });
  });

  // --- block-class census (raw root)
  const blockClasses = new Map<string, number>();
  $rootOrig.find("[class]").addBack("[class]").each((_, el) => {
    for (const c of ($(el).attr("class") ?? "").split(/\s+/)) {
      if (!/^(notion|super)-/.test(c)) continue;
      blockClasses.set(c, (blockClasses.get(c) ?? 0) + 1);
    }
  });

  // --- collections (from the original root: header wrapper still present)
  const collections: Collection[] = [];
  const $collEls = $rootOrig.is(".notion-collection") ? $rootOrig : $rootOrig.find(".notion-collection");
  $collEls.each((_, el) => {
    const $c = $(el);
    if (!$rootOrig.is(el) && $c.parents(".notion-collection").length) return;
    const id = ($c.attr("id") ?? "").replace(/^block-/, "") || null;
    const rec = id ? block[id] : null;
    const gallery = $c.find(".notion-collection-gallery, .notion-collection-list, .notion-collection-table, .notion-collection-board").first();
    const layout = (gallery.attr("class") ?? "").match(/notion-collection-(gallery|list|table|board)/)?.[1] ?? "unknown";
    const items: CollectionItem[] = [];
    const readCard = ($card: Cheerio<Element>, group?: string) => {
      const $a = $card.find("a.notion-collection-card__anchor, a").first();
      const href = $a.attr("href") ?? "";
      const $cover = $card.find("img.notion-collection-card__cover").first();
      const coverCand = largestFromSrcset($cover.attr("srcset") ?? $cover.attr("srcSet")) ?? $cover.attr("src");
      const cover = normaliseImageUrl(coverCand);
      if (cover && coverCand) imageFallback.set(cover, coverCand);
      const props: string[] = [];
      $card.find(".notion-collection-card__property").not(".notion-property__title").each((_, p) => {
        const $p = $(p);
        const pills = $p.find(".notion-pill").toArray().map((x) => text($(x)));
        const t = pills.length ? pills.join(", ") : text($p);
        if (t) props.push(t);
      });
      const titleT = text($card.find(".notion-property__title").first()) || text($a);
      const itemRec = href ? Object.values(block).find((b) => b?.uri === href) ?? null : null;
      items.push({ title: titleT, href, icon: itemRec?.icon ?? null, cover, ...(group ? { group } : {}), props, ...(itemRec ? { _record: itemRec } : {}) } as CollectionItem);
    };
    const $groups = $c.find(".notion-collection-group__section");
    if ($groups.length) {
      $groups.each((_, g) => {
        const $g = $(g);
        const group = text($g.find(".notion-collection-group__section-header .notion-property").first()) || text($g.find(".notion-collection-group__section-header").first());
        $g.find(".notion-collection-card").each((_, card) => readCard($(card), group));
      });
    } else $c.find(".notion-collection-card").each((_, card) => readCard($(card)));
    const sourceKey = rec?.sourceId ? String(rec.sourceId).replace(/-/g, "") : null;
    const sourceRec = sourceKey && sourceKey !== id ? block[sourceKey] ?? null : null;
    const recViews = Array.isArray(rec?.views) ? (rec!.views as any[]).map((v) => String(v?.name ?? "")).filter(Boolean) : [];
    collections.push({
      id,
      title: (rec ? richTextToPlain(rec.title).trim() : "") || (sourceRec ? richTextToPlain(sourceRec.title).trim() : "") || null,
      source: sourceRec ? { id: sourceRec.id, uri: sourceRec.uri ?? null, title: richTextToPlain(sourceRec.title).trim() || null } : null,
      view: text($c.find(".notion-collection__header-wrapper .notion-dropdown__button-title").first()) || recViews[0] || null,
      views: (() => {
        const domViews = $c.find(".notion-collection__header-wrapper .notion-dropdown__option p").toArray().map((o) => text($(o))).filter(Boolean);
        return domViews.length ? domViews : recViews;
      })(),
      layout,
      grouped: $groups.length > 0,
      items,
    });
  });

  // --- clean root → contentHtml
  const $root = $rootOrig.clone() as Cheerio<Element>;
  cleanContentRoot($, $root);
  const contentHtml = ($root.html() ?? "").trim();
  const plain = text($root);

  // --- images in content (document order, unique)
  const images: ImageRef[] = [];
  const seen = new Set<string>();
  const addImage = (src: string | null, alt: string, role: ImageRef["role"]) => {
    if (!src || seen.has(src) || isSkippableImage(src)) return;
    seen.add(src);
    images.push({ src, alt, role, localPath: null });
  };
  addImage(coverSrc, h1 ?? "", "cover");
  if (pageIcon && typeof pageIcon === "object") addImage(pageIcon.src, "icon", "icon");
  $root.find("img[src]").each((_, el) => addImage($(el).attr("src") ?? null, ($(el).attr("alt") ?? "").trim(), "content"));
  // record the sized variants as fallbacks for /public failures
  $rootOrig.find("img").each((_, el) => {
    const cand = largestFromSrcset($(el).attr("srcset") ?? $(el).attr("srcSet")) ?? $(el).attr("src") ?? "";
    const norm = normaliseImageUrl(cand);
    if (norm && cand && norm !== cand && !imageFallback.has(norm)) imageFallback.set(norm, cand.startsWith("/") ? BASE_URL + cand : cand);
  });
  const ogImage = normaliseImageUrl(meta('meta[property="og:image"]')) ?? meta('meta[property="og:image"]');
  addImage(ogImage, meta('meta[property="og:image:alt"]') ?? "", "og");

  // --- links
  const internal: string[] = [];
  const external: string[] = [];
  $root.find("a[href]").each((_, el) => {
    const c = classifyLink($(el).attr("href"));
    if (c.kind === "internal" && !internal.includes(c.value)) internal.push(c.value);
    if (c.kind === "external" && !external.includes(c.value)) external.push(c.value);
  });

  // --- properties (own record)
  const properties: Record<string, string> = {};
  const propertySchema: PageDraft["propertySchema"] = (record?.propertySort ?? []).map((p) => ({ id: p.property, name: p.name, type: p.type, visibility: p.visibility }));

  const notion = record
    ? {
        id: record.id,
        blockId: record.blockId ?? null,
        parentId: record.parentId ?? null,
        type: record.type,
        uri: record.uri ?? null,
        createdTime: isoOrNull(record.createdTime),
        lastEditedTime: isoOrNull(record.lastEditedTime),
        collectionId: record.collectionId ?? null,
      }
    : null;

  return {
    path,
    slug,
    rootIsCollection: $rootOrig.is(".notion-collection"),
    title,
    metaDescription: meta('meta[name="description"]'),
    ogImage,
    ogTitle: meta('meta[property="og:title"]'),
    ogUrl: meta('meta[property="og:url"]'),
    canonical: head.find('link[rel="canonical"]').attr("href") ?? null,
    h1,
    headerDescription,
    coverImage: coverSrc ? { src: coverSrc, localPath: null } : null,
    pageIcon,
    properties,
    propertySchema,
    notion,
    breadcrumbs,
    contentHtml,
    images,
    embeds: collectEmbeds($, $root),
    internalLinks: internal,
    externalLinks: external,
    collections,
    wordCount: plain ? plain.split(/\s+/).length : 0,
    fetchedAt,
    _flight: flight,
    _record: record,
    _imageFallback: imageFallback,
    _blockClasses: blockClasses,
    _text: plain,
    _navDom: slug === "index" ? extractNavDom($) : undefined,
    _footerDom: slug === "index" ? extractFooterDom($) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Navigation (DOM + settings)
// ---------------------------------------------------------------------------

function extractNavDom($: CheerioAPI) {
  const nav = $("nav.super-navbar").first();
  const links: any[] = [];
  nav.find("ul.super-navbar__item-list > li").each((_, li) => {
    const $li = $(li);
    const $a = $li.children("a").first();
    const children = $li
      .find("ul a, .super-navbar__dropdown a, [class*='dropdown'] a")
      .toArray()
      .map((a) => ({ label: text($(a)), href: $(a).attr("href") ?? null }))
      .filter((c) => c.label);
    links.push({ label: text($a.length ? $a : $li.children().first()), href: $a.attr("href") ?? null, ...(children.length ? { children } : {}) });
  });
  const $logoImg = nav.find(".super-navbar__logo img").first();
  return {
    logo: { href: nav.find(".super-navbar__logo").attr("href") ?? "/", image: normaliseImageUrl($logoImg.attr("src")), alt: $logoImg.attr("alt") ?? null },
    links,
    actions: nav
      .find(".super-navbar__actions > *")
      .toArray()
      .map((el) => ($(el).attr("class") ?? "").split(/\s+/).find((c) => c.startsWith("super-navbar__") && c !== "super-navbar__button") ?? null)
      .filter(Boolean),
  };
}

function extractFooterDom($: CheerioAPI) {
  const footer = $("footer.super-footer").first();
  const lists = footer
    .find(".super-footer__list")
    .toArray()
    .map((l) => ({
      heading: text($(l).find(".super-footer__list-heading").first()),
      links: $(l)
        .find("a.super-footer__link")
        .toArray()
        .map((a) => ({ label: text($(a)), href: $(a).attr("href") ?? null })),
    }));
  const socials = footer
    .find(".super-footer__icons a")
    .toArray()
    .map((a) => ({ href: $(a).attr("href") ?? null, title: text($(a).find("title")) || $(a).attr("aria-label") || null }));
  const footerText = text(footer);
  const $logoImg = footer.find(".super-footer__logo img").first();
  return {
    logo: { href: footer.find(".super-footer__logo").attr("href") ?? "/", image: normaliseImageUrl($logoImg.attr("src")), alt: $logoImg.attr("alt") ?? null },
    lists,
    socials,
    footnote: text(footer.find(".super-footer__footnote")) || null,
    contact: {
      address: null,
      phone: footerText.match(/\+?\d[\d .\/]{7,}\d/)?.[0] ?? null,
      email: footerText.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null,
    },
  };
}

function settingsLinks(list: any[] | undefined): any[] {
  return (list ?? []).map((l) => ({
    label: l.label ?? "",
    href: l.link || null,
    type: l.type ?? null,
    ...(l.icon ? { icon: l.icon } : {}),
    ...(l.description ? { description: l.description } : {}),
    ...(Array.isArray(l.list) && l.list.length ? { children: settingsLinks(l.list) } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await mkdir(PAGES_DIR, { recursive: true });
  await mkdir(IMAGES_DIR, { recursive: true });

  const urls = (await readFile(resolve(MIGRATION_DIR, "urls.txt"), "utf8"))
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((p) => (p.startsWith("/") ? p : "/" + p))
    .map((p) => (p.length > 1 ? p.replace(/\/$/, "") : p));

  let crawlLog: any = null;
  try {
    crawlLog = JSON.parse(await readFile(resolve(CRAWL_DIR, "crawl-log.json"), "utf8"));
  } catch {
    /* no log */
  }
  const crawlByPath = new Map<string, any>((crawlLog?.results ?? []).map((r: any) => [r.path, r]));

  // ---- Pass A: parse
  const drafts: PageDraft[] = [];
  const missing: { path: string; reason: string }[] = [];
  for (const path of urls) {
    const slug = pathToSlug(path);
    if (ONLY && !ONLY.has(slug)) continue;
    const file = resolve(RAW_DIR, `${slug}.html`);
    if (!(await exists(file))) {
      missing.push({ path, reason: crawlByPath.get(path)?.error ?? "raw HTML missing" });
      continue;
    }
    const html = await readFile(file, "utf8");
    const fetchedAt = crawlByPath.get(path)?.fetchedAt ?? (await stat(file)).mtime.toISOString();
    try {
      drafts.push(parsePage(path, slug, html, fetchedAt));
    } catch (err) {
      missing.push({ path, reason: `parse error: ${err instanceof Error ? err.message : String(err)}` });
    }
    process.stdout.write(`\rparsed ${drafts.length}/${urls.length}`);
  }
  console.log(`\nparsed ${drafts.length} pages, ${missing.length} missing`);

  // ---- global property schema + records by uri
  const schema = new Map<string, PropertySortEntry>();
  for (const d of drafts) {
    for (const rec of Object.values(d._flight?.records.block ?? {})) {
      for (const p of rec?.propertySort ?? []) if (!schema.has(p.property)) schema.set(p.property, p);
      for (const [key, id] of Object.entries((rec?.superProperties as Record<string, string> | undefined) ?? {})) if (id && !schema.has(id)) schema.set(id, { property: id, name: `super:${key}`, type: "text", visibility: "hide" });
    }
  }
  const recordByUri = new Map<string, BlockRecord>();
  for (const d of drafts) for (const rec of Object.values(d._flight?.records.block ?? {})) if (rec?.uri && !recordByUri.has(rec.uri)) recordByUri.set(rec.uri, rec);
  for (const d of drafts) {
    for (const c of d.collections) {
      if (c.source?.title) continue;
      const parents = [...new Set(c.items.map((it) => it.href.replace(/\/[^\/]*$/, "") || "/"))];
      if (parents.length === 1 && parents[0] !== "/") {
        const src = recordByUri.get(parents[0]);
        if (src) c.source = { id: src.id, uri: src.uri ?? parents[0], title: richTextToPlain(src.title).trim() || null, inferred: true } as any;
        else c.source = { id: null as any, uri: parents[0], title: null, inferred: true } as any;
      }
      if (!c.title && c.source?.title) c.title = c.source.title;
    }
  }
  for (const d of drafts) {
    if (d._record) {
      for (const p of resolveProperties(d._record, schema)) d.properties[p.name] = p.text;
      if (!d.propertySchema.length) {
        for (const p of resolveProperties(d._record, schema)) d.propertySchema.push({ id: p.id, name: p.name, type: p.type, visibility: p.visibility });
      }
    }
    for (const c of d.collections) {
      for (const it of c.items as any[]) {
        if (it._record) {
          const props: Record<string, string> = {};
          for (const p of resolveProperties(it._record, schema)) props[p.name] = p.text;
          it.properties = props;
          delete it._record;
        }
      }
    }
  }

  // ---- image plan + download
  const usage = new Map<string, Set<string>>();
  const fallback = new Map<string, string>();
  const siteAssets: { src: string; localPath: string | null }[] = [];
  for (const d of drafts) {
    for (const im of d.images) {
      if (!usage.has(im.src)) usage.set(im.src, new Set());
      usage.get(im.src)!.add(d.slug);
      const fb = d._imageFallback.get(im.src);
      if (fb && !fallback.has(im.src)) fallback.set(im.src, fb);
    }
    for (const c of d.collections) for (const it of c.items) if (it.cover && !usage.has(it.cover)) usage.set(it.cover, new Set([d.slug]));
  }
  const index = drafts.find((d) => d.slug === "index");
  const settings = index?._flight?.settings ?? null;
  for (const src of [settings?.navbar?.logo?.imageContent, settings?.footer?.logo?.imageContent, settings?.favicon, (index?._navDom as any)?.logo?.image, (index?._footerDom as any)?.logo?.image]) {
    const n = normaliseImageUrl(src);
    if (n && !siteAssets.some((a) => a.src === n)) siteAssets.push({ src: n, localPath: null });
  }

  const cache = new Map<string, CachedImage>();
  const imageFailures: { src: string; error: string; pages: string[] }[] = [];
  const allUrls = [...new Set([...usage.keys(), ...siteAssets.map((a) => a.src)])];
  if (!NO_IMAGES) {
    let done = 0;
    await runPool(allUrls, IMAGE_CONCURRENCY, async (url) => {
      let r = await downloadToCache(url, IMAGE_CACHE);
      if (!r.ok && fallback.has(url)) {
        const alt = await downloadToCache(fallback.get(url)!, IMAGE_CACHE);
        if (alt.ok) r = { ...alt, url, error: `used sized variant (${r.error})` };
      }
      cache.set(url, r);
      if (!r.ok) imageFailures.push({ src: url, error: r.error ?? "unknown", pages: [...(usage.get(url) ?? [])] });
      done++;
      if (done % 25 === 0 || done === allUrls.length) process.stdout.write(`\rimages ${done}/${allUrls.length}`);
    });
    console.log();
  }

  // assign local paths
  const localPathByUrl = new Map<string, string>();
  const placeJobs: { cached: CachedImage; dest: string }[] = [];
  const localOf = (url: string, slug: string, n: number): string | null => {
    if (localPathByUrl.has(url)) return localPathByUrl.get(url)!;
    const c = cache.get(url);
    if (!c?.ok) return null;
    const { base } = basenameFromUrl(url);
    const shared = (usage.get(url)?.size ?? 0) >= 2;
    const rel = shared ? `images/_shared/${urlHash(url)}-${base}${c.ext}` : `images/${slug}/${String(n).padStart(2, "0")}-${base}${c.ext}`;
    localPathByUrl.set(url, rel);
    placeJobs.push({ cached: c, dest: resolve(MIGRATION_DIR, rel) });
    return rel;
  };
  for (const d of drafts) {
    let n = 0;
    for (const im of d.images) {
      n++;
      im.localPath = localOf(im.src, d.slug, n);
      im.shared = (usage.get(im.src)?.size ?? 0) >= 2;
      const c = cache.get(im.src);
      if (c?.ok) im.bytes = c.bytes;
      else if (c?.error) im.error = c.error;
    }
    if (d.coverImage) d.coverImage.localPath = localPathByUrl.get(d.coverImage.src) ?? null;
    if (d.pageIcon && typeof d.pageIcon === "object") d.pageIcon.localPath = localPathByUrl.get(d.pageIcon.src) ?? null;
    for (const c of d.collections) for (const it of c.items) if (it.cover) it.coverLocalPath = localPathByUrl.get(it.cover) ?? localOf(it.cover, d.slug, ++n);
  }
  for (const a of siteAssets) {
    const c = cache.get(a.src);
    if (c?.ok) {
      const { base } = basenameFromUrl(a.src);
      a.localPath = `images/_site/${urlHash(a.src)}-${base}${c.ext}`;
      placeJobs.push({ cached: c, dest: resolve(MIGRATION_DIR, a.localPath) });
    }
  }
  for (const job of placeJobs) await placeImage(job.cached, job.dest);

  // ---- Pass B: render + write
  const embedsByKind = new Map<string, number>();
  const blockClassPages = new Map<string, { pages: number; total: number }>();
  for (const d of drafts) {
    const collectionMarkdown = d.collections.map((c) => {
      const lines: string[] = [`<!-- collection${c.title ? ` "${c.title.replace(/"/g, "'")}"` : ""}${c.view ? ` view="${c.view}"` : ""} layout="${c.layout}" -->`];
      let lastGroup: string | undefined;
      for (const it of c.items) {
        if (c.grouped && it.group !== lastGroup) {
          lines.push("", `**${it.group}**`, "");
          lastGroup = it.group;
        }
        const emoji = it.icon && !iconUrl(it.icon) ? it.icon : "";
        const label = emoji && !it.title.startsWith(emoji) ? `${emoji} ${it.title}` : it.title;
        lines.push(`- [${label}](${it.href})${it.props.length ? ` — ${it.props.join(" · ")}` : ""}`);
      }
      lines.push(`<!-- /collection -->`);
      return lines.join("\n");
    });
    const markdown = htmlToMarkdown(d.contentHtml, { resolveImage: (u) => localPathByUrl.get(u) ?? null, collectionMarkdown, rootIsCollection: d.rootIsCollection });
    for (const e of d.embeds) embedsByKind.set(e.kind, (embedsByKind.get(e.kind) ?? 0) + 1);
    for (const [c, n] of d._blockClasses) {
      const cur = blockClassPages.get(c) ?? { pages: 0, total: 0 };
      cur.pages++;
      cur.total += n;
      blockClassPages.set(c, cur);
    }
    const { _flight, _record, _imageFallback, _blockClasses, _text, _navDom, _footerDom, ...pub } = d;
    const json = { ...pub, markdown, extractedAt: new Date().toISOString() };
    await writeFile(resolve(PAGES_DIR, `${d.slug}.json`), JSON.stringify(json, null, 2) + "\n");
    const fm: Record<string, unknown> = {
      title: d.h1 ?? d.title,
      description: d.metaDescription,
      path: d.path,
      ogImage: d.ogImage,
      cover: d.coverImage?.localPath ?? d.coverImage?.src ?? null,
      ...(typeof d.pageIcon === "string" ? { icon: d.pageIcon } : d.pageIcon ? { icon: d.pageIcon.localPath ?? d.pageIcon.src } : {}),
      ...(d.headerDescription ? { headerDescription: d.headerDescription } : {}),
      properties: d.properties,
    };
    await writeFile(resolve(PAGES_DIR, `${d.slug}.md`), `---\n${toYaml(fm)}\n---\n\n${markdown}`);
  }

  // ---- nav.json
  if (index) {
    const nav = {
      source: settings ? "super settings (flight payload) + DOM" : "DOM",
      site: settings ? { name: settings.name ?? null, domain: settings.domainName ?? null, language: settings.language ?? null, favicon: settings.favicon ?? null } : null,
      header: {
        type: settings?.navbar?.type ?? null,
        sticky: settings?.navbar?.isSticky ?? null,
        breadcrumbs: settings?.navbar?.breadcrumbs ?? null,
        logo: settings?.navbar?.logo
          ? { ...settings.navbar.logo, localPath: siteAssets.find((a) => a.src === normaliseImageUrl(settings.navbar.logo.imageContent))?.localPath ?? null }
          : null,
        cta: settings?.navbar?.cta?.link ? { label: settings.navbar.cta.label, href: settings.navbar.cta.link } : null,
        links: settings ? settingsLinks(settings.navbar?.links) : (index._navDom as any)?.links ?? [],
        dom: index._navDom ?? null,
      },
      footer: {
        type: settings?.footer?.type ?? null,
        logo: settings?.footer?.logo
          ? { ...settings.footer.logo, localPath: siteAssets.find((a) => a.src === normaliseImageUrl(settings.footer.logo.imageContent))?.localPath ?? null }
          : null,
        lists: settings
          ? settingsLinks(settings.footer?.links).map((l) => ({ heading: l.label, links: l.children ?? [] }))
          : (index._footerDom as any)?.lists ?? [],
        socials: settings?.footer?.socials ?? (index._footerDom as any)?.socials ?? [],
        footnote: settings?.footer?.footnote ?? (index._footerDom as any)?.footnote ?? null,
        contact: (index._footerDom as any)?.contact ?? { address: null, phone: null, email: null },
        dom: index._footerDom ?? null,
      },
      sidebar: settings?.sidebar ?? null,
    };
    await writeFile(resolve(MIGRATION_DIR, "nav.json"), JSON.stringify(nav, null, 2) + "\n");
  }

  // ---- report.md
  const lines: string[] = [];
  const failedCrawl = (crawlLog?.results ?? []).filter((r: any) => r.status === "failed");
  let rawPresent = 0;
  for (const p of urls) if (await exists(resolve(RAW_DIR, `${pathToSlug(p)}.html`))) rawPresent++;
  lines.push(`# Migration report — ${BASE_URL}`, "", `Generated: ${new Date().toISOString()}`, "");
  lines.push("## Counts", "");
  lines.push(`| Metric | Value |`, `| --- | --- |`);
  lines.push(`| URL paths listed | ${urls.length} |`);
  lines.push(`| Pages fetched (raw HTML present) | ${rawPresent} |`);
  lines.push(`| Pages failed (crawl) | ${failedCrawl.length} |`);
  lines.push(`| Pages extracted | ${drafts.length} |`);
  lines.push(`| Unique image URLs | ${allUrls.length} |`);
  lines.push(`| Images downloaded | ${[...cache.values()].filter((c) => c.ok).length} |`);
  lines.push(`| Images failed | ${imageFailures.length} |`);
  lines.push(`| Images shared (≥2 pages) | ${[...usage.values()].filter((s) => s.size >= 2).length} |`);
  lines.push(`| Embeds total | ${drafts.reduce((a, d) => a + d.embeds.length, 0)} |`);
  for (const [k, v] of [...embedsByKind.entries()].sort()) lines.push(`| Embeds: ${k} | ${v} |`);
  lines.push(`| Pages with collections | ${drafts.filter((d) => d.collections.length).length} |`);
  lines.push(`| Pages with properties | ${drafts.filter((d) => Object.keys(d.properties).length).length} |`);
  lines.push(`| Pages with cover | ${drafts.filter((d) => d.coverImage).length} |`);
  lines.push(`| Pages with icon | ${drafts.filter((d) => d.pageIcon).length} |`);
  lines.push(`| Total words | ${drafts.reduce((a, d) => a + d.wordCount, 0)} |`);
  lines.push("");
  lines.push("## Failures", "", "### Crawl failures", "");
  if (!failedCrawl.length && !missing.length) lines.push("None.");
  for (const r of failedCrawl) lines.push(`- \`${r.path}\` — ${r.error}`);
  for (const m of missing.filter((m) => !failedCrawl.some((r: any) => r.path === m.path))) lines.push(`- \`${m.path}\` — ${m.reason}`);
  lines.push("", "### Image download failures", "");
  if (!imageFailures.length) lines.push("None.");
  for (const f of imageFailures.sort((a, b) => a.src.localeCompare(b.src))) lines.push(`- ${f.src} — ${f.error} (pages: ${f.pages.map((p) => `\`${p}\``).join(", ")})`);
  lines.push("", "## Pages with iframes / embeds", "");
  for (const d of drafts.filter((d) => d.embeds.length)) {
    lines.push(`- \`${d.path}\``);
    for (const e of d.embeds) lines.push(`  - ${e.kind}: ${e.src}${e.title ? ` — ${e.title}` : ""}`);
  }
  lines.push("", "## Pages with collections", "");
  for (const d of drafts.filter((d) => d.collections.length)) lines.push(`- \`${d.path}\` — ${d.collections.map((c) => `${c.title ?? "(untitled)"} [${c.layout}${c.grouped ? ", grouped" : ""}, view=${c.view ?? "?"}, ${c.items.length} items]`).join("; ")}`);
  lines.push("", "## Pages with properties", "");
  for (const d of drafts.filter((d) => Object.keys(d.properties).length)) lines.push(`- \`${d.path}\` — ${Object.entries(d.properties).map(([k, v]) => `${k}: ${v}`).join(" · ")}`);
  lines.push("", "## Sample word counts", "");
  const samples = ["index", "sejours__tarifs", "evenements__pizza-party-septembre-2026", "catalogue__grimpe-encadree-dans-les-arbres", "collectif__michael-hulet", "a-propos__notre-projet", "sejours__conditions", "catalogue", "agenda", "nous-soutenir"];
  lines.push(`| Page | Words |`, `| --- | --- |`);
  for (const s of samples) {
    const d = drafts.find((d) => d.slug === s);
    if (d) lines.push(`| \`${d.path}\` | ${d.wordCount} |`);
  }
  lines.push("", "## Notion / Super block classes encountered (content root, before cleaning)", "");
  lines.push(`| Class | Pages | Occurrences |`, `| --- | --- | --- |`);
  for (const [c, v] of [...blockClassPages.entries()].sort((a, b) => b[1].pages - a[1].pages || a[0].localeCompare(b[0]))) {
    if (/^(property-[0-9a-f]{8}|pill-|bg-|color-)/.test(c)) continue;
    lines.push(`| \`${c}\` | ${v.pages} | ${v.total} |`);
  }
  lines.push("", "## Notes / known quirks", "");
  lines.push("- Crawl failures are stale sitemap entries (HTTP 404 on the live site); no content exists for them.");
  lines.push("- `properties` come from the page's own Notion record in the RSC flight payload (`propertyValues` + `propertySort`), not from the DOM — Super does not render a property table on pages. Names prefixed `super:` are Super.so meta-properties (description, slug). Hidden properties are included; see `propertySchema[].visibility`.");
  lines.push("- Collection items on listings expose both the visible card text (`props`) and structured values (`properties`, ISO dates) resolved through a global property-id → name map.");
  lines.push("- `super-embed:` code blocks (weather widget, Billetweb buttons) are rendered server-side as `div.super-embed`; their raw HTML is kept in `embeds[].rawHtml` and emitted as `<!-- embed:… -->` + link in Markdown.");
  lines.push("- Images are stored as the original upload (`/public` variant of images.spr.so); some originals are HEIC/AVIF and will need conversion. Favicons of external link mentions are skipped on purpose.");
  lines.push("- Notion databases are fully server-rendered here (no pagination observed); toggles and numbered lists do not occur on this site (rules exist but are untested).");
  lines.push("- `/sejours/entre-amis-aux-4-sources` and `/teams-buildings` are linked from the home page but 404 on the live site.");
  lines.push("");
  await writeFile(resolve(MIGRATION_DIR, "report.md"), lines.join("\n"));
  console.log(`wrote ${drafts.length} pages → ${relative(process.cwd(), PAGES_DIR)}, nav.json, report.md`);
  if (imageFailures.length) console.log(`image failures: ${imageFailures.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
