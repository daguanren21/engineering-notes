/// <reference types="vite/client" />
/// <reference types="vite-plugin-pages/client" />

declare module "virtual:articles" {
  import type { Article } from "./content/schema";

  const articles: Article[];
  export default articles;
}

declare module "*.md" {
  import type { Component } from "vue";

  export const title: unknown;
  export const description: unknown;
  export const publishedAt: unknown;
  export const sourceKind: unknown;
  export const sourceTitle: unknown;
  export const sourceUrl: unknown;
  export const sourceAuthor: unknown;
  export const sourcePublishedAt: unknown;
  export const tags: unknown;
  export const readingMinutes: unknown;
  export const issue: unknown;
  export const draft: unknown;
  export const sections: unknown;
  const component: Component;
  export default component;
}
