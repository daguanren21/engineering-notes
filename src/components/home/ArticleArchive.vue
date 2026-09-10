<script setup lang="ts">
import { computed, ref } from "vue";
import type { Article } from "../../content/articles";
import { formatDate } from "../../content/articles";

const props = defineProps<{
  articles: readonly Article[];
}>();

const query = ref("");

/**
 * Matching runs on the client only; the pre-rendered markup always contains the
 * full list so the archive stays readable and indexable without JavaScript.
 */
const visibleArticles = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase("zh-CN");
  if (needle === "") return props.articles;

  return props.articles.filter((article) =>
    [article.title, article.description, ...article.tags]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(needle),
  );
});

const isFiltered = computed(() => query.value.trim() !== "");
</script>

<template>
  <section id="archive" class="archive" aria-labelledby="archive-title">
    <header class="archive__header">
      <h2 id="archive-title">按结论归档，而不是按热度排列。</h2>
      <p aria-live="polite">
        <template v-if="isFiltered">
          {{ visibleArticles.length }} / {{ articles.length }} 篇
        </template>
        <template v-else>{{ String(articles.length).padStart(2, "0") }} 篇已发布</template>
      </p>
    </header>

    <div class="archive__search">
      <label for="archive-filter">搜索笔记</label>
      <div class="archive__field">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-4.4-4.4" />
        </svg>
        <input
          id="archive-filter"
          v-model="query"
          type="search"
          autocomplete="off"
          placeholder="标题、摘要或标签"
        />
        <button v-if="isFiltered" type="button" @click="query = ''">清除</button>
      </div>
    </div>

    <ol v-if="visibleArticles.length" class="archive__list">
      <li v-for="article in visibleArticles" :key="article.slug">
        <RouterLink class="archive-row" :to="article.href">
          <span class="archive-row__issue">N° {{ String(article.issue).padStart(2, "0") }}</span>
          <span class="archive-row__body">
            <span class="archive-row__tags">{{ article.tags.join(" · ") }}</span>
            <strong>{{ article.title }}</strong>
            <span class="archive-row__description">{{ article.description }}</span>
          </span>
          <span class="archive-row__meta">
            <time :datetime="article.publishedAt">{{ formatDate(article.publishedAt) }}</time>
            <span>{{ article.readingMinutes }} 分钟</span>
          </span>
          <span class="archive-row__action">
            阅读
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
          </span>
        </RouterLink>
      </li>
    </ol>

    <div v-else class="archive__empty">
      <h3>没有匹配「{{ query.trim() }}」的笔记。</h3>
      <p>
        换个关键词，或者按主题找：
        <RouterLink to="/tags">全部标签</RouterLink>。
      </p>
    </div>
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
  padding-bottom: 30px;
}

.archive__header h2 {
  max-width: 720px;
  margin: 0;
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
  white-space: nowrap;
}

.archive__search {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: clamp(20px, 3vw, 44px);
  align-items: center;
  padding-bottom: 26px;
}

.archive__search > label {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.69rem;
}

.archive__field {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 560px;
  border-bottom: 1px solid var(--line-strong);
}

.archive__field:focus-within {
  border-bottom-color: var(--accent);
}

.archive__field svg {
  width: 17px;
  flex: none;
  fill: none;
  stroke: var(--muted);
  stroke-linecap: round;
  stroke-width: 1.6;
}

.archive__field input {
  min-width: 0;
  flex: 1;
  min-height: 46px;
  padding: 8px 0;
  border: 0;
  color: var(--ink);
  background: transparent;
  font: inherit;
  font-size: 0.95rem;
}

.archive__field input::placeholder {
  color: var(--muted);
  opacity: 1;
}

.archive__field input:focus-visible {
  outline: none;
}

.archive__field button {
  flex: none;
  min-height: 44px;
  padding-inline: 10px;
  border: 0;
  color: var(--accent);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 700;
}

.archive__field input::-webkit-search-cancel-button {
  display: none;
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

.archive__empty {
  padding-block: 56px 8px;
  border-top: 1px solid var(--line-strong);
}

.archive__empty h3 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(1.5rem, 2.6vw, 2.1rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.3;
  text-wrap: balance;
}

.archive__empty p {
  max-width: 620px;
  margin: 18px 0 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.75;
}

.archive__empty a {
  color: var(--accent);
  font-weight: 700;
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
  text-wrap: pretty;
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
    gap: 14px;
  }

  .archive__search {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
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
