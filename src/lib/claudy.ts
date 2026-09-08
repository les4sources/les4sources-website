/**
 * Contrat Claudy → site web (voir `docs/CLAUDY.md`, source de vérité).
 *
 * Le site lit les événements et les activités AU BUILD, jamais au runtime.
 * Trois sources possibles, dans cet ordre :
 *   1. l'API publique de Claudy (`CLAUDY_PUBLIC_API_URL`) ;
 *   2. une fixture locale (`CLAUDY_FIXTURE`, défaut `src/data/claudy.fixture.json`) ;
 *   3. rien du tout — le site retombe alors intégralement sur le contenu migré.
 *
 * Règle d'or : le build ne casse JAMAIS à cause de Claudy. Toute erreur réseau,
 * tout schéma invalide est journalisé puis ignoré.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { POLES, type Pole } from "./site";

/* ───────────────────────── Schémas (docs/CLAUDY.md) ───────────────────────── */

const poleSchema = z.enum(POLES);

export const claudyImageSchema = z.object({
  url: z.string(),
  alt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const claudyCategorySchema = z.object({
  slug: z.string(),
  name: z.string(),
  color: z.string().optional(),
  pole: poleSchema.optional(),
});

export const claudyEventSchema = z.object({
  id: z.number(),
  slug: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  description_html: z.string().optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  all_day: z.boolean().default(false),
  category: claudyCategorySchema.optional(),
  location: z.string().optional(),
  price_text: z.string().optional(),
  registration_url: z.string().optional(),
  image: claudyImageSchema.optional(),
  published_at: z.string().optional(),
  updated_at: z.string().optional(),
  path: z.string().optional(),
});

export const claudyPriceSchema = z.object({
  amount_cents: z.number(),
  currency: z.string().default("EUR"),
  per: z.enum(["participant", "group"]).optional(),
});

export const claudyAvailabilitySchema = z.object({
  date: z.string(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  spots_left: z.number().optional(),
});

export const claudyExperienceSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  summary: z.string().optional(),
  description_html: z.string().optional(),
  duration_text: z.string().optional(),
  duration_minutes: z.number().optional(),
  price: claudyPriceSchema.optional(),
  fixed_price: claudyPriceSchema.partial({ per: true }).optional(),
  min_participants: z.number().optional(),
  max_participants: z.number().optional(),
  carrier: z.object({ name: z.string() }).optional(),
  category: claudyCategorySchema.optional(),
  image: claudyImageSchema.optional(),
  availabilities: z.array(claudyAvailabilitySchema).default([]),
  booking_url: z.string().optional(),
  published_at: z.string().optional(),
  updated_at: z.string().optional(),
  path: z.string().optional(),
});

export const eventsResponseSchema = z.object({
  generated_at: z.string().optional(),
  events: z.array(claudyEventSchema),
});

export const experiencesResponseSchema = z.object({
  generated_at: z.string().optional(),
  experiences: z.array(claudyExperienceSchema),
});

export const categoriesResponseSchema = z.object({
  generated_at: z.string().optional(),
  categories: z.array(claudyCategorySchema),
});

/** Forme de la fixture locale : les trois réponses réunies dans un seul fichier. */
export const fixtureSchema = z.object({
  generated_at: z.string().optional(),
  events: z.array(claudyEventSchema).default([]),
  experiences: z.array(claudyExperienceSchema).default([]),
  event_categories: z.array(claudyCategorySchema).default([]),
});

export type ClaudyEvent = z.infer<typeof claudyEventSchema>;
export type ClaudyExperience = z.infer<typeof claudyExperienceSchema>;
export type ClaudyCategory = z.infer<typeof claudyCategorySchema>;

/* ───────────────────────────── Chargement ───────────────────────────── */

export type ClaudySource = "api" | "fixture" | "none";

export interface ClaudyData {
  source: ClaudySource;
  events: ClaudyEvent[];
  experiences: ClaudyExperience[];
  categories: ClaudyCategory[];
}

const EMPTY: ClaudyData = { source: "none", events: [], experiences: [], categories: [] };
const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_FIXTURE = "src/data/claudy.fixture.json";

function note(message: string): void {
  console.log(`claudy: ${message}`);
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

async function loadFromApi(base: string): Promise<ClaudyData | null> {
  const root = base.replace(/\/$/, "");
  try {
    const [rawEvents, rawExperiences, rawCategories] = await Promise.all([
      fetchJson(`${root}/events`),
      fetchJson(`${root}/experiences`),
      fetchJson(`${root}/event_categories`),
    ]);

    const events = eventsResponseSchema.safeParse(rawEvents);
    const experiences = experiencesResponseSchema.safeParse(rawExperiences);
    const categories = categoriesResponseSchema.safeParse(rawCategories);

    if (!events.success) note(`réponse /events invalide — ignorée (${events.error.issues.length} erreur(s))`);
    if (!experiences.success)
      note(`réponse /experiences invalide — ignorée (${experiences.error.issues.length} erreur(s))`);
    if (!categories.success)
      note(`réponse /event_categories invalide — ignorée (${categories.error.issues.length} erreur(s))`);

    // Aucune des trois réponses n'est exploitable : on laisse la fixture prendre le relais.
    if (!events.success && !experiences.success) return null;

    return {
      source: "api",
      events: events.success ? events.data.events : [],
      experiences: experiences.success ? experiences.data.experiences : [],
      categories: categories.success ? categories.data.categories : [],
    };
  } catch (error) {
    note(`API injoignable (${(error as Error).message}) — repli sur la fixture`);
    return null;
  }
}

function loadFromFixture(path: string): ClaudyData | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null; // pas de fixture : ce n'est pas une erreur, c'est la source "none".
  }
  try {
    const parsed = fixtureSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      note(`fixture ${path} invalide — ignorée (${parsed.error.issues.length} erreur(s))`);
      return null;
    }
    return {
      source: "fixture",
      events: parsed.data.events,
      experiences: parsed.data.experiences,
      categories: parsed.data.event_categories,
    };
  } catch (error) {
    note(`fixture ${path} illisible (${(error as Error).message}) — ignorée`);
    return null;
  }
}

let cached: Promise<ClaudyData> | null = null;

async function resolveClaudy(): Promise<ClaudyData> {
  const apiUrl = process.env.CLAUDY_PUBLIC_API_URL;
  if (apiUrl) {
    const fromApi = await loadFromApi(apiUrl);
    if (fromApi) return fromApi;
  }

  // La fixture est un DOUBLURE DE TEST : elle ne s'invite jamais d'elle-même
  // dans un build. Sans `CLAUDY_FIXTURE`, Claudy est simplement « non
  // configuré » et le site retombe intégralement sur le contenu migré (ISC-22).
  // Sinon un `bun run build` ordinaire publierait les événements de démonstration
  // à la place des vraies fiches du site — et la parité s'effondrerait.
  // `CLAUDY_FIXTURE=1` ou `=true` prend la fixture par défaut du dépôt.
  const asked = process.env.CLAUDY_FIXTURE;
  if (!asked) return EMPTY;
  const fixturePath = asked === "1" || asked === "true" ? DEFAULT_FIXTURE : asked;
  return loadFromFixture(fixturePath) ?? EMPTY;
}

/** Charge les données Claudy une seule fois par build (mémoïsé). */
export function loadClaudy(): Promise<ClaudyData> {
  cached ??= resolveClaudy();
  return cached;
}

/* ───────────────────────────── Fusion ───────────────────────────── */

export interface MergedImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

interface MergedBase {
  slug: string;
  path: string;
  title: string;
  /** <title> alternatif quand le titre d'affichage dépasse 60 caractères. */
  seoTitle?: string;
  description: string;
  /** Vrai quand la description est fabriquée : elle sert le SEO, jamais la copie affichée. */
  generatedDescription?: boolean;
  descriptionHtml?: string;
  image?: MergedImage;
  pole?: Pole;
  source: "claudy" | "legacy";
  /** Id de l'entrée migrée correspondante, si elle existe (pour rendre son Markdown). */
  legacyId?: string;
  icon?: string;
}

export interface MergedEvent extends MergedBase {
  /** ISO 8601 — les props de getStaticPaths restent des chaînes, jamais des Date. */
  start?: string;
  end?: string;
  allDay: boolean;
  location?: string;
  priceText?: string;
  registrationUrl?: string;
  categoryName?: string;
}

export interface MergedExperience extends MergedBase {
  priceText?: string;
  duration?: string;
  minParticipants?: number;
  maxParticipants?: number;
  bookingUrl?: string;
  /** Fiche conservée (URL préservée) mais retirée des listings. */
  archived?: boolean;
}

/** Entrée migrée telle que la fournissent les collections `evenements` / `catalogue`. */
export interface LegacyEntry {
  id: string;
  data: {
    title: string;
    seoTitle?: string;
    description: string;
    generatedDescription?: boolean;
    legacyPath: string;
    draft?: boolean;
    archived?: boolean;
    icon?: string;
    pole?: Pole;
    start?: Date;
    end?: Date;
    location?: string;
    registrationUrl?: string;
    priceText?: string;
    category?: string;
    duration?: string;
    minParticipants?: number;
    maxParticipants?: number;
  };
}

/** Dernier segment d'un chemin : "/evenements/pizza-party" → "pizza-party". */
export function slugOfPath(path: string): string {
  const clean = path.replace(/\/+$/, "");
  return clean.slice(clean.lastIndexOf("/") + 1);
}

const iso = (d: Date | undefined): string | undefined => d?.toISOString();

function fromClaudyEvent(e: ClaudyEvent, legacyId?: string): MergedEvent {
  return {
    slug: e.slug,
    path: e.path ?? `/evenements/${e.slug}`,
    title: e.title,
    description: e.summary ?? "",
    descriptionHtml: e.description_html,
    image: e.image,
    pole: e.category?.pole,
    categoryName: e.category?.name,
    source: "claudy",
    legacyId,
    start: e.starts_at,
    end: e.ends_at,
    allDay: e.all_day,
    location: e.location,
    priceText: e.price_text,
    registrationUrl: e.registration_url,
  };
}

function fromLegacyEvent(entry: LegacyEntry): MergedEvent {
  const path = entry.data.legacyPath;
  return {
    slug: slugOfPath(path),
    path,
    title: entry.data.title,
    seoTitle: entry.data.seoTitle,
    description: entry.data.description,
    generatedDescription: entry.data.generatedDescription,
    pole: entry.data.pole,
    categoryName: entry.data.category,
    source: "legacy",
    legacyId: entry.id,
    icon: entry.data.icon,
    start: iso(entry.data.start),
    end: iso(entry.data.end),
    allDay: false,
    location: entry.data.location,
    priceText: entry.data.priceText,
    registrationUrl: entry.data.registrationUrl,
  };
}

/**
 * Fusionne les événements Claudy et les fiches migrées.
 *  - un événement Claudy dont le slug existe aussi en migré REMPLACE le migré ;
 *  - les fiches migrées sans homologue Claudy restent servies (URLs préservées) ;
 *  - un événement Claudy inédit s'ajoute avec le chemin `/evenements/<slug>`.
 */
export function mergeEvents(claudyEvents: ClaudyEvent[], legacyEntries: LegacyEntry[]): MergedEvent[] {
  const legacyBySlug = new Map<string, LegacyEntry>();
  for (const entry of legacyEntries) {
    if (entry.data.draft === true) continue;
    legacyBySlug.set(slugOfPath(entry.data.legacyPath), entry);
  }

  const merged: MergedEvent[] = [];
  const claimed = new Set<string>();

  for (const e of claudyEvents) {
    const twin = legacyBySlug.get(e.slug);
    if (twin) claimed.add(e.slug);
    merged.push(fromClaudyEvent(e, twin?.id));
  }
  for (const [slug, entry] of legacyBySlug) {
    if (!claimed.has(slug)) merged.push(fromLegacyEvent(entry));
  }
  return merged;
}

function priceTextOf(e: ClaudyExperience): string | undefined {
  if (e.price && e.price.amount_cents > 0) {
    const amount = (e.price.amount_cents / 100).toLocaleString("fr-BE", {
      style: "currency",
      currency: e.price.currency,
    });
    return e.price.per === "group" ? `${amount} par groupe` : `${amount} par personne`;
  }
  if (e.fixed_price && e.fixed_price.amount_cents > 0) {
    const amount = (e.fixed_price.amount_cents / 100).toLocaleString("fr-BE", {
      style: "currency",
      currency: e.fixed_price.currency,
    });
    return `Forfait ${amount}`;
  }
  return undefined;
}

function fromClaudyExperience(e: ClaudyExperience, legacyId?: string): MergedExperience {
  return {
    slug: e.slug,
    path: e.path ?? `/catalogue/${e.slug}`,
    title: e.name,
    description: e.summary ?? "",
    descriptionHtml: e.description_html,
    image: e.image,
    pole: e.category?.pole,
    source: "claudy",
    legacyId,
    priceText: priceTextOf(e),
    duration: e.duration_text,
    minParticipants: e.min_participants,
    maxParticipants: e.max_participants,
    bookingUrl: e.booking_url,
  };
}

function fromLegacyExperience(entry: LegacyEntry): MergedExperience {
  const path = entry.data.legacyPath;
  return {
    slug: slugOfPath(path),
    path,
    title: entry.data.title,
    seoTitle: entry.data.seoTitle,
    description: entry.data.description,
    generatedDescription: entry.data.generatedDescription,
    pole: entry.data.pole,
    source: "legacy",
    legacyId: entry.id,
    icon: entry.data.icon,
    priceText: entry.data.priceText,
    duration: entry.data.duration,
    minParticipants: entry.data.minParticipants,
    maxParticipants: entry.data.maxParticipants,
    // La fiche reste servie (son URL est un contrat) mais quitte les listings.
    archived: entry.data.archived === true,
  };
}

/** Même règle de fusion que `mergeEvents`, pour le catalogue d'activités. */
export function mergeExperiences(
  claudyExperiences: ClaudyExperience[],
  legacyEntries: LegacyEntry[],
): MergedExperience[] {
  const legacyBySlug = new Map<string, LegacyEntry>();
  for (const entry of legacyEntries) {
    if (entry.data.draft === true) continue;
    legacyBySlug.set(slugOfPath(entry.data.legacyPath), entry);
  }

  const merged: MergedExperience[] = [];
  const claimed = new Set<string>();

  for (const e of claudyExperiences) {
    const twin = legacyBySlug.get(e.slug);
    if (twin) claimed.add(e.slug);
    merged.push(fromClaudyExperience(e, twin?.id));
  }
  for (const [slug, entry] of legacyBySlug) {
    if (!claimed.has(slug)) merged.push(fromLegacyExperience(entry));
  }
  return merged;
}

/* ─────────────────── Journal de synthèse (une ligne par build) ─────────────────── */

let summaryPrinted = false;

/**
 * Imprime la ligne de synthèse exigée par le contrat, une seule fois par build :
 * `claudy: source=<api|fixture|none> events=<n> experiences=<n> merged=<n> legacy_only=<n>`
 */
export function logClaudySummary(
  data: ClaudyData,
  events: MergedEvent[],
  experiences: MergedExperience[],
): void {
  if (summaryPrinted) return;
  summaryPrinted = true;

  const all = [...events, ...experiences];
  const merged = all.filter((x) => x.source === "claudy").length;
  const legacyOnly = all.filter((x) => x.source === "legacy").length;

  console.log(
    `claudy: source=${data.source} events=${data.events.length} experiences=${data.experiences.length} merged=${merged} legacy_only=${legacyOnly}`,
  );
}
