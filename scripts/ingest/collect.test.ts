/**
 * Covers the feed parser and the candidate ranking, which together decide what
 * the writer is ever shown.
 *
 *   node --test scripts/ingest/collect.test.ts
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { collectSources, selectCandidates } from "./collect.ts";
import { extractMainText } from "./enrich.ts";
import { parseFeed } from "./feed.ts";
import type { SourceConfig, SourceItem, SourceKind } from "./types.ts";

const rssFixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Example Feed</title>
    <item>
      <title>First &amp; Foremost</title>
      <link>https://example.com/a</link>
      <pubDate>Mon, 01 Sep 2026 10:00:00 GMT</pubDate>
      <dc:creator>Jane Doe</dc:creator>
      <description><![CDATA[<p>Hello <strong>world</strong>.</p><p>Second paragraph.</p>]]></description>
    </item>
    <item>
      <title>No link, so dropped</title>
      <description>nothing to link to</description>
    </item>
  </channel>
</rss>`;

const atomFixture = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Example</title>
  <entry>
    <title>Release 1.2.3</title>
    <link rel="alternate" href="https://example.com/releases/1.2.3"/>
    <updated>2026-09-09T12:00:00Z</updated>
    <author><name>some-bot</name></author>
    <content type="html">&lt;p&gt;Added things.&lt;/p&gt;</content>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("reads RSS 2.0, decodes entities and CDATA, and drops entries with no link", () => {
    const items = parseFeed(rssFixture, { team: "OpenAI", feedUrl: "https://example.com/rss" });

    assert.equal(items.length, 1);
    const item = items[0]!;
    assert.equal(item.title, "First & Foremost");
    assert.equal(item.author, "Jane Doe");
    assert.equal(item.publishedAt, "2026-09-01");
    assert.equal(item.kind, "news");
    assert.match(item.text, /Hello world\./);
    assert.match(item.text, /Second paragraph\./);
  });

  it("reads Atom and prefers the alternate link", () => {
    const items = parseFeed(atomFixture, {
      team: "Anthropic",
      feedUrl: "https://example.com/atom",
      kind: "release",
    });

    assert.equal(items.length, 1);
    assert.equal(items[0]!.url, "https://example.com/releases/1.2.3");
    assert.equal(items[0]!.kind, "release");
    assert.match(items[0]!.text, /Added things\./);
  });

  it("lets the config override the feed's own attribution", () => {
    const items = parseFeed(atomFixture, {
      team: "Anthropic",
      feedUrl: "https://example.com/atom",
      kind: "release",
      author: "Anthropic",
    });

    assert.equal(items[0]!.author, "Anthropic");
  });

  it("reports a feed that parses to nothing", () => {
    assert.throws(
      () => parseFeed("<html><body>not a feed</body></html>", {
        team: "x",
        feedUrl: "https://example.com/broken",
      }),
      /no entries parsed/,
    );
  });
});

describe("extractMainText", () => {
  const page = `<!doctype html><html><head><title>Post</title>
    <script>var tracking = "should not appear";</script>
    <style>.a { color: red }</style></head>
    <body>
      <nav>Home About Pricing</nav>
      <header>Site header</header>
      <article>
        <h1>A real post</h1>
        <p>The body paragraph explains the mechanism in detail, at enough length
        that the extractor treats it as an article rather than a stray fragment.</p>
        <p>A second paragraph continues the argument without interruption, and
        carries enough additional words to clear the minimum body threshold.</p>
      </article>
      <aside>Related links</aside>
      <footer>Copyright notice</footer>
      <script>analytics();</script>
    </body></html>`;

  it("keeps the article and drops chrome and scripts", () => {
    const text = extractMainText(page);

    assert.ok(text);
    assert.match(text, /The body paragraph explains the mechanism/);
    assert.match(text, /A second paragraph continues/);
    assert.doesNotMatch(text, /Home About Pricing/);
    assert.doesNotMatch(text, /Site header/);
    assert.doesNotMatch(text, /Related links/);
    assert.doesNotMatch(text, /tracking/);
    assert.doesNotMatch(text, /color: red/);
  });

  it("falls back to main, then the document", () => {
    assert.match(extractMainText("<main><p>" + "x".repeat(300) + "</p></main>")!, /^x+$/);
    assert.match(extractMainText("<body><p>" + "y".repeat(300) + "</p></body>")!, /^y+$/);
  });

  it("returns null rather than a fragment of nothing", () => {
    assert.equal(extractMainText("<html><body><p>Too short.</p></body></html>"), null);
  });
});

const config: SourceConfig = {
  xAccounts: [],
  feeds: [],
  selection: {
    maxArticlesPerRun: 1,
    maxItemsPerSource: 10,
    minSourceChars: 100,
    priorityTeams: ["Anthropic", "OpenAI"],
    kindOrder: ["news", "release", "community", "commits"],
    maxItemAgeDays: 30,
    enrichHeadlineFeeds: true,
    maxEnrichPerFeed: 5,
    tagStopWords: [],
  },
};

const now = new Date("2026-09-10T00:00:00Z");

function item(overrides: Partial<SourceItem> & { kind: SourceKind; team: string }): SourceItem {
  return {
    id: `https://example.com/${overrides.kind}/${overrides.team}/${overrides.publishedAt ?? "2026-09-09"}`,
    origin: "feed",
    author: "Someone",
    title: "Reliable tool execution in coding agents",
    url: "https://example.com/post",
    publishedAt: "2026-09-09",
    text: "A coding agent records each tool call before execution and stores its result in a checkpoint. " +
      "The execution loop resumes from that checkpoint after interruption instead of applying the same edit twice. " +
      "A sandbox limits filesystem access, and permission checks require approval before a tool can write outside the workspace. " +
      "Trajectory replay evaluates whether resumed runs preserve the same final state.",
    ...overrides,
  } as SourceItem;
}

describe("selectCandidates topic eligibility", () => {
  // Isolate relevance from the separate source-length contract below.
  const topicConfig = { ...config, selection: { ...config.selection, minSourceChars: 0 } };

  it("does not let unrelated uncovered teams displace a relevant covered team", () => {
    const relevant = item({ kind: "release", team: "Anthropic", id: "agent-release" });
    const unrelated = item({
      kind: "news",
      team: "OpenAI",
      id: "consumer-launch",
      title: "A new voice experience",
      text: "Our AI voice model offers natural conversations for everyone. " +
        "The consumer application is available in more countries with a redesigned subscription plan.",
    });

    assert.deepEqual(
      selectCandidates([unrelated, relevant], config, new Set(), now, ["Anthropic"])
        .map((candidate) => candidate.id),
      ["agent-release"],
    );
  });

  const unrelatedSources = [
    {
      title: "A more accurate AI weather forecast",
      text: "The forecast model predicts rainfall and hurricane paths from satellite observations. " +
        "Evaluation compares weather predictions against measurements across cloud regions.",
    },
    {
      title: "An expressive speech model",
      text: "The voice model supports more languages and emotional speech synthesis. " +
        "Evaluation measures audio quality and listener preferences, not software execution.",
    },
    {
      title: "Join our agentic AI launch event",
      text: "Meet the founders, hear our funding announcement, and see the new subscription plans. " +
        "Tickets include keynote sessions, sponsor booths, networking, and product demonstrations.",
    },
    {
      title: "A new cloud region for AI",
      text: "The cloud region adds capacity for LLM inference and reduces latency for local customers. " +
        "Permission checks and sandbox isolation protect hosted applications.",
    },
    {
      title: "Consumer AI comes to your phone",
      text: "The assistant app now includes photo filters, shopping recommendations, and a voice interface. " +
        "Customers can subscribe to an annual plan or try the free mobile experience.",
    },
    {
      title: "LLM inference engineering",
      text: "We compare evaluation results across context windows and improve batch throughput. " +
        "This model-serving article does not describe an autonomous software system.",
    },
  ];

  for (const source of unrelatedSources) {
    it(`rejects general news: ${source.title}`, () => {
      const candidate = item({ kind: "news", team: "OpenAI", ...source });
      assert.deepEqual(selectCandidates([candidate], topicConfig, new Set(), now), []);
    });
  }

  const ambiguousSources = [
    {
      title: "HTTP User-Agent compatibility",
      text: "The User-Agent header selects the browser compatibility profile. " +
        "The agent string is preserved in execution traces and regression tests run inside a sandbox.",
    },
    {
      title: "Monitoring agent checkpoints",
      text: "The monitoring agent collects CPU metrics and writes checkpoints before shutdown. " +
        "The agent uses permission checks to isolate its host access and resumes metric uploads on restart.",
    },
    {
      title: "Travel agents get a booking portal",
      text: "Travel agents process reservations through the new portal. Each agent can use the training " +
        "sandbox, while permission checks keep customer records visible only to the assigned office.",
    },
    {
      title: "Agentless monitoring with MCPatch",
      text: "Agentless instrumentation records execution traces and runs regression tests in a sandbox. " +
        "MCPatch is the patch filename, not a protocol for tool invocation.",
    },
    {
      title: "Clipped instrumentation description",
      text: "Execution traces and sandbox isolation protect our infrastructure. ".padEnd(595, " ") +
        "agentless monitoring records host activity without installing a daemon. ".repeat(12),
    },
    {
      title: "Reagents improve laboratory automation",
      text: "Reagents are tracked through execution traces and checkpoints. " +
        "Evaluation compares the chemical yield across laboratory batches.",
    },
    {
      title: "Source links: https://example.com/agents",
      text: "The service records execution traces and stores checkpoints in a sandbox. " +
        "Implementation notes are linked at https://example.com/agentic/mcp/tool-calls.",
    },
    {
      title: "New model-serving capacity",
      text: "Our inference cluster increases GPU availability and supports longer context windows. " +
        "Permission checks isolate the tenants and a sandbox protects each deployment. " +
        "This might also be useful for AI agents.",
    },
    {
      title: "Regional infrastructure update",
      text: "The region expands compute capacity and reduces network latency for hosted applications. ".repeat(10) +
        "In related news, AI agents use tool calls and sandbox isolation.",
    },
    {
      title: "The future of AI agents",
      text: "AI agents will transform every industry and improve the customer experience. " +
        "Visit our event to discover product plans and hear what executives expect next year.",
    },
  ];

  for (const source of ambiguousSources) {
    it(`rejects misleading signals: ${source.title}`, () => {
      const candidate = item({
        kind: "news",
        team: "Simon Willison",
        url: "https://example.com/agents/tool-calls",
        ...source,
      });
      assert.deepEqual(selectCandidates([candidate], topicConfig, new Set(), now), []);
    });
  }

  const relevantSources = [
    {
      title: "Making agents resumable",
      text: "The agent execution loop persists a checkpoint before dispatching tool calls. " +
        "After interruption, the runner replays tool results instead of repeating completed writes.",
    },
    {
      title: "Context management for coding agents",
      text: "A coding agent applies context compaction after retaining unresolved tool results. " +
        "Memory retrieval restores earlier decisions without expanding the context window indefinitely.",
    },
    {
      title: "Evaluating agentic workflows",
      text: "Agentic workflows are scored with trajectory replay rather than final text alone. " +
        "Evaluation checks whether each tool call obeyed the task constraints and returned a usable result.",
    },
    {
      title: "MCP server permission boundaries",
      text: "The MCP server validates tool calls before dispatch. Permission checks bind each request " +
        "to an approved workspace, and sandbox isolation prevents writes outside that directory.",
    },
    {
      title: "Containing coding agent tools",
      text: "The coding agent dispatches tool calls inside a sandbox. Files outside the workspace " +
        "are mounted read-only, so a generated shell command cannot overwrite the host configuration.",
    },
    {
      title: "智能体执行与工具调用",
      text: "智能体的执行循环先保存检查点，再发出工具调用。工具结果与任务状态一起持久化，" +
        "中断恢复时复用已完成的结果，避免重复修改文件。权限检查在实际执行之前完成，不能只依赖模型承诺。",
    },
    {
      title: "多智能体的上下文管理",
      text: "多智能体协作编排不能只转发完整聊天记录。上下文压缩保留当前任务的约束，" +
        "记忆检索恢复已经确认的决策，每次任务移交都附带可验证的执行结果。",
    },
    {
      title: "智能体评测中的失败定位",
      text: "智能体评测需要检查工具调用的中间结果。轨迹回放能区分规划错误与工具执行错误，" +
        "回归测试验证恢复后的最终状态，而不是只判断模型是否给出了一段自然语言总结。",
    },
    {
      title: "v2.1.20",
      kind: "release" as const,
      text: "Fixed Claude Code tool calls losing their results during context compaction. " +
        "Permission checks now run before sandbox execution when restoring a session checkpoint.",
    },
    {
      title: "0.42.0",
      kind: "release" as const,
      text: "Codex now restores session state before resuming the execution loop. " +
        "Tool calls keep their original approval gates after a checkpoint is loaded.",
    },
    {
      title: "v0.9.0",
      kind: "release" as const,
      text: "Fixed MCP client tool results being lost during handoffs between agents. " +
        "Regression tests cover interrupted runs, and permission checks apply to resumed tool calls.",
    },
    {
      title: "User-Agent headers in a coding agent browser tool",
      text: "The coding agent sets the User-Agent header during browser tool calls. " +
        "Sandbox isolation and permission checks still restrict which sites the tool can access.",
    },
  ];

  for (const source of relevantSources) {
    it(`keeps engineering content: ${source.title}`, () => {
      const candidate = item({ kind: "news", team: "Independent", ...source });
      assert.deepEqual(
        selectCandidates([candidate], topicConfig, new Set(), now).map((entry) => entry.id),
        [candidate.id],
      );
    });
  }

  it("returns no candidates when every source is off-topic", () => {
    const candidates = unrelatedSources.map((source, index) =>
      item({ kind: "news", team: `Uncovered ${index}`, id: `unrelated-${index}`, ...source }),
    );
    assert.deepEqual(selectCandidates(candidates, topicConfig, new Set(), now, ["Anthropic"]), []);
  });
});

describe("selectCandidates", () => {
  it("ranks a written article above a raw commit stream", () => {
    const candidates = selectCandidates(
      [
        item({ kind: "commits", team: "Anthropic", publishedAt: "2026-09-10" }),
        item({ kind: "news", team: "Hugging Face", publishedAt: "2026-09-01" }),
      ],
      config,
      new Set(),
      now,
    );

    assert.equal(candidates[0]!.kind, "news");
  });

  it("prefers an uncovered team over one already covered, even at a worse kind", () => {
    const candidates = selectCandidates(
      [
        item({ kind: "news", team: "Hugging Face", id: "blog" }),
        item({ kind: "release", team: "Anthropic", id: "claude-release" }),
      ],
      config,
      new Set(),
      now,
      ["Hugging Face"],
    );

    assert.equal(candidates[0]!.id, "claude-release");
  });

  it("ranks release notes above community posts", () => {
    const candidates = selectCandidates(
      [
        item({ kind: "community", team: "OpenAI" }),
        item({ kind: "release", team: "OpenAI" }),
      ],
      config,
      new Set(),
      now,
    );

    assert.deepEqual(
      candidates.map((candidate) => candidate.kind),
      ["release", "community"],
    );
  });

  it("breaks ties inside a kind by priority team", () => {
    const candidates = selectCandidates(
      [
        item({ kind: "news", team: "Hugging Face", publishedAt: "2026-09-10" }),
        item({ kind: "news", team: "OpenAI", publishedAt: "2026-09-02" }),
      ],
      config,
      new Set(),
      now,
    );

    assert.equal(candidates[0]!.team, "OpenAI");
  });

  it("breaks ties inside a team by recency", () => {
    const candidates = selectCandidates(
      [
        item({ kind: "news", team: "OpenAI", publishedAt: "2026-09-02", id: "a" }),
        item({ kind: "news", team: "OpenAI", publishedAt: "2026-09-09", id: "b" }),
      ],
      config,
      new Set(),
      now,
    );

    assert.equal(candidates[0]!.publishedAt, "2026-09-09");
  });

  it("rotates coverage away from the team picked most recently", () => {
    const pool = [
      item({ kind: "news", team: "OpenAI", publishedAt: "2026-09-09", id: "openai" }),
      item({ kind: "news", team: "Anthropic", publishedAt: "2026-09-02", id: "anthropic" }),
    ];

    // Both are news, Anthropic is the higher-priority team, so with no history
    // Anthropic leads. Having just covered Anthropic, OpenAI takes over.
    assert.equal(selectCandidates(pool, config, new Set(), now)[0]!.team, "Anthropic");
    assert.equal(selectCandidates(pool, config, new Set(), now, ["Anthropic"])[0]!.team, "OpenAI");
  });

  it("keeps rotating when the history contains a repeated team", () => {
    const pool = [
      item({ kind: "news", team: "Cursor", id: "cursor" }),
      item({ kind: "news", team: "OpenAI", id: "openai" }),
      item({ kind: "news", team: "Anthropic", id: "anthropic" }),
    ];

    // Cursor was covered most recently but also appears again further down.
    // Reading the later entry as authoritative would make Cursor look stalest
    // and it would win again; the earliest entry must decide.
    const ranked = selectCandidates(pool, config, new Set(), now, [
      "Cursor",
      "Anthropic",
      "Cursor",
    ]);

    assert.notEqual(ranked[0]!.team, "Cursor");
    assert.equal(ranked[0]!.team, "OpenAI");
  });

  it("returns to the longest-idle team first once every team has run", () => {
    const pool = [
      item({ kind: "news", team: "Anthropic", id: "anthropic" }),
      item({ kind: "news", team: "OpenAI", id: "openai" }),
    ];
    // OpenAI ran most recently, so Anthropic — idle longest — comes back first.
    const candidates = selectCandidates(pool, config, new Set(), now, ["OpenAI", "Anthropic"]);

    assert.equal(candidates[0]!.team, "Anthropic");
  });

  it("lets kind decide between teams that are equally uncovered", () => {
    const candidates = selectCandidates(
      [
        item({ kind: "commits", team: "Anthropic", id: "commit" }),
        item({ kind: "news", team: "Hugging Face", id: "news" }),
      ],
      config,
      new Set(),
      now,
      ["OpenAI"],
    );

    assert.equal(candidates[0]!.id, "news");
  });

  it("reaches every team in the pool within one rotation", () => {
    const teams = ["Anthropic", "OpenAI", "xAI", "Cursor", "Google DeepMind", "Meta Engineering"];
    const pool = teams.map((team) =>
      item({
        kind: team === "Anthropic" ? "release" : "news",
        team,
        id: team,
      }),
    );

    const seen = new Set<string>();
    const covered: string[] = [];

    for (let day = 0; day < teams.length; day += 1) {
      const pick = selectCandidates(pool, config, seen, now, covered)[0];
      assert.ok(pick, `rotation stalled on day ${day + 1}`);
      // Mirrors run.ts: each team once, most recent first.
      covered.splice(0, covered.length, pick.team, ...covered.filter((t) => t !== pick.team));
      seen.add(pick.id);
    }

    assert.deepEqual([...covered].sort(), [...teams].sort());
  });

  it("drops seen items, thin sources, and anything past the age limit", () => {
    const stale = item({ kind: "news", team: "OpenAI", publishedAt: "2026-01-01", id: "stale" });
    const thin = item({ kind: "news", team: "OpenAI", id: "thin", text: "too short" });
    const seen = item({ kind: "news", team: "OpenAI", id: "seen" });
    const fresh = item({ kind: "news", team: "OpenAI", id: "fresh" });

    const candidates = selectCandidates([stale, thin, seen, fresh], config, new Set(["seen"]), now);

    assert.deepEqual(
      candidates.map((candidate) => candidate.id),
      ["fresh"],
    );
  });
});

const chromePage = `<!doctype html><html><body>
  <nav>Notifications You must be signed in to change notification settings</nav>
  <div>Fork 191 Star 572 File tree Expand file tree</div>
  <p>${"scaffolding text that is not the article. ".repeat(12)}</p>
</body></html>`;

const shortFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>t</title>
  <item><title>An entry</title><link>https://example.com/entry</link>
  <pubDate>${new Date().toUTCString()}</pubDate><description>short teaser</description></item>
</channel></rss>`;

function stubCollectFetch(): { articleFetches: () => number } {
  let articleFetches = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/feed")) {
      return new Response(shortFeed, { status: 200 });
    }
    articleFetches += 1;
    return new Response(chromePage, { status: 200 });
  }) as typeof fetch;
  return { articleFetches: () => articleFetches };
}

describe("collectSources enrichment", () => {
  const originalFetch = globalThis.fetch;
  after(() => {
    globalThis.fetch = originalFetch;
  });

  const base = {
    ...config,
    feeds: [],
  };

  it("completes a teaser from the page when enrichment is on", async () => {
    stubCollectFetch();
    const { items } = await collectSources({
      ...base,
      feeds: [{ url: "https://example.com/feed.xml", team: "OpenAI", kind: "news" }],
    });

    assert.match(items[0]!.text, /scaffolding text/);
  });

  it("does not fetch, and keeps the teaser, when enrichment is off", async () => {
    const stub = stubCollectFetch();
    const { items } = await collectSources({
      ...base,
      feeds: [
        { url: "https://example.com/feed.xml", team: "OpenAI", kind: "news", enrich: false },
      ],
    });

    assert.equal(stub.articleFetches(), 0);
    assert.equal(items[0]!.text, "short teaser");
  });
});
