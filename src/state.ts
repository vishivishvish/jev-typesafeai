import type { ContentBlock, Message, ToolCallEntry } from "./types.js";

/** Rough token estimate: ~4 chars/token, no real tokenizer dependency. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function abridge(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const headLen = Math.ceil(maxChars * 0.6);
  const tailLen = maxChars - headLen;
  return `${text.slice(0, headLen)}\n...[${text.length - maxChars} chars omitted]...\n${text.slice(text.length - tailLen)}`;
}

function truncateInput(input: unknown, maxChars: number): string {
  const raw = typeof input === "string" ? input : JSON.stringify(input);
  return abridge(raw, maxChars);
}

interface RenderOptions {
  toolInputMaxChars: number;
  textMaxChars: number;
  collapseNonPinned: boolean;
}

function renderBlock(
  block: ContentBlock,
  pinned: boolean,
  opts: RenderOptions
): string {
  switch (block.type) {
    case "text":
      return pinned || !opts.collapseNonPinned
        ? block.text
        : abridge(block.text, opts.textMaxChars);
    case "tool_use":
      return `[tool_use ${block.id} ${block.name}] input=${truncateInput(block.input, opts.toolInputMaxChars)}`;
    case "tool_result":
      return `[tool_result for ${block.tool_use_id}] ok, ${block.content.length} chars (omitted)`;
  }
}

function renderMessage(
  message: Message,
  index: number,
  pinned: boolean,
  opts: RenderOptions
): string {
  const body = message.content.map((b) => renderBlock(b, pinned, opts)).join("\n");
  return `--- message[${index}] role=${message.role} pinned=${pinned} ---\n${body}`;
}

/**
 * Builds the state passed to Jev: the full conversation, tool results
 * replaced by a short note, degraded in stages until it fits maxStateTokens.
 */
export function buildState(
  messages: Message[],
  isPinned: (index: number) => boolean,
  maxStateTokens: number
): string {
  const stages: RenderOptions[] = [
    { toolInputMaxChars: 1000, textMaxChars: 4000, collapseNonPinned: false },
    { toolInputMaxChars: 200, textMaxChars: 1500, collapseNonPinned: true },
    { toolInputMaxChars: 60, textMaxChars: 400, collapseNonPinned: true },
  ];

  let rendered = "";
  for (const opts of stages) {
    rendered = messages
      .map((m, i) => renderMessage(m, i, isPinned(i), opts))
      .join("\n\n");
    if (estimateTokens(rendered) <= maxStateTokens) {
      return rendered;
    }
  }

  // Final stage: collapse every non-pinned message body entirely.
  rendered = messages
    .map((m, i) => {
      if (isPinned(i)) {
        return renderMessage(m, i, true, stages[stages.length - 1]);
      }
      const charCount = m.content.reduce((sum, b) => {
        if (b.type === "text") return sum + b.text.length;
        if (b.type === "tool_result") return sum + b.content.length;
        return sum;
      }, 0);
      return `--- message[${i}] role=${m.role} pinned=false ---\n[${charCount} chars omitted]`;
    })
    .join("\n\n");

  return rendered;
}
