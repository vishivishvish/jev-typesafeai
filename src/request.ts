import { askNoulBatch, type NoulAnswer, type NoulQuestion } from "./client.js";
import type { JevDecision, ToolCallEntry } from "./types.js";
import { estimateTokens } from "./state.js";

const JEV_MODEL = "jev-latest";
/** Conservative margin under Jev's ~32k token request limit. */
const MAX_REQUEST_TOKENS = 28_000;

function questionsFor(entry: ToolCallEntry, state: string): NoulQuestion[] {
  const context = `${state}\n\nFocus call: [tool_use ${entry.toolUse.id} ${entry.toolUse.name}]`;
  return [
    {
      id: `${entry.toolUse.id}:call`,
      question: `Is it still useful to know that this tool call happened, and what its input was?`,
      context,
    },
    {
      id: `${entry.toolUse.id}:result`,
      question: `Is the exact original output of this tool call still needed verbatim, rather than a note that it could be re-run cheaply if needed?`,
      context,
    },
  ];
}

function packBatches(allQuestions: NoulQuestion[]): NoulQuestion[][] {
  const batches: NoulQuestion[][] = [];
  let current: NoulQuestion[] = [];
  let currentTokens = 0;

  for (const q of allQuestions) {
    const qTokens = estimateTokens(q.question) + estimateTokens(q.context);
    if (current.length > 0 && currentTokens + qTokens > MAX_REQUEST_TOKENS) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(q);
    currentTokens += qTokens;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Asks Jev whether each non-pinned tool call/result should survive
 * compaction. Returns one decision per entry, run concurrently across
 * batches. Throws if the underlying Jev request fails — callers should
 * catch this and fall back to the default summary.
 */
export async function getJevDecisions(
  apiKey: string,
  entries: ToolCallEntry[],
  state: string
): Promise<JevDecision[]> {
  const eligible = entries.filter((e) => !e.pinned);
  if (eligible.length === 0) return [];

  const allQuestions = eligible.flatMap((e) => questionsFor(e, state));
  const batches = packBatches(allQuestions);

  const batchResults = await Promise.all(
    batches.map((batch) => askNoulBatch(apiKey, JEV_MODEL, batch))
  );
  const answers: NoulAnswer[] = batchResults.flat();
  const answerById = new Map(answers.map((a) => [a.id, a.probability]));

  return eligible.map((e) => ({
    toolUseId: e.toolUse.id,
    keepCall: answerById.get(`${e.toolUse.id}:call`) ?? 1,
    keepResult: answerById.get(`${e.toolUse.id}:result`) ?? 1,
  }));
}
