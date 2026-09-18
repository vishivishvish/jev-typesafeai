const TYPESAFE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export interface NoulQuestion {
  /** Caller-assigned id so answers can be matched back to their tool call. */
  id: string;
  question: string;
  context: string;
}

export interface NoulAnswer {
  id: string;
  /** Probability in [0, 1] that the answer is "yes". */
  probability: number;
}

export class TypesafeClientError extends Error {}

/**
 * Sends a batch of yes/no ("noul") questions to Jev and returns a
 * probability per question. Throws TypesafeClientError on any failure
 * (network, non-2xx, malformed response) so callers can fall back safely.
 */
export async function askNoulBatch(
  apiKey: string,
  model: string,
  questions: NoulQuestion[]
): Promise<NoulAnswer[]> {
  if (!apiKey) {
    throw new TypesafeClientError("TYPESAFE_API_KEY is not set");
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
        type: "noul",
        questions: questions.map((q) => ({
          id: q.id,
          question: q.question,
          context: q.context,
        })),
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

  if (!payload || typeof payload !== "object" || !Array.isArray((payload as any).answers)) {
    throw new TypesafeClientError("Jev response missing 'answers' array");
  }

  return (payload as any).answers.map((a: any) => ({
    id: String(a.id),
    probability: Number(a.probability),
  }));
}
