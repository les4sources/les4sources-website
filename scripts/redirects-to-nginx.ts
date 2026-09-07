#!/usr/bin/env bun
/**
 * Convertit `public/_redirects` (format Cloudflare Pages) en config nginx.
 *
 * Le site est servi par nginx (conteneur), qui n'honore
 * PAS le fichier `_redirects` (spécifique à Cloudflare Pages). Ce script rejoue
 * fidèlement les règles — les normalisations et les 301 des anciennes URLs — sous forme de blocs `location` nginx, générés au build (Docker).
 *
 * `_redirects` reste l'unique source de vérité : ce fichier n'est jamais commité,
 * il est régénéré à chaque build.
 *
 * Sémantique respectée :
 *  - Correspondance exacte (sans `*`)      → `location = /src` (priorité nginx max).
 *  - Joker `/src/*` avec `:splat` en cible → `location ~ ^/src/(.*)$` + `$1`.
 *  - Joker `/src/*` sans `:splat`          → `location ~ ^/src/` → cible fixe.
 *  - « Première règle qui matche gagne » : les blocs regex sont émis dans l'ordre
 *    du fichier (nginx évalue les regex dans l'ordre d'apparition) ; les exactes
 *    passent avant grâce à la priorité de `location =`.
 *
 * Usage : `bun run scripts/redirects-to-nginx.ts [source] [sortie]`
 *   défauts : public/_redirects → nginx-redirects.conf
 */
import { readFile, writeFile } from "node:fs/promises";

const SRC = process.argv[2] ?? "public/_redirects";
const OUT = process.argv[3] ?? "nginx-redirects.conf";

// Échappe les métacaractères regex d'un segment de chemin (les `/` et `-` sont
// littéraux en regex nginx, mais on protège `.` `(` `)` etc. par sécurité).
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const raw = await readFile(SRC, "utf8");
const lines = raw.split("\n");

const out: string[] = [
  "# GÉNÉRÉ — ne pas éditer à la main.",
  "# Source : public/_redirects (régénéré à chaque build par scripts/redirects-to-nginx.ts).",
  "",
];

let count = 0;
const warnings: string[] = [];

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) {
    warnings.push(`Ligne ignorée (format inattendu) : ${trimmed}`);
    continue;
  }

  const [source, target] = parts;
  const code = parts[2] ?? "301"; // défaut Cloudflare = 302, mais tout est explicite ici

  if (!source.startsWith("/")) {
    warnings.push(`Source non absolue ignorée : ${source}`);
    continue;
  }

  if (source.endsWith("/*")) {
    const base = source.slice(0, -2); // retire "/*"
    const reBase = escapeRe(base);
    if (target.includes(":splat")) {
      const dest = target.replace(":splat", "$1");
      out.push(`location ~ ^${reBase}/(.*)$ { return ${code} ${dest}; }`);
    } else {
      // joker sans :splat → tout ce qui est sous /base/ va vers une cible fixe
      out.push(`location ~ ^${reBase}/ { return ${code} ${target}; }`);
    }
  } else if (source.includes("*")) {
    warnings.push(`Joker non terminal non supporté, ignoré : ${source}`);
    continue;
  } else {
    // correspondance exacte
    out.push(`location = ${source} { return ${code} ${target}; }`);
  }
  count++;
}

out.push("");
await writeFile(OUT, out.join("\n"), "utf8");

console.log(`✓ ${count} redirections écrites dans ${OUT}`);
for (const w of warnings) console.warn(`⚠ ${w}`);
