/**
 * Aides de lecture des collections.
 *
 * Le pivot est `legacyPath` : la route d'une entrée est TOUJOURS son chemin
 * d'origine, jamais son nom de fichier. Ces aides évitent que chaque page
 * refasse la manipulation de chaîne à sa manière.
 */

/** Toute entrée de collection porte au minimum ces champs. */
export interface PathedEntry {
  id: string;
  data: {
    legacyPath: string;
    draft?: boolean;
    archived?: boolean;
    start?: Date;
  };
}

/** Normalise un chemin : slash de tête garanti, pas de slash final (sauf "/"). */
export function normalizePath(path: string): string {
  const withLead = path.startsWith("/") ? path : `/${path}`;
  return withLead.replace(/\/+$/, "") || "/";
}

/** Chemin public d'une entrée — son `legacyPath`, normalisé. */
export function pathOf(entry: PathedEntry): string {
  return normalizePath(entry.data.legacyPath);
}

/** Retrouve une entrée par son chemin d'origine. */
export function byPath<T extends PathedEntry>(collection: T[], path: string): T | undefined {
  const target = normalizePath(path);
  return collection.find((e) => pathOf(e) === target);
}

/** Retire les brouillons. Les entrées archivées restent servies (URL préservée). */
export function visible<T extends PathedEntry>(entries: T[]): T[] {
  return entries.filter((e) => e.data.draft !== true);
}

/** Retire les brouillons ET les archives — pour les listings. */
export function listable<T extends PathedEntry>(entries: T[]): T[] {
  return entries.filter((e) => e.data.draft !== true && e.data.archived !== true);
}

/**
 * Aujourd'hui à minuit, heure de Bruxelles, en instant UTC. Un événement du jour
 * compte comme « à venir » jusqu'à la fin de sa journée locale.
 */
export function startOfTodayBrussels(now: Date = new Date()): Date {
  // `en-CA` donne un YYYY-MM-DD ; on lit la date civile telle qu'elle est à Bruxelles.
  const civil = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // Minuit local ≈ 22:00 ou 23:00 UTC la veille ; on reste volontairement à minuit
  // UTC, ce qui suffit au tri à-venir/passé à l'échelle de la journée.
  return new Date(`${civil}T00:00:00Z`);
}

interface Datable {
  start?: string | Date;
}

function startInstant(item: Datable): number | null {
  if (!item.start) return null;
  const d = item.start instanceof Date ? item.start : new Date(item.start);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** Événements à venir (date absente = considéré à venir), du plus proche au plus lointain. */
export function upcomingEvents<T extends Datable>(events: T[], now: Date = new Date()): T[] {
  const floor = startOfTodayBrussels(now).getTime();
  return events
    .filter((e) => {
      const t = startInstant(e);
      return t === null || t >= floor;
    })
    .sort((a, b) => (startInstant(a) ?? Infinity) - (startInstant(b) ?? Infinity));
}

/**
 * Événements datés des `months` prochains mois calendaires, aujourd'hui inclus,
 * du plus proche au plus lointain — c'est la fenêtre de l'accueil. Une fiche
 * sans date ne peut pas s'y placer : elle reste servie à son URL et dans
 * l'agenda, jamais dans ce ruban.
 */
export function upcomingEventsWithin<T extends Datable>(
  events: T[],
  months = 2,
  now: Date = new Date(),
): T[] {
  const floor = startOfTodayBrussels(now);
  const ceiling = new Date(floor);
  ceiling.setUTCMonth(ceiling.getUTCMonth() + months);
  const min = floor.getTime();
  const max = ceiling.getTime();
  return events
    .filter((e) => {
      const t = startInstant(e);
      return t !== null && t >= min && t < max;
    })
    .sort((a, b) => (startInstant(a) ?? 0) - (startInstant(b) ?? 0));
}

/** Événements passés, du plus récent au plus ancien. */
export function pastEvents<T extends Datable>(events: T[], now: Date = new Date()): T[] {
  const floor = startOfTodayBrussels(now).getTime();
  return events
    .filter((e) => {
      const t = startInstant(e);
      return t !== null && t < floor;
    })
    .sort((a, b) => (startInstant(b) ?? 0) - (startInstant(a) ?? 0));
}

/* ─────────────────────────── Dates en français ───────────────────────────
 * Le site est monolingue FR : « samedi 12 septembre 2026 » (minuscules, pas de
 * zéro de tête), les heures « 18h30 » — cf. design/README.md.
 *
 * Les libellés sont écrits ici plutôt que délégués à `Intl` avec la locale
 * `fr-BE` : le build a déjà rendu des dates en anglais faute de données de
 * locale complètes dans l'exécutable. Seul le découpage civil (quel jour,
 * quelle heure à Bruxelles) passe par `Intl`, qui n'a besoin d'aucune donnée
 * de langue pour cela.
 */

const TZ = "Europe/Brussels";

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

interface CivilDate {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  /** 0 = dimanche */
  weekday: number;
  hour: number;
  minute: number;
}

const CIVIL = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function toDate(value: string | Date | undefined): Date | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Découpe un instant en date civile bruxelloise (sans dépendre d'une locale). */
function civil(d: Date): CivilDate {
  const part: Record<string, string> = {};
  for (const p of CIVIL.formatToParts(d)) part[p.type] = p.value;
  const year = Number(part.year);
  const month = Number(part.month);
  const day = Number(part.day);
  return {
    year,
    month,
    day,
    // Jour de la semaine calculé, pas traduit : pure arithmétique de calendrier.
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    hour: Number(part.hour),
    minute: Number(part.minute),
  };
}

const sameDay = (a: CivilDate, b: CivilDate) =>
  a.year === b.year && a.month === b.month && a.day === b.day;

/**
 * Options d'affichage : `currentYear` fait taire l'année quand c'est celle en
 * cours (« samedi 12 septembre », comme le veut la charte) — les cartes
 * l'utilisent, les fiches et le JSON-LD gardent la date complète.
 */
export interface DateFormatOptions {
  currentYear?: number;
}

/** Année civile (Bruxelles) d'un instant — pour grouper ou pour taire l'année en cours. */
export function yearOf(value: string | Date | undefined): number | undefined {
  const d = toDate(value);
  return d ? civil(d).year : undefined;
}

/** L'année en cours à Bruxelles, au moment du build. */
export function currentYearBrussels(now: Date = new Date()): number {
  return civil(now).year;
}

const yearSuffix = (year: number, opts?: DateFormatOptions) =>
  opts?.currentYear === year ? "" : ` ${year}`;

/** Date lisible en français, ex. « samedi 12 septembre 2026 ». */
export function formatDate(
  value: string | Date | undefined,
  opts?: DateFormatOptions,
): string | undefined {
  const d = toDate(value);
  if (!d) return undefined;
  const c = civil(d);
  return `${WEEKDAYS[c.weekday]} ${c.day} ${MONTHS[c.month - 1]}${yearSuffix(c.year, opts)}`;
}

/** Date courte, sans le jour de la semaine : « 12 septembre 2026 ». */
export function formatDateShort(value: string | Date | undefined): string | undefined {
  const d = toDate(value);
  if (!d) return undefined;
  const c = civil(d);
  return `${c.day} ${MONTHS[c.month - 1]} ${c.year}`;
}

/**
 * Période lisible : une seule date quand la fin manque ou tombe le même jour,
 * sinon « du 3 au 5 octobre 2026 » — le mois et l'année ne sont répétés que
 * lorsqu'ils changent.
 */
export function formatDateRange(
  start: string | Date | undefined,
  end?: string | Date | undefined,
  opts?: DateFormatOptions,
): string | undefined {
  const from = toDate(start);
  if (!from) return undefined;
  const to = toDate(end);
  if (!to) return formatDate(from, opts);
  const a = civil(from);
  const b = civil(to);
  if (sameDay(a, b)) return formatDate(from, opts);

  if (a.year !== b.year) {
    return `du ${a.day} ${MONTHS[a.month - 1]} ${a.year} au ${b.day} ${MONTHS[b.month - 1]} ${b.year}`;
  }
  if (a.month !== b.month) {
    return `du ${a.day} ${MONTHS[a.month - 1]} au ${b.day} ${MONTHS[b.month - 1]}${yearSuffix(b.year, opts)}`;
  }
  return `du ${a.day} au ${b.day} ${MONTHS[a.month - 1]}${yearSuffix(a.year, opts)}`;
}

/**
 * Heure lisible, ex. « 18h30 » (« 18h » à l'heure pile).
 * Minuit vaut « pas d'heure connue » : les fiches sans horaire sont datées à
 * 00:00, afficher « 0h » inventerait une information.
 */
export function formatTime(value: string | Date | undefined): string | undefined {
  const d = toDate(value);
  if (!d) return undefined;
  const c = civil(d);
  if (c.hour === 0 && c.minute === 0) return undefined;
  return c.minute === 0 ? `${c.hour}h` : `${c.hour}h${String(c.minute).padStart(2, "0")}`;
}
