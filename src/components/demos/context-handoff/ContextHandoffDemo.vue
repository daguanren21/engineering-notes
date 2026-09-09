<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useId,
} from "vue";
import AgentContextCard from "./AgentContextCard.vue";
import CodeExperiment from "./CodeExperiment.vue";
import type { ContextItem, ContextMode } from "./model";
import {
  buildFrames,
  SCENARIOS,
  type ScenarioId,
  type Transfer,
} from "./scenarios";

const AUTOPLAY_INTERVAL = 2400;
const MODE_CHOICES: readonly {
  id: ContextMode;
  label: string;
  description: string;
}[] = [
  {
    id: "isolated",
    label: "isolated",
    description: "子代理只收到明确 brief，父上下文不会自动带入。",
  },
  {
    id: "fork",
    label: "fork",
    description: "子代理收到父上下文快照，再附加本次任务。",
  },
];
const TRANSFER_KIND_LABELS: Readonly<Record<Transfer["kind"], string>> = {
  brief: "任务简报",
  snapshot: "上下文快照",
  message: "显式消息",
  result: "最终结果",
};

const instanceId = useId();
const scenarioId = shallowRef<ScenarioId>("continue");
const mode = shallowRef<ContextMode>("isolated");
const stepIndex = shallowRef(0);
const isPlaying = shallowRef(false);
const isPageVisible = shallowRef(true);
const prefersReducedMotion = shallowRef(false);

let autoplayTimer: number | undefined;
let motionQuery: MediaQueryList | undefined;

const frames = computed(() => buildFrames(scenarioId.value, mode.value));
const frameCount = computed(() => frames.value.length);
const contextVersions = computed(() => {
  const previous = new Map<
    string,
    { context: readonly ContextItem[]; version: number }
  >();
  return frames.value.map((frame) => {
    const versions: Record<string, number> = {};
    for (const agent of [frame.parent, ...frame.children]) {
      const last = previous.get(agent.id);
      const changed =
        !last ||
        last.context.length !== agent.context.length ||
        agent.context.some((item, index) => {
          const prior = last.context[index];
          return (
            item.id !== prior.id ||
            item.text !== prior.text ||
            item.kind !== prior.kind
          );
        });
      const version = (last?.version ?? 0) + Number(changed);
      versions[agent.id] = version;
      previous.set(agent.id, { context: agent.context, version });
    }
    return versions;
  });
});
const currentFrame = computed(() => {
  const frame = frames.value[stepIndex.value];

  if (!frame) {
    throw new Error("The selected context lesson has no frame at this step.");
  }

  return frame;
});
const currentScenario = computed(() => {
  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId.value);

  if (!scenario) {
    throw new Error("The selected context lesson scenario does not exist.");
  }

  return scenario;
});
const isFirstFrame = computed(() => stepIndex.value === 0);
const isLastFrame = computed(() => stepIndex.value === frameCount.value - 1);
const frameKey = computed(
  () => `${scenarioId.value}-${mode.value}-${stepIndex.value}`,
);
const framePanelId = `${instanceId}-frame`;

function scenarioInputId(id: ScenarioId): string {
  return `${instanceId}-scenario-${id}`;
}

function modeInputId(id: ContextMode): string {
  return `${instanceId}-mode-${id}`;
}

function clearAutoplayTimer(): void {
  if (autoplayTimer === undefined) return;

  window.clearTimeout(autoplayTimer);
  autoplayTimer = undefined;
}

function pausePlayback(): void {
  clearAutoplayTimer();
  isPlaying.value = false;
}

function scheduleNextFrame(): void {
  clearAutoplayTimer();

  if (!isPlaying.value || !isPageVisible.value || isLastFrame.value) {
    if (isLastFrame.value) isPlaying.value = false;
    return;
  }

  autoplayTimer = window.setTimeout(() => {
    autoplayTimer = undefined;

    if (!isPlaying.value || !isPageVisible.value) return;

    stepIndex.value += 1;
    if (isLastFrame.value) {
      isPlaying.value = false;
      return;
    }

    scheduleNextFrame();
  }, AUTOPLAY_INTERVAL);
}

function selectScenario(nextScenario: ScenarioId): void {
  if (scenarioId.value === nextScenario) return;

  pausePlayback();
  scenarioId.value = nextScenario;
  stepIndex.value = 0;
}

function selectMode(nextMode: ContextMode): void {
  if (mode.value === nextMode) return;

  pausePlayback();
  mode.value = nextMode;
  stepIndex.value = 0;
}

function previousFrame(): void {
  pausePlayback();
  stepIndex.value = Math.max(0, stepIndex.value - 1);
}

function nextFrame(): void {
  pausePlayback();
  stepIndex.value = Math.min(frameCount.value - 1, stepIndex.value + 1);
}

function togglePlayback(): void {
  if (isPlaying.value) {
    pausePlayback();
    return;
  }

  if (isLastFrame.value || !isPageVisible.value) return;

  isPlaying.value = true;
  scheduleNextFrame();
}

function resetDemo(): void {
  pausePlayback();
  stepIndex.value = 0;
}

function transferAgentLabel(id: string): string {
  if (currentFrame.value.parent.id === id) return currentFrame.value.parent.label;

  return (
    currentFrame.value.children.find((child) => child.id === id)?.label ?? id
  );
}

function handleVisibilityChange(): void {
  isPageVisible.value = document.visibilityState !== "hidden";
  if (!isPageVisible.value) pausePlayback();
}

function handleMotionPreference(event: MediaQueryListEvent): void {
  prefersReducedMotion.value = event.matches;
}

onMounted(() => {
  isPageVisible.value = document.visibilityState !== "hidden";
  document.addEventListener("visibilitychange", handleVisibilityChange);

  motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  prefersReducedMotion.value = motionQuery.matches;
  motionQuery.addEventListener("change", handleMotionPreference);
});

onBeforeUnmount(() => {
  clearAutoplayTimer();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  motionQuery?.removeEventListener("change", handleMotionPreference);
});
</script>

<template>
  <section class="context-demo" aria-labelledby="subagent-demo">
    <header class="demo-intro">
      <p class="demo-kicker">CONTEXT HANDOFF / 可操作时间线</p>
      <h2 id="subagent-demo">交互演示：上下文不会自己流动</h2>
      <p class="demo-intro__lede">
        <strong>浏览器端概念模拟。</strong>
        这里仅运行本地 TypeScript 数据函数，不发起模型请求、不访问网络或文件系统，也不把步骤数或条目数解释为实测 token 与供应商行为。
      </p>
    </header>

    <div class="choice-panels">
      <fieldset class="choice-panel choice-panel--scenario">
        <legend>1 / 选择协作场景</legend>
        <div class="scenario-choices">
          <label
            v-for="scenario in SCENARIOS"
            :key="scenario.id"
            class="choice"
            :class="{ 'choice--selected': scenarioId === scenario.id }"
            :for="scenarioInputId(scenario.id)"
          >
            <input
              :id="scenarioInputId(scenario.id)"
              type="radio"
              name="context-handoff-scenario"
              :value="scenario.id"
              :checked="scenarioId === scenario.id"
              @change="selectScenario(scenario.id)"
            />
            <span class="choice__copy">
              <strong>{{ scenario.label }}</strong>
              <span>{{ scenario.description }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset class="choice-panel">
        <legend>2 / 选择创建方式</legend>
        <div class="mode-choices">
          <label
            v-for="modeChoice in MODE_CHOICES"
            :key="modeChoice.id"
            class="choice"
            :class="{ 'choice--selected': mode === modeChoice.id }"
            :for="modeInputId(modeChoice.id)"
          >
            <input
              :id="modeInputId(modeChoice.id)"
              type="radio"
              name="context-handoff-mode"
              :value="modeChoice.id"
              :checked="mode === modeChoice.id"
              @change="selectMode(modeChoice.id)"
            />
            <span class="choice__copy">
              <strong class="choice__code">{{ modeChoice.label }}</strong>
              <span>{{ modeChoice.description }}</span>
            </span>
          </label>
        </div>
      </fieldset>
    </div>

    <section
      :id="framePanelId"
      class="timeline"
      :aria-labelledby="`${framePanelId}-title`"
    >
      <div class="timeline__toolbar">
        <div>
          <p class="timeline__eyebrow">
            {{ currentScenario.label }} / {{ mode }}
          </p>
          <p class="timeline__status" aria-live="polite" aria-atomic="true">
            第 {{ stepIndex + 1 }} / {{ frameCount }} 步 · {{ currentFrame.title }}
          </p>
        </div>

        <div class="timeline__controls" aria-label="时间线控制">
          <button
            type="button"
            :disabled="isFirstFrame"
            :aria-controls="framePanelId"
            @click="previousFrame"
          >
            上一步
          </button>
          <button
            type="button"
            :disabled="isLastFrame"
            :aria-pressed="isPlaying"
            :aria-controls="framePanelId"
            @click="togglePlayback"
          >
            {{ isPlaying ? "暂停" : "播放" }}
          </button>
          <button
            type="button"
            :disabled="isLastFrame"
            :aria-controls="framePanelId"
            @click="nextFrame"
          >
            下一步
          </button>
          <button type="button" :aria-controls="framePanelId" @click="resetDemo">
            重置
          </button>
        </div>
      </div>

      <div class="timeline__progress" aria-hidden="true">
        <span
          v-for="(_, index) in frames"
          :key="index"
          :class="{ 'timeline__tick--active': index <= stepIndex }"
        />
      </div>

      <div :key="frameKey" class="frame">
        <header class="frame__header">
          <div>
            <p class="frame__sequence">STEP {{ String(stepIndex + 1).padStart(2, "0") }}</p>
            <h3 :id="`${framePanelId}-title`">{{ currentFrame.title }}</h3>
          </div>
          <p>{{ currentFrame.explanation }}</p>
        </header>

        <div class="frame__event-strip">
          <p>本步观察</p>
          <ul>
            <li v-for="event in currentFrame.events" :key="event">{{ event }}</li>
          </ul>
        </div>

        <section class="transfer-panel" aria-labelledby="transfer-title">
          <div class="transfer-panel__heading">
            <div>
              <p class="frame__sequence">EXPLICIT TRANSFER</p>
              <h3 id="transfer-title">谁把什么交给谁</h3>
            </div>
            <p>
              {{
                prefersReducedMotion
                  ? "已按系统设置关闭空间动画；方向与状态仍完整呈现。"
                  : "移动只解释传递方向；上下文状态会在切换步骤时立即更新。"
              }}
            </p>
          </div>

          <ol v-if="currentFrame.transfers.length" class="transfer-list">
            <li
              v-for="(transfer, index) in currentFrame.transfers"
              :key="`${frameKey}-${index}-${transfer.from}-${transfer.to}`"
              class="transfer"
            >
              <div class="transfer__meaning">
                <span>{{ TRANSFER_KIND_LABELS[transfer.kind] }}</span>
                <strong>{{ transfer.label }}</strong>
              </div>
              <div class="transfer__route">
                <span class="transfer__endpoint">
                  <small>来源 FROM</small>
                  <strong>{{ transferAgentLabel(transfer.from) }}</strong>
                </span>
                <span class="transfer__track" aria-hidden="true">
                  <span class="transfer__motion" />
                  <svg viewBox="0 0 24 12">
                    <path d="M1 6h20M16 1l5 5-5 5" />
                  </svg>
                </span>
                <span class="transfer__endpoint transfer__endpoint--destination">
                  <small>去向 TO</small>
                  <strong>{{ transferAgentLabel(transfer.to) }}</strong>
                </span>
              </div>
            </li>
          </ol>
          <p v-else class="transfer-panel__empty">
            本步没有跨代理传递。对照卡片可见：一侧的本地变化不会自动写入另一侧。
          </p>
        </section>

        <div class="agent-grid">
          <AgentContextCard
            :frame="currentFrame.parent"
            role="parent"
            :version="contextVersions[stepIndex][currentFrame.parent.id]"
          />
          <div class="agent-grid__children">
            <AgentContextCard
              v-for="child in currentFrame.children"
              :key="child.id"
              :frame="child"
              role="child"
              :version="contextVersions[stepIndex][child.id]"
            />
            <div v-if="currentFrame.children.length === 0" class="agent-grid__pending">
              <p>CHILD CONTEXT</p>
              <strong>尚未创建子代理</strong>
              <span>继续到下一步，查看 brief 或快照如何形成独立上下文。</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <CodeExperiment :mode="mode" />
  </section>
</template>

<style scoped>
.context-demo {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  color: var(--ink-soft);
  font-family: var(--font-sans);
  line-height: 1.55;
}

.context-demo p,
.context-demo ul,
.context-demo ol {
  margin: 0;
}

.demo-intro {
  display: grid;
  gap: 18px;
}

.demo-kicker,
.timeline__eyebrow,
.frame__sequence {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.09em;
}

.demo-intro h2 {
  margin-top: 0;
}

.demo-intro__lede {
  max-width: 68ch;
  color: var(--muted);
  font-family: var(--font-serif);
  font-size: 1.02rem;
  line-height: 1.75;
}

.demo-intro__lede strong {
  color: var(--ink);
}

.choice-panels {
  display: grid;
  gap: 18px;
  margin-top: 32px;
}

.choice-panel {
  min-width: 0;
  margin: 0;
  padding: 18px;
  border: 1px solid var(--line-strong);
  background: color-mix(in srgb, var(--surface) 78%, transparent);
}

.choice-panel legend {
  padding-inline: 7px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.scenario-choices,
.mode-choices {
  display: grid;
  gap: 10px;
}

.scenario-choices {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.mode-choices {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.choice {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 13px;
  border: 1px solid var(--line);
  color: var(--muted);
  background: var(--paper);
  cursor: pointer;
  transition:
    border-color 140ms ease-out,
    background-color 140ms ease-out,
    color 140ms ease-out;
}

.choice:hover,
.choice--selected {
  border-color: var(--accent);
  color: var(--ink);
  background: var(--accent-wash);
}

.choice input {
  width: 17px;
  height: 17px;
  margin: 3px 0 0;
  accent-color: var(--accent);
}

.choice input:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}

.choice__copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.choice__copy strong {
  color: var(--ink);
  font-size: 0.88rem;
}

.choice__copy span {
  font-size: 0.75rem;
  line-height: 1.55;
}

.choice__code {
  font-family: var(--font-mono);
}

.timeline {
  min-width: 0;
  margin-top: 28px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
}

.timeline__toolbar {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
}

.timeline__toolbar > div:first-child {
  min-width: 0;
}

.timeline__status {
  margin-top: 3px;
  color: var(--ink);
  font-size: 0.86rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.timeline__controls {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 7px;
}

.timeline__controls button {
  min-height: 40px;
  padding: 8px 11px;
  border: 1px solid var(--line-strong);
  border-radius: 2px;
  color: var(--ink);
  background: var(--paper);
  font: 700 0.72rem/1 var(--font-sans);
  cursor: pointer;
  transition:
    border-color 140ms ease-out,
    color 140ms ease-out,
    background-color 140ms ease-out;
}

.timeline__controls button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.timeline__controls button[aria-pressed="true"] {
  border-color: var(--accent);
  color: var(--paper);
  background: var(--accent);
}

.timeline__controls button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.timeline__progress {
  display: flex;
  gap: 4px;
  padding: 0 18px 16px;
  background: var(--surface);
}

.timeline__progress span {
  flex: 1 1 0;
  height: 3px;
  background: var(--line);
}

.timeline__progress .timeline__tick--active {
  background: var(--accent);
}

.frame {
  min-width: 0;
  padding: clamp(18px, 3vw, 28px);
  border-top: 1px solid var(--line);
}

.frame__header {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: clamp(22px, 4vw, 44px);
  align-items: start;
}

.frame__header h3,
.transfer-panel__heading h3 {
  margin: 5px 0 0;
  color: var(--ink);
  font-size: 1.14rem;
  line-height: 1.35;
}

.frame__header > p,
.transfer-panel__heading > p {
  color: var(--muted);
  font-family: var(--font-serif);
  font-size: 0.93rem;
  line-height: 1.7;
}

.frame__event-strip {
  display: grid;
  grid-template-columns: minmax(88px, auto) minmax(0, 1fr);
  gap: 14px;
  margin-top: 20px;
  padding: 11px 13px;
  border-left: 3px solid var(--accent);
  background: var(--accent-wash);
}

.frame__event-strip > p {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
}

.frame__event-strip ul {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 4px 24px;
  padding: 0;
  list-style-position: inside;
}

.frame__event-strip li {
  color: var(--ink);
  font-size: 0.78rem;
  overflow-wrap: anywhere;
}

.transfer-panel {
  min-width: 0;
  margin-top: 22px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}

.transfer-panel__heading {
  display: grid;
  grid-template-columns: minmax(0, 0.75fr) minmax(0, 1.25fr);
  gap: 22px;
  align-items: end;
}

.transfer-list {
  display: grid;
  gap: 9px;
  margin-top: 14px;
  padding: 0;
  list-style: none;
}

.transfer {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(120px, 0.48fr) minmax(0, 1.52fr);
  gap: 16px;
  align-items: center;
  padding: 12px 13px;
  border: 1px solid var(--line);
  background: var(--paper);
}

.transfer__meaning {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.transfer__meaning span {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.61rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.transfer__meaning strong {
  color: var(--ink);
  font-size: 0.77rem;
  overflow-wrap: anywhere;
}

.transfer__route {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) minmax(54px, 0.55fr) minmax(0, 1fr);
  gap: 9px;
  align-items: center;
}

.transfer__endpoint {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.transfer__endpoint small {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.58rem;
}

.transfer__endpoint strong {
  color: var(--ink);
  font-size: 0.74rem;
  overflow-wrap: anywhere;
}

.transfer__endpoint--destination {
  text-align: right;
}

.transfer__track {
  position: relative;
  display: block;
  min-width: 0;
  height: 16px;
}

.transfer__track::before,
.transfer__motion {
  position: absolute;
  top: 7px;
  right: 5px;
  left: 0;
  height: 2px;
  content: "";
}

.transfer__track::before {
  background: var(--line-strong);
}

.transfer__motion {
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left center;
  animation: handoff-route 760ms ease-out both;
}

.transfer__track svg {
  position: absolute;
  top: 1px;
  right: 0;
  width: 28px;
  height: 14px;
  fill: none;
  stroke: var(--accent);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.transfer-panel__empty {
  margin-top: 14px;
  padding: 12px 13px;
  border: 1px dashed var(--line-strong);
  color: var(--muted);
  font-size: 0.78rem;
}

.agent-grid {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 0.84fr) minmax(0, 1.16fr);
  gap: 14px;
  align-items: stretch;
  margin-top: 22px;
}

.agent-grid__children {
  display: grid;
  min-width: 0;
  gap: 14px;
}

.agent-grid__pending {
  display: grid;
  min-width: 0;
  align-content: center;
  gap: 7px;
  min-height: 180px;
  padding: 18px;
  border: 1px dashed var(--line-strong);
  color: var(--muted);
  background: color-mix(in srgb, var(--paper) 72%, transparent);
}

.agent-grid__pending p {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.63rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.agent-grid__pending strong {
  color: var(--ink);
  font-size: 0.9rem;
}

.agent-grid__pending span {
  font-size: 0.76rem;
  line-height: 1.6;
}

@keyframes handoff-route {
  0% {
    opacity: 0;
    transform: scaleX(0);
  }

  24% {
    opacity: 1;
  }

  78%,
  100% {
    opacity: 1;
    transform: scaleX(1);
  }
}

@media (max-width: 720px) {
  .scenario-choices,
  .mode-choices,
  .frame__header,
  .transfer-panel__heading,
  .agent-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .timeline__toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .timeline__controls {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .timeline__controls button {
    min-width: 0;
    padding-inline: 6px;
  }

  .transfer {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 460px) {
  .choice-panel,
  .frame {
    padding-inline: 13px;
  }

  .timeline__toolbar {
    padding-inline: 13px;
  }

  .timeline__progress {
    padding-inline: 13px;
  }

  .timeline__controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .frame__event-strip {
    grid-template-columns: minmax(0, 1fr);
  }

  .transfer__route {
    grid-template-columns: minmax(0, 1fr) 50px minmax(0, 1fr);
    gap: 5px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .choice,
  .timeline__controls button {
    transition-duration: 0.01ms;
  }

  .transfer__motion {
    animation: none;
    opacity: 1;
    transform: scaleX(1);
  }
}
</style>
