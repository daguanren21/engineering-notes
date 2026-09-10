import { XMLParser } from "fast-xml-parser";
import type { ItemOrigin, SourceItem, SourceKind } from "./types.ts";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
});

type Node = Record<string, unknown>;

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(asText).join(" ");
  const record = value as Node;
  return asText(record["#text"] ?? record["__cdata"] ?? "");
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

const entities: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&hellip;": "…",
  "&mdash;": "—",
  "&ndash;": "–",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&ldquo;": "“",
  "&rdquo;": "”",
};

export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&[a-z]+;|&#\d+;/gi, (match) => entities[match] ?? match);
}

const blockClosers =
  /<\/(p|div|li|h[1-6]|blockquote|tr|td|th|dd|dt|pre|section|article|figure|figcaption|table|ul|ol)>/gi;

/**
 * Block boundaries become newlines; every other tag is removed outright. Inline
 * tags must not become whitespace, or `world</strong>.` extracts as `world .`
 * and the model sees punctuation detached from its sentence.
 */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(blockClosers, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toIsoDate(value: string): string | null {
  if (value.trim() === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function atomLink(entry: Node): string {
  const links = toArray(entry.link as Node | Node[] | undefined);
  const alternate = links.find((link) => !link["@_rel"] || link["@_rel"] === "alternate");
  const chosen = alternate ?? links[0];
  if (!chosen) return typeof entry.id === "string" ? entry.id : "";
  return String(chosen["@_href"] ?? asText(chosen));
}

function rssItemText(item: Node): string {
  const body = item["content:encoded"] ?? item.description ?? item.summary ?? "";
  return stripHtml(asText(body));
}

function atomEntryText(entry: Node): string {
  const body = entry.content ?? entry.summary ?? "";
  return stripHtml(asText(body));
}

/**
 * Parses RSS 2.0 and Atom into the one shape the rest of the pipeline uses.
 * Unknown or malformed entries are dropped rather than failing the whole feed.
 */
export function parseFeed(
  xml: string,
  options: {
    team: string;
    feedUrl: string;
    kind?: SourceKind;
    origin?: ItemOrigin;
    author?: string;
  },
): SourceItem[] {
  const { team, feedUrl, kind = "news", origin = "feed", author } = options;
  const document = parser.parse(xml) as Node;
  const rssChannel = (document.rss as Node | undefined)?.channel as Node | undefined;
  const atomFeed = document.feed as Node | undefined;

  const items: SourceItem[] = [];

  for (const item of toArray(rssChannel?.item as Node | Node[] | undefined)) {
    const link = asText(item.link) || asText(item.guid);
    const title = stripHtml(asText(item.title));
    if (!link || !title) continue;

    items.push({
      id: link,
      origin,
      kind,
      team,
      author: author ?? (stripHtml(asText(item["dc:creator"] ?? item.author)) || team),
      title,
      url: link,
      publishedAt:
        toIsoDate(asText(item.pubDate ?? item["dc:date"] ?? item.published)) ??
        new Date().toISOString().slice(0, 10),
      text: rssItemText(item),
    });
  }

  for (const entry of toArray(atomFeed?.entry as Node | Node[] | undefined)) {
    const link = atomLink(entry);
    const title = stripHtml(asText(entry.title));
    if (!link || !title) continue;

    items.push({
      id: link,
      origin,
      kind,
      team,
      author: author ?? (asText((entry.author as Node | undefined)?.name) || team),
      title,
      url: link,
      publishedAt:
        toIsoDate(asText(entry.published ?? entry.updated)) ??
        new Date().toISOString().slice(0, 10),
      text: atomEntryText(entry),
    });
  }

  if (items.length === 0) {
    const feedTitle = stripHtml(asText(rssChannel?.title ?? atomFeed?.title));
    throw new Error(`no entries parsed from ${feedUrl}${feedTitle ? ` (${feedTitle})` : ""}`);
  }

  return items;
}
