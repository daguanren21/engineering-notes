import { stripHtml } from "./feed.ts";
import { fetchText } from "./http.ts";

const droppedRegions = [
  /<script[\s\S]*?<\/script>/gi,
  /<style[\s\S]*?<\/style>/gi,
  /<noscript[\s\S]*?<\/noscript>/gi,
  /<svg[\s\S]*?<\/svg>/gi,
  /<template[\s\S]*?<\/template>/gi,
  /<!--[\s\S]*?-->/g,
  /<(nav|header|footer|aside|form|figure|figcaption|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi,
];

/**
 * Pulls the readable body out of a page, preferring `<article>` then `<main>`
 * then the whole document. Returns null when nothing usable came back.
 */
export function extractMainText(html: string): string | null {
  let cleaned = html;
  for (const pattern of droppedRegions) cleaned = cleaned.replace(pattern, " ");

  const region =
    /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(cleaned)?.[1] ??
    /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(cleaned)?.[1] ??
    cleaned;

  const text = stripHtml(region);
  return text.length >= 200 ? text : null;
}

/**
 * Follows an entry to its page and returns the article body.
 *
 * Several sources ship headlines only — Hugging Face's feed has no description
 * at all, and the Google and DeepMind feeds carry one-sentence teasers — so the
 * feed text alone cannot support a written note. OpenAI and x.ai answer
 * scripted requests with 403 and are not recoverable this way.
 */
export async function fetchArticleText(
  url: string,
  options: { timeoutMs?: number; maxChars?: number } = {},
): Promise<string | null> {
  const { timeoutMs = 15_000, maxChars = 60_000 } = options;
  try {
    const html = await fetchText(url, { timeoutMs, attempts: 2 });
    const text = extractMainText(html);
    return text === null ? null : text.slice(0, maxChars);
  } catch {
    return null;
  }
}
