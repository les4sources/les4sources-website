/**
 * Image URL normalisation (largest/original variant) and a cached downloader.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat, copyFile } from "node:fs/promises";
import { extname, resolve, basename } from "node:path";
import { BASE_URL } from "./common.ts";

const USER_AGENT = "les4sources-migration/1.0";
const TIMEOUT_MS = 30_000;

/** Return the original / largest variant of an image URL, absolute. */
export function normaliseImageUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let url = raw.trim();
  if (!url || url.startsWith("data:")) return null;
  // Next.js image optimiser wrapper → original
  if (url.startsWith("/_next/image") || url.includes("/_next/image?")) {
    try {
      const u = new URL(url, BASE_URL);
      const inner = u.searchParams.get("url");
      if (inner) url = inner;
    } catch {
      return null;
    }
  }
  if (url.startsWith("//")) url = "https:" + url;
  if (url.startsWith("/")) url = BASE_URL + url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  // Cloudflare imagedelivery: .../<account>/<imageId>/<name>/<variant> → /public
  if (u.hostname === "images.spr.so" && u.pathname.startsWith("/cdn-cgi/imagedelivery/")) {
    const parts = u.pathname.split("/").filter(Boolean); // cdn-cgi, imagedelivery, acct, id, name?, variant?
    if (parts.length >= 5) {
      const last = parts[parts.length - 1];
      if (/^(w=|h=|width=|quality=|public$|fit=)/.test(last) || last.includes(",")) parts[parts.length - 1] = "public";
      else parts.push("public");
      u.pathname = "/" + parts.join("/");
    }
    u.search = "";
    return u.toString();
  }
  // Unsplash & friends: strip sizing params
  if (u.hostname.endsWith("unsplash.com")) {
    for (const p of ["w", "h", "dpr", "q", "fit", "crop", "fm", "auto"]) u.searchParams.delete(p);
    return u.toString();
  }
  // Generic width params
  if (u.searchParams.has("w") || u.searchParams.has("width")) {
    for (const p of ["w", "h", "width", "height", "q", "quality", "dpr"]) u.searchParams.delete(p);
  }
  return u.toString();
}

/** Pick the largest candidate of a srcset attribute. */
export function largestFromSrcset(srcset: string | undefined | null): string | null {
  if (!srcset) return null;
  let best: { url: string; w: number } | null = null;
  for (const cand of srcset.split(/,(?=\s|https?:\/\/|\/)/)) {
    const [url, desc] = cand.trim().split(/\s+/);
    if (!url) continue;
    let w = 0;
    if (desc?.endsWith("w")) w = parseFloat(desc);
    else if (desc?.endsWith("x")) w = parseFloat(desc) * 1000;
    if (!best || w > best.w) best = { url, w };
  }
  return best?.url ?? null;
}

/** Skip favicons, tracking pixels, and other non-content images. */
export function isSkippableImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (/favicon|apple-touch-icon|\/tr\?|facebook\.com\/tr|pixel\.gif|1x1\.|spacer\.gif/.test(lower)) return true;
  if (/google-analytics|googletagmanager|doubleclick|\.svg\?.*tracking/.test(lower)) return true;
  return false;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/tiff": ".tif",
  "image/heic": ".heic",
};

export function urlHash(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 12);
}

/** Basename hint derived from the URL (without extension). */
export function basenameFromUrl(url: string): { base: string; ext: string } {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    let name = parts[parts.length - 1] ?? "image";
    if (u.hostname === "images.spr.so" && parts.length >= 5) name = parts[4] ?? parts[3]; // <name> segment
    if (u.hostname.endsWith("unsplash.com")) name = parts[parts.length - 1] ?? "unsplash";
    const ext = extname(name).toLowerCase();
    let base = ext ? name.slice(0, -ext.length) : name;
    base = decodeURIComponent(base)
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image";
    return { base, ext: /^\.(jpe?g|png|gif|webp|avif|svg|bmp|tiff?|heic)$/.test(ext) ? ext : "" };
  } catch {
    return { base: "image", ext: "" };
  }
}

export interface CachedImage {
  url: string;
  ok: boolean;
  file?: string; // path in cache (no extension)
  contentType?: string;
  bytes?: number;
  ext?: string;
  error?: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Download an image into the cache directory (idempotent). */
export async function downloadToCache(url: string, cacheDir: string, retries = 1): Promise<CachedImage> {
  await mkdir(cacheDir, { recursive: true });
  const h = urlHash(url);
  const file = resolve(cacheDir, h);
  const meta = resolve(cacheDir, h + ".json");
  if (await exists(meta)) {
    try {
      const cached = JSON.parse(await readFile(meta, "utf8")) as CachedImage;
      if (cached.ok && (await exists(file))) return cached;
    } catch {
      /* re-download */
    }
  }
  let lastError = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "image/*,*/*;q=0.8" }, signal: ctrl.signal, redirect: "follow" });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const ext = EXT_BY_TYPE[contentType] ?? basenameFromUrl(url).ext ?? "";
      if (!contentType.startsWith("image/") && !ext) {
        lastError = `not an image (${contentType || "unknown"})`;
        break;
      }
      await writeFile(file, buf);
      const result: CachedImage = { url, ok: true, file, contentType, bytes: buf.length, ext: ext || ".bin" };
      await writeFile(meta, JSON.stringify(result));
      return result;
    } catch (err) {
      lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    } finally {
      clearTimeout(timer);
    }
  }
  const failed: CachedImage = { url, ok: false, error: lastError };
  await writeFile(meta, JSON.stringify(failed));
  return failed;
}

/** Copy a cached image to its final destination (idempotent). */
export async function placeImage(cached: CachedImage, dest: string): Promise<void> {
  if (!cached.ok || !cached.file) return;
  if (await exists(dest)) return;
  await mkdir(resolve(dest, ".."), { recursive: true });
  await copyFile(cached.file, dest);
}

export { basename };
