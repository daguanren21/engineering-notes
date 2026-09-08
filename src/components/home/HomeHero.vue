<script setup lang="ts">
import type { Article } from "../../content/articles";
import { formatDate } from "../../content/articles";

defineProps<{
  article: Article;
}>();
</script>

<template>
  <section class="hero" aria-labelledby="home-title">
    <div class="hero__copy">
      <p class="eyebrow">ENGINEERING NOTES / 工程阅读档案</p>
      <h1 id="home-title">
        <span class="hero__line">复杂系统，</span>
        <span class="hero__line hero__line--accent">值得写清楚。</span>
      </h1>
      <p class="hero__lede">
        不追逐资讯，只整理经得起复用的工程判断。<span class="no-break">每篇笔记</span>都保留<span class="no-break">问题、约束、证据与结论。</span>
      </p>
      <ul class="hero__principles" aria-label="内容原则">
        <li><span>01</span>先还原问题</li>
        <li><span>02</span>再辨认边界</li>
        <li><span>03</span>最后留下判断</li>
      </ul>
    </div>

    <RouterLink class="featured" :to="article.href">
      <div class="featured__topline">
        <span>最新笔记</span>
        <span>ISSUE {{ String(article.issue).padStart(2, "0") }}</span>
      </div>
      <div class="featured__index" aria-hidden="true">{{ String(article.issue).padStart(2, "0") }}</div>
      <div class="featured__body">
        <p>{{ article.tags.join(" / ") }}</p>
        <h2><span v-for="part in article.titleParts" :key="part">{{ part }}</span></h2>
        <p class="featured__description">{{ article.description }}</p>
      </div>
      <div class="featured__footer">
        <span>{{ formatDate(article.publishedAt) }} · {{ article.readingMinutes }} 分钟</span>
        <span class="featured__action">
          阅读全文
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
        </span>
      </div>
    </RouterLink>
  </section>
</template>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: minmax(0, 0.82fr) minmax(500px, 1.18fr);
  gap: clamp(44px, 5vw, 72px);
  align-items: stretch;
  padding-block: clamp(52px, 5vw, 72px) clamp(60px, 6vw, 76px);
}

.hero__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.hero h1 {
  max-width: 780px;
  margin: 26px 0 0;
  font-family: var(--font-serif);
  font-size: clamp(3.7rem, 5.5vw, 5rem);
  font-weight: 560;
  letter-spacing: -0.065em;
  line-height: 0.97;
}

.hero__line {
  display: block;
  white-space: nowrap;
}

.hero__line--accent {
  color: var(--accent);
}

.hero__lede {
  max-width: 620px;
  margin: 38px 0 0;
  color: var(--muted);
  font-family: var(--font-serif);
  font-size: clamp(1.05rem, 1.5vw, 1.28rem);
  line-height: 1.8;
}

.no-break {
  white-space: nowrap;
}

.hero__principles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin: auto 0 0;
  padding: 54px 0 0;
  list-style: none;
}

.hero__principles li {
  display: grid;
  gap: 7px;
  padding-top: 11px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.78rem;
}

.hero__principles span {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.65rem;
}

.featured {
  position: relative;
  display: grid;
  min-height: 480px;
  grid-template-rows: auto 1fr auto;
  padding: clamp(24px, 3vw, 38px);
  border: 1px solid var(--line-strong);
  color: var(--ink);
  background:
    linear-gradient(90deg, transparent 0 56px, var(--accent-soft) 56px 57px, transparent 57px),
    var(--surface);
  text-decoration: none;
  transition: border-color 180ms ease, transform 180ms ease;
}

.featured:hover,
.featured:focus-visible {
  border-color: var(--accent);
  transform: translateY(-3px);
}

.featured__topline,
.featured__footer {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.featured__index {
  position: absolute;
  top: 80px;
  left: 18px;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  writing-mode: vertical-rl;
}

.featured__body {
  align-self: center;
  padding: 52px 0 42px 46px;
}

.featured__body > p:first-child {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
}

.featured h2 {
  margin: 16px 0 0;
  font-family: var(--font-serif);
  font-size: clamp(2rem, 3.5vw, 3.55rem);
  font-weight: 620;
  letter-spacing: -0.045em;
  line-height: 1.12;
  text-wrap: balance;
}

.featured h2 span {
  display: block;
  white-space: nowrap;
}

.featured__description {
  margin: 24px 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.75;
}

.featured__action {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 7px;
  border-bottom: 2px solid var(--accent);
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 700;
}

.featured__action svg {
  width: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
  transition: transform 180ms ease;
}

.featured:hover .featured__action svg,
.featured:focus-visible .featured__action svg {
  transform: translateX(4px);
}

@media (max-width: 980px) {
  .hero {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero__principles {
    margin-top: 46px;
    padding-top: 0;
  }

  .featured {
    min-height: 480px;
  }
}

@media (max-width: 560px) {
  .hero {
    gap: 30px;
    padding-block: 34px 56px;
  }

  .hero h1 {
    margin-top: 20px;
    font-size: 2.55rem;
    line-height: 1.02;
  }

  .hero__lede {
    margin-top: 22px;
  }

  .hero__principles {
    gap: 10px;
    margin-top: 24px;
  }

  .hero__principles li {
    font-size: 0.75rem;
  }

  .featured {
    min-height: 320px;
    padding: 20px;
    background:
      linear-gradient(90deg, transparent 0 38px, var(--accent-soft) 38px 39px, transparent 39px),
      var(--surface);
  }

  .featured__index {
    left: 10px;
  }

  .featured__body {
    padding: 36px 0 18px 30px;
  }

  .featured h2 {
    font-size: 1.6rem;
  }

  .featured__description {
    display: none;
  }

  .featured__footer > span:first-child {
    white-space: nowrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .featured,
  .featured__action svg {
    transition: none;
  }
}
</style>
