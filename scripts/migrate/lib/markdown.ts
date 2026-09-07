/**
 * HTML → Markdown for Super.so / Notion pages.
 *
 * Two stages:
 *  1. `cleanContentRoot`   — strips chrome (breadcrumbs, TOC, svg, scripts…), decodes
 *                            Cloudflare-obfuscated e-mails, normalises <img src>, drops
 *                            inline styles. Output = faithful `contentHtml`.
 *  2. `htmlToMarkdown`     — restructures a copy of that HTML for Markdown (heading
 *                            shift, callouts → blockquote, toggles → details…) and runs
 *                            turndown with custom rules.
 */
import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import TurndownService from "turndown";
import { largestFromSrcset, normaliseImageUrl } from "./images.ts";

// ---------------------------------------------------------------------------
// Cloudflare e-mail obfuscation
// ---------------------------------------------------------------------------

export function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]{4,}$/i.test(hex)) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

/** Decode every obfuscated e-mail in the document (links + text). */
export function decodeCfEmails($: CheerioAPI): void {
  $("span.__cf_email__[data-cfemail]").each((_, el) => {
    const email = decodeCfEmail($(el).attr("data-cfemail") ?? "");
    if (email) $(el).replaceWith(email.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
  });
  $("a[href*='/cdn-cgi/l/email-protection']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const hash = href.split("#")[1];
    const email = hash ? decodeCfEmail(hash) : null;
    if (email) $(el).attr("href", `mailto:${email}`);
    else $(el).attr("href", "mailto:");
  });
}

// ---------------------------------------------------------------------------
// Stage 1 — cleaning
// ---------------------------------------------------------------------------

const CHROME_SELECTORS = [
  ".notion-breadcrumb",
  ".notion-table-of-contents",
  ".notion-heading__anchor",
  ".notion-collection__header-wrapper",
  ".notion-embed__loader",
  ".super-badge",
  "[class*='made-with']",
  "script",
  "style",
  "svg",
  "template",
  "noscript",
].join(", ");

const IMG_ATTRS_TO_DROP = ["srcset", "srcSet", "sizes", "decoding", "loading", "data-nimg", "width", "height", "style"];

/** Rewrite <img> to point at the original/largest asset. Returns the URL or null. */
export function rewriteImg($: CheerioAPI, el: Element): string | null {
  const $img = $(el);
  const candidate = largestFromSrcset($img.attr("srcset") ?? $img.attr("srcSet")) ?? $img.attr("src") ?? "";
  const url = normaliseImageUrl(candidate) ?? normaliseImageUrl($img.attr("src"));
  for (const a of IMG_ATTRS_TO_DROP) $img.removeAttr(a);
  if (url) $img.attr("src", url);
  else $img.remove();
  return url;
}

/** Clean the content root in place (expects a detached clone). */
export function cleanContentRoot($: CheerioAPI, $root: Cheerio<Element>): void {
  $root.find(CHROME_SELECTORS).remove();
  // empty spacer paragraphs
  $root.find("div.notion-text, p.notion-text").each((_, el) => {
    const $el = $(el);
    if ($el.children().length === 0 && $el.text().trim() === "") $el.remove();
  });
  $root.find("img").each((_, el) => {
    rewriteImg($, el);
  });
  // keep column widths as data attributes before stripping styles
  $root.find(".notion-column").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    const m = style.match(/width:\s*([^;]+)/);
    if (m) {
      const ratio = m[1].match(/\*\s*([0-9.]+)\s*\)\s*$/);
      $(el).attr("data-width", ratio ? `${(parseFloat(ratio[1]) * 100).toFixed(1).replace(/\.0$/, "")}%` : m[1].trim());
    }
  });
  $root.find("[style]").removeAttr("style");
  $root.find("[data-server-link]").removeAttr("data-server-link");
  $root.find("iframe").each((_, el) => {
    for (const a of ["style", "loading", "allow", "allowfullscreen", "frameborder", "scrolling"]) $(el).removeAttr(a);
  });
}

// ---------------------------------------------------------------------------
// Embeds
// ---------------------------------------------------------------------------

export type EmbedKind = "iframe" | "video" | "bookmark" | "tally" | "map" | "file" | "other";

export interface Embed {
  kind: EmbedKind;
  src: string;
  title: string;
  description?: string;
  rawHtml?: string;
}

export function embedKindForUrl(src: string): EmbedKind {
  const s = src.toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com|dailymotion|loom\.com/.test(s)) return "video";
  if (/google\.[a-z.]+\/maps|openstreetmap|maps\.app/.test(s)) return "map";
  if (/tally\.so/.test(s)) return "tally";
  return "iframe";
}

/** Collect embeds from a cleaned content root (order = document order). */
export function collectEmbeds($: CheerioAPI, $root: Cheerio<Element>): Embed[] {
  const out: Embed[] = [];
  $root.find(".notion-embed, .notion-bookmark, .super-embed, .notion-file, iframe").each((_, el) => {
    const $el = $(el);
    // avoid double-counting iframes that live inside .notion-embed / .super-embed
    if (el.tagName === "iframe" && $el.closest(".notion-embed, .super-embed").length) return;
    if ($el.hasClass("notion-embed") || el.tagName === "iframe") {
      const $ifr = el.tagName === "iframe" ? $el : $el.find("iframe").first();
      const src = $ifr.attr("src") ?? "";
      if (!src) return;
      out.push({ kind: embedKindForUrl(src), src, title: $ifr.attr("title") ?? hostOf(src) });
    } else if ($el.hasClass("notion-bookmark")) {
      const $a = $el.find("a").first();
      const src = $a.attr("href") ?? "";
      out.push({
        kind: "bookmark",
        src,
        title: $el.find(".notion-bookmark__title").text().trim() || hostOf(src),
        description: $el.find(".notion-bookmark__description").text().trim() || undefined,
      });
    } else if ($el.hasClass("notion-file")) {
      out.push({ kind: "file", src: $el.attr("href") ?? "", title: $el.find(".notion-file__title").text().trim() });
    } else if ($el.hasClass("super-embed")) {
      const $ifr = $el.find("iframe").first();
      const $a = $el.find("a[href]").first();
      const src = $ifr.attr("src") ?? $a.attr("href") ?? $el.find("[src]").first().attr("src") ?? "";
      const kind: EmbedKind = $ifr.length ? (embedKindForUrl(src) === "iframe" ? "other" : embedKindForUrl(src)) : "other";
      out.push({ kind, src, title: $a.text().trim() || $ifr.attr("title") || hostOf(src) || "super-embed", rawHtml: $el.html()?.trim() });
    }
  });
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Stage 2 — Markdown
// ---------------------------------------------------------------------------

export interface MarkdownOptions {
  /** original image URL → local path relative to migration/ */
  resolveImage: (url: string) => string | null;
  /** pre-rendered markdown for each `.notion-collection` in document order */
  collectionMarkdown: string[];
  /** the content root itself is a collection (collection pages) */
  rootIsCollection?: boolean;
}

/** Restructure cleaned HTML for turndown. */
function prepareForMarkdown(html: string, opts: MarkdownOptions): string {
  const $ = load(opts.rootIsCollection ? `<div class="notion-collection">${html}</div>` : html, null, false);
  // heading shift: Notion h1/h2/h3 → h2/h3/h4
  for (const [from, to] of [
    ["h3", "h4"],
    ["h2", "h3"],
    ["h1", "h2"],
  ]) {
    $(`${from}.notion-heading`).each((_, el) => {
      (el as Element).tagName = to;
    });
  }
  // collections → placeholders
  let ci = 0;
  $(".notion-collection").each((_, el) => {
    // nested collections inside a collection are not expected; keep outermost only
    if ($(el).parents(".notion-collection").length) return;
    $(el).replaceWith(`<div class="md-collection" data-index="${ci++}">collection</div>`);
  });
  // callouts → blockquote with emoji/icon prefix
  $(".notion-callout").each((_, el) => {
    const $el = $(el);
    const $icon = $el.find("> .notion-callout__icon").first();
    let iconMd = "";
    const $iconImg = $icon.find("img").first();
    if ($iconImg.length) {
      const src = $iconImg.attr("src") ?? "";
      iconMd = `![${$iconImg.attr("alt") ?? ""}](${opts.resolveImage(src) ?? src})`;
    } else iconMd = $icon.text().trim();
    const $content = $el.find("> .notion-callout__content").first();
    const $bq = $("<blockquote class=\"notion-callout\"></blockquote>");
    // flatten: inline spans become paragraphs
    let first = true;
    $content.contents().each((_, node) => {
      const $n = $(node);
      let $block: Cheerio<AnyNode>;
      if (node.type === "text") {
        if (!$n.text().trim()) return;
        $block = $("<p></p>").text($n.text());
      } else if (node.type === "tag" && ["span", "a", "strong", "em", "b", "i", "u", "code"].includes((node as Element).tagName)) {
        if (!$n.text().trim() && !$n.find("img").length) return;
        $block = $("<p></p>").append($n.clone());
      } else $block = $n.clone();
      if (first && iconMd) {
        const $p = $block.is("p") ? $block : $block.find("p").first();
        if ($p.length) $p.prepend(`<span class="callout-icon">${escapeHtml(iconMd)} </span>`);
        else $bq.append(`<p><span class="callout-icon">${escapeHtml(iconMd)}</span></p>`);
        first = false;
      }
      $bq.append($block);
    });
    if (first && iconMd) $bq.append(`<p><span class="callout-icon">${escapeHtml(iconMd)}</span></p>`);
    $el.replaceWith($bq);
  });
  // toggles (Super renders <details> or .notion-toggle) → details/summary
  $(".notion-toggle").each((_, el) => {
    const $el = $(el);
    if ((el as Element).tagName === "details") return;
    const $trigger = $el.find("> .notion-toggle__trigger, > .notion-toggle__summary, > summary").first();
    const $content = $el.find("> .notion-toggle__content, > .notion-toggle__children").first();
    const $d = $("<details></details>");
    $d.append(`<summary>${$trigger.html() ?? ""}</summary>`);
    $d.append($content.length ? $content.contents().clone() : $el.contents().not($trigger).clone());
    $el.replaceWith($d);
  });
  return $.html();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mdEscapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n+/g, "<br>").trim();
}

function domText(node: any): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function hasClass(node: any, cls: string): boolean {
  return !!node?.classList?.contains?.(cls);
}

export function createTurndown(opts: MarkdownOptions): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
    hr: "---",
  });

  const imageMd = (img: any): string => {
    if (!img) return "";
    const src = img.getAttribute("src") ?? "";
    if (!src) return "";
    const alt = (img.getAttribute("alt") ?? "").replace(/\s+/g, " ").trim();
    return `![${alt}](${opts.resolveImage(src) ?? src})`;
  };

  // --- generic (lowest priority, added first) ---
  td.addRule("img", {
    filter: "img",
    replacement: (_c, node) => imageMd(node),
  });
  td.addRule("underline", {
    filter: "u",
    replacement: (content) => (content.trim() ? `<u>${content}</u>` : ""),
  });
  td.addRule("strike", {
    filter: ["s", "del"] as any,
    replacement: (content) => (content.trim() ? `~~${content}~~` : ""),
  });
  td.addRule("divider", {
    filter: (node) => hasClass(node, "notion-divider") || node.nodeName === "HR",
    replacement: () => "\n\n---\n\n",
  });
  td.addRule("lineBreak", { filter: "br", replacement: () => "  \n" });

  // --- blocks ---
  td.addRule("notionImage", {
    filter: (node) => hasClass(node, "notion-image"),
    replacement: (_c, node: any) => {
      const img = node.querySelector("img");
      const md = imageMd(img);
      if (!md) return "";
      const cap = domText(node.querySelector(".notion-caption"));
      return `\n\n${md}${cap ? `\n*${cap}*` : ""}\n\n`;
    },
  });
  td.addRule("notionEmbed", {
    filter: (node) => hasClass(node, "notion-embed") || node.nodeName === "IFRAME",
    replacement: (_c, node: any) => {
      const ifr = node.nodeName === "IFRAME" ? node : node.querySelector("iframe");
      const src = ifr?.getAttribute("src") ?? "";
      if (!src) return "";
      const kind = embedKindForUrl(src);
      const title = ifr?.getAttribute("title") || hostOf(src);
      return `\n\n<!-- embed:${kind} src="${src}" -->\n[${title}](${src})\n\n`;
    },
  });
  td.addRule("superEmbed", {
    filter: (node) => hasClass(node, "super-embed"),
    replacement: (_c, node: any) => {
      const ifr = node.querySelector("iframe");
      const a = node.querySelector("a[href]");
      const src = ifr?.getAttribute("src") ?? a?.getAttribute("href") ?? "";
      if (!src) return "";
      const k = ifr ? embedKindForUrl(src) : "other";
      const kind = k === "iframe" ? "other" : k;
      const title = domText(a) || ifr?.getAttribute("title") || hostOf(src);
      return `\n\n<!-- embed:${kind} src="${src}" -->\n[${title}](${src})\n\n`;
    },
  });
  td.addRule("bookmark", {
    filter: (node) => hasClass(node, "notion-bookmark"),
    replacement: (_c, node: any) => {
      const a = node.querySelector("a[href]");
      const href = a?.getAttribute("href") ?? "";
      const title = domText(node.querySelector(".notion-bookmark__title")) || hostOf(href);
      const desc = domText(node.querySelector(".notion-bookmark__description"));
      return `\n\n<!-- embed:bookmark src="${href}" -->\n[${title}](${href})${desc ? ` — ${desc}` : ""}\n\n`;
    },
  });
  td.addRule("file", {
    filter: (node) => hasClass(node, "notion-file"),
    replacement: (_c, node: any) => {
      const href = node.getAttribute("href") ?? "";
      const title = domText(node.querySelector(".notion-file__title")) || hostOf(href);
      const size = domText(node.querySelector(".notion-file__size"));
      return `\n\n<!-- embed:file src="${href}" -->\n[${title}${size ? ` (${size})` : ""}](${href})\n\n`;
    },
  });
  td.addRule("button", {
    filter: (node) => hasClass(node, "notion-button"),
    replacement: (_c, node: any) => {
      const a = node.querySelector("a") ?? node;
      const href = a.getAttribute("href") ?? "";
      const icon = domText(node.querySelector(".notion-button__icon"));
      const label = domText(a.querySelector(".notion-semantic-string")) || domText(a);
      const text = [icon, label].filter(Boolean).join(" ");
      return `\n\n[${text}](${href}){.button}\n\n`;
    },
  });
  td.addRule("pageLink", {
    filter: (node) => node.nodeName === "A" && hasClass(node, "notion-page"),
    replacement: (_c, node: any) => {
      const href = node.getAttribute("href") ?? "";
      const iconEl = hasClass(node, "link-mention") ? null : node.querySelector(".notion-page__icon");
      const iconImg = iconEl?.querySelector("img");
      const icon = iconImg ? imageMd(iconImg) : domText(iconEl);
      const title = domText(node.querySelector(".notion-page__title")) || domText(node);
      return `\n\n[${[icon, title].filter(Boolean).join(" ")}](${href})\n\n`;
    },
  });
  td.addRule("columnList", {
    filter: (node) => hasClass(node, "notion-column-list"),
    replacement: (content) => `\n\n<!-- columns -->\n${content.trim()}\n<!-- /columns -->\n\n`,
  });
  td.addRule("column", {
    filter: (node) => hasClass(node, "notion-column"),
    replacement: (content, node: any) => {
      const w = node.getAttribute("data-width");
      return `\n\n<!-- column${w ? ` width="${w}"` : ""} -->\n\n${content.trim()}\n\n`;
    },
  });
  td.addRule("details", {
    filter: "details" as any,
    replacement: (content, node: any) => {
      const summary = domText(node.querySelector("summary"));
      // strip the summary text turndown already emitted at the start of content
      let body = content;
      if (summary && body.trimStart().startsWith(summary)) body = body.trimStart().slice(summary.length);
      return `\n\n<details>\n<summary>${summary}</summary>\n\n${body.trim()}\n\n</details>\n\n`;
    },
  });
  td.addRule("summary", {
    filter: "summary" as any,
    replacement: (content) => content,
  });
  td.addRule("table", {
    filter: "table",
    replacement: (_c, node: any) => {
      const rows: string[][] = [];
      for (const tr of Array.from(node.querySelectorAll("tr")) as any[]) {
        const cells = Array.from(tr.children).filter((c: any) => c.nodeName === "TD" || c.nodeName === "TH") as any[];
        rows.push(cells.map((c) => mdEscapeCell(cellMarkdown(c))));
      }
      if (!rows.length) return "";
      const width = Math.max(...rows.map((r) => r.length));
      for (const r of rows) while (r.length < width) r.push("");
      const hasHeader = hasClass(node, "col-header") || node.querySelector("thead, th");
      const header = hasHeader ? rows.shift()! : new Array(width).fill("");
      const lines = [`| ${header.join(" | ")} |`, `| ${new Array(width).fill("---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)];
      return `\n\n${lines.join("\n")}\n\n`;
    },
  });
  td.addRule("collection", {
    filter: (node) => hasClass(node, "md-collection"),
    replacement: (_c, node: any) => {
      const i = Number(node.getAttribute("data-index"));
      return `\n\n${opts.collectionMarkdown[i] ?? ""}\n\n`;
    },
  });
  td.addRule("highlight", {
    filter: (node) => node.nodeName === "SPAN" && hasClass(node, "highlighted-color"),
    replacement: (content) => content,
  });
  td.addRule("calloutIcon", {
    filter: (node) => node.nodeName === "SPAN" && hasClass(node, "callout-icon"),
    replacement: (_c, node: any) => domText(node) + " ",
  });

  // inline cell markdown: minimal (bold/italic/links) via a nested service
  const cellTd = new TurndownService({ emDelimiter: "*", strongDelimiter: "**", linkStyle: "inlined" });
  cellTd.addRule("img", { filter: "img", replacement: (_c, n) => imageMd(n) });
  cellTd.addRule("br", { filter: "br", replacement: () => "\n" });
  function cellMarkdown(cell: any): string {
    return cellTd.turndown(cell.innerHTML ?? "").trim();
  }
  return td;
}

export function htmlToMarkdown(contentHtml: string, opts: MarkdownOptions): string {
  const prepared = prepareForMarkdown(contentHtml, opts);
  const td = createTurndown(opts);
  let md = td.turndown(prepared);
  md = md
    .replace(/^(\s*)-   /gm, "$1- ")
    .replace(/^(>\s*\S+) {2,}/gm, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim() + "\n";
  return md;
}
