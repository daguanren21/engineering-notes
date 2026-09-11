<script setup lang="ts">
import { useHead } from "@unhead/vue";
import TagDirectory from "../../components/tags/TagDirectory.vue";
import { articles } from "../../content/articles";
import { tagIndex } from "../../content/tags";

const publishedCount = articles.filter((article) => !article.draft).length;

useHead({
  title: "索引 · 工程手记",
  meta: [
    {
      name: "description",
      content: "按主题检索全部期次：Harness、Agent 运行时、上下文工程与工程组织。",
    },
    { property: "og:type", content: "website" },
  ],
});
</script>

<template>
  <section class="index-page" aria-labelledby="tags-title">
    <header class="index-page__header">
      <h1 id="tags-title">主题索引</h1>
      <p>{{ tagIndex.length }} 个主题 · {{ publishedCount }} 期</p>
    </header>
    <TagDirectory />
  </section>
</template>

<style scoped>
.index-page {
  padding-block: 48px 96px;
}

.index-page__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--line);
}

.index-page__header h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(2rem, 5vw, 3.4rem);
  font-weight: 500;
  letter-spacing: -0.03em;
}

.index-page__header > p {
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.08em;
}

@media (max-width: 760px) {
  .index-page__header {
    flex-direction: column;
    gap: 10px;
  }
}
</style>
