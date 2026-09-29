---
title: "Agent 越权控制：四种系统的权限边界"
titleParts:
  - "Agent 越权控制："
  - "四种系统的权限边界"
description: "对照 Grok Build、Pi、Codex 与 Claude Code，区分工具授权、自动审批和 OS 沙箱，核查默认配置、子 Agent 继承与无沙箱执行的边界。"
publishedAt: "2026-09-28"
sourceKind: "source-code"
sourceTitle: "Grok Build / Pi / Codex 源码与 Claude Code 官方文档"
sourceUrl: "https://github.com/xai-org/grok-build/tree/f0e3be1100ef5252488e3be8bb0e91cf68d8c305"
sourceAuthor: "xAI、Pi 项目维护者、OpenAI 与 Anthropic"
tags:
  - Agent Harness
  - 系统设计
  - 可靠性
readingMinutes: 16
issue: 22
draft: false
sections:
  - id: "权限边界必须落在实际执行之前"
    label: "授权与执行分层"
  - id: "grok-build-校验最终参数-沙箱却默认关闭"
    label: "Grok Build 的最终参数检查"
  - id: "pi-把隔离责任交给宿主"
    label: "Pi 的宿主信任边界"
  - id: "codex-分离审批与沙箱-显式允许可能扩大权限"
    label: "Codex 的审批与权限扩大"
  - id: "claude-code-的权限系统不等于-shell-沙箱"
    label: "Claude Code 的两套执行边界"
  - id: "验收应观察拒绝后的副作用"
    label: "沙箱实测与工程判断"
---

## 权限边界必须落在实际执行之前

**把 Planner、Executor 和 Reviewer 分成三个 Agent，不会自动产生三个安全主体。防止越权，需要宿主约束实际工具调用，并让执行器或 OS 限制它最终能触达的资源。**

[关于 Agent 自主规划与执行风险的讨论](https://x.com/tvytlx/status/2104255090458759283)提出了最小权限、代码门禁、人工确认、沙箱与审计。落到实现，首先要分清三件事：schema 校验参数形状，审批决定是否准许某个动作，沙箱约束动作获准之后的能力。类型正确不代表动作安全；用户同意计划，也不等于批准之后所有调用。

下面是普通本地工具的职责分层，不是四个产品共有的固定调用顺序。只有获准的调用才应到达执行层；Pi 默认并不补齐图中的全部约束。

```flow
title: 从模型建议到真实副作用
caption: 自上而下从调用建议进入授权和执行；拒绝必须在对应副作用发生之前生效
layer: 建议 | 模型提出工具与参数
layer: 授权 | *宿主规则与必要审批*
layer: 能力 | 执行器或 OS 的资源限制
layer: 结果 | 真实副作用与可核对记录
```

| 产品 | 默认与可选授权 | 本地沙箱边界 |
|---|---|---|
| Grok Build | 权限规则、hooks、必要确认；auto 可用分类模型 | 默认关闭；启用后文件系统限制覆盖整个进程及子进程 |
| Pi | 参数校验、可选扩展拦截；不内置资源权限系统 | 默认沿用宿主权限，另配工具沙箱或整进程隔离 |
| Codex | execpolicy 与审批编排；可选 Guardian | 本地执行体系内置沙箱，生效范围与升级路径由配置决定 |
| Claude Code | 权限规则、hooks、人工或 auto 分类审批 | 需要开启，主要隔离 shell 及其子进程，不统一包住文件工具 |

比较限定在本地 CLI。开源证据固定到 Grok Build `f0e3be1`、Pi `6f75515`、Codex `1cc7e23`，链接使用完整提交号。Claude Code 依据当前官方文档；其部分行为晚于本机 `2.1.251`，不能当作该版本的运行证明。这里没有测量分类器准确率，也没有证明任一产品免疫提示注入。

## Grok Build 校验最终参数，沙箱却默认关闭

普通工具调用先解析参数，再运行 `PreToolUse` hooks，随后才根据有效参数生成 `AccessKind`、检查计划模式并请求权限。hook 可以改写参数，因此检查必须对应改写后的动作；后续 MCP 参数转换改变输入时，还会再次经过 hook 门禁。这避免了“批准的是原参数，执行的是另一组参数”。[最终参数调用链](https://github.com/xai-org/grok-build/blob/f0e3be1100ef5252488e3be8bb0e91cf68d8c305/crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs#L1625-L1856)

权限管理器将显式策略拒绝放在 YOLO 分支之前。auto 模式可以引入模型分类，但不能把普通授权理解成模型在对话里自行宣布获准。反过来，这条路径上的 hook 已经先运行了：**后续工具拒绝不能撤销 hook 自身的副作用，hook 代码也属于需要信任的执行面。**[权限管理器](https://github.com/xai-org/grok-build/blob/f0e3be1100ef5252488e3be8bb0e91cf68d8c305/crates/codegen/xai-grok-workspace/src/permission/manager/mod.rs#L735-L1395)

沙箱是另一层，而且默认关闭。启用后，原生文件工具和 shell 子进程继承文件系统限制；`workspace`、`read-only`、`strict` 等 profile 还保护部分全局 hook、配置与信任文件，防止它们被直接改写。但网络覆盖不同：子进程网络限制仅在 Linux 上实施，macOS 上是 no-op，进程内的部分 HTTP 调用也不受这项限制。不能把 `strict` 名称理解成所有平台上的断网环境。[沙箱范围与平台差异](https://github.com/xai-org/grok-build/blob/f0e3be1100ef5252488e3be8bb0e91cf68d8c305/crates/codegen/xai-grok-pager/docs/user-guide/18-sandbox.md#L1-L61)

子 Agent 的会话建立会复用继承来的权限句柄，而不是新建一套默认权限。这保证了授权状态的延续，不代表每个子 Agent 都天然只读。[会话权限继承](https://github.com/xai-org/grok-build/blob/f0e3be1100ef5252488e3be8bb0e91cf68d8c305/crates/codegen/xai-grok-shell/src/session/acp_session_impl/spawn.rs#L363-L423)

## Pi 把隔离责任交给宿主

Pi 原 `badlogic/pi-mono` 仓库目前重定向到 `earendil-works/pi`。它明确声明不内置文件系统、进程、网络或凭证权限系统，默认使用启动它的用户和进程权限。这是产品边界，不是遗漏了一个确认开关。[权限声明](https://github.com/earendil-works/pi/blob/6f7551516b84278eb9da1c340c8e7bc66be1a6ba/README.md#L40-L48)

正常循环按工具名称查找实现、校验参数、调用可选的 `beforeToolCall`，再执行工具。未知工具、参数错误、拦截器阻止或抛错会终止该次调用。但默认 shell 后端直接启动本地进程；只限制工具名字，并没有建立 OS 能力边界。[Agent 循环](https://github.com/earendil-works/pi/blob/6f7551516b84278eb9da1c340c8e7bc66be1a6ba/packages/agent/src/agent-loop.ts#L703-L810)与[shell 后端](https://github.com/earendil-works/pi/blob/6f7551516b84278eb9da1c340c8e7bc66be1a6ba/packages/coding-agent/src/core/tools/bash.ts#L80-L148)

官方 `permission-gate` 示例用正则匹配部分命令，需要确认而没有界面时会阻止。本次研究实际调用了这个示例回调：无界面时，匹配的 `sudo id` 字符串被拒绝，普通 `printf hello` 不触发拦截；没有执行这两条 shell 命令。这只证明示例的判断，不证明默认 Pi CLI 启用了它，更不证明正则覆盖了任意脚本的效果。[可选拦截示例](https://github.com/earendil-works/pi/blob/6f7551516b84278eb9da1c340c8e7bc66be1a6ba/packages/coding-agent/examples/extensions/permission-gate.ts#L1-L34)

沙箱示例同样需要检查失败语义：未启用或初始化失败时，它会回退到本地 Bash。工具名称带有 sandboxed，并不等于隔离已经生效。[回退路径](https://github.com/earendil-works/pi/blob/6f7551516b84278eb9da1c340c8e7bc66be1a6ba/packages/coding-agent/examples/extensions/sandbox/index.ts#L201-L284)

强边界要另行部署。把整个 Pi 进程放入容器或受控环境，才能同时覆盖宿主扩展；只把内置工具送进 VM，不会自动限制仍在宿主执行的其他扩展。示例子 Agent 另启 Pi 进程，也不能假定父进程内存里的拦截器会自动传过去。[容器化边界](https://github.com/earendil-works/pi/blob/6f7551516b84278eb9da1c340c8e7bc66be1a6ba/packages/coding-agent/docs/containerization.md#L7-L28)与[子进程启动](https://github.com/earendil-works/pi/blob/6f7551516b84278eb9da1c340c8e7bc66be1a6ba/packages/coding-agent/examples/extensions/subagent/index.ts#L302-L350)

## Codex 分离审批与沙箱，显式允许可能扩大权限

Codex 的 handler 处理工具参数与权限请求，execpolicy 产生禁止、需要审批或放行的结果，`ToolOrchestrator` 再处理审批与实际执行边界。模型可以申请额外权限，但申请本身不是授权；宿主可以拒绝，不能因为参数里写了 `require_escalated` 就直接运行。[执行前审批编排](https://github.com/openai/codex/blob/1cc7e2361237ce7244430ee1d581c77f95c57ac8/codex-rs/core/src/tools/orchestrator.rs#L160-L233)

最容易看错的是 `allow`。在这份源码中，所有已解析命令段都被显式 execpolicy allow 命中时，可以设置 `bypass_sandbox=true`。**这可能授予无沙箱执行，而不只是省略确认。** 启发式放行不等同于这种显式规则；存在拒读路径时，执行器又会阻止直接移除文件系统沙箱，以免丢掉拒读限制。[allow 的语义](https://github.com/openai/codex/blob/1cc7e2361237ce7244430ee1d581c77f95c57ac8/codex-rs/core/src/exec_policy.rs#L394-L460)与[保留拒读边界](https://github.com/openai/codex/blob/1cc7e2361237ce7244430ee1d581c77f95c57ac8/codex-rs/core/src/tools/sandboxing.rs#L239-L295)

审批和隔离必须分别检查。`approval_policy=never` 是不询问，不等于移除沙箱；Guardian 可以参与自动风险审批，但不能代替 OS 隔离。本地 shell 的沙箱也不能用来证明远程 MCP 服务端受到了相同限制。[官方审批说明](https://learn.chatgpt.com/docs/agent-approvals-security)

子 Agent 复制父会话当前的审批策略、reviewer 和权限 profile 快照。它不会因为被命名为 researcher 就自动拥有更小的能力；父会话的宽权限也可能传下去。[子 Agent 的权限快照](https://github.com/openai/codex/blob/1cc7e2361237ce7244430ee1d581c77f95c57ac8/codex-rs/core/src/agent/child_config.rs#L167-L192)

## Claude Code 的权限系统不等于 shell 沙箱

官方文档把权限规则与沙箱分开。工具权限按 `deny → ask → allow` 检查，由 Claude Code 实施，不靠 `CLAUDE.md` 中的文字承诺。auto 模式会让独立分类模型参与剩余动作的判断，并非每个调用都固定经过分类器。模型参与审批不等于模型能覆盖全部宿主规则，也不构成绝对安全证明。[权限规则](https://code.claude.com/docs/en/permissions)与[自动审批](https://code.claude.com/docs/en/permission-modes#how-the-classifier-evaluates-actions)

OS 沙箱主要隔离 shell 及其子进程；Read、Edit、Write 等内置文件工具直接走权限系统，不经过同一个 shell 沙箱。子 Agent 使用父会话的沙箱配置，不会另建一个 OS 安全主体；权限模式的具体继承规则还受版本影响。[工具范围与子代理边界](https://code.claude.com/docs/en/sandboxing#scope)

启用沙箱后，还要决定失败是否允许继续。官方给出的收紧配置包含三个独立开关：

```json
{
  "sandbox": {
    "enabled": true,
    "failIfUnavailable": true,
    "allowUnsandboxedCommands": false
  }
}
```

它们分别启用隔离、在沙箱无法初始化时拒绝启动、禁止通过相应逃生口无沙箱重试。但 `excludedCommands` 等例外仍要检查，不能只凭这三个值宣称所有通道封闭。默认环境继承、凭证文件可读范围也需要单独限制；域名白名单不等于防数据外泄。[托管配置与限制](https://code.claude.com/docs/en/sandboxing#keep-developers-from-widening-the-policy)

## 验收应观察拒绝后的副作用

本次研究在 macOS 上使用 Codex CLI `0.150.1`，独立临时 `CODEX_HOME` 和自建文件目录，实际运行无模型调用的 `codex sandbox` 写入探针。内置 `:workspace` 允许工作目录和系统临时目录写入，因此不能把另一个 `/tmp` 子目录误判成被禁止的区域。随后使用以下 profile 显式收紧临时目录权限：

```toml
[permissions.probe]
extends = ":workspace"

[permissions.probe.filesystem]
":slash_tmp" = "read"
":tmpdir" = "read"
```

更具体的工作目录写权限仍保留，目录外的测试文件和工作目录内的 `.codex` 保护路径则被拒绝。实验检查了实际文件状态，不只看程序是否报错。

| 实际场景 | 结果 |
|---|---|
| 收紧后的 profile 写工作目录 | 成功，文件存在 |
| 同一 profile 写目录外的自建测试路径 | `Operation not permitted`，文件不存在 |
| 同一 profile 写工作目录内的 `.codex` | `Operation not permitted`，文件不存在 |
| `:read-only` 写工作目录 | `Operation not permitted`，文件不存在 |

这证明的是指定 profile 在该机器上的写入边界，不是完整会话审批、托管策略加载、跨平台安全或提示注入防御。Grok Build 的本机 CLI 只检查了版本与帮助，权限结论来自源码；Claude Code 的权限结论来自官方文档，没有把帮助输出当成实施证明。探针未调用外部 API、未读取真实凭证，测试目录已删除。[Codex profile 的范围与语法](https://learn.chatgpt.com/docs/permissions)

从这些实现可以得出三个工程判断：授权应绑定最终动作和参数，而不是笼统计划；控制规则及其代码不能成为普通工具可任意改写的对象；审批失败、沙箱缺失和升级请求必须有明确的拒绝语义。这些是设计建议，不是四个产品默认全部满足的共同保证。

最后还要把恢复与撤销分开。恢复会话或还原本地代码，不会撤回已经发送的邮件、已经泄露的数据或已完成的远程写入。外部操作超时而结果未知时，需要查询状态、幂等键或补偿动作，不能靠重跑掩盖不确定性。**值得复用的是模型之外可实施、可观察的能力边界，不是再增加一个名字叫安全审查的 Agent。**
