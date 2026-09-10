/**
 * The X API layer cannot run without a paid bearer token, so it is exercised
 * here against a stubbed fetch. Covers the request shape the API requires and
 * the mapping from a tweet to a source item.
 *
 *   node --test scripts/ingest/x.test.ts
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { fetchXAccount } from "./x.ts";

const originalFetch = globalThis.fetch;

after(() => {
  globalThis.fetch = originalFetch;
});

interface Call {
  url: string;
  authorization: string | null;
}

function stubApi(responses: unknown[]): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), authorization: headers.get("authorization") });
    const payload = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const lookup = { data: { id: "12345", name: "Anthropic", username: "AnthropicAI" } };

const timeline = {
  data: [
    {
      id: "900",
      text: "short form",
      created_at: "2026-09-09T10:00:00.000Z",
      note_tweet: { text: "a much longer long-form post" },
    },
    { id: "899", text: "plain tweet", created_at: "2026-09-08T10:00:00.000Z" },
  ],
};

describe("fetchXAccount", () => {
  it("looks the handle up, then reads its timeline with the right parameters", async () => {
    const calls = stubApi([lookup, timeline]);
    await fetchXAccount("AnthropicAI", "tok", { team: "Anthropic", maxItems: 10 });

    assert.equal(calls.length, 2);
    assert.match(calls[0]!.url, /\/2\/users\/by\/username\/AnthropicAI\?/);

    const timelineUrl = calls[1]!.url;
    assert.match(timelineUrl, /\/2\/users\/12345\/tweets\?/);
    assert.match(timelineUrl, /exclude=replies,retweets/);
    assert.match(timelineUrl, /tweet\.fields=created_at,note_tweet,text/);
    assert.match(timelineUrl, /max_results=10/);
  });

  it("sends the bearer token on every request", async () => {
    const calls = stubApi([lookup, timeline]);
    await fetchXAccount("AnthropicAI", "tok-abc", { team: "Anthropic", maxItems: 10 });

    assert.deepEqual(
      calls.map((call) => call.authorization),
      ["Bearer tok-abc", "Bearer tok-abc"],
    );
  });

  it("prefers the long-form text and builds a canonical permalink", async () => {
    stubApi([lookup, timeline]);
    const items = await fetchXAccount("AnthropicAI", "tok", {
      team: "Anthropic",
      maxItems: 10,
    });

    assert.equal(items.length, 2);
    const first = items[0]!;
    assert.equal(first.text, "a much longer long-form post");
    assert.equal(first.url, "https://x.com/AnthropicAI/status/900");
    assert.equal(first.id, first.url);
    assert.equal(first.author, "Anthropic");
    assert.equal(first.team, "Anthropic");
    assert.equal(first.kind, "news");
    assert.equal(first.origin, "x-api");
    assert.equal(first.publishedAt, "2026-09-09");
  });

  it("falls back to the plain text when there is no long-form body", async () => {
    stubApi([lookup, timeline]);
    const items = await fetchXAccount("AnthropicAI", "tok", {
      team: "Anthropic",
      maxItems: 10,
    });

    assert.equal(items[1]!.text, "plain tweet");
  });

  it("surfaces an API error rather than reporting an empty account", async () => {
    stubApi([lookup, { errors: [{ detail: "Not authorized for this endpoint" }] }]);

    await assert.rejects(
      () => fetchXAccount("AnthropicAI", "tok", { team: "Anthropic", maxItems: 10 }),
      /Not authorized for this endpoint/,
    );
  });

  it("reports a failed handle lookup", async () => {
    stubApi([{ errors: [{ detail: "Could not find user" }] }]);

    await assert.rejects(
      () => fetchXAccount("nobody", "tok", { team: "x", maxItems: 10 }),
      /Could not find user/,
    );
  });

  it("keeps the API's maximum page size within bounds", async () => {
    const calls = stubApi([lookup, timeline]);
    await fetchXAccount("AnthropicAI", "tok", { team: "Anthropic", maxItems: 500 });

    // The API rejects max_results above 100.
    assert.match(calls[1]!.url, /max_results=100/);
  });
});
