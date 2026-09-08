import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { pathOf, listable, upcomingEvents, formatDate } from "@lib/content";
import { siteData } from "@lib/data";
import { site } from "@lib/site";

/**
 * /llms.txt — carte du site lisible par un modèle de langage (proposition
 * llmstxt.org). Regénéré au build depuis les mêmes collections que les pages :
 * jamais maintenu à la main, donc jamais désynchronisé.
 */
export const GET: APIRoute = async ({ site: siteUrl }) => {
  const origin = (siteUrl ?? new URL(site.url)).href.replace(/\/$/, "");
  const abs = (p: string) => `${origin}${p}`;

  const [pages, collectif, projets, hebergements, { events, experiences }] = await Promise.all([
    getCollection("pages"),
    getCollection("collectif"),
    getCollection("projets"),
    getCollection("hebergements"),
    siteData(),
  ]);

  const lines: string[] = [
    `# ${site.name}`,
    "",
    `> ${site.tagline}. Tiers-lieu de 15 hectares au Domaine d'Ahinvaux, à Yvoir (Belgique) : hébergements, salles, bar, coworking, activités et événements.`,
    "",
    `Téléphone : ${site.phone}`,
    "",
  ];

  const section = (title: string, items: { label: string; url: string; note?: string }[]) => {
    if (items.length === 0) return;
    lines.push(`## ${title}`, "");
    for (const it of items) {
      lines.push(`- [${it.label}](${it.url})${it.note ? `: ${it.note}` : ""}`);
    }
    lines.push("");
  };

  section(
    "Pages",
    listable(pages)
      .sort((a, b) => pathOf(a).localeCompare(pathOf(b)))
      .map((e) => ({ label: e.data.title, url: abs(pathOf(e)), note: e.data.description })),
  );

  section(
    "Hébergements",
    listable(hebergements)
      .sort((a, b) => pathOf(a).localeCompare(pathOf(b)))
      .map((e) => ({ label: e.data.title, url: abs(pathOf(e)), note: e.data.description })),
  );

  section(
    "Activités",
    experiences
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, "fr"))
      .map((x) => ({ label: x.title, url: abs(x.path), note: x.description || undefined })),
  );

  section(
    "Événements à venir",
    upcomingEvents(events).map((e) => ({
      label: e.title,
      url: abs(e.path),
      note: [formatDate(e.start), e.description].filter(Boolean).join(" — ") || undefined,
    })),
  );

  section(
    "Le collectif",
    listable(collectif).map((e) => ({
      label: e.data.name,
      url: abs(pathOf(e)),
      note: e.data.role,
    })),
  );

  section(
    "Les projets",
    listable(projets).map((e) => ({
      label: e.data.title,
      url: abs(pathOf(e)),
      note: e.data.description,
    })),
  );

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
