/**
 * Les publics des 4 Sources (Michael, 2026-10-22) : à qui s'adresse une
 * activité du catalogue.
 *
 * La donnée vient du champ Notion « Public(s)-cible(s) » des fiches migrées
 * (`properties`), qui mêle plusieurs libellés pour un même public : les
 * « Mises au vert », le « Team building » et les « Collectifs/Assoc' » sont
 * tous des entreprises et associations. Les futurs mariés n'ont pas
 * d'activité étiquetée : ils n'ont pas de filtre.
 */

export type PublicSlug = "familles" | "amis" | "jeunes" | "equipes";

export interface PublicDef {
  slug: PublicSlug;
  /** Libellé du filtre. */
  label: string;
  /** Titre de la section d'activités sur la page du public. */
  sectionTitle: string;
  /** Libellés Notion qui désignent ce public. */
  legacyLabels: string[];
}

export const PUBLICS: Record<PublicSlug, PublicDef> = {
  familles: { slug: "familles", label: "Familles", sectionTitle: "Les activités à faire en famille", legacyLabels: ["Familles"] },
  amis: { slug: "amis", label: "Entre amis", sectionTitle: "Les activités à faire entre amis", legacyLabels: ["Groupes d’amis"] },
  jeunes: { slug: "jeunes", label: "Écoles et jeunes", sectionTitle: "Les activités pour les écoles et les jeunes", legacyLabels: ["Groupes de jeunes"] },
  equipes: {
    slug: "equipes",
    label: "Entreprises et associations",
    sectionTitle: "Les activités pour les équipes",
    legacyLabels: ["Team building", "Mises au vert", "Collectifs/Assoc'", "Collègues"],
  },
};

export interface PagePublics {
  publics: PublicSlug[];
  /** Titre de la section quand la page réunit plusieurs publics. */
  title?: string;
}

/**
 * Le ou les publics de chaque page par public, pour y lister leurs activités.
 * La page famille accueille aussi les groupes d'amis (Michael, 2026-10-23).
 */
export const PUBLICS_OF_PAGE: Record<string, PagePublics> = {
  "/sejours/en-famille-aux-4-sources": {
    publics: ["familles", "amis"],
    title: "Les activités à faire en famille ou entre amis",
  },
  "/anniversaire": { publics: ["amis"] },
  "/sejours/retraites-scolaires": { publics: ["jeunes"] },
  "/sejours/mises-au-vert": { publics: ["equipes"] },
  "/un-team-building-aux-4-sources": { publics: ["equipes"] },
};

export function isPublic(value: string | undefined): value is PublicSlug {
  return value !== undefined && value in PUBLICS;
}

/** Les publics d'une fiche, lus dans ses propriétés migrées. */
export function publicsOf(properties: Record<string, string> | undefined): PublicSlug[] {
  const raw = properties?.["Public(s)-cible(s)"];
  if (!raw) return [];
  const labels = raw.split(",").map((s) => s.trim());
  return Object.values(PUBLICS)
    .filter((p) => p.legacyLabels.some((l) => labels.includes(l)))
    .map((p) => p.slug);
}
