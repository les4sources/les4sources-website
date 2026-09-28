/**
 * Images publiées dans Claudy, rapatriées et optimisées au build.
 *
 * Le contrat (`docs/CLAUDY.md`) est clair : le site ne hotlinke jamais une
 * image Claudy au runtime. `astro:assets` sait télécharger une image distante
 * au build et en produire des variantes WebP locales, à condition que son
 * domaine soit déclaré dans `astro.config.mjs` (`image.domains`).
 *
 * Règle d'or de Claudy : le build ne casse jamais à cause de lui. On vérifie
 * donc d'abord que l'image répond, et toute erreur ramène `undefined` — la
 * page retombe alors sur la couverture migrée ou le bandeau du pôle.
 */
import { getImage } from "astro:assets";
import sharp from "sharp";

/** Image distante déjà transformée : `src` et `srcset` pointent vers `/_astro/`. */
export interface RemoteImage {
  remote: true;
  src: string;
  srcset?: string;
  width?: number;
  height?: number;
  alt?: string;
}

export function isRemoteImage(value: unknown): value is RemoteImage {
  return typeof value === "object" && value !== null && (value as RemoteImage).remote === true;
}

const cache = new Map<string, Promise<RemoteImage | undefined>>();

/** Formats que sharp sait décoder tel qu'installé : un HEIC passerait la sonde de taille puis ferait échouer la génération. */
const DECODABLE = /^image\/(jpeg|png|webp|avif|gif)\b/;

/**
 * URL finale de l'image, redirections suivies, si elle mène à une image que
 * le build saura réellement convertir.
 *
 * Active Storage sert `/rails/active_storage/blobs/redirect/…`, qui renvoie
 * vers une URL signée valable cinq minutes. On vérifie ici que la chaîne mène,
 * sur le même hôte, à une image d'un format décodable, puis on la décode une
 * fois avec sharp : ce que `getImage` enregistre, Astro ne le télécharge et ne
 * le convertit qu'APRÈS le rendu des pages, hors de tout try/catch — un
 * fichier illisible ferait échouer tout le build. C'est l'URL stable (la
 * redirection) qui est confiée à astro:assets : l'URL signée pourrait expirer
 * entre le rendu et la génération des variantes, sur un build lent.
 *
 * Reste un risque résiduel : Claudy qui tombe entre le rendu et la génération.
 * Le build Hatchbox échoue alors et la version en ligne reste servie — le
 * rebuild suivant corrige.
 */
async function resolveImage(url: string): Promise<string | undefined> {
  let current = url;
  try {
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        current = new URL(location, current).href;
        if (new URL(current).hostname !== new URL(url).hostname) return undefined;
        continue;
      }
      if (!res.ok || !DECODABLE.test(res.headers.get("content-type") ?? "")) {
        await res.body?.cancel();
        return undefined;
      }
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      return meta.width && meta.height ? current : undefined;
    }
  } catch {
    // réseau, délai dépassé, fichier illisible : traité comme une image absente
  }
  return undefined;
}

const resolved = new Map<string, Promise<string | undefined>>();
function finalUrl(url: string): Promise<string | undefined> {
  let pending = resolved.get(url);
  if (!pending) {
    pending = resolveImage(url);
    resolved.set(url, pending);
  }
  return pending;
}

/**
 * Variantes WebP d'une image Claudy aux largeurs demandées, ou `undefined` si
 * l'image est injoignable ou illisible (journalisé, jamais bloquant).
 */
export function claudyImage(
  url: string | undefined,
  widths: number[],
  alt?: string,
): Promise<RemoteImage | undefined> {
  if (!url) return Promise.resolve(undefined);
  const key = `${url}|${widths.join(",")}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      if (!(await finalUrl(url))) {
        console.warn(`claudy: image injoignable, ignorée — ${url}`);
        return undefined;
      }
      try {
        const img = await getImage({ src: url, inferSize: true, widths, format: "webp" });
        // Un hôte absent de `image.domains` n'est pas transformé : Astro rend
        // l'URL d'origine sans erreur. Jamais de hotlink : on ignore l'image.
        if (!img.src.startsWith("/")) {
          console.warn(`claudy: hôte d'image non autorisé (image.domains), ignorée — ${url}`);
          return undefined;
        }
        return {
          remote: true as const,
          src: img.src,
          srcset: img.srcSet.attribute || undefined,
          width: Number(img.attributes.width) || undefined,
          height: Number(img.attributes.height) || undefined,
          alt,
        };
      } catch (error) {
        console.warn(`claudy: image illisible, ignorée — ${url} (${(error as Error).message})`);
        return undefined;
      }
    })();
    cache.set(key, pending);
  }
  return pending;
}

/**
 * Recadrage 1200 × 630 (JPEG) d'une image Claudy pour Open Graph et le
 * JSON-LD, en chemin local `/_astro/…`, ou `undefined` si l'image fait défaut.
 */
export async function claudyOgImage(url: string | undefined): Promise<string | undefined> {
  if (!url || !(await finalUrl(url))) return undefined;
  try {
    const img = await getImage({
      src: url,
      inferSize: true,
      width: 1200,
      height: 630,
      fit: "cover",
      format: "jpg",
    });
    return img.src.startsWith("/") ? img.src : undefined;
  } catch {
    return undefined;
  }
}
