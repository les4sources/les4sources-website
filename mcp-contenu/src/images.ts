/**
 * Les images qui entrent dans le site, par deux portes : un lien web
 * (`ajouter_image`) ou un lien d'envoi à usage unique, où l'éditrice choisit
 * la photo sur son appareil (`preparer_envoi_image` → page `/envoi/<jeton>`).
 * Claude ne peut pas transmettre lui-même un fichier déposé dans la
 * conversation : c'est ce lien qui le remplace.
 */
import { DOSSIER_IMAGES, cheminRelatif, estContenu } from "./contenu";
import type { Depot, Env } from "./github";

export const TAILLE_MAX = 10 * 1024 * 1024;
const ENVOI_DUREE = 30 * 60;

export function formatImage(o: Uint8Array): "jpg" | "png" | "webp" | "svg" | null {
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return "jpg";
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return "png";
  if (String.fromCharCode(...o.slice(0, 4)) === "RIFF" && String.fromCharCode(...o.slice(8, 12)) === "WEBP") return "webp";
  const debut = new TextDecoder().decode(o.slice(0, 512)).trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(debut)) return "svg";
  return null;
}

function base64(o: Uint8Array): string {
  let s = "";
  for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode(...o.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Contrôle le fichier et le commite dans `src/assets/images/contenu/`. */
export async function enregistrerImage(
  depot: Depot,
  octets: Uint8Array,
  nom: string,
  message: string,
  editeur: string,
): Promise<{ chemin: string } | { erreur: string }> {
  if (octets.length > TAILLE_MAX) return { erreur: "Image trop lourde (10 Mo au plus)." };
  const ext = formatImage(octets);
  if (!ext) return { erreur: "Ce fichier n'est pas une image JPEG, PNG, WebP ou SVG. (Une photo d'iPhone en HEIC : choisis « Le plus compatible » dans Réglages › Appareil photo › Formats, ou exporte-la en JPEG.)" };
  if (ext === "svg" && /<script|\son\w+\s*=|javascript:|<foreignObject/i.test(new TextDecoder().decode(octets)))
    return { erreur: "Ce SVG contient du code actif : refusé. Prends le logo en PNG." };
  const chemin = `${DOSSIER_IMAGES}/${nom}.${ext}`;
  const base = await depot.base();
  if (await depot.existe(chemin, base.sha)) return { erreur: `${chemin} existe déjà : choisis un autre nom.` };
  await depot.commit(base, [{ chemin, base64: base64(octets) }], message, editeur);
  return { chemin };
}

/** Ce que Claude doit écrire pour utiliser l'image, selon l'endroit. */
export function modeEmploi(chemin: string, octets: number, pourFichier?: string): string {
  const page = pourFichier && estContenu(pourFichier) ? pourFichier : undefined;
  const rel = cheminRelatif(page ?? "src/content/pages/exemple.md", chemin);
  return (
    `Image enregistrée : ${chemin} (${Math.round(octets / 1024)} Ko).\n` +
    `Depuis ${page ?? "une page à la racine d'une section (src/content/<section>/x.md)"}, utilise :\n` +
    `- en couverture : cover: "${rel}" et coverAlt: "ce que montre l'image"\n` +
    `- dans le texte : ![ce que montre l'image](${rel})\n` +
    `- dans une page composée (.astro) : import monImage from "@assets/${chemin.replace("src/assets/", "")}"; puis <Image src={monImage} alt="…" … /> (voir regles_du_site)\n\n` +
    "Elle n'apparaît sur le site que dans une page qui l'utilise ; tu peux écrire cette page tout de suite, sans attendre la publication de l'image."
  );
}

/* ─────────────────────────── Lien d'envoi ─────────────────────────── */

export type Envoi = {
  nom: string;
  pourFichier?: string;
  resume: string;
  editeur: string;
  fait?: { chemin: string; octets: number };
};

const cle = (jeton: string) => `envoi:${jeton}`;

export async function creerEnvoi(env: Env, envoi: Envoi): Promise<string> {
  const octets = crypto.getRandomValues(new Uint8Array(24));
  const jeton = [...octets].map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.OAUTH_KV.put(cle(jeton), JSON.stringify(envoi), { expirationTtl: ENVOI_DUREE });
  return jeton;
}

export async function lireEnvoi(env: Env, jeton: string): Promise<Envoi | null> {
  if (!/^[0-9a-f]{48}$/.test(jeton)) return null;
  const brut = await env.OAUTH_KV.get(cle(jeton));
  return brut ? (JSON.parse(brut) as Envoi) : null;
}

/** Marque l'envoi comme fait ; il reste lisible (pour Claude) jusqu'à son expiration. */
export async function terminerEnvoi(env: Env, jeton: string, envoi: Envoi, fait: Envoi["fait"]): Promise<void> {
  await env.OAUTH_KV.put(cle(jeton), JSON.stringify({ ...envoi, fait }), { expirationTtl: ENVOI_DUREE });
}
