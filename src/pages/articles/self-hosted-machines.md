---
title: 自托管机器：把工具执行留在内网
titleParts:
  - 自托管机器：
  - 把工具执行留在内网
description: Cursor 自托管机器的调度模型：池化 worker、按需伸缩与休眠恢复，以及把工具执行留在自有网络内的边界。
publishedAt: '2026-09-10'
sourceKind: article
sourceTitle: Self-hosted machines
sourceUrl: 'https://cursor.com/changelog/self-hosted-machines'
sourceAuthor: Cursor
sourcePublishedAt: '2026-09-02'
tags:
  - Agent Runtime
  - 系统设计
  - 可靠性
readingMinutes: 3
issue: 13
draft: false
sections:
  - id: 把工具执行从云端搬回内网
    label: 把工具执行从云端搬回内网
  - id: 池是队列-不是仓库绑定
    label: 池是队列，不是仓库绑定
  - id: 执行落在已有的沙箱上
    label: 执行落在已有的沙箱上
  - id: 桌面操作把-worker-变成有状态机器
    label: 桌面操作把 worker 变成有状态机器
  - id: 判断
    label: 判断
---

## 把工具执行从云端搬回内网

Cursor 的自托管机器（self-hosted machines）解决的是一个边界问题：代码库、构建产物和密钥全部留在企业内部机器上，Agent 只负责发起工具调用，真正的执行发生在你自己的网络里。

这个划分决定了整套设计的形状。Agent 侧保留的是推理与编排，worker 侧承担的是文件读写、命令执行、构建和浏览器操作。两边通过请求队列连接，而不是把代码同步到云端再执行。

```flow
title: 自托管机器的执行边界
caption: 请求从 Agent 侧进入池，由内网 worker 认领并执行，代码与密钥不出内网

layer: Agent 侧 | 推理与编排 | *工具调用请求*
layer: 调度层 | My Machines | Team pools | 休眠与恢复
layer: 内网执行层 | 文件与命令 | 构建产物 | 密钥
```

## 池是队列，不是仓库绑定

自托管机器的调度分两种形态。**My Machines** 把单台笔记本或 VM 连到账号上，服务个人工作流。**Team pools** 是团队或企业命名的 worker 队列，容量随请求到达而增长、随 worker 断开而收缩。

关键约束在池与仓库的关系上：池不绑定单个仓库。给池起一个名字，任何可用的 worker 都能认领请求。这意味着调度器面对的是一个同质的 worker 集合，而不是「某个仓库专属的机器」。代价是 worker 必须具备处理任意仓库请求的能力，收益是容量可以真正共享。

池还能让空闲机器休眠，在后续请求到达时于重连窗口内恢复。这条规则针对的是成本：不必为了下一个 prompt 一直保持昂贵容量在线。休眠与恢复引入了一个时间窗口，窗口之外的行为来源没有说明，需要按各自环境验证。

## 执行落在已有的沙箱上

Cloud agents 可以直接跑在已有基础设施上，来源列出的支持对象包括 AWS Lambda、Coder、Cloudflare、Daytona、Modal、Namespace、Vercel 和 E2B。

这组名单说明自托管不是要求企业新建一套运行时，而是把 worker 接到既有的计算平台上。对已经用这些平台做隔离执行的组织，接入成本主要在 worker 的注册与认领逻辑，而不在环境本身。

## 桌面操作把 worker 变成有状态机器

自托管 worker 现在支持 Linux 和 Mac 上的 computer use。装上对应的桌面包之后，Agent 可以点击、输入、截图和驱动浏览器，人可以在 Cursor 里观看桌面或接管控制。

这一步改变了 worker 的性质。纯命令执行的 worker 是无状态的，随时可以替换；能操作桌面的 worker 持有会话状态，休眠、恢复和接管都必须在同一台机器上完成。池的伸缩逻辑因此需要区分这两类 worker。

## 判断

自托管机器的价值不在「私有部署」这个标签，而在它把工具执行的位置变成了一个可配置项。代码和密钥留在内网是硬约束，池化调度和休眠恢复是围绕这个约束做的成本优化。真正需要提前想清楚的是 worker 的状态模型：无状态 worker 可以随意伸缩，带桌面会话的 worker 不能。把这两类混在同一个池里，休眠窗口和接管控制都会出问题。

来源没有给出池的容量上限、休眠窗口的具体时长，也没有说明 worker 与请求的匹配策略。这些数字需要在自己的部署里测出来。
