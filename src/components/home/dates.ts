/**
 * Dates lisibles, en français de Belgique, heure de Bruxelles.
 *
 * Copie locale des trois aides tant que `src/lib/content.ts` ne les expose pas
 * toutes (`formatDateRange` et `formatTime` au format « 18h30 » arrivent par un
 * autre chantier) : les pages n'affichent JAMAIS une Date brute ni une plage
 * « 3 octobre → 3 octobre ».
 */

const DAY = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const DAY_SHORT = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  day: "numeric",
  month: "long",
});

const CIVIL = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const HOUR = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  hour: "2-digit",
  minute: "2-digit",
});

function asDate(value: string | Date | undefined): Date | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** « samedi 6 septembre 2026 ». */
export function formatDate(value: string | Date | undefined): string | undefined {
  const d = asDate(value);
  return d ? DAY.format(d) : undefined;
}

/** Jour civil à Bruxelles, pour comparer deux instants à l'échelle de la journée. */
function civilDay(d: Date): string {
  return CIVIL.format(d);
}

/**
 * « samedi 6 septembre 2026 » — ou « du 3 octobre au 5 octobre 2026 » quand
 * l'événement s'étale. Une fin absente ou le même jour ne produit jamais de plage.
 */
export function formatDateRange(
  start: string | Date | undefined,
  end?: string | Date | undefined,
): string | undefined {
  const a = asDate(start);
  if (!a) return undefined;
  const b = asDate(end);
  if (!b || civilDay(a) === civilDay(b)) return DAY.format(a);
  return `du ${DAY_SHORT.format(a)} au ${DAY.format(b)}`;
}

/** « 18h30 ». */
export function formatTime(value: string | Date | undefined): string | undefined {
  const d = asDate(value);
  if (!d) return undefined;
  return HOUR.format(d).replace(":", "h");
}

/** Année civile (Bruxelles) d'un instant — pour grouper les événements passés. */
export function yearOf(value: string | Date | undefined): number | undefined {
  const d = asDate(value);
  return d ? Number(civilDay(d).slice(0, 4)) : undefined;
}
