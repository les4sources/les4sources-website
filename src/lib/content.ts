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

/** Date lisible en français, ex. « samedi 12 septembre 2026 ». */
export function formatDate(value: string | Date | undefined): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat("fr-BE", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Heure lisible, ex. « 17:30 ». */
export function formatTime(value: string | Date | undefined): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat("fr-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
