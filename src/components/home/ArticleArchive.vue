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
  <section id="archive" class="issues" aria-labelledby="archive-title">
    <header class="issues__header">
      <h2 id="archive-title">过刊</h2>
      <p aria-live="polite">
        <template v-if="isFiltered">
          {{ visibleArticles.length }} / {{ articles.length }} 期
        </template>
        <template v-else>{{ articles.length }} 期已出</template>
      </p>
    </header>

    <div class="issues__search">
      <label for="archive-filter">检索过刊</label>
      <div class="issues__field">
        <input
          id="archive-filter"
          v-model="query"
          type="search"
          autocomplete="off"
          placeholder="标题、判断或标签"
        />
        <button v-if="isFiltered" type="button" @click="query = ''">清除</button>
      </div>
    </div>

    <ol v-if="visibleArticles.length" class="issues__list">
      <li v-for="article in visibleArticles" :key="article.slug">
        <RouterLink class="issue" :to="article.href">
          <span class="issue__num">{{ String(article.issue).padStart(2, "0") }}</span>
          <strong>{{ article.title }}</strong>
          <time :datetime="article.publishedAt">{{ formatDate(article.publishedAt) }}</time>
        </RouterLink>
      </li>
    </ol>

    <div v-else class="issues__empty">
      <p>没有匹配「{{ query.trim() }}」的期次。</p>
      <p>
        换个词，或从
        <RouterLink to="/tags">主题索引</RouterLink>
        进入。
      </p>
    </div>
  </section>
</template>

<style scoped>
.issues {
  padding-block: 8px 96px;
  border-top: 1px solid var(--line);
}

.issues__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24px;
  padding-block: 28px 18px;
}

.issues__header h2 {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.18em;
}

.issues__header > p {
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.08em;
}

.issues__search {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 20px;
  align-items: center;
  padding-bottom: 18px;
}

.issues__search > label {
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.08em;
}

.issues__field {
  display: flex;
  max-width: 420px;
  border-bottom: 1px solid var(--line-strong);
}

.issues__field:focus-within {
  border-bottom-color: var(--accent);
}

.issues__field input {
  min-width: 0;
  flex: 1;
  min-height: 44px;
  padding: 0;
  border: 0;
  color: var(--ink);
  background: transparent;
  font: inherit;
}

.issues__field input::placeholder {
  color: var(--muted);
  opacity: 1;
}

.issues__field input:focus-visible {
  outline: none;
}

.issues__field button {
  flex: none;
  min-height: 44px;
  padding-inline: 10px;
  border: 0;
  color: var(--accent);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 500;
}

.issues__field input::-webkit-search-cancel-button {
  display: none;
}

.issues__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.issue {
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

.issues__list li:last-child .issue {
  border-bottom: 1px solid var(--line);
}

.issue__num {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.issue strong {
  min-width: 0;
  font-family: var(--font-serif);
  font-size: 1.05rem;
  font-weight: 500;
  line-height: 1.4;
}

.issue time {
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.issue:hover,
.issue:focus-visible {
  color: var(--accent);
}

.issue:hover time,
.issue:focus-visible time {
  color: var(--accent);
}

.issues__empty {
  padding-block: 36px;
  border-top: 1px solid var(--line-strong);
  font-family: var(--font-serif);
}

.issues__empty p {
  margin: 0;
}

.issues__empty p + p {
  margin-top: 8px;
}

.issues__empty a {
  color: var(--accent);
}

@media (max-width: 720px) {
  .issues__search {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .issue {
    grid-template-columns: 2.6rem minmax(0, 1fr);
  }

  .issue time {
    grid-column: 2;
  }
}
</style>
