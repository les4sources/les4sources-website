import { getCollection, type CollectionEntry } from "astro:content";

export type Temoignage = CollectionEntry<"temoignages">["data"] & { id: string };

/** Tous les témoignages, du plus récent (dans la newsletter) au plus ancien. */
export async function allTemoignages(): Promise<Temoignage[]> {
  const entries = await getCollection("temoignages");
  return entries
    .map((e) => ({ id: e.id, ...e.data }))
    .sort((a, b) => b.newsletter.month.localeCompare(a.newsletter.month));
}

const clean = (path: string) => path.replace(/\/+$/, "") || "/";

/** Les témoignages à afficher sur une page, d'après son legacyPath. */
export async function temoignagesFor(path: string): Promise<Temoignage[]> {
  const at = clean(path);
  return (await allTemoignages()).filter((t) => t.pages.some((p) => clean(p) === at));
}

/** La sélection de la page d'accueil. */
export async function homeTemoignages(): Promise<Temoignage[]> {
  return (await allTemoignages()).filter((t) => t.home);
}
