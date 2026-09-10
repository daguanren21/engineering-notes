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
        <span class="note__issue">{{ String(article.issue).padStart(2, "0") }}</span>
        <strong>{{ article.title }}</strong>
        <time :datetime="article.publishedAt">{{ formatDate(article.publishedAt) }}</time>
      </RouterLink>
    </li>
  </ol>
</template>

<style scoped>
.notes {
  margin: 0;
  padding: 0;
  list-style: none;
}

.note {
  display: grid;
  grid-template-columns: 3.4rem minmax(0, 1fr) auto;
  gap: 18px;
  align-items: baseline;
  min-height: 56px;
  padding-block: 14px;
  border-top: 1px solid var(--line);
  color: var(--ink);
  text-decoration: none;
}

.notes li:last-child .note {
  border-bottom: 1px solid var(--line);
}

.note__issue {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.note strong {
  min-width: 0;
  font-family: var(--font-serif);
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.4;
}

.note time {
  color: var(--muted);
  font-family: var(--font-display);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.note:hover,
.note:focus-visible {
  color: var(--accent);
}

.note:hover time,
.note:focus-visible time {
  color: var(--accent);
}

@media (max-width: 720px) {
  .note {
    grid-template-columns: 2.6rem minmax(0, 1fr);
  }

  .note time {
    grid-column: 2;
  }
}
</style>
