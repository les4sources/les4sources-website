/**
 * crawl.ts — fetch every path of the current les4sources.be site (Super.so)
 * and store the raw server-rendered HTML for later extraction.
 *
 * Usage: bun scripts/migrate/crawl.ts [--force]
 *
 * - Input : migration/urls.txt (one path per line). If missing, the sitemap
 *           at https://www.les4sources.be/sitemap.xml is fetched and parsed.
 * - Output: $CRAWL_DIR/raw/<slug>.html (+ $CRAWL_DIR/crawl-log.json)
 * - Re-runnable: existing raw files are skipped unless --force is given.
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToSlug, BASE_URL, CRAWL_DIR, RAW_DIR, MIGRATION_DIR } from "./lib/common.ts";

const FORCE = process.argv.includes("--force");
const CONCURRENCY = 5;
const TIMEOUT_MS = 30_000;
const RETRIES = 2;
const USER_AGENT = "les4sources-migration/1.0";

interface CrawlResult {
  path: string;
  slug: string;
  file: string;
  status: "fetched" | "skipped" | "failed";
  httpStatus?: number;
  bytes?: number;
  error?: string;
  fetchedAt?: string;
  attempts?: number;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function loadPaths(): Promise<string[]> {
  const urlsFile = resolve(MIGRATION_DIR, "urls.txt");
  if (await exists(urlsFile)) {
    const txt = await readFile(urlsFile, "utf8");
    return normalisePaths(txt.split(/\r?\n/));
  }
  console.log(`urls.txt missing — fetching ${BASE_URL}/sitemap.xml`);
  const res = await fetch(`${BASE_URL}/sitemap.xml`, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`sitemap fetch failed: HTTP ${res.status}`);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1].trim());
  const paths = locs.map((u) => {
    try {
      return new URL(u).pathname;
    } catch {
      return u;
    }
  });
  const normalised = normalisePaths(paths);
  await mkdir(MIGRATION_DIR, { recursive: true });
  await writeFile(urlsFile, normalised.join("\n") + "\n");
  console.log(`wrote ${normalised.length} paths to ${urlsFile}`);
  return normalised;
}

function normalisePaths(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    let p = raw.trim();
    if (!p || p.startsWith("#")) continue;
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
    if (!p.startsWith("/")) p = "/" + p;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function crawlOne(path: string): Promise<CrawlResult> {
  const slug = pathToSlug(path);
  const file = resolve(RAW_DIR, `${slug}.html`);
  if (!FORCE && (await exists(file))) {
    return { path, slug, file, status: "skipped" };
  }
  const url = BASE_URL + path;
  let lastError = "";
  for (let attempt = 1; attempt <= RETRIES + 1; attempt++) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        // 4xx are not going to get better with a retry (except 429)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return { path, slug, file, status: "failed", httpStatus: res.status, error: lastError, attempts: attempt };
        }
        continue;
      }
      const html = await res.text();
      await writeFile(file, html, "utf8");
      return {
        path,
        slug,
        file,
        status: "fetched",
        httpStatus: res.status,
        bytes: Buffer.byteLength(html),
        fetchedAt: new Date().toISOString(),
        attempts: attempt,
      };
    } catch (err) {
      lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
    // small backoff before retrying
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  return { path, slug, file, status: "failed", error: lastError, attempts: RETRIES + 1 };
}

async function runPool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  const paths = await loadPaths();
  console.log(`crawling ${paths.length} paths → ${RAW_DIR} (force=${FORCE})`);
  const started = Date.now();
  let done = 0;
  const results = await runPool(paths, CONCURRENCY, async (p) => {
    const r = await crawlOne(p);
    done++;
    const tag = r.status === "fetched" ? `${r.bytes} B` : r.status === "skipped" ? "skip" : `FAIL ${r.error}`;
    console.log(`[${String(done).padStart(3)}/${paths.length}] ${r.status.padEnd(7)} ${p}  ${tag}`);
    return r;
  });
  const summary = {
    baseUrl: BASE_URL,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    total: results.length,
    fetched: results.filter((r) => r.status === "fetched").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
  await writeFile(resolve(CRAWL_DIR, "crawl-log.json"), JSON.stringify(summary, null, 2));
  console.log(`\nfetched=${summary.fetched} skipped=${summary.skipped} failed=${summary.failed} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (summary.failed) {
    console.log("failures:");
    for (const r of results.filter((r) => r.status === "failed")) console.log(`  ${r.path}  ${r.error}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
