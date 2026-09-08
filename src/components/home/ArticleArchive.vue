<script setup lang="ts">
import type { Article } from "../../content/articles";
import { formatDate } from "../../content/articles";

defineProps<{
  articles: readonly Article[];
}>();
</script>

<template>
  <section id="archive" class="archive" aria-labelledby="archive-title">
    <header class="archive__header">
      <div>
        <p class="eyebrow">ARCHIVE / 全部笔记</p>
        <h2 id="archive-title">按结论归档，而不是按热度排列。</h2>
      </div>
      <p>{{ String(articles.length).padStart(2, "0") }} 篇已发布</p>
    </header>

    <ol class="archive__list">
      <li v-for="article in articles" :key="article.slug">
        <RouterLink class="archive-row" :to="article.href">
          <span class="archive-row__issue">N° {{ String(article.issue).padStart(2, "0") }}</span>
          <span class="archive-row__body">
            <span class="archive-row__tags">{{ article.tags.join(" · ") }}</span>
            <strong>{{ article.title }}</strong>
            <span class="archive-row__description">{{ article.description }}</span>
          </span>
          <span class="archive-row__meta">
            <time :datetime="article.publishedAt">{{ formatDate(article.publishedAt) }}</time>
            <span>{{ article.readingMinutes }} MIN</span>
          </span>
          <span class="archive-row__action">
            阅读
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
          </span>
        </RouterLink>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.archive {
  padding-block: clamp(76px, 9vw, 126px);
  border-top: 1px solid var(--line-strong);
}

.archive__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 32px;
  align-items: end;
  padding-bottom: 34px;
}

.archive__header h2 {
  max-width: 720px;
  margin: 14px 0 0;
  font-family: var(--font-serif);
  font-size: clamp(2rem, 4vw, 4rem);
  font-weight: 560;
  letter-spacing: -0.045em;
  line-height: 1.15;
  text-wrap: balance;
}

.archive__header > p {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.7rem;
}

.archive__list {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line-strong);
  list-style: none;
}

.archive__list li {
  border-bottom: 1px solid var(--line);
}

.archive-row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) 140px 76px;
  gap: clamp(20px, 3vw, 44px);
  align-items: start;
  padding-block: 34px;
  color: var(--ink);
  text-decoration: none;
}

.archive-row__issue,
.archive-row__tags,
.archive-row__meta,
.archive-row__action {
  font-family: var(--font-mono);
  font-size: 0.69rem;
}

.archive-row__issue,
.archive-row__meta {
  color: var(--muted);
}

.archive-row__body {
  display: grid;
  gap: 10px;
}

.archive-row__tags {
  color: var(--accent);
  letter-spacing: 0.05em;
}

.archive-row strong {
  font-family: var(--font-serif);
  font-size: clamp(1.55rem, 2.5vw, 2.5rem);
  font-weight: 620;
  letter-spacing: -0.025em;
  line-height: 1.22;
  text-wrap: balance;
}

.archive-row__description {
  max-width: 720px;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.7;
}

.archive-row__meta {
  display: grid;
  gap: 8px;
  white-space: nowrap;
}

.archive-row__action {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  color: var(--accent);
  font-weight: 700;
}

.archive-row__action svg {
  width: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
  transition: transform 180ms ease;
}

.archive-row:hover .archive-row__action svg,
.archive-row:focus-visible .archive-row__action svg {
  transform: translateX(4px);
}

@media (max-width: 760px) {
  .archive__header {
    grid-template-columns: 1fr;
  }

  .archive-row {
    grid-template-columns: 58px minmax(0, 1fr) auto;
    gap: 14px;
    padding-block: 28px;
  }

  .archive-row__meta {
    grid-column: 2;
    grid-row: 2;
    grid-auto-flow: column;
    justify-content: start;
  }

  .archive-row__action {
    grid-column: 3;
    grid-row: 1;
  }
}

@media (max-width: 480px) {
  .archive-row {
    grid-template-columns: 46px minmax(0, 1fr);
  }

  .archive-row__action {
    grid-column: 2;
    grid-row: 3;
    justify-content: flex-start;
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .archive-row__action svg {
    transition: none;
  }
}
</style>
