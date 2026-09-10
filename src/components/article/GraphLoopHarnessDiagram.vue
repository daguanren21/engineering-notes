<template>
  <figure class="architecture" aria-labelledby="graph-system-title">
    <header class="architecture__header">
      <div>
        <p class="architecture__kicker">SYSTEM MAP / 01</p>
        <h3 id="graph-system-title">Graph 安排工作，Loop 修正单元，Harness 执行规则</h3>
      </div>
      <p class="architecture__legend">实线是本次运行，虚线是反馈。</p>
    </header>

    <div class="architecture__canvas">
      <section class="architecture__control" aria-label="任务控制层">
        <div class="architecture__label">
          <span>CONTROL</span>
          <strong>任务控制</strong>
        </div>
        <div class="architecture__control-flow">
          <div class="architecture__card architecture__card--source">
            <span>目标与约束</span>
            <small>成功条件 · 权限 · 预算</small>
          </div>
          <span class="architecture__arrow" aria-hidden="true">→</span>
          <div class="architecture__card architecture__card--splitter">
            <span>Splitter</span>
            <small>拆分单元 · 声明依赖</small>
          </div>
        </div>
      </section>

      <section class="architecture__graph" aria-label="任务图层">
        <div class="architecture__label">
          <span>GRAPH</span>
          <strong>任务之间</strong>
        </div>
        <div class="architecture__workers">
          <div class="architecture__worker">
            <span class="architecture__worker-index">A</span>
            <strong>Worker</strong>
            <small>执行 → 检查 → 修正 ↺</small>
          </div>
          <div class="architecture__worker">
            <span class="architecture__worker-index">B</span>
            <strong>Worker</strong>
            <small>执行 → 检查 → 修正 ↺</small>
          </div>
          <div class="architecture__worker">
            <span class="architecture__worker-index">C</span>
            <strong>Worker</strong>
            <small>执行 → 检查 → 修正 ↺</small>
          </div>
        </div>
        <div class="architecture__fan-in" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="architecture__result-flow">
          <div class="architecture__card">
            <span>Code reducer</span>
            <small>计数 · 校验 · 去重 · 对比</small>
          </div>
          <span class="architecture__arrow" aria-hidden="true">→</span>
          <div class="architecture__card architecture__card--gate">
            <span>Gate</span>
            <small>接受 · 退回 · 升级</small>
          </div>
          <span class="architecture__arrow" aria-hidden="true">→</span>
          <div class="architecture__card architecture__card--result">
            <span>结果或人工批准</span>
            <small>位于不可逆操作之前</small>
          </div>
        </div>
      </section>

      <section class="architecture__feedback" aria-label="失败反馈路径">
        <div class="architecture__label">
          <span>RETURN</span>
          <strong>失败返回</strong>
        </div>
        <div class="architecture__return-grid">
          <p><span>局部失败</span>返回对应 Worker，不重做已通过单元。</p>
          <p><span>集成失败</span>返回 reducer，检查接口和全局不变量。</p>
          <p><span>切分失败</span>返回 Splitter，重新划分所有权和依赖。</p>
        </div>
      </section>

      <section class="architecture__harness" aria-label="Harness 执行环境">
        <div class="architecture__label">
          <span>HARNESS</span>
          <strong>执行环境</strong>
        </div>
        <ul>
          <li>工具与权限</li>
          <li>上下文与状态</li>
          <li>隔离与并发</li>
          <li>超时与恢复</li>
          <li>证据与日志</li>
        </ul>
      </section>
    </div>

    <figcaption>
      Graph 和 Loop 描述控制逻辑。Harness 负责执行这些逻辑，并从测试、运行状态和外部系统取得证据。
    </figcaption>
  </figure>
</template>

<style scoped>
.architecture {
  margin: 2.2rem 0 2.8rem;
  border: 1px solid var(--line-strong);
  color: var(--ink);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  font-family: var(--font-sans);
}

.architecture__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 28px;
  align-items: end;
  padding: 22px 24px 20px;
  border-bottom: 3px solid var(--accent);
}

.architecture__kicker,
.architecture__legend,
.architecture__label span,
.architecture small,
.architecture figcaption {
  font-family: var(--font-mono);
}

.architecture__kicker {
  margin: 0 0 7px;
  color: var(--accent);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.architecture__header h3 {
  max-width: 580px;
  margin: 0;
  font-size: clamp(1.12rem, 2.4vw, 1.5rem);
  letter-spacing: -0.025em;
  line-height: 1.35;
}

.architecture__legend {
  margin: 0;
  color: var(--muted);
  font-size: 0.62rem;
}

.architecture__canvas {
  display: grid;
}

.architecture__control,
.architecture__graph,
.architecture__feedback,
.architecture__harness {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 18px;
  padding: 20px 24px;
}

.architecture__control,
.architecture__graph,
.architecture__feedback {
  border-bottom: 1px solid var(--line);
}

.architecture__label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 3px;
}

.architecture__label span {
  color: var(--accent);
  font-size: 0.58rem;
  letter-spacing: 0.08em;
}

.architecture__label strong {
  font-size: 0.75rem;
  font-weight: 700;
}

.architecture__control-flow,
.architecture__result-flow {
  display: flex;
  align-items: stretch;
}

.architecture__card,
.architecture__worker {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--line-strong);
  background: var(--paper);
}

.architecture__card {
  flex: 1;
  min-height: 72px;
  padding: 12px 14px;
}

.architecture__card span,
.architecture__worker strong {
  font-size: 0.82rem;
  font-weight: 760;
}

.architecture small {
  color: var(--muted);
  font-size: 0.61rem;
  line-height: 1.5;
}

.architecture__card--splitter,
.architecture__card--gate {
  border-color: var(--accent);
  border-top-width: 3px;
}

.architecture__card--result {
  color: var(--paper);
  background: var(--ink);
}

.architecture__card--result small {
  color: color-mix(in srgb, var(--paper) 72%, transparent);
}

.architecture__arrow {
  display: grid;
  width: 34px;
  flex: 0 0 34px;
  place-items: center;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 1rem;
}

.architecture__graph {
  background-image: linear-gradient(90deg, transparent 49.8%, color-mix(in srgb, var(--line) 30%, transparent) 50%, transparent 50.2%);
}

.architecture__workers {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.architecture__worker {
  position: relative;
  min-height: 82px;
  padding: 14px 14px 12px 42px;
}

.architecture__worker-index {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  display: grid;
  width: 28px;
  place-items: center;
  color: var(--paper);
  background: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.62rem;
}

.architecture__fan-in {
  grid-column: 2;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  height: 24px;
  padding-inline: 9%;
}

.architecture__fan-in span {
  border-bottom: 1px solid var(--accent-soft);
}

.architecture__fan-in span:first-child {
  border-right: 1px solid var(--accent-soft);
  transform: skewX(32deg);
  transform-origin: right bottom;
}

.architecture__fan-in span:nth-child(2) {
  border-right: 1px solid var(--accent-soft);
}

.architecture__fan-in span:last-child {
  transform: skewX(-32deg);
  transform-origin: left bottom;
}

.architecture__result-flow {
  grid-column: 2;
}

.architecture__return-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.architecture__return-grid p {
  margin: 0;
  padding: 11px 12px;
  border: 1px dashed var(--line-strong);
  color: var(--muted);
  font-size: 0.68rem;
  line-height: 1.55;
}

.architecture__return-grid span {
  display: block;
  margin-bottom: 3px;
  color: var(--ink);
  font-weight: 760;
}

.architecture__harness {
  align-items: center;
  color: var(--code-ink);
  background: var(--code);
}

.architecture__harness .architecture__label strong {
  color: var(--code-ink);
}

.architecture__harness ul {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
  background: color-mix(in srgb, var(--code-ink) 20%, transparent);
}

.architecture__harness li {
  padding: 10px 8px;
  background: var(--code);
  font-family: var(--font-mono);
  font-size: 0.58rem;
  text-align: center;
}

.architecture figcaption {
  padding: 13px 24px;
  border-top: 1px solid var(--line-strong);
  color: var(--muted);
  font-size: 0.62rem;
  line-height: 1.6;
}

@media (max-width: 680px) {
  .architecture__header {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .architecture__control,
  .architecture__graph,
  .architecture__feedback,
  .architecture__harness {
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 18px;
  }

  .architecture__label {
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
  }

  .architecture__fan-in,
  .architecture__result-flow {
    grid-column: 1;
  }

  .architecture__workers,
  .architecture__return-grid {
    grid-template-columns: 1fr;
  }

  .architecture__fan-in {
    display: none;
  }

  .architecture__result-flow {
    margin-top: 12px;
  }

  .architecture__harness ul {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 460px) {
  .architecture__control-flow,
  .architecture__result-flow {
    flex-direction: column;
  }

  .architecture__arrow {
    width: 100%;
    height: 28px;
    transform: rotate(90deg);
  }

  .architecture__harness ul {
    grid-template-columns: 1fr;
  }
}
</style>
