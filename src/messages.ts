import type { Message, ToolCallEntry, ToolUseBlock, ToolResultBlock } from "./types.js";

/**
 * Pairs every tool_use block with its tool_result by tool_use_id, and marks
 * which calls fall inside the pinned window (first message + last N messages),
 * which are never eligible for deletion or truncation.
 */
export function extractToolCalls(
  messages: Message[],
  preserveRecentMessages: number
): ToolCallEntry[] {
  const lastPinnedIndex = messages.length - 1;
  const firstUnpinnedIndex = 1;
  const lastPinnedStart = Math.max(
    firstUnpinnedIndex,
    messages.length - preserveRecentMessages
  );

  const resultByToolUseId = new Map<string, { index: number; block: ToolResultBlock }>();
  for (let i = 0; i < messages.length; i++) {
    for (const block of messages[i].content) {
      if (block.type === "tool_result") {
        resultByToolUseId.set(block.tool_use_id, { index: i, block });
      }
    }
  }

  const entries: ToolCallEntry[] = [];
  for (let i = 0; i < messages.length; i++) {
    for (const block of messages[i].content) {
      if (block.type !== "tool_use") continue;
      const toolUse = block as ToolUseBlock;
      const result = resultByToolUseId.get(toolUse.id) ?? null;
      const pinned =
        i === 0 ||
        i > lastPinnedIndex ||
        i >= lastPinnedStart ||
        (result !== null && result.index >= lastPinnedStart);

      entries.push({
        messageIndex: i,
        toolUse,
        resultMessageIndex: result?.index ?? null,
        toolResult: result?.block ?? null,
        pinned,
      });
    }
  }

  return entries;
}

export function isPinnedMessageIndex(
  index: number,
  totalMessages: number,
  preserveRecentMessages: number
): boolean {
  const lastPinnedStart = Math.max(1, totalMessages - preserveRecentMessages);
  return index === 0 || index >= lastPinnedStart;
}
