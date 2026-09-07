/**
 * Les 7 pôles de la charte Les 4 Sources.
 *
 * Miroir de `design/components/Display.jsx` (constantes `POLES` et `LIGHT`),
 * transposé sur les slugs réellement employés par le site (`src/lib/site.ts`,
 * `POLES`) : `accueil` → `hebergement`, `socioculturel` → `convivialite`,
 * `microferme` → `production`.
 *
 * Deux façons d'accéder à la couleur d'un pôle :
 *
 *  1. `classes` — des noms de classes Tailwind **écrits en toutes lettres**.
 *     C'est la voie normale. Tailwind v4 n'émet une variable de `@theme` que si
 *     elle est effectivement utilisée : littéraliser les classes ici garantit
 *     que `--color-<pole>`, `-tint` et `-ink` existent dans le CSS produit.
 *     Une classe construite dynamiquement (`bg-${pole}`) ne serait jamais émise.
 *  2. `vars` — les noms des variables CSS correspondantes, pour les rares cas
 *     où la couleur doit passer par un `style` en ligne (clip-path, dégradés).
 *     Elles ne survivent dans la feuille produite que parce que (1) les référence.
 */

export const POLE_SLUGS = [
  "hebergement",
  "convivialite",
  "nature",
  "artisanat",
  "ressourcement",
  "vie-collective",
  "production",
] as const;

export type PoleSlug = (typeof POLE_SLUGS)[number];

export interface PoleClasses {
  /** Aplat de la couleur du pôle. */
  bg: string;
  /** Couleur du texte lisible sur cet aplat (teal pour les pôles clairs). */
  onBg: string;
  /** Fond teinté, derrière du texte. */
  bgTint: string;
  /** Encre du pôle sur fond clair (contraste AA). */
  textInk: string;
  /** Texte à la couleur pleine du pôle. */
  text: string;
  /** Bordure à la couleur pleine du pôle. */
  border: string;
}

export interface PoleDefinition {
  slug: PoleSlug;
  /** Nom du pôle dans la charte (Display.jsx `POLES[].label`). */
  label: string;
  /** Libellé de catégorie tel qu'il s'affiche sur le site (`POLES[].cat`). */
  category: string;
  /** Nom historique du pôle dans le design system Claude Design. */
  alias: string;
  /** Nom de fichier du pictogramme, sans variante ni extension. */
  picto: string;
  /**
   * La couleur pleine est claire : le texte posé dessus passe en teal.
   * Miroir de `LIGHT` dans Display.jsx — artisanat, socioculturel
   * (= convivialité) et ressourcement.
   */
  lightOnSolid: boolean;
  vars: { color: string; tint: string; ink: string };
  classes: PoleClasses;
}

export const POLES: Record<PoleSlug, PoleDefinition> = {
  hebergement: {
    slug: "hebergement",
    label: "Accueil",
    category: "Hébergement",
    alias: "accueil",
    picto: "pole-hebergement",
    lightOnSolid: false,
    vars: {
      color: "--color-hebergement",
      tint: "--color-hebergement-tint",
      ink: "--color-hebergement-ink",
    },
    classes: {
      bg: "bg-hebergement",
      onBg: "text-white",
      bgTint: "bg-hebergement-tint",
      textInk: "text-hebergement-ink",
      text: "text-hebergement",
      border: "border-hebergement",
    },
  },
  convivialite: {
    slug: "convivialite",
    label: "Socioculturel",
    category: "Liens et convivialité",
    alias: "socioculturel",
    picto: "pole-convivialite",
    lightOnSolid: true,
    vars: {
      color: "--color-convivialite",
      tint: "--color-convivialite-tint",
      ink: "--color-convivialite-ink",
    },
    classes: {
      bg: "bg-convivialite",
      onBg: "text-teal",
      bgTint: "bg-convivialite-tint",
      textInk: "text-convivialite-ink",
      text: "text-convivialite",
      border: "border-convivialite",
    },
  },
  nature: {
    slug: "nature",
    label: "Nature",
    category: "Nature",
    alias: "nature",
    picto: "pole-nature",
    lightOnSolid: false,
    vars: {
      color: "--color-nature",
      tint: "--color-nature-tint",
      ink: "--color-nature-ink",
    },
    classes: {
      bg: "bg-nature",
      onBg: "text-white",
      bgTint: "bg-nature-tint",
      textInk: "text-nature-ink",
      text: "text-nature",
      border: "border-nature",
    },
  },
  artisanat: {
    slug: "artisanat",
    label: "Artisanat",
    category: "Artisanat",
    alias: "artisanat",
    picto: "pole-artisanat",
    lightOnSolid: true,
    vars: {
      color: "--color-artisanat",
      tint: "--color-artisanat-tint",
      ink: "--color-artisanat-ink",
    },
    classes: {
      bg: "bg-artisanat",
      onBg: "text-teal",
      bgTint: "bg-artisanat-tint",
      textInk: "text-artisanat-ink",
      text: "text-artisanat",
      border: "border-artisanat",
    },
  },
  ressourcement: {
    slug: "ressourcement",
    label: "Ressourcement",
    category: "Ressourcement",
    alias: "ressourcement",
    picto: "pole-ressourcement",
    lightOnSolid: true,
    vars: {
      color: "--color-ressourcement",
      tint: "--color-ressourcement-tint",
      ink: "--color-ressourcement-ink",
    },
    classes: {
      bg: "bg-ressourcement",
      onBg: "text-teal",
      bgTint: "bg-ressourcement-tint",
      textInk: "text-ressourcement-ink",
      text: "text-ressourcement",
      border: "border-ressourcement",
    },
  },
  "vie-collective": {
    slug: "vie-collective",
    label: "Vie collective",
    category: "Vie collective",
    alias: "vie-collective",
    picto: "pole-vie-collective",
    lightOnSolid: false,
    vars: {
      color: "--color-vie-collective",
      tint: "--color-vie-collective-tint",
      ink: "--color-vie-collective-ink",
    },
    classes: {
      bg: "bg-vie-collective",
      onBg: "text-white",
      bgTint: "bg-vie-collective-tint",
      textInk: "text-vie-collective-ink",
      text: "text-vie-collective",
      border: "border-vie-collective",
    },
  },
  production: {
    slug: "production",
    label: "Micro-ferme",
    category: "Production",
    alias: "microferme",
    picto: "pole-production",
    lightOnSolid: false,
    vars: {
      color: "--color-production",
      tint: "--color-production-tint",
      ink: "--color-production-ink",
    },
    classes: {
      bg: "bg-production",
      onBg: "text-white",
      bgTint: "bg-production-tint",
      textInk: "text-production-ink",
      text: "text-production",
      border: "border-production",
    },
  },
};

/** Ordre du bandeau de pictogrammes du pied de page (design/ui_kits/Footer.jsx). */
export const POLE_STRIP: PoleSlug[] = [
  "convivialite",
  "hebergement",
  "nature",
  "artisanat",
  "vie-collective",
  "ressourcement",
  "production",
];

export const isPole = (v: unknown): v is PoleSlug =>
  typeof v === "string" && (POLE_SLUGS as readonly string[]).includes(v);

/** Définition d'un pôle, avec repli sur `hebergement` (comme Display.jsx). */
export const pole = (slug?: string): PoleDefinition =>
  isPole(slug) ? POLES[slug] : POLES.hebergement;
