import generatedArticles from "virtual:articles";
import type { Article } from "./schema";

export type { Article, ArticleSection } from "./schema";

export const articles: readonly Article[] = generatedArticles;

export function formatDate(value: string): string {
  return value.replaceAll("-", ".");
}
