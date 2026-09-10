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

    <header class="article-hero">
      <div class="article-hero__rail">
        <RouterLink class="back-link" to="/#archive">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          全部笔记
        </RouterLink>
        <p>N° {{ issueLabel }}</p>
      </div>

      <div class="article-hero__main">
        <h1><span v-for="part in titleParts" :key="part">{{ part }}</span></h1>
        <p class="article-hero__description">{{ description }}</p>
        <ul class="article-hero__tags" aria-label="标签">
          <li v-for="tag in tags" :key="tag">
            <RouterLink :to="`/tags/${tagSlug(tag)}`">{{ tag }}</RouterLink>
          </li>
        </ul>
      </div>

      <aside class="article-summary" aria-label="文章信息">
        <dl>
          <div>
            <dt>体例</dt>
            <dd>{{ isSourceStudy ? "源码对照" : "阅读笔记" }}</dd>
          </div>
          <div>
            <dt>发布</dt>
            <dd><time :datetime="publishedAt">{{ formatDate(publishedAt) }}</time></dd>
          </div>
          <div>
            <dt>阅读</dt>
            <dd>{{ readingMinutes }} 分钟</dd>
          </div>
          <div>
            <dt>{{ isSourceStudy ? "资料作者" : "原作者" }}</dt>
            <dd>{{ sourceAuthor }}</dd>
          </div>
        </dl>
        <p v-if="isSourceStudy">
          源码与工作流对照笔记。
          <a :href="sourceUrl" target="_blank" rel="noopener noreferrer">查看主要来源</a>。
        </p>
        <p v-else>
          中文结构化解读，不是逐字翻译。论证、图表和附录以
          <a :href="sourceUrl" target="_blank" rel="noopener noreferrer">原文</a>
          为准。
        </p>
      </aside>
    </header>

    <div class="article-body">
      <nav class="contents" aria-label="文章目录">
        <div class="contents__heading">
          <span>阅读地图</span>
          <span>{{ sections.length }} 节</span>
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
          <p>END / N° {{ issueLabel }}</p>
          <div>
            <span v-if="isSourceStudy">源码样本与核验范围见正文</span>
            <span v-else-if="sourcePublishedAt">原文发表于 {{ formatDate(sourcePublishedAt) }}</span>
            <span v-else>原始资料未标注发布日期</span>
            <a :href="sourceUrl" target="_blank" rel="noopener noreferrer">
              {{ isSourceStudy ? "查看" : "阅读" }}《{{ sourceTitle }}》
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg>
            </a>
          </div>
        </footer>
      </div>
    </div>

    <section v-if="related.length" class="related" aria-labelledby="related-title">
      <div class="related__heading">
        <h2 id="related-title">同一主题的其它笔记</h2>
        <RouterLink to="/tags">按标签浏览</RouterLink>
      </div>
      <NoteList :articles="related" />
    </section>
  </article>
</template>

<style scoped>
.article {
  padding-bottom: clamp(86px, 10vw, 150px);
}

.reading-progress {
  position: fixed;
  z-index: 40;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
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

.article-hero {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) minmax(230px, 0.34fr);
  column-gap: clamp(32px, 5vw, 76px);
  row-gap: clamp(34px, 4vw, 54px);
  padding-block: clamp(44px, 6vw, 80px) clamp(64px, 8vw, 108px);
  border-bottom: 1px solid var(--line-strong);
}

.article-hero__rail {
  grid-row: 1 / 3;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: space-between;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
}

.back-link {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  align-self: flex-start;
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

.article-hero__main {
  grid-column: 2 / -1;
}

.article-hero__main h1 {
  max-width: 900px;
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(3.25rem, 5vw, 5rem);
  font-weight: 620;
  letter-spacing: -0.06em;
  line-height: 1.01;
  text-wrap: balance;
}

.article-hero__main h1 span {
  display: block;
  text-wrap: balance;
}

.article-hero__main h1 span:last-child {
  margin-top: 0.18em;
  font-size: 0.74em;
  letter-spacing: -0.035em;
}

.article-hero__description {
  max-width: 760px;
  margin: 32px 0 0;
  color: var(--muted);
  font-family: var(--font-serif);
  font-size: clamp(1.08rem, 1.6vw, 1.32rem);
  line-height: 1.75;
  text-wrap: pretty;
}

.article-hero__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 26px 0 0;
  padding: 0;
  list-style: none;
}

.article-hero__tags a {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  padding-inline: 12px;
  border: 1px solid var(--line);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.69rem;
  text-decoration: none;
  transition: color 160ms ease, border-color 160ms ease;
}

.article-hero__tags a:hover,
.article-hero__tags a:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
}

.article-summary {
  display: grid;
  grid-column: 2 / -1;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 0.55fr);
  gap: clamp(28px, 4vw, 56px);
  align-self: start;
  padding-top: 18px;
  border-top: 3px solid var(--accent);
}

.article-summary dl {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  margin: 0;
}

.article-summary dl div {
  display: grid;
  gap: 4px;
}

.article-summary dt,
.article-summary dd,
.article-summary > p {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.6;
}

.article-summary dt {
  color: var(--muted);
  font-family: var(--font-mono);
}

.article-summary dd {
  color: var(--ink);
}

.article-summary > p {
  margin-top: 0;
  color: var(--muted);
  text-wrap: pretty;
}

.article-summary a {
  color: var(--accent);
  font-weight: 700;
}

.article-body {
  display: grid;
  grid-template-columns: minmax(220px, 0.34fr) minmax(0, 760px) 1fr;
  gap: clamp(42px, 6vw, 92px);
  padding-top: clamp(56px, 7vw, 96px);
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
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.06em;
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
  font-size: 0.74rem;
  line-height: 1.45;
  text-decoration: none;
}

.contents a:hover,
.contents a:focus-visible {
  color: var(--accent);
}

.contents a span {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.62rem;
}

.prose {
  grid-column: 2;
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
  font-weight: 700;
  scroll-margin-top: 24px;
}

.prose :deep(h2) {
  margin: 4.8rem 0 0;
  padding: 1.2rem 0 0;
  border-top: 1px solid var(--line-strong);
  font-size: clamp(1.7rem, 2.8vw, 2.35rem);
  letter-spacing: -0.035em;
  line-height: 1.3;
}

.prose :deep(h3) {
  margin: 2.8rem 0 0;
  font-size: 1.22rem;
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
  font-weight: 760;
}

.prose :deep(a) {
  color: var(--accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.2em;
}

.prose :deep(blockquote) {
  position: relative;
  margin-block: 2.6rem;
  padding: 1.5rem 0;
  border-block: 1px solid var(--line-strong);
  color: var(--ink);
  font-size: 1.14em;
  line-height: 1.78;
  text-wrap: pretty;
}

.prose :deep(blockquote > :first-child) {
  margin-top: 0;
}

.prose :deep(:not(pre) > code) {
  padding: 0.15em 0.36em;
  border: 1px solid var(--line);
  border-radius: 2px;
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 0.83em;
  overflow-wrap: anywhere;
}

.prose :deep(pre) {
  max-width: 100%;
  padding: 1.25rem;
  border: 1px solid var(--line-strong);
  border-radius: 2px;
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
  margin-top: 5rem;
  padding-top: 22px;
  border-top: 3px solid var(--accent);
}

.article-end > p {
  margin: 0;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
}

.article-end > div {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  margin-top: 14px;
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.78rem;
}

.article-end a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent);
  font-weight: 700;
}

.article-end svg {
  width: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
}

.related {
  margin-top: clamp(72px, 9vw, 118px);
  padding-top: clamp(40px, 5vw, 62px);
  border-top: 1px solid var(--line-strong);
}

.related__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 30px;
}

.related__heading h2 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(1.5rem, 2.6vw, 2.2rem);
  font-weight: 560;
  letter-spacing: -0.035em;
  line-height: 1.2;
}

.related__heading a {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.69rem;
  font-weight: 700;
  white-space: nowrap;
}

@media (max-width: 1040px) {
  .article-hero {
    grid-template-columns: 110px minmax(0, 1fr);
  }

  .article-hero__main,
  .article-summary {
    grid-column: 2;
  }

  .article-body {
    grid-template-columns: minmax(190px, 0.32fr) minmax(0, 720px);
  }
}

@media (max-width: 760px) {
  .article-hero {
    grid-template-columns: 1fr;
    gap: 28px;
    padding-block: 36px;
  }

  .article-hero__rail {
    min-height: auto;
    grid-row: auto;
    flex-direction: row;
    align-items: center;
  }

  .article-hero__main {
    grid-column: 1;
  }

  .article-hero__main h1 {
    font-size: clamp(2.7rem, 12.7vw, 4.5rem);
    letter-spacing: -0.05em;
  }

  .article-summary {
    display: block;
    grid-column: 1;
  }

  .article-summary dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 20px;
  }

  .article-summary dl div {
    grid-template-columns: 1fr;
    gap: 3px;
  }

  .article-summary > p {
    margin-top: 24px;
  }

  .article-body {
    grid-template-columns: minmax(0, 1fr);
    gap: 36px;
    padding-top: 30px;
  }

  .contents,
  .prose {
    grid-column: 1;
  }

  .contents {
    position: static;
    max-height: none;
    padding: 18px;
    border: 1px solid var(--line);
    background: var(--surface);
  }

  .contents ol {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 16px;
  }

  .related__heading {
    flex-direction: column;
    gap: 10px;
    padding-bottom: 22px;
  }
}

@media (max-width: 500px) {
  .contents ol {
    grid-template-columns: 1fr;
  }

  .article-hero__main h1 {
    font-size: 2rem;
    line-height: 1.05;
  }

  .article-end > div {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .article-hero__tags a {
    transition: none;
  }
}
</style>
