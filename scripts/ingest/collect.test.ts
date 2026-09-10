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
    title: "A title",
    url: "https://example.com/post",
    publishedAt: "2026-09-09",
    text: "x".repeat(500),
    ...overrides,
  } as SourceItem;
}

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
    const pool = teams.map((team, index) =>
      item({
        kind: team === "Anthropic" ? "release" : "news",
        team,
        id: team,
        text: "x".repeat(2000 + index),
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
