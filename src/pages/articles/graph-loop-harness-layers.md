---
title: "Graph Engineering 是升级吗：Loop、Graph 与 Harness 的职责边界"
titleParts:
  - "Graph Engineering"
  - "不是下一代 Harness"
  - "Loop、Graph 与运行时"
description: "Graph 管理任务之间的依赖，Loop 修正单个任务，Harness 提供工具、状态、隔离和证据。三者组合成系统，不构成替代关系。"
publishedAt: "2026-09-09"
sourceTitle: "Loops and Graphs: how to stop babysitting agents"
sourceUrl: "https://x.com/hanakoxbt/status/2091515787366306154"
sourceAuthor: "Hanako"
sourcePublishedAt: "2026-08-23"
tags:
  - Graph Engineering
  - Agent Loop
  - Agent Harness
readingMinutes: 11
issue: 12
draft: false
sections:
  - id: "不是升级链-而是三个职责"
    label: "三个职责"
  - id: "一张图看清三层关系"
    label: "系统架构"
  - id: "loop-负责单元内纠错"
    label: "Loop"
  - id: "graph-负责单元间编排"
    label: "Graph"
  - id: "harness-让控制逻辑真实执行"
    label: "Harness"
  - id: "gate-把检查变成控制"
    label: "Gate"
  - id: "两条返回路径不能混用"
    label: "返回路径"
  - id: "graph-何时是升级-何时是负担"
    label: "适用边界"
  - id: "建设顺序从成功条件开始"
    label: "建设顺序"
  - id: "来源与证据边界"
    label: "证据边界"
---

> Graph Engineering 不是 Loop Engineering 和 Harness Engineering 的下一代版本。Loop 管理一个任务内部的反馈，Graph 管理任务之间的关系，Harness 负责执行两者的规则。

两篇关于 Graph Engineering 的文章提出了相邻的问题。[Anatoli Kopadze 的文章][graph-article]关注依赖、并行和结果汇合。[Hanako 的文章][loops-article]把 Loop、Gate、局部重试和长期反馈补进同一张图。把两篇文章放在一起，能看见一套更完整的 Agent 系统，也能看见这个新名词没有覆盖的工程问题。

## 不是升级链，而是三个职责

把 Prompt、Loop、Harness 和 Graph 排成一条能力阶梯，会产生错误预期。Graph 增加任务数量和调度关系，但不会自动提高节点质量，也不会提供隔离、恢复或权限控制。

| 概念 | 回答的问题 | 典型机制 |
| --- | --- | --- |
| Prompt | 模型这一次收到什么要求？ | 指令、上下文、输出格式 |
| Loop | 一个任务如何迭代到可接受状态？ | 执行、检查、修正、停止条件 |
| Graph | 多个任务如何拆分、等待、并行和汇合？ | 节点、依赖、路由、返回路径 |
| Harness | 这些规则如何在真实环境中运行？ | 工具、权限、状态、隔离、恢复、证据 |

Loop 和 Graph 描述控制逻辑。Harness 是运行这些逻辑的软件。一个 Harness 可以只运行单 Agent Loop，也可以运行包含许多 Loop 的任务图。

因此，Graph 对 Loop 是上层扩展，对 Harness 是新增需求。Graph 越宽，并发冲突、部分失败和成本失控越容易发生，Harness 也要承担更多工作。

## 一张图看清三层关系

```diagram graph-loop-harness
```

图中的 Worker 各自运行一个有边界的 Loop。Splitter 决定有哪些 Worker，以及它们之间有哪些真实依赖。Harness 横跨整次运行，保存状态并执行权限、超时和验证规则。

这套结构可以写成一个简单关系：

```text
可靠的 Agent 系统
= 任务之间的 Graph
+ 节点内部的 Loop
+ 执行两者的 Harness
+ 来自环境的证据
```

这里的加号表示缺一项就会出现对应故障。没有 Graph，独立任务仍可能串行等待。没有 Loop，系统会并行产生未经修正的结果。没有 Harness，图上的隔离和 Gate 只是提示词。没有外部证据，多个 Agent 只能形成一致意见，不能证明结果正确。

## Loop 负责单元内纠错

Hanako 将 Loop 压缩为四步：执行、检查、修正、重复，直到检查通过。这个定义的重点不是重复，而是检查必须能够拒绝结果。

下面这些条件可以由程序或外部系统判断：

```text
测试进程退出码为 0
每条事实都带有可定位的来源
Diff 只修改计划声明的文件
```

下面这些句子不是可靠的检查：

```text
输出看起来不错
模型表示自己有信心
运行期间没有出现错误
```

没有错误只说明系统没有观察到错误。它不证明行为满足要求。模型自评也不能充当外部信号。

Loop 也不会自动使结果正确。Loop 只会让输出接近检查器定义的目标。检查器遗漏了真实约束，Loop 就会稳定地优化错误目标。因此，节点合同要先写成功条件，再写执行步骤。

一个节点至少需要这些字段：

```text
目标
输入与输出格式
允许读取和修改的资源
成功条件与失败状态
超时和重试上限
验证结果及其来源
```

## Graph 负责单元间编排

Graph 决定运行哪些节点、哪些节点同时运行、哪些结果需要汇合，以及失败返回哪里。第一篇文章提出的 Fake Edge Test 很实用：如果后一个任务不消费前一个任务的结果，就要检查这次等待是否必要。

数据并不是唯一依赖。两个任务即使不交换输出，也可能共享：

- 同一个文件或数据库状态；
- 同一个限流 API 或计算资源；
- 同一项尚未批准的决定；
- 同一个事务、发布顺序或安全边界。

因此，判断一条边是否存在，不能只问“哪个变量传了过去”。还要检查共享写入、资源限制、控制条件和副作用。

理想情况下，并行任务的总时间由最长依赖路径决定。实际系统还受并发容量、启动时间、限流、归并和重试影响。删除伪依赖可能缩短等待，但不会得到固定倍数的加速。

Graph 也不要求每个节点都是模型。确定性工作应交给代码：

| 适合 Code Node | 可能需要模型判断 |
| --- | --- |
| 数量统计、Schema 校验 | 判断论证是否完整 |
| 集合差、排序、精确去重 | 判断两条发现是否语义重复 |
| 测试执行、哈希、状态对比 | 解释失败是否暴露设计问题 |
| 检查输入是否齐全 | 综合有冲突的开放性证据 |

“Merge”或“Rank”这些名称不能决定实现方式。只要规则完整且无歧义，就用代码。规则需要语义判断时，再使用模型。

## Harness 让控制逻辑真实执行

Graph 声明“Worker 相互隔离”，Harness 才能创建独立上下文和工作区。Loop 声明“测试失败后修正”，Harness 才能运行测试、保存退出码并把失败交回模型。

Harness 至少要承担以下职责：

- 提供工具，并限制文件、网络和外部系统权限；
- 保存任务状态、工具结果和待处理输入；
- 隔离并发 Worker 的写入范围；
- 实施超时、取消、重试和检查点；
- 保存 Artifact，避免在会话之间反复复制大段文本；
- 从可信执行器收集测试、状态和日志；
- 在不可逆操作之前强制人工批准。

把这些规则只写进 Prompt 不够。模型可以忽略指令，也可能错误理解当前状态。权限、写入隔离和重试上限需要由执行层强制实施。

这也是 Graph 不能替代 Harness 的原因。Graph 增加了需要执行的控制规则，Harness 负责让规则在进程中成立。

## Gate 把检查变成控制

Reviewer 可以生成评论。Gate 必须改变下一步。一个结论如果不能接受、拒绝或升级任务，就只是一份报告。

Gate 的结果应包含失败范围和证据：

```text
UNIT      handlers slice
VERDICT   reject
REASON    test_auth_redirect failed
EVIDENCE  expected 302, got 200, handlers/auth.py:88
SCOPE     只修改这个文件，不触碰其他切片
NEXT      retry_unit
```

Gate 应先读取可信执行器产生的确定性结果，再读取运行轨迹和历史记录。模型自己的判断只能作为弱信号。Worker 也可能选择证据、编写测试或描述轨迹，所以 Harness 必须记录谁生成了证据，以及证据对应哪个版本。

放行策略应根据错误后果决定，而不是根据模型信心决定：

| 变更类型 | 处理方式 |
| --- | --- |
| 可逆且局部 | 确定性检查通过后可自动继续 |
| 可逆但影响范围广 | 增加集成检查、状态对比和独立 Review |
| 难以逆转或影响生产 | 在副作用发生前要求人工批准 |

“只批准最后一步”只适用于前面所有操作都在沙箱中且可以丢弃的情况。人应位于最后一个不可逆操作之前，不一定处于整张图的最后一个节点。

## 两条返回路径不能混用

第二篇文章区分了短返回和长返回。这是它对第一篇最重要的补充。

短返回用于修复当前运行：

```text
局部实现失败 → 返回对应 Worker
集成失败     → 返回 reducer 或集成节点
切分失败     → 返回 Splitter 重新规划
```

四个切片只有一个失败时，系统不应重做整个批次。重写三个已通过切片只会产生三个新的不确定结果。返回对象要携带 Unit、Reason、Evidence 和 Scope，Harness 还要限制修正范围。

长返回用于影响未来运行。一次通过或失败可以产生候选约束，再交给后续 Splitter 使用。这条路径属于控制面，不应直接修改当前 Worker 的 Prompt。

自动写回规则存在更大风险。一次偶然结果可能被推广为永久约束，过期规则也可能持续影响未来任务。安全的长返回需要经过下面的过程：

```text
运行结果
  ↓
候选约束，保留来源和适用范围
  ↓
重复验证、冲突检查和回归评估
  ↓
进入版本化规则库
  ↓
Splitter 在后续运行中读取
```

规则库需要版本、适用范围、过期条件和回滚方式。未经评估的结果只能进入候选区，不能直接改变系统策略。

## Graph 何时是升级，何时是负担

Graph 只有在任务存在真实并行宽度时，才是对单 Loop 的能力扩展。

| 任务特征 | 合适结构 |
| --- | --- |
| 一个明确的小修改 | 单 Agent 或一个 Loop |
| 步骤强依赖，后一步持续读取前一步 | 顺序 Loop 或 Prompt Chain |
| 多个只读调查方向相互独立 | 并行 Graph |
| 多个写任务拥有互斥文件或工作区 | 隔离 Worker Graph |
| 问题范围尚未确定 | 一个可交互 Agent，必要时动态派生调查 |
| 高风险且缺少外部验证 | 保留人工控制，不扩大自动化 |

Graph 是降级的常见信号包括：

- Splitter 无法写出互斥的任务边界；
- Worker 需要持续共享大段上下文；
- Merge 只能重新阅读全部原始输出；
- 多数节点争抢同一文件或外部服务；
- 没有一个检查可以拒绝结果；
- 协调、验证和重试成本超过实际工作。

Anthropic 的多 Agent Research 适合宽度优先的研究任务。其公开文章同时指出，多 Agent 系统约消耗普通聊天 15 倍的 Token，而且多数编码任务的可并行部分少于研究任务。这些限制比“可以生成多少 Agent”更能决定系统是否值得构建。

## 建设顺序从成功条件开始

一个保守的建设顺序如下：

1. 写出最终状态和可以失败的检查。
2. 用 Harness 真实执行检查，并保存证据。
3. 为一个节点加入有界 Loop。
4. 找到两个没有共享写入或控制依赖的任务。
5. 建立最小 Graph，并使用代码归并结构化结果。
6. 让 Gate 只返回失败单元。
7. 按影响范围增加人工批准。
8. 重复结果经过评估后，才进入版本化规则库。

这个顺序先建立真实性，再增加吞吐量。反过来做会先扩大未经验证的工作量，然后让用户承担所有审查。

最终关系不是一条版本链：

```text
Graph 负责系统形状
Loop 负责节点收敛
Harness 负责执行与约束
Gate 负责状态转换
外部证据负责判断结果是否成立
```

## 来源与证据边界

两篇 X 文章适合解释概念，但都使用了宣传性表达。Graph、Loop、工作流编排、依赖调度和反馈控制并不是新发明。“Graph Engineering”目前更像一组 Agent 系统设计实践的统称，不是已经标准化的工程学科。

Anthropic 的[有效 Agent 模式][effective-agents]将并行、Orchestrator-Workers 和 Evaluator-Optimizer 分开描述。其[多 Agent Research 架构][research-system]也确认了独立上下文、并行搜索和集中综合的价值，同时记录了成本和协调限制。

Bun 的 Rust 重写验证了大规模动态 Workflow 可以处理机械、可分片且测试充分的迁移任务。不过该案例使用预发布模型、约 64 个并发 Claude、约 165,000 美元 API 价格和一套大型测试系统，不能直接推广到普通仓库。[Bun 官方复盘][bun-rust]还记录了人工监控、工作区冲突和合并后的已知回归。

关于自我验证，[Huang 等人的研究][self-correction]发现，模型在缺少外部反馈时不能稳定修正自己的推理。新上下文可以减少锚定，但不能保证错误独立。Graph 增加了验证位置，测试、真实状态和可追溯来源才提供验证依据。

[graph-article]: https://x.com/AnatoliKopadze/status/2080668775796314331
[loops-article]: https://x.com/hanakoxbt/status/2091515787366306154
[effective-agents]: https://www.anthropic.com/engineering/building-effective-agents
[research-system]: https://www.anthropic.com/engineering/multi-agent-research-system
[bun-rust]: https://bun.com/blog/bun-in-rust
[self-correction]: https://arxiv.org/abs/2310.01798
