<script setup lang="ts">
import { computed } from "vue";
import type { ContextKind } from "./model";
import type { AgentFrame } from "./scenarios";

const props = defineProps<{
  frame: AgentFrame;
  role: "parent" | "child";
  version: number;
}>();

const KIND_LABELS: Readonly<Record<ContextKind, string>> = {
  fact: "事实",
  hypothesis: "假设",
  constraint: "约束",
  task: "任务",
  result: "结果",
};

const roleLabel = computed(() =>
  props.role === "parent" ? "PARENT CONTEXT" : "CHILD CONTEXT",
);
const versionLabel = computed(() => String(props.version).padStart(2, "0"));
</script>

<template>
  <article class="agent-card" :data-role="role">
    <header class="agent-card__header">
      <div class="agent-card__identity">
        <p>{{ roleLabel }}</p>
        <h3>{{ frame.label }}</h3>
      </div>
      <div class="agent-card__version" aria-label="上下文版本和条目数">
        <span>v{{ versionLabel }}</span>
        <strong>{{ frame.context.length }} 条</strong>
      </div>
    </header>

    <p class="agent-card__note">{{ frame.note }}</p>

    <ul v-if="frame.context.length" class="agent-card__items">
      <li v-for="item in frame.context" :key="item.id" class="context-item">
        <div class="context-item__meta">
          <span class="context-item__kind" :data-kind="item.kind">
            {{ KIND_LABELS[item.kind] }}
          </span>
          <code>{{ item.id }}</code>
        </div>
        <p>{{ item.text }}</p>
      </li>
    </ul>
    <p v-else class="agent-card__empty">当前上下文为空。</p>
  </article>
</template>

<style scoped>
.agent-card {
  display: flex;
  min-width: 0;
  height: 100%;
  flex-direction: column;
  padding: 16px;
  border: 1px solid var(--line-strong);
  border-top: 3px solid var(--line-strong);
  color: var(--ink-soft);
  background: var(--paper);
}

.agent-card[data-role="parent"] {
  border-top-color: var(--accent);
}

.agent-card__header {
  display: flex;
  min-width: 0;
  align-items: start;
  justify-content: space-between;
  gap: 14px;
}

.agent-card__identity {
  min-width: 0;
}

.agent-card__identity p {
  margin: 0;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.61rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.agent-card__identity h3 {
  margin: 4px 0 0;
  color: var(--ink);
  font-size: 1rem;
  line-height: 1.35;
}

.agent-card__version {
  display: grid;
  flex: 0 0 auto;
  justify-items: end;
  gap: 2px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.61rem;
  font-variant-numeric: tabular-nums;
}

.agent-card__version strong {
  color: var(--ink);
  font-size: 0.68rem;
}

.agent-card__note {
  margin: 12px 0 0;
  min-height: 2.8em;
  color: var(--muted);
  font-family: var(--font-serif);
  font-size: 0.78rem;
  line-height: 1.55;
}

.agent-card__items {
  display: grid;
  min-width: 0;
  gap: 8px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}

.context-item {
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
}

.context-item__meta {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}

.context-item__kind {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 21px;
  padding: 2px 6px;
  border: 1px solid var(--line-strong);
  color: var(--ink);
  background: var(--paper);
  font-family: var(--font-mono);
  font-size: 0.61rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.context-item__kind[data-kind="hypothesis"] {
  border-style: dashed;
  color: var(--muted);
}

.context-item__kind[data-kind="constraint"] {
  border-color: var(--accent);
  color: var(--accent);
}

.context-item__kind[data-kind="task"] {
  color: var(--paper);
  background: var(--ink);
}

.context-item__kind[data-kind="result"] {
  border-color: var(--accent);
  color: var(--paper);
  background: var(--accent);
}

.context-item__meta code {
  min-width: 0;
  padding: 0;
  border: 0;
  color: var(--muted);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 0.56rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
  text-align: right;
}

.context-item > p {
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-family: var(--font-serif);
  font-size: 0.78rem;
  line-height: 1.62;
  overflow-wrap: anywhere;
}

.agent-card__empty {
  display: grid;
  min-height: 92px;
  place-items: center;
  margin: 14px 0 0;
  border: 1px dashed var(--line-strong);
  color: var(--muted);
  font-size: 0.76rem;
}

@media (max-width: 460px) {
  .agent-card__header {
    align-items: start;
  }

  .agent-card__note {
    min-height: 0;
  }

  .context-item__meta {
    align-items: start;
    flex-direction: column;
  }

  .context-item__meta code {
    text-align: left;
  }
}
</style>
