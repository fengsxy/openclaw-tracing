# Span Schema

Every trace event is stored as a `TraceSpan` object.

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `traceId` | string | Unique trace identifier. Shared across parent and child sessions. |
| `spanId` | string | Unique span identifier. |
| `parentSpanId` | string? | Parent span ID. Links child spans to their parent. |
| `kind` | enum | `session`, `llm_call`, `tool_call`, `subagent` |
| `name` | string | Human-readable span name. |
| `agentId` | string? | Agent identifier. |
| `sessionKey` | string? | Session key (e.g. `agent:main:main`, `agent:main:subagent:UUID`). |
| `startMs` | number | Start timestamp in milliseconds since epoch. |
| `endMs` | number? | End timestamp. Null if span is still open. |
| `durationMs` | number? | Duration in milliseconds. |
| `toolName` | string? | Tool name (for `tool_call` kind). |
| `toolParams` | object? | Tool parameters (for `tool_call` kind). |
| `childSessionKey` | string? | Child session key (for `subagent` kind). |
| `childAgentId` | string? | Child agent ID (for `subagent` kind). |
| `provider` | string? | LLM provider (for `llm_call` kind). |
| `model` | string? | Model name (for `llm_call` kind). |
| `tokensIn` | number? | Input tokens (for `llm_call` kind). |
| `tokensOut` | number? | Output tokens (for `llm_call` kind). |
| `attributes` | object | Additional key-value attributes. |

## Session key format

- Main agent: `agent:main:main`
- Subagent: `agent:main:subagent:<UUID>`
- Cron: `agent:main:cron:<UUID>`

## Trace ID inheritance

When a main agent spawns a subagent via `sessions_spawn`, the child session inherits the parent's `traceId`. This links the entire call chain:

```
traceId: abc123
├── session (agent:main:main)          spanId: s1
│   ├── llm_call                       spanId: l1, parentSpanId: s1
│   ├── tool_call (sessions_spawn)     spanId: t1, parentSpanId: s1
│   └── session (agent:main:subagent:x) spanId: s2, parentSpanId: s1
│       ├── llm_call                   spanId: l2, parentSpanId: s2
│       └── tool_call (Read)           spanId: t2, parentSpanId: s2
```

## Storage formats

| Format | Location | Notes |
|--------|----------|-------|
| JSONL | `~/.openclaw/traces/YYYY-MM-DD.jsonl` | Default, one JSON object per line |
| DuckDB | `~/.openclaw/traces/traces.duckdb` | Optional, auto-created on first query |
| Parquet | User-specified path | Via `traces:export` command |
