---
title: Gemini 3.8 TTS：把配音变成可编排的脚本工程
titleParts:
  - Gemini 3.8 TTS：把配音
  - 变成可编排的
  - 脚本工程
description: Gemini 3.8 TTS 把语音生成拆成音色设计与逐行表演两个可控层，并给出可落地的接口与安全约束。
publishedAt: '2026-09-24'
sourceKind: article
sourceTitle: Gemini 3.8 text-to-speech says hello
sourceUrl: 'https://deepmind.google/blog/say-hello-to-gemini-38-text-to-speech/'
sourceAuthor: Google DeepMind
sourcePublishedAt: '2026-09-23'
tags:
  - 结构化输出
  - Agent Runtime
  - 工程实践
readingMinutes: 5
issue: 26
draft: false
sections:
  - id: 语音生成被拆成了两个独立可控的层
    label: 语音生成被拆成了两个独立可控的层
  - id: 音色层-从-30-个预设到可复刻的无限库
    label: 音色层：从 30 个预设到可复刻的无限库
  - id: 表演层-脚本里的控制标记
    label: 表演层：脚本里的控制标记
  - id: 评测结果说明了什么
    label: 评测结果说明了什么
  - id: 接入路径与选型判断
    label: 接入路径与选型判断
---

## 语音生成被拆成了两个独立可控的层

Gemini 3.8 Flash TTS 与 Gemini 3.8 Flash-Lite TTS 的核心变化不是音质，而是把「谁在说」和「怎么说」拆成了两个可以分别调参的层。前者由音色设计负责，后者由逐行表演指令负责。

这个拆分的意义在于：音色一旦确定，就可以被保存、复用、跨项目保持一致；而表演是逐行的、临时的、可以反复改的。过去这两件事绑在一个 preset 里，改语气就会动到音色。

```flow
title: 从脚本到音频的两层控制
caption: 上层决定音色身份，下层决定每一行的表演，两层可以独立修改
layer: 音色层 | 自然语言音色设计 | 2000+ 音色库 | *30 秒样本复刻*
layer: 表演层 | 逐行舞台指令 | 双人场景调度 | 非语言提示
layer: 输出层 | 长音频生成 | SynthID 水印 | C2PA 凭证
```

## 音色层：从 30 个预设到可复刻的无限库

3.8 Flash TTS 支持用自然语言从零设计音色，可调维度包括角色、口音和声音特征，覆盖 100 多种语言和方言。官方给出的例子包括墨尔本口音的高能量 DJ、极细的单调机器人声、以及一条日语的龙。

除了从零生成，还有两条路径：

- 音色库：2000+ 个可直接使用的音色，包含墨西哥西班牙语、魁北克法语、苏格兰英语这类区域变体。
- 音色复刻：用 30 秒音频样本重建一致的音色轮廓。

复刻这条路径附带三个约束：需要声音所有者的口头同意录音并与参考说话人匹配，输出带 SynthID 水印，并附 C2PA 凭证。这不是可选项，是接口的一部分。

官方还预告了 voice remixing：从音色库里挑一个音色，再用 prompt 微调音色、音高、语速和口音，例如「加一点轻微的美国南方口音」或「让表达更柔和」。

## 表演层：脚本里的控制标记

两个模型都对每一行的表达方式提供精确控制。可以自己写舞台指令，也可以让模型根据自然脚本线索自行判断，从平静的客服到耳语式的悬疑场景。

具体能力有三块：

- 长音频生成：在数小时的连续音频中维持音质、自然停顿和角色音色，说话人漂移很小，面向播客和有声书。
- 原生双人场景调度：从单一脚本直接调度多轮对话，两个音色保持清晰分离，轮次交接自然。
- 脚本化的发声与非语言反馈：用 `<laughs>`、`<sigh>`、`<gasp>` 这类标记插入非语言声音，用 `|mhm|`、`|yeah|` 这类标记插入主动倾听的应答词，用来卡喜剧节奏和反应点。

这里值得注意的是标记语法本身。`<laughs>` 和 `|mhm|` 是两种不同的括号，说明模型对「表演性发声」和「对话应答」做了区分。写脚本的人需要按这个约定来标注，否则控制不会生效。

## 评测结果说明了什么

官方给出的数字集中在 Hume AI 的两个榜单上：

| 指标 | 结果 |
| --- | --- |
| Voice Design Benchmark 总分 | 71.4，第一 |
| 口音建模 | 60.8，第一 |
| Overall Quality Index | Flash TTS 第一，Flash-Lite TTS 第二 |

相对 Gemini 3.1 Flash TTS，官方称在长内容生成和双人剧本控制上有明显提升。在 Voice Arena 的盲测人类偏好评估中，两个模型在日语、巴西葡萄牙语、越南语、现代标准阿拉伯语、墨西哥西班牙语和印地语等关键语言上排名靠前。

这些数字来自厂商自述，榜单口径和测试集没有在正文中展开。可以确认的是方向：口音建模被单独列为一项指标，说明区域口音是这一代的主要竞争点，而不是通用音质。

## 接入路径与选型判断

两个模型的定位差异是明确的：Flash TTS 面向深度创作和角色设计，Flash-Lite TTS 面向高吞吐、低成本的规模化场景，比如大批量配音、音频内容生产和带细粒度语气控制的语音 Agent。

```flow
title: 两个模型的部署面
caption: 同一套接口，按创作深度和吞吐成本分成两条产品线
layer: 开发者 | Gemini API | Google AI Studio 音频工作台
layer: 企业 | Gemini Enterprise API（即将开放）
layer: 终端产品 | Gemini Notebook（Flash） | Google Vids（Flash-Lite）
```

开发者今天就能在 Gemini API 和 Google AI Studio 里用到两个模型。AI Studio 被描述成一个音色设计工作台：可以先从零 prompt 出新的声音身份，或复刻自己的声音，再导入双人剧本编辑器逐行调度。企业侧通过 Gemini Enterprise API 开放的时间是「即将」。终端产品上，Flash 进入 Gemini Notebook，Flash-Lite 进入 Google Vids。

生态方面，Agora、LiveKit、Pipecat、Vercel 这类开发者平台负责承载实时语音接口；Figma、HeyGen、Linguana、Wondercraft、99.co、Ollang 则在做全球配音、区域口音本地化和规模化对话语音 Agent 的集成。

选型上可以这样判断：如果要做的是实时语音 Agent 或大批量配音，成本曲线是主要约束，Flash-Lite 是默认选项；如果要设计角色音色、做有声书或需要双人剧本级的表演控制，Flash TTS 的音色设计和逐行指令才是必要的。两者共享同一套脚本控制语法，所以从 Lite 迁到 Flash 不需要重写脚本，只需要重新设计音色层。
