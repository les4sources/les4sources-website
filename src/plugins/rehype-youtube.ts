/**
 * Vidéos YouTube en « façade ».
 *
 * Une iframe YouTube charge ~1 Mo de scripts et pose des cookies dès
 * l'affichage de la page, que le visiteur lance la vidéo ou non. Ce greffon la
 * remplace par sa vignette locale (`public/youtube/<id>.jpg`, voir
 * `scripts/youtube-thumbnails.ts`) et un bouton lecture : l'iframe — sur
 * youtube-nocookie.com — n'est créée qu'au clic (script `data-yt`, BaseLayout).
 * Sans JavaScript, le lien ouvre la vidéo sur YouTube.
 *
 * Sans vignette locale, l'iframe est laissée telle quelle : rien ne casse.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Element, Root } from "hast";

interface Node {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const hasThumbnail = (id: string) => existsSync(join(process.cwd(), "public", "youtube", `${id}.jpg`));

/** La façade en HTML, pour les iframes arrivées en HTML brut dans le Markdown. */
function facadeHtml(el: Element): string {
  const p = el.properties as Record<string, string>;
  const img = (el.children[0] as Element).properties as Record<string, string | number>;
  const label = String(p.dataYtTitle);
  return (
    `<a class="yt-facade" href="${escapeHtml(String(p.href))}" data-yt="${escapeHtml(String(p.dataYt))}" data-yt-title="${escapeHtml(label)}">` +
    `<img src="${img.src}" alt="" width="${img.width}" height="${img.height}" loading="lazy" decoding="async">` +
    `<span class="yt-play" aria-hidden="true"></span>` +
    `<span class="yt-label">Lire la vidéo · ${escapeHtml(label)}</span></a>`
  );
}

const RAW_IFRAME = /<iframe\b[^>]*>\s*<\/iframe>/gi;
const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1]?.replace(/&amp;/g, "&");

const EMBED = /^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})(?:\?(.*))?$/;

function facade(id: string, query: string, title: string): Element {
  const params = new URLSearchParams(query.replace(/&amp;/g, "&"));
  params.set("autoplay", "1");
  const start = params.get("start");
  const label = title && !/^www\.youtube\.com$/i.test(title) ? title : "Vidéo";
  return {
    type: "element",
    tagName: "a",
    properties: {
      className: ["yt-facade"],
      href: `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}`,
      dataYt: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`,
      dataYtTitle: label,
    },
    children: [
      {
        type: "element",
        tagName: "img",
        properties: {
          src: `/youtube/${id}.jpg`,
          alt: "",
          width: 960,
          height: 540,
          loading: "lazy",
          decoding: "async",
        },
        children: [],
      },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["yt-play"], ariaHidden: "true" },
        children: [],
      },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["yt-label"] },
        children: [{ type: "text", value: `Lire la vidéo · ${label}` }],
      },
    ],
  };
}

export default function rehypeYoutube() {
  return (tree: Root) => {
    const visit = (node: Node) => {
      const children = node.children;
      if (!children) return;
      children.forEach((child, i) => {
        if (child.type === "element" && child.tagName === "iframe") {
          const src = String(child.properties?.src ?? "");
          const m = src.match(EMBED);
          if (m && hasThumbnail(m[1])) {
            children[i] = facade(m[1], m[2] ?? "", String(child.properties?.title ?? "")) as Node;
            return;
          }
        }
        // Le HTML écrit dans le Markdown arrive ici encore brut (rehype-raw passe après).
        if (child.type === "raw" && child.value?.includes("<iframe")) {
          child.value = child.value.replace(RAW_IFRAME, (tag) => {
            const m = (attr(tag, "src") ?? "").match(EMBED);
            return m && hasThumbnail(m[1]) ? facadeHtml(facade(m[1], m[2] ?? "", attr(tag, "title") ?? "")) : tag;
          });
          return;
        }
        visit(child);
      });
    };
    visit(tree as unknown as Node);
  };
}
