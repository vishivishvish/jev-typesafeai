const TYPESAFE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export interface NoulQuestion {
  /** Caller-chosen key; the answer comes back under the same key. */
  id: string;
  instructions: string;
  criteria?: { true?: string; false?: string };
}

export interface NoulAnswer {
  id: string;
  /** Probability in [0, 1] that the answer is "yes". */
  probability: number;
}

export class TypesafeClientError extends Error {}

/**
 * Sends a batch of yes/no ("noul") questions to Jev, sharing a single
 * `state` context across the batch, and returns a probability per
 * question. Throws TypesafeClientError on any failure (network, non-2xx,
 * malformed response) so callers can fall back safely.
 */
export async function askNoulBatch(
  apiKey: string,
  model: string,
  state: string,
  questions: NoulQuestion[]
): Promise<NoulAnswer[]> {
  if (!apiKey) {
    throw new TypesafeClientError("TYPESAFE_API_KEY is not set");
  }

  const questionsMap: Record<string, unknown> = {};
  for (const q of questions) {
    questionsMap[q.id] = {
      type: "noul",
      instructions: q.instructions,
      ...(q.criteria ? { criteria: q.criteria } : {}),
    };
  }

  let response: Response;
  try {
    response = await fetch(TYPESAFE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        state,
        questions: questionsMap,
      }),
    });
  } catch (err) {
    throw new TypesafeClientError(`Jev request failed: ${(err as Error).message}`);
  }

  if (!response.ok) {
    throw new TypesafeClientError(`Jev request returned ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new TypesafeClientError("Jev response was not valid JSON");
  }

  if (!payload || typeof payload !== "object" || typeof (payload as any).answers !== "object") {
    throw new TypesafeClientError("Jev response missing 'answers' object");
  }

  return Object.entries((payload as any).answers).map(([id, answer]) => ({
    id,
    probability: Number((answer as any).noul),
  }));
}
