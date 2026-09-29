/**
 * Les événements et activités tels que les cartes du site les consomment.
 *
 * `siteData()` fusionne Claudy et le contenu migré, mais ne porte pas l'image
 * locale optimisée d'une fiche migrée (elle vit dans la collection, en
 * `ImageMetadata`). On la rattache ici, une fois, par l'id de l'entrée migrée.
 */
import { getCollection } from "astro:content";
import type { ImageMetadata } from "astro";
import { currentYearBrussels, expiresAt, formatDateRange } from "@lib/content";
import { siteData } from "@lib/data";
import { eventPole, isPastEvent } from "@lib/events";
import { isPole, pole as resolvePole, type PoleSlug } from "@lib/poles";
import { claudyImage, type RemoteImage } from "@lib/remote-image";
import { cardTitle, displayDescription } from "@lib/text";

export interface EventItem {
  /** Titre tel qu'une carte l'affiche : sans « COMPLET ! » (le badge le dit), emoji de tête espacé. */
  title: string;
  path: string;
  /** Date déjà formatée (« samedi 6 septembre », l'année seulement si ce n'est pas celle en cours). */
  dateLabel?: string;
  start?: string;
  end?: string;
  /** Instant ISO après lequel la carte n'est plus « à venir » (garde côté navigateur). */
  until?: string;
  pole: PoleSlug;
  /** Thématiques de l'événement, découpées (« Ressourcement, Artisanat »). */
  categories: string[];
  /** Complet — jamais pour un événement passé : sa carte ne dit pas « complet ». */
  soldOut: boolean;
  cover?: ImageMetadata | RemoteImage;
}

export interface ActivityItem {
  title: string;
  path: string;
  /** Emoji de la fiche (« 🐎 »), affiché devant le titre. */
  icon?: string;
  /** Taille de groupe (« 3 à 8 personnes »). */
  participants?: string;
  description?: string;
  pole: PoleSlug;
  cover?: ImageMetadata | RemoteImage;
}

const splitCategories = (value?: string): string[] =>
  (value ?? "")
    .split(/\s*,\s*/)
    .map((c) => c.trim())
    .filter(Boolean);

/** Un titre qui crie « COMPLET » l'est. */
const isSoldOut = (title: string): boolean => /complet/i.test(title);

/** « 3 à 8 personnes », « Jusqu'à 15 personnes », « À partir de 6 personnes ». */
export function participantsOf(min?: number, max?: number): string | undefined {
  if (min && max) return min === max ? `${max} personnes` : `${min} à ${max} personnes`;
  if (max) return `Jusqu'à ${max} personnes`;
  if (min) return `À partir de ${min} personnes`;
  return undefined;
}

/** Largeurs des variantes d'une photo de carte (380 px affichés au plus, écrans denses compris). */
const CARD_WIDTHS = [400, 640, 960];

let cachedEvents: Promise<EventItem[]> | null = null;
let cachedActivities: Promise<ActivityItem[]> | null = null;

async function buildEvents(): Promise<EventItem[]> {
  const [{ events }, entries] = await Promise.all([siteData(), getCollection("evenements")]);
  const covers = new Map<string, ImageMetadata>();
  for (const entry of entries) {
    const cover = (entry.data as { cover?: ImageMetadata }).cover;
    if (cover) covers.set(entry.id, cover);
  }

  const currentYear = currentYearBrussels();
  // Une fiche retirée du programme reste servie à son URL, jamais listée.
  return Promise.all(events.filter((e) => e.archived !== true).map(async (e) => {
    const titledSoldOut = isSoldOut(e.title);
    // Le pôle de la fiche, sinon celui de sa thématique (Environnement → nature…).
    const pole: PoleSlug = eventPole(e);
    // L'image publiée dans Claudy l'emporte : c'est celle que l'éditrice a choisie.
    const remote = e.source === "claudy" ? await claudyImage(e.image?.url, CARD_WIDTHS) : undefined;
    return {
      title: cardTitle(e.title, titledSoldOut),
      path: e.path,
      dateLabel: formatDateRange(e.start, e.end, { currentYear }),
      start: e.start,
      end: e.end,
      until: expiresAt(e),
      pole,
      // Un événement Claudy rattaché à un pôle se filtre sous le nom du pôle, comme
      // les fiches migrées — pas sous la catégorie interne de Claudy (« Parties »).
      categories:
        e.source === "claudy" && isPole(e.pole)
          ? [resolvePole(e.pole).category]
          : splitCategories(e.categoryName),
      soldOut: titledSoldOut && !isPastEvent(e),
      cover: remote ?? (e.legacyId ? covers.get(e.legacyId) : undefined),
    };
  }));
}

async function buildActivities(): Promise<ActivityItem[]> {
  const [{ experiences }, entries] = await Promise.all([siteData(), getCollection("catalogue")]);
  const covers = new Map<string, ImageMetadata>();
  for (const entry of entries) {
    const cover = (entry.data as { cover?: ImageMetadata }).cover;
    if (cover) covers.set(entry.id, cover);
  }

  return Promise.all(experiences.map(async (x) => {
    const remote = x.source === "claudy" ? await claudyImage(x.image?.url, CARD_WIDTHS) : undefined;
    return {
      title: x.title,
      path: x.path,
      icon: x.icon,
      participants: participantsOf(x.minParticipants, x.maxParticipants),
      // Une description fabriquée au build sert au SEO, jamais d'accroche de carte.
      description: displayDescription(x.description, x.generatedDescription),
      pole: isPole(x.pole) ? x.pole : "nature",
      cover: remote ?? (x.legacyId ? covers.get(x.legacyId) : undefined),
    };
  }));
}

export function eventItems(): Promise<EventItem[]> {
  cachedEvents ??= buildEvents();
  return cachedEvents;
}

export function activityItems(): Promise<ActivityItem[]> {
  cachedActivities ??= buildActivities();
  return cachedActivities;
}

/** Retrouve une activité par son chemin — les cartes de l'accueil sont nommées par lien. */
export async function activityByPath(path: string): Promise<ActivityItem | undefined> {
  const all = await activityItems();
  const clean = path.replace(/\/+$/, "");
  return all.find((a) => a.path.replace(/\/+$/, "") === clean);
}

/** Toutes les thématiques rencontrées, dédupliquées, dans l'ordre alphabétique. */
export function categoriesOf(events: EventItem[]): string[] {
  const set = new Set<string>();
  for (const e of events) for (const c of e.categories) set.add(c);
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
}
