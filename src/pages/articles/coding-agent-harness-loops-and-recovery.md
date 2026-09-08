---
title: "Coding Agent Harness：Pi、循环终止与状态恢复"
titleParts:
  - "Coding Agent Harness"
  - "循环怎样结束"
  - "中断后恢复什么"
description: "对照 Pi 与其他九个实现，说明循环所有权、运行中插话、停止条件和状态恢复的具体差别。"
publishedAt: "2026-09-08"
sourceKind: "source-code"
sourceTitle: "Pi Agent Harness"
sourceUrl: "https://github.com/earendil-works/pi"
sourceAuthor: "各开源项目维护者"
tags:
  - Agent Harness
  - 执行循环
  - 状态恢复
readingMinutes: 10
issue: 8
draft: false
sections:
  - id: "pi-的核心结构"
    label: "Pi 的结构"
  - id: "十个项目差在哪"
    label: "架构对照"
  - id: "loop-何时结束"
    label: "结束条件"
  - id: "中途插话怎样处理"
    label: "插话与队列"
  - id: "状态恢复分五种"
    label: "恢复的对象"
  - id: "三个容易混淆的边界"
    label: "恢复陷阱"
  - id: "源码入口"
    label: "源码与范围"
---

**Harness 是模型周围的执行系统：组织上下文、执行工具、接回结果、管理会话。不同实现的主要差别，是谁控制循环，以及停止和恢复分别承诺什么。**

## Pi 的核心结构

| 模块 | 职责 |
| --- | --- |
| `pi-ai` | 统一 provider、消息与流式响应 |
| `agent-core` | 调用模型、执行工具、处理 steering/follow-up |
| `AgentSession` | 加载项目规则与 skills，管理工具、扩展、压缩和历史 |

`createAgentSession()` 将这些组件组装起来。默认工具是 `read`、`bash`、`edit`、`write`；项目规则进入 system prompt，skills 按需读取，完整会话与本轮模型上下文分开管理。

Pi 提供工具 hook，但默认继承启动进程的权限。需要文件系统、进程和网络隔离时，仍要使用沙箱或容器。[权限说明](https://github.com/earendil-works/pi#permissions--containerization)

## 十个项目差在哪

| 项目 | 循环控制者 | 有辨识度的机制 |
| --- | --- | --- |
| [Pi](https://github.com/earendil-works/pi) | `agent-core`，外层 `AgentSession` | 可嵌入循环、扩展、JSONL 会话树 |
| [Codex](https://github.com/openai/codex) | `Session / RegularTask / run_turn` | turn 输入接纳、请求级上下文、内建审批与沙箱路径 |
| [OpenCode](https://github.com/anomalyco/opencode) | legacy loop 与在建 V2 runner | V2 持久接纳输入、记录工具事件；完整恢复与多节点控制仍在建设 |
| [Kimi Code](https://github.com/MoonshotAI/kimi-code) | v1/v2 Agent 引擎 | v1 按工具读写范围调度；可选 `select_tools` 默认关闭 |
| [MiMo Code](https://github.com/XiaomiMiMo/MiMo-Code) | OpenCode 派生的 session/actor loop | 主 Agent 从 checkpoint 重建上下文，子 Agent 单独压缩 |
| [Grok Build](https://github.com/xai-org/grok-build) | `SessionActor`，另有历史与采样 actor | ACP 交互；客户端重连可接回仍在运行的 actor |
| [CodePilot](https://github.com/op7418/CodePilot) | 自研、Claude SDK、Codex 三种引擎 | 统一宿主接口，但内部循环和恢复语义随引擎变化 |
| [DeepChat](https://github.com/ThinkInAIXYZ/deepchat) | 自研逻辑轮或外部 ACP | `terminal/halted/continue`、持久输入、暂停交互恢复 |
| [Kun](https://github.com/KunAgent/Kun) | 原生循环或整轮委托 | steering 封闭接纳、历史修复；Graph 可挂起，普通 turn 不同 |
| [Multica](https://github.com/multica-ai/multica) | 外部 Agent 执行推理 | 平台管理任务、进程、会话指针与重试 attempt |

**换模型与换引擎不同。** Pi 替换 provider 时仍控制自己的循环；CodePilot、Kun 某些路径会把整轮交给外部 runtime。Multica 则主要在 Agent 之上分派任务。

## Loop 何时结束

正常结束通常需要同时满足：

1. 模型本次响应结束。
2. 当前工具已结算，不再需要工具结果续轮。
3. 应处理的输入队列为空。
4. Stop hook、Goal 或其他工作流没有要求继续。

各项目使用不同组合。取消、错误、预算耗尽是其他退出原因，不应当作成功完成。

| 实现 | 无工具调用之后还检查什么 |
| --- | --- |
| Pi | steering、follow-up；会话层还会处理重试与压缩 |
| Codex | 协议 continuation、pending input、Stop hooks |
| Kimi | buffered steer、Goal、Stop hook；特定模式还等待后台 Agent |
| Grok | Todo/Goal、interjections、completion gate |
| DeepChat | 是真正 terminal，还是等待交互的 halted |
| Kun | Graph 是否仍有工作，以及 steering 是否已安全封闭 |

**不是看回答中有没有“完成了”。** Codex 收到 `end_turn: false` 仍会继续；Pi 出现 `agent_end` 后，外层也可能再次启动 continuation。运行状态不等于业务验收结果。

## 中途插话怎样处理

投递时机主要由 UI/API 决定，消息含义再由模型理解。

| 输入方式 | Pi 的处理 |
| --- | --- |
| 工作中 Enter | steering，当前工具批次结束后交给模型 |
| 工作中 Alt+Enter | follow-up，核心循环本来准备退出时再处理 |
| Escape | 取消，不等待模型理解文字 |
| 空闲时提交 | 开始新 prompt |

普通插话不会自动建立“回答完再返回原任务”的子对话栈。例如原任务是修 Bug，用户插问“你在检查什么”：模型若回答后继续调用工具，循环继续；若只回答一句话、队列也为空，基础 Pi loop 就可能退出，虽然 Bug 尚未修完。

其他产品的默认投递方式不同：CodePilot 普通忙时输入排下一轮；DeepChat 有 queue 和显式 steer；Kun GUI 默认排队，TUI 可映射为 steer。权限回答还要绑定对应交互，不能当作普通新任务。

临近结束时还存在竞态：刚检查队列为空，新消息便到达。OpenCode V2 用 `pendingWake` 安排续跑，Codex 校验 active turn，Kun 用 `sealIfEmpty()` 决定“接纳并继续”或“关闭后拒绝”，Pi 在 `agent_end` 后也会复查队列。

这不是 UI 防抖，而是执行权交接。正确结果只有两种：新消息已被接纳，并有人继续消费；或者旧运行已关闭，新消息被拒绝或另起一轮。“已接纳”却没有后继执行者，才是这个竞态真正导致的问题。

## 状态恢复分五种

| 恢复对象 | 例子 | 不保证什么 |
| --- | --- | --- |
| 对话历史 | Pi 重建会话分支，并在请求转换时补缺失工具结果错误 | 不重新执行旧工具 |
| 待处理输入 | DeepChat 根据 claim 与消息事实决定消费或释放 | 不保证外部操作只发生一次 |
| 逻辑步骤 | DeepChat 恢复审批/问题；Kun 恢复特定 Graph 状态 | 不恢复任意程序调用栈 |
| 客户端连接 | Grok 重接仍活着的 SessionActor | 不等于 Agent 进程崩溃恢复 |
| 工作区文件 | snapshot、Git revert | 不撤销已发送的消息或远端 API 操作 |

冷启动后的普通处理也不同：OpenCode V2 将遗留工具标 interrupted；CodePilot 清理 streaming、锁和待审批状态；Kun 普通 turn 标 orphaned，而 Graph 路径可以挂起等待继续；Multica 将旧 attempt 判失败，再按策略创建新 attempt。

**MiMo 的 checkpoint、Pi 的 compaction 都主要重建下一次模型上下文，不是工具执行断点。**

选型时要按故障对象判断：浏览器断线需要重连；进程重启需要历史与队列恢复；等待审批需要保存逻辑步骤；远端操作结果未知则需要对账。只增加一个 session 文件，不能同时解决这四类问题。

## 三个容易混淆的边界

### 工具完成不等于结果已记录

Pi 串行分支逐个发出工具结果；并行分支可以先发单个 `tool_execution_end`，但要等整批 `Promise.all()` 完成才发结果消息。进程若在此间退出，已经完成的副作用可能没有对应结果记录。

### 有数据库队列不等于不会重复消费

DeepChat 重启后依据关联消息判断 claimed input 是否已应用。MiMo inbox 则先写消息、再删 inbox 行，两步不是一个事务，中间崩溃可能重复投递。

### 历史修复不等于副作用核验

工具调用通常跨越三个时间点：记录调用、执行副作用、记录结果。若死在后两步之间，日志无法区分“没有执行”和“执行成功但回执丢失”。

合成 interrupted/error 只能修复历史。要避免重复创建工单、发消息或提交远端操作，需要效果端的幂等键、operation ID 或对账接口。Multica 的新会话重试要求未观察到工具执行，但源码也明确：零工具记录不等于证明零副作用。

## 源码入口

仓库链接见上表。定位具体机制可从这些文件开始：

- **Pi**：`packages/agent/src/agent-loop.ts`、`packages/coding-agent/src/core/agent-session.ts`。
- **Codex**：`codex-rs/core/src/session/turn.rs`、`codex-rs/core/src/tools/parallel.rs`。
- **OpenCode**：`packages/core/src/session/runner/llm.ts`、`session/run-coordinator.ts`。
- **Kimi / MiMo**：`packages/agent-core/src/agent/turn/index.ts`；`packages/opencode/src/session/classify.ts`、`inbox/inbox.ts`。
- **DeepChat / Kun**：`src/main/session/data/pendingInputs.ts`；`kun/src/services/turn-service.ts`。
- **Multica**：`server/internal/daemon/daemon.go` 的 `shouldRetryWithFreshSession`。

依据 2026-09-08 的本地源码样本。上游实现可能变化；崩溃窗口是源码时序推导，未做故障注入实验。
