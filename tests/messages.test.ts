import { describe, expect, it } from "vitest";
import { extractToolCalls } from "../src/messages.js";
import type { Message } from "../src/types.js";

function msg(role: "user" | "assistant", content: Message["content"]): Message {
  return { role, content };
}

describe("extractToolCalls", () => {
  it("pairs tool_use with its tool_result by id", () => {
    const messages: Message[] = [
      msg("user", [{ type: "text", text: "hi" }]),
      msg("assistant", [{ type: "tool_use", id: "t1", name: "grep", input: {} }]),
      msg("user", [{ type: "tool_result", tool_use_id: "t1", content: "match" }]),
      msg("assistant", [{ type: "text", text: "done" }]),
    ];

    const entries = extractToolCalls(messages, 6);
    expect(entries).toHaveLength(1);
    expect(entries[0].toolResult?.content).toBe("match");
  });

  it("pins the first message and the last N", () => {
    const messages: Message[] = [
      msg("user", [{ type: "tool_use", id: "t1", name: "a", input: {} }]),
      msg("user", [{ type: "tool_result", tool_use_id: "t1", content: "x" }]),
      msg("user", [{ type: "tool_use", id: "t2", name: "b", input: {} }]),
      msg("user", [{ type: "tool_result", tool_use_id: "t2", content: "y" }]),
      msg("user", [{ type: "tool_use", id: "t3", name: "c", input: {} }]),
      msg("user", [{ type: "tool_result", tool_use_id: "t3", content: "z" }]),
    ];

    // preserveRecentMessages = 1 pins only the very last message (index 5).
    const entries = extractToolCalls(messages, 1);
    const byId = new Map(entries.map((e) => [e.toolUse.id, e]));
    expect(byId.get("t1")?.pinned).toBe(true); // first message is always pinned
    expect(byId.get("t2")?.pinned).toBe(false);
    expect(byId.get("t3")?.pinned).toBe(true); // its result is in the pinned window
  });
});
