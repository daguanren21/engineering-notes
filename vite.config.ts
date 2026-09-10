import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Vue from "@vitejs/plugin-vue";
import matter from "gray-matter";
import MarkdownItAnchor from "markdown-it-anchor";
import { defineConfig, type Plugin } from "vite";
import Markdown from "unplugin-vue-markdown/vite";
import Pages from "vite-plugin-pages";
import { ArticleFrontmatterSchema, type ArticleFrontmatter } from "./src/content/schema.ts";
import { slugify, tagSlug } from "./src/content/slug.ts";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const articleDirectory = resolve(projectRoot, "src/pages/articles");
const virtualArticlesId = "virtual:articles";
const resolvedVirtualArticlesId = `\0${virtualArticlesId}`;
const base = process.env.VITE_BASE_PATH ?? "/";
const siteOrigin = (process.env.SITE_URL ?? "https://daguanren21.github.io").replace(/\/+$/, "");
const sitePath = base.replace(/\/+$/, "");
const siteTitle = "工程手记";
const siteDescription = "记录经得起复用的工程判断：还原问题、辨认边界、保留证据。";

type ArticleRecord = ArticleFrontmatter & { slug: string; href: string };

async function readArticles(): Promise<ArticleRecord[]> {
  const entries = await readdir(articleDirectory, { withFileTypes: true });
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .sort((left, right) => left.name.localeCompare(right.name));

  return Promise.all(
    markdownFiles.map(async (entry) => {
      const path = resolve(articleDirectory, entry.name);
      const { data } = matter(await readFile(path, "utf8"));
      const frontmatter = ArticleFrontmatterSchema.parse(data);
      const slug = basename(entry.name, ".md");
      return { ...frontmatter, slug, href: `/articles/${slug}` };
    }),
  );
}

function publishedArticles(records: ArticleRecord[]): ArticleRecord[] {
  return records
    .filter((record) => !record.draft)
    .sort(
      (left, right) =>
        right.publishedAt.localeCompare(left.publishedAt) || right.issue - left.issue,
    );
}

function absoluteUrl(path: string): string {
  return `${siteOrigin}${sitePath}${path}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildRss(records: ArticleRecord[]): string {
  const items = records
    .map((article) => {
      const url = absoluteUrl(article.href);
      const published = new Date(`${article.sourcePublishedAt ?? article.publishedAt}T00:00:00Z`);
      return [
        "    <item>",
        `      <title>${escapeXml(article.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <pubDate>${published.toUTCString()}</pubDate>`,
        `      <description>${escapeXml(article.description)}</description>`,
        ...article.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`),
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const updated = records[0]?.publishedAt ?? new Date().toISOString().slice(0, 10);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(siteTitle)}</title>`,
    `    <link>${escapeXml(absoluteUrl("/"))}</link>`,
    `    <description>${escapeXml(siteDescription)}</description>`,
    "    <language>zh-CN</language>",
    `    <lastBuildDate>${new Date(`${updated}T00:00:00Z`).toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(absoluteUrl("/rss.xml"))}" rel="self" type="application/rss+xml" />`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

function buildJsonFeed(records: ArticleRecord[]): string {
  return `${JSON.stringify(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: siteTitle,
      home_page_url: absoluteUrl("/"),
      feed_url: absoluteUrl("/feed.json"),
      description: siteDescription,
      language: "zh-CN",
      items: records.map((article) => ({
        id: absoluteUrl(article.href),
        url: absoluteUrl(article.href),
        title: article.title,
        summary: article.description,
        date_published: `${article.publishedAt}T00:00:00Z`,
        tags: article.tags,
        authors: [{ name: "工程手记" }],
      })),
    },
    null,
    2,
  )}\n`;
}

function buildSitemap(paths: readonly string[], records: ArticleRecord[]): string {
  const lastmod = new Map(records.map((record) => [record.href, record.publishedAt]));
  const entries = paths
    .map((path) => {
      const modification = lastmod.get(path);
      return [
        "  <url>",
        `    <loc>${escapeXml(absoluteUrl(path))}</loc>`,
        ...(modification ? [`    <lastmod>${modification}</lastmod>`] : []),
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    "</urlset>",
    "",
  ].join("\n");
}

function articleIndexPlugin(): Plugin {
  return {
    name: "engineering-notes:article-index",
    resolveId(id) {
      if (id === virtualArticlesId) return resolvedVirtualArticlesId;
    },
    async load(id) {
      if (id !== resolvedVirtualArticlesId) return;

      const entries = await readdir(articleDirectory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          this.addWatchFile(resolve(articleDirectory, entry.name));
        }
      }

      return `export default ${JSON.stringify(await readArticles())}`;
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    articleIndexPlugin(),
    Vue({ include: [/\.vue$/, /\.md$/] }),
    Pages({ extensions: ["vue", "md"] }),
    Markdown({
      headEnabled: false,
      exportFrontmatter: true,
      transforms: {
        after(html, id) {
          if (!id.includes("/src/pages/articles/") || !id.includes(".md")) return html;
          // Articles are one static route per file, so the layout cannot read
          // its own slug from route params; hand it over explicitly.
          const slug = basename(id.split("?")[0] ?? "", ".md");
          // Load demo dependencies with the lazy article route, before hash scrolling.
          const imports: string[] = [];
          if (html.includes("<ContextHandoffDemo />")) {
            imports.push('import ContextHandoffDemo from "../../components/demos/context-handoff/ContextHandoffDemo.vue";');
          }
          if (html.includes("<PromptCacheDemo />")) {
            imports.push('import PromptCacheDemo from "../../components/demos/prompt-cache/PromptCacheDemo.vue";');
          }
          if (html.includes("<GraphLoopHarnessDiagram />")) {
            imports.push('import GraphLoopHarnessDiagram from "../../components/article/GraphLoopHarnessDiagram.vue";');
          }
          const script = imports.length
            ? `<script setup lang="ts">\n${imports.join("\n")}\n</script>`
            : "";
          return `${script}<ArticleLayout v-bind="frontmatter" slug="${slug}">${html}</ArticleLayout>`;
        },
      },
      wrapperDiv: false,
      markdownOptions: {
        html: false,
        linkify: true,
        typographer: true,
      },
      markdownSetup(markdown) {
        const renderFence = markdown.renderer.rules.fence!;
        markdown.renderer.rules.fence = (tokens, index, options, env, self) => {
          const token = tokens[index];
          if (token.content === "") {
            if (token.info === "demo context-handoff") {
              return "<ContextHandoffDemo />\n";
            }
            if (token.info === "demo prompt-cache") {
              return "<PromptCacheDemo />\n";
            }
            if (token.info === "diagram graph-loop-harness") {
              return "<GraphLoopHarnessDiagram />\n";
            }
          }
          return renderFence(tokens, index, options, env, self);
        };

        MarkdownItAnchor(
          markdown as unknown as Parameters<typeof MarkdownItAnchor>[0],
          { slugify: slugify },
        );
      },
    }),
  ],
  ssgOptions: {
    base,
    dirStyle: "nested",
    script: "async",
    formatting: "prettify",
    async includedRoutes(paths) {
      const records = await readArticles();
      const tagSlugs = new Set(
        records.flatMap((record) => record.tags.map((tag) => tagSlug(tag))),
      );

      return [
        ...paths.filter((path) => !path.includes(":") && !path.includes("*")),
        ...records.filter((record) => !record.draft).map((record) => record.href),
        "/tags",
        ...[...tagSlugs].sort().map((slug) => `/tags/${slug}`),
      ];
    },
    async onFinished() {
      const records = publishedArticles(await readArticles());
      const paths = [
        "/",
        "/tags",
        ...records.map((record) => record.href),
        ...[...new Set(records.flatMap((record) => record.tags.map(tagSlug)))]
          .sort()
          .map((slug) => `/tags/${slug}`),
      ];

      const outDir = resolve(projectRoot, "dist");
      await mkdir(outDir, { recursive: true });

      const files: Record<string, string> = {
        "rss.xml": buildRss(records),
        "sitemap.xml": buildSitemap(paths, records),
        "feed.json": buildJsonFeed(records),
        "robots.txt": [
          "User-agent: *",
          "Allow: /",
          `Sitemap: ${absoluteUrl("/sitemap.xml")}`,
          "",
        ].join("\n"),
      };

      for (const [name, contents] of Object.entries(files)) {
        const target = resolve(outDir, name);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, contents, "utf8");
      }
    },
  },
});
