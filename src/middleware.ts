import { defineMiddleware } from "astro:middleware";
import { typesetHtml } from "@lib/typo";

/**
 * Chaque page HTML passe par la typographie française (src/lib/typo.ts) avant
 * d'être écrite dans dist/ : une seule règle pour tout le texte du site, qu'il
 * vienne du contenu migré, de Claudy ou d'un gabarit. Les autres réponses
 * (agenda.ics, llms.txt…) ne sont pas touchées.
 */
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  if (!response.headers.get("content-type")?.includes("text/html")) return response;
  const html = await response.text();
  return new Response(typesetHtml(html), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
});
