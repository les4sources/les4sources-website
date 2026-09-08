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
  /** Chemin absolu, sans slash final (ex. "/sejours/tarifs"). */
  path: string;
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
