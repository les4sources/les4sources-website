/**
 * Classe un lien cliqué pour la mesure d'audience (voir Analytics.astro) :
 * le nom de l'événement envoyé à Claudy, ou `undefined` pour un lien interne
 * qui ne mérite pas d'événement (la page suivante comptera comme page vue).
 */
export type ClickEvent = "reservation" | "tally" | "telephone" | "email" | "outbound";

const SITE_HOSTS = new Set(["www.les4sources.be", "les4sources.be"]);

export function clickEvent(href: string, currentHost: string): ClickEvent | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (url.protocol === "tel:") return "telephone";
  if (url.protocol === "mailto:") return "email";
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

  const host = url.hostname.toLowerCase();
  if (host === "app.les4sources.be" && /^\/reservation(\/|$)/.test(url.pathname)) return "reservation";
  if (host === "tally.so" || host.endsWith(".tally.so")) return "tally";
  if (host === currentHost || SITE_HOSTS.has(host)) return undefined;
  return "outbound";
}
