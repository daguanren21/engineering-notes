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
    group.value ? `${group.value.tag} · 索引 · 工程手记` : "索引 · 工程手记",
  ),
  meta: [
    {
      name: "description",
      content: computed(() =>
        group.value
          ? `工程手记中带有「${group.value.tag}」的 ${group.value.articles.length} 期。`
          : "按主题检索工程手记的全部期次。",
      ),
    },
    { property: "og:type", content: "website" },
  ],
});
</script>

<template>
  <section class="index-page" aria-labelledby="tag-title">
    <RouterLink class="index-page__back" to="/tags">← 全部主题</RouterLink>

    <template v-if="group">
      <header class="index-page__header">
        <h1 id="tag-title">{{ group.tag }}</h1>
        <p>{{ group.articles.length }} 期</p>
      </header>
      <NoteList :articles="group.articles" />
      <div class="index-page__others">
        <h2>其它主题</h2>
        <TagDirectory :active-slug="group.slug" />
      </div>
    </template>

    <div v-else class="index-page__empty">
      <h1 id="tag-title">没有这个主题。</h1>
      <p>
        它可能已被重命名，或者链接拼写有误。
        <RouterLink to="/tags">回到主题索引</RouterLink>，或从
        <RouterLink to="/">本期</RouterLink>重新找起。
      </p>
    </div>
  </section>
</template>

<style scoped>
.index-page {
  padding-block: 36px 96px;
}

.index-page__back {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-decoration: none;
}

.index-page__back:hover,
.index-page__back:focus-visible {
  color: var(--accent);
}

.index-page__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24px;
  padding: 18px 0 22px;
  border-bottom: 1px solid var(--line);
}

.index-page__header h1,
.index-page__empty h1 {
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

.index-page__others {
  margin-top: 56px;
}

.index-page__others h2 {
  margin: 0 0 16px;
  font-family: var(--font-sans);
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.16em;
}

.index-page__empty {
  padding-top: 36px;
}

.index-page__empty p {
  max-width: 36rem;
  margin: 18px 0 0;
  color: var(--muted);
  font-family: var(--font-serif);
  line-height: 1.7;
}

.index-page__empty a {
  color: var(--accent);
  font-weight: 500;
}

@media (max-width: 760px) {
  .index-page__header {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
