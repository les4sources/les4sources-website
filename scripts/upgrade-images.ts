/**
 * Remonte les photos migrées à leur vraie résolution.
 *
 * La migration a récupéré la variante `/public` du CDN de Super
 * (images.spr.so, Cloudflare Images), plafonnée autour de 1 150–1 366 px : trop
 * peu pour un écran Retina. Le même CDN sert des variantes flexibles `w=…`
 * jusqu'à la taille d'origine, à condition d'envoyer un User-Agent de
 * navigateur (sans lui : 403).
 *
 * Pour chaque image référencée dans `migration/pages/*.json` :
 *   - on demande `w=2400` pour une couverture, `w=2000` pour le reste, en JPEG ;
 *   - si la variante est plus large que le fichier local, on la ré-encode
 *     (JPEG q80, mozjpeg) et on remplace le fichier, même nom ;
 *   - un PNG sans transparence devient un `.jpg` et toutes ses références
 *     (Markdown, frontmatter, imports Astro) sont réécrites ;
 *   - GIF, PNG avec alpha et sources hors CDN sont laissés tels quels.
 *
 * Rejouable : une image déjà à la bonne largeur est ignorée.
 *
 *   bun scripts/upgrade-images.ts [--dry] [--only <fragment de chemin>]
 */
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const PAGES_DIR = join(ROOT, "migration/pages");
const ASSETS_DIR = join(ROOT, "src/assets/migration");
const DRY = process.argv.includes("--dry");
const ONLY_AT = process.argv.indexOf("--only");
const ONLY = ONLY_AT >= 0 ? process.argv[ONLY_AT + 1] : undefined;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const COVER_WIDTH = 2400;
const CONTENT_WIDTH = 2000;
const JPEG_QUALITY = 80;
const CONCURRENCY = 4;

interface Ref {
  src: string;
  role: string;
  /** Chemin relatif sous src/assets/migration/ */
  asset: string;
}

/** `images/<page>/NN-x.jpg` → `<page>/NN-x.jpg` ; `images/_shared/…` → `shared/…`. */
function assetRel(localPath: string): string {
  const rel = localPath.replace(/^images\//, "");
  return rel.startsWith("_shared/") ? `shared/${rel.slice("_shared/".length)}` : rel;
}

function collectRefs(): Map<string, Ref> {
  const refs = new Map<string, Ref>();
  for (const file of readdirSync(PAGES_DIR).filter((f) => f.endsWith(".json"))) {
    const page = JSON.parse(readFileSync(join(PAGES_DIR, file), "utf8"));
    for (const img of page.images ?? []) {
      if (!img?.src || !img?.localPath) continue;
      const asset = assetRel(img.localPath);
      const prev = refs.get(asset);
      // Une couverture quelque part = couverture partout (largeur la plus grande).
      if (!prev || (prev.role !== "cover" && img.role === "cover")) {
        refs.set(asset, { src: img.src, role: img.role, asset });
      }
    }
  }
  return refs;
}

function cdnBase(src: string): string | null {
  const m = src.match(/^(https:\/\/images\.spr\.so\/cdn-cgi\/imagedelivery\/[^/]+\/[^/]+\/[^/]+)\//);
  return m ? m[1] : null;
}

async function fetchVariant(base: string, width: number): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${base}/w=${width},format=jpeg`, {
        headers: { "user-agent": UA, referer: "https://www.les4sources.be/" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

interface Result {
  asset: string;
  status: "upgraded" | "renamed" | "kept" | "skipped" | "failed";
  from?: number;
  to?: number;
  note?: string;
}

const renames: [string, string][] = [];

async function processOne(ref: Ref): Promise<Result> {
  const file = join(ASSETS_DIR, ref.asset);
  if (!existsSync(file)) return { asset: ref.asset, status: "skipped", note: "fichier absent" };
  const ext = extname(file).toLowerCase();
  if (ext === ".gif") return { asset: ref.asset, status: "skipped", note: "gif" };
  const base = cdnBase(ref.src);
  if (!base) return { asset: ref.asset, status: "skipped", note: "source hors CDN" };

  const meta = await sharp(file).metadata();
  const currentWidth = meta.width ?? 0;
  if (ext === ".png" && meta.hasAlpha) return { asset: ref.asset, status: "skipped", note: "png avec alpha" };

  const target = ref.role === "cover" ? COVER_WIDTH : CONTENT_WIDTH;
  if (currentWidth >= target) return { asset: ref.asset, status: "kept", from: currentWidth, to: currentWidth };

  const buf = await fetchVariant(base, target);
  if (!buf) return { asset: ref.asset, status: "failed", from: currentWidth, note: "téléchargement" };
  const fetched = await sharp(buf).metadata();
  const newWidth = fetched.width ?? 0;
  if (newWidth <= currentWidth) {
    return { asset: ref.asset, status: "kept", from: currentWidth, to: newWidth, note: "pas plus grand sur le CDN" };
  }

  const out = await sharp(buf).rotate().jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  const isPng = ext === ".png";
  const dest = isPng ? file.slice(0, -ext.length) + ".jpg" : file;
  if (!DRY) {
    writeFileSync(dest, out);
    if (isPng) {
      renameSync(file, file + ".bak");
      renames.push([ref.asset, ref.asset.slice(0, -ext.length) + ".jpg"]);
    }
  }
  return { asset: ref.asset, status: isPng ? "renamed" : "upgraded", from: currentWidth, to: newWidth };
}

async function main() {
  const refs = [...collectRefs().values()].filter((r) => !ONLY || r.asset.includes(ONLY));
  console.log(`${refs.length} image(s) référencée(s)${DRY ? " — simulation" : ""}`);
  const results: Result[] = [];
  let i = 0;
  const worker = async () => {
    while (i < refs.length) {
      const ref = refs[i++];
      const r = await processOne(ref);
      results.push(r);
      if (r.status !== "kept" && r.status !== "skipped") {
        console.log(`  ${r.status.padEnd(9)} ${r.asset}  ${r.from ?? "?"} → ${r.to ?? "?"}${r.note ? `  (${r.note})` : ""}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const count = (s: Result["status"]) => results.filter((r) => r.status === s).length;
  console.log(
    `\nremontées : ${count("upgraded")} · png→jpg : ${count("renamed")} · déjà assez grandes : ${count("kept")} · ignorées : ${count("skipped")} · échecs : ${count("failed")}`,
  );
  for (const r of results.filter((r) => r.status === "failed")) console.log(`  ✗ ${r.asset} (${r.note})`);

  // Réécriture des références des PNG renommés, puis suppression des .bak.
  if (!DRY && renames.length > 0) {
    const targets: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(md|mdx|astro|ts|json)$/.test(f)) targets.push(p);
      }
    };
    walk(join(ROOT, "src"));
    let touched = 0;
    for (const t of targets) {
      let text = readFileSync(t, "utf8");
      let changed = false;
      for (const [from, to] of renames) {
        if (text.includes(`migration/${from}`)) {
          text = text.split(`migration/${from}`).join(`migration/${to}`);
          changed = true;
        }
      }
      if (changed) {
        writeFileSync(t, text);
        touched++;
      }
    }
    for (const [from] of renames) {
      const bak = join(ASSETS_DIR, from + ".bak");
      if (existsSync(bak)) renameSync(bak, join(ROOT, ".tmp-upgrade-images", from)) ;
    }
    console.log(`références réécrites dans ${touched} fichier(s) ; anciens PNG déplacés dans .tmp-upgrade-images/`);
  }

  const widths = await Promise.all(
    readdirSync(ASSETS_DIR, { recursive: true })
      .map(String)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .map(async (f) => (await sharp(join(ASSETS_DIR, f)).metadata()).width ?? 0),
  );
  const bucket = (lo: number, hi: number) => widths.filter((w) => w >= lo && w < hi).length;
  console.log(
    `largeurs après : <1000 : ${bucket(0, 1000)} · 1000–1999 : ${bucket(1000, 2000)} · 2000–2399 : ${bucket(2000, 2400)} · ≥2400 : ${bucket(2400, 1e9)}`,
  );
  console.log(`taille : ${(sumBytes(ASSETS_DIR) / 1e6).toFixed(0)} Mo`);
}

function sumBytes(dir: string): number {
  let total = 0;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    total += st.isDirectory() ? sumBytes(p) : st.size;
  }
  return total;
}

// Les anciens PNG sont mis de côté hors de src/ (le dossier est ignoré par git).
import { mkdirSync } from "node:fs";
for (const d of ["shared", ...readdirSync(ASSETS_DIR).filter((f) => statSync(join(ASSETS_DIR, f)).isDirectory())]) {
  mkdirSync(join(ROOT, ".tmp-upgrade-images", d), { recursive: true });
}

await main();
