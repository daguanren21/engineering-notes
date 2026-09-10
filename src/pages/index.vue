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
  title: "工程手记",
  meta: [
    {
      name: "description",
      content: "一期一判断。把长文和源码整理成若干个月后仍然能用的工程结论。",
    },
    { property: "og:type", content: "website" },
  ],
});
</script>

<template>
  <HomeHero :article="latestArticle" />
  <ArticleArchive :articles="publishedArticles.slice(1)" />
</template>
