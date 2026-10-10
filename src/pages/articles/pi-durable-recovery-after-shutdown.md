---
title: "Pi Durable：关机与主动关闭后的恢复边界"
titleParts:
  - "Pi Durable："
  - "关机与主动关闭后的恢复边界"
description: "解释持久任务如何在新进程恢复，区分正常关机、断电、关闭界面、close 与 abort，并明确刷盘、幂等和宿主重启的责任。"
publishedAt: "2026-10-10"
sourceKind: article
sourceTitle: "Pi Durable — Persist and Resume / Pico5 specification"
sourceUrl: "https://github.com/earendil-works/pi/blob/42a3497d03ad17e308a2299fa824727894f2c0ec/packages/durable/README.md"
sourceAuthor: "Earendil / Pi contributors"
tags:
  - Agent Runtime
  - 状态恢复
  - 可靠性
readingMinutes: 15
issue: 25
draft: false
sections:
  - id: 恢复的是持久任务而不是进程内存
    label: 恢复对象与职责
  - id: 检查点把恢复落到具体执行阶段
    label: 检查点与副作用
  - id: 关机重启需要存储与宿主共同配合
    label: 关机与断电
  - id: 主动关闭必须区分断开-停机与取消
    label: close 与 abort
  - id: 恢复入口必须复用身份并重建运行环境
    label: 重启入口与实例
  - id: 恢复保证需要按故障类型验收
    label: 验收与证据边界
---

## 恢复的是持久任务而不是进程内存

**关机之后，Pi Durable 不会自己开机，也不会复活旧进程；它让新进程从同一份持久存储里恢复未完成的工作。主动关闭是否继续，则取决于关闭的是界面、运行时，还是任务本身。**

这篇是《Pi 访谈：代码之外的工程判断》的机制扩展，配套笔记入口在文末[同主题过刊](#related-title)。API 与限制以核对时锁定的上游提交 `42a3497d03ad17e308a2299fa824727894f2c0ec` 为准；Pi Durable 仍是实验包，不应把这些语义直接套到普通 Pi CLI、Omp 或所有编码工具上。[官方定位][announcement]

存储里保留的不只是聊天文本，还有 task 的输入、执行阶段、checkpoint、等待关系、结果、submission，以及与对话一起提交的应用文档。调用栈、Promise、网络连接、子进程和 JavaScript 闭包不会序列化后原地复活。恢复执行的是相同工作记录对应的阶段，必要时重新发起外部请求。[概念与恢复][readme]

下面分清恢复链中的责任，只有三层都具备，重新开机才可能继续工作。

```flow
title: 从重新开机到恢复工作的职责链
caption: 宿主启动进程，Harness 读取持久状态，工具处理外部世界的不确定性
layer: 宿主 | 开机或手工启动 | *重新打开同一存储*
layer: Harness | 注册模型和扩展 | 恢复任务记录 | 启用调度器
layer: 执行环境 | 重新连接服务 | 幂等或查询结果 | 报告不可重放的中断
```

这条链至少要求：

- 使用跨进程保留的存储，而不是 `MemoryStorage` 或随容器销毁的临时目录。
- 宿主重新启动程序，并打开相同数据库或存储目录。自动开机启动是服务管理器、容器平台或应用宿主的工作，不是 Durable 的能力。
- 新进程重新安装所需扩展、模型 provider 和执行环境。数据库保存名称与状态，不保存可执行扩展代码或已经建立的连接。
- 开启调度；只读打开并查看历史，不代表已经恢复执行。
- 同一存储只能有一个进程 owner。当前包不提供跨进程锁，部署层必须防止旧实例和新实例同时写入。[存储约束][storage]

## 检查点把恢复落到具体执行阶段

访谈把机制称为 effect sandwich：先记录准备做什么，再执行外部动作，最后记录结果与下一阶段。它不是重放全部聊天让模型猜进度，也不是依靠保存整个 JavaScript 堆。

```flow
title: 一个副作用被两次提交夹住
caption: 中间的外部动作不在 Session 原子提交内，恢复必须处理这个缺口
layer: 第一次提交 | *意图与确定输入* | 外部操作身份
layer: 外部执行 | 调模型或工具 | 与外部系统交互
layer: 第二次提交 | 结果或错误 | 下一检查点
```

Session 可以将 transcript、task 和应用文档放入同一次原子提交；不能把银行扣款、发邮件、运行 shell 等外部世界一并纳入本地事务。[规范 §1、§5.2][spec]

| 中断位置 | 持久状态能说明什么 | 恢复时的正确动作 |
| --- | --- | --- |
| 意图提交之前 | 该步骤尚未持久化 | 从上一个已提交阶段继续；未确认的客户端请求按稳定身份重试 |
| 意图已提交、动作尚未开始 | 输入和计划存在，但没有结果 | 按任务阶段启动动作；系统通常不能仅凭没有结果证明动作从未开始 |
| 动作已发生、结果尚未提交 | 最危险的窗口：外部可能已成功 | 用幂等键重试或查询同一操作；不能直接把没有结果解释为没有执行 |
| 结果已经提交 | 该步骤的结果可复用 | 使用已有结果，推进依赖它的任务，不重复这个已完成步骤 |

对内置工具调用，`replay: "safe"` 是显式承诺：中断后允许重新执行。没有这个声明的中断调用，不会被运行时直接重放；模型会收到 `interrupted` 错误和已经提交的输出，再决定后续处理。[工具重放规则][tools]

这个标志不创造幂等性。写操作若声明可重放，工具本身必须提供稳定操作键、幂等执行或可靠查询。即使运行时没有重放旧调用，模型也可能生成一次新的调用；支付、发布等高风险动作仍要在工具和授权层防重，不能只依赖给模型的错误文本。

`requestId` 则是另一层：它让同一 conversation 的重试提交找到已有 submission，避免重复入队。**请求去重不等于所有外部副作用 exactly-once。** 先写一个“已做过”标志再发邮件也不够：两步之间宕机会导致标志存在但邮件从未发出。[提交恢复][resume]

## 关机重启需要存储与宿主共同配合

### 正常关机可以走有序关闭，但不是完成所有任务

如果应用在操作系统退出期限内有机会调用并等待 `harness.close(context)`，运行时会停止接纳新的修改和任务执行，通知正在运行的调用停止，等待已经接纳的存储提交以及正在运行的调用收敛，再关闭存储。它不是等待整个业务工作流成功完成，也不会因为关机把未完成工作记录为已取消。[关闭契约][lifecycle]

开机后，新程序重新打开数据库，安装所需代码并启用调度。task 从最后的 checkpoint 进入相应阶段，已提交的结果保留，等待中的任务根据保存的依赖关系继续。不是从上一条机器指令继续，也不是所有步骤从头执行。

如果程序未处理退出信号、被系统超时杀死，或工具不响应取消而迟迟不退出，则不能把这次关机视为一次已完成的 graceful close。它需要按进程崩溃路径恢复。

### 突然断电比进程崩溃多一层风险

进程死亡不等于操作系统和存储设备都失效。普通进程崩溃时，内核缓存仍可能继续写盘；突然断电时，尚未真正持久化的尾部提交可能一起消失。

当前文档对后端的保证如下，不能只看名称里有 Durable 就忽略配置：

| 后端 | 跨进程重开 | 断电边界 |
| --- | --- | --- |
| `MemoryStorage` | 不保留 | 进程退出即失去内存状态 |
| Node SQLite | 文件保留时可以 | 默认 WAL 与 `synchronous = NORMAL`；官方明确写出进程崩溃可恢复，但电源或宿主故障可能丢失最近提交 |
| Node JSONL 默认配置 | 可从提交标记恢复一致状态 | `fsync` 默认关闭，不承诺电源、内核、宿主或文件系统故障后保留已确认尾部 |
| Node JSONL 的 `fsync: true` | 加强记录与提交标记的落盘顺序 | 锁定版本的规范说明会先 flush sidecar，再追加主标记；普通发布不显式 flush `main.jsonl`，因此仍不能承诺已确认尾部绝不丢失 |

SQLite 的保证来自 [README 存储说明][storage]；JSONL 最后一项来自更细的[规范 §11.3][jsonl-spec]，不能把“打开 fsync”简化为“彻底解决断电”。这也是原子性、一致性和断电持久性必须分开说明的原因。

因此，严肃的断电保证需要对存储适配器、同步策略、文件系统与设备的完整链条另行验证。恢复后还要核对外部副作用：数据库的确认丢了，不代表已经发生的扣款或部署也撤销了。整个磁盘丢失则需要独立的备份、复制与恢复方案，不能靠本机日志补救。

模型请求若在流式输出中被切断，会重新发起；已提交的部分回答留在 transcript 中并标记为 aborted，不是接回原来的网络流。尚未提交的流式尾部可能丢失。恢复保证应理解为“从保留下来的持久状态继续”，不是“每个已生成 token 和每个外部动作都无损”。[官方恢复说明][announcement]

## 主动关闭必须区分断开、停机与取消

“主动关闭”描述的是用户动作，不是唯一的运行时语义。关窗口、关闭终端、按 Ctrl+C 或 Esc 的含义，由应用的事件和信号处理决定，不能只根据按键名称判断。[关闭与取消规范][lifecycle]

| 用户动作或宿主操作 | 工作的命运 | 再次打开后的行为 |
| --- | --- | --- |
| 仅关闭远程浏览器界面或断开观察者 | 后端独立存活且没有额外取消策略时，任务可继续运行 | 重新附着当前状态；通常不是恢复一个已死进程 |
| 宿主调用并等待 `harness.close(context)` | 停止本实例调用，不写取消结果，未完成任务保留 | 新实例打开同一存储，再启用调度 |
| 直接杀死进程或关掉承载它的终端 | 未完成工作中断，可能来不及清理 | 按崩溃恢复；旧工具是否重放仍取决于安全策略 |
| 调用 `conversation.abort(context)`，例如宿主将 Esc 映射到它 | 撤回排队输入，取消当前前台工作及其普通拥有子树 | 重启不得把取消当作临时中断，恢复的可能是尚未完成的取消清理 |
| 取消某个 `wait()` 的 Context | 只是不再等待结果，不取消被等待的工作 | 可重新取得句柄继续观察或等待 |

`close()` 的关键不是“保存一次聊天”，而是 **不设置 durable abort 标记、不把任务写成 terminal、不新启动 abort handler**。如果之前已经请求取消，它也不会抹掉那个取消意图。旧实例 `close()` 完成后才能由新实例接管；在已关闭对象上调用 `resume()` 会抛错。若某段用户代码忽略取消信号，`close()` 会等待它退出，可能长时间不返回。[规范 §2.2、§5.1][spec]

取消有所有权边界。普通 conversation abort 不穿过 background task 边界，所以后台提醒或后台子 Agent 可以继续；`root.abort(context, { background: true })` 扩大该 conversation 的取消范围，但不能据此声称所有独立会话都被取消。规范对取消整个 Harness 的建议，是检查 `inspect()` 列出的活跃任务并明确取消它们。[Abort and Subagents][abort]

`replay: "safe"` 也不表示每个子任务都能跨重启继续。声明了 `abandonOnRestart: true` 的工作，会在重启开始调度时进入取消流程；不可安全重放工具创建的相应子任务也有这种处理。其目的正是避免父调用不再恢复、孤立子任务却继续执行。[Tasks a restart abandons][abandon]

若用户真正表达的是“停止这项任务”，产品不能用关闭再重启绕过该意图。之后想继续，应该通过明确的新请求授权后续工作；相同 `requestId` 只会找回原 submission，不会把被取消的任务变回新任务。若产品还需要“暂停到用户确认”，必须由宿主保存并检查这个控制状态，不能把 `close()` 当作跨实例的暂停开关。

## 恢复入口必须复用身份并重建运行环境

下面只展示宿主初始化完成后的生命周期片段；`models`、`registry`、`env` 与 `context` 由应用配置，数据库路径必须稳定，不应随启动目录意外改变。[官方恢复 API][resume]

```typescript
const recovered = await Harness.open(
  await openNodeSqliteStorage(databasePath),
  { models, registry, env },
  context,
);
const root = await recovered.root(context);
recovered.resume();
```

`root()` 找回同一存储里的根会话；不是每次创建一个新的工作目标。`resume()` 启用调度器，不是启动操作系统进程。部分请求进展的方法，例如 `submit()`、`Submission.wait()`、`waitForTask()`，也会启动调度；`inspect()`、读取状态和订阅视图不会。[调度规范][scheduling]

重开后必须重新获取 conversation、submission 和观察句柄。客户端可以保存 submission ID，再用 `harness.submission(id)` 取回；若是在确认丢失后重试提交，则复用同一 conversation 和同一个 `requestId`。不要为了恢复而生成新请求身份、重复创建子 Agent 或把所有历史消息再提交一遍。

恢复前还要准备相同名称、兼容版本的任务定义和扩展。缺失或不兼容定义会使任务阻塞，等待合适代码，而不是恢复一份数据库里的旧闭包。执行环境、模型凭证、工作目录和外部服务同样需要重新建立。文档恢复到旧版本，不等于 Git 工作区、数据库、文件或远程部署自动回滚；这些是执行环境和业务逻辑的职责。

以“检查代码、发起部署、等待部署结果、生成报告”为例：

- 如果检查结果已提交，只需复用结果，不必重新让模型规划全部步骤。
- 如果部署已发出但结果尚未记录，使用**在调用前保存的稳定部署操作身份**查询或幂等重试；外部平台必须支持这种契约，不能假定任意 CI API 都支持。
- 如果部署工具不允许重放，运行时报告中断；后续先检查外部状态并按授权处理，不能因为没有本地结果就再部署一次。
- 如果用户已经取消部署流程，恢复的是取消清理或取消后的可观察状态，不是继续推进原目标。取消也不保证撤销已完成部署，补偿需要显式实现。

这说明“恢复工作”是**重建调度状态、复用已确认结果、处理不确定副作用**，而不是单纯把一个会话 JSON 文件复制到新机器。

## 恢复保证需要按故障类型验收

下面是接入 Pi Durable 时应运行的故障注入验收，不是本笔记已经执行过的测试报告。每项都需要观察持久状态和外部系统，而不只是看到程序重新启动。

| 场景 | 必须观察到的结果 |
| --- | --- |
| 调用前、调用中、调用成功但结果未提交时分别杀进程 | 新实例从相应 checkpoint 继续；可重放与不可重放工具的行为不同 |
| 执行中 `close()`，等待完成，再打开相同存储 | 未取消的工作仍可继续；关闭本身不产生任务取消结果 |
| 先 durable abort，再在取消清理中断开进程 | 重开继续清理，不把旧目标重新作为正常执行；确认子任务范围 |
| 两个客户端以同一 `requestId` 重试同一提交 | 找回同一 submission，而不是产生两次业务请求 |
| 仅断开 Web 客户端，保持后端存活 | 任务按宿主策略继续；重连得到当前状态，不重复提交工作 |
| 重开但只执行 `inspect()` 或读取视图 | 不执行待恢复任务；随后 `resume()` 才启动调度 |
| 存储处于写入窗口时做宿主或电源故障注入 | 验证确认点、刷盘配置与实际丢失边界；普通进程 kill 不能代替这一项 |
| 旧实例还未退出时尝试接管相同存储 | 部署层阻止双 owner；不能把库内的单进程事务当成跨进程锁 |

上游提供了[关闭、重开、继续 task 的例子][recovery-example]，可以帮助观察 checkpoint，但它不是物理断电证明，也不是任意副作用 exactly-once 的证明。本笔记依据锁定版本的 README、规范和访谈解释契约，没有声称执行过真实断电或上游恢复实验。接入时应将“状态还在”“运行时能继续”“外部动作没有重复”分别验收。

### 参考文献

- 0xSero，Mario Zechner、Armin Ronacher：[Pi Durable: Agents That Survive Crashes](https://www.youtube.com/watch?v=ja_7AF54OtE)。恢复机制的访谈解释。
- Earendil：[Pi Durable][announcement]。发布说明与使用场景。
- Pi contributors：[Pi Durable README][readme]、[Pico5 specification][spec]。本文 API 与边界的锁定版本依据。

[announcement]: https://earendil.com/posts/pi-durable/
[readme]: https://github.com/earendil-works/pi/blob/42a3497d03ad17e308a2299fa824727894f2c0ec/packages/durable/README.md
[resume]: https://github.com/earendil-works/pi/blob/42a3497d03ad17e308a2299fa824727894f2c0ec/packages/durable/README.md#persist-and-resume
[tools]: https://github.com/earendil-works/pi/blob/42a3497d03ad17e308a2299fa824727894f2c0ec/packages/durable/README.md#tools
[storage]: https://github.com/earendil-works/pi/blob/42a3497d03ad17e308a2299fa824727894f2c0ec/packages/durable/README.md#storage
[abort]: https://github.com/earendil-works/pi/blob/42a3497d03ad17e308a2299fa824727894f2c0ec/packages/durable/README.md#abort-and-subagents
[abandon]: https://github.com/earendil-works/pi/blob/42a3497d03ad17e308a2299fa824727894f2c0ec/packages/durable/README.md#tasks-a-restart-abandons
[spec]: https://github.com/earendil-works/pi/blob/42a3497d03ad17e308a2299fa824727894f2c0ec/packages/durable/docs/spec.md
[lifecycle]: https://github.com/earendil-works/pi/blob/42a3497d03ad17e308a2299fa824727894f2c0ec/packages/durable/docs/spec.md#22-public-harness-surface
[scheduling]: https://github.com/earendil-works/pi/blob/42a3497d03ad17e308a2299fa824727894f2c0ec/packages/durable/docs/spec.md#22-public-harness-surface
[jsonl-spec]: https://github.com/earendil-works/pi/blob/42a3497d03ad17e308a2299fa824727894f2c0ec/packages/durable/docs/spec.md#113-jsonl
[recovery-example]: https://github.com/earendil-works/pi/blob/42a3497d03ad17e308a2299fa824727894f2c0ec/packages/durable/test/examples/13-recovery.ts
