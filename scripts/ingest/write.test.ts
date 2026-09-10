/**
 * Covers the authoring path without a live model: `fetch` is stubbed, so the
 * real review, retry, composition, and file-writing code all run.
 *
 *   node --test scripts/ingest/write.test.ts
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import matter from "gray-matter";
import { ArticleFrontmatterSchema } from "../../src/content/schema.ts";
import { slugify } from "../../src/content/slug.ts";
import type { SourceItem } from "./types.ts";
import { authorArticle, extractJson, storeArticle } from "./write.ts";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

const item: SourceItem = {
  id: "https://example.com/harness-post",
  origin: "feed",
  kind: "news",
  team: "OpenAI",
  author: "Example Author",
  title: "A Harness Post",
  url: "https://example.com/harness-post",
  publishedAt: "2026-09-01",
  text: "The source body, long enough to be plausible.",
};

const goodBody = [
  "```flow",
  "title: 循环放在哪一层",
  "layer: 调用方 | 重放整个任务",
  "layer: Harness | *记录中断点* | 从断点续跑",
  "```",
  "",
  "## 循环的所有权决定恢复策略",
  "",
  "把循环放在 Harness 里，中断点才有地方可记。放在调用方，恢复就只能靠重放，",
  "而重放会把已经完成的副作用再做一遍。所有权不是一个风格问题，它直接决定",
  "中断之后还能不能接着走。",
  "",
  "## 停止条件必须是可观测的状态",
  "",
  "预算、时限和显式失败要写进状态，而不是靠模型自己判断该不该停。可观测的",
  "停止条件意味着外部可以在不读模型输出的时候判断这次运行是否已经结束。",
  "",
  "## 上下文交接要显式，不要靠约定",
  "",
  "子任务的输入前缀越稳定，缓存命中率越高，恢复成本越低。把交接内容写成",
  "结构化的字段，而不是一段自然语言，接手的一方才不需要重新推断意图。",
  "",
  "## 把证据留在系统里",
  "",
  "每次失败的输入、环境快照和判定结果都应该落盘，否则下一次调试仍然从零开始。",
].join("\n");

const goodArticle = {
  title: "Harness 循环的所有权与恢复",
  titleParts: ["Harness 循环的", "所有权与恢复"],
  description: "循环放在哪一层，决定了中断之后能恢复什么。",
  tags: ["Agent Harness", "系统设计", "状态恢复"],
  body: goodBody,
};

let scratch: string;

function stubCompletion(payloads: unknown[]): { calls: number } {
  const state = { calls: 0 };
  globalThis.fetch = (async () => {
    const payload = payloads[Math.min(state.calls, payloads.length - 1)];
    state.calls += 1;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return state;
}

before(async () => {
  scratch = await mkdtemp(join(tmpdir(), "digest-test-"));
  process.env.DIGEST_ARTICLE_DIR = scratch;
  process.env.DIGEST_API_KEY = "test-key";
});

after(async () => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  await rm(scratch, { recursive: true, force: true });
});

describe("extractJson", () => {
  function titled(value: unknown): string {
    if (value && typeof value === "object" && "title" in value && typeof value.title === "string") {
      return value.title;
    }
    throw new Error("extracted value had no title");
  }

  it("reads a raw object and a fenced one", () => {
    const raw = JSON.stringify(goodArticle);
    assert.equal(titled(extractJson(raw)), goodArticle.title);

    const fenced = "```json\n" + JSON.stringify(goodArticle, null, 2) + "\n```";
    assert.equal(titled(extractJson(fenced)), goodArticle.title);
  });

  it("skips a leading brace that is not a JSON object", () => {
    const wrapped = "note: {not json}\n" + JSON.stringify(goodArticle);
    assert.equal(titled(extractJson(wrapped)), goodArticle.title);
  });

  it("still finds the object when a flow fence appears first", () => {
    const nested =
      "```flow\nlayer: A | one\nlayer: B | two\n```\n" + JSON.stringify(goodArticle);
    assert.equal(titled(extractJson(nested)), goodArticle.title);
  });

  it("throws when the content has no JSON object", () => {
    assert.throws(() => extractJson("note: {not json}"), /no JSON object/);
  });
});

describe("authorArticle", () => {
  it("accepts a compliant response on the first attempt", async () => {
    const stub = stubCompletion([goodArticle]);
    const result = await authorArticle(item, { stopWords: ["AI"] });

    assert.equal(result.attempts, 1);
    assert.equal(result.article.title, goodArticle.title);
    assert.equal(stub.calls, 1);
  });

  it("parses a response whose body contains braces and a fence", async () => {
    // The body carries a ```flow block and a code sample with braces, both of
    // which broke the previous fence-stripping approach.
    const withBraces = {
      ...goodArticle,
      body: `${goodArticle.body}\n\n\`\`\`ts\nconst config = { retries: 3 };\n\`\`\`\n`,
    };
    stubCompletion([withBraces]);

    const result = await authorArticle(item, { stopWords: ["AI"] });

    assert.equal(result.attempts, 1);
    assert.match(result.article.body, /retries: 3/);
  });

  it("retries once when the first response breaks the contract", async () => {
    const broken = { ...goodArticle, titleParts: ["拼不回去的", "标题"] };
    const stub = stubCompletion([broken, goodArticle]);
    const result = await authorArticle(item, { stopWords: ["AI"] });

    assert.equal(result.attempts, 2);
    assert.equal(stub.calls, 2);
  });

  it("fails loudly when the contract is broken twice", async () => {
    const broken = { ...goodArticle, tags: ["AI"] };
    stubCompletion([broken, broken]);

    await assert.rejects(
      () => authorArticle(item, { stopWords: ["AI"] }),
      /failed review twice/,
    );
  });

  it("falls back to the default model when the env var is an empty string", async () => {
    // A workflow variable that is not configured arrives as "", and `??` does
    // not fall back on "". This shipped as a bug once; every real run would
    // have posted an empty model name.
    const previous = { ...process.env };
    process.env.DIGEST_API_KEY = "test-key";
    process.env.DEEPSEEK_MODEL = "";

    let sentModel: unknown;
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      sentModel = (JSON.parse(String(init?.body)) as { model?: unknown }).model;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(goodArticle) } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      await authorArticle(item, { stopWords: ["AI"] });
      assert.equal(sentModel, "deepseek-chat");
    } finally {
      process.env = previous;
    }
  });

  it("rejects an article with no diagram", async () => {
    const textOnly = {
      ...goodArticle,
      body: goodArticle.body.replace(/```flow[\s\S]*?```\n\n/, ""),
    };
    stubCompletion([textOnly, textOnly]);

    await assert.rejects(
      () => authorArticle(item, { stopWords: ["AI"] }),
      /至少要有 1 个 ```flow 图/,
    );
  });

  it("rejects a malformed diagram and asks for a repair", async () => {
    const broken = {
      ...goodArticle,
      body: goodArticle.body.replace(
        "layer: Harness | *记录中断点* | 从断点续跑",
        "架构层：记录中断点",
      ),
    };
    const stub = stubCompletion([broken, goodArticle]);
    const result = await authorArticle(item, { stopWords: ["AI"] });

    assert.equal(result.attempts, 2);
    assert.equal(stub.calls, 2);
  });

  it("retries a response that violates the output schema", async () => {
    const truncated = { ...goodArticle, body: "太短了。" };
    const stub = stubCompletion([truncated, goodArticle]);
    const result = await authorArticle(item, { stopWords: ["AI"] });

    assert.equal(result.attempts, 2);
    assert.equal(stub.calls, 2);
  });

  it("gives up after two schema failures", async () => {
    stubCompletion([{ title: "x" }, { title: "x" }]);

    await assert.rejects(
      () => authorArticle(item, { stopWords: ["AI"] }),
      /failed validation twice/,
    );
  });
});

describe("storeArticle", () => {
  it("writes frontmatter the site's schema accepts", async () => {
    const stored = await storeArticle(goodArticle, item, { draft: false });
    const raw = await readFile(stored.file, "utf8");
    const parsed = matter(raw);
    const frontmatter = ArticleFrontmatterSchema.parse(parsed.data);

    assert.equal(frontmatter.sourceUrl, item.url);
    assert.equal(frontmatter.sourceTitle, item.title);
    assert.equal(frontmatter.sourceAuthor, item.author);
    assert.equal(frontmatter.sourcePublishedAt, item.publishedAt);
    assert.equal(frontmatter.draft, false);
    assert.ok(frontmatter.readingMinutes >= 3);
  });

  it("derives section ids that match the anchors the site generates", async () => {
    const stored = await storeArticle(goodArticle, item, { draft: false });
    const parsed = matter(await readFile(stored.file, "utf8"));
    const frontmatter = ArticleFrontmatterSchema.parse(parsed.data);

    const headings = [...String(parsed.content).matchAll(/^##\s+(.+)$/gm)].map((match) =>
      (match[1] ?? "").trim(),
    );

    assert.deepEqual(
      frontmatter.sections,
      headings.map((label) => ({ id: slugify(label), label })),
    );
    assert.equal(frontmatter.sections.length, 4);
  });

  it("never reuses a file name", async () => {
    const first = await storeArticle(goodArticle, item, { draft: false });
    const second = await storeArticle(goodArticle, item, { draft: false });

    assert.notEqual(first.slug, second.slug);
    assert.equal(second.issue, first.issue + 1);
  });

  it("honours the draft flag", async () => {
    const stored = await storeArticle(goodArticle, item, { draft: true });
    const parsed = matter(await readFile(stored.file, "utf8"));

    assert.equal(ArticleFrontmatterSchema.parse(parsed.data).draft, true);
  });
});
