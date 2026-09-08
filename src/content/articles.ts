import generatedArticles from "virtual:articles";
import type { Article } from "./schema";

export type { Article, ArticleSection } from "./schema";

export const articles: readonly Article[] = generatedArticles;

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
