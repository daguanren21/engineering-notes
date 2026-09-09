<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import modelSource from "./model.ts?raw";
import { runExample, type ContextMode } from "./model";

const props = defineProps<{
  mode: ContextMode;
}>();

const output = shallowRef<string | null>(null);
const executedMode = shallowRef<ContextMode | null>(null);
const actionFeedback = shallowRef("");

const runnableSource = computed(
  () =>
    `${modelSource.trimEnd()}\n\nconsole.log(JSON.stringify(runExample("${props.mode}"), null, 2));\n`,
);

watch(
  () => props.mode,
  () => {
    output.value = null;
    executedMode.value = null;
    actionFeedback.value = "";
  },
);

function runCurrentExample(): void {
  const result = runExample(props.mode);
  output.value = JSON.stringify(result, null, 2);
  executedMode.value = props.mode;
  actionFeedback.value = `已直接调用 runExample("${props.mode}")；下方 JSON 是本次真实返回值。`;
}

async function copyRunnableSource(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    actionFeedback.value = "剪贴板不可用；请在源码区域手动选择并复制。";
    return;
  }

  try {
    await navigator.clipboard.writeText(runnableSource.value);
    actionFeedback.value = "已复制实际 model.ts 与当前模式的调用语句。";
  } catch {
    actionFeedback.value = "浏览器未允许写入剪贴板；请在源码区域手动选择并复制。";
  }
}
</script>

<template>
  <section class="code-experiment" aria-labelledby="code-experiment-title">
    <header class="code-experiment__header">
      <div>
        <p>RUN THE MODEL</p>
        <h3 id="code-experiment-title">检查实际源码，而不是相信示意图</h3>
      </div>
      <p>
        “运行”会直接调用已导入的 <code>runExample</code>。没有 <code>eval</code>、模型请求或外部副作用。
      </p>
    </header>

    <details class="source-disclosure">
      <summary>查看实际 model.ts 与当前调用</summary>
      <pre class="source-code" tabindex="0" aria-label="实际 TypeScript 源码"><code>{{ runnableSource }}</code></pre>
    </details>

    <p>复制后保存为 <code>demo.ts</code>，使用 Node 24+ 执行 <code>node demo.ts</code>。</p>

    <div class="code-experiment__actions">
      <button type="button" @click="runCurrentExample">
        运行 {{ mode }} 示例
      </button>
      <button type="button" class="secondary-action" @click="copyRunnableSource">
        复制可运行源码
      </button>
    </div>

    <p
      v-if="actionFeedback"
      class="code-experiment__feedback"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ actionFeedback }}
    </p>

    <section class="result-panel" aria-labelledby="result-title">
      <div class="result-panel__heading">
        <p>EXECUTION OUTPUT</p>
        <h3 id="result-title">
          {{ executedMode ? `${executedMode} 返回值` : "等待运行" }}
        </h3>
      </div>
      <pre
        v-if="output"
        class="result-output"
        tabindex="0"
        :aria-label="`${executedMode} 模式的真实执行结果`"
      ><code>{{ output }}</code></pre>
      <p v-else class="result-panel__empty">
        选择当前模式后点击“运行”，这里会显示 <code>runExample</code> 返回的完整 JSON。
      </p>
    </section>
  </section>
</template>

<style scoped>
.code-experiment {
  min-width: 0;
  margin-top: 28px;
  padding: clamp(18px, 3vw, 28px);
  border: 1px solid var(--line-strong);
  border-top: 3px solid var(--accent);
  color: var(--ink-soft);
  background: var(--surface);
}

.code-experiment p {
  margin: 0;
}

.code-experiment__header {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: clamp(20px, 4vw, 40px);
  align-items: end;
}

.code-experiment__header > div > p,
.result-panel__heading > p {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.code-experiment__header h3,
.result-panel__heading h3 {
  margin: 5px 0 0;
  color: var(--ink);
  font-size: 1.08rem;
  line-height: 1.38;
}

.code-experiment__header > p {
  color: var(--muted);
  font-family: var(--font-serif);
  font-size: 0.86rem;
  line-height: 1.65;
}

.code-experiment code {
  font-family: var(--font-mono);
}

.code-experiment__header > p code,
.result-panel__empty code {
  padding: 0.08em 0.28em;
  border: 1px solid var(--line);
  color: var(--ink);
  background: var(--paper);
  font-size: 0.82em;
}

.source-disclosure {
  min-width: 0;
  margin-top: 20px;
  border: 1px solid var(--line);
  background: var(--paper);
}

.source-disclosure summary {
  padding: 12px 14px;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.source-disclosure summary:focus-visible {
  border-radius: 2px;
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}

.source-disclosure[open] summary {
  border-bottom: 1px solid var(--line);
}

.code-experiment .source-code,
.code-experiment .result-output {
  width: 100%;
  max-width: 100%;
  margin: 0;
  border: 0;
  border-radius: 0;
  color: var(--code-ink);
  background: var(--code);
  font-family: var(--font-mono);
  font-size: 0.69rem;
  line-height: 1.65;
  overflow: auto;
  overscroll-behavior: contain;
  white-space: pre;
}

.code-experiment .source-code {
  max-height: 30rem;
  padding: 16px;
}

.code-experiment .source-code:focus-visible,
.code-experiment .result-output:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: -4px;
}

.code-experiment__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.code-experiment__actions button {
  min-height: 42px;
  padding: 9px 13px;
  border: 1px solid var(--accent);
  border-radius: 2px;
  color: var(--paper);
  background: var(--accent);
  font: 700 0.75rem/1.2 var(--font-sans);
  cursor: pointer;
  transition:
    color 140ms ease-out,
    background-color 140ms ease-out,
    border-color 140ms ease-out;
}

.code-experiment__actions button:hover {
  color: var(--accent);
  background: var(--paper);
}

.code-experiment__actions .secondary-action {
  border-color: var(--line-strong);
  color: var(--ink);
  background: var(--paper);
}

.code-experiment__actions .secondary-action:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.code-experiment__feedback {
  margin-top: 11px;
  color: var(--muted);
  font-size: 0.74rem;
  line-height: 1.55;
}

.result-panel {
  min-width: 0;
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.result-panel__heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.code-experiment .result-output {
  max-height: 24rem;
  margin-top: 12px;
  padding: 16px;
}

.result-panel__empty {
  margin-top: 12px;
  padding: 16px;
  border: 1px dashed var(--line-strong);
  color: var(--muted);
  font-family: var(--font-serif);
  font-size: 0.8rem;
  line-height: 1.65;
}

@media (max-width: 640px) {
  .code-experiment__header {
    grid-template-columns: minmax(0, 1fr);
  }

  .code-experiment__actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .code-experiment__actions button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .code-experiment__actions button {
    transition-duration: 0.01ms;
  }
}
</style>
