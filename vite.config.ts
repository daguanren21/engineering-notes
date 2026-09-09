import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Vue from "@vitejs/plugin-vue";
import matter from "gray-matter";
import MarkdownItAnchor from "markdown-it-anchor";
import { defineConfig, type Plugin } from "vite";
import Markdown from "unplugin-vue-markdown/vite";
import Pages from "vite-plugin-pages";
import { ArticleFrontmatterSchema } from "./src/content/schema.ts";

const articleDirectory = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "src/pages/articles",
);
const virtualArticlesId = "virtual:articles";
const resolvedVirtualArticlesId = `\0${virtualArticlesId}`;
const base = process.env.VITE_BASE_PATH ?? "/";

function slugifyHeading(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
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
      const markdownFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .sort((left, right) => left.name.localeCompare(right.name));

      const articles = await Promise.all(
        markdownFiles.map(async (entry) => {
          const path = resolve(articleDirectory, entry.name);
          this.addWatchFile(path);
          const { data } = matter(await readFile(path, "utf8"));
          const frontmatter = ArticleFrontmatterSchema.parse(data);
          const slug = basename(entry.name, ".md");
          return { ...frontmatter, slug, href: `/articles/${slug}` };
        }),
      );

      return `export default ${JSON.stringify(articles)}`;
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
          if (!id.includes("/src/pages/articles/")) return html;
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
          return `${script}<ArticleLayout v-bind="frontmatter">${html}</ArticleLayout>`;
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
          { slugify: slugifyHeading },
        );
      },
    }),
  ],
  ssgOptions: {
    base,
    dirStyle: "nested",
    script: "async",
    formatting: "prettify",
  },
});
