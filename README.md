# jev-typesafeai

A Claude Code plugin that replaces the default lossy compaction summary with
verbatim, selective deletion: TypeSafe's Jev model scores which tool calls
and results in a long session are still relevant, drops or truncates the
irrelevant ones, and leaves everything else byte-for-byte untouched.

Implementation details are in progress on feature branches — see open PRs.
