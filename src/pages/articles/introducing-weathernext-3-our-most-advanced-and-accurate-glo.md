---
title: WeatherNext 3：绕开 NWP 的天气模型
titleParts:
  - WeatherNext 3：
  - 绕开 NWP 的天气模型
description: WeatherNext 3 直接训练实时卫星与站点观测，绕开 NWP 的六小时数据滞后，把全球预报做到逐小时、5 公里。
publishedAt: '2026-09-11'
sourceKind: article
sourceTitle: >-
  Introducing WeatherNext 3, our most advanced and accurate global weather AI
  model
sourceUrl: >-
  https://deepmind.google/blog/introducing-weathernext-3-our-most-advanced-and-accurate-global-weather-ai-model/
sourceAuthor: Google DeepMind
sourcePublishedAt: '2026-09-03'
tags:
  - 系统设计
  - 实验方法
  - 工程实践
readingMinutes: 5
issue: 14
draft: false
sections:
  - id: 真正的改变在训练数据-不在模型结构
    label: 真正的改变在训练数据，不在模型结构
  - id: 分辨率与频率的具体数字
    label: 分辨率与频率的具体数字
  - id: 降水精度靠两份数据源撑起来
    label: 降水精度靠两份数据源撑起来
  - id: 为电网而不是为雨伞设计的变量
    label: 为电网而不是为雨伞设计的变量
  - id: 分发路径决定了这套系统怎么被使用
    label: 分发路径决定了这套系统怎么被使用
  - id: 这套做法对自建系统的含义
    label: 这套做法对自建系统的含义
---

## 真正的改变在训练数据，不在模型结构

WeatherNext 2 和大多数 AI 天气模型一样，学的是 NWP（数值天气预报）的输出。NWP 是超算跑的物理模拟，本身带有六小时的数据滞后。对降雨、地表温度这类快速变化的变量，这个滞后会直接变成系统性偏差。

WeatherNext 3 换掉了训练目标：直接吃实时观测。它把全球静止卫星的 1 小时拼图（mosaic）和传统的历史分析场一起喂进一个 Functional Generative Network（FGN）mesh transformer，输出稠密网格场、离散气旋路径，并原生预测站点级的稀疏坐标。

```flow
title: WeatherNext 3 的端到端结构
caption: 观测从左侧进入单一 FGN mesh transformer，右侧同时吐出三类不同形态的输出
layer: 输入 | 1 小时静止卫星拼图 | 历史分析场 | 稀疏站点观测
layer: 模型 | *单一 FGN mesh transformer*
layer: 输出 | 稠密网格场 | 离散气旋路径 | 站点级稀疏坐标
layer: 分发 | Search 与 Gemini | Maps 与 Weather API | BigQuery 与 Cloud Storage
```

关键判断是：分辨率与更新频率的提升，来自训练数据的更换，而不是把模型堆得更大。绕开 NWP 这个中间层，模型才拿得到没有滞后的信号。

## 分辨率与频率的具体数字

旧版 WeatherNext 2 是 25 公里网格、6 小时一更新。WeatherNext 3 改成逐小时出预报，并在多个空间尺度上保持物理一致性，从全球风场一路对到局地地形。

| 变量类型 | 分辨率 |
| --- | --- |
| 温度、湿度等关键地表变量 | 5 公里 |
| 其他地表变量 | 10 公里 |
| 风速等大气变量 | 25 公里 |

整体上全球天气画面比上一代锐利约五倍。论文给出的英国 2 米温度对比里，25 公里版本呈现明显的像素化和平滑化，5 公里版本能分辨出局地地形造成的温度结构。

对海岸线、山谷、山脉附近的区域，温度与湿度在几公里内就可能剧烈变化。传统模型训练所用的分析场缺少这种细节，也就学不会极端局地变化。WeatherNext 3 直接训练稀疏气象站观测，正是为了补上这一层。

## 降水精度靠两份数据源撑起来

降水是全球模型的传统弱项。雨雪由小尺度、快速移动的云过程驱动，物理模拟很难刻画，AI 预报则常常给出模糊估计，甚至完全错过强对流边界。

WeatherNext 3 用两份高质量降水数据训练：NASA 基于卫星的 IMERG，以及自建的、基于卫星雷达的全球降水再分析。

中期全球预报的评估结果，按 CRPS 衡量：

- 对 IMERG 提升最高 60%
- 对 MRMS 提升 30%
- 对雨量计观测，在较早预报时效上提升 10%

降水概率（PoP > 1mm）的对比图里，25 公里版本是一团弥散、像素化的降水足迹，11 公里版本能贴合卫星真值，抓住天气系统锐利的对流带。

## 为电网而不是为雨伞设计的变量

除了通用气象变量，这一版专门加了清洁能源需要的量：100 米高度风速（大致是风机轮毂高度），以及高分辨率云量和地表太阳辐射。

这让电网运营方和新能源开发商能预测风光资产的发电量，再与用电需求对齐。这是把天气预报从"给人看"推向"给调度系统用"的一步：输出变量是按下游决策选的，不是按气象学分类选的。

## 分发路径决定了这套系统怎么被使用

模型能力只有落到接口上才算数。WeatherNext 3 从发布当天起接入 Google Search、Gemini app、Google Maps、Google Maps Platform Weather API 和 Google Earth Engine。

对开发者，数据按小时更新，无需自己部署模型：可以在 BigQuery 和 Earth Engine 里查询，也可以从 Google Cloud Storage 批量下载。

面向终端用户，官方给出的数字是：提前一天以上规划时，降水预报准确度最多提升 50%，在历史上预报可靠性较差的地区改善最大。

```flow
title: 一次预报从观测到用户的路径
caption: 上游是连续更新的观测，下游分成面向人的产品和面向系统的数据接口
layer: 观测 | 静止卫星拼图 | 站点观测
layer: 推理 | 逐小时重跑 | 多分辨率输出
layer: 产品 | Search 与 Gemini | Maps 与 Weather API | BigQuery 与 Cloud Storage
layer: 决策 | 出行规划 | 电网调度 | 农业与应急
```

## 这套做法对自建系统的含义

把 WeatherNext 3 当成一个工程样本，可迁移的部分有三点。

第一，当上游数据源本身带有延迟或偏差时，换掉数据源比调模型更有效。NWP 的六小时滞后是结构性的，任何在它输出上训练的模型都继承这个上限。

第二，多分辨率输出是刻意设计的结果。5 公里、10 公里、25 公里对应不同物理变量，而不是把一切都拉到最高分辨率——后者在算力和存储上都不成立。

第三，输出形态跟着下游走。稠密网格、离散路径、稀疏站点坐标三种形态并存，是因为消费方不同；清洁能源变量单独列出，也是同一逻辑。

需要说明的是，来源没有披露模型规模、训练算力、推理成本，也没有给出与 NWP 在同等分辨率下的直接对比。评估数字来自 Brightband 的独立实时榜单和文中列出的几个基线，具体口径需查论文。官方也明确提示：正式天气预报与灾害预警仍应以当地气象机构为准。
