/**
 * The diagram format is written by the model and must be machine-checked, or a
 * malformed one lands in a committed article.
 *
 *   node --test src/content/flow.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractFlowBlocks, parseFlowDiagram } from "./flow.ts";

describe("parseFlowDiagram", () => {
  it("reads layers, boxes and the accent marker", () => {
    const { diagram, errors } = parseFlowDiagram(
      [
        "title: 请求如何穿过三层",
        "caption: 实线是控制流",
        "",
        "layer: 控制层 | 目标与约束 | *拆分单元*",
        "layer: 编排层 | Worker A | Worker B | Gate",
      ].join("\n"),
    );

    assert.deepEqual(errors, []);
    assert.equal(diagram?.title, "请求如何穿过三层");
    assert.equal(diagram?.caption, "实线是控制流");
    assert.equal(diagram?.layers.length, 2);
    assert.deepEqual(diagram?.layers[0]?.boxes, [
      { label: "目标与约束", accent: false },
      { label: "拆分单元", accent: true },
    ]);
    assert.deepEqual(
      diagram?.layers[1]?.boxes.map((box) => box.label),
      ["Worker A", "Worker B", "Gate"],
    );
  });

  it("tolerates blank lines and surrounding whitespace", () => {
    const { errors } = parseFlowDiagram("\n\n layer: A | b \n\n layer: C | d \n\n");

    assert.deepEqual(errors, []);
  });

  it("works without a title or caption", () => {
    const { diagram, errors } = parseFlowDiagram("layer: A | one\nlayer: B | two");

    assert.deepEqual(errors, []);
    assert.equal(diagram?.title, null);
    assert.equal(diagram?.caption, null);
  });

  it("rejects a single layer, which is not a diagram", () => {
    const { diagram, errors } = parseFlowDiagram("layer: 只有一层 | 内容");

    assert.equal(diagram, null);
    assert.match(errors.join(" "), /at least 2 layers/);
  });

  it("rejects an unknown keyword instead of ignoring the line", () => {
    const { errors } = parseFlowDiagram("layer: A | one\nlayer: B | two\nnotes: 随便写点什么");

    assert.match(errors.join(" "), /expected "title:", "caption:" or "layer:"/);
  });

  it("rejects a layer with no boxes", () => {
    const { errors } = parseFlowDiagram("layer: 控制层\nlayer: B | two");

    assert.match(errors.join(" "), /has no boxes/);
  });

  it("rejects more layers or boxes than the layout can hold", () => {
    const manyLayers = Array.from({ length: 7 }, (_, i) => `layer: L${i} | box`).join("\n");
    assert.match(parseFlowDiagram(manyLayers).errors.join(" "), /at most 6 layers/);

    const manyBoxes = `layer: A | ${Array.from({ length: 6 }, (_, i) => `b${i}`).join(" | ")}\nlayer: B | x`;
    assert.match(parseFlowDiagram(manyBoxes).errors.join(" "), /at most 5 fit/);
  });

  it("rejects a label too long to fit, but allows one at the limit", () => {
    const atLimit = "x".repeat(40);
    assert.deepEqual(parseFlowDiagram(`layer: A | ${atLimit}\nlayer: B | x`).errors, []);

    const tooLong = "很长的标签".repeat(9);
    assert.match(
      parseFlowDiagram(`layer: A | ${tooLong}\nlayer: B | x`).errors.join(" "),
      /longer than 40 characters/,
    );
  });

  it("collects several problems rather than stopping at the first", () => {
    const { errors } = parseFlowDiagram("nonsense\nlayer: A");

    assert.ok(errors.length >= 2, `expected several errors, got ${errors.length}`);
  });
});

describe("extractFlowBlocks", () => {
  it("finds every flow block in a body", () => {
    const body = [
      "## 一节",
      "",
      "```flow",
      "layer: A | one",
      "layer: B | two",
      "```",
      "",
      "中间的文字。",
      "",
      "```flow",
      "layer: C | three",
      "layer: D | four",
      "```",
    ].join("\n");

    const blocks = extractFlowBlocks(body);

    assert.equal(blocks.length, 2);
    assert.match(blocks[0] ?? "", /layer: A/);
    assert.match(blocks[1] ?? "", /layer: C/);
  });

  it("ignores other fenced blocks", () => {
    const body = ["```ts", "const a = 1;", "```", "", "```text", "图", "```"].join("\n");

    assert.deepEqual(extractFlowBlocks(body), []);
  });

  it("finds nothing in a text-only article", () => {
    assert.deepEqual(extractFlowBlocks("## 标题\n\n只有文字，没有图。"), []);
  });
});
