---
title: Cursor Projects把上下文从会话搬进项目
titleParts:
  - Cursor Projects
  - 把上下文从会话搬进项目
description: Cursor Projects 用常驻 coordinator 加共享上下文文件，把 Agent 工作从单次会话变成可跨月维护的项目。
publishedAt: '2026-09-23'
sourceKind: article
sourceTitle: Cursor Projects
sourceUrl: 'https://cursor.com/changelog/projects'
sourceAuthor: Cursor
sourcePublishedAt: '2026-09-10'
tags:
  - Agent Harness
  - Multi-Agent
  - 系统设计
readingMinutes: 5
issue: 25
draft: false
sections:
  - id: 会话不是工作单元-项目才是
    label: 会话不是工作单元，项目才是
  - id: coordinator-不写代码-只做拆解与回收
    label: Coordinator 不写代码，只做拆解与回收
  - id: 共享上下文文件是这套系统的记忆体
    label: 共享上下文文件是这套系统的记忆体
  - id: 云端常驻-本地按需拉起
    label: 云端常驻，本地按需拉起
  - id: 订阅把触发权从人手里拿走
    label: 订阅把触发权从人手里拿走
  - id: 该不该把工作搬进-project
    label: 该不该把工作搬进 Project
---

## 会话不是工作单元，项目才是

Cursor 这次发布的 Projects，核心判断只有一句：Agent 的工作单元不该是一次会话，而是一个能持续数月的项目。官方给的例子是 feature、migration、整个 app——都是那种一次对话装不下、隔几天回来还得重新交代背景的活。

它要解决的是三个具体的失效点。第一，上下文会丢：关掉窗口再打开，之前 agent 摸清的代码结构、测试方式全部作废。第二，人得反复当调度：任务拆解、并行、回收结果，全靠人手动喂 prompt。第三，Agent 只在你开口时才动，Slack 里来的 bug、定时任务、新开的 PR 都不会自己触发。

Projects 的答案是把这三件事都收进一个常驻结构里：一个 coordinator agent、一套跨机器同步的上下文文件、一组订阅式触发条件。

```flow
title: Project 的三层结构
caption: 上层只负责规划与回收，实现与执行下沉到可并行的 agent 层，上下文文件横向贯穿所有机器
layer: 触发层 | Slack 频道 | 定时计划 | PR 订阅
layer: 协调层 | *Coordinator Agent* | 任务拆解 | 结果回收
layer: 执行层 | Cloud Agent 并行 | 本地 Agent 测试 | 共享上下文文件
```

## Coordinator 不写代码，只做拆解与回收

这是整个设计里最值得抄的一条约束：项目里的 coordinator agent 自己不动手写代码。它规划工作、把任务委派给实现型 agent、再把完成的结果带回来给人检查。

把「规划」和「实现」拆到不同 agent 上，好处是 coordinator 的上下文可以保持干净——它记的是任务图、依赖、进度，而不是某个文件第 300 行的具体写法。它按需创建和管理 agent，工作要多少并行就开多少，官方说法是能委派到数千个 subagent。

代价也很明确：coordinator 必须有一套可靠的回收机制，否则并行开出去的任务就散了。来源没有说明它如何判定一个委派任务「完成」，只说把 finished work 带回来给人 check——也就是说，验收权始终留在人手里，agent 不自我批准。

## 共享上下文文件是这套系统的记忆体

每个 Project 维护一组文件，在所有 cloud 和 local 机器上的 agent 之间同步。Agent 往里面写研究结论、产物、以及对代码库的了解和你偏好的工作方式。

官方举的例子很具体：如果某个 agent 搞清楚了怎么测试一个 service，那么之后每一个 agent 都能直接用这份说明。这就是共享上下文和普通 memory 的区别——它不是某个 agent 的私有笔记，而是项目级的、可被后续所有 agent 复用的资产。它随项目增长，coordinator 也因此越用越有效。

这里隐含一个工程要求：这些文件必须能跨机器同步且不冲突。来源没有展开冲突解决策略，只说 sync across every cloud and local machine，这一点在自建类似系统时需要自己补。

## 云端常驻，本地按需拉起

Project 跑在云上自己的计算机里，所以合上笔记本不会中断它。这是「跨月工作」能成立的前提：进程的生命周期不再绑定人的在线状态。

但有些事必须在你的机器上做，比如本地环境才能跑的测试。这时 coordinator 会临时拉起一个 local agent 在本地执行。

```flow
title: 一次任务的执行路径
caption: 云端常驻负责长周期与并行，本地 agent 只在需要真实机器时被临时唤起，两者共用同一份上下文
layer: 常驻侧 | *Cloud 计算机* | Coordinator | 并行实现 Agent
layer: 按需侧 | 本地 Agent | 本机测试 | 环境验证
layer: 共享侧 | 上下文文件 | 研究结论 | 工作偏好
```

这个分工把「长周期」和「真环境」两个需求同时满足了。云上负责不睡觉的调度和并行，本地负责那些无法在云端复现的验证。两边通过同一套上下文文件对齐，而不是靠人来回搬运信息。

## 订阅把触发权从人手里拿走

Subscriptions 是这次发布里最容易被低估的部分。你可以让 coordinator 盯一个 Slack 频道、按计划运行、或者跟进你所有的 PR。它据此自己采取行动，不需要你先发 prompt。

官方给的场景是：接上 Slack，指向一个 bug 上报频道，每来一个 bug 它就开始委派。

这意味着系统的输入源从「人的 prompt」扩展成了「外部信号」。对使用者来说，工作模式从「我想做点什么」变成「事情发生了，项目自己开始动」。随之而来的问题来源没有回答：触发频率如何限制、误报的 bug 会不会直接消耗掉一批 agent 预算、多个订阅同时触发时 coordinator 如何排优先级。这些是接入前需要自己想清楚的边界。

## 该不该把工作搬进 Project

判断标准是工作的持续时间和上下文密度。如果一件事能在一次会话里做完，Project 的常驻 coordinator 和同步文件都是纯开销。如果一件事要跨周推进、需要反复回到同一批背景知识、并且有外部信号驱动，那么把上下文从会话里搬出来就是必须的。

真正需要自己补的是三件事：共享上下文文件的冲突与清理策略，coordinator 判定任务完成的规则，以及订阅触发的配额与优先级。来源目前是 beta 状态，这三点都还没有给出答案。
