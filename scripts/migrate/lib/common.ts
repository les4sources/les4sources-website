/** Shared constants and helpers for the migration scripts. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const BASE_URL = "https://www.les4sources.be";
export const REPO_DIR = resolve(HERE, "..", "..", "..");
export const MIGRATION_DIR = resolve(REPO_DIR, "migration");
export const CRAWL_DIR =
  process.env.CRAWL_DIR ?? resolve(process.env.HOME ?? "~", ".claude", "jobs", "ba6bda30", "tmp", "crawl");
export const RAW_DIR = resolve(CRAWL_DIR, "raw");

/** `/sejours/tarifs` → `sejours__tarifs`, `/` → `index`. */
export function pathToSlug(path: string): string {
  const p = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return p === "" ? "index" : p.replace(/\//g, "__");
}

/** `sejours__tarifs` → `/sejours/tarifs`, `index` → `/`. */
export function slugToPath(slug: string): string {
  return slug === "index" ? "/" : "/" + slug.replace(/__/g, "/");
}
