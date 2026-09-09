---
title: "OMP 源码分析：子代理、Token 缓存与结构化输出"
titleParts:
  - "OMP 源码分析"
  - "子代理与 Token 缓存"
  - "结构化输出"
description: "沿一次 OMP 子任务的完整生命周期，分析上下文如何显式交接、输入前缀如何命中缓存，以及返回值如何经过 schema 校验后交回主 Agent。"
publishedAt: "2026-09-09"
sourceKind: "source-code"
sourceTitle: "Oh My Pi v18.1.14 源码"
sourceUrl: "https://github.com/can1357/oh-my-pi/tree/v18.1.14"
sourceAuthor: "Oh My Pi contributors"
tags:
  - OMP 源码
  - Multi-Agent
  - Prompt Cache
  - 结构化输出
readingMinutes: 26
issue: 11
draft: false
sections:
  - id: "一次任务的三段生命周期"
    label: "完整链路"
  - id: "subagent-demo"
    label: "上下文交接演示"
  - id: "omp-如何交接上下文"
    label: "显式交接"
  - id: "六种框架怎样传上下文"
    label: "上下文对照"
  - id: "交互演示"
    label: "缓存交互演示"
  - id: "缓存如何沿任务增长"
    label: "缓存对象与边界"
  - id: "pi-与-omp-怎样保护缓存前缀"
    label: "Pi 与 OMP"
  - id: "命中率与成本"
    label: "CH 与费用"
  - id: "结构化输出从哪来"
    label: "Schema 与调优"
  - id: "yield-如何校验和收口"
    label: "校验链路"
  - id: "从错误字符串到正确整数"
    label: "纠错示例"
  - id: "重试与恢复的边界"
    label: "重试与恢复"
  - id: "结果有效还不等于任务正确"
    label: "业务验收"
  - id: "来源与版本"
    label: "来源"
---

**一次可靠的 OMP 子任务不是“把问题扔给另一个模型”，而是一条闭环：主 Agent 明确交接任务和证据，模型服务商尽量复用稳定的输入前缀，子 Agent 再把结果按约定形状提交，由本地与父侧共同校验。** 上下文、缓存和结构化输出分别管理“知道什么”“重复计算多少”和“交回什么”，必须放在同一条生命周期里理解。

本文严格区分三类材料：标为源码行为的结论来自 OMP v18.1.14 或所列框架源码；两个交互组件都是浏览器端确定性模拟，不调用模型；后文的错误到成功过程是按源码构造的讲解示例，不是真实模型日志。本文没有真实 provider/API 基准数据，因此不会用模拟结果声称某个模型一定更快、更便宜或更容易纠错。

## 一次任务的三段生命周期

以“调查改动范围并返回受影响文件”为例，完整过程可以拆成三段：

1. **交接。** 主 Agent 传入共享 `context`、具体 `task`、证据入口和验收标准。子 Agent 拿到的是显式任务包，而不是主会话不断同步的副本。
2. **执行。** System、工具定义和已有消息组成每轮输入。历史通常向末尾追加，前缀稳定时 provider 的 prompt cache 可以少做重复 prefill；工具、System 或历史前部变化时，复用边界随之改变。
3. **收口。** 子 Agent 用 `yield` 返回结果。若任务声明了 `outputSchema`，结果先在子进程内检查，聚合后再由 executor 做完整校验；主 Agent随后还要验证事实和业务不变量。

这个顺序解释了三个常见误区：共享工作目录不等于共享调查背景，高缓存命中不等于少传上下文，schema 通过也不等于结果事实正确。

第一段先用页面模拟观察上下文如何创建、更新与回传。这里的 `fork` / `isolated` 是用于比较的上下文概念，不是把 OMP 的同名工作区选项改写成另一种语义。

```demo context-handoff
```

演示保留了三个场景：继续实现、独立审查和并行任务。每个场景都能切换创建方式，并用上一步、下一步、自动播放和重置观察时间线。展开“代码实验”后再点“运行示例”，可以看到创建后的子上下文、父方更新后的旧快照、显式发送后的新内容，以及父方最终收到的结果。运行的是本地 TypeScript 状态模型，不是 OMP 子进程或真实 token 实验。

[LangChain 的上下文文章][langchain]把两种模式概括为：`isolated` 只接收任务与明确材料，`fork` 则复制创建时的父对话快照，并在末尾加入子任务指令。关键不在名字，而在边界：**fork 是初始化快照，不是实时记忆同步；isolated 是减少锚定和无关历史，不是不给证据。** 父方后来发现的新约束仍需明确投递，子 Agent 的最终回报也不等于把整段工具轨迹合并回父会话。[Deep Agents 文档][deepagents]

三个场景由此得到不同默认策略：继续实现应带上已确认事实，避免重复调查；独立审查应共享需求、diff、复现和验收，但不预先灌入“已经证明修好”的结论；并行任务应按任务分区，只共享公共接口和真正相关的材料。若接口从 `{ items, total }` 改为 `{ data, pagination }`，旧快照不会自动更新，负责人仍要通知受影响的 Agent 并重验旧结论。

## OMP 如何交接上下文

OMP v18.1.14 的普通 `task` 路径创建子会话时，依靠明确输入和按需读取，而不是提供一个通用的“复制父会话全部历史”开关。[子任务执行器][omp-executor]中的主要通道各自负责不同事情：

| 通道 | 负责什么 | 不代表什么 |
| --- | --- | --- |
| 批量任务的 `task.context` 与每项 `task` | 共享背景、具体工作、证据位置和验收标准 | 不会自动补齐主会话里未写出的理由 |
| 项目规则、skills、文件与 artifact | 提供可读取的长期约束和产物 | 共享文件系统不等于共享聊天窗口 |
| `hub.send` | 在创建后增量发送新事实、约束或问题 | 不是自动双向同步 |
| `agent://id` | 读取该 Agent 的最终结果及结构化 sidecar 字段 | 不是默认注入完整执行轨迹 |
| `history://id` | 排查时读取子会话过程 | 不应无条件并入主上下文 |
| 复用同一个 Agent ID | 继续该子 Agent 自己的历史 | 不是重新 fork 当前父历史 |

因此，一句“修一下 timeout”仍可能让子 Agent 从头调查；写清已确认事实、证据位置、允许范围和剩余工作，才是真正的上下文交接。后文的 `outputSchema` 又为“应该怎样交回”增加机器可检查的契约。

还要避免术语碰撞：OMP 的 `task.isolated: true` 控制**工作区隔离和变更合并**，不是本文比较的上下文 isolated 模式。OMP 也没有普通任务可用的通用父历史 fork 参数。可选长期记忆后端是另一层能力，同样不能替代本次任务中的显式消息和版本管理。[子 Agent 系统模板][omp-subagent-prompt]

代码模拟强调的三个工程不变量同样适用于真实实现：快照不能意外共享可变消息引用；新增信息必须记录投递对象和所属任务；主 Agent 默认消费结论与产物，需要排查时才读取轨迹。真实系统还要处理消息裁剪、未闭合工具调用、权限和失败恢复，本页动画没有模拟这些部分。

## 六种框架怎样传上下文

相同术语在不同 Harness 中并不等价。下表保留的是所核对源码路径的范围，不把内部能力误写成普通模型工具都能调用的默认行为。

| 实现 | 普通委派 | 继承或继续的特殊路径 |
| --- | --- | --- |
| [OMP][omp-executor] | 新子上下文，加明确的 context/task | 同 ID 续做，`hub` 发增量；没有通用父对话 fork 参数 |
| [Kimi Code](https://github.com/MoonshotAI/kimi-code) | 普通 Agent/AgentSwarm 不复制父历史 | `resume` 保留子历史；BTW 旁路可复制父上下文，但禁用工具 |
| [DeepChat](https://github.com/ThinkInAIXYZ/deepchat) | 新会话收到结构化 handoff | 返回短结果并链接子 Tape；当前 orchestrator 路径不 fork 父历史 |
| [OpenCode](https://github.com/anomalyco/opencode) | Task 创建子 session，只传委派 prompt | `task_id` 继续旧子会话；Session fork 不是 Task 默认行为 |
| [Codex](https://github.com/openai/codex) | V1 默认不继承；启用本地 V2 协议时默认 `fork_turns="all"` | V1 有 `fork_context`；V2 可选 `none`、`all` 或最近 N 轮，实际历史仍会过滤 |
| [Grok Build](https://github.com/xai-org/grok-build) | 模型调用普通 Task 时 `fork_context: false` | Harness 内部可 fork；`resume_from` 复制旧子 Agent，不是当前父历史 |

Kimi 的旁路问答不能等同于带工具的 Worker fork，Grok 的内部参数也不是普通模型工具的公开选项。结束时返回摘要或结果，只说明有回传通道，不说明子 Agent 的全部历史被合并了。没有固定到同一版本和入口的源码证据，也不应把表中行为外推到所有发布版。

上下文交接决定了子 Agent 从什么事实出发；接下来每次模型请求仍要把规则、工具和消息编码为输入。第二段用缓存模拟器观察这条输入怎样复用。

```demo prompt-cache
```

这个组件同样是确定性概念模型。先切换“只追加新结果”“修改工具定义”“修改 System”“压缩历史”，再关闭“缓存可用”；它展示前缀边界与 usage 算术，不模拟真实 tokenizer、最小缓存长度、查找粒度、缓存节点或完整计费规则。

## 缓存如何沿任务增长

Prompt cache 保存的是输入前缀的 **Key/Value 中间状态**，不是把上一轮答案直接拿来复用。新输入仍需处理，输出仍需生成。Anthropic 按 **Tools、System、Messages** 的顺序描述缓存前缀：越靠前的块改变，后面可复用的范围越容易一起失效。[Anthropic 文档][anthropic]

这也说明几个经常混在一起的机制其实不同：

| 机制 | 保存或减少什么 |
| --- | --- |
| Prompt/KV cache | provider 侧重复输入的模型计算状态 |
| 会话文件、数据库历史 | 客户端用于重建对话的消息 |
| `artifact://` 与文件读取 | 控制大工具输出怎样存放、何时再读入 |
| 响应引用、增量传输 | 少上传已有消息，或引用服务端已有响应 |

同一个 Harness 可以同时使用这些机制，但一种存在不能证明另一种已经生效。OMP 把超长工具输出存进 `artifact://`，先给模型有限预览，需要时再读全文；图片 blob 去重也主要减少本地持久化体积。这是在控制**新增上下文和存储**，不是本地维护模型 KV cache。[Artifact 设计][omp-artifacts]

模拟器里的五种观察对应真实前缀规则：

1. **只追加消息：** Tools、System 与旧 Messages 不变时，旧前缀最容易继续命中，新尾部仍需处理。
2. **修改 Tools：** 最早的工具块改变，后面的相同 System 和历史也不再是同一前缀。
3. **修改 System：** 工具块仍可能复用，但从 System 开始的后续内容需要重新处理。
4. **压缩历史：** 工具和 System 可以保留，旧消息被摘要替换后，共同前缀在历史边界中断。
5. **缓存不可用：** 即使文本前缀完全相同，条目过期、模型不支持或请求没有到达持有缓存的节点，也可能没有 `cacheRead`。

有一个容易漏掉的短历史边界：保持缓存可用，选择“压缩历史”，把历史调到 1,000 tokens。页面摘要同样设为 1,000 tokens，所以总输入**没有减少**，但可复用前缀变短了。摘要化是否省 token，要比较替换前后的实际长度；“发生 compaction”本身不能证明输入更少。

TTL 也属于可用性条件。Anthropic 默认缓存寿命为 5 分钟，可选成本更高的 1 小时写入；寿命从写入或读取请求开始计时，长时间生成也会消耗窗口。OpenAI 当前文档区分较早模型的 `prompt_cache_retention` 与 GPT-5.6 及之后的 `prompt_cache_options`，后者当前 TTL 为 `30m`，支持显式断点并单独计缓存写入。客户端字段、model compatibility 与 provider 当前接口必须对应；稳定 key 只是路由提示，不是命中保证。[OpenAI 文档][openai]

## Pi 与 OMP 怎样保护缓存前缀

这里的 Pi 指 `pi-mono` 的 provider 适配与交互统计，不把 OMP 定制行为都归到上游 Pi 名下。[Pi 源码][pi]

| 层面 | Pi 中的处理 | 作用与边界 |
| --- | --- | --- |
| Anthropic | 在 System、工具定义及末尾合适的用户/工具结果内容上设置 `cache_control` | 提供可缓存前缀边界；仍受模型能力、长度与 TTL 限制 |
| OpenAI Responses | 将稳定 `sessionId` 映射为 `prompt_cache_key` | 帮助相关请求路由到可复用缓存；不保证命中 |
| 保留时间 | `cacheRetention` 默认 `short`，`long` 走兼容分支 | Anthropic 支持时请求 `1h`；本地 OpenAI 适配有旧 `24h` 字段路径，不适用于所有型号 |
| 上下文增长 | 工具循环通常在既有历史末尾追加 | 可复用的不只 System，也可能包括大部分历史 |
| 动态工具 | 支持时延迟加载或引用工具 | 避免反复改写顶层工具集；回退到普通列表仍可能破坏前缀 |
| 统计 | 规范化 usage，展示 CH 与缓存浪费估计 | 用来发现 miss，不是本地 KV 引擎 |

工具数量少不必然提高命中率，**工具定义、顺序和前缀稳定**才重要。主 Agent 与 subagent 是否共享历史，也不能直接推出各自的缓存命中率。

OMP v18.1.14 又针对 Coding Agent 工作流增加了六类保护。它们不是为了缓存而放弃正确性，而是尽量把容易变化的内容移到后部，或避免无必要地改写早期请求形状：

| OMP 的处理 | 为什么影响缓存 | 边界 |
| --- | --- | --- |
| 日期与 cwd 放在用户回合提醒，而非 System footer | 避免每次改写早期系统块，尤其照顾在 System 后渲染工具的开放模型 | 只保护更早前缀，不保证整段历史命中 |
| 保留兼容后端需要的历史 reasoning 字段 | 本地 chat template 丢掉旧 thinking 块会重建出不同前缀；Qwen 路径还使用 `preserve_thinking` | 只回放已返回并保留的字段，不会恢复不可见推理 |
| 软工具要求先提醒，必要时才单轮强制 `toolChoice` | 模型按提醒执行时，不必每轮改变工具选择配置 | 需要硬约束时仍会升级，缓存不能凌驾于控制要求 |
| 压缩与交接用 `toolChoice: "none"` 取文本，而非直接清空工具定义 | 禁用调用不等于移除定义，可以尽量保留工具前缀 | 被摘要替换的历史仍会改变后续前缀 |
| OpenAI 断点能力与 TTL 进入兼容层 | 只向支持的 GPT-5.6+ 路径发送显式断点和 `30m` TTL | 不支持时拒绝请求，不能把同一字段发给所有兼容服务 |
| 本地 `learn` 教训从后续会话注入 | 不在学习后立刻改写当前会话前缀 | 需启用相应学习能力，也不代表所有记忆后端策略相同 |

依据分别见[提示词组装][omp-prompt]、[provider 兼容说明][omp-compat]、[软工具要求][omp-loop]、[本地记忆][omp-memory]。

横向比较也要限定入口：

| 实现 | 缓存处理重点 | 不能据此声称 |
| --- | --- | --- |
| [Pi][pi] | provider 适配层放置标记、传稳定会话 key、规范化统计 | 自研了独占的服务端缓存算法 |
| [OpenCode](https://github.com/anomalyco/opencode) | 集中转换 provider options；手动路径选 System/尾部消息，部分 Anthropic SDK 路径用自动缓存 | 所有 provider 都使用相同断点规则 |
| [Kimi Code](https://github.com/MoonshotAI/kimi-code) | Anthropic 路径标记 System、最后工具和最后内容块；工具披露另有稳定前缀设计 | 所有动态工具功能默认开启 |
| [Codex](https://github.com/openai/codex) | 稳定 `prompt_cache_key`；符合条件时用 WebSocket 增量发送 | `previous_response_id` 就等于 KV cache 命中 |
| [DeepChat](https://github.com/ThinkInAIXYZ/deepchat) | 按 provider/model 白名单选择自动或显式策略，主要用于流式会话 | 独立 `generateText` 等所有入口都有相同策略 |
| [Grok Build](https://github.com/xai-org/grok-build) | Anthropic 转换放置断点；Responses 映射可转发可选 key | 没有显式 key 就一定没有 provider 缓存 |

Codex 的增量 WebSocket 路径会检查非输入属性是否一致、新输入是否恰好接在上次请求与返回之后；不满足才退回完整输入。Pi 的普通 Responses 路径则可以仍发送完整消息列表，同时获得高缓存命中。**少上传 JSON、少做 prefill、少花总费用是三个独立指标。** `store: false` 也不能简单翻译为“关闭 prompt cache”。

## 命中率与成本

Coding Agent 的连续工具调用很适合前缀缓存：规则与工具通常稳定，旧历史不断增长，每轮只增加少量工具结果，而且调用间隔往往短于 TTL。若旧前缀为 50,000 tokens、本轮新增 1,000 tokens，且旧前缀全部命中：

```text
CH = 50,000 / 51,000 ≈ 98.0%
```

Pi 底部的 **CH 是最近一次请求的输入 token 命中比例**，不是请求命中次数占比，也不是整个任务累计节省比例。使用 Pi 归一化 usage 时，公式为：

```ts
cacheRead / (input + cacheRead + cacheWrite)
```

OpenAI 原始 `input_tokens` 已包含缓存部分，不能再直接加一次 `cached_tokens`；Pi 的 Responses 转换会先拆出缓存读取与写入桶。历史越长、尾部越短，CH 越容易接近 100%，但这只说明旧前缀占比大，不说明那些历史都对当前任务有用。

费用至少要分开计算，并统一到同一 token 单位：

```text
输入费用 = input × 普通输入价
         + cacheWrite × 缓存写入价
         + cacheRead × 缓存读取价
总费用还包括输出、工具与其他实际收费项目
```

在页面默认示例中，长历史请求为 51,000 tokens、CH 约 98%；压缩后为 8,000 tokens、CH 62.5%。若缓存读取价是普通输入价的十分之一，两次单轮输入相对费用约为 6,000 和 3,500 个普通输入 token 的价格。这个算术是页面假设，不是 provider 账单；还要加摘要生成、后续轮次和输出费用，不能据此宣布整个任务一定更便宜。

压缩后的 miss 也不一定是缺陷，它可能用一次重建换来后续更短的上下文。Pi 的缓存浪费扫描会在 compaction/branch summary 边界重置比较基线，不把这类变化直接算成同一前缀的重复收费。排查时应先统一 input/cacheRead/cacheWrite/output 口径，再检查真实 Tools、System 和 Messages 前缀，最后对比同任务的冷启动、连续调用与压缩后总费用；不要为了漂亮的 CH 保留错误或过期上下文。

执行完成后，第三段要解决另一个问题：即使子 Agent 自信地返回“找到两个文件”，父方怎样知道它交回的是可消费的对象，而不是混有说明文字、缺字段或类型错误的文本？

## 结构化输出从哪来

OMP 的公开结构化子任务路径先解析一份**有效输出 schema**。优先级是：

```text
本次 task.outputSchema > Agent 定义中的 output > 当前 session.outputSchema > 无 schema
```

这里判断的是 caller 是否显式提供该字段；`schemaMode` 则优先使用本次请求值，其次使用 session 设置，默认是 `permissive`。[结构化子任务入口][omp-structured]

`outputSchema` 可以写 JSON Schema，也可以写较简洁的 JTD（JSON Type Definition）。字符串输入先作为完整 JSON 解析；JTD 的 `properties`、`optionalProperties`、`elements`、`values`、`enum`、`discriminator` 和整数类型会转换为 JSON Schema。例如 JTD 的 `int32` 变成 JSON Schema 的 `integer`，`properties` 对象默认封闭额外字段。[JTD 转换源码][omp-jtd]、[RFC 8927][jtd-rfc]

公开入口还有一个重要的 preflight 边界：**caller 显式传入的无效 schema 在 `permissive` 和 `strict` 两种模式都会在创建 artifact 和启动子 Agent 之前被拒绝。** 继承自 Agent 或 session 的 schema 在 strict 模式也会预检。若绕过公开 structured-subagent 入口而直接调用更低层 executor，无效 schema 在 permissive 路径可能最终显示为 `unavailable`；那是内部低层路径的兼容行为，不能反过来解释成公开 `task` 会接受无效的显式 schema。[结构化子任务入口][omp-structured]

这里的“调优”发生在 Harness，而不是模型权重里：任务说明与 schema 给模型明确目标；支持 strict tool schema 的 provider 可以在解码时约束工具参数；本地 `yield` 再用错误信息要求同一子会话修正；父侧最后决定是否接受。`schemaMode` 改变最终失败策略，不是 fine-tuning，也不会训练模型。

provider 的 strict 工具约束和 OMP 的 `schemaMode: "strict"` 也不是同一个开关。前者决定错误参数是否可能从模型端发出来；后者决定 OMP 在最终校验失败时是否让任务失败。非 strict provider 仍可把错误类型送到本地 validator，这正是后面构造示例要展示的路径。[yield 工具源码][omp-yield]

### 优先调接口，再调提示

如果要提高首次提交的可靠性，优先把接口写清楚，而不是反复增加“必须严格遵守”的警告：

- **收紧真实取值范围。** 固定状态使用 `enum`；必填、可选和 `null` 不要互相矛盾，复杂联合只在业务确实需要时引入。
- **补全字段说明。** 写清单位、统计口径、空结果和失败怎样表达。OMP 将兼容处理后的 schema 放进 `yield.data` 参数，也在 description 中补充说明；本地验收仍检查原来的输出约束。
- **让错误可以定位。** 一次反馈字段路径及本次校验发现的问题，让同一子会话重新提交完整结果，而不是只收到一句“格式不对”。
- **观察首次通过率、纠错次数和放宽验收次数。** 最终能解析成 JSON，不代表过程稳定；反复重试还会增加请求、上下文和输出费用，高 CH 不能抵消所有额外开销。

这些是调优建议和应观察的指标，不是本文测得的模型表现。Schema 设计、模型端约束和反馈闭环共同提高可靠性；其中任何一层都不能代替事实验收。

## yield 如何校验和收口

子 Agent 看到的协议很小，但每种形状有明确终态含义：[yield 提示][omp-yield-prompt]

| 调用 | 含义 |
| --- | --- |
| `{ "data": <完整结果> }` | 通常的成功终态 |
| `{ "error": "原因" }` | 失败或主动中止；不能与 data 并存 |
| `{ "type": ["files"], "data": <一个分节值> }` | 增量、非终态 section |
| `{ "type": "result" }` | 终态；只有已有增量 section 时，schema 任务才可省略 data |

边界归一化只处理工具协议本身：`type: null`、`data: null` 和空 `error` 视为未提供。它不会把业务字段的 `"2"` 变成数字 `2`，也不会把 `"true"` 变成布尔值。只有当整个 data 是以 `{` 或 `[` 开头的合法 JSON 字符串、而且解一层后恰好通过 schema 时，工具才会无损采用解析值；格式损坏的 JSON 不会补引号、补括号或走 JSON5 猜测。[yield 工具源码][omp-yield]

一次结构化结果经过四步：

1. **生成工具参数。** OMP 把 JTD 转成 JSON Schema；可表达时为 provider 构建 strict 版本。为了支持增量提交，工具参数还允许顶层属性值或数组单项，但最终对象仍按完整 schema 检查。
2. **子侧即时校验。** terminal data 按完整 schema 校验；`type: ["label"]` 按对应顶层属性的子 schema 校验，数组属性检查单个 item。封闭 schema 会拒绝未知 section label，错误作为 tool error 回到同一子会话，不会提前结束。[输出校验器][omp-output-validator]
3. **聚合与父侧复验。** 多次同 label 会聚合，schema 声明为数组的 label 即使只有一项也保持数组；带 data 的 terminal 结果覆盖先前 sections，无 data 的 `type: "result"` 保留已累计 sections。executor 随后对完整数据再次校验。[yield 聚合][omp-yield-assembly]、[子任务执行器][omp-executor]
4. **记录状态与产物。** 父侧元数据记录 `source`、`mode`、`status: valid | invalid | unavailable`、可解析的 `data` 与错误。原始最终输出写入 `<id>.md`；只要有结构化 data，还会尝试写 `<id>.json` sidecar，所以父方可用 `agent://id` 或字段选择器按需读取，而过程仍留在 `history://id`。[子任务类型][omp-task-types]、[子任务执行器][omp-executor]

`strict` 与 `permissive` 的差别比名字更窄：普通、未 override 的最终数据违反 schema 时，两种模式都会失败。permissive 只在有限兼容情形下放行，例如子侧用尽 schema 纠错预算后标记 `schemaOverridden`，此时整体可退出 0，但状态仍是 `invalid` 并带 warning；strict 对任何这类 failure 都返回 `schema_violation` 和非零退出。不要把 permissive 理解为“所有 schema 错误都能成功”。

## 从错误字符串到正确整数

下面是**按源码构造的教学过程，不是真实模型日志**。为了让错误确实到达本地 `yield` validator，假设所选 provider 没有对这次工具调用启用 strict constrained decoding；OMP 仍设置 `schemaMode: "strict"`，所以父侧最终不会接受错误结果。

主 Agent 在 `tasks` 数组中的任务项声明输出要求。下面是单个任务项，不是整个工具调用封装：

```json
{
  "name": "CountFiles",
  "agent": "scout",
  "task": "返回受影响文件、简短结论和准确数量。",
  "schemaMode": "strict",
  "outputSchema": {
    "type": "object",
    "properties": {
      "summary": { "type": "string" },
      "files": { "type": "array", "items": { "type": "string" } },
      "count": { "type": "integer", "minimum": 0 }
    },
    "required": ["summary", "files", "count"],
    "additionalProperties": false
  }
}
```

同一个子 Agent 第一次提交了完整但类型错误的对象：

```json
{
  "data": {
    "summary": "找到两个受影响文件",
    "files": ["src/a.ts", "src/b.ts"],
    "count": "2"
  }
}
```

字段不会被静默 coercion。本地工具返回的第一处错误路径和信息是：

```text
Output does not match schema: count: expected integer, received string. Call yield again with the corrected shape — 2 retry attempt(s) remain before the schema constraint is dropped.
```

这个 tool error 不终止会话，也不需要新建另一个 Agent。`CountFiles` 保持同一 ID 和自己的历史，根据反馈重新提交**完整对象**，而不是只补一个 `{ "count": 2 }` patch：

```json
{
  "data": {
    "summary": "找到两个受影响文件",
    "files": ["src/a.ts", "src/b.ts"],
    "count": 2
  }
}
```

第二次在子侧通过，父侧组装后再按同一 schema 校验，得到的结构化元数据可表示为：

```json
{
  "source": "caller",
  "mode": "strict",
  "status": "valid",
  "data": {
    "summary": "找到两个受影响文件",
    "files": ["src/a.ts", "src/b.ts"],
    "count": 2
  }
}
```

这里能证明的是源码规定的控制流和数据形状，不是某个真实模型一定会一次修正成功。若 provider 已在解码阶段严格约束 `count`，第一次错误甚至不会形成合法工具参数；若 provider 返回连接、鉴权或限流错误，也不会伪装成上面的 schema 反馈。

## 重试与恢复的边界

源码里有几组目的不同的有限保护，数字相近但不能合并为一个“自动修复三次”：

| 机制 | 触发条件 | 实际边界 |
| --- | --- | --- |
| 缺少终态 yield 的提醒 | Agent 一轮结束但没有 terminal yield | 初始 prompt 后最多追加 3 个提醒；前两次是普通提示，第三次在模型支持时指定 `toolChoice: yield`。之后仍无有效提交或可验收的 JSON fallback 时，结构化任务失败 |
| schema 纠错预算 | `yield.data` 或已知 section 不符合 schema | 前 3 次坏提交返回 tool error；第 4 次仍坏才被接收并标 `schemaOverridden`。strict 最终拒绝；permissive 只会带 warning、`status: invalid` 地接受这个 override |
| 连续 yield 工具错误保险丝 | 同一执行中 yield 持续返回 `event.isError` | 连续第 6 次终止子会话；任一非错误 yield 会把这项连续计数清零 |
| 空 `{}` 提交保护 | 无 type、data 和 error | 前 3 次要求补齐，第 4 次显式 aborted，避免父方无限等待 |

schema 失败计数在当前 `YieldTool` 实例中事实上不会因一次成功提交而清零，所以源码注释虽写“consecutive”，实际更接近实例内累计失败数；这与“连续 6 次工具错误”的计数规则不同。[yield 工具源码][omp-yield]

还有三条恢复边界：

- **完整 JSON fallback：** 若最终没有 yield，executor 只会尝试解析整段 `rawOutput.trim()`；顶层有 `data` 就取该字段，并最多再解一层合法 JSON container string。候选值必须通过 schema。它不会从夹杂说明文字的输出里抽取局部 JSON，也不会修补 malformed JSON 或转换字段类型。
- **异步结果会使旧 yield 失效：** terminal yield 之后若又收到属于该子会话的 async result，executor 要求基于新结果重新 yield；一直不刷新会失败，但旧 payload 可作为 salvage 保留。
- **transport/runtime failure 单独处理：** provider 连接、鉴权、限流、runtime limit 或已有带错误信息的失败状态不是 schema error。后来的合法 yield 可以保住数据，却不会抹掉先前真实的传输失败；`stopReason: error` 也不会进入无意义的 missing-yield 提醒循环。[子任务执行器][omp-executor]

所以这里的纠错是**反馈式重提**，不是 executor 神秘地重写 JSON，更不是训练模型。有限解析只接受无损、完整且重新校验成功的值；重试预算的作用是避免一个子会话无限占用执行链。

## 结果有效还不等于任务正确

结构化校验只回答“结果是否符合声明的形状”。上面的对象即使写成两个文件却 `count: 3`，依然可能通过类型与 required 检查。`status: valid` 不会证明路径真实存在、文件确实受影响，也不会自动证明 `count === files.length`。

父 Agent 或消费方还要执行独立的业务检查，例如：

```ts
if (result.count !== result.files.length) {
  throw new Error("count must equal files.length")
}
```

更重要的任务还应回到真实表面核对：读取文件、运行指定场景、检查测试输出或让独立 Reviewer 重放验收。schema 能阻止缺字段和错误类型，把结果变成稳定接口；事实验证负责阻止“形状正确、内容错误”。这一步也把生命周期闭合：明确交接降低重复调查，稳定前缀减少可复用输入的重复计算，结构化返回方便消费，而最终证据决定任务是否真的完成。

## 来源与版本

- OMP 主分析固定到 v18.1.14：[结构化子任务入口][omp-structured]、[task 参数与结果类型][omp-task-types]、[yield 提示][omp-yield-prompt]、[yield 工具][omp-yield]、[输出校验器][omp-output-validator]、[JTD 转换][omp-jtd]、[结果聚合][omp-yield-assembly]、[executor][omp-executor]。这些链接指向该 tag 的 raw 源码，不以默认分支代替版本证据。
- 上下文部分参考[微信解读](https://mp.weixin.qq.com/s/XJcoOMqxIMBogXQwuM11Iw)、[LangChain 原文][langchain]与[Deep Agents fork 文档][deepagents]；OMP 交接语义另核对了[子 Agent 系统模板][omp-subagent-prompt]。
- 缓存部分核对 [Pi 源码][pi]中的 `packages/ai/src/api/anthropic-messages.ts`、`openai-responses.ts`、`openai-responses-shared.ts`，CH 位于 `packages/coding-agent/src/modes/interactive/components/footer.ts`，浪费估计位于 `core/cache-stats.ts`；provider 行为参考 [Anthropic][anthropic] 与 [OpenAI][openai] 官方文档。
- 其他框架比较来自对应本地源码样本：OpenCode `src/provider/transform.ts`；Kimi `packages/kosong/src/providers/anthropic.ts`；Codex `codex-rs/core/src/client.rs`；DeepChat `promptCacheCapabilities.ts` 与 `promptCacheStrategy.ts`；Grok `conversation/messages.rs` 与 `request_builder.rs`。表格只描述核对入口，不代表所有版本和配置。
- API 文档核验于 2026-09-09。本文未执行真实模型/API benchmark；页面模拟和构造示例都不能替代 provider usage、账单、运行日志或业务验收证据。

[langchain]: https://www.langchain.com/blog/organizing-context-in-a-multi-agent-harness
[deepagents]: https://docs.langchain.com/oss/python/deepagents/subagents#forked-subagents
[pi]: https://github.com/earendil-works/pi
[anthropic]: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
[openai]: https://developers.openai.com/api/docs/guides/prompt-caching
[jtd-rfc]: https://datatracker.ietf.org/doc/html/rfc8927
[omp-structured]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/packages/coding-agent/src/task/structured-subagent.ts
[omp-task-types]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/packages/coding-agent/src/task/types.ts
[omp-yield-prompt]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/packages/coding-agent/src/prompts/tools/yield.md
[omp-yield]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/packages/coding-agent/src/tools/yield.ts
[omp-output-validator]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/packages/coding-agent/src/tools/output-schema-validator.ts
[omp-jtd]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/packages/coding-agent/src/tools/jtd-to-json-schema.ts
[omp-yield-assembly]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/packages/coding-agent/src/task/yield-assembly.ts
[omp-executor]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/packages/coding-agent/src/task/executor.ts
[omp-subagent-prompt]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/packages/coding-agent/src/prompts/system/subagent-system-prompt.md
[omp-prompt]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/docs/system-prompt-customization.md
[omp-compat]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/docs/provider-compat-reference.md
[omp-loop]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/packages/agent/src/agent-loop.ts
[omp-memory]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/docs/memory.md
[omp-artifacts]: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.1.14/docs/blob-artifact-architecture.md
