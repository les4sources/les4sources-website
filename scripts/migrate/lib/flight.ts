/**
 * Parse the Next.js RSC "flight" payload that Super.so embeds in every page
 * (`self.__next_f.push([1,"…"])`). It contains the Notion block records of
 * the page (icon, cover, property values, schema) plus the site settings
 * (navbar / footer definitions).
 */
import type { CheerioAPI } from "cheerio";

export interface PropertySortEntry {
  property: string;
  name: string;
  type: string;
  visibility?: string;
}

export interface BlockRecord {
  id: string;
  type: string;
  parentId?: string;
  children?: string[];
  title?: unknown;
  icon?: string | null;
  cover?: string | null;
  uri?: string;
  description?: unknown;
  propertySort?: PropertySortEntry[];
  propertyValues?: Record<string, unknown>;
  blockId?: string;
  createdTime?: number;
  lastEditedTime?: number;
  collectionId?: string;
  views?: unknown[];
  [k: string]: unknown;
}

export interface FlightProps {
  pageId: string;
  records: { block: Record<string, BlockRecord | null>; [k: string]: unknown };
  settings?: Record<string, any>;
  [k: string]: unknown;
}

/** Concatenate every flight chunk of the document into one string. */
export function flightPayload($: CheerioAPI): string {
  let payload = "";
  for (const s of $("script").toArray()) {
    const text = $(s).html() ?? "";
    if (!text.includes("self.__next_f.push")) continue;
    for (const m of text.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
      try {
        payload += JSON.parse('"' + m[1] + '"');
      } catch {
        /* ignore malformed chunk */
      }
    }
  }
  return payload;
}

/** Extract the page props object (`{pageReplacement, pageId, records, settings…}`). */
export function parseFlightProps($: CheerioAPI): FlightProps | null {
  const payload = flightPayload($);
  const idx = payload.indexOf('{"pageReplacement"');
  if (idx < 0) return null;
  const lineStart = payload.lastIndexOf("\n", idx) + 1;
  const lineEnd = payload.indexOf("\n", idx);
  const line = payload.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
  const colon = line.indexOf(":");
  try {
    const arr = JSON.parse(line.slice(colon + 1));
    const props = Array.isArray(arr) ? arr[3] : arr;
    if (props && typeof props === "object" && props.records?.block) return props as FlightProps;
  } catch {
    /* fall through */
  }
  return null;
}

/** Notion rich-text array → plain text. Handles mentions/dates/links. */
export function richTextToPlain(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!Array.isArray(value)) {
    if (typeof value === "object" && "value" in (value as any)) return String((value as any).value);
    return "";
  }
  const parts: string[] = [];
  for (const seg of value) {
    if (typeof seg === "string") {
      parts.push(seg);
      continue;
    }
    if (seg && typeof seg === "object" && !Array.isArray(seg)) {
      if ("value" in (seg as any)) parts.push(String((seg as any).value));
      continue;
    }
    if (!Array.isArray(seg)) continue;
    const [text, decorations] = seg as [string, unknown[]?];
    if (text === "‣" && Array.isArray(decorations)) {
      // mention: [["d", {type:"date", start_date…}]] or [["u", userId]] or [["p", pageId]]
      let rendered = "";
      for (const d of decorations) {
        if (!Array.isArray(d)) continue;
        if (d[0] === "d" && d[1] && typeof d[1] === "object") rendered += formatDate(d[1] as Record<string, string>);
        else if (d[0] === "p") rendered += `[page:${d[1]}]`;
        else if (d[0] === "u") rendered += `[user:${d[1]}]`;
      }
      parts.push(rendered);
    } else {
      parts.push(String(text ?? ""));
    }
  }
  return parts.join("");
}

export function formatDate(d: Record<string, string>): string {
  let out = d.start_date ?? "";
  if (d.start_time) out += ` ${d.start_time}`;
  if (d.end_date || d.end_time) {
    out += " → " + (d.end_date ?? d.start_date ?? "");
    if (d.end_time) out += ` ${d.end_time}`;
  }
  return out;
}

/** Turn a Notion property value into raw display text, by type. */
export function propertyValueToText(type: string | undefined, value: unknown): string {
  if (value == null) return "";
  switch (type) {
    case "select":
    case "multi_select":
    case "status":
      if (Array.isArray(value)) return value.map((v: any) => (v && typeof v === "object" ? v.value : String(v))).join(", ");
      return richTextToPlain(value);
    case "checkbox":
      return value === true || value === "true" || value === "Yes" ? "true" : "false";
    case "date":
    case "created_time":
    case "last_edited_time":
      return richTextToPlain(value);
    default:
      return richTextToPlain(value);
  }
}

export interface ResolvedProperty {
  id: string;
  name: string;
  type: string;
  visibility?: string;
  text: string;
  raw: unknown;
}

/**
 * Resolve a record's propertyValues to named properties. `schema` is a global
 * propId → {name,type} map (built from every page's propertySort), used when
 * the record itself carries no propertySort (collection items on listings).
 */
export function resolveProperties(
  record: BlockRecord,
  schema: Map<string, PropertySortEntry>,
): ResolvedProperty[] {
  const values = record.propertyValues ?? {};
  const own = new Map<string, PropertySortEntry>();
  for (const p of record.propertySort ?? []) own.set(p.property, p);
  const order: string[] = [];
  for (const p of record.propertySort ?? []) order.push(p.property);
  for (const id of Object.keys(values)) if (!order.includes(id)) order.push(id);
  const out: ResolvedProperty[] = [];
  for (const id of order) {
    const def = own.get(id) ?? schema.get(id);
    const raw = values[id];
    if (raw == null) continue;
    const type = def?.type ?? guessType(raw);
    const text = propertyValueToText(type, raw).trim();
    if (!text) continue;
    out.push({ id, name: def?.name ?? id, type, visibility: def?.visibility, text, raw });
  }
  return out;
}

function guessType(raw: unknown): string {
  if (Array.isArray(raw) && raw.length && raw[0] && typeof raw[0] === "object" && !Array.isArray(raw[0]) && "value" in raw[0]) return "select";
  if (raw === "true" || raw === "false") return "checkbox";
  if (Array.isArray(raw) && Array.isArray(raw[0]) && raw[0][0] === "‣") return "date";
  return "text";
}
