import { articles, type Article } from "./articles";
import { tagSlug } from "./slug";

export interface TagGroup {
  tag: string;
  slug: string;
  articles: readonly Article[];
}

export { tagSlug };

function buildTagIndex(): readonly TagGroup[] {
  const groups = new Map<string, { tag: string; articles: Article[] }>();

  for (const article of articles) {
    if (article.draft) continue;
    for (const tag of article.tags) {
      const slug = tagSlug(tag);
      const group = groups.get(slug) ?? { tag, articles: [] };
      group.articles.push(article);
      groups.set(slug, group);
    }
  }

  return [...groups.entries()]
    .map(([slug, group]) => ({
      tag: group.tag,
      slug,
      articles: group.articles.sort(
        (left, right) =>
          right.publishedAt.localeCompare(left.publishedAt) || right.issue - left.issue,
      ),
    }))
    .sort(
      (left, right) =>
        right.articles.length - left.articles.length ||
        left.tag.localeCompare(right.tag, "zh-CN"),
    );
}

export const tagIndex: readonly TagGroup[] = buildTagIndex();

export function findTagGroup(slug: string): TagGroup | undefined {
  return tagIndex.find((group) => group.slug === slug);
}

export function articlesSharingTags(
  article: { slug: string; tags: readonly string[] },
  limit = 3,
): readonly Article[] {
  const ownTags = new Set(article.tags.map(tagSlug));

  return articles
    .filter((candidate) => !candidate.draft && candidate.slug !== article.slug)
    .map((candidate) => {
      const shared = candidate.tags.reduce(
        (count, tag) => (ownTags.has(tagSlug(tag)) ? count + 1 : count),
        0,
      );
      return { candidate, shared };
    })
    .filter((entry) => entry.shared > 0)
    .sort(
      (left, right) =>
        right.shared - left.shared ||
        right.candidate.publishedAt.localeCompare(left.candidate.publishedAt),
    )
    .slice(0, limit)
    .map((entry) => entry.candidate);
}
