import { compactWithJev } from "../src/compact.js";
import { DEFAULT_CONFIG, type FastJevConfig, type Message } from "../src/types.js";

/**
 * Minimal shape of the Claude Code hook context this plugin depends on.
 * Kept local (rather than imported from a Claude Code SDK package) so this
 * hook has no build-time dependency on the host; verify field names against
 * the actual hook API before shipping.
 */
interface SessionContext {
  messages: Message[];
  defaultSummary(): Promise<Message[]> | Message[];
  usage(): { context: { percent: number } };
  compact(): Promise<void> | void;
}

interface HookApi {
  session: SessionContext;
  config: Partial<FastJevConfig>;
}

function resolveConfig(userConfig: Partial<FastJevConfig>): FastJevConfig {
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    typesafeApiKey:
      userConfig.typesafeApiKey || process.env.TYPESAFE_API_KEY || "",
  };
}

export async function onSessionCompact($: HookApi): Promise<void> {
  const config = resolveConfig($.config);
  const result = await compactWithJev(
    $.session.messages,
    config,
    () => $.session.defaultSummary()
  );
  $.session.messages.length = 0;
  $.session.messages.push(...result.messages);
}

export async function onTurnComplete($: HookApi): Promise<void> {
  const config = resolveConfig($.config);
  const percent = $.session.usage().context.percent;
  if (percent >= config.compactAtPercent) {
    await $.session.compact();
  }
}

export default {
  "session.compact": onSessionCompact,
  "turn.complete": onTurnComplete,
};
