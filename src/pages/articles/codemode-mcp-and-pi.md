---
title: MCP到Code Mode的工程演进
titleParts:
  - MCP到Code Mode
  - 的工程演进
description: MCP 从直接暴露工具走向按需发现与代码编排，Cloudflare、Armin 和 Pi 的实践揭示了上下文、执行边界与结构化输出的取舍。
publishedAt: "2026-10-07"
sourceKind: article
sourceTitle: What is Codemode
sourceUrl: https://lucumr.pocoo.org/2026/10/6/codemode/
sourceAuthor: Armin Ronacher
sourcePublishedAt: "2026-10-06"
tags:
  - Agent Harness
  - 工程实践
  - 结构化输出
readingMinutes: 8
issue: 23
draft: false
sections:
  - id: 从直接工具到按需发现
    label: 从直接工具到按需发现
  - id: code-mode解决第二类上下文成本
    label: Code Mode解决第二类上下文成本
  - id: cloudflare与pi的分叉与汇合
    label: Cloudflare与Pi的分叉与汇合
  - id: harness-沙箱与嵌套执行
    label: Harness、沙箱与嵌套执行
  - id: 接入时要保留的契约
    label: 接入时要保留的契约
---

## 从直接工具到按需发现

MCP解决的是外部能力的统一发现与调用，不规定客户端必须把所有工具一次性放进模型上下文。本文把“MCP 1.0”和“MCP 2.0”作为两代实践标签：前者是客户端列出工具、取得描述和输入 schema、逐个交给模型调用；后者是先搜索或描述能力，再按任务加载命中的工具。它们不是官方协议版本，SDK v1/v2也不属于这条演进线。参见 [MCP工具规范](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)。

直接调用的瓶颈有两种。调用前，全量工具描述占用上下文；调用中，多步任务的中间结果反复回到模型，分页、筛选和聚合也由模型逐步决定。动态发现主要削减第一类成本，不能自动消除模型往返。

下面的流程把两类成本和解决位置放在一起：

```flow
title: MCP工具调用的两类成本
caption: 上层负责选择，代码层负责组合，底层负责受控执行
layer: 发现层 | *搜索能力* | 加载schema
layer: 编排层 | 模型判断 | Code Mode循环与聚合
layer: 执行层 | MCP工具 | 授权与沙箱
```

## Code Mode解决第二类上下文成本

Code Mode让模型生成一次可执行程序，在受控环境中完成循环、并发、分页、过滤和聚合，再把必要结果交回模型。它主要减少中间数据进入上下文的次数，底层外部请求未必减少。

```javascript
const projects = await tools.listProjects({});
const groups = await Promise.all(projects.map(p =>
  tools.listTasks({ projectId: p.id })
));
return groups.flat().filter(t => t.status === "blocked");
```

所以动态发现和 Code Mode是两个正交选择：前者决定工具描述何时出现，后者决定调用如何组合。一个客户端可以先搜索工具，再让 Code Mode批量调用；也可以把少量高频工具直接声明给模型。

## Cloudflare与Pi的分叉与汇合

Cloudflare早期方案把 MCP工具转换为 TypeScript接口，模型在沙箱中生成代码调用；当时完整接口声明仍会进入上下文，重点是减少调用中的模型往返。后来的服务端方案拆成 `search` 与 `execute`：前者检索 OpenAPI文档，后者在受控环境运行代码调用 API，完整文档留在服务端。两者共同回应工具描述过多和多步编排问题。见 [Cloudflare Code Mode](https://blog.cloudflare.com/code-mode/) 与 [Cloudflare Code Mode MCP](https://blog.cloudflare.com/code-mode-mcp/)。

Armin在 2025年的 [Code MCPs](https://lucumr.pocoo.org/2025/8/18/code-mcps/)已讨论让 MCP接收代码，2026年的 [What is Codemode](https://lucumr.pocoo.org/2026/10/6/codemode/)进一步说明了执行环境、嵌套调用和返回边界。Pi早期作者 Mario Zechner曾明确表示不支持 MCP，原因是工具定义会污染上下文，并倾向按需读取说明和使用 Bash组合能力，见 [Pi: a terminal coding agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)。

Pi 1.0默认把 MCP工具暴露给 Codemode，既不逐个声明给模型，也不把全部工具说明塞进 Codemode描述；脚本按需发现后再调用。`direct`会直接声明工具且仍可通过代码调用，`deferred`让工具搜索在下一轮模型调用前加载定义，见 [Pi工具暴露规则](https://pi.dev/docs/latest/mcp#control-tool-exposure)。相关实现于 2026-09-29合入，见 [Pi MCP实现 PR](https://github.com/earendil-works/pi/pull/10040)。

这套设计让 MCP继续提供标准连接、发现和调用，同时保留 Pi偏好的按需读取与程序组合。对立点从“是否接入 MCP”转向“工具是否必须铺满上下文”。据此可以解释 Code Mode为何降低了 Pi支持 MCP的成本，但不能推断 Cloudflare单独促成了这次转向；合入记录还说明了模型适合在沙箱里组合工具的动机。

## Harness、沙箱与嵌套执行

Pi的 Codemode运行在 Harness侧，使用受限 QuickJS/WASM环境；代码不能任意访问文件系统、网络或定时器，外部能力通过受控函数提供，见 [Pi Codemode运行约束](https://pi.dev/docs/latest/codemode)。这也能组合 Harness内部工具，例如子代理和图像输出，而 Bash主要组合执行目标上的程序。MCP服务自己的沙箱、身份和 API授权是另一层边界。

若 Pi调用 Cloudflare的 `execute`，就形成外层 JavaScript调用 MCP、内层再执行 JavaScript的嵌套结构。嵌套会增加 JSON转义、错误定位和返回格式处理复杂度，内层代码也不能直接访问外层其他工具。Code Mode因此是编排机制，不是新的授权机制。

## 接入时要保留的契约

适配层应保留 MCP结果的结构化信息，而不是只转成文本：至少保留 `structuredContent`、`content`和 `isError`，并结合工具的 `outputSchema`校验或解释输出。这样外层程序才能继续筛选和聚合，也能区分业务失败与成功文本。MCP工具规范对这些工具列表、调用和结果结构有明确约定，见 [MCP Tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)。

错误捕获、重试或继续执行不等于事务回滚；一次调用已经产生的外部副作用不会因后续失败自动撤销。授权、资源范围、超时、网络权限和审计必须独立设计。工程上可采用三层契约：MCP适配层保证发现、描述、调用和结果保真；Code Mode层负责组合和错误传播；控制层负责身份、权限和副作用记录。接入应以这些边界为评审起点，而不是把 Code Mode直接等同于一份实现计划。
