/**
 * The diagram format generated articles are written in.
 *
 * Kept dependency-free and free of TypeScript-only syntax so the same parser
 * runs in the browser, during the SSG pass, and in the ingest scripts under
 * Node's type stripping. The writer's output is validated with it before an
 * article is allowed to be committed.
 *
 * Format, one band per line:
 *
 *   title: 请求如何穿过三层
 *   caption: 上一层只对下一层负责
 *
 *   layer: 控制层 | 目标与约束 | *拆分单元*
 *   layer: 编排层 | Worker A | Worker B | Gate
 */

export interface FlowBox {
  label: string;
  /** Marked with `*asterisks*`: the step the reader should not miss. */
  accent: boolean;
}

export interface FlowLayer {
  label: string;
  boxes: FlowBox[];
}

export interface FlowDiagram {
  title: string | null;
  caption: string | null;
  layers: FlowLayer[];
}

export const flowLimits = {
  maxLayers: 6,
  minLayers: 2,
  maxBoxesPerLayer: 5,
  maxLabelChars: 40,
} as const;

export interface FlowParseResult {
  diagram: FlowDiagram | null;
  errors: string[];
}

function stripWrapping(value: string): { label: string; accent: boolean } {
  const label = value.trim();
  if (label.startsWith("*") && label.endsWith("*") && label.length > 2) {
    return { label: label.slice(1, -1).trim(), accent: true };
  }
  return { label, accent: false };
}

export function parseFlowDiagram(source: string): FlowParseResult {
  const errors: string[] = [];
  const layers: FlowLayer[] = [];
  let title: string | null = null;
  let caption: string | null = null;

  const lines = source.split("\n");

  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (line === "") continue;
    const where = `line ${index + 1}`;

    const directive = /^(title|caption|layer)\s*:\s*(.*)$/i.exec(line);
    if (!directive) {
      errors.push(`${where}: expected "title:", "caption:" or "layer:", got "${line.slice(0, 30)}"`);
      continue;
    }

    const [, keyword = "", rest = ""] = directive;

    if (/^title$/i.test(keyword)) {
      title = rest.trim() || null;
      continue;
    }
    if (/^caption$/i.test(keyword)) {
      caption = rest.trim() || null;
      continue;
    }

    const parts = rest.split("|").map((part) => part.trim());
    const label = parts.shift() ?? "";
    if (label === "") {
      errors.push(`${where}: layer has no name`);
      continue;
    }

    const boxes = parts.filter((part) => part !== "").map(stripWrapping);
    const emptyBox = boxes.find((box) => box.label === "");
    if (emptyBox) {
      errors.push(`${where}: layer "${label}" has an empty box label`);
      continue;
    }
    if (boxes.length === 0) {
      errors.push(`${where}: layer "${label}" has no boxes`);
      continue;
    }

    layers.push({ label, boxes });
  }

  if (layers.length < flowLimits.minLayers) {
    errors.push(
      `a diagram needs at least ${flowLimits.minLayers} layers, found ${layers.length}`,
    );
  }
  if (layers.length > flowLimits.maxLayers) {
    errors.push(`a diagram allows at most ${flowLimits.maxLayers} layers, found ${layers.length}`);
  }

  for (const layer of layers) {
    if (layer.boxes.length > flowLimits.maxBoxesPerLayer) {
      errors.push(
        `layer "${layer.label}" has ${layer.boxes.length} boxes, at most ${flowLimits.maxBoxesPerLayer} fit`,
      );
    }
    if (layer.label.length > flowLimits.maxLabelChars) {
      errors.push(`layer name "${layer.label}" is longer than ${flowLimits.maxLabelChars} characters`);
    }
    for (const box of layer.boxes) {
      if (box.label.length > flowLimits.maxLabelChars) {
        errors.push(`box "${box.label}" is longer than ${flowLimits.maxLabelChars} characters`);
      }
    }
  }

  if (errors.length > 0) return { diagram: null, errors };
  return { diagram: { title, caption, layers }, errors };
}

/** Every ```flow block in an article body. */
export function extractFlowBlocks(body: string): string[] {
  const blocks: string[] = [];
  const pattern = /^```flow[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    blocks.push(match[1] ?? "");
  }
  return blocks;
}
