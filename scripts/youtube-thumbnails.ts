/**
 * Vignettes locales des vidéos YouTube du contenu.
 *
 * Les vidéos s'affichent en « façade » (src/plugins/rehype-youtube.ts) : une
 * vignette et un bouton lecture, l'iframe YouTube n'est chargée qu'au clic.
 * La vignette doit être locale (aucun hotlink) : ce script la télécharge une
 * fois dans `public/youtube/<id>.jpg` pour chaque vidéo citée dans
 * `src/content`. À relancer quand une nouvelle vidéo entre dans le contenu —
 * sans vignette, le greffon laisse simplement l'iframe telle quelle.
 *
 *   bun run youtube:thumbnails
 */
import { Glob } from "bun";
import { existsSync } from "node:fs";
import sharp from "sharp";

const ids = new Set<string>();
for await (const file of new Glob("src/content/**/*.{md,mdx}").scan(".")) {
  const text = await Bun.file(file).text();
  for (const m of text.matchAll(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/g)) ids.add(m[1]);
}

let fetched = 0;
for (const id of ids) {
  const out = `public/youtube/${id}.jpg`;
  if (existsSync(out)) continue;
  for (const size of ["maxresdefault", "sddefault", "hqdefault"]) {
    const res = await fetch(`https://i.ytimg.com/vi/${id}/${size}.jpg`);
    if (!res.ok) continue;
    // 960 px suffisent à une vignette affichée sur 760 px ; JPEG progressif allégé.
    const jpeg = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize({ width: 960, withoutEnlargement: true })
      .jpeg({ quality: 74, progressive: true, mozjpeg: true })
      .toBuffer();
    await Bun.write(out, jpeg);
    console.log(`✓ ${id} (${size})`);
    fetched++;
    break;
  }
  if (!existsSync(out)) console.warn(`✗ ${id} : aucune vignette disponible`);
}
console.log(`${ids.size} vidéo(s), ${fetched} vignette(s) téléchargée(s).`);
