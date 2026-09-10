<script setup lang="ts">
import { computed, shallowRef, useId, watch } from "vue";
import source from "./model.ts?raw";
import { runCacheExample, type CacheScenario } from "./model";

const id = useId();
const scenario = shallowRef<CacheScenario>("append");
const historyTokens = shallowRef(45000);
const newTokens = shallowRef(1000);
const cacheAvailable = shallowRef(true);
const replay = shallowRef(0);
const output = shallowRef("");
const choices: { value: CacheScenario; label: string; explanation: string }[] = [
  { value: "append", label: "只追加新结果", explanation: "旧前缀保持一致，新增结果需要处理。" },
  { value: "tools", label: "修改工具定义", explanation: "第一个块改变，后面即使相同也不再属于相同前缀。" },
  { value: "system", label: "修改 System", explanation: "工具块仍可复用；System 后面的历史需要重新处理。" },
  { value: "compact", label: "压缩历史", explanation: "工具和 System 保留，历史被替换；缓存前缀随之改变。" },
];
const number = (value: number) => value.toLocaleString("en-US");
const result = computed(() => runCacheExample(scenario.value, historyTokens.value, newTokens.value, cacheAvailable.value));
const explanation = computed(() => {
  if (!cacheAvailable.value) return "没有可复用缓存时，相同前缀也不会命中，例如条目已过期或请求未到达持有缓存的机器。";
  const base = choices.find((choice) => choice.value === scenario.value)!.explanation;
  if (scenario.value !== "compact") return base;
  const reduction = result.value.previous[2].tokens - result.value.current[2].tokens;
  return `${base} ${reduction > 0 ? `总输入减少 ${number(reduction)} tokens。` : "本次总输入没有减少。"}`;
});
const rate = computed(() => result.value.hitRate === null ? "—" : `${result.value.hitRate.toFixed(1)}%`);
const runnableSource = computed(() => `${source.trimEnd()}\n\nconsole.log(JSON.stringify(runCacheExample("${scenario.value}", ${historyTokens.value}, ${newTokens.value}, ${cacheAvailable.value}), null, 2));\n`);

watch([scenario, historyTokens, newTokens, cacheAvailable], () => {
  replay.value += 1;
  output.value = "";
});

function runCode(): void {
  output.value = JSON.stringify(runCacheExample(scenario.value, historyTokens.value, newTokens.value, cacheAvailable.value), null, 2);
}

function blockStatus(index: number): string {
  if (index < result.value.matchedBlocks) return "命中";
  if (index >= result.value.previous.length) return "新增";
  if (!cacheAvailable.value) return "缓存不可用";
  const before = result.value.previous[index];
  const after = result.value.current[index];
  return before.signature !== after.signature || before.tokens !== after.tokens
    ? "内容改变"
    : "前缀已改变";
}
</script>

<template>
  <section class="cache-demo" aria-labelledby="交互演示">
    <h2 id="交互演示">交互演示：相同内容不一定命中</h2>
    <p class="cache-note">块级示意：按 Anthropic 的 Tools、System、Messages 顺序，假定各块末端已有可用缓存断点。忽略最小缓存长度和查找粒度，不是实际分词或报价。</p>

    <div class="cache-controls">
      <label :for="`${id}-scenario`">
        本次请求改变什么
        <select :id="`${id}-scenario`" v-model="scenario">
          <option v-for="choice in choices" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
        </select>
      </label>
      <label class="cache-availability">
        <input v-model="cacheAvailable" type="checkbox" />
        上次前缀的缓存仍可复用
      </label>
      <label :for="`${id}-history`">
        历史消息 <output>{{ number(historyTokens) }} tokens</output>
        <input :id="`${id}-history`" v-model.number="historyTokens" type="range" min="1000" max="100000" step="1000" />
      </label>
      <label :for="`${id}-new`">
        新增结果 <output>{{ number(newTokens) }} tokens</output>
        <input :id="`${id}-new`" v-model.number="newTokens" type="range" min="500" max="20000" step="500" />
      </label>
    </div>

    <div class="request-row">
      <h3>上次请求</h3>
      <ol class="cache-blocks">
        <li v-for="(block, index) in result.previous" :key="index">
          <small>0{{ index + 1 }}</small><strong>{{ block.label }}</strong><span>{{ number(block.tokens) }} tokens</span>
        </li>
      </ol>
    </div>
    <div class="request-row">
      <h3>本次请求</h3>
      <ol class="cache-blocks">
        <li v-for="(block, index) in result.current" :key="index" :data-hit="index < result.matchedBlocks">
          <small>0{{ index + 1 }} · {{ blockStatus(index) }}</small>
          <strong>{{ block.label }}</strong><span>{{ number(block.tokens) }} tokens</span>
        </li>
      </ol>
    </div>

    <p class="cache-explanation" aria-live="polite">{{ explanation }}</p>
    <div class="cache-metrics">
      <div><span>总输入</span><strong>{{ number(result.totalInput) }}</strong></div>
      <div><span>缓存读取</span><strong>{{ number(result.cacheRead) }}</strong></div>
      <div><span>未命中输入</span><strong>{{ number(result.uncachedInput) }}</strong></div>
    </div>
    <div class="cache-rate-heading"><strong class="cache-rate">CH {{ rate }}</strong><button type="button" @click="replay += 1">重放命中动画</button></div>
    <div class="cache-meter" role="meter" aria-label="示例输入缓存命中率" :aria-valuenow="result.hitRate ?? undefined" aria-valuemin="0" aria-valuemax="100" :aria-valuetext="rate">
      <span :key="replay" class="cache-fill" :class="{ 'cache-fill--animate': replay > 0 }" :style="{ '--cache-share': (result.hitRate ?? 0) / 100 }" />
    </div>
    <p class="cache-note">CH = 缓存读取 ÷ 总输入。未命中输入在实际 usage 中可能计入 input 或 cacheWrite；本图不拆分写入费用。</p>

    <details class="cache-source">
      <summary>查看实际计算代码（Node 24+ 可运行）</summary>
      <pre tabindex="0" aria-label="缓存示例 TypeScript 源码"><code>{{ runnableSource }}</code></pre>
      <p class="cache-note">保存为 <code>cache-demo.ts</code>，执行 <code>node cache-demo.ts</code>。signature 只是本例的内容标识，不是供应商真实缓存键。</p>
    </details>
    <button class="cache-run" type="button" @click="runCode">运行当前示例</button>
    <pre v-if="output" class="cache-output" tabindex="0" aria-label="当前缓存示例运行结果"><code>{{ output }}</code></pre>
    <p v-if="output" class="cache-note" role="status">已运行当前参数；结果来自上面展示的同一份代码。</p>
  </section>
</template>

<style scoped>
.cache-demo { --cache-feedback: 160ms; --cache-motion: 650ms; min-width: 0; margin-bottom: 4rem; padding: 22px; border: 1px solid var(--line-strong); background: var(--surface); font-family: var(--font-sans); }
.cache-demo h2 { margin-top: 0; }
.cache-demo .cache-note { margin: 12px 0; color: var(--muted); font-family: var(--font-sans); font-size: .8rem; line-height: 1.65; }
.cache-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin: 24px 0; }
.cache-controls label { display: flex; min-width: 0; flex-direction: column; gap: 10px; font-size: .84rem; line-height: 1.5; }
.cache-controls output { color: var(--accent); font-family: var(--font-mono); }
.cache-controls .cache-availability { flex-direction: row; align-items: center; gap: 10px; }
.cache-demo select, .cache-demo button { min-height: 44px; border: 1px solid var(--line-strong); border-radius: 0; background: var(--paper); color: var(--ink); font: inherit; padding: 10px 12px; }
.cache-demo select { width: 100%; }
.cache-demo input { accent-color: var(--accent); }
.cache-demo input[type="range"] { width: 100%; min-height: 30px; margin: 0; }
.cache-demo input[type="checkbox"] { width: 18px; height: 18px; flex: 0 0 auto; }
.cache-demo :is(input, select, button, summary, pre):focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }
.request-row { margin-top: 24px; }
.cache-demo .request-row h3 { margin: 0 0 10px; font-size: .94rem; }
.cache-demo .cache-blocks { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.cache-demo .cache-blocks li { display: flex; min-width: 0; flex-direction: column; gap: 7px; margin: 0; padding: 12px 9px; border: 1px solid var(--line); background: var(--paper); font-size: .75rem; overflow-wrap: anywhere; transition: border-color var(--cache-feedback) ease-out, background-color var(--cache-feedback) ease-out; }
.cache-blocks small { color: var(--muted); font-size: .65rem; }
.cache-blocks strong { font-size: .87rem; }
.cache-blocks span { font-family: var(--font-mono); font-size: .68rem; }
.cache-demo .cache-blocks li[data-hit="true"] { border-color: var(--accent); background: var(--accent-wash); }
.cache-blocks li[data-hit="true"] small { color: var(--accent); }
.cache-demo .cache-explanation { margin: 20px 0; min-height: 3.3em; border-top: 3px solid var(--accent); padding-top: 12px; font-family: var(--font-sans); font-size: .87rem; line-height: 1.65; }
.cache-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.cache-metrics > div { display: grid; min-width: 0; gap: 7px; padding: 12px; border: 1px solid var(--line); }
.cache-metrics span { font-size: .73rem; color: var(--muted); }
.cache-metrics strong { font-size: clamp(1rem, 2vw, 1.35rem); font-family: var(--font-mono); }
.cache-rate-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin: 20px 0 10px; }
.cache-rate { color: var(--accent); font-size: 1.65rem; font-family: var(--font-mono); }
.cache-demo button { cursor: pointer; font-size: .78rem; }
.cache-demo button:hover { border-color: var(--accent); }
.cache-meter { height: 16px; overflow: hidden; background: var(--line); }
.cache-fill { display: block; width: 100%; height: 100%; background: var(--accent); transform: scaleX(var(--cache-share)); transform-origin: left; }
.cache-fill--animate { animation: cache-prefix-fill var(--cache-motion) ease-out both; }
.cache-source { margin-top: 24px; border-top: 1px solid var(--line); padding-top: 16px; }
.cache-source summary { cursor: pointer; font-size: .86rem; line-height: 1.6; }
.cache-demo pre { max-width: 100%; max-height: 25rem; margin: 14px 0; padding: 14px; overflow: auto; overscroll-behavior: contain; white-space: pre; }
.cache-demo pre code { font-size: .75rem; overflow-wrap: normal; word-break: normal; }
.cache-run { margin-top: 16px; }
@keyframes cache-prefix-fill { from { transform: scaleX(0); } to { transform: scaleX(var(--cache-share)); } }
@media (max-width: 620px) { .cache-demo { padding: 14px; } .cache-controls { grid-template-columns: minmax(0, 1fr); } .cache-demo .cache-blocks { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cache-metrics > div { padding: 10px 6px; } }
@media (prefers-reduced-motion: reduce) { .cache-fill--animate { animation: none; } .cache-demo .cache-blocks li { transition: none; } }
</style>
