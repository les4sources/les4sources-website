#!/usr/bin/env bun
/**
 * Produit l'image Open Graph par défaut du site (1200×630) à partir de la vue
 * aérienne du domaine. À rejouer uniquement si la photo source change ; le
 * résultat (public/og/les4sources-og.jpg) est commité, le build ne le regénère pas.
 *
 * La source est un JPEG et non l'AVIF d'origine : le libheif embarqué dans sharp
 * ne décode pas ce flux AV1 (« Bitstream not supported by this decoder »).
 *
 * Usage : bun run scripts/make-default-og.ts
 */
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SRC = "src/assets/images/les-4-sources-tiers-lieu-yvoir-vue-drone.jpg";
const OUT = "public/og/les4sources-og.jpg";

await mkdir("public/og", { recursive: true });

const info = await sharp(SRC)
  .resize(1200, 630, { fit: "cover", position: "attention" })
  .jpeg({ quality: 82, progressive: true, mozjpeg: true })
  .toFile(OUT);

console.log(`✓ ${OUT} — ${info.width}×${info.height}, ${Math.round(info.size / 1024)} ko`);
