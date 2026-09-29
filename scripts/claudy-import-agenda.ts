/**
 * Reprise de l'agenda Super.so dans Claudy, par l'API agent.
 *
 *   bun run claudy:import-agenda            # à blanc : affiche ce qui serait fait
 *   bun run claudy:import-agenda --apply    # écrit dans Claudy
 *
 * Variables : CLAUDY_AGENT_API_TOKEN (jeton de l'API agent, dans `.env`, jamais
 * dans le dépôt) et CLAUDY_AGENT_API_URL (défaut https://app.les4sources.be/api/v1).
 *
 * Pour chaque événement à venir de https://www.les4sources.be/agenda :
 *  - ignoré s'il est annoncé annulé sur sa fiche, retiré du site (`archived`),
 *    ou déjà publié dans Claudy sous le même slug ;
 *  - sinon publié dans Claudy sous le slug de son URL actuelle — la fiche
 *    Claudy remplace alors la fiche migrée à la même adresse ;
 *  - un brouillon Claudy du même jour et du même nom est publié plutôt que
 *    doublé (PATCH), sinon POST (upsert sur le slug, rejouable sans risque).
 *
 * Ce qui est repris : titre tel que l'agenda l'affiche (« COMPLET ! » compris),
 * date et horaires, tarif, lien d'inscription, image de couverture, lieu.
 * La description n'est écrite que pour un événement sans fiche migrée : les
 * autres gardent le corps migré (photos locales comprises) tant que l'éditrice
 * n'en écrit pas un dans Claudy. Les photos du corps d'une fiche Super ne sont
 * jamais recopiées : elles vivent sur le CDN de Super, qui s'éteint avec
 * l'abonnement.
 */
import { existsSync, readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { parseFlightProps, resolveProperties, type PropertySortEntry } from "./migrate/lib/flight";
import { decodeCfEmails } from "./migrate/lib/markdown";
import { normaliseImageUrl } from "./migrate/lib/images";

const SUPER = "https://www.les4sources.be";
const API = (process.env.CLAUDY_AGENT_API_URL ?? "https://app.les4sources.be/api/v1").replace(/\/$/, "");
const TOKEN = process.env.CLAUDY_AGENT_API_TOKEN;
const APPLY = process.argv.includes("--apply");
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh) les4sources-import" };

/**
 * Catégorie Claudy selon le « Type d'événement » de la fiche Super. Un type
 * absent de la table est signalé et l'événement n'est pas écrit : c'est un
 * choix éditorial, pas une devinette.
 */
const CATEGORY_BY_TYPE: Record<string, string> = {
  Formation: "ateliers",
  Atelier: "ateliers",
  "Pizza Party": "parties",
};
/** Choix au cas par cas, quand la fiche Super n'a pas de type (Michael, 2026-09-29). */
const CATEGORY_BY_SLUG: Record<string, string> = {
  "winter-taiga": "projections",
};

/**
 * Catégories et pôles (Michael, 2026-09-29) : le pôle donne la couleur et le
 * picto des cartes du site. Une catégorie absente de Claudy est créée.
 */
const CATEGORIES: { slug: string; name: string; pole: string }[] = [
  { slug: "ateliers", name: "Ateliers", pole: "artisanat" },
  { slug: "parties", name: "Parties", pole: "convivialite" },
  { slug: "week-ends", name: "Week-ends", pole: "ressourcement" },
  { slug: "projections", name: "Projections", pole: "convivialite" },
];

const LOCATION = "Les 4 Sources, Yvoir";

interface Plan {
  slug: string;
  action: "skip" | "post" | "patch";
  reason?: string;
  id?: number;
  payload?: Record<string, unknown>;
}

async function page(path: string) {
  const res = await fetch(`${SUPER}${path}`, { headers: UA });
  if (!res.ok) throw new Error(`${path} : ${res.status}`);
  return cheerio.load(await res.text());
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json as any;
}

/** « 9h-12h30 », « 9h30 à 21h », « 20h », « à partir de 18h30 » → [début, fin?] en "HH:MM". */
function hours(text: string | undefined): [string?, string?] {
  const times = [...(text ?? "").matchAll(/(\d{1,2})\s*[h:]\s*(\d{2})?/g)].map(
    (m) => `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`,
  );
  return [times[0], times[1]];
}

/** « €80.00 » → « 80 € » ; un texte libre est gardé tel quel. */
function price(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = text.match(/^€\s*(\d+)(?:[.,](\d{2}))?$/);
  if (!m) return text;
  return m[2] && m[2] !== "00" ? `${m[1]},${m[2]} €` : `${m[1]} €`;
}

/** Le corps de la fiche, en HTML simple : titres, paragraphes, listes, citations, liens. Sans images. */
function bodyHtml($: cheerio.CheerioAPI): string {
  const $root = $("main.super-content article.notion-root").first().clone();
  $root.find("img, figure, iframe, script, style, .notion-breadcrumb, .notion-header").remove();
  const out: string[] = [];
  const inline = (el: any) =>
    ($(el).html() ?? "")
      .replace(/<(?!\/?(a|strong|b|em|i|br)\b)[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  $root.find("h1, h2, h3, p, ul, ol, blockquote, a.notion-button, .notion-callout").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    if ($(el).parents("ul, ol, blockquote, .notion-callout").length) return;
    if (tag === "ul" || tag === "ol") {
      const items = $(el).children("li").map((_, li) => `<li>${inline(li)}</li>`).get().join("");
      if (items) out.push(`<${tag}>${items}</${tag}>`);
    } else if (tag === "blockquote" || $(el).hasClass("notion-callout")) {
      const text = inline(el);
      if (text) out.push(`<blockquote>${text}</blockquote>`);
    } else if (tag === "a") {
      const href = $(el).attr("href");
      if (href) out.push(`<p><a href="${href}">${$(el).text().trim()}</a></p>`);
    } else {
      const text = inline(el);
      if (text) out.push(tag === "p" ? `<p>${text}</p>` : `<h2>${text}</h2>`);
    }
  });
  return out.join("\n");
}

function registrationUrl($: cheerio.CheerioAPI): string | undefined {
  const links = $("main.super-content article.notion-root a[href^='http']")
    .map((_, a) => $(a).attr("href"))
    .get()
    .filter((href) => !/les4sources\.be|spr\.so|notion\.so/.test(href));
  return links.find((h) => /billetweb|tally|tranchesdevie|helloasso|forms/.test(h));
}

function legacyEntry(slug: string): { archived: boolean; description?: string; generated: boolean } | undefined {
  const file = `src/content/evenements/${slug}.md`;
  if (!existsSync(file)) return undefined;
  const text = readFileSync(file, "utf8");
  return {
    archived: /^archived:\s*true/m.test(text),
    description: text.match(/^description:\s*"(.*)"$/m)?.[1],
    generated: /^generatedDescription:\s*true/m.test(text) || /tiers-lieu à Yvoir"$/m.test(text),
  };
}

/** Une accroche criée en capitales ou un avertissement n'est pas un résumé. */
function isHook(text: string | undefined): text is string {
  if (!text || text.length > 200) return false;
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, "").length;
  return !/^[⚠→]/.test(text) && letters.length > 0 && upper / letters.length < 0.5;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/complet\s*!?/gi, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();

async function main() {
  if (!TOKEN && APPLY) {
    console.error("CLAUDY_AGENT_API_TOKEN manquant (à poser dans .env, jamais dans le dépôt).");
    process.exit(1);
  }
  if (!TOKEN) console.log("Sans jeton : les doublons dans Claudy ne sont pas vérifiés (à blanc seulement).\n");

  // Les événements à venir, tels que l'agenda Super les liste (titre de carte compris).
  const $agenda = await page("/agenda");
  const listed = new Map<string, string>();
  $agenda("a[href^='/evenements/']").each((_, a) => {
    const href = $agenda(a).attr("href")!;
    const title = $agenda(a).find("h3, .notion-collection-card__property-list, div").first().text().trim()
      || $agenda(a).text().trim();
    if (!listed.has(href)) listed.set(href, $agenda(a).text().replace(/\s+/g, " ").trim() || title);
  });

  // Ce qui est déjà publié dans Claudy (API publique, sans jeton).
  const publicUrl = API.replace(/\/api\/v1$/, "/api/public/v1");
  const published = new Set<string>(
    ((await (await fetch(`${publicUrl}/events`)).json()) as { events: { slug: string }[] }).events.map((e) => e.slug),
  );

  const plans: Plan[] = [];
  for (const [path, cardText] of listed) {
    const slug = path.replace("/evenements/", "");
    const $ = await page(path);
    decodeCfEmails($);
    const metaDescription = $('meta[name="description"]').attr("content")?.trim() ?? "";
    const legacy = legacyEntry(slug);

    if (/annul/i.test(metaDescription)) {
      plans.push({ slug, action: "skip", reason: "annoncé annulé sur la fiche Super" });
      continue;
    }
    if (published.has(slug)) {
      plans.push({ slug, action: "skip", reason: "déjà publié dans Claudy" });
      continue;
    }
    if (legacy?.archived) {
      plans.push({ slug, action: "skip", reason: "retiré du site (archived)" });
      continue;
    }

    const flight = parseFlightProps($);
    const record = flight?.records.block[flight.pageId];
    if (!record) {
      plans.push({ slug, action: "skip", reason: "propriétés Notion illisibles" });
      continue;
    }
    const props = Object.fromEntries(
      resolveProperties(record, new Map<string, PropertySortEntry>()).map((p) => [p.name, p.text]),
    );
    const [day, lastDay] = (props["Date"] ?? "").split("→").map((s: string) => s.trim());
    if (!day) {
      plans.push({ slug, action: "skip", reason: "pas de date" });
      continue;
    }
    const [from, to] = hours(props["Horaires"]);
    const startsAt = from ? `${day}T${from}` : day;
    const endsAt = to ? `${lastDay || day}T${to}` : from ? `${lastDay || day}T${from}` : lastDay || day;

    const category = CATEGORY_BY_SLUG[slug] || CATEGORY_BY_TYPE[props["Type d'événement"] ?? ""];
    if (!category) {
      plans.push({
        slug,
        action: "skip",
        reason: `catégorie à choisir (type Super : « ${props["Type d'événement"] ?? "aucun"} »)`,
      });
      continue;
    }

    // Le titre tel que l'agenda l'affiche : « COMPLET ! » y est, même quand l'en-tête de la fiche l'a perdu.
    const name = cardText.replace(/\s*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b.*$/i, "").trim()
      || $("h1.notion-header__title").first().text().trim();

    const payload: Record<string, unknown> = {
      name,
      slug,
      category,
      starts_at: startsAt,
      ends_at: endsAt,
      location: LOCATION,
      published: true,
    };
    const priceText = price(props["Tarif"]);
    if (priceText) payload.price_text = priceText;
    const registration = registrationUrl($);
    if (registration) payload.registration_url = registration;
    const cover = normaliseImageUrl(record.cover ?? null);
    if (cover) payload.image_url = cover;

    if (legacy) {
      // Fiche migrée : son corps (photos locales comprises) reste affiché ; seule une vraie accroche est reprise.
      if (!legacy.generated && isHook(legacy.description)) payload.summary = legacy.description;
    } else {
      const html = bodyHtml($);
      if (html) payload.public_description = html;
      const first = cheerio.load(html)("p").first().text().trim();
      if (isHook(first)) payload.summary = first;
    }

    // Déjà dans Claudy ? Même slug → upsert (publié : on ne touche à rien) ; brouillon du même jour et du même nom → PATCH.
    const existing: any[] = TOKEN
      ? (await api("GET", `/events?from=${day}&to=${day}&per_page=200`)).data
      : [];
    const sameSlug = existing.find((e) => e.slug === slug);
    if (sameSlug?.published) {
      plans.push({ slug, action: "skip", reason: `déjà publié dans Claudy (#${sameSlug.id})` });
      continue;
    }
    const draft = sameSlug ?? existing.find((e) => !e.published && norm(e.name) === norm(name));
    plans.push(draft ? { slug, action: "patch", id: draft.id, payload } : { slug, action: "post", payload });
  }

  // Les catégories d'abord : un événement ne peut pas viser une catégorie qui n'existe pas encore.
  const existingCategories: any[] = TOKEN ? (await api("GET", "/event_categories")).data : [];
  const categoryPlans = CATEGORIES.map((c) => {
    const found = existingCategories.find((e) => e.slug === c.slug);
    if (!TOKEN) return { ...c, action: "à vérifier" as const };
    if (!found) return { ...c, action: "créer" as const };
    return found.pole === c.pole ? { ...c, action: "inchangée" as const, id: found.id } : { ...c, action: "pôle" as const, id: found.id };
  });
  console.log("Catégories :");
  for (const c of categoryPlans) console.log(`  ${c.action.padEnd(10)} ${c.slug} → ${c.pole}`);
  console.log("");

  for (const p of plans) {
    const head = `${p.action.toUpperCase().padEnd(5)} ${p.slug}`;
    if (p.action === "skip") {
      console.log(`${head} — ${p.reason}`);
      continue;
    }
    console.log(`${head}${p.id ? ` (brouillon #${p.id})` : ""}`);
    console.log(
      JSON.stringify({ ...p.payload, public_description: p.payload!.public_description ? "(HTML, voir --verbose)" : undefined }, null, 2)
        .split("\n")
        .map((l) => `      ${l}`)
        .join("\n"),
    );
    if (process.argv.includes("--verbose") && p.payload!.public_description) console.log(p.payload!.public_description);
  }

  if (!APPLY) {
    console.log("\nÀ blanc : rien n'a été écrit. Relancer avec --apply pour publier dans Claudy.");
    return;
  }
  for (const c of categoryPlans) {
    if (c.action === "créer") await api("POST", "/event_categories", { event_category: { name: c.name, slug: c.slug, pole: c.pole } });
    if (c.action === "pôle") await api("PATCH", `/event_categories/${(c as { id: number }).id}`, { event_category: { pole: c.pole } });
    if (c.action === "créer" || c.action === "pôle") console.log(`✓ catégorie ${c.slug} → ${c.pole}`);
  }
  for (const p of plans.filter((p) => p.action !== "skip")) {
    const res =
      p.action === "patch"
        ? await api("PATCH", `/events/${p.id}`, { event: p.payload })
        : await api("POST", "/events", { event: p.payload });
    console.log(`✓ ${p.slug} → #${res.data.id} ${res.data.public_url ?? ""}`);
  }
}

await main();
