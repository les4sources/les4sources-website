/**
 * Le dépôt du site, vu par l'API GitHub.
 *
 * Le MCP n'écrit JAMAIS sur `main`. Il écrit sur la branche `contenu` ; le
 * workflow `publication-contenu.yml` y construit le site (`bun run verify`)
 * et ne pousse sur `main` que si tout passe. Ainsi une modification qui
 * casserait le site ne part jamais en ligne.
 *
 * La branche `contenu` repart de `main` dès que tout ce qu'elle portait est
 * publié ; tant qu'elle porte des modifications non publiées (en cours de
 * vérification, ou refusées par la vérification), les écritures suivantes
 * s'y empilent, pour qu'une correction puisse réparer l'erreur précédente.
 */
import { entreeIndex, type EntreeIndex } from "./contenu";

export type Env = {
  OAUTH_KV: KVNamespace;
  /** Token GitHub à grain fin : Contents (lecture/écriture) et Actions (lecture), sur ce seul dépôt. */
  GITHUB_TOKEN: string;
  /** `{"<nom affiché dans l'historique>": "<mot de passe>"}` — un mot de passe par personne. */
  EDITEURS: string;
  GITHUB_REPO: string;
  BRANCHE_PRINCIPALE: string;
  BRANCHE_CONTENU: string;
  WORKFLOW_PUBLICATION: string;
  COMMIT_EMAIL: string;
  SITE_URL: string;
};

export class ErreurGitHub extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class Depot {
  constructor(private readonly env: Env) {}

  private get api() {
    return `https://api.github.com/repos/${this.env.GITHUB_REPO}`;
  }

  private async requete<T>(chemin: string, init: RequestInit = {}, accept = "application/vnd.github+json"): Promise<T> {
    const url = chemin.startsWith("https://") ? chemin : `${this.api}${chemin}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.env.GITHUB_TOKEN}`,
        Accept: accept,
        "User-Agent": "les4sources-mcp-contenu",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!res.ok) throw new ErreurGitHub(res.status, `GitHub ${res.status} sur ${chemin} : ${(await res.text()).slice(0, 300)}`);
    if (accept.endsWith("raw+json") || accept === "text/plain") return (await res.text()) as T;
    return (await res.json()) as T;
  }

  private async ref(branche: string): Promise<string | null> {
    try {
      const r = await this.requete<{ object: { sha: string } }>(`/git/ref/heads/${branche}`);
      return r.object.sha;
    } catch (e) {
      if (e instanceof ErreurGitHub && e.status === 404) return null;
      throw e;
    }
  }

  /**
   * Le commit sur lequel travailler : la tête de `contenu` si elle porte des
   * modifications pas encore sur `main`, sinon `main`.
   */
  async base(): Promise<{ sha: string; enAttente: number; main: string; contenu: string | null }> {
    const [main, contenu] = await Promise.all([this.ref(this.env.BRANCHE_PRINCIPALE), this.ref(this.env.BRANCHE_CONTENU)]);
    if (!main) throw new Error(`Branche ${this.env.BRANCHE_PRINCIPALE} introuvable.`);
    if (!contenu || contenu === main) return { sha: main, enAttente: 0, main, contenu };
    const cmp = await this.requete<{ ahead_by: number }>(`/compare/${main}...${contenu}`);
    return cmp.ahead_by > 0 ? { sha: contenu, enAttente: cmp.ahead_by, main, contenu } : { sha: main, enAttente: 0, main, contenu };
  }

  /** Texte d'un fichier à un commit donné ; `null` s'il n'existe pas. */
  async lire(chemin: string, sha: string): Promise<string | null> {
    try {
      return await this.requete<string>(`/contents/${encodeURI(chemin)}?ref=${sha}`, {}, "application/vnd.github.raw+json");
    } catch (e) {
      if (e instanceof ErreurGitHub && e.status === 404) return null;
      throw e;
    }
  }

  /** Existe-t-il un fichier à ce chemin ? */
  async existe(chemin: string, sha: string): Promise<boolean> {
    try {
      await this.requete(`/contents/${encodeURI(chemin)}?ref=${sha}`, { method: "GET" }, "application/vnd.github.object+json");
      return true;
    } catch (e) {
      if (e instanceof ErreurGitHub && e.status === 404) return false;
      throw e;
    }
  }

  /**
   * Tous les fichiers Markdown de `src/content`, avec leur texte, en UNE
   * requête GraphQL (un Worker gratuit a droit à 50 sous-requêtes).
   */
  async index(sha: string): Promise<{ entrees: EntreeIndex[]; textes: Map<string, string> }> {
    const [owner, name] = this.env.GITHUB_REPO.split("/");
    const blob = "... on Blob { text }";
    // Quatre niveaux : hebergements/<gîte>/<chambre>.md est le plus profond.
    let niveau = `entries { path type object { ${blob} } }`;
    for (let i = 0; i < 4; i++) niveau = `entries { path type object { ${blob} ... on Tree { ${niveau} } } }`;
    const query = `query($owner:String!,$name:String!,$expr:String!){ repository(owner:$owner,name:$name){ object(expression:$expr){ ... on Tree { ${niveau} } } } }`;
    type Noeud = { path: string; type: string; object: { text?: string | null; entries?: Noeud[] } | null };
    const res = await this.requete<{ data?: { repository: { object: { entries: Noeud[] } | null } }; errors?: { message: string }[] }>(
      "https://api.github.com/graphql",
      { method: "POST", body: JSON.stringify({ query, variables: { owner, name, expr: `${sha}:src/content` } }) },
    );
    if (res.errors?.length) throw new Error(`GitHub GraphQL : ${res.errors.map((e) => e.message).join(" ; ")}`);
    const textes = new Map<string, string>();
    const parcourir = (noeuds: Noeud[] = []) => {
      for (const n of noeuds) {
        if (n.type === "tree") parcourir(n.object?.entries);
        else if (/\.mdx?$/.test(n.path) && typeof n.object?.text === "string") textes.set(n.path, n.object.text);
      }
    };
    parcourir(res.data?.repository.object?.entries);
    const entrees = [...textes].map(([chemin, texte]) => entreeIndex(chemin, texte));
    return { entrees, textes };
  }

  /**
   * Un commit sur `contenu`, au-dessus de `base`. Les fichiers texte passent
   * en clair ; un fichier binaire (image) passe par un blob base64.
   */
  async commit(
    base: { sha: string; contenu: string | null },
    fichiers: { chemin: string; texte?: string; base64?: string }[],
    message: string,
    auteur: string,
  ): Promise<string> {
    const commitBase = await this.requete<{ tree: { sha: string } }>(`/git/commits/${base.sha}`);
    const tree = await Promise.all(
      fichiers.map(async (f) => {
        if (f.texte !== undefined) return { path: f.chemin, mode: "100644", type: "blob", content: f.texte };
        const blob = await this.requete<{ sha: string }>("/git/blobs", {
          method: "POST",
          body: JSON.stringify({ content: f.base64, encoding: "base64" }),
        });
        return { path: f.chemin, mode: "100644", type: "blob", sha: blob.sha };
      }),
    );
    const arbre = await this.requete<{ sha: string }>("/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: commitBase.tree.sha, tree }),
    });
    const commit = await this.requete<{ sha: string }>("/git/commits", {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: arbre.sha,
        parents: [base.sha],
        author: { name: auteur, email: this.env.COMMIT_EMAIL, date: new Date().toISOString() },
      }),
    });
    await this.deplacerContenu(commit.sha, base.contenu !== null);
    return commit.sha;
  }

  /** Pose `contenu` sur un commit (forcé : la branche repart de `main` après chaque publication). */
  async deplacerContenu(sha: string, existe: boolean): Promise<void> {
    const branche = this.env.BRANCHE_CONTENU;
    if (existe)
      await this.requete(`/git/refs/heads/${branche}`, { method: "PATCH", body: JSON.stringify({ sha, force: true }) });
    else await this.requete("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branche}`, sha }) });
  }

  /** Les modifications de `contenu` pas encore sur `main`. */
  async enAttente(main: string, contenu: string): Promise<{ sha: string; message: string; date: string }[]> {
    const cmp = await this.requete<{ commits: { sha: string; commit: { message: string; author: { date: string } } }[] }>(
      `/compare/${main}...${contenu}`,
    );
    return cmp.commits.map((c) => ({ sha: c.sha, message: c.commit.message.split("\n")[0]!, date: c.commit.author.date }));
  }

  /** Les dernières publications (exécutions du workflow sur `contenu`). */
  async publications(n = 3) {
    const r = await this.requete<{
      workflow_runs: { id: number; status: string; conclusion: string | null; head_sha: string; created_at: string; html_url: string }[];
    }>(`/actions/workflows/${this.env.WORKFLOW_PUBLICATION}/runs?branch=${this.env.BRANCHE_CONTENU}&per_page=${n}`);
    return r.workflow_runs;
  }

  /** Les lignes du journal qui disent pourquoi une publication a échoué. */
  async raisonEchec(runId: number): Promise<string> {
    const jobs = await this.requete<{ jobs: { id: number; conclusion: string | null; steps?: { name: string; conclusion: string | null }[] }[] }>(
      `/actions/runs/${runId}/jobs`,
    );
    const job = jobs.jobs.find((j) => j.conclusion === "failure");
    if (!job) return "Aucune étape en échec trouvée.";
    const etape = job.steps?.find((s) => s.conclusion === "failure")?.name ?? "inconnue";
    let journal = "";
    try {
      journal = await this.requete<string>(`/actions/jobs/${job.id}/logs`, {}, "text/plain");
    } catch {
      return `Étape en échec : ${etape}. (Journal illisible.)`;
    }
    const lignes = journal
      .split("\n")
      .map((l) => l.replace(/^\S+Z /, "").replace(/\x1b\[[0-9;]*m/g, ""))
      .filter((l) => l.trim() && !l.startsWith("##[group]") && !l.startsWith("##[endgroup]"));
    const utiles = lignes.filter((l) => /error|erreur|✗|×|failed|échec|invalid|cannot|could not|conflict/i.test(l));
    const extrait = (utiles.length ? utiles : lignes).slice(-40).join("\n");
    return `Étape en échec : ${etape}.\n\n${extrait}`;
  }
}
