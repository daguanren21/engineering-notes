# PRODUCT

## What this is

工程手记 (Engineering Notes) — a Chinese-language static publication about
AI Agent engineering. It turns relevant papers, source-code studies and
engineering write-ups into structured reading notes that stay useful months
later. Built with Vue 3 + `vite-ssg`, deployed as static files to GitHub Pages.

## Audience

Engineers and technical decision-makers who read to make a judgement, not to
keep up with a feed. They arrive from a link, read one note end to end, and
come back when the same problem resurfaces. Chinese is the primary reading
language; English source material is expected.

## Purpose

Convert a source into a reusable engineering judgement: restate the problem,
name the constraints, keep the evidence, land on a conclusion. The site is a
record of reasoning, not a news digest. Recency is a tiebreaker, never the
organising principle.

The editorial scope is Agent execution and harnesses, tool calling, context
and memory, orchestration, evaluation, reliability, and permission boundaries.
General AI news, consumer launches, events and infrastructure announcements
are not eligible merely because they mention AI or an Agent vendor. A source
must support a reusable Agent engineering judgement. Publish nothing when
the available material is off-topic or insufficient; team rotation never
overrides relevance.

## Operating context

- Read on phone during a commute and on a laptop at a desk. Both matter.
- Static hosting: no server, no runtime database, no client-side accounts.
- Every article must be readable and complete with JavaScript disabled in so
  far as SSG output allows.
- Content is Markdown with validated frontmatter (`src/content/schema.ts`).
  Invalid frontmatter fails the build.

## Durable constraints

- Article frontmatter schema is the content contract. `titleParts` splits a
  title into typographic lines; `sections` drives the in-article reading map.
- Each note carries: issue number, publishing date, source title, source URL,
  source author, tags, and reading minutes.
- The site is pre-rendered per route. New routes must be prerenderable.
- Chinese and Latin text share the page. Serif for reading and the issue
  numeral, Inter for interface and in-article headings, mono for code.

## Voice

Precise, declarative, unhurried. States a judgement and shows the reasoning
behind it. No hype, no urgency, no engagement bait. Chinese copy is written as
Chinese, not translated word for word from English.

## Evidence of success

A reader can find the note they half-remember by tag or by search, cite the
source it came from, and quote a section by its anchor.
