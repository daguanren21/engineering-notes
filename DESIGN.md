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

An engineering notebook, printed. Paper stock, a ruled margin, hairline
structure, and two inks: a near-black green-black for text and a single rust
accent for anything that is a judgement rather than a fact.

The world is square. Corners are 0 or 2px, never rounded. There are no shadows
on the page; depth comes from rule weight and surface tint. Nothing floats.

## Type

| Role | Family | Where |
|---|---|---|
| Reading | `--font-serif` — Iowan Old Style, Songti SC, Noto Serif CJK SC, STSong, Georgia | Article body, page and card headings, descriptions |
| Metadata | `--font-mono` — SFMono-Regular, Consolas, Liberation Mono | Issue numbers, dates, tags, counts, section labels |
| Interface | `--font-sans` — Inter, PingFang SC, Microsoft YaHei | Nav, in-article headings, tables, controls, footer |

Rules that hold everywhere:

- Display headings are serif at weight 560–620 with tracking between -0.035em
  and -0.06em. Never render a display heading in the platform sans.
- Article headings (`h2`, `h3` inside `.prose`) switch to sans at weight 700.
  That switch is what separates "the page is talking" from "the article is".
- Mono is for measurement and identifiers only. It is never used to signal that
  a section is technical.
- `titleParts` splits a title into lines; the parts wrap if a line is too long
  for the viewport instead of overflowing.
- Latin display type sits at a larger optical size than the CJK next to it. Do
  not try to equalise them.

## Color

Defined once in `src/styles/global.css` under `@layer theme`, with a
`prefers-color-scheme: dark` block. No component introduces a raw color.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#f2efe6` | `#101713` | Page ground |
| `--surface` | `#faf8f1` | `#161f1a` | Panel, table header, inline code |
| `--ink` | `#14211b` | `#eef0e9` | Headings, strong text |
| `--ink-soft` | `#293a32` | `#d8ddd6` | Article body |
| `--muted` | `#525f58` | `#a9b4ad` | Metadata, descriptions, borders of secondary text |
| `--line` | `#cbc8bc` | `#38443d` | Dividers between rows |
| `--line-strong` | `#7f867f` | `#68766e` | Section rules, control borders |
| `--accent` | `#b0351a` | `#f07a51` | Judgements: links, active nav, tags, issue numbers |

Contrast is a build-time constraint, not a preference. Every text pairing in
the table above clears WCAG AA for body copy against `--paper`, `--surface`,
and `--accent-wash`; `--line-strong` clears 3:1 against both grounds so it can
be used as a control boundary. Re-run the ratios before changing any value.

Browser surfaces belong to the palette: selection, caret, scrollbar, focus
ring, and underline offset are all themed from these tokens.

## Structure and space

- The page is `min(1240px, 100vw - 64px)`, narrowing to `-32px` under 760px and
  `-24px` under 420px.
- One structural accent outside the container: a 3px (2px on mobile) rust rule
  pinned to the left edge of the viewport.
- A single-axis hairline column grid runs behind the page, spaced
  `min(10vw, 124px)` and centred, so it lines up with the container. There is no
  horizontal ruling — one axis only.
- Section separation is a 1px `--line-strong` rule crossing the full container.
  A heavier 3px `--accent` rule marks the article header summary and the article
  end, and only those two.
- Vertical rhythm inside prose: `1.35em` between blocks, `4.8rem` above an
  `h2`, `2.8rem` above an `h3`. More space above a heading than below it.

## Amplitude

The accent is a scarce resource. It marks four things and nothing else:

1. Links and the active navigation item.
2. Issue numbers and tag names.
3. The reading-progress bar.
4. The two 3px rules that bracket an article.

Callouts are **not** accent-marked. A blockquote is a 1px `--line-strong` rule
above and below with generous padding and a larger serif size. There is no
colored side border anywhere in the system: it is the most recognisable
generated-UI tell, and it is not part of this world.

## Motion

One authored moment per surface, exponential ease-out, from an already-visible
default.

- Link affordances: arrow translates 4px on hover or focus, 180ms.
- Tag chips: border and text color cross to accent, 160ms.
- The latest-note card lifts 3px on hover or focus, 180ms.
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

Four destinations, in the header on every surface: 最新, 归档, 标签, 订阅. The
most recent note is reachable from the home hero without scrolling; every note
is reachable from the archive, the tag index, or a related-notes list at the
foot of any other note.

## Anti-patterns this world refuses

Recorded so they are not reintroduced:

- A label above a heading. Headings carry their own weight; the label is noise.
- Colored `border-left` or `border-right` above 1px on any card, list item, or
  callout.
- Nested cards, and cards as the page structure rather than as a specific panel.
- Rounded corners, drop shadows, gradient text, glass, and glow.
- Two-axis hairline grid backgrounds.
- Mono used to make something look technical.
- Chinese copy that reads as translated English.
