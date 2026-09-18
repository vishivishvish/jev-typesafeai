import { describe, expect, it, vi, afterEach } from "vitest";
import { compactWithJev } from "../src/compact.js";
import { DEFAULT_CONFIG, type Message } from "../src/types.js";

function msg(role: "user" | "assistant", content: Message["content"]): Message {
  return { role, content };
}

function bigResult(id: string, chars: number) {
  return msg("user", [
    { type: "tool_result", tool_use_id: id, content: "x".repeat(chars) },
  ]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compactWithJev", () => {
  it("drops low-scoring calls and keeps high-scoring ones verbatim", async () => {
    const messages: Message[] = [
      msg("user", [{ type: "text", text: "start" }]),
      msg("assistant", [{ type: "tool_use", id: "drop-me", name: "read", input: "a.txt" }]),
      bigResult("drop-me", 5000),
      msg("assistant", [{ type: "tool_use", id: "keep-me", name: "read", input: "b.txt" }]),
      bigResult("keep-me", 5000),
      msg("assistant", [{ type: "text", text: "middle" }]),
      msg("assistant", [{ type: "text", text: "recent 1" }]),
      msg("assistant", [{ type: "text", text: "recent 2" }]),
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        const answers = body.questions.map((q: { id: string }) => ({
          id: q.id,
          probability: q.id.startsWith("keep-me") ? 1 : 0,
        }));
        return new Response(JSON.stringify({ answers }), { status: 200 });
      })
    );

    const result = await compactWithJev(
      messages,
      { ...DEFAULT_CONFIG, typesafeApiKey: "test-key", preserveRecentMessages: 2, minReductionRatio: 0.01 },
      () => messages
    );

    expect(result.usedFallback).toBe(false);
    const resultBlocks = result.messages.flatMap((m) => m.content);
    expect(resultBlocks.some((b) => b.type === "tool_result" && b.tool_use_id === "drop-me")).toBe(false);
    expect(resultBlocks.some((b) => b.type === "tool_result" && b.tool_use_id === "keep-me")).toBe(true);
  });

  it("falls back to the default summary when Jev errors", async () => {
    const messages: Message[] = [
      msg("user", [{ type: "text", text: "start" }]),
      msg("assistant", [{ type: "tool_use", id: "t1", name: "read", input: "a.txt" }]),
      bigResult("t1", 5000),
      msg("assistant", [{ type: "text", text: "end" }]),
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("fail", { status: 500 }))
    );

    const fallback = vi.fn(() => [msg("user", [{ type: "text", text: "summary" }])]);
    const result = await compactWithJev(
      messages,
      { ...DEFAULT_CONFIG, typesafeApiKey: "test-key" },
      fallback
    );

    expect(result.usedFallback).toBe(true);
    expect(fallback).toHaveBeenCalled();
  });
});
