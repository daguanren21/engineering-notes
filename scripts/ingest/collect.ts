import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { fetchArticleText } from "./enrich.ts";
import { parseFeed } from "./feed.ts";
import { fetchText, settleWithReport } from "./http.ts";
import { sourceKinds, type SourceConfig, type SourceItem } from "./types.ts";
import { fetchXAccount } from "./x.ts";

const SourceConfigSchema = z.object({
  xAccounts: z.array(z.object({ handle: z.string().min(1), team: z.string().min(1) })).default([]),
  feeds: z
    .array(
      z.object({
        url: z.url(),
        team: z.string().min(1),
        kind: z.enum(["news", "release", "community", "commits"]),
        author: z.string().min(1).optional(),
        enrich: z.boolean().optional(),
      }),
    )
    .default([]),
  selection: z.object({
    maxArticlesPerRun: z.number().int().positive().default(1),
    maxItemsPerSource: z.number().int().positive().default(10),
    minSourceChars: z.number().int().nonnegative().default(400),
    priorityTeams: z.array(z.string()).default([]),
    kindOrder: z
      .array(z.enum(["news", "release", "community", "commits"]))
      .default([...sourceKinds]),
    maxItemAgeDays: z.number().int().positive().default(30),
    enrichHeadlineFeeds: z.boolean().default(true),
    maxEnrichPerFeed: z.number().int().nonnegative().default(5),
    tagStopWords: z.array(z.string()).default([]),
  }),
});

const configPath = fileURLToPath(new URL("./sources.json", import.meta.url));

export async function loadSourceConfig(): Promise<SourceConfig> {
  const raw = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  delete raw.$comment;
  return SourceConfigSchema.parse(raw);
}

export interface CollectionResult {
  items: SourceItem[];
  diagnostics: string[];
  layersUsed: string[];
}

/**
 * Every credential is optional. The layers are additive: official feeds always
 * run, the X API runs when a bearer token is present, and an RSS bridge runs
 * when a template is configured. A layer that fails is reported, never fatal.
 */
export async function collectSources(
  config: SourceConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CollectionResult> {
  const diagnostics: string[] = [];
  const layersUsed: string[] = [];
  const collected: SourceItem[] = [];
  const { maxItemsPerSource } = config.selection;

  const feedResults = await Promise.all(
    config.feeds.map((feed) =>
      settleWithReport(
        `feed ${feed.url}`,
        async () => {
          const xml = await fetchText(feed.url);
          const items = parseFeed(xml, {
            team: feed.team,
            feedUrl: feed.url,
            kind: feed.kind,
            ...(feed.author ? { author: feed.author } : {}),
          });
          if (feed.enrich === false) return items;
          return enrichHeadlineItems(items, config.selection);
        },
        (message) => diagnostics.push(message),
      ),
    ),
  );

  if (config.feeds.length > 0) layersUsed.push("official-feeds");
  for (const result of feedResults) {
    if (result) collected.push(...result.slice(0, maxItemsPerSource));
  }

  const bearerToken = env.X_BEARER_TOKEN?.trim();
  if (bearerToken && config.xAccounts.length > 0) {
    layersUsed.push("x-api");
    const xResults = await Promise.all(
      config.xAccounts.map((account) =>
        settleWithReport(
          `x @${account.handle}`,
          () => fetchXAccount(account.handle, bearerToken, { team: account.team, maxItems: maxItemsPerSource }),
          (message) => diagnostics.push(message),
        ),
      ),
    );
    for (const result of xResults) {
      if (result) collected.push(...result);
    }
  }

  const bridgeTemplate = env.DIGEST_BRIDGE_TEMPLATE?.trim();
  if (bridgeTemplate && config.xAccounts.length > 0) {
    layersUsed.push("rss-bridge");
    const bridged = await Promise.all(
      config.xAccounts.map((account) =>
        settleWithReport(
          `bridge @${account.handle}`,
          async () => {
            const url = bridgeTemplate.replaceAll("{handle}", account.handle);
            const xml = await fetchText(url);
            return parseFeed(xml, { team: account.team, feedUrl: url, origin: "bridge" });
          },
          (message) => diagnostics.push(message),
        ),
      ),
    );
    for (const result of bridged) {
      if (result) collected.push(...result.slice(0, maxItemsPerSource));
    }
  }

  if (layersUsed.length === 0) {
    diagnostics.push("no source layer was available");
  }

  return { items: dedupe(collected), diagnostics, layersUsed };
}

/**
 * Fills in the body for feeds that ship headlines only, capped per feed and
 * limited to items recent enough to be candidates, so a feed with years of
 * history does not turn into hundreds of page fetches.
 */
async function enrichHeadlineItems(
  items: SourceItem[],
  selection: SourceConfig["selection"],
  now = new Date(),
): Promise<SourceItem[]> {
  const { enrichHeadlineFeeds, maxEnrichPerFeed, minSourceChars, maxItemAgeDays } = selection;
  if (!enrichHeadlineFeeds || maxEnrichPerFeed === 0) return items;

  const cutoff = new Date(now.getTime() - maxItemAgeDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const targets = items
    .filter((item) => item.text.length < minSourceChars && item.publishedAt >= cutoff)
    .slice(0, maxEnrichPerFeed);

  if (targets.length === 0) return items;

  const fetched = await Promise.all(
    targets.map(async (item) => [item.id, await fetchArticleText(item.url)] as const),
  );
  const bodies = new Map(fetched.filter(([, text]) => text !== null));

  return items.map((item) => {
    const body = bodies.get(item.id);
    return body && body.length > item.text.length ? { ...item, text: body } : item;
  });
}

function dedupe(items: SourceItem[]): SourceItem[] {
  const byUrl = new Map<string, SourceItem>();
  for (const item of items) {
    const key = item.url.replace(/[#?].*$/, "").replace(/\/$/, "");
    const existing = byUrl.get(key);
    if (!existing || item.text.length > existing.text.length) byUrl.set(key, item);
  }
  return [...byUrl.values()];
}

/**
 * Least-recently-covered scheduling, then kind, then team priority, then
 * recency.
 *
 * Coverage leads because kind-weighting alone starves whole teams: Anthropic
 * publishes no news feed at all, so with any kind penalty its release notes sit
 * permanently below every blog post ever written. Ranking teams by how long ago
 * they were covered guarantees each one its turn, while kind still orders what
 * a team offers — its article before its commit stream — and priority teams win
 * ties against the wider pool.
 */
export function selectCandidates(
  items: SourceItem[],
  config: SourceConfig,
  seen: ReadonlySet<string>,
  now = new Date(),
  recentTeams: readonly string[] = [],
): SourceItem[] {
  const { minSourceChars, maxItemAgeDays, priorityTeams, kindOrder } = config.selection;
  const cutoff = new Date(now.getTime() - maxItemAgeDays * 86_400_000).toISOString().slice(0, 10);
  const priority = new Map(priorityTeams.map((team, index) => [team, index]));
  const kindRank = new Map(kindOrder.map((kind, index) => [kind, index]));
  const teamSpan = priorityTeams.length + 1;
  // Larger than any possible kind/team score, so coverage always outranks them.
  const coverageSpan = (kindOrder.length + 1) * teamSpan;
  // Keeps the earliest index, so a repeated entry cannot make a team look
  // staler than it is and win again the next day.
  const covered = new Map<string, number>();
  recentTeams.forEach((team, index) => {
    if (!covered.has(team)) covered.set(team, index);
  });

  // Never covered ranks best; the longer ago a team ran, the better it ranks.
  const coverageRank = (team: string): number => {
    const index = covered.get(team);
    return index === undefined ? 0 : recentTeams.length - index;
  };

  const score = (item: SourceItem): number =>
    coverageRank(item.team) * coverageSpan +
    (kindRank.get(item.kind) ?? kindOrder.length) * teamSpan +
    (priority.get(item.team) ?? priorityTeams.length);

  return items
    .filter((item) => !seen.has(item.id))
    .filter((item) => item.text.length >= minSourceChars)
    .filter((item) => item.publishedAt >= cutoff)
    .sort((left, right) => {
      const difference = score(left) - score(right);
      return difference !== 0 ? difference : right.publishedAt.localeCompare(left.publishedAt);
    });
}
