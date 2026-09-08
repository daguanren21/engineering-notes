---
title: "pstack 与 GitHub Engineering：方法、角色和交付门禁"
titleParts:
  - "pstack ×"
  - "GitHub Engineering"
  - "方法、角色与交付"
description: "对照 pstack 上游与本地 github-engineering 配置，整理任务路由、角色分工、验证和发布权限。"
publishedAt: "2026-09-08"
sourceKind: "source-code"
sourceTitle: "pstack"
sourceUrl: "https://github.com/cursor/plugins/tree/71ed0d1076fec562c1b74ee353121a8d00f75382/pstack"
sourceAuthor: "Lauren Tan / 本地流程整理"
tags:
  - Agent Workflow
  - pstack
  - GitHub Engineering
readingMinutes: 8
issue: 9
draft: false
sections:
  - id: "两者分别解决什么"
    label: "职责边界"
  - id: "pstack-的方法入口"
    label: "pstack 技能"
  - id: "本地-agent-分工"
    label: "角色分工"
  - id: "一条可执行的交付流程"
    label: "交付流程"
  - id: "并行与验证的规则"
    label: "并行和验证"
  - id: "停止-接手与发布"
    label: "停止与发布"
  - id: "怎么组合"
    label: "组合建议"
  - id: "来源"
    label: "来源链接"
---

**pstack 提供工程方法；本地 github-engineering 规定角色、证据和交付权限。两者都依赖宿主的工具与运行内核，不是独立的持久任务引擎。**

## 两者分别解决什么

| 维度 | pstack | 本地 github-engineering |
| --- | --- | --- |
| 入口 | `poteto-mode` 按任务选择 playbook | Git remote 确认 GitHub 后，建立仓库事实和任务契约 |
| 设计 | 先理解机制，再定数据结构；必要时比较方案 | 明确 ownership、接口、调用者和修改范围 |
| Bug | 复现、证伪根因、回到同一表面验证 | 另要求 Bug class、同机制变体扫描和逐项处置 |
| Review | 多模型挑战同一设计或 patch，负责人裁决 | 独立 Verifier 验证行为，Reviewer 审查最终变更 |
| 发布 | Shipping 检查已验证 PR 栈，逐个落地 | Publisher 仅执行当前对话明确授权的计划 |
| 学习 | Reflect，将经验编码成技能或结构 | 优先修架构、类型、检查器，再调整全局规则 |

本地协议只适用于 remote 已证实的 GitHub/GitHub Enterprise 仓库；不能因为项目有 `.git` 或出现 PR 字样就套用。

## pstack 的方法入口

[pstack](https://github.com/cursor/plugins/tree/71ed0d1076fec562c1b74ee353121a8d00f75382/pstack) 是 Lauren Tan 的 Cursor 插件。常用入口如下：

| 入口 | 用途 |
| --- | --- |
| [poteto-mode][mode] | 分类任务，选择调查、Bug、性能、功能、发布等 playbook |
| `how` / `why` | 分别理解当前机制与历史原因 |
| `architect` | 确定跨函数或模块的接口、类型和数据结构 |
| `arena` | 对同一个问题做竞争尝试，再选择和整合 |
| `swarm` | 并行覆盖不同切片或调查方向 |
| [interrogate][review] | 多模型使用同一意图和 rubric 审查，不自动应用全部建议 |
| [create-verification-skill][verify] | 为项目生成并实际运行 Launch、Doctor、Drive、Evidence、Cleanup |
| [shipping][ship] / [session pickup][pickup] | 验证发布对象，或接手已有执行轨迹 |

Arena 比较方案，Swarm 分工覆盖。多开几个 Agent 并不自动构成其中任何一种。

## 本地 Agent 分工

Main 保留用户意图、跨切片接口、权限与最终接受权；不需要每个任务都调用全部角色。

| 角色 | 交付物 |
| --- | --- |
| `github-triager` | 任务分类、事实与决策缺口、验收候选 |
| `github-repo-scout` | RepoProfile、ownership、实际启动和验证入口 |
| `github-reproducer` | 稳定复现、环境分类、可证伪根因假设 |
| `github-architect` | 数据结构、接口、调用方向与迁移清单 |
| `github-builder` | 明确文件边界内的实现及自检结果 |
| `github-performance` | 固定负载、baseline、profile 与瓶颈证据 |
| `github-security` | 授权范围内的威胁模型、数据流与安全证据 |
| `github-verifier` | 对最新产物逐项给出 pass/fail/blocked/inconclusive |
| `github-reviewer` | 正确性、根因、范围、兼容与维护性审查 |
| `github-publisher` | 执行获准的 commit、push、PR、merge、release 或 deploy |

Verifier 不能修改代码或测试让验证通过；Publisher 不能边发布边修 CI。问题需要退回相应工程阶段。

## 一条可执行的交付流程

以 Bug 修复为例：

1. **确认仓库与目标。** RepoProfile 记录规则、命令和运行表面；TaskContract 写明 Goal、Non-goals、范围、验收和权限。
2. **先复现再修改。** 在真实 UI、CLI 或 API 上得到失败证据；环境差异与产品 Bug 分开处理。
3. **找机制与变体。** 写清被破坏的不变量，扫描相同机制的其他入口。每个命中归为当前修复、另行立项、排除或未判定。
4. **固定边界后实现。** 确定共享接口与唯一集成负责人，Builder 只改获准文件，迁移调用者，不加未经要求的 fallback。
5. **验证、审查、交付。** Verifier 重跑原场景与相关边界；Reviewer 审查当前 patch；Publisher 最后执行明确授权的操作。

交接至少需要四份信息：

| 契约 | 回答的问题 |
| --- | --- |
| RepoProfile | 这个仓库怎样构建、运行和验证？ |
| TaskContract | 本次改什么、不改什么，怎样算完成？ |
| EvidenceRecord | 哪项观察支持哪条验收，来自哪个版本？ |
| Delivery Plan | 允许向哪个仓库、分支执行什么操作？ |

不必为简单任务制造长文档，但这些事实不能只存在于某个 Agent 的临时理解里。

### 示例：刷新后筛选丢失

先把验收写成“应用筛选后刷新，控件和请求仍对应同一条件”，再沿 URL、store 和请求构造追踪读写顺序。不要直接给整个 store 加持久化：根因若是默认值先覆盖了 URL，扩大持久化范围只会保存错误状态。证实机制后，再检查使用相同初始化顺序的其他入口，而不是把所有“刷新异常”都归为同一种 Bug。

## 并行与验证的规则

**并行前先定接口和文件所有权。** 不同包、平台或独立假设可以并行；共享 schema 未定、多个执行者写同一文件，不能靠事后合并解决。

**统一安排集成检查。** 编辑期间由切片执行明确分配的窄检查；全量构建和集成验证在产物收敛后执行，避免拿半成品互相测试。

**验证与 Review 分工。** Verifier 判断用户行为是否成立，Reviewer 判断是否修错层、漏边界或引入风险。模型一致意见和 CI 绿灯都不能替代真实表面的验证。

例如发布静态站点，除了构建通过，还应检查目录入口、文章直达、锚点、部署前缀下的资源，以及移动端表格。

两种检查互补：Verifier 直接访问部署后的文章，发现子路径资源是否 404；Reviewer 检查 `base`、路由和构建配置是否一致，判断修复是否只照顾了一个入口。前者证明行为，后者检查机制和影响范围。

## 停止、接手与发布

模型停止输出，不等于工程流程结束。完成条件应是：验收有证据、调用者与文档已处理、阻断审查意见已解决、交付符合授权。

pstack 的 Shipping 还有两个具体门禁：

- 只从 PR 栈底连续落地已通过独立验证的部分。
- 记录 head、base 和 patch-id；patch 变化后重新验证，不沿用旧提交的绿灯。

接手时保留目标、当前版本、已完成项、待办、决定、证据和权限。先定位接手点，不重复整轮调查；继承的结论仍须对应真实产物。[接手流程][pickup]

本地授权逐项独立：**edit 不等于 push，push 不等于 merge，merge 不等于 deploy。** 角色描述和工具名单也不等于沙箱；有 shell 的角色仍需要实际环境约束。

`/loop`、会话唤醒和取消由宿主及运行扩展提供。技能文件要求持续执行，不代表进程退出后任务会自动恢复。

## 怎么组合

保留一个负责人、一份任务契约和一份权威进度，不维护两套互相竞争的工作流。

- 用本地 RepoProfile 适配仓库，不再造项目规则。
- 按需采用 pstack 的 how/why、设计探索、对抗审查和验证地图方法。
- 用本地 Verifier、Reviewer、Publisher 固定验收与授权边界。
- 重复失败优先沉淀为数据结构、类型或检查器，而不是再加一段提示词。

这是组合建议，不是已经完成运行时集成的声明。

## 来源

- [pstack 上游][mode]、[Bug fix][bug]、[Interrogate][review]。
- [项目验证技能][verify]、[Shipping][ship]、[Session pickup][pickup]。
- 本地 `github-engineering` 的 RepoProfile、TaskContract、Evidence Verification、Bug、Review/Delivery、Learning Loop 文档，以及十个 `github-*.md` 角色定义。

核验于 2026-09-08。pstack 固定在提交 `71ed0d1076fec562c1b74ee353121a8d00f75382`；本地部分是脱敏后的配置总结，不公开私人配置或会话。

[mode]: https://github.com/cursor/plugins/blob/71ed0d1076fec562c1b74ee353121a8d00f75382/pstack/skills/poteto-mode/SKILL.md
[bug]: https://github.com/cursor/plugins/blob/71ed0d1076fec562c1b74ee353121a8d00f75382/pstack/skills/poteto-mode/playbooks/bug-fix.md
[review]: https://github.com/cursor/plugins/blob/71ed0d1076fec562c1b74ee353121a8d00f75382/pstack/skills/interrogate/SKILL.md
[verify]: https://github.com/cursor/plugins/blob/71ed0d1076fec562c1b74ee353121a8d00f75382/pstack/skills/create-verification-skill/SKILL.md
[ship]: https://github.com/cursor/plugins/blob/71ed0d1076fec562c1b74ee353121a8d00f75382/pstack/skills/poteto-mode/playbooks/shipping.md
[pickup]: https://github.com/cursor/plugins/blob/71ed0d1076fec562c1b74ee353121a8d00f75382/pstack/skills/poteto-mode/playbooks/session-pickup.md
