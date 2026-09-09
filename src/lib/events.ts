/**
 * Ce qu'une fiche événement doit savoir d'elle-même au-delà des données
 * fusionnées (`MergedEvent`) : est-elle passée, à quelle heure, à quel prix
 * chiffré, quelles sont les autres dates de la même série, sous quel libellé
 * on s'y inscrit. Rien ici n'invente une information : chaque valeur vient du
 * frontmatter migré, de Claudy ou de `site.ts`.
 */
import type { MergedEvent } from "./claudy";
import { formatTime } from "./content";
import { stripEmoji, stripSoldOut } from "./text";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const MONTHS = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
];
const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const TRAILING_STOP = new Set(["de", "d", "du", "des", "le", "la", "les", "l", "en", "et", "a", "au", "aux"]);

/**
 * Clé de série d'un événement : le titre sans emoji, sans « COMPLET ! », sans
 * mois, jour ni nombre. « 🍕 Pizza Party de septembre ! » et « Pizza Party
 * d'avril » partagent la clé « pizza party » ; les quatre initiations à la
 * soudure partagent la leur. C'est ce qui permet de proposer les autres dates.
 */
export function seriesKey(title: string): string {
  const words = fold(stripSoldOut(stripEmoji(title)))
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !/^\d+$/.test(w))
    .filter((w) => !MONTHS.includes(w) && !WEEKDAYS.includes(w));
  while (words.length > 0 && TRAILING_STOP.has(words[words.length - 1]!)) words.pop();
  return words.join(" ");
}

const civilDay = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

/**
 * Passé = sa dernière journée (fin, sinon début) est antérieure à aujourd'hui,
 * en date civile de Bruxelles : un événement reste « à venir » tout le jour
 * où il a lieu, même s'il a commencé.
 */
export function isPastEvent(e: { start?: string; end?: string }, now: Date = new Date()): boolean {
  const ref = e.end ?? e.start;
  if (!ref) return false;
  const d = new Date(ref);
  if (Number.isNaN(d.getTime())) return false;
  return civilDay(d) < civilDay(now);
}

/**
 * Prix chiffré quand le libellé n'est QUE ce prix (« 10 € », « €80.00 »,
 * « 7 euros ») — pour l'`offers.price` du JSON-LD. « Pizzas à prix libre » ou
 * « 10 € par adulte / 6 € par enfant » ne donnent rien : on n'en tire pas un
 * chiffre qui ne dirait pas toute la vérité.
 */
export function parsePriceEuros(text?: string): number | undefined {
  if (!text) return undefined;
  const m = text
    .trim()
    .match(/^(?:€\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?|eur)?$/i);
  if (!m?.[1]) return undefined;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Horaire lisible : la propriété « Horaires » de l'éditrice quand elle existe
 * (« à partir de 18h30 », « 9h-12h30 »), sinon l'heure de début, et de fin si
 * elle est connue ; rien pour une journée entière.
 */
export function timeLabel(e: MergedEvent, props: Record<string, string> = {}): string | undefined {
  const fromProps = props["Horaires"]?.trim();
  if (fromProps) return fromProps;
  if (e.allDay) return undefined;
  const from = formatTime(e.start);
  const to = formatTime(e.end);
  if (from && to && to !== from) return `de ${from} à ${to}`;
  return from;
}

/** Libellé du bouton d'inscription : celui de l'éditrice, sinon le nôtre. */
export function registrationLabel(e: MergedEvent): string {
  return e.registrationLabel?.trim() || "Je m’inscris";
}

/** Les autres dates à venir de la même série, de la plus proche à la plus lointaine. */
export function otherDates<T extends MergedEvent>(all: T[], current: T, now: Date = new Date()): T[] {
  const key = seriesKey(current.title);
  if (!key) return [];
  return all
    .filter((e) => e.path !== current.path && Boolean(e.start) && !isPastEvent(e, now))
    .filter((e) => seriesKey(e.title) === key)
    .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime());
}
