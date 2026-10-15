/**
 * Les règles du site, vues depuis le MCP : quels fichiers on peut toucher, et
 * ce qu'un fichier de contenu doit respecter AVANT d'être poussé.
 *
 * Ces contrôles donnent un retour immédiat à l'éditrice ; ils ne remplacent
 * pas `bun run verify`, qui tourne ensuite dans GitHub Actions et décide seul
 * de la mise en ligne (`.github/workflows/publication-contenu.yml`). Ils
 * reprennent donc les règles qui font échouer ce build, rien de plus.
 */
import { parse as parseYaml } from "yaml";

export const COLLECTIONS = ["pages", "evenements", "catalogue", "collectif", "projets", "hebergements"] as const;
export type Collection = (typeof COLLECTIONS)[number];

/** Mêmes valeurs que `POLES` dans `src/content.config.ts`. */
export const POLES = ["hebergement", "convivialite", "nature", "artisanat", "ressourcement", "vie-collective", "production"];

/**
 * Pages composées en Astro : leur texte affiché vit dans le `.astro`, leur
 * titre et leur description dans le Markdown de même `legacyPath`.
 */
export const PAGES_COMPOSEES: Record<string, string> = {
  "/": "src/pages/index.astro",
  "/agenda": "src/pages/agenda.astro",
  "/sejours": "src/pages/sejours/index.astro",
  "/le-bar-des-4-sources": "src/pages/le-bar-des-4-sources.astro",
};

export const TEMOIGNAGES = "src/data/temoignages.yaml";
export const DOSSIER_IMAGES = "src/assets/images/contenu";

const TITRE_MAX = 60;
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 160;

/** Repris de `scripts/seo-check.ts` : ce qui fait échouer le build. */
const HOTES_INTERDITS = ["images.spr.so", "super.so", "notion.site", "app.les4sources.be/rails", "app.les4sources.be/uploads"];
const MOTS_INTERDITS = ["lorem ipsum", "placeholder", "email protected"];

export function estContenu(chemin: string): boolean {
  const m = /^src\/content\/([a-z]+)\/(.+)\.mdx?$/.exec(chemin);
  return !!m && (COLLECTIONS as readonly string[]).includes(m[1]!) && !m[2]!.split("/").some((s) => s.startsWith("."));
}

/** Les fichiers que l'éditrice peut modifier. Tout le reste est refusé. */
export function estModifiable(chemin: string): boolean {
  if (chemin.includes("..") || chemin.startsWith("/")) return false;
  return estContenu(chemin) || chemin === TEMOIGNAGES || Object.values(PAGES_COMPOSEES).includes(chemin);
}

/** Nom de fichier sûr : minuscules, chiffres, tirets, éventuellement des sous-dossiers. */
export function estSlugValide(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(slug);
}

/* ─────────────────────────── Frontmatter ─────────────────────────── */

export type Frontmatter = Record<string, unknown>;

export function separerFrontmatter(texte: string): { yaml: string; corps: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(texte);
  return m ? { yaml: m[1]!, corps: m[2]! } : null;
}

/**
 * Lecture légère des champs simples (`clé: "valeur"`), sans parseur YAML :
 * l'index des ~200 pages doit tenir dans le budget CPU d'un Worker gratuit.
 * Les valeurs multilignes (`>`, `|`) retombent sur le vrai parseur.
 */
export function champsSimples(texte: string): Frontmatter {
  const fm = separerFrontmatter(texte);
  if (!fm) return {};
  const out: Frontmatter = {};
  for (const ligne of fm.yaml.split(/\r?\n/)) {
    const m = /^([A-Za-z][A-Za-z0-9_]*):[ \t]*(.*)$/.exec(ligne);
    if (!m) continue;
    const brut = m[2]!.trim();
    if (brut === ">" || brut === "|" || brut.startsWith(">-") || brut.startsWith("|-")) return lireFrontmatter(texte) ?? {};
    out[m[1]!] = valeurSimple(brut);
  }
  return out;
}

function valeurSimple(brut: string): unknown {
  if (brut === "") return undefined;
  if (brut === "true") return true;
  if (brut === "false") return false;
  if (brut.startsWith('"')) {
    try {
      return JSON.parse(brut);
    } catch {
      return brut.slice(1, -1);
    }
  }
  if (brut.startsWith("'")) return brut.slice(1, -1).replace(/''/g, "'");
  return brut;
}

export function lireFrontmatter(texte: string): Frontmatter | null {
  const fm = separerFrontmatter(texte);
  if (!fm) return null;
  const data = parseYaml(fm.yaml);
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Frontmatter) : null;
}

/* ─────────────────────────── Validation ─────────────────────────── */

/** Ce que le reste du site contient déjà, pour les contrôles d'unicité. */
export type EntreeIndex = { chemin: string; legacyPath?: string; title?: string; seoTitle?: string; description?: string; draft?: boolean };

export type Verdict = { erreurs: string[]; avertissements: string[] };

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const titreAffiche = (t: string) => t.replace(EMOJI, "").replace(/\s{2,}/g, " ").trim();

/** Contrôles communs à tout fichier texte : le site n'accepte que du vrai contenu. */
export function verifierTexte(texte: string): string[] {
  const erreurs: string[] = [];
  const bas = texte.toLowerCase();
  for (const mot of MOTS_INTERDITS) if (bas.includes(mot)) erreurs.push(`Le texte contient « ${mot} » : le site n'accepte que du vrai contenu.`);
  for (const hote of HOTES_INTERDITS)
    if (bas.includes(hote)) erreurs.push(`Le texte pointe vers ${hote} : aucune image hébergée ailleurs, ajoute-la avec ajouter_image.`);
  return erreurs;
}

/**
 * Valide un fichier Markdown de collection.
 * `ancien` : le texte actuel du fichier (absent pour une création).
 * `index` : toutes les autres entrées du site.
 */
export function validerPage(chemin: string, texte: string, ancien: string | null, index: EntreeIndex[]): Verdict {
  const erreurs: string[] = verifierTexte(texte);
  const avertissements: string[] = [];
  const collection = chemin.split("/")[2] as Collection;

  let fm: Frontmatter | null;
  try {
    fm = lireFrontmatter(texte);
  } catch (e) {
    return { erreurs: [...erreurs, `Le bloc d'en-tête (frontmatter) n'est pas du YAML valide : ${(e as Error).message}`], avertissements };
  }
  if (!fm) {
    erreurs.push("Le fichier doit commencer par un bloc d'en-tête entre deux lignes `---` (title, description, legacyPath…).");
    return { erreurs, avertissements };
  }

  const texteObligatoire = (cle: string) => {
    const v = fm[cle];
    if (typeof v !== "string" || v.trim() === "") erreurs.push(`Champ \`${cle}\` obligatoire (texte).`);
    return typeof v === "string" ? v : "";
  };
  const title = texteObligatoire("title");
  const description = texteObligatoire("description");
  const legacyPath = texteObligatoire("legacyPath");
  if (collection === "collectif") texteObligatoire("name");

  // Le contrat des URLs : une adresse publiée ne change jamais.
  const autres = index.filter((e) => e.chemin !== chemin);
  if (ancien !== null) {
    const avant = champsSimples(ancien).legacyPath;
    if (typeof avant === "string" && legacyPath && legacyPath !== avant)
      erreurs.push(
        `\`legacyPath\` ne change jamais (« ${avant} ») : c'est l'adresse publiée de la page. ` +
          "Pour une nouvelle adresse, crée une nouvelle page et demande à Michael une redirection.",
      );
  } else if (legacyPath) {
    if (!/^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(legacyPath))
      erreurs.push("`legacyPath` : un chemin comme « /evenements/fete-de-printemps-2027 » (minuscules, chiffres, tirets, sans / final).");
    const doublon = autres.find((e) => e.legacyPath === legacyPath);
    if (doublon) erreurs.push(`L'adresse ${legacyPath} est déjà prise par ${doublon.chemin}.`);
    const prefixe = PREFIXES[collection];
    if (prefixe && !legacyPath.startsWith(prefixe))
      avertissements.push(`Les pages de « ${collection} » ont d'habitude une adresse en ${prefixe}… : vérifie que c'est voulu.`);
  }

  const draft = fm.draft === true;
  if (!draft) {
    const seo = titreAffiche(typeof fm.seoTitle === "string" ? fm.seoTitle : title);
    if (seo.length > TITRE_MAX)
      erreurs.push(
        `Titre trop long pour Google (${seo.length} caractères, ${TITRE_MAX} au plus) : raccourcis \`title\` ou ajoute un \`seoTitle\` plus court.`,
      );
    const d = description.trim();
    if (d && (d.length < DESCRIPTION_MIN || d.length > DESCRIPTION_MAX))
      erreurs.push(`\`description\` : ${d.length} caractères, il en faut entre ${DESCRIPTION_MIN} et ${DESCRIPTION_MAX}.`);

    const publiees = autres.filter((e) => !e.draft);
    // Le <title> d'un événement porte sa date : deux éditions peuvent partager un titre.
    const titreDoublon = collection !== "evenements" && publiees.find((e) => e.title && titreAffiche(e.seoTitle ?? e.title) === seo);
    if (seo && titreDoublon) erreurs.push(`Le titre « ${seo} » est déjà celui de ${titreDoublon.chemin} : chaque page a un titre unique.`);
    const descDoublon = publiees.find((e) => e.description?.trim() === d);
    if (d && descDoublon) erreurs.push(`Cette description est déjà celle de ${descDoublon.chemin} : chaque page a la sienne.`);
  }

  if (fm.pole !== undefined && !POLES.includes(String(fm.pole))) erreurs.push(`\`pole\` : une de ces valeurs — ${POLES.join(", ")}.`);
  for (const champ of ["start", "end"]) {
    const v = fm[champ];
    if (v !== undefined && !(v instanceof Date) && Number.isNaN(Date.parse(String(v))))
      erreurs.push(`\`${champ}\` : une date comme 2027-03-21T14:00:00+01:00.`);
  }
  if (fm.cover !== undefined && typeof fm.coverAlt !== "string") erreurs.push("Une image de couverture (`cover`) demande sa description `coverAlt`.");
  if (typeof fm.cover === "string" && /^https?:/.test(fm.cover)) erreurs.push("`cover` : une image du site (ajoute-la avec ajouter_image), pas une adresse web.");

  const corps = separerFrontmatter(texte)?.corps ?? "";
  if (/!\[\s*\]\(/.test(corps)) erreurs.push("Chaque image Markdown décrit ce qu'elle montre : `![ce que montre la photo](…)`.");
  if (/!\[[^\]]*\]\(https?:/.test(corps)) erreurs.push("Les images viennent du site (ajouter_image), jamais d'une adresse web.");
  if (/^#\s/m.test(corps)) avertissements.push("Le titre principal (h1) vient de `title` : dans le texte, commence les intertitres à `##`.");

  return { erreurs, avertissements };
}

const PREFIXES: Partial<Record<Collection, string>> = {
  evenements: "/evenements/",
  catalogue: "/catalogue/",
  collectif: "/collectif/",
  projets: "/projets/",
  hebergements: "/sejours/hebergements-yvoir/",
};

/** Valide les témoignages : du YAML lisible, chacun avec texte et signature. */
export function validerTemoignages(texte: string): Verdict {
  const erreurs = verifierTexte(texte);
  try {
    const data = parseYaml(texte);
    if (!Array.isArray(data)) erreurs.push("Le fichier des témoignages est une liste (`- id: …`).");
    else
      data.forEach((t, i) => {
        if (!t?.id || !t?.quote || !t?.author) erreurs.push(`Témoignage n° ${i + 1} : il faut \`id\`, \`quote\` et \`author\`.`);
      });
  } catch (e) {
    erreurs.push(`YAML invalide : ${(e as Error).message}`);
  }
  return { erreurs, avertissements: [] };
}

function controler(chemin: string, texte: string, ancien: string | null, index: EntreeIndex[]): Verdict {
  if (estContenu(chemin)) return validerPage(chemin, texte, ancien, index);
  if (chemin === TEMOIGNAGES) return validerTemoignages(texte);
  return { erreurs: verifierTexte(texte), avertissements: [] };
}

/**
 * Le contrôle qui convient au fichier. Sur une page existante, seuls les
 * défauts que la modification AJOUTE bloquent : un défaut déjà présent (et
 * que le build accepte) ne doit pas empêcher de corriger une virgule.
 */
export function valider(chemin: string, texte: string, ancien: string | null, index: EntreeIndex[]): Verdict {
  const verdict = controler(chemin, texte, ancien, index);
  if (ancien === null) return verdict;
  const deja = new Set(controler(chemin, ancien, ancien, index).erreurs);
  return { erreurs: verdict.erreurs.filter((e) => !deja.has(e)), avertissements: verdict.avertissements };
}

/** Chemin relatif d'un fichier vers un autre, pour `cover:` et `![…](…)`. */
export function cheminRelatif(depuisFichier: string, versFichier: string): string {
  const de = depuisFichier.split("/").slice(0, -1);
  const vers = versFichier.split("/");
  let i = 0;
  while (i < de.length && i < vers.length && de[i] === vers[i]) i++;
  return [...Array(de.length - i).fill(".."), ...vers.slice(i)].join("/");
}

/** Entrée d'index à partir du texte d'un fichier de contenu. */
export function entreeIndex(chemin: string, texte: string): EntreeIndex {
  const f = champsSimples(texte);
  const s = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    chemin,
    legacyPath: s(f.legacyPath),
    title: s(f.title),
    seoTitle: s(f.seoTitle),
    description: s(f.description),
    draft: f.draft === true,
  };
}
