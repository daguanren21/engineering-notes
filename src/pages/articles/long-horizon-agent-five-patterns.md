---
title: "长周期 Agent 的五个设计模式：Stable Prefix、后台学习、持久工作区、显式失败与 Guard Chain"
titleParts:
  - "长周期 Agent"
  - "五个设计模式"
  - "避免静默漂移"
description: "长任务最危险的不是立即报错，而是缓存失效、记忆丢失、子 Agent 超时和安全绕过都悄无声息，系统却继续运行。"
publishedAt: "2026-09-05"
sourceTitle: "5 Design Patterns for Long-Horizon Agent Harness"
sourceUrl: "https://x.com/GoogleCloudTech/status/2090248297214525569"
sourceAuthor: "Google Cloud Tech"
sourcePublishedAt: "2026-08-20"
tags:
  - Long-Horizon Agent
  - Agent Harness
  - Reliability
readingMinutes: 14
issue: 7
draft: false
sections:
  - id: "长周期-agent-为什么更危险"
    label: "静默失败"
  - id: "模式一-保持稳定前缀"
    label: "Stable Prefix"
  - id: "缓存必须测量-不能靠猜"
    label: "测量缓存"
  - id: "模式二-把学习移到后台"
    label: "Background Learning"
  - id: "后台学习需要三道保险"
    label: "后台任务保险"
  - id: "模式三-持久工作区"
    label: "Persistent Workspace"
  - id: "不要把-启动中-误判为-已死亡"
    label: "生命周期判定"
  - id: "模式四-让失败显式进入协议"
    label: "Explicit Failure"
  - id: "同时限制工具调用和迭代"
    label: "双层预算"
  - id: "模式五-建立确定性-guard-chain"
    label: "Guard Chain"
  - id: "先规范化-再比较"
    label: "规范化输入"
  - id: "按成本排列防线"
    label: "防线顺序"
  - id: "五个模式解决的是同一个问题"
    label: "统一原则"
  - id: "如何使用参考实现"
    label: "参考实现边界"
  - id: "推荐的审计顺序"
    label: "落地审计"
---

> 一次性 Agent 会在你面前报错并停止；长周期 Agent 更可能安静地偏离目标、隐藏失败，然后继续消耗预算和修改状态。

Google Cloud Tech 的文章总结了 Long Horizon Harness 在持续数周的自用过程中遇到的问题。它们大多没有抛出异常：Prompt Cache 从未命中，API 账单却看起来正常；记忆提取拖慢每轮回复；部署清空已安装工具；子 Agent 超时，父 Agent 却报告完成；安全过滤被另一种 IP 写法绕过，而且没有留下对应日志。

这些问题共同说明，长周期可靠性不能只靠异常处理。系统需要让缓存、后台工作、环境、终止状态和权限判断都变成可观察协议。

Google 同时开源了基于 ADK 的 [Long Horizon 参考实现](https://github.com/google/adk-samples/tree/main/core/python/long-horizon-harness)。仓库明确说明它是 Apache 2.0 示例代码，不是受官方支持的 Google 产品。适合阅读和提取模式，不应未经安全审查直接指向生产系统。

## 长周期 Agent 为什么更危险

Long Horizon 指 Agent 跨越多天和多次 Session 继续同一份工作，例如持续数周的 Schema Migration、长期研究、不断接收反馈的产品迭代或定期运行的运营流程。

时间拉长后，局部正常不再等于系统正常：

```text
本轮回复成功
≠ 缓存正在生效
≠ 记忆已经持久化
≠ 工作区明天仍然存在
≠ 子 Agent 真正完成
≠ 安全策略覆盖了等价输入
```

单次 Demo 只检查最终回答；长周期系统必须检查跨轮状态、延迟趋势、失败传播和恢复路径。

文章给出的五个模式分别控制一个容易静默失效的边界。

## 模式一：保持稳定前缀

Prefix Caching 依赖 Prompt 前部保持字节级稳定。只要靠前内容发生变化，后面的缓存层也会一起失效。

原系统每轮先召回历史记忆，再把结果插入 System Prompt 顶部。记忆每次不同，因此即使已经启用缓存，Cache Hit Rate 仍然是 0。

修复方法不是关闭记忆，而是按变化速度重新组织 Prompt：

```text
顶部 / Frozen
系统指令、Persona、Tool Definitions

中部 / Slow
用户资料、当前启用的工具

尾部 / Volatile
Step Counter、运行时警告、召回记忆
```

同一段动态文本放在 System Prompt 顶部会让前缀每轮变化；放到对话尾部，则不会破坏前面的稳定缓存。

文章用 Docker Build 类比：越靠前的 Layer 发生变化，越多后续 Layer 需要重建。

## 缓存必须测量，不能靠猜

“打开缓存配置”不是验收标准。最直接的检查是第二轮开始观察 Response Metadata 中的 Cached Token Count。

如果仍为 0，应逐段检查：

- 时间戳、随机 ID 和动态计数器是否出现在前缀；
- Tool Schema 是否每轮重新排序；
- 用户记忆是否插在稳定指令之前；
- 序列化是否产生不稳定字段顺序或空白；
- Provider 是否在当前模型和请求模式下支持缓存。

原文报告，将动态记忆移到尾部后，后续轮次可以从缓存获得约 95% 的 Prompt。这个比例来自其实现与任务，不是通用目标；可迁移的标准是“读取真实 Cached Token，而不是根据配置猜测缓存已经工作”。

## 模式二：把学习移到后台

会跨会话学习的 Agent 需要提取并保存记忆。最初的实现把 Memory Extraction 放在每次回复之前，结果是用户为一份可能下周才有价值的记忆支付当前延迟。

文章改用 Write-behind：

```text
生成并返回用户回复
        ↓
在同一用户身份下启动后台记忆提取
        ↓
写入下一轮能够找到的记忆存储
```

交互主路径只完成当前用户需要的工作；学习进入第二条执行通道。这样降低当前延迟，同时保留长期收益。

但后台化不能牺牲可靠性。没有任务所有权和关闭协议，系统可能在用户看到回复后悄悄丢掉学习结果。

## 后台学习需要三道保险

原文给出三项具体保护。

### 持有强任务引用

在 Python `asyncio` 等运行时中，如果系统不保留 Background Task 的强引用，任务可能在写入完成前被回收。必须由 Job Registry 或明确的 Task Set 持有它，并记录完成、失败和取消。

### 使用隔离的 Sibling Agent

后台 Learner 应只拥有最小工具集，写权限限制在 Memory Directory，并且不再触发自己的 Post-response Hook，避免学习任务递归生成新的学习任务。

### 节流与关闭排空

高频消息不应为每一轮创建重复 Consolidation。原实现把后台整理间隔设置为 120 秒，并在 Shutdown 时等待最多 4 秒完成在途写入，因为宿主的关闭上限是 5 秒。

这些数字是实现参数，不是行业默认值。真正的不变量是：节流窗口小于可接受的新鲜度，Drain Timeout 小于宿主强制终止时间，并且超时后留下未完成状态。

## 模式三：持久工作区

传统 Web Backend 假设 Request Handler 无状态，部署后实例随时可以替换。长周期 Agent 恰好相反：同一用户几天后回来时，文件、安装工具和未完成工作都必须还在。

原文中的一次部署清空了 Agent 整个 Session 安装的 CLI。Agent 没有失败，而是重新安装，并持续报告“正在推进”。这既浪费时间，也掩盖了状态丢失。

Tool Call 应通过拥有状态的 Execution Interface，而不是直接在临时 Host 上执行。环境需要：

- 按用户而不是按单次对话划分；
- 在轮次之间保持温热或可以恢复；
- 支持新 Backend 版本重新附着；
- 明确 Snapshot 是否持久；
- 将 Secret 注入环境，而不是写进 Prompt。

Code Executor 执行完就遗忘；Environment 是明天的 Session 期待仍然存在的文件系统。

## 不要把“启动中”误判为“已死亡”

环境生命周期不能只依赖 HTTP Status Code。原实现遇到一个典型歧义：已删除环境返回 502，仍在启动、Readiness 尚未通过的环境也返回 502。如果把任何 5xx 都视为死亡，系统会反复重建正在启动的环境。

应该使用显式状态：

```text
creating → booting → ready → draining → deleted
                      ↘ failed
```

状态来自环境所有者，而不是调用者根据一个复用的错误码猜测。Readiness Failure、Terminal Failure 和 Not Found 必须能被区分。

## 模式四：让失败显式进入协议

多 Agent 系统中，一个 Agent 的输出会成为另一个 Agent 的输入。父 Agent 能否判断子 Agent 成功，取决于返回 Envelope 是否表达了真实终止状态。

原文发现，正常完成、Timeout、Step Limit、Crash 和等待 Approval 都返回相同结构：一段子 Agent Transcript。父 Agent 只能阅读文本并猜测，最终把一次实际超时描述成“20 个测试全部通过”。

修复需要两层信息：

```json
{
  "status": "timeout",
  "summary": "INCOMPLETE: 子 Agent 超时，测试没有运行",
  "evidence": [],
  "resumeToken": "..."
}
```

结构化 `status` 让调用代码可以分支；明确写出 `INCOMPLETE` 的 Summary 让模型也不会把失败文本读成成功。

原实现区分 Completed、Timeout、Halted 和 Pending。具体枚举可以不同，但所有终止方式必须互斥、可穷举，并携带恢复所需信息。

## 同时限制工具调用和迭代

另一个静默失败是“看起来一直在工作”的无限 Loop。

只限制 Session 总时间不够。一次迭代可能产生无限 Tool Call；只限制 Tool Call 也不够，Agent 可以创建无限迭代。

因此至少需要两层预算：

- 每次迭代允许多少 Tool Call；
- 每个 Session 允许多少次迭代。

达到上限后，在下一个干净边界 Halt，并把原因写入统一的 `halt_reason`。原文示例使用每次迭代 200 次工具调用、每个 Session 50 次迭代；这是宽松的参考参数，应根据真实任务分布和成本重新评估。

## 模式五：建立确定性 Guard Chain

拥有 Shell 的 Agent 可以触达机器能够触达的一切，包括云环境 Metadata Endpoint 与其中的凭据。

原实现用字符串匹配阻止 `169.254.169.254`，但十进制整数 `2852039166` 解析后是同一个 IP，可以直接绕过过滤。安全策略比较了字符串，而不是字符串代表的网络地址。

Guard Chain 把保护拆成短路执行的确定性阶段：

1. Exfiltration Guard：无条件阻止 Metadata、私网或其他危险目的地；
2. Policy Guard：根据声明式规则返回 Allow、Ask 或 Deny；
3. Interactive Prompt：只有前两层无法决定时才询问用户。

模型不参与这条安全路径。解析器、规则和计数器可以审计、测试，并在微秒级执行。

## 先规范化，再比较

任何结构化值都不应按原始字符串匹配。

网络地址可能使用：

- 点分十进制；
- 单个十进制整数；
- 十六进制；
- IPv6-mapped IPv4；
- 域名最终解析到受限地址。

正确流程是：解析命令和 URL，解析或规范化目标地址，再对规范结果应用策略。Shell Command 也应解析底层 Binary 与 Arguments，而不是用 Substring 猜测是否安全。

同样的原则适用于文件路径、域名、Git Remote、云资源 ID 和用户身份：**先变成规范对象，再执行 Policy。**

## 按成本排列防线

Guard 应从便宜、确定的检查开始，再逐步升级：

```text
硬阻断
  ↓
声明式策略
  ↓
必要时的昂贵分析
  ↓
人类确认
```

人的注意力是最昂贵资源。如果所有命令都弹窗，用户会形成无条件批准习惯，权限系统反而失效。

交互环境中 `Ask` 可以提示用户；无人值守的 Background Agent 中没有人回答，`Ask` 应转成 Deny，而不是无限等待或自动放行。

凭据还要按 Guard 已经被绕过来设计：Secret 按用户注入执行环境，模型只看到名称；Sandbox Template 不包含长期凭据；日志不记录 Secret Value。Guard 是一层防线，不是唯一防线。

## 五个模式解决的是同一个问题

表面上，它们分别谈成本、延迟、环境、错误和安全，底层其实都在做同一件事：**把隐式假设变成显式状态。**

| 隐式假设 | 显式协议 |
| --- | --- |
| 缓存应该命中 | Cached Token 指标 |
| 后台学习应该完成 | Job 状态、强引用、Drain |
| 文件明天应该还在 | 持久 Environment 生命周期 |
| 子 Agent 应该成功 | Typed Terminal Status |
| 字符串看起来安全 | 规范化对象上的 Guard Chain |

长周期系统不会被一次明显错误击垮，而会被大量“应该没问题”慢慢拖离轨道。

## 如何使用参考实现

Long Horizon Harness 基于 ADK 与 Google Agent Platform，包含跨 Session Memory、Per-user Sandbox、Tool Guardrails、Sub-agent、Compaction、Scheduled Chat 和自改进流程。

仓库把关键实现拆成可单独阅读的接口：

- Prompt Assembly 与 Prefix Cache；
- Background Memory Sibling；
- Persistent Environment；
- Typed Delegate Envelope；
- Exfiltration Guard Chain。

官方说明它是为了阅读和提取模式，而不是安装后直接使用的产品。部署示例还包含 Cloud SQL、Cloud Run 常驻实例、Secret Manager、Scheduler 和 Terraform，会产生持续费用，也需要独立配置 IAP 与权限。

使用前至少应阅读其 Architecture 与 Security Model，并让自己的威胁模型决定保留哪些组件。

## 推荐的审计顺序

如果已经有长周期 Agent，可以按下面顺序检查：

1. 第二轮查看 Cached Token 是否为零；
2. 列出所有 Post-response Background Task，确认有 Owner、Throttle 和 Drain；
3. 重启或部署后重新连接同一用户，检查文件与工具是否仍在；
4. 人为制造 Sub-agent Timeout，确认父 Agent 不会报告成功；
5. 枚举 IP、域名和路径的等价写法，尝试绕过 Guard；
6. 检查 Background Mode 中所有 `Ask` 是否会安全转成 Deny；
7. 最后再考虑更复杂的 Memory、Dreaming 或 Self-improvement。

先修静默失败，再增加自治。一个能明确停止的简单 Agent，比一个持续运行却无法证明自己仍在正确轨道上的系统更可靠。

---

原文：Google Cloud Tech，[《5 Design Patterns for Long-Horizon Agent Harness》](https://x.com/GoogleCloudTech/status/2090248297214525569)，2026-08-20。本文同时参考 Google 开源的 Long Horizon Harness README；原文中的缓存比例和运行参数来自其参考实现，不应直接视为通用默认值。
