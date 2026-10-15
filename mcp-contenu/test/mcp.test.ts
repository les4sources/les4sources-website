/**
 * Le serveur MCP de bout en bout, contre un faux GitHub en mémoire peuplé
 * avec les vrais contenus du dépôt : on vérifie le protocole MCP, les refus,
 * et surtout qu'une écriture va sur `contenu`, jamais sur `main`.
 */
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { join } from "node:path";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Env } from "../src/github";
import { creerServeur, lienDirect } from "../src/mcp";

const RACINE = join(import.meta.dir, "../..");
const API = "https://api.github.com/repos/les4sources/les4sources-website";

function fichiers(dossier: string): string[] {
  return readdirSync(join(RACINE, dossier), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiers(`${dossier}/${e.name}`) : /\.(mdx?|astro|yaml)$/.test(e.name) ? [`${dossier}/${e.name}`] : [],
  );
}

function fichiersTous(dossier: string): string[] {
  return readdirSync(join(RACINE, dossier), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiersTous(`${dossier}/${e.name}`) : [`${dossier}/${e.name}`],
  );
}

type Commit = { arbre: Map<string, string>; parent: string | null; message: string };

/** Un faux GitHub : des commits (chemin → texte), deux branches, un historique de runs. */
class FauxGitHub {
  commits = new Map<string, Commit>();
  refs = new Map<string, string>();
  arbres = new Map<string, Map<string, string>>();
  blobs = new Map<string, string>();
  binaires = new Map<string, string>();
  runs: { id: number; status: string; conclusion: string | null; head_sha: string; created_at: string; html_url: string }[] = [];
  n = 0;

  constructor() {
    const arbre = new Map<string, string>();
    for (const f of [...fichiers("src/content"), ...fichiers("src/pages"), "src/data/temoignages.yaml"]) arbre.set(f, readFileSync(join(RACINE, f), "utf8"));
    this.commits.set("m0", { arbre, parent: null, message: "init" });
    this.refs.set("main", "m0");
  }

  ancetre(a: string, b: string): number {
    // Nombre de commits de b absents de a (b « en avance » sur a).
    let n = 0;
    for (let c: string | null = b; c && c !== a; c = this.commits.get(c)!.parent) n++;
    return n;
  }

  async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    const methode = init?.method ?? "GET";
    const corps = init?.body ? JSON.parse(String(init.body)) : null;
    const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s });
    if (url.href === "https://api.github.com/graphql") {
      const sha = corps.variables.expr.split(":")[0];
      const arbre = this.commits.get(sha)!.arbre;
      const entries = [...arbre].filter(([p]) => p.startsWith("src/content/")).map(([path, text]) => ({ path, type: "blob", object: { text } }));
      return json({ data: { repository: { object: { entries } } } });
    }
    const chemin = url.href.replace(API, "");
    let m: RegExpExecArray | null;
    if ((m = /^\/git\/ref\/heads\/(.+)$/.exec(chemin))) {
      const sha = this.refs.get(m[1]!);
      return sha ? json({ object: { sha } }) : json({ message: "Not Found" }, 404);
    }
    if ((m = /^\/compare\/(\w+)\.\.\.(\w+)$/.exec(chemin))) {
      const commits = [];
      for (let c: string | null = m[2]!; c && c !== m[1]; c = this.commits.get(c)!.parent)
        commits.unshift({ sha: c, commit: { message: this.commits.get(c)!.message, author: { date: "2026-10-15T12:00:00Z" } } });
      return json({ ahead_by: commits.length, commits });
    }
    if ((m = /^\/contents\/(.+)\?ref=(\w+)$/.exec(chemin))) {
      const texte = this.commits.get(m[2]!)!.arbre.get(decodeURI(m[1]!));
      return texte === undefined ? json({ message: "Not Found" }, 404) : new Response(texte);
    }
    if ((m = /^\/git\/trees\/(\w+)\?recursive=1$/.exec(chemin))) {
      const actifs = fichiersTous("src/assets");
      const chemins = new Set([...this.commits.get(m[1]!)!.arbre.keys(), ...actifs]);
      return json({ tree: [...chemins].map((path) => ({ path, type: "blob" })) });
    }
    if ((m = /^\/git\/commits\/(\w+)$/.exec(chemin))) {
      this.arbres.set(`t-${m[1]}`, this.commits.get(m[1]!)!.arbre);
      return json({ tree: { sha: `t-${m[1]}` } });
    }
    if (chemin === "/git/blobs" && methode === "POST") {
      const sha = `b${++this.n}`;
      this.blobs.set(sha, `[binaire ${corps.content.length}]`);
      this.binaires.set(`[binaire ${corps.content.length}]`, corps.content);
      return json({ sha }, 201);
    }
    if (chemin === "/git/trees" && methode === "POST") {
      const arbre = new Map(this.arbres.get(corps.base_tree)!);
      for (const e of corps.tree) arbre.set(e.path, e.content ?? this.blobs.get(e.sha)!);
      const sha = `t${++this.n}`;
      this.arbres.set(sha, arbre);
      return json({ sha }, 201);
    }
    if (chemin === "/git/commits" && methode === "POST") {
      const sha = `c${++this.n}`;
      this.commits.set(sha, { arbre: this.arbres.get(corps.tree)!, parent: corps.parents[0], message: corps.message });
      return json({ sha }, 201);
    }
    if ((m = /^\/git\/refs\/heads\/(.+)$/.exec(chemin)) && methode === "PATCH") {
      expect(m[1]).toBe("contenu"); // le MCP n'écrit jamais ailleurs
      this.refs.set(m[1]!, corps.sha);
      return json({});
    }
    if (chemin === "/git/refs" && methode === "POST") {
      expect(corps.ref).toBe("refs/heads/contenu");
      this.refs.set("contenu", corps.sha);
      return json({}, 201);
    }
    if (/^\/actions\/workflows\/publication-contenu\.yml\/runs/.test(chemin)) return json({ workflow_runs: this.runs });
    if ((m = /^\/actions\/runs\/(\d+)\/jobs$/.exec(chemin)))
      return json({ jobs: [{ id: 7, conclusion: "failure", steps: [{ name: "Vérifier le site (bun run verify)", conclusion: "failure" }] }] });
    if (chemin === "/actions/jobs/7/logs")
      return new Response("2026-10-15T12:00:00.0000000Z ✗ src/content/pages/coworking.md: erreur de build simulée\n");
    if (url.href === "https://images.exemple.org/logo.png")
      return new Response(readFileSync(join(RACINE, "src/assets/migration/index/17-fondation-cyrys.png")));
    if (url.hostname === "images.exemple.org")
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { status: 200 });
    throw new Error(`Requête non simulée : ${methode} ${url.href}`);
  }

  texte(branche: string, chemin: string) {
    return this.commits.get(this.refs.get(branche)!)!.arbre.get(chemin);
  }
}

/** Un KV en mémoire, assez pour les liens d'envoi. */
const kv = new Map<string, string>();
const fauxKV = {
  get: async (k: string) => kv.get(k) ?? null,
  put: async (k: string, v: string) => void kv.set(k, v),
  delete: async (k: string) => void kv.delete(k),
} as unknown as KVNamespace;

const env = {
  OAUTH_KV: fauxKV,
  GITHUB_TOKEN: "faux",
  EDITEURS: '{"E":"un-mot-de-passe-solide"}',
  GITHUB_REPO: "les4sources/les4sources-website",
  BRANCHE_PRINCIPALE: "main",
  BRANCHE_CONTENU: "contenu",
  WORKFLOW_PUBLICATION: "publication-contenu.yml",
  COMMIT_EMAIL: "mcp-contenu@users.noreply.github.com",
  SITE_URL: "https://www.les4sources.be",
} as Env;

let gh: FauxGitHub;
const fetchOrigine = globalThis.fetch;
beforeEach(() => {
  gh = new FauxGitHub();
  globalThis.fetch = ((i: never, init?: RequestInit) => gh.fetch(i, init)) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = fetchOrigine;
});

let id = 0;
async function rpc(method: string, params: Record<string, unknown> = {}) {
  const server = creerServeur({ env, editeur: "E", origine: "https://mcp.test" });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const entete = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  // Chaque requête HTTP est autonome (serveur sans état) : initialize puis l'appel, comme le fait le Worker.
  const res = await transport.handleRequest(
    new Request("https://mcp.test/mcp", {
      method: "POST",
      headers: { ...entete, "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    }),
  );
  return (await res.json()) as { result?: any; error?: any };
}

const appeler = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await rpc("tools/call", { name, arguments: args });
  return { texte: r.result.content[0].text as string, erreur: !!r.result.isError };
};

describe("protocole", () => {
  test("initialize annonce les instructions", async () => {
    const r = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(r.result.serverInfo.name).toBe("les4sources-contenu");
    expect(r.result.instructions).toContain("legacyPath");
  });

  test("tools/list expose les outils", async () => {
    const r = await rpc("tools/list");
    expect(r.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(
      [
        "abandonner_modifications",
        "ajouter_image",
        "creer_page",
        "etat_publication",
        "lire_page",
        "lister_images",
        "lister_pages",
        "modifier_page",
        "preparer_envoi_image",
        "regles_du_site",
        "remplacer_texte",
        "resultat_envoi_image",
      ].sort(),
    );
  });
});

describe("lecture", () => {
  test("lister_pages filtre par mot-clé", async () => {
    const { texte } = await appeler("lister_pages", { recherche: "coworking" });
    expect(texte).toContain("/coworking · Coworking dans la Clairière");
  });

  test("lire_page par adresse complète", async () => {
    const { texte } = await appeler("lire_page", { page: "https://www.les4sources.be/coworking/" });
    expect(texte).toContain("Fichier : src/content/pages/coworking.md");
    expect(texte).toContain('legacyPath: "/coworking"');
  });

  test("lire_page sur une page composée renvoie vers le .astro", async () => {
    const { texte } = await appeler("lire_page", { page: "/" });
    expect(texte).toContain("src/pages/index.astro");
  });

  test("un fichier de code est refusé", async () => {
    const { erreur } = await appeler("lire_page", { page: "src/lib/site.ts" });
    expect(erreur).toBe(true);
  });
});

describe("écriture", () => {
  test("remplacer_texte écrit sur contenu, pas sur main", async () => {
    const { texte, erreur } = await appeler("remplacer_texte", {
      fichier: "src/content/pages/coworking.md",
      ancien: "accessible **du lundi au vendredi",
      nouveau: "ouvert **du lundi au vendredi",
      resume: "Coworking : ouvert",
    });
    expect(erreur).toBe(false);
    expect(texte).toContain("Enregistré");
    expect(gh.texte("contenu", "src/content/pages/coworking.md")).toContain("ouvert **du lundi");
    expect(gh.texte("main", "src/content/pages/coworking.md")).toContain("accessible **du lundi");
  });

  test("les écritures s'empilent tant que rien n'est publié, puis repartent de main", async () => {
    const f = "src/content/pages/coworking.md";
    const r1 = await appeler("remplacer_texte", { fichier: f, ancien: "accessible **du lundi au vendredi", nouveau: "ouvert **du lundi au vendredi", resume: "Essai un" });
    expect(r1.texte).toContain("Enregistré");
    const r2 = await appeler("remplacer_texte", { fichier: f, ancien: "ouvert **du lundi", nouveau: "disponible **du lundi", resume: "Essai deux" });
    expect(r2.texte).toContain("1 modification(s) précédente(s)");
    expect(gh.ancetre("m0", gh.refs.get("contenu")!)).toBe(2);
    // Publication : main rattrape contenu ; l'écriture suivante repart de main.
    gh.refs.set("main", gh.refs.get("contenu")!);
    const r3 = await appeler("remplacer_texte", { fichier: f, ancien: "disponible **du lundi", nouveau: "ouvert **du lundi", resume: "Essai trois" });
    expect(r3.texte).not.toContain("précédente");
  });

  test("changer legacyPath est refusé et rien n'est écrit", async () => {
    const r = await appeler("remplacer_texte", {
      fichier: "src/content/pages/coworking.md",
      ancien: 'legacyPath: "/coworking"',
      nouveau: 'legacyPath: "/cowork"',
      resume: "Nouvelle adresse",
    });
    expect(r.erreur).toBe(true);
    expect(r.texte).toContain("ne change jamais");
    expect(gh.refs.has("contenu")).toBe(false);
  });

  test("dans un .astro, un passage introuvable est refusé", async () => {
    const r = await appeler("remplacer_texte", {
      fichier: "src/pages/index.astro",
      ancien: 'title="Nos soutiens 🌈"',
      nouveau: 'title="Nos soutiens"',
      resume: "Test",
    });
    expect(r.erreur).toBe(true);
  });

  test("creer_page : nouvelle page valide", async () => {
    const contenu = `---\ntitle: "Page de test du MCP"\ndescription: "Une page créée par le test du serveur MCP pour vérifier la création de contenu."\nlegacyPath: "/test-du-mcp"\n---\n\nUn paragraphe.\n`;
    const r = await appeler("creer_page", { section: "pages", nom: "test-du-mcp", contenu, resume: "Page de test" });
    expect(r.erreur).toBe(false);
    expect(gh.texte("contenu", "src/content/pages/test-du-mcp.md")).toBe(contenu);
  });

  test("creer_page refuse une adresse déjà prise", async () => {
    const contenu = `---\ntitle: "Encore le coworking"\ndescription: "Une page créée par le test du serveur MCP pour vérifier les doublons d'adresse."\nlegacyPath: "/coworking"\n---\n`;
    const r = await appeler("creer_page", { section: "pages", nom: "doublon", contenu, resume: "Doublon" });
    expect(r.erreur).toBe(true);
    expect(r.texte).toContain("déjà prise");
  });

  test("ajouter_image vérifie le format et rend le chemin relatif", async () => {
    const r = await appeler("ajouter_image", {
      url: "https://images.exemple.org/four.jpg",
      nom: "four-a-pain",
      pour_fichier: "src/content/pages/coworking.md",
      resume: "Photo du four",
    });
    expect(r.erreur).toBe(false);
    expect(r.texte).toContain('cover: "../../assets/images/contenu/four-a-pain.jpg"');
    expect(gh.texte("contenu", "src/assets/images/contenu/four-a-pain.jpg")).toContain("binaire");
  });
});

describe("publication", () => {
  test("rien en attente", async () => {
    expect((await appeler("etat_publication")).texte).toContain("Tout est en ligne");
  });

  test("un refus donne la raison, et abandonner remet contenu sur main", async () => {
    await appeler("remplacer_texte", { fichier: "src/content/pages/coworking.md", ancien: "accessible **du lundi au vendredi", nouveau: "ouvert **du lundi au vendredi", resume: "Essai" });
    gh.runs = [{ id: 1, status: "completed", conclusion: "failure", head_sha: gh.refs.get("contenu")!, created_at: "2026-10-15T12:00:00Z", html_url: "" }];
    const etat = await appeler("etat_publication");
    expect(etat.texte).toContain("REFUSÉ");
    expect(etat.texte).toContain("erreur de build simulée");
    await appeler("abandonner_modifications", { confirmer: true });
    expect(gh.refs.get("contenu")).toBe("m0");
    expect((await appeler("etat_publication")).texte).toContain("Tout est en ligne");
  });
});

/**
 * Les demandes réelles transmises par Michael le 2026-10-15 (en mémoire
 * seulement : rien n'est publié). Avec MCP_EXPORT=<dossier>, les fichiers
 * modifiés sont écrits dans ce dossier pour y lancer un vrai build.
 */
describe("scénario : les demandes d'E", () => {
  const ecrire = async (fichier: string, ancien: string, nouveau: string, resume: string) => {
    const r = await appeler("remplacer_texte", { fichier, ancien, nouveau, resume });
    expect({ fichier, r }).toEqual({ fichier, r: { texte: expect.stringContaining("Enregistré"), erreur: false } });
  };

  test("toutes passent par le MCP", async () => {
    // 1. Un logo de soutien en plus sur l'accueil (image + import + <Image>).
    const img = await appeler("ajouter_image", { url: "https://images.exemple.org/logo.png", nom: "logo-test-soutien", resume: "Logo d'un soutien" });
    expect(img.texte).toContain('import monImage from "@assets/images/contenu/logo-test-soutien.png"');
    await ecrire(
      "src/pages/index.astro",
      'import soutienCyrys from "@assets/migration/index/17-fondation-cyrys.png";',
      'import soutienCyrys from "@assets/migration/index/17-fondation-cyrys.png";\nimport soutienTest from "@assets/images/contenu/logo-test-soutien.png";',
      "Accueil : import du logo",
    );
    await ecrire(
      "src/pages/index.astro",
      `        alt="Fondation Cyrys"
        widths={[240, 300]}
        sizes="120px"
        class="h-auto max-h-[120px] w-auto object-contain"
      />`,
      `        alt="Fondation Cyrys"
        widths={[240, 300]}
        sizes="120px"
        class="h-auto max-h-[120px] w-auto object-contain"
      />
      <Image src={soutienTest} alt="Un autre soutien" widths={[240, 300]} sizes="120px" class="h-auto max-h-[120px] w-auto object-contain" />`,
      "Accueil : logo d'un soutien",
    );

    // 2. Retirer la carte des balades de l'accueil (un bloc de balisage entier).
    const accueil = gh.texte("contenu", "src/pages/index.astro")!;
    const debut = accueil.indexOf('      <div>\n        <h3 class="mb-2.5 font-display text-h3 font-bold text-white">Carte de balades</h3>');
    const fin = accueil.indexOf("      </div>\n", accueil.indexOf("Télécharger la carte")) + "      </div>\n".length;
    await ecrire("src/pages/index.astro", accueil.slice(debut, fin), "", "Accueil : sans la carte des balades");

    // 3. La description de « À propos ».
    await ecrire(
      "src/content/pages/a-propos.md",
      "Un écolieu / tiers-lieu avec des fondements solides et une raison d’être : accès, projet, collectif, animaux, presse, verger et histoire du lieu.",
      "Le projet, le collectif, les animaux, le verger et l’histoire du Domaine d’Ahinvaux, le tiers-lieu des 4 Sources à Yvoir.",
      "À propos : nouvelle description",
    );

    // 4. Le réseau, dans « Notre collectif ».
    await ecrire("src/content/pages/notre-collectif.md", "- [Savonnerie Snoap](/collectif/olivier-vanhamme)\n", "- [Savonnerie Snoap](/collectif/olivier-vanhamme)\n- Le verger de la Molignée\n- La Cafet\n", "Collectif : réseau");

    // 5. Les points de vente du pain.
    await ecrire(
      "src/content/projets/tranches-de-vie.md",
      "fait par des gens qui savent pourquoi ils le font.\n",
      "fait par des gens qui savent pourquoi ils le font.\n\nLes pains sont aussi disponibles à l’épicerie de la gare.\n",
      "Boulangerie : points de vente",
    );

    // 6. Une photo de salle remplacée par une autre déjà sur le site.
    const salles = await appeler("lister_images", { recherche: "sejours__salles" });
    expect(salles.texte).toContain("src/assets/migration/sejours__salles/02-_G0A2828.jpg");
    await ecrire(
      "src/content/pages/sejours__salles.md",
      'cover: "../../assets/migration/sejours__salles/01-_G0A3585.jpg"',
      'cover: "../../assets/migration/sejours__salles/02-_G0A2828.jpg"',
      "Salles : autre photo de couverture",
    );

    expect(gh.texte("main", "src/pages/index.astro")).toContain("Carte de balades"); // main intact
    const sortie = process.env.MCP_EXPORT;
    if (sortie) {
      const arbre = gh.commits.get(gh.refs.get("contenu")!)!.arbre;
      const origine = gh.commits.get("m0")!.arbre;
      for (const [chemin, texte] of arbre) {
        if (origine.get(chemin) === texte) continue;
        mkdirSync(dirname(join(sortie, chemin)), { recursive: true });
        const b64 = gh.binaires.get(texte);
        writeFileSync(join(sortie, chemin), b64 ? Buffer.from(b64, "base64") : texte);
      }
    }
  });
});

test("liens de partage Google Drive et Dropbox", () => {
  expect(lienDirect("https://drive.google.com/file/d/1AbC_d-9/view?usp=sharing")).toBe("https://drive.google.com/uc?export=download&id=1AbC_d-9");
  expect(lienDirect("https://www.dropbox.com/scl/fi/x/logo.png?rlkey=k&dl=0")).toBe("https://www.dropbox.com/scl/fi/x/logo.png?rlkey=k&raw=1");
  expect(lienDirect("https://exemple.org/a.jpg")).toBe("https://exemple.org/a.jpg");
});

describe("lien d'envoi d'une photo", () => {
  // `cloudflare:workers` n'existe que dans workerd ; le fournisseur OAuth n'en importe qu'une classe de base.
  mock.module("cloudflare:workers", () => ({ WorkerEntrypoint: class {} }));
  const worker = async () => (await import("../src/index")).default;
  const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

  test("préparer, envoyer depuis la page, puis lire le résultat", async () => {
    const prep = await appeler("preparer_envoi_image", { nom: "affiche-microferme", pour_fichier: "src/content/pages/a-propos.md", resume: "Affiche de la microferme" });
    const lien = /https:\/\/mcp\.test\/envoi\/([0-9a-f]{48})/.exec(prep.texte)!;
    expect(lien).not.toBeNull();
    const jeton = lien[1]!;
    expect((await appeler("resultat_envoi_image", { jeton })).texte).toContain("Pas encore reçue");

    const w = await worker();
    const get = await w.fetch(new Request(lien[0]), env, ctx);
    expect(await get.text()).toContain('type="file"');

    const form = new FormData();
    form.set("fichier", new File([readFileSync(join(RACINE, "src/assets/migration/index/17-fondation-cyrys.png"))], "affiche.png", { type: "image/png" }));
    const post = await w.fetch(new Request(lien[0], { method: "POST", body: form }), env, ctx);
    expect(await post.text()).toContain("Photo reçue");
    expect(gh.texte("contenu", "src/assets/images/contenu/affiche-microferme.png")).toContain("binaire");
    expect(gh.texte("main", "src/assets/images/contenu/affiche-microferme.png")).toBeUndefined();

    const res = await appeler("resultat_envoi_image", { jeton });
    expect(res.texte).toContain('cover: "../../assets/images/contenu/affiche-microferme.png"');
    // Usage unique.
    expect(await (await w.fetch(new Request(lien[0]), env, ctx)).text()).toContain("déjà reçue");
  });

  test("un fichier qui n'est pas une image est refusé, et le lien reste valable", async () => {
    const prep = await appeler("preparer_envoi_image", { nom: "document", resume: "Essai de refus" });
    const lien = /https:\/\/mcp\.test\/envoi\/[0-9a-f]{48}/.exec(prep.texte)![0];
    const w = await worker();
    const form = new FormData();
    form.set("fichier", new File(["pas une image"], "x.txt", { type: "text/plain" }));
    expect(await (await w.fetch(new Request(lien, { method: "POST", body: form }), env, ctx)).text()).toContain("refusée");
    expect(await (await w.fetch(new Request(lien), env, ctx)).text()).toContain('type="file"');
  });

  test("un jeton inconnu ne mène nulle part", async () => {
    const w = await worker();
    const r = await w.fetch(new Request(`https://mcp.test/envoi/${"0".repeat(48)}`), env, ctx);
    expect(r.status).toBe(404);
  });
});
