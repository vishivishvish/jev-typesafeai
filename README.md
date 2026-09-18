# jev-typesafeai

A Claude Code plugin that replaces the default lossy compaction summary with
verbatim, selective deletion. Instead of rewriting the conversation into a
summary, it uses TypeSafe's Jev model to score which tool calls and results
in a long session are still relevant, drops or truncates the irrelevant
ones, and keeps everything else — exact file paths, error messages,
constraints — byte-for-byte.

## How it works

1. Every `tool_use` block is paired with its `tool_result` by
   `tool_use_id`. The first message and the most recent
   `preserveRecentMessages` (default 6) messages are pinned and never
   touched.
2. A compact "state" of the conversation is built for Jev: tool results are
   replaced with a short note (`ok, 4213 chars (omitted)`); tool inputs and
   all message text stay verbatim. The state is degraded in stages
   (truncating tool inputs, then abridging long text to head+tail, then
   collapsing whole non-pinned messages) until it fits `maxStateTokens`
   (default 25k, estimated, not tokenized).
3. For every non-pinned call, two yes/no questions go to Jev: should the
   *call* stay (is knowing it happened, and its input, still useful), and
   should the *result* stay verbatim (vs. a note that re-running the tool
   would be cheaper than remembering the old output). Questions are batched
   to stay under Jev's request size limit and batches run concurrently.
4. Decisions are applied against `keepThreshold` (default 0.5):
   - `keepResult` ≥ threshold → keep the call and result verbatim.
   - else `keepCall` ≥ threshold → keep the call, truncate the result to
     `truncateHeadChars` (default 300) plus a note.
   - else → drop the call and result entirely.
5. The message list is rebuilt; messages that weren't touched keep their
   original object identity.
6. Safety valve: if the Jev request errors, the API key is missing, or the
   achieved token-reduction ratio is below `minReductionRatio` (default
   0.25), the plugin falls back to Claude Code's normal built-in summary
   rather than returning something worse.

The `turn.complete` hook checks the session's context-window usage and
proactively triggers `session.compact()` once it crosses `compactAtPercent`
(default 60), instead of waiting for the hard limit.

## Setup

```bash
npm install
cp .env.example .env   # fill in TYPESAFE_API_KEY, or set it as a plugin userConfig value
```

`TYPESAFE_API_KEY` can be provided either as the `TYPESAFE_API_KEY`
environment variable or via the plugin's `typesafeApiKey` userConfig field
(marked `sensitive`); the env var is used as a fallback if the config value
is unset.

## Layout

```
.claude-plugin/plugin.json   plugin manifest + userConfig schema
hooks/hooks.json             hook wiring (session.compact, turn.complete)
hooks/fast-jev.ts            hook entry points
src/                         core library (usable standalone, no host dependency)
tests/                       vitest unit tests
```

## Development

```bash
npm run typecheck
npm test
```
