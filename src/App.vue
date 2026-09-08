<script setup lang="ts">
import { useHead } from "@unhead/vue";
import SiteFooter from "./components/site/SiteFooter.vue";
import SiteHeader from "./components/site/SiteHeader.vue";

useHead({ htmlAttrs: { lang: "zh-CN" } });
</script>

<template>
  <a class="skip-link" href="#main-content">跳到正文</a>
  <div class="site-shell">
    <SiteHeader />
    <main id="main-content">
      <RouterView />
    </main>
    <SiteFooter />
  </div>
</template>
