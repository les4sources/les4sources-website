#!/usr/bin/env bun
/**
 * Garde-fou SEO/GEO — tourne sur le `dist/` produit par `astro build`.
 * Site monolingue FR : aucune notion de locale, aucun hreflang.
 *
 * Sort en code 1 dès qu'une ERREUR est trouvée. Les AVERTISSEMENTS s'affichent
 * sans bloquer — on vise quand même zéro.
 *
 * Recettes :
 *  - <title> présent, unique, ≤ 60 caractères
 *  - meta description présente, unique, 50–160 caractères
 *  - <link rel="canonical"> présent
 *  - exactement un <h1> par page
 *  - chaque <img> porte un attribut alt
 *  - chaque bloc JSON-LD est du JSON valide
 *  - aucune trace de l'ancien hébergement (images.spr.so, super.so, notion.site)
 *  - aucun faux contenu (lorem, placeholder)
 *  - liens internes : voir la note sur la fenêtre de migration plus bas
 *
 * Usage : `astro build && bun run scripts/seo-check.ts`
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const DIST = "dist";
const URLS_FILE = "migration/urls.txt";
const TITLE_MAX = 60;
const DESC_MIN = 50;
const DESC_MAX = 160;

/** Hôtes de l'ancien site : leur présence dans dist/ signifie un hotlink oublié. */
const FORBIDDEN_HOSTS = ["images.spr.so", "super.so", "notion.site"];
/** Marqueurs de contenu bidon : le site ne doit contenir que du vrai texte. */
const FORBIDDEN_WORDS = ["lorem ipsum", "placeholder"];

type Issue = { page: string; msg: string };
const errors: Issue[] = [];
const warnings: Issue[] = [];
const err = (page: string, msg: string) => errors.push({ page, msg });
const warn = (page: string, msg: string) => warnings.push({ page, msg });

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

/** dist/sejours/tarifs/index.html → /sejours/tarifs ; dist/index.html → / */
function pagePath(file: string): string {
  const p = file
    .slice(DIST.length)
    .replace(/\\/g, "/")
    .replace(/\/index\.html$/, "")
    .replace(/\.html$/, "");
  return p === "" ? "/" : p;
}
function assetPath(file: string): string {
  return file.slice(DIST.length).replace(/\\/g, "/");
}

const all = await walk(DIST).catch(() => {
  console.error(`❌ Dossier "${DIST}" introuvable. Lance d'abord \`astro build\`.`);
  process.exit(1);
});

const htmlFiles = all.filter((f) => f.endsWith(".html"));
const pages = new Set(htmlFiles.map(pagePath));
const assets = new Set(all.filter((f) => !f.endsWith(".html")).map(assetPath));

/**
 * Les 209 URLs du site actuel sont un contrat. Tant que la migration du contenu
 * n'est pas terminée, la navigation pointe légitimement vers des pages qui
 * n'existent PAS ENCORE dans dist/ : ce n'est pas une faute de frappe, c'est un
 * chantier en cours — donc un avertissement. Un lien vers un chemin ABSENT de
 * urls.txt, lui, est une vraie erreur (typo ou URL inventée). Quand dist/
 * atteint la parité avec urls.txt, le contrôle redevient strict de lui-même.
 */
const contractedUrls = new Set(
  (await readFile(URLS_FILE, "utf8").catch(() => ""))
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("/")),
);
const migrationComplete = contractedUrls.size > 0 && [...contractedUrls].every((u) => pages.has(u));

/** Liens vers une URL du contrat pas encore migrée : agrégés par cible, pas par page. */
const pendingLinks = new Map<string, number>();

const titles = new Map<string, string[]>();
const descs = new Map<string, string[]>();

function linkOk(href: string): boolean {
  let h = href.split("#")[0]!.split("?")[0]!;
  if (!h.startsWith("/") || h.startsWith("//")) return true; // externe, ancre, protocole
  h = h.replace(/\/+$/, "") || "/";
  return pages.has(h) || assets.has(h);
}

for (const file of htmlFiles) {
  const page = pagePath(file);
  const html = await readFile(file, "utf8");

  const titleRaw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const descRaw = html.match(/<meta\s+name=["']description["']\s+content=(["'])([\s\S]*?)\1/i)?.[2];
  const canonical = /<link\s+rel=["']canonical["']/i.test(html);
  const noindex = /<meta\s+name=["']robots["'][^>]*noindex/i.test(html);

  // titre
  if (!titleRaw) err(page, "title manquant");
  else {
    const t = decode(titleRaw);
    if (!noindex && t.length > TITLE_MAX) err(page, `title trop long (${t.length} car. > ${TITLE_MAX})`);
    if (!noindex) (titles.get(t) ?? titles.set(t, []).get(t)!).push(page);
  }

  // description
  if (descRaw == null) err(page, "meta description manquante");
  else {
    const d = decode(descRaw);
    if (!noindex && (d.length < DESC_MIN || d.length > DESC_MAX))
      err(page, `description hors plage (${d.length} car., vise ${DESC_MIN}-${DESC_MAX})`);
    if (!noindex) (descs.get(d) ?? descs.set(d, []).get(d)!).push(page);
  }

  // canonical
  if (!canonical) err(page, "link canonical manquant");

  // un seul H1
  const h1s = html.match(/<h1\b/gi)?.length ?? 0;
  if (h1s === 0) err(page, "aucun <h1>");
  else if (h1s > 1) err(page, `${h1s} <h1> sur la page (un seul attendu)`);

  // images sans alt
  for (const img of html.match(/<img\b[^>]*>/gi) ?? []) {
    if (!/\salt\s*=/.test(img)) {
      err(page, `<img> sans attribut alt (${(img.match(/src=["']([^"']+)/)?.[1] ?? "?").split("/").pop()})`);
      break;
    }
  }

  // JSON-LD valide
  for (const b of html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? []) {
    const json = b.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
    try {
      JSON.parse(json);
    } catch {
      err(page, "JSON-LD invalide");
      break;
    }
  }

  // vestiges de l'ancien hébergement
  for (const host of FORBIDDEN_HOSTS) {
    if (html.includes(host)) err(page, `référence à l'ancien site : ${host}`);
  }

  // faux contenu
  const lower = html.toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    if (lower.includes(word)) err(page, `contenu factice détecté : « ${word} »`);
  }

  // liens internes
  const hrefs = [...html.matchAll(/<a\b[^>]*\shref=(["'])(.*?)\1/gi)].map((m) => decode(m[2]!));
  for (const h of [...new Set(hrefs)].filter((x) => !linkOk(x))) {
    const clean = h.split("#")[0]!.split("?")[0]!.replace(/\/+$/, "") || "/";
    const contracted = contractedUrls.has(clean);
    if (contracted && !migrationComplete) {
      // Même lien de navigation sur toutes les pages : on compte, on n'inonde pas.
      pendingLinks.set(clean, (pendingLinks.get(clean) ?? 0) + 1);
    } else {
      err(page, `lien interne cassé → ${h}`);
    }
  }
}

// liens en attente de migration, agrégés
for (const [target, count] of [...pendingLinks].sort((a, b) => b[1] - a[1])) {
  warn("(navigation)", `URL du contrat pas encore migrée, citée sur ${count} page(s) → ${target}`);
}

// doublons
for (const [t, ps] of titles) if (ps.length > 1) err(ps.sort().join(", "), `title dupliqué : « ${t} »`);
for (const [d, ps] of descs)
  if (ps.length > 1) err(ps.sort().join(", "), `description dupliquée : « ${d.slice(0, 60)}… »`);

// garde-fou : l'accueil ne doit jamais partir en noindex
const home = htmlFiles.find((f) => pagePath(f) === "/");
if (home && /<meta\s+name=["']robots["'][^>]*noindex/i.test(await readFile(home, "utf8"))) {
  err("/", "page d'accueil en noindex");
}

// rapport
const parity = contractedUrls.size
  ? ` · parité migration ${[...contractedUrls].filter((u) => pages.has(u)).length}/${contractedUrls.size}`
  : "";
console.log(`\n🔎 SEO check — ${htmlFiles.length} pages${parity}\n`);
if (warnings.length) {
  console.log(`⚠️  ${warnings.length} avertissement(s) :`);
  for (const w of warnings) console.log(`   ⚠️  ${w.page} — ${w.msg}`);
  console.log("");
}
if (errors.length) {
  console.log(`❌ ${errors.length} erreur(s) :`);
  for (const e of errors) console.log(`   ❌ ${e.page} — ${e.msg}`);
  console.log("\nÉchec du garde-fou SEO. Corrige les erreurs ci-dessus avant de merger.\n");
  process.exit(1);
}
console.log("✅ SEO check OK — aucune erreur bloquante.\n");
