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

// These are topic signals, not a semantic verdict. The writer must still reject
// sources whose actual subject is not AI Agent engineering.
const genericAgentContext = /\b(?:agents?|subagents?)\b/iu;
const explicitAgentContext =
  /\b(?:(?:ai|llm|coding|code)[ -]agents?|agentic|mcp|model context protocol|claude code|codex)\b|智能体|编码代理|编程代理/iu;
const nonLlmAgentContext =
  /\b(?:user|monitoring|telemetry|observability|travel|booking|insurance|real[ -]estate)[ -]agents?\b/iu;
const engineeringMechanisms = [
  /\b(?:tool[ -](?:calls?|calling|use|results?|execution)|function[ -]call(?:s|ing)?|mcp[ -](?:servers?|clients?|tools?|transport))\b|工具调用|工具执行|工具结果|函数调用/iu,
  /\b(?:agent[ -](?:loops?|execution|runs?)|execution[ -](?:loops?|traces?)|orchestrat(?:ion|ing)|handoffs?|subagents?|checkpoints?|task[ -](?:planning|decomposition))\b|执行循环|执行轨迹|任务分解|任务规划|多智能体|协作编排|检查点/iu,
  /\b(?:context[ -](?:windows?|management|compaction|compression|engineering)|memory[ -](?:retrieval|management|persistence)|session[ -](?:memory|state)|prompt[ -](?:caching|injection))\b|上下文(?:窗口|管理|压缩|工程)|记忆(?:检索|管理|持久化)|会话状态|提示词缓存|提示注入/iu,
  /\b(?:evals?|evaluations?|trajectory[ -](?:replay|scoring)|regression[ -](?:tests?|testing)|failure[ -]recovery|retry[ -](?:budgets?|polic(?:y|ies)))\b|评测|轨迹回放|回归测试|故障恢复|重试预算/iu,
  /\b(?:sandbox(?:es|ing)?|permission[ -](?:checks?|boundaries|prompts?|polic(?:y|ies))|approval[ -](?:gates?|flows?)|least[ -]privilege)\b|沙箱|权限(?:检查|边界|控制)|人工审批|最小权限/iu,
];

function topicText(text: string): string {
  return text.replace(/(?:https?:\/\/|www\.)\S+/giu, " ");
}

function isAgentEngineering(item: SourceItem): boolean {
  const title = topicText(item.title);
  const body = topicText(item.text);
  // A title or early body must establish the subject. A passing mention near the
  // end cannot qualify an otherwise unrelated article. Body focus also permits
  // release feeds whose titles contain only a version number.
  const leadEnd = Math.min(600, Math.floor(body.length / 2));
  let lead = body.slice(0, leadEnd);
  // Do not turn a clipped word such as "agentless" into the signal "agent".
  if (/\w/u.test(body.charAt(leadEnd))) lead = lead.replace(/\w+$/u, "");

  if (!explicitAgentContext.test(title) && !explicitAgentContext.test(lead)) {
    // Generic "agent" also names HTTP headers, daemons, and human intermediaries.
    if (nonLlmAgentContext.test(title) || nonLlmAgentContext.test(lead)) return false;
    if (!genericAgentContext.test(title) && !genericAgentContext.test(lead)) return false;
  }

  // Require complementary, concrete mechanisms in the source body, never just
  // a brand, generic AI/LLM vocabulary, source attribution, or a link target.
  let mechanisms = 0;
  for (const signal of engineeringMechanisms) {
    if (signal.test(body) && ++mechanisms >= 2) return true;
  }
  return false;
}

/**
 * Topic eligibility comes before scheduling. Among eligible sources, rank by
 * least-recently-covered team, then kind, team priority, and recency. Rotation
 * cannot rescue an off-topic source or require an article when none qualifies.
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
    .filter(isAgentEngineering)
    .sort((left, right) => {
      const difference = score(left) - score(right);
      return difference !== 0 ? difference : right.publishedAt.localeCompare(left.publishedAt);
    });
}
