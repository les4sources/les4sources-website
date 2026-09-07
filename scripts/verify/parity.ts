#!/usr/bin/env bun
/**
 * Parité avec l'ancien site (ISA ISC-6, ISC-7, ISC-9).
 *
 * Pour chaque page extraite dans migration/pages/<slug>.json :
 *   1. le path existe dans dist/ (dist/<path>/index.html, ou dist/index.html pour "/") ;
 *   2. le H1 de l'ancienne page apparaît dans la nouvelle ;
 *   3. ≥ SEUIL des phrases significatives (≥ 25 caractères) du Markdown migré
 *      se retrouvent dans le texte de la page construite ;
 *   4. chaque embed (iframe/vidéo/tally/carte) de l'ancienne page est présent (src).
 *
 * Usage : bun scripts/verify/parity.ts [--threshold 0.95] [--json rapport.json] [--verbose]
 * Sortie : tableau récapitulatif + exit 1 si une page manque ou passe sous le seuil.
 * Les exceptions assumées se déclarent dans scripts/verify/parity.exceptions.json
 * ({ "<path>": "raison" }) — elles sont listées mais ne font pas échouer.
 */
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const PAGES = join(ROOT, "migration/pages");
const DIST = join(ROOT, "dist");
const args = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const THRESHOLD = Number(opt("--threshold", "0.95"));
const JSON_OUT = opt("--json");
const VERBOSE = args.includes("--verbose");
const exceptionsPath = join(ROOT, "scripts/verify/parity.exceptions.json");
const exceptions: Record<string, string> = existsSync(exceptionsPath)
  ? JSON.parse(await Bun.file(exceptionsPath).text())
  : {};

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
  "&nbsp;": " ", "&#160;": " ", "&#8217;": "’", "&#8216;": "‘", "&#8220;": "“", "&#8221;": "”",
  "&eacute;": "é", "&egrave;": "è", "&agrave;": "à", "&ccedil;": "ç", "&ecirc;": "ê", "&ocirc;": "ô",
};

/** Texte brut normalisé d'un HTML : sans scripts/styles/balises, entités décodées, espaces et guillemets unifiés. */
function htmlToText(html: string): string {
  return normalize(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      // Balises en ligne : aucune espace insérée (un lien en milieu de mot ne coupe pas le mot).
      .replace(/<\/?(a|b|i|em|strong|u|s|span|code|small|sup|sub|mark|abbr)\b[^>]*>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " "),
  );
}

function normalize(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[   ]/g, " ")
    .replace(/…/g, "...")
    .replace(/[–—]/g, "-")
    .replace(/\\([\\`*_{}\[\]()#+\-.!|>~])/g, "$1") // échappements Markdown (tableaux, parenthèses)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?)])/g, "$1") // pas d'espace avant la ponctuation (artefact du gras/lien)
    .replace(/\(\s+/g, "(")
    .trim()
    .toLowerCase();
}

/** Phrases significatives du Markdown migré (hors frontmatter, balises, liens d'image, commentaires). */
function sentencesOf(markdown: string): string[] {
  const body = markdown
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)(\{[^}]*\})?/g, "$1")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/[#>*_`|~]+/g, " ")
    .replace(/^\s*[-+]\s+/gm, " ")
    .replace(/^\s*\d+\.\s+/gm, " ");
  const out: string[] = [];
  for (const raw of body.split(/(?<=[.!?…])\s+|\n+/)) {
    const s = normalize(raw);
    if (s.length >= 25 && /[a-zà-ü]/i.test(s)) out.push(s);
  }
  return [...new Set(out)];
}

function distFileFor(path: string): string {
  const clean = path.replace(/\/+$/, "");
  return clean === "" ? join(DIST, "index.html") : join(DIST, clean, "index.html");
}

type Row = {
  path: string; exists: boolean; h1: boolean; total: number; found: number; ratio: number;
  embedsTotal: number; embedsFound: number; missing: string[]; exception?: string; pass: boolean;
};

const rows: Row[] = [];
const files = readdirSync(PAGES).filter((f) => f.endsWith(".json")).sort();
if (files.length === 0) {
  console.error(`Aucune page dans ${PAGES} — lancer d'abord bun run migrate:extract`);
  process.exit(2);
}

for (const f of files) {
  const page = JSON.parse(await Bun.file(join(PAGES, f)).text());
  const path: string = page.path;
  const file = distFileFor(path);
  const exists = existsSync(file);
  const text = exists ? htmlToText(await Bun.file(file).text()) : "";
  const html = exists ? await Bun.file(file).text() : "";
  const sentences = sentencesOf(page.markdown ?? "");
  const missing = sentences.filter((s) => !text.includes(s));
  const found = sentences.length - missing.length;
  const ratio = sentences.length === 0 ? 1 : found / sentences.length;
  const h1 = page.h1 ? text.includes(normalize(page.h1)) : true;
  const embeds: { src: string }[] = (page.embeds ?? []).filter((e: any) => e?.src);
  // Astro ré-encode `&` en `&#x26;` dans les attributs du HTML brut : on compare sur une forme décodée.
  const htmlDecoded = html.replace(/&#x26;/gi, "&").replace(/&#38;/g, "&").replace(/&amp;/g, "&");
  const embedsFound = embeds.filter((e) => htmlDecoded.includes(e.src)).length;
  const exception = exceptions[path];
  const pass = exists && h1 && ratio >= THRESHOLD && embedsFound === embeds.length;
  rows.push({ path, exists, h1, total: sentences.length, found, ratio, embedsTotal: embeds.length, embedsFound, missing: missing.slice(0, 5), exception, pass: pass || Boolean(exception) });
}

const failing = rows.filter((r) => !r.pass);
const excepted = rows.filter((r) => r.exception);
const pct = (n: number) => `${Math.round(n * 100)}%`;

console.log(`\nParité ancien site → dist/ (seuil ${pct(THRESHOLD)}) — ${rows.length} pages`);
console.log(`  présentes : ${rows.filter((r) => r.exists).length}/${rows.length}`);
console.log(`  H1 ok     : ${rows.filter((r) => r.h1).length}/${rows.length}`);
console.log(`  texte ≥ seuil : ${rows.filter((r) => r.ratio >= THRESHOLD).length}/${rows.length}`);
console.log(`  embeds    : ${rows.reduce((a, r) => a + r.embedsFound, 0)}/${rows.reduce((a, r) => a + r.embedsTotal, 0)}`);
if (excepted.length) console.log(`  exceptions assumées : ${excepted.length}`);

const problems = rows.filter((r) => !(r.exists && r.h1 && r.ratio >= THRESHOLD && r.embedsFound === r.embedsTotal));
if (problems.length) {
  console.log(`\n${problems.length} page(s) à regarder :`);
  for (const r of problems) {
    const why = [
      !r.exists && "absente de dist/",
      r.exists && !r.h1 && "H1 introuvable",
      r.exists && r.ratio < THRESHOLD && `texte ${r.found}/${r.total} (${pct(r.ratio)})`,
      r.exists && r.embedsFound < r.embedsTotal && `embeds ${r.embedsFound}/${r.embedsTotal}`,
    ].filter(Boolean).join(", ");
    console.log(`  ${r.exception ? "~" : "✗"} ${r.path} — ${why}${r.exception ? ` [exception : ${r.exception}]` : ""}`);
    if (VERBOSE && r.missing.length) for (const m of r.missing) console.log(`      · ${m.slice(0, 110)}`);
  }
}

if (JSON_OUT) await Bun.write(JSON_OUT, JSON.stringify(rows, null, 2));
if (failing.length) {
  console.log(`\n✗ ${failing.length} page(s) sous le seuil ou absentes.`);
  process.exit(1);
}
console.log(`\n✓ Parité OK.`);
