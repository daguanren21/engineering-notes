/**
 * Daily digest: collect upstream sources, pick the highest-signal unseen item,
 * and ask DeepSeek to write it up using the `knowledge` skill as the brief.
 *
 * Run locally with:  node scripts/ingest/run.ts --dry-run
 *
 * Environment:
 *   DEEPSEEK_API_KEY        required to author an article
 *   DEEPSEEK_MODEL          default `deepseek-chat`
 *   DEEPSEEK_BASE_URL       default `https://api.deepseek.com`
 *   X_BEARER_TOKEN          optional, enables the official X API layer
 *   DIGEST_BRIDGE_TEMPLATE  optional, e.g. `https://your-rsshub/twitter/user/{handle}`
 *   DIGEST_DRAFT            set to `true` to publish with draft: true
 */
import { appendFileSync } from "node:fs";
import { collectSources, loadSourceConfig, selectCandidates } from "./collect.ts";
import { loadState, saveState } from "./state.ts";
import { authorArticle, storeArticle } from "./write.ts";

interface Options {
  dryRun: boolean;
  limit: number | null;
  draft: boolean;
}

function parseOptions(argv: string[]): Options {
  const limitFlag = argv.find((arg) => arg.startsWith("--limit="));
  return {
    dryRun: argv.includes("--dry-run"),
    limit: limitFlag ? Number.parseInt(limitFlag.split("=")[1] ?? "", 10) : null,
    draft: argv.includes("--draft") || process.env.DIGEST_DRAFT === "true",
  };
}

function setOutput(name: string, value: string): void {
  const target = process.env.GITHUB_OUTPUT;
  if (target) appendFileSync(target, `${name}=${value}\n`);
}

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2));
  const config = await loadSourceConfig();
  const state = await loadState();
  const seen = new Set(state.seen);

  console.log("[digest] collecting sources...");
  const { items, diagnostics, layersUsed } = await collectSources(config);

  for (const diagnostic of diagnostics) console.warn(`[digest] warn: ${diagnostic}`);
  console.log(
    `[digest] layers: ${layersUsed.join(", ") || "none"} | fetched ${items.length} items | ` +
      `${state.seen.length} already seen`,
  );

  const candidates = selectCandidates(items, config, seen, new Date(), state.recentTeams);
  console.log(
    `[digest] ${candidates.length} candidate(s) after filtering` +
      (state.recentTeams.length > 0
        ? ` | recently covered: ${state.recentTeams.slice(0, 5).join(", ")}`
        : ""),
  );

  if (candidates.length === 0) {
    console.log("[digest] nothing new to write today");
    setOutput("created", "false");
    return 0;
  }

  if (options.dryRun) {
    const byKind = new Map<string, number>();
    const byTeam = new Map<string, number>();
    for (const item of items) {
      byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
      byTeam.set(item.team, (byTeam.get(item.team) ?? 0) + 1);
    }

    console.log("[digest] fetched by kind:");
    for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${kind.padEnd(10)} ${count}`);
    }
    console.log("[digest] fetched by team:");
    for (const [team, count] of [...byTeam].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${team.padEnd(20)} ${count}`);
    }

    console.log("[digest] top candidates in pick order:");
    for (const item of candidates.slice(0, 12)) {
      console.log(
        `  ${String(item.text.length).padStart(6)}c  ${item.kind.padEnd(9)} ${item.team.padEnd(18)} ` +
          `${item.publishedAt}  ${item.title.slice(0, 60)}`,
      );
      console.log(`          ${item.url}`);
    }
    console.log("[digest] dry run: no article written");
    setOutput("created", "false");
    return 0;
  }

  const limit = options.limit ?? config.selection.maxArticlesPerRun;
  let created = 0;
  const failures: string[] = [];

  for (const item of candidates.slice(0, limit)) {
    console.log(`[digest] writing from ${item.team}: ${item.title}`);
    try {
      const { article, attempts } = await authorArticle(item, {
        stopWords: config.selection.tagStopWords,
      });
      const stored = await storeArticle(article, item, { draft: options.draft });
      console.log(
        `[digest] wrote ${stored.file} (issue ${stored.issue}, ${article.body.length} chars, ${attempts} attempt(s))`,
      );
      state.seen.push(item.id);
      // Each team appears at most once, most recent first. Leaving a stale
      // duplicate behind would hand the team the best coverage rank on the next
      // run, and it would be picked again every day.
      state.recentTeams = [
        item.team,
        ...state.recentTeams.filter((team) => team !== item.team),
      ].slice(0, 30);
      created += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[digest] failed on ${item.url}: ${message}`);
      failures.push(`${item.url}: ${message}`);
      state.seen.push(item.id);
    }
  }

  await saveState(state);

  setOutput("created", created > 0 ? "true" : "false");

  if (created === 0 && failures.length > 0) {
    console.error("[digest] no article was written and every attempt failed");
    return 1;
  }

  console.log(`[digest] done: ${created} article(s) written`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`[digest] fatal: ${error instanceof Error ? error.stack : String(error)}`);
    process.exitCode = 1;
  });
