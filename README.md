# 工程手记

面向 AI Agent 工程的中文阅读笔记。把执行系统、工具调用、上下文、协作与评测相关的
长文和源码整理成可复用的判断：还原问题、辨认边界、保留证据、给出结论。

Vue 3 + `vite-ssg` 预渲染，构建产物是纯静态文件，部署在 GitHub Pages。

## 本地开发

```bash
pnpm install
pnpm dev          # 开发服务器
pnpm typecheck    # vue-tsc，包含 scripts/
pnpm build        # 预渲染到 dist/，同时生成 rss.xml / feed.json / sitemap.xml
pnpm preview      # 预览构建产物
```

测试：

```bash
pnpm test:context-demo
pnpm test:cache-demo
pnpm test:ingest
```

## 结构

| 路径 | 作用 |
|---|---|
| `src/pages/articles/*.md` | 文章。frontmatter 由 `src/content/schema.ts` 校验，不合规直接构建失败 |
| `src/content/tags.ts` | 标签索引与相关笔记，`src/pages/tags/` 两个页面读取它 |
| `src/content/slug.ts` | 标题锚点与标签 slug 的唯一来源，构建配置与页面共用 |
| `src/styles/global.css` | 设计令牌唯一来源。改颜色只改这里 |
| `vite.config.ts` | 文章索引、标签路由、RSS / JSON Feed / sitemap / robots 生成 |
| `PRODUCT.md`、`DESIGN.md` | 产品事实与视觉系统，改动界面前先读 |
| `.claude/skills/` | 工程内 skill。`impeccable`（设计检查）与 `knowledge`（写作规范） |
| `scripts/ingest/` | 每日摘要流水线 |

## 每日摘要流水线

每天抓取上游来源，先筛选 AI Agent 工程材料，再用 `knowledge` skill 进行编辑准入和写作。
没有相关且足够扎实的材料就不发；合法拒稿不是流水线失败。

```
.github/workflows/digest.yml   每天 00:00 UTC（北京时间 08:00）
        │
        ├─ scripts/ingest/collect.ts   三层来源，全部可选
        │     1. 官方 RSS / Atom（始终运行）
        │     2. X API v2（设置 X_BEARER_TOKEN 后运行）
        │     3. RSS bridge（设置 DIGEST_BRIDGE_TEMPLATE 后运行）
        │     └─ enrich.ts   只有标题的 feed 会去抓正文页面
        │
        ├─ scripts/ingest/state.json   已处理条目 + 已覆盖团队，避免重复
        │
        ├─ scripts/ingest/collect.ts   主题门槛 → 合格候选的团队轮转
        ├─ scripts/ingest/write.ts     编辑准入 → 拒稿，或生成并校验 Markdown
        │     └─ 选题与写作规范来自 .claude/skills/knowledge/SKILL.md
        │
        └─ pnpm build                  构建不通过就不提交
```

### 选材规则

**先判断主题，再考虑来源覆盖；不以品牌、发布时间或日更数量替代相关性。**

候选先经过已处理、正文长度、时间窗口和主题过滤。主题门槛只读取标题与正文：
标题或正文前部需要建立 Agent、coding agent、agentic、MCP 或智能体语境，
正文还要涉及至少两类具体机制——工具调用、执行编排、上下文记忆、评测恢复、
沙箱权限。团队名和 URL 不作为放行依据；普通 AI/LLM、HTTP User-Agent、
监控代理或文末顺带提到 Agent 都不能单独使文章入选。

这是偏重精度的词法预筛，不是语义证明。它可能漏掉只深入一种机制或较晚才说明主题的
好文章；不得为凑稿放宽门槛。模型随后还要判断原文主体与证据是否足以支撑
AI Agent 工程解读。通用天气/语音模型、消费产品、活动、地区扩张和泛基础设施新闻
不能被强行改写成 Agent 经验。

只有通过主题预筛的候选才按「最久没覆盖的团队 → kind → 团队优先级 → 时间」排序。
`kind` 默认顺序为 `news > release > community > commits`，可在
`selection.kindOrder` 修改。轮转不能把无关来源救回来，拒稿也不算覆盖了该团队。

### 默认来源

`scripts/ingest/sources.json` 保留已有的 10 个 Agent/开发工具与专业作者 feed，
没有新增未经验证的地址。通用厂商新闻、普通 model SDK、泛研究/基础设施和通用
commit 流已移出默认配置。

| 来源 | 用途与边界 |
|---|---|
| Cursor changelog / 社区 | 开发工具机制与使用问题，仍须通过主题门槛 |
| Claude Code / Codex releases | coding agent 的执行、工具、权限与恢复变化 |
| OpenAI Agents SDK releases | Agent 运行与编排接口，不再收集普通模型 SDK 更新 |
| Karpathy / Lilian Weng / Simon Willison | 专业作者来源，不因作者身份自动合格 |
| aihero / Matt Pocock skills releases | Agent 开发与 skills 实践；短 feed 可按配置补正文 |

版本号标题不直接排除：如果正文前部建立 Agent 语境且有实质机制内容，release 仍可入选。

### 为什么 GitHub 仓库 feed 不抓正文

`enrich.ts` 对 GitHub 仓库页面会提取出 **12,006 字符的界面框架**——「Fork 191
Star 572 File tree」「Notifications You must be signed in to change…」——GitHub
的主内容由前端渲染，服务端 HTML 基本只有导航。这些文字能轻松越过
`minSourceChars`，然后模型会拿到一堆界面文字去写笔记。

所以 GitHub 的 feed 显式关掉了补全（`"enrich": false`），只保留本身带全文的
条目。判断标准是「能不能抓到正文」，跟来源重要程度无关。

`minSourceChars` 默认 1200：低于这个长度撑不起一篇 1200–2500 字的解读，
链接型短帖会被过滤掉。`enrichHeadlineFeeds` 和 `maxEnrichPerFeed` 控制抓正文
的开关和每个 feed 的上限，单个来源可以用 `"enrich": false` 单独关掉。

`maxItemAgeDays` 默认 21。超过窗口的来源不会进入候选，新增内容也仍须通过主题
与证据检查。时间窗口不是为了强行让某个来源轮到；没有合格内容时保持空缺。

`DIGEST_MAX_CONCURRENCY`（默认 6）限制并发连接数，避免抓取 feed 与正文时
耗尽 socket。网络失败会显示诊断，不会用无关内容补位。

### 需要配置的仓库设置

在 **Settings → Secrets and variables → Actions** 里添加：

| 名称 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | Secret | 是 | 未设置时工作流只打印警告并跳过，不会失败 |
| `DEEPSEEK_MODEL` | Variable | 否 | 默认 `deepseek-chat` |
| `X_BEARER_TOKEN` | Secret | 否 | 官方 X API v2 的 bearer token，需要付费档位 |
| `DIGEST_BRIDGE_TEMPLATE` | Variable | 否 | 自己搭建的 RSS bridge，用 `{handle}` 占位，例如 `https://rsshub.example.com/twitter/user/{handle}` |

### X / Twitter 这一层

`sources.json` 保留 6 个开发工具或专业作者账号：`@cursor_ai`、`@karpathy`、
`@lilianweng`、`@simonw`、`@swyx`、`@mattpocockuk`。账号身份只决定从哪里
发现材料，不提供主题豁免；X、bridge 与官方 feed 共用候选门槛。

要真正拉到推文，**必须**满足下面之一：

- `X_BEARER_TOKEN`：官方 X API v2，**需要付费档位**，免费档不能读推文。
- `DIGEST_BRIDGE_TEMPLATE`：你自己部署的 RSS bridge。公共实例都不可用——实测
  `rsshub.app` 与 `openrss.org` 返回 404 / 503，`xcancel.com` 要求先发邮件
  申请白名单。

两个都没配时，这一层整个跳过，不发任何请求，也不会报错。

启用后有两点行为需要知道：

- **只有长推文（long-form / note_tweet）才可能被选中。** 抓取时会优先取
  `note_tweet.text`，普通推文只有 280 字符，过不了 `minSourceChars: 1200`
  这一关——280 字符撑不起一篇 1200–2500 字的解读。想让短推文也进入候选，把
  `minSourceChars` 调低即可，但代价是模型要为了凑篇幅而注水。
- **回复和转推被排除**（`exclude=replies,retweets`）。所以一串推文线程只会
  拿到第一条，后续接龙因为算回复而丢失。

没有 X 凭据时仍会运行官方 feed 层。是否写文章由主题与证据决定，
不是由启用了多少来源或当天抓到了多少条目决定。

### 本地运行

```bash
pnpm digest:dry                 # 只列出候选，不调用模型
DEEPSEEK_API_KEY=sk-... pnpm digest
DEEPSEEK_API_KEY=sk-... node scripts/ingest/run.ts --limit=3 --draft
```

其它可用环境变量：`DIGEST_API_KEY`、`DIGEST_BASE_URL`、`DIGEST_MODEL`。
三个变量构成一个 OpenAI 兼容的调用端点，所以换成 OpenAI、xAI 或自建网关
都不需要改代码；不设置时默认走 DeepSeek。

### 修改来源

编辑 `scripts/ingest/sources.json`：

```jsonc
{
  "xAccounts": [{ "handle": "mattpocockuk", "team": "Matt Pocock" }],
  "feeds": [{
    "url": "https://github.com/openai/openai-agents-python/releases.atom",
    "team": "OpenAI",
    "kind": "release",
    "author": "OpenAI",
    "enrich": false
  }],
  "selection": {
    "maxArticlesPerRun": 1,   // 本次最多送审几篇，不保证一定产出
    "minSourceChars": 1200,  // 正文短于此长度直接跳过
    "priorityTeams": ["Anthropic", "OpenAI", "Cursor"],
    "maxItemAgeDays": 21
  }
}
```

`feeds` 里的每个地址都实际探测过，能返回 feed 的才保留。加新来源前请先
用 `curl` 确认它真的返回 RSS 或 Atom。

### 配图

每篇文章必须带至少一个 ```flow 图。纯文字的解读读起来很晦涩，规范里这一条是
硬性的：没有图，或者图不合法，文章会被打回重写（第一次会自动带错误信息重试
一次，第二次仍不通过就整篇放弃）。

格式是每行一个层，`|` 分隔层名和该层的方框，方框用 `*星号*` 包起来表示需要
重点注意的那一个：

````
```flow
title: 请求如何穿过三层
caption: 控制层只对编排层负责

layer: 控制层 | 目标与约束 | *拆分单元*
layer: 编排层 | Worker A | Worker B | Gate
layer: 执行层 | 工具与权限 | 状态 | 隔离
```
````

约束：2–6 层，每层 1–5 个方框，标签 1–40 字，只认 `title:`、`caption:`、
`layer:` 三个关键字。解析器在 `src/content/flow.ts`，浏览器、SSG 和流水线
共用同一份——所以校验和渲染不会出现理解不一致。

`FlowDiagram.vue` 在 SSG 阶段就渲染成静态 HTML，图不依赖 JavaScript，也不会
出现水合后才闪出来的情况。

### 写作规范

`.claude/skills/knowledge/SKILL.md` 的正文会被 `scripts/ingest/run.ts` 原文
读入，作为模型的 system prompt。所以它既是给人看的 skill，也是流水线的配置：
改这一处，两个用途同时生效。

规范里固定了几件事——不编造数字与引语、不重复来源信息（标题、作者、链接、
期号由流水线注入）、不写「在当今快速发展的 AI 领域」这类填充、结论必须有
立场、中文按中文写。合格来源的模型输出只负责 `titleParts`、`description`、
`tags` 和 `body`；完整标题 `title` 由 `titleParts` 无分隔拼接得到，标点和词间
空格必须留在分行内容里。期号、阅读时长、章节锚点由脚本计算，
来源字段由抓取结果填入，模型没有机会编造它们。

不相关或证据不足时，模型应返回 `{"skip": true, "reason": "具体原因"}`。
合法拒稿立即结束该条处理，不会要求模型重写成文章；来源记入已处理账本，
但不更新团队覆盖记录。拒稿与文章字段混在一起、缺少原因或错误的 `skip` 值
都不能产生可发布文章。

文章产出先过 zod 校验，再走小节、标签、语气与 flow 图检查。
格式或文章契约失败仍沿用最多一次修正；合法拒稿没有额外重试。
`pnpm digest:dry` 只验证抓取与主题预筛，不调用模型，也不宣称通过了编辑准入。

### 发布与回滚

生成的条目默认直接提交到 `main`，但提交前会先跑一次完整构建——frontmatter
不合规、路由冲突、锚点错位都会在提交之前暴露。要改成人工审阅，把工作流里的
`git push` 换成 `gh pr create`；要临时改成只生成草稿，手动触发工作流时把
`draft` 勾上（frontmatter 里 `draft: true` 的文章不会出现在站点上）。

只有拒稿而没有新文章时，工作流只提交已处理账本，不产生新刊物。
同批其他候选失败且没有新文章时，账本专用步骤仍可提交 `state.json`，
但保留原失败结果；它不会暂存任何文章。有新文章时仍必须通过构建后才提交。
本次选题规则只约束后续自动采集，不自动删除或下架历史文章。

## 设计检查

项目内置了 [Impeccable](https://impeccable.style)：

```bash
./.claude/skills/impeccable/scripts/impeccable detect src/   # 61 条规则
npx impeccable update                                        # 更新 skill
```

当前 `src/` 扫描结果是零发现、零提示。`DESIGN.md` 末尾列出了这套视觉系统
明确拒绝的做法。
