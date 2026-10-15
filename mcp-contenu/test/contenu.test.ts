import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cheminRelatif, champsSimples, entreeIndex, estModifiable, lireFrontmatter, valider } from "../src/contenu";

const RACINE = join(import.meta.dir, "../..");

function fichiers(dossier: string): string[] {
  return readdirSync(join(RACINE, dossier), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiers(`${dossier}/${e.name}`) : /\.mdx?$/.test(e.name) ? [`${dossier}/${e.name}`] : [],
  );
}

const textes = new Map(fichiers("src/content").map((c) => [c, readFileSync(join(RACINE, c), "utf8")]));
const index = [...textes].map(([c, t]) => entreeIndex(c, t));

describe("le contenu actuel du site", () => {
  test("la lecture légère de l'en-tête rend les mêmes valeurs que le parseur YAML", () => {
    for (const [chemin, texte] of textes) {
      const complet = lireFrontmatter(texte)!;
      const leger = champsSimples(texte);
      for (const cle of ["title", "description", "legacyPath", "seoTitle"])
        expect({ chemin, cle, v: leger[cle] }).toEqual({ chemin, cle, v: complet[cle] as never });
    }
  });

  test("chaque page existante passerait les contrôles d'une création", () => {
    // Défauts du contenu migré que le build accepte : ils ne bloquent pas une modification (seuls les défauts ajoutés bloquent).
    const tolere = [/carte-de-balades-vallee-du-bocq\.md : .*super\.so/, /(sejours__conditions|pages\/index)\.md : .*décrit ce qu'elle montre/, /pages\/index\.md : `legacyPath` : un chemin/];
    const refus = [...textes]
      .flatMap(([c, t]) => valider(c, t, null, index.filter((e) => e.chemin !== c)).erreurs.map((e) => `${c} : ${e}`))
      .filter((r) => !tolere.some((re) => re.test(r)));
    expect(refus).toEqual([]);
  });

  test("une modification n'est pas bloquée par un défaut déjà présent", () => {
    const c = "src/content/pages/carte-de-balades-vallee-du-bocq.md";
    const t = textes.get(c)!;
    expect(valider(c, `${t}\nUne phrase ajoutée.\n`, t, index).erreurs).toEqual([]);
  });

  test("les témoignages passent", () => {
    const t = readFileSync(join(RACINE, "src/data/temoignages.yaml"), "utf8");
    expect(valider("src/data/temoignages.yaml", t, t, index).erreurs).toEqual([]);
  });
});

const coworking = "src/content/pages/coworking.md";
const texteCoworking = () => textes.get(coworking)!;

describe("les garde-fous", () => {
  test("legacyPath d'une page existante ne change pas", () => {
    const t = texteCoworking().replace('legacyPath: "/coworking"', 'legacyPath: "/cowork"');
    expect(valider(coworking, t, texteCoworking(), index).erreurs.join()).toContain("ne change jamais");
  });

  test("une nouvelle page ne reprend pas une adresse prise", () => {
    const t = texteCoworking().replace("Coworking dans la Clairière", "Autre titre unique pour le test");
    expect(valider("src/content/pages/autre.md", t, null, index).erreurs.join()).toContain("déjà prise");
  });

  test("description trop courte, titre trop long, texte de remplissage", () => {
    const t = `---\ntitle: "${"Un titre beaucoup trop long pour tenir dans Google ".repeat(2)}"\ndescription: "Trop court"\nlegacyPath: "/test-mcp"\n---\n\nLorem ipsum.\n`;
    const e = valider("src/content/pages/test-mcp.md", t, null, index).erreurs.join("\n");
    expect(e).toContain("Titre trop long");
    expect(e).toContain("entre 50 et 160");
    expect(e).toContain("lorem ipsum");
  });

  test("une page en brouillon peut être incomplète côté SEO", () => {
    const t = `---\ntitle: "Brouillon"\ndescription: "Court"\nlegacyPath: "/brouillon-mcp"\ndraft: true\n---\n`;
    expect(valider("src/content/pages/brouillon-mcp.md", t, null, index).erreurs).toEqual([]);
  });

  test("image sans description ou hébergée ailleurs", () => {
    const base = `---\ntitle: "Page de test MCP"\ndescription: "Une description assez longue pour passer la règle des cinquante caractères."\nlegacyPath: "/test-images-mcp"\n---\n\n`;
    expect(valider("src/content/pages/t.md", base + "![](../../assets/x.jpg)\n", null, index).erreurs.join()).toContain("décrit ce qu'elle montre");
    expect(valider("src/content/pages/t.md", base + "![Four](https://exemple.org/x.jpg)\n", null, index).erreurs.join()).toContain("jamais d'une adresse web");
    expect(valider("src/content/pages/t.md", base + "![Four](../../assets/images/contenu/four.jpg)\n", null, index).erreurs).toEqual([]);
  });

  test("seuls les contenus sont modifiables", () => {
    expect(estModifiable("src/content/pages/coworking.md")).toBe(true);
    expect(estModifiable("src/content/hebergements/la-hulotte-gite-16-personnes/chambre-mlisse.md")).toBe(true);
    expect(estModifiable("src/pages/index.astro")).toBe(true);
    expect(estModifiable("src/data/temoignages.yaml")).toBe(true);
    for (const c of ["src/lib/site.ts", "package.json", ".github/workflows/ci.yml", "src/content/../lib/x.md", "src/content/pages/.cache.md", "src/pages/[...slug].astro"])
      expect(estModifiable(c)).toBe(false);
  });

  test("chemin relatif d'une image", () => {
    expect(cheminRelatif("src/content/pages/coworking.md", "src/assets/images/contenu/a.jpg")).toBe("../../assets/images/contenu/a.jpg");
    expect(cheminRelatif("src/content/hebergements/gite/chambre.md", "src/assets/images/contenu/a.jpg")).toBe("../../../assets/images/contenu/a.jpg");
  });
});
