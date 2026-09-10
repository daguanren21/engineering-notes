import { fetchJson } from "./http.ts";
import type { SourceItem } from "./types.ts";

const apiBase = "https://api.x.com/2";

interface UserLookupResponse {
  data?: { id: string; name?: string; username?: string };
  errors?: { detail?: string; title?: string }[];
}

interface Tweet {
  id: string;
  text: string;
  created_at?: string;
  note_tweet?: { text?: string };
}

interface TweetPageResponse {
  data?: Tweet[];
  errors?: { detail?: string; title?: string }[];
}

function apiError(payload: { errors?: { detail?: string; title?: string }[] }): string {
  const first = payload.errors?.[0];
  return first?.detail ?? first?.title ?? "unknown API error";
}

/**
 * Official X API v2. Requires a paid-tier bearer token; the caller decides
 * whether one is present. Replies and retweets are excluded so the digest sees
 * what the account actually published.
 */
export async function fetchXAccount(
  handle: string,
  bearerToken: string,
  options: { team: string; maxItems: number },
): Promise<SourceItem[]> {
  const { team, maxItems } = options;
  const headers = { authorization: `Bearer ${bearerToken}` };

  const lookup = await fetchJson<UserLookupResponse>(
    `${apiBase}/users/by/username/${encodeURIComponent(handle)}?user.fields=name,username`,
    { headers },
  );

  if (!lookup.data) throw new Error(apiError(lookup));

  const userId = lookup.data.id;
  const pageSize = Math.min(100, Math.max(5, maxItems));

  const page = await fetchJson<TweetPageResponse>(
    `${apiBase}/users/${userId}/tweets?max_results=${pageSize}` +
      "&exclude=replies,retweets&tweet.fields=created_at,note_tweet,text",
    { headers },
  );

  if (!page.data) {
    if (page.errors) throw new Error(apiError(page));
    return [];
  }

  return page.data.slice(0, maxItems).map((tweet) => ({
    id: `https://x.com/${handle}/status/${tweet.id}`,
    origin: "x-api" as const,
    kind: "news" as const,
    team,
    author: lookup.data?.name ?? handle,
    title: (tweet.note_tweet?.text ?? tweet.text).split("\n")[0]?.slice(0, 120) ?? tweet.text,
    url: `https://x.com/${handle}/status/${tweet.id}`,
    publishedAt: (tweet.created_at ?? new Date().toISOString()).slice(0, 10),
    text: tweet.note_tweet?.text ?? tweet.text,
  }));
}
