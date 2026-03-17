# openclaw-tracing

Agent execution tracing plugin for [OpenClaw](https://github.com/openclaw/openclaw). Gives you full visibility into tool calls, LLM invocations, and sub-agent relationships.

## Install

```bash
openclaw plugins install openclaw-tracing
openclaw gateway restart
```

### Optional: Enable SQL queries & Parquet export (DuckDB)

```bash
cd ~/.openclaw/extensions/openclaw-tracing
npm install @duckdb/node-api
openclaw gateway restart
```

DuckDB is optional — the plugin works fine without it using JSONL storage. DuckDB adds SQL query support and Parquet export.

## Features

### Web UI

Open `http://<your-gateway>/plugins/tracing` in a browser. Four views:

| View | Description |
|------|-------------|
| **Call Tree** | Nested span hierarchy. Consecutive same-tool calls auto-collapse (e.g. `Read ×7`). New spans highlight green on refresh. |
| **Entity Graph** | Force-directed SVG showing agents, subagents, models, and per-entity tool nodes. |
| **Waterfall** | Timeline bar chart of all spans. |
| **Work Index** | Agent productivity scoring — tool density, token efficiency, idle detection. |

Auto-refreshes every 3 seconds with a live indicator.

### CLI commands

```bash
# Classic views (colored, for humans)
openclaw traces                        # call tree + entity + waterfall
openclaw traces --mode call            # call tree only
openclaw traces --list                 # list available dates
openclaw traces --date 2026-03-12      # specific date

# LLM-friendly (plain text, compact)
openclaw traces:summary                # one-shot summary
openclaw traces:recent                 # last 20 steps timeline
openclaw traces:recent --steps 50      # last 50 steps
openclaw traces:workindex              # work index per time window

# SQL queries (requires DuckDB)
openclaw traces:query "SELECT tool_name, COUNT(*) as cnt FROM spans WHERE kind='tool_call' GROUP BY tool_name ORDER BY cnt DESC LIMIT 10"
openclaw traces:query "SELECT model, SUM(tokens_in) FROM spans WHERE kind='llm_call' GROUP BY model" --format json
openclaw traces:query "..." --format csv

# Parquet export (requires DuckDB)
openclaw traces:export                          # export all
openclaw traces:export --date 2026-03-12        # export one day
openclaw traces:export --output /tmp/my.parquet  # custom path
```

### Chat command

Users can type `/traces` directly in Telegram (or any channel):

```
/traces              → today's summary
/traces recent       → recent activity
/traces workindex    → work index
/traces sql SELECT ...  → SQL query (requires DuckDB)
```

### Example outputs

**`traces:summary`**
```
=== Trace Summary ===
Duration: 45.2s
Entities: 4 (1 main, 3 subagents)
LLM calls: 8 | Tokens: 12,450 in, 3,200 out
Tool calls: 23
Top tools: Read(7) Grep(5) Edit(4) Bash(3)
Models: claude-opus-4-6
Work Index: 72/100 (Working) | Density: 2.9 tools/llm | Efficiency: 1.5 tools/1k-tok
```

**`traces:query` (table format)**
```
tool_name | cnt  | avg_ms
----------+------+-------
exec      | 1004 | 990
read      | 303  | 30
web_fetch | 148  | 529
write     | 122  | 33
edit      | 45   | 22
```

## What it traces

| Hook | Span kind | Data captured |
|------|-----------|---------------|
| `session_start/end` | session | Agent ID, session key, duration |
| `llm_input/output` | llm_call | Provider, model, token usage |
| `before/after_tool_call` | tool_call | Tool name, params, duration |
| `subagent_spawning/ended` | subagent | Child agent ID, outcome |

Sub-agent sessions inherit the parent's trace ID via `sessions_spawn` detection, so the entire call chain appears as one connected tree.

## Storage

### JSONL (default)

Traces are stored as JSONL files in `~/.openclaw/traces/YYYY-MM-DD.jsonl`, auto-rotated daily. No dependencies required.

### DuckDB (optional)

When DuckDB is installed, `traces:query` auto-imports all JSONL files into `~/.openclaw/traces/traces.duckdb` on first run. This gives you:

- Full SQL analytics on trace data
- Parquet export for data pipelines
- Fast aggregation queries across days

**Useful queries:**

```sql
-- Daily token consumption
SELECT CAST(epoch_ms(start_ms) AS DATE) as day, SUM(tokens_in) as tok_in
FROM spans WHERE kind='llm_call' GROUP BY day ORDER BY day;

-- Slowest tool calls
SELECT tool_name, duration_ms, session_key
FROM spans WHERE kind='tool_call' ORDER BY duration_ms DESC LIMIT 10;

-- Per-subagent breakdown
SELECT session_key, COUNT(*) FILTER (WHERE kind='tool_call') as tools,
       COUNT(*) FILTER (WHERE kind='llm_call') as llm_calls
FROM spans GROUP BY session_key;

-- Work index: are we spinning or working?
SELECT tool_name IS NOT NULL as has_tool, COUNT(*), AVG(duration_ms)
FROM spans WHERE kind IN ('llm_call','tool_call') GROUP BY 1;
```

## Work Index

The Work Index (0-100) measures agent productivity per time window:

| Score | Status | Meaning |
|-------|--------|---------|
| 61-100 | **Working** | High tool call rate, efficient token usage |
| 26-60 | **Planning** | Moderate activity, reading/exploring |
| 1-25 | **Spinning** | High token usage but few tool calls |
| 0 | **Idle** | No activity |

Formula components:
- **Tool density** = tools per LLM call (weight: 50%)
- **Token efficiency** = tools per 1k tokens (weight: 30%)
- **Delegation bonus** = subagent spawns (weight: 20%)

## Development

```bash
git clone https://github.com/fengsxy/openclaw-tracing.git
cd openclaw-tracing
npm install
npm test
```

## License

MIT
