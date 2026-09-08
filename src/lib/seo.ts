/**
 * Constructeurs JSON-LD schema.org typés. Un constructeur par type de schéma,
 * pour qu'aucune page n'ait à écrire du JSON à la main.
 *
 * Toutes les données NAP viennent de `site.ts` : une valeur absente n'est jamais
 * émise (pas de clé vide, pas de valeur inventée).
 */
import { site, type Pole } from "./site";

const ORG_ID = "https://www.les4sources.be/#organization";
const PLACE_ID = "https://www.les4sources.be/#place";

/** Adresse postale schema.org, réduite aux champs réellement connus. */
function postalAddress() {
  const a = site.address;
  return {
    "@type": "PostalAddress",
    ...(a.streetAddress ? { streetAddress: a.streetAddress } : {}),
    ...(a.postalCode ? { postalCode: a.postalCode } : {}),
    addressLocality: a.locality,
    ...(a.region ? { addressRegion: a.region } : {}),
    addressCountry: a.country,
  };
}

export interface OrganizationInput {
  /** Origine absolue, ex. https://www.les4sources.be */
  siteUrl: string;
}

/**
 * Graphe Organization + LodgingBusiness (qui est aussi un LocalBusiness) —
 * émis une seule fois, à l'échelle du site, depuis BaseLayout.
 */
export function organization({ siteUrl }: OrganizationInput) {
  const origin = siteUrl.replace(/\/$/, "");
  const ogImage = `${origin}${site.defaultOgImage}`;
  const sameAs = site.socials.map((s) => s.url);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: site.name,
        url: origin,
        logo: ogImage,
        image: ogImage,
        description:
          "Tiers-lieu de 15 hectares à Yvoir : hébergements, salles, bar, coworking, activités et événements au Domaine d'Ahinvaux.",
        telephone: site.phone,
        ...(site.email ? { email: site.email } : {}),
        address: postalAddress(),
        ...(sameAs.length ? { sameAs } : {}),
      },
      {
        // LodgingBusiness hérite de LocalBusiness : gîtes, salles, bar et coworking
        // vivent sur le même lieu physique.
        "@type": ["LodgingBusiness", "LocalBusiness"],
        "@id": PLACE_ID,
        name: site.name,
        alternateName: "Domaine d'Ahinvaux",
        url: origin,
        image: ogImage,
        description: `${site.tagline} — gîtes, salles, bar, coworking et activités sur 15 hectares.`,
        telephone: site.phone,
        ...(site.email ? { email: site.email } : {}),
        address: postalAddress(),
        parentOrganization: { "@id": ORG_ID },
        ...(sameAs.length ? { sameAs } : {}),
      },
    ],
  };
}

export interface Crumb {
  name: string;
  /** URL absolue. */
  url: string;
}

/** BreadcrumbList — pour toute page profonde. */
export function breadcrumbs(items: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

export interface EventInput {
  name: string;
  description: string;
  /** URL absolue de la fiche. */
  url: string;
  /** ISO 8601. */
  startDate?: string;
  endDate?: string;
  /** Nom du lieu ; par défaut Les 4 Sources à Yvoir. */
  location?: string;
  image?: string;
  /** Libellé de prix affiché ; devient une `offers` si une inscription existe. */
  priceText?: string;
  registrationUrl?: string;
  pole?: Pole;
}

/** Event — pour les fiches événement (agenda, événements). */
export function event(i: EventInput) {
  const offers =
    i.registrationUrl || i.priceText
      ? {
          offers: {
            "@type": "Offer",
            ...(i.registrationUrl ? { url: i.registrationUrl } : {}),
            ...(i.priceText ? { description: i.priceText } : {}),
            availability: "https://schema.org/InStock",
          },
        }
      : {};

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: i.name,
    description: i.description,
    url: i.url,
    ...(i.startDate ? { startDate: i.startDate } : {}),
    ...(i.endDate ? { endDate: i.endDate } : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: i.location ?? site.name,
      address: postalAddress(),
    },
    ...(i.image ? { image: i.image } : {}),
    ...offers,
    organizer: { "@id": ORG_ID, name: site.name },
  };
}

/** FAQPage — pour les pages qui exposent une liste de questions/réponses. */
export function faqPage(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}

export interface ArticleInput {
  title: string;
  description: string;
  url: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
}

/** Article — pour toute page éditoriale datée. */
export function article(i: ArticleInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: i.title,
    description: i.description,
    url: i.url,
    ...(i.image ? { image: i.image } : {}),
    ...(i.datePublished ? { datePublished: i.datePublished } : {}),
    ...(i.dateModified ? { dateModified: i.dateModified } : {}),
    author:
      i.author && i.author !== site.name
        ? { "@type": "Person", name: i.author }
        : { "@id": ORG_ID, name: site.name },
    publisher: { "@id": ORG_ID, name: site.name },
  };
}

export interface PersonInput {
  name: string;
  url: string;
  jobTitle?: string;
  description?: string;
  image?: string;
}

/** Person — pour les fiches du collectif. */
export function person(i: PersonInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: i.name,
    url: i.url,
    ...(i.jobTitle ? { jobTitle: i.jobTitle } : {}),
    ...(i.description ? { description: i.description } : {}),
    ...(i.image ? { image: i.image } : {}),
    memberOf: { "@id": ORG_ID, name: site.name },
  };
}
