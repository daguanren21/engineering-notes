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
  <ul class="topics">
    <li v-for="group in tagIndex" :key="group.slug">
      <RouterLink
        class="topic"
        :class="{ 'topic--active': group.slug === activeSlug }"
        :to="`/tags/${group.slug}`"
        :aria-current="group.slug === activeSlug ? 'page' : undefined"
      >
        <span>{{ group.tag }}</span>
        <span>{{ group.articles.length }}</span>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.topics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
}

.topic {
  display: flex;
  min-height: 52px;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 12px 14px 0;
  border-top: 1px solid var(--line);
  color: var(--ink);
  text-decoration: none;
}

.topic span:first-child {
  font-family: var(--font-serif);
  font-size: 1.02rem;
  font-weight: 600;
}

.topic span:last-child {
  color: var(--muted);
  font-family: var(--font-display);
  font-size: 0.78rem;
  font-weight: 700;
}

.topic:hover,
.topic:focus-visible,
.topic--active {
  color: var(--accent);
}

.topic:hover span:last-child,
.topic:focus-visible span:last-child,
.topic--active span:last-child {
  color: var(--accent);
}
</style>
