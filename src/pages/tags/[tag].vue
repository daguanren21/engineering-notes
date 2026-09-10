<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed } from "vue";
import { useRoute } from "vue-router";
import NoteList from "../../components/tags/NoteList.vue";
import TagDirectory from "../../components/tags/TagDirectory.vue";
import { findTagGroup } from "../../content/tags";

const route = useRoute();
const slug = computed(() => {
  const param = route.params.tag;
  return Array.isArray(param) ? (param[0] ?? "") : (param ?? "");
});
const group = computed(() => findTagGroup(slug.value));

useHead({
  title: computed(() =>
    group.value ? `${group.value.tag} · 标签 · 工程手记` : "标签 · 工程手记",
  ),
  meta: [
    {
      name: "description",
      content: computed(() =>
        group.value
          ? `工程手记中带有「${group.value.tag}」标签的 ${group.value.articles.length} 篇笔记。`
          : "按主题浏览工程手记的全部笔记。",
      ),
    },
    { property: "og:type", content: "website" },
  ],
});
</script>

<template>
  <section class="tag-page" aria-labelledby="tag-title">
    <nav class="tag-page__rail" aria-label="标签导航">
      <RouterLink class="back-link" to="/tags">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        全部标签
      </RouterLink>
    </nav>

    <template v-if="group">
      <header class="tag-page__header">
        <h1 id="tag-title">{{ group.tag }}</h1>
        <p>{{ group.articles.length }} 篇笔记</p>
      </header>

      <NoteList :articles="group.articles" />

      <div class="tag-page__others">
        <h2>换一个主题</h2>
        <TagDirectory :active-slug="group.slug" />
      </div>
    </template>

    <div v-else class="tag-page__empty">
      <h1 id="tag-title">没有这个标签。</h1>
      <p>
        它可能已被重命名，或者链接拼写有误。
        <RouterLink to="/tags">回到全部标签</RouterLink>，或从
        <RouterLink to="/">首页归档</RouterLink>重新找起。
      </p>
    </div>
  </section>
</template>

<style scoped>
.tag-page {
  padding-block: clamp(36px, 4vw, 56px) clamp(76px, 9vw, 126px);
}

.tag-page__rail {
  display: flex;
  align-items: center;
  min-height: 44px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
}

.back-link {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  text-decoration: none;
}

.back-link:hover,
.back-link:focus-visible {
  color: var(--accent);
}

.back-link svg {
  width: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.tag-page__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 32px;
  align-items: end;
  padding: 22px 0 34px;
}

.tag-page__header h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(2.4rem, 5vw, 4.6rem);
  font-weight: 560;
  letter-spacing: -0.05em;
  line-height: 1.08;
  text-wrap: balance;
}

.tag-page__header > p {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  white-space: nowrap;
}

.tag-page__others {
  margin-top: clamp(56px, 7vw, 92px);
}

.tag-page__others h2 {
  margin: 0 0 22px;
  font-family: var(--font-sans);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.tag-page__empty {
  padding-block: clamp(40px, 6vw, 80px);
}

.tag-page__empty h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(2rem, 4vw, 3.4rem);
  font-weight: 560;
  letter-spacing: -0.045em;
  line-height: 1.15;
  text-wrap: balance;
}

.tag-page__empty p {
  max-width: 620px;
  margin: 26px 0 0;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.8;
  text-wrap: pretty;
}

.tag-page__empty a {
  color: var(--accent);
  font-weight: 700;
}

@media (max-width: 760px) {
  .tag-page__header {
    grid-template-columns: 1fr;
    gap: 14px;
  }
}
</style>
