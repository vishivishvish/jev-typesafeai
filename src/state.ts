/** Rough token estimate: ~4 chars/token, no real tokenizer dependency. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Truncates text to maxChars, keeping a head and tail slice with a note of what was cut. */
export function abridge(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const headLen = Math.ceil(maxChars * 0.6);
  const tailLen = maxChars - headLen;
  return `${text.slice(0, headLen)}\n...[${text.length - maxChars} chars omitted]...\n${text.slice(text.length - tailLen)}`;
}
