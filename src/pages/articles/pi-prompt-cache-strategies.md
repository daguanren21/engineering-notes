---
title: "Pi 与 OMP 的 Prompt Cache：高命中、失效边界与成本"
titleParts:
  - "Pi / OMP"
  - "Prompt Cache"
  - "高命中背后的取舍"
description: "用交互示例观察前缀命中与失效，拆解 Pi 的缓存参数、OMP 的额外保护、CH 口径与成本判断。"
publishedAt: "2026-09-09"
sourceKind: "source-code"
interactiveDemo: "prompt-cache"
sourceTitle: "Pi 源码与 Prompt Caching 文档"
sourceUrl: "https://github.com/earendil-works/pi"
sourceAuthor: "Pi、OMP 与模型服务商"
tags:
  - Prompt Cache
  - Pi / OMP
  - 成本与性能
readingMinutes: 12
issue: 11
draft: false
sections:
  - id: "交互演示"
    label: "前缀命中实验"
  - id: "缓存到底缓存什么"
    label: "缓存的对象"
  - id: "pi-做了哪些处理"
    label: "Pi 的策略"
  - id: "omp-额外处理了什么"
    label: "OMP 的额外处理"
  - id: "为什么命中率容易很高"
    label: "高命中的原因"
  - id: "何时会失效"
    label: "失效边界"
  - id: "六种实现对比"
    label: "框架差异"
  - id: "缓存命中不等于增量传输"
    label: "缓存与传输"
  - id: "不要用-ch-替代成本判断"
    label: "命中率与费用"
  - id: "排查与配置顺序"
    label: "实用检查表"
  - id: "来源与版本"
    label: "来源"
---

**Pi 不在本地维护模型 KV 缓存。它通过缓存标记、稳定的会话 key 和尽量不变的请求前缀，让模型服务商更容易复用已经处理过的输入。**

先试上面的四种变化。重点不是颜色，而是：修改工具后，后面的相同历史为什么也不命中；压缩历史后，为什么命中率下降不一定伴随输入减少。

保持缓存可用，选“压缩历史”，把历史调到 1,000 tokens。本例摘要同样是 1,000 tokens，总输入没有减少，能复用的前缀却变短了。摘要化是否省输入，要看替换前后的实际长度。

## 缓存到底缓存什么

Prompt cache 保存的是输入前缀对应的 **Key/Value 中间状态**，不是把上一轮答案拿来复用。新输入仍需处理，输出仍需生成。

它按前缀工作，不是“在整段请求中找相同片段”。Anthropic 的文档明确按 **Tools、System、Messages** 的顺序构成缓存前缀：前部变化会影响后面的复用，后部变化不必影响前部。[Anthropic 文档][anthropic]

因此要区分：

| 机制 | 保存或复用什么 |
| --- | --- |
| Prompt/KV cache | 模型服务商侧的输入计算状态 |
| 会话文件、数据库历史 | 客户端用于重建对话的消息 |
| 文件读取缓存 | 已读文件或工具结果 |
| 响应引用、增量传输 | 少传已有消息，或引用服务端已有上下文 |

同一个 Harness 可以同时使用这些机制，但其中一种存在，不能证明另一种已经命中。

## Pi 做了哪些处理

本篇的 Pi 指 `pi-mono`，不把所有 OMP 定制行为混为一谈。

| 层面 | 本地 Pi 源码中的处理 | 作用与边界 |
| --- | --- | --- |
| Anthropic | 在 System、工具定义及末尾合适的用户/工具结果内容上设置 `cache_control` | 给服务商提供可缓存前缀边界；仍受模型能力、长度和 TTL 限制 |
| OpenAI Responses | 将稳定 `sessionId` 映射为 `prompt_cache_key` | 帮助相关请求路由到可复用缓存；不是命中保证 |
| 保留时间 | `cacheRetention` 默认 `short`，`long` 走兼容分支 | Anthropic 支持时请求 `1h`；本地 OpenAI 适配层有 `24h` 旧保留字段路径，不适用于所有型号 |
| 上下文 | 工具循环通常在既有历史尾部追加 | 复用的不只 System，而可能是大部分对话历史 |
| 动态工具 | 支持时采用延迟加载/工具引用 | 避免每次改写顶层工具集合；回退到普通工具列表时仍可能破坏前缀 |
| 统计 | 规范化 usage，展示 CH 和缓存浪费估计 | 有助于发现空闲、模型切换或前缀改写导致的 miss；不是本地 KV 引擎 |

工具少本身不必然提高命中率，**工具定义和顺序稳定**才重要。主 Agent 与 subagent 是否共享历史，也不能直接决定各自的缓存命中率。

### OpenAI 的字段不能一概而论

当前官方文档区分了两代机制：较早模型使用 `prompt_cache_retention`；GPT-5.6 及之后使用 `prompt_cache_options`，当前 TTL 为 `30m`，并支持显式断点和单独缓存写入计费。

所以“配置 long 就一定缓存 24 小时”不成立。客户端代码、model compatibility 和服务商当前接口必须对应。`prompt_cache_key` 只影响路由分组，不固定机器，也不能让不同前缀强行命中。[OpenAI 文档][openai]

## OMP 额外处理了什么

OMP 18.1.14 不只是转发缓存参数，还针对容易破坏前缀的工作流做了处理。下面不是说这些方法由 OMP 独占，而是说明本次核对版本的具体取舍。

| 处理 | 为什么影响缓存 | 适用边界 |
| --- | --- | --- |
| 日期与 cwd 放到用户回合的提醒，而不是 System footer | 避免这些变化改写早期系统块，尤其照顾在 System 后渲染工具的开放模型 | 保护的是更早的前缀，不保证日期变化后整段历史都命中 |
| 保留兼容后端所需的历史 reasoning 字段 | 本地 chat template 若丢掉之前的 thinking 块，会重建出不同前缀；Qwen 对应路径还使用 `preserve_thinking` | 仅按模型/后端兼容策略回放已经返回并保留的字段，不是恢复不可见推理 |
| 软工具要求先发提醒，未满足才单轮强制 `toolChoice` | 避免每轮改变工具选择相关配置；模型按提醒执行时无需强制升级 | 需要时仍执行硬约束，缓存不是放弃控制的理由 |
| 压缩/交接使用 `toolChoice: "none"` 获取文本，而不是直接清空工具定义 | 尽量保留工具前缀；禁用调用与移除定义不是一回事 | 压缩替换历史本身仍可能改变后面的缓存 |
| OpenAI 断点能力和 TTL 进入兼容层 | 对支持的 GPT-5.6+ 处理显式断点与 `30m` TTL；不支持时拒绝相应请求 | 不能把一个模型的缓存字段直接发给所有兼容服务 |
| 本地 `learn` 教训从后续会话注入 | 不在每次学习后改写当前会话的 prompt-cache 前缀 | 需启用对应记忆/学习功能，不代表所有记忆后端都采用相同策略 |

相关依据：[提示词组装][omp-prompt]、[provider 兼容层][omp-compat]、[软工具要求源码][omp-loop]、[本地记忆][omp-memory]。

还有一类优化需要单独算：OMP 把超长工具输出保存在 `artifact://`，模型先接收有限输出，需要时再读取全文。这控制的是**新增上下文体积**，不是 KV 缓存。图片的 blob 去重主要减少本地持久化体积，加载时还可能重新展开为模型输入，也不能直接计为缓存命中。[Artifact 与 blob 设计][omp-artifacts]

## 为什么命中率容易很高

Coding Agent 的连续工具调用很适合前缀缓存：规则和工具保持稳定，旧历史越来越长，每轮只增加少量工具结果，而且调用间隔往往短于缓存寿命。

例如旧前缀 50,000 tokens，本轮新增 1,000 tokens，旧前缀全部命中：

```text
CH = 50,000 / 51,000 ≈ 98.0%
```

Pi 底部的 **CH 是最近一次请求的输入 token 命中比例**，不是请求命中次数占比，也不是整个任务的节省比例。其公式是：

```ts
cacheRead / (input + cacheRead + cacheWrite)
```

这里使用 Pi 归一化后的 usage。OpenAI 原始 `input_tokens` 已包含缓存部分，不能再直接加一次 `cached_tokens`；Pi 的 Responses 转换会先扣出缓存读取和写入桶。

上面的交互实验可以直接看到统计效应：只追加相同大小的新内容时，历史越长，CH 越容易接近 100%。这解释了高命中，但不证明长历史都是有用信息。

## 何时会失效

| 变化 | 为什么可能失去复用 |
| --- | --- |
| 工具名称、描述、schema 或排序改变 | 工具定义属于早期前缀；后面相同的消息不一定还能复用 |
| 把时间、实时状态或检索结果不断改写到 System 前部 | 每轮都改变靠前内容 |
| 重写历史、压缩、截断或替换图片内容 | 原来的共同前缀被切断 |
| 更换模型或影响渲染前缀的设置 | 相同文本不代表相同模型输入状态 |
| 空闲过久、路由到另一缓存节点 | 前缀相同，但找不到仍有效的缓存 |
| 每次请求随机生成 cache key | 破坏稳定分组，降低复用机会 |

Anthropic 的默认缓存寿命为 5 分钟，可选更贵的 1 小时写入。寿命从写入或读取请求开始计时，长时间生成本身也会消耗这段窗口，不能只看两次回复结束之间隔了多久。

压缩造成的 miss 不一定是缺陷。它可能以一次重建代价换来后续更小的上下文。Pi 的缓存浪费扫描也会在 compaction/branch summary 边界重置比较基线，不把这类变化直接当作同一前缀被重复收费。

## 六种实现对比

| 实现 | 缓存处理重点 | 不应误读为 |
| --- | --- | --- |
| [Pi][pi] | provider 适配层放置标记、传稳定会话 key，并维护缓存统计 | 自研了独占的服务端缓存算法 |
| [OpenCode](https://github.com/anomalyco/opencode) | 集中做 provider options 转换；手动路径选择 system/尾部消息，部分 Anthropic SDK 路径使用自动缓存 | 每个 provider 都使用相同断点规则 |
| [Kimi Code](https://github.com/MoonshotAI/kimi-code) | Anthropic 路径标记 System、最后工具和最后内容块；工具披露另有稳定前缀设计 | 所有动态工具功能默认开启 |
| [Codex](https://github.com/openai/codex) | 稳定 `prompt_cache_key`；符合条件时用 WebSocket 发送增量 | `previous_response_id` 等于已命中 KV cache |
| [DeepChat](https://github.com/ThinkInAIXYZ/deepchat) | 按 provider/model 白名单选择自动或显式策略，主要用于流式会话路径 | 所有 OpenAI-compatible 请求都会自动得到同样的缓存参数 |
| [Grok Build](https://github.com/xai-org/grok-build) | Anthropic 转换中放置断点；Responses 映射可转发可选 key，主会话构造路径也可能不设置它 | 没有显式 key 就没有服务商缓存 |

DeepChat 还区分会话流式请求和独立 `generateText` 路径，后者不启用这套策略。这里的“独立请求”不是 subagent 的 isolated 上下文模式。Grok 的会话/请求标识同样只能证明存在路由或观测信息，不能替代真实缓存 usage。

这些差异来自所核对路径；没有同模型、同任务的测量，不能据此排出命中率高低。

## 缓存命中不等于增量传输

Pi 的普通 Responses 路径仍可以发送完整消息列表，同时获得高缓存命中。缓存省的是服务端重复处理前缀的工作，不一定省掉客户端上传整段 JSON。

Codex 的 WebSocket 增量路径则先检查：非输入属性是否一致，新输入是否恰好接在上次请求与返回内容之后。满足条件才发送 `previous_response_id` 与后缀，否则回到完整输入。

**少上传消息、少做 prefill、少花总费用，是三个需要分别观察的指标。** `store: false` 也不能被简单理解为“关闭 prompt cache”；响应存储与 KV 缓存是不同策略。

## 不要用 CH 替代成本判断

比较费用时，至少把下面几项分开，价格统一为同一 token 单位：

```text
输入费用 = input × 普通输入价
         + cacheWrite × 缓存写入价
         + cacheRead × 缓存读取价
总费用还包括输出、工具与其他实际收费项目
```

在交互示例的默认长度下，长历史请求是 51,000 tokens、CH 约 98%；压缩后是 8,000 tokens、CH 62.5%。若缓存读取价是普通输入价的十分之一，单次输入的相对费用分别约为 6,000 和 3,500 个普通输入 token 的价格。但还要计算生成摘要和后续输出的费用，不能据此直接宣布整个任务更便宜。

高 CH 不会让输出生成跳过计算，也不会缩短 shell、网络请求或测试自身的耗时。保留大量无关历史，甚至可以让百分比变得更漂亮，却未必帮助任务。

## 排查与配置顺序

1. **先统一 usage 口径。** 区分 input、cacheRead、cacheWrite、output，确认百分比是最近一轮还是累计值。
2. **检查真实请求前缀。** 看工具、System 和旧消息是否被改写，不只比较用户输入文本。
3. **确认 provider/model 能力。** 缓存开关、断点、最小长度、TTL 和价格按当前接口选择。
4. **保持 key 稳定。** 不要每轮生成随机 key；高流量分片应由观测决定，也不要盲目所有请求共用一个 key。
5. **分别测冷启动、连续调用和压缩后。** 对比完成同一任务的总费用、总 token、轮次和耗时，而非只看 CH。

普通优化顺序是先稳定工具与早期指令，再把易变内容移到后部，最后考虑长 TTL、延迟工具加载和更细的显式断点。不要为了维护缓存而保留错误或过期上下文。

## 来源与版本

- [Pi 源码][pi]：`packages/ai/src/api/anthropic-messages.ts`、`openai-responses.ts`、`openai-responses-shared.ts`；CH 在 `packages/coding-agent/src/modes/interactive/components/footer.ts`，浪费估计在 `core/cache-stats.ts`。
- [Anthropic Prompt caching][anthropic]、[OpenAI Prompt caching][openai]。
- OpenCode：`src/provider/transform.ts`；Kimi：`packages/kosong/src/providers/anthropic.ts`；Codex：`codex-rs/core/src/client.rs`。
- DeepChat：`src/main/provider/promptCacheCapabilities.ts`、`promptCacheStrategy.ts`；Grok：`xai-grok-sampling-types/src/conversation/messages.rs` 与 `xai-chat-state/src/actor/request_builder.rs`。

源码比较来自本地样本；OMP 部分固定到 18.1.14，API 文档核验于 2026-09-09。交互图假定各块末端已有可用缓存断点，不模拟实际 tokenizer、最小缓存长度、查找粒度、服务端缓存节点或全部计费规则。

[pi]: https://github.com/earendil-works/pi
[anthropic]: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
[openai]: https://developers.openai.com/api/docs/guides/prompt-caching
[omp-prompt]: https://github.com/can1357/oh-my-pi/blob/v18.1.14/docs/system-prompt-customization.md
[omp-compat]: https://github.com/can1357/oh-my-pi/blob/v18.1.14/docs/provider-compat-reference.md
[omp-loop]: https://github.com/can1357/oh-my-pi/blob/v18.1.14/packages/agent/src/agent-loop.ts
[omp-memory]: https://github.com/can1357/oh-my-pi/blob/v18.1.14/docs/memory.md
[omp-artifacts]: https://github.com/can1357/oh-my-pi/blob/v18.1.14/docs/blob-artifact-architecture.md
