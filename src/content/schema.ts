import { z } from "zod";

export interface ArticleSection {
  id: string;
  label: string;
}

export interface ArticleFrontmatter {
  title: string;
  titleParts: string[];
  description: string;
  publishedAt: string;
  sourceKind?: "article" | "source-code";
  sourceTitle: string;
  sourceUrl: string;
  sourceAuthor: string;
  sourcePublishedAt?: string;
  tags: string[];
  readingMinutes: number;
  issue: number;
  draft: boolean;
  sections: ArticleSection[];
}

export const ArticleSectionSchema: z.ZodType<ArticleSection> = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

export const ArticleFrontmatterSchema: z.ZodType<ArticleFrontmatter> = z.object({
  title: z.string().min(1),
  titleParts: z.array(z.string().min(1)).min(1),
  description: z.string().min(1),
  publishedAt: z.iso.date(),
  sourceKind: z.enum(["article", "source-code"]).optional(),
  sourceTitle: z.string().min(1),
  sourceUrl: z.url(),
  sourceAuthor: z.string().min(1),
  sourcePublishedAt: z.iso.date().optional(),
  tags: z.array(z.string().min(1)).min(1),
  readingMinutes: z.number().int().positive(),
  issue: z.number().int().positive(),
  draft: z.boolean().default(false),
  sections: z.array(ArticleSectionSchema).min(1),
});

export interface Article extends ArticleFrontmatter {
  slug: string;
  href: string;
}
