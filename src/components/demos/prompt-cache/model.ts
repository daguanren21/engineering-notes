export type CacheScenario = "append" | "tools" | "system" | "compact";

export interface PromptBlock {
  readonly label: string;
  readonly signature: string;
  readonly tokens: number;
}

function requireTokenCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Token counts must be non-negative safe integers.");
  }
}

export function cacheHitRate(input: number, cacheRead: number, cacheWrite = 0): number | null {
  requireTokenCount(input);
  requireTokenCount(cacheRead);
  requireTokenCount(cacheWrite);
  const total = input + cacheRead + cacheWrite;
  requireTokenCount(total);
  return total === 0 ? null : (cacheRead / total) * 100;
}

export function analyzePrefix(
  previous: readonly PromptBlock[],
  current: readonly PromptBlock[],
  cacheAvailable = true,
) {
  previous.forEach((block) => requireTokenCount(block.tokens));
  current.forEach((block) => requireTokenCount(block.tokens));
  const totalInput = current.reduce((total, block) => total + block.tokens, 0);
  requireTokenCount(totalInput);
  let matchedBlocks = 0;
  let cacheRead = 0;

  if (cacheAvailable) {
    for (let index = 0; index < Math.min(previous.length, current.length); index += 1) {
      const before = previous[index];
      const after = current[index];
      if (before.signature !== after.signature || before.tokens !== after.tokens) break;
      matchedBlocks += 1;
      cacheRead += after.tokens;
    }
  }

  const uncachedInput = totalInput - cacheRead;
  return {
    matchedBlocks,
    totalInput,
    cacheRead,
    uncachedInput,
    hitRate: cacheHitRate(uncachedInput, cacheRead),
  };
}

export function runCacheExample(
  scenario: CacheScenario = "append",
  historyTokens = 45000,
  newTokens = 1000,
  cacheAvailable = true,
) {
  requireTokenCount(historyTokens);
  requireTokenCount(newTokens);
  // Block order follows Anthropic's tools → system → messages hierarchy.
  // This teaching model assumes a reusable breakpoint at every block boundary.
  const previous: PromptBlock[] = [
    { label: "Tools", signature: "tools-v1", tokens: 3000 },
    { label: "System", signature: "system-v1", tokens: 2000 },
    { label: "历史消息", signature: `history-${historyTokens}`, tokens: historyTokens },
  ];
  const current = previous.map((block) => ({ ...block }));
  switch (scenario) {
    case "append":
      break;
    case "tools":
      current[0] = { ...current[0], signature: "tools-v2" };
      break;
    case "system":
      current[1] = { ...current[1], signature: "system-v2" };
      break;
    case "compact":
      current[2] = { label: "压缩摘要", signature: "summary-v1", tokens: Math.min(2000, historyTokens) };
      break;
    default:
      throw new RangeError("Unknown cache scenario.");
  }
  current.push({ label: "新增结果", signature: `new-${newTokens}`, tokens: newTokens });
  return { scenario, cacheAvailable, previous, current, ...analyzePrefix(previous, current, cacheAvailable) };
}
