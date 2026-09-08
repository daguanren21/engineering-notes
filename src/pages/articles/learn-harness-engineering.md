---
title: "学 Harness Engineering：从提示词到可靠工作系统"
titleParts:
  - "学 Harness Engineering"
  - "从提示词到"
  - "可靠工作系统"
description: "一门项目制课程把 Agent 可靠性拆成任务、上下文、环境、验证与状态五层，并用对照实验逐步搭建最小 Harness。"
publishedAt: "2026-09-05"
sourceTitle: "Learn Harness Engineering"
sourceUrl: "https://walkinglabs.github.io/learn-harness-engineering/en/"
sourceAuthor: "Walking Labs"
tags:
  - Harness Engineering
  - 课程笔记
  - 实验方法
readingMinutes: 11
issue: 3
draft: false
sections:
  - id: "这门课真正教什么"
    label: "课程目标"
  - id: "强模型不等于可靠执行"
    label: "能力与可靠性"
  - id: "先按五层诊断失败"
    label: "五层诊断"
  - id: "最小-harness-包含什么"
    label: "最小 Harness"
  - id: "用对照实验而不是感觉评估"
    label: "对照实验"
  - id: "七个项目如何逐层加能力"
    label: "七个实践项目"
  - id: "让工作区对-agent-可读"
    label: "可读工作区"
  - id: "让状态跨会话连续"
    label: "跨会话状态"
  - id: "让验证独立于作者"
    label: "独立验证"
  - id: "把真实产品映射回共同框架"
    label: "产品拆解"
  - id: "模板能复制-判断不能复制"
    label: "如何使用模板"
  - id: "推荐的学习顺序"
    label: "学习路径"
---

> Harness 不会让模型突然更聪明，它建立的是一个闭环工作系统：目标可理解、环境可执行、状态可延续、结果可验证、失败可修复。

[Learn Harness Engineering](https://walkinglabs.github.io/learn-harness-engineering/en/) 是 Walking Labs 制作的一门项目制课程。它不把 Harness 当成 Prompt 技巧合集，而是把 Coding Agent 周围的工程基础设施拆成可以学习、比较和亲手搭建的系统。

课程的价值不只在概念。它同时提供理论讲义、七个渐进项目、可复制模板，以及 Pi、Claude Code、Codex 和 DeepSeek Harness 的产品拆解。读者可以先理解失败机制，再用同一任务做对照实验，最后把结论落进自己的仓库。

## 这门课真正教什么

课程首页把 Harness 的工作压缩为五件事：

- 用规则和边界约束 Agent 行为；
- 在长任务和多会话之间维持上下文；
- 阻止 Agent 过早宣布完成；
- 使用端到端验证和独立评价检查产物；
- 让运行过程可观察、可调试。

它关心的不是“模型能不能写代码”，而是“模型在真实仓库里能不能稳定完成被要求的工作”。后者包含环境初始化、项目知识、工具、状态、验证和控制系统，远大于一次推理调用。

## 强模型不等于可靠执行

[第一讲](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-01-why-capable-agents-still-fail/) 的核心判断是：模型能力和执行可靠性是两个变量。

课程引用多个行业案例说明，同一个模型在裸环境和完整 Harness 中可能表现出数量级差异。这里应注意：课程里的通过率、成本和效率数字来自其引用来源或案例陈述，不能自动推广到所有仓库。但它们支持一个可验证的研究问题：**固定模型和任务，只改变环境，结果会发生什么变化？**

日常需求通常比 Benchmark 更模糊：测试不完整、业务规则散落、环境版本不统一、完成标准没有机器定义。模型即使具备能力，也可能因为执行条件不足而失败。

## 先按五层诊断失败

课程把常见失败归到五个防线：

| 层 | 典型失败 | 应修复什么 |
| --- | --- | --- |
| 任务定义 | Agent 只能猜“搜索”是什么意思 | 对象、范围、结果和验收条件 |
| 上下文 | 架构规则只存在人脑或聊天记录 | 项目地图与按需读取入口 |
| 执行环境 | 版本、依赖和启动方式不稳定 | 可重复初始化与隔离环境 |
| 验证反馈 | Agent 凭感觉宣布完成 | 可运行的 Definition of Done |
| 状态管理 | 新会话重新探索一遍 | 持久进度、决定和证据 |

这五层不是抽象分类，而是诊断顺序。失败后不要先写“模型不够好”，而要定位：输入是否明确、事实是否可见、环境是否可执行、结果是否可验证、工作是否可恢复。

## 最小 Harness 包含什么

课程的最小模板包由几类仓库产物组成：

```text
AGENTS.md          运行规则与知识地图
init.sh            安装、基线检查与启动入口
feature_list.json  功能状态、验证步骤与证据
progress log       会话进度、失败、风险与下一步
docs/              架构和产品事实
```

这些文件不是越多越好。每一份都应有明确职责：

- `AGENTS.md` 是地图，不是百科全书；
- 初始化脚本证明工作区可用；
- Feature List 把“完成”绑定到证据；
- Progress Log 让下一会话继承事实；
- 详细文档只在相关任务中按需加载。

如果两个文件维护同一份状态，Harness 又会制造新的真相冲突。

## 用对照实验而不是感觉评估

[Project 01](https://walkinglabs.github.io/learn-harness-engineering/en/projects/project-01-baseline-vs-minimal-harness/) 让读者用同一个模型、同一个 Prompt 做两次实验：

1. 弱 Harness：只有一句任务描述；
2. 强 Harness：提前放入规则、初始化、Feature List、进度日志和架构说明。

关键是保持其他变量一致，并隔离两个工作目录。课程特别提醒，不要让弱 Harness 运行看到强 Harness 的文件，否则实验已经被污染。

比较指标包括：完成度、首次成功启动时间、人工介入次数、遗漏功能，以及 Agent 是否在程序仍不可运行时提前停止。

这里最值得复用的是实验纪律：

```text
固定任务
固定模型
固定输入
隔离工作区
保留第一次有效结果
记录真实失败
只改变 Harness
```

不要因为结果难看就重新抽样，也不要用不同 Prompt 比较两个环境后宣称 Harness 有效。

## 七个项目如何逐层加能力

课程安排了七个渐进项目：

1. Prompt-Only 与 Rules-First 对照；
2. 构建 Agent 可读的工作区；
3. 建立多会话连续性；
4. 增加运行反馈和 Scope Control；
5. 引入自验证与角色分离；
6. 组装完整、可观察的 Harness；
7. 从人工驱动过渡到 Goal、Timer、Maker-Checker 自动循环。

这个顺序很合理：先证明最小规则是否有收益，再解决知识、状态和验证，最后才引入自动循环。自治放在最后，因为没有传感器和停止条件的自治，只会更快扩大错误。

## 让工作区对 Agent 可读

“Agent 可读”不是把所有内容写成长 Prompt，而是让事实有稳定位置和入口。

根指南应该回答：

- 仓库有哪些模块，谁拥有哪个边界；
- 常用构建、运行和验证命令是什么；
- 产品与安全规则在哪里；
- 当前任务需要继续读取哪些局部文档。

信息应该靠近它所约束的代码。数据库规则放在数据层附近，组件规则放在前端目录，部署规则放在交付入口。这样既减少上下文，也降低过期概率。

## 让状态跨会话连续

长任务会经历 Context Compaction、进程退出、模型切换和人工交接。只依赖聊天记录，意味着每次恢复都要重新推断项目状态。

课程建议在对话外记录：

- 当前可验证状态；
- 已完成与未完成项；
- 做过的决定及原因；
- 执行过的验证和证据；
- 已知风险、阻塞和下一步。

状态文件必须描述事实而不是乐观结论。“应该能运行”不是状态，“命令、退出码和观察结果”才是。

## 让验证独立于作者

Verification Gap 指的是 Agent 对完成度的自信与真实正确性之间的差距。

课程的 Maker-Checker 思路把生产者和评价者分开：Maker 负责产物，Checker 根据明确 Rubric 检查。Checker 不能只收到“检查一下质量”，而要知道具体拒绝条件、证据来源和范围边界。

验证也必须匹配真实表面：代码要运行，UI 要打开并交互，研究结论要检查来源，数据要验证 Schema 和范围。测试文件本身不是证据，真正执行后的观察才是。

## 把真实产品映射回共同框架

课程还用统一框架拆解不同 Harness 产品：

- Pi：小核心、可编程扩展、按需加载；
- Claude Code：分层记忆、压缩、权限、Hooks 与子 Agent；
- Codex：仓库作为 System of Record，工作树隔离环境；
- DeepSeek Harness：把运行循环本身也变成插件。

比较的重点不是哪个模型更强，而是它们如何处理 Instructions、Tools、Environment、State 和 Feedback，以及初始化、验证、观测、交接与循环。

这种比较方式比功能清单更有用，因为它能把产品差异重新映射成工程取舍。

## 模板能复制，判断不能复制

[模板库](https://walkinglabs.github.io/learn-harness-engineering/en/resources/templates/) 提供 `AGENTS.md`、初始化脚本、进度日志、Feature List、交接说明、清理清单和评价 Rubric。

可以直接复制文件形状，但不能直接复制内容。每个模板都必须替换成真实命令、路径、功能状态和验证步骤。

尤其要警惕两种形式主义：

1. Feature List 全部写成 `passing`，却没有运行证据；
2. Rubric 使用“质量良好”一类不可执行的标准，评价者最后只能凭感觉批准。

模板的价值是让职责显式，不是让仓库看起来像拥有 Harness。

## 推荐的学习顺序

如果准备把课程落到真实项目，可以按下面顺序：

1. 选一个熟悉且非平凡的任务；
2. 固定 Prompt、模型、输入和验收 Rubric；
3. 保存第一次弱 Harness 结果，不美化失败；
4. 只增加最小项目地图与验证命令；
5. 重跑并给失败归因；
6. 再按真实缺口增加状态、权限或独立评价；
7. 最后才尝试自动循环和多 Agent。

课程最重要的学习方式不是读完术语，而是亲自观察：当环境增加一个可执行约束时，同一个模型的行为发生了什么变化。

---

原始资料：Walking Labs，[Learn Harness Engineering](https://walkinglabs.github.io/learn-harness-engineering/en/)。本文综合课程首页、第一讲、Project 01、模板库和产品拆解页面进行中文整理；课程引用的外部实验与量化结果未在本文中独立复核。
