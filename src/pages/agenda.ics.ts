/**
 * `/agenda.ics` — l'agenda des 4 Sources en abonnement : un visiteur l'ajoute
 * une fois à son calendrier (Apple, Google, Outlook) et voit ensuite chaque
 * nouvel événement apparaître tout seul, au rythme des rebuilds du site.
 *
 * Contient les événements à venir et ceux des trois derniers mois (un
 * calendrier qui efface le passé de la veille surprend) ; cf. src/lib/ics.ts.
 */
import type { APIRoute } from "astro";
import { getEntry } from "astro:content";
import { siteData } from "@lib/data";
import { icsForCalendar } from "@lib/ics";
import { site } from "@lib/site";

export const GET: APIRoute = async ({ site: astroSite }) => {
  const { events } = await siteData();
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 3);

  const listed = events.filter(
    (e) => e.path.startsWith("/evenements/") && e.start && new Date(e.end ?? e.start) >= since,
  );
  const entries = await Promise.all(
    listed.map(async (event) => {
      const legacy = event.legacyId ? await getEntry("evenements", event.legacyId) : undefined;
      return { event, horaires: legacy?.data.properties?.["Horaires"] };
    }),
  );

  const siteUrl = (astroSite ?? new URL(site.url)).href.replace(/\/$/, "");
  return new Response(icsForCalendar(entries, { siteUrl }), {
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  });
};
