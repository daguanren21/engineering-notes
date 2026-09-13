---
title: 让 Agent 跑 27 分钟生成跑步路线：能力之外的透明度缺口
titleParts:
  - 让 Agent 跑 27 分钟
  - 生成跑步路线：
  - 能力之外的透明度缺口
description: >-
  GPT-6 Astra 用 Nominatim 与 Overpass 算出 5K/10K 环线，但代码不可见、线程压缩后无法追溯，暴露了 Agent
  系统的可审计性缺口。
publishedAt: '2026-09-13'
sourceKind: article
sourceTitle: Generating running routes with GPT-6 Astra and ChatGPT Work
sourceUrl: 'https://simonwillison.net/2026/Sep/12/astra-running-routes/'
sourceAuthor: Simon Willison
sourcePublishedAt: '2026-09-12'
tags:
  - Agent Harness
  - Long-Horizon Agent
  - 工程实践
readingMinutes: 6
issue: 15
draft: false
sections:
  - id: 一次-27-分钟的任务-产出物是完整可用的
    label: 一次 27 分钟的任务，产出物是完整可用的
  - id: 路线是怎么算出来的-地理编码加路网下载-计算在本地
    label: 路线是怎么算出来的：地理编码加路网下载，计算在本地
  - id: 可视化走的是-skill-与白名单-cdn
    label: 可视化走的是 skill 与白名单 CDN
  - id: 真正的缺陷是代码不可见-压缩让它彻底消失
    label: 真正的缺陷是代码不可见，压缩让它彻底消失
  - id: 交付物与执行记录必须分开保存
    label: 交付物与执行记录必须分开保存
---

## 一次 27 分钟的任务，产出物是完整可用的

用户给 ChatGPT Work 的指令只有一句话：给定住址，用 OSM 数据算出从家门口出发的 5K 和 10K 环线。任务跑了 27 分钟，交付了三样东西：内嵌在对话里的可视化地图、可下载的 GPX 文件、以及 GeoJSON 文件。

这不是一次问答，而是一次长时程的 Agent 执行。判断它成功的标准不是回答得像不像，而是产物能不能直接拿去跑步。GPX 与 GeoJSON 是标准格式，说明 Agent 没有停在“描述一条路线”，而是真的算出了几何数据并落盘。

```flow
title: 从一句自然语言到可下载路线
caption: 自上而下是任务分解的层级，最底层是真正产生几何数据的三个外部依赖
layer: 用户意图 | 住址 | 5K 与 10K | 环线约束
layer: Agent 规划 | 地理编码 | 路网下载 | *本地环路计算*
layer: 外部数据源 | Nominatim | Overpass / OSM
layer: 交付物 | 内嵌可视化 | GPX 文件 | GeoJSON 文件
```

## 路线是怎么算出来的：地理编码加路网下载，计算在本地

被问及实现方式时，Agent 给出的回答很短：用 Nominatim 定位地址，用 Overpass 下载本地的 OpenStreetMap 道路与小径，然后在本地计算环路。

这条链路值得拆开看。Nominatim 负责把住址字符串变成坐标，这是所有空间任务的起点，也是最容易出错的一步。Overpass 负责按区域拉取 OSM 的路网数据，返回的是道路与小径的图结构。真正的环路计算发生在 Agent 自己的执行环境里，而不是某个现成的路线 API。

这个分工决定了能力边界。路线质量取决于 OSM 在该区域的覆盖密度，以及本地算法如何处理断头路、不可通行路段和起终点闭合。5K 环线最终报出的长度是 5.1 km，说明算法接受一定误差，而不是强行凑到精确的 5000 米。

## 可视化走的是 skill 与白名单 CDN

地图的呈现方式暴露了这套系统的运行结构。Agent 调用了一个名为 visualize 的 skill，生成文件 `/workspace/el-granada-5k-share.html`，再把这个 HTML 直接嵌入 ChatGPT 界面。

这个 HTML 的结构是自包含的。一个 `script type="application/json"` 元素里塞进了完整的 GeoJSON 几何数据，既包含跑步路线，也包含用于绘制底图的数据。渲染用 D3，从 `cdn.jsdelivr.net` 加载。

关键约束在 CSP。visualize skill 明确列出了允许的外部来源：

- `cdnjs.cloudflare.com`
- `esm.sh`
- `cdn.jsdelivr.net`
- `unpkg.com`
- `fonts.googleapis.com`
- `fonts.gstatic.com`
- `fonts.bunny.net`

其他来源一律被拦截，而且是静默失败。这一条对写 skill 的人比看起来更重要：任何依赖非白名单 CDN 的可视化代码不会报错，只会什么都不显示。把几何数据内联进 HTML 而不是运行时去取，也是在同一个约束下的自然选择。

## 真正的缺陷是代码不可见，压缩让它彻底消失

用户明确说这是 anti-feature：Agent 实际运行的代码和它做了什么，在 ChatGPT 界面里看不到。

更糟的是时间窗口。等用户想起来要一份 Python 代码时，ChatGPT 已经给不出来了。原因指向线程压缩——上下文被压缩后，压缩前的原始内容不再可访问。

```flow
title: 压缩如何吃掉可追溯性
caption: 上半是正常路径，下半是压缩发生后的失败路径，两条路径的分叉点在上下文被压缩的那一刻
layer: 正常路径 | 执行代码 | 代码留在上下文 | 用户可索取
layer: 失败路径 | 线程压缩 | *原始代码被丢弃* | 索取失败
layer: 应有的设计 | 保留压缩前文本 | 通过 tool call 暴露 | 可随时回溯
```

用户给出的修复方向很具体：任何使用压缩的 LLM 系统，都应该同时保留压缩前的文本，并让这段文本可以通过 Agent 的 tool call 取回。这不是可选的便利功能，而是防止这类信息永久丢失的必要机制。

这里有一个容易被忽略的推论。压缩本身是为了控制上下文长度，是长时程任务的必需品，27 分钟的执行几乎必然触发它。所以问题不是“要不要压缩”，而是“压缩时把什么扔掉”。把执行轨迹当作可丢弃的中间状态，就会得到这次的结果：产物还在，过程没了。

## 交付物与执行记录必须分开保存

这次任务在交付层面是成功的，在审计层面是失败的。两者并不矛盾，因为它们依赖不同的存储策略。

产物是终态，体积小、格式标准，天然适合留在对话里。执行记录是过程，体积大、时效性强，最容易被压缩策略清理掉。如果系统只保证前者，那么每一次长时程任务都会重演同一个问题：用户拿到结果，却无法复现、无法审查、无法在结果可疑时回溯到出错的那一步。

对自建 Agent 系统的人来说，可操作的结论有两条。第一，把执行过程中的代码与工具调用写入持久化存储，而不是只留在上下文里，压缩只影响上下文，不应影响存储。第二，给这段存储配一个 tool call 入口，让 Agent 自己能在被追问时把它取回来。这两条做到之后，27 分钟的执行才真正可审计，而不只是可交付。

```flow
title: 长时程任务的两条存储线
caption: 产物线留在对话里供交付，执行线必须落到持久化存储并通过 tool call 取回
layer: 执行线 | 代码与 tool call | *持久化存储* | tool call 取回
layer: 产物线 | GPX | GeoJSON | 内嵌可视化
layer: 用户 | 拿到结果 | 追问过程 | 复现与审查
```
