<script setup lang="ts">
import type { Article } from "../../content/articles";
import { formatDate } from "../../content/articles";

defineProps<{
  article: Article;
}>();
</script>

<template>
  <section class="cover" aria-labelledby="cover-title">
    <h1 id="cover-title">
      <span v-for="part in article.titleParts" :key="part">{{ part }}</span>
    </h1>
    <p class="cover__lede">{{ article.description }}</p>
    <p class="cover__source">
      {{ article.sourceAuthor }}
      ·
      <cite>{{ article.sourceTitle }}</cite>
      ·
      <time :datetime="article.publishedAt">{{ formatDate(article.publishedAt) }}</time>
      ·
      {{ article.readingMinutes }} 分钟
    </p>
    <RouterLink class="cover__open" :to="article.href">阅读本期</RouterLink>
  </section>
</template>

<style scoped>
.cover {
  position: relative;
  max-width: 46rem;
  padding-block: clamp(56px, 8vw, 108px) clamp(64px, 9vw, 120px);
}
.cover h1 {
  display: grid;
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(2.6rem, 6.4vw, 5.4rem);
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 0.96;
  text-wrap: balance;
}

.cover h1 span + span {
  display: block;
}

.cover__lede {
  max-width: 38rem;
  margin: 28px 0 0;
  color: var(--ink-soft);
  font-family: var(--font-serif);
  font-size: clamp(1.12rem, 1.7vw, 1.32rem);
  line-height: 1.7;
}

.cover__source {
  margin: 22px 0 0;
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0;
}

.cover__source cite {
  font-style: normal;
}

.cover__open {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  margin-top: 36px;
  color: var(--accent);
  font-family: var(--font-sans);
  font-size: 1.05rem;
  font-weight: 400;
  letter-spacing: 0;
}

.cover__open:hover,
.cover__open:focus-visible {
  color: var(--accent);
}

@media (max-width: 620px) {
  .cover {
    padding-block: 36px 56px;
  }
}
</style>
