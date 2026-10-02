/**
 * Navigation du site — source de vérité en code.
 *
 * Jusqu'à la revue de l'accueil (2026-09-08), la navigation était la copie
 * conforme de `migration/nav.json` (crawl du site Super.so). L'en-tête garde
 * les six liens du site historique ; le pied de page est réorganisé pour
 * couvrir les pages que l'ancien site n'atteignait que par sa grappe de liens
 * (événements, catalogue, carte de balades, biodiversité, coworking,
 * newsletter, collectif). `migration/nav.json` reste la trace du crawl, il
 * n'est plus lu.
 *
 * Les URLs sont un contrat : chaque chemin ci-dessous figure dans
 * `migration/urls.txt`. Aucun chemin n'est inventé ni renommé.
 */
import { site, type SocialLink } from "./site";

export interface NavLink {
  label: string;
  /** Chemin absolu, sans slash final (ex. "/sejours/tarifs") — ou URL complète si `external`. */
  path: string;
  /** Lien hors site (Claudy) : rendu avec `rel="noopener"`. */
  external?: boolean;
}

export interface NavGroup {
  title: string;
  links: NavLink[];
}

/** Navigation principale (en-tête) — les six entrées du site historique. */
const PRIMARY: NavLink[] = [
  { label: "Agenda", path: "/agenda" },
  { label: "Séjours", path: "/sejours" },
  { label: "Salles", path: "/sejours/salles" },
  { label: "Activités", path: "/activites" },
  { label: "Projets", path: "/projets" },
  { label: "À propos", path: "/a-propos" },
];

/**
 * Appel à l'action de l'en-tête : la demande de réservation dans Claudy
 * (décision de Michael, 2026-09-08 — le bouton jaune envoyait vers le bar).
 */
export const HEADER_CTA = { label: "Réserver", href: site.reservationUrl } as const;

/** Pied de page — quatre groupes, tous les chemins existent sur le site. */
const FOOTER: NavGroup[] = [
  {
    title: "Séjours",
    links: [
      { label: "Séjours et locations", path: "/sejours" },
      { label: "Hébergements", path: "/sejours/hebergements-yvoir" },
      { label: "Salles et cuisine", path: "/sejours/salles" },
      { label: "Tentes et hamacs", path: "/sejours/bivouac" },
      { label: "Tarifs", path: "/sejours/tarifs" },
      { label: "Disponibilités", path: "/sejours/disponibilites" },
      { label: "Espace client", path: site.portalUrl, external: true },
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
      { label: "Team buildings", path: "/un-team-building-aux-4-sources" },
      { label: "Coworking", path: "/coworking" },
    ],
  },
  {
    title: "Découvrir",
    links: [
      { label: "Agenda", path: "/agenda" },
      { label: "Événements", path: "/evenements" },
      { label: "Activités", path: "/activites" },
      { label: "Catalogue des activités", path: "/catalogue" },
      { label: "Nos projets", path: "/projets" },
      { label: "Le Bar des 4 Sources", path: "/le-bar-des-4-sources" },
      { label: "Carte de balades", path: "/carte-de-balades-vallee-du-bocq" },
      { label: "Biodiversité", path: "/biodiversite" },
    ],
  },
  {
    title: "À propos",
    links: [
      { label: "Raison d'être", path: "/a-propos/notre-projet" },
      { label: "Notre collectif", path: "/notre-collectif" },
      { label: "Nous soutenir", path: "/nous-soutenir" },
      { label: "Newsletter", path: "/newsletter" },
      { label: "Accès et adresse", path: "/a-propos/acces-ahinvaux" },
      { label: "Contact", path: "/contact" },
    ],
  },
];

export function primaryNav(): NavLink[] {
  return PRIMARY;
}

export function footerGroups(): NavGroup[] {
  return FOOTER;
}

/** Réseaux sociaux : uniquement ceux réellement liés depuis le site (jamais inventés). */
export function socials(): SocialLink[] {
  return [...site.socials];
}

/**
 * Menus de section : sur ordinateur, les pages d'une section affichent les
 * autres pages de la même section dans une colonne qui suit le défilement
 * (demande de Michael, 2026-10-02 : la moitié droite de l'écran restait vide).
 * Les libellés sont les titres de la page hub (`/a-propos`).
 */
const SECTIONS: NavGroup[] = [
  {
    title: "À propos",
    links: [
      { label: "À propos des 4 Sources", path: "/a-propos" },
      { label: "Accéder aux 4 Sources", path: "/a-propos/acces-ahinvaux" },
      { label: "Raison d’être du projet", path: "/a-propos/notre-projet" },
      { label: "Soutenir Les 4 Sources", path: "/nous-soutenir" },
      { label: "Notre collectif", path: "/notre-collectif" },
      { label: "Les animaux", path: "/a-propos/les-animaux-des-4-sources" },
      { label: "Dans la presse", path: "/a-propos/les-4-sources-dans-la-presse" },
      { label: "Un tiers-lieu nourricier", path: "/a-propos/jardin-foret-et-verger" },
      { label: "Le Domaine d’Ahinvaux", path: "/a-propos/domaine-d-ahinvaux" },
    ],
  },
];

/** La section d'une page (hors page hub, qui liste déjà toute la section). */
export function sectionOf(path: string): NavGroup | undefined {
  const clean = path.replace(/\/+$/, "") || "/";
  return SECTIONS.find((s) => s.links.slice(1).some((l) => l.path === clean));
}
