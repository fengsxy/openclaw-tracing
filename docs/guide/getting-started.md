# Getting Started

## Install

```bash
openclaw plugins install openclaw-tracing
openclaw gateway restart
```

That's it. Traces start collecting immediately.

## Verify

Check that the plugin loaded:

```bash
openclaw traces:summary
```

You should see output like:

```
=== Trace Summary ===
Duration: 45.2s
Entities: 4 (1 main, 3 subagents)
LLM calls: 8 | Tokens: 12,450 in, 3,200 out
Tool calls: 23
Top tools: Read(7) Grep(5) Edit(4) Bash(3)
Models: claude-opus-4-6
Work Index: 72/100 (Working)
```

## What gets traced

| Hook | Span kind | Data captured |
|------|-----------|---------------|
| `session_start/end` | session | Agent ID, session key, duration |
| `llm_input/output` | llm_call | Provider, model, token usage |
| `before/after_tool_call` | tool_call | Tool name, params, duration |
| `subagent_spawning/ended` | subagent | Child agent ID, outcome |

Sub-agent sessions automatically inherit the parent's trace ID via `sessions_spawn` detection, so the entire call chain appears as one connected tree.

## Storage

Traces are stored as JSONL files in `~/.openclaw/traces/YYYY-MM-DD.jsonl`, auto-rotated daily. No external dependencies required.

## Optional: DuckDB

For SQL queries and Parquet export, install DuckDB:

```bash
cd ~/.openclaw/extensions/openclaw-tracing
npm install @duckdb/node-api
openclaw gateway restart
```

See [DuckDB Integration](/integrations/duckdb) for details.

## Next steps

- [Web UI](/guide/web-ui) — Interactive browser-based viewer
- [CLI Commands](/guide/cli) — Terminal access to traces
- [Work Index](/guide/work-index) — Understand agent productivity
