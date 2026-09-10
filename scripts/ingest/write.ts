import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { z } from "zod";
import { ArticleFrontmatterSchema } from "../../src/content/schema.ts";
import { slugify } from "../../src/content/slug.ts";
import { postJson } from "./http.ts";
import type { AuthoredArticle, SourceItem } from "./types.ts";

const projectRoot = new URL("../../", import.meta.url);
const skillPath = fileURLToPath(new URL(".claude/skills/knowledge/SKILL.md", projectRoot));

/** Overridable so tests can write into a scratch directory. */
function articleDirectory(): string {
  return (
    process.env.DIGEST_ARTICLE_DIR ?? fileURLToPath(new URL("src/pages/articles", projectRoot))
  );
}

const AuthoredArticleSchema = z.object({
  title: z.string().min(4).max(120),
  titleParts: z.array(z.string().min(1)).min(1).max(4),
  description: z.string().min(8).max(200),
  tags: z.array(z.string().min(1).max(24)).min(1).max(6),
  body: z.string().min(200),
});

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

/**
 * DeepSeek is the default and the only provider this project assumes. The
 * overrides exist so an OpenAI-compatible endpoint can be swapped in without
 * touching code — DeepSeek, xAI, and OpenAI all speak the same wire format,
 * with one difference: newer OpenAI models reject `max_tokens`.
 */
function provider(): { apiKey: string; baseUrl: string; model: string } {
  const apiKey = (process.env.DIGEST_API_KEY ?? process.env.DEEPSEEK_API_KEY)?.trim();
  if (!apiKey) {
    throw new Error("no API key: set DEEPSEEK_API_KEY (or DIGEST_API_KEY) before running");
  }

  return {
    apiKey,
    baseUrl: (
      process.env.DIGEST_BASE_URL ??
      process.env.DEEPSEEK_BASE_URL ??
      "https://api.deepseek.com"
    ).replace(/\/+$/, ""),
    model: (process.env.DIGEST_MODEL ?? process.env.DEEPSEEK_MODEL ?? "deepseek-chat").trim(),
  };
}

async function callProvider(
  messages: { role: string; content: string }[],
  tokenField: "max_tokens" | "max_completion_tokens",
): Promise<ChatCompletion> {
  const { apiKey, baseUrl, model } = provider();

  return postJson<ChatCompletion>(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages,
      temperature: 0.4,
      [tokenField]: 8000,
      response_format: { type: "json_object" },
    },
    { headers: { authorization: `Bearer ${apiKey}` } },
  );
}

/** The `knowledge` skill body is the writer brief; the pipeline never forks it. */
export async function loadWriterBrief(): Promise<string> {
  const raw = await readFile(skillPath, "utf8");
  const withoutFrontmatter = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  const brief = withoutFrontmatter.trim();
  if (brief.length < 200) {
    throw new Error(`${skillPath} does not look like a writer brief`);
  }
  return brief;
}

function sourcePayload(item: SourceItem): string {
  return [
    `来源标题：${item.title}`,
    `来源作者：${item.author}`,
    `来源团队：${item.team}`,
    `发布日期：${item.publishedAt}`,
    `来源链接：${item.url}`,
    "",
    "来源正文：",
    item.text.slice(0, 24_000),
  ].join("\n");
}

function extractJson(content: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  const candidate = (fenced?.[1] ?? content).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("response contained no JSON object");
  return JSON.parse(candidate.slice(start, end + 1));
}

async function requestArticle(
  brief: string,
  item: SourceItem,
  repairNote: string | null,
): Promise<unknown> {
  const messages = [
    { role: "system", content: brief },
    {
      role: "user",
      content: [
        "把下面这个来源写成一篇 工程手记 读书笔记。只返回一个 JSON 对象。",
        "",
        sourcePayload(item),
        ...(repairNote ? ["", "上一版不符合要求，请修正后重新返回完整 JSON：", repairNote] : []),
      ].join("\n"),
    },
  ];

  let completion: ChatCompletion;
  try {
    completion = await callProvider(messages, "max_tokens");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/max_tokens/i.test(message)) throw error;
    completion = await callProvider(messages, "max_completion_tokens");
  }

  if (completion.error) throw new Error(completion.error.message ?? "model API error");

  const content = completion.choices?.[0]?.message?.content;
  if (!content) throw new Error("model returned an empty response");

  return extractJson(content);
}

const requiredTags = 3;

function reviewArticle(article: AuthoredArticle, stopWords: readonly string[]): string | null {
  const problems: string[] = [];

  if (article.titleParts.join("") !== article.title) {
    problems.push(
      `titleParts 拼接后必须等于 title。当前拼接结果是「${article.titleParts.join("")}」，title 是「${article.title}」。`,
    );
  }

  const headings = [...article.body.matchAll(/^##\s+(.+)$/gm)].map((match) =>
    (match[1] ?? "").trim(),
  );
  if (headings.length < 3) {
    problems.push(`body 只有 ${headings.length} 个 ## 小节，至少需要 3 个。`);
  }
  if (headings.length > 6) {
    problems.push(`body 有 ${headings.length} 个 ## 小节，最多 6 个。`);
  }
  if (headings.some((heading) => /^(背景|概述|总结|结论|引言|简介)$/.test(heading))) {
    problems.push("小节标题不能是「背景」「概述」「总结」「结论」「引言」「简介」。");
  }

  if (article.tags.length !== requiredTags) {
    problems.push(`tags 需要 ${requiredTags} 个，当前是 ${article.tags.length} 个。`);
  }
  const stopped = article.tags.filter((tag) => stopWords.includes(tag));
  if (stopped.length > 0) {
    problems.push(`tags 不能使用「${stopped.join("、")}」这类无区分度的词。`);
  }

  if (/[！!]{1}/.test(article.body) || /[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/u.test(article.body)) {
    problems.push("正文不能出现感叹号或 emoji。");
  }

  return problems.length > 0 ? problems.join("\n") : null;
}

export interface AuthoredResult {
  article: AuthoredArticle;
  attempts: number;
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

/**
 * Retries once with the findings appended, then gives up loudly. Shape errors
 * from the schema go through the same loop as style findings, so a malformed
 * response gets a second chance instead of failing the run outright.
 */
export async function authorArticle(
  item: SourceItem,
  options: { stopWords: readonly string[] },
): Promise<AuthoredResult> {
  const brief = await loadWriterBrief();
  let repairNote: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = await requestArticle(brief, item, repairNote);

    const parsed = AuthoredArticleSchema.safeParse(raw);
    if (!parsed.success) {
      repairNote = describeIssues(parsed.error);
      if (attempt === 2) {
        throw new Error(`model output failed validation twice:\n${repairNote}`);
      }
      continue;
    }

    const problem = reviewArticle(parsed.data, options.stopWords);
    if (!problem) return { article: parsed.data, attempts: attempt };
    if (attempt === 2) {
      throw new Error(`model output failed review twice:\n${problem}`);
    }
    repairNote = problem;
  }

  throw new Error("unreachable");
}

function readingMinutes(body: string): number {
  return Math.max(3, Math.round(body.length / 450));
}

/** ASCII-only file names, matching the hand-written articles in the archive. */
function articleSlug(item: SourceItem): string {
  const fromTitle = slugify(item.title)
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");

  return fromTitle.length >= 8
    ? fromTitle
    : `${slugify(item.team).replace(/[^a-z0-9-]+/g, "-") || "note"}-${item.publishedAt}`;
}

async function existingSlugs(): Promise<Set<string>> {
  const entries = await readdir(articleDirectory(), { withFileTypes: true });
  return new Set(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name.replace(/\.md$/, "")),
  );
}

async function nextIssue(): Promise<number> {
  const directory = articleDirectory();
  const entries = await readdir(directory, { withFileTypes: true });
  const issues = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map(async (entry) => {
        const { data } = matter(await readFile(`${directory}/${entry.name}`, "utf8"));
        return typeof data.issue === "number" ? data.issue : 0;
      }),
  );
  return Math.max(0, ...issues) + 1;
}

export interface StoredArticle {
  file: string;
  slug: string;
  issue: number;
}

export async function storeArticle(
  article: AuthoredArticle,
  item: SourceItem,
  options: { draft: boolean },
): Promise<StoredArticle> {
  const sections = [...article.body.matchAll(/^##\s+(.+)$/gm)].map((match) => {
    const label = (match[1] ?? "").trim();
    return { id: slugify(label), label };
  });

  const issue = await nextIssue();

  const frontmatter = ArticleFrontmatterSchema.parse({
    title: article.title,
    titleParts: article.titleParts,
    description: article.description,
    publishedAt: new Date().toISOString().slice(0, 10),
    sourceKind: "article",
    sourceTitle: item.title,
    sourceUrl: item.url,
    sourceAuthor: item.author,
    sourcePublishedAt: item.publishedAt,
    tags: article.tags,
    readingMinutes: readingMinutes(article.body),
    issue,
    draft: options.draft,
    sections,
  });

  const taken = await existingSlugs();
  const base = articleSlug(item);
  let slug = base;
  let suffix = 2;
  while (taken.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  const file = `${articleDirectory()}/${slug}.md`;
  await writeFile(file, matter.stringify(`\n${article.body.trim()}\n`, frontmatter), "utf8");

  return { file, slug, issue };
}
