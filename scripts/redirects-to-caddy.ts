#!/usr/bin/env bun
/**
 * Génère `deploy/Caddyfile` — les règles Caddy du site sur Hatchbox — à partir
 * de `public/_redirects` (format Cloudflare Pages, unique source de vérité des
 * redirections).
 *
 * Hatchbox sert une app statique avec Caddy (`root = current/public`,
 * `file_server`, compression) et accepte, par app, un Caddyfile personnalisé
 * dont les règles précèdent `%{default}`. Ce fichier est à coller dans
 * Hatchbox › app `les4sources-website` › Settings › Caddyfile. Il est COMMITÉ
 * (pour être relu et diffé) et vérifié à jour par `--check` (dans `verify` et
 * dans `.hatchbox/build`).
 *
 * Règles émises, dans l'ordre :
 *  - apex → www (origine canonique `https://www.les4sources.be`) ;
 *  - slash final retiré (`/foo/` → `/foo`, sauf la racine) ;
 *  - les redirections de `_redirects` (exactes ; jokers `/src/*` avec ou sans
 *    `:splat`) — première règle qui matche gagne, Caddy évalue dans l'ordre ;
 *  - `/_redirects` lui-même n'est pas servi ;
 *  - cache long sur les assets hachés d'Astro (`/_astro/*`) ;
 *  - `try_files` pour servir `/foo/index.html` sur `/foo` sans redirection ;
 *  - la page 404 du site.
 *
 * Usage : `bun run scripts/redirects-to-caddy.ts [--check] [source] [sortie]`
 *   défauts : public/_redirects → deploy/Caddyfile
 */
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const check = args.includes("--check");
const positional = args.filter((a) => a !== "--check");
const SRC = positional[0] ?? "public/_redirects";
const OUT = positional[1] ?? "deploy/Caddyfile";

const CANONICAL_HOST = "www.les4sources.be";
const APEX_HOST = "les4sources.be";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const raw = await readFile(SRC, "utf8");

const rules: string[] = [];
const warnings: string[] = [];
let count = 0;
let wildcard = 0;

for (const line of raw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) {
    warnings.push(`Ligne ignorée (format inattendu) : ${trimmed}`);
    continue;
  }
  const [source, target] = parts;
  const code = parts[2] ?? "301";
  const kind = code === "302" || code === "307" ? "temporary" : "permanent";

  if (!source.startsWith("/")) {
    warnings.push(`Source non absolue ignorée : ${source}`);
    continue;
  }

  if (source.endsWith("/*")) {
    wildcard += 1;
    const name = `w${wildcard}`;
    const base = escapeRe(source.slice(0, -2));
    rules.push(`@${name} path_regexp ${name} ^${base}/(.*)$`);
    const dest = target.includes(":splat") ? target.replace(":splat", `{re.${name}.1}`) : target;
    rules.push(`redir @${name} ${dest} ${kind}`);
  } else if (source.includes("*")) {
    warnings.push(`Joker non terminal non supporté, ignoré : ${source}`);
    continue;
  } else {
    rules.push(`redir ${source} ${target} ${kind}`);
  }
  count += 1;
}

const out = [
  "# GÉNÉRÉ par scripts/redirects-to-caddy.ts depuis public/_redirects — ne pas éditer à la main.",
  "# À coller dans Hatchbox › app les4sources-website › Settings › Caddyfile (les règles",
  "# précèdent %{default}, qui garde le root, la compression et le file_server d'Hatchbox).",
  "",
  "# Origine canonique : l'apex part vers www.",
  `@apex host ${APEX_HOST}`,
  `redir @apex https://${CANONICAL_HOST}{uri} permanent`,
  "",
  "# Slash final normalisé : /foo/ → /foo (la racine reste /).",
  "@trailing path_regexp trailing ^(.+)/$",
  "redir @trailing {re.trailing.1} permanent",
  "",
  `# Anciennes URLs (${count} règle${count > 1 ? "s" : ""}, public/_redirects).`,
  ...rules,
  "",
  "# Le fichier de règles n'a rien à faire en ligne.",
  "@rules path /_redirects",
  "respond @rules 404",
  "",
  "# Assets hachés d'Astro : cache long.",
  "@astro path /_astro/*",
  'header @astro Cache-Control "public, max-age=31536000, immutable"',
  "",
  "# Pages : /foo sert /foo/index.html sans redirection vers /foo/.",
  "try_files {path} {path}/index.html",
  "",
  "# Page 404 du site.",
  "handle_errors {",
  "  @notfound expression `{err.status_code} == 404`",
  "  rewrite @notfound /404.html",
  "  file_server",
  "}",
  "",
  "%{default}",
  "",
].join("\n");

if (check) {
  const current = await readFile(OUT, "utf8").catch(() => "");
  if (current !== out) {
    console.error(`✗ ${OUT} n'est pas à jour — lance \`bun run scripts/redirects-to-caddy.ts\` et commite.`);
    process.exit(1);
  }
  console.log(`✓ ${OUT} à jour (${count} redirection${count > 1 ? "s" : ""}).`);
} else {
  await writeFile(OUT, out, "utf8");
  console.log(`✓ ${count} redirection${count > 1 ? "s" : ""} écrite${count > 1 ? "s" : ""} dans ${OUT}`);
}
for (const w of warnings) console.warn(`⚠ ${w}`);
