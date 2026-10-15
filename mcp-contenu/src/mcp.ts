/**
 * Les outils que Claude voit. Chaque écriture passe par trois portes :
 * 1. le fichier est-il modifiable (contenus, témoignages, pages composées) ?
 * 2. respecte-t-il les règles du site (`contenu.ts`) ?
 * 3. le build complet passe-t-il (`publication-contenu.yml`, dans GitHub) ?
 * Seule la troisième met en ligne.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  COLLECTIONS,
  DOSSIER_IMAGES,
  PAGES_COMPOSEES,
  POLES,
  TEMOIGNAGES,
  cheminRelatif,
  estContenu,
  estModifiable,
  estSlugValide,
  valider,
  type Verdict,
} from "./contenu";
import { Depot, type Env } from "./github";
import { creerEnvoi, enregistrerImage, lireEnvoi, modeEmploi } from "./images";

export const INSTRUCTIONS = `Ce serveur modifie le site web des 4 Sources (www.les4sources.be), un tiers-lieu à Yvoir. Il remplace le travail d'un développeur : chaque modification est vérifiée (build complet du site) puis mise en ligne automatiquement, en quelques minutes.

Méthode :
1. Retrouver la page : lister_pages (par mot-clé ou section), puis lire_page.
2. Petite correction (un mot, une phrase, un prix) : remplacer_texte. Réécriture : modifier_page avec le fichier COMPLET. Nouvelle page : creer_page (lis regles_du_site d'abord).
3. Après chaque écriture : etat_publication jusqu'à « en ligne ». Si la vérification échoue, lis la raison, corrige avec un nouvel appel, ou abandonner_modifications.

Règles : n'invente aucun texte, aucune date, aucun prix, aucun témoignage. Écris seulement ce que la personne t'a donné ou demandé. Montre-lui ce que tu vas changer avant d'écrire. Le site est en français, il tutoie ses visiteurs. Ne change jamais le champ legacyPath d'une page existante : c'est son adresse publiée.`;

const GUIDE = `# Règles du site des 4 Sources

## Où vit le texte
- Pages ordinaires : un fichier Markdown par page dans src/content/<section>/. Sections : ${COLLECTIONS.join(", ")}.
- Quatre pages sont composées à part, section par section, dans un fichier .astro (modifiable avec remplacer_texte) :
${Object.entries(PAGES_COMPOSEES)
  .map(([url, f]) => `  - ${url} → ${f}`)
  .join("\n")}
  Leur titre et leur description (Google) restent dans le Markdown de même legacyPath.
  Dans un .astro on peut changer un texte, retirer une section entière (de <Section … à </Section>), ou ajouter une image :
  1. ajouter_image (lien web), preparer_envoi_image (photo sur l'appareil de la personne) ou lister_images (photo déjà sur le site) ;
  2. une ligne d'import en haut du fichier, entre les deux ---, à côté des autres : import logoCommune from "@assets/images/contenu/logo-commune-yvoir.png";
  3. à l'endroit voulu, sur le modèle des images voisines : <Image src={logoCommune} alt="Commune d'Yvoir" widths={[240, 300]} sizes="120px" class="h-auto max-h-[120px] w-auto object-contain" />
  Recopie les classes des éléments voisins : n'invente pas de style. Si le build refuse, etat_publication dit pourquoi.
- Témoignages : ${TEMOIGNAGES} (recopiés tels quels des newsletters, jamais reformulés).
- Les événements et les activités publiés dans Claudy s'affichent tout seuls : ils ne se modifient pas ici.

## L'en-tête d'une page (entre deux lignes ---)
- title : le titre affiché (le seul h1 de la page).
- description : 50 à 160 caractères, unique sur le site. C'est ce que montre Google.
- legacyPath : l'adresse de la page, ex. "/evenements/fete-de-printemps-2027". Minuscules, chiffres, tirets. Elle ne change JAMAIS une fois publiée.
- seoTitle (facultatif) : un titre plus court pour Google si title (sans emoji) dépasse 60 caractères.
- cover + coverAlt (facultatif) : image de couverture (chemin relatif vers l'image, rendu par ajouter_image) et ce qu'elle montre.
- draft: true retire la page du site ; archived: true garde l'adresse mais retire la page des listes.
- pole (facultatif) : ${POLES.join(", ")}.
- Événements : start, end (ex. 2027-03-21T14:00:00+01:00), location, priceText, registrationUrl, registrationLabel.
- Activités (catalogue) : priceText, duration, minParticipants, maxParticipants.
- Collectif : name (obligatoire), role, photo.

## Le texte
- Markdown : ## pour les intertitres (jamais #), **gras**, listes avec -, liens [texte](/adresse).
- Chaque image décrit ce qu'elle montre : ![Le four à pain allumé](../../assets/images/contenu/four.jpg).
- Les images entrent dans le site par ajouter_image (lien web) ou preparer_envoi_image (fichier sur l'appareil, ou déposé dans la conversation), ou sont reprises avec lister_images : jamais d'image hébergée ailleurs.
- Remplacer une photo = changer son chemin (cover:, gallery:, ![…](…) ou import) vers une autre image du site.
- Les vidéos, formulaires Tally et cartes se déclarent dans l'en-tête, champ embeds : [{ kind: "youtube", src: "…", title: "…" }].
- Rien d'inventé, pas de texte de remplissage : une page vide vaut mieux qu'une page fausse.

## Exemple de nouvelle page
---
title: "Fête de printemps 2027"
description: "Le 21 mars 2027, les 4 Sources fêtent le printemps à Yvoir : ateliers, repas partagé et concert dans la clairière."
legacyPath: "/evenements/fete-de-printemps-2027"
start: 2027-03-21T14:00:00+01:00
location: "Les 4 Sources, Yvoir"
---

Texte de la page…`;

type Contexte = { env: Env; editeur: string; origine: string };

const texte = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const erreur = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });

function rapport(v: Verdict): string {
  const l: string[] = [];
  if (v.erreurs.length) l.push("Refusé, rien n'a été enregistré :", ...v.erreurs.map((e) => `- ${e}`));
  if (v.avertissements.length) l.push("À vérifier :", ...v.avertissements.map((a) => `- ${a}`));
  return l.join("\n");
}

const APRES_ECRITURE =
  "Enregistré. La vérification du site démarre (build complet, 3 à 5 minutes) ; si elle passe, la modification part en ligne toute seule. Suis-la avec etat_publication.";

/** Accepte « /coworking », « https://www.les4sources.be/coworking » ou « src/content/pages/coworking.md ». */
function versLegacyPath(saisie: string): string | null {
  const s = saisie.trim();
  if (s.startsWith("src/")) return null;
  let p = s;
  try {
    if (/^https?:\/\//.test(s)) p = new URL(s).pathname;
  } catch {
    /* garde la saisie */
  }
  p = p.replace(/\/+$/, "") || "/";
  return p.startsWith("/") ? p : `/${p}`;
}

export function creerServeur({ env, editeur, origine }: Contexte): McpServer {
  const depot = new Depot(env);
  const server = new McpServer({ name: "les4sources-contenu", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  const signer = (resume: string) => `${resume.trim().slice(0, 120)}\n\nModifié depuis Claude (MCP contenu).`;

  const enregistrer = async (chemin: string, nouveau: string, resume: string, creation: boolean) => {
    if (!estModifiable(chemin)) return erreur(`${chemin} ne fait pas partie des contenus modifiables.`);
    const base = await depot.base();
    const ancien = await depot.lire(chemin, base.sha);
    if (creation && ancien !== null) return erreur(`${chemin} existe déjà : utilise modifier_page ou remplacer_texte.`);
    if (!creation && ancien === null) return erreur(`${chemin} n'existe pas : utilise creer_page.`);
    if (ancien === nouveau) return texte("Aucun changement : le fichier est déjà ainsi.");
    const index = estContenu(chemin) ? (await depot.index(base.sha)).entrees : [];
    const verdict = valider(chemin, nouveau, ancien, index);
    if (verdict.erreurs.length) return erreur(rapport(verdict));
    await depot.commit(base, [{ chemin, texte: nouveau }], signer(resume), editeur);
    const suite = base.enAttente ? `\n\n(${base.enAttente} modification(s) précédente(s) pas encore en ligne : celle-ci s'y ajoute.)` : "";
    return texte([APRES_ECRITURE + suite, rapport(verdict)].filter(Boolean).join("\n\n"));
  };

  const RESUME = z.string().min(3).max(120).describe("Ce qui change, en une phrase (« Tarifs 2027 du coworking »). Inscrit dans l'historique du site.");

  server.registerTool(
    "regles_du_site",
    {
      title: "Règles du site",
      description: "Les règles d'écriture du site : où vit chaque texte, les champs d'en-tête, un exemple de page. À lire avant de créer une page.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => texte(GUIDE),
  );

  server.registerTool(
    "lister_pages",
    {
      title: "Lister les pages",
      description: "Les pages du site (fichier, adresse, titre), filtrées par section et/ou par mot-clé dans le titre, l'adresse ou le texte.",
      inputSchema: {
        section: z.enum(COLLECTIONS).optional().describe("Une section du site ; toutes par défaut."),
        recherche: z.string().optional().describe("Mot-clé (insensible à la casse)."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ section, recherche }) => {
      const base = await depot.base();
      const { entrees, textes } = await depot.index(base.sha);
      const q = recherche?.toLowerCase().trim();
      const lignes = entrees
        .filter((e) => !section || e.chemin.startsWith(`src/content/${section}/`))
        .filter((e) => !q || [e.title, e.legacyPath].some((v) => v?.toLowerCase().includes(q)) || textes.get(e.chemin)!.toLowerCase().includes(q))
        .sort((a, b) => (a.legacyPath ?? "").localeCompare(b.legacyPath ?? ""))
        .map((e) => `${e.legacyPath} · ${e.title}${e.draft ? " [brouillon]" : ""} — ${e.chemin}${e.legacyPath && PAGES_COMPOSEES[e.legacyPath] ? ` (texte affiché : ${PAGES_COMPOSEES[e.legacyPath]})` : ""}`);
      if (!lignes.length) return texte("Aucune page ne correspond.");
      const attente = base.enAttente ? `\n\n(Inclut ${base.enAttente} modification(s) pas encore en ligne.)` : "";
      return texte(`${lignes.length} page(s) :\n${lignes.join("\n")}\n\nTémoignages : ${TEMOIGNAGES}${attente}`);
    },
  );

  server.registerTool(
    "lire_page",
    {
      title: "Lire une page",
      description:
        "Le fichier source d'une page, tel qu'il est (en-tête + texte), à partir de son adresse (/coworking, https://www.les4sources.be/coworking) ou de son fichier (src/content/pages/coworking.md). Rend aussi le fichier .astro d'une page composée.",
      inputSchema: { page: z.string().min(1).describe("Adresse ou chemin du fichier.") },
      annotations: { readOnlyHint: true },
    },
    async ({ page }) => {
      const base = await depot.base();
      const legacy = versLegacyPath(page);
      let chemin = page.trim();
      if (legacy) {
        const { entrees } = await depot.index(base.sha);
        const e = entrees.find((x) => x.legacyPath === legacy);
        if (!e) return erreur(`Aucune page à l'adresse ${legacy}. Cherche-la avec lister_pages.`);
        chemin = e.chemin;
      }
      if (!estModifiable(chemin)) return erreur(`${chemin} ne fait pas partie des contenus modifiables.`);
      const contenu = await depot.lire(chemin, base.sha);
      if (contenu === null) return erreur(`${chemin} n'existe pas.`);
      const lp = legacy ?? Object.entries(PAGES_COMPOSEES).find(([, f]) => f === chemin)?.[0];
      const compose = legacy && PAGES_COMPOSEES[legacy];
      const note = compose
        ? `\n\nAttention : cette page est composée. Ce fichier ne porte que son titre et sa description (Google). Le texte affiché est dans ${compose} (lire_page "${compose}", puis remplacer_texte).`
        : "";
      return texte(`Fichier : ${chemin}${lp ? `\nEn ligne : ${env.SITE_URL}${lp === "/" ? "" : lp}` : ""}${note}\n\n${contenu}`);
    },
  );

  server.registerTool(
    "remplacer_texte",
    {
      title: "Remplacer un passage",
      description:
        "Remplace un passage exact d'un fichier par un nouveau texte (vide pour le supprimer). Le passage doit apparaître une seule fois (copie-le depuis lire_page, avec assez de contexte). Idéal pour corriger un mot, une phrase, un prix ; seul moyen de modifier une page composée (.astro : texte, section retirée, image ajoutée — voir regles_du_site) ou les témoignages.",
      inputSchema: {
        fichier: z.string().describe("Chemin du fichier, ex. src/content/pages/coworking.md."),
        ancien: z.string().min(1).describe("Passage actuel, recopié à l'identique."),
        nouveau: z.string().describe("Texte qui le remplace."),
        resume: RESUME,
      },
      annotations: { destructiveHint: false },
    },
    async ({ fichier, ancien, nouveau, resume }) => {
      if (!estModifiable(fichier)) return erreur(`${fichier} ne fait pas partie des contenus modifiables.`);
      const base = await depot.base();
      const actuel = await depot.lire(fichier, base.sha);
      if (actuel === null) return erreur(`${fichier} n'existe pas.`);
      const n = actuel.split(ancien).length - 1;
      if (n === 0) return erreur("Passage introuvable : relis le fichier avec lire_page et recopie-le à l'identique (espaces, apostrophes ’ ou ').");
      if (n > 1) return erreur(`Passage trouvé ${n} fois : ajoute du contexte autour pour qu'il soit unique.`);
      return enregistrer(fichier, actuel.replace(ancien, () => nouveau), resume, false);
    },
  );

  server.registerTool(
    "modifier_page",
    {
      title: "Réécrire une page",
      description:
        "Remplace le fichier Markdown COMPLET d'une page existante (en-tête + texte). Pars toujours de lire_page et garde tout ce qui ne change pas, legacyPath compris. Pour une petite correction, préfère remplacer_texte.",
      inputSchema: {
        fichier: z.string().describe("Chemin du fichier, ex. src/content/pages/coworking.md."),
        contenu: z.string().min(1).describe("Le fichier complet, en-tête compris."),
        resume: RESUME,
      },
      annotations: { destructiveHint: false },
    },
    async ({ fichier, contenu, resume }) => {
      if (!estContenu(fichier)) return erreur("modifier_page ne vaut que pour les pages Markdown ; pour une page composée ou les témoignages, utilise remplacer_texte.");
      return enregistrer(fichier, finLigne(contenu), resume, false);
    },
  );

  server.registerTool(
    "creer_page",
    {
      title: "Créer une page",
      description:
        "Crée une nouvelle page Markdown dans une section du site. Lis regles_du_site d'abord. L'adresse vient du champ legacyPath de l'en-tête, pas du nom de fichier.",
      inputSchema: {
        section: z.enum(COLLECTIONS),
        nom: z.string().describe("Nom du fichier sans extension : minuscules, chiffres, tirets (ex. fete-de-printemps-2027)."),
        contenu: z.string().min(1).describe("Le fichier complet : en-tête entre --- puis le texte."),
        resume: RESUME,
      },
      annotations: { destructiveHint: false },
    },
    async ({ section, nom, contenu, resume }) => {
      if (!estSlugValide(nom)) return erreur("`nom` : minuscules, chiffres et tirets seulement (ex. fete-de-printemps-2027).");
      return enregistrer(`src/content/${section}/${nom}.md`, finLigne(contenu), resume, true);
    },
  );

  server.registerTool(
    "ajouter_image",
    {
      title: "Ajouter une image",
      description:
        "Copie une image (JPEG, PNG, WebP ou logo SVG, 10 Mo au plus) depuis une adresse web publique dans le site, et rend le chemin à utiliser dans une page. Accepte les liens de partage Google Drive (« tous les utilisateurs disposant du lien ») et Dropbox. L'image n'apparaît que lorsqu'une page l'utilise.",
      inputSchema: {
        url: z.string().url().describe("Adresse directe de l'image (le lien doit ouvrir l'image elle-même)."),
        nom: z.string().describe("Nom de fichier sans extension : minuscules, chiffres, tirets (ex. four-a-pain-2027)."),
        pour_fichier: z.string().optional().describe("La page qui l'utilisera (ex. src/content/pages/coworking.md), pour rendre le bon chemin relatif."),
        resume: RESUME,
      },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    async ({ url, nom, pour_fichier, resume }) => {
      if (!estSlugValide(nom) || nom.includes("/")) return erreur("`nom` : minuscules, chiffres et tirets seulement.");
      const u = new URL(lienDirect(url));
      if (u.protocol !== "https:") return erreur("Seules les adresses https sont acceptées.");
      const res = await fetch(u.toString(), { redirect: "follow" });
      if (!res.ok) return erreur(`L'image n'a pas pu être téléchargée (${res.status}). Le lien doit ouvrir l'image directement, sans page de connexion.`);
      const octets = new Uint8Array(await res.arrayBuffer());
      const r = await enregistrerImage(depot, octets, nom, signer(resume), editeur);
      if ("erreur" in r) return erreur(r.erreur);
      return texte(modeEmploi(r.chemin, octets.length, pour_fichier));
    },
  );

  server.registerTool(
    "preparer_envoi_image",
    {
      title: "Lien d'envoi d'une photo",
      description:
        "Pour une photo ou un logo que la personne a sur son appareil (ou vient de déposer dans la conversation : tu ne peux pas transmettre ce fichier toi-même). Rend un lien à usage unique, valable 30 minutes, à lui donner : elle y choisit le fichier, qui entre dans le site. Quand elle dit que c'est fait, appelle resultat_envoi_image.",
      inputSchema: {
        nom: z.string().describe("Nom de fichier sans extension : minuscules, chiffres, tirets (ex. affiche-microferme)."),
        pour_fichier: z.string().optional().describe("La page qui l'utilisera, pour rendre le bon chemin relatif."),
        resume: RESUME,
      },
      annotations: { destructiveHint: false },
    },
    async ({ nom, pour_fichier, resume }) => {
      if (!estSlugValide(nom) || nom.includes("/")) return erreur("`nom` : minuscules, chiffres et tirets seulement.");
      const jeton = await creerEnvoi(env, { nom, pourFichier: pour_fichier, resume, editeur });
      return texte(
        `Donne ce lien à la personne (il ouvre une page où elle choisit le fichier sur son ordinateur ou son téléphone) :\n${origine}/envoi/${jeton}\n\n` +
          `Valable 30 minutes, pour un seul fichier. Ensuite : resultat_envoi_image avec le jeton ${jeton}.`,
      );
    },
  );

  server.registerTool(
    "resultat_envoi_image",
    {
      title: "Résultat d'un envoi de photo",
      description: "Dit si la photo du lien d'envoi est arrivée, et comment l'utiliser dans une page.",
      inputSchema: { jeton: z.string().describe("Le jeton rendu par preparer_envoi_image.") },
      annotations: { readOnlyHint: true },
    },
    async ({ jeton }) => {
      const envoi = await lireEnvoi(env, jeton);
      if (!envoi) return erreur("Lien inconnu ou expiré (30 minutes) : prépares-en un nouveau avec preparer_envoi_image.");
      if (!envoi.fait) return texte("Pas encore reçue : la personne n'a pas encore envoyé de fichier par ce lien.");
      return texte(modeEmploi(envoi.fait.chemin, envoi.fait.octets, envoi.pourFichier));
    },
  );

  server.registerTool(
    "lister_images",
    {
      title: "Lister les images du site",
      description:
        "Les images déjà présentes dans le site (dossiers nommés d'après la page d'origine, ex. sejours__salles, accueil, contenu), pour en réutiliser une ou remplacer une photo par une autre. Filtre par mot-clé dans le chemin.",
      inputSchema: { recherche: z.string().optional().describe("Mot-clé dans le chemin (ex. salle, hulotte, logo).") },
      annotations: { readOnlyHint: true },
    },
    async ({ recherche }) => {
      const base = await depot.base();
      const q = recherche?.toLowerCase().trim();
      const images = (await depot.images(base.sha)).filter((c) => !q || c.toLowerCase().includes(q));
      if (!images.length) return texte("Aucune image ne correspond.");
      const max = 150;
      return texte(
        `${images.length} image(s)${images.length > max ? ` (les ${max} premières ; précise la recherche)` : ""} :\n${images.slice(0, max).join("\n")}\n\n` +
          "Depuis une page Markdown, le chemin est relatif (ex. ../../assets/…) ; dans un .astro, import depuis \"@assets/…\".",
      );
    },
  );

  server.registerTool(
    "etat_publication",
    {
      title: "État de la publication",
      description: "Où en sont les dernières modifications : en vérification, en ligne, ou refusées (avec la raison à corriger).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const base = await depot.base();
      const runs = await depot.publications(3);
      const dernier = runs[0];
      if (!base.enAttente) {
        const quand = dernier ? ` Dernière publication : ${new Date(dernier.created_at).toLocaleString("fr-BE", { timeZone: "Europe/Brussels" })}.` : "";
        return texte(`Tout est en ligne : aucune modification en attente.${quand} Le site public se met à jour dans les minutes qui suivent la mise en ligne.`);
      }
      const attente = await depot.enAttente(base.main, base.contenu!);
      const liste = attente.map((c) => `- ${c.message}`).join("\n");
      const run = runs.find((r) => r.head_sha === base.contenu);
      if (!run || run.status !== "completed")
        return texte(`${attente.length} modification(s) en cours de vérification :\n${liste}\n\nRedemande dans une minute ou deux.`);
      if (run.conclusion === "success")
        return texte(`${attente.length} modification(s) vérifiée(s), en cours de mise en ligne :\n${liste}`);
      const raison = await depot.raisonEchec(run.id);
      return texte(
        `La vérification a REFUSÉ ces modifications ; elles ne sont pas en ligne :\n${liste}\n\n${raison}\n\n` +
          "Corrige le fichier en cause (la correction s'ajoute et relance la vérification), ou abandonne avec abandonner_modifications.",
      );
    },
  );

  server.registerTool(
    "abandonner_modifications",
    {
      title: "Abandonner les modifications en attente",
      description:
        "Jette toutes les modifications qui ne sont pas encore en ligne (par exemple après un refus de la vérification). Le site en ligne n'est pas touché. Demande d'abord l'accord de la personne.",
      inputSchema: { confirmer: z.literal(true).describe("true, après accord explicite de la personne.") },
      annotations: { destructiveHint: true },
    },
    async () => {
      const base = await depot.base();
      if (!base.enAttente) return texte("Rien à abandonner : tout est déjà en ligne.");
      await depot.deplacerContenu(base.main, true);
      return texte(`${base.enAttente} modification(s) abandonnée(s). Le site reste tel qu'il est en ligne.`);
    },
  );

  return server;
}

/** Un lien de partage Google Drive ou Dropbox, transformé en lien qui renvoie le fichier lui-même. */
export function lienDirect(url: string): string {
  const drive = /^https:\/\/drive\.google\.com\/(?:file\/d\/([\w-]+)|open\?id=([\w-]+))/.exec(url);
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1] ?? drive[2]}`;
  if (/^https:\/\/(www\.)?dropbox\.com\//.test(url)) {
    const u = new URL(url);
    u.searchParams.delete("dl");
    u.searchParams.set("raw", "1");
    return u.toString();
  }
  return url;
}

function finLigne(s: string): string {
  return s.endsWith("\n") ? s : `${s}\n`;
}
