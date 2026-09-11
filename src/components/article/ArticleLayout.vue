<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed } from "vue";
import { articlesSharingTags, tagSlug } from "../../content/tags";
import { useReadingProgress } from "../../composables/useReadingProgress";
import type { ArticleFrontmatter } from "../../content/schema";
import { formatDate } from "../../content/articles";
import NoteList from "../tags/NoteList.vue";

const props = withDefaults(
  defineProps<ArticleFrontmatter & { slug?: string }>(),
  { slug: "" },
);
const issueLabel = computed(() => String(props.issue).padStart(2, "0"));
const isSourceStudy = computed(() => props.sourceKind === "source-code");

const progress = useReadingProgress();
const progressStyle = computed(() => ({ transform: `scaleX(${progress.value})` }));

const related = computed(() => articlesSharingTags({ slug: props.slug, tags: props.tags }));

useHead({
  title: computed(() => `${props.title} · 工程手记`),
  meta: [
    { name: "description", content: props.description },
    { property: "og:type", content: "article" },
    { property: "og:title", content: props.title },
    { property: "og:description", content: props.description },
    { property: "article:published_time", content: props.publishedAt },
  ],
});
</script>

<template>
  <article class="article">
    <div class="reading-progress" aria-hidden="true"><span :style="progressStyle" /></div>

    <header class="folio">
      <RouterLink class="folio__back" to="/#archive">← 过刊</RouterLink>
      <h1>
        <span v-for="part in titleParts" :key="part">{{ part }}</span>
      </h1>
      <p class="folio__lede">{{ description }}</p>
      <p class="folio__meta">
        <time :datetime="publishedAt">{{ formatDate(publishedAt) }}</time>
        · {{ readingMinutes }} 分钟
        · {{ isSourceStudy ? "源码对照" : "阅读笔记" }}
        · {{ sourceAuthor }}
      </p>
      <ul class="folio__tags" aria-label="标签">
        <li v-for="tag in tags" :key="tag">
          <RouterLink :to="`/tags/${tagSlug(tag)}`">{{ tag }}</RouterLink>
        </li>
      </ul>
    </header>

    <div class="article-body">
      <nav class="contents" aria-label="本期目录">
        <div class="contents__heading">
          <span>本期目录</span>
          <span>{{ sections.length }}</span>
        </div>
        <ol>
          <li v-for="(section, index) in sections" :key="section.id">
            <a :href="`#${section.id}`">
              <span>{{ String(index + 1).padStart(2, "0") }}</span>
              {{ section.label }}
            </a>
          </li>
        </ol>
      </nav>

      <div class="prose">
        <slot />

        <footer class="article-end">
          <p>第 {{ issueLabel }} 期终</p>
          <div>
            <span v-if="isSourceStudy">源码样本与核验范围见正文</span>
            <span v-else-if="sourcePublishedAt">原文发表于 {{ formatDate(sourcePublishedAt) }}</span>
            <span v-else>原始资料未标注发布日期</span>
            <a :href="sourceUrl" target="_blank" rel="noopener noreferrer">
              {{ isSourceStudy ? "查看" : "阅读" }}《{{ sourceTitle }}》
            </a>
          </div>
        </footer>
      </div>
    </div>

    <section v-if="related.length" class="related" aria-labelledby="related-title">
      <div class="related__heading">
        <h2 id="related-title">同主题过刊</h2>
        <RouterLink to="/tags">主题索引</RouterLink>
      </div>
      <NoteList :articles="related" />
    </section>
  </article>
</template>

<style scoped>
.article {
  padding-bottom: 96px;
}

.reading-progress {
  position: fixed;
  z-index: 40;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  pointer-events: none;
}

.reading-progress span {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: 0 50%;
}

.folio {
  padding-block: clamp(40px, 6vw, 84px) clamp(48px, 7vw, 92px);
  border-bottom: 1px solid var(--line);
}

.folio__back,
.folio__meta,
.folio__tags a,
.contents__heading,
.contents a span,
.article-end > p,
.related__heading a {
  font-family: var(--font-sans);
  font-weight: 400;
  letter-spacing: 0;
}

.folio__back {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  color: var(--muted);
  text-decoration: none;
}

.folio__back:hover,
.folio__back:focus-visible {
  color: var(--accent);
}

.folio h1 {
  max-width: 18em;
  margin: 8px 0 0;
  font-family: var(--font-serif);
  font-size: clamp(2.4rem, 5.6vw, 4.6rem);
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 0.98;
}

.folio h1 span {
  display: block;
}

.folio__lede {
  max-width: 40rem;
  margin: 22px 0 0;
  color: var(--ink-soft);
  font-family: var(--font-serif);
  font-size: clamp(1.08rem, 1.6vw, 1.28rem);
  line-height: 1.7;
}

.folio__meta {
  margin: 22px 0 0;
  color: var(--muted);
  font-size: 0.82rem;
}

.folio__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.folio__tags a {
  color: var(--ink);
  font-size: 0.78rem;
}

.folio__tags a:hover,
.folio__tags a:focus-visible {
  color: var(--accent);
}

.article-body {
  display: grid;
  grid-template-columns: minmax(180px, 0.28fr) minmax(0, 42rem);
  gap: clamp(36px, 5vw, 72px);
  padding-top: clamp(40px, 6vw, 72px);
}

.contents {
  position: sticky;
  top: 24px;
  align-self: start;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}

.contents__heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line-strong);
  color: var(--muted);
  font-size: 0.72rem;
}

.contents ol {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.contents a {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px;
  padding-block: 7px;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.45;
  text-decoration: none;
}

.contents a:hover,
.contents a:focus-visible {
  color: var(--accent);
}

.contents a span {
  color: var(--accent);
  font-size: 0.72rem;
}

.prose {
  min-width: 0;
  color: var(--ink-soft);
  font-family: var(--font-serif);
  font-size: clamp(1.05rem, 1.35vw, 1.18rem);
  line-height: 1.92;
}

.prose :deep(> :first-child) {
  margin-top: 0;
}

.prose :deep(h2),
.prose :deep(h3) {
  color: var(--ink);
  font-family: var(--font-sans);
  font-weight: 500;
  scroll-margin-top: 24px;
}

.prose :deep(h2) {
  margin: 4.2rem 0 0;
  padding: 1.1rem 0 0;
  border-top: 1px solid var(--line-strong);
  font-size: clamp(1.5rem, 2.4vw, 2rem);
  letter-spacing: -0.03em;
  line-height: 1.25;
}

.prose :deep(h3) {
  margin: 2.4rem 0 0;
  font-size: 1.15rem;
  line-height: 1.4;
}

.prose :deep(> p),
.prose :deep(> ul),
.prose :deep(> ol),
.prose :deep(> blockquote),
.prose :deep(> pre),
.prose :deep(> table) {
  margin: 1.35em 0 0;
}

.prose :deep(p) {
  text-wrap: pretty;
}

.prose :deep(> ul),
.prose :deep(> ol) {
  padding-left: 1.25em;
}

.prose :deep(> ul > li + li),
.prose :deep(> ol > li + li) {
  margin-top: 0.4em;
}

.prose :deep(strong) {
  color: var(--ink);
  font-weight: 500;
}

.prose :deep(a) {
  color: var(--accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.2em;
}

.prose :deep(blockquote) {
  margin-block: 2.4rem;
  padding: 1.4rem 0;
  border-block: 1px solid var(--line-strong);
  color: var(--ink);
  font-size: 1.12em;
  line-height: 1.78;
}

.prose :deep(blockquote > :first-child) {
  margin-top: 0;
}

.prose :deep(:not(pre) > code) {
  padding: 0.15em 0.36em;
  border: 1px solid var(--line);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 0.83em;
  overflow-wrap: anywhere;
}

.prose :deep(pre) {
  max-width: 100%;
  padding: 1.25rem;
  border: 1px solid var(--line-strong);
  color: var(--code-ink);
  background: var(--code);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  line-height: 1.65;
  overflow-x: auto;
}

.prose :deep(table) {
  display: block;
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-sans);
  font-size: 0.84rem;
  line-height: 1.55;
  overflow-x: auto;
}

.prose :deep(th),
.prose :deep(td) {
  min-width: 140px;
  padding: 11px 13px;
  border: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

.prose :deep(th) {
  color: var(--ink);
  background: var(--surface);
}

.prose :deep(hr) {
  margin-block: 4rem;
  border: 0;
  border-top: 1px solid var(--line-strong);
}

.article-end {
  margin-top: 4.5rem;
  padding-top: 22px;
  border-top: 1px solid var(--line);
}

.article-end > p {
  margin: 0;
  color: var(--accent);
  font-size: 0.78rem;
}

.article-end > div {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  margin-top: 14px;
  color: var(--muted);
  font-family: var(--font-serif);
  font-size: 0.9rem;
}

.article-end a {
  color: var(--accent);
  font-weight: 500;
}

.related {
  margin-top: 72px;
  padding-top: 36px;
  border-top: 1px solid var(--line-strong);
}

.related__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 18px;
}

.related__heading h2 {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.16em;
}

.related__heading a {
  color: var(--accent);
  font-size: 0.78rem;
  text-decoration: none;
}

@media (max-width: 760px) {
  .article-body {
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
    padding-top: 28px;
  }

  .contents {
    position: static;
    max-height: none;
  }

  .related__heading {
    flex-direction: column;
    gap: 8px;
  }

  .article-end > div {
    flex-direction: column;
  }
}
</style>
