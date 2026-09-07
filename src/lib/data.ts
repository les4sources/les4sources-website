/**
 * Point d'entrée unique des données « événements » et « activités » :
 * collections migrées + Claudy, fusionnées selon les règles de `docs/CLAUDY.md`.
 *
 * Toutes les pages passent par ici, ce qui garantit qu'un seul chargement Claudy
 * a lieu par build et qu'une seule ligne de synthèse est imprimée.
 */
import { getCollection } from "astro:content";
import {
  loadClaudy,
  logClaudySummary,
  mergeEvents,
  mergeExperiences,
  type LegacyEntry,
  type MergedEvent,
  type MergedExperience,
} from "./claudy";

export interface SiteData {
  events: MergedEvent[];
  experiences: MergedExperience[];
}

let cached: Promise<SiteData> | null = null;

async function build(): Promise<SiteData> {
  const [claudy, legacyEvents, legacyExperiences] = await Promise.all([
    loadClaudy(),
    getCollection("evenements"),
    getCollection("catalogue"),
  ]);

  const events = mergeEvents(claudy.events, legacyEvents as unknown as LegacyEntry[]);
  const experiences = mergeExperiences(
    claudy.experiences,
    legacyExperiences as unknown as LegacyEntry[],
  );

  logClaudySummary(claudy, events, experiences);
  return { events, experiences };
}

export function siteData(): Promise<SiteData> {
  cached ??= build();
  return cached;
}
