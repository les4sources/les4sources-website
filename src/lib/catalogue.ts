/**
 * Les cartes du catalogue d'activités, partagées par /catalogue et par les
 * pages par public (qui listent les activités de leur public).
 */
import { getCollection } from "astro:content";
import type { CardItem } from "@components/ui/CardGrid.astro";
import { activityByPath } from "@components/home/events";
import { siteData } from "./data";
import { displayDescription } from "./text";
import type { MergedExperience } from "./claudy";
import type { PublicSlug } from "./publics";

const participantsOf = (x: MergedExperience): string | undefined =>
  x.minParticipants && x.maxParticipants
    ? `${x.minParticipants} à ${x.maxParticipants} personnes`
    : x.maxParticipants
      ? `Jusqu'à ${x.maxParticipants} personnes`
      : x.minParticipants
        ? `À partir de ${x.minParticipants} personnes`
        : undefined;

/** Les activités listées (hors fiches archivées), par ordre alphabétique. */
export async function listedExperiences(): Promise<MergedExperience[]> {
  const { experiences } = await siteData();
  return experiences
    .filter((x) => x.archived !== true)
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));
}

/** Les cartes des activités listées, éventuellement réduites à un public. */
export async function catalogueItems(publicSlug?: PublicSlug): Promise<CardItem[]> {
  // Les couvertures des fiches migrées sont des images locales optimisées.
  const legacyCatalogue = await getCollection("catalogue");
  const coverById = new Map(legacyCatalogue.map((e) => [e.id, e.data.cover]));

  const listed = (await listedExperiences()).filter(
    (x) => !publicSlug || x.publics.includes(publicSlug),
  );

  return Promise.all(
    listed.map(async (x) => ({
      title: x.title,
      href: x.path,
      description: displayDescription(x.description, x.generatedDescription),
      eyebrow: x.duration,
      meta: [participantsOf(x), x.priceText].filter(Boolean).join(" · ") || undefined,
      icon: x.icon,
      pole: x.pole,
      publics: x.publics,
      // La photo de la carte : l'image Claudy rapatriée, sinon la couverture migrée.
      image:
        (await activityByPath(x.path))?.cover ?? (x.legacyId ? coverById.get(x.legacyId) : undefined),
    })),
  );
}
