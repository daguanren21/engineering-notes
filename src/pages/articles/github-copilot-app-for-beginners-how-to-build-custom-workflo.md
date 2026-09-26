---
title: Copilot Canvas：用一句话生成与 Agent 共享的界面
titleParts:
  - Copilot Canvas：用一句话
  - 生成与 Agent 共享的界面
description: Canvas 把工作流描述直接变成人机共享的双向界面，本文拆解它的生成方式、共享状态与复用路径。
publishedAt: '2026-09-26'
sourceKind: article
sourceTitle: 'GitHub Copilot app for Beginners: How to build custom workflows with canvases'
sourceUrl: >-
  https://github.blog/ai-and-ml/github-copilot/github-copilot-app-for-beginners-how-to-build-custom-workflows-with-canvases/
sourceAuthor: Kayla Cinnamon
sourcePublishedAt: '2026-09-25'
tags:
  - Agent Harness
  - 工程实践
  - Agent Workflow
readingMinutes: 4
issue: 28
draft: false
sections:
  - id: canvas-是让界面去适配工作流-而不是反过来
    label: Canvas 是让界面去适配工作流，而不是反过来
  - id: 三个问题决定一个-canvas-的边界
    label: 三个问题决定一个 Canvas 的边界
  - id: 第一版只是起点-靠对话持续收敛
    label: 第一版只是起点，靠对话持续收敛
  - id: 共享状态省掉了发送与同步这一步
    label: 共享状态省掉了发送与同步这一步
  - id: 从现成扩展改起-比从零描述更快
    label: 从现成扩展改起，比从零描述更快
---

## Canvas 是让界面去适配工作流，而不是反过来

大多数工具先给你一组固定页面，再要求你把工作塞进去。Canvas 反过来：你先描述想要的工作流，界面围绕它生成。

Canvas 也叫 canvas extension，是人和 Agent 共同拥有的一块可定制界面。形态不限——看板、issue 分诊板、发布清单、仪表盘、表单，甚至电子表格。关键属性是双向：Agent 工作时可以更新它，你也可以用按钮、卡片、筛选器等控件改动它，像一块实时共享的白板。

```flow
title: Canvas 的生成与共享回路
caption: 描述从人流向 Agent 生成界面，界面状态再双向流回人和 Agent
layer: 输入 | *自然语言工作流描述* | 三个必答问题
layer: 生成 | /create-canvas | 右侧面板界面
layer: 共享状态 | 人的操作 | Agent 的操作
layer: 复用 | 项目级扩展 | 个人级扩展
```

## 三个问题决定一个 Canvas 的边界

创建不需要写代码或做设计。打开一个 agent session，输入 `/create-canvas`，用自然语言描述即可。提示词要覆盖三件事：

- Canvas 要支撑的工作流是什么。
- 在界面上你能做什么。
- Agent 能做什么。

来源给出的例子是：为跟踪 GitHub Copilot app session 中完成的新功能工作，创建一个 release notes canvas，包含审阅和组织条目的控件，并允许 Agent 添加和更新条目。Agent 随后构建界面并在右侧面板打开，不涉及写文件或调布局。

这三个问题对应的是接口契约：可见信息、人的写权限、Agent 的写权限。描述里缺哪一项，生成的界面就在那一项上留空。

## 第一版只是起点，靠对话持续收敛

界面由描述生成，所以第一版天然是草稿。可以继续让 Agent 加一列、加一个筛选器、拉入你打开的 pull request，或者把整个 Canvas 改成当日清单，Agent 会跟着改。

来源明确说没有固定的布局菜单——能描述出来的工作流，大概率就能变成 Canvas。这句话的代价是：可预测性来自你的描述质量，而不是模板库。描述含糊，界面就含糊。

创建完成后，Canvas 以 extension 形式保存，可重复使用。可以随项目保存供团队共享，也可以存为只属于你的个人扩展。

## 共享状态省掉了发送与同步这一步

Canvas 真正的价值在于人和 Agent 可以同时工作。

你点击按钮、更新字段、移动卡片时，Canvas 的共享状态立即变化，Agent 看到的是同一次更新，中间没有单独的发送或同步步骤。反方向同样成立：你可以让 Agent 使用 Canvas 自身的能力——也就是你拥有的同一组动作——去添加一条 release note 或移动一张卡片，然后看着改动出现在界面上。

```flow
title: 命令-等待 与 共同操作 的差别
caption: 上一条是串行的请求响应，下一条是双方直接读写同一份状态
layer: 命令模式 | 人发指令 | 等待 Agent 回复 | 人再确认
layer: Canvas 模式 | 人改状态 | *共享状态* | Agent 改状态
```

这不是把 Agent 包进一个更漂亮的聊天框，而是把协作对象从消息换成状态。消息需要被解析、被确认、被重放；状态只需要被读写。

## 从现成扩展改起，比从零描述更快

社区通过 Awesome Copilot 分享了现成的 canvas extension，包括 release notes 工具、看板、issue 分诊工作流等。做法是先装一个接近需求的，再让 Agent 按你的工作流定制，方式和修改自己创建的 Canvas 一样。

落地路径很短：打开 session，运行 `/create-canvas`，为手头正在做的事描述一块简单的板或清单。判断标准不是它多完整，而是它是否同时回答了那三个问题——你想看到什么、你想直接改什么、Agent 应该能更新或做什么。三者齐了，界面才有资格成为共享状态；缺一个，它就退回成一张只读报表。
