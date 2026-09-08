---
title: "GPT-6 Astra 开发指南：异步工具、运行中 Steering 与可变 Reasoning"
titleParts:
  - "GPT-6 Astra"
  - "开发迁移指南"
  - "三个运行时变化"
description: "从 Responses API 出发，理解异步工具调用、运行中 Steering、Reasoning 配置更新，以及迁移时真正需要修改的 Harness 契约。"
publishedAt: "2026-09-05"
sourceTitle: "Using GPT-6 Astra"
sourceUrl: "https://developers.openai.com/api/docs/guides/latest-model"
sourceAuthor: "OpenAI"
tags:
  - OpenAI API
  - GPT-6 Astra
  - Agent Runtime
readingMinutes: 13
issue: 5
draft: false
sections:
  - id: "先看三个结构变化"
    label: "三个结构变化"
  - id: "默认从-responses-api-开始"
    label: "Responses API"
  - id: "异步工具调用解决什么"
    label: "异步工具"
  - id: "异步不等于托管执行"
    label: "执行所有权"
  - id: "用-call-id-管理待完成工作"
    label: "Call 生命周期"
  - id: "运行中-steering-是一条新事件流"
    label: "运行中 Steering"
  - id: "steering-不会撤销已经发生的事"
    label: "Steering 边界"
  - id: "在不中断缓存的前提下调整-reasoning"
    label: "可变 Reasoning"
  - id: "提示词要校准五种行为"
    label: "行为校准"
  - id: "迁移时必须检查的参数"
    label: "迁移参数"
  - id: "misalignment-monitoring-是异步制动器"
    label: "安全监控"
  - id: "能力声明和-api-保证不是一回事"
    label: "证据边界"
  - id: "harness-需要增加哪些状态"
    label: "Harness 状态"
  - id: "推荐的迁移顺序"
    label: "迁移顺序"
---

> GPT-6 Astra 对开发者最重要的变化，不只是模型能力提升，而是一次 Response 不再等于“发出请求、等待全部工具、得到最终答案”。工具可以异步返回，用户可以在生成途中改变方向，Reasoning Effort 也可以在不重写缓存前缀的情况下更新。

OpenAI 的最新模型指南把 GPT-6 Astra 定位为面向代码、浏览器、Computer Use 和专业软件的多步骤模型。产品发布页包含大量 Benchmark 与效率声明，但 API 开发真正需要处理的是协议变化：哪些状态由服务端保存，哪些工作仍由应用执行，怎样把后到的 Tool Result 和运行中的用户指令接回同一条会话链。

这篇笔记只整理开发与迁移契约。模型效果、价格和可用范围会持续变化，部署前仍应以[官方最新模型指南](https://developers.openai.com/api/docs/guides/latest-model)和具体 Model Reference 为准。

## 先看三个结构变化

GPT-6 Astra 新增的三项能力会直接改变 Agent Runtime：

| 能力 | 过去的默认 | 新的控制方式 |
| --- | --- | --- |
| Async Tool Calling | 模型调用工具后暂停等待 | 工具运行时，模型可以继续处理独立工作 |
| Mid-turn Steering | 等整轮结束后追加消息 | 通过 WebSocket 在当前工作中加入新要求 |
| Configuration Update | 下一请求重写 Reasoning 参数 | 用输入项改变后续 Effort，同时保留缓存前缀 |

三者的共同点是：一次任务同时存在多个未完成状态。Harness 不能再只维护一个 `await response`，而需要跟踪 Response、Tool Call、Steering Input 和 Configuration 的生命周期。

## 默认从 Responses API 开始

最小调用仍然简单：

```ts
const response = await client.responses.create({
  model: "gpt-6-astra",
  reasoning: { effort: "low" },
  input: "检查这个迁移方案，并列出回滚步骤。",
})
```

官方建议 Reasoning Workload 优先使用 Responses API。Chat Completions 仍支持 GPT-6 Astra 的文本调用，但 Astra 的 Tool Calling 需要 Responses API。

迁移时不要只替换 Model ID。先检查应用是否依赖 Responses 的会话链、Tool Output Item、WebSocket Event 和 Persisted Reasoning。新能力大多建立在这些状态原语之上。

## 异步工具调用解决什么

普通 Function Call 会暂停模型，直到应用返回工具结果。对于搜索、数据库查询、远程构建和人工审批这类慢任务，整个推理过程都会被最慢调用阻塞。

将 Function Tool 或 Custom Tool 标记为 `async: true` 后，模型可以在工具运行期间：

- 继续推理；
- 调用其他工具；
- 回答与该结果无关的部分；
- 等真实结果回来后再完成依赖它的结论。

适合异步的工具通常具有两个特征：耗时明显，并且任务中存在不依赖它的并行工作。几毫秒就能完成、其结果又是下一步唯一前提的调用，不会因为标记 Async 获得实际收益。

[Async Tool Calling 文档](https://developers.openai.com/api/docs/guides/async-tool-calling)还特别区分了 Background Mode：后者让 Response Generation 在后台运行；前者让模型在应用执行工具时继续工作。两种异步发生在不同层。

## 异步不等于托管执行

`async: true` 不会把工具发送给 OpenAI 执行，也不会替应用创建 Job Queue。

应用仍然拥有：

```text
参数校验
实际执行
超时与取消
并发和资源上限
结果持久化
失败重试
Tool Output 回传
```

因此，Async Tool Calling 是模型协议，不是后台任务系统。Harness 如果没有持久 Job、输出边界和恢复能力，只是把同步阻塞换成了更多悬空 Promise。

一个可靠实现应该先创建自己的 Job Record，再向模型暴露 Async Tool；进程重启后，系统仍需知道哪个 `call_id` 正在等待哪份结果。

## 用 Call ID 管理待完成工作

异步 Function Call 会产生 `function_call`，Custom Tool 会产生 `custom_tool_call`。结果回来时分别发送 `function_call_output` 或 `custom_tool_call_output`，并携带原始 `call_id`。

```ts
const call = response.output.find(item => item.type === "function_call")

const result = await jobs.run(call)

await client.responses.create({
  model: "gpt-6-astra",
  previous_response_id: latestResponseId,
  input: [{
    type: "function_call_output",
    call_id: call.call_id,
    output: JSON.stringify(result),
  }],
})
```

这里有两个不同的关联键：

- `call_id` 把结果关联到工具调用；
- `previous_response_id` 把新请求关联到当前会话链。

如果工具运行期间又发生了一次 Continuation，Harness 必须更新 `latestResponseId`，不能把晚到结果接回已经过时的 Response。

## 运行中 Steering 是一条新事件流

[Mid-turn Steering](https://developers.openai.com/api/docs/guides/steering) 只在 GPT-6 Astra 与 Responses WebSocket 连接中提供。

收到 `response.created` 后，应用可以在同一连接发送：

```json
{
  "type": "response.steer",
  "previous_response_id": "resp_1",
  "input": "把范围限制到一个开发者两周内可以完成。"
}
```

`response.steer.accepted` 只表示输入已经排队，不表示模型已经执行。服务端会先完成当前 Output Item 和正在运行的 Hosted Tool，再自动创建包含新要求的 Continuation。应用应继续读取事件，而不是再主动发送一个重复的 `response.create`。

被 Steering 打断的原 Response 可能以 `response.incomplete` 结束，并带有 `incomplete_details.reason: "steered"`。这是预期状态，不应被通用错误处理器当作失败重试。

## Steering 不会撤销已经发生的事

Steering 能改变接下来的方向，但不会：

- 重写已经发送给应用的输出；
- 撤销之前执行的动作；
- 自动取消已经启动的 Client Tool；
- 回滚已写入的文件或外部副作用。

如果原 Response 正等待客户端 Tool Result 或 Approval，Steering 会保持 Pending。应用仍需完成正常的工具或审批流，再让服务端应用更新。

Steering Input 只存在于当前 WebSocket 连接，不会自动保存到原 Response。断线恢复前，应用必须记录已发送的 Steering、Accepted Event 和后续 Response，否则既可能丢更新，也可能重复应用。

所以 Steering 是控制输入，不是事务回滚。

## 在不中断缓存的前提下调整 Reasoning

GPT-6 Astra 可以用 `configuration_update` 在会话中提高或降低 Reasoning Effort：

```json
[
  {
    "type": "configuration_update",
    "reasoning": { "effort": "high" }
  },
  {
    "role": "user",
    "content": "分析失败模式并给出回滚步骤。"
  }
]
```

官方要求请求级的 `reasoning.effort` 保持不变，把变化写成 Input Item。这样原始 Prompt Prefix 仍可用于 Prompt Caching。更新会持续生效，直到下一条 Configuration Update 覆盖。

当前限制包括：

- 只支持 `gpt-6-astra`；
- 只支持 Standard、Single-agent Mode；
- 只能改变 Reasoning Effort；
- 不能把两条 Configuration Update 紧挨着放入历史；
- 不能与 Automatic Compaction 或 Automatic Truncation 组合；
- 显式 Compaction 后，应在下一条用户消息前重新发送所需 Effort。

这使 Effort 从请求参数变成会话状态。记录和重放会话时，Configuration Update 必须与普通消息一样进入权威历史。

## 提示词要校准五种行为

官方指南指出 Astra 的默认行为与早期模型存在几处差异，应用应按自己的产品需求明确校准。

### 主动性与追问

模型更可能在答案会改变结果时询问用户。希望它更自治，就明确允许它从上下文补齐常规缺口，并持续完成可逆工作；真正不可逆或影响结果的决定再升级给用户。

### 指令优先级

Astra 对 Skill、`AGENTS.md` 和其他上下文指令更敏感。应审计模型能访问的规则文件，删除冲突和过期指导，并明确用户指令、系统策略与局部 Skill 的优先级。

### 写作风格

默认回答倾向列表、表格和较多格式。产品需要短段落、固定 JSON、客服语气或专业报告时，应直接规定结构、长度和措辞，而不是期待模型自动匹配。

### 子 Agent 委派

模型可能比某些工作流期望的更少委派。若 Harness 依赖并行 Agent，需要声明什么任务可拆分、何时必须委派，以及子 Agent 返回什么契约。

### 测试与验证

Astra 在 Coding Task 中倾向充分验证，小改动可能因此触发过宽测试。给出与变更风险匹配的检查范围，并规定通过后只有新失败或未决风险才能继续扩大验证。

这些不是一段万能 Prompt。它们是五个需要通过真实 Eval 调节的行为旋钮。

## 迁移时必须检查的参数

从早期模型迁移时，官方 Quickstart 建议逐项检查：

1. 将 Model ID 改为 `gpt-6-astra`；
2. Tool Calling 切到 Responses API；
3. 当前使用 `none` 或 `minimal` Effort 时，从 `low` 开始对照；
4. 移除 `temperature`、`top_p` 和 `top_logprobs`；
5. Chat Completions 还需移除 `logprobs`；
6. Responses 的 `include` 中移除 `message.output_text.logprobs`；
7. 从 GPT-5.5 或更早模型迁移缓存时，将 `prompt_cache_retention` 改为 `prompt_cache_options.ttl: "30m"`；
8. 需要会话内改变 Effort 时使用 `configuration_update`，不要反复重写请求前缀；
9. EU Data Residency 下使用 Standard Processing，GPT-6 Astra 不提供 Fast 或 Priority Tier；
10. Fast Mode 没有 Latency SLA，不能把“更快”当成确定的 Deadline Contract。

`none` Reasoning Effort 不受支持，发送后会得到 HTTP 400。Reasoning Token 仍计入 Context 和 Output Token；开始评估时需要给推理与输出保留足够空间，并处理 `status: incomplete` 与 `reason: max_output_tokens`。

## Misalignment Monitoring 是异步制动器

GPT-6 Astra 引入的 [Misalignment Monitoring](https://developers.openai.com/api/docs/guides/safety-checks/misalignment-monitoring) 会异步检查敏感数据访问、转移和破坏性动作等高后果场景。

覆盖范围取决于 API 和会话连续性：

- 使用 Persisted Reasoning、WebSocket 或 OpenAI Compaction 的 Responses 会话可以被识别为连续对话并自动停止；
- 不使用这些机制的 Responses 请求仍会被监控，但通常只能通过 Webhook 告警；
- Chat Completions 不在这套监控覆盖范围内。

阻断可能返回 HTTP 403、`invalid_request_error` 和 `misalignment_policy_violation`。应用应匹配 Error Code，不要解析易变的错误文案，也不要自动重试被阻断流程。

监控是异步的，因此告警到达前某个动作可能已经完成。停止会话不会撤销副作用。它也可能漏报或误报，不能替代应用自己的审批、权限、审计和回滚机制。

## 能力声明和 API 保证不是一回事

OpenAI 的产品发布页称 Astra 在 Computer Use、Coding、Science、Cybersecurity 和 Professional Work 上达到新的评测结果，并报告相对 GPT-5.6 Sol 的速度与 Token 效率改进。

这些数字来自 OpenAI 自己或合作方的评测环境。官方也注明，研究环境、系统 Prompt、可用工具和生产 API 之间可能存在差异。

开发决策应区分三种证据：

| 类型 | 可以支持什么结论 |
| --- | --- |
| API Schema 与错误码 | 集成必须处理的协议 |
| 官方 Benchmark | 在指定 Harness 和数据集中的结果 |
| 自己的任务级 Eval | 是否适合自己的成本、延迟和质量目标 |

Benchmark 可以决定是否值得试验，不能代替生产验收。

## Harness 需要增加哪些状态

为了真正使用三项新能力，Agent Runtime 至少需要持久化：

```text
当前 Response Chain 与 latest_response_id
每个 Async Tool 的 call_id、Job ID、状态和结果
已发送、已接受、待应用的 Steering Input
当前生效的 Reasoning Effort
Compaction 前后的 Configuration Update
安全告警、阻断状态和已发生副作用
```

还需要明确所有权：应用执行 Client Tool；API 运行模型与 Hosted Tool；Harness 负责把两边状态连接起来，并在断线、迟到结果和部分失败后恢复。

如果这些状态只存在 Promise、闭包或 WebSocket Handler 中，断线后就无法知道哪些工作已经发生。

## 推荐的迁移顺序

一个保守迁移过程可以分成六步：

1. 固定现有模型的任务、输入、质量、延迟和成本基线；
2. 只替换 Model ID，并完成不兼容参数清理；
3. 切换或确认 Responses API 的 Tool Calling 与会话链；
4. 在一个真实慢工具上引入 Async，并验证断线、超时和迟到结果；
5. 通过 WebSocket 增加 Steering，明确哪些动作无法撤销；
6. 最后评估 Configuration Update 和 Misalignment Alert 的状态恢复。

每一步只改变一种变量，保留第一次有效结果。新模型已经改变很多行为，如果同时重写 Prompt、工具 Schema、并发和验证流程，最终无法知道改善或回归来自哪里。

---

原始资料：OpenAI，[Using GPT-6 Astra](https://developers.openai.com/api/docs/guides/latest-model)。本文还参考官方 Async Tool Calling、Mid-turn Steering、Reasoning 与 Misalignment Monitoring 指南。API、价格、模型可用性和兼容限制可能更新，集成前应重新核对官方文档。
