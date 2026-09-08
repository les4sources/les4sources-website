/**
 * Constantes du site. Source de vérité des données NAP (nom, adresse, téléphone)
 * réutilisées par le JSON-LD, le pied de page et la page contact.
 *
 * Règle stricte : rien d'inventé. Une donnée inconnue vaut `undefined` et n'est
 * pas émise — jamais une valeur plausible. Les valeurs manquantes (rue, code
 * postal, e-mail, réseaux sociaux) seront renseignées depuis `migration/nav.json`
 * quand le crawl du site actuel les aura extraites.
 */

export interface SocialLink {
  label: string;
  url: string;
}

export const SITE_URL = process.env.SITE ?? "https://www.les4sources.be";

export const site = {
  name: "Les 4 Sources",
  tagline: "Tiers-lieu à Yvoir",
  url: SITE_URL,
  locale: "fr-BE",
  lang: "fr",

  /**
   * Téléphone tel qu'il figure sur le site actuel (page /contact,
   * « +32(0)490/46.77.10 », pour les séjours et réservations). C'est le SEUL
   * numéro publié : le +32 455 13 61 42 du lieu n'apparaît nulle part sur le
   * site, il n'est donc pas repris ici (rien d'inventé, rien d'ajouté).
   */
  phone: "+32 490 46 77 10",

  /** Adresse, lue sur /a-propos/acces-ahinvaux et dans le pied de page migré. */
  address: {
    streetAddress: "Fonds d'Ahinvaux 1",
    postalCode: "5530",
    locality: "Yvoir",
    region: "Namur",
    country: "BE",
  },

  /** E-mail public général (page /contact). */
  email: "contact@les4sources.be",

  /** Demande de réservation : le funnel Claudy, cible du bouton jaune de l'en-tête. */
  reservationUrl: "https://app.les4sources.be/reservation",

  /** Licence du site et des photos (pied de page) — le texte de l'ancien site, corrigé en « licence ». */
  licence: {
    name: "Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International",
    url: "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr",
  },

  /** Réseaux sociaux réellement liés depuis le pied de page actuel. */
  socials: [
    { label: "Facebook", url: "https://www.facebook.com/les4sourcesaYvoir/" },
  ] as SocialLink[],

  /** Image Open Graph par défaut (générée par scripts/make-default-og.ts). */
  defaultOgImage: "/og/les4sources-og.jpg",
} as const;

/** Les sept pôles thématiques de la charte. */
export const POLES = [
  "hebergement",
  "convivialite",
  "nature",
  "artisanat",
  "ressourcement",
  "vie-collective",
  "production",
] as const;

export type Pole = (typeof POLES)[number];

/** Libellé lisible d'un pôle (pour les badges et les listings). */
export const POLE_LABELS: Record<Pole, string> = {
  hebergement: "Hébergement",
  convivialite: "Convivialité",
  nature: "Nature",
  artisanat: "Artisanat",
  ressourcement: "Ressourcement",
  "vie-collective": "Vie collective",
  production: "Production",
};

/** Classe Tailwind de la couleur d'un pôle — uniquement des jetons sémantiques. */
export const POLE_TEXT_CLASS: Record<Pole, string> = {
  hebergement: "text-pole-hebergement",
  convivialite: "text-pole-convivialite",
  nature: "text-pole-nature",
  artisanat: "text-pole-artisanat",
  ressourcement: "text-pole-ressourcement",
  "vie-collective": "text-pole-vie-collective",
  production: "text-pole-production",
};
