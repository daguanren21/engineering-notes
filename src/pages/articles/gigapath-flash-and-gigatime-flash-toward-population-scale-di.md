---
title: GigaPath-Flash：把病理基础模型压到可反复跑的规模
titleParts:
  - GigaPath-Flash：
  - 把病理基础模型
  - 压到可反复跑的规模
description: 蒸馏出 22M 的 ViT-S 主干，让全切片与虚拟空间蛋白组分析从「一次实验」变成「可反复跑的人群级实验」。
publishedAt: '2026-09-18'
sourceKind: article
sourceTitle: >-
  GigaPath-Flash and GigaTIME-Flash: Toward population-scale discovery with
  efficient pathology foundation models
sourceUrl: >-
  https://www.microsoft.com/en-us/research/blog/gigapath-flash-and-gigatime-flash-toward-population-scale-discovery-with-efficient-pathology-foundation-models/
sourceAuthor: 'Naoto Usuyama, Jeya Maria Jose Valanarasu, Tristan Naumann'
sourcePublishedAt: '2026-08-31'
tags:
  - 系统设计
  - 工程实践
  - 实验方法
readingMinutes: 6
issue: 20
draft: false
sections:
  - id: 瓶颈不在单张切片-而在实验要跑很多遍
    label: 瓶颈不在单张切片，而在实验要跑很多遍
  - id: 蒸馏把十亿参数压成一个数量级更小的主干
    label: 蒸馏把十亿参数压成一个数量级更小的主干
  - id: 换掉-cnn-主干后-分布外数据反而更好
    label: 换掉 CNN 主干后，分布外数据反而更好
  - id: 规模差异要看跨队列的累计时间
    label: 规模差异要看跨队列的累计时间
  - id: 这是研究模型-不是临床工具
    label: 这是研究模型，不是临床工具
  - id: 效率本身就是一种研究方法
    label: 效率本身就是一种研究方法
---

## 瓶颈不在单张切片，而在实验要跑很多遍

病理基础模型的价值早已被证明：GigaPath 在 Providence 的真实病理数据上预训练，学的是整张切片的上下文表示，而不只是图块级特征；GigaTIME 用 4000 万个细胞、配对的 H&E 与多重免疫荧光（mIF）数据训练，把常规 H&E 图像翻译成覆盖 21 个蛋白通道的虚拟空间蛋白组图谱，在超过 14000 名癌症患者上跑出了一个虚拟人群，找出 1200 多个免疫细胞状态与临床生物标志物之间的显著关联。

问题出在成本结构上。一张全切片图像常常超过十亿像素，跑一次模型要处理数千个图块。当研究问题涉及数万名患者时，成本迅速失控。更关键的是，人群级发现不是一次模型推理：它需要特征提取、统计分析、假设检验、在患者亚组与生物标志物之间反复验证的循环。计算成本直接决定了能研究多少患者、多少数据集、多少任务、多少假设。

Flash 系列的定位就是把「实验的规模」而不是「数据的规模」打开。

```flow
title: Flash 系列在原有链路里替换了什么
caption: 上层是研究流程，下层是被替换的模型组件，箭头表示推理方向
layer: 研究流程 | 特征提取 | 统计分析 | 假设检验 | 亚组验证
layer: 切片级模型 | *GigaPath-Flash* | 22M ViT-S 图块编码器 | 21M LongNet 切片编码器
layer: 空间蛋白组 | *GigaTIME-Flash* | ViT-S 编码器 | 轻量卷积解码器
layer: 训练方式 | 从 ViT-g 教师蒸馏 | LoRA 微调 | 主干基本冻结
```

## 蒸馏把十亿参数压成一个数量级更小的主干

GigaPath-Flash 的结构很直接：一个 2200 万参数的 ViT-S 图块编码器，加一个 2100 万参数的 LongNet 切片编码器。图块编码器从原始 GigaPath 的 ViT-g 教师模型蒸馏而来，把十亿参数模型的表示能力迁移到一个体积小一个数量级的主干上。切片编码器用膨胀注意力（dilated attention）把所有图块嵌入放到同一上下文里，计算量随图块数量线性增长。

结果是在切片级分类基准（PANDA 前列腺分级、EBRAINS 脑肿瘤亚型分类）上，GigaPath-Flash 取得了所有全切片预训练模型中最低的推理成本，性能落在原始 GigaPath 的 3% 以内，而算力约为后者的五十分之一。

这里值得注意的不是「小模型也能打」这种泛泛结论，而是蒸馏的迁移目标选得准：保留的是对下游有用的病理表示，而不是逐层复现教师的行为。

## 换掉 CNN 主干后，分布外数据反而更好

GigaTIME-Flash 的做法是把原版 GigaTIME 的 CNN 主干换成 GigaPath-Flash 的 ViT-S 编码器，再配一个轻量卷积解码器完成 H&E 到 mIF 的翻译。微调用 LoRA adapter，预训练编码器权重基本冻结。

在覆盖脑、乳腺、结肠、肺癌的分布内与分布外队列上，GigaTIME-Flash 的空间蛋白预测质量与原版 GigaTIME 持平或更好。提升在分布外数据上尤其明显，说明基础模型主干改善了对未见组织类型的泛化。

效率数字是：约 6 倍加速、约 8 倍内存下降，同时预测性能更好。

## 规模差异要看跨队列的累计时间

单张切片上的加速只是减少运行时和硬件要求；放到数万张切片上，它决定一个实验是否可行。官方给出的估算假设每张切片约 10000 个图块、batch size 128、单张 A100：

| 队列规模 | GigaTIME-Flash | GigaTIME |
| --- | --- | --- |
| 1000 张 | 约 2 GPU 小时 | 约 7 GPU 小时 |
| 10 万张 | 约 7 GPU 天 | 约 30 GPU 天 |
| 100 万张 | 约 70 GPU 天 | 约 300 GPU 天 |

吞吐方面，GigaTIME-Flash 可扩展到每秒 1600 个图块以上，同时显存占用只是原版的一小部分。实际运行时间仍取决于切片大小、切块分辨率和硬件。

```flow
title: 一次人群级实验的循环
caption: 效率提升作用在循环的每一圈上，圈数越多收益越大
layer: 特征提取 | *GigaPath-Flash* | *GigaTIME-Flash*
layer: 统计与检验 | 生物标志物关联 | 亚组分层
layer: 验证 | 新队列 | 新扫描仪 | 新人群
layer: 回到起点 | 提出新假设 | 重跑特征提取
```

## 这是研究模型，不是临床工具

两个模型都以 Apache 2.0 许可开放权重，权重与代码发布在 HuggingFace 上。作者明确说明这是早期研究发布：当前评估只覆盖有限的基准与队列，跨任务、扫描仪和患者群体的更广泛验证仍然缺失。模型不用于也不验证于临床用途，包括诊断、预后、治疗选择或其他患者照护决策，性能可能因数据集、扫描仪、机构、人群和使用场景而变化。下游临床应用需要额外的多机构与前瞻性验证。

对准备使用它的人，这意味着两件事。第一，可以放心把算力预算花在更大队列和更多假设上，因为主干已经足够便宜。第二，不能把在自有数据上的表现当作已验证结论——分布外提升是作者观察到的趋势，不是对你所在机构数据的保证。

## 效率本身就是一种研究方法

GigaPath 和 GigaTIME 回答的是「病理基础模型能从整张切片和肿瘤组织里学到什么」。Flash 系列回答的是另一个问题：这些能力能不能被反复使用。当一次特征提取从 7 GPU 小时降到 2 GPU 小时，变化的不只是账单，而是研究者愿意尝试的假设数量。

把十亿参数的教师蒸馏成 2200 万参数的学生，用 LoRA 冻结主干，用线性复杂度的注意力处理图块序列——这些选择共同指向同一个判断：在人群级发现这件事上，可重复性比单次峰值性能更重要。
