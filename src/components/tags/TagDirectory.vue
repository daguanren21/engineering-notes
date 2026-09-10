<script setup lang="ts">
import { tagIndex } from "../../content/tags";

withDefaults(
  defineProps<{
    activeSlug?: string;
  }>(),
  { activeSlug: undefined },
);
</script>

<template>
  <ul class="tags">
    <li v-for="group in tagIndex" :key="group.slug">
      <RouterLink
        class="tag"
        :class="{ 'tag--active': group.slug === activeSlug }"
        :to="`/tags/${group.slug}`"
        :aria-current="group.slug === activeSlug ? 'page' : undefined"
      >
        <span class="tag__name">{{ group.tag }}</span>
        <span class="tag__count">{{ group.articles.length }} 篇</span>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.tags {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line-strong);
  list-style: none;
}

.tags li {
  border-bottom: 1px solid var(--line);
}

.tag {
  display: flex;
  min-height: 64px;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 14px 14px 0;
  color: var(--ink);
  text-decoration: none;
}

.tag__name {
  font-family: var(--font-serif);
  font-size: 1.05rem;
  font-weight: 620;
  letter-spacing: -0.01em;
  line-height: 1.35;
}

.tag__count {
  flex: none;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.67rem;
  white-space: nowrap;
}

.tag:hover .tag__name,
.tag:focus-visible .tag__name {
  color: var(--accent);
}

.tag--active .tag__name {
  color: var(--accent);
}

.tag--active .tag__count {
  color: var(--accent);
}
</style>
