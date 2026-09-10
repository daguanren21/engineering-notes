<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { articles } from "../../content/articles";

const route = useRoute();
const feedUrl = `${import.meta.env.BASE_URL}rss.xml`;

const current = computed(() => {
  const slug = route.path.match(/\/articles\/([^/]+)/)?.[1];
  if (slug) {
    return articles.find((article) => article.slug === slug && !article.draft) ?? null;
  }
  return [...articles]
    .filter((article) => !article.draft)
    .sort(
      (left, right) =>
        right.publishedAt.localeCompare(left.publishedAt) || right.issue - left.issue,
    )[0] ?? null;
});

const issueLabel = computed(() => String(current.value?.issue ?? 0).padStart(2, "0"));
const onHome = computed(() => route.path === "/");
const onTags = computed(() => route.path.startsWith("/tags"));
</script>

<template>
  <header class="masthead">
    <div class="masthead__bar">
      <RouterLink class="masthead__brand" to="/" aria-label="工程手记首页">工程手记</RouterLink>
      <nav aria-label="主导航">
        <RouterLink to="/" :class="{ 'is-current': onHome }">本期</RouterLink>
        <RouterLink to="/#archive">过刊</RouterLink>
        <RouterLink to="/tags" :class="{ 'is-current': onTags }">索引</RouterLink>
        <a :href="feedUrl" type="application/rss+xml">订阅</a>
      </nav>
    </div>
    <div v-if="current" class="masthead__issue">
      <p>
        <span>第</span>
        <strong>{{ issueLabel }}</strong>
        <span>期</span>
      </p>
      <time :datetime="current.publishedAt">{{ current.publishedAt.replaceAll("-", ".") }}</time>
    </div>
  </header>
</template>

<style scoped>
.masthead {
  color: var(--masthead-ink);
  background: var(--masthead);
  border-bottom: 1px solid var(--line);
}

.masthead__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  width: var(--page);
  min-height: 52px;
  margin-inline: auto;
}

.masthead__brand {
  color: inherit;
  font-family: var(--font-sans);
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-decoration: none;
}

.masthead nav {
  display: flex;
  gap: 4px;
  font-family: var(--font-sans);
  font-size: 0.78rem;
  font-weight: 400;
}

.masthead nav a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  padding-inline: 10px;
  color: var(--muted);
  text-decoration: none;
}

.masthead nav a:hover,
.masthead nav a.is-current {
  color: var(--ink);
}

.masthead__issue {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  width: var(--page);
  margin: 0 auto;
  padding: 28px 0 36px;
}

.masthead__issue p {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0;
  line-height: 0.85;
}

.masthead__issue span {
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 1rem;
  font-weight: 400;
}

.masthead__issue strong {
  font-family: var(--font-display);
  font-size: clamp(4.8rem, 11vw, 7.2rem);
  font-weight: 600;
  letter-spacing: -0.055em;
}

.masthead__issue time {
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.92rem;
}

@media (max-width: 720px) {
  .masthead__bar,
  .masthead__issue {
    width: var(--page);
  }

  .masthead nav {
    font-size: 0.74rem;
  }

  .masthead nav a {
    padding-inline: 6px;
  }

  .masthead__issue {
    flex-direction: column;
    gap: 8px;
    padding: 18px 0 24px;
  }
}
</style>
