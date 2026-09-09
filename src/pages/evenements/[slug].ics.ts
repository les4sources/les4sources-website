/**
 * `/evenements/<slug>.ics` — le fichier « Ajouter à mon agenda » de chaque
 * fiche datée, généré au build à côté de la page (cf. src/lib/ics.ts).
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { getEntry } from "astro:content";
import type { MergedEvent } from "@lib/claudy";
import { siteData } from "@lib/data";
import { icsForEvent } from "@lib/ics";
import { site } from "@lib/site";

export const getStaticPaths: GetStaticPaths = async () => {
  const { events } = await siteData();
  return events
    .filter((e) => e.path.startsWith("/evenements/") && Boolean(e.start))
    .map((e) => ({ params: { slug: e.slug }, props: { event: e } }));
};

export const GET: APIRoute = async ({ props, site: astroSite }) => {
  const event = props.event as MergedEvent;
  const legacy = event.legacyId ? await getEntry("evenements", event.legacyId) : undefined;
  const horaires = legacy?.data.properties?.["Horaires"];
  const siteUrl = (astroSite ?? new URL(site.url)).href.replace(/\/$/, "");
  const body = icsForEvent(event, { siteUrl, horaires });
  if (!body) return new Response(null, { status: 404 });
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  });
};
