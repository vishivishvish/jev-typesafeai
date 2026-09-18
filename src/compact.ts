import type {
  CallDisposition,
  ContentBlock,
  FastJevConfig,
  JevDecision,
  Message,
  ToolCallEntry,
} from "./types.js";
import { extractToolCalls, isPinnedMessageIndex } from "./messages.js";
import { buildState, estimateTokens } from "./state.js";
import { getJevDecisions } from "./request.js";

export interface CompactionResult {
  messages: Message[];
  usedFallback: boolean;
  reductionRatio: number;
}

function decideDisposition(
  decision: JevDecision | undefined,
  threshold: number
): CallDisposition {
  if (!decision) return "keep";
  if (decision.keepResult >= threshold) return "keep";
  if (decision.keepCall >= threshold) return "truncate";
  return "drop";
}

function applyDisposition(
  entry: ToolCallEntry,
  disposition: CallDisposition,
  truncateHeadChars: number
): { toolResult: ContentBlock } | null {
  if (!entry.toolResult) return null;

  if (disposition === "keep") {
    return { toolResult: entry.toolResult };
  }
  if (disposition === "truncate") {
    const head = entry.toolResult.content.slice(0, truncateHeadChars);
    return {
      toolResult: {
        ...entry.toolResult,
        content: `${head}\n...[truncated by fast-jev, ${entry.toolResult.content.length - head.length} chars dropped; re-run the tool for the full output]`,
      },
    };
  }
  return null; // drop
}

/**
 * Rebuilds the message list applying keep/truncate/drop decisions.
 * Messages left entirely untouched keep their original object identity.
 */
function rebuildMessages(
  messages: Message[],
  decisions: Map<string, JevDecision>,
  entries: ToolCallEntry[],
  config: FastJevConfig
): Message[] {
  const dispositionByToolUseId = new Map<string, CallDisposition>();
  const dropCallEntirely = new Set<string>();

  for (const entry of entries) {
    if (entry.pinned) {
      dispositionByToolUseId.set(entry.toolUse.id, "keep");
      continue;
    }
    const disposition = decideDisposition(decisions.get(entry.toolUse.id), config.keepThreshold);
    dispositionByToolUseId.set(entry.toolUse.id, disposition);
    if (disposition === "drop") dropCallEntirely.add(entry.toolUse.id);
  }

  const entryByToolUseId = new Map(entries.map((e) => [e.toolUse.id, e]));

  return messages
    .map((message, index): Message | null => {
      const pinned = isPinnedMessageIndex(index, messages.length, config.preserveRecentMessages);
      if (pinned) return message;

      let changed = false;
      const newContent: ContentBlock[] = [];

      for (const block of message.content) {
        if (block.type === "tool_use") {
          if (dropCallEntirely.has(block.id)) {
            changed = true;
            continue; // drop the call block itself
          }
          newContent.push(block);
        } else if (block.type === "tool_result") {
          const entry = entryByToolUseId.get(block.tool_use_id);
          if (!entry) {
            newContent.push(block);
            continue;
          }
          const disposition = dispositionByToolUseId.get(block.tool_use_id) ?? "keep";
          if (disposition === "drop") {
            changed = true;
            continue; // drop the result block itself
          }
          const applied = applyDisposition(entry, disposition, config.truncateHeadChars);
          if (applied) {
            if (disposition !== "keep") changed = true;
            newContent.push(applied.toolResult);
          }
        } else {
          newContent.push(block);
        }
      }

      if (newContent.length === 0) return null; // message became empty, drop it
      if (!changed) return message; // untouched, keep same object identity
      return { ...message, content: newContent };
    })
    .filter((m): m is Message => m !== null);
}

/**
 * Runs the Jev-driven compaction pass. Falls back to `fallback()` (Claude
 * Code's default summary) if Jev errors, the API key is missing, or the
 * achieved reduction ratio is below config.minReductionRatio.
 */
export async function compactWithJev(
  messages: Message[],
  config: FastJevConfig,
  fallback: () => Promise<Message[]> | Message[]
): Promise<CompactionResult> {
  const entries = extractToolCalls(messages, config.preserveRecentMessages);
  const isPinned = (index: number) =>
    isPinnedMessageIndex(index, messages.length, config.preserveRecentMessages);

  const originalTokens = estimateTokens(JSON.stringify(messages));

  let decisions: JevDecision[];
  try {
    const state = buildState(messages, isPinned, config.maxStateTokens);
    decisions = await getJevDecisions(config.typesafeApiKey, entries, state);
  } catch {
    const fallbackMessages = await fallback();
    return { messages: fallbackMessages, usedFallback: true, reductionRatio: 0 };
  }

  const decisionMap = new Map(decisions.map((d) => [d.toolUseId, d]));
  const rebuilt = rebuildMessages(messages, decisionMap, entries, config);

  const newTokens = estimateTokens(JSON.stringify(rebuilt));
  const reductionRatio = originalTokens > 0 ? (originalTokens - newTokens) / originalTokens : 0;

  if (reductionRatio < config.minReductionRatio) {
    const fallbackMessages = await fallback();
    return { messages: fallbackMessages, usedFallback: true, reductionRatio };
  }

  return { messages: rebuilt, usedFallback: false, reductionRatio };
}
