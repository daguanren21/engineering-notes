---
title: "Subagent 上下文怎么分：用动画理解 Fork、Isolated 与多任务协作"
titleParts:
  - "Subagent 上下文"
  - "该继承，还是隔离？"
  - "动画与代码实验"
description: "切换继续实现、独立审查和并行任务，观察上下文快照、显式消息与结果回传；用可运行代码验证 Fork 为什么不是实时记忆同步。"
publishedAt: "2026-09-09"
sourceKind: "source-code"
interactiveDemo: "context-handoff"
sourceTitle: "Organizing Context in a Multi-Agent Harness"
sourceUrl: "https://www.langchain.com/blog/organizing-context-in-a-multi-agent-harness"
sourceAuthor: "LangChain / 工程手记"
sourcePublishedAt: "2026-09-08"
tags:
  - Multi-Agent
  - Context Engineering
  - 交互实验
readingMinutes: 12
issue: 10
draft: false
sections:
  - id: "交互演示"
    label: "先看动画"
  - id: "文章的关键判断"
    label: "继承还是隔离"
  - id: "三个场景怎样看"
    label: "三个案例"
  - id: "omp-怎样交接上下文"
    label: "OMP 的方案"
  - id: "六种实现的差别"
    label: "框架对照"
  - id: "多任务多-agent-的分派规则"
    label: "任务级上下文"
  - id: "从代码到工程约束"
    label: "代码实验"
  - id: "来源与版本"
    label: "来源"
---

**继续型任务适合继承相关上下文；判断型任务适合隔离已有结论。多任务场景则应按任务分区，不把总会话复制给每个执行者。**

上面的演示可以逐步播放，也可以切换模式后重看。重点观察三件事：子 Agent 创建时拿到了什么；父 Agent 后来的更新是否自动出现；子 Agent 的内部过程是否全部回到父会话。

## 文章的关键判断

[LangChain 原文][langchain]提出两种子 Agent 上下文模式，目的是减少重复调查，同时避免子任务过程淹没主上下文。

| 模式 | 子 Agent 开始时收到什么 | 返回主 Agent 什么 |
| --- | --- | --- |
| `isolated` | 任务描述与明确交接的材料，不继承父对话 | 最终结果 |
| `fork` | 父 Agent 当时的对话快照，移除末尾委派调用，再加入子任务指令 | 仍然只返回最终结果 |

**Fork 是初始化快照，不是持续同步。** 它让实现者接住已有调查，但不会自动收到父 Agent 之后的新发现。共享工作目录也只意味着能读到文件，不意味着已经知道修改的理由。

Fork 可以利用 prompt cache，但不是必然便宜：模型、system prompt、工具定义或前缀发生变化时，缓存未必命中；完整历史仍占用子 Agent 的上下文窗口。[官方限制][deepagents]

## 三个场景怎样看

### 继续实现：需要事实，不必重新调查

父 Agent 已经找到超时日志和相关函数，子任务是实现修复。Fork 可以带走这些观察；isolated 则需要在交接材料里明确给出，否则可能重新读文件。

演示中父 Agent 后来补充了一条约束。此时子面板仍保持创建时的状态，直到出现一次显式消息传递。这是快照与实时同步的区别。

### 独立审查：隔离判断，不隔离证据

Reviewer 需要需求、diff、复现条件和验收标准，却不应默认接受“我已经证明修好了”。切到 fork，可以看到父假设进入 Reviewer 的上下文；切到 isolated，则只接收中性的审查材料。

这展示的是**锚定风险**，不是宣称继承上下文必然导致错误。Fork 也不免除验证，isolated 更不是让审查者两手空空地开工。

### 并行任务：不要共享一份混杂的聊天

任务 A 与 B 各有调查结果。从总会话 fork，会让两个子 Agent 都收到另一任务的历史。独立上下文配合任务级 briefing，可以只传共享契约和相关材料。

某条约束只影响 A，就只通知 A。最后主 Agent 汇总两个结果，不需要把两份内部日志全部合并。

## OMP 怎样交接上下文

OMP 18.1.14 的普通 `task` 子 Agent 不继承主 Agent 的完整对话，主要依靠显式交接和会话复用。[创建实现][omp-executor]

| 通道 | 用途 |
| --- | --- |
| `task.context` 与每项 `task` | 提供共享背景、具体任务、证据入口和验收 |
| 项目规则、skills、artifact | 共享可读取的知识与产物，不是共享聊天窗口 |
| `hub.send` | 补充创建之后的新事实、约束或问题 |
| `agent://id`、`history://id` | 分别读取结果与过程；按需访问，不默认全文注入 |
| 复用原 Agent ID | 继续该子 Agent 自己的历史，避免同一任务反复重建上下文 |

因此 OMP 并没有自动消除文章指出的重复调查。若主 Agent 只交代“修一下 timeout”，子 Agent 仍可能从头查；给出已确认事实、证据位置和剩余工作，才是有效交接。

注意，OMP 的 `task.isolated: true` 是**工作区隔离**，不是本文的上下文模式。可选长期记忆后端也是另一层能力，不能与当前会话同步混为一谈。

## 六种实现的差别

| 实现 | 普通委派 | 继承或继续的特殊路径 |
| --- | --- | --- |
| [OMP][omp-executor] | 新上下文，加明确的 context/task | 同 ID 续做，hub 发增量；没有通用父对话 fork 参数 |
| [Kimi Code](https://github.com/MoonshotAI/kimi-code) | 普通 Agent/AgentSwarm 不复制父历史 | `resume` 保留子历史；BTW 旁路可复制父上下文，但禁用工具 |
| [DeepChat](https://github.com/ThinkInAIXYZ/deepchat) | 新会话收到结构化 handoff | 返回短结果并链接子 Tape；当前 orchestrator 路径不 fork 父历史 |
| [OpenCode](https://github.com/anomalyco/opencode) | Task 创建子 session，只传委派 prompt | `task_id` 继续旧子会话；Session 的 fork 不是 Task 默认行为 |
| [Codex](https://github.com/openai/codex) | V1 默认不继承；启用本地 V2 协议时默认 `fork_turns="all"` | V1 `fork_context`；V2 可选 `none`、`all` 或最近 N 轮，实际历史仍会过滤 |
| [Grok Build](https://github.com/xai-org/grok-build) | 模型调用普通 Task 时 `fork_context: false` | Harness 内部可 fork；`resume_from` 复制旧子 Agent，不是当前父历史 |

这些名字相似，边界却不同。Kimi 的旁路问答不能等价为可执行工具的 Worker fork；Grok 的内部参数也不是普通模型工具随时可用的选项。结束后返回结果，同样不等于把子 Agent 全部历史并回父会话。

## 多任务多 Agent 的分派规则

| 场景 | 默认策略 | 应共享的内容 |
| --- | --- | --- |
| 独立任务并行 | 各自 isolated | 公共约束、任务相关证据与接口 |
| 同一任务调查后实现 | 继承该任务的局部上下文 | 已确认事实、决定及剩余工作 |
| 竞争设计或独立审查 | isolated | 相同问题、原始材料与评价标准 |
| 多任务汇合 | 建立集成上下文 | 产物、接口变更、验证结果和未决风险 |

如果框架只能 fork 父会话，可以让任务级 Agent 充当局部 supervisor。不要让每个执行者都 fork 混杂了所有任务的总会话；如果框架不支持这种结构，就使用明确的任务包和产物引用。

共享契约应有版本和负责人。接口从 `{ items, total }` 改成 `{ data, pagination }`，旧快照不会自动更新：通知受影响任务、确认新契约，并重新检查基于旧版本的验证结论。**Fork 管出发时的背景，消息与版本管理管出发后的变化。**

## 从代码到工程约束

展开演示中的代码，点击“运行示例”，观察四份结果：创建后的子上下文、父上下文改变后的子快照、显式发送更新后的子上下文、父 Agent 收到最终结果后的状态。展示的源码就是按钮调用的实现，不需要模型账号。

代码实验要验证三个不变量：

1. **快照不能共享可变引用。** 仅复制外层对象、却复用消息数组，不是真正的隔离快照；父方后续修改会意外渗入子方。本例消息字段都是字符串，真实消息含嵌套内容时还需深拷贝或不可变结构。
2. **新增信息需要明确投递。** 写入父上下文不等于子方已接收；发送到哪个 Agent、属于哪个任务，应明确记录。
3. **回传结果不等于合并轨迹。** 主 Agent 先消费结果，需要排查时再读取 artifact 或子会话，而不是默认导入全部工具日志。

真实系统还要处理消息裁剪、未闭合工具调用、权限和失败恢复。这些不由本页的小型状态模型代替。

## 来源与版本

- [微信解读](https://mp.weixin.qq.com/s/XJcoOMqxIMBogXQwuM11Iw)、[LangChain 原文][langchain]、[Deep Agents fork 文档][deepagents]。
- [OMP 18.1.14 子会话创建][omp-executor]、[子 Agent 系统模板][omp-prompt]。
- 其余框架依据本地源码快照核对；表格分别标出了协议版本与特殊路径，不代表所有发布版的默认行为。

[langchain]: https://www.langchain.com/blog/organizing-context-in-a-multi-agent-harness
[deepagents]: https://docs.langchain.com/oss/python/deepagents/subagents#forked-subagents
[omp-executor]: https://github.com/can1357/oh-my-pi/blob/v18.1.14/packages/coding-agent/src/task/executor.ts
[omp-prompt]: https://github.com/can1357/oh-my-pi/blob/v18.1.14/packages/coding-agent/src/prompts/system/subagent-system-prompt.md
