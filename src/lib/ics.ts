/**
 * Fichier iCalendar (RFC 5545) d'un événement — le lien « Ajouter à mon
 * agenda » de la fiche. Heures en heure de Bruxelles avec le fuseau décrit
 * dans le fichier (VTIMEZONE), ce que lisent Apple Calendar, Google Agenda et
 * Outlook. Une fiche datée à minuit sans horaire est une journée entière.
 *
 * Rien d'inventé : la fin n'est écrite que si elle est connue — par la date de
 * fin de la fiche, ou par un horaire du type « 9h-12h30 » écrit par l'éditrice.
 */
import type { MergedEvent } from "./claudy";
import { site } from "./site";
import { stripEmoji, stripSoldOut } from "./text";

interface Civil {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
}

function civil(value: string): Civil | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

const pad = (n: number) => String(n).padStart(2, "0");
const dateOf = (c: Civil) => `${c.y}${pad(c.m)}${pad(c.d)}`;
const dateTimeOf = (c: Civil) => `${dateOf(c)}T${pad(c.h)}${pad(c.min)}00`;

/** « 9h-12h30 », « de 14h à 18h », « 20:00-22:00 » → heures de début et de fin. */
export function parseHoursRange(
  text: string | undefined,
): { from: [number, number]; to: [number, number] } | undefined {
  if (!text) return undefined;
  const m = text
    .trim()
    .match(/^(?:de\s+)?(\d{1,2})(?:h|:)(\d{2})?\s*(?:-|–|—|à|a|au)\s*(\d{1,2})(?:h|:)(\d{2})?$/i);
  if (!m) return undefined;
  const from: [number, number] = [Number(m[1]), Number(m[2] ?? 0)];
  const to: [number, number] = [Number(m[3]), Number(m[4] ?? 0)];
  if (from[0] > 23 || to[0] > 23 || from[1] > 59 || to[1] > 59) return undefined;
  return { from, to };
}

/** Échappe une valeur texte iCalendar (virgules, points-virgules, retours). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Plie une ligne à 75 octets, comme l'exige le format. */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let rest = line;
  let first = true;
  while (rest.length > 0) {
    const limit = first ? 75 : 74;
    let take = rest.length;
    while (take > 0 && Buffer.byteLength(rest.slice(0, take), "utf8") > limit) take -= 1;
    // Jamais de coupure au milieu d'un emoji (paire de substitution UTF-16).
    const last = rest.charCodeAt(take - 1);
    if (take > 1 && take < rest.length && last >= 0xd800 && last <= 0xdbff) take -= 1;
    out.push((first ? "" : " ") + rest.slice(0, take));
    rest = rest.slice(take);
    first = false;
  }
  return out.join("\r\n");
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Brussels",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export interface IcsOptions {
  /** Origine absolue du site, sans barre finale. */
  siteUrl: string;
  /** Propriété « Horaires » de l'éditrice (fiche migrée). */
  horaires?: string;
  /** Instant d'émission (DTSTAMP) — le moment du build par défaut. */
  now?: Date;
}

/** Le texte `.ics` d'un événement daté ; `undefined` s'il n'a pas de date. */
export function icsForEvent(e: MergedEvent, opts: IcsOptions): string | undefined {
  if (!e.start) return undefined;
  const start = civil(e.start);
  if (!start) return undefined;
  const end = e.end ? civil(e.end) : undefined;
  const hours = parseHoursRange(opts.horaires);

  const lines: string[] = [];
  const startHasTime = start.h !== 0 || start.min !== 0;

  if (hours) {
    // L'horaire écrit par l'éditrice fait foi : « 9h-12h30 » le jour de la fiche.
    const from: Civil = { ...start, h: hours.from[0], min: hours.from[1] };
    const to: Civil = { ...(end ?? start), h: hours.to[0], min: hours.to[1] };
    lines.push(`DTSTART;TZID=Europe/Brussels:${dateTimeOf(from)}`);
    lines.push(`DTEND;TZID=Europe/Brussels:${dateTimeOf(to)}`);
  } else if (e.allDay || !startHasTime) {
    // Journée(s) entière(s) : DTEND exclusif, le lendemain du dernier jour.
    const last = end ?? start;
    const next = new Date(Date.UTC(last.y, last.m - 1, last.d + 1));
    lines.push(`DTSTART;VALUE=DATE:${dateOf(start)}`);
    lines.push(
      `DTEND;VALUE=DATE:${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`,
    );
  } else {
    lines.push(`DTSTART;TZID=Europe/Brussels:${dateTimeOf(start)}`);
    if (end && (end.h !== 0 || end.min !== 0 || dateOf(end) !== dateOf(start))) {
      lines.push(`DTEND;TZID=Europe/Brussels:${dateTimeOf(end)}`);
    }
  }

  const url = `${opts.siteUrl}${e.path}`;
  const summary = stripSoldOut(stripEmoji(e.title)) || stripEmoji(e.title) || e.title;
  const description = [e.description?.trim(), opts.horaires ? `Horaires : ${opts.horaires}` : "", e.priceText ? `Tarif : ${e.priceText}` : "", url]
    .filter(Boolean)
    .join("\n");
  const a = site.address;
  const location = e.location && !/4 sources/i.test(e.location)
    ? e.location
    : `${site.name}, ${a.streetAddress}, ${a.postalCode} ${a.locality}, Belgique`;
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const host = new URL(opts.siteUrl).host;

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Les 4 Sources//Site web//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...VTIMEZONE,
    "BEGIN:VEVENT",
    `UID:${e.path.replace(/^\//, "").replace(/\//g, "-")}@${host}`,
    `DTSTAMP:${stamp}`,
    ...lines,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(location)}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return body.map(foldLine).join("\r\n") + "\r\n";
}
