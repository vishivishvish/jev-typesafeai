export type Role = "user" | "assistant";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  role: Role;
  content: ContentBlock[];
}

export interface FastJevConfig {
  typesafeApiKey: string;
  /** Context-window percent at which turn.complete proactively triggers compaction. */
  compactAtPercent: number;
  /** Number of most-recent messages that are never touched, in addition to the first message. */
  preserveRecentMessages: number;
  /** Token budget for the state passed to Jev. */
  maxStateTokens: number;
  /** Score threshold (0-1) above which a call/result is kept. */
  keepThreshold: number;
  /** Characters kept when a result is truncated rather than dropped. */
  truncateHeadChars: number;
  /** Minimum (originalTokens - newTokens) / originalTokens required to accept the Jev-compacted result. */
  minReductionRatio: number;
}

export const DEFAULT_CONFIG: FastJevConfig = {
  typesafeApiKey: "",
  compactAtPercent: 60,
  preserveRecentMessages: 6,
  maxStateTokens: 25_000,
  keepThreshold: 0.5,
  truncateHeadChars: 300,
  minReductionRatio: 0.25,
};

export interface ToolCallEntry {
  /** Index of the message containing the tool_use block. */
  messageIndex: number;
  toolUse: ToolUseBlock;
  /** Index of the message containing the matching tool_result block, if any. */
  resultMessageIndex: number | null;
  toolResult: ToolResultBlock | null;
  pinned: boolean;
}

export interface JevDecision {
  toolUseId: string;
  keepCall: number;
  keepResult: number;
}

export type CallDisposition = "keep" | "truncate" | "drop";
