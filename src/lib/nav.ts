/**
 * Navigation du site.
 *
 * Deux sources possibles, dans cet ordre :
 *   1. `migration/nav.json` (produit par le crawl du site actuel) — utilisé
 *      verbatim s'il existe : c'est la navigation réelle, on ne la réinvente pas.
 *   2. À défaut, la dérivation ci-dessous à partir de `migration/urls.txt`.
 *      Tous les chemins listés ici existent dans les 209 URLs du site actuel.
 *
 * Les URLs sont un contrat : aucun chemin ne doit être inventé ni renommé.
 */
import { readFileSync } from "node:fs";
import { site, type SocialLink } from "./site";

export interface NavLink {
  label: string;
  /** Chemin absolu, sans slash final (ex. "/sejours/tarifs"). */
  path: string;
}

export interface NavGroup {
  title: string;
  links: NavLink[];
}

/** Forme réelle de `migration/nav.json`, tel que le crawl du site actuel le produit. */
interface MigrationNav {
  header?: {
    links?: { label: string; href: string }[];
    cta?: { label?: string; href?: string } | null;
  };
  footer?: {
    lists?: { heading: string; links?: { label: string; href: string }[] }[];
    socials?: { type: string; link: string }[];
    footnote?: string | null;
    contact?: { address?: string | null; phone?: string | null; email?: string | null };
  };
}

/** Ce que le reste du site consomme, quelle que soit la source. */
interface ResolvedNav {
  primary: NavLink[];
  /** Appel à l'action de l'en-tête — `null` quand le site actuel n'en a pas. */
  cta: NavLink | null;
  footer: NavGroup[];
  socials: SocialLink[];
  footnote?: string;
  address?: string;
  email?: string;
  phone?: string;
}

/** "facebook" → "Facebook" — le crawl ne donne que le type du réseau. */
const socialLabel = (type: string) => type.charAt(0).toUpperCase() + type.slice(1);

const toLink = (l: { label: string; href: string }): NavLink => ({
  label: l.label,
  path: l.href.replace(/\/+$/, "") || "/",
});

function loadMigrationNav(): ResolvedNav | null {
  let parsed: MigrationNav;
  try {
    parsed = JSON.parse(readFileSync("migration/nav.json", "utf8")) as MigrationNav;
  } catch {
    return null;
  }

  const primary = (parsed.header?.links ?? []).filter((l) => l.href?.startsWith("/")).map(toLink);
  const footer = (parsed.footer?.lists ?? []).map((g) => ({
    title: g.heading,
    links: (g.links ?? []).filter((l) => l.href?.startsWith("/")).map(toLink),
  }));

  // Un fichier présent mais vide n'est pas une navigation : on retombe sur la dérivation.
  if (primary.length === 0 && footer.length === 0) return null;

  const contact = parsed.footer?.contact ?? {};
  const cta = parsed.header?.cta;
  return {
    primary,
    // Le site actuel n'a PAS de bouton d'appel à l'action dans son en-tête :
    // `cta: null` dans nav.json. On ne lui en invente pas un.
    cta: cta?.label && cta.href ? toLink({ label: cta.label, href: cta.href }) : null,
    footer,
    socials: (parsed.footer?.socials ?? []).map((s) => ({ label: socialLabel(s.type), url: s.link })),
    footnote: parsed.footer?.footnote ?? undefined,
    // `null` dans le crawl = donnée absente du site actuel : on n'invente rien.
    address: contact.address ?? undefined,
    email: contact.email ?? undefined,
    phone: contact.phone ?? undefined,
  };
}

const migrated = loadMigrationNav();

/** Navigation principale (en-tête) — copie conforme de migration/nav.json. */
const DERIVED_PRIMARY: NavLink[] = [
  { label: "Agenda", path: "/agenda" },
  { label: "Séjours", path: "/sejours" },
  { label: "Salles", path: "/sejours/salles" },
  { label: "Activités", path: "/activites" },
  { label: "Projets", path: "/projets" },
  { label: "À propos", path: "/a-propos" },
];

/**
 * Appel à l'action de l'en-tête.
 *
 * ATTENTION — le site ACTUEL n'en a pas : `header.cta` vaut `null` dans
 * migration/nav.json. C'est donc le seul écart assumé de la navigation par
 * rapport à la copie conforme, et il vient du nouveau design, pas du contenu.
 * `headerCta()` rend l'appel à l'action réel dès que le crawl en trouve un.
 * À trancher avec Michael : on garde ce bouton, ou l'en-tête reste sans CTA ?
 */
export const HEADER_CTA: NavLink = { label: "Nous soutenir", path: "/nous-soutenir" };

/** Appel à l'action tel que le site actuel le déclare — `null` s'il n'en a pas. */
export function headerCta(): NavLink | null {
  return migrated ? migrated.cta : HEADER_CTA;
}

/** Pied de page — copie conforme de migration/nav.json (libellés, ordre, liens). */
const DERIVED_FOOTER: NavGroup[] = [
  {
    title: "Séjours",
    links: [
      { label: "Hébergements", path: "/sejours/hebergements-yvoir" },
      { label: "Salles et cuisine", path: "/sejours/salles" },
      { label: "Tentes et hamacs", path: "/sejours/bivouac" },
      { label: "Tarifs", path: "/sejours/tarifs" },
      { label: "Disponibilités", path: "/sejours/disponibilites" },
    ],
  },
  {
    title: "Aux 4 Sources",
    links: [
      { label: "Mariages champêtres", path: "/mariage-champetre" },
      { label: "Anniversaires", path: "/anniversaire" },
      { label: "En famille ou entre amis", path: "/sejours/en-famille-aux-4-sources" },
      { label: "Retraites scolaires", path: "/sejours/retraites-scolaires" },
      { label: "Mises au vert", path: "/sejours/mises-au-vert" },
      { label: "Teams building", path: "/un-team-building-aux-4-sources" },
    ],
  },
  {
    title: "Découvrir",
    links: [
      { label: "Agenda", path: "/agenda" },
      { label: "Activités", path: "/activites" },
      { label: "Nos projets", path: "/projets" },
      { label: "Le Bar des 4 Sources", path: "/le-bar-des-4-sources" },
    ],
  },
  {
    title: "À propos",
    links: [
      { label: "Raison d'être", path: "/a-propos/notre-projet" },
      { label: "Nous soutenir", path: "/nous-soutenir" },
      { label: "Accès et adresse", path: "/a-propos/acces-ahinvaux" },
      { label: "Contact", path: "/contact" },
    ],
  },
];

export function primaryNav(): NavLink[] {
  return migrated?.primary.length ? migrated.primary : DERIVED_PRIMARY;
}

export function footerGroups(): NavGroup[] {
  return migrated?.footer.length ? migrated.footer : DERIVED_FOOTER;
}

/** Réseaux sociaux : uniquement ceux réellement trouvés (jamais inventés). */
export function socials(): SocialLink[] {
  return migrated?.socials.length ? migrated.socials : [...site.socials];
}

/** Mention légale du pied de page, telle qu'elle figure sur le site actuel. */
export function footnote(): string | undefined {
  return migrated?.footnote ?? site.footnote;
}

/** Coordonnées affichées dans le pied de page — `undefined` si inconnues. */
export function contactDetails(): { phone: string; email?: string; address?: string } {
  return {
    phone: migrated?.phone ?? site.phone,
    email: migrated?.email ?? site.email,
    address: migrated?.address,
  };
}
