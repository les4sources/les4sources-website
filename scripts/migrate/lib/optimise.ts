/**
 * Optimisation des images migrées : `migration/images/**` → `src/assets/migration/**`.
 *
 * Règles :
 *  - long côté ≤ 2000 px, jamais d'agrandissement ;
 *  - JPEG qualité 82 (mozjpeg) par défaut ;
 *  - PNG conservé en PNG UNIQUEMENT s'il a un canal alpha, sinon converti en JPEG ;
 *  - HEIC et AVIF sont d'abord décodés par `sips` (macOS) : sharp ne sait décoder
 *    ni l'un ni l'autre sur cette machine ;
 *  - GIF (potentiellement animés) et SVG sont copiés tels quels.
 *
 * Idempotence : une cible déjà à jour (mtime ≥ source) n'est pas ré-encodée.
 */
import { mkdirSync, copyFileSync, existsSync, statSync, rmSync } from "node:fs";
import { dirname, extname, basename, join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

const MAX_EDGE = 2000;
const JPEG_QUALITY = 82;

/** Formats que sharp ne sait pas décoder ici — passage obligé par `sips`. */
const NEEDS_SIPS = new Set([".heic", ".heif", ".avif"]);
/** Formats recopiés à l'identique (animation ou vectoriel). */
const COPY_AS_IS = new Set([".svg", ".gif", ".ico"]);

export interface OptimiseResult {
  /** Chemin du fichier écrit, relatif à la racine du dépôt. */
  dest: string;
  action: "copied" | "encoded" | "skipped";
}

/** `_shared` → `shared` : un dossier d'assets préfixé d'un `_` est un piège inutile. */
export function assetRelPath(localPath: string): string {
  const rel = localPath.replace(/^images\//, "");
  const parts = rel.split("/").map((seg, i) => (i === 0 ? seg.replace(/^_+/, "") : seg));
  const ext = extname(parts[parts.length - 1]!).toLowerCase();
  // Les formats décodés par sips ressortent en JPEG : l'extension doit suivre.
  if (NEEDS_SIPS.has(ext)) {
    parts[parts.length - 1] = parts[parts.length - 1]!.slice(0, -ext.length) + ".jpg";
  }
  return parts.join("/");
}

function upToDate(src: string, dest: string): boolean {
  if (!existsSync(dest)) return false;
  try {
    return statSync(dest).mtimeMs >= statSync(src).mtimeMs;
  } catch {
    return false;
  }
}

/** Décode un HEIC/AVIF en JPEG temporaire via `sips` (présent sur toute macOS). */
async function sipsToJpeg(src: string): Promise<string> {
  const out = join(tmpdir(), `l4s-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  const proc = Bun.spawn(["sips", "-s", "format", "jpeg", src, "--out", out], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0 || !existsSync(out)) {
    throw new Error(`sips a échoué sur ${src} : ${await new Response(proc.stderr).text()}`);
  }
  return out;
}

export async function optimiseImage(
  srcAbs: string,
  destAbs: string,
  force = false,
): Promise<OptimiseResult> {
  mkdirSync(dirname(destAbs), { recursive: true });
  if (!force && upToDate(srcAbs, destAbs)) return { dest: destAbs, action: "skipped" };

  const ext = extname(srcAbs).toLowerCase();

  if (COPY_AS_IS.has(ext)) {
    copyFileSync(srcAbs, destAbs);
    return { dest: destAbs, action: "copied" };
  }

  let input = srcAbs;
  let temp: string | undefined;
  if (NEEDS_SIPS.has(ext)) {
    temp = await sipsToJpeg(srcAbs);
    input = temp;
  }

  try {
    const pipeline = sharp(input, { failOn: "none" }).rotate();
    const meta = await pipeline.metadata();
    const resized = pipeline.resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });

    // PNG à canal alpha : on garde le PNG (la transparence est du contenu).
    const keepPng = ext === ".png" && meta.hasAlpha === true;
    const encoded = keepPng
      ? resized.png({ compressionLevel: 9, effort: 8 })
      : resized.jpeg({ quality: JPEG_QUALITY, mozjpeg: true, progressive: true });

    await encoded.toFile(destAbs);
    return { dest: destAbs, action: "encoded" };
  } finally {
    if (temp) rmSync(temp, { force: true });
  }
}

/** Nom lisible dérivé d'un fichier : `02-_mg_0493.jpg` → « MG 0493 ». */
export function humaniseFilename(localPath: string): string {
  const name = basename(localPath, extname(localPath));
  return (
    name
      // préfixe d'ordre du crawl (`02-`) et hachage de déduplication (`5d479b9db68a-`)
      .replace(/^\d{2}-/, "")
      .replace(/^[0-9a-f]{12}-/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, (c) => c.toUpperCase()) || "Photo"
  );
}
