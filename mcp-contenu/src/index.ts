/**
 * MCP « contenu » du site des 4 Sources — un Worker Cloudflare.
 *
 * - `/mcp` : le serveur MCP (Streamable HTTP, sans état), derrière OAuth.
 * - `/authorize` : la page où l'éditrice entre son mot de passe, une fois,
 *   quand elle ajoute le connecteur dans Claude.
 * - le reste (découverte OAuth, jetons, enregistrement du client Claude) :
 *   `@cloudflare/workers-oauth-provider`.
 *
 * Les personnes autorisées et leurs mots de passe vivent dans le secret
 * `EDITEURS` ; retirer quelqu'un de ce secret lui coupe l'accès sur-le-champ,
 * même avec un jeton encore valide.
 */
import OAuthProvider, { AuthorizationError, CimdFetchError, type AuthRequest } from "@cloudflare/workers-oauth-provider";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Env } from "./github";
import { creerServeur } from "./mcp";

type Props = { editeur: string };

const ESSAIS_MAX = 10;
const ESSAIS_FENETRE = 15 * 60;

/** Les éditeurs déclarés dans le secret `EDITEURS`. */
function editeurs(env: Env): Record<string, string> {
  try {
    const e = JSON.parse(env.EDITEURS ?? "{}");
    return e && typeof e === "object" ? e : {};
  } catch {
    return {};
  }
}

const mcpHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext & { props?: Props }): Promise<Response> {
    const editeur = ctx.props?.editeur;
    if (!editeur || !(editeur in editeurs(env))) return new Response("Accès retiré.", { status: 403 });
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    const server = creerServeur({ env, editeur });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};

const escape = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(titre: string, corps: string, status = 200, headers = new Headers()): Response {
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https:; frame-ancestors 'none'");
  return new Response(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(titre)}</title>
<style>
body{font-family:system-ui,sans-serif;background:#f6f1e7;color:#1d2a28;margin:0;padding:24px}
main{max-width:440px;margin:8vh auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
h1{font-size:1.35rem;margin:0 0 12px}p{line-height:1.5}
input{width:100%;box-sizing:border-box;font-size:1rem;padding:10px;border:1px solid #b9b2a4;border-radius:8px}
button{font-size:1rem;padding:10px 18px;border-radius:8px;border:0;cursor:pointer;margin-top:14px}
.oui{background:#0b3d3a;color:#fff}.non{background:#e8e2d6;color:#1d2a28;margin-left:8px}.err{color:#a3261b}small{color:#5c625f}
</style><main>${corps}</main></html>`,
    { status, headers },
  );
}

function formulaire(details: { clientName: string; redirectHost: string; redirectIsLoopback: boolean }, handle: string, message = ""): string {
  return `<h1>Modifier le site des 4 Sources</h1>
<p><strong>${escape(details.clientName)}</strong> demande à modifier les contenus de www.les4sources.be en ton nom.</p>
<p><small>L'accès sera envoyé à <strong>${escape(details.redirectHost)}</strong>.${details.redirectIsLoopback ? " C'est une application sur ton ordinateur : continue seulement si tu viens de la lancer." : ""}</small></p>
${message ? `<p class="err">${escape(message)}</p>` : ""}
<form method="post">
<input type="hidden" name="handle" value="${escape(handle)}">
<label for="mdp">Mot de passe</label>
<input id="mdp" name="mot_de_passe" type="password" autocomplete="current-password" autofocus>
<button class="oui" name="decision" value="approve">Autoriser</button><button class="non" name="decision" value="deny">Refuser</button>
</form>`;
}

async function empreinte(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** Le nom de l'éditeur dont c'est le mot de passe ; comparaison à temps constant. */
async function identifier(env: Env, motDePasse: string): Promise<string | null> {
  if (!motDePasse) return null;
  const saisi = await empreinte(motDePasse);
  let trouve: string | null = null;
  for (const [nom, mdp] of Object.entries(editeurs(env))) {
    if (typeof mdp !== "string" || mdp.length < 12) continue; // un mot de passe trop court ne vaut rien
    const attendu = await empreinte(mdp);
    let diff = 0;
    for (let i = 0; i < attendu.length; i++) diff |= attendu[i]! ^ saisi[i]!;
    if (diff === 0) trouve = nom;
  }
  return trouve;
}

async function authorize(request: Request, env: Env & { OAUTH_PROVIDER: import("@cloudflare/workers-oauth-provider").OAuthHelpers }): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  try {
    if (request.method === "GET") {
      const req: AuthRequest = await oauth.parseAuthRequest(request);
      const details = await oauth.describeConsent(req);
      const consent = await oauth.beginConsent(req);
      return page("Autoriser Claude", formulaire(details, consent.handle), 200, consent.headers);
    }
    if (request.method !== "POST") return new Response(null, { status: 405 });

    const form = await request.formData();
    const handle = String(form.get("handle") ?? "");
    if (form.get("decision") !== "approve") {
      const refus = await oauth.denyConsent(request, handle);
      return new Response(null, { status: 302, headers: refus.headers });
    }

    const ip = request.headers.get("CF-Connecting-IP") ?? "inconnue";
    const cle = `essais:${ip}`;
    const essais = Number((await env.OAUTH_KV.get(cle)) ?? 0);
    if (essais >= ESSAIS_MAX) return page("Trop d'essais", "<h1>Trop d'essais</h1><p>Réessaie dans un quart d'heure.</p>", 429);

    const editeur = await identifier(env, String(form.get("mot_de_passe") ?? ""));
    if (!editeur) {
      await env.OAUTH_KV.put(cle, String(essais + 1), { expirationTtl: ESSAIS_FENETRE });
      return page(
        "Mot de passe incorrect",
        `<h1>Mot de passe incorrect</h1><p>Retourne dans Claude et relance la connexion du connecteur.</p>`,
        401,
      );
    }

    const approuve = await oauth.approveConsent(request, handle);
    const { redirectTo } = await oauth.completeAuthorization({
      request: approuve.request,
      userId: encodeURIComponent(editeur),
      metadata: { editeur },
      scope: approuve.request.scope,
      props: { editeur } satisfies Props,
    });
    approuve.headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers: approuve.headers });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
      const msg = error instanceof AuthorizationError ? error.description : "Cette application n'a pas pu être vérifiée.";
      return page("Erreur", `<h1>Connexion impossible</h1><p>${escape(msg ?? "")}</p><p>Relance la connexion depuis Claude.</p>`, 400);
    }
    throw error;
  }
}

const defaultHandler = {
  async fetch(request: Request, env: Env & { OAUTH_PROVIDER: import("@cloudflare/workers-oauth-provider").OAuthHelpers }): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/authorize") return authorize(request, env);
    if (url.pathname === "/")
      return page("MCP contenu", "<h1>Site des 4 Sources</h1><p>Serveur MCP de modification des contenus. Adresse du connecteur : <code>/mcp</code>.</p>");
    return new Response("Introuvable.", { status: 404 });
  },
};

/** Le fournisseur OAuth dépend de l'adresse publique du Worker : on le construit à la première requête. */
const fournisseurs = new Map<string, OAuthProvider<Env>>();
function fournisseur(origine: string): OAuthProvider<Env> {
  let p = fournisseurs.get(origine);
  if (!p) {
    p = new OAuthProvider<Env>({
      apiRoute: "/mcp",
      apiHandler: mcpHandler as never,
      defaultHandler: defaultHandler as never,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
      resourceMetadata: { resource: `${origine}/mcp`, authorization_servers: [origine] },
      scopesSupported: ["contenu"],
    });
    fournisseurs.set(origine, p);
  }
  return p;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return fournisseur(new URL(request.url).origin).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
