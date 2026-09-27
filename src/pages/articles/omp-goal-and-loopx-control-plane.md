---
title: "OMP Goal 与 LoopX：持续执行的两层控制"
titleParts:
  - "OMP Goal 与 LoopX："
  - "持续执行的两层控制"
description: "从源码区分目标、续跑与验收，说明 OMP 的会话级控制和 LoopX 的持久化控制如何分工，以及目标变更、预算与故障恢复的边界。"
publishedAt: "2026-09-27"
sourceKind: "source-code"
sourceTitle: "oh-my-pi · 7853b4e / LoopX · 5bdae1b"
sourceUrl: "https://github.com/can1357/oh-my-pi/tree/7853b4e499936f9dcc13c9b64adb55f6b342aabf"
sourceAuthor: "oh-my-pi 与 LoopX 项目维护者"
tags:
  - OMP 源码
  - 执行循环
  - 状态恢复
readingMinutes: 12
issue: 30
draft: false
sections:
  - id: "持续执行不能替代完成判定"
    label: "目标、任务与循环"
  - id: "omp-goal-把目标接入会话生命周期"
    label: "会话级目标控制"
  - id: "loopx-把一次推进变成可结算的-turn"
    label: "持久化推进与结算"
  - id: "计划可以调整-验收标准不能悄悄改变"
    label: "目标变更与验收"
  - id: "恢复要先查清副作用是否已经发生"
    label: "恢复与未知结果"
  - id: "按责任边界组合-而不是叠加无限循环"
    label: "选型与接入原则"
---

## 持续执行不能替代完成判定

**OMP 的 `/goal` 解决会话怎样围绕目标继续工作；LoopX 进一步管理一次推进是否获准、结果怎样落盘、下一次如何依据新状态行动。两者都不能仅凭“继续运行”证明目标已经完成。**

先分清四个概念。**Goal** 描述希望得到的结果；**Todo** 把工作切成可执行单元；**Loop** 决定何时启动下一轮；**Acceptance** 定义什么证据足以宣告成功。四者可以关联，但不能互相代替。

以“修复下载取消”为教学例子：目标是取消后不再写入文件，正常下载仍然成功；任务可以是定位写入链、修改取消逻辑、验证两条路径；循环负责验证失败后继续处理；验收则需要观察取消后的写入行为和正常下载结果。“已经改了三个文件”不是这个目标的完成证据。

下面按责任自上而下展开。它是组合设计的分层图，不表示安装任一工具就自动具备全部能力。

```flow
title: 从目标到可观察结果
caption: 上层给出约束，下层执行并产生证据；是否继续要回到目标与验收判断
layer: 意图 | 目标与非目标
layer: 控制 | *验收条件与推进许可*
layer: 执行 | 有界任务与工具操作
layer: 事实 | 实际结果与持久化记录
```

本文的 LoopX 指外部项目，不是 OMP 内置的 `/loop` 命令。源码链接固定到同一组提交；以下结论是实现边界分析，不是长任务成功率或成本的对比实验。

## OMP Goal 把目标接入会话生命周期

OMP 的 `GoalRuntime` 保存目标 ID、`objective`、状态、Token 预算和累计用量。`AgentSession` 从当前状态构造隐藏的目标上下文，并附带 Todo 信息；目标因此不只依赖模型从旧对话中回忆。[目标上下文注入](https://github.com/can1357/oh-my-pi/blob/7853b4e499936f9dcc13c9b64adb55f6b342aabf/packages/coding-agent/src/session/agent-session.ts#L6463-L6475)

交互模式进入等待输入阶段后，会检查目标是否仍然 active、是否允许交互式续跑、是否处于计划模式，以及用户是否正在输入。条件满足才安排隐藏的 continuation。它不是一个不顾用户状态的 `while (true)`。同一位置的 `/loop` 则围绕已配置的循环提示和动作重新提交；开启它时，Goal 的续跑调度会让路，避免两者同时自动提交。[两种调度路径](https://github.com/can1357/oh-my-pi/blob/7853b4e499936f9dcc13c9b64adb55f6b342aabf/packages/coding-agent/src/modes/interactive-mode.ts#L2335-L2418)

三个边界决定它适合怎样使用：

- **停止有状态语义。** 用户中断会暂停 active Goal；普通会话恢复也默认把 active 转为 paused。源码另有 `preserveActiveGoal` 路径，因此不能笼统说“恢复会话永远暂停”或“恢复后必定自动续跑”。
- **预算不是账单硬上限。** 用量在工具完成、Agent 结束等节点结算。这里的增量计入 input、output 和 cache write，不计 cache read；超过预算会改变状态并提示收尾，而不是预先拦截供应商的每一笔费用。
- **完成状态不等于独立验收。** `completeGoalFromTool()` 更新完成状态，但这个方法本身不运行验证器，也不检查全部 Todo 是否完成。模型调用完成工具与业务条件已经成立，是两件事。

这些行为分别由[中断与恢复](https://github.com/can1357/oh-my-pi/blob/7853b4e499936f9dcc13c9b64adb55f6b342aabf/packages/coding-agent/src/goals/runtime.ts#L236-L283)、[计量与生命周期实现](https://github.com/can1357/oh-my-pi/blob/7853b4e499936f9dcc13c9b64adb55f6b342aabf/packages/coding-agent/src/goals/runtime.ts#L62-L77)和[完成入口](https://github.com/can1357/oh-my-pi/blob/7853b4e499936f9dcc13c9b64adb55f6b342aabf/packages/coding-agent/src/goals/runtime.ts#L474-L497)约束。对于有人监督的一次修复，这种会话级机制已经很实用；需要强制验收时，还要把验证接到完成边界上。

## LoopX 把一次推进变成可结算的 Turn

LoopX 不替代宿主的模型调用、工具或权限系统。它在外部维护目标、工作项、推进许可与历史记录；宿主负责执行被准入的一段工作。这里的 **Turn 是有身份、有边界的推进单元**，不能简单等同于一次模型回复。

在所分析的路径中，CLI 先取得 fresh decision，构造当前 Turn 的上下文，再选择宿主执行路线。需要显式绑定任务时，推荐哪个 Todo 与获准执行哪个 Todo 分开处理。`should_run=false` 可能意味着等待、用户决策或其他门禁，不表示整个目标已经完成。[准入与宿主路由](https://github.com/loopx-project/loopx/blob/5bdae1b37190e47a275e0e189259b84ccbcc84f8/loopx/control_plane/turn_driver/driver.py#L116-L170)

下面是获准交付的一次推进示意。具体路线可能等待、拒绝或进入重规划；图中不是所有 Turn 都必须发生的无条件流水线。

```flow
title: 一次推进怎样留下可核对的结果
caption: 当前 Turn 完成后，下一次唤醒重新判定；不能沿用旧许可直接续跑
layer: 准入 | 读取当前状态与任务许可
layer: 执行 | 宿主完成有界工作
layer: 验证 | 检查本次结果
layer: 写回 | *持久化本次推进事实*
layer: 结算 | 核对额度与生命周期回执
layer: 再判定 | 下一次唤醒取得新许可
```

结算不是让模型写一句“完成”。写回、额度支出和 Todo 生命周期有各自的回执与约束；完成处理还会读回持久化的后继或 no-follow-up 结果，而不是直接相信宿主返回的文字。[写回与结算适配](https://github.com/loopx-project/loopx/blob/5bdae1b37190e47a275e0e189259b84ccbcc84f8/loopx/cli_commands/turn.py#L462-L725)

这种控制也有边界。`turn run-once` 执行一个有界 Turn 后结束，不能因源码存在 continuation evaluator 就推断默认有一个无限自主调度器。已追踪的 `managed-step` 路径处理可重试失败 Turn 的续接判断，本身不启动宿主、不睡眠、不支出；连续推进仍需要外部唤醒与调度。[managed-step 的职责](https://github.com/loopx-project/loopx/blob/5bdae1b37190e47a275e0e189259b84ccbcc84f8/loopx/control_plane/turn_driver/managed_step.py#L1-L22)

额度也要分清单位。LoopX 的 quota 管理交付槽位等推进额度，不是 OMP 的 Token 预算，更不是供应商账单。某次观察不扣交付额度，仍可能调用模型并产生费用。

## 计划可以调整，验收标准不能悄悄改变

下载取消的修复过程中，Agent 可能发现根因不在按钮，而在后台写入循环。调整 Todo 和假设是正常探索；把“取消后停止写入”改成“按钮显示已取消”，则是悄悄缩小目标。**计划允许变化，成功的定义不能跟着当前答案漂移。**

OMP 的目标工具提供 `create/get/complete/resume/drop`，没有通用的 `update` 或 `refine` 操作。运行时存在 `replaceGoal()`，但它创建新的目标 ID 和记账周期，不是对旧目标做带版本的语义修订。[工具接口](https://github.com/can1357/oh-my-pi/blob/7853b4e499936f9dcc13c9b64adb55f6b342aabf/packages/coding-agent/src/goals/tools/goal-tool.ts#L10-L36)与[目标替换](https://github.com/can1357/oh-my-pi/blob/7853b4e499936f9dcc13c9b64adb55f6b342aabf/packages/coding-agent/src/goals/runtime.ts#L370-L418)

LoopX 有更明确的验收契约，但它是**可选能力，不是所有目标默认生效的保证**。启用前必须已经切换到 canonical authority，即供状态变更判定使用的权威状态源。目标负责人配置验收条件、验证命令和作用范围，再把工作项绑定到条件上。验证时由宿主实际执行命令，并针对当时冻结的版本基线提交结果，不接受模型随意提交一个“通过”布尔值。[验收执行入口](https://github.com/loopx-project/loopx/blob/5bdae1b37190e47a275e0e189259b84ccbcc84f8/loopx/control_plane/goals/acceptance.py#L307-L344)

其防漂移机制可以理解为三次核对：

1. **契约是否还是原来的版本。** 修改目标描述或条件会更新 revision 与 digest，旧验证记录会过期，而不是沿用旧的绿色状态。
2. **任务是否还是被确认的工作。** 绑定保存工作字段的摘要；改变工作正文通常会让绑定 stale。摘要是字段哈希，不是自然语言理解，也不是任何备注变化都会使验收失效。
3. **验证是否对应当前范围。** `all_advancement` 会覆盖新出现的适用工作；未绑定的工作会被 hold。`selected_work` 只覆盖明确选定的任务，不能拿局部通过推断整个目标完成。

[契约版本更新](https://github.com/loopx-project/loopx/blob/5bdae1b37190e47a275e0e189259b84ccbcc84f8/loopx/control_plane/goals/acceptance_authority.ts#L88-L124)与[验收状态投影](https://github.com/loopx-project/loopx/blob/5bdae1b37190e47a275e0e189259b84ccbcc84f8/loopx/control_plane/goals/acceptance_contract.ts#L275-L375)同时说明：`accepted` 表示当前配置范围内的验证通过，不等于所有 Todo 都已完成；Todo 全部完成，也不会自动证明整个目标通过验收。

还有一个容易被名称误导的功能：当前 `goal_amendment_proposal` 只做目标变更提案的准入与追加留存。源码明确写着 **zero canonical effect**，没有 approval 字段或 commit 路径。因此，提案被接收不等于目标已修改，更不等于权限已获批准。[目标变更的实现边界](https://github.com/loopx-project/loopx/blob/5bdae1b37190e47a275e0e189259b84ccbcc84f8/loopx/control_plane/goals/goal_amendment_proposal.py#L1-L55)

验证命令本身也不是事实预言机。在教学例子里，只检查界面文字就覆盖不了后台写入；只固定某个验证文件的哈希，也没有固定它的全部依赖和运行环境。机器能够强制证据与版本对应，验收设计是否覆盖真实需求仍是工程责任。

## 恢复要先查清副作用是否已经发生

“保存状态”至少涉及三件不同的事：恢复模型上下文、恢复任务控制状态、确认外部操作的结果。前两项成功，不代表第三项已经解决。

设想宿主发起了远端操作，进程却在写入回执前退出。下一次看到“没有成功记录”，不能直接推断“操作没有执行”。恢复时要区分：

| 已知事实 | 恢复动作 | 不能做的假设 |
| --- | --- | --- |
| 尚未派发操作 | 重新检查许可后执行 | 旧许可永远有效 |
| 已派发，但结果未知 | 查询外部状态或操作标识，必要时交给人确认 | 没回执就等于没副作用 |
| 已有可靠提交回执，只缺展示更新 | 修复显示或派生记录 | 为补界面而重做外部操作 |

LoopX 的文件权威存储使用写锁、原子替换和期望版本检查；它们保护的是控制状态提交，不能把任意 shell 命令、网络请求和本地落盘变成一个跨系统事务。[文件存储的提交边界](https://github.com/loopx-project/loopx/blob/5bdae1b37190e47a275e0e189259b84ccbcc84f8/loopx/control_plane/coordination/file_authority_store.ts#L335-L413)

因此，可靠接入还需要外部操作自己的幂等键、可查询结果或补偿方案。恢复会话不是回滚；暂停循环也不自动撤销已经发出的请求。取消下载同理：界面和主进程停了，后台写入是否停止，必须观察真实执行面。

## 按责任边界组合，而不是叠加无限循环

选型的依据不是哪个系统“循环更多”，而是哪一层需要承担可检查的责任。

| 实际需求 | 优先考虑 | 仍需补齐 |
| --- | --- | --- |
| 在一次会话中持续处理清晰目标 | OMP `/goal` | 明确验收，检查实际结果 |
| 重复执行既定提示或动作 | OMP `/loop` | 有界停止与副作用控制 |
| 跨唤醒保留工作状态、协调许可与结算 | LoopX 加宿主 | 唤醒调度、身份与权限边界 |
| 阻止过期证据或未绑定工作被当作成功 | 启用并正确配置验收契约 | 覆盖需求的验证器与可靠环境 |

组合两层时，一个保守的设计是：外部控制器决定这次允许做什么，OMP 执行一个有界片段，结果经过验证与写回，再由外部控制器决定是否继续。**同一条工作通道只保留一个自动续跑的控制者**，避免两个循环竞争输入、重复执行或各自把对方的停止当成失败重试。这是接入原则，不是声称两个上游项目已经提供开箱即用的组合。

最小实践可以直接从下载取消例子开始：先写清正常路径与取消路径的可观察结果；把一次推进限定为一个可验证改动；在“操作后、回执前”主动中断，检查恢复逻辑；最后才启用连续调度。能连续跑一百轮只能证明循环还活着，能解释每一轮为什么获准、产生了什么证据、何时必须停下，才构成可维护的长期执行系统。
