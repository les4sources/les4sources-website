/**
 * Les événements et activités tels que les cartes du site les consomment.
 *
 * `siteData()` fusionne Claudy et le contenu migré, mais ne porte pas l'image
 * locale optimisée d'une fiche migrée (elle vit dans la collection, en
 * `ImageMetadata`). On la rattache ici, une fois, par l'id de l'entrée migrée.
 */
import { getCollection } from "astro:content";
import type { ImageMetadata } from "astro";
import { currentYearBrussels, formatDateRange } from "@lib/content";
import { siteData } from "@lib/data";
import { isPole, type PoleSlug } from "@lib/poles";
import { cardTitle } from "@lib/text";

export interface EventItem {
  /** Titre tel qu'une carte l'affiche : sans « COMPLET ! » (le badge le dit), emoji de tête espacé. */
  title: string;
  path: string;
  /** Date déjà formatée (« samedi 6 septembre », l'année seulement si ce n'est pas celle en cours). */
  dateLabel?: string;
  start?: string;
  pole: PoleSlug;
  /** Thématiques de l'événement, découpées (« Ressourcement, Artisanat »). */
  categories: string[];
  soldOut: boolean;
  cover?: ImageMetadata;
}

export interface ActivityItem {
  title: string;
  path: string;
  description?: string;
  pole: PoleSlug;
  cover?: ImageMetadata;
}

const splitCategories = (value?: string): string[] =>
  (value ?? "")
    .split(/\s*,\s*/)
    .map((c) => c.trim())
    .filter(Boolean);

/** Un titre qui crie « COMPLET » l'est. */
const isSoldOut = (title: string): boolean => /complet/i.test(title);

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
  return events.map((e) => {
    const soldOut = isSoldOut(e.title);
    return {
      title: cardTitle(e.title, soldOut),
      path: e.path,
      dateLabel: formatDateRange(e.start, e.end, { currentYear }),
      start: e.start,
      pole: isPole(e.pole) ? e.pole : "convivialite",
      categories: splitCategories(e.categoryName),
      soldOut,
      cover: e.legacyId ? covers.get(e.legacyId) : undefined,
    };
  });
}

async function buildActivities(): Promise<ActivityItem[]> {
  const [{ experiences }, entries] = await Promise.all([siteData(), getCollection("catalogue")]);
  const covers = new Map<string, ImageMetadata>();
  for (const entry of entries) {
    const cover = (entry.data as { cover?: ImageMetadata }).cover;
    if (cover) covers.set(entry.id, cover);
  }

  return experiences.map((x) => ({
    title: x.title,
    path: x.path,
    description: x.description || undefined,
    pole: isPole(x.pole) ? x.pole : "nature",
    cover: x.legacyId ? covers.get(x.legacyId) : undefined,
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
