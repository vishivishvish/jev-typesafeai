import { describe, expect, it, vi, afterEach } from "vitest";
import { askNoulBatch, TypesafeClientError } from "../src/client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("askNoulBatch", () => {
  it("sends questions as a dict keyed by id and maps noul answers back", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.questions).toEqual({
        q1: { type: "noul", instructions: "is it a banana?" },
      });
      return new Response(
        JSON.stringify({ answers: { q1: { type: "noul", noul: 0.92 } } }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const answers = await askNoulBatch("key", "jev-latest", "a yellow fruit", [
      { id: "q1", instructions: "is it a banana?" },
    ]);

    expect(answers).toEqual([{ id: "q1", probability: 0.92 }]);
  });

  it("throws TypesafeClientError when the API key is missing", async () => {
    await expect(askNoulBatch("", "jev-latest", "", [])).rejects.toThrow(TypesafeClientError);
  });

  it("throws TypesafeClientError on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("fail", { status: 500 })));
    await expect(
      askNoulBatch("key", "jev-latest", "state", [{ id: "q1", instructions: "x?" }])
    ).rejects.toThrow(TypesafeClientError);
  });
});
