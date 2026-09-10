# 工程手记

中文工程阅读笔记。把长文、源码和团队工程文章整理成若干个月后仍然能用的判断：
还原问题、辨认边界、保留证据、给出结论。

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

每天定时抓取上游来源，选一条信息量最大的，用 `knowledge` skill 作为写作规范
调用 DeepSeek 生成文章，校验通过后提交到 `main`，部署工作流随即发布。

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
        ├─ scripts/ingest/write.ts     调用模型 → 校验 → 写成 Markdown
        │     └─ 写作规范来自 .claude/skills/knowledge/SKILL.md
        │
        └─ pnpm build                  构建不通过就不提交
```

### 选材规则

按「最久没覆盖的团队 → kind → 团队优先级 → 时间」排序，取第一条。

覆盖度排在最前面是有原因的：只按 kind 排的话，某些团队会被永久压在下面。
Anthropic 完全没有新闻 feed，只有 GitHub release，任何一种 kind 权重都会让
它排在任何一篇博客之后，永远选不到。按最久未覆盖排序保证每个团队都能轮到。

kind 的默认顺序 `news > release > community > commits` 可以在
`selection.kindOrder` 里改。实测 18 天的轮转结果：

| 天 | 团队 | 类型 | 正文字数 |
|---|---|---|---|
| 1 | Cursor | news | 2,047 |
| 2 | Google DeepMind | news | 11,361 |
| 3 | GitHub | news | 21,605 |
| 4 | Simon Willison | news | 1,636 |
| 5 | Google | news | 3,630 |
| 6 | Hugging Face | news | 12,278 |
| 7 | Meta Engineering | news | 18,803 |
| 8 | Microsoft Research | news | 9,862 |
| 9 | Ethan Mollick | news | 13,835 |
| 10 | Anthropic | release | 7,858 |
| 11 | OpenAI | release | 19,522 |
| 12 | xAI | commits | 2,418 |

### 关于各家的 feed，实测结论

`scripts/ingest/sources.json` 里的每个地址都实际拉取并用解析器验证过：

| 来源 | 情况 |
|---|---|
| Cursor | 官网 changelog 自带 RSS，单条 1.3k–6k 字符，质量最好 |
| Anthropic | **没有任何 feed**，所有路径 404。只能靠 `claude-code` 的 GitHub release |
| xAI | **没有 feed**，`x.ai/news` 对脚本返回 403。只能靠 GitHub commits / release |
| OpenAI | 官网 feed 只有 165 字符的摘要，且页面拒绝脚本抓取（403），实际内容来自 GitHub release 和社区论坛 |
| Google / DeepMind / Hugging Face | feed 只有标题（Hugging Face 连 description 都没有），由 `enrich.ts` 抓正文补全 |
| GitHub | blog、changelog、engineering 三个 feed 都是全文，质量很高。仓库类 feed（releases / commits）不能抓页面补全，见下 |
| Matt Pocock | `aihero.dev/rss.xml` 只有标题，抓正文可补全；`mattpocock/skills` 的 releases 是全文。他是本仓库用的 `grill-me` skill 的作者 |

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

`maxItemAgeDays` 默认 21，是这个窗口决定某个来源「现在有没有料」。例如 Matt
Pocock 的 feed 最近一次更新是 2026-08-06，落在窗口之外，所以他现在不会出现在
候选里——等他发新内容就会自动进来，不需要改配置。想放宽就调大这个值。

`DIGEST_MAX_CONCURRENCY`（默认 6）限制并发连接数。一次完整运行有约 150 个
出站请求，不限并发会耗尽 socket，表现为每次随机几个 feed 报
「socket disconnected before secure TLS connection was established」。

### 需要配置的仓库设置

在 **Settings → Secrets and variables → Actions** 里添加：

| 名称 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | Secret | 是 | 未设置时工作流只打印警告并跳过，不会失败 |
| `DEEPSEEK_MODEL` | Variable | 否 | 默认 `deepseek-chat` |
| `X_BEARER_TOKEN` | Secret | 否 | 官方 X API v2 的 bearer token，需要付费档位 |
| `DIGEST_BRIDGE_TEMPLATE` | Variable | 否 | 自己搭建的 RSS bridge，用 `{handle}` 占位，例如 `https://rsshub.example.com/twitter/user/{handle}` |

### X / Twitter 这一层

`sources.json` 的 `xAccounts` 已经配置了 15 个账号，全部用 oembed 端点验证过
真实存在（伪造的 handle 会返回 404）。包含五个团队官方号（`@AnthropicAI`、
`@OpenAI`、`@xai`、`@cursor_ai`、`@GoogleDeepMind`）和十位个人账号——后三位
`@shao__meng`、`@0xwhrrari`、`@0xCodez` 是从本仓库现有文章的引用里找出来的。

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

没有 X 凭据时能拿到的内容其实已经不少：Cursor、GitHub、Meta、微软研究院、
Hugging Face、Google 以及几位独立作者都有可用的官方 feed，Anthropic 和 xAI
走 GitHub。真正只存在于 X 上的只有临时表态、转发和短评。

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
  "xAccounts": [{ "handle": "AnthropicAI", "team": "Anthropic" }],
  "feeds": [{ "url": "https://openai.com/news/rss.xml", "team": "OpenAI" }],
  "selection": {
    "maxArticlesPerRun": 1,   // 每次生成几篇
    "minSourceChars": 600,    // 正文短于此长度直接跳过
    "priorityTeams": ["Anthropic", "OpenAI", "xAI", "Google DeepMind"],
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
立场、中文按中文写。模型只负责 `title`、`titleParts`、`description`、`tags`
和 `body`；期号、阅读时长、章节锚点由脚本计算，来源字段由抓取结果填入，
模型没有机会编造它们。

产出先过 zod 校验，再走一轮契约检查（标题分行能否拼回、小节数量、标签数量
与停用词、感叹号与 emoji）。任一环节不过就把问题回灌给模型重试一次，第二次
仍不过则整篇放弃并让工作流失败。

### 发布与回滚

生成的条目默认直接提交到 `main`，但提交前会先跑一次完整构建——frontmatter
不合规、路由冲突、锚点错位都会在提交之前暴露。要改成人工审阅，把工作流里的
`git push` 换成 `gh pr create`；要临时改成只生成草稿，手动触发工作流时把
`draft` 勾上（frontmatter 里 `draft: true` 的文章不会出现在站点上）。

## 设计检查

项目内置了 [Impeccable](https://impeccable.style)：

```bash
./.claude/skills/impeccable/scripts/impeccable detect src/   # 61 条规则
npx impeccable update                                        # 更新 skill
```

当前 `src/` 扫描结果是零发现、零提示。`DESIGN.md` 末尾列出了这套视觉系统
明确拒绝的做法。
