<template>
  <footer class="site-footer">
    <div>
      <p class="site-footer__brand">工程手记</p>
      <p>写给正在做决定的人，也写给六个月后的自己。</p>
    </div>
    <div class="site-footer__meta">
      <span>STATIC / VITE SSG</span>
      <a href="#main-content">回到顶部</a>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  padding-block: 42px 58px;
  border-top: 1px solid var(--line-strong);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.7;
}

.site-footer__brand {
  margin-bottom: 6px;
  color: var(--ink);
  font-family: var(--font-serif);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.site-footer__meta {
  display: flex;
  align-items: center;
  gap: 24px;
}

.site-footer a {
  color: var(--accent);
}

@media (max-width: 620px) {
  .site-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .site-footer__meta {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
