---
title: commit-rewriter 0.2给提交信息重写加上分支参数
titleParts:
  - commit-rewriter 0.2
  - 给提交信息重写
  - 加上分支参数
description: 一个用 LLM 重写 git 提交信息的 Python 工具，0.2 版本把作用范围从默认分支扩展到任意分支。
publishedAt: '2026-09-25'
sourceKind: article
sourceTitle: commit-rewriter 0.2
sourceUrl: 'https://simonwillison.net/2026/Sep/24/commit-rewriter/'
sourceAuthor: Simon Willison
sourcePublishedAt: '2026-09-24'
tags:
  - 工程实践
  - GitHub Engineering
  - Agent Workflow
readingMinutes: 3
issue: 27
draft: false
sections:
  - id: 0-2-版本只做了一件事-让工具能指向别的分支
    label: 0.2 版本只做了一件事：让工具能指向别的分支
  - id: 为什么-只支持默认分支-是个真问题
    label: 为什么“只支持默认分支”是个真问题
  - id: 工具形态-web-app-而不是-cli-批处理
    label: 工具形态：web app 而不是 CLI 批处理
  - id: uvx-是分发方式-也是版本边界
    label: uvx 是分发方式，也是版本边界
  - id: 该不该用-取决于你的分支策略
    label: 该不该用，取决于你的分支策略
---

## 0.2 版本只做了一件事：让工具能指向别的分支

commit-rewriter 是一个 Python web app，用途是帮你重写 git 提交信息。0.1 版本默认只处理默认分支，0.2 版本加入了 `--branch` 参数，可以指定任意分支运行。

```
uvx commit-rewriter --branch other
```

这是本次发布唯一的变更。它解决的是一个很具体的摩擦：当你在 feature 分支上工作、提交信息写得潦草，想批量整理时，工具却只认 main。

## 为什么“只支持默认分支”是个真问题

提交信息的质量通常在两种场景下最差：一是赶进度的 feature 分支，二是长期存在的实验分支。这两类分支恰恰不是默认分支。

一个只能改默认分支的重写工具，等于要求你先合并、再整理，或者手动切分支。而提交信息一旦进入主干，重写成本会显著上升——历史已经被别人拉取，改写意味着 force push 和协调。

把 `--branch` 加进来，本质上是把重写动作提前到分支还没合并的阶段。这是成本最低的时机。

```flow
title: 重写时机与分支的关系
caption: 越早重写，协调成本越低；--branch 把工具的作用点从主干前移到分支

layer: 提交发生 | 草率信息 | *仍在 feature 分支*
layer: 重写窗口 | 本地历史 | 尚未合并 | 无协作者依赖
layer: 合并之后 | 已推送主干 | 需 force push | 需通知协作者
```

## 工具形态：web app 而不是 CLI 批处理

值得注意的是它的形态是 Python web app，而不是一个纯命令行脚本。这意味着交互模型是“打开界面、逐条查看、逐条确认”，而不是“一条命令重写全部”。

这个选择有代价也有收益。代价是无法塞进 CI 或 pre-commit hook 自动跑；收益是每条提交信息的改写都经过人眼确认，不会出现 LLM 批量生成一堆语义漂移的提交信息。

对于提交信息这种一旦写错就要改写历史的东西，人工确认环节是合理的默认值。

## uvx 是分发方式，也是版本边界

调用方式是 `uvx commit-rewriter`，说明它通过 PyPI 分发，由 uv 负责临时环境与依赖解析。用户不需要 clone 仓库、不需要建虚拟环境，直接跑。

这也意味着版本语义直接暴露给用户：`uvx commit-rewriter` 拿到的是最新版，行为可能随发布变化。如果重写逻辑依赖某个特定版本的 prompt 或模型行为，就应该固定版本号，而不是每次拉最新。

## 该不该用，取决于你的分支策略

如果你的团队在 feature 分支上做 squash merge，分支内的提交信息最终会被压成一条，那么重写分支内提交的收益有限——你真正需要打磨的是那条 squash 后的信息。

如果团队保留完整提交历史、要求每条提交都能独立读懂，那么 `--branch` 让整理工作可以在合并前完成，价值明确。

判断标准不是工具好不好用，而是你的历史里，提交信息到底是给人读的，还是只作为合并的载体。
