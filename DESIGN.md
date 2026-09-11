# DESIGN

The visual system of 工程手记, as implemented. `PRODUCT.md` holds the durable
product facts; this file holds the visual ones. Read both before changing a
surface, and update this file when the system changes rather than when a single
screen does.

## Mode

**Read.** Every surface exists so the visitor understands something. Structure
serves comprehension first; expression lives in the typography and the rules,
never in decoration that competes with the text.

## Visual world

A current issue of a small technical periodical, laid open. Fluorescent
paper, carbon ink, one blue reserved for action. The issue numeral is the
architecture: large enough to be felt before it is read.

Nothing floats. Corners stay square. Depth comes from a 1px rule, never a
shadow. The masthead and the cover share one sheet; opening an article is
turning the page, not entering a different site.

## Type

| Role | Family | Where |
|---|---|---|
| Wordmark / issue | `--font-display` — EB Garamond, Songti SC, Noto Serif CJK SC | Brand, oversized issue numeral |
| Reading | `--font-serif` — Songti SC, Noto Serif CJK SC, STSong, EB Garamond | Cover and article titles, body, lede |
| Interface | `--font-sans` — Inter Variable, PingFang SC, Hiragino Sans GB | Nav, metadata, in-article headings, tables, controls |
| Code | `--font-mono` — JetBrains Mono Variable, SF Mono | Code, diagrams, identifiers |

Rules that hold everywhere:

- Display and reading serif never go above weight 500. CJK faux-bold is
  forbidden; `font-synthesis: none` on headings.
- Article headings (`h2`, `h3` inside `.prose`) switch to Inter at 500. That
  switch is what separates "the page is talking" from "the article is".
- Mono is for measurement and identifiers only. Dates, tags, and section
  labels stay in Inter.
- Dates print as `YYYY.MM.DD`. One format on every surface.
- `titleParts` splits a title into lines; the parts wrap if a line is too long
  for the viewport instead of overflowing.
- Latin display type sits at a larger optical size than the CJK next to it. Do
  not try to equalise them.

## Color

Defined once in `src/styles/global.css` under `@layer theme`, with a
`prefers-color-scheme: dark` block. No component introduces a raw color.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#f5f5f7` | `#000000` | Page ground |
| `--surface` | `#ffffff` | `#1d1d1f` | Panel, table header, inline code |
| `--ink` | `#1d1d1f` | `#f5f5f7` | Headings, body, strong text |
| `--ink-soft` | `#1d1d1f` | `#f5f5f7` | Article body (same ink; density comes from size) |
| `--muted` | `#6e6e73` | `#a1a1a6` | Metadata, secondary labels |
| `--line` | `#d2d2d7` | `#424245` | Row dividers |
| `--line-strong` | `#86868b` | `#6e6e73` | Section rules, control borders |
| `--accent` | `#0066cc` | `#2997ff` | Actions only: links, focus, reading progress |
| `--masthead` | `#f5f5f7` | `#000000` | Masthead field (same as paper) |

Contrast is a build-time constraint, not a preference. Body text on `--paper`
and `--surface` clears WCAG AA; `--line-strong` clears 3:1 against both grounds
so it can be used as a control boundary. Re-run the ratios before changing any
value.

Browser surfaces belong to the palette: selection, caret, scrollbar, focus
ring, and underline offset are all themed from these tokens.

## Structure and space

- The page is `min(980px, 100vw - 48px)`, narrowing to `-28px` under 760px and
  `-20px` under 420px.
- The masthead owns the top of the sheet: brand and nav on one bar, the issue
  numeral and date on the next. It does not change colour to mark state.
- Section separation is a 1px `--line` rule. There is no left-edge rust stripe
  and no column grid behind the page.
- Vertical rhythm inside prose: `1.35em` between blocks, `4.2rem` above an
  `h2`, with a 1px rule above the heading. More space above a heading than
  below it.
- The issue numeral appears once, in the masthead. Article pages do not repeat
  it as a second display heading.

## Amplitude

The accent is a scarce resource. It marks three things and nothing else:

1. Links and the active navigation item.
2. The reading-progress bar.
3. Focus rings.

Issue numbers and tag names stay in ink. Callouts are not accent-marked. A
blockquote is a 1px `--line-strong` rule above and below with generous padding
and a larger serif size. There is no colored side border anywhere in the
system.

Headings carry their own weight. No kicker, no eyebrow, no "本期封面" above a
title.

## Motion

One authored moment per surface, exponential ease-out, from an already-visible
default.

- Link and tag colour cross to accent on hover or focus, 160ms.
- The reading-progress bar is driven by scroll position at most once per frame.

`prefers-reduced-motion: reduce` removes every transition above. Nothing animates
on page load; nothing moves without an input.

## States

- **Empty**, on the archive search: names the query, offers the tag index as the
  next move, and keeps the search field clearable in place.
- **Empty**, on an unknown tag: says the tag is gone, links to the tag index and
  the home archive.
- **Hover and focus** are the same treatment on every interactive element.
- **Focus** is a 3px accent outline at 4px offset, on links, buttons, inputs,
  selects, and summaries.
- **Disabled** does not occur; the site has no disabled controls.

## Navigation

Four destinations, in the header on every surface: 本期, 过刊, 索引, 订阅. The
cover story is reachable from the home hero without scrolling; every other note
is reachable from the bound contents list, the tag index, or a related-notes
list at the foot of any other note.

## Diagrams

Articles carry a diagram, not only prose. The format is a fenced `flow` block:
one line per band, `|` separating the band name from its boxes, and `*asterisks*`
marking the box the reader must not miss.

```
layer: 控制层 | 目标与约束 | *拆分单元*
layer: 编排层 | Worker A | Worker B | Gate
```

`FlowDiagram.vue` renders it to plain markup during the SSG pass, so a diagram is
present with JavaScript disabled and cannot flash in after hydration. It is drawn
from the same tokens as the page: hairline bands, square boxes, Inter labels,
and the accent reserved for the one marked box via a 3px top rule — never a side
stripe.

Diagrams sit in the flow of the prose, next to the paragraph that explains them,
and the sentence above one should say what it shows. Never use ASCII art,
box-drawing characters, or a `text` fence in their place; those render as raw text
and are the thing this format exists to replace.

## Anti-patterns this world refuses

Recorded so they are not reintroduced:

- A label above a heading. Headings carry their own weight; the label is noise.
- Repeating the issue numeral as a second display heading on the article page.
- Colored `border-left` or `border-right` above 1px on any card, list item, or
  callout.
- Nested cards, and cards as the page structure rather than as a specific panel.
- Rounded corners, drop shadows, gradient text, glass, and glow.
- A hairline column grid behind the page.
- Mono used to make something look technical.
- Chinese copy that reads as translated English.

