export type ItemOrigin = "x-api" | "bridge" | "feed";

/**
 * What kind of thing the source publishes. Order matters: it is the primary
 * sort key, so a written article always outranks a raw commit stream.
 */
export type SourceKind = "news" | "release" | "community" | "commits";

/** Default ranking, best first. Override with `selection.kindOrder`. */
export const sourceKinds: readonly SourceKind[] = ["news", "release", "community", "commits"];

export interface FeedSource {
  url: string;
  team: string;
  kind: SourceKind;
  /**
   * Set when the feed reports a username or bot account rather than a name.
   * GitHub release feeds, for instance, attribute entries to whoever cut the
   * release.
   */
  author?: string;
  /**
   * Whether a short entry may be completed by fetching its page. Defaults to
   * true. Turn it off where the page is client-rendered, because the server
   * HTML is navigation scaffolding rather than content — a GitHub commit page
   * extracts to 12k characters of "Fork / Star / File tree" chrome.
   */
  enrich?: boolean;
}

export interface SourceItem {
  /** Stable across runs so the ledger can suppress re-processing. */
  id: string;
  origin: ItemOrigin;
  kind: SourceKind;
  team: string;
  author: string;
  title: string;
  url: string;
  /** ISO date, `YYYY-MM-DD`. */
  publishedAt: string;
  text: string;
}

export interface SourceConfig {
  xAccounts: { handle: string; team: string }[];
  feeds: FeedSource[];
  selection: {
    maxArticlesPerRun: number;
    maxItemsPerSource: number;
    minSourceChars: number;
    priorityTeams: string[];
    /** Best first. Anything omitted is ranked last. */
    kindOrder: SourceKind[];
    maxItemAgeDays: number;
    /** Follow entries whose feed carried no usable body to the linked page. */
    enrichHeadlineFeeds: boolean;
    maxEnrichPerFeed: number;
    tagStopWords: string[];
  };
}

/**
 * Deliberately no `lastRunAt`: the file is committed by CI, and a timestamp
 * that changes on every run would produce a commit every day even when nothing
 * was written.
 */
export interface DigestState {
  /** Item ids already processed, whether or not they became an article. */
  seen: string[];
  /**
   * Teams already covered, most recent first. Drives least-recently-covered
   * scheduling so no vendor is starved by a more prolific one.
   */
  recentTeams: string[];
}

export interface AuthoredArticle {
  title: string;
  titleParts: string[];
  description: string;
  tags: string[];
  body: string;
}
