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
          return `<ArticleLayout v-bind="frontmatter">${html}</ArticleLayout>`;
        },
      },
      wrapperDiv: false,
      markdownOptions: {
        html: false,
        linkify: true,
        typographer: true,
      },
      markdownSetup(markdown) {
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
