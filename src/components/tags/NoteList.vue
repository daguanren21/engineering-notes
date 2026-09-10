<script setup lang="ts">
import type { Article } from "../../content/articles";
import { formatDate } from "../../content/articles";

defineProps<{
  articles: readonly Article[];
}>();
</script>

<template>
  <ol class="notes">
    <li v-for="article in articles" :key="article.slug">
      <RouterLink class="note" :to="article.href">
        <span class="note__issue">N° {{ String(article.issue).padStart(2, "0") }}</span>
        <span class="note__body">
          <strong>{{ article.title }}</strong>
          <span class="note__description">{{ article.description }}</span>
        </span>
        <span class="note__meta">
          <time :datetime="article.publishedAt">{{ formatDate(article.publishedAt) }}</time>
          <span>{{ article.readingMinutes }} 分钟</span>
        </span>
        <span class="note__action">
          阅读
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
        </span>
      </RouterLink>
    </li>
  </ol>
</template>

<style scoped>
.notes {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line-strong);
  list-style: none;
}

.notes li {
  border-bottom: 1px solid var(--line);
}

.note {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) 140px 76px;
  gap: clamp(20px, 3vw, 44px);
  align-items: start;
  padding-block: 28px;
  color: var(--ink);
  text-decoration: none;
}

.note__issue,
.note__meta,
.note__action {
  font-family: var(--font-mono);
  font-size: 0.69rem;
}

.note__issue,
.note__meta {
  color: var(--muted);
}

.note__body {
  display: grid;
  gap: 8px;
}

.note strong {
  font-family: var(--font-serif);
  font-size: clamp(1.3rem, 2.1vw, 1.9rem);
  font-weight: 620;
  letter-spacing: -0.02em;
  line-height: 1.28;
  text-wrap: balance;
}

.note__description {
  max-width: 680px;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.7;
  text-wrap: pretty;
}

.note__meta {
  display: grid;
  gap: 8px;
  white-space: nowrap;
}

.note__action {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  color: var(--accent);
  font-weight: 700;
}

.note__action svg {
  width: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
  transition: transform 180ms ease;
}

.note:hover .note__action svg,
.note:focus-visible .note__action svg {
  transform: translateX(4px);
}

@media (max-width: 760px) {
  .note {
    grid-template-columns: 58px minmax(0, 1fr) auto;
    gap: 14px;
    padding-block: 24px;
  }

  .note__meta {
    grid-column: 2;
    grid-row: 2;
    grid-auto-flow: column;
    justify-content: start;
  }

  .note__action {
    grid-column: 3;
    grid-row: 1;
  }
}

@media (max-width: 480px) {
  .note {
    grid-template-columns: 46px minmax(0, 1fr);
  }

  .note__action {
    grid-column: 2;
    grid-row: 3;
    justify-content: flex-start;
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .note__action svg {
    transition: none;
  }
}
</style>
