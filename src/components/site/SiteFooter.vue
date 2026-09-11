<template>
  <footer class="site-footer">
    <p class="site-footer__brand">工程手记</p>
    <p>写给正在做决定的人，也写给六个月后的自己。</p>
    <a href="#main-content">回到刊头</a>
  </footer>
</template>

<style scoped>
.site-footer {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 24px;
  align-items: baseline;
  padding-block: 36px 64px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.82rem;
  font-weight: 400;
  letter-spacing: 0;
}

.site-footer__brand {
  color: var(--ink);
  font-family: var(--font-display);
  font-weight: 500;
  letter-spacing: 0.08em;
}

.site-footer a {
  color: var(--ink);
}

.site-footer a:hover,
.site-footer a:focus-visible {
  color: var(--accent);
}

@media (max-width: 620px) {
  .site-footer {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}
</style>
