/**
 * Ce qu'une fiche événement doit savoir d'elle-même au-delà des données
 * fusionnées (`MergedEvent`) : est-elle passée, à quelle heure, à quel prix
 * chiffré, quelles sont les autres dates de la même série, sous quel libellé
 * on s'y inscrit. Rien ici n'invente une information : chaque valeur vient du
 * frontmatter migré, de Claudy ou de `site.ts`.
 */
import type { MergedEvent } from "./claudy";
import { formatTime } from "./content";
import { isPole, POLE_SLUGS, POLES, type PoleSlug } from "./poles";
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

const FREE_ENTRY = /\b(gratuit|gratuite|entr[ée]e libre|prix libre|participation libre)\b/i;
const EURO_AMOUNT = /(?:€\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?\b|eur\b))/gi;

/**
 * Prix chiffré d'un libellé — pour l'`offers.price` du JSON-LD.
 *  - un seul montant en euros (« 10 € », « €80.00 », « 80 € la journée,
 *    matériel compris ») → ce montant ;
 *  - aucun montant mais une entrée gratuite ou à prix libre (« Gratuit »,
 *    « Participation libre ») → 0, le prix d'entrée minimal ;
 *  - plusieurs montants (« 10 € par adulte / 6 € par enfant ») → rien : on n'en
 *    tire pas un chiffre qui ne dirait pas toute la vérité.
 */
export function parsePriceEuros(text?: string): number | undefined {
  if (!text) return undefined;
  const amounts = [...text.matchAll(EURO_AMOUNT)].map((m) => Number((m[1] ?? m[2] ?? "").replace(",", ".")));
  const distinct = [...new Set(amounts.filter(Number.isFinite))];
  if (distinct.length === 1) return distinct[0];
  if (distinct.length === 0 && FREE_ENTRY.test(text)) return 0;
  return undefined;
}

/**
 * L'instant porte-t-il une heure réellement saisie ? Une fiche migrée datée
 * « 2026-03-27 » arrive ici sérialisée à minuit UTC pile
 * (`2026-03-27T00:00:00.000Z`) — soit 1h ou 2h à Bruxelles. Ce minuit-là
 * n'est pas une heure : c'est l'absence d'heure. Une date sans « T » non plus.
 */
export function hasClockTime(value?: string): boolean {
  if (!value || !value.includes("T")) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return !(
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

/** Journée entière : déclarée comme telle (Claudy), ou datée sans heure. */
export function isAllDayEvent(e: { allDay?: boolean; start?: string }): boolean {
  return e.allDay === true || !hasClockTime(e.start);
}

/**
 * Date d'un événement pour le JSON-LD : la date civile seule (« 2026-03-27 »)
 * quand aucune heure n'est connue — jamais un « 01:00 » fabriqué —, sinon
 * l'instant tel quel.
 */
export function schemaDate(value?: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return hasClockTime(value) ? value : civilDay(d);
}

// Une heure écrite « 9h », « 9h30 », « 20:00 » ou « 20h00 ».
const HOUR = String.raw`(\d{1,2})\s*(?:h|:)(\d{2})?`;
const RANGE = new RegExp(`(?:\\bde\\s+)?${HOUR}\\s*(?:-|–|—|à|au)\\s*${HOUR}`, "gi");
const OPEN_END = new RegExp(`^(?:dès\\s+|à partir de\\s+)?${HOUR}\\s*(?:-|–|—)\\s*(?:…|\\.\\.\\.)?$`, "i");
const LONE = new RegExp(`\\b${HOUR}(?![\\d])`, "gi");

const hourText = (h: string, m?: string): string => {
  const hour = String(Number(h));
  return m && m !== "00" ? `${hour}h${m}` : `${hour}h`;
};

/**
 * Un horaire saisi à la main, remis dans la forme unique du site : les heures
 * en « 20h » / « 20h30 », les plages en « de 9h à 12h30 », une fin ouverte en
 * « à partir de 18h30 », deux journées séparées par une virgule.
 * « 20:00-22:00 » → « de 20h à 22h » ; « 8h30 à 17h » → « de 8h30 à 17h » ;
 * « samedi 10h-18h - dimanche 9h-18h » → « samedi de 10h à 18h, dimanche de 9h à 18h ».
 * Seule la forme change : aucune heure n'est ajoutée ni retirée.
 */
export function normalizeHours(text: string): string {
  const segments = text
    .trim()
    .split(/\s+[-–—]\s+(?=\p{L})/u)
    .map((segment) => {
      const s = segment.trim();
      const open = s.match(OPEN_END);
      if (open) return `à partir de ${hourText(open[1]!, open[2])}`;
      return s
        .replace(RANGE, (_m, h1: string, m1: string | undefined, h2: string, m2: string | undefined) =>
          `de ${hourText(h1, m1)} à ${hourText(h2, m2)}`,
        )
        .replace(LONE, (_m, h: string, m: string | undefined) => hourText(h, m))
        .replace(/\bde\s+de\s+/gi, "de ")
        .replace(/\s{2,}/g, " ");
    });
  return segments.join(", ");
}

/**
 * Horaire lisible : la propriété « Horaires » de l'éditrice quand elle existe
 * (« à partir de 18h30 », « de 9h à 12h30 »), remise en forme, sinon l'heure
 * de début, et de fin si elle est connue ; rien pour une journée entière ni
 * pour une fiche datée sans heure.
 */
export function timeLabel(e: MergedEvent, props: Record<string, string> = {}): string | undefined {
  const fromProps = props["Horaires"]?.trim();
  if (fromProps) return normalizeHours(fromProps);
  if (isAllDayEvent(e)) return undefined;
  const from = formatTime(e.start);
  const to = hasClockTime(e.end) ? formatTime(e.end) : undefined;
  if (from && to && to !== from) return `de ${from} à ${to}`;
  return from;
}

/**
 * Le pôle d'un événement : celui de la fiche ou de Claudy ; à défaut, celui
 * que désigne sa thématique (« Environnement », « Nature », « Sports » → nature,
 * « Artisanat » → artisanat…) ; « convivialite » seulement quand rien n'est connu.
 */
const CATEGORY_POLE: Record<string, PoleSlug> = {
  environnement: "nature",
  nature: "nature",
  sport: "nature",
  sports: "nature",
};
for (const slug of POLE_SLUGS) {
  CATEGORY_POLE[fold(POLES[slug].category)] = slug;
  CATEGORY_POLE[fold(POLES[slug].label)] = slug;
}

export function eventPole(e: { pole?: string; categoryName?: string }): PoleSlug {
  if (isPole(e.pole)) return e.pole;
  for (const c of (e.categoryName ?? "").split(/\s*,\s*/)) {
    const found = CATEGORY_POLE[fold(c.trim())];
    if (found) return found;
  }
  return "convivialite";
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Les prévisions météo n'ont de sens que pour un événement à venir dans les
 * sept jours : ni pour une fiche passée, ni trois mois à l'avance.
 */
export function showsWeather(e: { start?: string; end?: string }, now: Date = new Date()): boolean {
  if (!e.start || isPastEvent(e, now)) return false;
  const t = new Date(e.start).getTime();
  if (Number.isNaN(t)) return false;
  return t - now.getTime() <= WEEK_MS;
}

// Le widget météo des fiches migrées (wo-cloud), avec l'intertitre ou le
// paragraphe « Prévisions météo » qui l'annonce.
const WEATHER_IFRAME = /<iframe\b[^>]*\bsrc="[^"]*wo-cloud\.com[^"]*"[^>]*>\s*<\/iframe>/gi;
const WEATHER_HEADING =
  /<(h[2-6]|p)\b[^>]*>\s*(?:<(?:strong|b)>)?\s*Prévisions\s+météo\s*(?:<\/(?:strong|b)>)?\s*<\/\1>\s*/gi;

/**
 * Le corps HTML d'une fiche, widget météo compris ou non : retiré (avec son
 * intertitre) hors de la semaine qui précède l'événement, sinon tenu à la
 * largeur de la colonne de texte.
 */
export function filterWeather(html: string, show: boolean): string {
  if (!show) {
    return html
      .replace(WEATHER_HEADING, "")
      .replace(WEATHER_IFRAME, "")
      .replace(/<p>\s*<\/p>/g, "");
  }
  return html.replace(WEATHER_IFRAME, (tag) =>
    tag.replace(/<iframe\b/i, '<iframe style="max-width:68ch"'),
  );
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
    .filter((e) => e.path !== current.path && Boolean(e.start) && !e.archived && !isPastEvent(e, now))
    .filter((e) => seriesKey(e.title) === key)
    .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime());
}
