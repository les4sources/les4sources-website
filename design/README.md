# Les 4 Sources — Design System (source Claude Design)

> Copie de référence du projet Claude Design `https://claude.ai/design/p/55320553-180f-4ea4-a0a5-711ad34a55fb`, importée le 2026-09-07 via DesignSync. Ce dossier n'est pas servi par le site : il documente la source de vérité visuelle que `src/styles/tokens.css` et les composants Astro implémentent. Les fichiers React (`.jsx`) sont des références de comportement et de style, pas du code exécuté.

**Les 4 Sources** is a *tiers-lieu* (third place) in Yvoir, Belgium — a 15-hectare clearing between Namur and Dinant, in a Natura 2000 area surrounded by 200 ha of forest. It hosts lodging (2 gîtes, bivouac), room rentals (large hall, small hall, professional kitchen), a self-service hikers' bar, workshops and events (Pizza Parties, Camembert Parties, welding, tree pruning, disc-golf…), and a collective of 5 households plus resident projects (Semisto, De Branches en Planches, Tranches de Vie).

Tagline: *Lieu d'activités, de nature et de vie collective.* "Un lieu où vivre des expériences innovantes et inspirantes en famille, entre ami·e·s ou entre collègues."

## The 4 pôles and the 7 pictogram families

| Family | Pictogram | Colour | Used for |
|---|---|---|---|
| Convivialité (pôle Socioculturel) | yellow sunburst — `pole-convivialite` | `#EAC20B` | Pizza & Camembert Parties, monthly convivial events |
| Accueil / Hébergement | red house — `pole-hebergement` | `#e35543` | gîtes, salles, bivouac |
| Nature | green tree — `pole-nature` | `#00A96D` | all nature activities |
| Artisanat | beige pot — `pole-artisanat` | `#ddbfa1` | artisanat, low-tech |
| Vie collective | orange circle of circles — `pole-vie-collective` | `#FF8A5A` | the collective's life |
| Ressourcement | blue stacked stones — `pole-ressourcement` | `#72A1FF` | retreats, rest |
| Production / Micro-ferme | green hourglass — `pole-production` | `#acc037` | micro-ferme |

Files in `assets/icons/poles/`: `pole-<family>-current.svg` (`currentColor`, recolourable when inlined — the only variant kept in this repo; coloured and white versions are obtained by setting `color`).

Brand core: dark teal `#224246` + white `#FFFFFF`.

## CONTENT FUNDAMENTALS

- **Language:** French (Belgium). Inclusive writing with median points: *ami·e·s, marcheur·euse·s, informé·e, donatrices et donateurs*.
- **Address:** informal **tu** to the visitor ("Arrête-toi en terrasse", "inscris-toi à notre newsletter"). **Nous** for the collective.
- **Tone:** warm, direct, playful, hospitable. Short imperative invitations. Exclamation marks are welcome. Typographic French spacing before `!` `?` `:`.
- **Casing:** sentence case for headings and body. ALL CAPS reserved for Be Vietnam Pro secondary text (labels, emails, overlines).
- **Numerals:** "4" always as a digit in the name. Prices in "3,5 €" format.
- **Emoji:** one emoji at the end of section titles ("Prochainement aux 4 Sources ⛅", "Nos projets 🎴") and at the start of event names / footer links ("🍕 Pizza Party", "⚡ COMPLET !"). Never in buttons or body sentences.
- **Event naming:** `[emoji] [Title]` + category tag (Artisanat, Liens et convivialité, Ressourcement, Formation) + date in French lowercase ("samedi 12 septembre"). Sold-out state: "COMPLET !" prefixed in caps.
- **Lists:** ✔️ checkmarks for offer lists; bold link as list item.
- **CTA style:** verb-first, short, lowercase after first letter: "Nous soutenir", "Toutes nos locations".

## VISUAL FOUNDATIONS

**Colour.** One dominant dark teal `#224246` on white; the pôle colours are used *one at a time* as large flat fields, never as gradients. Yellow `#EAC20B` doubles as the "highlighter" colour: marker underlines behind titles and key words. Sand `#ddbfa1` is a warm paper background. No gradients anywhere.

**Type.** Averia Serif Libre is the *primary* face — headings **and** running text. Bold for titles, Regular for body. Be Vietnam Pro is *secondary*: uppercase or short functional content only (contact details, hours, subtitles, price columns, labels, buttons). Headline sizes are large and tight (line-height ≈1.05–1.15). Titles frequently break onto 3–5 short lines.

**Imagery.** Real photography, warm and daylight-lit. Never stock-looking. Illustration is limited to pictograms.

**Signature motifs.**
1. *Organic colour blob edge*: a flat pôle-colour panel on the left third of an image whose right edge is a soft scalloped/blob curve (event covers). Also a white "cloud" speech-bubble over the hero photo (home hero) and a teal wave footer.
2. *Sunburst*: the yellow convivialité pictogram used large.
3. *Marker highlight*: thick yellow underline / slab behind text, slightly offset.
4. *Pôle pictograms* row: the 7 family pictograms used as a colourful strip.
5. *Sticker labels*: small solid rectangles (teal, red, yellow) with white Be Vietnam Bold text, sometimes slightly rotated.

**Shape & radius.** Photos rounded 16px (`--radius-photo`). Sticker labels 4–6px. Buttons/badges pill. The arch (`--radius-arch`) is an acceptable image mask for feature photos.

**Borders & shadows.** 1.5px teal-tinted lines (`--border-default`) and very soft teal shadows (`--shadow-md`) only for floating elements. Cards are flat white on sand/surface backgrounds or borderless photo cards with text below.

**Layout.** Generous whitespace. Website: single column, max 1180px, alternating text/image sections, large section titles with emoji.

**Motion.** Quiet: 120–200ms ease-out fades/colour shifts; no bounces. Hover = colour shift to `--accent-hover` + yellow underline on links; press = `--accent-active`, no shrink. Focus = 3px teal ring at 25%.

**Transparency/blur.** Not used. Text over photos sits on a solid colour panel, never on a gradient or blur.

**Dark surfaces.** Teal `#224246` is the only dark surface (footer, sticker labels, hero blocks); text on it is white; pictograms on teal are white. There is no dark theme.

## ICONOGRAPHY

- Brand pictograms (7 families). Emoji are the de-facto icon set on the website. UI icons: Lucide (1.5–2px stroke) in teal, few. ✔️ as list bullets; "·" median point; "→" acceptable in links.

## Components (reference `.jsx` in `components/`)

Button (primary / secondary / ghost / highlight / pole; sm md lg; pill), Badge (neutral, teal, success, warning, danger, highlight; uppercase overline), Tag (selectable pill filter), PoleTag (category tag tinted by pôle, optional picto), Highlight (marker slab), Tabs (yellow underline), Card (white / paper / subtle / teal; optional photo; hover lift), EventCard (Card + PoleTag + "Complet !" badge + h4 title + date), BlobPanel (photo + scalloped pôle panel with title).

## Website UI kit (reference `.jsx` in `ui_kits/`)

Nav (sticky, 72px, mark + "Les 4 Sources" wordmark, pill links, yellow "Le bar 🧉" button), Footer (teal, logo white, 7 white pictos strip, 4 columns, address block, licence line), Home (hero photo + white cloud panel with mark, uppercase H1 "LES 4 SOURCES", subtitle; three "Lieu de…" columns; newsletter card; "Prochainement aux 4 Sources ⛅" event grid on subtle surface; "Hébergements, salles polyvalentes et cuisine professionnelle 🏡" split; "La Guinguette des 4 Sources 🍹" on paper; "Nos projets 🎴" cards; teal band "Randonneur ou cycliste de passage ? 🚵🏻" with Highlight; "Nos activités pour groupes 👥"), Agenda (H1 "L'agenda des 4 Sources 🗓️", Tabs À venir / Passés / Chaque semaine, Tag filters, 3-col EventCard grid), Séjours (PoleTag accueil, H1 "Séjours aux 4 Sources 🏡", sticky sidebar summary, sections with 2-col Cards), Bar (Highlight H1 "Au bar des 4 Sources", price rows with dotted leaders in Be Vietnam Bold, bio marker, rotated yellow QR card).
