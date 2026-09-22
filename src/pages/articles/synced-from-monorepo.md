---
title: 一次 monorepo 同步里藏着的 Agent 运行时
titleParts:
  - 一次 monorepo 同步里
  - 藏着的 Agent 运行时
description: 从一次 monorepo 同步的提交清单里，读出 Grok 构建工具在会话恢复、子 Agent、权限与可观测性上的设计取舍。
publishedAt: '2026-09-22'
sourceKind: article
sourceTitle: Synced from monorepo
sourceUrl: >-
  https://github.com/xai-org/grok-build/commit/4247f661689354b831191f11eeeac8424993fe3d
sourceAuthor: xAI
sourcePublishedAt: '2026-09-19'
tags:
  - Agent Runtime
  - 工程实践
  - 可靠性
readingMinutes: 9
issue: 24
draft: false
sections:
  - id: 这份清单本身就是一份架构图
    label: 这份清单本身就是一份架构图
  - id: 会话恢复要持久化的是-agent-profile-不是对话历史
    label: 会话恢复要持久化的是 Agent profile，不是对话历史
  - id: 子-agent-的模型选择必须从生效目录里锁存
    label: 子 Agent 的模型选择必须从生效目录里锁存
  - id: 权限策略是三值的-并且在绑定时盖章
    label: 权限策略是三值的，并且在绑定时盖章
  - id: daemon-是本地与远端会话的统一视图
    label: daemon 是本地与远端会话的统一视图
  - id: 可观测性靠的是逐轮-trace-和端到端对齐
    label: 可观测性靠的是逐轮 trace 和端到端对齐
---

## 这份清单本身就是一份架构图

来源是一份从 monorepo 同步出来的提交清单，没有正文说明，只有几十条变更条目。它的价值不在于任何单条改动，而在于条目之间的重复模式：同一个概念会在多个位置被反复修补，而这些位置恰好勾勒出系统的分层。

把条目按对象归类，会看到四类反复出现的名词：会话（session resume、compaction segment store、memory capture transcript）、子 Agent（subagent model selection、child-cancel、subagent spawning）、权限（permission overlay、Bash rules、tool-approval policy、managed hooks）、以及本地 daemon（workflows、memory list、task rows、remote badge）。这四类不是并列的功能模块，而是同一条请求链路上的四层。

```flow
title: 一次 Agent 请求穿过的四层
caption: 从上到下依次是会话层、编排层、权限层与 daemon 层，箭头方向是请求的流向
layer: 会话层 | 会话恢复 | *compaction 段存储* | memory 捕获
layer: 编排层 | 子 Agent 模型选择 | 子 Agent 取消 | 后台任务行
layer: 权限层 | Bash 规则 | 工具审批策略 | managed hooks
layer: daemon 层 | workflow 列表 | 跨机器会话 | 任务行展示
```

读这份清单的正确方式，是把它当成一份没有配文字的分层图：每一层都在被独立加固，说明这些层之间的耦合已经被压到很低。

## 会话恢复要持久化的是 Agent profile，不是对话历史

清单里最值得注意的一条是「Persist agent profile across session resume」。它和「Keep every turn in the compaction segment store」放在一起看，指向一个明确判断：会话恢复的难点不在消息历史，而在 Agent 的身份配置。

消息历史可以重放，压缩段（compaction segment）可以重建，但 Agent profile——模型、工具集、权限姿态——如果恢复后变了，那么恢复出来的会话就不是原来那个会话。所以 profile 必须持久化，而每一轮对话必须完整进入压缩段存储，不能因为压缩而丢掉某一轮。

配套的两条改动印证了这一点：「Strip encrypted reasoning from the memory capture transcript」说明记忆捕获走的是另一条通道，加密推理内容不进这条通道；「Keep the newest Agent line under 24k with a [truncated] marker」说明上下文有硬上限，超出的部分用显式标记截断，而不是静默丢弃。

这三条合起来是一条可执行的规则：恢复会话时，先恢复 profile，再重放压缩段，最后按截断策略补齐上下文。顺序错了，恢复出来的就是另一个 Agent。

## 子 Agent 的模型选择必须从生效目录里锁存

「Latch subagent model selection from the effective catalog」是一条容易被忽略但后果很重的改动。子 Agent 的模型不是由父 Agent 直接指定的，而是从一份「生效目录」（effective catalog）里锁存出来的。

锁存（latch）这个词说明了两件事：一是选择发生在某个确定时刻，之后不再随目录变化而漂移；二是目录本身是动态的，可能因为配置、权限或远端同步而变化。如果子 Agent 在运行中途重新读取目录，就会出现父子模型不一致，或者同一批子 Agent 用了不同模型。

与之配套的是「Configurable hiding of the subagent model argument」：模型参数可以被隐藏，说明这个参数在大多数场景下不应该暴露给调用方，由系统从目录里决定。再加上「Clear Cancelling when a child turn ends」和「Extend child-cancel tests」，可以看出子 Agent 的生命周期管理是这一层的重点：取消状态必须在子轮次结束时被清理，否则父 Agent 会一直以为子 Agent 还在运行。

```flow
title: 子 Agent 从派发到取消
caption: 模型在派发时从生效目录锁存，取消状态在子轮次结束时清除
layer: 派发 | 读取生效目录 | *锁存模型* | 隐藏模型参数
layer: 运行 | 子轮次执行 | 后台任务行 | 停止按钮
layer: 结束 | 子轮次完成 | *清除 Cancelling* | 上报 turn_complete
```

## 权限策略是三值的，并且在绑定时盖章

「Stamp the daemon's three-valued tool-approval policy at bind」这一条给出了权限模型的关键形状：工具审批策略是三值的，不是布尔值。三值意味着除了允许和拒绝，还有一个中间态——通常是「需要询问」或「按上下文决定」。

这个策略在 bind 时刻被盖章（stamp），也就是说它绑定在会话或工作区上，而不是每次工具调用时重新计算。这样做的代价是策略变更需要重新绑定，收益是运行期行为可预测。

同一层还有几条互相咬合的改动：「Treat hooks in the signed requirements cache as managed policy」把签名需求缓存里的 hooks 提升为托管策略；「Add allow_managed_hooks_only to skip every hook outside managed policy」提供了一个开关，只允许托管策略内的 hook 运行；「Apply configured Bash rules to unresolved filename arguments」和「Extract configured Bash policy helpers」说明 Bash 规则要覆盖那些还没解析出文件名的参数，否则通配符和变量可以绕过规则。

这几条合起来是一个明确立场：权限判断必须在参数解析之前发生，且策略来源必须可签名、可审计。

## daemon 是本地与远端会话的统一视图

清单里关于 daemon 的条目最多，而且集中在「展示」和「列举」上：列出并广播 workflow、列出其他机器的会话、远端会话显示 remote badge、把后台 shell 命令显示为任务行、memory 的 list/toggle/forget。

这些改动说明 daemon 的定位不是执行器，而是视图层：它把本机会话、其他机器的会话、子 Agent 的后台任务、workflow 和 memory 统一成同一种可列举的对象。一旦统一成对象，就能挂上操作——停止按钮、远程徽章、开关。

「Disable session folder TTL cleanup by default」是一条反向的默认值调整：自动清理默认关闭。结合「List other machines' sessions beside this one's on the local daemon」，可以看出 daemon 更倾向于保留和展示，而不是自动回收。对于需要跨机器排查问题的场景，这个默认值是对的。

## 可观测性靠的是逐轮 trace 和端到端对齐

最后一批条目全部关于测量：「Upload per-turn grok trace artifacts」「Reconstruct per-turn trace artifacts from a local session for gap-fill upload」「Measure CLI startup time end to end」「Run the end-to-end suite on the daemon and record what differs」「Add a daemon parity lane and subagent spawning to end-to-end tests」。

这里有两个独立的方法论。第一，trace 的粒度是「每轮」（per-turn），并且支持从本地会话重建后补传（gap-fill），说明上传会失败，失败后不能丢数据。第二，端到端测试要跑在 daemon 上，并且记录差异（record what differs），而不是简单断言通过——因为 daemon 环境和 CLI 环境本来就会不同，把差异记录下来比强行抹平更有信息量。

「Smoke-test one tool round-trip per API backend」是同一思路的轻量版：每个 API 后端至少跑一次工具往返，保证后端之间的行为不会悄悄分叉。

把这份清单读完，得到的判断是：这个系统的复杂度不在模型调用上，而在会话身份、子 Agent 生命周期、三值权限和跨机器视图这四件事上。任何要自建同类系统的团队，都应该先想清楚这四件事的默认值，而不是先优化推理速度。
