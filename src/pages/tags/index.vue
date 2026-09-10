<script setup lang="ts">
import { useHead } from "@unhead/vue";
import TagDirectory from "../../components/tags/TagDirectory.vue";
import { articles } from "../../content/articles";
import { tagIndex } from "../../content/tags";

const publishedCount = articles.filter((article) => !article.draft).length;

useHead({
  title: "标签 · 工程手记",
  meta: [
    {
      name: "description",
      content: "按主题浏览全部工程笔记：Harness、Agent 运行时、上下文工程与工程组织。",
    },
    { property: "og:type", content: "website" },
  ],
});
</script>

<template>
  <section class="tag-page" aria-labelledby="tags-title">
    <header class="tag-page__header">
      <h1 id="tags-title">按主题找，比按时间翻更快。</h1>
      <p>
        {{ tagIndex.length }} 个标签 · {{ publishedCount }} 篇笔记
      </p>
    </header>

    <TagDirectory />
  </section>
</template>

<style scoped>
.tag-page {
  padding-block: clamp(48px, 6vw, 84px) clamp(76px, 9vw, 126px);
}

.tag-page__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 32px;
  align-items: end;
  padding-bottom: 34px;
}

.tag-page__header h1 {
  max-width: 720px;
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(2rem, 4vw, 4rem);
  font-weight: 560;
  letter-spacing: -0.045em;
  line-height: 1.15;
  text-wrap: balance;
}

.tag-page__header > p {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .tag-page__header {
    grid-template-columns: 1fr;
    gap: 18px;
  }
}
</style>
