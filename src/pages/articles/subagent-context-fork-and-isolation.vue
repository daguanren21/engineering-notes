<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { onMounted } from "vue";
import { useRouter } from "vue-router";

const canonicalTarget = "articles/pi-prompt-cache-strategies#subagent-demo";
const redirectHref = `${import.meta.env.BASE_URL}${canonicalTarget}`;
const router = useRouter();

useHead({
  title: "文章已合并 · 工程手记",
  link: [{ rel: "canonical", href: redirectHref }],
  meta: [{ "http-equiv": "refresh", content: `0; url=${redirectHref}` }],
});

onMounted(() => {
  void router.replace(`/${canonicalTarget}`);
});
</script>

<template>
  <section class="redirect" aria-labelledby="redirect-title">
    <h1 id="redirect-title" class="redirect__title">文章已合并</h1>
    <p class="redirect__copy">
      子代理上下文分析现已并入《OMP 源码分析：子代理、Token 缓存与结构化输出》。
    </p>
    <a class="redirect__link" :href="redirectHref">前往合并后的子代理章节</a>
  </section>
</template>

<style scoped>
.redirect {
  max-width: 680px;
  min-height: 52vh;
  padding-block: clamp(72px, 12vw, 152px);
}

.redirect__title {
  font-family: var(--font-display);
  font-size: clamp(2.6rem, 7vw, 5.4rem);
  font-weight: 700;
  letter-spacing: -0.045em;
  line-height: 0.96;
}

.redirect__copy {
  max-width: 42rem;
  margin-top: 28px;
  color: var(--ink-soft);
  line-height: 1.8;
}

.redirect__link {
  display: inline-block;
  margin-top: 24px;
  color: var(--accent);
  font-weight: 700;
}
</style>
