<script setup lang="ts">
import { useHead } from "@unhead/vue";
import ArticleArchive from "../components/home/ArticleArchive.vue";
import HomeHero from "../components/home/HomeHero.vue";
import { articles } from "../content/articles";

const publishedArticles = [...articles]
  .filter((article) => !article.draft)
  .sort(
    (left, right) =>
      right.publishedAt.localeCompare(left.publishedAt) || right.issue - left.issue,
  );
const latestArticle = publishedArticles[0];

if (!latestArticle) {
  throw new Error("At least one published article is required.");
}

useHead({
  title: "工程手记 · 复杂系统的阅读、拆解与判断",
  meta: [
    {
      name: "description",
      content: "记录经得起复用的工程判断：还原问题、辨认边界、保留证据。",
    },
    { property: "og:type", content: "website" },
  ],
});
</script>

<template>
  <HomeHero :article="latestArticle" />
  <ArticleArchive :articles="publishedArticles" />
</template>
