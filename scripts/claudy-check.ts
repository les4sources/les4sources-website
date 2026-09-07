#!/usr/bin/env bun
/**
 * Vérifie le contrat Claudy (docs/CLAUDY.md) avec le MÊME schéma Zod que le build.
 *
 *  - toujours : la fixture (`CLAUDY_FIXTURE` ou src/data/claudy.fixture.json) ;
 *  - en plus, si `CLAUDY_PUBLIC_API_URL` est défini : les trois endpoints réels.
 *
 * Sort en code 1 si un schéma est violé. Une API non configurée n'est pas une
 * erreur : c'est l'état nominal tant que Claudy n'expose pas son API publique.
 */
import { readFileSync } from "node:fs";
import {
  fixtureSchema,
  eventsResponseSchema,
  experiencesResponseSchema,
  categoriesResponseSchema,
} from "../src/lib/claudy";

const FIXTURE = process.env.CLAUDY_FIXTURE ?? "src/data/claudy.fixture.json";
const API = process.env.CLAUDY_PUBLIC_API_URL;

let failed = false;

function report(label: string, result: { success: boolean; error?: { issues: unknown[] } }): void {
  if (result.success) {
    console.log(`✅ ${label} — conforme au contrat`);
    return;
  }
  failed = true;
  console.log(`❌ ${label} — non conforme :`);
  console.log(JSON.stringify(result.error?.issues, null, 2));
}

// 1. Fixture
try {
  const raw = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const parsed = fixtureSchema.safeParse(raw);
  report(`fixture ${FIXTURE}`, parsed);
  if (parsed.success) {
    const { events, experiences, event_categories } = parsed.data;
    console.log(
      `   ${events.length} événement(s), ${experiences.length} activité(s), ${event_categories.length} catégorie(s)`,
    );
    // Les slugs sont des URLs : ils doivent être uniques.
    for (const [label, slugs] of [
      ["événements", events.map((e) => e.slug)],
      ["activités", experiences.map((e) => e.slug)],
    ] as const) {
      const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
      if (dupes.length) {
        failed = true;
        console.log(`❌ slugs dupliqués côté ${label} : ${[...new Set(dupes)].join(", ")}`);
      }
    }
  }
} catch (error) {
  failed = true;
  console.log(`❌ fixture ${FIXTURE} illisible : ${(error as Error).message}`);
}

// 2. API réelle (facultative)
if (!API) {
  console.log("ℹ️  CLAUDY_PUBLIC_API_URL non défini — contrôle de l'API réelle ignoré.");
} else {
  const root = API.replace(/\/$/, "");
  const endpoints = [
    ["events", eventsResponseSchema],
    ["experiences", experiencesResponseSchema],
    ["event_categories", categoriesResponseSchema],
  ] as const;

  for (const [name, schema] of endpoints) {
    const url = `${root}/${name}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        failed = true;
        console.log(`❌ ${url} — HTTP ${res.status}`);
        continue;
      }
      report(url, schema.safeParse(await res.json()));
    } catch (error) {
      failed = true;
      console.log(`❌ ${url} — injoignable : ${(error as Error).message}`);
    }
  }
}

if (failed) {
  console.log("\nÉchec du contrôle du contrat Claudy.\n");
  process.exit(1);
}
console.log("\n✅ Contrat Claudy respecté.\n");
