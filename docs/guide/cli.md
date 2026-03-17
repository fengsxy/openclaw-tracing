# CLI Commands

## Human-friendly (colored output)

```bash
# All views for today
openclaw traces

# Specific view
openclaw traces --mode call
openclaw traces --mode entity
openclaw traces --mode waterfall

# Specific date
openclaw traces --date 2026-03-12

# List available dates
openclaw traces --list
```

## LLM-friendly (plain text)

Designed for agent self-inspection — compact, no ANSI colors, easy to parse.

### `traces:summary`

One-shot overview of today's activity:

```bash
openclaw traces:summary
openclaw traces:summary --date 2026-03-12
```

```
=== Trace Summary ===
Duration: 45.2s
Entities: 4 (1 main, 3 subagents)
LLM calls: 8 | Tokens: 12,450 in, 3,200 out
Tool calls: 23
Top tools: Read(7) Grep(5) Edit(4) Bash(3)
Models: claude-opus-4-6
Subagents: search, writer, reviewer
Work Index: 72/100 (Working) | Density: 2.9 tools/llm | Efficiency: 1.5 tools/1k-tok
```

### `traces:recent`

Recent steps as a compact timeline:

```bash
openclaw traces:recent
openclaw traces:recent --steps 50
```

```
=== Recent 15 steps ===
[0s] llm claude-opus-4-6 → 1.2s, 800+200tok
[1.2s] tool Read file=/src/main.ts → 0.1s
[1.3s] tool Grep pattern="TODO" → 0.3s
[1.6s] llm claude-opus-4-6 → 2.1s, 1200+350tok
[3.7s] tool Edit file=/src/main.ts → 0.1s
```

### `traces:workindex`

Work Index per time window:

```bash
openclaw traces:workindex
```

```
=== Work Index ===
Phase         | Score | Status   | LLM | Tools | Tokens
--------------|-------|----------|-----|-------|-------
0ms-776.7s    |    51 | Planning |   6 |    73 | 693,856
776.7s-1553.4s|    50 | Planning |   5 |    26 | 1,345,930
1553.4s-2330.1s|    15 | Spinning |   9 |    13 | 1,649,196
```

### `traces:query` (requires DuckDB)

Run arbitrary SQL:

```bash
# Table format (default)
openclaw traces:query "SELECT tool_name, COUNT(*) FROM spans WHERE kind='tool_call' GROUP BY tool_name ORDER BY 2 DESC LIMIT 5"

# JSON format
openclaw traces:query "SELECT model, SUM(tokens_in) FROM spans WHERE kind='llm_call' GROUP BY model" --format json

# CSV format
openclaw traces:query "..." --format csv
```

### `traces:export` (requires DuckDB)

Export to Parquet:

```bash
openclaw traces:export
openclaw traces:export --date 2026-03-12
openclaw traces:export --output /tmp/my-traces.parquet
```
