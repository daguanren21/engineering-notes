<script setup lang="ts">
import { useRoute } from "vue-router";

const route = useRoute();
const feedUrl = `${import.meta.env.BASE_URL}rss.xml`;
</script>

<template>
  <header class="site-header">
    <RouterLink class="brand" to="/" aria-label="工程手记首页">
      <span class="brand__seal" aria-hidden="true">工</span>
      <span class="brand__name">
        <strong>工程手记</strong>
        <small>ENGINEERING NOTES</small>
      </span>
    </RouterLink>

    <p class="site-header__statement">复杂系统的阅读、拆解与判断</p>

    <nav aria-label="主导航">
      <RouterLink to="/">最新</RouterLink>
      <RouterLink to="/#archive">归档</RouterLink>
      <RouterLink to="/tags">标签</RouterLink>
      <a :href="feedUrl" type="application/rss+xml">订阅</a>
    </nav>

    <span class="site-header__route" aria-hidden="true">
      {{ route.path === "/" ? "INDEX" : "NOTE" }}
    </span>
  </header>
</template>

<style scoped>
.site-header {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 1fr auto auto;
  align-items: center;
  gap: 28px;
  min-height: 82px;
  border-bottom: 1px solid var(--line-strong);
}

.brand {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 12px;
  color: var(--ink);
  text-decoration: none;
}

.brand__seal {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid var(--ink);
  color: var(--paper);
  background: var(--ink);
  font-family: var(--font-serif);
  font-size: 1.2rem;
  line-height: 1;
}

.brand__name {
  display: grid;
  gap: 2px;
}

.brand__name strong {
  font-family: var(--font-serif);
  font-size: 1.05rem;
  letter-spacing: 0.08em;
}

.brand__name small,
.site-header__statement,
.site-header__route,
.site-header nav {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
}

.brand__name small,
.site-header__statement,
.site-header__route {
  color: var(--muted);
}

.site-header__statement {
  justify-self: center;
}

.site-header nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.site-header nav a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  padding-inline: 12px;
  color: var(--muted);
  text-decoration: none;
}

.site-header nav a:hover,
.site-header nav a.router-link-active {
  color: var(--accent);
}

.site-header__route {
  justify-self: end;
  min-width: 72px;
  text-align: right;
}

@media (max-width: 860px) {
  .site-header {
    grid-template-columns: 1fr auto;
    min-height: 70px;
  }

  .site-header__statement,
  .site-header__route {
    display: none;
  }
}

@media (max-width: 520px) {
  .brand__seal {
    width: 36px;
    height: 36px;
  }

  .brand__name small {
    display: none;
  }

  .site-header {
    gap: 12px;
  }

  .site-header nav {
    font-size: 0.76rem;
  }

  .site-header nav a {
    padding-inline: 9px;
  }
}
</style>
